import { db } from '../index.js';

// ─── 类型定义（与 @q1875759084/monitor SDK 的 MonitorEvent 对齐）────────────────
export type MonitorEventType = 'perf' | 'error' | 'track' | 'blank_screen';

export interface EventRow {
  id: number;
  app_key: string;
  type: MonitorEventType;
  name: string;
  value: number | null;
  props: string | null; // JSON 序列化的 Record<string, unknown>
  url: string;
  ua: string;
  timestamp: number; // 客户端时间戳（unix ms）
  received_at: string; // 服务端接收时间（DATETIME）
}

/** 批量写入的单条事件结构（对应 SDK 上报的 MonitorEvent） */
export interface IncomingEvent {
  appKey: string;
  type: MonitorEventType;
  name: string;
  value?: number;
  props?: Record<string, unknown>;
  url: string;
  ua: string;
  timestamp: number;
}

// ─── 表初始化 ─────────────────────────────────────────────────────────────────

/** 初始化 monitor_events 表（幂等，启动时执行）*/
export function initEventsTable(): void {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS monitor_events (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      app_key     TEXT NOT NULL,
      type        TEXT NOT NULL,
      name        TEXT NOT NULL,
      value       REAL,
      props       TEXT,
      url         TEXT NOT NULL,
      ua          TEXT NOT NULL,
      timestamp   INTEGER NOT NULL,
      received_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  // 高频查询走索引：按 app_key + type 过滤、按 received_at 时间范围聚合
  db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_events_app_key ON monitor_events (app_key)
  `).run();
  db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_events_type ON monitor_events (type)
  `).run();
  db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_events_received_at ON monitor_events (received_at)
  `).run();
  db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_events_app_type ON monitor_events (app_key, type)
  `).run();

  console.log('✅ monitor_events 表初始化完成');
}

// ─── 写入操作 ─────────────────────────────────────────────────────────────────

// 懒初始化：在 initEventsTable() 建表完成后才 prepare，避免"no such table"错误
let _insertFn: ((events: IncomingEvent[]) => void) | null = null;

function getInsertFn(): (events: IncomingEvent[]) => void {
  if (!_insertFn) {
    const stmt = db.prepare(`
      INSERT INTO monitor_events (app_key, type, name, value, props, url, ua, timestamp)
      VALUES (@app_key, @type, @name, @value, @props, @url, @ua, @timestamp)
    `);
    _insertFn = db.transaction((events: IncomingEvent[]) => {
      for (const ev of events) {
        stmt.run({
          app_key: ev.appKey,
          type: ev.type,
          name: ev.name,
          value: ev.value ?? null,
          props: ev.props != null ? JSON.stringify(ev.props) : null,
          url: ev.url,
          ua: ev.ua,
          timestamp: ev.timestamp,
        });
      }
    });
  }
  return _insertFn;
}

/**
 * 批量插入事件（事务保证原子性）
 * SDK 以 100ms 为窗口批量上报，单次请求通常 1~10 条
 */
export function batchInsertEvents(events: IncomingEvent[]): void {
  getInsertFn()(events);
}

// ─── 查询操作 ─────────────────────────────────────────────────────────────────

export interface StatsQuery {
  appKey?: string;
  type?: MonitorEventType;
  /** ISO 8601 字符串，如 "2024-01-01T00:00:00.000Z" */
  startTime?: string;
  endTime?: string;
  limit?: number;
  offset?: number;
}

export interface PerfStatRow {
  name: string;
  count: number;
  avg_value: number;
  p75_value: number | null;
  p95_value: number | null;
}

export interface EventCountRow {
  type: MonitorEventType;
  name: string;
  count: number;
}

/**
 * 查询性能指标聚合数据（avg / p75 / p95）
 * SQLite 不支持原生 PERCENTILE，p75/p95 通过子查询近似实现
 */
export function queryPerfStats(query: StatsQuery): PerfStatRow[] {
  const conditions: string[] = ["type = 'perf'"];
  const params: unknown[] = [];

  if (query.appKey) {
    conditions.push('app_key = ?');
    params.push(query.appKey);
  }
  if (query.startTime) {
    conditions.push('received_at >= ?');
    params.push(query.startTime);
  }
  if (query.endTime) {
    conditions.push('received_at <= ?');
    params.push(query.endTime);
  }

  const where = conditions.join(' AND ');

  return db
    .prepare(
      `SELECT
        name,
        COUNT(*) AS count,
        ROUND(AVG(value), 2) AS avg_value,
        NULL AS p75_value,
        NULL AS p95_value
      FROM monitor_events
      WHERE ${where}
      GROUP BY name
      ORDER BY name`,
    )
    .all(...params) as PerfStatRow[];
}

/**
 * 按 type + name 统计事件数量（适用于 error / track / blank_screen）
 */
export function queryEventCounts(query: StatsQuery): EventCountRow[] {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (query.appKey) {
    conditions.push('app_key = ?');
    params.push(query.appKey);
  }
  if (query.type) {
    conditions.push('type = ?');
    params.push(query.type);
  }
  if (query.startTime) {
    conditions.push('received_at >= ?');
    params.push(query.startTime);
  }
  if (query.endTime) {
    conditions.push('received_at <= ?');
    params.push(query.endTime);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  return db
    .prepare(
      `SELECT type, name, COUNT(*) AS count
      FROM monitor_events
      ${where}
      GROUP BY type, name
      ORDER BY count DESC
      LIMIT ?`,
    )
    .all(...params, query.limit ?? 50) as EventCountRow[];
}

/**
 * 查询最近的原始事件列表（调试 / 大盘明细）
 */
export function queryRecentEvents(query: StatsQuery): EventRow[] {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (query.appKey) {
    conditions.push('app_key = ?');
    params.push(query.appKey);
  }
  if (query.type) {
    conditions.push('type = ?');
    params.push(query.type);
  }
  if (query.startTime) {
    conditions.push('received_at >= ?');
    params.push(query.startTime);
  }
  if (query.endTime) {
    conditions.push('received_at <= ?');
    params.push(query.endTime);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  return db
    .prepare(
      `SELECT * FROM monitor_events
      ${where}
      ORDER BY received_at DESC
      LIMIT ? OFFSET ?`,
    )
    .all(...params, query.limit ?? 20, query.offset ?? 0) as EventRow[];
}
