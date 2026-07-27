import express from 'express';
import { auth } from '../middleware/auth.js';
import Stream from '../models/Stream.js';
import User from '../models/User.js';
import {
  generateVideoSDKToken,
  createMeeting,
  validateMeeting,
  endMeeting,
  getMeetingDetails,
  startRecording,
  stopRecording,
} from '../config/videosdk.js';

const router = express.Router();

// Get all live streams
router.get('/live', auth, async (req, res) => {
  try {
    const { category } = req.query;
    const filter = { isLive: true };
    
    if (category && category !== 'all') {
      filter.category = category;
    }
    
    const streams = await Stream.find(filter)
      .populate('streamer', 'username profileImage isVerified')
      .sort({ viewers: -1, startedAt: -1 });
    
    res.json(streams);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get top streamers leaderboard
router.get('/leaderboard', auth, async (req, res) => {
  try {
    const topStreamers = await Stream.aggregate([
      { $match: { isLive: true } },
      { $group: {
        _id: '$streamer',
        totalViewers: { $sum: { $size: '$viewers' } },
        streamCount: { $sum: 1 }
      }},
      { $sort: { totalViewers: -1 } },
      { $limit: 30 },
      { $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'streamer'
      }},
      { $unwind: '$streamer' },
      { $project: {
        streamer: {
          _id: '$streamer._id',
          username: '$streamer.username',
          profileImage: '$streamer.profileImage',
          isVerified: '$streamer.isVerified'
        },
        totalViewers: 1,
        streamCount: 1
      }}
    ]);
    
    res.json(topStreamers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate VideoSDK token
router.get('/token', auth, async (req, res) => {
  try {
    const token = generateVideoSDKToken({
      permissions: ['allow_join', 'allow_mod'],
      roles: ['CRAWLER', 'RTMP'],
    });
    
    res.json({
      success: true,
      token,
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Get my active stream
router.get('/my-active', auth, async (req, res) => {
  try {
    const userId = req.user._id || req.user.id;
    
    const activeStream = await Stream.findOne({
      streamerId: userId,
      status: 'live'
    });
    
    if (!activeStream) {
      return res.status(404).json({
        success: false,
        error: 'No active stream found'
      });
    }
    
    // Convert to plain object to avoid ObjectId serialization issues
    const streamObj = activeStream.toObject();
    
    res.json({
      success: true,
      stream: {
        _id: streamObj._id.toString(),
        title: streamObj.title,
        description: streamObj.description,
        category: streamObj.category,
        thumbnail: streamObj.thumbnail,
        videoSdkRoomId: streamObj.videoSdkRoomId,
        startedAt: streamObj.startedAt,
        status: streamObj.status
      }
    });
  } catch (error) {
    console.error('Error getting active stream:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get stream by ID - MUST come after specific routes like /my-active, /token
router.get('/:id', auth, async (req, res) => {
  try {
    const stream = await Stream.findById(req.params.id)
      .populate('streamer', 'username profileImage isVerified')
      .populate('chat.user', 'username profileImage');
    
    if (!stream) {
      return res.status(404).json({ error: 'Stream not found' });
    }
    
    // Add viewer if not already viewing
    if (!stream.viewers.includes(req.user.id)) {
      stream.viewers.push(req.user.id);
      stream.totalViews += 1;
      if (stream.viewers.length > stream.maxViewers) {
        stream.maxViewers = stream.viewers.length;
      }
      await stream.save();
    }
    
    res.json(stream);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start stream
router.post('/start', auth, async (req, res) => {
  try {
    const { title, description, category, thumbnail } = req.body;
    
    console.log('=== START STREAM DEBUG ===');
    console.log('req.user:', req.user);
    console.log('req.body:', req.body);
    
    // Validate required fields
    if (!title) {
      return res.status(400).json({ 
        success: false,
        error: 'Stream title is required' 
      });
    }

    // Get user ID - handle both _id and id
    const userId = req.user._id || req.user.id;
    console.log('userId:', userId);
    
    // Check if user already has an active stream
    const existingStream = await Stream.findOne({
      streamerId: userId,
      status: 'live'
    });
    
    console.log('Existing stream check:', existingStream);
    
    if (existingStream) {
      console.log('Found existing stream:', existingStream._id);
      return res.status(400).json({ 
        success: false,
        error: 'You already have an active stream',
        streamId: existingStream._id
      });
    }
    
    // Create VideoSDK meeting room
    const meetingResult = await createMeeting();
    
    if (!meetingResult.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to create stream room'
      });
    }
    
    // Generate unique stream key
    const streamKey = `stream_${userId}_${Date.now()}`;
    
    const stream = new Stream({
      streamerId: userId,
      title: title,
      description: description || '',
      category: category || 'other',
      thumbnail: thumbnail || '',
      status: 'live',
      startedAt: new Date(),
      streamKey: streamKey,
      streamUrl: meetingResult.roomId,
      // Store VideoSDK room ID
      videoSdkRoomId: meetingResult.roomId,
    });
    
    await stream.save();
    
    // Update user's streamer profile (only if user exists in DB)
    try {
      await User.findByIdAndUpdate(userId, {
        'streamerProfile.isLive': true,
        'streamerProfile.currentStreamId': stream._id,
        $inc: { 'streamerProfile.totalStreams': 1 },
      });
    } catch (error) {
      console.log('Could not update user profile (user may not exist in DB):', error.message);
    }
    
    const populatedStream = await Stream.findById(stream._id)
      .populate('streamerId', 'username name avatar isVerified');
    
    res.status(201).json({
      success: true,
      stream: populatedStream,
      roomId: meetingResult.roomId,
      token: generateVideoSDKToken(),
    });
  } catch (error) {
    console.error('Start stream error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// End stream
router.post('/:id/end', auth, async (req, res) => {
  try {
    const stream = await Stream.findById(req.params.id);
    
    if (!stream) {
      return res.status(404).json({ 
        success: false,
        error: 'Stream not found' 
      });
    }
    
    // Check authorization - support both _id and id fields
    const userId = req.user.id || req.user._id?.toString();
    const streamerId = stream.streamerId.toString();
    
    console.log('End stream authorization check:', { 
      userId, 
      streamerId,
      reqUserId: req.user.id,
      reqUser_id: req.user._id,
      match: userId === streamerId
    });
    
    if (streamerId !== userId) {
      return res.status(403).json({ 
        success: false,
        error: 'Not authorized' 
      });
    }
    
    // End VideoSDK meeting
    if (stream.videoSdkRoomId) {
      await endMeeting(stream.videoSdkRoomId);
    }
    
    stream.status = 'ended';
    stream.endedAt = new Date();
    stream.duration = Math.floor((stream.endedAt - stream.startedAt) / 1000);
    
    await stream.save();
    
    // Update user's streamer profile
    await User.findByIdAndUpdate(req.user.id, {
      'streamerProfile.isLive': false,
      'streamerProfile.currentStreamId': null,
      $inc: {
        'streamerProfile.totalViews': stream.totalViews,
      },
    });
    
    res.json({ 
      success: true,
      message: 'Stream ended successfully',
      duration: stream.duration,
      totalViews: stream.totalViews,
    });
  } catch (error) {
    console.error('End stream error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Add chat message
router.post('/:id/chat', auth, async (req, res) => {
  try {
    const { message } = req.body;
    const stream = await Stream.findById(req.params.id);
    
    if (!stream || !stream.isLive) {
      return res.status(404).json({ error: 'Stream not found or not live' });
    }
    
    stream.chat.push({
      user: req.user.id,
      message,
      timestamp: new Date()
    });
    
    // Keep only last 100 messages
    if (stream.chat.length > 100) {
      stream.chat = stream.chat.slice(-100);
    }
    
    await stream.save();
    
    const populatedStream = await Stream.findById(stream._id)
      .populate('chat.user', 'username profileImage');
    
    const newMessage = populatedStream.chat[populatedStream.chat.length - 1];
    
    res.json(newMessage);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add reaction
router.post('/:id/react', auth, async (req, res) => {
  try {
    const { type } = req.body;
    const stream = await Stream.findById(req.params.id);
    
    if (!stream || !stream.isLive) {
      return res.status(404).json({ error: 'Stream not found or not live' });
    }
    
    stream.reactions.push({
      user: req.user.id,
      type,
      timestamp: new Date()
    });
    
    await stream.save();
    
    res.json({ message: 'Reaction added successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Join stream - Get stream details and token
router.get('/:id/join', auth, async (req, res) => {
  try {
    const stream = await Stream.findById(req.params.id)
      .populate('streamerId', 'username name avatar isVerified');
    
    if (!stream) {
      return res.status(404).json({ 
        success: false,
        error: 'Stream not found' 
      });
    }
    
    if (stream.status !== 'live') {
      return res.status(400).json({ 
        success: false,
        error: 'Stream is not live' 
      });
    }
    
    // Generate token for viewer
    const token = generateVideoSDKToken({
      permissions: ['allow_join'],
    });
    
    // Add viewer if not already viewing
    const viewerIndex = stream.viewers.findIndex(
      v => v.userId && v.userId.toString() === req.user.id
    );
    
    if (viewerIndex === -1) {
      stream.viewers.push({
        userId: req.user.id,
        joinedAt: new Date(),
      });
      stream.totalViews += 1;
      stream.currentViewers = stream.viewers.filter(v => !v.leftAt).length;
      
      if (stream.currentViewers > stream.peakViewers) {
        stream.peakViewers = stream.currentViewers;
      }
      
      await stream.save();
    }
    
    res.json({
      success: true,
      stream,
      roomId: stream.videoSdkRoomId,
      token,
    });
  } catch (error) {
    console.error('Join stream error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Leave stream
router.post('/:id/leave', auth, async (req, res) => {
  try {
    const stream = await Stream.findById(req.params.id);
    
    if (!stream) {
      return res.status(404).json({ 
        success: false,
        error: 'Stream not found' 
      });
    }
    
    // Update viewer's left time
    const viewer = stream.viewers.find(
      v => v.userId && v.userId.toString() === req.user.id && !v.leftAt
    );
    
    if (viewer) {
      viewer.leftAt = new Date();
      viewer.watchTime = Math.floor((viewer.leftAt - viewer.joinedAt) / 1000);
      stream.currentViewers = stream.viewers.filter(v => !v.leftAt).length;
      await stream.save();
    }
    
    res.json({
      success: true,
      message: 'Left stream successfully',
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Start recording
router.post('/:id/recording/start', auth, async (req, res) => {
  try {
    const stream = await Stream.findById(req.params.id);
    
    if (!stream) {
      return res.status(404).json({ 
        success: false,
        error: 'Stream not found' 
      });
    }
    
    if (stream.streamerId.toString() !== req.user.id) {
      return res.status(403).json({ 
        success: false,
        error: 'Not authorized' 
      });
    }
    
    if (!stream.videoSdkRoomId) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid stream room' 
      });
    }
    
    const result = await startRecording(stream.videoSdkRoomId, req.body);
    
    if (result.success) {
      stream.isRecording = true;
      await stream.save();
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Stop recording
router.post('/:id/recording/stop', auth, async (req, res) => {
  try {
    const stream = await Stream.findById(req.params.id);
    
    if (!stream) {
      return res.status(404).json({ 
        success: false,
        error: 'Stream not found' 
      });
    }
    
    if (stream.streamerId.toString() !== req.user.id) {
      return res.status(403).json({ 
        success: false,
        error: 'Not authorized' 
      });
    }
    
    if (!stream.videoSdkRoomId) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid stream room' 
      });
    }
    
    const result = await stopRecording(stream.videoSdkRoomId);
    
    if (result.success) {
      stream.isRecording = false;
      await stream.save();
    }
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

export default router;