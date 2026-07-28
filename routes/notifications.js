import express from "express";
import { auth } from "../middleware/auth.js";
import Notification from "../models/Notification.js";
import User from "../models/User.js";

const router = express.Router();

// Get user notifications
router.get("/", auth, async (req, res) => {
  try {
    const { page = 1, limit = 20, unreadOnly } = req.query;
    const filter = { recipient: req.user.id };

    if (unreadOnly === "true") {
      filter.isRead = false;
    }

    const notifications = await Notification.find(filter)
      .populate("sender", "username profileImage")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Notification.countDocuments(filter);
    const unreadCount = await Notification.countDocuments({
      recipient: req.user.id,
      isRead: false,
    });

    res.json({
      notifications,
      total,
      unreadCount,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark notification as read
router.patch("/:id/read", auth, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    if (notification.recipient.toString() !== req.user.id) {
      return res.status(403).json({ error: "Not authorized" });
    }

    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();

    res.json({ message: "Notification marked as read" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark all notifications as read
router.patch("/mark-all-read", auth, async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user.id, isRead: false },
      { isRead: true, readAt: new Date() }
    );

    res.json({ message: "All notifications marked as read" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete notification
router.delete("/:id", auth, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    if (notification.recipient.toString() !== req.user.id) {
      return res.status(403).json({ error: "Not authorized" });
    }

    await Notification.findByIdAndDelete(req.params.id);

    res.json({ message: "Notification deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get notification settings
router.get("/settings", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
      "notificationSettings"
    );

    const defaultSettings = {
      likes: true,
      comments: true,
      follows: true,
      matches: true,
      messages: true,
      psa: true,
    };

    res.json(user.notificationSettings || defaultSettings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update notification settings
router.patch("/settings", auth, async (req, res) => {
  try {
    const settings = req.body;

    await User.findByIdAndUpdate(req.user.id, {
      notificationSettings: settings,
    });

    res.json({ message: "Notification settings updated successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get unread notification count
router.get("/unread-count", auth, async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      recipient: req.user.id || req.user._id,
      isRead: false,
    });

    res.json({
      success: true,
      data: { count },
      message: "Unread count retrieved successfully",
    });
  } catch (error) {
    console.error("Error getting unread count:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Create follow notification
router.post("/follow", auth, async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User ID is required",
      });
    }

    // Don't create notification if user is following themselves
    if (userId === req.user.id || userId === req.user._id.toString()) {
      return res.json({
        success: true,
        message: "Cannot follow yourself",
      });
    }

    // Check if user exists
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    // Check if notification already exists for this follow action (recent one)
    const existingNotification = await Notification.findOne({
      type: "follow",
      sender: req.user.id || req.user._id,
      recipient: userId,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // within last 24 hours
    });

    if (existingNotification) {
      return res.json({
        success: true,
        message: "Follow notification already exists",
      });
    }

    // Create follow notification
    const notification = new Notification({
      type: "follow",
      sender: req.user.id || req.user._id,
      recipient: userId,
      title: "New Follower",
      message: `${
        req.user.username || req.user.name || "Someone"
      } started following you`,
      isRead: false,
    });

    await notification.save();

    res.json({
      success: true,
      data: notification,
      message: "Follow notification created successfully",
    });
  } catch (error) {
    console.error("Error creating follow notification:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

export default router;
