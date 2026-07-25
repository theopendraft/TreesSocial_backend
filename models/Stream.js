import mongoose from 'mongoose';

const streamSchema = new mongoose.Schema({
  streamerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true,
    maxlength: [100, 'Stream title cannot be more than 100 characters']
  },
  description: {
    type: String,
    maxlength: [500, 'Stream description cannot be more than 500 characters']
  },
  category: {
    type: String,
    enum: ['gaming', 'music', 'art', 'education', 'lifestyle', 'other'],
    default: 'other'
  },
  tags: [{
    type: String,
    maxlength: [50, 'Tag cannot be more than 50 characters']
  }],
  status: {
    type: String,
    enum: ['scheduled', 'live', 'ended', 'cancelled'],
    default: 'scheduled'
  },
  scheduledAt: {
    type: Date
  },
  startedAt: {
    type: Date
  },
  endedAt: {
    type: Date
  },
  duration: {
    type: Number, // Duration in seconds
    default: 0
  },
  streamKey: {
    type: String,
    required: true,
    unique: true
  },
  streamUrl: {
    type: String,
    maxlength: [500, 'Stream URL cannot be more than 500 characters']
  },
  videoSdkRoomId: {
    type: String,
    maxlength: [100, 'VideoSDK Room ID cannot be more than 100 characters']
  },
  isRecording: {
    type: Boolean,
    default: false
  },
  thumbnail: {
    type: String,
    maxlength: [500, 'Thumbnail URL cannot be more than 500 characters']
  },
  isPrivate: {
    type: Boolean,
    default: false
  },
  isAgeRestricted: {
    type: Boolean,
    default: false
  },
  maxViewers: {
    type: Number,
    default: null // null means unlimited
  },
  currentViewers: {
    type: Number,
    default: 0
  },
  totalViews: {
    type: Number,
    default: 0
  },
  peakViewers: {
    type: Number,
    default: 0
  },
  viewers: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    leftAt: {
      type: Date
    },
    watchTime: {
      type: Number, // Watch time in seconds
      default: 0
    }
  }],
  likes: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    likedAt: {
      type: Date,
      default: Date.now
    }
  }],
  comments: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    content: {
      type: String,
      required: true,
      maxlength: [200, 'Comment cannot be more than 200 characters']
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    isModerated: {
      type: Boolean,
      default: false
    }
  }],
  donations: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01
    },
    message: {
      type: String,
      maxlength: [200, 'Donation message cannot be more than 200 characters']
    },
    donatedAt: {
      type: Date,
      default: Date.now
    }
  }],
  subscriptions: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    tier: {
      type: String,
      enum: ['gold', 'diamond', 'chrome']
    },
    subscribedAt: {
      type: Date,
      default: Date.now
    }
  }],
  settings: {
    allowComments: {
      type: Boolean,
      default: true
    },
    allowDonations: {
      type: Boolean,
      default: true
    },
    allowSubscriptions: {
      type: Boolean,
      default: true
    },
    chatMode: {
      type: String,
      enum: ['public', 'subscribers_only', 'moderators_only', 'disabled'],
      default: 'public'
    },
    slowMode: {
      type: Boolean,
      default: false
    },
    slowModeInterval: {
      type: Number,
      default: 5 // seconds
    }
  },
  recording: {
    isRecording: {
      type: Boolean,
      default: false
    },
    recordingUrl: {
      type: String,
      maxlength: [500, 'Recording URL cannot be more than 500 characters']
    },
    recordingDuration: {
      type: Number,
      default: 0
    }
  },
  analytics: {
    uniqueViewers: {
      type: Number,
      default: 0
    },
    averageWatchTime: {
      type: Number,
      default: 0
    },
    engagementRate: {
      type: Number,
      default: 0
    },
    totalDonations: {
      type: Number,
      default: 0
    },
    totalSubscriptions: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true
});

// Index for efficient queries
streamSchema.index({ streamerId: 1, status: 1 });
streamSchema.index({ status: 1, scheduledAt: 1 });
streamSchema.index({ category: 1, status: 1 });
streamSchema.index({ tags: 1 });
streamSchema.index({ streamKey: 1 });

