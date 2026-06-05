import { Request, Response } from 'express';
import { collectEvents } from '../../services/events/index.js';
import { success, fail } from '../../utils/response.js';

/**
 * POST /api/collect
 *
 * 接收 SDK 批量上报的事件数组。
 * 请求体：{ events: MonitorEvent[] }
 * 响应：{ code: 200, data: { accepted: number, rejected: number } }
 *
 * 设计要点：
 * - 无论部分事件非法，只要有合法数据就 200 返回，并报告 rejected 数量
 * - 上报失败不应影响业务，前端 SDK 对本接口的错误静默处理
 * - 不做幂等去重：监控数据允许少量重复（重试场景），聚合查询时数量偏差可接受
 */
export function collectHandler(req: Request, res: Response): void {
  const { events } = req.body as { events?: unknown };

  if (!Array.isArray(events) || events.length === 0) {
    fail(res, 400, 'events 字段缺失或为空数组');
    return;
  }

  const result = collectEvents(events);
  success(res, result);
}
