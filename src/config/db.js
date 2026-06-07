import dotenv from "dotenv";
dotenv.config();
import { MongoClient } from "mongodb";

const uri = process.env.MONGO_URI;

const client = new MongoClient(uri);

let db;

export async function connectDB() {
  await client.connect();
  db = client.db(process.env.DB_NAME);

  // create indexes
  await db.collection("users").createIndex({ email: 1 }, { unique: true });

  console.log("Database connected successfully");
}

export function getDB() {
  return db;
}
