import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { h } from "../hwrap";
import { query, withTransaction } from '../db';
import { authed, requireRole } from '../auth';
import { UPLOAD_DIR } from '../seed';
import { DIMENSIONS } from '../domain';

export const classesRouter = Router();
classesRouter.use(h(authed));

/** 班级列表：老师看自己带的班，主管看全部 */
classesRouter.get('/', h(async (req: Request, res: Response) => {
  const user = req.user!;
  let where = '';
  const params: any[] = [];
  if (user.role === 'teacher') { where = 'WHERE c.teacher_id = $1'; params.push(user.id); }
  const { rows } = await query(
    `SELECT c.*, u.name AS teacher_name,
            (SELECT count(*)::int FROM students s WHERE s.class_id = c.id) AS student_count,
            (SELECT count(*)::int FROM lessons l WHERE l.class_id = c.id) AS lesson_count
     FROM classes c LEFT JOIN users u ON u.id = c.teacher_id
     ${where} ORDER BY c.id`, params);
  res.json(rows);
}));

/** 班级详情：学生 + 课程（含每节课已点评数） */
classesRouter.get('/:id', h(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const cls = (await query(
    `SELECT c.*, u.name AS teacher_name FROM classes c LEFT JOIN users u ON u.id=c.teacher_id WHERE c.id=$1`,
    [id])).rows[0];
  if (!cls) { res.status(404).json({ error: '班级不存在' }); return; }
  if (req.user!.role === 'teacher' && cls.teacher_id !== req.user!.id) {
    res.status(403).json({ error: '无权查看该班级' });
    return;
  }
  const students = (await query(
    `SELECT s.id, s.name, s.gender, s.age_group, s.child_willingness, s.hours_purchased,
            (SELECT count(*)::int FROM attendance a WHERE a.student_id=s.id AND a.status IN ('present','makeup')) AS hours_consumed,
            (SELECT count(*)::int FROM reviews r WHERE r.student_id=s.id) AS review_count
     FROM students s WHERE s.class_id=$1 ORDER BY s.name`, [id])).rows;
  const lessons = (await query(
    `SELECT l.*, (SELECT count(*)::int FROM reviews r WHERE r.lesson_id=l.id) AS review_count
     FROM lessons l WHERE l.class_id=$1 ORDER BY l.lesson_date DESC`, [id])).rows;
  res.json({ ...cls, students, lessons });
}));

/** 课程详情：本班学生逐个的出勤/作品/点评状态 */
classesRouter.get('/lessons/:lessonId', h(async (req: Request, res: Response) => {
  const lessonId = parseInt(req.params.lessonId, 10);
  const lesson = (await query(
    `SELECT l.*, c.name AS class_name, c.teacher_id AS class_teacher_id, u.name AS teacher_name
     FROM lessons l JOIN classes c ON c.id=l.class_id LEFT JOIN users u ON u.id=l.teacher_id
     WHERE l.id=$1`, [lessonId])).rows[0];
  if (!lesson) { res.status(404).json({ error: '课程不存在' }); return; }
  if (req.user!.role === 'teacher' && lesson.class_teacher_id !== req.user!.id) {
    res.status(403).json({ error: '无权查看该课程' });
    return;
  }
  const students = (await query(
    `SELECT s.id, s.name,
            (SELECT status FROM attendance a WHERE a.student_id=s.id AND a.lesson_id=$1) AS attendance,
            (SELECT r.id FROM reviews r WHERE r.student_id=s.id AND r.lesson_id=$1) AS review_id,
            (SELECT a2.id FROM artworks a2 WHERE a2.student_id=s.id AND a2.lesson_id=$1) AS artwork_id
     FROM students s WHERE s.class_id=$2 ORDER BY s.name`, [lessonId, lesson.class_id])).rows;
  res.json({ ...lesson, students });
}));

