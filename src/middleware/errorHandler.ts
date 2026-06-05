import { Request, Response, NextFunction } from 'express';

/**
 * 全局兜底错误处理中间件
 * 必须作为最后一个 app.use() 注册，且参数必须是四个（Express 以此识别错误中间件）
 */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  console.error('[errorHandler]', err);
  res.status(500).json({
    code: 500,
    message: '服务器内部错误',
    data: null,
  });
}
