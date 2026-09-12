import { Request, Response, NextFunction, RequestHandler } from 'express';

/** Express 4 不捕获 async 处理器异常，统一包装后交给错误中间件，避免进程崩溃 */
export const h = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
