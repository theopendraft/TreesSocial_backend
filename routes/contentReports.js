import express from 'express';
import { body, validationResult } from 'express-validator';
import ContentReport from '../models/ContentReport.js';
import Post from '../models/Post.js';
import User from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Report content (post, reel, story, comment)
router.post('/', authenticateToken, [
  body('type').isIn(['post', 'reel', 'story', 'comment']),
  body('targetId').isMongoId(),
  body('reason').isIn([
    'inappropriate_content',
    'harassment', 
    'spam',
    'hate_speech',
    'violence',
    'sexual_content',
    'self_harm',
    'bullying',
    'misinformation',
    'copyright_violation',
    'privacy_violation',
    'scam',
    'other'
  ]),
  body('additionalInfo').optional().isString().trim().isLength({ max: 500 }),
  body('severity').optional().isIn(['low', 'medium', 'high', 'urgent'])
], async (req, res) => {
  try {
    const { type, targetId, reason, additionalInfo, severity = 'medium' } = req.body;

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    // Check if content exists
    let targetExists = false;
    if (type === 'post') {
      targetExists = await Post.findById(targetId);
    }
    // Add checks for other content types as needed

    if (!targetExists) {
      return res.status(404).json({
        success: false,
        message: 'Content not found'
      });
    }

    // Check if user has already reported this content
    const existingReport = await ContentReport.findOne({
      reporter: req.user.id,
      targetType: type,
      targetId: targetId
    });

    if (existingReport) {
      return res.status(400).json({
        success: false,
        message: 'You have already reported this content'
      });
    }

    // Create content report
    const report = new ContentReport({
      reporter: req.user.id,
      targetType: type,
      targetId: targetId,
      reportType: reason,
      reason: additionalInfo || 'No additional information provided',
      additionalInfo: additionalInfo,
      severity: severity,
      metadata: {
        reporterIP: req.ip,
        reporterUserAgent: req.get('User-Agent'),
        timestamp: new Date()
      }
    });

    await report.save();

    console.log('Content report created:', {
      reportId: report._id,
      reporter: req.user.id,
      targetType: type,
      targetId: targetId,
      reason: reason
    });

    res.status(201).json({
      success: true,
      message: 'Content reported successfully',
      data: {
        reportId: report._id,
        status: report.status
      }
    });
  } catch (error) {
    console.error('Error creating content report:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Get user's reports
router.get('/my-reports', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const reports = await ContentReport.find({ reporter: req.user.id })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await ContentReport.countDocuments({ reporter: req.user.id });

    res.json({
      success: true,
      data: {
        reports,
        total,
        page,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching user reports:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

export default router;