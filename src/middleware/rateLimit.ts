import { rateLimit } from 'express-rate-limit';

/**
 * 上报接口频率限制
 *
 * 设计依据：
 * - SDK 以 100ms 为窗口批量合并上报，正常用户行为下每分钟不超过 60 次
 * - 单次请求最多携带 100 条事件（见 services/events/index.ts MAX_EVENTS_PER_REQUEST）
 * - 限制单 IP 每分钟 120 次（2x 正常频率作为余量），超限 429
 *
 * 为什么不用 token 鉴权而用 Rate Limit：
 * - 前端 bundle 是公开的，任何 token 写入前端都等同于明文暴露，鉴权形同虚设
 * - 安全边界应放在「防止滥用写入」而非「阻止写入」：Rate Limit 防磁盘打满，CORS 限制来源
 * - 这是 Sentry / 阿里 ARMS / 字节 RUM 等企业级监控的通行做法
 */
export const collectRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 分钟窗口
  limit: 120,          // 单 IP 每分钟最多 120 次请求
  standardHeaders: 'draft-7', // 在响应头返回 RateLimit-* 字段，便于客户端感知限制
  legacyHeaders: false,
  message: { code: 429, message: '上报请求过于频繁，请稍后再试', data: null },
  // 跳过本地开发环境的限制，避免影响联调
  skip: () => process.env.NODE_ENV === 'development',
});
