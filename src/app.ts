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

// CORS 白名单（多域名逗号分隔）
// 未配置时默认空列表（安全默认值），同域 nginx 反代场景无需配置
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
  : [];

app.use(
  cors({
    origin: corsOrigins,
    credentials: false, // 监控上报无需携带 Cookie
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'OPTIONS'],
  }),
);

app.use(express.json({ limit: '1mb' })); // 单次上报最大 1MB，防止超大请求打穿内存
// 监控后端不需要 XSS 中间件：
// 1. 数据必须保留原始值（错误堆栈、URL 等不能被转义，否则失真）
// 2. 服务端无 HTML 渲染，数据只写 SQLite 再以 JSON 返回，不存在 XSS 攻击面

// ─── 路由 ─────────────────────────────────────────────────────────────────────
app.use('/api', routes);

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
