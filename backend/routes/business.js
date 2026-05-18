// ============================================
// DIRECTORY API ENDPOINTS (ADD TO BACKEND)
// ============================================

// GET all directory businesses
router.get('/directory/businesses', async (req, res) => {
    try {
        const { category, status, limit = 100 } = req.query;
        let query = { is_active: true };
        
        if (category && category !== 'all') {
            query.category = category;
        }
        if (status) {
            query.status = status;
        }
        
        const businesses = await DirectoryBusiness.find(query)
            .sort({ display_order: 1, created_at: -1 })
            .limit(parseInt(limit));
        
        res.json({ success: true, businesses });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET single directory business
router.get('/directory/businesses/:id', async (req, res) => {
    try {
        const business = await DirectoryBusiness.findById(req.params.id);
        if (!business) {
            return res.status(404).json({ success: false, error: 'Business not found' });
        }
        res.json({ success: true, business });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// CREATE directory business (Admin only)
router.post('/admin/directory/businesses', authenticateToken, isAdmin, async (req, res) => {
    try {
        const business = new DirectoryBusiness(req.body);
        await business.save();
        res.json({ success: true, business });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// UPDATE directory business (Admin only)
router.put('/admin/directory/businesses/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        const business = await DirectoryBusiness.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );
        res.json({ success: true, business });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE directory business (Admin only)
router.delete('/admin/directory/businesses/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        await DirectoryBusiness.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// BULK IMPORT (to migrate existing businesses)
router.post('/admin/directory/businesses/import', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { businesses } = req.body;
        const imported = await DirectoryBusiness.insertMany(businesses);
        res.json({ success: true, count: imported.length });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get statistics
router.get('/admin/directory/stats', authenticateToken, isAdmin, async (req, res) => {
    try {
        const total = await DirectoryBusiness.countDocuments();
        const byCategory = await DirectoryBusiness.aggregate([
            { $group: { _id: '$category', count: { $sum: 1 } } }
        ]);
        res.json({ success: true, total, byCategory });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});
