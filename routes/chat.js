import express from "express";
import mongoose from "mongoose";
import { body, validationResult } from "express-validator";
import Chat from "../models/Chat.js";
import Match from "../models/Match.js";
import Message from "../models/Message.js";
import UserInteraction from "../models/UserInteraction.js";
import { authenticateToken } from "../middleware/auth.js";
import User from "../models/User.js";
import { io } from "../server.js";
import Notification from "../models/Notification.js";

const router = express.Router();

// Helper: check if a user is a participant of the chat (handles ObjectId vs string)
const isParticipant = (chat, userId) => {
  try {
    return (chat?.participants || []).some(
      (p) => p?.toString() === userId?.toString()
    );
  } catch {
    return false;
  }
};

// Helper: check messaging permission between two users based on privacy rules
const canInitiateOrMessage = async (senderId, recipientId) => {
  const [sender, recipient] = await Promise.all([
    User.findById(senderId).select("following blockedUsers"),
    User.findById(recipientId).select(
      "privacy.followers followers blockedUsers privacy.allowMessagesFrom"
    ),
  ]);
  if (!sender || !recipient) return { allowed: false, code: "NOT_FOUND" };

  // If blocked in either direction
  if (
    (recipient.blockedUsers || []).some(
      (id) => id.toString() === senderId.toString()
    )
  ) {
    return { allowed: false, code: "BLOCKED_BY_PEER" };
  }
  if (
    (sender.blockedUsers || []).some(
      (id) => id.toString() === recipientId.toString()
    )
  ) {
    return { allowed: false, code: "I_BLOCKED" };
  }

  const allow = recipient.privacy?.allowMessagesFrom || "everyone";
  if (allow === "none") return { allowed: false, code: "DM_DISABLED" };

  const isFollower = (recipient.followers || []).some(
    (id) => id.toString() === senderId.toString()
  );
  if (allow === "friends" && !isFollower) {
    // Not following yet: allow request only
    return { allowed: true, requiresApproval: true };
  }
  return { allowed: true, requiresApproval: false };
};

// Get user's chats
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { limit = 20, page = 1, chatType } = req.query;
    const skip = (page - 1) * limit;

    console.log('📩 GET /api/chat -', { chatType, userId: req.user.id });

    // Get all chats for the user
    const allChats = await Chat.getUserChats(req.user.id, parseInt(limit) + skip);
    
    console.log(`   Found ${allChats.length} total chats`);
    
    // Filter by chatType if specified
    let chats = allChats;
    if (chatType && ["arcade", "trees"].includes(chatType)) {
      chats = allChats.filter(chat => chat.chatType === chatType);
      console.log(`   Filtered to ${chats.length} ${chatType} chats`);
    }
    
    const paginatedChats = chats.slice(skip, skip + parseInt(limit));

    res.json({
      success: true,
      data: paginatedChats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: chats.length,
        hasMore: chats.length > skip + parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Error fetching user chats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch chats",
    });
  }
});

// Get chat summary (no PIN required)
router.get("/:chatId", authenticateToken, async (req, res) => {
  try {
    const { chatId } = req.params;

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: "Chat not found",
      });
    }

    // Verify user is participant
    if (!isParticipant(chat, req.user.id)) {
      return res.status(403).json({
        success: false,
        message: "Access denied to this chat",
      });
    }

    const populated = await Chat.findById(chatId)
      .populate(
        "participants",
        "username fullName profileImage avatar isOnline lastSeen privacy.showOnlineStatus privacy.showLastSeen"
      )
      .populate("lastMessage");

    // If a participant was deleted, Mongoose may leave nulls in the populated array; keep raw ids so client can render fallback
    if (populated && Array.isArray(populated.participants)) {
      populated.participants = populated.participants.filter(Boolean);
    }
    res.json({ success: true, data: populated });
  } catch (error) {
    console.error("Error fetching chat:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch chat",
    });
  }
});

