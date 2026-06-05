import { Router, Request, Response } from 'express';
import collectRouter from './collect/index.js';
import statsRouter from './stats/index.js';

const router = Router();

router.use('/collect', collectRouter);
router.use('/stats', statsRouter);

// 兜底：未匹配到的 /api/* 路由
router.use((_req: Request, res: Response) => {
  res.status(404).json({ code: 404, message: 'API 路径不存在', data: null });
});

export default router;
