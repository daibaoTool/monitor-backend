import { Router } from 'express';
import { statsHandler, recentEventsHandler } from '../../controllers/stats/index.js';

const router = Router();

// GET /api/stats            → 聚合统计（性能均值 + 事件计数）
router.get('/', statsHandler);

// GET /api/stats/events     → 最近原始事件列表
router.get('/events', recentEventsHandler);

export default router;
