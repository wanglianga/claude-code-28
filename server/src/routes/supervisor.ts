import { Router, Request, Response } from 'express';
import { h } from "../hwrap";
import { query } from '../db';
import { authed, requireRole } from '../auth';

export const supervisorRouter = Router();
supervisorRouter.use(h(authed), requireRole('supervisor'));

/**
 * 主管总览：教学证据（成长/出勤/作业/评估）与商业信息（续费/课时/沟通风险）
 * 并排呈现，并做一致性检查，避免"只凭单次作品判断"或"把续费当升班结论"。
 */
supervisorRouter.get('/overview', h(async (_req: Request, res: Response) => {
  const students = (await query(
    `SELECT s.id, s.name, s.age_group, s.child_willingness, s.hours_purchased,
            c.name AS class_name, c.stage AS class_stage, u.name AS teacher_name
     FROM students s
     LEFT JOIN classes c ON c.id=s.class_id
     LEFT JOIN users u ON u.id=s.teacher_id
     ORDER BY c.name, s.name`)).rows;

  const result = [];
  for (const s of students) {
    const scores = (await query(
      `SELECT (r.composition+r.line_score+r.color+r.observation+r.creativity+r.focus)/6.0 AS avg6,
              l.lesson_date
       FROM reviews r JOIN lessons l ON l.id=r.lesson_id
       WHERE r.student_id=$1 ORDER BY l.lesson_date`, [s.id])).rows;
    const n = scores.length;
    const avg = (arr: any[]) => arr.length ? arr.reduce((a, b) => a + Number(b.avg6), 0) / arr.length : 0;
    const firstAvg = avg(scores.slice(0, 4));
    const lastAvg = avg(scores.slice(-4));
    const trend = n >= 4 ? Math.round((lastAvg - firstAvg) * 100) / 100 : null;

    const att = (await query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE status IN ('present','makeup'))::int AS done
       FROM attendance WHERE student_id=$1`, [s.id])).rows[0];
    const attRate = att.total ? Math.round(att.done / att.total * 100) : 0;

    const hw = (await query(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE submitted)::int AS done
       FROM homework WHERE student_id=$1`, [s.id])).rows[0];
    const hwRate = hw.total ? Math.round(hw.done / hw.total * 100) : null;

    const consumed = (await query(
      `SELECT count(*)::int AS c FROM attendance WHERE student_id=$1 AND status IN ('present','makeup')`,
      [s.id])).rows[0].c;

    const comms = (await query(
      `SELECT risk_level, content, created_at::date::text AS d FROM communications
       WHERE student_id=$1 ORDER BY created_at DESC LIMIT 3`, [s.id])).rows;
    const riskRank: Record<string, number> = { low: 1, medium: 2, high: 3 };
    const maxRisk = comms.reduce((m, c) => Math.max(m, riskRank[c.risk_level] || 0), 0);
    const riskLabel = maxRisk >= 3 ? 'high' : maxRisk === 2 ? 'medium' : 'low';

    const evals = (await query(
      `SELECT decision, period, created_at::date::text AS d FROM evaluations
       WHERE student_id=$1 ORDER BY created_at DESC LIMIT 1`, [s.id])).rows;

    const renewals = (await query(
      `SELECT suggestion, package, created_at::date::text AS d FROM renewals
       WHERE student_id=$1 ORDER BY created_at DESC`, [s.id])).rows;

    const events = (await query(
      `SELECT type, count(*)::int AS c FROM events WHERE student_id=$1 GROUP BY type`, [s.id])).rows;
    const hasRefund = events.some((e: any) => e.type === 'refund_request');

    // 一致性检查
    const flags: Array<{ level: 'warn' | 'danger' | 'ok'; text: string }> = [];
    const latestEval = evals[0];
    const remaining = s.hours_purchased - consumed;
    if (hasRefund) flags.push({ level: 'danger', text: '存在退费请求，需优先处理' });
    if (riskLabel === 'high') flags.push({ level: 'danger', text: '家长沟通风险高' });
    if (riskLabel === 'medium') flags.push({ level: 'warn', text: '家长沟通风险中' });
    if (remaining <= 8) flags.push({ level: 'warn', text: `课时仅剩${remaining}节` });
    if (trend !== null && trend < 0.3 && n >= 6) flags.push({ level: 'warn', text: '阶段进步幅度偏小' });
    if (latestEval && renewals.length) {
      if (['stay', 'interest', 'one_on_one'].includes(latestEval.decision)) {
        flags.push({ level: 'warn', text: '续费建议与评估结论（非升班）需向家长解释清楚' });
      } else if (latestEval.decision === 'promote') {
        flags.push({ level: 'ok', text: '续费建议与升班评估方向一致' });
      }
    }
    if (renewals.length && hasRefund) {
      flags.push({ level: 'danger', text: '退费处理中存在续费推销，极易引发投诉' });
    }
    if (!latestEval) flags.push({ level: 'warn', text: '本阶段尚未做升班评估' });

    result.push({
      ...s,
      review_count: n,
      first_avg: n ? Math.round(firstAvg * 10) / 10 : null,
      last_avg: n ? Math.round(lastAvg * 10) / 10 : null,
      trend,
      attendance_rate: attRate,
      homework_rate: hwRate,
      hours_consumed: consumed,
      hours_remaining: remaining,
      comm_risk: riskLabel,
      latest_comm: comms[0] || null,
      latest_eval: latestEval || null,
      renewal_count: renewals.length,
      latest_renewal: renewals[0] || null,
      flags,
    });
  }
  res.json(result);
}));