// Create new chat for a match
router.post(
  "/create",
  authenticateToken,
  [body("matchId").isMongoId(), body("targetUserId").isMongoId()],
  async (req, res) => {
    try {
      const { matchId, targetUserId } = req.body;

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      // Verify match exists and user is part of it
      const match = await UserInteraction.findById(matchId);
      if (!match || !match.isMatch) {
        return res.status(400).json({
          success: false,
          message: "Invalid match",
        });
      }

      if (
        match.user.toString() !== req.user.id &&
        match.targetUser.toString() !== req.user.id
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied to this match",
        });
      }

      // Check if chat already exists
      let existingChat = await Chat.findOne({ matchId });
      if (existingChat) {
        return res.json({
          success: true,
          message: "Chat already exists",
          data: existingChat,
        });
      }

      // Create new chat
      const chat = new Chat({
        participants: [req.user.id, targetUserId],
        matchId: matchId,
        chatType: "arcade", // Mark as arcade chat
      });

      // Generate PIN
      chat.generatePin();
      await chat.save();

      console.log('✅ Arcade chat created:', { 
        chatId: chat._id, 
        chatType: chat.chatType, 
        matchId: chat.matchId 
      });

      res.json({
        success: true,
        message: "Chat created successfully",
        data: chat,
      });
    } catch (error) {
      console.error("Error creating chat:", error);
      res.status(500).json({
        success: false,
        message: "Failed to create chat",
      });
    }
  }
);

// Create or get chat by participants (frontend-friendly)
router.post(
  "/",
  authenticateToken,
  [body("participants").isArray({ min: 1 })],
  async (req, res) => {
    try {
      const { participants } = req.body;
      const users = Array.from(new Set([req.user.id, ...participants]));

      // Enforce messaging privacy rules (1:1 only supported here)
      if (users.length !== 2) {
        return res
          .status(400)
          .json({ success: false, message: "Group chats not supported" });
      }
      const otherId = users.find(
        (u) => u.toString() !== req.user.id.toString()
      );
      const perm = await canInitiateOrMessage(req.user.id, otherId);
      if (!perm.allowed) {
        const msg =
          perm.code === "DM_DISABLED"
            ? "This user doesn't accept messages"
            : perm.code === "BLOCKED_BY_PEER"
            ? "You are blocked by this user"
            : perm.code === "I_BLOCKED"
            ? "You have blocked this user"
            : "Messaging not allowed";
        return res
          .status(403)
          .json({ success: false, message: msg, code: perm.code });
      }

      let chat = await Chat.findByParticipants(users);
      if (!chat) {
        chat = new Chat({
          participants: users,
          chatType: "trees", // Mark as regular Trees chat
        });
        chat.generatePin();
        if (perm.requiresApproval) chat.isApproved = false;
        else chat.isApproved = true;
        await chat.save();
        
        console.log('✅ Trees chat created:', { 
          chatId: chat._id, 
          chatType: chat.chatType 
        });
      }
      
      const populated = await Chat.findById(chat._id)
        .populate(
          "participants",
          "username fullName profileImage avatar isOnline lastSeen privacy.showOnlineStatus privacy.showLastSeen"
        )
        .populate("lastMessage");
      res.json({ success: true, data: populated });
    } catch (error) {
      console.error("Error creating/getting chat:", error);
      res
        .status(500)
        .json({ success: false, message: "Failed to create chat" });
    }
  }
);

