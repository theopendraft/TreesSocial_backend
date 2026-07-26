import express from "express";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import { protect as authenticate, authorize } from "../middleware/auth.js";

const router = express.Router();

// Get all users (admin only)
router.get("/", authenticate, authorize("admin"), async (req, res) => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get current user profile
router.get("/me", authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search users
router.get("/search", authenticate, async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;

    if (!q || q.trim().length === 0) {
      return res.json([]);
    }

    const searchQuery = q.trim();
    const filter = {
      $or: [
        { username: { $regex: searchQuery, $options: "i" } },
        { name: { $regex: searchQuery, $options: "i" } },
        { bio: { $regex: searchQuery, $options: "i" } },
      ],
    };

    const users = await User.find(filter)
      .select("-password -email")
      .limit(parseInt(limit))
      .sort({ followers: -1 }); // Sort by follower count

    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ... keep '/me/*' and other specific routes above ...

// Update profile
router.put("/profile", authenticate, async (req, res) => {
  try {
    const {
      username,
      bio,
      profileImage,
      avatar,
      fullName,
      email,
      phone,
      location,
      website,
      name, // fallback
    } = req.body;

    const updateData = {};
    if (typeof username === "string" && username.length)
      updateData.username = username;
    if (typeof bio === "string") updateData.bio = bio;
    if (typeof profileImage === "string")
      updateData.profileImage = profileImage;
    if (typeof avatar === "string") updateData.avatar = avatar;
    if (typeof fullName === "string" && fullName.length)
      updateData.name = fullName;
    if (typeof name === "string" && name.length) updateData.name = name;
    if (typeof email === "string" && email.length)
      updateData.email = email.toLowerCase();
    if (typeof phone === "string" && phone.length) updateData.phone = phone;
    if (typeof location === "string") updateData.location = location;
    if (typeof website === "string") updateData.website = website;

    // Uniqueness checks
    if (updateData.username) {
      const exists = await User.findOne({
        username: String(updateData.username).toLowerCase(),
        _id: { $ne: req.user._id },
      });
      if (exists)
        return res
          .status(400)
          .json({ success: false, error: "Username is already taken" });
    }
    if (updateData.email) {
      const exists = await User.findOne({
        email: String(updateData.email).toLowerCase(),
        _id: { $ne: req.user._id },
      });
      if (exists)
        return res
          .status(400)
          .json({ success: false, error: "Email is already registered" });
    }
    if (updateData.phone) {
      const exists = await User.findOne({
        phone: String(updateData.phone),
        _id: { $ne: req.user._id },
      });
      if (exists)
        return res
          .status(400)
          .json({ success: false, error: "Phone number is already in use" });
    }

    const updated = await User.findByIdAndUpdate(req.user._id, updateData, {
      new: true,
      runValidators: true,
    }).select("-password");

    if (!updated) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    return res.json({ success: true, data: updated });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Follow/Unfollow user
router.post("/:id/follow", authenticate, async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.id);

    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }

    // Handle demo user case
    if (req.user._id === "demo_user_id") {
      // For demo user, we need to maintain a following list in memory/session
      // Check current follow status more reliably
      const isCurrentlyFollowing =
        targetUser.followers && targetUser.followers.includes(req.user._id);

      if (isCurrentlyFollowing) {
        // Unfollow
        targetUser.followers.pull(req.user._id);
        // Remove from demo user's following list
        const followingIndex = req.user.following.indexOf(req.params.id);
        if (followingIndex > -1) {
          req.user.following.splice(followingIndex, 1);
        }
      } else {
        // Follow
        if (!targetUser.followers) {
          targetUser.followers = [];
        }
        targetUser.followers.push(req.user._id);
        // Add to demo user's following list
        if (!req.user.following.includes(req.params.id)) {
          req.user.following.push(req.params.id);
        }
      }

      await targetUser.save();

      console.log(`Demo user following count: ${req.user.following.length}`);
      console.log(
        `Demo user following list: ${JSON.stringify(req.user.following)}`
      );
      console.log(`Target user follower count: ${targetUser.followers.length}`);

      return res.json({
        success: true,
        data: {
          following: !isCurrentlyFollowing,
          followerCount: targetUser.followers.length,
          currentUserFollowingCount: req.user.following.length,
        },
        message: !isCurrentlyFollowing
          ? "User followed successfully"
          : "User unfollowed successfully",
      });
    }

    // Handle real users
    const currentUser = await User.findById(req.user._id);

    if (!currentUser) {
      return res.status(404).json({ error: "Current user not found" });
    }

    console.log(`Current user: ${currentUser.username} (${currentUser._id})`);
    console.log(`Target user: ${targetUser.username} (${targetUser._id})`);
    console.log(
      `Current following BEFORE: ${JSON.stringify(currentUser.following)}`
    );
    console.log(
      `Target followers BEFORE: ${JSON.stringify(targetUser.followers)}`
    );

    // Convert to strings for proper comparison
    const targetIdString = req.params.id.toString();
    const currentUserIdString = req.user._id.toString();

    const isFollowing = currentUser.following.some(
      (id) => id.toString() === targetIdString
    );
    console.log(`Is currently following: ${isFollowing}`);

    // If already following, toggle to unfollow
    if (isFollowing) {
      console.log("UNFOLLOWING USER");
      currentUser.following.pull(req.params.id);
      targetUser.followers.pull(req.user._id);
      // Also clear any stale follow requests
      currentUser.sentFollowRequests = (
        currentUser.sentFollowRequests || []
      ).filter((u) => u.toString() !== targetIdString);
      targetUser.followRequests = (targetUser.followRequests || []).filter(
        (u) => u.toString() !== currentUserIdString
      );
    } else {
      // If target is private, create a follow request instead of direct follow
      if (targetUser.privacy?.profileVisibility === "private") {
        console.log("TARGET IS PRIVATE - CREATING FOLLOW REQUEST");
        // Avoid duplicates
        const alreadyRequested = (targetUser.followRequests || []).some(
          (id) => id.toString() === currentUserIdString
        );
        if (!alreadyRequested) {
          targetUser.followRequests = targetUser.followRequests || [];
          targetUser.followRequests.push(req.user._id);
        }
        const alreadySent = (currentUser.sentFollowRequests || []).some(
          (id) => id.toString() === targetIdString
        );
        if (!alreadySent) {
          currentUser.sentFollowRequests = currentUser.sentFollowRequests || [];
          currentUser.sentFollowRequests.push(req.params.id);
        }
      } else {
        console.log("FOLLOWING USER");
        currentUser.following.push(req.params.id);
        targetUser.followers.push(req.user._id);
      }
    }

    console.log(
      `Current following AFTER push/pull: ${JSON.stringify(
        currentUser.following
      )}`
    );
    console.log(
      `Target followers AFTER push/pull: ${JSON.stringify(
        targetUser.followers
      )}`
    );

    // Save both users
    const saveResults = await Promise.all([
      currentUser.save(),
      targetUser.save(),
    ]);
    console.log("SAVE COMPLETED");

    // Refresh data from database to verify the save worked
    const refreshedCurrentUser = await User.findById(req.user._id);
    const refreshedTargetUser = await User.findById(req.params.id);

    console.log(
      `REFRESHED Current following: ${JSON.stringify(
        refreshedCurrentUser.following
      )}`
    );
    console.log(
      `REFRESHED Target followers: ${JSON.stringify(
        refreshedTargetUser.followers
      )}`
    );

    console.log(
      `After update - Current following count: ${refreshedCurrentUser.following.length}`
    );
    console.log(
      `After update - Target follower count: ${refreshedTargetUser.followers.length}`
    );

    // Fire-and-forget: create notifications for follow or follow-request events
    try {
      if (!isFollowing) {
        if (targetUser.privacy?.profileVisibility === "private") {
          // Follow request notification to target user
          await Notification.create({
            recipient: targetUser._id,
            sender: req.user._id,
            type: "follow_request",
            title: "New follow request",
            message: `${
              currentUser.username || currentUser.name || "Someone"
            } requested to follow you`,
            category: "social",
          });
        } else {
          // Direct follow notification to target user
          await Notification.create({
            recipient: targetUser._id,
            sender: req.user._id,
            type: "follow",
            title: "New follower",
            message: `${
              currentUser.username || currentUser.name || "Someone"
            } started following you`,
            category: "social",
          });
        }
      }
    } catch (notifyErr) {
      console.warn("Notification create failed:", notifyErr?.message);
    }

    res.json({
      success: true,
      data: {
        following:
          targetUser.privacy?.profileVisibility === "private"
            ? false
            : !isFollowing,
        requested:
          targetUser.privacy?.profileVisibility === "private" && !isFollowing
            ? true
            : false,
        followerCount: refreshedTargetUser.followers.length,
        currentUserFollowingCount: refreshedCurrentUser.following.length,
      },
      message: isFollowing
        ? "User unfollowed successfully"
        : targetUser.privacy?.profileVisibility === "private"
        ? "Follow request sent"
        : "User followed successfully",
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Send a follow request explicitly (for clients that want explicit endpoint)
router.post("/:id/request-follow", authenticate, async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.id);
    const currentUser = await User.findById(req.user._id);
    if (!targetUser || !currentUser)
      return res.status(404).json({ error: "User not found" });

    if (targetUser.privacy?.profileVisibility !== "private") {
      return res.status(400).json({ error: "Account is not private" });
    }

    const targetIdString = req.params.id.toString();
    const currentUserIdString = req.user._id.toString();

    const alreadyFollowing = currentUser.following?.some(
      (id) => id.toString() === targetIdString
    );
    if (alreadyFollowing) {
      return res.json({ success: true, message: "Already following" });
    }

    // Avoid duplicates
    if (
      !targetUser.followRequests?.some(
        (id) => id.toString() === currentUserIdString
      )
    ) {
      targetUser.followRequests = targetUser.followRequests || [];
      targetUser.followRequests.push(req.user._id);
    }
    if (
      !currentUser.sentFollowRequests?.some(
        (id) => id.toString() === targetIdString
      )
    ) {
      currentUser.sentFollowRequests = currentUser.sentFollowRequests || [];
      currentUser.sentFollowRequests.push(req.params.id);
    }

    await Promise.all([currentUser.save(), targetUser.save()]);

    return res.json({ success: true, message: "Follow request sent" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Cancel a sent follow request
router.post("/:id/cancel-request", authenticate, async (req, res) => {
  try {
    const targetUser = await User.findById(req.params.id);
    const currentUser = await User.findById(req.user._id);
    if (!targetUser || !currentUser)
      return res.status(404).json({ error: "User not found" });

    const targetIdString = req.params.id.toString();
    const currentUserIdString = req.user._id.toString();

    currentUser.sentFollowRequests = (
      currentUser.sentFollowRequests || []
    ).filter((u) => u.toString() !== targetIdString);
    targetUser.followRequests = (targetUser.followRequests || []).filter(
      (u) => u.toString() !== currentUserIdString
    );

    await Promise.all([currentUser.save(), targetUser.save()]);
    return res.json({ success: true, message: "Follow request canceled" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Get incoming follow requests for current user
router.get("/me/follow-requests", authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate("followRequests", "username fullName avatar isVerified bio")
      .select("followRequests");
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json({ success: true, data: user.followRequests || [] });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Accept a follow request
router.post("/requests/:requesterId/accept", authenticate, async (req, res) => {
  try {
    const requesterId = req.params.requesterId;
    const currentUser = await User.findById(req.user._id);
    const requester = await User.findById(requesterId);
    if (!currentUser || !requester)
      return res.status(404).json({ error: "User not found" });

    // Remove from request lists
    currentUser.followRequests = (currentUser.followRequests || []).filter(
      (u) => u.toString() !== requesterId
    );
    requester.sentFollowRequests = (requester.sentFollowRequests || []).filter(
      (u) => u.toString() !== req.user._id.toString()
    );

    // Establish follow
    if (!currentUser.followers?.some((u) => u.toString() === requesterId)) {
      currentUser.followers.push(requesterId);
    }
    if (
      !requester.following?.some(
        (u) => u.toString() === req.user._id.toString()
      )
    ) {
      requester.following.push(req.user._id);
    }

    await Promise.all([currentUser.save(), requester.save()]);

    // Notify requester their request was accepted
    try {
      await Notification.create({
        recipient: requester._id,
        sender: currentUser._id,
        type: "follow_request_accepted",
        title: "Follow request accepted",
        message: `${
          currentUser.username || currentUser.name || "User"
        } accepted your follow request`,
        category: "social",
      });
    } catch (notifyErr) {
      console.warn("Notification create failed:", notifyErr?.message);
    }

    return res.json({ success: true, message: "Request accepted" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// Decline a follow request
router.post(
  "/requests/:requesterId/decline",
  authenticate,
  async (req, res) => {
    try {
      const requesterId = req.params.requesterId;
      const currentUser = await User.findById(req.user._id);
      const requester = await User.findById(requesterId);
      if (!currentUser || !requester)
        return res.status(404).json({ error: "User not found" });

      currentUser.followRequests = (currentUser.followRequests || []).filter(
        (u) => u.toString() !== requesterId
      );
      requester.sentFollowRequests = (
        requester.sentFollowRequests || []
      ).filter((u) => u.toString() !== req.user._id.toString());

      await Promise.all([currentUser.save(), requester.save()]);
      return res.json({ success: true, message: "Request declined" });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
);

// Get current user's followers
router.get("/me/followers", authenticate, async (req, res) => {
  try {
    let user;
    if (req.user._id === "demo_user_id") {
      // For demo user, find all users who have demo_user_id in their followers array
      const usersWithDemoInFollowers = await User.find({
        followers: "demo_user_id",
      }).select("username fullName avatar isVerified bio");

      return res.json({
        success: true,
        data: usersWithDemoInFollowers || [],
        message: "Followers retrieved successfully",
      });
    } else {
      user = await User.findById(req.user._id)
        .populate("followers", "username fullName avatar isVerified bio")
        .select("followers");
    }

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      success: true,
      data: user.followers || [],
      message: "Followers retrieved successfully",
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get current user's following
router.get("/me/following", authenticate, async (req, res) => {
  try {
    console.log("=== FOLLOWING ENDPOINT HIT ===");
    console.log(`User ID: ${req.user._id}`);

    // Get the current user with following populated
    const user = await User.findById(req.user._id)
      .populate("following", "username fullName name avatar isVerified bio")
      .select("following");

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    const followingList = user.following || [];

    // Transform the data to match expected format
    const transformedFollowing = followingList.map((followedUser) => ({
      id: followedUser._id,
      _id: followedUser._id,
      username: followedUser.username,
      fullName: followedUser.fullName || followedUser.name,
      avatar: followedUser.avatar,
      isVerified: followedUser.isVerified || false,
      bio: followedUser.bio || "",
      verified: followedUser.isVerified || false,
      isFollowing: true, // Since these are users the current user follows
      mutual: false, // TODO: Check if this is mutual
    }));

    console.log(`Returning ${transformedFollowing.length} following users`);

    res.json({
      success: true,
      data: transformedFollowing,
      message: "Following retrieved successfully",
    });
  } catch (error) {
    console.error("Error in /me/following:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get user's followers (ObjectId constrained to avoid capturing '/me')
router.get(
  "/:id([0-9a-fA-F]{24})/followers",
  authenticate,
  async (req, res) => {
    try {
      const user = await User.findById(req.params.id)
        .populate("followers", "username fullName avatar isVerified bio")
        .select("followers");

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Privacy: if target is private and requester is not a follower or self, deny
      const targetUserFull = await User.findById(req.params.id).select(
        "privacy.profileVisibility followers"
      );
      const isPrivate = targetUserFull.privacy?.profileVisibility === "private";
      const isSelf = (req.user.id || req.user._id).toString() === req.params.id;
      const isFollower = (targetUserFull.followers || []).some(
        (id) => id.toString() === (req.user.id || req.user._id).toString()
      );
      if (isPrivate && !isSelf && !isFollower) {
        return res.status(403).json({ error: "This account is private" });
      }

      res.json({
        success: true,
        data: user.followers || [],
        message: "Followers retrieved successfully",
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Get user's following (ObjectId constrained to avoid capturing '/me')
router.get(
  "/:id([0-9a-fA-F]{24})/following",
  authenticate,
  async (req, res) => {
    try {
      const user = await User.findById(req.params.id)
        .populate("following", "username fullName avatar isVerified bio")
        .select("following");

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Privacy: if target is private and requester is not a follower or self, deny
      const targetUserFull = await User.findById(req.params.id).select(
        "privacy.profileVisibility followers"
      );
      const isPrivate = targetUserFull.privacy?.profileVisibility === "private";
      const isSelf = (req.user.id || req.user._id).toString() === req.params.id;
      const isFollower = (targetUserFull.followers || []).some(
        (id) => id.toString() === (req.user.id || req.user._id).toString()
      );
      if (isPrivate && !isSelf && !isFollower) {
        return res.status(403).json({ error: "This account is private" });
      }

      res.json({
        success: true,
        data: user.following || [],
        message: "Following retrieved successfully",
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Block user
router.post("/:id/block", authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const isBlocked = user.blockedUsers.includes(req.params.id);

    if (isBlocked) {
      user.blockedUsers.pull(req.params.id);
    } else {
      user.blockedUsers.push(req.params.id);
    }

    await user.save();
    res.json({ blocked: !isBlocked });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user profile (ObjectId constrained to avoid capturing '/me')
router.get("/:id([0-9a-fA-F]{24})", authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // Enforce profile view privacy: if target disabled profile views, only self can view
    const viewerId = (req.user._id || req.user.id).toString();
    const isSelf = viewerId === req.params.id.toString();
    if (user?.privacy && user.privacy.allowProfileViews === false && !isSelf) {
      return res.status(403).json({
        success: false,
        error: "This profile is not available",
        code: "PROFILE_VIEWS_DISABLED",
      });
    }

    // Check if current user is following this user
    let isFollowing = false;
    if (req.user._id !== "demo_user_id") {
      const currentUser = await User.findById(req.user._id);
      isFollowing =
        currentUser?.following?.some(
          (id) => id.toString() === req.params.id.toString()
        ) || false;
    } else {
      // For demo users, check if demo user ID is in the target user's followers
      isFollowing =
        user.followers?.some((id) => id.toString() === "demo_user_id") || false;
    }

    // Determine if follow was requested (for private accounts)
    const isRequested = user.followRequests?.some(
      (id) => id.toString() === (req.user._id || req.user.id).toString()
    );

    // Add computed fields
    const userResponse = {
      ...user.toObject(),
      isFollowing,
      requested: !!isRequested,
      followerCount: user.followers?.length || 0,
      followingCount: user.following?.length || 0,
      postCount: 0, // TODO: Calculate actual post count
    };

    res.json({
      success: true,
      data: userResponse,
      message: "User profile retrieved successfully",
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
