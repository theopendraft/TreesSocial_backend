import express from "express";
import { body, validationResult } from "express-validator";
import UserSettings from "../models/UserSettings.js";
import User from "../models/User.js";
import { authenticateToken } from "../middleware/auth.js";
import Post from "../models/Post.js";
import Reel from "../models/Reel.js";
import Chat from "../models/Chat.js";
import Notification from "../models/Notification.js";
import Report from "../models/Reports.js";
import ContentReport from "../models/ContentReport.js";
import Match from "../models/Match.js";
import UserInteraction from "../models/UserInteraction.js";
import { cloudinaryUtils } from "../config/cloudinary.js";

const router = express.Router();

// Get user settings
router.get("/", authenticateToken, async (req, res) => {
  try {
    let userSettings = await UserSettings.findOne({ userId: req.user.id });

    if (!userSettings) {
      // Create default settings if none exist
      userSettings = new UserSettings({ userId: req.user.id });
      await userSettings.save();
    }

    res.json({
      success: true,
      data: userSettings.getAllSettings(),
    });
  } catch (error) {
    console.error("Error fetching user settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user settings",
    });
  }
});

// Update account settings
router.put(
  "/account",
  authenticateToken,
  [
    body("language").optional().isIn(["en", "es", "fr", "de", "zh"]),
    body("timezone").optional().isString().trim(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      let userSettings = await UserSettings.findOne({ userId: req.user.id });
      if (!userSettings) {
        userSettings = new UserSettings({ userId: req.user.id });
      }

      await userSettings.updateSettingsByCategory("account", req.body);

      // Also update user model if bio or other fields are provided
      if (req.body.bio || req.body.location || req.body.website) {
        const updateData = {};
        if (req.body.bio !== undefined) updateData.bio = req.body.bio;
        if (req.body.location !== undefined)
          updateData.location = req.body.location;
        if (req.body.website !== undefined)
          updateData.website = req.body.website;

        await User.findByIdAndUpdate(req.user.id, updateData);
      }

      res.json({
        success: true,
        message: "Account settings updated successfully",
        data: userSettings.getSettingsByCategory("account"),
      });
    } catch (error) {
      console.error("Error updating account settings:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update account settings",
      });
    }
  }
);

// Update privacy settings
router.put(
  "/privacy",
  authenticateToken,
  [
    body("profileVisibility").optional().isIn(["public", "friends", "private"]),
    body("showOnlineStatus").optional().isBoolean(),
    body("allowMessages").optional().isBoolean(),
    body("allowFriendRequests").optional().isBoolean(),
    body("showActivityStatus").optional().isBoolean(),
    body("allowAnalytics").optional().isBoolean(),
    body("allowCookies").optional().isBoolean(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      let userSettings = await UserSettings.findOne({ userId: req.user.id });
      if (!userSettings) {
        userSettings = new UserSettings({ userId: req.user.id });
      }

      await userSettings.updateSettingsByCategory("privacy", req.body);

      // Persist key privacy flags to User model for enforcement
      const privacyUpdate = {};
      if (typeof req.body.profileVisibility === "string") {
        privacyUpdate["privacy.profileVisibility"] = req.body.profileVisibility;
      }
      if (typeof req.body.showOnlineStatus === "boolean") {
        privacyUpdate["privacy.showOnlineStatus"] = req.body.showOnlineStatus;
      }
      if (typeof req.body.allowMessages === "boolean") {
        // Map boolean to allowMessagesFrom setting: true => everyone, false => none
        privacyUpdate["privacy.allowMessagesFrom"] = req.body.allowMessages
          ? "everyone"
          : "none";
      }
      if (typeof req.body.allowMessagesFrom === "string") {
        privacyUpdate["privacy.allowMessagesFrom"] = req.body.allowMessagesFrom;
      }
      if (typeof req.body.showLastSeen === "boolean") {
        privacyUpdate["privacy.showLastSeen"] = req.body.showLastSeen;
      }
      if (typeof req.body.allowProfileViews === "boolean") {
        privacyUpdate["privacy.allowProfileViews"] = req.body.allowProfileViews;
      }
      if (Object.keys(privacyUpdate).length > 0) {
        await User.findByIdAndUpdate(req.user.id, { $set: privacyUpdate });
      }

      res.json({
        success: true,
        message: "Privacy settings updated successfully",
        data: userSettings.getSettingsByCategory("privacy"),
      });
    } catch (error) {
      console.error("Error updating privacy settings:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update privacy settings",
      });
    }
  }
);

