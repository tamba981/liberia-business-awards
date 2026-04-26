const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const multer = require('multer');

// ============================================
// STORY CATEGORY COUNTS - WORKING ENDPOINTS
// ============================================

// GET all categories with story counts
router.get('/categories', async (req, res) => {
    try {
        const db = req.app.locals.db;
        
        // Get all categories
        const categories = await db.collection('spotlight_categories')
            .find({})
            .sort({ display_order: 1 })
            .toArray();
        
        // Get story counts per category
        const storyCounts = await db.collection('spotlight_stories')
            .aggregate([
                { $group: { _id: '$category_id', count: { $sum: 1 } } }
            ]).toArray();
        
        // Create count map
        const countMap = {};
        storyCounts.forEach(sc => { countMap[sc._id] = sc.count; });
        
        // Add counts to categories
        const categoriesWithCounts = categories.map(cat => ({
            ...cat,
            story_count: countMap[cat._id] || 0
        }));
        
        res.json({
            success: true,
            categories: categoriesWithCounts,
            total_stories: await db.collection('spotlight_stories').countDocuments({ status: 'published' })
        });
    } catch (error) {
        console.error('Error fetching categories:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET stories with FULL category object (FIXED)
router.get('/stories', async (req, res) => {
    try {
        const db = req.app.locals.db;
        const { page = 1, limit = 9, category = null } = req.query;
        
        let query = { status: 'published' };
        if (category && category !== 'all') {
            query.category_id = category;
        }
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const stories = await db.collection('spotlight_stories')
            .find(query)
            .sort({ published_at: -1, created_at: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .toArray();
        
        // Get all categories for reference
        const categories = await db.collection('spotlight_categories')
            .find({})
            .toArray();
        
        const categoryMap = {};
        categories.forEach(cat => { categoryMap[cat._id.toString()] = cat; });
        
        // ENHANCE EACH STORY WITH FULL CATEGORY OBJECT
        const enhancedStories = stories.map(story => ({
            ...story,
            category_id: categoryMap[story.category_id] || { 
                name: 'General', 
                color: '#FF0000',
                icon: 'fa-tag'
            }
        }));
        
        const total = await db.collection('spotlight_stories').countDocuments(query);
        
        res.json({
            success: true,
            stories: enhancedStories,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Error fetching stories:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET single story by slug with full category
router.get('/stories/:slug', async (req, res) => {
    try {
        const db = req.app.locals.db;
        const { slug } = req.params;
        
        const story = await db.collection('spotlight_stories').findOne({ slug });
        
        if (!story) {
            return res.status(404).json({ success: false, message: 'Story not found' });
        }
        
        // Get category
        const category = await db.collection('spotlight_categories').findOne({ _id: story.category_id });
        
        // Increment view count
        await db.collection('spotlight_stories').updateOne(
            { _id: story._id },
            { $inc: { views: 1 } }
        );
        
        res.json({
            success: true,
            story: {
                ...story,
                category_id: category || { name: 'General', color: '#FF0000' }
            }
        });
    } catch (error) {
        console.error('Error fetching story:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ADMIN ENDPOINTS (with counts update)
// ============================================

// CREATE category
router.post('/admin/spotlight/categories', auth, async (req, res) => {
    try {
        const db = req.app.locals.db;
        const { name, slug, description, icon, color, display_order } = req.body;
        
        if (!name || !slug) {
            return res.status(400).json({ success: false, message: 'Name and slug required' });
        }
        
        const existing = await db.collection('spotlight_categories').findOne({ slug });
        if (existing) {
            return res.status(400).json({ success: false, message: 'Category with this slug already exists' });
        }
        
        const categoryId = new require('mongodb').ObjectId();
        
        await db.collection('spotlight_categories').insertOne({
            _id: categoryId,
            name,
            slug,
            description: description || '',
            icon: icon || 'fa-tag',
            color: color || '#FF0000',
            display_order: parseInt(display_order) || 1,
            created_at: new Date(),
            updated_at: new Date()
        });
        
        res.json({ success: true, category: { _id: categoryId, name, slug } });
    } catch (error) {
        console.error('Error creating category:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// CREATE story
router.post('/admin/spotlight/stories', auth, async (req, res) => {
    try {
        const db = req.app.locals.db;
        const { title, slug, category_id, status, business_name, business_owner, 
                author_name, author_bio, excerpt, content, featured_image, 
                is_featured, is_breaking, is_interview, published_at } = req.body;
        
        if (!title || !business_name || !category_id) {
            return res.status(400).json({ success: false, message: 'Title, business name, and category required' });
        }
        
        const storyData = {
            title,
            slug: slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
            category_id,
            status: status || 'draft',
            business_name,
            business_owner: business_owner || '',
            author_name: author_name || 'LBA Team',
            author_bio: author_bio || '',
            excerpt: excerpt || content.substring(0, 160),
            content,
            featured_image: featured_image || '',
            is_featured: is_featured || false,
            is_breaking: is_breaking || false,
            is_interview: is_interview || false,
            published_at: published_at ? new Date(published_at) : (status === 'published' ? new Date() : null),
            created_at: new Date(),
            updated_at: new Date(),
            views: 0
        };
        
        const result = await db.collection('spotlight_stories').insertOne(storyData);
        
        res.json({ success: true, story: { _id: result.insertedId, ...storyData } });
    } catch (error) {
        console.error('Error creating story:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
