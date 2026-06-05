import { Router } from 'express';
import { collectHandler } from '../../controllers/collect/index.js';
import { collectRateLimit } from '../../middleware/rateLimit.js';

const router = Router();

// POST /api/collect
// 安全边界：CORS 限制来源域 + Rate Limit 防滥写（无 token 鉴权，见 docs/notes.md）
router.post('/', collectRateLimit, collectHandler);

export default router;
