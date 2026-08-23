import { getDB } from "../config/db.js";

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const dashboardConfig = {
  minYear: 1920,
  maxYear: 2100,
  defaultRecentLimit: 5,
  maxRecentLimit: 50,
};

function roundTo2(value) {
  return Math.round(value * 100) / 100;
}

function getMonthRange(year, month) {
  // Transactions are stored as UTC dates, so month boundaries are UTC-based too.
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));

  return { start, end };
}

function parseDashboardQuery(query) {
  const errors = [];

  const now = new Date();

  let year = now.getFullYear();
  let month = now.getUTCMonth() + 1;
  let limit = dashboardConfig.defaultRecentLimit;

  if (query.year !== undefined) {
    const parsedYear = Number(query.year);

    if (
      !Number.isInteger(parsedYear) ||
      parsedYear < dashboardConfig.minYear ||
      parsedYear > dashboardConfig.maxYear
    ) {
      errors.push(
        `Year must be an integer between ${dashboardConfig.minYear} and ${dashboardConfig.maxYear}.`,
      );
    } else {
      year = parsedYear;
    }
  }

  if (query.month !== undefined) {
    const parsedMonth = Number(query.month);

    if (!Number.isInteger(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
      errors.push(`Month must be an integer between 1 and 12.`);
    } else {
      month = parsedMonth;
    }
  }

  if (query.limit !== undefined) {
    const parsedLimit = Number(query.limit);

    if (
      !Number.isInteger(parsedLimit) ||
      parsedLimit < 1 ||
      parsedLimit > dashboardConfig.maxRecentLimit
    ) {
      errors.push(
        `Limit must be an integer between 1 and ${dashboardConfig.maxRecentLimit}`,
      );
    } else {
      limit = parsedLimit;
    }
  }

  return { errors, year, month, limit };
}

/**
 * Returns dashboard data for the authenticated user: an all-time summary,
 * the selected month, and that month's recent transactions.
 *
 * Query params (all optional): year, month, limit.
 *
 * @param {import("express").Request} req - The Express request object.
 * @param {import("express").Response} res - The Express response object.
 * @returns {Promise<import("express").Response>} The API response.
 */
export async function getDashboard(req, res) {
  try {
    const { errors, year, month, limit } = parseDashboardQuery(req.query ?? {});

    if (errors.length) {
      return res.status(400).json({
        success: false,
        errors,
      });
    }

    const { start, end } = getMonthRange(year, month);

    const db = await getDB();

    const transactions = db.collection("transactions");

    const [user, summaryResults, recentTransactions] = await Promise.all([
      db
        .collection("users")
        .findOne(
          { _id: req.user.userId },
          { projection: { monthlyBudget: 1 } },
        ),

      // One pass over the user's transactions produces all summary totals.
      transactions
        .aggregate([
          { $match: { userId: req.user.userId } },
          {
            $group: {
              _id: null,
              totalIncome: {
                $sum: {
                  $cond: [{ $eq: ["$type", "income"] }, "$amount", 0],
                },
              },
              totalExpenses: {
                $sum: {
                  $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0],
                },
              },
              monthlySpent: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ["$type", "expense"] },
                        { $gte: ["$date", start] },
                        { $lt: ["$date", end] },
                      ],
                    },
                    "$amount",
                    0,
                  ],
                },
              },
            },
          },
        ])
        .toArray(),

      transactions
        .aggregate([
          {
            $match: {
              userId: req.user.userId,
              date: { $gte: start, $lt: end },
            },
          },
          { $sort: { date: -1, createdAt: -1 } },
          { $limit: limit },
          {
            $lookup: {
              from: "categories",
              let: { categoryId: "$categoryId" },
              pipeline: [
                { $match: { $expr: { $eq: ["$_id", "$$categoryId"] } } },
                { $project: { name: 1, icon: 1 } },
              ],
              as: "category",
            },
          },
          {
            $project: {
              _id: 1,
              title: 1,
              type: 1,
              amount: 1,
              date: 1,
              category: {
                $ifNull: [{ $arrayElemAt: ["$category", 0] }, null],
              },
            },
          },
        ])
        .toArray(),
    ]);

    const summary = summaryResults[0] ?? {
      totalIncome: 0,
      totalExpenses: 0,
      monthlySpent: 0,
    };

    return res.status(200).json({
      success: true,
      data: {
        summary: {
          currentBalance: roundTo2(summary.totalIncome - summary.totalExpenses),
          totalIncome: roundTo2(summary.totalIncome),
          totalExpenses: roundTo2(summary.totalExpenses),
          monthlyBudget: roundTo2(user?.monthlyBudget ?? 0),
          monthlySpent: roundTo2(summary.monthlySpent),
        },
        month: {
          year,
          month,
          label: `${monthNames[month - 1]} ${year}`,
        },
        recentTransactions,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}
