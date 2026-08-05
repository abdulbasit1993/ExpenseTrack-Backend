import dotenv from "dotenv";
dotenv.config();
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import { getDB } from "../config/db.js";

function validateUser(data) {
  const errors = [];

  if (!data.firstName) {
    errors.push("First name is required");
  }

  if (!data.lastName) {
    errors.push("Last name is required");
  }

  if (!data.email) {
    errors.push("Email is required");
  }

  if (!data.password?.trim()) {
    errors.push("Password is required");
  } else if (data.password.trim().length < 6) {
    errors.push("Password must be at least 6 characters long");
  }

  return errors;
}

function buildUser(payload) {
  return {
    firstName: payload.firstName.trim(),
    lastName: payload.lastName?.trim() || "",
    email: payload.email.toLowerCase().trim(),
    password: payload.password,
    monthlyBudget: 0,
    currency: "PKR",
    profileImage: "",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function registerUser(req, res) {
  try {
    const errors = validateUser(req.body);

    if (errors.length) {
      return res.status(400).json({
        success: false,
        errors,
      });
    }

    const db = getDB();

    const users = db.collection("users");

    const existingUser = await users.findOne({
      email: req.body.email.toLowerCase(),
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "User already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(req.body.password, 10);

    const user = buildUser({
      ...req.body,
      password: hashedPassword,
    });

    const result = await users.insertOne(user);

    const token = jwt.sign(
      { userId: result.insertedId },
      process.env.JWT_SECRET,
    );

    // remove password before sending
    const { password: _, ...userWithoutPassword } = user;

    return res.status(201).json({
      success: true,
      message: "User created successfully",
      data: {
        user: userWithoutPassword,
        token,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

export async function loginUser(req, res) {
  try {
    const { email, password } = req.body;

    // validation
    if (!email || !password?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    const db = getDB();

    const users = db.collection("users");

    // find user
    const user = await users.findOne({
      email: email.toLowerCase().trim(),
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // compare password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    // generate access token
    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, {
      expiresIn: "800d",
    });

    // remove password before sending
    const { password: _, ...userWithoutPassword } = user;

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        user: userWithoutPassword,
        token,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}

export async function getMe(req, res) {
  try {
    const db = getDB();

    const user = await db
      .collection("users")
      .findOne({ _id: req.user.userId }, { projection: { password: 0 } });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        user,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
}
