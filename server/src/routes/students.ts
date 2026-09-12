import { Router, Request, Response } from 'express';
import { h } from "../hwrap";
import { query } from '../db';
import { authed, canTeachStudent, canViewStudent, requireRole } from '../auth';
import { buildStageReport } from '../report';
import { ABILITY_TAGS, DIMENSIONS } from '../domain';

export const studentsRouter = Router();
studentsRouter.use(h(authed));

async function guardView(req: Request, res: Response): Promise<number | null> {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id) || !(await canViewStudent(req.user!, id))) {
    res.status(403).json({ error: '无权查看该学生' });
    return null;
  }
  return id;
}

/** 学生列表（按角色过滤），附课时与最近均分 */
studentsRouter.get('/', h(async (req: Request, res: Response) => {
  const user = req.user!;
  let where = '';
  const params: any[] = [];
  if (user.role === 'parent') { where = 'WHERE s.parent_id = $1'; params.push(user.id); }
  else if (user.role === 'teacher') {
    where = 'WHERE c.teacher_id = $1 OR s.teacher_id = $1'; params.push(user.id);
  }
  const { rows } = await query(
    `SELECT s.id, s.name, s.gender, s.age_group, s.child_willingness, s.hours_purchased,
            c.name AS class_name, c.stage AS class_stage, u.name AS teacher_name,
            (SELECT count(*)::int FROM attendance a WHERE a.student_id=s.id AND a.status IN ('present','makeup')) AS hours_consumed,
            (SELECT round(avg((r.composition+r.line_score+r.color+r.observation+r.creativity+r.focus)/6.0), 1)
               FROM reviews r WHERE r.student_id=s.id) AS avg_score,
            (SELECT count(*)::int FROM reviews r WHERE r.student_id=s.id) AS review_count
     FROM students s
     LEFT JOIN classes c ON c.id = s.class_id
     LEFT JOIN users u ON u.id = s.teacher_id
     ${where}
     ORDER BY c.name, s.name`, params);
  res.json(rows.map((r: any) => ({
    ...r,
    hours_remaining: r.hours_purchased - r.hours_consumed,
  })));
}));

/** 学生详情 */
studentsRouter.get('/:id', h(async (req: Request, res: Response) => {
  const id = await guardView(req, res);
  if (id === null) return;
  const { rows } = await query(
    `SELECT s.*, c.name AS class_name, c.stage AS class_stage, c.age_group AS class_age_group,
            u.name AS teacher_name, p.name AS parent_name
     FROM students s
     LEFT JOIN classes c ON c.id = s.class_id
     LEFT JOIN users u ON u.id = s.teacher_id
     LEFT JOIN users p ON p.id = s.parent_id
     WHERE s.id = $1`, [id]);
  if (!rows[0]) { res.status(404).json({ error: '学生不存在' }); return; }
  const hours = await query(
    `SELECT count(*)::int AS consumed FROM attendance WHERE student_id=$1 AND status IN ('present','makeup')`, [id]);
  res.json({
    ...rows[0],
    hours_consumed: hours.rows[0].consumed,
    hours_remaining: rows[0].hours_purchased - hours.rows[0].consumed,
  });
}));

/** 成长轨迹：逐课点评 + 同龄段阶段目标 */
studentsRouter.get('/:id/trajectory', h(async (req: Request, res: Response) => {
  const id = await guardView(req, res);
  if (id === null) return;
  const stu = (await query('SELECT age_group FROM students WHERE id=$1', [id])).rows[0];
  const reviews = (await query(
    `SELECT r.id, r.composition, r.line_score, r.color, r.observation, r.creativity, r.focus,
            r.need_home_practice, r.home_practice_note, r.suggestion, r.next_prep, r.class_state,
            r.created_at, a.id AS artwork_id, a.title, a.image_path,
            l.id AS lesson_id, l.lesson_date::text AS lesson_date, l.theme, l.stage, l.seq,
            u.name AS teacher_name
     FROM reviews r
     JOIN artworks a ON a.id = r.artwork_id
     JOIN lessons l ON l.id = r.lesson_id
     LEFT JOIN users u ON u.id = r.teacher_id
     WHERE r.student_id = $1
     ORDER BY l.lesson_date`, [id])).rows;
  const goals = (await query(
    'SELECT dimension, target_score, description FROM stage_goals WHERE age_group=$1 ORDER BY id',
    [stu.age_group])).rows;
  res.json({ reviews, goals, dimensions: DIMENSIONS });
}));

