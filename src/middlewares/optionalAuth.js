// Useful for endpoints that accept both authenticated and unauthenticated requests.

import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";

export function optionalAuth(req, _res, next) {
  try {
    const authorization = req.headers.authorization;
    if (!authorization?.startsWith("Bearer ")) return next();

    const token = authorization.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = String(decoded.userId);

    if (!ObjectId.isValid(userId)) return next();

    req.user = { userId: new ObjectId(userId) };
  } catch (error) {
    // ignore invalid tokens
  }
  next();
}
