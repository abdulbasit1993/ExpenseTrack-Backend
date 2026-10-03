import { OpenRouter } from "@openrouter/sdk";
import { getDB } from "../../config/db.js";
import { ObjectId } from "mongodb";

const openrouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

/**
 * Gets period date ranges for insights generation.
 * @param {string} period - "week" or "month"
 * @returns {{ start: Date, end: Date }} - Start and end dates (end is exclusive)
 */
function getPeriodRanges(period) {
  const now = new Date();
  const utcNow = new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
  );

  if (period === "week") {
    // Start of current week (Monday UTC)
    const day = utcNow.getUTCDay();
    const diff = utcNow.getUTCDate() - day + (day === 0 ? -6 : 1);
    const start = new Date(Date.UTC(now.getFullYear(), now.getMonth(), diff));
    const end = new Date(Date.UTC(now.getFullYear(), now.getMonth(), diff + 7));
    return { start, end };
  }

  if (period === "month") {
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const end = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );
    return { start, end };
  }

  throw new Error("Invalid period. Use 'week' or 'month'");
}

/**
 * Aggregates transaction data for a given date range.
 * @param {import("mongodb").Db} db - Database instance
 * @param {string} userId - User ID
 * @param {Date} startDate - Start date (inclusive)
 * @param {Date} endDate - End date (exclusive)
 * @returns {Promise<Object>} Aggregated data { income, expense, byCategory }
 */
async function getPeriodData(db, userId, startDate, endDate) {
  const [summary, byCategory] = await Promise.all([
    db
      .collection("transactions")
      .aggregate([
        { $match: { userId, date: { $gte: startDate, $lt: endDate } } },
        {
          $group: {
            _id: null,
            totalIncome: {
              $sum: { $cond: [{ $eq: ["$type", "income"] }, "$amount", 0] },
            },
            totalExpense: {
              $sum: { $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0] },
            },
            transactionCount: { $sum: 1 },
          },
        },
      ])
      .toArray(),

    db
      .collection("transactions")
      .aggregate([
        { $match: { userId, date: { $gte: startDate, $lt: endDate } } },
        {
          $lookup: {
            from: "categories",
            localField: "categoryId",
            foreignField: "_id",
            as: "category",
          },
        },
        {
          $unwind: { path: "$category", preserveNullAndEmptyArrays: true },
        },
        {
          $group: {
            _id: { type: "$type", name: "$category.name" },
            total: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
        {
          $project: {
            _id: 0,
            name: {
              $ifNull: ["$_id.name", "Uncategorized"],
            },
            type: "$_id.type",
            total: 1,
            count: 1,
          },
        },
        {
          $sort: { total: -1 },
        },
      ])
      .toArray(),
  ]);

  return {
    summary: summary[0] || {
      totalIncome: 0,
      totalExpense: 0,
      transactionCount: 0,
    },
    byCategory: byCategory || [],
  };
}

/**
 * Generates AI-powered spending insights.
 * @param {import("mongodb").ObjectId} userId - User ID
 * @param {string} period - "week" or "month"
 * @returns {Promise<Object>} { period, insights: string[] }
 */
export async function generateInsights(userId, period) {
  const db = getDB();

  if (!ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID");
  }

  const objectUserId = new ObjectId(userId);

  const { start, end } = getPeriodRanges(period);

  const user = await db
    .collection("users")
    .findOne({ _id: objectUserId }, { projection: { currency: 1 } });

  const currency = user?.currency ?? "USD";

  const { summary, byCategory } = await getPeriodData(
    db,
    objectUserId,
    start,
    end,
  );

  const expenseCategories = byCategory.filter(
    (category) => category.type === "expense",
  );

  const prompt = `
    Based on the following transaction data for a user, generate 3-5 short, actionable spending insights.

    Data:
    - Total income: ${currency} ${summary.totalIncome}
    - Total expenses: ${currency} ${summary.totalExpense}
    - Net: ${currency} ${summary.totalIncome - summary.totalExpense}

    Top expense categories:
    ${
      expenseCategories
        .slice(0, 3)
        .map((c) => `- ${c.name}:  ${currency} ${c.total}`)
        .join("\n") || "None"
    }

    Please provide 3-5 concise insights about spending patterns, budget management, or financial habits.
    Format as a JSON object with a single "insights" array field containing strings.
    Each insight should be 1-2 sentences maximum.
    Do not include any reasoning, analysis, or additional text outside the JSON.
  `;

  const response = await openrouter.chat.send({
    chatRequest: {
      model: process.env.OPENROUTER_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a financial analytics assistant. Generate concise spending insights based on the provided data. Return ONLY valid JSON with an 'insights' array field.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
    },
  });

  const content = response.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("AI returned an empty response");
  }

  let result;
  try {
    result = JSON.parse(content);
  } catch (error) {
    console.error("Invalid AI response: ", content);
    throw new Error("AI returned an invalid response");
  }

  if (
    !Array.isArray(result.insights) ||
    !result.insights.every(
      (insight) => typeof insight === "string" && insight.trim().length > 0,
    )
  ) {
    throw new Error("AI response does not contain a valid insights array");
  }

  return {
    period,
    insights: result.insights.map((insight) => insight.trim()).slice(0, 5),
  };
}

