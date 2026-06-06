import 'dotenv/config'; // 本地开发从 .env 加载环境变量；生产由 Docker Compose 注入，此行无副作用
import express, { Request, Response } from 'express';
import cors from 'cors';
import { initEventsTable } from './database/events/index.js';
import routes from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';

// ─── 数据库初始化（幂等）───────────────────────────────────────────────────────
initEventsTable();

// ─── Express 应用 ─────────────────────────────────────────────────────────────
const app = express();
const port = Number(process.env.PORT) || 3100;

// CORS：允许所有来源
//
// monitor-backend 主要调用路径是：
//   业务前端 → 同域 nginx → proxy_pass → monitor-backend
// nginx 反代是服务端到服务端的请求，不经过浏览器，CORS 头对这条链路无效。
//
// 即使浏览器直连 monitor-backend（如本地开发调试），上报接口也无鉴权、
// 写入的是上报数据而非读取敏感信息——CORS 限制在此无实际安全价值。
//
// 真正有意义的防护是 rate limiting（已有）+ appKey 标识来源（已有）。
// 若未来增加数据查询接口（大盘 API），届时可针对该路由单独收紧 CORS 策略。
app.use(cors({ credentials: false }));

app.use(express.json({ limit: '1mb' })); // 单次上报最大 1MB，防止超大请求打穿内存
// 监控后端不需要 XSS 中间件：
// 1. 数据必须保留原始值（错误堆栈、URL 等不能被转义，否则失真）
// 2. 服务端无 HTML 渲染，数据只写 SQLite 再以 JSON 返回，不存在 XSS 攻击面

// ─── 路由 ─────────────────────────────────────────────────────────────────────
app.use('/monitor', routes);

// 健康检查（容器编排 / 负载均衡探活用）
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 兜底
app.get('/', (_req: Request, res: Response) => {
  res.send(new Date().toISOString());
});

// ─── 全局错误处理（必须在所有路由之后注册）────────────────────────────────────
app.use(errorHandler);

// ─── 启动 ─────────────────────────────────────────────────────────────────────
app.listen(port, () => {
  console.log(`✅ monitor-backend running at http://localhost:${port}`);
});
