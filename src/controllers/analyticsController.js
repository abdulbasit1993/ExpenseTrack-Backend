import { getDB } from "../config/db.js";

const MAX_MONTHS = 24;

function roundTo2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function isDateOnly(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseDateOnly(value, fieldName) {
  if (!isDateOnly(value)) {
    return {
      error: `${fieldName} must use YYYY-MM-DD format`,
    };
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  // Reject dates such as 2026-02-31.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return {
      error: `${fieldName} must be a valid date`,
    };
  }

  return { value: date };
}

function addOneUtcDay(date) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + 1);
  return result;
}

function getDefaultRange() {
  const now = new Date();

  // Current month plus the previous five months.
  const fromDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1),
  );

  // Last day of the current month.
  const toDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  );

  return { fromDate, toDate };
}

function getMonthDifference(fromDate, toDate) {
  return (
    (toDate.getUTCFullYear() - fromDate.getUTCFullYear()) * 12 +
    (toDate.getUTCMonth() - fromDate.getUTCMonth()) +
    1
  );
}

function createMonths(fromDate, toDate) {
  const months = [];
  const cursor = new Date(
    Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), 1),
  );

  const lastMonth = new Date(
    Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), 1),
  );

  while (cursor <= lastMonth) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth() + 1;

    months.push({
      key: `${year}-${String(month).padStart(2, "0")}`,
      year,
      month,
      label: cursor.toLocaleString("en-US", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }),
    });

    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return months;
}

function parseAnalyticsQuery(query) {
  const defaultRange = getDefaultRange();

  let fromDate = defaultRange.fromDate;
  let toDate = defaultRange.toDate;

  if (query.fromDate !== undefined) {
    const parsed = parseDateOnly(query.fromDate, "fromDate");

    if (parsed.error) {
      return { error: parsed.error };
    }

    fromDate = parsed.value;
  }

  if (query.toDate !== undefined) {
    const parsed = parseDateOnly(query.toDate, "toDate");

    if (parsed.error) {
      return { error: parsed.error };
    }

    toDate = parsed.value;
  }

  if (fromDate > toDate) {
    return {
      error: "fromDate cannot be later than toDate",
    };
  }

  const months = getMonthDifference(fromDate, toDate);

  if (months > MAX_MONTHS) {
    return {
      error: `Date range cannot exceed ${MAX_MONTHS} months`,
    };
  }

  return {
    fromDate,
    toDate,
    toDateExclusive: addOneUtcDay(toDate),
  };
}

export async function getAnalytics(req, res) {
  try {
    const parsedQuery = parseAnalyticsQuery(req.query ?? {});

    if (parsedQuery.error) {
      return res.status(400).json({
        success: false,
        message: parsedQuery.error,
      });
    }

    const { fromDate, toDate, toDateExclusive } = parsedQuery;
    const db = getDB();

    const transactionMatch = {
      userId: req.user.userId,
      date: {
        $gte: fromDate,
        $lt: toDateExclusive,
      },
    };

    const [analytics] = await db
      .collection("transactions")
      .aggregate([
        { $match: transactionMatch },
        {
          $facet: {
            // Pie chart data
            expensesByCategory: [
              { $match: { type: "expense" } },
              {
                $lookup: {
                  from: "categories",
                  localField: "categoryId",
                  foreignField: "_id",
                  as: "category",
                },
              },
              {
                $unwind: {
                  path: "$category",
                  preserveNullAndEmptyArrays: true,
                },
              },
              {
                $group: {
                  _id: "$categoryId",
                  total: { $sum: "$amount" },
                  transactionCount: { $sum: 1 },
                  name: {
                    $first: {
                      $ifNull: ["$category.name", "Uncategorized"],
                    },
                  },
                  color: {
                    $first: {
                      $ifNull: ["$category.color", "#94A3B8"],
                    },
                  },
                  icon: {
                    $first: {
                      $ifNull: ["$category.icon", "help-circle"],
                    },
                  },
                },
              },
              { $sort: { total: -1, name: 1 } },
              {
                $project: {
                  _id: 0,
                  categoryId: { $toString: "$_id" },
                  name: 1,
                  color: 1,
                  icon: 1,
                  total: 1,
                  transactionCount: 1,
                },
              },
            ],

            // Line chart data
            monthlyTrend: [
              {
                $group: {
                  _id: {
                    year: { $year: "$date" },
                    month: { $month: "$date" },
                  },
                  income: {
                    $sum: {
                      $cond: [{ $eq: ["$type", "income"] }, "$amount", 0],
                    },
                  },
                  expense: {
                    $sum: {
                      $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0],
                    },
                  },
                },
              },
              {
                $sort: {
                  "_id.year": 1,
                  "_id.month": 1,
                },
              },
            ],

            // Income vs. Expense bar chart data
            incomeVsExpense: [
              {
                $group: {
                  _id: null,
                  income: {
                    $sum: {
                      $cond: [{ $eq: ["$type", "income"] }, "$amount", 0],
                    },
                  },
                  expense: {
                    $sum: {
                      $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0],
                    },
                  },
                },
              },
              {
                $project: {
                  _id: 0,
                  income: 1,
                  expense: 1,
                },
              },
            ],
          },
        },
      ])
      .toArray();

    const monthTemplate = createMonths(fromDate, toDate);

    const monthlyTrendMap = new Map(
      (analytics.monthlyTrend ?? []).map((item) => {
        const key = `${item._id.year}-${String(item._id.month).padStart(
          2,
          "0",
        )}`;

        return [key, item];
      }),
    );

    const monthlyTrend = monthTemplate.map((month) => {
      const values = monthlyTrendMap.get(month.key);

      return {
        ...month,
        income: roundTo2(values?.income),
        expense: roundTo2(values?.expense),
      };
    });

    const expensesByCategory = (analytics.expensesByCategory ?? []).map(
      (item) => ({
        ...item,
        total: roundTo2(item.total),
      }),
    );

    const comparison = analytics.incomeVsExpense?.[0] ?? {
      income: 0,
      expense: 0,
    };

    const income = roundTo2(comparison.income);
    const expense = roundTo2(comparison.expense);

    return res.status(200).json({
      success: true,
      data: {
        range: {
          fromDate: fromDate.toISOString().slice(0, 10),
          toDate: toDate.toISOString().slice(0, 10),
        },

        expensesByCategory,

        monthlyTrend,

        incomeVsExpense: {
          income,
          expense,
          net: roundTo2(income - expense),
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
