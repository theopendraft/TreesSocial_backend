import mongoose from 'mongoose';

const userPreferenceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  basic: {
    ageRange: {
      min: {
        type: Number,
        min: 18,
        max: 100,
        default: 18
      },
      max: {
        type: Number,
        min: 18,
        max: 100,
        default: 65
      }
    },
    distance: {
      type: Number,
      min: 1,
      max: 100,
      default: 50
    },
    gender: [{
      type: String,
      enum: ['male', 'female', 'non-binary', 'other']
    }]
  },
  appearance: {
    height: {
      min: {
        type: Number,
        min: 120,
        max: 220,
        default: 150
      },
      max: {
        type: Number,
        min: 120,
        max: 220,
        default: 190
      }
    },
    bodyType: [{
      type: String,
      enum: ['slim', 'athletic', 'average', 'curvy', 'plus-size']
    }],
    ethnicity: [{
      type: String,
      enum: ['asian', 'black', 'hispanic', 'middle-eastern', 'mixed', 'white', 'other']
    }]
  },
  lifestyle: {
    smoking: [{
      type: String,
      enum: ['never', 'socially', 'regularly', 'trying-to-quit']
    }],
    drinking: [{
      type: String,
      enum: ['never', 'socially', 'regularly', 'rarely']
    }],
    exercise: [{
      type: String,
      enum: ['never', 'sometimes', 'regularly', 'very-active']
    }],
    diet: [{
      type: String,
      enum: ['omnivore', 'vegetarian', 'vegan', 'pescatarian', 'keto', 'paleo', 'other']
    }]
  },
  personality: {
    introvert: {
      type: Boolean,
      default: false
    },
    extrovert: {
      type: Boolean,
      default: false
    },
    adventurous: {
      type: Boolean,
      default: false
    },
    homebody: {
      type: Boolean,
      default: false
    }
  },
  interests: [{
    type: String,
    maxlength: 50
  }],
  values: [{
    type: String,
    maxlength: 50
  }],
  dealbreakers: [{
    type: String,
    maxlength: 100
  }],
  mustHaves: [{
    type: String,
    maxlength: 100
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for efficient queries
userPreferenceSchema.index({ userId: 1 });
userPreferenceSchema.index({ 'basic.ageRange.min': 1, 'basic.ageRange.max': 1 });
userPreferenceSchema.index({ 'basic.distance': 1 });

export default mongoose.model('UserPreference', userPreferenceSchema);
