import express from "express";
import Post from "../models/Post.js";
import User from "../models/User.js";
import { auth } from "../middleware/auth.js";

const router = express.Router();

// Get stories for current user's feed (from people they follow)
router.get("/", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("following");

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Get stories from people the user follows + their own stories
    const userFollowing = user.following || [];
    const authorIds = [...userFollowing, req.user.id];

    const stories = await Post.find({
      authorId: { $in: authorIds },
      type: "story",
      expiresAt: { $gt: new Date() }, // Only non-expired stories
    })
      .populate("authorId", "username name profileImage verified")
      .sort({ createdAt: -1 })
      .lean();

    // Group stories by author
    const groupedStories = {};
    stories.forEach((story) => {
      const authorId = story.authorId._id.toString();
      if (!groupedStories[authorId]) {
        groupedStories[authorId] = {
          user: story.authorId,
          stories: [],
        };
      }
      groupedStories[authorId].stories.push(story);
    });

    // Convert to array and sort by latest story
    const storyGroups = Object.values(groupedStories).map((group) => {
      group.stories.sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );
      return {
        ...group,
        latestStory: group.stories[0],
        hasUnviewedStories: group.stories.some(
          (story) =>
            !story.views?.some(
              (view) => view.userId && view.userId.toString() === req.user.id
            )
        ),
      };
    });

    // Sort by unviewed stories first, then by latest story time
    storyGroups.sort((a, b) => {
      if (a.hasUnviewedStories && !b.hasUnviewedStories) return -1;
      if (!a.hasUnviewedStories && b.hasUnviewedStories) return 1;
      return (
        new Date(b.latestStory.createdAt) - new Date(a.latestStory.createdAt)
      );
    });

    // Get current user's stories separately
    const userStories = await Post.find({
      authorId: req.user.id,
      type: "story",
      expiresAt: { $gt: new Date() },
    })
      .populate("authorId", "username name profileImage verified")
      .sort({ createdAt: -1 })
      .lean();

    // Filter out user's own stories from the main story groups
    const filteredStoryGroups = storyGroups.filter(
      (group) => group.user._id.toString() !== req.user.id
    );

    res.json({
      storyGroups: filteredStoryGroups,
      userStories: userStories,
    });
  } catch (error) {
    console.error("Error fetching stories:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get current user's own stories
router.get("/my", auth, async (req, res) => {
  try {
    const stories = await Post.find({
      authorId: req.user.id,
      type: "story",
      expiresAt: { $gt: new Date() }, // Only non-expired stories
    })
      .populate("authorId", "username name profileImage verified")
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      data: stories,
    });
  } catch (error) {
    console.error("Error fetching user stories:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get specific user's stories
router.get("/user/:userId", auth, async (req, res) => {
  try {
    const { userId } = req.params;

    // Check if the requesting user can view this user's stories
    const targetUser = await User.findById(userId).select(
      "privacy.profileVisibility followers"
    );

    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }

    const isSelf = (req.user.id || req.user._id).toString() === userId;
    const isPrivate = targetUser.privacy?.profileVisibility === "private";
    const isFollower = (targetUser.followers || []).some(
      (id) => id.toString() === (req.user.id || req.user._id).toString()
    );

    if (isPrivate && !isSelf && !isFollower) {
      return res.status(403).json({ error: "Cannot view this user's stories" });
    }

    const stories = await Post.find({
      authorId: userId,
      type: "story",
      expiresAt: { $gt: new Date() },
    })
      .populate("authorId", "username name profileImage verified")
      .sort({ createdAt: -1 });

    res.json(stories);
  } catch (error) {
    console.error("Error fetching user stories:", error);
    res.status(500).json({ error: error.message });
  }
});

// Create a new story
router.post("/", auth, async (req, res) => {
  try {
    const { content, media, textOverlays, stickers, backgroundColor } =
      req.body;

    if (!media && !content && !textOverlays?.length) {
      return res
        .status(400)
        .json({ error: "Story must have content, media, or text overlays" });
    }

    // Calculate expiration time (24 hours from now)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const story = new Post({
      authorId: req.user.id,
      content: content || "",
      media: media || [],
      type: "story",
      expiresAt,
      metadata: {
        textOverlays: textOverlays || [],
        stickers: stickers || [],
        backgroundColor: backgroundColor || "#000000",
      },
      views: [],
      likes: [],
      comments: [],
    });

    await story.save();
    await story.populate("authorId", "username name profileImage verified");

    res.status(201).json({
      message: "Story created successfully",
      story,
    });
  } catch (error) {
    console.error("Error creating story:", error);
    res.status(500).json({ error: error.message });
  }
});

// View a story (increment view count)
router.post("/:storyId/view", auth, async (req, res) => {
  try {
    const { storyId } = req.params;

    const story = await Post.findById(storyId);
    if (!story || story.type !== "story") {
      return res.status(404).json({ error: "Story not found" });
    }

    // Check if story has expired
    if (new Date() > story.expiresAt) {
      return res.status(410).json({ error: "Story has expired" });
    }

    // Add view if not already viewed by this user
    const hasViewed = story.views.some(
      (view) => view.userId && view.userId.toString() === req.user.id
    );
    if (!hasViewed) {
      story.views.push({ userId: req.user.id });
      await story.save();
    }

    res.json({ message: "Story viewed", views: story.views.length });
  } catch (error) {
    console.error("Error viewing story:", error);
    res.status(500).json({ error: error.message });
  }
});

// Like/unlike a story
router.post("/:storyId/like", auth, async (req, res) => {
  try {
    const { storyId } = req.params;

    const story = await Post.findById(storyId);
    if (!story || story.type !== "story") {
      return res.status(404).json({ error: "Story not found" });
    }

    // Check if story has expired
    if (new Date() > story.expiresAt) {
      return res.status(410).json({ error: "Story has expired" });
    }

    const isLiked = story.likes.some(
      (like) => like.userId && like.userId.toString() === req.user.id
    );

    if (isLiked) {
      // Unlike
      story.likes = story.likes.filter(
        (like) => like.userId.toString() !== req.user.id
      );
    } else {
      // Like
      story.likes.push({ userId: req.user.id });
    }

    await story.save();

    res.json({
      message: isLiked ? "Story unliked" : "Story liked",
      isLiked: !isLiked,
      likes: story.likes.length,
    });
  } catch (error) {
    console.error("Error liking story:", error);
    res.status(500).json({ error: error.message });
  }
});

// Delete a story (only story owner can delete)
router.delete("/:storyId", auth, async (req, res) => {
  try {
    const { storyId } = req.params;

    const story = await Post.findById(storyId);
    if (!story || story.type !== "story") {
      return res.status(404).json({ error: "Story not found" });
    }

    // Check if user owns the story
    if (story.authorId.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ error: "You can only delete your own stories" });
    }

    await Post.findByIdAndDelete(storyId);

    res.json({ message: "Story deleted successfully" });
  } catch (error) {
    console.error("Error deleting story:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get story viewers (only story owner can see this)
router.get("/:storyId/viewers", auth, async (req, res) => {
  try {
    const { storyId } = req.params;

    // views and likes are arrays of subdocuments like { userId, ... }
    // We must populate the nested userId field, not the root array
    const story = await Post.findById(storyId)
      .populate({
        path: "views.userId",
        select: "username name profileImage isVerified",
      })
      .populate({
        path: "likes.userId",
        select: "username name profileImage isVerified",
      });

    if (!story || story.type !== "story") {
      return res.status(404).json({ error: "Story not found" });
    }

    // Check if user owns the story
    if (story.authorId.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ error: "You can only view your own story analytics" });
    }

    // Shape viewers and likes to a consistent, frontend-friendly format
    const viewers = (Array.isArray(story.views) ? story.views : [])
      .map((v) => {
        const u = v?.userId;
        if (!u || !u.username) return null;
        return {
          user: {
            _id: u._id,
            username: u.username,
            name: u.name || u.username,
            profileImage: u.profileImage,
            isVerified: u.isVerified || false,
          },
          viewedAt: v?.viewedAt || v?.createdAt || undefined,
        };
      })
      .filter(Boolean);

    const likes = (Array.isArray(story.likes) ? story.likes : [])
      .map((l) => {
        const u = l?.userId;
        if (!u || !u.username) return null;
        return {
          user: {
            _id: u._id,
            username: u.username,
            name: u.name || u.username,
            profileImage: u.profileImage,
            isVerified: u.isVerified || false,
          },
          likedAt: l?.likedAt || l?.createdAt || undefined,
        };
      })
      .filter(Boolean);

    res.json({
      viewers,
      likes,
      viewCount: viewers.length,
      likeCount: likes.length,
    });
  } catch (error) {
    console.error("Error fetching story viewers:", error);
    res.status(500).json({ error: error.message });
  }
});

// Cleanup expired stories (called by cron job or manually)
router.delete("/cleanup/expired", auth, async (req, res) => {
  try {
    // Only allow admin users to call this endpoint
    const user = await User.findById(req.user.id);
    if (!user.isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const result = await Post.deleteMany({
      type: "story",
      expiresAt: { $lt: new Date() },
    });

    res.json({
      message: "Expired stories cleaned up",
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Error cleaning up expired stories:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
