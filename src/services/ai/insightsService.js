import { OpenRouter } from "@openrouter/sdk";
import { getDB } from "../../config/db.js";

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
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
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
            name: "$_id.name",
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
    summary: summary[0] || { totalIncome: 0, totalExpense: 0 },
    byCategory: byCategory || [],
  };
}

/**
 * Generates AI-powered spending insights.
 * @param {string} userId - User ID
 * @param {string} period - "week" or "month"
 * @returns {Promise<Object>} { period, insights: string[] }
 */
export async function generateInsights(userId, period) {
  const db = getDB();
  const { start, end } = getPeriodRanges(period);

  const { summary, byCategory } = await getPeriodData(db, userId, start, end);

  const prompt = `
    Based on the following transaction data for a user, generate 3-5 short, actionable spending insights.

    Data:
    - Total income: $${summary.totalIncome}
    - Total expenses: $${summary.totalExpense}
    - Net: $${summary.totalIncome - summary.totalExpense}

    Top expense categories:
    ${
      byCategory
        .slice(0, 3)
        .map((c) => `- ${c.name}: $${c.total}`)
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

  if (!Array.isArray(result.insights)) {
    throw new Error("AI response does not contain a valid insights array");
  }

  return {
    period,
    insights: result.insights.slice(0, 5),
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

  // Get period data
  const startOfMonthDate = new Date(Date.UTC(year, month - 1, 1));
  const endOfMonthDate = new Date(Date.UTC(year, month, 1, 23, 59, 59, 999));

  const { summary, byCategory } = await getPeriodData(
    db,
    userId,
    startOfMonthDate,
    endOfMonthDate,
  );

  // Get user's monthly budget
  const user = await db
    .collection("users")
    .findOne(
      { _id: userId },
      { projection: { monthlyBudget: 1, currency: 1 } },
    );

  // Find highest expense category
  const highestCategory =
    byCategory.length > 0 ? byCategory[0] : { name: "No categories", total: 0 };

  const prompt = `
    Generate a monthly spending summary for ${year}-${month.toString().padStart(2, "0")}.

    Key data:
    - Total income: $${summary.totalIncome}
    - Total expenses: $${summary.totalExpense}
    - Net: $${summary.totalIncome - summary.totalExpense}
    - Monthly budget: $${user?.monthlyBudget ?? 0}
    - Budget remaining: $${(user?.monthlyBudget ?? 0) - summary.totalExpense}
    - Highest expense category: ${highestCategory.name} ($${highestCategory.total})
    - Number of transactions: ${summary.transactionCount || 0}

    Please provide a concise 1-2 sentence summary in JSON format:
    {
        "summary": "Your highest expense category this month was {category}. You remained within your monthly budget."
    }

    Format: ONLY return valid JSON with a "summary" field. No additional text.
  `;

  const response = await openrouter.chat.send({
    chatRequest: {
      model: process.env.OPENROUTER_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a financial summary assistant. Generate a concise monthly spending summary based on the data provided. Return ONLY valid JSON with a 'summary' field.",
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
      net: summary.totalIncome - summary.totalExpense,
      monthlyBudget: user?.monthlyBudget ?? 0,
      highestExpenseCategory: highestCategory.name,
      currency: user?.currency ?? "USD",
    },
  };
}
