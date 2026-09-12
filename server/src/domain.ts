/** 领域共享常量：六个教学维度、问题类型、事件类型、评估结论等 */

export const DIMENSIONS = [
  { key: 'composition', label: '构图' },
  { key: 'line_score', label: '线条' },
  { key: 'color', label: '色彩' },
  { key: 'observation', label: '观察能力' },
  { key: 'creativity', label: '创意表达' },
  { key: 'focus', label: '课堂专注' },
] as const;

export type DimensionKey = (typeof DIMENSIONS)[number]['key'];

export const QUESTION_TYPES = [
  { key: 'slow_progress', label: '进步慢' },
  { key: 'not_good', label: '作品不像样' },
  { key: 'promotion', label: '是否适合升班' },
  { key: 'other', label: '其他' },
] as const;

export const EVENT_TYPES = [
  { key: 'teacher_change', label: '更换老师' },
  { key: 'leave', label: '请假' },
  { key: 'makeup', label: '补课' },
  { key: 'competition', label: '参加比赛' },
  { key: 'refund_request', label: '退费请求' },
  { key: 'note', label: '其他事项' },
] as const;

export const DECISIONS = [
  { key: 'promote', label: '升班' },
  { key: 'stay', label: '留班巩固' },
  { key: 'interest', label: '转兴趣班' },
  { key: 'one_on_one', label: '建议一对一辅导' },
] as const;

export const WILLINGNESS = ['积极', '一般', '被动', '抵触'] as const;
export const COOPERATION = ['积极配合', '基本配合', '较少配合'] as const;
export const RISK_LEVELS = [
  { key: 'low', label: '低' },
  { key: 'medium', label: '中' },
  { key: 'high', label: '高' },
] as const;

/** 比赛辅导计划干预方式（主管） */
export const ADJUSTMENT_TYPES = [
  { key: 'extra_lesson', label: '安排加课' },
  { key: 'change_theme', label: '更换主题' },
  { key: 'withdraw', label: '建议放弃参赛' },
] as const;

export const COMPETITION_STATUS = [
  { key: 'active', label: '辅导中' },
  { key: 'completed', label: '已完赛' },
  { key: 'withdrawn', label: '已放弃' },
] as const;

/** 能力标签（用于老师回复家长时选取证据标签） */
export const ABILITY_TAGS = [
  '构图稳定', '构图有想法', '线条流畅', '线条果断', '色彩敏感', '配色和谐',
  '观察细致', '观察角度独特', '创意突出', '想象力丰富', '专注度提升', '课堂投入',
  '进步明显', '需要家庭练习', '阶段性波动', '适应新老师中',
];
