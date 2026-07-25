import mongoose from "mongoose";

const matchSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    matchedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    matchedUserName: {
      type: String,
      required: true,
    },
    matchedUserAvatar: {
      type: String,
    },
    matchDate: {
      type: Date,
      default: Date.now,
    },
    lastMessage: {
      type: String,
      maxlength: [200, "Last message cannot be more than 200 characters"],
    },
    lastMessageDate: {
      type: Date,
    },
    unreadCount: {
      type: Number,
      default: 0,
    },
    // Messaging request/approval flow
    messageRequestPending: {
      type: Boolean,
      default: false,
    },
    messageRequestFrom: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    messagingApproved: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    matchScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    interactionType: {
      type: String,
      enum: ["like", "super_like", "mutual_like"],
      required: true,
    },
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chat",
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
matchSchema.index({ userId: 1, matchedUserId: 1 }, { unique: true });
matchSchema.index({ userId: 1, matchDate: -1 });
matchSchema.index({ matchedUserId: 1, matchDate: -1 });

// Virtual for match duration
matchSchema.virtual("matchDuration").get(function () {
  return Date.now() - this.matchDate.getTime();
});

// Method to update last message
matchSchema.methods.updateLastMessage = function (message, date) {
  this.lastMessage = message;
  this.lastMessageDate = date || new Date();
  return this.save();
};

// Method to increment unread count
matchSchema.methods.incrementUnread = function () {
  this.unreadCount += 1;
  return this.save();
};

// Method to reset unread count
matchSchema.methods.resetUnread = function () {
  this.unreadCount = 0;
  return this.save();
};

// Method to deactivate match
matchSchema.methods.deactivate = function () {
  this.isActive = false;
  return this.save();
};

// Static method to find user matches
matchSchema.statics.findUserMatches = function (userId) {
  return this.find({
    $or: [{ userId }, { matchedUserId: userId }],
    isActive: true,
  })
    .populate("userId", "username name avatar isOnline lastSeen")
    .populate("matchedUserId", "username name avatar isOnline lastSeen")
    .sort({ lastMessageDate: -1, matchDate: -1 });
};

// Static method to find specific match
matchSchema.statics.findMatch = function (userId1, userId2) {
  return this.findOne({
    $or: [
      { userId: userId1, matchedUserId: userId2 },
      { userId: userId2, matchedUserId: userId1 },
    ],
    isActive: true,
  });
};

// Static method to create match
matchSchema.statics.createMatch = function (
  userId1,
  userId2,
  matchedUserName,
  matchedUserAvatar,
  interactionType,
  matchScore = 0
) {
  return this.create({
    userId: userId1,
    matchedUserId: userId2,
    matchedUserName,
    matchedUserAvatar,
    interactionType,
    matchScore,
  });
};

export default mongoose.model("Match", matchSchema);