// Virtual for is live
streamSchema.virtual('isLive').get(function() {
  return this.status === 'live';
});

// Virtual for is scheduled
streamSchema.virtual('isScheduled').get(function() {
  return this.status === 'scheduled';
});

// Virtual for like count
streamSchema.virtual('likeCount').get(function() {
  return this.likes.length;
});

// Virtual for comment count
streamSchema.virtual('commentCount').get(function() {
  return this.comments.length;
});

// Virtual for donation count
streamSchema.virtual('donationCount').get(function() {
  return this.donations.length;
});

// Virtual for subscription count
streamSchema.virtual('subscriptionCount').get(function() {
  return this.subscriptions.length;
});

// Method to start stream
streamSchema.methods.start = function() {
  this.status = 'live';
  this.startedAt = new Date();
  return this.save();
};

// Method to end stream
streamSchema.methods.end = function() {
  this.status = 'ended';
  this.endedAt = new Date();
  if (this.startedAt) {
    this.duration = Math.floor((this.endedAt - this.startedAt) / 1000);
  }
  return this.save();
};

// Method to add viewer
streamSchema.methods.addViewer = function(userId) {
  const existingViewer = this.viewers.find(viewer => 
    viewer.userId.toString() === userId.toString() && !viewer.leftAt
  );
  
  if (!existingViewer) {
    this.viewers.push({ userId, joinedAt: new Date() });
    this.currentViewers = this.viewers.filter(v => !v.leftAt).length;
    this.totalViews += 1;
    this.peakViewers = Math.max(this.peakViewers, this.currentViewers);
  }
  
  return this.save();
};

// Method to remove viewer
streamSchema.methods.removeViewer = function(userId) {
  const viewer = this.viewers.find(v => 
    v.userId.toString() === userId.toString() && !v.leftAt
  );
  
  if (viewer) {
    viewer.leftAt = new Date();
    if (viewer.joinedAt) {
      viewer.watchTime = Math.floor((viewer.leftAt - viewer.joinedAt) / 1000);
    }
    this.currentViewers = this.viewers.filter(v => !v.leftAt).length;
  }
  
  return this.save();
};

// Method to add like
streamSchema.methods.addLike = function(userId) {
  const existingLike = this.likes.find(like => like.userId.toString() === userId.toString());
  if (!existingLike) {
    this.likes.push({ userId, likedAt: new Date() });
  }
  return this.save();
};

// Method to add comment
streamSchema.methods.addComment = function(userId, content) {
  this.comments.push({
    userId,
    content,
    createdAt: new Date()
  });
  return this.save();
};

// Method to add donation
streamSchema.methods.addDonation = function(userId, amount, message = '') {
  this.donations.push({
    userId,
    amount,
    message,
    donatedAt: new Date()
  });
  this.analytics.totalDonations += amount;
  return this.save();
};

// Method to add subscription
streamSchema.methods.addSubscription = function(userId, tier) {
  this.subscriptions.push({
    userId,
    tier,
    subscribedAt: new Date()
  });
  this.analytics.totalSubscriptions += 1;
  return this.save();
};

// Static method to find live streams
streamSchema.statics.findLiveStreams = function() {
  return this.find({
    status: 'live'
  })
    .populate('streamerId', 'username name avatar streamerProfile')
    .populate('viewers.userId', 'username name avatar')
    .sort({ currentViewers: -1 });
};

// Static method to find scheduled streams
streamSchema.statics.findScheduledStreams = function() {
  return this.find({
    status: 'scheduled',
    scheduledAt: { $gt: new Date() }
  })
    .populate('streamerId', 'username name avatar streamerProfile')
    .sort({ scheduledAt: 1 });
};

// Static method to find streamer streams
streamSchema.statics.findStreamerStreams = function(streamerId) {
  return this.find({
    streamerId
  })
    .populate('streamerId', 'username name avatar streamerProfile')
    .sort({ createdAt: -1 });
};

export default mongoose.model('Stream', streamSchema);
