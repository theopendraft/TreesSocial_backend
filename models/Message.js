import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  chatId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chat',
    required: true
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true,
    maxlength: [1000, 'Message cannot be more than 1000 characters']
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'video', 'audio', 'file', 'location'],
    default: 'text'
  },
  mediaUrl: {
    type: String,
    maxlength: [500, 'Media URL cannot be more than 500 characters']
  },
  mediaType: {
    type: String,
    enum: ['image', 'video', 'audio', 'file']
  },
  mediaSize: {
    type: Number // Size in bytes
  },
  mediaDuration: {
    type: Number // Duration in seconds for audio/video
  },
  thumbnail: {
    type: String,
    maxlength: [500, 'Thumbnail URL cannot be more than 500 characters']
  },
  isPinned: {
    type: Boolean,
    default: false
  },
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: {
    type: Date
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date
  },
  readBy: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  reactions: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    emoji: {
      type: String,
      maxlength: 10
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  forwardedFrom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  }
}, {
  timestamps: true
});

// Index for efficient queries
messageSchema.index({ chatId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1 });
messageSchema.index({ isPinned: 1 });

// Virtual for read count
messageSchema.virtual('readCount').get(function() {
  return this.readBy.length;
});

// Virtual for reaction count
messageSchema.virtual('reactionCount').get(function() {
  return this.reactions.length;
});

// Method to mark as read
messageSchema.methods.markAsRead = function(userId) {
  const existingRead = this.readBy.find(read => read.userId.toString() === userId.toString());
  if (!existingRead) {
    this.readBy.push({ userId, readAt: new Date() });
  }
  return this.save();
};

// Method to add reaction
messageSchema.methods.addReaction = function(userId, emoji) {
  const existingReaction = this.reactions.find(
    reaction => reaction.userId.toString() === userId.toString()
  );
  
  if (existingReaction) {
    existingReaction.emoji = emoji;
    existingReaction.createdAt = new Date();
  } else {
    this.reactions.push({ userId, emoji, createdAt: new Date() });
  }
  
  return this.save();
};

// Method to remove reaction
messageSchema.methods.removeReaction = function(userId) {
  this.reactions = this.reactions.filter(
    reaction => reaction.userId.toString() !== userId.toString()
  );
  return this.save();
};

// Method to pin message
messageSchema.methods.pin = function() {
  this.isPinned = true;
  return this.save();
};

// Method to unpin message
messageSchema.methods.unpin = function() {
  this.isPinned = false;
  return this.save();
};

// Method to edit message
messageSchema.methods.edit = function(newContent) {
  this.content = newContent;
  this.isEdited = true;
  this.editedAt = new Date();
  return this.save();
};

// Method to delete message (soft delete)
messageSchema.methods.delete = function() {
  this.isDeleted = true;
  this.deletedAt = new Date();
  return this.save();
};

// Static method to find chat messages
messageSchema.statics.findChatMessages = function(chatId, limit = 50, skip = 0) {
  return this.find({
    chatId,
    isDeleted: false
  })
    .populate('senderId', 'username name avatar')
    .populate('replyTo', 'content senderId')
    .populate('readBy.userId', 'username name avatar')
    .populate('reactions.userId', 'username name avatar')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);
};

// Static method to find pinned messages
messageSchema.statics.findPinnedMessages = function(chatId) {
  return this.find({
    chatId,
    isPinned: true,
    isDeleted: false
  })
    .populate('senderId', 'username name avatar')
    .sort({ createdAt: -1 });
};

export default mongoose.model('Message', messageSchema);
