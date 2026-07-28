import mongoose from "mongoose";
import Match from "./Match.js";
import User from "./User.js";

const userInteractionSchema = new mongoose.Schema(
  {
    user1: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    user2: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    interactionType: {
      type: String,
      enum: [
        "like", // User1 liked User2 (in matching context)
        "dislike", // User1 disliked User2 (in matching context)
        "superlike", // User1 super-liked User2 (no underscore variant)
        "super_like", // User1 super-liked User2 (underscore variant from routes)
        "pass", // User1 passed on User2
        "block", // User1 blocked User2
        "unblock", // User1 unblocked User2
        "report", // User1 reported User2
        "follow", // User1 followed User2
        "unfollow", // User1 unfollowed User2
        "view", // User1 viewed User2's profile
        "message", // User1 sent message to User2
        "gift", // User1 sent gift to User2
        "subscription", // User1 subscribed to User2
      ],
      required: true,
    },
    context: {
      type: String,
      enum: [
        "matching", // In the arcade/matching context
        "profile", // On profile page
        "feed", // In the main feed
        "stream", // During live stream
        "chat", // In chat/messaging
        "search", // From search results
        "suggestions", // From suggested users
        "post", // From a post interaction
        "reel", // From a reel interaction
      ],
      default: "profile",
    },
    metadata: {
      // Additional data specific to interaction type
      postId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Post",
      },
      reelId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Reel",
      },
      streamId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Stream",
      },
      messageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Message",
      },
      reportId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Report",
      },
      giftType: String,
      giftValue: Number,
      subscriptionTier: String,
      deviceInfo: {
        type: String,
        default: "unknown",
      },
      ipAddress: String,
      userAgent: String,
      location: {
        country: String,
        city: String,
        coordinates: {
          latitude: Number,
          longitude: Number,
        },
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // For temporary interactions that should expire
    expiresAt: {
      type: Date,
    },
    // For tracking mutual interactions
    isMutual: {
      type: Boolean,
      default: false,
    },
    mutualAt: {
      type: Date,
    },
    // Interaction strength/weight for algorithm purposes
    weight: {
      type: Number,
      default: 1,
      min: 0,
      max: 10,
    },
    // For A/B testing and analytics
    experimentId: {
      type: String,
    },
    variant: {
      type: String,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Compound indexes for efficient queries
userInteractionSchema.index({ user1: 1, user2: 1, interactionType: 1 });
userInteractionSchema.index({ user1: 1, interactionType: 1, createdAt: -1 });
userInteractionSchema.index({ user2: 1, interactionType: 1, createdAt: -1 });
userInteractionSchema.index({ user1: 1, user2: 1, context: 1 });
userInteractionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
userInteractionSchema.index({ isActive: 1, createdAt: -1 });
userInteractionSchema.index({ context: 1, interactionType: 1 });

// Unique index to prevent duplicate interactions (for certain types)
userInteractionSchema.index(
  { user1: 1, user2: 1, interactionType: 1, context: 1 },
  {
    unique: true,
    partialFilterExpression: {
      interactionType: { $in: ["block", "follow"] },
      isActive: true,
    },
  }
);

// Virtual for interaction direction (requires viewer context; default to false)
userInteractionSchema.virtual("isOutgoing").get(function () {
  try {
    return false;
  } catch {
    return false;
  }
});

// Pre-save middleware
userInteractionSchema.pre("save", function (next) {
  // Set interaction weights based on type
  if (this.isNew) {
    switch (this.interactionType) {
      case "superlike":
        this.weight = 5;
        break;
      case "super_like":
        this.weight = 5;
        break;
      case "like":
        this.weight = 3;
        break;
      case "view":
        this.weight = 1;
        break;
      case "message":
        this.weight = 4;
        break;
      case "gift":
        this.weight = 8;
        break;
      case "subscription":
        this.weight = 10;
        break;
      case "block":
        this.weight = 0;
        break;
      case "dislike":
        this.weight = 0;
        break;
      default:
        this.weight = 2;
    }
  }
  next();
});

// Static method to record interaction
userInteractionSchema.statics.recordInteraction = async function (
  user1Id,
  user2Id,
  type,
  context = "profile",
  metadata = {}
) {
  try {
    // Check if this is a blocking action that should deactivate other interactions
    if (type === "block") {
      await this.updateMany(
        {
          $or: [
            { user1: user1Id, user2: user2Id },
            { user1: user2Id, user2: user1Id },
          ],
          isActive: true,
        },
        { isActive: false }
      );
    }

    // Check if this creates a mutual interaction
    let isMutual = false;
    let mutualAt = null;

    if (["like", "follow", "superlike"].includes(type)) {
      const reciprocalInteraction = await this.findOne({
        user1: user2Id,
        user2: user1Id,
        interactionType: type,
        isActive: true,
      });

      if (reciprocalInteraction) {
        isMutual = true;
        mutualAt = new Date();

        // Update the reciprocal interaction to be mutual as well
        reciprocalInteraction.isMutual = true;
        reciprocalInteraction.mutualAt = mutualAt;
        await reciprocalInteraction.save();
      }
    }

    // Create the interaction
    const interaction = new this({
      user1: user1Id,
      user2: user2Id,
      interactionType: type,
      context,
      metadata,
      isMutual,
      mutualAt,
    });

    return await interaction.save();
  } catch (error) {
    // Handle duplicate key errors gracefully
    if (error.code === 11000) {
      // Update existing interaction instead of creating duplicate
      return await this.findOneAndUpdate(
        {
          user1: user1Id,
          user2: user2Id,
          interactionType: type,
          context,
        },
        {
          metadata,
          updatedAt: new Date(),
          isActive: true,
        },
        { new: true, upsert: true }
      );
    }
    throw error;
  }
};

// Static method to get user interactions
userInteractionSchema.statics.getUserInteractions = async function (
  userId,
  options = {}
) {
  const {
    type,
    context,
    direction = "both", // 'outgoing', 'incoming', 'both'
    page = 1,
    limit = 20,
    includeInactive = false,
  } = options;

  const skip = (page - 1) * limit;
  let query = {};

  // Direction filter
  if (direction === "outgoing") {
    query.user1 = userId;
  } else if (direction === "incoming") {
    query.user2 = userId;
  } else {
    query.$or = [{ user1: userId }, { user2: userId }];
  }

  // Type filter
  if (type) {
    if (Array.isArray(type)) {
      query.interactionType = { $in: type };
    } else {
      query.interactionType = type;
    }
  }

  // Context filter
  if (context) query.context = context;

  // Active filter
  if (!includeInactive) query.isActive = true;

  const interactions = await this.find(query)
    .populate("user1", "username profilePicture isVerified")
    .populate("user2", "username profilePicture isVerified")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await this.countDocuments(query);

  return {
    interactions,
    pagination: {
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      hasMore: skip + interactions.length < total,
    },
  };
};

// Static method to check if interaction exists
userInteractionSchema.statics.hasInteraction = async function (
  user1Id,
  user2Id,
  type,
  context = null
) {
  const query = {
    user1: user1Id,
    user2: user2Id,
    interactionType: type,
    isActive: true,
  };

  if (context) query.context = context;

  return await this.findOne(query);
};

// Static method to get mutual interactions
userInteractionSchema.statics.getMutualInteractions = async function (
  user1Id,
  user2Id
) {
  return await this.find({
    $or: [
      { user1: user1Id, user2: user2Id, isMutual: true },
      { user1: user2Id, user2: user1Id, isMutual: true },
    ],
    isActive: true,
  }).sort({ mutualAt: -1 });
};

// Static method to get interaction analytics
userInteractionSchema.statics.getAnalytics = async function (
  userId,
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

  const analytics = await this.aggregate([
    {
      $match: {
        $or: [{ user1: userId }, { user2: userId }],
        createdAt: { $gte: startDate, $lte: endDate },
        isActive: true,
      },
    },
    {
      $group: {
        _id: "$interactionType",
        count: { $sum: 1 },
        incoming: {
          $sum: { $cond: [{ $eq: ["$user2", userId] }, 1, 0] },
        },
        outgoing: {
          $sum: { $cond: [{ $eq: ["$user1", userId] }, 1, 0] },
        },
        mutual: {
          $sum: { $cond: ["$isMutual", 1, 0] },
        },
      },
    },
  ]);

  return analytics;
};

// Instance method to deactivate interaction
userInteractionSchema.methods.deactivate = function (reason = "") {
  this.isActive = false;
  this.metadata.deactivatedAt = new Date();
  this.metadata.deactivationReason = reason;
  return this.save();
};

// Instance method to reactivate interaction
userInteractionSchema.methods.reactivate = function () {
  this.isActive = true;
  this.metadata.reactivatedAt = new Date();
  return this.save();
};

// Static: Return a list of potential match candidates for a user
userInteractionSchema.statics.getPotentialMatches = async function (
  userId,
  limit = 20
) {
  // Exclude: self, blocked users, and users you've already swiped on or matched with
  const me = await User.findById(userId).lean();
  const blocked = (me?.blockedUsers || []).map((id) => id.toString());

  const existingMatches = await Match.find({
    $or: [{ userId }, { matchedUserId: userId }],
  })
    .select("userId matchedUserId")
    .lean();

  const matchedIds = existingMatches
    .map((m) =>
      String(m.userId) === String(userId)
        ? String(m.matchedUserId)
        : String(m.userId)
    )
    .filter(Boolean);

  // Exclude users already interacted with (like/dislike/superlike/pass)
  const priorInteractions = await this.find({
    user1: userId,
    interactionType: {
      $in: ["like", "dislike", "superlike", "super_like", "pass"],
    },
    context: "matching",
    isActive: true,
  })
    .select("user2")
    .lean();
  const interactedIds = priorInteractions.map((i) => String(i.user2));

  const excludeIds = new Set([
    String(userId),
    ...blocked,
    ...matchedIds,
    ...interactedIds,
  ]);

  const users = await User.find({
    _id: { $nin: Array.from(excludeIds) },
    status: "active",
    isActive: true,
  })
    .select("username name avatar bio location isVerified")
    .limit(parseInt(limit));

  // Return simplified objects; the frontend normalizes shapes
  return users.map((u) => ({
    id: String(u._id),
    username: u.username,
    name: u.name || u.username,
    avatar: u.avatar || null,
    bio: u.bio || "",
    location: u.location || "",
    verified: !!u.isVerified,
    photos: u.avatar ? [u.avatar] : [],
  }));
};

// Static: Return a user's matches based on Match model
userInteractionSchema.statics.getUserMatches = async function (userId) {
  const matches = await Match.findUserMatches(userId).lean();

  return matches.map((m) => {
    const other =
      String(m.userId?._id || m.userId) === String(userId)
        ? m.matchedUserId
        : m.userId;
    const otherId = other && (other._id || other);
    return {
      id: String(m._id),
      user: other
        ? {
            id: String(otherId),
            username: other.username,
            name: other.name || other.username,
            avatar: other.avatar || m.matchedUserAvatar || null,
            verified: !!other.isVerified,
          }
        : null,
      matchedAt: m.matchDate || m.updatedAt || m.createdAt,
      unreadCount: m.unreadCount || 0,
      chatId: m.chatId || null,
    };
  });
};

// Basic stats for arcade
userInteractionSchema.statics.getUserStats = async function (userId) {
  const [likesGiven, likesReceived, matches] = await Promise.all([
    this.countDocuments({
      user1: userId,
      interactionType: { $in: ["like", "superlike", "super_like"] },
      isActive: true,
    }),
    this.countDocuments({
      user2: userId,
      interactionType: { $in: ["like", "superlike", "super_like"] },
      isActive: true,
    }),
    (await Match.findUserMatches(userId)).length,
  ]);

  return {
    likesGiven,
    likesReceived,
    matches,
  };
};

// Instance method: check for reciprocal like to form a match
userInteractionSchema.methods.checkForMatch = async function () {
  try {
    const type = this.interactionType;
    if (!["like", "superlike", "super_like"].includes(type)) return false;

    const reciprocal = await this.constructor
      .findOne({
        user1: this.user2,
        user2: this.user1,
        interactionType: { $in: ["like", "superlike", "super_like"] },
        isActive: true,
      })
      .lean();

    if (!reciprocal) return false;

    // Create or update Match docs for both directions
    const [me, other] = await Promise.all([
      User.findById(this.user1).select("name username avatar").lean(),
      User.findById(this.user2).select("name username avatar").lean(),
    ]);

    const ensureMatch = async (uid, mid, partner) => {
      let m = await Match.findOne({ userId: uid, matchedUserId: mid });
      const partnerName = partner?.name || partner?.username || "";
      const partnerAvatar = partner?.avatar || null;
      if (!m) {
        m = await Match.createMatch(
          uid,
          mid,
          partnerName,
          partnerAvatar,
          "mutual_like",
          0
        );
      } else {
        m.interactionType = "mutual_like";
        m.matchedUserName = partnerName;
        m.matchedUserAvatar = partnerAvatar;
        await m.save();
      }
      return m;
    };

    await Promise.all([
      ensureMatch(this.user1, this.user2, other),
      ensureMatch(this.user2, this.user1, me),
    ]);

    return true;
  } catch (e) {
    return false;
  }
};

export default mongoose.model("UserInteraction", userInteractionSchema);
