import { Response } from 'express';

/** 统一成功响应 */
export function success(res: Response, data?: unknown, message = '操作成功'): void {
  res.json({ code: 200, message, data: data ?? null });
}

/** 统一失败响应 */
export function fail(res: Response, code: number, message: string): void {
  res.json({ code, message, data: null });
}