// Update notification settings
router.put(
  "/notifications",
  authenticateToken,
  [
    body("pushNotifications").optional().isBoolean(),
    body("emailNotifications").optional().isBoolean(),
    body("smsNotifications").optional().isBoolean(),
    body("newFollowers").optional().isBoolean(),
    body("newMessages").optional().isBoolean(),
    body("liveStreams").optional().isBoolean(),
    body("subscriptionUpdates").optional().isBoolean(),
    body("marketingEmails").optional().isBoolean(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      let userSettings = await UserSettings.findOne({ userId: req.user.id });
      if (!userSettings) {
        userSettings = new UserSettings({ userId: req.user.id });
      }

      await userSettings.updateSettingsByCategory("notifications", req.body);

      res.json({
        success: true,
        message: "Notification settings updated successfully",
        data: userSettings.getSettingsByCategory("notifications"),
      });
    } catch (error) {
      console.error("Error updating notification settings:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update notification settings",
      });
    }
  }
);

// Update app settings
router.put(
  "/app",
  authenticateToken,
  [
    body("theme").optional().isIn(["light", "dark", "system"]),
    body("autoPlay").optional().isBoolean(),
    body("dataSaver").optional().isBoolean(),
    body("downloadQuality").optional().isIn(["low", "medium", "high"]),
    body("soundEffects").optional().isBoolean(),
    body("hapticFeedback").optional().isBoolean(),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      let userSettings = await UserSettings.findOne({ userId: req.user.id });
      if (!userSettings) {
        userSettings = new UserSettings({ userId: req.user.id });
      }

      await userSettings.updateSettingsByCategory("app", req.body);

      res.json({
        success: true,
        message: "App settings updated successfully",
        data: userSettings.getSettingsByCategory("app"),
      });
    } catch (error) {
      console.error("Error updating app settings:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update app settings",
      });
    }
  }
);

// Update all settings at once
router.put("/all", authenticateToken, async (req, res) => {
  try {
    const { account, privacy, notifications, app } = req.body;

    let userSettings = await UserSettings.findOne({ userId: req.user.id });
    if (!userSettings) {
      userSettings = new UserSettings({ userId: req.user.id });
    }

    // Update each category
    if (account) {
      await userSettings.updateSettingsByCategory("account", account);
    }
    if (privacy) {
      await userSettings.updateSettingsByCategory("privacy", privacy);
    }
    if (notifications) {
      await userSettings.updateSettingsByCategory(
        "notifications",
        notifications
      );
    }
    if (app) {
      await userSettings.updateSettingsByCategory("app", app);
    }

    res.json({
      success: true,
      message: "All settings updated successfully",
      data: userSettings.getAllSettings(),
    });
  } catch (error) {
    console.error("Error updating all settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update settings",
    });
  }
});

// Reset settings to default
router.post("/reset", authenticateToken, async (req, res) => {
  try {
    await UserSettings.findOneAndDelete({ userId: req.user.id });

    // Create new default settings
    const userSettings = new UserSettings({ userId: req.user.id });
    await userSettings.save();

    res.json({
      success: true,
      message: "Settings reset to default successfully",
      data: userSettings.getAllSettings(),
    });
  } catch (error) {
    console.error("Error resetting settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to reset settings",
    });
  }
});

