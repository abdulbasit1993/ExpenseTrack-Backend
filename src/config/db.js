import dotenv from "dotenv";
dotenv.config();

import { MongoClient } from "mongodb";

const uri = process.env.MONGO_URI;

const client = new MongoClient(uri);

let db;

const categoryUniqueIndex = {
  name: "userId_1_type_1_name_1",
  key: { userId: 1, type: 1, name: 1 },
};

const defaultCategories = [
  { name: "Salary", type: "income", icon: "wallet", color: "#22C55E" },
  { name: "Business", type: "income", icon: "building", color: "#0EA5E9" },
  { name: "Investments", type: "income", icon: "chart", color: "#8B5CF6" },

  { name: "Food", type: "expense", icon: "utensils", color: "#F59E0B" },
  { name: "Transport", type: "expense", icon: "car", color: "#3B82F6" },
  { name: "Other", type: "expense", icon: "circle", color: "#64748B" },
];

async function seedDefaultCategories() {
  const now = new Date();

  await db.collection("categories").bulkWrite(
    defaultCategories.map((category) => ({
      updateOne: {
        filter: {
          userId: null,
          name: category.name,
          type: category.type,
        },
        update: {
          $setOnInsert: {
            userId: null,
            name: category.name,
            type: category.type,
            icon: category.icon,
            color: category.color,
            isDefault: true,
            isArchived: false,
            createdAt: now,
            updatedAt: now,
          },
        },
        upsert: true,
      },
    })),
  );

  console.log("Default categories seeded successfully");
}

async function ensureCategoryUniqueIndex() {
  const categories = db.collection("categories");
  const indexes = await categories.listIndexes().toArray();
  const existingIndex = indexes.find(
    (index) => index.name === categoryUniqueIndex.name,
  );

  if (existingIndex) {
    const hasExpectedKey =
      JSON.stringify(existingIndex.key) === JSON.stringify(categoryUniqueIndex.key);

    if (!hasExpectedKey) {
      throw new Error(
        `The categories index "${categoryUniqueIndex.name}" has an unexpected key definition.`,
      );
    }

    if (!existingIndex.unique) {
      await categories.dropIndex(categoryUniqueIndex.name);
      console.log("Replaced legacy categories index with a unique index");
    }
  }

  await categories.createIndex(categoryUniqueIndex.key, {
    name: categoryUniqueIndex.name,
    unique: true,
  });
}

export async function connectDB() {
  await client.connect();

  db = client.db(process.env.DB_NAME);

  // create indexes
  await db.collection("users").createIndex({ email: 1 }, { unique: true });

  await ensureCategoryUniqueIndex();

  await db.collection("transactions").createIndex({
    userId: 1,
    date: -1,
  });

  await seedDefaultCategories();

  console.log("Database connected successfully");
}

export function getDB() {
  return db;
}
