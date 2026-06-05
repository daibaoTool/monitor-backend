import type { IncomingEvent } from '../database/events/index.js';

const VALID_TYPES = new Set(['perf', 'error', 'track', 'blank_screen']);

/**
 * 校验单条上报事件是否合法
 * 返回 true 表示合法，false 表示丢弃（不抛异常，批量时跳过脏数据）
 */
export function isValidEvent(ev: unknown): ev is IncomingEvent {
  if (!ev || typeof ev !== 'object') return false;
  const e = ev as Record<string, unknown>;

  if (typeof e.appKey !== 'string' || e.appKey.trim() === '') return false;
  if (!VALID_TYPES.has(e.type as string)) return false;
  if (typeof e.name !== 'string' || e.name.trim() === '') return false;
  if (typeof e.url !== 'string' || e.url.trim() === '') return false;
  if (typeof e.ua !== 'string') return false;
  if (typeof e.timestamp !== 'number' || !Number.isFinite(e.timestamp)) return false;

  // value 可选，有则必须是有限数字
  if (e.value !== undefined && (typeof e.value !== 'number' || !Number.isFinite(e.value))) {
    return false;
  }

  // props 可选，有则必须是普通对象
  if (e.props !== undefined && (typeof e.props !== 'object' || Array.isArray(e.props) || e.props === null)) {
    return false;
  }

  return true;
}

/**
 * 校验 appKey 格式（仅允许字母、数字、连字符、下划线，最长 64 位）
 * 防止脏数据污染索引 / 统计维度
 */
export function isValidAppKey(appKey: string): boolean {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(appKey);
}
