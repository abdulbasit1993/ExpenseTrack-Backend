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

  // Title
  if (!partial || data.title !== undefined) {
    if (
      typeof data.title !== "string" ||
      !data.title.trim() ||
      data.title.trim().length > 100
    ) {
      errors.push("Title is required and must be at most 100 characters long");
    }
  }

  // Description
  if (data.description !== undefined) {
    if (
      typeof data.description !== "string" ||
      data.description.trim().length > 1000
    ) {
      errors.push("Description must be a string with at most 1000 characters");
    }
  }

  // Category
  if (!partial || data.categoryId !== undefined) {
    if (!getObjectId(data.categoryId)) {
      errors.push("categoryId must be a valid category ID");
    }
  }

  // Type
  if (!partial || data.type !== undefined) {
    if (!transactionTypes.includes(data.type)) {
      errors.push("Type must be either income or expense");
    }
  }

  // Amount
  if (!partial || data.amount !== undefined) {
    if (
      typeof data.amount !== "number" ||
      !Number.isFinite(data.amount) ||
      data.amount <= 0
    ) {
      errors.push("Amount must be a number greater than 0");
    }
  }

  // Date
  if (!partial || data.date !== undefined) {
    if (!isValidDate(data.date)) {
      errors.push("Date must be a valid date");
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

// Create Transaction
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
      title: body.title.trim(),
      description: body.description?.trim() || "",
      amount: body.amount,
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

// Get Transactions
export async function getTransactions(req, res) {
  try {
    const { type, categoryId, fromDate, toDate } = req.query;

    const pagination = getPagination(req.query);

    if (pagination.error) {
      return res.status(400).json({
        success: false,
        message: pagination.error,
      });
    }

    if (type && !transactionTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Type must be either income or expense",
      });
    }

    const parsedCategoryId = categoryId ? getObjectId(categoryId) : null;

    if (categoryId && !parsedCategoryId) {
      return res.status(400).json({
        success: false,
        message: "Invalid category ID",
      });
    }

    const parsedFromDate = parseFilterDate(fromDate, "fromDate");
    const parsedToDate = parseFilterDate(toDate, "toDate");

    if (parsedFromDate.error || parsedToDate.error) {
      return res.status(400).json({
        success: false,
        message: parsedFromDate.error || parsedToDate.error,
      });
    }

    if (
      parsedFromDate.value &&
      parsedToDate.value &&
      parsedFromDate.value > parsedToDate.value
    ) {
      return res.status(400).json({
        success: false,
        message: "fromDate cannot be later than toDate",
      });
    }

    const filter = {
      userId: req.user.userId,
    };

    if (type) {
      filter.type = type;
    }

    if (parsedCategoryId) {
      filter.categoryId = parsedCategoryId;
    }

    if (parsedFromDate.value || parsedToDate.value) {
      filter.date = {};

      if (parsedFromDate.value) {
        filter.date.$gte = parsedFromDate.value;
      }

      if (parsedToDate.value) {
        filter.date.$lte = parsedToDate.value;
      }
    }

    const { page, limit } = pagination;

    const db = getDB();

    const transactions = db.collection("transactions");

    const [items, total] = await Promise.all([
      transactions
        .find(filter)
        .sort({ date: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      transactions.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        transactions: items,
        pagination: {
          page,
          limit,
          total,
          totalPages: total === 0 ? 0 : Math.ceil(total / limit),
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

// Get Transaction By ID
export async function getTransactionById(req, res) {
  try {
    const transactionId = getObjectId(req.params.id);

    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: "Invalid transaction ID",
      });
    }

    const transaction = await getDB().collection("transactions").findOne({
      _id: transactionId,
      userId: req.user.userId,
    });

    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        transaction,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

// Update Transaction
export async function updateTransaction(req, res) {
  try {
    const transactionId = getObjectId(req.params.id);

    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: "Invalid transaction ID",
      });
    }

    const allowedFields = [
      "title",
      "description",
      "categoryId",
      "type",
      "amount",
      "date",
    ];

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

    const payloadErrors = validateTransactionInput(updatePayload, {
      partial: true,
    });

    if (payloadErrors.length) {
      return res.status(400).json({
        success: false,
        errors: payloadErrors,
      });
    }

    const db = getDB();

    const transactions = db.collection("transactions");

    const existingTransaction = await transactions.findOne({
      _id: transactionId,
      userId: req.user.userId,
    });

    if (!existingTransaction) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    const finalTransaction = {
      ...existingTransaction,
      ...updatePayload,
    };

    const finalErrors = validateTransactionInput(finalTransaction);

    if (finalErrors.length) {
      return res.status(400).json({
        success: false,
        errors: finalErrors,
      });
    }

    const finalCategoryId = getObjectId(finalTransaction.categoryId);

    const category = await getActiveAccessibleCategory(
      db,
      finalCategoryId,
      req.user.userId,
    );

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Active category not found",
      });
    }

    if (category.type !== finalTransaction.type) {
      return res.status(400).json({
        success: false,
        message: "Transaction type must match the category type",
      });
    }

    const update = {
      ...updatePayload,
      updatedAt: new Date(),
    };

    if (update.title !== undefined) {
      update.title = update.title.trim();
    }

    if (update.description !== undefined) {
      update.description = update.description.trim();
    }

    if (update.categoryId !== undefined) {
      update.categoryId = getObjectId(update.categoryId);
    }

    if (update.date !== undefined) {
      update.date = new Date(update.date);
    }

    const transaction = await transactions.findOneAndUpdate(
      {
        _id: transactionId,
        userId: req.user.userId,
      },
      {
        $set: update,
      },
      {
        returnDocument: "after",
      },
    );

    return res.status(200).json({
      success: true,
      message: "Transaction updated successfully",
      data: {
        transaction,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

export async function deleteTransaction(req, res) {
  try {
    const transactionId = getObjectId(req.params.id);

    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: "Invalid transaction ID",
      });
    }

    const result = await getDB().collection("transactions").deleteOne({
      _id: transactionId,
      userId: req.user.userId,
    });

    if (!result.deletedCount) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Transaction deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}
