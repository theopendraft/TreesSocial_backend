import mongoose from "mongoose";

const staticContentSchema = new mongoose.Schema(
  {
    page: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      maxLength: 200,
    },
    content: {
      type: String,
      required: true,
    },
    contentType: {
      type: String,
      enum: ["html", "markdown", "rich_text"],
      default: "rich_text",
    },
    seo: {
      metaTitle: {
        type: String,
        maxLength: 60,
      },
      metaDescription: {
        type: String,
        maxLength: 160,
      },
      metaKeywords: [String],
      ogTitle: String,
      ogDescription: String,
      ogImage: String,
      canonicalUrl: String,
      robots: {
        type: String,
        default: "index,follow",
      },
      schema: mongoose.Schema.Types.Mixed, // JSON-LD schema markup
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
    publishedAt: Date,
    showInNav: {
      type: Boolean,
      default: false,
    },
    navOrder: {
      type: Number,
      default: 0,
    },
    navLabel: String, // Different from title if needed
    template: {
      type: String,
      enum: ["default", "landing", "article", "legal", "contact"],
      default: "default",
    },
    sections: [
      {
        type: {
          type: String,
          enum: [
            "hero",
            "text",
            "image",
            "video",
            "cta",
            "features",
            "testimonials",
            "faq",
          ],
        },
        title: String,
        content: String,
        imageUrl: String,
        videoUrl: String,
        ctaText: String,
        ctaUrl: String,
        order: Number,
        styling: {
          backgroundColor: String,
          textColor: String,
          alignment: {
            type: String,
            enum: ["left", "center", "right"],
          },
        },
      },
    ],
    customCSS: String,
    customJS: String,
    analytics: [
      {
        date: {
          type: Date,
          default: Date.now,
        },
        views: {
          type: Number,
          default: 0,
        },
        uniqueViews: {
          type: Number,
          default: 0,
        },
        bounceRate: {
          type: Number,
          default: 0,
        },
        avgTimeOnPage: {
          type: Number,
          default: 0,
        },
        referrers: [
          {
            source: String,
            count: Number,
          },
        ],
        devices: [
          {
            type: String,
            count: Number,
          },
        ],
        countries: [
          {
            code: String,
            name: String,
            count: Number,
          },
        ],
      },
    ],
    tags: [String],
    category: {
      type: String,
      enum: ["legal", "help", "about", "marketing", "feature", "other"],
      default: "other",
    },
    language: {
      type: String,
      default: "en",
    },
    versions: [
      {
        content: String,
        createdBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
        comment: String,
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    lastReviewedAt: Date,
    lastReviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    reviewStatus: {
      type: String,
      enum: ["pending", "approved", "rejected", "needs_update"],
      default: "pending",
    },
    accessControl: {
      isPrivate: {
        type: Boolean,
        default: false,
      },
      allowedRoles: [
        {
          type: String,
          enum: ["admin", "moderator", "editor", "user"],
        },
      ],
      requiresAuth: {
        type: Boolean,
        default: false,
      },
    },
    redirects: [
      {
        from: String,
        to: String,
        type: {
          type: String,
          enum: ["301", "302"],
          default: "301",
        },
        isActive: {
          type: Boolean,
          default: true,
        },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes
staticContentSchema.index({ page: 1 });
staticContentSchema.index({ isPublished: 1, showInNav: 1 });
staticContentSchema.index({ category: 1, isPublished: 1 });
staticContentSchema.index({ tags: 1 });
staticContentSchema.index({ createdBy: 1 });
staticContentSchema.index({ "seo.metaKeywords": 1 });

// Virtual for full URL
staticContentSchema.virtual("fullUrl").get(function () {
  return `/pages/${this.page}`;
});

// Virtual for total views
staticContentSchema.virtual("totalViews").get(function () {
  return this.analytics.reduce((total, day) => total + day.views, 0);
});

// Virtual for total unique views
staticContentSchema.virtual("totalUniqueViews").get(function () {
  return this.analytics.reduce((total, day) => total + day.uniqueViews, 0);
});

// Virtual for average bounce rate
staticContentSchema.virtual("avgBounceRate").get(function () {
  if (this.analytics.length === 0) return 0;
  const totalBounceRate = this.analytics.reduce(
    (total, day) => total + day.bounceRate,
    0
  );
  return (totalBounceRate / this.analytics.length).toFixed(2);
});

// Virtual for SEO score (simplified)
staticContentSchema.virtual("seoScore").get(function () {
  let score = 0;

  // Title length check
  if (
    this.seo.metaTitle &&
    this.seo.metaTitle.length >= 30 &&
    this.seo.metaTitle.length <= 60
  ) {
    score += 20;
  }

  // Description length check
  if (
    this.seo.metaDescription &&
    this.seo.metaDescription.length >= 120 &&
    this.seo.metaDescription.length <= 160
  ) {
    score += 20;
  }

  // Keywords check
  if (this.seo.metaKeywords && this.seo.metaKeywords.length >= 3) {
    score += 15;
  }

  // Content length check
  if (this.content && this.content.length >= 300) {
    score += 15;
  }

  // OG tags check
  if (this.seo.ogTitle && this.seo.ogDescription) {
    score += 15;
  }

  // Image check
  if (this.seo.ogImage) {
    score += 15;
  }

  return score;
});

// Pre-save middleware
staticContentSchema.pre("save", function (next) {
  // Auto-generate SEO fields if not provided
  if (!this.seo.metaTitle) {
    this.seo.metaTitle = this.title;
  }

  if (!this.seo.ogTitle) {
    this.seo.ogTitle = this.title;
  }

  // Set published date
  if (this.isPublished && !this.publishedAt) {
    this.publishedAt = new Date();
  }

  // Create version if content changed
  if (this.isModified("content") && !this.isNew) {
    this.versions.push({
      content: this.content,
      createdBy: this.updatedBy,
      createdAt: new Date(),
      comment: "Content updated",
    });

    // Keep only last 10 versions
    if (this.versions.length > 10) {
      this.versions = this.versions.slice(-10);
    }
  }

  next();
});

// Static method to get published pages
staticContentSchema.statics.getPublished = function (options = {}) {
  const query = { isPublished: true };

  if (options.category) {
    query.category = options.category;
  }

  if (options.tags && options.tags.length > 0) {
    query.tags = { $in: options.tags };
  }

  return this.find(query)
    .select("page title seo.metaDescription category tags updatedAt")
    .sort({ navOrder: 1, title: 1 });
};

// Static method to search pages
staticContentSchema.statics.search = function (searchTerm, options = {}) {
  const searchRegex = new RegExp(searchTerm, "i");

  const query = {
    isPublished: true,
    $or: [
      { title: searchRegex },
      { content: searchRegex },
      { "seo.metaKeywords": searchRegex },
      { tags: searchRegex },
    ],
  };

  return this.find(query)
    .select("page title seo.metaDescription category updatedAt")
    .sort({ updatedAt: -1 })
    .limit(options.limit || 20);
};

// Instance method to get related pages
staticContentSchema.methods.getRelated = function (limit = 5) {
  return this.constructor
    .find({
      _id: { $ne: this._id },
      isPublished: true,
      $or: [{ category: this.category }, { tags: { $in: this.tags } }],
    })
    .select("page title seo.metaDescription category")
    .limit(limit);
};

// Instance method to add analytics data
staticContentSchema.methods.addView = function (viewData = {}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let todayAnalytics = this.analytics.find(
    (entry) => entry.date.getTime() === today.getTime()
  );

  if (!todayAnalytics) {
    todayAnalytics = {
      date: today,
      views: 0,
      uniqueViews: 0,
      bounceRate: 0,
      avgTimeOnPage: 0,
      referrers: [],
      devices: [],
      countries: [],
    };
    this.analytics.push(todayAnalytics);
  }

  todayAnalytics.views += 1;

  // Update referrer data
  if (viewData.referrer) {
    const existingReferrer = todayAnalytics.referrers.find(
      (r) => r.source === viewData.referrer
    );
    if (existingReferrer) {
      existingReferrer.count += 1;
    } else {
      todayAnalytics.referrers.push({ source: viewData.referrer, count: 1 });
    }
  }

  // Update device data
  if (viewData.device) {
    const existingDevice = todayAnalytics.devices.find(
      (d) => d.type === viewData.device
    );
    if (existingDevice) {
      existingDevice.count += 1;
    } else {
      todayAnalytics.devices.push({ type: viewData.device, count: 1 });
    }
  }

  // Update country data
  if (viewData.country) {
    const existingCountry = todayAnalytics.countries.find(
      (c) => c.code === viewData.country.code
    );
    if (existingCountry) {
      existingCountry.count += 1;
    } else {
      todayAnalytics.countries.push({
        code: viewData.country.code,
        name: viewData.country.name,
        count: 1,
      });
    }
  }

  return this.save();
};

// Instance method to generate sitemap entry
staticContentSchema.methods.getSitemapEntry = function () {
  return {
    url: this.fullUrl,
    lastmod: this.updatedAt.toISOString(),
    changefreq: "monthly",
    priority: this.showInNav ? 0.8 : 0.6,
  };
};

export default mongoose.model("StaticContent", staticContentSchema);
