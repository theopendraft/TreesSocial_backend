import express from "express";
import { body, validationResult } from "express-validator";
import UserPreference from "../models/UserPreference.js";
import UserInteraction from "../models/UserInteraction.js";
import User from "../models/User.js";
import { authenticateToken } from "../middleware/auth.js";
import dotenv from "dotenv";

dotenv.config();

const router = express.Router();

// Get user preferences
router.get("/preferences", authenticateToken, async (req, res) => {
  try {
    let userPreferences = await UserPreference.findOne({ user: req.user.id });

    if (!userPreferences) {
      // Create default preferences if none exist
      userPreferences = new UserPreference({ user: req.user.id });
      await userPreferences.save();
    }

    res.json({
      success: true,
      data: userPreferences,
    });
  } catch (error) {
    console.error("Error fetching user preferences:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch user preferences",
    });
  }
});

// Update user preferences
router.put(
  "/preferences",
  authenticateToken,
  [
    body("basic.gender")
      .optional()
      .isIn(["male", "female", "other", "prefer-not-to-say"]),
    body("basic.interestedIn")
      .optional()
      .isIn(["male", "female", "both", "other"]),
    body("basic.ageRange.min").optional().isInt({ min: 18, max: 100 }),
    body("basic.ageRange.max").optional().isInt({ min: 18, max: 100 }),
    body("basic.location").optional().isString().trim(),
    body("basic.maxDistance").optional().isInt({ min: 1, max: 500 }),
    body("appearance.height.min").optional().isInt({ min: 100, max: 250 }),
    body("appearance.height.max").optional().isInt({ min: 100, max: 250 }),
    body("appearance.bodyType").optional().isArray(),
    body("appearance.ethnicity").optional().isArray(),
    body("lifestyle.smoking")
      .optional()
      .isIn([
        "never",
        "occasionally",
        "regularly",
        "trying-to-quit",
        "prefer-not-to-say",
      ]),
    body("lifestyle.drinking")
      .optional()
      .isIn([
        "never",
        "occasionally",
        "socially",
        "regularly",
        "prefer-not-to-say",
      ]),
    body("lifestyle.exercise")
      .optional()
      .isIn([
        "never",
        "rarely",
        "sometimes",
        "regularly",
        "very-active",
        "prefer-not-to-say",
      ]),
    body("lifestyle.diet")
      .optional()
      .isIn([
        "omnivore",
        "vegetarian",
        "vegan",
        "pescatarian",
        "keto",
        "paleo",
        "other",
        "prefer-not-to-say",
      ]),
    body("personality.zodiac").optional().isArray(),
    body("personality.mbti").optional().isArray(),
    body("personality.communicationStyle").optional().isArray(),
    body("interests.hobbies").optional().isArray(),
    body("interests.music").optional().isArray(),
    body("interests.movies").optional().isArray(),
    body("interests.books").optional().isArray(),
    body("interests.sports").optional().isArray(),
    body("interests.travel").optional().isArray(),
    body("interests.food").optional().isArray(),
    body("values.religion").optional().isArray(),
    body("values.politicalViews")
      .optional()
      .isIn([
        "liberal",
        "moderate",
        "conservative",
        "apolitical",
        "prefer-not-to-say",
      ]),
    body("values.familyPlans")
      .optional()
      .isIn([
        "want-kids",
        "dont-want-kids",
        "maybe-later",
        "have-kids",
        "prefer-not-to-say",
      ]),
    body("values.relationshipGoals").optional().isArray(),
    body("dealbreakers").optional().isArray(),
    body("mustHaves").optional().isArray(),
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

      let userPreferences = await UserPreference.findOne({ user: req.user.id });
      if (!userPreferences) {
        userPreferences = new UserPreference({ user: req.user.id });
      }

      // Update preferences
      Object.assign(userPreferences, req.body);
      await userPreferences.save();

      res.json({
        success: true,
        message: "Preferences updated successfully",
        data: userPreferences,
      });
    } catch (error) {
      console.error("Error updating user preferences:", error);
      res.status(500).json({
        success: false,
        message: "Failed to update preferences",
      });
    }
  }
);

// Get potential matches
router.get("/matches/potential", authenticateToken, async (req, res) => {
  try {
    const { limit = 20, page = 1 } = req.query;
    const skip = (page - 1) * limit;

    const potentialMatches = await UserInteraction.getPotentialMatches(
      req.user.id,
      parseInt(limit) + skip
    );
    const paginatedMatches = potentialMatches.slice(
      skip,
      skip + parseInt(limit)
    );

    res.json({
      success: true,
      data: paginatedMatches,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: potentialMatches.length,
        hasMore: potentialMatches.length > skip + parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Error fetching potential matches:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch potential matches",
    });
  }
});

