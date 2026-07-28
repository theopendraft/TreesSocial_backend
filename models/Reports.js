
import mongoose from "mongoose";

const userReportSchema = new mongoose.Schema(
  {
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reportedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reportType: {
      type: String,
      enum: [
        "inappropriate_behavior",
        "harassment",
        "spam",
        "fake_profile",
        "inappropriate_content",
        "hate_speech",
        "bullying",
        "impersonation",
        "sexual_content",
        "violence",
        "self_harm",
        "illegal_activity",
        "copyright_violation",
        "privacy_violation",
        "scam",
        "underage",
        "other",
      ],
      required: true,
    },
    reason: {
      type: String,
      required: true,
      maxLength: 1000,
    },
    evidence: {
      screenshots: [
        {
          url: String,
          description: String,
          timestamp: {
            type: Date,
            default: Date.now,
          },
        },
      ],
      messages: [
        {
          content: String,
          timestamp: Date,
          messageId: mongoose.Schema.Types.ObjectId,
        },
      ],
      posts: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Post",
        },
      ],
      videos: [
        {
          url: String,
          description: String,
          timestamp: {
            type: Date,
            default: Date.now,
          },
        },
      ],
      urls: [String],
      additionalInfo: String,
    },
    status: {
      type: String,
      enum: ["pending", "under_review", "resolved", "dismissed", "escalated"],
      default: "pending",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    category: {
      type: String,
      enum: ["content", "behavior", "profile", "technical", "legal"],
      required: true,
    },
    severity: {
      type: Number,
      min: 1,
      max: 10,
      default: 5,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    assignedAt: Date,
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    reviewedAt: Date,
    resolution: {
      action: {
        type: String,
        enum: [
          "no_action",
          "warning_issued",
          "content_removed",
          "account_suspended",
          "account_banned",
          "feature_restricted",
          "escalated_to_legal",
          "referred_to_authorities",
          "other",
        ],
      },
      description: String,
      actionTaken: String,
      appealable: {
        type: Boolean,
        default: true,
      },
      appealDeadline: Date,
      automated: {
        type: Boolean,
        default: false,
      },
    },
    followUp: {
      required: {
        type: Boolean,
        default: false,
      },
      scheduledFor: Date,
      notes: String,
      completed: {
        type: Boolean,
        default: false,
      },
      completedAt: Date,
    },
    related: {
      reports: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Report",
        },
      ],
      users: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      ],
      pattern: String,
    },
    metadata: {
      reporterIP: String,
      reporterUserAgent: String,
      reporterLocation: {
        country: String,
        city: String,
        coordinates: {
          lat: Number,
          lng: Number,
        },
      },
      reportedUserLastActive: Date,
      reportedUserAccountAge: Number, // days
      platform: {
        type: String,
        enum: ["web", "ios", "android"],
        default: "web",
      },
      appVersion: String,
      sessionId: String,
    },
    communication: [
      {
        from: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        to: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        message: String,
        timestamp: {
          type: Date,
          default: Date.now,
        },
        type: {
          type: String,
          enum: ["internal_note", "user_communication", "system_update"],
          default: "internal_note",
        },
        attachments: [String],
      },
    ],
    escalation: {
      escalated: {
        type: Boolean,
        default: false,
      },
      escalatedAt: Date,
      escalatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      escalationReason: String,
      escalationLevel: {
        type: String,
        enum: ["supervisor", "manager", "legal", "external"],
        default: "supervisor",
      },
    },
    analytics: {
      reporterTrustScore: {
        type: Number,
        default: 50,
        min: 0,
        max: 100,
      },
      reportedUserRiskScore: {
        type: Number,
        default: 50,
        min: 0,
        max: 100,
      },
      similarReportsCount: {
        type: Number,
        default: 0,
      },
      processingTime: Number, // in minutes
      responseTime: Number, // in minutes
      satisfactionRating: {
        type: Number,
        min: 1,
        max: 5,
      },
    },
    tags: [String],
    confidential: {
      type: Boolean,
      default: false,
    },
    archived: {
      type: Boolean,
      default: false,
    },
    archivedAt: Date,
    expiresAt: Date,

    // Legal compliance
    gdprProcessed: {
      type: Boolean,
      default: false,
    },
    dataRetentionDays: {
      type: Number,
      default: 365,
    },
    anonymized: {
      type: Boolean,
      default: false,
    },
    anonymizedAt: Date,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for efficient querying
