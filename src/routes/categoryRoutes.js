import express from "express";

import { protect } from "../middlewares/authMiddleware.js";
import {
  createCategory,
  deleteCategory,
  getCategories,
  getCategoryById,
  updateCategory,
} from "../controllers/categoryController.js";

const router = express.Router();

router.use(protect);

router.post("/add", createCategory);

router.get("/", getCategories);

router.get("/:id", getCategoryById);

router.put("/:id", updateCategory);

router.delete("/:id", deleteCategory);

export default router;
