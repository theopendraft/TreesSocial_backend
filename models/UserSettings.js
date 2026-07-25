import mongoose from "mongoose";

const userSettingsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    account: {
      emailNotifications: {
        type: Boolean,
        default: true,
      },
      pushNotifications: {
        type: Boolean,
        default: true,
      },
      smsNotifications: {
        type: Boolean,
        default: false,
      },
      marketingEmails: {
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
    notifications: {
      newMatches: {
        type: Boolean,
        default: true,
      },
      messages: {
        type: Boolean,
        default: true,
      },
      likes: {
        type: Boolean,
        default: true,
      },
      superLikes: {
        type: Boolean,
        default: true,
      },
      subscriptionUpdates: {
        type: Boolean,
        default: true,
      },
      streamNotifications: {
        type: Boolean,
        default: true,
      },
    },
    app: {
      theme: {
        type: String,
        enum: ["light", "dark", "system"],
        default: "system",
      },
      language: {
        type: String,
        default: "en",
      },
      timezone: {
        type: String,
        default: "UTC",
      },
      autoPlayVideos: {
        type: Boolean,
        default: true,
      },
      soundEffects: {
        type: Boolean,
        default: true,
      },
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
userSettingsSchema.index({ userId: 1 });

// Instance methods for accessing and updating settings in categories
userSettingsSchema.methods.getAllSettings = function () {
  return {
    account: this.account || {},
    privacy: this.privacy || {},
    notifications: this.notifications || {},
    app: this.app || {},
  };
};

userSettingsSchema.methods.getSettingsByCategory = function (category) {
  if (!["account", "privacy", "notifications", "app"].includes(category)) {
    throw new Error(`Invalid settings category: ${category}`);
  }
  return this[category] || {};
};

userSettingsSchema.methods.updateSettingsByCategory = async function (
  category,
  updates
) {
  if (!["account", "privacy", "notifications", "app"].includes(category)) {
    throw new Error(`Invalid settings category: ${category}`);
  }
  this[category] = {
    ...(this[category] ? this[category].toObject?.() || this[category] : {}),
    ...updates,
  };
  await this.save();
  return this.getSettingsByCategory(category);
};

export default mongoose.model("UserSettings", userSettingsSchema);