/**
 * Generates a monthly summary string using AI.
 * @param {string} userId - User ID
 * @param {number} year - Year
 * @param {number} month - Month (1-12)
 * @returns {Promise<Object>} { month: string, summary: string, data: { income, expense, net, monthlyBudget, highestExpenseCategory, currency } }
 */
export async function generateMonthlySummary(userId, year, month) {
  const db = getDB();

  if (!ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID");
  }

  const objectUserId = new ObjectId(userId);

  // Get period data
  const startOfMonthDate = new Date(Date.UTC(year, month - 1, 1));
  const endOfMonthDate = new Date(Date.UTC(year, month, 1));

  const { summary, byCategory } = await getPeriodData(
    db,
    objectUserId,
    startOfMonthDate,
    endOfMonthDate,
  );

  // Get user's monthly budget
  const user = await db
    .collection("users")
    .findOne(
      { _id: objectUserId },
      { projection: { monthlyBudget: 1, currency: 1 } },
    );

  const monthlyBudget = user?.monthlyBudget ?? 0;
  const currency = user?.currency ?? "USD";

  const expenseCategories = byCategory.filter(
    (category) => category.type === "expense",
  );

  // Find highest expense category
  const highestCategory =
    expenseCategories.length > 0
      ? expenseCategories[0]
      : { name: "No categories", total: 0 };

  const net = summary.totalIncome - summary.totalExpense;

  const budgetRemaining = monthlyBudget - summary.totalExpense;

  const budgetStatus =
    monthlyBudget <= 0
      ? "not set"
      : summary.totalExpense > monthlyBudget
        ? "over budget"
        : "within budget";

  const prompt = `
    Generate a concise monthly spending summary for ${year}-${month.toString().padStart(2, "0")}.

    Use ONLY the following factual data:

    - Total income: ${currency} ${summary.totalIncome}
    - Total expenses:  ${currency} ${summary.totalExpense}
    - Net: ${currency} ${net}
    - Monthly budget: ${currency} ${monthlyBudget}
    - Budget remaining: ${currency} ${budgetRemaining}
    - Budget status: ${budgetStatus}
    - Highest expense category: ${highestCategory.name} (${currency} ${highestCategory.total})
    - Number of transactions: ${summary.transactionCount || 0}

    Write a concise 1-2 sentence summary.

    The budget status has already been calculated by the application.
    Do not change or reinterpret it.

    Return ONLY valid JSON in this format:
    {
        "summary": "Your monthly spending summary here."
    }

    Do not include markdown, code fences, reasoning, or any additional text.
  `;

  const response = await openrouter.chat.send({
    chatRequest: {
      model: process.env.OPENROUTER_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a financial summary assistant. Generate a concise monthly spending summary based strictly on the financial data provided. Do not invent or change any numbers or financial facts. Return ONLY valid JSON with a 'summary' field.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.3,
    },
  });

  const content = response.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("AI returned an empty response");
  }

  let result;
  try {
    result = JSON.parse(content);
  } catch (error) {
    console.error("Invalid AI response: ", content);
    throw new Error("AI returned an invalid response");
  }

  if (!result.summary || typeof result.summary !== "string") {
    throw new Error("AI response does not contain a valid summary");
  }

  return {
    month: `${year}-${month.toString().padStart(2, "0")}`,
    summary: result.summary,
    data: {
      income: summary.totalIncome,
      expense: summary.totalExpense,
      net,
      monthlyBudget,
      budgetRemaining,
      budgetStatus,
      highestExpenseCategory: highestCategory.name,
      highestExpenseAmount: highestCategory.total,
      transactionCount: summary.transactionCount,
      currency,
    },
  };
}
