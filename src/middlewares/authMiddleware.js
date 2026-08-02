import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";

export function protect(req, res, next) {
  try {
    const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authorization token is required",
      });
    }

    const token = authorization.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = String(decoded.userId);

    if (!ObjectId.isValid(userId)) {
      return res.status(401).json({
        success: false,
        message: "Invalid authorization token",
      });
    }

    req.user = {
      userId: new ObjectId(userId),
    };

    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired authorization token",
    });
  }
}
