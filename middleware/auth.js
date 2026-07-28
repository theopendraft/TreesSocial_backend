import jwt from "jsonwebtoken";
import User from "../models/User.js";

// In-memory store for demo user data (persists across requests)
const demoUserStore = {
  following: [],
  followers: [],
};

// Protect routes - require authentication
export const protect = async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      // Get token from header
      token = req.headers.authorization.split(" ")[1];

      // Check for demo token (development only)
      if (token.startsWith("demo_token_") || token === "demo-token") {
        // Create a mock user for demo purposes with persistent following data
        req.user = {
          _id: "demo_user_id",
          id: "demo_user_id",
          username: "demo_user",
          email: "demo@example.com",
          name: "Demo User",
          following: demoUserStore.following, // Use persistent store
          followers: demoUserStore.followers, // Use persistent store
          role: "user",
          status: "active",
        };
        return next();
      }

      // Verify JWT token
      const decoded = jwt.verify(
        token,
        process.env.JWT_SECRET || "your-secret-key"
      );

      console.log("Decoded JWT:", decoded); // Debug log

      // Get user from the token (check both id and userId for compatibility)
      const userId = decoded.userId || decoded.id;
      req.user = await User.findById(userId).select("-password");

      if (!req.user) {
        console.log("User not found in DB, creating mock user for userId:", userId);
        // Create a mock user object for development
        req.user = {
          _id: userId,
          id: userId,
          username: decoded.username || "user_" + userId.substring(0, 8),
          email: decoded.email || `user_${userId}@example.com`,
          name: decoded.name || "Test User",
          role: decoded.role || "user",
          status: "active",
        };
      }

      next();
    } catch (error) {
      console.error("Token verification error:", error);
      return res.status(401).json({
        success: false,
        error: "Not authorized to access this route",
      });
    }
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: "Not authorized to access this route",
    });
  }
};

// Grant access to specific roles
export const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `User role ${req.user.role} is not authorized to access this route`,
      });
    }
    next();
  };
};

// Alias for protect function for backwards compatibility
export const authenticateToken = protect;

// Alias for protect function
export const auth = protect;

// Admin authentication - combines protect and admin authorization
export const adminAuth = (req, res, next) => {
  protect(req, res, (err) => {
    if (err) return next(err);
    authorize("admin")(req, res, next);
  });
};
