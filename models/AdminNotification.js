import mongoose from 'mongoose';

const adminNotificationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    maxlength: [200, 'Title cannot be more than 200 characters']
  },
  message: {
    type: String,
    required: true,
    maxlength: [1000, 'Message cannot be more than 1000 characters']
  },
  type: {
    type: String,
    enum: ['general', 'feature', 'maintenance', 'policy', 'announcement'],
    default: 'general'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  targetAudience: {
    type: String,
    enum: ['all', 'premium', 'new', 'specific'],
    default: 'all'
  },
  specificGroup: {
    type: String, // For specific group targeting
    default: null
  },
  sentBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
    default: null
  },
  sentAt: {
    type: Date,
    default: Date.now
  },
  scheduledFor: {
    type: Date,
    default: null
  },
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'sent', 'failed'],
    default: 'sent'
  },
  totalRecipients: {
    type: Number,
    default: 0
  },
  deliveredCount: {
    type: Number,
    default: 0
  },
  readCount: {
    type: Number,
    default: 0
  },
  metadata: {
    deviceTokens: [String], // For push notifications
    emailsSent: {
      type: Number,
      default: 0
    },
    pushNotificationsSent: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true
});

// Indexes for better query performance
adminNotificationSchema.index({ sentAt: -1 });
adminNotificationSchema.index({ targetAudience: 1 });
adminNotificationSchema.index({ status: 1 });

// Virtual for open rate calculation
adminNotificationSchema.virtual('openRate').get(function() {
  if (this.deliveredCount === 0) return 0;
  return ((this.readCount / this.deliveredCount) * 100).toFixed(1);
});

// Static method to get users based on target audience
adminNotificationSchema.statics.getTargetUsers = async function(targetAudience, specificGroup = null) {
  const User = mongoose.model('User');
  
  switch (targetAudience) {
    case 'all':
      return User.find({}).select('_id email deviceTokens');
    
    case 'premium':
      return User.find({ 
        $or: [
          { subscription: { $ne: null } },
          { isPremium: true }
        ]
      }).select('_id email deviceTokens');
    
    case 'new':
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      return User.find({ 
        createdAt: { $gte: thirtyDaysAgo }
      }).select('_id email deviceTokens');
    
    case 'specific':
      if (specificGroup) {
        // This would depend on how you define specific groups
        // For now, we'll return empty array
        return [];
      }
      return [];
    
    default:
      return User.find({}).select('_id email deviceTokens');
  }
};

const AdminNotification = mongoose.model('AdminNotification', adminNotificationSchema);

export default AdminNotification;