import { query } from './db';
import { DIMENSIONS } from './domain';

export interface PlanItem {
  seq: number;
  focus: string;          // 辅导重点（写入课次 prep_focus，影响老师备课）
  requirement: string;    // 对应的比赛要求（老师点评时对照说明）
  lesson_id: number | null;
  lesson_date: string | null;
}

const DIM_LABEL: Record<string, string> = Object.fromEntries(
  DIMENSIONS.map((d) => [d.key, d.label]),
);

const todayStr = () => new Date().toISOString().slice(0, 10);

/** 学生当前能力快照：近6次六维均分 + 两个最弱维度 */
async function abilitySnapshot(studentId: number) {
  const { rows } = await query(
    `SELECT avg(composition) AS composition, avg(line_score) AS line_score, avg(color) AS color,
            avg(observation) AS observation, avg(creativity) AS creativity, avg(focus) AS focus
     FROM (
       SELECT composition, line_score, color, observation, creativity, focus
       FROM reviews r JOIN lessons l ON l.id = r.lesson_id
       WHERE r.student_id = $1 ORDER BY l.lesson_date DESC LIMIT 6
     ) t`, [studentId]);
  const r = rows[0] || {};
  const avgs: Record<string, number> = {};
  for (const d of DIMENSIONS) {
    avgs[d.key] = r[d.key] === null || r[d.key] === undefined ? 0 : Math.round(Number(r[d.key]) * 10) / 10;
  }
  const weak = DIMENSIONS.map((d) => d.key)
    .sort((a, b) => avgs[a] - avgs[b])
    .slice(0, 2)
    .map((k) => DIM_LABEL[k]);
  return { avgs, weak };
}

/** 由比赛信息 + 能力弱项生成辅导阶段（不分配课次） */
function buildFocuses(
  comp: { theme: string; deadline: string; size_requirement: string },
  weak: string[],
): Array<{ focus: string; requirement: string }> {
  const deadline = String(comp.deadline).slice(0, 10);
  const size = comp.size_requirement || '按比赛要求';
  return [
    { focus: `主题构思与素材：围绕「${comp.theme}」收集素材、起2-3幅小稿`, requirement: `扣题「${comp.theme}」` },
    { focus: `构图与尺寸适配：按「${size}」确定画面比例与装裱方式`, requirement: `尺寸要求：${size}` },
    ...weak.map((w) => ({
      focus: `${w}专项强化：针对当前能力弱项「${w}」安排专项练习`,
      requirement: `能力提升：${w}`,
    })),
    { focus: '正稿制作：按比赛要求完成完整参赛作品', requirement: '完成参赛作品正稿' },
    { focus: `修改完善与提交：对照比赛要求逐项检查，截止（${deadline}）前完成提交`, requirement: '按要求完成提交' },
  ];
}

/** 把辅导阶段分配到课次：课次够则一一对应，不够则后面的阶段并入最后一课 */
function distribute(
  focuses: Array<{ focus: string; requirement: string }>,
  lessons: Array<{ id: number; d: string }>,
  startSeq: number,
): PlanItem[] {
  const items: PlanItem[] = [];
  if (lessons.length === 0) {
    focuses.forEach((f, i) => items.push({ seq: startSeq + i, ...f, lesson_id: null, lesson_date: null }));
    return items;
  }
  const grouped: Array<{ lesson: { id: number; d: string }; fs: typeof focuses }> =
    lessons.map((l) => ({ lesson: l, fs: [] as typeof focuses }));
  focuses.forEach((f, i) => {
    const idx = Math.floor((i * lessons.length) / focuses.length);
    grouped[idx].fs.push(f);
  });
  let seq = startSeq;
  for (const g of grouped) {
    for (const f of g.fs) {
      items.push({ seq: seq++, ...f, lesson_id: g.lesson.id, lesson_date: String(g.lesson.d).slice(0, 10) });
    }
  }
  return items;
}

/** 把计划项的辅导重点回写到课次：同一课次对应多个计划项时合并写入（计划 → 备课/课次目标） */
async function writePrepFocus(items: PlanItem[]): Promise<void> {
  const byLesson = new Map<number, string[]>();
  for (const item of items) {
    if (!item.lesson_id) continue;
    const arr = byLesson.get(item.lesson_id) || [];
    arr.push(item.focus);
    byLesson.set(item.lesson_id, arr);
  }
  for (const [lessonId, focuses] of byLesson) {
    await query('UPDATE lessons SET prep_focus=$1 WHERE id=$2', [focuses.join('；'), lessonId]);
  }
}

