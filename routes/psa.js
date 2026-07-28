import express from "express";
import { auth, adminAuth } from "../middleware/auth.js";
import PSA from "../models/PSA.js";
import User from "../models/User.js";

const router = express.Router();

// Admin middleware
router.use(auth, adminAuth);

// Get all PSAs
router.get("/", async (req, res) => {
  try {
    const { page = 1, limit = 10, status, type } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    if (status) query.status = status;
    if (type) query.type = type;

    const psas = await PSA.find(query)
      .populate("createdBy", "username email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await PSA.countDocuments(query);

    res.json({
      psas,
      pagination: {
        total,
        page: parseInt(page),
        pages: Math.ceil(total / limit),
        hasMore: skip + psas.length < total,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single PSA
router.get("/:id", async (req, res) => {
  try {
    const psa = await PSA.findById(req.params.id).populate(
      "createdBy",
      "username email"
    );

    if (!psa) {
      return res.status(404).json({ error: "PSA not found" });
    }

    res.json(psa);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new PSA
router.post("/", async (req, res) => {
  try {
    const {
      title,
      content,
      type,
      priority,
      targetAudience,
      scheduledFor,
      expiresAt,
      imageUrl,
      actionButton,
    } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: "Title and content are required" });
    }

    const psa = new PSA({
      title,
      content,
      type: type || "general",
      priority: priority || "medium",
      targetAudience: targetAudience || {},
      scheduledFor: scheduledFor ? new Date(scheduledFor) : new Date(),
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      imageUrl: imageUrl || "",
      actionButton: actionButton || null,
      createdBy: req.user.id,
      status:
        scheduledFor && new Date(scheduledFor) > new Date()
          ? "scheduled"
          : "active",
    });

    await psa.save();
    await psa.populate("createdBy", "username email");

    // If scheduled for immediate delivery, trigger push
    if (psa.status === "active") {
      // Trigger push notification logic here
      await triggerPSAPush(psa);
    }

    res.status(201).json({
      message: "PSA created successfully",
      psa,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update PSA
router.put("/:id", async (req, res) => {
  try {
    const updates = req.body;

    // Don't allow updating certain fields
    delete updates._id;
    delete updates.createdBy;
    delete updates.createdAt;
    delete updates.metrics;

    const psa = await PSA.findByIdAndUpdate(
      req.params.id,
      { ...updates, updatedAt: new Date() },
      { new: true, runValidators: true }
    ).populate("createdBy", "username email");

    if (!psa) {
      return res.status(404).json({ error: "PSA not found" });
    }

    res.json({
      message: "PSA updated successfully",
      psa,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete PSA
router.delete("/:id", async (req, res) => {
  try {
    const psa = await PSA.findByIdAndDelete(req.params.id);

    if (!psa) {
      return res.status(404).json({ error: "PSA not found" });
    }

    res.json({ message: "PSA deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Activate PSA
router.post("/:id/activate", async (req, res) => {
  try {
    const psa = await PSA.findByIdAndUpdate(
      req.params.id,
      {
        status: "active",
        scheduledFor: new Date(),
        updatedAt: new Date(),
      },
      { new: true }
    );

    if (!psa) {
      return res.status(404).json({ error: "PSA not found" });
    }

    // Trigger push notification
    await triggerPSAPush(psa);

    res.json({
      message: "PSA activated successfully",
      psa,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Deactivate PSA
router.post("/:id/deactivate", async (req, res) => {
  try {
    const psa = await PSA.findByIdAndUpdate(
      req.params.id,
      {
        status: "inactive",
        updatedAt: new Date(),
      },
      { new: true }
    );

    if (!psa) {
      return res.status(404).json({ error: "PSA not found" });
    }

    res.json({
      message: "PSA deactivated successfully",
      psa,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get PSA metrics
router.get("/:id/metrics", async (req, res) => {
  try {
    const psa = await PSA.findById(req.params.id);

    if (!psa) {
      return res.status(404).json({ error: "PSA not found" });
    }

    res.json({
      id: psa._id,
      title: psa.title,
      metrics: psa.metrics,
      status: psa.status,
      createdAt: psa.createdAt,
      scheduledFor: psa.scheduledFor,
      expiresAt: psa.expiresAt,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Record PSA interaction (view, click)
router.post("/:id/interact", auth, async (req, res) => {
  try {
    const { action } = req.body; // 'view', 'click', 'dismiss'

    if (!["view", "click", "dismiss"].includes(action)) {
      return res.status(400).json({ error: "Invalid action" });
    }

    const psa = await PSA.findById(req.params.id);
    if (!psa) {
      return res.status(404).json({ error: "PSA not found" });
    }

    // Update metrics
    const updateField = `metrics.${action}s`;
    await PSA.findByIdAndUpdate(req.params.id, {
      $inc: { [updateField]: 1 },
      $addToSet: { [`metrics.${action}Users`]: req.user.id },
    });

    res.json({ message: `PSA ${action} recorded` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get active PSAs for users (public endpoint)
router.get("/public/active", auth, async (req, res) => {
  try {
    const now = new Date();

    const psas = await PSA.find({
      status: "active",
      scheduledFor: { $lte: now },
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    })
      .select("title content type priority imageUrl actionButton createdAt")
      .sort({ priority: -1, createdAt: -1 })
      .limit(5); // Limit to 5 active PSAs

    res.json(psas);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Preview PSA (before publishing)
router.post("/preview", async (req, res) => {
  try {
    const psaData = req.body;

    // Create a temporary PSA object for preview
    const previewPSA = {
      ...psaData,
      id: "preview",
      createdBy: req.user.id,
      createdAt: new Date(),
      status: "preview",
    };

    res.json({
      message: "PSA preview generated",
      preview: previewPSA,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk operations
router.post("/bulk", async (req, res) => {
  try {
    const { action, psaIds } = req.body;

    if (!action || !psaIds || !Array.isArray(psaIds)) {
      return res.status(400).json({ error: "Action and PSA IDs are required" });
    }

    let updateData = {};
    let message = "";

    switch (action) {
      case "activate":
        updateData = { status: "active", scheduledFor: new Date() };
        message = "PSAs activated successfully";
        break;
      case "deactivate":
        updateData = { status: "inactive" };
        message = "PSAs deactivated successfully";
        break;
      case "delete":
        await PSA.deleteMany({ _id: { $in: psaIds } });
        return res.json({ message: "PSAs deleted successfully" });
      default:
        return res.status(400).json({ error: "Invalid action" });
    }

    const result = await PSA.updateMany(
      { _id: { $in: psaIds } },
      { ...updateData, updatedAt: new Date() }
    );

    res.json({
      message,
      updated: result.modifiedCount,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper function to trigger PSA push notifications
async function triggerPSAPush(psa) {
  try {
    // Get target users based on audience criteria
    let targetUsers = [];

    if (psa.targetAudience.all) {
      targetUsers = await User.find({ isActive: true }).select("_id");
    } else {
      let query = { isActive: true };

      if (psa.targetAudience.ageRange) {
        const { min, max } = psa.targetAudience.ageRange;
        const minDate = new Date(Date.now() - max * 365 * 24 * 60 * 60 * 1000);
        const maxDate = new Date(Date.now() - min * 365 * 24 * 60 * 60 * 1000);
        query.dateOfBirth = { $gte: minDate, $lte: maxDate };
      }

      if (psa.targetAudience.location) {
        query.location = { $regex: psa.targetAudience.location, $options: "i" };
      }

      if (psa.targetAudience.interests) {
        query.interests = { $in: psa.targetAudience.interests };
      }

      targetUsers = await User.find(query).select("_id");
    }

    // Update PSA metrics
    await PSA.findByIdAndUpdate(psa._id, {
      "metrics.sent": targetUsers.length,
      "metrics.sentAt": new Date(),
    });

    // Here you would integrate with your push notification service
    // Example: FCM, OneSignal, etc.
    console.log(`PSA "${psa.title}" sent to ${targetUsers.length} users`);
  } catch (error) {
    console.error("Error sending PSA push:", error);
  }
}

export default router;
