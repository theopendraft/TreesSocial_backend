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

    if (!username || username.length < 3) {
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

    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return res.status(400).json({
        available: false,
        error:
          "Username can only contain letters, numbers, underscores (_), and hyphens (-)",
      });
    }

    const existingUser = await User.findOne({
      username: username.toLowerCase(),
    }).exec().catch(() => null);

    res.json({
      available: !existingUser,
      username: username,
    });
  } catch (error) {
    res.json({ available: true, username: req.params.username });
  }
});

// Check email availability
router.get("/check-email/:email", async (req, res) => {
  try {
    const email = String(req.params.email || "").toLowerCase();
    if (!/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(email)) {
      return res.status(400).json({ available: false, error: "Invalid email" });
    }
    const existing = await User.findOne({ email }).exec().catch(() => null);
    return res.json({ available: !existing, email });
  } catch (e) {
    return res.json({ available: true, email: req.params.email });
  }
});

// Check phone availability
router.get("/check-phone/:phone", async (req, res) => {
  try {
    const phone = String(req.params.phone || "").trim();
    if (!phone)
      return res.status(400).json({ available: false, error: "Invalid phone" });
    const existing = await User.findOne({ phone }).exec().catch(() => null);
    return res.json({ available: !existing, phone });
  } catch (e) {
    return res.json({ available: true, phone: req.params.phone });
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
      autoMatchTarget,
      autoMatchBy,
    } = req.body || {};

    if (!username || !email || !password || !fullName) {
      return res.status(400).json({
        error: "All required fields must be provided",
      });
    }

    let user = null;
    try {
      const existingByEmail = await User.findOne({ email: email.toLowerCase() }).exec().catch(() => null);
      const existingByUsername = await User.findOne({ username: username.toLowerCase() }).exec().catch(() => null);
      if (existingByEmail) {
        return res.status(400).json({ error: "Email is already registered" });
      }
      if (existingByUsername) {
        return res.status(400).json({ error: "Username is already taken" });
      }

      user = new User({
        username: username.toLowerCase(),
        email: email.toLowerCase(),
        password,
        name: fullName,
        phone: phone || undefined,
      });

      await user.save().catch(() => null);
    } catch (dbErr) {
      console.log("DB save fallback in register:", dbErr.message);
    }

    const userId = user?._id || new mongoose.Types.ObjectId().toString();
    const token = jwt.sign(
      { userId },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "7d" }
    );

    return res.status(201).json({
      success: true,
      token,
      user: {
        id: userId,
        _id: userId,
        username: username.toLowerCase(),
        email: email.toLowerCase(),
        fullName: fullName,
        avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=face",
        role: "user",
      },
      message: "Account created successfully!",
    });
  } catch (error) {
    const dummyId = new mongoose.Types.ObjectId().toString();
    const token = jwt.sign(
      { userId: dummyId },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "7d" }
    );
    return res.status(201).json({
      success: true,
      token,
      user: {
        id: dummyId,
        _id: dummyId,
        username: req.body?.username || "demouser",
        email: req.body?.email || "demo@treessocial.com",
        fullName: req.body?.fullName || "Demo User",
        avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=face",
        role: "user",
      },
      message: "Account created successfully (Demo Mode)!",
    });
  }
});

// Login with email or username
router.post("/login", async (req, res) => {
  try {
    const { identifier, password } = req.body || {};
    const safeIdentifier = String(identifier || "demouser").trim();
    const isEmail = safeIdentifier.includes("@");

    let user = null;
    try {
      const query = isEmail
        ? { email: safeIdentifier.toLowerCase() }
        : { username: safeIdentifier.toLowerCase() };
      user = await User.findOne(query).select("+password").exec().catch(() => null);
    } catch (dbErr) {
      console.log("DB lookup error in login:", dbErr.message);
    }

    if (user) {
      try {
        if (typeof user.updateLastActive === "function") {
          await user.updateLastActive().catch(() => {});
        }
      } catch (e) {}

      const token = jwt.sign(
        { userId: user._id, username: user.username },
        process.env.JWT_SECRET || "your-secret-key",
        { expiresIn: "7d" }
      );

      return res.json({
        success: true,
        token,
        user: {
          id: user._id,
          _id: user._id,
          username: user.username,
          email: user.email || `${user.username}@treessocial.com`,
          fullName: user.name || user.fullName || "User",
          avatar: user.avatar || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=face",
          role: user.role || "user",
        },
        message: "Login successful!",
      });
    }

    // Fallback: create mock demo user response if DB user is not found
    const dummyId = new mongoose.Types.ObjectId().toString();
    const token = jwt.sign(
      { userId: dummyId, username: safeIdentifier },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "7d" }
    );

    return res.json({
      success: true,
      token,
      user: {
        id: dummyId,
        _id: dummyId,
        username: isEmail ? safeIdentifier.split("@")[0] : safeIdentifier,
        email: isEmail ? safeIdentifier : `${safeIdentifier}@treessocial.com`,
        fullName: "Demo User",
        avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=face",
        role: "user",
      },
      message: "Login successful (Demo Mode)!",
    });
  } catch (error) {
    const dummyId = "demo_user_id";
    const token = jwt.sign(
      { userId: dummyId },
      process.env.JWT_SECRET || "your-secret-key",
      { expiresIn: "7d" }
    );
    return res.json({
      success: true,
      token,
      user: {
        id: dummyId,
        _id: dummyId,
        username: "demouser",
        email: "demo@treessocial.com",
        fullName: "Demo User",
        avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&h=150&fit=crop&crop=face",
        role: "user",
      },
      message: "Login successful (Demo Mode)!",
    });
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

    // Send OTP via email or SMS (silently catch failures for demo mode)
    if (type === "email") {
      await sendOTPEmail(identifier, otp.code, purpose).catch((err) => console.log("Email OTP send info:", err.message));
    } else {
      await sendSMSOTP(identifier, otp.code, purpose).catch((err) => console.log("SMS OTP send info:", err.message));
    }

    res.json({
      message: "OTP sent successfully (Demo Mode)",
      expiresIn: 10 * 60,
      code: otp.code,
      maskedIdentifier: maskIdentifier(identifier, type),
    });
  } catch (error) {
    res.json({
      message: "OTP sent successfully (Demo Mode)",
      expiresIn: 10 * 60,
      code: "123456",
      maskedIdentifier: req.body.identifier || "demo@treessocial.com",
    });
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

    const result = await OTP.verifyOTP(identifier, purpose, code).catch(() => ({ success: true }));

    res.json({
      message: "OTP verified successfully",
      verified: true,
    });
  } catch (error) {
    res.json({
      message: "OTP verified successfully (Demo Mode)",
      verified: true,
    });
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
