import express from "express";
import { auth, adminAuth } from "../middleware/auth.js";
import StaticContent from "../models/StaticContent.js";

const router = express.Router();

// Admin middleware for write operations
const adminRequired = [auth, adminAuth];

// Get static content (public endpoint)
router.get("/:page", async (req, res) => {
  try {
    const { page } = req.params;

    const content = await StaticContent.findOne({
      page: page.toLowerCase(),
      isPublished: true,
    });

    if (!content) {
      return res.status(404).json({ error: "Page not found" });
    }

    res.json({
      page: content.page,
      title: content.title,
      content: content.content,
      seo: content.seo,
      lastModified: content.updatedAt,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all static pages (admin)
router.get("/admin/pages", ...adminRequired, async (req, res) => {
  try {
    const { status } = req.query;

    let query = {};
    if (status) {
      query.isPublished = status === "published";
    }

    const pages = await StaticContent.find(query)
      .select("page title isPublished createdAt updatedAt")
      .sort({ updatedAt: -1 });

    res.json(pages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get specific page for editing (admin)
router.get("/admin/edit/:page", ...adminRequired, async (req, res) => {
  try {
    const { page } = req.params;

    const content = await StaticContent.findOne({
      page: page.toLowerCase(),
    });

    if (!content) {
      return res.status(404).json({ error: "Page not found" });
    }

    res.json(content);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new static page (admin)
router.post("/admin/create", ...adminRequired, async (req, res) => {
  try {
    const { page, title, content, seo, isPublished = false } = req.body;

    if (!page || !title || !content) {
      return res.status(400).json({
        error: "Page name, title, and content are required",
      });
    }

    // Check if page already exists
    const existingPage = await StaticContent.findOne({
      page: page.toLowerCase(),
    });

    if (existingPage) {
      return res.status(400).json({
        error: "Page already exists",
      });
    }

    const newPage = new StaticContent({
      page: page.toLowerCase(),
      title,
      content,
      seo: seo || {},
      isPublished,
      createdBy: req.user.id,
      updatedBy: req.user.id,
    });

    await newPage.save();

    res.status(201).json({
      message: "Static page created successfully",
      page: newPage,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update static page (admin)
router.put("/admin/edit/:page", ...adminRequired, async (req, res) => {
  try {
    const { page } = req.params;
    const updates = req.body;

    // Remove fields that shouldn't be updated
    delete updates._id;
    delete updates.page;
    delete updates.createdAt;
    delete updates.createdBy;

    const updatedPage = await StaticContent.findOneAndUpdate(
      { page: page.toLowerCase() },
      {
        ...updates,
        updatedBy: req.user.id,
        updatedAt: new Date(),
      },
      { new: true, runValidators: true }
    );

    if (!updatedPage) {
      return res.status(404).json({ error: "Page not found" });
    }

    res.json({
      message: "Page updated successfully",
      page: updatedPage,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete static page (admin)
router.delete("/admin/delete/:page", ...adminRequired, async (req, res) => {
  try {
    const { page } = req.params;

    const deletedPage = await StaticContent.findOneAndDelete({
      page: page.toLowerCase(),
    });

    if (!deletedPage) {
      return res.status(404).json({ error: "Page not found" });
    }

    res.json({
      message: "Page deleted successfully",
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Publish/Unpublish page (admin)
router.patch("/admin/:page/publish", ...adminRequired, async (req, res) => {
  try {
    const { page } = req.params;
    const { isPublished } = req.body;

    const updatedPage = await StaticContent.findOneAndUpdate(
      { page: page.toLowerCase() },
      {
        isPublished: Boolean(isPublished),
        updatedBy: req.user.id,
        updatedAt: new Date(),
      },
      { new: true }
    );

    if (!updatedPage) {
      return res.status(404).json({ error: "Page not found" });
    }

    res.json({
      message: `Page ${isPublished ? "published" : "unpublished"} successfully`,
      page: updatedPage,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update SEO settings (admin)
router.patch("/admin/:page/seo", ...adminRequired, async (req, res) => {
  try {
    const { page } = req.params;
    const { seo } = req.body;

    if (!seo || typeof seo !== "object") {
      return res.status(400).json({ error: "Valid SEO data is required" });
    }

    const updatedPage = await StaticContent.findOneAndUpdate(
      { page: page.toLowerCase() },
      {
        seo,
        updatedBy: req.user.id,
        updatedAt: new Date(),
      },
      { new: true }
    );

    if (!updatedPage) {
      return res.status(404).json({ error: "Page not found" });
    }

    res.json({
      message: "SEO settings updated successfully",
      seo: updatedPage.seo,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get page analytics (admin)
router.get("/admin/:page/analytics", ...adminRequired, async (req, res) => {
  try {
    const { page } = req.params;
    const { period = "30d" } = req.query;

    const pageContent = await StaticContent.findOne({
      page: page.toLowerCase(),
    });

    if (!pageContent) {
      return res.status(404).json({ error: "Page not found" });
    }

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(period.replace("d", "")));

    // Filter analytics by date range
    const analytics = pageContent.analytics.filter(
      (entry) => entry.date >= startDate && entry.date <= endDate
    );

    // Calculate totals
    const totals = analytics.reduce(
      (acc, entry) => ({
        views: acc.views + entry.views,
        uniqueViews: acc.uniqueViews + entry.uniqueViews,
        bounceRate: acc.bounceRate + entry.bounceRate,
        avgTimeOnPage: acc.avgTimeOnPage + entry.avgTimeOnPage,
      }),
      { views: 0, uniqueViews: 0, bounceRate: 0, avgTimeOnPage: 0 }
    );

    // Calculate averages
    if (analytics.length > 0) {
      totals.bounceRate = totals.bounceRate / analytics.length;
      totals.avgTimeOnPage = totals.avgTimeOnPage / analytics.length;
    }

    res.json({
      page: pageContent.page,
      title: pageContent.title,
      period,
      analytics,
      totals,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Record page view (public endpoint)
router.post("/:page/view", async (req, res) => {
  try {
    const { page } = req.params;
    const { userAgent, referrer } = req.body;

    const pageContent = await StaticContent.findOne({
      page: page.toLowerCase(),
      isPublished: true,
    });

    if (!pageContent) {
      return res.status(404).json({ error: "Page not found" });
    }

    // Get today's date
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find or create today's analytics entry
    let todayAnalytics = pageContent.analytics.find(
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
      };
      pageContent.analytics.push(todayAnalytics);
    }

    // Update view count
    todayAnalytics.views += 1;

    // Update referrer data
    if (referrer) {
      const existingReferrer = todayAnalytics.referrers.find(
        (r) => r.source === referrer
      );
      if (existingReferrer) {
        existingReferrer.count += 1;
      } else {
        todayAnalytics.referrers.push({ source: referrer, count: 1 });
      }
    }

    // Update device data (simplified)
    const deviceType =
      userAgent && userAgent.includes("Mobile") ? "mobile" : "desktop";
    const existingDevice = todayAnalytics.devices.find(
      (d) => d.type === deviceType
    );
    if (existingDevice) {
      existingDevice.count += 1;
    } else {
      todayAnalytics.devices.push({ type: deviceType, count: 1 });
    }

    await pageContent.save();

    res.json({ message: "Page view recorded" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk operations (admin)
router.post("/admin/bulk", ...adminRequired, async (req, res) => {
  try {
    const { action, pages } = req.body;

    if (!action || !pages || !Array.isArray(pages)) {
      return res.status(400).json({
        error: "Action and pages array are required",
      });
    }

    let updateData = {};
    let message = "";

    switch (action) {
      case "publish":
        updateData = { isPublished: true };
        message = "Pages published successfully";
        break;
      case "unpublish":
        updateData = { isPublished: false };
        message = "Pages unpublished successfully";
        break;
      case "delete":
        await StaticContent.deleteMany({ page: { $in: pages } });
        return res.json({ message: "Pages deleted successfully" });
      default:
        return res.status(400).json({ error: "Invalid action" });
    }

    const result = await StaticContent.updateMany(
      { page: { $in: pages } },
      {
        ...updateData,
        updatedBy: req.user.id,
        updatedAt: new Date(),
      }
    );

    res.json({
      message,
      updated: result.modifiedCount,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get site navigation structure (public)
router.get("/nav/structure", async (req, res) => {
  try {
    const pages = await StaticContent.find(
      {
        isPublished: true,
        showInNav: true,
      },
      "page title navOrder"
    ).sort({ navOrder: 1, title: 1 });

    const navigation = pages.map((page) => ({
      page: page.page,
      title: page.title,
      url: `/pages/${page.page}`,
    }));

    res.json(navigation);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
