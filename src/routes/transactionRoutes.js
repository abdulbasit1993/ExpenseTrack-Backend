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
 *             title: Weekly groceries
 *             description: Groceries for the week
 *             categoryId: 507f1f77bcf86cd799439011
 *             type: expense
 *             amount: 2450.5
 *             date: 2026-08-02
 *     responses:
 *       201:
 *         description: Transaction created successfully
 *       400:
 *         description: Bad request
 *       404:
 *         description: Active category not found
 *       500:
 *         description: Internal server error
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
 *         schema:
 *           type: string
 *           enum: [income, expense]
 *         example: expense
 *       - in: query
 *         name: categoryId
 *         schema:
 *           type: string
 *         example: 507f1f77bcf86cd799439011
 *       - in: query
 *         name: fromDate
 *         description: Include transactions dated on or after this value.
 *         schema:
 *           type: string
 *           format: date
 *         example: 2026-08-01
 *       - in: query
 *         name: toDate
 *         description: Include transactions dated on or before this value.
 *         schema:
 *           type: string
 *           format: date
 *         example: 2026-08-31
 *       - in: query
 *         name: page
 *         description: Positive page number. Defaults to 1.
 *         schema:
 *           type: integer
 *           minimum: 1
 *         example: 1
 *       - in: query
 *         name: limit
 *         description: Results per page. Defaults to 20; maximum is 100.
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *         example: 20
 *     responses:
 *       200:
 *         description: Transactions retrieved successfully
 *       400:
 *         description: Invalid pagination, type, category ID, or date filter
 *       500:
 *         description: Internal server error
 */
router.get("/", getTransactions);

/**
 * @swagger
 * /api/transactions/{id}:
 *   get:
 *     summary: Get a transaction by ID
 *     tags:
 *       - Transactions
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: Transaction retrieved successfully
 *       400:
 *         description: Invalid transaction ID
 *       404:
 *         description: Transaction not found
 *       500:
 *         description: Internal server error
 */
router.get("/:id", getTransactionById);

/**
 * @swagger
 * /api/transactions/{id}:
 *   put:
 *     summary: Update a transaction
 *     tags:
 *       - Transactions
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         example: 507f1f77bcf86cd799439011
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             title: Weekly groceries
 *             description: Groceries for the week
 *             categoryId: 507f1f77bcf86cd799439011
 *             type: expense
 *             amount: 3000
 *             date: 2026-08-03
 *     responses:
 *       200:
 *         description: Transaction updated successfully
 *       400:
 *         description: Invalid transaction ID, update payload, or category/type combination
 *       404:
 *         description: Transaction or active category not found
 *       500:
 *         description: Internal server error
 */
router.put("/:id", updateTransaction);

/**
 * @swagger
 * /api/transactions/{id}:
 *   delete:
 *     summary: Delete a transaction
 *     tags:
 *       - Transactions
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         example: 507f1f77bcf86cd799439011
 *     responses:
 *       200:
 *         description: Transaction deleted successfully
 *       400:
 *         description: Invalid transaction ID
 *       404:
 *         description: Transaction not found
 *       500:
 *         description: Internal server error
 */
router.delete("/:id", deleteTransaction);

export default router;