/** 老师课后上传作品照片 + 六维点评（一次提交） */
classesRouter.post('/lessons/:lessonId/reviews', requireRole('teacher'), h(async (req: Request, res: Response) => {
  const lessonId = parseInt(req.params.lessonId, 10);
  const lesson = (await query(
    `SELECT l.*, c.teacher_id AS class_teacher_id FROM lessons l JOIN classes c ON c.id=l.class_id WHERE l.id=$1`,
    [lessonId])).rows[0];
  if (!lesson) { res.status(404).json({ error: '课程不存在' }); return; }
  if (lesson.class_teacher_id !== req.user!.id) {
    res.status(403).json({ error: '只能点评自己班级的课程' });
    return;
  }
  const { student_id, title, image_data, scores, need_home_practice,
    home_practice_note, suggestion, next_prep, class_state,
    serves_competition, competition_req_note } = req.body || {};
  if (!student_id || !scores || !suggestion) {
    res.status(400).json({ error: '学生、六维评分与点评建议为必填项' });
    return;
  }
  // 标记"服务比赛目标"时必须说明本节课解决了哪个比赛要求，且学生须有在辅导中的比赛
  if (serves_competition) {
    if (!competition_req_note || !String(competition_req_note).trim()) {
      res.status(400).json({ error: '标记服务比赛目标时，必须说明本节课解决了作品的哪个比赛要求' });
      return;
    }
    const active = await query(
      `SELECT 1 FROM competitions WHERE student_id=$1 AND status='active'`, [student_id]);
    if (!active.rows.length) {
      res.status(400).json({ error: '该学生没有在辅导中的比赛，不能标记服务比赛目标' });
      return;
    }
  }
  for (const d of DIMENSIONS) {
    const v = (scores as any)[d.key];
    if (typeof v !== 'number' || v < 1 || v > 5) {
      res.status(400).json({ error: `维度「${d.label}」评分须为1-5分` });
      return;
    }
  }
  const dup = await query('SELECT 1 FROM reviews WHERE student_id=$1 AND lesson_id=$2', [student_id, lessonId]);
  if (dup.rows.length) { res.status(409).json({ error: '该学生本节课已有点评，请勿重复提交' }); return; }

  // 保存作品图片（dataURL 或缺省生成占位图）
  let imagePath: string;
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  if (typeof image_data === 'string' && image_data.startsWith('data:image/')) {
    const m = image_data.match(/^data:image\/(png|jpeg|jpg|gif|svg\+xml);base64,(.+)$/);
    if (!m) { res.status(400).json({ error: '图片格式不支持' }); return; }
    const ext = m[1] === 'svg+xml' ? 'svg' : m[1] === 'jpeg' ? 'jpg' : m[1];
    const file = `up-${student_id}-${lessonId}-${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, file), Buffer.from(m[2], 'base64'));
    imagePath = `/uploads/${file}`;
  } else {
    // 未上传照片时生成占位作品图，保证流程可演示
    const file = `up-${student_id}-${lessonId}-placeholder.svg`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="450"><rect width="600" height="450" fill="#f4f1de"/><text x="300" y="230" font-size="28" text-anchor="middle" fill="#8a8378">作品照片待补充</text></svg>`;
    fs.writeFileSync(path.join(UPLOAD_DIR, file), svg);
    imagePath = `/uploads/${file}`;
  }

  const result = await withTransaction(async (client) => {
    const art = await client.query(
      'INSERT INTO artworks (student_id, lesson_id, teacher_id, title, image_path) VALUES ($1,$2,$3,$4,$5) RETURNING id',
      [student_id, lessonId, req.user!.id, title || lesson.theme, imagePath]);
    const rev = await client.query(
      `INSERT INTO reviews (artwork_id, student_id, lesson_id, teacher_id,
         composition, line_score, color, observation, creativity, focus,
         need_home_practice, home_practice_note, suggestion, next_prep, class_state,
         serves_competition, competition_req_note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
      [art.rows[0].id, student_id, lessonId, req.user!.id,
       scores.composition, scores.line_score, scores.color, scores.observation, scores.creativity, scores.focus,
       !!need_home_practice, home_practice_note || '', suggestion, next_prep || '', class_state || '',
       !!serves_competition, String(competition_req_note || '').trim()]);
    await client.query(
      `INSERT INTO attendance (student_id, lesson_id, status) VALUES ($1,$2,'present')
       ON CONFLICT (student_id, lesson_id) DO NOTHING`,
      [student_id, lessonId]);
    if (need_home_practice) {
      await client.query(
        `INSERT INTO homework (student_id, lesson_id, assigned, submitted) VALUES ($1,$2,true,false)
         ON CONFLICT (student_id, lesson_id) DO NOTHING`,
        [student_id, lessonId]);
    }
    return rev.rows[0].id as number;
  });
  res.status(201).json({ id: result });
}));
