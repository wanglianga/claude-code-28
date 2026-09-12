/** 与后端对应的类型定义 */

export interface User {
  id: number;
  username: string;
  role: 'teacher' | 'supervisor' | 'parent';
  name: string;
}

export interface Dimension { key: string; label: string }
export interface MetaOption { key: string; label: string }

export interface Meta {
  dimensions: Dimension[];
  questionTypes: MetaOption[];
  eventTypes: MetaOption[];
  decisions: MetaOption[];
  willingness: string[];
  cooperation: string[];
  riskLevels: MetaOption[];
  abilityTags: string[];
  adjustmentTypes: MetaOption[];
  competitionStatus: MetaOption[];
}

export interface StudentSummary {
  id: number;
  name: string;
  gender: string;
  age_group: string;
  child_willingness: string;
  hours_purchased: number;
  hours_consumed: number;
  hours_remaining: number;
  class_name: string;
  class_stage: string;
  teacher_name: string;
  avg_score: number | null;
  review_count: number;
}

export interface ReviewItem {
  id: number;
  composition: number;
  line_score: number;
  color: number;
  observation: number;
  creativity: number;
  focus: number;
  need_home_practice: boolean;
  home_practice_note: string;
  suggestion: string;
  next_prep: string;
  class_state: string;
  serves_competition: boolean;
  competition_req_note: string;
  artwork_id: number;
  title: string;
  image_path: string;
  lesson_id: number;
  lesson_date: string;
  theme: string;
  stage: string;
  seq: number;
  teacher_name: string;
}

export interface StageGoal {
  dimension: string;
  target_score: number;
  description: string;
}

export interface Trajectory {
  reviews: ReviewItem[];
  goals: StageGoal[];
  dimensions: Dimension[];
}

export interface EvidenceArtwork {
  id: number;
  title: string;
  image_path: string;
  lesson_date: string;
  theme: string;
  composition?: number;
  line_score?: number;
  color?: number;
  observation?: number;
  creativity?: number;
  focus?: number;
}

export interface Question {
  id: number;
  type: string;
  content: string;
  status: 'pending' | 'answered';
  created_at: string;
  student_id: number;
  student_name: string;
  class_name: string;
  parent_name: string;
  reply_id: number | null;
  reply_content: string | null;
  reply_at: string | null;
  reply_teacher: string | null;
  evidence_tags: string[];
  evidence_artworks: EvidenceArtwork[];
}

export interface GoalComparison {
  dimension: string;
  label: string;
  avg: number;
  target: number | null;
  goal_desc: string;
  met: boolean;
}

export interface PromotionData {
  student: any;
  attendance: { total: number; present: number; makeup: number; leave: number; absent: number; rate: number };
  homework: { total: number; done: number; rate: number };
  goalComparison: GoalComparison[];
  recentReviews: Array<{ suggestion: string; class_state: string; need_home_practice: boolean; d: string; theme: string; teacher_name: string }>;
  communications: Array<{ channel: string; content: string; risk_level: string; d: string }>;
  events: Array<{ type: string; title: string; detail: string; d: string }>;
  hours: { purchased: number; consumed: number; remaining: number };
}

export interface OverviewRow {
  id: number;
  name: string;
  age_group: string;
  class_name: string;
  class_stage: string;
  teacher_name: string;
  child_willingness: string;
  review_count: number;
  first_avg: number | null;
  last_avg: number | null;
  trend: number | null;
  attendance_rate: number;
  homework_rate: number | null;
  hours_consumed: number;
  hours_remaining: number;
  comm_risk: 'low' | 'medium' | 'high';
  latest_comm: { content: string; d: string } | null;
  latest_eval: { decision: string; period: string; d: string } | null;
  renewal_count: number;
  latest_renewal: { suggestion: string; package: string; d: string } | null;
  flags: Array<{ level: 'warn' | 'danger' | 'ok'; text: string }>;
}

export interface Timeline {
  reviews: Array<any>;
  attendance: Array<{ status: string; d: string; theme: string }>;
  events: Array<{ type: string; title: string; detail: string; d: string }>;
  communications: Array<{ channel: string; content: string; risk_level: string; d: string; author: string }>;
  evaluations: Array<{ decision: string; period: string; d: string; by: string }>;
  renewals: Array<{ suggestion: string; package: string; d: string }>;
}

export interface Renewal {
  id: number;
  suggestion: string;
  package: string;
  created_at: string;
  author_name: string;
}

export interface StageReport {
  id: number;
  period: string;
  content: string;
  created_at: string;
  generated_by_name: string;
}

/** 比赛辅导计划项 */
export interface PlanItem {
  seq: number;
  focus: string;
  requirement: string;
  lesson_id: number | null;
  lesson_date: string | null;
  done?: boolean;
}

export interface PlanAdjustment {
  id: number;
  type: 'extra_lesson' | 'change_theme' | 'withdraw';
  note: string;
  created_at: string;
  operator_name: string;
}

export interface Competition {
  id: number;
  student_id: number;
  name: string;
  theme: string;
  deadline: string;
  size_requirement: string;
  status: 'active' | 'completed' | 'withdrawn';
  created_at: string;
  created_by_name: string;
  items: PlanItem[];
  ability_snapshot: { avgs: Record<string, number>; weak: string[] } | null;
  progress: { expected: number; done: number; behind: boolean; percent: number };
  adjustments: PlanAdjustment[];
}
