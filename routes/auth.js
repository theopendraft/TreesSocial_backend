import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import OTP from "../models/OTP.js";
import { protect as authenticate } from "../middleware/auth.js";
import UserInteraction from "../models/UserInteraction.js";
import { sendOTPEmail } from "../services/emailService.js";

const router = express.Router();

// Check username availability
router.get("/check-username/:username", async (req, res) => {
  try {
    const { username } = req.params;

    // Username validation rules
    if (username.length < 3) {
      return res.status(400).json({
        available: false,
        error: "Username must be at least 3 characters long",
      });
    }

    if (username.length > 30) {
      return res.status(400).json({
        available: false,
        error: "Username must be less than 30 characters",
      });
    }

    // Only allow alphanumeric characters, underscores, and hyphens
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return res.status(400).json({
        available: false,
        error:
          "Username can only contain letters, numbers, underscores (_), and hyphens (-)",
      });
    }

    const existingUser = await User.findOne({
      username: username.toLowerCase(),
    });

    res.json({
      available: !existingUser,
      username: username,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check email availability
router.get("/check-email/:email", async (req, res) => {
  try {
    const email = String(req.params.email || "").toLowerCase();
    if (!/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(email)) {
      return res.status(400).json({ available: false, error: "Invalid email" });
    }
    const existing = await User.findOne({ email });
    return res.json({ available: !existing, email });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Check phone availability
router.get("/check-phone/:phone", async (req, res) => {
  try {
    const phone = String(req.params.phone || "").trim();
    if (!phone)
      return res.status(400).json({ available: false, error: "Invalid phone" });
    const existing = await User.findOne({ phone });
    return res.json({ available: !existing, phone });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Username suggestions endpoint
router.post("/username-suggestions", async (req, res) => {
  try {
    const { baseUsername } = req.body;

    if (!baseUsername || baseUsername.length < 2) {
      return res
        .status(400)
        .json({ error: "Base username must be at least 2 characters long" });
    }

    const suggestions = [];
    const base = baseUsername.toLowerCase().replace(/[^a-zA-Z0-9]/g, "");

    // Generate various combinations
    for (let i = 1; i <= 5; i++) {
      suggestions.push(`${base}${i}`);
    }

    // Add common suffixes
    const suffixes = [
      "user",
      "pro",
      "dev",
      "live",
      "stream",
      "gamer",
      "creator",
      "2024",
      "2025",
    ];
    suffixes.forEach((suffix) => {
      suggestions.push(`${base}_${suffix}`);
      suggestions.push(`${base}-${suffix}`);
    });

    // Add random combinations
    const randomWords = [
      "cool",
      "awesome",
      "best",
      "top",
      "super",
      "mega",
      "ultra",
    ];
    randomWords.forEach((word) => {
      suggestions.push(`${base}_${word}`);
      suggestions.push(`${base}-${word}`);
    });

    // Check availability and filter out taken usernames
    const availableSuggestions = [];
    for (const suggestion of suggestions) {
      const existingUser = await User.findOne({
        username: { $regex: new RegExp(`^${suggestion}$`, "i") },
      });
      if (!existingUser) {
        availableSuggestions.push(suggestion);
        if (availableSuggestions.length >= 8) break; // Limit to 8 suggestions
      }
    }

    res.json({ suggestions: availableSuggestions });
  } catch (error) {
    console.error("Username suggestions error:", error);
    res.status(500).json({ error: "Failed to generate username suggestions" });
  }
});

// Validate password strength
const validatePassword = (password) => {
  const validations = {
    length: password.length >= 8,
    number: /\d/.test(password),
    special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
  };

  const isValid = Object.values(validations).every(Boolean);

  return {
    isValid,
    validations,
    missing: Object.entries(validations)
      .filter(([_, valid]) => !valid)
      .map(([key]) => key),
  };
};

// Register
router.post("/register", async (req, res) => {
  try {
    const {
      username,
      email,
      password,
      fullName,
      phone,
      // Optional dev-only auto-match fields
      autoMatchTarget, // can be email, username, or id
      autoMatchBy, // one of 'email' | 'username' | 'id'
    } = req.body;

    // Validate required fields
    if (!username || !email || !password || !fullName) {
      return res.status(400).json({
        error: "All required fields must be provided",
      });
    }

    // Validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        error: "Password does not meet security requirements",
        passwordValidation: passwordValidation,
      });
    }

    // Check if user already exists (email/username/phone)
    const [existingByEmail, existingByUsername, existingByPhone] =
      await Promise.all([
        User.findOne({ email: email.toLowerCase() }),
        User.findOne({ username: username.toLowerCase() }),
        phone ? User.findOne({ phone: phone }) : null,
      ]);
    if (existingByEmail) {
      return res.status(400).json({ error: "Email is already registered" });
    }
    if (existingByUsername) {
      return res.status(400).json({ error: "Username is already taken" });
    }
    if (existingByPhone) {
      return res.status(400).json({ error: "Phone number is already in use" });
    }

    // Create new user
    const user = new User({
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      password,
      name: fullName, // Map fullName to name field
      phone: phone || undefined,
    });

    await user.save();

    // Dev/controlled feature: automatically create a match with a target user
    try {
      const allowAutoMatch =
        process.env.ALLOW_REGISTER_AUTOMATCH === "true" ||
        process.env.NODE_ENV !== "production";
      if (allowAutoMatch && autoMatchTarget) {
        let target = null;
        const by = String(autoMatchBy || "username").toLowerCase();
        if (by === "id") {
          target = await User.findById(autoMatchTarget);
        } else if (by === "email") {
          target = await User.findOne({
            email: String(autoMatchTarget).toLowerCase(),
          });
        } else {
          // default username
          target = await User.findOne({
            username: String(autoMatchTarget).toLowerCase(),
          });
        }
        if (target && String(target._id) !== String(user._id)) {
          const like = await UserInteraction.recordInteraction(
            user._id,
            target._id,
            "like",
            "matching"
          );
          await UserInteraction.recordInteraction(
            target._id,
            user._id,
            "like",
            "matching"
          );
          await like.checkForMatch();
        }
      }
    } catch (e) {
      // Do not fail registration on auto-match issues
      console.warn("Auto-match on register failed:", e?.message || e);
    }

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || "your-secret-key",
      {
        expiresIn: process.env.JWT_EXPIRES_IN || "7d",
      }
    );

    res.status(201).json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        fullName: user.name, // Use name field as fullName
        avatar: user.avatar,
        role: user.role,
      },
      message: "Account created successfully!",
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Login with email or username
router.post("/login", async (req, res) => {
  try {
    const { identifier, password } = req.body; // identifier can be email or username

    if (!identifier || !password) {
      return res
        .status(400)
        .json({ error: "Email/Username and password are required" });
    }

    // Determine if identifier is email or username
    const isEmail = identifier.includes("@");
    const query = isEmail
      ? { email: identifier.toLowerCase() }
      : { username: identifier.toLowerCase() };

    const user = await User.findOne(query).select("+password");
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (user.status !== "active") {
      return res.status(403).json({ error: "Account is suspended" });
    }

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || "your-secret-key",
      {
        expiresIn: process.env.JWT_EXPIRES_IN || "7d",
      }
    );

    await user.updateLastActive();

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        fullName: user.name, // Use name field as fullName
        avatar: user.avatar,
        role: user.role,
      },
      message: "Login successful!",
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get current user
router.get("/me", authenticate, async (req, res) => {
  try {
    if (req.user._id === "demo_user_id") {
      // For demo users, get following count by checking how many users have demo_user_id in followers
      const followedUsers = await User.find({
        followers: "demo_user_id",
      });

      return res.json({
        id: req.user._id,
        username: req.user.username,
        email: req.user.email,
        fullName: req.user.name,
        avatar: req.user.avatar,
        bio: req.user.bio,
        role: req.user.role,
        followers: req.user.followers || [],
        following: followedUsers.map((u) => u._id.toString()),
        verified: req.user.verified || false,
      });
    }

    // For regular users, get fresh data from database
    const user = await User.findById(req.user._id).select("-password");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      id: user._id,
      username: user.username,
      email: user.email,
      fullName: user.name,
      avatar: user.avatar,
      bio: user.bio,
      role: user.role,
      followers: user.followers || [],
      following: user.following || [],
      verified: user.isVerified || false,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Logout
router.post("/logout", authenticate, (req, res) => {
  res.json({ message: "Logged out successfully" });
});

// Send OTP for registration/login
router.post("/send-otp", async (req, res) => {
  try {
    const { identifier, type, purpose } = req.body;

    if (!identifier || !type || !purpose) {
      return res.status(400).json({
        error: "Identifier, type, and purpose are required",
      });
    }

    if (!["email", "sms"].includes(type)) {
      return res
        .status(400)
        .json({ error: "Invalid type. Must be email or sms" });
    }

    if (
      ![
        "registration",
        "login",
        "password_reset",
        "phone_verification",
        "email_verification",
      ].includes(purpose)
    ) {
      return res.status(400).json({ error: "Invalid purpose" });
    }

    // Check rate limiting
    const rateLimit = await OTP.checkRateLimit(identifier, purpose);
    if (rateLimit.isLimited) {
      return res.status(429).json({
        error: `Too many OTP requests. Try again later.`,
        retryAfter: rateLimit.windowMinutes * 60, // seconds
      });
    }

    // For registration, check if user already exists
    if (purpose === "registration") {
      const existingUser =
        type === "email"
          ? await User.findOne({ email: identifier })
          : await User.findOne({ phone: identifier });

      if (existingUser) {
        return res
          .status(400)
          .json({ error: "User already exists with this identifier" });
      }
    }

    // For login/password reset, check if user exists
    if (["login", "password_reset"].includes(purpose)) {
      const user =
        type === "email"
          ? await User.findOne({ email: identifier })
          : await User.findOne({ phone: identifier });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
    }

    // Create OTP
    const otp = await OTP.createOTP(identifier, type, purpose, {
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
    });

    // Send OTP via email or SMS
    if (type === "email") {
      await sendOTPEmail(identifier, otp.code, purpose);
    } else {
      // SMS sending would go here (Twilio, AWS SNS, etc.)
      await sendSMSOTP(identifier, otp.code, purpose);
    }

    res.json({
      message: "OTP sent successfully",
      expiresIn: 10 * 60, // 10 minutes in seconds
      maskedIdentifier: maskIdentifier(identifier, type),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Verify OTP
router.post("/verify-otp", async (req, res) => {
  try {
    const { identifier, purpose, code } = req.body;

    if (!identifier || !purpose || !code) {
      return res.status(400).json({
        error: "Identifier, purpose, and code are required",
      });
    }

    const result = await OTP.verifyOTP(identifier, purpose, code);

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json({
      message: "OTP verified successfully",
      verified: true,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Register with OTP verification
router.post("/register-with-otp", async (req, res) => {
  try {
    const {
      username,
      email,
      phone,
      password,
      name,
      otpCode,
      registrationType = "email", // 'email' or 'phone'
    } = req.body;

    // Validate required fields
    if (!username || !password || !name || !otpCode) {
      return res.status(400).json({
        error: "Username, password, name, and OTP code are required",
      });
    }

    const identifier = registrationType === "email" ? email : phone;
    if (!identifier) {
      return res.status(400).json({
        error: `${registrationType} is required for registration`,
      });
    }

    // Verify OTP first
    const otpResult = await OTP.verifyOTP(identifier, "registration", otpCode);
    if (!otpResult.success) {
      return res.status(400).json({ error: otpResult.error });
    }

    // Check if username is taken
    const existingUsername = await User.findOne({
      username: username.toLowerCase(),
    });
    if (existingUsername) {
      return res.status(400).json({ error: "Username already taken" });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
    });

    if (existingUser) {
      return res.status(400).json({ error: "User already exists" });
    }

    // Create user
    const userData = {
      username: username.toLowerCase(),
      password,
      name,
      emailVerified: registrationType === "email",
      phoneVerified: registrationType === "phone",
    };

    if (email) userData.email = email;
    if (phone) userData.phone = phone;

    const user = await User.create(userData);

    // Generate JWT
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.status(201).json({
      message: "User registered successfully",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        name: user.name,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Login with OTP
router.post("/login-with-otp", async (req, res) => {
  try {
    const { identifier, otpCode, type } = req.body;

    if (!identifier || !otpCode || !type) {
      return res.status(400).json({
        error: "Identifier, OTP code, and type are required",
      });
    }

    // Verify OTP
    const otpResult = await OTP.verifyOTP(identifier, "login", otpCode);
    if (!otpResult.success) {
      return res.status(400).json({ error: otpResult.error });
    }

    // Find user
    const user =
      type === "email"
        ? await User.findOne({ email: identifier })
        : await User.findOne({ phone: identifier });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.isBlocked) {
      return res.status(403).json({ error: "Account is blocked" });
    }

    // Update last login
    user.lastActive = new Date();
    user.isOnline = true;

    // Add to login history
    user.loginHistory.push({
      ip: req.ip,
      userAgent: req.get("User-Agent"),
      timestamp: new Date(),
    });

    await user.save();

    // Generate JWT
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        phone: user.phone,
        name: user.name,
        profilePicture: user.profilePicture,
        isVerified: user.isVerified,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Reset password with OTP
router.post("/reset-password-otp", async (req, res) => {
  try {
    const { identifier, otpCode, newPassword, type } = req.body;

    if (!identifier || !otpCode || !newPassword || !type) {
      return res.status(400).json({
        error: "Identifier, OTP code, new password, and type are required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        error: "Password must be at least 6 characters long",
      });
    }

    // Verify OTP
    const otpResult = await OTP.verifyOTP(
      identifier,
      "password_reset",
      otpCode
    );
    if (!otpResult.success) {
      return res.status(400).json({ error: otpResult.error });
    }

    // Find user
    const user =
      type === "email"
        ? await User.findOne({ email: identifier }).select("+password")
        : await User.findOne({ phone: identifier }).select("+password");

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Update password
    user.password = newPassword; // Will be hashed by pre-save middleware
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.loginAttempts = 0;
    user.lockUntil = undefined;

    await user.save();

    res.json({ message: "Password reset successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper functions
function maskIdentifier(identifier, type) {
  if (type === "email") {
    const [local, domain] = identifier.split("@");
    const maskedLocal =
      local.length > 2
        ? local.substring(0, 2) + "*".repeat(local.length - 2)
        : "*".repeat(local.length);
    return `${maskedLocal}@${domain}`;
  } else {
    // Phone number
    return identifier.length > 4
      ? "*".repeat(identifier.length - 4) + identifier.slice(-4)
      : "*".repeat(identifier.length);
  }
}

async function sendSMSOTP(phone, code, purpose) {
  // Integrate with your SMS service (Twilio, AWS SNS, etc.)
  console.log(`📱 SMS OTP to ${phone}: ${code} for ${purpose}`);
  // TODO: Implement SMS service integration
  // Example: await twilioClient.messages.create({ to: phone, body: `Your Trees Social code is: ${code}` });
}

// Get current user profile
router.get("/profile", authenticate, async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "User not authenticated",
      });
    }

    const userId = req.user.id || req.user._id;
    const user = await User.findById(userId).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Transform user data to match frontend expectations
    const userData = {
      id: user._id.toString(),
      username: user.username,
      email: user.email,
      fullName: user.name,
      avatar: user.avatar,
      bio: user.bio,
      location: user.location,
      website: user.website,
      isStreamer: user.isStreamer,
      followingCount: user.following ? user.following.length : 0,
      followerCount: user.followers ? user.followers.length : 0,
      streamerProfile: user.streamerProfile,
    };

    res.json({
      success: true,
      data: userData,
      message: "Profile retrieved successfully",
    });
  } catch (error) {
    console.error("Error getting profile:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
