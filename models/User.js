import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, "Please add a username"],
      unique: true,
      trim: true,
      maxlength: [50, "Username cannot be more than 50 characters"],
    },
    email: {
      type: String,
      required: [true, "Please add an email"],
      unique: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        "Please add a valid email",
      ],
    },
    phone: {
      type: String,
      unique: true,
      sparse: true, // allow many users without phone
      trim: true,
    },
    password: {
      type: String,
      required: [true, "Please add a password"],
      minlength: 6,
      select: false,
    },
    name: {
      type: String,
      required: [true, "Please add a name"],
      maxlength: [50, "Name cannot be more than 50 characters"],
    },
    avatar: {
      type: String,
      default: null,
    },
    bio: {
      type: String,
      maxlength: [500, "Bio cannot be more than 500 characters"],
    },
    location: {
      type: String,
      maxlength: [100, "Location cannot be more than 100 characters"],
    },
    website: {
      type: String,
      maxlength: [200, "Website cannot be more than 200 characters"],
    },
    isStreamer: {
      type: Boolean,
      default: false,
    },
    streamerProfile: {
      category: {
        type: String,
        enum: ["gaming", "music", "art", "education", "lifestyle", "other"],
        default: "other",
      },
      totalViews: {
        type: Number,
        default: 0,
      },
      totalStreams: {
        type: Number,
        default: 0,
      },
      isLive: {
        type: Boolean,
        default: false,
      },
      currentStreamId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Stream",
      },
    },
    role: {
      type: String,
      enum: ["user", "streamer", "admin", "moderator"],
      default: "user",
    },
    status: {
      type: String,
      enum: ["active", "suspended", "inactive"],
      default: "active",
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    badges: {
      type: [String],
      default: [],
      enum: ['Verified', 'Top Creator', 'Moderator', 'Early Adopter', 'Premium Member', 'Community Helper', 'Content Creator', 'Influencer']
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    blockedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    followers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    following: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    // Pending follow requests where this user is the recipient (incoming requests)
    followRequests: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    // Follow requests this user has sent to others (outgoing requests)
    sentFollowRequests: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    preferences: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserPreference",
    },
    settings: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserSettings",
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    emailVerified: {
      type: Boolean,
      default: false,
    },
    phoneVerified: {
      type: Boolean,
      default: false,
    },
    emailVerificationToken: String,
    emailVerificationExpires: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,
    loginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: Date,
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    twoFactorSecret: String,
    twoFactorBackupCodes: [String],
    subscriptionTiers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "StreamerTier",
      },
    ],
    activeSubscriptions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Subscription",
      },
    ],
    notifications: {
      email: {
        type: Boolean,
        default: true,
      },
      push: {
        type: Boolean,
        default: true,
      },
      sms: {
        type: Boolean,
        default: false,
      },
    },
    privacy: {
      profileVisibility: {
        type: String,
        enum: ["public", "friends", "private"],
        default: "public",
      },
      showOnlineStatus: {
        type: Boolean,
        default: true,
      },
      allowMessagesFrom: {
        type: String,
        enum: ["everyone", "friends", "none"],
        default: "everyone",
      },
      showLastSeen: {
        type: Boolean,
        default: true,
      },
      allowProfileViews: {
        type: Boolean,
        default: true,
      },
    },
    savedReels: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Reel",
      },
    ],
    savedPosts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Post",
      },
    ],
    matchingStatus: {
      type: String,
      enum: ["active", "paused", "suspended", "inactive"],
      default: "active",
    },
    suspensions: [
      {
        reason: String,
        suspendedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        suspendedAt: Date,
        expiresAt: Date,
        matchingSuspended: {
          type: Boolean,
          default: false,
        },
        messagingSuspended: {
          type: Boolean,
          default: false,
        },
        isActive: {
          type: Boolean,
          default: true,
        },
        unsuspendedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        unsuspendedAt: Date,
        unsuspendReason: String,
      },
    ],
    lastActive: {
      type: Date,
      default: Date.now,
    },
    deviceTokens: [String], // For push notifications
    loginHistory: [
      {
        ip: String,
        userAgent: String,
        timestamp: {
          type: Date,
          default: Date.now,
        },
        location: String,
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    banReason: {
      type: String,
      maxlength: [500, "Ban reason cannot be more than 500 characters"],
    },
    bannedAt: {
      type: Date,
    },
    banEndDate: {
      type: Date, // null for permanent ban
    },
    banHistory: [{
      reason: String,
      duration: Number, // days, null for permanent
      bannedAt: Date,
      bannedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      unbannedAt: Date,
      unbannedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }],
    deactivatedAt: Date,
    deletedAt: Date,
    stats: {
      totalPosts: {
        type: Number,
        default: 0,
      },
      totalLikes: {
        type: Number,
        default: 0,
      },
      totalComments: {
        type: Number,
        default: 0,
      },
      totalShares: {
        type: Number,
        default: 0,
      },
      totalViews: {
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

// Virtual for follower count
userSchema.virtual("followerCount").get(function () {
  return this.followers ? this.followers.length : 0;
});

// Virtual for following count
userSchema.virtual("followingCount").get(function () {
  return this.following ? this.following.length : 0;
});

// Virtual for post count
userSchema.virtual("postCount").get(function () {
  return this.stats && this.stats.totalPosts ? this.stats.totalPosts : 0;
});

// Index for search
userSchema.index({ username: "text", name: "text", bio: "text" });
// Unique sparse index on phone for availability
userSchema.index({ phone: 1 }, { unique: true, sparse: true });

// Encrypt password using bcrypt
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    // still continue to next middleware
  } else {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  // normalize fields for case-insensitive uniqueness
  if (this.isModified("username") && typeof this.username === "string") {
    this.username = this.username.toLowerCase();
  }
  if (this.isModified("email") && typeof this.email === "string") {
    this.email = this.email.toLowerCase();
  }
  next();
});

// Ensure normalization on findOneAndUpdate
userSchema.pre("findOneAndUpdate", function (next) {
  const update = this.getUpdate() || {};
  if (update.username && typeof update.username === "string") {
    update.username = update.username.toLowerCase();
  }
  if (update.email && typeof update.email === "string") {
    update.email = update.email.toLowerCase();
  }
  this.setUpdate(update);
  next();
});

// Match user entered password to hashed password in database
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Check if account is locked
userSchema.methods.isLocked = function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

// Increment login attempts
userSchema.methods.incLoginAttempts = function () {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 },
    });
  }

  const updates = { $inc: { loginAttempts: 1 } };

  // Lock account after 5 failed attempts
  if (this.loginAttempts + 1 >= 5 && !this.isLocked()) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
  }

  return this.updateOne(updates);
};

// Reset login attempts
userSchema.methods.resetLoginAttempts = function () {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 },
  });
};

// Update last active timestamp
userSchema.methods.updateLastActive = function () {
  return this.updateOne({
    $set: { lastActive: new Date() },
  });
};

export default mongoose.model("User", userSchema);
