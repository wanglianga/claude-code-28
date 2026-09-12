import express from 'express';
import path from 'path';
import fs from 'fs';
import { initSchema, waitForDb } from './db';
import { seedIfEmpty, UPLOAD_DIR } from './seed';
import { loginHandler, logoutHandler, authed } from './auth';
import { h } from './hwrap';
import { studentsRouter } from './routes/students';
import { classesRouter } from './routes/classes';
import { questionsRouter } from './routes/questions';
import { supervisorRouter } from './routes/supervisor';
import { competitionsRouter } from './routes/competitions';
import { DIMENSIONS, QUESTION_TYPES, EVENT_TYPES, DECISIONS, WILLINGNESS, COOPERATION, RISK_LEVELS, ABILITY_TAGS, ADJUSTMENT_TYPES, COMPETITION_STATUS } from './domain';

const app = express();
app.use(express.json({ limit: '12mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'artclass', time: new Date().toISOString() });
});

app.post('/api/auth/login', h(loginHandler));
app.post('/api/auth/logout', h(authed), h(logoutHandler));
app.get('/api/auth/me', h(authed), (req, res) => res.json({ user: req.user }));

app.get('/api/meta', authed, (_req, res) => {
  res.json({
    dimensions: DIMENSIONS,
    questionTypes: QUESTION_TYPES,
    eventTypes: EVENT_TYPES,
    decisions: DECISIONS,
    willingness: WILLINGNESS,
    cooperation: COOPERATION,
    riskLevels: RISK_LEVELS,
    abilityTags: ABILITY_TAGS,
    adjustmentTypes: ADJUSTMENT_TYPES,
    competitionStatus: COMPETITION_STATUS,
  });
});

app.use('/api/students', studentsRouter);
app.use('/api/classes', classesRouter);
app.use('/api/questions', questionsRouter);
app.use('/api/supervisor', supervisorRouter);
app.use('/api', competitionsRouter);

// 作品图片
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));

// 前端静态资源（生产模式：vite build 产物）
const PUBLIC_DIR = process.env.PUBLIC_DIR || path.join(process.cwd(), 'public');
if (fs.existsSync(PUBLIC_DIR)) {
  app.use(express.static(PUBLIC_DIR));
  app.get(/^(?!\/api|\/uploads).*/, (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });
}

// 统一错误处理
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('服务器错误:', err);
  res.status(500).json({ error: '服务器内部错误' });
});

const PORT = parseInt(process.env.PORT || '3000', 10);

async function main() {
  await waitForDb();
  await initSchema();
  await seedIfEmpty();
  app.listen(PORT, () => {
    console.log(`美术培训班点评与升班评估系统已启动: http://0.0.0.0:${PORT}`);
  });
}

main().catch((err) => {
  console.error('启动失败:', err);
  process.exit(1);
});
