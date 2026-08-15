import express from "express";

import { protect } from "../middlewares/authMiddleware.js";
import {
  createTransaction,
  getTransactions,
  getTransactionById,
  updateTransaction,
  deleteTransaction,
} from "../controllers/transactionController.js";

const router = express.Router();

router.use(protect);

router.post("/add", createTransaction);

router.get("/", getTransactions);

router.get("/:id", getTransactionById);

router.put("/:id", updateTransaction);

router.delete("/:id", deleteTransaction);

export default router;
