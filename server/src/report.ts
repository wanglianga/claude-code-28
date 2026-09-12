import { query } from './db';
import { DIMENSIONS } from './domain';

/** 生成学生阶段说明（家长会前使用），返回 markdown 文本 */
export async function buildStageReport(studentId: number, period: string): Promise<string> {
  const stu = (await query(
    `SELECT s.*, c.name AS class_name, c.stage AS class_stage, u.name AS teacher_name
     FROM students s
     LEFT JOIN classes c ON c.id = s.class_id
     LEFT JOIN users u ON u.id = s.teacher_id
     WHERE s.id = $1`, [studentId])).rows[0];
  if (!stu) throw new Error('学生不存在');

  const reviews = (await query(
    `SELECT r.*, l.lesson_date::text AS date, l.theme, l.stage
     FROM reviews r JOIN lessons l ON l.id = r.lesson_id
     WHERE r.student_id = $1 ORDER BY l.lesson_date`, [studentId])).rows;

  const att = (await query(
    `SELECT status, count(*)::int AS c FROM attendance WHERE student_id=$1 GROUP BY status`,
    [studentId])).rows;
  const attMap: Record<string, number> = {};
  att.forEach((r: any) => { attMap[r.status] = r.c; });
  const attTotal = att.reduce((s: number, r: any) => s + r.c, 0) || 1;
  const attRate = (((attMap['present'] || 0) + (attMap['makeup'] || 0)) / attTotal * 100).toFixed(0);

  const hw = (await query(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE submitted)::int AS done
     FROM homework WHERE student_id=$1`, [studentId])).rows[0];

  const goals = (await query(
    'SELECT dimension, target_score, description FROM stage_goals WHERE age_group=$1',
    [stu.age_group])).rows;
  const goalMap: Record<string, { target: number; desc: string }> = {};
  goals.forEach((g: any) => { goalMap[g.dimension] = { target: g.target_score, desc: g.description }; });

  const events = (await query(
    `SELECT type, title, created_at::date::text AS d FROM events WHERE student_id=$1 ORDER BY created_at`,
    [studentId])).rows;

  const lines: string[] = [];
  lines.push(`# ${stu.name} 阶段学习说明（${period}）`);
  lines.push('');
  lines.push(`- 班级：${stu.class_name}（${stu.class_stage} · ${stu.age_group}）　任课老师：${stu.teacher_name || '—'}`);
  lines.push(`- 出勤：${attMap['present'] || 0}次到课${attMap['makeup'] ? `，${attMap['makeup']}次补课` : ''}${attMap['leave'] ? `，${attMap['leave']}次请假` : ''}${attMap['absent'] ? `，${attMap['absent']}次缺勤` : ''}（出勤率 ${attRate}%）`);
  lines.push(`- 家庭练习：布置 ${hw.total} 次，完成 ${hw.done} 次`);
  lines.push(`- 孩子意愿：${stu.child_willingness}${stu.willingness_note ? `（${stu.willingness_note}）` : ''}`);
  lines.push('');

  // 能力对照表
  lines.push('## 能力发展与同龄段目标对照');
  lines.push('');
  lines.push('| 维度 | 阶段均分 | 同龄段目标 | 达成 |');
  lines.push('| --- | --- | --- | --- |');
  const dimAvg: Record<string, number> = {};
  for (const d of DIMENSIONS) {
    const vals = reviews.map((r: any) => r[d.key] as number);
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    dimAvg[d.key] = avg;
    const goal = goalMap[d.key];
    const met = goal && avg >= goal.target ? '✅ 达标' : '⏳ 发展中';
    lines.push(`| ${d.label} | ${avg.toFixed(1)} | ${goal ? goal.target : '—'} | ${met} |`);
  }
  lines.push('');

  // 成长亮点：首3次 vs 末3次
  if (reviews.length >= 4) {
    const first = reviews.slice(0, 3);
    const last = reviews.slice(-3);
    const highlights: string[] = [];
    for (const d of DIMENSIONS) {
      const f = first.reduce((s: number, r: any) => s + r[d.key], 0) / first.length;
      const l = last.reduce((s: number, r: any) => s + r[d.key], 0) / last.length;
      if (l - f >= 0.8) highlights.push(`${d.label}（${f.toFixed(1)} → ${l.toFixed(1)}）`);
    }
    lines.push('## 成长亮点');
    lines.push('');
    lines.push(highlights.length
      ? `本阶段进步最明显的维度：${highlights.join('、')}。`
      : '本阶段各维度发展平稳，建议继续保持到课率与家庭练习节奏。');
    lines.push('');
  }

  // 老师近期点评
  if (reviews.length) {
    lines.push('## 任课老师近期点评摘录');
    lines.push('');
    for (const r of reviews.slice(-3)) {
      lines.push(`- ${r.date.slice(0, 10)}《${r.theme.replace(/[《》]/g, '')}》：${r.suggestion}`);
    }
    lines.push('');
  }

  // 阶段内重要事项
  if (events.length) {
    lines.push('## 阶段内重要事项');
    lines.push('');
    for (const e of events) lines.push(`- ${e.d} ${e.title}`);
    lines.push('');
  }

  // 下一步建议
  const weakest = DIMENSIONS.slice().sort((a, b) => dimAvg[a.key] - dimAvg[b.key])[0];
  lines.push('## 下一阶段建议');
  lines.push('');
  lines.push(`- 重点关注「${weakest.label}」：${goalMap[weakest.key] ? goalMap[weakest.key].desc : ''}`);
  lines.push('- 保持规律到课，家庭练习以兴趣保护为主，每次10-15分钟即可。');
  lines.push('- 具体升班/课程安排以教学主管的正式评估为准，续费类商业沟通不作为教学结论。');
  lines.push('');
  lines.push('> 本说明由系统依据课堂点评、出勤与作业记录自动生成，供家长会沟通使用。');
  return lines.join('\n');
}