/**
 * 由「比赛主题 + 截止时间 + 尺寸要求 + 当前能力标签」生成辅导计划：
 * 计划项映射到截止日前的后续课次，并回写课次 prep_focus（影响老师备课与课次目标）。
 */
export async function generatePlan(competitionId: number, createdBy: number | null): Promise<void> {
  const comp = (await query('SELECT * FROM competitions WHERE id=$1', [competitionId])).rows[0];
  if (!comp) throw new Error('比赛不存在');
  const stu = (await query('SELECT * FROM students WHERE id=$1', [comp.student_id])).rows[0];
  const snap = await abilitySnapshot(comp.student_id);

  const lessons = (await query(
    `SELECT id, lesson_date::text AS d FROM lessons
     WHERE class_id=$1 AND lesson_date >= CURRENT_DATE AND lesson_date <= $2
     ORDER BY lesson_date`, [stu.class_id, comp.deadline])).rows;

  const items = distribute(buildFocuses(comp, snap.weak), lessons, 1);

  await query('DELETE FROM coaching_plans WHERE competition_id=$1', [competitionId]);
  await query(
    'INSERT INTO coaching_plans (competition_id, items, ability_snapshot) VALUES ($1,$2,$3)',
    [competitionId, JSON.stringify(items), JSON.stringify(snap)]);

  await writePrepFocus(items);
  if (createdBy) {
    await query(
      `INSERT INTO events (student_id, type, title, detail, created_by) VALUES ($1,'competition',$2,$3,$4)`,
      [comp.student_id, `生成比赛辅导计划：${comp.name}`,
       `主题「${comp.theme}」，截止 ${String(comp.deadline).slice(0, 10)}，共${items.length}个辅导阶段，已同步到后续课次目标。`, createdBy]);
  }
}

export interface PlanProgress {
  expected: number;   // 到今天就应完成的计划项数
  done: number;       // 实际完成（对应课次有点评且标记服务比赛目标）
  behind: boolean;
  percent: number;
}

/** 计算比赛辅导进度：应完成 vs 已完成（依据老师点评的"服务比赛目标"标记） */
export async function planProgress(competitionId: number): Promise<PlanProgress> {
  const plan = (await query(
    'SELECT items FROM coaching_plans WHERE competition_id=$1 ORDER BY id DESC LIMIT 1',
    [competitionId])).rows[0];
  const items: PlanItem[] = plan ? plan.items : [];
  const comp = (await query('SELECT student_id FROM competitions WHERE id=$1', [competitionId])).rows[0];
  const today = todayStr();
  let expected = 0;
  let done = 0;
  for (const item of items) {
    if (!item.lesson_id || !item.lesson_date || item.lesson_date > today) continue;
    expected++;
    const r = await query(
      `SELECT 1 FROM reviews WHERE student_id=$1 AND lesson_id=$2 AND serves_competition=true`,
      [comp.student_id, item.lesson_id]);
    if (r.rows.length) done++;
  }
  const total = items.filter((i) => i.lesson_id).length || 1;
  return { expected, done, behind: expected > done, percent: Math.round((done / total) * 100) };
}

