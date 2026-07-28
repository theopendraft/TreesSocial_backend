import express from "express";
import { auth, adminAuth } from "../middleware/auth.js";
import User from "../models/User.js";
import Post from "../models/Post.js";
import Reel from "../models/Reel.js";
import Stream from "../models/Stream.js";
import Match from "../models/Match.js";
import Message from "../models/Message.js";
import Report from "../models/Reports.js";
import Subscription from "../models/Subscription.js";

const router = express.Router();

// Admin middleware
router.use(auth, adminAuth);

// Dashboard overview stats
router.get("/dashboard", async (req, res) => {
  try {
    const { period = "7d" } = req.query;

    // Calculate date range based on period
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
      case "90d":
        startDate.setDate(startDate.getDate() - 90);
        break;
      default:
        startDate.setDate(startDate.getDate() - 7);
    }

    // Get basic counts
    const [
      totalUsers,
      activeUsers,
      totalPosts,
      totalReels,
      totalStreams,
      pendingReports,
      totalSubscriptions,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({
        lastActive: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      }),
      Post.countDocuments(),
      Reel.countDocuments(),
      Stream.countDocuments(),
      Report.countDocuments({ status: "pending" }),
      Subscription.countDocuments({ status: "active" }),
    ]);

    // Growth metrics
    const userGrowth = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: period === "24h" ? "%Y-%m-%d %H:00" : "%Y-%m-%d",
              date: "$createdAt",
            },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const contentGrowth = await Post.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: period === "24h" ? "%Y-%m-%d %H:00" : "%Y-%m-%d",
              date: "$createdAt",
            },
          },
          posts: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      overview: {
        totalUsers,
        activeUsers,
        totalPosts,
        totalReels,
        totalStreams,
        pendingReports,
        totalSubscriptions,
      },
      growth: {
        users: userGrowth,
        content: contentGrowth,
      },
      period,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// User analytics
