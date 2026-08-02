import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";

const categoryTypes = ["income", "expense"];

function normalizeName(name) {
  return name.trim().toLowerCase();
}

function validateCategoryInput(data, { partial = false } = {}) {
  const errors = [];

  if (!partial || data.name !== undefined) {
    if (
      typeof data.name !== "string" ||
      !data.name.trim() ||
      data.name.trim().length > 50
    ) {
      errors.push("Name is required and must be at most 50 characters long");
    }
  }

  if (!partial || data.type !== undefined) {
    if (!categoryTypes.includes(data.type)) {
      errors.push("Type must be either income or expense");
    }
  }

  if (data.icon !== undefined) {
    if (typeof data.icon !== "string" || data.icon.trim().length > 50) {
      errors.push("Icon must be a string with at most 50 characters");
    }
  }

  if (data.color !== undefined) {
    const isValidHexColor = /^#[0-9A-Fa-f]{6}$/.test(data.color);

    if (!isValidHexColor) {
      errors.push("Color must be a valid hex color, for example #3B82F6");
    }
  }

  return errors;
}

function getCategoryId(id) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

function handleDuplicateCategory(error, res) {
  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "A category with this name and type already exists",
    });

    return true;
  }

  return false;
}

/**
 * Creates a custom category for the authenticated user.
 *
 * @param {import("express").Request} req - The Express request object.
 * @param {import("express").Response} res - The Express response object.
 * @returns {Promise<import("express").Response>} The API response.
 */
export async function createCategory(req, res) {
  try {
    const body = req.body ?? {};
    const errors = validateCategoryInput(body);

    if (errors.length) {
      return res.status(400).json({
        success: false,
        errors,
      });
    }

    const category = {
      userId: req.user.userId,
      name: normalizeName(body.name),
      type: body.type,
      icon: body.icon?.trim() || "",
      color: body.color || "#64748B",
      isDefault: false,
      isArchived: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const db = getDB();
    const result = await db.collection("categories").insertOne(category);

    return res.status(201).json({
      success: true,
      message: "Category created successfully",
      data: {
        category: {
          _id: result.insertedId,
          ...category,
        },
      },
    });
  } catch (error) {
    if (handleDuplicateCategory(error, res)) {
      return;
    }

    return res.status(500).json({
      success: false,
      message: "Something went wrong while creating category: " + error.message,
    });
  }
}

/**
 * Gets default and user-created categories for the authenticated user.
 *
 * @param {import("express").Request} req - The Express request object.
 * @param {import("express").Response} res - The Express response object.
 * @returns {Promise<import("express").Response>} The API response.
 */
export async function getCategories(req, res) {
  try {
    const db = getDB();
    const { type, includeArchived } = req.query;

    if (type && !categoryTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Type must be either income or expense",
      });
    }

    const includeUserArchived = includeArchived === "true";

    const filter = {
      $or: [
        {
          userId: null,
          isArchived: false,
        },
        {
          userId: req.user.userId,
          ...(includeUserArchived ? {} : { isArchived: false }),
        },
      ],
    };

    if (type) {
      filter.type = type;
    }

    const categories = await db
      .collection("categories")
      .find(filter)
      .sort({ isDefault: -1, name: 1 })
      .toArray();

    return res.status(200).json({
      success: true,
      data: {
        categories,
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
 * Gets a category by its ID.
 *
 * @param {import("express").Request} req - The Express request object.
 * @param {import("express").Response} res - The Express response object.
 * @returns {Promise<import("express").Response>} The API response.
 */
export async function getCategoryById(req, res) {
  try {
    const categoryId = getCategoryId(req.params.id);

    if (!categoryId) {
      return res.status(400).json({
        success: false,
        message: "Invalid category ID",
      });
    }

    const db = getDB();

    const category = await db.collection("categories").findOne({
      _id: categoryId,
      $or: [{ userId: null }, { userId: req.user.userId }],
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        category,
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
 * Updates a custom category for the authenticated user.
 *
 * @param {import("express").Request} req - The Express request object.
 * @param {import("express").Response} res - The Express response object.
 * @returns {Promise<import("express").Response>} The API response.
 */
export async function updateCategory(req, res) {
  try {
    const categoryId = getCategoryId(req.params.id);

    if (!categoryId) {
      return res.status(400).json({
        success: false,
        message: "Invalid category ID",
      });
    }

    const allowedFields = ["name", "type", "icon", "color", "isArchived"];

    const updatePayload = Object.fromEntries(
      Object.entries(req.body ?? {}).filter(([key]) =>
        allowedFields.includes(key),
      ),
    );

    if (!Object.keys(updatePayload).length) {
      return res.status(400).json({
        success: false,
        message: "Provide at least one valid field to update",
      });
    }

    if (
      updatePayload.isArchived !== undefined &&
      typeof updatePayload.isArchived !== "boolean"
    ) {
      return res.status(400).json({
        success: false,
        message: "isArchived must be either true or false",
      });
    }

    const errors = validateCategoryInput(updatePayload, {
      partial: true,
    });

    if (errors.length) {
      return res.status(400).json({
        success: false,
        errors,
      });
    }

    const update = {
      ...updatePayload,
      updatedAt: new Date(),
    };

    if (update.name !== undefined) {
      update.name = update.name.trim();
    }

    if (update.icon !== undefined) {
      update.icon = update.icon.trim();
    }

    const db = getDB();

    // Only custom categories are editable
    const category = await db.collection("categories").findOneAndUpdate(
      {
        _id: categoryId,
        userId: req.user.userId,
        isDefault: false,
      },
      {
        $set: update,
      },
      {
        returnDocument: "after",
      },
    );

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Custom category not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Category updated successfully",
      data: {
        category,
      },
    });
  } catch (error) {
    if (handleDuplicateCategory(error, res)) {
      return;
    }

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

/**
 * Deletes a custom category that is not used by a transaction.
 *
 * @param {import("express").Request} req - The Express request object.
 * @param {import("express").Response} res - The Express response object.
 * @returns {Promise<import("express").Response>} The API response.
 */
export async function deleteCategory(req, res) {
  try {
    const categoryId = getCategoryId(req.params.id);

    if (!categoryId) {
      return res.status(400).json({
        success: false,
        message: "Invalid category ID",
      });
    }

    const db = getDB();
    const categories = db.collection("categories");

    const category = await categories.findOne({
      _id: categoryId,
      userId: req.user.userId,
      isDefault: false,
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Custom category not found",
      });
    }

    // This check becomes active once transactions store categoryId.
    const transactionUsingCategory = await db
      .collection("transactions")
      .findOne({
        userId: req.user.userId,
        categoryId,
      });

    if (transactionUsingCategory) {
      return res.status(409).json({
        success: false,
        message:
          "This category is used by transactions. Archive it instead of deleting it.",
      });
    }

    await categories.deleteOne({
      _id: categoryId,
      userId: req.user.userId,
      isDefault: false,
    });

    return res.status(200).json({
      success: true,
      message: "Category deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}