// Like a user
router.post("/like/:userId", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: "Cannot like yourself",
      });
    }

    // Check if user exists and is active
    const targetUser = await User.findById(userId);
    if (!targetUser || targetUser.status !== "active") {
      return res.status(404).json({
        success: false,
        message: "User not found or inactive",
      });
    }

    // Check if already interacted
    const existingInteraction = await UserInteraction.findOne({
      user1: req.user.id,
      user2: userId,
      isActive: true,
    });

    if (existingInteraction) {
      return res.status(400).json({
        success: false,
        message: "Already interacted with this user",
      });
    }

    // Create like interaction via helper
    const interaction = await UserInteraction.recordInteraction(
      req.user.id,
      userId,
      "like",
      "matching"
    );

    const isMatch = await interaction.checkForMatch();

    res.json({
      success: true,
      message: "User liked successfully",
      data: {
        interaction: interaction,
        isMatch: isMatch,
      },
    });
  } catch (error) {
    console.error("Error liking user:", error);
    res.status(500).json({
      success: false,
      message: "Failed to like user",
    });
  }
});

// Super like a user
router.post("/super-like/:userId", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: "Cannot super like yourself",
      });
    }

    // Check if user exists and is active
    const targetUser = await User.findById(userId);
    if (!targetUser || targetUser.status !== "active") {
      return res.status(404).json({
        success: false,
        message: "User not found or inactive",
      });
    }

    // Check if already interacted
    const existingInteraction = await UserInteraction.findOne({
      user1: req.user.id,
      user2: userId,
      isActive: true,
    });

    if (existingInteraction) {
      return res.status(400).json({
        success: false,
        message: "Already interacted with this user",
      });
    }

    const interaction = await UserInteraction.recordInteraction(
      req.user.id,
      userId,
      "super_like",
      "matching"
    );
    const isMatch = await interaction.checkForMatch();

    res.json({
      success: true,
      message: "User super liked successfully",
      data: {
        interaction: interaction,
        isMatch: isMatch,
      },
    });
  } catch (error) {
    console.error("Error super liking user:", error);
    res.status(500).json({
      success: false,
      message: "Failed to super like user",
    });
  }
});

// Dislike a user
router.post("/dislike/:userId", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: "Cannot dislike yourself",
      });
    }

    // Check if already interacted
    const existingInteraction = await UserInteraction.findOne({
      user1: req.user.id,
      user2: userId,
      isActive: true,
    });

    if (existingInteraction) {
      return res.status(400).json({
        success: false,
        message: "Already interacted with this user",
      });
    }

    await UserInteraction.recordInteraction(
      req.user.id,
      userId,
      "dislike",
      "matching"
    );

    res.json({
      success: true,
      message: "User disliked successfully",
      data: { ok: true },
    });
  } catch (error) {
    console.error("Error disliking user:", error);
    res.status(500).json({
      success: false,
      message: "Failed to dislike user",
    });
  }
});

// Pass on a user
router.post("/pass/:userId", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: "Cannot pass on yourself",
      });
    }

    // Check if already interacted
    const existingInteraction = await UserInteraction.findOne({
      user1: req.user.id,
      user2: userId,
      isActive: true,
    });

    if (existingInteraction) {
      return res.status(400).json({
        success: false,
        message: "Already interacted with this user",
      });
    }

    await UserInteraction.recordInteraction(
      req.user.id,
      userId,
      "pass",
      "matching"
    );

    res.json({
      success: true,
      message: "User passed successfully",
      data: { ok: true },
    });
  } catch (error) {
    console.error("Error passing on user:", error);
    res.status(500).json({
      success: false,
      message: "Failed to pass on user",
    });
  }
});

