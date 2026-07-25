import mongoose from "mongoose";

const otpSchema = new mongoose.Schema(
  {
    identifier: {
      type: String,
      required: true, // email or phone number
    },
    type: {
      type: String,
      enum: ["email", "sms"],
      required: true,
    },
    purpose: {
      type: String,
      enum: [
        "registration",
        "login",
        "password_reset",
        "phone_verification",
        "email_verification",
      ],
      required: true,
    },
    code: {
      type: String,
      required: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 5,
    },
    isUsed: {
      type: Boolean,
      default: false,
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    usedAt: Date,
    ipAddress: String,
    userAgent: String,
  },
  {
    timestamps: true,
  }
);

// Index for automatic cleanup of expired OTPs
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Index for finding OTPs by identifier and purpose
otpSchema.index({ identifier: 1, purpose: 1, isUsed: 1 });

// Pre-save middleware to set expiry time
otpSchema.pre("save", function (next) {
  if (this.isNew && !this.expiresAt) {
    // Set expiry to 10 minutes from creation
    this.expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  }
  next();
});

// Instance method to verify OTP
otpSchema.methods.verify = function (inputCode) {
  if (this.isUsed) {
    return { success: false, error: "OTP already used" };
  }

  if (this.isBlocked) {
    return { success: false, error: "OTP is blocked due to too many attempts" };
  }

  if (new Date() > this.expiresAt) {
    return { success: false, error: "OTP has expired" };
  }

  this.attempts += 1;

  if (this.attempts >= this.maxAttempts) {
    this.isBlocked = true;
    this.save();
    return { success: false, error: "Too many attempts. OTP blocked." };
  }

  if (this.code === inputCode) {
    this.isUsed = true;
    this.usedAt = new Date();
    this.save();
    return { success: true };
  } else {
    this.save();
    return {
      success: false,
      error: "Invalid OTP",
      attemptsLeft: this.maxAttempts - this.attempts,
    };
  }
};

// Static method to generate OTP
otpSchema.statics.generateOTP = function (length = 6) {
  const digits = "0123456789";
  let otp = "";
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }
  return otp;
};

// Static method to create new OTP
otpSchema.statics.createOTP = async function (
  identifier,
  type,
  purpose,
  options = {}
) {
  // Invalidate any existing OTPs for this identifier and purpose
  await this.updateMany(
    {
      identifier,
      purpose,
      isUsed: false,
      isBlocked: false,
    },
    {
      isUsed: true,
      usedAt: new Date(),
    }
  );

  const code = options.code || this.generateOTP(options.length || 6);
  const expiryMinutes = options.expiryMinutes || 10;

  const otp = new this({
    identifier,
    type,
    purpose,
    code,
    expiresAt: new Date(Date.now() + expiryMinutes * 60 * 1000),
    maxAttempts: options.maxAttempts || 5,
    ipAddress: options.ipAddress,
    userAgent: options.userAgent,
  });

  return await otp.save();
};

// Static method to verify OTP
otpSchema.statics.verifyOTP = async function (identifier, purpose, inputCode) {
  const otp = await this.findOne({
    identifier,
    purpose,
    isUsed: false,
    isBlocked: false,
  }).sort({ createdAt: -1 });

  if (!otp) {
    return { success: false, error: "No valid OTP found" };
  }

  return otp.verify(inputCode);
};

// Static method to check if identifier is rate limited
otpSchema.statics.checkRateLimit = async function (
  identifier,
  purpose,
  windowMinutes = 60,
  maxRequests = 5
) {
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

  const count = await this.countDocuments({
    identifier,
    purpose,
    createdAt: { $gte: windowStart },
  });

  return {
    isLimited: count >= maxRequests,
    requestsInWindow: count,
    maxRequests,
    windowMinutes,
  };
};

export default mongoose.model("OTP", otpSchema);
