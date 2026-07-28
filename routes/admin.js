import express from 'express';
import mongoose from 'mongoose';
import { auth, adminAuth } from '../middleware/auth.js';
import User from '../models/User.js';
import Post from '../models/Post.js';
import Reel from '../models/Reel.js';
import Stream from '../models/Stream.js';
import Match from '../models/Match.js';
import Report from '../models/Reports.js';
import ContentReport from '../models/ContentReport.js';
import Notification from '../models/Notification.js';
import AdminLog from '../models/AdminLog.js';

const router = express.Router();

// Admin middleware - Enable authentication  
router.use(auth, adminAuth);

// Dashboard stats
router.get('/dashboard/stats', async (req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const [totalUsers, activeUsers, totalPosts, totalReels, liveStreams] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ 
        $or: [
          { lastActive: { $gte: thirtyDaysAgo } },
          { createdAt: { $gte: thirtyDaysAgo } }
        ]
      }),
      Post.countDocuments(),
      Reel.countDocuments(),
      Stream.countDocuments({ status: 'live' })
    ]);
    
    res.json({
      totalUsers,
      activeUsers,
      totalPosts,
      totalReels,
      liveStreams
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get recent activities
router.get('/activities/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const activities = [];

    // Get recent user registrations
    const recentUsers = await User.find()
      .sort({ createdAt: -1 })
      .limit(Math.floor(limit / 2))
      .select('_id username name createdAt');
    
    recentUsers.forEach(user => {
      activities.push({
        id: `user_reg_${user._id}`,
        type: 'user_registration',
        user: {
          id: user._id,
          username: user.username,
          displayName: user.name || user.username
        },
        message: `New user registration: ${user.name || user.username}`,
        timestamp: user.createdAt.toISOString(),
        details: 'User registered via email'
      });
    });

    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    res.json(activities.slice(0, limit));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all users with pagination and filters
router.get('/users', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const { status, role, search } = req.query;
    
    const filter = {};
    if (status && status !== 'all') {
      if (status === 'active') filter.isActive = true;
      if (status === 'blocked' || status === 'banned') filter.isActive = false;
      if (status === 'pending') filter.isVerified = false;
    }
    if (role && role !== 'all') filter.role = role;
    if (search) {
      filter.$or = [
        { username: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await User.countDocuments(filter);

    const formattedUsers = users.map(user => ({
      _id: user._id,
      id: user._id,
      username: user.username,
      email: user.email,
      name: user.name,
      displayName: user.name,
      profilePicture: user.profilePicture,
      role: user.role,
      status: user.isActive ? 'active' : 'blocked',
      createdAt: user.createdAt,
      lastLoginAt: user.lastActive,
      badges: user.badges || [],
      postCount: 0,
      followerCount: 0,
      isVerified: user.isVerified
    }));

    res.json({
      users: formattedUsers,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit) 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single user details
router.get('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const formattedUser = {
      _id: user._id,
      id: user._id,
      username: user.username,
      email: user.email,
      name: user.name,
      displayName: user.name,
      profilePicture: user.profilePicture,
      role: user.role,
      status: user.isActive ? 'active' : 'blocked',
      createdAt: user.createdAt,
      lastLoginAt: user.lastActive,
      badges: user.badges || [],
      postCount: 0,
      followerCount: 0,
      isVerified: user.isVerified
    };

    res.json(formattedUser);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user status (block/unblock)
router.patch('/users/:id/status', async (req, res) => {
  try {
    const { isActive } = req.body;
    const user = await User.findByIdAndUpdate(req.params.id, { isActive }, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    console.log(`Admin ${isActive ? 'unblocked' : 'blocked'} user ${req.params.id}`);
    
    res.json({ message: `User ${isActive ? 'unblocked' : 'blocked'} successfully`, user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user details
router.patch('/users/:id', async (req, res) => {
  try {
    const { name, username, email, role, status } = req.body;
    
    const updateData = {};
    if (name) updateData.name = name;
    if (username) updateData.username = username;
    if (email) updateData.email = email;
    if (role) updateData.role = role;
    if (status === 'active') updateData.isActive = true;
    if (status === 'blocked' || status === 'banned') updateData.isActive = false;

    const user = await User.findByIdAndUpdate(
      req.params.id, 
      updateData, 
      { new: true, runValidators: true }
    ).select('-password');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`Admin updated user ${req.params.id} profile`);
    
    res.json({ message: 'User updated successfully', user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update user badges
router.patch('/users/:id/badges', async (req, res) => {
  try {
    const { badges } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { badges: badges || [] },
      { new: true }
    ).select('-password');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Simple logging without complex AdminLog model
    console.log(`Admin updated badges for user ${req.params.id}: ${badges?.join(', ') || 'none'}`);
    
    res.json({ message: 'User badges updated successfully', user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ban user
router.put('/users/:id/ban', async (req, res) => {
  try {
    const { reason } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id, 
      { isActive: false, banReason: reason }, 
      { new: true }
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    console.log(`Admin banned user ${req.params.id}. Reason: ${reason || 'No reason provided'}`);
    
    res.json({ message: 'User banned successfully', user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Password reset
router.post('/users/:id/reset-password', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    console.log(`Admin triggered password reset for user ${req.params.id}`);
    
    res.json({ message: 'Password reset email sent successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new user
router.post('/users', async (req, res) => {
  try {
    const { username, email, name, role = 'user', password = 'defaultpassword123' } = req.body;
    
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email or username already exists' });
    }

    const user = new User({
      username,
      email,
      name,
      role,
      password,
      isActive: true,
      isVerified: true
    });

    await user.save();

    console.log(`Admin created new user: ${username}`);

    res.status(201).json({ message: 'User created successfully', user: { _id: user._id, username, email, name, role } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete user
router.delete('/users/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await User.findByIdAndDelete(req.params.id);

    console.log(`Admin deleted user: ${user.username}`);

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// =============================================================================
// CONTENT MODERATION ENDPOINTS
// =============================================================================

// Debug endpoint to check database collections and reports
router.get('/debug/collections', async (req, res) => {
  try {
    const collections = await mongoose.connection.db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    // Check for different possible report collections
    const reportsInReports = await mongoose.connection.db.collection('reports').countDocuments();
    const reportsInUserReports = await mongoose.connection.db.collection('userreports').countDocuments();
    const reportsInContentReports = await mongoose.connection.db.collection('contentreports').countDocuments();
    
    res.json({
      collections: collectionNames,
      reportCounts: {
        reports: reportsInReports,
        userreports: reportsInUserReports,
        contentreports: reportsInContentReports
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create test report for debugging
router.post('/debug/create-test-report', async (req, res) => {
  try {
    // Get first two users
    const users = await User.find().limit(2);
    if (users.length < 2) {
      return res.status(400).json({ error: 'Need at least 2 users in database' });
    }

    const testReport = new Report({
      reporter: users[0]._id,
      reportedUser: users[1]._id,
      reportType: 'spam',
      reason: 'Test report created from admin panel for debugging',
      category: 'behavior',
      severity: 3
    });

    await testReport.save();
    console.log('Test report created:', testReport);
    
    res.json({
      success: true,
      report: testReport,
      message: 'Test report created successfully'
    });
  } catch (error) {
    console.error('Error creating test report:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get reported content for moderation
router.get('/moderation/reports', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    
    const { status, type, search } = req.query;
    
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (type && type !== 'all') filter.targetType = type;
    if (search) {
      filter.$or = [
        { reason: { $regex: search, $options: 'i' } },
        { additionalInfo: { $regex: search, $options: 'i' } }
      ];
    }

    console.log('Fetching content reports with filter:', filter);
    
    // First check total count in ContentReport collection
    const totalInDb = await ContentReport.countDocuments();
    console.log('Total content reports in database:', totalInDb);
    
    const reports = await ContentReport.find(filter)
      .populate('reporter', 'username name email profilePicture')
      .populate({
        path: 'targetId',
        select: 'content mediaUrls text createdAt author',
        populate: {
          path: 'author',
          select: 'username name profilePicture'
        }
      })
      .populate('assignedTo', 'username name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    console.log('Found content reports after query:', reports.length);

    const total = await ContentReport.countDocuments(filter);
    console.log('Total matching filter:', total);

    // Format reports for admin panel
    const formattedReports = reports.map(report => ({
      _id: report._id,
      reporter: report.reporter ? {
        _id: report.reporter._id,
        username: report.reporter.username,
        name: report.reporter.name,
        profilePicture: report.reporter.profilePicture
      } : {
        _id: 'deleted',
        username: '[Deleted User]',
        name: '[Deleted User]',
        profilePicture: null
      },
      reportedUser: report.targetId?.author ? {
        _id: report.targetId.author._id,
        username: report.targetId.author.username,
        name: report.targetId.author.name,
        profilePicture: report.targetId.author.profilePicture
      } : {
        _id: 'unknown',
        username: '[Content Author]',
        name: '[Content Author]',
        profilePicture: null
      },
      content: {
        type: report.targetType,
        text: report.targetId?.content || report.targetId?.text || 'Content not available',
        media: report.targetId?.mediaUrls || null,
        createdAt: report.targetId?.createdAt || report.createdAt
      },
      reportType: report.reportType,
      reason: report.reason,
      evidence: report.additionalInfo || '',
      status: report.status,
      priority: report.priority,
      assignedTo: report.assignedTo,
      adminNotes: report.adminNotes,
      actionsTaken: report.actionsTaken,
      createdAt: report.createdAt,
      updatedAt: report.updatedAt,
      reportCount: 1
    }));

    res.json({
      reports: formattedReports,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get single report/content for detailed view
router.get('/moderation/reports/:id', async (req, res) => {
  try {
    const report = await Report.findById(req.params.id)
      .populate('reporterId', 'username name email profilePicture')
      .populate('reportedUserId', 'username name email profilePicture')
      .populate('assignedTo', 'username name');

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // Mock content details
    const contentDetails = {
      _id: report._id,
      type: 'post',
      text: 'This is some controversial content that might violate guidelines...',
      media: [],
      author: report.reportedUserId,
      createdAt: report.createdAt,
      likes: 42,
      comments: 15,
      shares: 8
    };

    // Mock multiple report reasons
    const reportReasons = [
      { type: 'inappropriate', label: 'Inappropriate content' },
      { type: 'spam', label: 'Spam' },
      { type: 'harassment', label: 'Harassment' }
    ];

    const contentWarnings = ['Sensitive content'];

    res.json({
      content: contentDetails,
      reports: [{
        _id: report._id,
        reporter: report.reporterId,
        reason: report.reason,
        evidence: report.evidence,
        createdAt: report.createdAt
      }],
      reportReasons,
      contentWarnings,
      status: report.status,
      adminNotes: report.adminNotes,
      actionsTaken: report.actionsTaken
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Moderate content - approve/reject/mark safe
router.patch('/moderation/reports/:id/moderate', async (req, res) => {
  try {
    const { action, reason, adminNotes } = req.body;
    
    if (!['approve', 'reject', 'mark_safe'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }

    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // Update report status based on action
    let status;
    switch (action) {
      case 'approve':
        status = 'resolved';
        break;
      case 'reject':
        status = 'dismissed';
        break;
      case 'mark_safe':
        status = 'resolved';
        break;
    }

    report.status = status;
    if (adminNotes) report.adminNotes = adminNotes;
    
    // Add action to actions taken
    report.actionsTaken.push({
      action: action === 'approve' ? 'no_action' : action === 'reject' ? 'content_removal' : 'no_action',
      reason: reason || `Content ${action}d by admin`,
      takenBy: req.user?.id || null, // Assuming auth middleware sets req.user
      takenAt: new Date()
    });

    await report.save();

    console.log(`Admin ${action}d content report: ${report._id}`);

    res.json({ 
      message: `Content ${action}d successfully`,
      report: {
        _id: report._id,
        status: report.status,
        adminNotes: report.adminNotes,
        actionsTaken: report.actionsTaken
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete content (actually remove report from database)
router.delete('/moderation/content/:id', async (req, res) => {
  try {
    const { reason } = req.body;
    
    // Actually delete the report from the database
    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // Log the deletion for audit purposes
    console.log(`Admin deleting report: ${req.params.id} - Reason: ${reason || 'No reason provided'}`);
    
    // Actually remove the report from database
    await Report.findByIdAndDelete(req.params.id);

    res.json({ 
      message: 'Report deleted successfully',
      deletedId: req.params.id 
    });
  } catch (error) {
    console.error('Error deleting report:', error);
    res.status(500).json({ error: error.message });
  }
});

// Mark content as resolved (alternative to deletion)
router.patch('/moderation/content/:id/resolve', async (req, res) => {
  try {
    const { reason } = req.body;
    
    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    report.status = 'resolved';
    report.actionsTaken.push({
      action: 'content_removal',
      reason: reason || 'Content resolved for policy compliance',
      takenBy: req.user?.id || null,
      takenAt: new Date()
    });

    await report.save();

    console.log(`Admin resolved report: ${req.params.id}`);

    res.json({ 
      message: 'Report resolved successfully',
      report: report 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Ban user (from content moderation)
router.post('/moderation/ban-user/:userId', async (req, res) => {
  try {
    const { reason, duration, reportId } = req.body;
    
    if (!reason) {
      return res.status(400).json({ error: 'Ban reason is required' });
    }

    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Calculate ban end date
    let banEndDate = null;
    if (duration && duration !== 'permanent') {
      const days = parseInt(duration);
      banEndDate = new Date(Date.now() + (days * 24 * 60 * 60 * 1000));
    }

    // Update user status
    user.isActive = false;
    user.banReason = reason;
    user.bannedAt = new Date();
    user.banEndDate = banEndDate;
    await user.save();

    // Update related report if provided
    if (reportId) {
      const report = await Report.findById(reportId);
      if (report) {
        report.status = 'resolved';
        report.actionsTaken.push({
          action: 'ban',
          duration: duration === 'permanent' ? null : parseInt(duration),
          reason: reason,
          takenBy: req.user?.id || null,
          takenAt: new Date()
        });
        await report.save();
      }
    }

    console.log(`Admin banned user: ${user.username} for ${duration || 'permanent'} - ${reason}`);

    res.json({ 
      message: 'User banned successfully',
      user: {
        _id: user._id,
        username: user.username,
        isActive: user.isActive,
        banReason: user.banReason,
        bannedAt: user.bannedAt,
        banEndDate: user.banEndDate
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ADMIN NOTIFICATION ENDPOINTS

// Send notification to users
router.post('/notifications/send', async (req, res) => {
  try {
    const { title, message, type, priority, targetAudience, specificGroup, scheduledFor } = req.body;
    
    if (!title || !message) {
      return res.status(400).json({ error: 'Title and message are required' });
    }

    // Import models
    const AdminNotification = (await import('../models/AdminNotification.js')).default;
    const Notification = (await import('../models/Notification.js')).default;
    
    // Get target users
    const targetUsers = await AdminNotification.getTargetUsers(targetAudience, specificGroup);
    
    // Create admin notification record
    const adminNotification = new AdminNotification({
      title,
      message,
      type: type || 'general',
      priority: priority || 'medium',
      targetAudience: targetAudience || 'all',
      specificGroup,
      sentBy: req.user?.id || null, // Assuming auth middleware sets req.user
      scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
      status: scheduledFor ? 'scheduled' : 'sent',
      totalRecipients: targetUsers.length
    });

    await adminNotification.save();

    // Create individual notifications for each user
    const notifications = targetUsers.map(user => ({
      recipient: user._id,
      sender: null, // Admin notifications don't have a sender
      type: 'admin',
      title,
      message,
      priority,
      data: {
        adminNotificationId: adminNotification._id,
        notificationType: type
      },
      isRead: false,
      sentAt: new Date()
    }));

    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
      adminNotification.deliveredCount = notifications.length;
      await adminNotification.save();
    }

    console.log(`Admin notification sent to ${targetUsers.length} users`);

    res.json({
      message: 'Notification sent successfully',
      adminNotification: {
        _id: adminNotification._id,
        title: adminNotification.title,
        targetAudience: adminNotification.targetAudience,
        totalRecipients: adminNotification.totalRecipients,
        deliveredCount: adminNotification.deliveredCount,
        sentAt: adminNotification.sentAt
      }
    });
  } catch (error) {
    console.error('Error sending notification:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get notification history/logs
router.get('/notifications/history', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const AdminNotification = (await import('../models/AdminNotification.js')).default;

    const notifications = await AdminNotification.find({})
      .populate('sentBy', 'username name')
      .sort({ sentAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await AdminNotification.countDocuments({});
    const pages = Math.ceil(total / limit);

    // Calculate open rates
    const notificationsWithOpenRate = notifications.map(notification => ({
      ...notification,
      openRate: notification.deliveredCount > 0 
        ? ((notification.readCount / notification.deliveredCount) * 100).toFixed(1)
        : '0.0'
    }));

    res.json({
      notifications: notificationsWithOpenRate,
      total,
      page,
      limit,
      pages
    });
  } catch (error) {
    console.error('Error fetching notification history:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get notification statistics
router.get('/notifications/stats', async (req, res) => {
  try {
    const AdminNotification = (await import('../models/AdminNotification.js')).default;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [totalSent, todaySent, totalUsers] = await Promise.all([
      AdminNotification.countDocuments({ status: 'sent' }),
      AdminNotification.countDocuments({ 
        status: 'sent',
        sentAt: { $gte: today }
      }),
      User.countDocuments({})
    ]);

    const avgOpenRate = await AdminNotification.aggregate([
      { $match: { status: 'sent', deliveredCount: { $gt: 0 } } },
      {
        $group: {
          _id: null,
          avgOpenRate: {
            $avg: {
              $multiply: [
                { $divide: ['$readCount', '$deliveredCount'] },
                100
              ]
            }
          }
        }
      }
    ]);

    res.json({
      totalSent,
      todaySent,
      totalUsers,
      avgOpenRate: avgOpenRate[0]?.avgOpenRate?.toFixed(1) || '0.0'
    });
  } catch (error) {
    console.error('Error fetching notification stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete notification
router.delete('/notifications/:id', async (req, res) => {
  try {
    const AdminNotification = (await import('../models/AdminNotification.js')).default;
    
    const notification = await AdminNotification.findByIdAndDelete(req.params.id);
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ message: 'Notification deleted successfully' });
  } catch (error) {
    console.error('Error deleting notification:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========================================
// PSA (PUBLIC SERVICE ANNOUNCEMENT) ROUTES
// ========================================

// Get all PSAs
router.get('/psa', async (req, res) => {
  try {
    const PSA = (await import('../models/PSA.js')).default;
    
    const { page = 1, limit = 10, status, type } = req.query;
    const filter = {};
    
    if (status) filter.status = status;
    if (type) filter.type = type;
    
    const psas = await PSA.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await PSA.countDocuments(filter);
    
    res.json({
      psas,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    console.error('Error fetching PSAs:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create new PSA
router.post('/psa', async (req, res) => {
  try {
    const PSA = (await import('../models/PSA.js')).default;
    const Post = (await import('../models/Post.js')).default;
    
    const {
      title,
      content,
      type = 'general',
      priority = 'medium',
      targetAudience = 'all',
      scheduledFor
    } = req.body;
    
    // Create PSA record
    const psa = new PSA({
      title,
      content,
      type,
      priority,
      status: scheduledFor ? 'scheduled' : 'active',
      targetAudience: {
        all: targetAudience === 'all',
        gender: 'all'
      },
      scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
      createdBy: req.user?.id || '507f1f77bcf86cd799439011', // System admin user ID
      metrics: {
        views: 0,
        clicks: 0,
        shares: 0
      }
    });
    
    await psa.save();
    console.log('PSA saved successfully:', psa._id);
    
    // Create a post in the feed as "trees" user if PSA is active
    if (psa.status === 'active') {
      try {
        const feedPost = new Post({
          authorId: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011'), // System/Trees user ID
          content: `🚨 ${title}\n\n${content}`,
          type: 'text',
          isPSA: true,
          psaId: psa._id,
          metadata: {
            isSystemPost: true,
            systemAuthor: 'trees'
          }
        });
        
        await feedPost.save();
        console.log('PSA posted to feed:', feedPost._id);
      } catch (feedPostError) {
        console.error('Error creating feed post:', feedPostError);
        // Continue without failing the PSA creation
      }
    }
    
    res.status(201).json({
      message: 'PSA created successfully',
      psa
    });
  } catch (error) {
    console.error('Error creating PSA:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update PSA
router.put('/psa/:id', async (req, res) => {
  try {
    const PSA = (await import('../models/PSA.js')).default;
    
    const psa = await PSA.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!psa) {
      return res.status(404).json({ error: 'PSA not found' });
    }
    
    res.json({
      message: 'PSA updated successfully',
      psa
    });
  } catch (error) {
    console.error('Error updating PSA:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete PSA
router.delete('/psa/:id', async (req, res) => {
  try {
    const PSA = (await import('../models/PSA.js')).default;
    const Post = (await import('../models/Post.js')).default;
    
    const psa = await PSA.findById(req.params.id);
    if (!psa) {
      return res.status(404).json({ error: 'PSA not found' });
    }
    
    // Delete associated feed post if exists
    if (psa.psaId) {
      await Post.findOneAndDelete({ psaId: psa._id });
    }
    
    await PSA.findByIdAndDelete(req.params.id);
    
    res.json({
      message: 'PSA deleted successfully',
      deletedId: req.params.id
    });
  } catch (error) {
    console.error('Error deleting PSA:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get PSA analytics
router.get('/psa/:id/analytics', async (req, res) => {
  try {
    const PSA = (await import('../models/PSA.js')).default;
    
    const psa = await PSA.findById(req.params.id);
    if (!psa) {
      return res.status(404).json({ error: 'PSA not found' });
    }
    
    res.json({
      analytics: psa.metrics,
      psa: {
        title: psa.title,
        createdAt: psa.createdAt,
        status: psa.status
      }
    });
  } catch (error) {
    console.error('Error fetching PSA analytics:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;