// Get user's matches
router.get("/matches", authenticateToken, async (req, res) => {
  try {
    // Always ensure visible Match rows exist for any reciprocal like pairs involving the current user
    try {
      const reciprocal = await UserInteraction.find({
        $or: [
          {
            user1: req.user.id,
            interactionType: { $in: ["like", "superlike", "super_like"] },
            isActive: true,
          },
          {
            user2: req.user.id,
            interactionType: { $in: ["like", "superlike", "super_like"] },
            isActive: true,
          },
        ],
        context: "matching",
      }).lean();
      if (reciprocal && reciprocal.length > 0) {
        const seen = new Set();
        const MatchModel = (await import("../models/Match.js")).default;
        for (const it of reciprocal) {
          const a = String(it.user1);
          const b = String(it.user2);
          const k1 = `${a}|${b}`;
          const k2 = `${b}|${a}`;
          if (seen.has(k1) || seen.has(k2)) continue;
          seen.add(k1);
          const [ua, ub] = await Promise.all([
            User.findById(a).select("name username avatar").lean(),
            User.findById(b).select("name username avatar").lean(),
          ]);
          const ensure = async (uid, mid, partner) => {
            let r = await MatchModel.findOne({
              userId: uid,
              matchedUserId: mid,
            });
            if (!r) {
              r = await MatchModel.createMatch(
                uid,
                mid,
                partner?.name || partner?.username || "",
                partner?.avatar || null,
                "mutual_like",
                0
              );
            }
            r.isActive = true;
            await r.save();
            return r;
          };
          await Promise.all([ensure(a, b, ub), ensure(b, a, ua)]);
        }
      }
    } catch {}

    let matches = await UserInteraction.getUserMatches(req.user.id);

    // Enrich with request/approval state from Match model if present
    try {
      const userId = req.user.id;
      for (const m of matches) {
        const row = await (
          await import("../models/Match.js")
        ).default.findOne({
          userId,
          matchedUserId: m.user?.id || m.userId || m.partner?.id,
        });
        if (row) {
          m.messageRequestPending = row.messageRequestPending || false;
          m.messageRequestFrom = row.messageRequestFrom || null;
          m.messagingApproved = row.messagingApproved || false;
          // Provide chatId if available on row
          if (row.chatId) {
            m.chatId = String(row.chatId);
          }
        }
      }
    } catch {}

    res.json({
      success: true,
      data: matches,
    });
  } catch (error) {
    console.error("Error fetching user matches:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch matches",
    });
  }
});

// Get user's interaction history
router.get("/interactions", authenticateToken, async (req, res) => {
  try {
    const { type, limit = 50, page = 1 } = req.query;
    const skip = (page - 1) * limit;

    const interactionsRes = await UserInteraction.getUserInteractions(
      req.user.id,
      { type, page, limit }
    );
    const interactions = interactionsRes.interactions || [];
    const paginatedInteractions = interactions.slice(
      skip,
      skip + parseInt(limit)
    );

    res.json({
      success: true,
      data: paginatedInteractions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: interactions.length,
        hasMore: interactions.length > skip + parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Error fetching user interactions:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch interactions",
    });
  }
});

// Get user's interaction statistics
router.get("/stats", authenticateToken, async (req, res) => {
  try {
    const stats = await UserInteraction.getUserStats(req.user.id);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error("Error fetching user stats:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch stats",
    });
  }
});

// Alias to support frontend calling /arcade/statistics
router.get("/statistics", authenticateToken, async (req, res) => {
  try {
    const stats = await UserInteraction.getUserStats?.(req.user.id);
    res.json({ success: true, data: stats || {} });
  } catch (error) {
    console.error("Error fetching /arcade/statistics:", error);
    res.status(500).json({ success: false, message: "Failed to fetch stats" });
  }
});

// Block a user
router.post("/block/:userId", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: "Cannot block yourself",
      });
    }

    // Check if user exists
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Add to blocked users
    await User.findByIdAndUpdate(req.user.id, {
      $addToSet: { blockedUsers: userId },
    });

    // Remove any existing interactions
    await UserInteraction.deleteMany({
      $or: [
        { user1: req.user.id, user2: userId },
        { user1: userId, user2: req.user.id },
      ],
    });

    res.json({
      success: true,
      message: "User blocked successfully",
    });
  } catch (error) {
    console.error("Error blocking user:", error);
    res.status(500).json({
      success: false,
      message: "Failed to block user",
    });
  }
});

// Unblock a user
router.post("/unblock/:userId", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    // Remove from blocked users
    await User.findByIdAndUpdate(req.user.id, {
      $pull: { blockedUsers: userId },
    });

    res.json({
      success: true,
      message: "User unblocked successfully",
    });
  } catch (error) {
    console.error("Error unblocking user:", error);
    res.status(500).json({
      success: false,
      message: "Failed to unblock user",
    });
  }
});