// Export settings
router.get("/export", authenticateToken, async (req, res) => {
  try {
    const userSettings = await UserSettings.findOne({ userId: req.user.id });
    const user = await User.findById(req.user.id).select(
      "fullName username email"
    );

    if (!userSettings) {
      return res.status(404).json({
        success: false,
        message: "No settings found",
      });
    }

    const exportData = {
      user: {
        fullName: user.fullName,
        username: user.username,
        email: user.email,
      },
      settings: userSettings.getAllSettings(),
      exportedAt: new Date().toISOString(),
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="settings-${Date.now()}.json"`
    );
    res.json(exportData);
  } catch (error) {
    console.error("Error exporting settings:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export settings",
    });
  }
});

export default router;

// Danger Zone: Permanently delete account
router.delete("/account", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  try {
    const user = await User.findById(userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Helper to try deleting a Cloudinary asset from a URL
    const tryDeleteFromUrl = async (url) => {
      if (!url || typeof url !== "string") return;
      try {
        // Attempt to parse public_id and resource type from the URL
        // Expected: https://res.cloudinary.com/<cloud>/image|video/upload/.../<public_id>.<ext>
        const m = url.match(
          /res\.cloudinary\.com\/[^/]+\/(image|video)\/upload\/(?:v\d+\/)?(.+?)\.[a-z0-9]+(?:\?|$)/i
        );
        if (m) {
          const resourceType = m[1].toLowerCase();
          const publicId = m[2];
          await cloudinaryUtils.deleteFile(publicId, resourceType);
        }
      } catch (e) {
        console.warn("Cloudinary delete failed for", url, e?.message);
      }
    };

    // 1) Collect user's posts and reels
    const [posts, reels] = await Promise.all([
      Post.find({ authorId: userId }),
      Reel.find({ author: userId }),
    ]);

    // 2) Purge Cloudinary media
    // Avatar
    await tryDeleteFromUrl(user.avatar);
    // Posts media and thumbnails
    for (const p of posts) {
      for (const media of p.media || []) {
        await tryDeleteFromUrl(media.url);
        if (media.thumbnail) await tryDeleteFromUrl(media.thumbnail);
      }
    }
    // Reels video and thumbnail
    for (const r of reels) {
      if (r.videoPublicId) {
        try {
          await cloudinaryUtils.deleteFile(r.videoPublicId, "video");
        } catch (e) {
          console.warn(
            "Cloudinary delete failed for reel publicId",
            r.videoPublicId,
            e?.message
          );
        }
      }
      if (r.thumbnail) await tryDeleteFromUrl(r.thumbnail);
      if (r.videoUrl) await tryDeleteFromUrl(r.videoUrl);
    }

    const postIds = posts.map((p) => p._id);
    const reelIds = reels.map((r) => r._id);

    // 3) Relationship cleanup: remove this user from everyone else's arrays
    await Promise.all([
      User.updateMany({ followers: userId }, { $pull: { followers: userId } }),
      User.updateMany({ following: userId }, { $pull: { following: userId } }),
      User.updateMany(
        { followRequests: userId },
        { $pull: { followRequests: userId } }
      ),
      User.updateMany(
        { sentFollowRequests: userId },
        { $pull: { sentFollowRequests: userId } }
      ),
      User.updateMany(
        { blockedUsers: userId },
        { $pull: { blockedUsers: userId } }
      ),
      // Remove saved posts/reels referencing this user's content
      postIds.length
        ? User.updateMany(
            { savedPosts: { $in: postIds } },
            { $pull: { savedPosts: { $in: postIds } } }
          )
        : Promise.resolve(),
      reelIds.length
        ? User.updateMany(
            { savedReels: { $in: reelIds } },
            { $pull: { savedReels: { $in: reelIds } } }
          )
        : Promise.resolve(),
    ]);

    // 4) Delete content authored by this user
    await Promise.all([
      Post.deleteMany({ authorId: userId }),
      Reel.deleteMany({ author: userId }),
    ]);

    // 4b) Clean up notifications, reports, matches, interactions
    await Promise.all([
      // Notifications sent to or from this user
      Notification.deleteMany({
        $or: [{ recipient: userId }, { sender: userId }],
      }),
      // Admin/simple reports model
      Report.deleteMany({
        $or: [{ reporter: userId }, { reportedUser: userId }],
      }),
      // Content reports model
      ContentReport.deleteMany({
        $or: [{ reporter: userId }],
      }),
      // Matches involving this user
      Match.deleteMany({
        $or: [{ userId }, { matchedUserId: userId }],
      }),
      // All user interactions (both directions)
      UserInteraction.deleteMany({
        $or: [{ user1: userId }, { user2: userId }],
      }),
    ]);

    // 5) Optional: mark chats still accessible but with a note. We keep chats/messages for history.
    // No DB change here; the chat APIs will render a fallback label for missing participants.

    // 6) Remove user settings doc
    await UserSettings.findOneAndDelete({ userId });

    // 7) Finally, delete the user
    await User.findByIdAndDelete(userId);

    res.json({ success: true, message: "Account deleted permanently" });
  } catch (error) {
    console.error("Error deleting account:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to delete account" });
  }
});
