import express from "express";
import { getPlatformFeatures } from "../services/platform-features.service.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    res.set('Cache-Control','no-store').json(await getPlatformFeatures());
  } catch (error) {
    console.error("GET /api/features error:", error);
    res.status(503).json({ message: "Не удалось загрузить доступность разделов" });
  }
});

export default router;