/** 证据选择器数据：历史作品 + 能力标签 */
studentsRouter.get('/:id/evidence-options', h(async (req: Request, res: Response) => {
  const id = await guardView(req, res);
  if (id === null) return;
  const artworks = (await query(
    `SELECT a.id, a.title, a.image_path, l.lesson_date::text AS lesson_date, l.theme,
            r.composition, r.line_score, r.color, r.observation, r.creativity, r.focus
     FROM artworks a
     JOIN lessons l ON l.id = a.lesson_id
     LEFT JOIN reviews r ON r.artwork_id = a.id
     WHERE a.student_id = $1 ORDER BY l.lesson_date DESC`, [id])).rows;
  res.json({ artworks, tags: ABILITY_TAGS });
}));

/** 时间线：作品点评 + 出勤异常 + 事件 + 沟通 + 评估（续费仅员工可见） */
studentsRouter.get('/:id/timeline', h(async (req: Request, res: Response) => {
  const id = await guardView(req, res);
  if (id === null) return;
  const isStaff = req.user!.role !== 'parent';
  const [reviews, att, events, comms, evals, renewals] = await Promise.all([
    query(
      `SELECT r.id, r.suggestion, r.composition, r.line_score, r.color, r.observation, r.creativity, r.focus,
              a.title, a.image_path, l.lesson_date::text AS d, l.theme, u.name AS teacher_name
       FROM reviews r JOIN artworks a ON a.id=r.artwork_id JOIN lessons l ON l.id=r.lesson_id
       LEFT JOIN users u ON u.id=r.teacher_id
       WHERE r.student_id=$1`, [id]),
    query(
      `SELECT a.status, l.lesson_date::text AS d, l.theme FROM attendance a
       JOIN lessons l ON l.id=a.lesson_id
       WHERE a.student_id=$1 AND a.status <> 'present'`, [id]),
    query(`SELECT type, title, detail, created_at::date::text AS d FROM events WHERE student_id=$1`, [id]),
    query(
      `SELECT c.channel, c.content, c.risk_level, c.created_at::date::text AS d, u.name AS author
       FROM communications c LEFT JOIN users u ON u.id=c.author_id WHERE c.student_id=$1`, [id]),
    query(
      `SELECT e.decision, e.period, e.created_at::date::text AS d, u.name AS by
       FROM evaluations e LEFT JOIN users u ON u.id=e.supervisor_id WHERE e.student_id=$1`, [id]),
    isStaff
      ? query(`SELECT suggestion, package, created_at::date::text AS d FROM renewals WHERE student_id=$1`, [id])
      : Promise.resolve({ rows: [] as any[] }),
  ]);
  res.json({
    reviews: reviews.rows,
    attendance: att.rows,
    events: events.rows,
    communications: comms.rows,
    evaluations: evals.rows,
    renewals: renewals.rows,
  });
}));