// Get blocked users
router.get("/blocked", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate(
      "blockedUsers",
      "fullName username profileImage"
    );

    res.json({
      success: true,
      data: user.blockedUsers,
    });
  } catch (error) {
    console.error("Error fetching blocked users:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch blocked users",
    });
  }
});

// Reset swipe history (likes/dislikes/superlikes/passes) for arcade matching
router.post("/swipes/reset", authenticateToken, async (req, res) => {
  try {
    const UserInteraction = (await import("../models/UserInteraction.js"))
      .default;
    const result = await UserInteraction.updateMany(
      {
        user1: req.user.id,
        interactionType: {
          $in: ["like", "dislike", "superlike", "super_like", "pass"],
        },
        context: "matching",
        isActive: true,
      },
      {
        $set: { isActive: false, updatedAt: new Date() },
      }
    );
    return res.json({
      success: true,
      message: "Swipe history reset",
      data: { modified: result?.modifiedCount ?? 0 },
    });
  } catch (error) {
    console.error("Error resetting swipe history:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to reset swipe history" });
  }
});

// Remove a match/friend and require new message request for future chatting
router.post("/matches/remove/:userId", authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params; // the user to unfriend
    const me = req.user.id;

    if (userId === me) {
      return res
        .status(400)
        .json({ success: false, message: "Cannot remove yourself" });
    }

    const Match = (await import("../models/Match.js")).default;
    const Chat = (await import("../models/Chat.js")).default;

    // Ensure match docs exist in both directions and keep them active
    const [meDoc, otherDoc] = await Promise.all([
      User.findById(me).select("name username avatar").lean(),
      User.findById(userId).select("name username avatar").lean(),
    ]);

    const ensureActive = async (uid, mid, partner) => {
      let r = await Match.findOne({ userId: uid, matchedUserId: mid });
      if (!r) {
        r = await Match.createMatch(
          uid,
          mid,
          partner?.name || partner?.username || "",
          partner?.avatar || null,
          "mutual_like",
          0
        );
      }
      r.isActive = true;
      // Reset request/approval flags so a new message will create a fresh request
      r.messageRequestPending = false;
      r.messageRequestFrom = null;
      r.messagingApproved = false;
      await r.save();
      return r;
    };

    const [m1, m2] = await Promise.all([
      ensureActive(me, userId, otherDoc),
      ensureActive(userId, me, meDoc),
    ]);

    // Reset chat approvals and clear messages between the two users (keep chat shell)
    const chats = await Chat.find({ participants: { $all: [me, userId] } });
    for (const chat of chats) {
      try {
        chat.isApproved = false;
        if (Array.isArray(chat.messages)) {
          for (const msg of chat.messages) {
            // best-effort soft delete if schema supports it
            msg.isDeleted = true;
          }
        }
        await chat.save();
        // backfill chatId onto match rows if not already present
        if (chat._id) {
          if (!m1.chatId) {
            m1.chatId = chat._id;
            await m1.save();
          }
          if (!m2.chatId) {
            m2.chatId = chat._id;
            await m2.save();
          }
        }
      } catch (e) {
        // If chat schema differs (e.g., messages are in a separate collection), ignore silently
        console.warn("Unfriend chat reset warning:", e?.message || e);
      }
    }

    return res.json({
      success: true,
      message:
        "Unfriended successfully. Chat history cleared and future messages will require a new request.",
    });
  } catch (error) {
    console.error("Error unfriending user:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to unfriend user" });
  }
});

export default router;
// Relationship lookup: are we blocked or have we blocked them?
router.get("/relationship/:userId", authenticateToken, async (req, res) => {
  try {
    const targetId = req.params.userId;
    const meId = req.user.id;
    if (!targetId) {
      return res
        .status(400)
        .json({ success: false, message: "Missing userId" });
    }
    const [me, other] = await Promise.all([
      User.findById(meId).select("blockedUsers").lean(),
      User.findById(targetId).select("blockedUsers").lean(),
    ]);
    if (!other) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    const iBlocked = Array.isArray(me?.blockedUsers)
      ? me.blockedUsers.some((id) => id?.toString() === targetId)
      : false;
    const blockedByPeer = Array.isArray(other?.blockedUsers)
      ? other.blockedUsers.some((id) => id?.toString() === meId)
      : false;
    return res.json({ success: true, data: { iBlocked, blockedByPeer } });
  } catch (e) {
    console.error("relationship lookup failed:", e);
    return res
      .status(500)
      .json({ success: false, message: "Failed to check relationship" });
  }
});
