import cloudinary from "../config/cloudinary.js";
import { getDB } from "../config/db.js";

const allowedCurrencies = [
  "USD",
  "EUR",
  "GBP",
  "PKR",
  "JPY",
  "INR",
  "CAD",
  "AUD",
  "CHF",
  "CNY",
  "AED",
  "SAR",
];

function validatePreferencesInput(data) {
  const errors = [];

  if (data.monthlyBudget !== undefined) {
    if (
      typeof data.monthlyBudget !== "number" ||
      Number.isNaN(data.monthlyBudget)
    ) {
      errors.push("Monthly budget must be a number.");
    } else if (!Number.isFinite(data.monthlyBudget) || data.monthlyBudget < 0) {
      errors.push("Monthly budget must be a non-negative number.");
    }
  }

  if (data.currency !== undefined) {
    if (typeof data.currency !== "string" || !data.currency.trim()) {
      errors.push("Currency must be a non-empty string.");
    } else if (
      !allowedCurrencies.includes(data.currency.trim().toUpperCase())
    ) {
      errors.push(`Currency must be one of ${allowedCurrencies.join(", ")}`);
    }
  }

  return errors;
}

/**
 * Extracts the Cloudinary `public_id` from a Cloudinary asset URL.
 *
 * Example URL:
 *   https://res.cloudinary.com/<cloud>/image/upload/v123/expensetrack/profile_images/abc123.jpg
 *   -> expensetrack/profile_images/abc123
 *
 * Returns `null` if the URL is not a Cloudinary URL or has an unexpected shape.
 *
 * @param {string} url - The Cloudinary secure URL.
 * @returns {string | null} The public_id, or null if it cannot be extracted.
 */
function extractPublicIdFromUrl(url) {
  if (typeof url !== "string" || !url.trim()) {
    return null;
  }

  try {
    // Match the "/upload/" segment (handles both http and https, with or without res.cloudinary.com)
    const uploadMarker = "/upload/";
    const markerIndex = url.indexOf(uploadMarker);

    if (markerIndex === -1) {
      return null;
    }

    // Take everything after "/upload/", then strip the version segment (e.g. "v1234567890/")
    let path = url.substring(markerIndex + uploadMarker.length);

    // Remove a leading version segment if present (e.g. "v1700000000/")
    path = path.replace(/^v\d+\//, "");

    // Drop the file extension (".jpg", ".png", ".webp", etc.)
    const lastDot = path.lastIndexOf(".");
    if (lastDot !== -1) {
      path = path.substring(0, lastDot);
    }

    return path || null;
  } catch {
    return null;
  }
}

/**
 * Deletes an asset from Cloudinary by its public_id.
 * Logs and swallows any error so it never blocks the calling flow.
 *
 * @param {string} publicId - The Cloudinary public_id to delete.
 * @returns {Promise<void>}
 */
async function deleteFromCloudinary(publicId) {
  if (!publicId) {
    return;
  }

  try {
    const result = await cloudinary.uploader.destroy(publicId);

    // Cloudinary returns result.result === "ok" on success, "not found" if it was already gone.
    if (result.result !== "ok" && result.result !== "not found") {
      console.warn(
        `Unexpected Cloudinary destroy result for "${publicId}":`,
        result,
      );
    }
  } catch (error) {
    // Log and continue — a deletion failure must not fail the profile update.
    console.warn(
      `Failed to delete old Cloudinary asset "${publicId}":`,
      error.message,
    );
  }
}

export async function updatePreferences(req, res) {
  try {
    const body = req.body ?? {};
    const errors = validatePreferencesInput(body);

    if (errors.length) {
      return res.status(400).json({
        success: false,
        errors,
      });
    }

    const updatePayload = {};

    if (body.monthlyBudget !== undefined) {
      updatePayload.monthlyBudget = body.monthlyBudget;
    }

    if (body.currency !== undefined) {
      updatePayload.currency = body.currency.trim().toUpperCase();
    }

    if (!Object.keys(updatePayload).length) {
      return res.status(400).json({
        success: false,
        message:
          "Provide at least one preference field to update (monthlyBudget or currency).",
      });
    }

    const db = getDB();

    const result = await db.collection("users").findOneAndUpdate(
      { _id: req.user.userId },
      {
        $set: {
          ...updatePayload,
          updatedAt: new Date(),
        },
      },
      {
        returnDocument: "after",
        projection: { password: 0 },
      },
    );

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Preferences updated successfully",
      data: {
        user: result,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

/**
 * Updates the authenticated user's profile: first name, last name,
 * and/or profile image (Cloudinary).
 *
 * @param {import("express").Request} req - The Express request object.
 * @param {import("express").Response} res - The Express response object.
 * @returns {Promise<import("express").Response>} The API response.
 */
export async function updateProfile(req, res) {
  try {
    const body = req.body ?? {};
    const errors = [];

    // Validate the input data
    // First name
    if (body.firstName !== undefined) {
      if (typeof body.firstName !== "string" || !body.firstName.trim()) {
        errors.push("First name must be a non-empty string.");
      } else if (body.firstName.length > 50) {
        errors.push("First name must be at most 50 characters long.");
      }
    }

    // Last name
    if (body.lastName !== undefined) {
      if (typeof body.lastName !== "string" || !body.lastName.trim()) {
        errors.push("Last name must be a non-empty string.");
      } else if (body.lastName.length > 50) {
        errors.push("Last name must be at most 50 characters long.");
      }
    }

    if (errors.length) {
      return res.status(400).json({
        success: false,
        errors,
      });
    }

    const db = getDB();
    const users = db.collection("users");

    // Build the update payload
    const updatePayload = {};

    if (body.firstName !== undefined) {
      updatePayload.firstName = body.firstName.trim();
    }

    if (body.lastName !== undefined) {
      updatePayload.lastName = body.lastName.trim();
    }

    // When a new image is uploaded, remember the old one so we can delete it after.
    let oldProfileImageUrl = null;
    if (req.file) {
      // Fetch the current user to grab the existing profile image URL.
      const currentUser = await users.findOne(
        { _id: req.user.userId },
        { projection: { profileImage: 1 } },
      );

      if (currentUser?.profileImage) {
        oldProfileImageUrl = currentUser.profileImage;
      }

      // Cloudinary expects either a file path string or a base64 data URI.
      // multer's memoryStorage gives us a raw Buffer, so convert it to a data URI.
      const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;

      const uploadResult = await cloudinary.uploader.upload(dataUri, {
        folder: "expensetrack/profile_images",
        transformation: [
          {
            width: 400,
            height: 400,
            crop: "fill",
            gravity: "face",
          },
        ],
      });

      updatePayload.profileImage = uploadResult.secure_url;
    }

    // At least one field must be provided
    if (!Object.keys(updatePayload).length) {
      return res.status(400).json({
        success: false,
        message:
          "Provide at least one field to update (firstName, lastName, or profileImage).",
      });
    }

    updatePayload.updatedAt = new Date();

    // Persist the update
    const updatedUser = await users.findOneAndUpdate(
      { _id: req.user.userId },
      { $set: updatePayload },
      {
        returnDocument: "after",
        projection: { password: 0 },
      },
    );

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Delete the old Cloudinary image after the DB update succeeds.
    // This is fire-and-forget — deletion failures are logged but never block the response.
    if (oldProfileImageUrl) {
      const oldPublicId = extractPublicIdFromUrl(oldProfileImageUrl);
      deleteFromCloudinary(oldPublicId);
    }

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: {
        user: updatedUser,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}
