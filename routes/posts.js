import express from "express";
import mongoose from "mongoose";
import { auth } from "../middleware/auth.js";
import Post from "../models/Post.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";

const router = express.Router();

// Get feed posts
router.get("/feed", auth, async (req, res) => {
  try {
    let { page = 1, limit = 10 } = req.query;

    // Ensure page is at least 1
    page = Math.max(1, parseInt(page));
    limit = Math.max(1, Math.min(50, parseInt(limit))); // Limit between 1-50

    console.log(`Feed request - Page: ${page}, Limit: ${limit}`);

    // Check if user is authenticated
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: "User not authenticated",
      });
    }

    const userId = req.user.id || req.user._id;
    console.log(`User ID: ${userId}`);
    console.log(`User object:`, req.user);

    let user;
    if (userId === "demo_user_id") {
      // Demo user - use the user object from req.user
      user = {
        _id: userId,
        following: req.user.following || [],
        followers: req.user.followers || [],
      };
    } else {
      // Real user - find in database
      user = await User.findById(userId);
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    console.log(`User following: ${user.following}`);
    console.log(`Following count: ${user.following?.length || 0}`);

    // Get all non-story posts first to debug
    const allPosts = await Post.find({ type: { $ne: "story" } });
    console.log(`Total posts in database: ${allPosts.length}`);
    if (allPosts.length > 0) {
      console.log(
        `Sample post authorId: ${
          allPosts[0].authorId
        }, type: ${typeof allPosts[0].authorId}`
      );
    }

    // Convert userId to ObjectId for consistent comparison, but handle demo user specially
    let userObjectId;
    if (userId === "demo_user_id") {
      // Demo user - handle as string
      userObjectId = userId;
    } else {
      // Real user - convert to ObjectId
      userObjectId = new mongoose.Types.ObjectId(userId);
    }

    // Create array of user IDs to show posts from (following + self)
    const followingIds = (user.following || []).map((id) => {
      if (typeof id === "string" && id === "demo_user_id") {
        return id; // Keep demo user ID as string
      }
      return typeof id === "string" ? new mongoose.Types.ObjectId(id) : id;
    });
    const userIdsToShow = [...followingIds, userObjectId];

    console.log(
      `Showing posts from users: ${userIdsToShow.map((id) => id.toString())}`
    );

    // Special handling for demo user - return sample posts + posts from followed users
    if (userId === "demo_user_id") {
      console.log("Demo user detected - getting posts from followed users");
      console.log(
        `Demo user following: ${JSON.stringify(user.following || [])}`
      );

      // Get posts from followed users if any
      let followedUsersPosts = [];
      if (user.following && user.following.length > 0) {
        const followedUsersObjectIds = user.following.map((id) =>
          typeof id === "string" ? new mongoose.Types.ObjectId(id) : id
        );

        console.log(
          `Looking for posts from followed users: ${followedUsersObjectIds.map(
            (id) => id.toString()
          )}`
        );

        followedUsersPosts = await Post.find({
          authorId: { $in: followedUsersObjectIds },
          type: { $ne: "story" },
        })
          .populate("authorId", "username profileImage isVerified name")
          .sort({ createdAt: -1 })
          .limit(10);

        console.log(
          `Found ${followedUsersPosts.length} posts from followed users`
        );
      }

      // Transform followed users' posts to match frontend expectations
      const transformedFollowedPosts = followedUsersPosts.map((post) => {
        let mediaType = "text";
        let video = null;
        let videoThumbnail = null;
        let image = null;

        // Support new media array
        if (Array.isArray(post.media) && post.media.length > 0) {
          const imageMedia = post.media.find((m) => m.type === "image");
          const videoMedia = post.media.find((m) => m.type === "video");
          if (videoMedia) {
            mediaType = "video";
            video = videoMedia.url;
            videoThumbnail = videoMedia.thumbnail || null;
          } else if (imageMedia) {
            mediaType = "image";
            image = imageMedia.url;
          }
        } else if (post.image || post.file) {
          const mediaUrl = post.image || post.file;
          const videoFormats = [
            ".mp4",
            ".webm",
            ".avi",
            ".mov",
            ".mkv",
            ".m4v",
          ];
          const isVideo = videoFormats.some((format) =>
            mediaUrl?.toLowerCase().includes(format)
          );
          if (isVideo) {
            mediaType = "video";
            video = mediaUrl;
            videoThumbnail = post.thumbnail || null;
          } else {
            mediaType = "image";
            image = mediaUrl;
          }
        }

        return {
          id: post._id.toString(),
          authorId: post.authorId._id.toString(),
          authorName: post.authorId.name || post.authorId.username,
          authorAvatar: post.authorId.profileImage || null,
          content: post.content || "",
          image,
          video,
          videoThumbnail,
          mediaType,
          likes: post.likes?.length || 0,
          comments: post.comments?.length || 0,
          shares: post.shares?.length || 0,
          isLiked: post.likes?.includes(userId) || false,
          timestamp: post.createdAt.toISOString(),
          createdAt: post.createdAt.toISOString(),
        };
      });

      const samplePosts = [
        {
          id: "demo_post_1",
          authorId: "demo_user_id",
          authorName: "Demo User",
          authorAvatar: null,
          content:
            "Welcome to the demo! This is your first post. The feed system is working correctly! 🎉",
          image: null,
          video: null,
          videoThumbnail: null,
          mediaType: "text",
          likes: 5,
          comments: 2,
          shares: 1,
          isLiked: false,
          timestamp: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
        {
          id: "demo_post_2",
          authorId: "demo_user_id",
          authorName: "Demo User",
          authorAvatar: null,
          content:
            "This is a second demo post to show the feed functionality. The authentication, feed query, and post display are all working! ✨",
          image: null,
          video: null,
          videoThumbnail: null,
          mediaType: "text",
          likes: 12,
          comments: 3,
          shares: 0,
          isLiked: true,
          timestamp: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
          createdAt: new Date(Date.now() - 3600000).toISOString(),
        },
      ];

      // Combine sample posts with followed users' posts
      const allPosts = [...transformedFollowedPosts, ...samplePosts];

      // Sort by creation date (newest first)
      allPosts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      console.log(
        `Returning ${allPosts.length} total posts for demo user (${transformedFollowedPosts.length} from followed users + ${samplePosts.length} demo posts)`
      );

      return res.json({
        success: true,
        data: {
          posts: allPosts,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: allPosts.length,
            totalPages: Math.ceil(allPosts.length / limit),
            hasNext: false,
            hasPrev: false,
          },
        },
      });
    }

    // Simple and effective query - show posts from followed users + own posts
    // Include common types (post/image/video/text) and exclude stories
    // Also include PSA posts from system user
    const query = {
      $or: [
        {
          authorId: { $in: userIdsToShow },
          type: { $in: ["post", "image", "video", "text"] },
        },
        {
          isPSA: true,
          type: "text"
        }
      ]
    };

    console.log(`Feed query:`, JSON.stringify(query, null, 2));

    const posts = await Post.find(query)
      .populate("authorId", "username profileImage isVerified name")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    console.log(`Found ${posts.length} feed posts`);
    if (posts.length > 0) {
      console.log(
        `First post author: ${posts[0].authorId?.username}, id: ${posts[0].authorId?._id}`
      );
    }

    // Transform posts to match frontend expectations
    const userIdStr = (req.user.id || req.user._id).toString();
    const transformedPosts = posts.map((post) => {
      let mediaType = "text";
      let video = null;
      let videoThumbnail = null;
      let image = null;

      // Support new media array
      if (Array.isArray(post.media) && post.media.length > 0) {
        const imageMedia = post.media.find((m) => m.type === "image");
        const videoMedia = post.media.find((m) => m.type === "video");
        if (videoMedia) {
          mediaType = "video";
          video = videoMedia.url;
          videoThumbnail = videoMedia.thumbnail || null;
        } else if (imageMedia) {
          mediaType = "image";
          image = imageMedia.url;
        }
      } else if (post.image || post.file) {
        const mediaUrl = post.image || post.file;
        const videoFormats = [".mp4", ".webm", ".avi", ".mov", ".mkv", ".m4v"];
        const isVideo = videoFormats.some((format) =>
          mediaUrl?.toLowerCase().includes(format)
        );
        if (isVideo) {
          mediaType = "video";
          video = mediaUrl;
          videoThumbnail = post.thumbnail || null;
        } else {
          mediaType = "image";
          image = mediaUrl;
        }
      }

      // Determine interactions
      const likesArray = Array.isArray(post.likes) ? post.likes : [];
      const isObjectShape =
        likesArray[0] &&
        typeof likesArray[0] === "object" &&
        "userId" in likesArray[0];
      const liked = isObjectShape
        ? likesArray.some((l) => l.userId?.toString() === userIdStr)
        : likesArray.some((l) => l?.toString() === userIdStr);

      const bookmarked = Array.isArray(req.user?.savedPosts)
        ? req.user.savedPosts.some(
            (pid) => pid?.toString() === post._id.toString()
          )
        : false;

      // Handle PSA posts that may not have populated author
      const author = post.authorId || {};
      const isPSAPost = post.isPSA || false;

      return {
        id: post._id.toString(),
        authorId: author._id?.toString() || post.authorId?.toString() || "system",
        authorName: isPSAPost ? "Trees" : (author.name || author.username || "Unknown"),
        authorAvatar: isPSAPost ? null : (author.profileImage || null),
        content: post.content || "",
        image,
        images: image ? [image] : [],
        video,
        videoThumbnail,
        mediaType,
        timestamp: post.createdAt,
        likes: Array.isArray(post.likes) ? post.likes.length : 0,
        comments: Array.isArray(post.comments) ? post.comments.length : 0,
        shares: Array.isArray(post.shares) ? post.shares.length : 0,
        isLiked: !!liked,
        isBookmarked: !!bookmarked,
        type: post.type || "post",
        isPSA: isPSAPost,
        user: {
          _id: author._id || post.authorId || "system",
          name: isPSAPost ? "Trees" : (author.name || author.username || "Unknown"),
          username: isPSAPost ? "trees" : (author.username || "unknown"),
          avatar: isPSAPost ? null : (author.profileImage || null),
          verified: isPSAPost ? true : (author.isVerified || false),
        },
        createdAt: post.createdAt,
        views: post.views || 0,
        saves: post.saves || 0,
      };
    });

    console.log(`Transformed ${transformedPosts.length} feed posts`);
    if (transformedPosts.length > 0) {
      console.log(
        `First transformed post:`,
        JSON.stringify(transformedPosts[0], null, 2)
      );
    }
    res.json({
      success: true,
      data: transformedPosts,
      message: "Feed posts retrieved successfully",
    });
  } catch (error) {
    console.error("Error fetching feed posts:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get single post by ID with transformed fields
// NOTE: Specific routes (/stories, /reels) must be declared before the catch-all /:id route

// Get stories
router.get("/stories", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    const stories = await Post.find({
      author: { $in: [...user.following, req.user.id] },
      type: "story",
      expiresAt: { $gt: new Date() },
    })
      .populate("author", "username profileImage")
      .sort({ createdAt: -1 });

    res.json(stories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get reels
router.get("/reels", auth, async (req, res) => {
  try {
    let { page = 1, limit = 10 } = req.query;
    page = Math.max(1, parseInt(page));
    limit = Math.max(1, Math.min(50, parseInt(limit)));

    // Determine users to include (following + self)
    const userId = req.user.id || req.user._id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    const userIdsToShow = [
      ...(user.following || []).map((id) =>
        typeof id === "string" ? new mongoose.Types.ObjectId(id) : id
      ),
      typeof userId === "string" ? new mongoose.Types.ObjectId(userId) : userId,
    ];

    const query = {
      authorId: { $in: userIdsToShow },
      type: "reel",
      // Note: do not filter by isApproved here since schema may not define it
    };

    const reels = await Post.find(query)
      .populate("authorId", "username profileImage isVerified name")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    // Transform minimally; frontend can handle either shape
    const transformed = reels.map((post) => {
      // Prefer video from media array
      let video = null;
      let videoThumbnail = null;
      if (Array.isArray(post.media) && post.media.length > 0) {
        const vid = post.media.find((m) => m.type === "video");
        if (vid) {
          video = vid.url;
          videoThumbnail = vid.thumbnail || null;
        }
      }
      // Compute isLiked for current user; support both schemas
      const likesArray = Array.isArray(post.likes) ? post.likes : [];
      const userIdStr = (req.user.id || req.user._id).toString();
      const isObjectShape =
        likesArray[0] &&
        typeof likesArray[0] === "object" &&
        "userId" in likesArray[0];
      const isLiked = isObjectShape
        ? likesArray.some((l) => l?.userId?.toString?.() === userIdStr)
        : likesArray.some((l) => l?.toString?.() === userIdStr);

      const isBookmarked = Array.isArray(req.user?.savedPosts)
        ? req.user.savedPosts.some(
            (pid) => pid?.toString() === post._id.toString()
          )
        : false;

      return {
        id: post._id.toString(),
        type: post.type,
        content: post.content || "",
        video,
        videoThumbnail,
        likes: Array.isArray(post.likes) ? post.likes.length : 0,
        comments: Array.isArray(post.comments) ? post.comments.length : 0,
        shares: Array.isArray(post.shares) ? post.shares.length : 0,
        views: Array.isArray(post.views) ? post.views.length : 0,
        createdAt: post.createdAt,
        isLiked,
        isBookmarked,
        user: {
          _id: post.authorId._id,
          name: post.authorId.name || post.authorId.username,
          username: post.authorId.username,
          avatar: post.authorId.profileImage,
          verified: post.authorId.isVerified || false,
        },
      };
    });

    res.json({
      success: true,
      data: { reels: transformed, hasMore: transformed.length === limit },
      message: "Reels retrieved successfully",
    });
  } catch (error) {
    console.error("Error fetching reels:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get single post by ID with transformed fields (placed AFTER /stories and /reels)
router.get("/:id([0-9a-fA-F]{24})", auth, async (req, res) => {
  try {
    const { id } = req.params;
    const post = await Post.findById(id)
      .populate("authorId", "username profileImage isVerified name")
      .populate("comments.userId", "username name profileImage isVerified");

    if (!post)
      return res.status(404).json({ success: false, error: "Post not found" });

    // Resolve media
    let image = null;
    let video = null;
    let videoThumbnail = null;
    if (Array.isArray(post.media) && post.media.length > 0) {
      const imageMedia = post.media.find((m) => m.type === "image");
      const videoMedia = post.media.find((m) => m.type === "video");
      if (videoMedia) {
        video = videoMedia.url;
        videoThumbnail = videoMedia.thumbnail || null;
      } else if (imageMedia) {
        image = imageMedia.url;
      }
    } else if (post.image || post.file) {
      const mediaUrl = post.image || post.file;
      const videoFormats = [".mp4", ".webm", ".avi", ".mov", ".mkv", ".m4v"];
      const isVideo =
        mediaUrl &&
        videoFormats.some((format) => mediaUrl.toLowerCase().includes(format));
      if (isVideo) {
        video = mediaUrl;
        videoThumbnail = post.thumbnail || null;
      } else {
        image = mediaUrl;
      }
    }

    const userIdStr = (req.user.id || req.user._id).toString();
    const likesArray = Array.isArray(post.likes) ? post.likes : [];
    const isObjectShape =
      likesArray[0] &&
      typeof likesArray[0] === "object" &&
      "userId" in likesArray[0];
    const liked = isObjectShape
      ? likesArray.some((l) => l.userId?.toString() === userIdStr)
      : likesArray.some((l) => l?.toString() === userIdStr);
    const bookmarked = Array.isArray(req.user?.savedPosts)
      ? req.user.savedPosts.some(
          (pid) => pid?.toString() === post._id.toString()
        )
      : false;

    const transformed = {
      id: post._id.toString(),
      authorId: post.authorId?._id?.toString(),
      authorName: post.authorId?.name || post.authorId?.username,
      authorAvatar: post.authorId?.profileImage || null,
      content: post.content || "",
      image,
      video,
      videoThumbnail,
      mediaType: video ? "video" : image ? "image" : "text",
      likes: Array.isArray(post.likes) ? post.likes.length : 0,
      comments: (Array.isArray(post.comments) ? post.comments : []).map(
        (c) => ({
          _id: c._id,
          content: c.content,
          createdAt: c.createdAt,
          likes: Array.isArray(c.likes) ? c.likes.length : 0,
          user: c.userId
            ? {
                _id: c.userId._id,
                name: c.userId.username || c.userId.name,
                username: c.userId.username,
                avatar: c.userId.profileImage,
                verified: c.userId.isVerified || false,
              }
            : undefined,
        })
      ),
      isLiked: !!liked,
      isBookmarked: !!bookmarked,
      createdAt: post.createdAt,
      type: post.type || "post",
      user: {
        _id: post.authorId?._id,
        name: post.authorId?.name || post.authorId?.username,
        username: post.authorId?.username,
        avatar: post.authorId?.profileImage,
        verified: post.authorId?.isVerified || false,
      },
    };

    return res.json({ success: true, data: transformed });
  } catch (error) {
    console.error("Error fetching post:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create post
router.post("/", auth, async (req, res) => {
  try {
    console.log("Create post request body:", JSON.stringify(req.body, null, 2));

    const {
      content,
      type = "post",
      media = [],
      visibility = "public",
      tags = [],
      mentions = [],
      location,
      expiresAt,
    } = req.body;

    // Validate content
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: "Content is required" });
    }

    // Determine post type based on media
    let postType = type;
    if (media.length > 0 && type === "post") {
      const hasVideo = media.some((m) => m.type === "video");
      const hasImage = media.some((m) => m.type === "image");

      if (hasVideo) {
        postType = "video";
      } else if (hasImage) {
        postType = "image";
      }
    }

    const post = new Post({
      authorId: req.user.id,
      content: content.trim(),
      media,
      type: postType,
      visibility,
      tags,
      mentions,
      location,
      isApproved: true, // Auto-approve for now
      // Add expiration for stories
      ...(postType === "story" &&
        expiresAt && { expiresAt: new Date(expiresAt) }),
      expiresAt:
        type === "story"
          ? new Date(Date.now() + 24 * 60 * 60 * 1000)
          : undefined,
    });

    console.log("Saving post:", JSON.stringify(post, null, 2));

    await post.save();

    // Update user stats
    await User.findByIdAndUpdate(req.user.id, {
      $inc: { "stats.postsCount": 1 },
    });

    const populatedPost = await Post.findById(post._id).populate(
      "authorId",
      "username profileImage isVerified name"
    );

    console.log("Post created successfully:", populatedPost._id);
    res.status(201).json(populatedPost);
  } catch (error) {
    console.error("Error creating post:", error);
    res.status(500).json({ error: error.message });
  }
});

// Like/unlike post
router.post("/:id/like", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id).populate(
      "authorId",
      "username name"
    );
    if (!post) return res.status(404).json({ error: "Post not found" });

    const userIdStr = (req.user.id || req.user._id).toString();

    // Support both schemas: likes as [ObjectId] or [{ userId }]
    const likesArray = Array.isArray(post.likes) ? post.likes : [];
    const isObjectShape =
      likesArray[0] &&
      typeof likesArray[0] === "object" &&
      "userId" in likesArray[0];
    const isLiked = isObjectShape
      ? likesArray.some((l) => l.userId?.toString() === userIdStr)
      : likesArray.some((l) => l?.toString() === userIdStr);

    if (isLiked) {
      // Unlike
      post.likes = isObjectShape
        ? likesArray.filter((l) => l.userId?.toString() !== userIdStr)
        : likesArray.filter((l) => l?.toString() !== userIdStr);
    } else {
      // Like
      if (isObjectShape) {
        likesArray.push({ userId: req.user.id, likedAt: new Date() });
      } else {
        likesArray.push(req.user.id);
      }
      post.likes = likesArray;

      // Create notification for the post author (avoid self-like and duplicates)
      const authorIdStr =
        post.authorId?._id?.toString() || post.authorId?.toString();
      if (authorIdStr && authorIdStr !== userIdStr) {
        const recent = await Notification.findOne({
          type: "like",
          sender: req.user.id || req.user._id,
          recipient: authorIdStr,
          "data.postId": post._id,
          createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        });

        if (!recent) {
          await Notification.createNotification({
            type: "like",
            sender: req.user.id || req.user._id,
            recipient: authorIdStr,
            title: "New Like",
            message: `${
              req.user.username || req.user.name || "Someone"
            } liked your post`,
            data: { postId: post._id.toString() },
            category: "social",
            priority: "low",
          });
        }
      }
    }

    await post.save();
    const likesCount = Array.isArray(post.likes)
      ? isObjectShape
        ? post.likes.filter(Boolean).length
        : post.likes.length
      : 0;
    res.json({ liked: !isLiked, likesCount });
  } catch (error) {
    console.error("Error liking post:", error);
    res.status(500).json({ error: error.message });
  }
});

// Add comment
router.post("/:id/comment", auth, async (req, res) => {
  try {
    const { text } = req.body;
    const post = await Post.findById(req.params.id).populate(
      "authorId",
      "username name"
    );

    if (!post) return res.status(404).json({ error: "Post not found" });

    // Normalize to schema: use { userId, content }
    const content = (text || "").toString().trim();
    if (!content) {
      return res.status(400).json({ error: "Comment text is required" });
    }
    post.comments.push({
      userId: req.user.id,
      content,
      createdAt: new Date(),
    });

    await post.save();

    // Notify author if commenter is different
    const authorIdStr =
      post.authorId?._id?.toString() || post.authorId?.toString();
    const userIdStr = (req.user.id || req.user._id).toString();
    if (authorIdStr && authorIdStr !== userIdStr) {
      await Notification.createNotification({
        type: "comment",
        sender: req.user.id || req.user._id,
        recipient: authorIdStr,
        title: "New Comment",
        message: `${
          req.user.username || req.user.name || "Someone"
        } commented: "${(text || "").toString().slice(0, 80)}"`,
        data: { postId: post._id.toString() },
        category: "social",
        priority: "medium",
      });
    }

    // Re-fetch the post to populate the latest comment's user
    const refreshed = await Post.findById(post._id).populate(
      "comments.userId",
      "username name profileImage isVerified"
    );
    const latest = refreshed?.comments?.[refreshed.comments.length - 1];
    const shaped = latest
      ? {
          _id: latest._id,
          content: latest.content,
          createdAt: latest.createdAt,
          likes: Array.isArray(latest.likes) ? latest.likes.length : 0,
          user: latest.userId
            ? {
                _id: latest.userId._id,
                name: latest.userId.username || latest.userId.name,
                username: latest.userId.username,
                avatar: latest.userId.profileImage,
                verified: latest.userId.isVerified || false,
              }
            : undefined,
        }
      : null;
    res.json({ success: true, data: shaped });
  } catch (error) {
    console.error("Error adding comment:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get comments for a post/reel with user info
router.get("/:id([0-9a-fA-F]{24})/comments", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id).populate(
      "comments.userId",
      "username name profileImage isVerified"
    );
    if (!post) return res.status(404).json({ error: "Post not found" });

    const comments = (Array.isArray(post.comments) ? post.comments : []).map(
      (c) => ({
        _id: c._id,
        content: c.content,
        createdAt: c.createdAt,
        likes: Array.isArray(c.likes) ? c.likes.length : 0,
        user: c.userId
          ? {
              _id: c.userId._id,
              name: c.userId.username || c.userId.name,
              username: c.userId.username,
              avatar: c.userId.profileImage,
              verified: c.userId.isVerified || false,
            }
          : undefined,
      })
    );

    res.json({ success: true, data: { comments } });
  } catch (error) {
    console.error("Error fetching comments:", error);
    res.status(500).json({ error: error.message });
  }
});

// Delete post
router.delete("/:id([0-9a-fA-F]{24})", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) return res.status(404).json({ error: "Post not found" });
    if (post.authorId.toString() !== req.user.id) {
      return res.status(403).json({ error: "Not authorized" });
    }

    await Post.findByIdAndDelete(req.params.id);
    await User.findByIdAndUpdate(req.user.id, {
      $inc: { "stats.postsCount": -1 },
    });

    res.json({ message: "Post deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Toggle bookmark (save/unsave) post
router.post("/:id/bookmark", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const post = await Post.findById(req.params.id).populate(
      "authorId",
      "username name"
    );
    if (!post) return res.status(404).json({ error: "Post not found" });

    const postIdStr = post._id.toString();
    const has = (user.savedPosts || []).some(
      (pid) => pid.toString() === postIdStr
    );

    if (has) {
      user.savedPosts.pull(post._id);
    } else {
      user.savedPosts.push(post._id);
    }
    await user.save();

    return res.json({
      success: true,
      message: has ? "Post unsaved" : "Post saved",
      isBookmarked: !has,
      postId: postIdStr,
    });
  } catch (error) {
    console.error("Error bookmarking post:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get current user's saved posts
router.get("/saved", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate({
      path: "savedPosts",
      populate: {
        path: "authorId",
        select: "username profileImage isVerified name",
      },
    });

    const saved = (user.savedPosts || []).map((post) => {
      let mediaType = "text";
      let video = null;
      let videoThumbnail = null;
      let image = null;

      if (Array.isArray(post.media) && post.media.length > 0) {
        const imageMedia = post.media.find((m) => m.type === "image");
        const videoMedia = post.media.find((m) => m.type === "video");
        if (videoMedia) {
          mediaType = "video";
          video = videoMedia.url;
          videoThumbnail = videoMedia.thumbnail || null;
        } else if (imageMedia) {
          mediaType = "image";
          image = imageMedia.url;
        }
      } else if (post.image || post.file) {
        const mediaUrl = post.image || post.file;
        const videoFormats = [".mp4", ".webm", ".avi", ".mov", ".mkv", ".m4v"];
        const isVideo = videoFormats.some((format) =>
          mediaUrl?.toLowerCase().includes(format)
        );
        if (isVideo) {
          mediaType = "video";
          video = mediaUrl;
          videoThumbnail = post.thumbnail || null;
        } else {
          mediaType = "image";
          image = mediaUrl;
        }
      }

      return {
        id: post._id.toString(),
        type: post.type || (video ? "reel" : image ? "post" : "post"),
        content: post.content || "",
        image,
        video,
        videoThumbnail,
        mediaType,
        likes: Array.isArray(post.likes) ? post.likes.length : 0,
        comments: Array.isArray(post.comments) ? post.comments.length : 0,
        shares: Array.isArray(post.shares) ? post.shares.length : 0,
        createdAt: post.createdAt,
        user: {
          _id: post.authorId?._id,
          name: post.authorId?.name || post.authorId?.username,
          username: post.authorId?.username,
          avatar: post.authorId?.profileImage,
          verified: post.authorId?.isVerified || false,
        },
        isBookmarked: true,
        isLiked: false,
      };
    });

    return res.json({ success: true, data: { posts: saved } });
  } catch (error) {
    console.error("Error fetching saved posts:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get posts by user ID
router.get("/user/:userId", auth, async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;

    // Privacy gating: if target user is private and requester is not a follower, block
    try {
      const targetUser = await User.findById(userId).select(
        "privacy.profileVisibility followers"
      );
      if (!targetUser) {
        return res
          .status(404)
          .json({ success: false, error: "User not found" });
      }
      const isPrivate = targetUser.privacy?.profileVisibility === "private";
      const isSelf = (req.user.id || req.user._id).toString() === userId;
      const isFollower = (targetUser.followers || []).some(
        (id) => id.toString() === (req.user.id || req.user._id).toString()
      );
      if (isPrivate && !isSelf && !isFollower) {
        return res.status(403).json({
          success: false,
          error: "This account is private",
          code: "ACCOUNT_PRIVATE",
        });
      }
    } catch (e) {
      // If privacy check fails, default to safe deny
      return res.status(403).json({ success: false, error: "Access denied" });
    }

    // Find posts by the specific user
    const posts = await Post.find({
      authorId: userId,
      type: { $ne: "story" }, // Exclude stories, include all other types
    })
      .populate("authorId", "username profileImage isVerified name")
      .populate("comments.userId", "username name profileImage isVerified")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    console.log(`Found ${posts.length} posts for user ${userId}`);
    if (posts.length > 0) {
      console.log("First post structure:", JSON.stringify(posts[0], null, 2));
    }

    // Transform posts to match frontend expectations
    const currentUserId = (req.user.id || req.user._id).toString();
    const transformedPosts = posts.map((post) => {
      let mediaType = "text";
      let video = null;
      let videoThumbnail = null;
      let image = null;

      // Support new media array
      if (Array.isArray(post.media) && post.media.length > 0) {
        const imageMedia = post.media.find((m) => m.type === "image");
        const videoMedia = post.media.find((m) => m.type === "video");
        if (videoMedia) {
          mediaType = "video";
          video = videoMedia.url;
          videoThumbnail = videoMedia.thumbnail || null;
        } else if (imageMedia) {
          mediaType = "image";
          image = imageMedia.url;
        }
      } else if (post.image || post.file) {
        const mediaUrl = post.image || post.file;
        const videoFormats = [".mp4", ".webm", ".avi", ".mov", ".mkv", ".m4v"];
        const isVideo = videoFormats.some((format) =>
          mediaUrl?.toLowerCase().includes(format)
        );
        if (isVideo) {
          mediaType = "video";
          video = mediaUrl;
          videoThumbnail = post.thumbnail || null;
        } else {
          mediaType = "image";
          image = mediaUrl;
        }
      }

      const liked = Array.isArray(post.likes)
        ? post.likes.some(
            (l) =>
              (typeof l === "object" && l?.userId
                ? l.userId.toString()
                : l?.toString?.()) === currentUserId
          )
        : false;
      const bookmarked = Array.isArray(req.user?.savedPosts)
        ? req.user.savedPosts.some(
            (pid) => pid?.toString() === post._id.toString()
          )
        : false;

      return {
        _id: post._id,
        type: post.type || "post",
        content: post.content || "",
        image,
        video,
        videoThumbnail,
        mediaType,
        likes: post.likes || [],
        comments: (Array.isArray(post.comments) ? post.comments : []).map(
          (c) => ({
            _id: c._id,
            content: c.content,
            createdAt: c.createdAt,
            likes: Array.isArray(c.likes) ? c.likes.length : 0,
            user: c.userId
              ? {
                  _id: c.userId._id,
                  name: c.userId.username || c.userId.name,
                  username: c.userId.username,
                  avatar: c.userId.profileImage,
                  verified: c.userId.isVerified || false,
                }
              : undefined,
          })
        ),
        isLiked: !!liked,
        isBookmarked: !!bookmarked,
        user: {
          _id: post.authorId._id,
          name: post.authorId.name || post.authorId.username,
          username: post.authorId.username,
          avatar: post.authorId.profileImage,
          verified: post.authorId.isVerified || false,
        },
        createdAt: post.createdAt,
        views: post.views || 0,
        shares: post.shares || 0,
        saves: post.saves || 0,
      };
    });

    console.log(`Transformed ${transformedPosts.length} posts`);
    if (transformedPosts.length > 0) {
      console.log(
        "First transformed post:",
        JSON.stringify(transformedPosts[0], null, 2)
      );
    }

    res.json(transformedPosts);
  } catch (error) {
    console.error("Error fetching user posts:", error);
    res.status(500).json({ error: error.message });
  }
});

// Demo endpoint to create sample posts for testing
router.post("/demo", auth, async (req, res) => {
  try {
    const demoPosts = [
      {
        authorId: req.user.id,
        content:
          "Welcome to our social platform! 🎉 This is a demo post to test the feed functionality.",
        type: "post",
        isApproved: true,
        image:
          "https://images.unsplash.com/photo-1501594907352-04cda38ebc29?w=800&h=600&fit=crop",
        mediaType: "image",
      },
      {
        authorId: req.user.id,
        content: "Beautiful sunset from my travels ✨ #photography #sunset",
        type: "post",
        isApproved: true,
        image:
          "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&h=600&fit=crop",
        mediaType: "image",
      },
      {
        authorId: req.user.id,
        content: "Just finished an amazing workout! 💪 #fitness #motivation",
        type: "post",
        isApproved: true,
      },
      {
        authorId: req.user.id,
        content:
          "Coffee and coding - the perfect combination ☕️ #developer #coding",
        type: "post",
        isApproved: true,
        image:
          "https://images.unsplash.com/photo-1461749280684-dccba630e2f6?w=800&h=600&fit=crop",
        mediaType: "image",
      },
    ];

    const createdPosts = await Post.insertMany(demoPosts);
    console.log(`Created ${createdPosts.length} demo posts`);

    res.json({
      message: `Created ${createdPosts.length} demo posts successfully!`,
      posts: createdPosts,
    });
  } catch (error) {
    console.error("Error creating demo posts:", error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
