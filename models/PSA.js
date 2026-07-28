import mongoose from "mongoose";

const psaSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      maxLength: 100,
    },
    content: {
      type: String,
      required: true,
      maxLength: 1000,
    },
    type: {
      type: String,
      enum: [
        "general",
        "security",
        "maintenance",
        "feature",
        "promotion",
        "warning",
        "celebration",
      ],
      default: "general",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    status: {
      type: String,
      enum: ["draft", "scheduled", "active", "inactive", "expired"],
      default: "draft",
    },
    targetAudience: {
      all: {
        type: Boolean,
        default: true,
      },
      ageRange: {
        min: Number,
        max: Number,
      },
      gender: {
        type: String,
        enum: ["all", "male", "female", "other"],
      },
      location: String,
      interests: [String],
      userTypes: [
        {
          type: String,
          enum: ["regular", "premium", "verified", "creator", "new"],
        },
      ],
      excludeUsers: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      ],
    },
    scheduledFor: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    imageUrl: {
      type: String,
      default: "",
    },
    actionButton: {
      text: String,
      url: String,
      action: {
        type: String,
        enum: ["external_link", "internal_link", "app_action", "dismiss"],
      },
    },
    styling: {
      backgroundColor: {
        type: String,
        default: "#f3f4f6",
      },
      textColor: {
        type: String,
        default: "#111827",
      },
      borderColor: {
        type: String,
        default: "#d1d5db",
      },
      icon: {
        type: String,
        enum: [
          "info",
          "warning",
          "success",
          "error",
          "announcement",
          "gift",
          "star",
        ],
      },
    },
    displaySettings: {
      position: {
        type: String,
        enum: ["top", "bottom", "modal", "inline"],
        default: "top",
      },
      dismissible: {
        type: Boolean,
        default: true,
      },
      autoHide: {
        type: Boolean,
        default: false,
      },
      autoHideDelay: {
        type: Number,
        default: 5000, // milliseconds
      },
      showOnPages: [
        {
          type: String,
          enum: [
            "all",
            "home",
            "profile",
            "feed",
            "reels",
            "streams",
            "arcade",
            "chat",
          ],
        },
      ],
    },
    metrics: {
      sent: {
        type: Number,
        default: 0,
      },
      views: {
        type: Number,
        default: 0,
      },
      clicks: {
        type: Number,
        default: 0,
      },
      dismissals: {
        type: Number,
        default: 0,
      },
      viewUsers: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      ],
      clickUsers: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      ],
      dismissUsers: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      ],
      sentAt: Date,
      engagementRate: {
        type: Number,
        default: 0,
      },
      clickThroughRate: {
        type: Number,
        default: 0,
      },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    approvedAt: Date,
    tags: [String],
    isRecurring: {
      type: Boolean,
      default: false,
    },
    recurringSettings: {
      frequency: {
        type: String,
        enum: ["daily", "weekly", "monthly", "yearly"],
      },
      endDate: Date,
      daysOfWeek: [Number], // 0-6 (Sunday-Saturday)
      timeOfDay: String, // HH:MM format
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
psaSchema.index({ status: 1, scheduledFor: 1 });
psaSchema.index({ expiresAt: 1 });
psaSchema.index({ createdBy: 1, createdAt: -1 });
psaSchema.index({ type: 1, priority: -1 });
psaSchema.index({ "targetAudience.userTypes": 1 });

// Virtual for engagement rate calculation
psaSchema.virtual("calculatedEngagementRate").get(function () {
  if (this.metrics.views === 0) return 0;
  const engagements = this.metrics.clicks + this.metrics.dismissals;
  return ((engagements / this.metrics.views) * 100).toFixed(2);
});

// Virtual for click through rate
psaSchema.virtual("calculatedClickThroughRate").get(function () {
  if (this.metrics.views === 0) return 0;
  return ((this.metrics.clicks / this.metrics.views) * 100).toFixed(2);
});

// Virtual for status display
psaSchema.virtual("statusDisplay").get(function () {
  const now = new Date();

  if (this.status === "scheduled" && this.scheduledFor <= now) {
    return "active";
  }

  if (this.expiresAt && this.expiresAt <= now) {
    return "expired";
  }

  return this.status;
});

// Pre-save middleware to update metrics
psaSchema.pre("save", function (next) {
  if (
    this.isModified("metrics.views") ||
    this.isModified("metrics.clicks") ||
    this.isModified("metrics.dismissals")
  ) {
    if (this.metrics.views > 0) {
      const engagements = this.metrics.clicks + this.metrics.dismissals;
      this.metrics.engagementRate = (
        (engagements / this.metrics.views) *
        100
      ).toFixed(2);
      this.metrics.clickThroughRate = (
        (this.metrics.clicks / this.metrics.views) *
        100
      ).toFixed(2);
    }
  }
  next();
});

// Static method to get active PSAs for a user
psaSchema.statics.getActiveForUser = function (userId, userProfile = {}) {
  const now = new Date();

  let matchQuery = {
    status: "active",
    scheduledFor: { $lte: now },
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    "metrics.dismissUsers": { $ne: userId },
  };

  // Add targeting filters based on user profile
  if (userProfile.age && !this.targetAudience?.all) {
    if (this.targetAudience?.ageRange) {
      matchQuery["targetAudience.ageRange.min"] = { $lte: userProfile.age };
      matchQuery["targetAudience.ageRange.max"] = { $gte: userProfile.age };
    }
  }

  if (
    userProfile.gender &&
    this.targetAudience?.gender &&
    this.targetAudience.gender !== "all"
  ) {
    matchQuery["targetAudience.gender"] = userProfile.gender;
  }

  return this.find(matchQuery)
    .populate("createdBy", "username")
    .sort({ priority: -1, createdAt: -1 })
    .limit(5);
};

// Instance method to check if PSA is expired
psaSchema.methods.isExpired = function () {
  return this.expiresAt && this.expiresAt <= new Date();
};

// Instance method to check if PSA should be active
psaSchema.methods.shouldBeActive = function () {
  const now = new Date();
  return (
    this.status === "active" &&
    this.scheduledFor <= now &&
    (!this.expiresAt || this.expiresAt > now)
  );
};

// Instance method to get target user count (estimated)
psaSchema.methods.getEstimatedReach = async function () {
  const User = mongoose.model("User");

  if (this.targetAudience.all) {
    return await User.countDocuments({ isActive: true });
  }

  let query = { isActive: true };

  if (this.targetAudience.ageRange) {
    const { min, max } = this.targetAudience.ageRange;
    const minDate = new Date(Date.now() - max * 365 * 24 * 60 * 60 * 1000);
    const maxDate = new Date(Date.now() - min * 365 * 24 * 60 * 60 * 1000);
    query.dateOfBirth = { $gte: minDate, $lte: maxDate };
  }

  if (this.targetAudience.gender && this.targetAudience.gender !== "all") {
    query.gender = this.targetAudience.gender;
  }

  if (this.targetAudience.location) {
    query.location = { $regex: this.targetAudience.location, $options: "i" };
  }

  if (
    this.targetAudience.userTypes &&
    this.targetAudience.userTypes.length > 0
  ) {
    const typeQueries = [];

    this.targetAudience.userTypes.forEach((type) => {
      switch (type) {
        case "premium":
          typeQueries.push({ isPremium: true });
          break;
        case "verified":
          typeQueries.push({ isVerified: true });
          break;
        case "creator":
          typeQueries.push({ isCreator: true });
          break;
        case "new":
          const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          typeQueries.push({ createdAt: { $gte: thirtyDaysAgo } });
          break;
      }
    });

    if (typeQueries.length > 0) {
      query.$or = typeQueries;
    }
  }

  if (
    this.targetAudience.excludeUsers &&
    this.targetAudience.excludeUsers.length > 0
  ) {
    query._id = { $nin: this.targetAudience.excludeUsers };
  }

  return await User.countDocuments(query);
};

export default mongoose.model("PSA", psaSchema);
