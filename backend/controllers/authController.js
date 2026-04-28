const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { signAccessToken } = require("../utils/jwt");

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const sanitizeName = (name) => String(name || "").replace(/\s+/g, " ").trim();
const sanitizeEmail = (email) => String(email || "").trim().toLowerCase();

const toAuthPayload = (user) => {
  const token = signAccessToken({
    sub: user._id.toString(),
    email: user.email,
    name: user.name,
  });

  return {
    token,
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
    },
  };
};

const register = async (req, res) => {
  try {
    const name = sanitizeName(req.body?.name);
    const email = sanitizeEmail(req.body?.email);
    const password = String(req.body?.password || "");

    if (name.length < 2) {
      return res.status(400).json({ message: "Name must be at least 2 characters." });
    }

    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "A valid email is required." });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters." });
    }

    const existing = await User.findOne({ email }).lean();
    if (existing) {
      return res.status(409).json({ message: "Email already in use." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const created = await User.create({
      name,
      email,
      passwordHash,
    });

    return res.status(201).json(toAuthPayload(created));
  } catch (error) {
    console.error("register failed:", error.message);
    return res.status(500).json({ message: "Failed to register." });
  }
};

const login = async (req, res) => {
  try {
    const email = sanitizeEmail(req.body?.email);
    const password = String(req.body?.password || "");

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required." });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    const matched = await bcrypt.compare(password, user.passwordHash);
    if (!matched) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    return res.status(200).json(toAuthPayload(user));
  } catch (error) {
    console.error("login failed:", error.message);
    return res.status(500).json({ message: "Failed to login." });
  }
};

const me = async (req, res) => {
  try {
    const user = await User.findById(req.user.id, { name: 1, email: 1 }).lean();
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    return res.status(200).json({
      id: user._id.toString(),
      name: user.name,
      email: user.email,
    });
  } catch (error) {
    console.error("me failed:", error.message);
    return res.status(500).json({ message: "Failed to fetch current user." });
  }
};

module.exports = {
  register,
  login,
  me,
};
