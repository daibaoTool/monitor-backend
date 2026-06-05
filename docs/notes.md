# 学习笔记

## 监控上报接口的鉴权设计

### 问题背景

监控后端提供 `POST /api/collect` 接口，接收前端 SDK 批量上报的性能、错误、行为埋点数据。

在最初设计时，考虑过用一个预共享 Token 来保护这个接口：

```
# .env
COLLECT_TOKEN=your-random-secret

# SDK 上报时携带
Authorization: Bearer your-random-secret
```

但这个方案被否定了。

---

### 为什么 token 鉴权对前端上报接口无效

前端代码最终会被打包进 `bundle.js` 并部署到 CDN，任何人打开 DevTools → Sources 就能看到完整的源码。

无论 token 藏得多深（写在 SDK 参数里、写在 `utils/monitor.ts` 里、还是写在环境变量注入的常量里），它都会以明文出现在 bundle 里。**前端 bundle 是公开的，这是浏览器环境的本质限制。**

所以在前端代码里放 token 来做写入鉴权，安全性等同于零。

---

### 企业级方案：Sentry / 阿里 ARMS / 字节 RUM 的做法

这些大厂监控平台都遵循同一套设计原则：

**上报接口对写入开放，安全边界放在读侧。**

以 Sentry 为例：

```ts
Sentry.init({
  dsn: 'https://abc123@o123.ingest.sentry.io/456',
})
```

`abc123` 是 `public_key`，Sentry 官方文档明确写明：**DSN 是可以公开的，不是 secret**。它只用来标记数据归属（对应哪个项目），不做身份鉴权。

Sentry 的安全边界是：**谁能读数据**（需要登录 Sentry 账号）。而不是**谁能写数据**。

---

### 本项目的实现方案

**第一道：CORS 白名单**（限制请求来源域）

```
CORS_ORIGIN=https://video-to-audio.com,https://security-quiz.com
```

浏览器发起的跨域请求必须通过 CORS 预检。只有白名单内的域名才能成功上报。
可以挡住：其他网站页面伪造上报。
挡不住：curl 直接调（但量级有限，配合 Rate Limit 兜底）。

**第二道：Rate Limit**（限制写入频率）

```
单 IP 每分钟最多 120 次请求（2x 正常 SDK 上报频率）
超限返回 429
```

防止恶意刷量把磁盘打满。实现见 `src/middleware/rateLimit.ts`。

**不加第三道（token）**，因为它防不住任何实质威胁，只是增加 SDK 接入方的配置复杂度。

---

### 上报接口为什么也不需要 XSS 防护

和 token 类似，这也是一个「在错误位置加防护」的反模式。

XSS 的攻击面是：**把用户可控的字符串渲染成 HTML**。监控后端没有 HTML 渲染，数据只写入 SQLite、再以 JSON 形式返回，不存在这个攻击面。

更重要的是：**监控数据必须保留原始值**。错误堆栈、URL、UserAgent 被 XSS 过滤清洗后会失真，调查线上问题时完全误导判断。

业务后端（video-to-audio-backend 等）加 XSS 中间件是合理的，因为它们处理用户输入、数据最终可能渲染到页面。监控后端的上下文不同，规则也不同。

---

### 小结

| 防护手段 | 是否采用 | 原因 |
|---|---|---|
| COLLECT_TOKEN（预共享 token） | ❌ 移除 | 前端 bundle 公开，token 明文可见，无意义 |
| XSS 中间件 | ❌ 移除 | 无 HTML 渲染，且会污染原始监控数据 |
| CORS 白名单 | ✅ 保留 | 限制浏览器跨域请求来源，成本低、有效 |
| Rate Limit | ✅ 新增 | 防止恶意刷量，保护磁盘和数据库 |
| 读侧登录鉴权 | 📌 待实现 | `/api/stats` 查询接口应加登录校验（当前大盘功能尚未开发） |

---

## 多环境数据隔离设计

### 问题：dev / production 二元分档不够用

最初的实现只做了两档：

```ts
// video-to-audio/src/utils/monitor.ts
env: isDev ? 'development' : 'production',
reportUrl: '/api/monitor/collect', // 所有非 dev 环境都打到同一个地址
```

这导致联调环境、测试环境的数据混进了生产数据，污染监控大盘。

### 正确设计：env 控制「要不要报」，reportUrl 控制「报到哪」

SDK 的 `MonitorConfig` 已经设计了三个环境值：`'development' | 'staging' | 'production'`，注释里也说明了「数据隔离由 reportUrl 负责」。这个设计是对的，需要在业务薄封装层落实：

```ts
declare const __DEPLOY_ENV__: string; // 'dev' | 'staging' | 'production'

export function initMonitor() {
  const envMap = {
    dev:        'development',
    staging:    'staging',
    production: 'production',
  };
  const reportUrlMap = {
    dev:        '/api/monitor/collect',                    // webpack proxy 转本地
    staging:    'https://monitor-stg.xxx.com/api/collect', // staging monitor-backend
    production: 'https://monitor.xxx.com/api/collect',     // production monitor-backend
  };

  init({
    appKey: 'video-to-audio',
    env:       envMap[__DEPLOY_ENV__]       ?? 'production',
    reportUrl: reportUrlMap[__DEPLOY_ENV__] ?? reportUrlMap.production,
    debug: __DEPLOY_ENV__ === 'dev',
  });
}
```

**关键原则**：两个维度正交，互不干扰。

| 维度 | 字段 | 作用 |
|---|---|---|
| 要不要上报 | `env` | `development` 时跳过上报，仅 console 打印 |
| 上报到哪里 | `reportUrl` | 指向对应环境的 monitor-backend 实例 |

---

## SQLite 嵌入式数据库与多环境隔离

### SQLite 的进程模型

SQLite 是**进程内嵌入式数据库**，数据库文件由 Node.js 进程直接持有，没有独立的数据库服务进程。

```
staging 服务器
  └── node dist/app.js  （进程 A）
        └── /app/database/monitor.sqlite3  ← staging 数据

production 服务器
  └── node dist/app.js  （进程 B）
        └── /app/database/monitor.sqlite3  ← production 数据
```

两个进程、两个文件，物理上就是两份独立的 SQLite 文件。**数据天然隔离，不需要任何额外配置。**

### 与 MySQL / PostgreSQL 的对比

| | SQLite | MySQL / PostgreSQL |
|---|---|---|
| 进程模型 | 嵌入在应用进程里 | 独立服务进程 |
| 数据文件 | 跟随应用部署 | 独立于应用 |
| 多环境隔离 | 天然隔离（不同进程 → 不同文件） | 需要手动建不同的 database/schema |
| 连接方式 | 直接读写文件，无网络开销 | TCP 连接 |

用 MySQL 时，同一个数据库服务器上需要手动建 `monitor_staging` 和 `monitor_production` 两个 database，或者部署两个独立的 MySQL 实例。SQLite 直接省掉了这一步。

### 整条链路

```
前端 SDK（reportUrl 区分环境）
    ↓
nginx 反向代理（域名/路径 → 不同端口）
    ↓
不同端口的 Node 进程（staging:3101 / production:3100）
    ↓
各自持有的 SQLite 文件
```

monitor-backend 本身**不需要感知当前是哪个环境**，它只管接收请求、写入本地文件。环境隔离完全由部署拓扑（不同服务器/容器）保证。