/** 升班评估工作区数据：自动汇总同龄段目标/出勤/作业/点评/家长配合/孩子意愿 */
studentsRouter.get('/:id/promotion-data', h(async (req: Request, res: Response) => {
  const id = await guardView(req, res);
  if (id === null) return;
  const stu = (await query(
    `SELECT s.*, c.name AS class_name, c.stage AS class_stage, u.name AS teacher_name
     FROM students s LEFT JOIN classes c ON c.id=s.class_id LEFT JOIN users u ON u.id=s.teacher_id
     WHERE s.id=$1`, [id])).rows[0];

  const att = (await query(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE status='present')::int AS present,
            count(*) FILTER (WHERE status='makeup')::int AS makeup,
            count(*) FILTER (WHERE status='leave')::int AS leave,
            count(*) FILTER (WHERE status='absent')::int AS absent
     FROM attendance WHERE student_id=$1`, [id])).rows[0];
  const attRate = att.total ? Math.round((att.present + att.makeup) / att.total * 1000) / 10 : 0;

  const hw = (await query(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE submitted)::int AS done
     FROM homework WHERE student_id=$1`, [id])).rows[0];
  const hwRate = hw.total ? Math.round(hw.done / hw.total * 1000) / 10 : 100;

  const dimAvgs = (await query(
    `SELECT avg(composition) AS composition, avg(line_score) AS line_score, avg(color) AS color,
            avg(observation) AS observation, avg(creativity) AS creativity, avg(focus) AS focus,
            count(*)::int AS n
     FROM reviews WHERE student_id=$1`, [id])).rows[0];

  const goals = (await query(
    'SELECT dimension, target_score, description FROM stage_goals WHERE age_group=$1',
    [stu.age_group])).rows;
  const goalComparison = DIMENSIONS.map((d) => {
    const g = goals.find((x: any) => x.dimension === d.key);
    const avg = dimAvgs.n ? Math.round(dimAvgs[d.key] * 10) / 10 : 0;
    return {
      dimension: d.key, label: d.label, avg,
      target: g ? g.target_score : null,
      goal_desc: g ? g.description : '',
      met: g ? avg >= g.target_score : false,
    };
  });

  const recentReviews = (await query(
    `SELECT r.suggestion, r.class_state, r.need_home_practice, l.lesson_date::text AS d, l.theme, u.name AS teacher_name
     FROM reviews r JOIN lessons l ON l.id=r.lesson_id LEFT JOIN users u ON u.id=r.teacher_id
     WHERE r.student_id=$1 ORDER BY l.lesson_date DESC LIMIT 5`, [id])).rows;

  const comms = (await query(
    `SELECT c.channel, c.content, c.risk_level, c.created_at::date::text AS d
     FROM communications c WHERE c.student_id=$1 ORDER BY c.created_at DESC LIMIT 5`, [id])).rows;

  const events = (await query(
    `SELECT type, title, detail, created_at::date::text AS d FROM events WHERE student_id=$1 ORDER BY created_at DESC`,
    [id])).rows;

  const hours = (await query(
    `SELECT count(*)::int AS consumed FROM attendance WHERE student_id=$1 AND status IN ('present','makeup')`,
    [id])).rows[0];

  res.json({
    student: stu,
    attendance: { ...att, rate: attRate },
    homework: { ...hw, rate: hwRate },
    goalComparison,
    recentReviews,
    communications: comms,
    events,
    hours: { purchased: stu.hours_purchased, consumed: hours.consumed, remaining: stu.hours_purchased - hours.consumed },
  });
}));

