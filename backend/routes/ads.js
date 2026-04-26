const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { ObjectId } = require('mongodb');

// ============================================
// BUSINESS SUBMIT AD API
// ============================================

router.post('/business/ads', auth, async (req, res) => {
    try {
        const db = req.app.locals.db;
        const { title, description, image_url, link_url, placement } = req.body;
        
        if (!title || !image_url) {
            return res.status(400).json({ success: false, message: 'Title and image are required' });
        }
        
        const businessId = req.user.id;
        const business = await db.collection('businesses').findOne({ _id: new ObjectId(businessId) });
        
        if (!business) {
            return res.status(404).json({ success: false, message: 'Business not found' });
        }
        
        const adData = {
            title,
            description: description || '',
            image_url,
            link_url: link_url || '',
            type: placement === 'sidebar' ? 'sidebar' : placement === 'top-banner' ? 'top-banner' : 'inline',
            placement: placement || 'sidebar',
            status: 'pending',
            business_id: new ObjectId(businessId),
            business_name: business.business_name,
            start_date: new Date(),
            end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days default
            display_order: 0,
            views: 0,
            clicks: 0,
            created_at: new Date(),
            updated_at: new Date()
        };
        
        const result = await db.collection('ads').insertOne(adData);
        
        // Create notification for admin
        await db.collection('admin_notifications').insertOne({
            type: 'new_ad_submission',
            title: 'New Ad Submission',
            message: `${business.business_name} submitted an ad: "${title}"`,
            ad_id: result.insertedId,
            created_at: new Date(),
            read: false
        });
        
        res.json({ 
            success: true, 
            message: 'Ad submitted for review',
            ad: { _id: result.insertedId, ...adData }
        });
    } catch (error) {
        console.error('Error submitting ad:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// FRONTEND FETCH ADS API
// ============================================

router.get('/ads', async (req, res) => {
    try {
        const db = req.app.locals.db;
        const { type, placement, limit = 10 } = req.query;
        
        let query = { 
            status: 'approved',
            end_date: { $gt: new Date() }
        };
        
        if (type && type !== 'all') {
            query.type = type;
        }
        
        if (placement && placement !== 'all') {
            query.placement = placement;
        }
        
        const ads = await db.collection('ads')
            .find(query)
            .sort({ display_order: 1, created_at: -1 })
            .limit(parseInt(limit))
            .toArray();
        
        res.json({
            success: true,
            ads,
            count: ads.length
        });
    } catch (error) {
        console.error('Error fetching ads:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Track ad click
router.post('/ads/:id/click', async (req, res) => {
    try {
        const db = req.app.locals.db;
        const { id } = req.params;
        
        await db.collection('ads').updateOne(
            { _id: new ObjectId(id) },
            { $inc: { clicks: 1 } }
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error tracking click:', error);
        res.status(500).json({ success: false });
    }
});

// Track ad view
router.post('/ads/:id/view', async (req, res) => {
    try {
        const db = req.app.locals.db;
        const { id } = req.params;
        
        await db.collection('ads').updateOne(
            { _id: new ObjectId(id) },
            { $inc: { views: 1 } }
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error tracking view:', error);
        res.status(500).json({ success: false });
    }
});

// ============================================
// ADMIN ADS MANAGEMENT API
// ============================================

// Get all ads (admin)
router.get('/admin/ads', auth, async (req, res) => {
    try {
        const db = req.app.locals.db;
        const { status, page = 1, limit = 20 } = req.query;
        
        let query = {};
        if (status && status !== 'all') {
            query.status = status;
        }
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const ads = await db.collection('ads')
            .find(query)
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .toArray();
        
        const total = await db.collection('ads').countDocuments(query);
        
        res.json({
            success: true,
            ads,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Error fetching ads:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Approve ad (admin)
router.post('/admin/ads/:id/approve', auth, async (req, res) => {
    try {
        const db = req.app.locals.db;
        const { id } = req.params;
        
        const ad = await db.collection('ads').findOne({ _id: new ObjectId(id) });
        if (!ad) {
            return res.status(404).json({ success: false, message: 'Ad not found' });
        }
        
        await db.collection('ads').updateOne(
            { _id: new ObjectId(id) },
            { 
                $set: { 
                    status: 'approved',
                    updated_at: new Date()
                }
            }
        );
        
        // Notify business
        if (ad.business_id) {
            await db.collection('business_notifications').insertOne({
                business_id: ad.business_id,
                title: 'Ad Approved',
                message: `Your ad "${ad.title}" has been approved and is now live.`,
                type: 'success',
                created_at: new Date(),
                read: false
            });
        }
        
        res.json({ success: true, message: 'Ad approved' });
    } catch (error) {
        console.error('Error approving ad:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Reject ad (admin)
router.post('/admin/ads/:id/reject', auth, async (req, res) => {
    try {
        const db = req.app.locals.db;
        const { id } = req.params;
        const { reason } = req.body;
        
        const ad = await db.collection('ads').findOne({ _id: new ObjectId(id) });
        if (!ad) {
            return res.status(404).json({ success: false, message: 'Ad not found' });
        }
        
        await db.collection('ads').updateOne(
            { _id: new ObjectId(id) },
            { 
                $set: { 
                    status: 'rejected',
                    rejection_reason: reason || 'Does not meet our guidelines',
                    updated_at: new Date()
                }
            }
        );
        
        // Notify business
        if (ad.business_id) {
            await db.collection('business_notifications').insertOne({
                business_id: ad.business_id,
                title: 'Ad Rejected',
                message: `Your ad "${ad.title}" was rejected. Reason: ${reason || 'Does not meet our guidelines'}. Please revise and resubmit.`,
                type: 'error',
                created_at: new Date(),
                read: false
            });
        }
        
        res.json({ success: true, message: 'Ad rejected' });
    } catch (error) {
        console.error('Error rejecting ad:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create ad directly (admin)
router.post('/admin/ads', auth, async (req, res) => {
    try {
        const db = req.app.locals.db;
        const { title, description, image_url, link_url, type, placement, start_date, end_date, display_order } = req.body;
        
        if (!title || !image_url) {
            return res.status(400).json({ success: false, message: 'Title and image are required' });
        }
        
        const adData = {
            title,
            description: description || '',
            image_url,
            link_url: link_url || '',
            type: type || 'sidebar',
            placement: placement || 'sidebar',
            status: 'approved',
            business_id: null,
            business_name: 'Admin',
            start_date: start_date ? new Date(start_date) : new Date(),
            end_date: end_date ? new Date(end_date) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            display_order: parseInt(display_order) || 0,
            views: 0,
            clicks: 0,
            created_at: new Date(),
            updated_at: new Date()
        };
        
        const result = await db.collection('ads').insertOne(adData);
        
        res.json({ success: true, ad: { _id: result.insertedId, ...adData } });
    } catch (error) {
        console.error('Error creating ad:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update ad (admin)
router.put('/admin/ads/:id', auth, async (req, res) => {
    try {
        const db = req.app.locals.db;
        const { id } = req.params;
        const updates = req.body;
        
        delete updates._id;
        delete updates.created_at;
        
        const updateData = {
            ...updates,
            updated_at: new Date()
        };
        
        await db.collection('ads').updateOne(
            { _id: new ObjectId(id) },
            { $set: updateData }
        );
        
        res.json({ success: true, message: 'Ad updated' });
    } catch (error) {
        console.error('Error updating ad:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete ad (admin)
router.delete('/admin/ads/:id', auth, async (req, res) => {
    try {
        const db = req.app.locals.db;
        const { id } = req.params;
        
        await db.collection('ads').deleteOne({ _id: new ObjectId(id) });
        
        res.json({ success: true, message: 'Ad deleted' });
    } catch (error) {
        console.error('Error deleting ad:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
