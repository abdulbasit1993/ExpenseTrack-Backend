import { categorizeTransaction } from "../services/ai/categorizationService.js";

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
