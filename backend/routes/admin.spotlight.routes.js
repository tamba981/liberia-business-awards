const express = require('express');
const router = express.Router();
const NewsArticle = require('../models/NewsArticle');
const NewsCategory = require('../models/NewsCategory');

// Authentication middleware (use your existing one)
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/authorize');

// ============ CATEGORY MANAGEMENT ============

// Get all categories
router.get('/admin/categories', authenticate, authorize('admin'), async (req, res) => {
    try {
        const categories = await NewsCategory.find().sort('display_order');
        res.json({ success: true, categories });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create category
router.post('/admin/categories', authenticate, authorize('admin'), async (req, res) => {
    try {
        const category = new NewsCategory(req.body);
        await category.save();
        res.json({ success: true, category });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update category
router.put('/admin/categories/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const category = await NewsCategory.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );
        res.json({ success: true, category });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete category
router.delete('/admin/categories/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        await NewsCategory.findByIdAndDelete(req.params.id);
        // Set category_id to null for articles in this category
        await NewsArticle.updateMany(
            { category_id: req.params.id },
            { $unset: { category_id: 1 } }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ ARTICLE MANAGEMENT ============

// Get all articles (admin view)
router.get('/admin/articles', authenticate, authorize('admin'), async (req, res) => {
    try {
        const articles = await NewsArticle.find()
            .populate('category_id')
            .sort('-created_at');
        res.json({ success: true, articles });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create article
router.post('/admin/articles', authenticate, authorize('admin'), async (req, res) => {
    try {
        const article = new NewsArticle({
            ...req.body,
            published_at: req.body.status === 'published' ? new Date() : null
        });
        await article.save();
        res.json({ success: true, article });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update article
router.put('/admin/articles/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const article = await NewsArticle.findByIdAndUpdate(
            req.params.id,
            {
                ...req.body,
                published_at: req.body.status === 'published' ? new Date() : null
            },
            { new: true }
        );
        res.json({ success: true, article });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete article
router.delete('/admin/articles/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        await NewsArticle.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
