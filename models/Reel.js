import mongoose from "mongoose";

const reelSchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    videoUrl: {
      type: String,
      required: true,
    },
    videoPublicId: {
      type: String,
      default: "",
    },
    thumbnail: {
      type: String,
      default: "",
    },
    caption: {
      type: String,
      maxLength: 500,
      default: "",
    },
    tags: [
      {
        type: String,
        maxLength: 30,
      },
    ],
    category: {
      type: String,
      enum: [
        "general",
        "comedy",
        "dance",
        "music",
        "education",
        "sports",
        "gaming",
        "food",
        "travel",
        "fashion",
      ],
      default: "general",
    },
    duration: {
      type: Number, // in seconds
      default: 0,
    },
    views: {
      type: Number,
      default: 0,
    },
    viewers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    comments: [
      {
        author: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        text: {
          type: String,
          required: true,
          maxLength: 200,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
        likes: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
          },
        ],
      },
    ],
    shares: {
      type: Number,
      default: 0,
    },
    sharedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    reports: [
      {
        reporter: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        reason: String,
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    moderationStatus: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    quality: {
      type: String,
      enum: ["auto", "480p", "720p", "1080p"],
      default: "auto",
    },
    aspectRatio: {
      type: String,
      enum: ["9:16", "1:1", "16:9"],
      default: "9:16",
    },
    fileSize: {
      type: Number, // in bytes
      default: 0,
    },
    encoding: {
      codec: String,
      bitrate: Number,
      fps: Number,
    },
    analytics: {
      impressions: {
        type: Number,
        default: 0,
      },
      completionRate: {
        type: Number,
        default: 0,
      },
      avgWatchTime: {
        type: Number,
        default: 0,
      },
      engagementRate: {
        type: Number,
        default: 0,
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for better performance
reelSchema.index({ author: 1, createdAt: -1 });
reelSchema.index({ category: 1, createdAt: -1 });
reelSchema.index({ tags: 1 });
reelSchema.index({ isActive: 1, createdAt: -1 });
reelSchema.index({ views: -1 });
reelSchema.index({ likes: 1 });

// Virtual for engagement score
reelSchema.virtual("engagementScore").get(function () {
  const likes = this.likes ? this.likes.length : 0;
  const comments = this.comments ? this.comments.length : 0;
  const shares = this.shares || 0;
  const views = this.views || 1;

  return (((likes + comments * 2 + shares * 3) / views) * 100).toFixed(2);
});

// Virtual for like count
reelSchema.virtual("likesCount").get(function () {
  return this.likes ? this.likes.length : 0;
});

// Virtual for comment count
reelSchema.virtual("commentsCount").get(function () {
  return this.comments ? this.comments.length : 0;
});

// Pre-save middleware to update analytics
reelSchema.pre("save", function (next) {
  if (
    this.isModified("views") ||
    this.isModified("likes") ||
    this.isModified("comments")
  ) {
    const likes = this.likes ? this.likes.length : 0;
    const comments = this.comments ? this.comments.length : 0;
    const views = this.views || 1;

    this.analytics.engagementRate = (
      ((likes + comments) / views) *
      100
    ).toFixed(2);
  }
  next();
});

// Static method to get trending reels
reelSchema.statics.getTrending = function (limit = 20) {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  return this.aggregate([
    {
      $match: {
        isActive: true,
        createdAt: { $gte: oneDayAgo },
      },
    },
    {
      $addFields: {
        engagementScore: {
          $add: [
            { $size: { $ifNull: ["$likes", []] } },
            { $multiply: [{ $size: { $ifNull: ["$comments", []] } }, 2] },
            { $multiply: [{ $ifNull: ["$shares", 0] }, 3] },
            { $divide: [{ $ifNull: ["$views", 0] }, 10] },
          ],
        },
      },
    },
    {
      $sort: { engagementScore: -1 },
    },
    {
      $limit: limit,
    },
  ]);
};

// Instance method to calculate completion rate
reelSchema.methods.calculateCompletionRate = function () {
  if (this.analytics.impressions === 0) return 0;
  return ((this.views / this.analytics.impressions) * 100).toFixed(2);
};

export default mongoose.model("Reel", reelSchema);
