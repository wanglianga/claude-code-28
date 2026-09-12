import { Router, Request, Response } from 'express';
import { query } from '../db';
import { authed, canTeachStudent, canViewStudent, requireRole } from '../auth';
import { h } from '../hwrap';
import { applyAdjustment, generatePlan, planProgress, PlanItem } from '../competition';

export const competitionsRouter = Router();
competitionsRouter.use(h(authed));

/** 学生的比赛列表（含辅导计划与进度） */
competitionsRouter.get('/students/:id/competitions', h(async (req: Request, res: Response) => {
  const studentId = parseInt(req.params.id, 10);
  if (!(await canViewStudent(req.user!, studentId))) {
    res.status(403).json({ error: '无权查看该学生' });
    return;
  }
  const comps = (await query(
    `SELECT c.*, u.name AS created_by_name FROM competitions c
     LEFT JOIN users u ON u.id = c.created_by
     WHERE c.student_id=$1 ORDER BY c.created_at DESC`, [studentId])).rows;
  const result = [];
  for (const c of comps) {
    const plan = (await query(
      'SELECT items, ability_snapshot, created_at FROM coaching_plans WHERE competition_id=$1 ORDER BY id DESC LIMIT 1',
      [c.id])).rows[0];
    const adjustments = (await query(
      `SELECT a.*, u.name AS operator_name FROM plan_adjustments a
       LEFT JOIN users u ON u.id=a.created_by
       WHERE a.competition_id=$1 ORDER BY a.created_at DESC`, [c.id])).rows;
    const progress = await planProgress(c.id);
    // 每个计划项的完成状态
    const items: PlanItem[] = plan ? plan.items : [];
    const doneMap: Record<number, boolean> = {};
    for (const item of items) {
      if (!item.lesson_id) continue;
      const r = await query(
        'SELECT 1 FROM reviews WHERE student_id=$1 AND lesson_id=$2 AND serves_competition=true',
        [studentId, item.lesson_id]);
      doneMap[item.seq] = r.rows.length > 0;
    }
    result.push({
      ...c,
      items: items.map((i) => ({ ...i, done: !!doneMap[i.seq] })),
      ability_snapshot: plan ? plan.ability_snapshot : null,
      progress,
      adjustments,
    });
  }
  res.json(result);
}));

/** 报名比赛并生成辅导计划（老师/主管） */
competitionsRouter.post('/students/:id/competitions', requireRole('teacher', 'supervisor'), h(async (req: Request, res: Response) => {
  const studentId = parseInt(req.params.id, 10);
  if (!(await canTeachStudent(req.user!, studentId))) {
    res.status(403).json({ error: '无权为该学生报名比赛' });
    return;
  }
  const { name, theme, deadline, size_requirement } = req.body || {};
  if (!name?.trim() || !theme?.trim() || !deadline) {
    res.status(400).json({ error: '比赛名称、主题与截止时间为必填项' });
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
    res.status(400).json({ error: '截止时间格式应为 YYYY-MM-DD' });
    return;
  }
  const dup = await query(
    `SELECT 1 FROM competitions WHERE student_id=$1 AND name=$2 AND status='active'`, [studentId, name.trim()]);
  if (dup.rows.length) {
    res.status(409).json({ error: '该学生已报名此比赛且仍在辅导中' });
    return;
  }
  const { rows } = await query(
    `INSERT INTO competitions (student_id, name, theme, deadline, size_requirement, created_by)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
    [studentId, name.trim(), theme.trim(), deadline, size_requirement || '', req.user!.id]);
  const competitionId = rows[0].id as number;
  await generatePlan(competitionId, req.user!.id);
  res.status(201).json({ id: competitionId });
}));

/** 主管干预：加课 / 换主题 / 建议放弃 */
competitionsRouter.post('/competitions/:id/adjustments', requireRole('supervisor'), h(async (req: Request, res: Response) => {
  const competitionId = parseInt(req.params.id, 10);
  const { type, note, lesson_date, new_theme } = req.body || {};
  if (!['extra_lesson', 'change_theme', 'withdraw'].includes(type)) {
    res.status(400).json({ error: '无效的干预类型' });
    return;
  }
  try {
    await applyAdjustment(competitionId, type, note || '', req.user!.id, { lesson_date, new_theme });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
    return;
  }
  res.status(201).json({ ok: true });
}));

/** 标记完赛（老师/主管） */
competitionsRouter.post('/competitions/:id/complete', requireRole('teacher', 'supervisor'), h(async (req: Request, res: Response) => {
  const competitionId = parseInt(req.params.id, 10);
  const comp = (await query('SELECT student_id, status FROM competitions WHERE id=$1', [competitionId])).rows[0];
  if (!comp) { res.status(404).json({ error: '比赛不存在' }); return; }
  if (!(await canTeachStudent(req.user!, comp.student_id))) {
    res.status(403).json({ error: '无权操作该比赛' });
    return;
  }
  if (comp.status !== 'active') { res.status(409).json({ error: '该比赛已结束或已放弃' }); return; }
  await query(`UPDATE competitions SET status='completed' WHERE id=$1`, [competitionId]);
  await query(
    `INSERT INTO events (student_id, type, title, detail, created_by) VALUES ($1,'competition','比赛完赛',$2,$3)`,
    [comp.student_id, req.body?.note || '作品已提交，比赛辅导阶段完成。', req.user!.id]);
  res.json({ ok: true });
}));
