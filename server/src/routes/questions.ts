import { Router, Request, Response } from 'express';
import { h } from "../hwrap";
import { query, withTransaction } from '../db';
import { authed, canTeachStudent, requireRole } from '../auth';

export const questionsRouter = Router();
questionsRouter.use(h(authed));

/** 提问列表：家长看自己孩子的，老师看自己班级学生的，主管看全部 */
questionsRouter.get('/', h(async (req: Request, res: Response) => {
  const user = req.user!;
  let where = '';
  const params: any[] = [];
  if (user.role === 'parent') { where = 'WHERE q.parent_id = $1'; params.push(user.id); }
  else if (user.role === 'teacher') {
    where = 'WHERE (c.teacher_id = $1 OR s.teacher_id = $1)'; params.push(user.id);
  }
  const { rows } = await query(
    `SELECT q.id, q.type, q.content, q.status, q.created_at,
            s.id AS student_id, s.name AS student_name, c.name AS class_name,
            p.name AS parent_name,
            r.id AS reply_id, r.content AS reply_content, r.evidence_artwork_ids, r.evidence_tags,
            r.created_at AS reply_at, tu.name AS reply_teacher
     FROM questions q
     JOIN students s ON s.id = q.student_id
     LEFT JOIN classes c ON c.id = s.class_id
     LEFT JOIN users p ON p.id = q.parent_id
     LEFT JOIN replies r ON r.question_id = q.id
     LEFT JOIN users tu ON tu.id = r.teacher_id
     ${where}
     ORDER BY (q.status = 'pending') DESC, q.created_at DESC`, params);

  // 汇总证据作品信息
  const artIds = new Set<number>();
  rows.forEach((r: any) => (r.evidence_artwork_ids || []).forEach((i: number) => artIds.add(i)));
  let artMap: Record<number, any> = {};
  if (artIds.size) {
    const arts = await query(
      `SELECT a.id, a.title, a.image_path, l.lesson_date::text AS lesson_date, l.theme
       FROM artworks a JOIN lessons l ON l.id=a.lesson_id WHERE a.id = ANY($1)`,
      [Array.from(artIds)]);
    arts.rows.forEach((a: any) => { artMap[a.id] = a; });
  }
  res.json(rows.map((r: any) => ({
    ...r,
    evidence_artworks: (r.evidence_artwork_ids || []).map((i: number) => artMap[i]).filter(Boolean),
  })));
}));

/** 家长提问 */
questionsRouter.post('/', requireRole('parent'), h(async (req: Request, res: Response) => {
  const { student_id, type, content } = req.body || {};
  if (!student_id || !type || !content?.trim()) {
    res.status(400).json({ error: '请选择孩子、问题类型并填写内容' });
    return;
  }
  const own = await query('SELECT 1 FROM students WHERE id=$1 AND parent_id=$2', [student_id, req.user!.id]);
  if (!own.rows.length) { res.status(403).json({ error: '只能为自己的孩子提问' }); return; }
  const { rows } = await query(
    'INSERT INTO questions (student_id, parent_id, type, content) VALUES ($1,$2,$3,$4) RETURNING id',
    [student_id, req.user!.id, type, content.trim()]);
  res.status(201).json({ id: rows[0].id });
}));

/** 老师回复：可附历史作品与能力标签作为证据 */
questionsRouter.post('/:id/reply', requireRole('teacher'), h(async (req: Request, res: Response) => {
  const qid = parseInt(req.params.id, 10);
  const q = (await query('SELECT id, student_id, status FROM questions WHERE id=$1', [qid])).rows[0];
  if (!q) { res.status(404).json({ error: '问题不存在' }); return; }
  if (!(await canTeachStudent(req.user!, q.student_id))) {
    res.status(403).json({ error: '只能回复自己班级学生的问题' });
    return;
  }
  if (q.status === 'answered') { res.status(409).json({ error: '该问题已回复' }); return; }
  const { content, evidence_artwork_ids, evidence_tags } = req.body || {};
  if (!content?.trim()) { res.status(400).json({ error: '回复内容必填' }); return; }
  const artIds: number[] = Array.isArray(evidence_artwork_ids) ? evidence_artwork_ids.filter((n) => Number.isInteger(n)) : [];
  // 证据作品必须属于该学生
  if (artIds.length) {
    const check = await query(
      'SELECT count(*)::int AS c FROM artworks WHERE id = ANY($1) AND student_id=$2',
      [artIds, q.student_id]);
    if (check.rows[0].c !== artIds.length) {
      res.status(400).json({ error: '证据作品必须属于该学生' });
      return;
    }
  }
  const tags: string[] = Array.isArray(evidence_tags) ? evidence_tags.slice(0, 8).map(String) : [];
  await withTransaction(async (client) => {
    await client.query(
      'INSERT INTO replies (question_id, teacher_id, content, evidence_artwork_ids, evidence_tags) VALUES ($1,$2,$3,$4,$5)',
      [qid, req.user!.id, content.trim(), artIds, tags]);
    await client.query(`UPDATE questions SET status='answered' WHERE id=$1`, [qid]);
  });
  res.status(201).json({ ok: true });
}));