userReportSchema.index({ reporter: 1, createdAt: -1 });
userReportSchema.index({ reportedUser: 1, createdAt: -1 });
userReportSchema.index({ status: 1, priority: 1, createdAt: -1 });
userReportSchema.index({ reportType: 1, category: 1 });
userReportSchema.index({ assignedTo: 1, status: 1 });
userReportSchema.index({ reviewedBy: 1, reviewedAt: -1 });
userReportSchema.index({ tags: 1 });
userReportSchema.index({ archived: 1, createdAt: -1 });
userReportSchema.index({
  "escalation.escalated": 1,
  "escalation.escalatedAt": -1,
});
userReportSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Text search index
userReportSchema.index({
  reason: "text",
  "resolution.description": "text",
  "evidence.additionalInfo": "text",
});

// Compound indexes for complex queries
userReportSchema.index({ reportedUser: 1, reportType: 1, status: 1 });
userReportSchema.index({ category: 1, severity: 1, createdAt: -1 });

// Virtual for time since report
userReportSchema.virtual("timeAgo").get(function () {
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

// Virtual for processing time
userReportSchema.virtual("processingTimeDisplay").get(function () {
  if (!this.analytics.processingTime) return "N/A";

  const time = this.analytics.processingTime;
  if (time < 60) return `${time}m`;
  if (time < 1440) return `${Math.floor(time / 60)}h ${time % 60}m`;
  return `${Math.floor(time / 1440)}d ${Math.floor((time % 1440) / 60)}h`;
});

// Virtual for urgency score
userReportSchema.virtual("urgencyScore").get(function () {
  let score = this.severity;

  // Adjust based on priority
  switch (this.priority) {
    case "urgent":
      score += 3;
      break;
    case "high":
      score += 2;
      break;
    case "medium":
      score += 1;
      break;
    case "low":
      break;
  }

  // Adjust based on report type
  const highRiskTypes = ["harassment", "hate_speech", "violence", "self_harm"];
  if (highRiskTypes.includes(this.reportType)) score += 2;

  // Adjust based on similar reports
  if (this.analytics.similarReportsCount > 5) score += 2;
  if (this.analytics.similarReportsCount > 10) score += 3;

  return Math.min(score, 10);
});

// Static method to create a new report
userReportSchema.statics.createReport = async function (reportData) {
  const {
    reporter,
    reportedUser,
    reportType,
    reason,
    evidence = {},
    category,
    severity = 5,
    metadata = {},
  } = reportData;

  // Calculate initial priority
  let priority = "medium";
  if (severity >= 8) priority = "urgent";
  else if (severity >= 6) priority = "high";
  else if (severity <= 3) priority = "low";

  // Check for similar recent reports
  const similarReports = await this.countDocuments({
    reportedUser,
    reportType,
    createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
  });

  const report = new this({
    reporter,
    reportedUser,
    reportType,
    reason,
    evidence,
    category,
    severity,
    priority,
    metadata,
    analytics: {
      similarReportsCount: similarReports,
    },
  });

  // Auto-escalate if high risk
  if (report.urgencyScore >= 8) {
    report.priority = "urgent";
    report.escalation.escalated = true;
    report.escalation.escalatedAt = new Date();
    report.escalation.escalationReason =
      "Auto-escalated due to high urgency score";
  }

  return await report.save();
};

// Static method to get reports dashboard data
userReportSchema.statics.getDashboardData = async function (period = "30d") {
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

  const pipeline = [
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $facet: {
        statusBreakdown: [
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
            },
          },
        ],
        typeBreakdown: [
          {
            $group: {
              _id: "$reportType",
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
          { $limit: 10 },
        ],
        priorityBreakdown: [
          {
            $group: {
              _id: "$priority",
              count: { $sum: 1 },
            },
          },
        ],
        dailyTrend: [
          {
            $group: {
              _id: {
                $dateToString: {
                  format: "%Y-%m-%d",
                  date: "$createdAt",
                },
              },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ],
        averageProcessingTime: [
          {
            $match: {
              "analytics.processingTime": { $exists: true, $gt: 0 },
            },
          },
          {
            $group: {
              _id: null,
              avgTime: { $avg: "$analytics.processingTime" },
            },
          },
        ],
      },
    },
  ];

  const [result] = await this.aggregate(pipeline);
  return result;
};

// Static method to get user report history
userReportSchema.statics.getUserReportHistory = async function (
  userId,
  type = "both"
) {
  let query = {};

  if (type === "reported") {
    query.reportedUser = userId;
  } else if (type === "reporter") {
    query.reporter = userId;
  } else {
    query = {
      $or: [{ reportedUser: userId }, { reporter: userId }],
    };
  }

  return this.find(query)
    .populate("reporter", "username avatar")
    .populate("reportedUser", "username avatar")
    .populate("reviewedBy", "username")
    .sort({ createdAt: -1 });
};

// Static method to assign report to moderator
userReportSchema.statics.assignReport = async function (reportId, moderatorId) {
  return this.findByIdAndUpdate(
    reportId,
    {
      assignedTo: moderatorId,
      assignedAt: new Date(),
      status: "under_review",
    },
    { new: true }
  );
};

// Static method to bulk update reports
userReportSchema.statics.bulkUpdate = async function (reportIds, updateData) {
  return this.updateMany({ _id: { $in: reportIds } }, updateData);
};

// Instance method to resolve report
userReportSchema.methods.resolve = function (resolution, reviewerId) {
  this.status = "resolved";
  this.resolution = resolution;
  this.reviewedBy = reviewerId;
  this.reviewedAt = new Date();

  // Calculate processing time
  const processingTime = Math.floor((Date.now() - this.createdAt) / 60000);
  this.analytics.processingTime = processingTime;

  return this.save();
};

// Instance method to escalate report
userReportSchema.methods.escalate = function (escalationData) {
  this.escalation = {
    escalated: true,
    escalatedAt: new Date(),
    ...escalationData,
  };
  this.priority = "urgent";
  return this.save();
};

// Instance method to add communication
userReportSchema.methods.addCommunication = function (communicationData) {
  this.communication.push(communicationData);
  return this.save();
};

// Instance method to archive report
userReportSchema.methods.archive = function () {
  this.archived = true;
  this.archivedAt = new Date();
  return this.save();
};

// Pre-save middleware
userReportSchema.pre("save", function (next) {
  // Set expiration date based on data retention policy
  if (this.isNew && !this.expiresAt) {
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + this.dataRetentionDays);
    this.expiresAt = expirationDate;
  }

  // Auto-assign based on category and workload
  if (this.isNew && !this.assignedTo) {
    // This would be implemented based on your assignment logic
    // For now, we'll leave it unassigned
  }

  next();
});

// Post-save middleware for notifications
userReportSchema.post("save", async function (doc) {
  // Send notifications to assigned moderators
  if (doc.assignedTo && doc.isModified("assignedTo")) {
    // Implementation for notification service
    console.log(`Report ${doc._id} assigned to ${doc.assignedTo}`);
  }

  // Send escalation notifications
  if (doc.escalation.escalated && doc.isModified("escalation.escalated")) {
    console.log(`Report ${doc._id} escalated`);
  }
});

export default mongoose.model("Report", userReportSchema);
