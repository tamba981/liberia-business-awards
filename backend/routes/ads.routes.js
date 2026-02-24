// ============================================
// ADS API ROUTES
// ============================================
module.exports = (AdCampaign, AdImpression, AdClick, getSessionId, getClientIp) => {
    const express = require('express');
    const router = express.Router();

    // GET active ads by type
    router.get('/ads', async (req, res) => {
        try {
            const { type, limit = 5 } = req.query;
            const now = new Date();
            
            const query = {
                campaign_type: type,
                status: 'active',
                payment_status: 'paid',
                start_date: { $lte: now },
                end_date: { $gte: now },
                $expr: {
                    $or: [
                        { $eq: ['$max_impressions', null] },
                        { $lt: ['$current_impressions', '$max_impressions'] }
                    ]
                }
            };
            
            const ads = await AdCampaign.find(query)
                .populate('advertiser_id', 'business_name')
                .sort('-created_at')
                .limit(parseInt(limit));
            
            const safeAds = ads.map(ad => ({
                id: ad._id,
                campaign_name: ad.campaign_name,
                campaign_type: ad.campaign_type,
                image_url: ad.image_url,
                mobile_image_url: ad.mobile_image_url,
                alt_text: ad.alt_text,
                target_url: ad.target_url,
                business_name: ad.advertiser_id?.business_name
            }));
            
            res.json({
                success: true,
                type,
                count: safeAds.length,
                ads: safeAds
            });
        } catch (error) {
            console.error('Ads fetch error:', error);
            res.status(500).json({ success: false, error: 'Server error' });
        }
    });

    // GET single ad for rotation
    router.get('/ads/next', async (req, res) => {
        try {
            const { type, exclude } = req.query;
            const excludeIds = exclude ? exclude.split(',').map(id => id.trim()) : [];
            const now = new Date();
            
            const query = {
                campaign_type: type,
                status: 'active',
                payment_status: 'paid',
                start_date: { $lte: now },
                end_date: { $gte: now },
                _id: { $nin: excludeIds },
                $expr: {
                    $or: [
                        { $eq: ['$max_impressions', null] },
                        { $lt: ['$current_impressions', '$max_impressions'] }
                    ]
                }
            };
            
            const ads = await AdCampaign.aggregate([
                { $match: query },
                { $sample: { size: 1 } },
                { 
                    $lookup: {
                        from: 'advertisers',
                        localField: 'advertiser_id',
                        foreignField: '_id',
                        as: 'advertiser'
                    }
                },
                { $unwind: '$advertiser' }
            ]);
            
            if (!ads.length) {
                return res.status(404).json({ 
                    success: false, 
                    error: 'No active ads' 
                });
            }
            
            const ad = ads[0];
            
            res.json({
                success: true,
                data: {
                    id: ad._id,
                    campaign_name: ad.campaign_name,
                    image_url: ad.image_url,
                    mobile_image_url: ad.mobile_image_url,
                    alt_text: ad.alt_text,
                    target_url: ad.target_url,
                    business_name: ad.advertiser.business_name
                }
            });
        } catch (error) {
            console.error('Next ad error:', error);
            res.status(500).json({ success: false, error: 'Server error' });
        }
    });

    // POST track impression
    router.post('/ads/track/impression', async (req, res) => {
        try {
            const { campaign_id } = req.body;
            
            if (!campaign_id) {
                return res.status(400).json({ success: false, error: 'Campaign ID required' });
            }
            
            const session_id = getSessionId(req);
            const ip_address = getClientIp(req);
            const user_agent = req.headers['user-agent'];
            const referrer = req.headers['referer'] || '';
            
            let device_type = 'desktop';
            if (user_agent) {
                if (/mobile|android|iphone/i.test(user_agent)) device_type = 'mobile';
                if (/ipad/i.test(user_agent)) device_type = 'tablet';
            }
            
            const impression = new AdImpression({
                campaign_id,
                session_id,
                ip_address,
                user_agent,
                referrer,
                device_type
            });
            
            await impression.save();
            
            await AdCampaign.findByIdAndUpdate(campaign_id, {
                $inc: { current_impressions: 1 }
            });
            
            res.json({
                success: true,
                impression_id: impression._id
            });
        } catch (error) {
            console.error('Track impression error:', error);
            res.status(500).json({ success: false, error: 'Server error' });
        }
    });

    // POST track click
    router.post('/ads/track/click', async (req, res) => {
        try {
            const { campaign_id, impression_id } = req.body;
            
            if (!campaign_id) {
                return res.status(400).json({ success: false, error: 'Campaign ID required' });
            }
            
            const session_id = getSessionId(req);
            const ip_address = getClientIp(req);
            const user_agent = req.headers['user-agent'];
            
            const click = new AdClick({
                campaign_id,
                impression_id: impression_id || null,
                session_id,
                ip_address,
                user_agent
            });
            
            await click.save();
            
            await AdCampaign.findByIdAndUpdate(campaign_id, {
                $inc: { current_clicks: 1 }
            });
            
            res.json({
                success: true,
                click_id: click._id
            });
        } catch (error) {
            console.error('Track click error:', error);
            res.status(500).json({ success: false, error: 'Server error' });
        }
    });

    return router;
};
