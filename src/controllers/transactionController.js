import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";

const transactionTypes = ["income", "expense"];

function getObjectId(id) {
  if (id instanceof ObjectId) {
    return id;
  }

  return typeof id === "string" && ObjectId.isValid(id)
    ? new ObjectId(id)
    : null;
}

function isValidDate(value) {
  return !Number.isNaN(new Date(value).getTime());
}

function validateTransactionInput(data, { partial = false } = {}) {
  const errors = [];

  if (!partial || data.categoryId !== undefined) {
    if (!getObjectId(data.categoryId)) {
      errors.push("categoryId must be a valid category ID");
    }
  }

  if (!partial || data.type !== undefined) {
    if (!transactionTypes.includes(data.type)) {
      errors.push("Type must be either income or expense");
    }
  }

  if (!partial || data.amount !== undefined) {
    if (
      typeof data.amount !== "number" ||
      !Number.isFinite(data.amount) ||
      data.amount <= 0
    ) {
      errors.push("Amount must be a number greater than 0");
    }
  }

  if (!partial || data.date !== undefined) {
    if (!isValidDate(data.date)) {
      errors.push("Date must be a valid date");
    }
  }

  if (data.note !== undefined) {
    if (typeof data.note !== "string" || data.note.trim().length > 500) {
      errors.push("Note must be a string with at most 500 characterss");
    }
  }

  return errors;
}

async function getActiveAccessibleCategory(db, categoryId, userId) {
  return db.collection("categories").findOne({
    _id: categoryId,
    isArchived: false,
    $or: [{ userId: null }, { userId }],
  });
}

function getPagination(query) {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 20);

  if (!Number.isInteger(page) || page < 1) {
    return {
      error: "Page must be a positive integer",
    };
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return {
      error: "Limit must be an integer between 1 and 100",
    };
  }

  return { page, limit };
}

function parseFilterDate(value, fieldName) {
  if (!value) {
    return { value: null };
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return {
      error: `${fieldName} must be a valid date`,
    };
  }

  return { value: date };
}

export async function createTransaction(req, res) {
  try {
    const body = req.body ?? {};
    const errors = validateTransactionInput(body);

    if (errors.length) {
      return res.status(400).json({
        success: false,
        errors,
      });
    }

    const db = getDB();
    const categoryId = getObjectId(body.categoryId);

    const category = await getActiveAccessibleCategory(
      db,
      categoryId,
      req.user.userId,
    );

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Active category not found",
      });
    }

    if (category.type !== body.type) {
      return res.status(400).json({
        success: false,
        message: "Transaction type must match the category type",
      });
    }

    const transaction = {
      userId: req.user.userId,
      categoryId,
      type: body.type,
      amount: body.amount,
      note: body.note?.trim() || "",
      date: new Date(body.date),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("transactions").insertOne(transaction);

    return res.status(201).json({
      success: true,
      message: "Transaction created successfully",
      data: {
        transaction: {
          _id: result.insertedId,
          ...transaction,
        },
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}
