import crypto from 'crypto';

/** scrypt 密码哈希，格式: scrypt$N$salt$hash（hex），避免引入原生依赖 */
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const N = 16384;
  const hash = crypto.scryptSync(password, salt, 64, { N }).toString('hex');
  return `scrypt$${N}$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [scheme, nStr, salt, hash] = stored.split('$');
    if (scheme !== 'scrypt') return false;
    const N = parseInt(nStr, 10);
    const calc = crypto.scryptSync(password, salt, 64, { N });
    const expect = Buffer.from(hash, 'hex');
    return calc.length === expect.length && crypto.timingSafeEqual(calc, expect);
  } catch {
    return false;
  }
}

export function newToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/** 确定性伪随机数（种子数据可复现） */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
