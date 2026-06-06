import type { IncomingEvent } from '../database/events/index.js';

const VALID_TYPES = new Set(['perf', 'error', 'track', 'blank_screen']);

// ─── 字段长度上限 ──────────────────────────────────────────────────────────────
//
// 目的：防止超长字符串字段绕过请求体大小限制（express.json limit: '1mb'），
// 把大量垃圾数据写入 SQLite。
//
// 设计原则：
// - 不对字段值做 HTML 转义——监控数据必须保留原始值（错误堆栈、URL 等）
// - 只截断长度，不修改内容——超长则丢弃整条事件（rejected），不截断后写入
//   （截断后的错误堆栈失去定位价值，存入也是脏数据）
// - 长度参考实际业务数据，留足余量
//
const LIMITS = {
  appKey: 64,       // 与 isValidAppKey 正则上限对齐
  name: 512,        // 事件名：指标名 / 错误消息，正常不超过 200 字符，留 2x 余量
  url: 2048,        // URL 上限：RFC 建议 2000，留余量
  ua: 512,          // User-Agent 字符串，现代浏览器通常 < 300 字符
  propsJson: 4096,  // props 序列化后的 JSON 字符串，错误 componentStack 可能较长
};

/**
 * 校验单条上报事件是否合法
 * 返回 true 表示合法，false 表示丢弃（不抛异常，批量时跳过脏数据）
 */
export function isValidEvent(ev: unknown): ev is IncomingEvent {
  if (!ev || typeof ev !== 'object') return false;
  const e = ev as Record<string, unknown>;

  if (typeof e.appKey !== 'string' || e.appKey.trim() === '') return false;
  if (e.appKey.length > LIMITS.appKey) return false;

  if (!VALID_TYPES.has(e.type as string)) return false;

  if (typeof e.name !== 'string' || e.name.trim() === '') return false;
  if (e.name.length > LIMITS.name) return false;

  if (typeof e.url !== 'string' || e.url.trim() === '') return false;
  if (e.url.length > LIMITS.url) return false;

  if (typeof e.ua !== 'string') return false;
  if (e.ua.length > LIMITS.ua) return false;

  if (typeof e.timestamp !== 'number' || !Number.isFinite(e.timestamp)) return false;

  // value 可选，有则必须是有限数字
  if (e.value !== undefined && (typeof e.value !== 'number' || !Number.isFinite(e.value))) {
    return false;
  }

  // props 可选，有则必须是普通对象，且序列化后不超过长度上限
  if (e.props !== undefined) {
    if (typeof e.props !== 'object' || Array.isArray(e.props) || e.props === null) {
      return false;
    }
    if (JSON.stringify(e.props).length > LIMITS.propsJson) return false;
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
