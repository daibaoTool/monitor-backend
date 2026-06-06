import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// 数据库文件路径：生产通过 Docker Volume 挂载到 /app/database/
// 本地开发存放在项目根目录
const DB_DIR =
  process.env.NODE_ENV === 'production'
    ? '/app/database'
    : path.resolve(process.cwd(), 'database');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const DB_PATH = path.join(DB_DIR, 'monitor.sqlite3');

export const db = new Database(DB_PATH);

// WAL 模式：提升并发读写性能，适合多项目频繁写入的场景
db.pragma('journal_mode = WAL');
// 限制 WAL 文件大小，避免长期运行后日志文件膨胀
db.pragma('wal_autocheckpoint = 1000');

console.log(`✅ SQLite 数据库已连接：${DB_PATH}`);
