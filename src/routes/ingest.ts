import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/requireAuth.js';
import { ingestBuffer } from '../services/ingestService.js';

export const ingestRouter: Router = Router();

const upload: multer.Multer = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
}); // save files in memory as apps redeploys

ingestRouter.post(
  '/',
  requireAuth,
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      const result = await ingestBuffer(req.file.originalname, req.file.buffer);
      res.json({ status: 'ok', ...result });
    } catch (err) {
      next(err); // hands off to errorHandler middleware
    }
  }
);
