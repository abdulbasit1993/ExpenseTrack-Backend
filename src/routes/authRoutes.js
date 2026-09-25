import express from "express";

import {
  registerUser,
  loginUser,
  refreshToken,
  logoutUser,
  logoutAll,
  getMe,
} from "../controllers/authController.js";
import {
  requestOTP,
  verifyOTPController,
  resetPassword,
} from "../controllers/passwordResetController.js";
import { protect } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/refresh", refreshToken);
router.post("/logout", protect, logoutUser);
router.post("/logout-all", protect, logoutAll);
router.get("/me", protect, getMe);

// Password Reset / OTP flow routes
router.post("/forgot-password", requestOTP);
router.post("/verify-otp", verifyOTPController);
router.post("/reset-password", resetPassword);

export default router;
