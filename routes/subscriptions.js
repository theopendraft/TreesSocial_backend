import express from 'express';
import Subscription from '../models/Subscription.js';
import User from '../models/User.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get subscription tiers and pricing
router.get('/tiers', (req, res) => {
  const tiers = [
    {
      id: 'gold',
      name: 'Gold Tier',
      price: 9.99,
      currency: 'USD',
      features: ['Access to stream', 'Standard emojis', 'Priority chat', 'Exclusive content access']
    },
    {
      id: 'diamond',
      name: 'Diamond Tier',
      price: 16.99,
      currency: 'USD',
      features: ['Exclusive streams', 'Premium emojis', 'Badge beside name', 'Direct messaging', 'Advanced features']
    },
    {
      id: 'chrome',
      name: 'Chrome Tier',
      price: 39.99,
      currency: 'USD',
      features: ['Chrome-only exclusive streams', 'All premium features', 'VIP access', 'Early content', 'Custom emotes']
    }
  ];
  
  res.json({ success: true, tiers });
});

// Subscribe to a creator
router.post('/subscribe', authenticateToken, async (req, res) => {
  try {
    const { creatorId, tier, paymentMethod, transactionId, isGift, giftCount = 1 } = req.body;
    
    const creator = await User.findById(creatorId);
    if (!creator) {
      return res.status(404).json({ success: false, message: 'Creator not found' });
    }

    const tierPrices = { gold: 9.99, diamond: 16.99, chrome: 39.99 };
    const price = tierPrices[tier];
    
    if (!price) {
      return res.status(400).json({ success: false, message: 'Invalid tier' });
    }

    // Calculate end date (30 days from now)
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30);

    const subscriptions = [];
    
    for (let i = 0; i < giftCount; i++) {
      const subscription = new Subscription({
        subscriber: req.user.userId,
        creator: creatorId,
        tier,
        price,
        endDate,
        paymentMethod,
        transactionId: `${transactionId}_${i + 1}`,
        isGifted: isGift || false,
        giftedBy: isGift ? req.user.userId : undefined
      });
      
      await subscription.save();
      subscriptions.push(subscription);
    }

    res.json({ 
      success: true, 
      message: isGift ? `${giftCount} subscription(s) gifted successfully` : 'Subscription created successfully',
      subscriptions 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get user's subscriptions
router.get('/my-subscriptions', authenticateToken, async (req, res) => {
  try {
    const subscriptions = await Subscription.find({ 
      subscriber: req.user.userId,
      status: 'active'
    }).populate('creator', 'username profileImage');
    
    res.json({ success: true, subscriptions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get creator's subscribers
router.get('/subscribers/:creatorId', authenticateToken, async (req, res) => {
  try {
    const { creatorId } = req.params;
    
    const subscriptions = await Subscription.find({ 
      creator: creatorId,
      status: 'active'
    }).populate('subscriber', 'username profileImage');
    
    const stats = {
      total: subscriptions.length,
      byTier: {
        gold: subscriptions.filter(s => s.tier === 'gold').length,
        diamond: subscriptions.filter(s => s.tier === 'diamond').length,
        chrome: subscriptions.filter(s => s.tier === 'chrome').length
      }
    };
    
    res.json({ success: true, subscriptions, stats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Cancel subscription
router.post('/cancel/:subscriptionId', authenticateToken, async (req, res) => {
  try {
    const subscription = await Subscription.findById(req.params.subscriptionId);
    
    if (!subscription || subscription.subscriber.toString() !== req.user.userId) {
      return res.status(404).json({ success: false, message: 'Subscription not found' });
    }
    
    subscription.status = 'cancelled';
    subscription.autoRenew = false;
    await subscription.save();
    
    res.json({ success: true, message: 'Subscription cancelled successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;