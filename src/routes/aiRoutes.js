import express from "express";
import {
  suggestCategory,
  getInsights,
  getMonthlySummary,
} from "../controllers/aiController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.post("/suggest-category", suggestCategory);
router.get("/insights", getInsights);
router.get("/monthly-summary", getMonthlySummary);

export default router;
