import express from "express";

import {
  registerUser,
  loginUser,
  getMe,
} from "../controllers/authController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     summary: Register a new user
 *     tags:
 *       - Authentication
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             firstName: John
 *             lastName: Doe
 *             email: john_431@example.com
 *             password: password123
 *     responses:
 *       200:
 *         description: User registered successfully
 *       400:
 *         description: Bad request
 */
router.post("/register", registerUser);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: Log in a user
 *     tags:
 *       - Authentication
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           example:
 *             email: john_431@example.com
 *             password: password123
 *     responses:
 *       200:
 *         description: User logged in successfully
 *       401:
 *         description: Unauthorized
 *       400:
 *         description: Bad request
 */
router.post("/login", loginUser);

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get the currently authenticated user's profile
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Authenticated user profile retrieved successfully
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 user:
 *                   _id: 65f2b4c8d5e1a2b3c4d5e6f7
 *                   firstName: John
 *                   lastName: Doe
 *                   email: john@example.com
 *                   monthlyBudget: 50000
 *                   currency: PKR
 *                   profileImage: ""
 *                   createdAt: 2026-02-14T10:00:00.000Z
 *                   updatedAt: 2026-02-14T10:00:00.000Z
 *       401:
 *         description: Missing, invalid, or expired authorization token
 *       404:
 *         description: User not found
 */
router.get("/me", protect, getMe);

export default router;
