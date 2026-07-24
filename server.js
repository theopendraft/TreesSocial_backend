import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { createServer } from "http";
import { Server } from "socket.io";

// Import routes
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import postRoutes from "./routes/posts.js";
import streamRoutes from "./routes/streams.js";
import matchRoutes from "./routes/matches.js";
import chatRoutes from "./routes/chat.js";
import adminRoutes from "./routes/admin.js";
import notificationRoutes from "./routes/notifications.js";
import subscriptionRoutes from "./routes/subscriptions.js";
import settingsRoutes from "./routes/settings.js";
import arcadeRoutes from "./routes/arcade.js";
import reportRoutes from "./routes/reports.js";
import contentReportRoutes from "./routes/contentReports.js";
import reelsRoutes from "./routes/reels.js";
import psaRoutes from "./routes/psa.js";
import analyticsRoutes from "./routes/analytics.js";
import staticRoutes from "./routes/static.js";
import matchmakingRoutes from "./routes/matchmaking.js";
import uploadRoutes from "./routes/upload.js";
import storiesRoutes from "./routes/stories.js";

// Import middleware
import { errorHandler } from "./middleware/errorHandler.js";
import { socketAuth } from "./middleware/socketAuth.js";
import User from "./models/User.js";

dotenv.config();

const app = express();
const server = createServer(app);

// Trust proxy - Required when behind Nginx
app.set('trust proxy', 1);

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  process.env.FRONTEND_URL,
  process.env.ADMIN_URL,
].filter(Boolean);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  },
});

// Rate limiting - Very generous limits for development
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 1 * 60 * 1000, // 1 minute
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 5000, // Increased to 5000 for development
  message: { error: "Too many requests from this IP, please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  // Trust proxy to get real IP address
  trustProxy: true,
  // Skip failed requests (don't count them)
  skipFailedRequests: true,
  // Skip successful requests (only count bad requests)
  skipSuccessfulRequests: false,
});

// Middleware (CORS MUST COME FIRST)
const corsOptions = {
  origin: allowedOrigins,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
};
app.use(cors(corsOptions));
// Explicit preflight support
app.options("*", cors(corsOptions));

app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
  })
);
app.use(compression());
app.use(morgan("combined"));
app.use(limiter);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Add request timeout for debugging
app.use((req, res, next) => {
  req.setTimeout(60000); // 60 seconds
  res.setTimeout(60000);
  next();
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/streams", streamRoutes);
app.use("/api/matches", matchRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/arcade", arcadeRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/content-reports", contentReportRoutes);
app.use("/api/reels", reelsRoutes);
app.use("/api/psa", psaRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/static", staticRoutes);
app.use("/api/admin/matchmaking", matchmakingRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/stories", storiesRoutes);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Socket.IO connection handling
io.use(socketAuth);
io.on("connection", (socket) => {
  console.log("User connected:", socket.userId);

  socket.join(`user_${socket.userId}`);

  // Mark user online
  if (socket.userId) {
    User.findByIdAndUpdate(socket.userId, { $set: { isOnline: true } }).catch(
      () => {}
    );
  }

  socket.on("join_chat", (chatId) => {
    socket.join(`chat_${chatId}`);
  });

  socket.on("send_message", (data) => {
    socket.to(`chat_${data.chatId}`).emit("new_message", data);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.userId);
    if (socket.userId) {
      User.findByIdAndUpdate(socket.userId, {
        $set: { isOnline: false, lastSeen: new Date() },
      }).catch(() => {});
    }
  });
});

// Error handling middleware
app.use(errorHandler);

// Database connection
mongoose
  .connect(
    process.env.MONGODB_URI ||
      "mongodb://localhost:27017/social-media-platform",
    {
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
    }
  )
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => {
    console.error("MongoDB connection error:", err);
    // Try to connect to local MongoDB as fallback
    console.log("Attempting to connect to local MongoDB...");
    return mongoose.connect("mongodb://localhost:27017/social-media-platform", {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
  })
  .then(() => console.log("Connected to local MongoDB"))
  .catch((err) => {
    console.error("Local MongoDB connection also failed:", err);
    console.log("Starting server without database connection...");
  });

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export { io };