// Send message in chat
router.post(
  "/:chatId/messages",
  authenticateToken,
  [
    body("content").isString().trim().isLength({ min: 1, max: 1000 }),
    body("type").optional().isIn(["text", "image", "video", "audio", "file"]),
  ],
  async (req, res) => {
    try {
      const { chatId } = req.params;
      const { content, type = "text" } = req.body;

      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
      }

      const chat = await Chat.findById(chatId);
      if (!chat) {
        return res.status(404).json({
          success: false,
          message: "Chat not found",
        });
      }

      // Verify user is participant
      if (!isParticipant(chat, req.user.id)) {
        return res.status(403).json({
          success: false,
          message: "Access denied to this chat",
        });
      }

      // Block checks: If the recipient has blocked the sender, forbid sending like Instagram
      try {
        const [me, otherUser] = await Promise.all([
          (await import("../models/User.js")).default
            .findById(req.user.id)
            .select("blockedUsers"),
          (await import("../models/User.js")).default
            .findById(
              chat.participants.find(
                (p) => p.toString() !== req.user.id.toString()
              )
            )
            .select("blockedUsers"),
        ]);
        const senderId = req.user.id;
        const recipientId = chat.participants.find(
          (p) => p.toString() !== senderId.toString()
        );
        const iBlocked = (me?.blockedUsers || []).some(
          (id) => id?.toString() === recipientId?.toString()
        );
        const blockedByPeer = (otherUser?.blockedUsers || []).some(
          (id) => id?.toString() === senderId?.toString()
        );
        if (blockedByPeer) {
          return res.status(403).json({
            success: false,
            message: "You are blocked by this user.",
            code: "BLOCKED_BY_PEER",
          });
        }
        if (iBlocked) {
          return res.status(403).json({
            success: false,
            message: "You have blocked this user.",
            code: "I_BLOCKED",
          });
        }
      } catch (e) {
        // If user model lookup fails, proceed without block enforcement
        console.warn("Block check failed:", e?.message);
      }

      // Enforce messaging privacy
      const otherUserId = chat.participants.find(
        (p) => p.toString() !== req.user.id.toString()
      );
      const perm = await canInitiateOrMessage(req.user.id, otherUserId);
      if (!perm.allowed) {
        const msg =
          perm.code === "DM_DISABLED"
            ? "This user doesn't accept messages"
            : perm.code === "BLOCKED_BY_PEER"
            ? "You are blocked by this user"
            : perm.code === "I_BLOCKED"
            ? "You have blocked this user"
            : "Messaging not allowed";
        return res
          .status(403)
          .json({ success: false, message: msg, code: perm.code });
      }

      // If chat requires approval, disallow sending unless approved and convert to Message Request
      if (chat.isApproved !== true) {
        // Mark a message request on the recipient's Match row so it appears in their Matches
        try {
          const senderId = req.user.id;
          const other = chat.participants.find(
            (p) => p.toString() !== senderId.toString()
          );
          if (other) {
            // Ensure we set the flag on the row where userId = recipient and matchedUserId = sender
            let recipientRow = await Match.findOne({
              userId: other,
              matchedUserId: senderId,
              isActive: true,
            });
            if (!recipientRow) {
              // Fallback: set on any match doc we find between the two
              recipientRow = await Match.findMatch(senderId, other);
            }
            if (recipientRow) {
              recipientRow.messageRequestPending = true;
              recipientRow.messageRequestFrom = senderId;
              recipientRow.messagingApproved = false;
              await recipientRow.save();
            }
          }
        } catch (e) {
          console.warn("Failed to set message request flag:", e?.message);
        }
        return res.status(202).json({
          success: true,
          message: "Message request sent. Waiting for approval.",
          data: { requestPending: true },
        });
      }

      // Create message
      const message = new Message({
        chatId: chatId,
        senderId: req.user.id,
        content: content,
        messageType: type,
      });

      await message.save();

      // Update chat's last message
      await chat.updateLastMessage(message);

      // Increment unread count (simple)
      await chat.incrementUnread();

      // Prepare populated message once
      const populatedMessage = await message.populate(
        "senderId",
        "fullName username profileImage avatar"
      );

      // Determine recipient (the other participant)
      const senderId = req.user.id;
      const recipientId = chat.participants.find(
        (p) => p.toString() !== senderId.toString()
      );

      // Emit to chat room (for users currently viewing this chat)
      io.to(`chat_${chatId}`).emit("new_message", {
        message: populatedMessage,
        chatId: chatId,
      });

      // Also emit to recipient's user room so they get updates even if not joined to the chat room yet
      if (recipientId) {
        io.to(`user_${recipientId}`).emit("new_message", {
          message: populatedMessage,
          chatId: chatId,
        });
      }

      // Create a notification for the recipient
      try {
        if (recipientId) {
          const senderUser = await User.findById(senderId).select(
            "username fullName"
          );
          await Notification.create({
            recipient: recipientId,
            sender: senderId,
            type: "message",
            title: "New Message",
            message: `${
              senderUser?.fullName || senderUser?.username || "Someone"
            } sent you a message`,
            category: "social",
            priority: "medium",
            data: { chatId, messageId: message._id },
            actionUrl: "/messages",
          });
        }
      } catch (e) {
        console.warn("Failed to create message notification:", e?.message);
      }

      res.json({
        success: true,
        message: "Message sent successfully",
        data: populatedMessage,
      });
    } catch (error) {
      console.error("Error sending message:", error);
      res.status(500).json({
        success: false,
        message: "Failed to send message",
      });
    }
  }
);

