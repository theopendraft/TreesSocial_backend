import mongoose from "mongoose";

const contentReportSchema = new mongoose.Schema(
  {
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    targetType: {
      type: String,
      enum: ["post", "reel", "story", "comment"],
      required: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: 'targetType'
    },
    reportType: {
      type: String,
      enum: [
        "inappropriate_content",
        "harassment",
        "spam",
        "hate_speech",
        "violence",
        "sexual_content",
        "self_harm",
        "bullying",
        "misinformation",
        "copyright_violation",
        "privacy_violation",
        "scam",
        "other",
      ],
      required: true,
    },
    reason: {
      type: String,
      required: true,
      maxLength: 1000,
    },
    additionalInfo: {
      type: String,
      maxLength: 500,
    },
    severity: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
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
    adminNotes: {
      type: String,
      maxLength: 1000,
    },
    actionsTaken: [{
      action: {
        type: String,
        enum: ["warning_issued", "content_removed", "user_suspended", "user_banned", "no_action", "escalated"],
      },
      reason: String,
      timestamp: {
        type: Date,
        default: Date.now,
      },
      adminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    }],
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    metadata: {
      reporterIP: String,
      reporterUserAgent: String,
      location: String,
      timestamp: {
        type: Date,
        default: Date.now,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
contentReportSchema.index({ targetType: 1, targetId: 1 });
contentReportSchema.index({ reporter: 1 });
contentReportSchema.index({ status: 1 });
contentReportSchema.index({ priority: 1 });
contentReportSchema.index({ createdAt: -1 });

// Static methods
contentReportSchema.statics.getReportsByStatus = function(status) {
  return this.find({ status })
    .populate('reporter', 'username email profilePicture')
    .populate('assignedTo', 'username email')
    .sort({ createdAt: -1 });
};

contentReportSchema.statics.getHighPriorityReports = function() {
  return this.find({ 
    $or: [
      { priority: 'high' },
      { priority: 'urgent' },
      { severity: 'high' },
      { severity: 'urgent' }
    ]
  })
    .populate('reporter', 'username email profilePicture')
    .sort({ createdAt: -1 });
};

export default mongoose.model("ContentReport", contentReportSchema);