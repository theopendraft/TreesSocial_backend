import express from "express";
import { auth, adminAuth } from "../middleware/auth.js";
import Match from "../models/Match.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import Report from "../models/Reports.js";
import Chat from "../models/Chat.js";

const router = express.Router();

// Admin middleware
router.use(auth, adminAuth);

// Get matchmaking overview statistics
router.get("/overview", async (req, res) => {
  try {
    const { period = "7d" } = req.query;

    const endDate = new Date();
    const startDate = new Date();

    switch (period) {
      case "24h":
        startDate.setHours(startDate.getHours() - 24);
        break;
      case "7d":
        startDate.setDate(startDate.getDate() - 7);
        break;
      case "30d":
        startDate.setDate(startDate.getDate() - 30);
        break;
      default:
        startDate.setDate(startDate.getDate() - 7);
    }

    const [
      totalMatches,
      activeChats,
      reportedChats,
      blockedUsers,
      newMatches,
      messagesSent,
    ] = await Promise.all([
      Match.countDocuments(),
      Chat.countDocuments({ type: "match", isActive: true }),
      Report.countDocuments({
        contentType: "chat",
        status: "pending",
        createdAt: { $gte: startDate },
      }),
      User.countDocuments({ "blockedUsers.0": { $exists: true } }),
      Match.countDocuments({ createdAt: { $gte: startDate } }),
      Message.countDocuments({
        chatType: "match",
        createdAt: { $gte: startDate },
      }),
    ]);

    // Match success rate calculation
    const matchesWithMessages = await Chat.countDocuments({
      type: "match",
      createdAt: { $gte: startDate },
      lastMessage: { $exists: true },
    });

    const successRate =
      newMatches > 0
        ? ((matchesWithMessages / newMatches) * 100).toFixed(2)
        : 0;

    res.json({
      overview: {
        totalMatches,
        activeChats,
        reportedChats,
        blockedUsers,
        newMatches,
        messagesSent,
        successRate,
      },
      period,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get match logs with filtering
router.get("/matches", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      userId,
      dateFrom,
      dateTo,
    } = req.query;

    const skip = (page - 1) * limit;
    let query = {};

    if (status) {
      query.status = status;
    }

    if (userId) {
      query.$or = [{ user1: userId }, { user2: userId }];
    }

    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }

    const matches = await Match.find(query)
      .populate("user1", "username email profilePicture isVerified")
      .populate("user2", "username email profilePicture isVerified")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Match.countDocuments(query);

    // Add chat information for each match
    const matchesWithChats = await Promise.all(
      matches.map(async (match) => {
        const chat = await Chat.findOne({
          type: "match",
          participants: { $all: [match.user1._id, match.user2._id] },
        });

        const messageCount = chat
          ? await Message.countDocuments({ chat: chat._id })
          : 0;
        const lastMessage = chat?.lastMessage || null;

        return {
          ...match.toObject(),
          chat: {
            id: chat?._id,
            messageCount,
            lastMessage,
            isActive: chat?.isActive || false,
            hasPin: chat?.hasPin || false,
          },
        };
      })
    );

    res.json({
      matches: matchesWithChats,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
        hasMore: skip + matches.length < total,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get flagged conversations
router.get("/flagged-chats", async (req, res) => {
  try {
    const { page = 1, limit = 20, severity } = req.query;
    const skip = (page - 1) * limit;

    let reportQuery = {
      contentType: "chat",
      status: "pending",
    };

    if (severity) {
      reportQuery.severity = severity;
    }

    const reports = await Report.find(reportQuery)
      .populate("reporter", "username email")
      .populate("contentId") // This should be the chat ID
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get detailed chat information for each report
    const flaggedChats = await Promise.all(
      reports.map(async (report) => {
        const chat = await Chat.findById(report.contentId).populate(
          "participants",
          "username email profilePicture"
        );

        if (!chat) return null;

        const recentMessages = await Message.find({ chat: chat._id })
          .populate("sender", "username")
          .sort({ createdAt: -1 })
          .limit(10);

        const totalMessages = await Message.countDocuments({ chat: chat._id });

        return {
          report: report.toObject(),
          chat: {
            ...chat.toObject(),
            recentMessages,
            totalMessages,
          },
        };
      })
    );

    const validChats = flaggedChats.filter((item) => item !== null);
    const total = await Report.countDocuments(reportQuery);

    res.json({
      flaggedChats: validChats,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
        hasMore: skip + reports.length < total,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get chat conversation details
router.get("/chat/:chatId", async (req, res) => {
  try {
    const { chatId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const skip = (page - 1) * limit;

    const chat = await Chat.findById(chatId).populate(
      "participants",
      "username email profilePicture isVerified lastActive"
    );

    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    const messages = await Message.find({ chat: chatId })
      .populate("sender", "username profilePicture")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalMessages = await Message.countDocuments({ chat: chatId });

    // Get related reports
    const reports = await Report.find({
      contentType: "chat",
      contentId: chatId,
    }).populate("reporter", "username email");

    // Chat analytics
    const analytics = {
      totalMessages,
      firstMessage: await Message.findOne({ chat: chatId }).sort({
        createdAt: 1,
      }),
      lastMessage: await Message.findOne({ chat: chatId }).sort({
        createdAt: -1,
      }),
      messageFrequency: await calculateMessageFrequency(chatId),
      suspiciousActivity: await detectSuspiciousActivity(chatId),
    };

    res.json({
      chat,
      messages: messages.reverse(), // Show oldest first
      reports,
      analytics,
      pagination: {
        total: totalMessages,
        page: parseInt(page),
        pages: Math.ceil(totalMessages / limit),
        hasMore: skip + messages.length < totalMessages,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Suspend user from matchmaking
router.post("/suspend-user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      reason,
      duration, // in days
      suspendMatching = true,
      suspendMessaging = false,
    } = req.body;

    if (!reason) {
      return res.status(400).json({ error: "Suspension reason is required" });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const suspensionEndDate = duration
      ? new Date(Date.now() + duration * 24 * 60 * 60 * 1000)
      : null; // Permanent if no duration

    const suspension = {
      reason,
      suspendedBy: req.user.id,
      suspendedAt: new Date(),
      expiresAt: suspensionEndDate,
      matchingSuspended: suspendMatching,
      messagingSuspended: suspendMessaging,
      isActive: true,
    };

    user.suspensions = user.suspensions || [];
    user.suspensions.push(suspension);

    // Update user status
    if (suspendMatching) {
      user.matchingStatus = "suspended";
    }

    await user.save();

    // Deactivate all user's active chats if messaging is suspended
    if (suspendMessaging) {
      await Chat.updateMany(
        { participants: userId, isActive: true },
        { isActive: false, deactivatedReason: "User suspended" }
      );
    }

    res.json({
      message: "User suspended successfully",
      suspension,
      user: {
        id: user._id,
        username: user.username,
        matchingStatus: user.matchingStatus,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Unsuspend user
router.post("/unsuspend-user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Find active suspension
    const activeSuspension = user.suspensions?.find((s) => s.isActive);
    if (!activeSuspension) {
      return res.status(400).json({ error: "User is not currently suspended" });
    }

    // Deactivate suspension
    activeSuspension.isActive = false;
    activeSuspension.unsuspendedBy = req.user.id;
    activeSuspension.unsuspendedAt = new Date();
    activeSuspension.unsuspendReason = reason || "Manual unsuspension";

    // Restore user status
    user.matchingStatus = "active";

    await user.save();

    res.json({
      message: "User unsuspended successfully",
      user: {
        id: user._id,
        username: user.username,
        matchingStatus: user.matchingStatus,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Review and moderate chat
router.post("/moderate-chat/:chatId", async (req, res) => {
  try {
    const { chatId } = req.params;
    const { action, reason, reportId } = req.body;

    if (!["approve", "warn", "suspend_chat", "ban_users"].includes(action)) {
      return res.status(400).json({ error: "Invalid moderation action" });
    }

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    let moderationAction = {
      action,
      moderator: req.user.id,
      reason: reason || "",
      timestamp: new Date(),
    };

    switch (action) {
      case "approve":
        chat.moderationStatus = "approved";
        break;

      case "warn":
        chat.moderationStatus = "warned";
        // Send warning to participants
        await sendWarningToParticipants(chat.participants, reason);
        break;

      case "suspend_chat":
        chat.isActive = false;
        chat.moderationStatus = "suspended";
        chat.deactivatedReason = reason;
        break;

      case "ban_users":
        chat.isActive = false;
        chat.moderationStatus = "banned";
        // Suspend both users
        for (const participantId of chat.participants) {
          await suspendUserFromMatchmaking(participantId, reason, req.user.id);
        }
        break;
    }

    chat.moderationHistory = chat.moderationHistory || [];
    chat.moderationHistory.push(moderationAction);

    await chat.save();

    // Update related report if provided
    if (reportId) {
      await Report.findByIdAndUpdate(reportId, {
        status: "resolved",
        resolvedBy: req.user.id,
        resolvedAt: new Date(),
        resolution: `Chat ${action}: ${reason}`,
      });
    }

    res.json({
      message: `Chat ${action} completed successfully`,
      chat: {
        id: chat._id,
        moderationStatus: chat.moderationStatus,
        isActive: chat.isActive,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user matchmaking activity
router.get("/user-activity/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { period = "30d" } = req.query;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period.replace("d", "")));

    const user = await User.findById(userId).select(
      "username email profilePicture isVerified createdAt lastActive"
    );

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const [
      totalMatches,
      activeChats,
      messagesSent,
      messagesReceived,
      reports,
      blocks,
    ] = await Promise.all([
      Match.countDocuments({
        $or: [{ user1: userId }, { user2: userId }],
        createdAt: { $gte: startDate },
      }),
      Chat.countDocuments({
        participants: userId,
        isActive: true,
        type: "match",
      }),
      Message.countDocuments({
        sender: userId,
        chatType: "match",
        createdAt: { $gte: startDate },
      }),
      Message.countDocuments({
        recipient: userId,
        chatType: "match",
        createdAt: { $gte: startDate },
      }),
      Report.countDocuments({
        $or: [{ reporter: userId }, { reportedUser: userId }],
        createdAt: { $gte: startDate },
      }),
      User.countDocuments({
        blockedUsers: userId,
      }),
    ]);

    // Get match history
    const matches = await Match.find({
      $or: [{ user1: userId }, { user2: userId }],
    })
      .populate("user1 user2", "username profilePicture")
      .sort({ createdAt: -1 })
      .limit(10);

    // Get recent chats
    const chats = await Chat.find({
      participants: userId,
      type: "match",
    })
      .populate("participants", "username profilePicture")
      .sort({ updatedAt: -1 })
      .limit(5);

    res.json({
      user,
      activity: {
        totalMatches,
        activeChats,
        messagesSent,
        messagesReceived,
        reports,
        blocks,
      },
      recentMatches: matches,
      recentChats: chats,
      period,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get matchmaking analytics
router.get("/analytics", async (req, res) => {
  try {
    const { period = "30d" } = req.query;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period.replace("d", "")));

    // Daily match statistics
    const dailyMatches = await Match.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          matches: { $sum: 1 },
          mutual: {
            $sum: { $cond: [{ $eq: ["$status", "mutual"] }, 1, 0] },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Match success by age group
    const ageGroupAnalysis = await Match.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "user1",
          foreignField: "_id",
          as: "user1Data",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "user2",
          foreignField: "_id",
          as: "user2Data",
        },
      },
      // Add age calculations and grouping here
    ]);

    // Top performing preferences
    const preferenceAnalysis = await Match.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: "mutual",
        },
      },
      {
        $lookup: {
          from: "userpreferences",
          localField: "user1",
          foreignField: "user",
          as: "preferences1",
        },
      },
      // Add preference matching analysis
    ]);

    res.json({
      dailyMatches,
      ageGroupAnalysis,
      preferenceAnalysis,
      period,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper functions
async function calculateMessageFrequency(chatId) {
  const messages = await Message.find({ chat: chatId })
    .sort({ createdAt: 1 })
    .select("createdAt");

  if (messages.length < 2) return 0;

  const intervals = [];
  for (let i = 1; i < messages.length; i++) {
    const interval = messages[i].createdAt - messages[i - 1].createdAt;
    intervals.push(interval);
  }

  const avgInterval =
    intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
  return Math.round(avgInterval / (1000 * 60)); // Convert to minutes
}

async function detectSuspiciousActivity(chatId) {
  const suspiciousPatterns = [];

  // Check for spam patterns
  const recentMessages = await Message.find({
    chat: chatId,
    createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) }, // Last hour
  });

  if (recentMessages.length > 50) {
    suspiciousPatterns.push("High message frequency");
  }

  // Check for identical messages
  const messageTexts = recentMessages.map((m) => m.content);
  const duplicates = messageTexts.filter(
    (text, index) => messageTexts.indexOf(text) !== index
  );

  if (duplicates.length > 5) {
    suspiciousPatterns.push("Repeated messages");
  }

  // Check for external links
  const linkPattern = /(https?:\/\/[^\s]+)/g;
  const messagesWithLinks = recentMessages.filter((m) =>
    linkPattern.test(m.content)
  );

  if (messagesWithLinks.length > 3) {
    suspiciousPatterns.push("Multiple external links");
  }

  return suspiciousPatterns;
}

async function sendWarningToParticipants(participantIds, reason) {
  // Implementation for sending warnings
  // This would integrate with your notification system
  console.log(`Warning sent to participants ${participantIds}: ${reason}`);
}

async function suspendUserFromMatchmaking(userId, reason, moderatorId) {
  const user = await User.findById(userId);
  if (user) {
    user.matchingStatus = "suspended";
    const suspension = {
      reason,
      suspendedBy: moderatorId,
      suspendedAt: new Date(),
      matchingSuspended: true,
      isActive: true,
    };
    user.suspensions = user.suspensions || [];
    user.suspensions.push(suspension);
    await user.save();
  }
}

export default router;