// Approve chat requests for a match/chat
router.post("/:chatId/approve", authenticateToken, async (req, res) => {
  try {
    const { chatId } = req.params;
    const chat = await Chat.findById(chatId);
    if (!chat)
      return res
        .status(404)
        .json({ success: false, message: "Chat not found" });
    if (!chat.participants.includes(req.user.id)) {
      return res.status(403).json({ success: false, message: "Access denied" });
    }
    chat.isApproved = true;
    await chat.save();
    // Clear pending flags on both Match rows
    try {
      const a = chat.participants[0];
      const b = chat.participants[1];
      const rows = await Match.find({
        $or: [
          { userId: a, matchedUserId: b },
          { userId: b, matchedUserId: a },
        ],
      });
      for (const r of rows) {
        r.messageRequestPending = false;
        r.messageRequestFrom = null;
        r.messagingApproved = true;
        await r.save();
      }
    } catch {}
    res.json({ success: true, message: "Chat request approved" });
  } catch (e) {
    console.error("Approve chat failed:", e);
    res.status(500).json({ success: false, message: "Failed to approve chat" });
  }
});

// Get chat messages with pagination
router.get("/:chatId/messages", authenticateToken, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { page = 1, limit = 50 } = req.query;

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: "Chat not found",
      });
    }

    // Verify user is participant
    if (!isParticipant(chat, req.user.id)) {
      return res.status(403).json({
        success: false,
        message: "Access denied to this chat",
      });
    }

    const chatData = await Chat.getChatWithMessages(
      chatId,
      req.user.id,
      parseInt(page),
      parseInt(limit)
    );

    res.json({
      success: true,
      data: {
        messages: chatData ? chatData.messages : [],
        hasMore: chatData ? chatData.hasMore : false,
      },
    });
  } catch (error) {
    console.error("Error fetching chat messages:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch messages",
    });
  }
});

// Pin/unpin a message
router.post(
  "/:chatId/messages/:messageId/pin",
  authenticateToken,
  async (req, res) => {
    try {
      const { chatId, messageId } = req.params;

      const chat = await Chat.findById(chatId);
      if (!chat) {
        return res.status(404).json({
          success: false,
          message: "Chat not found",
        });
      }

      // Verify user is participant
      if (!chat.participants.includes(req.user.id)) {
        return res.status(403).json({
          success: false,
          message: "Access denied to this chat",
        });
      }

      // Verify message exists
      const message = await Message.findById(messageId);
      if (!message || message.chatId.toString() !== chatId) {
        return res.status(404).json({
          success: false,
          message: "Message not found",
        });
      }

      // Toggle pin
      await chat.pinMessage(messageId, req.user.id);

      res.json({
        success: true,
        message: "Message pin toggled successfully",
        data: chat.pinnedMessages,
      });
    } catch (error) {
      console.error("Error pinning message:", error);
      res.status(500).json({
        success: false,
        message: "Failed to pin message",
      });
    }
  }
);

