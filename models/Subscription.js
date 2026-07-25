import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema({
  subscriberId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  streamerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  tierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'StreamerTier',
    required: true
  },
  tier: {
    type: String,
    enum: ['gold', 'diamond', 'chrome'],
    required: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  startDate: {
    type: Date,
    default: Date.now
  },
  endDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'expired', 'cancelled', 'pending'],
    default: 'pending'
  },
  autoRenew: {
    type: Boolean,
    default: true
  },
  paymentMethod: {
    type: String,
    required: true
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending'
  },
  transactionId: {
    type: String,
    unique: true
  },
  refundReason: {
    type: String,
    maxlength: [500, 'Refund reason cannot be more than 500 characters']
  },
  refundedAt: {
    type: Date
  },
  benefits: [{
    type: String,
    maxlength: [100, 'Benefit description cannot be more than 100 characters']
  }],
  customEmotes: [{
    type: String,
    maxlength: [50, 'Emote name cannot be more than 50 characters']
  }],
  exclusiveContent: [{
    type: String,
    maxlength: [200, 'Content description cannot be more than 200 characters']
  }]
}, {
  timestamps: true
});

// Index for efficient queries
subscriptionSchema.index({ subscriberId: 1, status: 1 });
subscriptionSchema.index({ streamerId: 1, status: 1 });
subscriptionSchema.index({ endDate: 1 });
subscriptionSchema.index({ transactionId: 1 });

// Virtual for subscription duration
subscriptionSchema.virtual('duration').get(function() {
  return this.endDate - this.startDate;
});

// Virtual for days remaining
subscriptionSchema.virtual('daysRemaining').get(function() {
  if (this.status !== 'active') return 0;
  const now = new Date();
  const remaining = this.endDate - now;
  return Math.max(0, Math.ceil(remaining / (1000 * 60 * 60 * 24)));
});

// Method to check if subscription is active
subscriptionSchema.methods.isActive = function() {
  return this.status === 'active' && this.endDate > new Date();
};

// Method to extend subscription
subscriptionSchema.methods.extend = function(days) {
  this.endDate = new Date(this.endDate.getTime() + days * 24 * 60 * 60 * 1000);
  return this.save();
};

// Method to cancel subscription
subscriptionSchema.methods.cancel = function() {
  this.status = 'cancelled';
  this.autoRenew = false;
  return this.save();
};

// Method to activate subscription
subscriptionSchema.methods.activate = function() {
  this.status = 'active';
  return this.save();
};

// Method to expire subscription
subscriptionSchema.methods.expire = function() {
  this.status = 'expired';
  return this.save();
};

// Static method to find active subscriptions
subscriptionSchema.statics.findActiveSubscriptions = function(userId) {
  return this.find({
    subscriberId: userId,
    status: 'active',
    endDate: { $gt: new Date() }
  })
    .populate('streamerId', 'username name avatar streamerProfile')
    .populate('tierId', 'tier price description benefits')
    .sort({ endDate: 1 });
};

// Static method to find user subscriptions
subscriptionSchema.statics.findUserSubscriptions = function(userId) {
  return this.find({
    subscriberId: userId
  })
    .populate('streamerId', 'username name avatar streamerProfile')
    .populate('tierId', 'tier price description benefits')
    .sort({ createdAt: -1 });
};

// Static method to find streamer subscribers
subscriptionSchema.statics.findStreamerSubscribers = function(streamerId) {
  return this.find({
    streamerId,
    status: 'active',
    endDate: { $gt: new Date() }
  })
    .populate('subscriberId', 'username name avatar')
    .populate('tierId', 'tier price description benefits')
    .sort({ createdAt: -1 });
};

export default mongoose.model('Subscription', subscriptionSchema);
