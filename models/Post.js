import mongoose from "mongoose";

const postSchema = new mongoose.Schema(
  {
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    content: {
      type: String,
      required: true,
      maxlength: [2000, "Post content cannot be more than 2000 characters"],
    },
    media: [
      {
        type: {
          type: String,
          enum: ["image", "video", "audio", "file"],
          required: true,
        },
        url: {
          type: String,
          required: true,
          maxlength: [500, "Media URL cannot be more than 500 characters"],
        },
        thumbnail: {
          type: String,
          maxlength: [500, "Thumbnail URL cannot be more than 500 characters"],
        },
        duration: {
          type: Number, // Duration in seconds for video/audio
        },
        size: {
          type: Number, // Size in bytes
        },
        caption: {
          type: String,
          maxlength: [200, "Media caption cannot be more than 200 characters"],
        },
      },
    ],
    type: {
      type: String,
      enum: ["text", "image", "video", "audio", "file", "story", "reel"],
      default: "text",
    },
    visibility: {
      type: String,
      enum: ["public", "friends", "private"],
      default: "public",
    },
    location: {
      name: {
        type: String,
        maxlength: [100, "Location name cannot be more than 100 characters"],
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        validate: {
          validator: function (v) {
            return v.length === 2;
          },
          message:
            "Coordinates must be an array of 2 numbers [longitude, latitude]",
        },
      },
    },
    tags: [
      {
        type: String,
        maxlength: [50, "Tag cannot be more than 50 characters"],
      },
    ],
    mentions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    likes: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        likedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    comments: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        content: {
          type: String,
          required: true,
          maxlength: [500, "Comment cannot be more than 500 characters"],
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
        likes: [
          {
            userId: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "User",
            },
            likedAt: {
              type: Date,
              default: Date.now,
            },
          },
        ],
        replies: [
          {
            userId: {
              type: mongoose.Schema.Types.ObjectId,
              ref: "User",
            },
            content: {
              type: String,
              required: true,
              maxlength: [300, "Reply cannot be more than 300 characters"],
            },
            createdAt: {
              type: Date,
              default: Date.now,
            },
            likes: [
              {
                userId: {
                  type: mongoose.Schema.Types.ObjectId,
                  ref: "User",
                },
                likedAt: {
                  type: Date,
                  default: Date.now,
                },
              },
            ],
          },
        ],
      },
    ],
    shares: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        sharedAt: {
          type: Date,
          default: Date.now,
        },
        platform: {
          type: String,
          enum: ["internal", "facebook", "twitter", "instagram", "linkedin"],
        },
      },
    ],
    views: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        viewedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
    },
    isPinned: {
      type: Boolean,
      default: false,
    },
    isSponsored: {
      type: Boolean,
      default: false,
    },
    isStreaming: {
      type: Boolean,
      default: false,
    },
    streamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Stream",
    },
    engagement: {
      likes: {
        type: Number,
        default: 0,
      },
      comments: {
        type: Number,
        default: 0,
      },
      shares: {
        type: Number,
        default: 0,
      },
      views: {
        type: Number,
        default: 0,
      },
    },
    // Story-specific fields
    expiresAt: {
      type: Date,
      // Set expiration only for story type posts
      required: function () {
        return this.type === "story";
      },
    },
    metadata: {
      textOverlays: [
        {
          text: String,
          x: Number,
          y: Number,
          fontSize: Number,
          color: String,
          fontFamily: String,
        },
      ],
      stickers: [
        {
          emoji: String,
          x: Number,
          y: Number,
          size: Number,
        },
      ],
      backgroundColor: {
        type: String,
        default: "#000000",
      },
    },
    // PSA (Public Service Announcement) fields
    isPSA: {
      type: Boolean,
      default: false,
    },
    psaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PSA",
    },
    metadata: {
      isSystemPost: {
        type: Boolean,
        default: false,
      },
      systemAuthor: {
        type: String, // "trees" or other system identifier
      },
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
postSchema.index({ authorId: 1, createdAt: -1 });
postSchema.index({ visibility: 1, createdAt: -1 });
postSchema.index({ tags: 1 });
postSchema.index({ mentions: 1 });
postSchema.index({ "location.coordinates": "2dsphere" });
postSchema.index({ content: "text" });

// Virtual for like count
postSchema.virtual("likeCount").get(function () {
  return this.likes.length;
});

// Virtual for comment count
postSchema.virtual("commentCount").get(function () {
  return this.comments.length;
});

// Virtual for share count
postSchema.virtual("shareCount").get(function () {
  return this.shares.length;
});

// Virtual for view count
postSchema.virtual("viewCount").get(function () {
  return this.views.length;
});

// Method to add like
postSchema.methods.addLike = function (userId) {
  const existingLike = this.likes.find(
    (like) => like.userId.toString() === userId.toString()
  );
  if (!existingLike) {
    this.likes.push({ userId, likedAt: new Date() });
    this.engagement.likes = this.likes.length;
  }
  return this.save();
};

// Method to remove like
postSchema.methods.removeLike = function (userId) {
  this.likes = this.likes.filter(
    (like) => like.userId.toString() !== userId.toString()
  );
  this.engagement.likes = this.likes.length;
  return this.save();
};

// Method to add comment
postSchema.methods.addComment = function (userId, content) {
  this.comments.push({
    userId,
    content,
    createdAt: new Date(),
  });
  this.engagement.comments = this.comments.length;
  return this.save();
};

// Method to add view
postSchema.methods.addView = function (userId) {
  const existingView = this.views.find(
    (view) => view.userId.toString() === userId.toString()
  );
  if (!existingView) {
    this.views.push({ userId, viewedAt: new Date() });
    this.engagement.views = this.views.length;
  }
  return this.save();
};

// Method to add share
postSchema.methods.addShare = function (userId, platform = "internal") {
  this.shares.push({
    userId,
    sharedAt: new Date(),
    platform,
  });
  this.engagement.shares = this.shares.length;
  return this.save();
};

// Method to edit post
postSchema.methods.edit = function (newContent) {
  this.content = newContent;
  this.isEdited = true;
  this.editedAt = new Date();
  return this.save();
};

// Method to delete post (soft delete)
postSchema.methods.delete = function () {
  this.isDeleted = true;
  this.deletedAt = new Date();
  return this.save();
};

// Method to pin post
postSchema.methods.pin = function () {
  this.isPinned = true;
  return this.save();
};

// Method to unpin post
postSchema.methods.unpin = function () {
  this.isPinned = false;
  return this.save();
};

// Static method to find user posts
postSchema.statics.findUserPosts = function (userId, limit = 20, skip = 0) {
  return this.find({
    authorId: userId,
    isDeleted: false,
  })
    .populate("authorId", "username name avatar")
    .populate("likes.userId", "username name avatar")
    .populate("comments.userId", "username name avatar")
    .populate("mentions", "username name avatar")
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);
};

// Static method to find feed posts
postSchema.statics.findFeedPosts = function (userId, limit = 20, skip = 0) {
  return this.find({
    visibility: "public",
    isDeleted: false,
  })
    .populate("authorId", "username name avatar")
    .populate("likes.userId", "username name avatar")
    .populate("comments.userId", "username name avatar")
    .populate("mentions", "username name avatar")
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);
};

export default mongoose.model("Post", postSchema);
