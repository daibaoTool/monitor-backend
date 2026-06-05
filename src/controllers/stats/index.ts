import { Request, Response } from 'express';
import { getStats, getRecentEvents } from '../../services/events/index.js';
import { success, fail } from '../../utils/response.js';
import type { StatsQuery } from '../../database/events/index.js';
import { isValidAppKey } from '../../utils/validate.js';

/**
 * 从 query string 解析通用过滤参数
 * 所有字段均可选，缺省时查全量
 */
function parseStatsQuery(query: Request['query']): StatsQuery {
  const result: StatsQuery = {};

  if (typeof query.appKey === 'string' && query.appKey) {
    result.appKey = query.appKey;
  }
  if (typeof query.type === 'string' && query.type) {
    result.type = query.type as StatsQuery['type'];
  }
  if (typeof query.startTime === 'string' && query.startTime) {
    result.startTime = query.startTime;
  }
  if (typeof query.endTime === 'string' && query.endTime) {
    result.endTime = query.endTime;
  }
  if (typeof query.limit === 'string' && query.limit) {
    const n = parseInt(query.limit, 10);
    result.limit = isNaN(n) ? 20 : Math.min(n, 500);
  }
  if (typeof query.offset === 'string' && query.offset) {
    const n = parseInt(query.offset, 10);
    result.offset = isNaN(n) ? 0 : n;
  }

  return result;
}

/**
 * GET /api/stats
 *
 * 返回聚合统计数据：性能指标均值 + 各类型事件计数
 * query params: appKey?, type?, startTime?, endTime?
 */
export function statsHandler(req: Request, res: Response): void {
  if (req.query.appKey && !isValidAppKey(req.query.appKey as string)) {
    fail(res, 400, 'appKey 格式非法');
    return;
  }

  const query = parseStatsQuery(req.query);
  const result = getStats(query);
  success(res, result);
}

/**
 * GET /api/stats/events
 *
 * 返回最近原始事件列表，供调试 / 大盘明细展示
 * query params: appKey?, type?, startTime?, endTime?, limit?, offset?
 */
export function recentEventsHandler(req: Request, res: Response): void {
  if (req.query.appKey && !isValidAppKey(req.query.appKey as string)) {
    fail(res, 400, 'appKey 格式非法');
    return;
  }

  const query = parseStatsQuery(req.query);
  const events = getRecentEvents(query);
  success(res, events);
}
