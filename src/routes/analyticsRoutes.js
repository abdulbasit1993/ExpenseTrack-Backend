import express from "express";
import { protect } from "../middlewares/authMiddleware.js";
import { getAnalytics } from "../controllers/analyticsController.js";

const router = express.Router();

router.use(protect);

router.get("/", getAnalytics);

export default router;