router.get("/users", async (req, res) => {
  try {
    const { period = "30d", metric = "registrations" } = req.query;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period.replace("d", "")));

    let pipeline = [];

    switch (metric) {
      case "registrations":
        pipeline = [
          { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
          {
            $group: {
              _id: {
                $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
              },
              count: { $sum: 1 },
            },
          },
        ];
        break;

      case "activity":
        pipeline = [
          { $match: { lastActive: { $gte: startDate, $lte: endDate } } },
          {
            $group: {
              _id: {
                $dateToString: { format: "%Y-%m-%d", date: "$lastActive" },
              },
              count: { $sum: 1 },
            },
          },
        ];
        break;

      case "demographics":
        pipeline = [
          {
            $group: {
              _id: "$gender",
              count: { $sum: 1 },
            },
          },
        ];
        break;
    }

    pipeline.push({ $sort: { _id: 1 } });

    const data = await User.aggregate(pipeline);

    // Additional user stats
    const userStats = await User.aggregate([
      {
        $group: {
          _id: null,
          avgAge: {
            $avg: {
              $divide: [
                { $subtract: [new Date(), "$dateOfBirth"] },
                365 * 24 * 60 * 60 * 1000,
              ],
            },
          },
          verifiedUsers: {
            $sum: { $cond: ["$isVerified", 1, 0] },
          },
          premiumUsers: {
            $sum: { $cond: ["$isPremium", 1, 0] },
          },
        },
      },
    ]);

    res.json({
      data,
      stats: userStats[0] || {},
      metric,
      period,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Content analytics
router.get("/content", async (req, res) => {
  try {
    const { period = "30d", type = "all" } = req.query;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period.replace("d", "")));

    let results = {};

    if (type === "all" || type === "posts") {
      const postStats = await Post.aggregate([
        { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            posts: { $sum: 1 },
            totalLikes: { $sum: { $size: "$likes" } },
            totalComments: { $sum: { $size: "$comments" } },
          },
        },
        { $sort: { _id: 1 } },
      ]);
      results.posts = postStats;
    }

    if (type === "all" || type === "reels") {
      const reelStats = await Reel.aggregate([
        { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            reels: { $sum: 1 },
            totalViews: { $sum: "$views" },
            totalLikes: { $sum: { $size: "$likes" } },
          },
        },
        { $sort: { _id: 1 } },
      ]);
      results.reels = reelStats;
    }

    if (type === "all" || type === "streams") {
      const streamStats = await Stream.aggregate([
        { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            streams: { $sum: 1 },
            totalViewers: { $sum: "$currentViewers" },
            totalDuration: { $sum: "$duration" },
          },
        },
        { $sort: { _id: 1 } },
      ]);
      results.streams = streamStats;
    }

    res.json({
      ...results,
      period,
      type,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Engagement analytics
router.get("/engagement", async (req, res) => {
  try {
    const { period = "30d" } = req.query;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period.replace("d", "")));

    // Engagement metrics across different content types
    const engagementData = await Promise.all([
      // Post engagement
      Post.aggregate([
        { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            totalPosts: { $sum: 1 },
            totalLikes: { $sum: { $size: "$likes" } },
            totalComments: { $sum: { $size: "$comments" } },
            totalShares: { $sum: { $size: "$shares" } },
          },
        },
        {
          $addFields: {
            avgEngagement: {
              $divide: [
                { $add: ["$totalLikes", "$totalComments", "$totalShares"] },
                "$totalPosts",
              ],
            },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Message activity
      Message.aggregate([
        { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            totalMessages: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Match activity
      Match.aggregate([
        { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            totalMatches: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    res.json({
      posts: engagementData[0],
      messages: engagementData[1],
      matches: engagementData[2],
      period,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Revenue analytics
router.get("/revenue", async (req, res) => {
  try {
    const { period = "30d" } = req.query;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period.replace("d", "")));

    const revenueData = await Subscription.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: "active",
        },
      },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            tier: "$tier",
          },
          count: { $sum: 1 },
          revenue: { $sum: "$amount" },
        },
      },
      {
        $group: {
          _id: "$_id.date",
          totalRevenue: { $sum: "$revenue" },
          totalSubscriptions: { $sum: "$count" },
          byTier: {
            $push: {
              tier: "$_id.tier",
              count: "$count",
              revenue: "$revenue",
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Calculate totals
    const totals = await Subscription.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
          status: "active",
        },
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amount" },
          totalSubscriptions: { $sum: 1 },
          avgRevenuePerUser: { $avg: "$amount" },
        },
      },
    ]);

    res.json({
      daily: revenueData,
      totals: totals[0] || {},
      period,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Top content analytics
router.get("/top-content", async (req, res) => {
  try {
    const { period = "30d", type = "posts", limit = 10 } = req.query;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period.replace("d", "")));

    let pipeline = [];
    let Model;

    switch (type) {
      case "posts":
        Model = Post;
        pipeline = [
          { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
          {
            $addFields: {
              engagementScore: {
                $add: [
                  { $size: "$likes" },
                  { $multiply: [{ $size: "$comments" }, 2] },
                  { $multiply: [{ $size: "$shares" }, 3] },
                ],
              },
            },
          },
          { $sort: { engagementScore: -1 } },
          { $limit: parseInt(limit) },
          {
            $lookup: {
              from: "users",
              localField: "author",
              foreignField: "_id",
              as: "author",
            },
          },
          { $unwind: "$author" },
          {
            $project: {
              content: 1,
              engagementScore: 1,
              likes: { $size: "$likes" },
              comments: { $size: "$comments" },
              shares: { $size: "$shares" },
              createdAt: 1,
              "author.username": 1,
              "author.profilePicture": 1,
            },
          },
        ];
        break;

      case "reels":
        Model = Reel;
        pipeline = [
          { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
          {
            $addFields: {
              engagementScore: {
                $add: [
                  "$views",
                  { $multiply: [{ $size: "$likes" }, 2] },
                  { $multiply: [{ $size: "$comments" }, 3] },
                ],
              },
            },
          },
          { $sort: { engagementScore: -1 } },
          { $limit: parseInt(limit) },
          {
            $lookup: {
              from: "users",
              localField: "author",
              foreignField: "_id",
              as: "author",
            },
          },
          { $unwind: "$author" },
          {
            $project: {
              caption: 1,
              views: 1,
              engagementScore: 1,
              likes: { $size: "$likes" },
              comments: { $size: "$comments" },
              createdAt: 1,
              "author.username": 1,
              "author.profilePicture": 1,
            },
          },
        ];
        break;

      case "streams":
        Model = Stream;
        pipeline = [
          { $match: { createdAt: { $gte: startDate, $lte: endDate } } },
          { $sort: { peakViewers: -1 } },
          { $limit: parseInt(limit) },
          {
            $lookup: {
              from: "users",
              localField: "streamer",
              foreignField: "_id",
              as: "streamer",
            },
          },
          { $unwind: "$streamer" },
          {
            $project: {
              title: 1,
              peakViewers: 1,
              currentViewers: 1,
              duration: 1,
              createdAt: 1,
              "streamer.username": 1,
              "streamer.profilePicture": 1,
            },
          },
        ];
        break;
    }

    const data = await Model.aggregate(pipeline);

    res.json({
      type,
      data,
      period,
      limit: parseInt(limit),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Export data to CSV
router.get("/export/:type", async (req, res) => {
  try {
    const { type } = req.params;
    const { period = "30d", format = "csv" } = req.query;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period.replace("d", "")));

    let data = [];
    let filename = "";

    switch (type) {
      case "users":
        data = await User.find({
          createdAt: { $gte: startDate, $lte: endDate },
        }).select("username email createdAt lastActive isVerified isPremium");
        filename = `users_${period}.csv`;
        break;

      case "posts":
        data = await Post.find({
          createdAt: { $gte: startDate, $lte: endDate },
        })
          .populate("author", "username")
          .select("content author createdAt likes comments shares");
        filename = `posts_${period}.csv`;
        break;

      case "revenue":
        data = await Subscription.find({
          createdAt: { $gte: startDate, $lte: endDate },
          status: "active",
        })
          .populate("user", "username")
          .populate("streamer", "username");
        filename = `revenue_${period}.csv`;
        break;

      default:
        return res.status(400).json({ error: "Invalid export type" });
    }

    if (format === "csv") {
      const csv = convertToCSV(data);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
      res.send(csv);
    } else {
      res.json(data);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Real-time analytics
router.get("/realtime", async (req, res) => {
  try {
    const last5Minutes = new Date(Date.now() - 5 * 60 * 1000);
    const last1Hour = new Date(Date.now() - 60 * 60 * 1000);

    const realtimeData = await Promise.all([
      // Active users in last 5 minutes
      User.countDocuments({ lastActive: { $gte: last5Minutes } }),

      // New content in last hour
      Post.countDocuments({ createdAt: { $gte: last1Hour } }),
      Reel.countDocuments({ createdAt: { $gte: last1Hour } }),

      // Active streams
      Stream.countDocuments({ isActive: true }),

      // Recent activity
      Message.countDocuments({ createdAt: { $gte: last5Minutes } }),
      Match.countDocuments({ createdAt: { $gte: last1Hour } }),
    ]);

    res.json({
      activeUsers: realtimeData[0],
      newPosts: realtimeData[1],
      newReels: realtimeData[2],
      activeStreams: realtimeData[3],
      recentMessages: realtimeData[4],
      newMatches: realtimeData[5],
      timestamp: new Date(),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function to convert data to CSV
function convertToCSV(data) {
  if (!data || data.length === 0) return "";

  const headers = Object.keys(data[0].toObject ? data[0].toObject() : data[0]);
  const csvContent = [
    headers.join(","),
    ...data.map((row) => {
      const obj = row.toObject ? row.toObject() : row;
      return headers
        .map((header) => {
          const value = obj[header];
          if (typeof value === "object" && value !== null) {
            return JSON.stringify(value).replace(/"/g, '""');
          }
          return `"${String(value || "").replace(/"/g, '""')}"`;
        })
        .join(",");
    }),
  ].join("\n");

  return csvContent;
}

export default router;
