import express from "express";

import { protect } from "../middlewares/authMiddleware.js";
import {
  createTransaction,
  getTransactions,
} from "../controllers/transactionController.js";

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

/**
 * @swagger
 * /api/transactions:
 *   get:
 *     summary: Get authenticated user's transactions
 *     tags:
 *       - Transactions
 *     parameters:
 *       - in: query
 *         name: type
 *         example: expense
 *       - in: query
 *         name: categoryId
 *         example: 507f1f77bcf86cd799439011
 *       - in: query
 *         name: fromDate
 *         example: 2026-08-01
 *       - in: query
 *         name: toDate
 *         example: 2026-08-31
 *       - in: query
 *         name: page
 *         example: 1
 *       - in: query
 *         name: limit
 *         example: 20
 *     responses:
 *       200:
 *         description: Transactions retrieved successfully
 *       400:
 *         description: Bad request
 */
router.get("/", getTransactions);

export default router;
