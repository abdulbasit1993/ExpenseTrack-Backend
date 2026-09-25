import crypto from "crypto";
import { getDB } from "../config/db.js";

const COLLECTION = "otpTokens";

// Generate a 6-digit OTP code
export function generateOTP() {
  return crypto.randomInt(0, 1000000).toString().padStart(6, "0");
}

// Hash the OTP code for storage
export function hashOTP(otp) {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

// Store OTP in database for a user
export async function storeOTP(email, otpCode) {
  const db = await getDB();
  const hashedOtp = hashOTP(otpCode);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  return db.collection(COLLECTION).updateOne(
    { email },
    {
      $set: {
        otpHash: hashedOtp,
        otpExpiresAt: expiresAt,
        createdAt: new Date(),
      },
    },
    { upsert: true },
  );
}

// Verify OTP code
export async function verifyOTP(email, otpCode) {
  const db = getDB();
  const collection = db.collection(COLLECTION);

  const record = await collection.findOne({
    email,
    otpHash: hashOTP(otpCode),
    otpExpiresAt: { $gt: new Date() },
  });

  if (!record) {
    return { valid: false, reason: "Invalid or expired OTP" };
  }

  // Optionally delete the OTP record after successful verification
  // await collection.deleteOne({ email });

  return { valid: true, record };
}
