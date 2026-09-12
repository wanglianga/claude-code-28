import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgres://art:art@localhost:5432/artclass';

export const pool = new Pool({ connectionString: DATABASE_URL, max: 10 });

export async function query<T extends QueryResultRow = any>(
  text: string,
  params: any[] = [],
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

/** 等待数据库就绪（compose 中 db 健康检查之外的双保险） */
export async function waitForDb(retries = 30, delayMs = 1000): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (err) {
      console.log(`等待数据库就绪... (${i + 1}/${retries})`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error('数据库连接失败：超过最大重试次数');
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('teacher','supervisor','parent')),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS classes (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  stage TEXT NOT NULL,          -- 启蒙阶段 / 基础阶段 / 提高阶段
  age_group TEXT NOT NULL,      -- 4-6岁 / 7-9岁 / 10-12岁
  teacher_id INT REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS students (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  gender TEXT NOT NULL DEFAULT '',
  birth_year INT,
  age_group TEXT NOT NULL,
  class_id INT REFERENCES classes(id),
  parent_id INT REFERENCES users(id),
  teacher_id INT REFERENCES users(id),
  enrolled_at DATE,
  child_willingness TEXT NOT NULL DEFAULT '一般',
  willingness_note TEXT NOT NULL DEFAULT '',
  hours_purchased INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS stage_goals (
  id SERIAL PRIMARY KEY,
  age_group TEXT NOT NULL,
  dimension TEXT NOT NULL,
  target_score INT NOT NULL,
  description TEXT NOT NULL,
  UNIQUE (age_group, dimension)
);

CREATE TABLE IF NOT EXISTS lessons (
  id SERIAL PRIMARY KEY,
  class_id INT NOT NULL REFERENCES classes(id),
  teacher_id INT REFERENCES users(id),
  lesson_date DATE NOT NULL,
  theme TEXT NOT NULL,
  stage TEXT NOT NULL,          -- 阶段目标标签，如 造型基础 / 色彩感知
  seq INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS artworks (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES students(id),
  lesson_id INT NOT NULL REFERENCES lessons(id),
  teacher_id INT REFERENCES users(id),
  title TEXT NOT NULL DEFAULT '',
  image_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  artwork_id INT UNIQUE NOT NULL REFERENCES artworks(id) ON DELETE CASCADE,
  student_id INT NOT NULL REFERENCES students(id),
  lesson_id INT NOT NULL REFERENCES lessons(id),
  teacher_id INT REFERENCES users(id),
  composition INT NOT NULL,
  line_score INT NOT NULL,
  color INT NOT NULL,
  observation INT NOT NULL,
  creativity INT NOT NULL,
  focus INT NOT NULL,
  need_home_practice BOOLEAN NOT NULL DEFAULT false,
  home_practice_note TEXT NOT NULL DEFAULT '',
  suggestion TEXT NOT NULL DEFAULT '',
  next_prep TEXT NOT NULL DEFAULT '',
  class_state TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES students(id),
  lesson_id INT NOT NULL REFERENCES lessons(id),
  status TEXT NOT NULL CHECK (status IN ('present','absent','leave','makeup')),
  UNIQUE (student_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS homework (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES students(id),
  lesson_id INT NOT NULL REFERENCES lessons(id),
  assigned BOOLEAN NOT NULL DEFAULT true,
  submitted BOOLEAN NOT NULL DEFAULT false,
  note TEXT NOT NULL DEFAULT '',
  UNIQUE (student_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS questions (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES students(id),
  parent_id INT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending / answered
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS replies (
  id SERIAL PRIMARY KEY,
  question_id INT UNIQUE NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  teacher_id INT NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  evidence_artwork_ids INT[] NOT NULL DEFAULT '{}',
  evidence_tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS evaluations (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES students(id),
  supervisor_id INT NOT NULL REFERENCES users(id),
  period TEXT NOT NULL,
  attendance_rate NUMERIC(5,1) NOT NULL DEFAULT 0,
  homework_rate NUMERIC(5,1) NOT NULL DEFAULT 0,
  teacher_summary TEXT NOT NULL DEFAULT '',
  parent_cooperation TEXT NOT NULL DEFAULT '',
  child_willingness TEXT NOT NULL DEFAULT '',
  goal_comparison JSONB NOT NULL DEFAULT '[]',
  decision TEXT NOT NULL,
  rationale TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES students(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  meta JSONB NOT NULL DEFAULT '{}',
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS communications (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES students(id),
  author_id INT REFERENCES users(id),
  channel TEXT NOT NULL DEFAULT '微信',
  content TEXT NOT NULL DEFAULT '',
  risk_level TEXT NOT NULL DEFAULT 'low',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS renewals (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES students(id),
  author_id INT REFERENCES users(id),
  suggestion TEXT NOT NULL,
  package TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stage_reports (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES students(id),
  period TEXT NOT NULL,
  content TEXT NOT NULL,
  generated_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS competitions (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES students(id),
  name TEXT NOT NULL,
  theme TEXT NOT NULL,
  deadline DATE NOT NULL,
  size_requirement TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',   -- active / completed / withdrawn
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coaching_plans (
  id SERIAL PRIMARY KEY,
  competition_id INT NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  items JSONB NOT NULL DEFAULT '[]',        -- [{seq, focus, requirement, lesson_id, lesson_date}]
  ability_snapshot JSONB NOT NULL DEFAULT '{}',  -- 生成时的六维均分与弱项
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plan_adjustments (
  id SERIAL PRIMARY KEY,
  competition_id INT NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
  type TEXT NOT NULL,                       -- extra_lesson / change_theme / withdraw
  note TEXT NOT NULL DEFAULT '',
  created_by INT REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reviews_student ON reviews(student_id);
CREATE INDEX IF NOT EXISTS idx_artworks_student ON artworks(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_questions_student ON questions(student_id);
CREATE INDEX IF NOT EXISTS idx_events_student ON events(student_id);
`;

export async function initSchema(): Promise<void> {
  await pool.query(SCHEMA);
  // 幂等列升级（兼容已存在的库）
  await pool.query(`
    ALTER TABLE reviews ADD COLUMN IF NOT EXISTS serves_competition BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE reviews ADD COLUMN IF NOT EXISTS competition_req_note TEXT NOT NULL DEFAULT '';
    ALTER TABLE lessons ADD COLUMN IF NOT EXISTS prep_focus TEXT NOT NULL DEFAULT '';
  `);
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
