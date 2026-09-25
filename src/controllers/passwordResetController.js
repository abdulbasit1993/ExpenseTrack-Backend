import dotenv from "dotenv";
dotenv.config();
import bcrypt from "bcrypt";
import { sendResetPasswordEmail } from "../utils/email.js";
import { verifyOTP, storeOTP, generateOTP } from "../utils/otpUtils.js";
import { getDB } from "../config/db.js";

export async function requestOTP(req, res) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const db = getDB();
    const users = db.collection("users");

    const user = await users.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      return res.status(200).json({
        success: true,
        message: "If an account with that email exists, an OTP has been sent.",
      });
    }

    const otpCode = generateOTP();

    await storeOTP(email.toLowerCase().trim(), otpCode);

    await sendResetPasswordEmail(email, otpCode);

    return res.status(200).json({
      success: true,
      message: "OTP sent to email successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

export async function verifyOTPController(req, res) {
  try {
    const { email, otpCode } = req.body;

    if (!email || !otpCode) {
      return res.status(400).json({
        success: false,
        message: "Email and OTP Code are required",
      });
    }

    const result = await verifyOTP(email, otpCode);

    if (!result.valid) {
      return res.status(400).json({
        success: false,
        message: result.reason || "Invalid OTP",
      });
    }

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully. You can now reset your password.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

export async function resetPassword(req, res) {
  try {
    const { email, otpCode, newPassword } = req.body;

    if (!email || !otpCode || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Email, OTP code, and new password are required",
      });
    }

    // Verify OTP is still valid
    const result = await verifyOTP(email, otpCode);

    if (!result.valid) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    const db = getDB();
    const users = db.collection("users");

    const user = await users.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Hash new password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update user password
    await users.updateOne(
      { email: email.toLowerCase().trim() },
      { $set: { password: hashedPassword } },
    );

    // Optional: Delete OTP record after use
    // await db.collection("otpTokens").deleteOne({ email: email.toLowerCase().trim() });

    return res.status(200).json({
      success: true,
      message:
        "Password reset successfully. You can now log in with your new password.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}
