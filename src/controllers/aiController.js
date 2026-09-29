import { categorizeTransaction } from "../services/ai/categorizationService.js";
import {
  generateInsights,
  generateMonthlySummary,
} from "../services/ai/insightsService.js";

export async function suggestCategory(req, res) {
  try {
    const { title, description = "", type } = req.body ?? {};

    if (typeof title !== "string" || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: "Transaction title is required",
      });
    }

    if (!["income", "expense"].includes(type)) {
      return res.status(400).json({
        success: false,
        message: "Type must be either 'income' or 'expense'",
      });
    }

    const result = await categorizeTransaction({
      title: title.trim(),
      description: typeof description === "string" ? description.trim() : "",
      type,
      userId: req.user?.userId,
    });

    return res.status(200).json({
      success: true,
      message: "Category suggested",
      data: {
        categoryId: result.categoryId,
        categoryName: result.categoryName,
      },
    });
  } catch (error) {
    console.error("AI categorization error: ", error);

    return res.status(500).json({
      success: false,
      message: "Unable to suggest a category",
    });
  }
}

export async function getInsights(req, res) {
  try {
    const { period = "week" } = req.query;

    if (!["week", "month"].includes(period)) {
      return res.status(400).json({
        success: false,
        message: "Period must be either 'week' or 'month'",
      });
    }

    const result = await generateInsights(req.user.userId, period);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("AI insights error: ", error);

    return res.status(500).json({
      success: false,
      message: "Unable to generate insights",
    });
  }
}

export async function getMonthlySummary(req, res) {
  try {
    const now = new Date();
    const year = Number(req.query.year ?? now.getFullYear());
    const month = Number(req.query.month ?? now.getMonth() + 1);

    if (!Number.isInteger(year) || year < 1920 || year > 2100) {
      return res.status(400).json({
        success: false,
        message: "Year must be an integer between 1920 and 2100",
      });
    }

    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return res.status(400).json({
        success: false,
        message: "Month must be an integer between 1 and 12",
      });
    }

    const result = await generateMonthlySummary(req.user.userId, year, month);

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("AI monthly summary error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to generate monthly summary",
    });
  }
}
