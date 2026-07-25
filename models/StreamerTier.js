import mongoose from 'mongoose';

const streamerTierSchema = new mongoose.Schema({
  streamerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
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
  description: {
    type: String,
    required: true,
    maxlength: [500, 'Description cannot be more than 500 characters']
  },
  benefits: [{
    type: String,
    maxlength: [100, 'Benefit description cannot be more than 100 characters']
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  customEmotes: [{
    name: {
      type: String,
      maxlength: [20, 'Emote name cannot be more than 20 characters']
    },
    url: {
      type: String,
      maxlength: [500, 'Emote URL cannot be more than 500 characters']
    }
  }],
  exclusiveContent: [{
    title: {
      type: String,
      maxlength: [100, 'Content title cannot be more than 100 characters']
    },
    description: {
      type: String,
      maxlength: [300, 'Content description cannot be more than 300 characters']
    },
    type: {
      type: String,
      enum: ['video', 'image', 'text', 'audio'],
      default: 'text'
    },
    url: {
      type: String,
      maxlength: [500, 'Content URL cannot be more than 500 characters']
    }
  }],
  subscriberCount: {
    type: Number,
    default: 0
  },
  maxSubscribers: {
    type: Number,
    default: null // null means unlimited
  },
  isLimited: {
    type: Boolean,
    default: false
  },
  limitedUntil: {
    type: Date
  },
  discount: {
    percentage: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    validUntil: {
      type: Date
    }
  }
}, {
  timestamps: true
});

// Index for efficient queries
streamerTierSchema.index({ streamerId: 1, tier: 1 }, { unique: true });
streamerTierSchema.index({ streamerId: 1, isActive: 1 });
streamerTierSchema.index({ price: 1 });

// Virtual for discounted price
streamerTierSchema.virtual('discountedPrice').get(function() {
  if (this.discount && this.discount.percentage > 0 && 
      (!this.discount.validUntil || this.discount.validUntil > new Date())) {
    return this.price * (1 - this.discount.percentage / 100);
  }
  return this.price;
});

// Virtual for is discounted
streamerTierSchema.virtual('isDiscounted').get(function() {
  return this.discount && this.discount.percentage > 0 && 
         (!this.discount.validUntil || this.discount.validUntil > new Date());
});

// Method to increment subscriber count
streamerTierSchema.methods.incrementSubscribers = function() {
  this.subscriberCount += 1;
  return this.save();
};

// Method to decrement subscriber count
streamerTierSchema.methods.decrementSubscribers = function() {
  this.subscriberCount = Math.max(0, this.subscriberCount - 1);
  return this.save();
};

// Method to add custom emote
streamerTierSchema.methods.addCustomEmote = function(name, url) {
  this.customEmotes.push({ name, url });
  return this.save();
};

// Method to remove custom emote
streamerTierSchema.methods.removeCustomEmote = function(name) {
  this.customEmotes = this.customEmotes.filter(emote => emote.name !== name);
  return this.save();
};

// Method to add exclusive content
streamerTierSchema.methods.addExclusiveContent = function(title, description, type, url) {
  this.exclusiveContent.push({ title, description, type, url });
  return this.save();
};

// Method to remove exclusive content
streamerTierSchema.methods.removeExclusiveContent = function(title) {
  this.exclusiveContent = this.exclusiveContent.filter(content => content.title !== title);
  return this.save();
};

// Method to set discount
streamerTierSchema.methods.setDiscount = function(percentage, validUntil) {
  this.discount = { percentage, validUntil };
  return this.save();
};

// Method to remove discount
streamerTierSchema.methods.removeDiscount = function() {
  this.discount = { percentage: 0 };
  return this.save();
};

// Method to activate tier
streamerTierSchema.methods.activate = function() {
  this.isActive = true;
  return this.save();
};

// Method to deactivate tier
streamerTierSchema.methods.deactivate = function() {
  this.isActive = false;
  return this.save();
};

// Static method to find streamer tiers
streamerTierSchema.statics.findStreamerTiers = function(streamerId) {
  return this.find({
    streamerId,
    isActive: true
  }).sort({ price: 1 });
};

// Static method to find active tiers
streamerTierSchema.statics.findActiveTiers = function() {
  return this.find({
    isActive: true
  })
    .populate('streamerId', 'username name avatar streamerProfile')
    .sort({ price: 1 });
};

export default mongoose.model('StreamerTier', streamerTierSchema);
