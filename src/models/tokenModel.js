import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import crypto from "crypto";

const COLLECTION = "tokens";

export function storeRefreshToken({
  userId,
  tokenHash,
  expiresAt,
  fingerprint,
}) {
  const db = getDB();
  return db.collection(COLLECTION).insertOne({
    userId,
    tokenHash,
    expiresAt,
    fingerprint,
    revoked: false,
    createdAt: new Date(),
  });
}

export async function findValidToken(tokenHash) {
  const db = getDB();
  return db.collection(COLLECTION).findOne({
    tokenHash,
    revoked: false,
    expiresAt: { $gt: new Date() },
  });
}

export async function revokeToken(tokenHash) {
  const db = getDB();
  await db
    .collection(COLLECTION)
    .updateOne({ tokenHash }, { $set: { revoked: true } });
}

export async function revokeAllUserTokens(userId) {
  const db = getDB();
  await db
    .collection(COLLECTION)
    .updateMany({ userId, revoked: false }, { $set: { revoked: true } });
}

export async function revokeAllUserTokensExcept(userId, excludeTokenHash) {
  const db = getDB();
  await db
    .collection(COLLECTION)
    .updateMany(
      { userId, revoked: false, tokenHash: { $ne: excludeTokenHash } },
      { $set: { revoked: true } },
    );
}

export async function deleteExpiredTokens() {
  const db = getDB();
  await db.collection(COLLECTION).deleteMany({
    expiresAt: { $lt: new Date() },
  });
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateRefreshToken() {
  return crypto.randomBytes(64).toString("hex");
}
