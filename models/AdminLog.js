import mongoose from "mongoose";

const adminLogSchema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        // User management
        "user_created",
        "user_updated",
        "user_deleted",
        "user_blocked",
        "user_unblocked",
        "user_verified",
        "user_unverified",
        "user_suspended",
        "user_unsuspended",
        "password_reset",

        // Content moderation
        "post_approved",
        "post_rejected",
        "post_deleted",
        "comment_deleted",
        "content_flagged",
        "content_unflagged",

        // Stream management
        "stream_ended",
        "stream_featured",
        "stream_unfeatured",
        "streamer_promoted",
        "streamer_demoted",

        // System management
        "setting_updated",
        "role_changed",
        "permission_granted",
        "permission_revoked",
        "bulk_action",

        // Analytics and reports
        "report_generated",
        "data_exported",
        "analytics_accessed",

        // PSA management
        "psa_created",
        "psa_updated",
        "psa_deleted",
        "psa_published",
        "psa_unpublished",

        // Security
        "login_attempt",
        "login_success",
        "login_failed",
        "logout",
        "security_breach",
        "suspicious_activity",

        // Subscription management
        "subscription_created",
        "subscription_cancelled",
        "refund_processed",

        // Other
        "other",
      ],
    },
    target: {
      targetType: {
        type: String,
        enum: [
          "user",
          "post",
          "comment",
          "stream",
          "subscription",
          "psa",
          "system",
          "report",
        ],
        required: true,
      },
      targetId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
      },
      targetName: {
        type: String,
        default: "",
      },
    },
    description: {
      type: String,
      required: true,
      maxLength: 1000,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    category: {
      type: String,
      enum: [
        "security",
        "moderation",
        "user_management",
        "content",
        "system",
        "analytics",
      ],
      required: true,
    },
    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },
    status: {
      type: String,
      enum: ["completed", "failed", "pending", "cancelled"],
      default: "completed",
    },
    ipAddress: {
      type: String,
      required: true,
    },
    userAgent: {
      type: String,
      default: "",
    },
    sessionId: {
      type: String,
      default: "",
    },
    requestId: {
      type: String,
      default: "",
    },
    duration: {
      type: Number, // in milliseconds
      default: 0,
    },
    affectedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    affectedCount: {
      type: Number,
      default: 0,
    },
    beforeState: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    afterState: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    metadata: {
      source: {
        type: String,
        enum: ["web", "mobile", "api", "system", "cron"],
        default: "web",
      },
      version: {
        type: String,
        default: "1.0.0",
      },
      feature: {
        type: String,
        default: "",
      },
      experimentId: {
        type: String,
        default: "",
      },
    },
    tags: [String],
    isReversible: {
      type: Boolean,
      default: false,
    },
    reversedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    reversedAt: {
      type: Date,
    },
    reverseReason: {
      type: String,
      default: "",
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
    archivedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for efficient querying
adminLogSchema.index({ admin: 1, createdAt: -1 });
adminLogSchema.index({ action: 1, createdAt: -1 });
adminLogSchema.index({ category: 1, createdAt: -1 });
adminLogSchema.index({ severity: 1, createdAt: -1 });
adminLogSchema.index({ "target.targetType": 1, "target.targetId": 1 });
adminLogSchema.index({ ipAddress: 1, createdAt: -1 });
adminLogSchema.index({ tags: 1 });
adminLogSchema.index({ isArchived: 1, createdAt: -1 });
adminLogSchema.index({ status: 1, createdAt: -1 });

// Text index for searching descriptions
adminLogSchema.index({ description: "text", "target.targetName": "text" });

// Virtual for time since action
adminLogSchema.virtual("timeAgo").get(function () {
  const now = new Date();
  const diff = now - this.createdAt;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "Just now";
});

// Virtual for formatted duration
adminLogSchema.virtual("formattedDuration").get(function () {
  if (this.duration < 1000) return `${this.duration}ms`;
  if (this.duration < 60000) return `${(this.duration / 1000).toFixed(1)}s`;
  return `${(this.duration / 60000).toFixed(1)}m`;
});

// Static method to log admin action
adminLogSchema.statics.logAction = async function (data) {
  const {
    admin,
    action,
    target,
    description,
    category,
    severity = "medium",
    details = {},
    ipAddress,
    userAgent = "",
    sessionId = "",
    beforeState = {},
    afterState = {},
    duration = 0,
    affectedUsers = [],
    tags = [],
    metadata = {},
  } = data;

  const log = new this({
    admin,
    action,
    target,
    description,
    category,
    severity,
    details,
    ipAddress,
    userAgent,
    sessionId,
    duration,
    beforeState,
    afterState,
    affectedUsers,
    affectedCount: affectedUsers.length,
    tags,
    metadata,
    requestId:
      metadata.requestId ||
      `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
  });

  return await log.save();
};

// Static method to get admin logs with filtering
adminLogSchema.statics.getLogs = async function (options = {}) {
  const {
    adminId,
    action,
    category,
    severity,
    targetType,
    targetId,
    startDate,
    endDate,
    search,
    page = 1,
    limit = 50,
    includeArchived = false,
  } = options;

  const skip = (page - 1) * limit;
  let query = {};

  if (adminId) query.admin = adminId;
  if (action) query.action = action;
  if (category) query.category = category;
  if (severity) query.severity = severity;
  if (targetType) query["target.targetType"] = targetType;
  if (targetId) query["target.targetId"] = targetId;
  if (!includeArchived) query.isArchived = false;

  // Date range filter
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  // Text search
  if (search) {
    query.$text = { $search: search };
  }

  const logs = await this.find(query)
    .populate("admin", "username email role")
    .populate("reversedBy", "username email")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await this.countDocuments(query);

  return {
    logs,
    pagination: {
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      hasMore: skip + logs.length < total,
    },
  };
};

// Static method to get admin activity summary
adminLogSchema.statics.getAdminActivity = async function (
  adminId,
  period = "30d"
) {
  const endDate = new Date();
  const startDate = new Date();

  switch (period) {
    case "24h":
      startDate.setHours(startDate.getHours() - 24);
      break;
    case "7d":
      startDate.setDate(startDate.getDate() - 7);
      break;
    case "30d":
      startDate.setDate(startDate.getDate() - 30);
      break;
    default:
      startDate.setDate(startDate.getDate() - 30);
  }

  const activity = await this.aggregate([
    {
      $match: {
        admin: adminId,
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: {
          action: "$action",
          category: "$category",
        },
        count: { $sum: 1 },
        lastPerformed: { $max: "$createdAt" },
      },
    },
    {
      $sort: { count: -1 },
    },
  ]);

  return activity;
};

// Static method to get system activity overview
adminLogSchema.statics.getSystemActivity = async function (period = "24h") {
  const endDate = new Date();
  const startDate = new Date();

  switch (period) {
    case "1h":
      startDate.setHours(startDate.getHours() - 1);
      break;
    case "24h":
      startDate.setHours(startDate.getHours() - 24);
      break;
    case "7d":
      startDate.setDate(startDate.getDate() - 7);
      break;
    default:
      startDate.setHours(startDate.getHours() - 24);
  }

  const overview = await this.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: {
          category: "$category",
          severity: "$severity",
        },
        count: { $sum: 1 },
        actions: { $addToSet: "$action" },
      },
    },
    {
      $group: {
        _id: "$_id.category",
        total: { $sum: "$count" },
        bySeverity: {
          $push: {
            severity: "$_id.severity",
            count: "$count",
          },
        },
        uniqueActions: { $sum: { $size: "$actions" } },
      },
    },
  ]);

  return overview;
};

// Static method to archive old logs
adminLogSchema.statics.archiveOldLogs = async function (daysOld = 90) {
  const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

  return this.updateMany(
    {
      createdAt: { $lt: cutoffDate },
      isArchived: false,
      severity: { $in: ["low", "medium"] },
    },
    {
      isArchived: true,
      archivedAt: new Date(),
    }
  );
};

// Instance method to reverse action (if reversible)
adminLogSchema.methods.reverse = function (reversedBy, reason = "") {
  if (!this.isReversible) {
    throw new Error("This action is not reversible");
  }

  this.reversedBy = reversedBy;
  this.reversedAt = new Date();
  this.reverseReason = reason;

  return this.save();
};

// Instance method to archive log
adminLogSchema.methods.archive = function () {
  this.isArchived = true;
  this.archivedAt = new Date();
  return this.save();
};

// Pre-save middleware to set request ID if not provided
adminLogSchema.pre("save", function (next) {
  if (this.isNew && !this.requestId) {
    this.requestId = `req_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
  }
  next();
});

export default mongoose.model("AdminLog", adminLogSchema);
