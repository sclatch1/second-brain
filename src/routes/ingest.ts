import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/requireAuth.js";
import { ingestFile } from "../services/ingestService.js";

const router: Router = Router();
const upload : multer.Multer = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }); // save files in memory as apps redeploys

router.post("/", requireAuth, upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const result = await ingestFile(req.file.path);
    res.json({ status: "ok", ...result });
  } catch (err) {
    next(err); // hands off to errorHandler middleware
  }
});

export default router;