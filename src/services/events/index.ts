import {
  batchInsertEvents,
  queryPerfStats,
  queryEventCounts,
  queryRecentEvents,
  type IncomingEvent,
  type StatsQuery,
  type PerfStatRow,
  type EventCountRow,
  type EventRow,
} from '../../database/events/index.js';
import { isValidEvent } from '../../utils/validate.js';

// ─── 写入 ──────────────────────────────────────────────────────────────────────

/** 单次批量写入上限，防止超大请求撑爆内存 */
const MAX_EVENTS_PER_REQUEST = 100;

export interface CollectResult {
  accepted: number;
  rejected: number;
}

/**
 * 接收并批量写入上报事件
 * - 过滤非法事件（数据类型错误、缺字段），记录丢弃数量
 * - 超出单次上限的事件截断丢弃
 */
export function collectEvents(rawEvents: unknown[]): CollectResult {
  const valid: IncomingEvent[] = [];
  let rejected = 0;

  for (const ev of rawEvents.slice(0, MAX_EVENTS_PER_REQUEST)) {
    if (isValidEvent(ev)) {
      valid.push(ev);
    } else {
      rejected++;
    }
  }

  // 超出上限的部分统计为 rejected
  rejected += Math.max(0, rawEvents.length - MAX_EVENTS_PER_REQUEST);

  if (valid.length > 0) {
    batchInsertEvents(valid);
  }

  return { accepted: valid.length, rejected };
}

// ─── 查询 ──────────────────────────────────────────────────────────────────────

export interface StatsResult {
  perf: PerfStatRow[];
  counts: EventCountRow[];
}

/**
 * 查询聚合统计数据：性能指标均值 + 各类型事件计数
 */
export function getStats(query: StatsQuery): StatsResult {
  const perf = queryPerfStats(query);
  const counts = queryEventCounts(query);
  return { perf, counts };
}

/**
 * 查询最近原始事件列表（调试 / 大盘明细）
 */
export function getRecentEvents(query: StatsQuery): EventRow[] {
  return queryRecentEvents(query);
}
