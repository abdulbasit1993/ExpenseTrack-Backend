import express from "express";
import { suggestCategory } from "../controllers/aiController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.post("/suggest-category", suggestCategory);

export default router;
