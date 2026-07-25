import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    type: {
      type: String,
      enum: [
        "like",
        "comment",
        "follow",
        "unfollow",
        "follow_request",
        "follow_request_accepted",
        "match",
        "message",
        "stream_start",
        "stream_end",
        "subscription",
        "gift",
        "mention",
        "share",
        "post_approved",
        "post_rejected",
        "account_warning",
        "account_suspended",
        "psa",
        "system",
        "admin",
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
      maxLength: 100,
    },
    message: {
      type: String,
      required: true,
      maxLength: 500,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    actionUrl: {
      type: String,
      default: "",
    },
    actionText: {
      type: String,
      default: "",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    category: {
      type: String,
      enum: ["social", "system", "promotional", "security"],
      default: "social",
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
    },
    isClicked: {
      type: Boolean,
      default: false,
    },
    clickedAt: {
      type: Date,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
    },
    expiresAt: {
      type: Date,
    },
    metadata: {
      deviceType: {
        type: String,
        enum: ["web", "mobile", "desktop"],
        default: "web",
      },
      platform: {
        type: String,
        enum: ["ios", "android", "web"],
        default: "web",
      },
      sent: {
        type: Boolean,
        default: false,
      },
      sentAt: {
        type: Date,
      },
      delivered: {
        type: Boolean,
        default: false,
      },
      deliveredAt: {
        type: Date,
      },
      retryCount: {
        type: Number,
        default: 0,
      },
    },
    settings: {
      allowSound: {
        type: Boolean,
        default: true,
      },
      allowVibration: {
        type: Boolean,
        default: true,
      },
      showPreview: {
        type: Boolean,
        default: true,
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
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, isRead: 1 });
notificationSchema.index({ type: 1, createdAt: -1 });
notificationSchema.index({ sender: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
notificationSchema.index({ isDeleted: 1, createdAt: -1 });

// Virtual for time since creation
notificationSchema.virtual("timeAgo").get(function () {
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

// Virtual for notification status
notificationSchema.virtual("status").get(function () {
  if (this.isDeleted) return "deleted";
  if (this.expiresAt && this.expiresAt < new Date()) return "expired";
  if (this.isRead) return "read";
  return "unread";
});

// Pre-save middleware
notificationSchema.pre("save", function (next) {
  // Set readAt timestamp when marking as read
  if (this.isModified("isRead") && this.isRead && !this.readAt) {
    this.readAt = new Date();
  }

  // Set clickedAt timestamp when marking as clicked
  if (this.isModified("isClicked") && this.isClicked && !this.clickedAt) {
    this.clickedAt = new Date();
  }

  // Set deletedAt timestamp when marking as deleted
  if (this.isModified("isDeleted") && this.isDeleted && !this.deletedAt) {
    this.deletedAt = new Date();
  }

  next();
});

// Static method to create notification
notificationSchema.statics.createNotification = async function (data) {
  const notification = new this(data);
  await notification.save();

  // Here you would trigger push notification if needed
  if (data.recipient) {
    await this.triggerPushNotification(notification);
  }

  return notification;
};

// Static method to mark multiple as read
notificationSchema.statics.markAsRead = async function (
  recipientId,
  notificationIds = []
) {
  const query = {
    recipient: recipientId,
    isRead: false,
    isDeleted: false,
  };

  if (notificationIds.length > 0) {
    query._id = { $in: notificationIds };
  }

  return this.updateMany(query, {
    isRead: true,
    readAt: new Date(),
  });
};

// Static method to get unread count
notificationSchema.statics.getUnreadCount = async function (recipientId) {
  return this.countDocuments({
    recipient: recipientId,
    isRead: false,
    isDeleted: false,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  });
};

// Static method to get notifications with pagination
notificationSchema.statics.getNotifications = async function (
  recipientId,
  options = {}
) {
  const { page = 1, limit = 20, type, category, unreadOnly = false } = options;

  const skip = (page - 1) * limit;

  let query = {
    recipient: recipientId,
    isDeleted: false,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  };

  if (type) query.type = type;
  if (category) query.category = category;
  if (unreadOnly) query.isRead = false;

  const notifications = await this.find(query)
    .populate("sender", "username profilePicture isVerified")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await this.countDocuments(query);

  return {
    notifications,
    pagination: {
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      hasMore: skip + notifications.length < total,
    },
  };
};

// Static method to clean up old notifications
notificationSchema.statics.cleanup = async function (daysOld = 30) {
  const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

  return this.deleteMany({
    $or: [
      { isDeleted: true, deletedAt: { $lt: cutoffDate } },
      { isRead: true, readAt: { $lt: cutoffDate } },
    ],
  });
};

// Instance method to mark as read
notificationSchema.methods.markAsRead = function () {
  this.isRead = true;
  this.readAt = new Date();
  return this.save();
};

// Instance method to mark as clicked
notificationSchema.methods.markAsClicked = function () {
  this.isClicked = true;
  this.clickedAt = new Date();
  if (!this.isRead) {
    this.isRead = true;
    this.readAt = new Date();
  }
  return this.save();
};

// Instance method to soft delete
notificationSchema.methods.softDelete = function () {
  this.isDeleted = true;
  this.deletedAt = new Date();
  return this.save();
};

// Static method to trigger push notification (placeholder)
notificationSchema.statics.triggerPushNotification = async function (
  notification
) {
  // Here you would integrate with your push notification service
  // Firebase, OneSignal, etc.
  console.log(
    `Push notification triggered for user ${notification.recipient}: ${notification.title}`
  );

  // Update metadata
  notification.metadata.sent = true;
  notification.metadata.sentAt = new Date();
  await notification.save();
};

// Static method to create bulk notifications
notificationSchema.statics.createBulkNotifications = async function (
  recipients,
  notificationData
) {
  const notifications = recipients.map((recipientId) => ({
    ...notificationData,
    recipient: recipientId,
  }));

  return this.insertMany(notifications);
};

export default mongoose.model("Notification", notificationSchema);
