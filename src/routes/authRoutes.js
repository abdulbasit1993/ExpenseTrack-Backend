import express from "express";

import {
  registerUser,
  loginUser,
  refreshToken,
  logoutUser,
  logoutAll,
  getMe,
} from "../controllers/authController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/refresh", refreshToken);
router.post("/logout", protect, logoutUser);
router.post("/logout-all", protect, logoutAll);
router.get("/me", protect, getMe);

export default router;