/** 主管干预：加课 / 换主题 / 建议放弃 */
export async function applyAdjustment(
  competitionId: number,
  type: 'extra_lesson' | 'change_theme' | 'withdraw',
  note: string,
  operatorId: number,
  payload: { lesson_date?: string; new_theme?: string } = {},
): Promise<void> {
  const comp = (await query('SELECT * FROM competitions WHERE id=$1', [competitionId])).rows[0];
  if (!comp) throw new Error('比赛不存在');
  if (comp.status !== 'active') throw new Error('该比赛已结束或已放弃，无法干预');
  const stu = (await query('SELECT * FROM students WHERE id=$1', [comp.student_id])).rows[0];

  await query(
    'INSERT INTO plan_adjustments (competition_id, type, note, created_by) VALUES ($1,$2,$3,$4)',
    [competitionId, type, note, operatorId]);

  if (type === 'extra_lesson') {
    const date = payload.lesson_date;
    if (!date) throw new Error('加课需要指定日期');
    const plan = (await query(
      'SELECT items FROM coaching_plans WHERE competition_id=$1 ORDER BY id DESC LIMIT 1',
      [competitionId])).rows[0];
    const items: PlanItem[] = plan ? plan.items : [];
    const progress = await planProgress(competitionId);
    const linked = items.filter((i) => i.lesson_id).sort((a, b) => a.seq - b.seq);
    const nextItem = linked[progress.done] || linked[linked.length - 1];
    const focus = note || (nextItem ? nextItem.focus : `比赛加课：围绕「${comp.theme}」强化训练`);
    const maxSeq = (await query('SELECT COALESCE(max(seq),0)::int AS m FROM lessons WHERE class_id=$1', [stu.class_id])).rows[0].m;
    const teacherId = (await query('SELECT teacher_id FROM classes WHERE id=$1', [stu.class_id])).rows[0].teacher_id;
    const nl = await query(
      `INSERT INTO lessons (class_id, teacher_id, lesson_date, theme, stage, seq, prep_focus)
       VALUES ($1,$2,$3,$4,'比赛辅导',$5,$6) RETURNING id`,
      [stu.class_id, teacherId, date, `比赛加课·${comp.theme}`, maxSeq + 1, focus]);
    items.push({
      seq: items.length + 1,
      focus,
      requirement: nextItem ? nextItem.requirement : `扣题「${comp.theme}」`,
      lesson_id: nl.rows[0].id,
      lesson_date: date,
    });
    await query('UPDATE coaching_plans SET items=$1 WHERE competition_id=$2', [JSON.stringify(items), competitionId]);
    await query(
      `INSERT INTO events (student_id, type, title, detail, created_by) VALUES ($1,'competition',$2,$3,$4)`,
      [comp.student_id, `比赛辅导加课：${date}`, focus, operatorId]);
    return;
  }

  if (type === 'change_theme') {
    const newTheme = payload.new_theme;
    if (!newTheme) throw new Error('换主题需要填写新主题');
    const oldTheme = comp.theme;
    await query('UPDATE competitions SET theme=$1 WHERE id=$2', [newTheme, competitionId]);
    // 保留今天之前已发生的计划项，仅按新主题重排未来课次
    const plan = (await query(
      'SELECT items FROM coaching_plans WHERE competition_id=$1 ORDER BY id DESC LIMIT 1',
      [competitionId])).rows[0];
    const oldItems: PlanItem[] = plan ? plan.items : [];
    const today = todayStr();
    const pastItems = oldItems.filter((i) => i.lesson_date && i.lesson_date < today);
    const snap = await abilitySnapshot(comp.student_id);
    const futureLessons = (await query(
      `SELECT id, lesson_date::text AS d FROM lessons
       WHERE class_id=$1 AND lesson_date >= CURRENT_DATE AND lesson_date <= $2
       ORDER BY lesson_date`, [stu.class_id, comp.deadline])).rows;
    const newItems = distribute(
      buildFocuses({ ...comp, theme: newTheme }, snap.weak), futureLessons, pastItems.length + 1);
    // 未来课次的备课重点先清空再按新计划合并写入
    for (const l of futureLessons) {
      await query(`UPDATE lessons SET prep_focus='' WHERE id=$1`, [l.id]);
    }
    await writePrepFocus(newItems);
    await query('UPDATE coaching_plans SET items=$1, ability_snapshot=$2 WHERE competition_id=$3',
      [JSON.stringify([...pastItems, ...newItems]), JSON.stringify(snap), competitionId]);
    await query(
      `INSERT INTO events (student_id, type, title, detail, created_by) VALUES ($1,'competition',$2,$3,$4)`,
      [comp.student_id, `更换比赛主题：「${oldTheme}」→「${newTheme}」`,
       note || '已按新主题重排后续辅导计划与课次目标。', operatorId]);
    return;
  }

  // withdraw：建议放弃参赛
  await query(`UPDATE competitions SET status='withdrawn' WHERE id=$1`, [competitionId]);
  const plan = (await query(
    'SELECT items FROM coaching_plans WHERE competition_id=$1 ORDER BY id DESC LIMIT 1',
    [competitionId])).rows[0];
  const items: PlanItem[] = plan ? plan.items : [];
  const today = todayStr();
  for (const item of items) {
    if (item.lesson_id && item.lesson_date && item.lesson_date >= today) {
      await query(`UPDATE lessons SET prep_focus='' WHERE id=$1`, [item.lesson_id]);
    }
  }
  await query(
    `INSERT INTO events (student_id, type, title, detail, created_by) VALUES ($1,'competition',$2,$3,$4)`,
    [comp.student_id, `建议放弃参赛：${comp.name}`, note || '进度评估后建议放弃，需与家长沟通确认。', operatorId]);
}
