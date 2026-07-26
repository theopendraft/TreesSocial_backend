import express from "express";
import { auth } from "../middleware/auth.js";
import { uploadReel, cloudinaryUtils } from "../config/cloudinary.js";
import User from "../models/User.js";
import Reel from "../models/Reel.js";
import Report from "../models/Reports.js";
import Notification from "../models/Notification.js";

const router = express.Router();

// Get reels feed with infinite scroll
router.get("/feed", auth, async (req, res) => {
  try {
    const { page = 1, limit = 10, category, search } = req.query;
    const skip = (page - 1) * limit;

    let query = { isActive: true };

    // Add category filter
    if (category) {
      query.category = category;
    }

    // Add search filter
    if (search) {
      query.$or = [
        { caption: { $regex: search, $options: "i" } },
        { tags: { $in: [new RegExp(search, "i")] } },
      ];
    }

    const reels = await Reel.find(query)
      .populate("author", "username profilePicture isVerified")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Add user interaction data
    const reelsWithInteractions = await Promise.all(
      reels.map(async (reel) => {
        const isLiked = reel.likes.includes(req.user.id);
        const isSaved = req.user.savedReels?.includes(reel._id) || false;

        return {
          ...reel.toObject(),
          isLiked,
          isSaved,
          likesCount: reel.likes.length,
          commentsCount: reel.comments.length,
          sharesCount: reel.shares.length,
        };
      })
    );

    res.json({
      reels: reelsWithInteractions,
      hasMore: reels.length === parseInt(limit),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Upload new reel
router.post("/upload", auth, uploadReel.single("video"), async (req, res) => {
  try {
    const { caption, tags, category = "general" } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: "Video file is required" });
    }

    // Generate thumbnail for the reel
    const thumbnailUrl = cloudinaryUtils.generateVideoThumbnail(
      req.file.filename,
      {
        transformation: [
          { width: 405, height: 720, crop: "fill" }, // Reel aspect ratio
        ],
      }
    );

    const reel = new Reel({
      author: req.user.id,
      videoUrl: req.file.path, // Cloudinary URL
      videoPublicId: req.file.filename, // Cloudinary public ID
      caption,
      tags: tags ? tags.split(",").map((tag) => tag.trim()) : [],
      category,
      duration: req.file.duration || 0, // Video duration in seconds
      thumbnail: thumbnailUrl, // Generated thumbnail URL
    });

    await reel.save();
    await reel.populate("author", "username profilePicture isVerified");

    res.status(201).json({
      message: "Reel uploaded successfully",
      reel: {
        ...reel.toObject(),
        thumbnailUrl,
        videoInfo: {
          size: req.file.bytes,
          format: req.file.format,
          width: req.file.width,
          height: req.file.height,
          duration: req.file.duration,
        },
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single reel
router.get("/:id", auth, async (req, res) => {
  try {
    const reel = await Reel.findById(req.params.id)
      .populate("author", "username profilePicture isVerified")
      .populate("comments.author", "username profilePicture");

    if (!reel) {
      return res.status(404).json({ error: "Reel not found" });
    }

    // Increment view count
    await Reel.findByIdAndUpdate(req.params.id, {
      $inc: { views: 1 },
      $addToSet: { viewers: req.user.id },
    });

    const isLiked = reel.likes.includes(req.user.id);
    const isSaved = req.user.savedReels?.includes(reel._id) || false;

    res.json({
      ...reel.toObject(),
      isLiked,
      isSaved,
      likesCount: reel.likes.length,
      commentsCount: reel.comments.length,
      sharesCount: reel.shares.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Like/Unlike reel
router.post("/:id/like", auth, async (req, res) => {
  try {
    const reel = await Reel.findById(req.params.id);
    if (!reel) {
      return res.status(404).json({ error: "Reel not found" });
    }

    const isLiked = reel.likes.includes(req.user.id);

    if (isLiked) {
      reel.likes.pull(req.user.id);
    } else {
      reel.likes.push(req.user.id);
    }

    await reel.save();

    // Notify author on new like (avoid self)
    if (
      !isLiked &&
      reel.author?.toString &&
      reel.author.toString() !== req.user.id
    ) {
      try {
        await Notification.createNotification({
          type: "like",
          sender: req.user.id,
          recipient: reel.author,
          title: "New Like",
          message: `${
            req.user.username || req.user.name || "Someone"
          } liked your reel`,
          data: { reelId: reel._id.toString() },
          category: "social",
          priority: "low",
        });
      } catch (e) {
        console.warn("Failed to create reel like notification:", e.message);
      }
    }

    res.json({
      message: isLiked ? "Reel unliked" : "Reel liked",
      isLiked: !isLiked,
      likesCount: reel.likes.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Comment on reel
router.post("/:id/comment", auth, async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: "Comment text is required" });
    }

    const reel = await Reel.findById(req.params.id);
    if (!reel) {
      return res.status(404).json({ error: "Reel not found" });
    }

    const comment = {
      author: req.user.id,
      text: text.trim(),
      createdAt: new Date(),
    };

    reel.comments.push(comment);
    await reel.save();
    await reel.populate("comments.author", "username profilePicture");

    // Notify author on comment (avoid self)
    if (reel.author?.toString && reel.author.toString() !== req.user.id) {
      try {
        await Notification.createNotification({
          type: "comment",
          sender: req.user.id,
          recipient: reel.author,
          title: "New Comment",
          message: `${
            req.user.username || req.user.name || "Someone"
          } commented on your reel`,
          data: { reelId: reel._id.toString() },
          category: "social",
          priority: "medium",
        });
      } catch (e) {
        console.warn("Failed to create reel comment notification:", e.message);
      }
    }

    res.status(201).json({
      message: "Comment added successfully",
      comment: reel.comments[reel.comments.length - 1],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Share reel
router.post("/:id/share", auth, async (req, res) => {
  try {
    const reel = await Reel.findByIdAndUpdate(
      req.params.id,
      {
        $inc: { shares: 1 },
        $addToSet: { sharedBy: req.user.id },
      },
      { new: true }
    );

    if (!reel) {
      return res.status(404).json({ error: "Reel not found" });
    }

    res.json({
      message: "Reel shared successfully",
      sharesCount: reel.shares.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Save/Unsave reel
router.post("/:id/save", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const isSaved = user.savedReels?.includes(req.params.id) || false;

    if (isSaved) {
      user.savedReels.pull(req.params.id);
    } else {
      if (!user.savedReels) {
        user.savedReels = [];
      }
      user.savedReels.push(req.params.id);
    }

    await user.save();

    res.json({
      message: isSaved ? "Reel unsaved" : "Reel saved",
      isSaved: !isSaved,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get current user's saved reels
router.get("/saved", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate({
      path: "savedReels",
      populate: {
        path: "author",
        select: "username profilePicture isVerified name",
      },
    });

    const saved = (user?.savedReels || []).map((reel) => ({
      id: reel._id.toString(),
      type: "reel",
      content: reel.caption || "",
      video: reel.videoUrl || null,
      videoThumbnail: reel.thumbnail || null,
      likes: Array.isArray(reel.likes) ? reel.likes.length : 0,
      comments: Array.isArray(reel.comments) ? reel.comments.length : 0,
      shares: Array.isArray(reel.shares) ? reel.shares.length : 0,
      views: reel.views || 0,
      createdAt: reel.createdAt,
      user: {
        _id: reel.author?._id,
        name: reel.author?.name || reel.author?.username,
        username: reel.author?.username,
        avatar: reel.author?.profilePicture,
        verified: reel.author?.isVerified || false,
      },
      isBookmarked: true,
      isLiked: false,
    }));

    res.json({ success: true, data: { reels: saved } });
  } catch (error) {
    console.error("Error fetching saved reels:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Report reel
router.post("/:id/report", auth, async (req, res) => {
  try {
    const { reason, description } = req.body;

    if (!reason) {
      return res.status(400).json({ error: "Report reason is required" });
    }

    const reel = await Reel.findById(req.params.id);
    if (!reel) {
      return res.status(404).json({ error: "Reel not found" });
    }

    const report = new Report({
      reporter: req.user.id,
      contentType: "reel",
      contentId: req.params.id,
      reason,
      description: description || "",
      status: "pending",
    });

    await report.save();

    res.status(201).json({
      message: "Reel reported successfully",
      reportId: report._id,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get reel statistics (for author)
router.get("/:id/stats", auth, async (req, res) => {
  try {
    const reel = await Reel.findById(req.params.id);
    if (!reel) {
      return res.status(404).json({ error: "Reel not found" });
    }

    // Check if user is the author
    if (reel.author.toString() !== req.user.id) {
      return res.status(403).json({ error: "Access denied" });
    }

    const stats = {
      views: reel.views,
      likes: reel.likes.length,
      comments: reel.comments.length,
      shares: reel.shares.length,
      engagement: (
        ((reel.likes.length + reel.comments.length + reel.shares.length) /
          Math.max(reel.views, 1)) *
        100
      ).toFixed(2),
    };

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete reel (author only)
router.delete("/:id", auth, async (req, res) => {
  try {
    const reel = await Reel.findById(req.params.id);
    if (!reel) {
      return res.status(404).json({ error: "Reel not found" });
    }

    // Check if user is the author
    if (reel.author.toString() !== req.user.id) {
      return res.status(403).json({ error: "Access denied" });
    }

    await Reel.findByIdAndDelete(req.params.id);

    res.json({ message: "Reel deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get trending reels
router.get("/trending/now", auth, async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    // Calculate trending score based on engagement in last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const reels = await Reel.aggregate([
      {
        $match: {
          isActive: true,
          createdAt: { $gte: oneDayAgo },
        },
      },
      {
        $addFields: {
          engagementScore: {
            $add: [
              { $size: "$likes" },
              { $multiply: [{ $size: "$comments" }, 2] },
              { $multiply: ["$shares", 3] },
              { $divide: ["$views", 10] },
            ],
          },
        },
      },
      {
        $sort: { engagementScore: -1 },
      },
      {
        $limit: parseInt(limit),
      },
    ]);

    await Reel.populate(reels, {
      path: "author",
      select: "username profilePicture isVerified",
    });

    res.json(reels);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
