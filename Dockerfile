# ==================== 第一阶段：构建 ====================
# 目的：用 TypeScript 编译器将 src/ 编译为 dist/
# 这一阶段包含 devDependencies（tsc、tsx、nodemon 等），体积大
# 最终镜像不会包含这一阶段的任何内容
FROM node:20-alpine AS builder

WORKDIR /app

# better-sqlite3 是原生 addon，需要 node-gyp 编译
# alpine 最小镜像默认不含构建工具链，必须显式安装
RUN apk add --no-cache python3 make g++

# 先复制依赖文件，利用 Docker 层缓存
# package.json 不变时，npm ci 层直接复用，不重新安装
COPY package.json package-lock.json ./
RUN npm ci

# 复制源码并编译
COPY . .
RUN npm run build

# ==================== 第二阶段：运行 ====================
# 目的：只保留 Node.js 运行时 + 编译产物 + 生产依赖
# 不含 TypeScript 编译器、nodemon、tsx 等开发工具
# 镜像体积从 ~600MB → ~150MB，且减少攻击面
FROM node:20-alpine AS runner

WORKDIR /app

# better-sqlite3 生产依赖同样需要原生编译工具链
RUN apk add --no-cache python3 make g++

# 只安装 dependencies（--omit=dev 排除 devDependencies）
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && apk del make g++

# 从构建阶段复制编译产物
COPY --from=builder /app/dist ./dist

# 数据库文件通过 Docker Volume 挂载实现持久化
# 容器内路径：/app/database/monitor.sqlite3
# Compose 配置：volumes: - monitor-db-data:/app/database
VOLUME ["/app/database"]

EXPOSE 3100

# 直接运行编译产物，不依赖 ts-node/tsx 等开发工具
CMD ["node", "dist/app.js"]
