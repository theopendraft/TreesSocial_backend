import express from 'express';
import { auth } from '../middleware/auth.js';
import Match from '../models/Match.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';

const router = express.Router();

// Get potential matches
router.get('/potential', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    // Get users already swiped on
    const existingMatches = await Match.find({
      users: req.user.id
    });
    
    const swipedUserIds = existingMatches.reduce((acc, match) => {
      const otherUser = match.users.find(id => id.toString() !== req.user.id);
      if (otherUser) acc.push(otherUser);
      return acc;
    }, []);
    
    // Build filter based on preferences
    const filter = {
      _id: { $nin: [...swipedUserIds, req.user.id, ...user.blockedUsers] },
      isActive: true
    };
    
    if (user.preferences.gender && user.preferences.gender !== 'all') {
      filter.gender = user.preferences.gender;
    }
    
    const potentialMatches = await User.find(filter)
      .select('username profileImage bio location interests')
      .limit(10);
    
    res.json(potentialMatches);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Swipe on user
router.post('/swipe', auth, async (req, res) => {
  try {
    const { targetUserId, action } = req.body; // action: 'like' or 'pass'
    
    if (targetUserId === req.user.id) {
      return res.status(400).json({ error: 'Cannot swipe on yourself' });
    }
    
    // Check if match already exists
    let match = await Match.findOne({
      users: { $all: [req.user.id, targetUserId] }
    });
    
    if (!match) {
      match = new Match({
        users: [req.user.id, targetUserId],
        initiator: req.user.id,
        swipes: [{
          user: req.user.id,
          action,
          timestamp: new Date()
        }]
      });
    } else {
      // Add swipe to existing match
      match.swipes.push({
        user: req.user.id,
        action,
        timestamp: new Date()
      });
    }
    
    // Check if both users liked each other
    const bothLiked = match.swipes.filter(s => s.action === 'like').length === 2;
    
    if (bothLiked && action === 'like') {
      match.status = 'matched';
      
      // Create notifications for both users
      await Notification.create([
        {
          recipient: req.user.id,
          type: 'match',
          title: 'New Match!',
          message: 'You have a new match!',
          data: { matchId: match._id, userId: targetUserId }
        },
        {
          recipient: targetUserId,
          type: 'match',
          title: 'New Match!',
          message: 'You have a new match!',
          data: { matchId: match._id, userId: req.user.id }
        }
      ]);
    }
    
    await match.save();
    
    res.json({ 
      matched: bothLiked && action === 'like',
      matchId: match._id
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user's matches
router.get('/my-matches', auth, async (req, res) => {
  try {
    const matches = await Match.find({
      users: req.user.id,
      status: 'matched'
    })
    .populate('users', 'username profileImage bio')
    .sort({ updatedAt: -1 });
    
    const formattedMatches = matches.map(match => {
      const otherUser = match.users.find(user => user._id.toString() !== req.user.id);
      return {
        _id: match._id,
        user: otherUser,
        lastMessage: match.lastMessage,
        chatStarted: match.chatStarted,
        createdAt: match.createdAt
      };
    });
    
    res.json(formattedMatches);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get match history
router.get('/history', auth, async (req, res) => {
  try {
    const matches = await Match.find({
      users: req.user.id
    })
    .populate('users', 'username profileImage')
    .sort({ createdAt: -1 });
    
    const history = matches.map(match => {
      const otherUser = match.users.find(user => user._id.toString() !== req.user.id);
      const userSwipe = match.swipes.find(s => s.user.toString() === req.user.id);
      
      return {
        _id: match._id,
        user: otherUser,
        action: userSwipe?.action,
        status: match.status,
        createdAt: match.createdAt
      };
    });
    
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Unmatch
router.delete('/:matchId', auth, async (req, res) => {
  try {
    const match = await Match.findById(req.params.matchId);
    
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }
    
    if (!match.users.includes(req.user.id)) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    await Match.findByIdAndDelete(req.params.matchId);
    
    res.json({ message: 'Match removed successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;