/** 提交升班评估（主管） */
studentsRouter.post('/:id/evaluations', requireRole('supervisor'), h(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const { period, attendance_rate, homework_rate, teacher_summary, parent_cooperation,
    child_willingness, goal_comparison, decision, rationale } = req.body || {};
  if (!period || !decision || !rationale) {
    res.status(400).json({ error: '评估阶段、结论与理由为必填项' });
    return;
  }
  if (!['promote', 'stay', 'interest', 'one_on_one'].includes(decision)) {
    res.status(400).json({ error: '无效的评估结论' });
    return;
  }
  const { rows } = await query(
    `INSERT INTO evaluations (student_id, supervisor_id, period, attendance_rate, homework_rate,
       teacher_summary, parent_cooperation, child_willingness, goal_comparison, decision, rationale)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [id, req.user!.id, period, attendance_rate || 0, homework_rate || 0, teacher_summary || '',
     parent_cooperation || '', child_willingness || '',
     JSON.stringify(goal_comparison || []), decision, rationale]);
  res.status(201).json({ id: rows[0].id });
}));

studentsRouter.get('/:id/evaluations', h(async (req: Request, res: Response) => {
  const id = await guardView(req, res);
  if (id === null) return;
  const { rows } = await query(
    `SELECT e.*, u.name AS supervisor_name FROM evaluations e
     LEFT JOIN users u ON u.id=e.supervisor_id
     WHERE e.student_id=$1 ORDER BY e.created_at DESC`, [id]);
  res.json(rows);
}));

/** 生成阶段说明（老师/主管），家长会前使用 */
studentsRouter.post('/:id/stage-reports', requireRole('teacher', 'supervisor'), h(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  if (!(await canTeachStudent(req.user!, id))) {
    res.status(403).json({ error: '无权为该学生生成阶段说明' });
    return;
  }
  const period = (req.body?.period || '').trim() || '2026年暑期阶段';
  const content = await buildStageReport(id, period);
  const { rows } = await query(
    'INSERT INTO stage_reports (student_id, period, content, generated_by) VALUES ($1,$2,$3,$4) RETURNING id',
    [id, period, content, req.user!.id]);
  res.status(201).json({ id: rows[0].id, period, content });
}));

studentsRouter.get('/:id/stage-reports', h(async (req: Request, res: Response) => {
  const id = await guardView(req, res);
  if (id === null) return;
  const { rows } = await query(
    `SELECT r.id, r.period, r.content, r.created_at, u.name AS generated_by_name
     FROM stage_reports r LEFT JOIN users u ON u.id=r.generated_by
     WHERE r.student_id=$1 ORDER BY r.created_at DESC`, [id]);
  res.json(rows);
}));

/** 记录事件（换老师/请假/补课/比赛/退费等） */
studentsRouter.post('/:id/events', requireRole('teacher', 'supervisor'), h(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const { type, title, detail, meta } = req.body || {};
  if (!type || !title) { res.status(400).json({ error: '事件类型与标题为必填项' }); return; }
  const { rows } = await query(
    'INSERT INTO events (student_id, type, title, detail, meta, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    [id, type, title, detail || '', JSON.stringify(meta || {}), req.user!.id]);
  res.status(201).json({ id: rows[0].id });
}));

/** 记录家长沟通（含风险等级） */
studentsRouter.post('/:id/communications', requireRole('teacher', 'supervisor'), h(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const { channel, content, risk_level } = req.body || {};
  if (!content) { res.status(400).json({ error: '沟通内容必填' }); return; }
  const { rows } = await query(
    'INSERT INTO communications (student_id, author_id, channel, content, risk_level) VALUES ($1,$2,$3,$4,$5) RETURNING id',
    [id, req.user!.id, channel || '微信', content, risk_level || 'low']);
  res.status(201).json({ id: rows[0].id });
}));

/** 续费建议（商业沟通，独立于教学证据） */
studentsRouter.get('/:id/renewals', h(async (req: Request, res: Response) => {
  const id = await guardView(req, res);
  if (id === null) return;
  const { rows } = await query(
    `SELECT r.*, u.name AS author_name FROM renewals r LEFT JOIN users u ON u.id=r.author_id
     WHERE r.student_id=$1 ORDER BY r.created_at DESC`, [id]);
  res.json(rows);
}));

studentsRouter.post('/:id/renewals', requireRole('supervisor'), h(async (req: Request, res: Response) => {
  const id = parseInt(req.params.id, 10);
  const { suggestion, package: pkg } = req.body || {};
  if (!suggestion) { res.status(400).json({ error: '续费建议内容必填' }); return; }
  const { rows } = await query(
    'INSERT INTO renewals (student_id, author_id, suggestion, package) VALUES ($1,$2,$3,$4) RETURNING id',
    [id, req.user!.id, suggestion, pkg || '']);
  res.status(201).json({ id: rows[0].id });
}));
