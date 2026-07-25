import mongoose from "mongoose";

const chatSchema = new mongoose.Schema(
  {
    chatType: {
      type: String,
      enum: ["arcade", "trees"],
      default: "trees",
      required: true,
    },
    matchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Match",
      required: false,
      default: null,
    },
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
      },
    ],
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
    pinnedMessages: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Message",
      },
    ],
    unreadCount: {
      type: Number,
      default: 0,
    },
    chatPin: {
      type: String,
      required: true,
      minlength: 4,
      maxlength: 6,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastActivity: {
      type: Date,
      default: Date.now,
    },
    isApproved: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
chatSchema.index({ participants: 1 });
chatSchema.index({ matchId: 1 });
chatSchema.index({ lastActivity: -1 });

// Virtual for participant count
chatSchema.virtual("participantCount").get(function () {
  return this.participants.length;
});

// Method to add participant
chatSchema.methods.addParticipant = function (userId) {
  if (!this.participants.includes(userId)) {
    this.participants.push(userId);
  }
  return this.save();
};

// Method to remove participant
chatSchema.methods.removeParticipant = function (userId) {
  this.participants = this.participants.filter(
    (id) => id.toString() !== userId.toString()
  );
  return this.save();
};

// Method to update last activity
chatSchema.methods.updateActivity = function () {
  this.lastActivity = new Date();
  return this.save();
};

// Method to increment unread count (global for chat for now)
chatSchema.methods.incrementUnread = function () {
  this.unreadCount += 1;
  return this.save();
};

// Method to reset unread count
chatSchema.methods.resetUnread = function () {
  this.unreadCount = 0;
  return this.save();
};

// Method to mark chat as read for a user (using single unread counter)
chatSchema.methods.markAsRead = function (/* userId */) {
  // For simplicity, we use a single unread counter
  this.unreadCount = 0;
  return this.save();
};

// Method to get unread count for a user (using single unread counter)
chatSchema.methods.getUnreadCount = function (/* userId */) {
  return this.unreadCount || 0;
};

// Method to update last message and activity
chatSchema.methods.updateLastMessage = function (messageDoc) {
  this.lastMessage = messageDoc._id || messageDoc;
  this.lastActivity = new Date();
  return this.save();
};

// Method to toggle pin message
chatSchema.methods.pinMessage = async function (messageId /*, userId*/) {
  const idx = this.pinnedMessages.findIndex(
    (mId) => mId.toString() === messageId.toString()
  );
  if (idx === -1) {
    this.pinnedMessages.push(messageId);
  } else {
    this.pinnedMessages.splice(idx, 1);
  }
  await this.save();
  return this;
};

// PIN helpers (compatibility)
chatSchema.methods.verifyPin = function (pin) {
  return this.chatPin && this.chatPin.toString() === pin.toString();
};

chatSchema.methods.generatePin = function () {
  // 4-digit simple PIN for now
  const pin = Math.floor(1000 + Math.random() * 9000).toString();
  this.chatPin = pin;
  return pin;
};

// Static method to find chat by participants
chatSchema.statics.findByParticipants = function (participantIds) {
  return this.findOne({
    participants: { $all: participantIds, $size: participantIds.length },
  });
};

// Static method to find user chats
chatSchema.statics.findUserChats = function (userId) {
  return this.find({
    participants: userId,
    isActive: true,
  })
    .populate(
      "participants",
      "username name fullName avatar isOnline lastSeen privacy.showOnlineStatus privacy.showLastSeen"
    )
    .populate("lastMessage", "content createdAt senderId")
    .sort({ lastActivity: -1 });
};

// Alias for routes expecting getUserChats
chatSchema.statics.getUserChats = function (userId, /*limit*/ _limit) {
  // For now ignore limit, caller can paginate
  return this.findUserChats(userId);
};

// Get chat with messages helper
chatSchema.statics.getChatWithMessages = async function (
  chatId,
  userId,
  page = 1,
  limit = 50
) {
  const skip = (page - 1) * limit;
  const chat = await this.findById(chatId)
    .populate(
      "participants",
      "username name fullName avatar isOnline lastSeen privacy.showOnlineStatus privacy.showLastSeen"
    )
    .populate("lastMessage");
  if (!chat) return null;
  const Message = (await import("./Message.js")).default;
  const messages = await Message.findChatMessages(chatId, limit, skip);
  const totalCount = await Message.countDocuments({ chatId, isDeleted: false });
  return {
    chat,
    messages,
    page,
    limit,
    total: totalCount,
    hasMore: totalCount > skip + messages.length,
  };
};

export default mongoose.model("Chat", chatSchema);