// Pin/unpin via body (frontend-friendly)
router.post("/:chatId/pin", authenticateToken, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { messageId } = req.body;
    const chat = await Chat.findById(chatId);
    if (!chat)
      return res
        .status(404)
        .json({ success: false, message: "Chat not found" });
    if (!chat.participants.includes(req.user.id)) {
      return res
        .status(403)
        .json({ success: false, message: "Access denied to this chat" });
    }
    await chat.pinMessage(messageId, req.user.id);
    res.json({ success: true, data: chat.pinnedMessages });
  } catch (error) {
    console.error("Error pinning message:", error);
    res.status(500).json({ success: false, message: "Failed to pin message" });
  }
});

router.post("/:chatId/unpin", authenticateToken, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { messageId } = req.body;
    const chat = await Chat.findById(chatId);
    if (!chat)
      return res
        .status(404)
        .json({ success: false, message: "Chat not found" });
    if (!chat.participants.includes(req.user.id)) {
      return res
        .status(403)
        .json({ success: false, message: "Access denied to this chat" });
    }
    await chat.pinMessage(messageId, req.user.id); // toggle off if present
    res.json({ success: true, data: chat.pinnedMessages });
  } catch (error) {
    console.error("Error unpinning message:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to unpin message" });
  }
});

// Mark chat as read
router.post("/:chatId/read", authenticateToken, async (req, res) => {
  try {
    const { chatId } = req.params;

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: "Chat not found",
      });
    }

    // Verify user is participant
    if (!isParticipant(chat, req.user.id)) {
      return res.status(403).json({
        success: false,
        message: "Access denied to this chat",
      });
    }

    // Mark as read
    await chat.markAsRead(req.user.id);

    res.json({
      success: true,
      message: "Chat marked as read",
      data: {
        unreadCount: chat.getUnreadCount(req.user.id),
      },
    });
  } catch (error) {
    console.error("Error marking chat as read:", error);
    res.status(500).json({
      success: false,
      message: "Failed to mark chat as read",
    });
  }
});

// Leave chat
router.post("/:chatId/leave", authenticateToken, async (req, res) => {
  try {
    const { chatId } = req.params;

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: "Chat not found",
      });
    }

    // Verify user is participant
    if (!isParticipant(chat, req.user.id)) {
      return res.status(403).json({
        success: false,
        message: "Access denied to this chat",
      });
    }

    // Remove participant
    await chat.removeParticipant(req.user.id);

    // If no participants left, deactivate chat
    if (chat.participants.length === 0) {
      chat.isActive = false;
      await chat.save();
    }

    res.json({
      success: true,
      message: "Left chat successfully",
    });
  } catch (error) {
    console.error("Error leaving chat:", error);
    res.status(500).json({
      success: false,
      message: "Failed to leave chat",
    });
  }
});

// Get chat PIN (for verification)
router.get("/:chatId/pin", authenticateToken, async (req, res) => {
  try {
    const { chatId } = req.params;

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: "Chat not found",
      });
    }

    // Verify user is participant
    if (!isParticipant(chat, req.user.id)) {
      return res.status(403).json({
        success: false,
        message: "Access denied to this chat",
      });
    }

    // For development, return pinned messages info instead of PIN
    res.json({
      success: true,
      data: { pinnedMessages: chat.pinnedMessages || [] },
    });
  } catch (error) {
    console.error("Error getting chat PIN hint:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get PIN hint",
    });
  }
});

// Reset chat PIN
router.post("/:chatId/reset-pin", authenticateToken, async (req, res) => {
  try {
    const { chatId } = req.params;

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({
        success: false,
        message: "Chat not found",
      });
    }

    // Verify user is participant
    if (!isParticipant(chat, req.user.id)) {
      return res.status(403).json({
        success: false,
        message: "Access denied to this chat",
      });
    }

    // Generate new PIN (compatibility)
    const newPin = chat.generatePin();
    await chat.save();
    res.json({
      success: true,
      message: "PIN reset successfully",
      data: { newPin },
    });
  } catch (error) {
    console.error("Error resetting chat PIN:", error);
    res.status(500).json({
      success: false,
      message: "Failed to reset PIN",
    });
  }
});

export default router;
