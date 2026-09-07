import { OpenRouter } from "@openrouter/sdk";
import { getDB } from "../../config/db.js";

const openrouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
});

export async function categorizeTransaction({
  title,
  description = "",
  type,
  userId,
}) {
  const db = getDB();

  const categories = await db
    .collection("categories")
    .find({
      type,
      isArchived: false,
      $or: [{ userId: null }, { userId }],
    })
    .project({
      _id: 1,
      name: 1,
    })
    .toArray();

  if (!categories.length) {
    throw new Error("No categories are available for this transaction type");
  }

  const categoryOptions = categories.map((category) => ({
    id: category._id.toString(),
    name: category.name,
  }));

  const prompt = `
    Categorize the following transaction.

    Transaction:
    Title: ${title}
    Description: ${description}
    Type: ${type}

    Available categories:
    ${JSON.stringify(categoryOptions, null, 2)}

    Rules:
    - Choose exactly one category.
    - You MUST choose a category from the provided list.
    - Never invent a new category.
    - Return ONLY valid JSON.
    - The JSON must have exactly this format:

    {
        "categoryId": "the_selected_category_id"
    }
  `;

  const response = await openrouter.chat.send({
    chatRequest: {
      model: process.env.OPENROUTER_MODEL,

      messages: [
        {
          role: "system",
          content:
            "You are an expense categorization assistant. Follow the user's instructions exactly.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],

      temperature: 0,
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

  if (!result.categoryId || typeof result.categoryId !== "string") {
    throw new Error("AI response does not contain a valid category ID");
  }

  const selectedCategory = categories.find(
    (category) => category._id.toString() === result.categoryId,
  );

  if (!selectedCategory) {
    throw new Error("AI returned a category that is not available");
  }

  return {
    categoryId: selectedCategory._id,
    categoryName: selectedCategory.name,
  };
}
