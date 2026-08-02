import express from "express";

import { protect } from "../middlewares/authMiddleware.js";
import { createTransaction } from "../controllers/transactionController.js";

const router = express.Router();

router.use(protect);

/**
 * @swagger
 * /api/transactions/add:
 *   post:
 *     summary: Create a new transaction
 *     tags:
 *       - Transactions
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             categoryId: 507f1f77bcf86cd799439011
 *             type: expense
 *             amount: 2450.5
 *             note: Weekly groceries
 *             date: 2026-08-02
 *     responses:
 *       201:
 *         description: Transaction created successfully
 *       400:
 *         description: Bad request
 *       404:
 *         description: Category not found
 */
router.post("/add", createTransaction);

export default router;
