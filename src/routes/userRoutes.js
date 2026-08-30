import express from "express";

import { protect } from "../middlewares/authMiddleware.js";
import { uploadProfileImage } from "../middlewares/uploadMiddleware.js";
import {
  updatePreferences,
  updateProfile,
} from "../controllers/userController.js";

const router = express.Router();

router.use(protect);

router.put("/profile", uploadProfileImage, updateProfile);

router.patch("/preferences", updatePreferences);

export default router;
