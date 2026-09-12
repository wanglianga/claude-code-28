import { Request, Response, NextFunction } from 'express';
import { query } from './db';
import { newToken, verifyPassword } from './util';

export interface AuthedUser {
  id: number;
  username: string;
  role: 'teacher' | 'supervisor' | 'parent';
  name: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const { username, password } = req.body || {};
  if (!username || !password) {
    res.status(400).json({ error: '请输入用户名和密码' });
    return;
  }
  const { rows } = await query(
    'SELECT id, username, role, name, password_hash FROM users WHERE username = $1',
    [username]);
  const user = rows[0];
  if (!user || !verifyPassword(password, user.password_hash)) {
    res.status(401).json({ error: '用户名或密码错误' });
    return;
  }
  const token = newToken();
  await query(
    `INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, now() + interval '7 days')`,
    [token, user.id]);
  res.json({ token, user: { id: user.id, username: user.username, role: user.role, name: user.name } });
}

/** 鉴权中间件：Authorization: Bearer <token> */
export async function authed(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: '未登录' });
    return;
  }
  const { rows } = await query(
    `SELECT u.id, u.username, u.role, u.name FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = $1 AND s.expires_at > now()`,
    [token]);
  if (!rows[0]) {
    res.status(401).json({ error: '登录已过期，请重新登录' });
    return;
  }
  req.user = rows[0] as AuthedUser;
  next();
}

export function requireRole(...roles: Array<AuthedUser['role']>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: '没有权限执行此操作' });
      return;
    }
    next();
  };
}

export async function logoutHandler(req: Request, res: Response): Promise<void> {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (token) await query('DELETE FROM sessions WHERE token = $1', [token]);
  res.json({ ok: true });
}

/** 学生可见性：家长=自己的孩子；老师=自己班级的学生；主管=全部 */
export async function canViewStudent(user: AuthedUser, studentId: number): Promise<boolean> {
  if (user.role === 'supervisor') return true;
  if (user.role === 'parent') {
    const { rows } = await query('SELECT 1 FROM students WHERE id=$1 AND parent_id=$2', [studentId, user.id]);
    return rows.length > 0;
  }
  const { rows } = await query(
    `SELECT 1 FROM students s JOIN classes c ON c.id = s.class_id
     WHERE s.id=$1 AND (c.teacher_id=$2 OR s.teacher_id=$2)`, [studentId, user.id]);
  return rows.length > 0;
}

export async function canTeachStudent(user: AuthedUser, studentId: number): Promise<boolean> {
  if (user.role === 'supervisor') return true;
  if (user.role !== 'teacher') return false;
  const { rows } = await query(
    `SELECT 1 FROM students s JOIN classes c ON c.id = s.class_id
     WHERE s.id=$1 AND (c.teacher_id=$2 OR s.teacher_id=$2)`, [studentId, user.id]);
  return rows.length > 0;
}
