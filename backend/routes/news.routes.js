// ============================================
// NEWS API ROUTES
// ============================================
module.exports = (NewsArticle, NewsCategory, NewsComment) => {
    const express = require('express');
    const router = express.Router();

    // GET articles with pagination
    router.get('/news/articles', async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const skip = (page - 1) * limit;
            
            const [articles, total] = await Promise.all([
                NewsArticle.find({ status: 'published' })
                    .populate('category_id', 'name slug color')
                    .sort('-published_at')
                    .skip(skip)
                    .limit(limit)
                    .select('-content -gallery_images'),
                NewsArticle.countDocuments({ status: 'published' })
            ]);
            
            res.json({
                success: true,
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
                articles: articles.map(a => ({
                    id: a._id,
                    title: a.title,
                    slug: a.slug,
                    excerpt: a.excerpt || a.content.substring(0, 200) + '...',
                    featured_image: a.featured_image,
                    author_name: a.author_name,
                    business_name: a.business_name,
                    published_at: a.published_at,
                    category: a.category_id,
                    view_count: a.view_count,
                    is_featured: a.is_featured,
                    is_breaking: a.is_breaking
                }))
            });
        } catch (error) {
            console.error('Articles fetch error:', error);
            res.status(500).json({ success: false, error: 'Server error' });
        }
    });

    // GET single article by slug
    router.get('/news/article/:slug', async (req, res) => {
        try {
            const { slug } = req.params;
            
            const article = await NewsArticle.findOne({ slug, status: 'published' })
                .populate('category_id', 'name slug color description');
            
            if (!article) {
                return res.status(404).json({ success: false, error: 'Article not found' });
            }
            
            article.view_count += 1;
            await article.save();
            
            const comments = await NewsComment.find({ 
                article_id: article._id, 
                is_approved: true 
            }).sort('-created_at');
            
            res.json({
                success: true,
                article: {
                    ...article.toObject(),
                    comments,
                    comment_count: comments.length
                }
            });
        } catch (error) {
            console.error('Article fetch error:', error);
            res.status(500).json({ success: false, error: 'Server error' });
        }
    });

    // GET featured articles
    router.get('/news/featured', async (req, res) => {
        try {
            const limit = parseInt(req.query.limit) || 5;
            
            const articles = await NewsArticle.find({ 
                status: 'published',
                $or: [
                    { is_featured: true },
                    { is_breaking: true }
                ]
            })
            .populate('category_id', 'name slug color')
            .sort('-is_breaking -published_at')
            .limit(limit)
            .select('-content -gallery_images');
            
            res.json({
                success: true,
                articles
            });
        } catch (error) {
            console.error('Featured fetch error:', error);
            res.status(500).json({ success: false, error: 'Server error' });
        }
    });

    // GET categories
    router.get('/news/categories', async (req, res) => {
        try {
            const categories = await NewsCategory.aggregate([
                { $match: { is_active: true } },
                {
                    $lookup: {
                        from: 'newsarticles',
                        localField: '_id',
                        foreignField: 'category_id',
                        as: 'articles'
                    }
                },
                {
                    $addFields: {
                        article_count: {
                            $size: {
                                $filter: {
                                    input: '$articles',
                                    as: 'article',
                                    cond: { $eq: ['$$article.status', 'published'] }
                                }
                            }
                        }
                    }
                },
                { $sort: { display_order: 1 } },
                { $project: { articles: 0 } }
            ]);
            
            res.json({
                success: true,
                categories
            });
        } catch (error) {
            console.error('Categories fetch error:', error);
            res.status(500).json({ success: false, error: 'Server error' });
        }
    });

    // GET articles by category
    router.get('/news/category/:slug', async (req, res) => {
        try {
            const { slug } = req.params;
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const skip = (page - 1) * limit;
            
            const category = await NewsCategory.findOne({ slug, is_active: true });
            if (!category) {
                return res.status(404).json({ success: false, error: 'Category not found' });
            }
            
            const [articles, total] = await Promise.all([
                NewsArticle.find({ 
                    category_id: category._id,
                    status: 'published'
                })
                .populate('category_id', 'name slug color')
                .sort('-published_at')
                .skip(skip)
                .limit(limit)
                .select('-content -gallery_images'),
                NewsArticle.countDocuments({ 
                    category_id: category._id,
                    status: 'published'
                })
            ]);
            
            res.json({
                success: true,
                category: {
                    id: category._id,
                    name: category.name,
                    slug: category.slug,
                    description: category.description
                },
                page,
                limit,
                total,
                pages: Math.ceil(total / limit),
                articles
            });
        } catch (error) {
            console.error('Category articles error:', error);
            res.status(500).json({ success: false, error: 'Server error' });
        }
    });

    // POST comment
    router.post('/news/comment', async (req, res) => {
        try {
            const { article_id, author_name, author_email, content } = req.body;
            
            if (!article_id || !author_name || !content) {
                return res.status(400).json({ success: false, error: 'Missing required fields' });
            }
            
            const comment = new NewsComment({
                article_id,
                author_name,
                author_email,
                content,
                ip_address: req.ip,
                user_agent: req.headers['user-agent']
            });
            
            await comment.save();
            
            res.json({
                success: true,
                message: 'Comment submitted for approval',
                comment_id: comment._id
            });
        } catch (error) {
            console.error('Comment error:', error);
            res.status(500).json({ success: false, error: 'Server error' });
        }
    });

    // GET search
    router.get('/news/search', async (req, res) => {
        try {
            const { q } = req.query;
            
            if (!q || q.length < 3) {
                return res.status(400).json({ success: false, error: 'Search query too short' });
            }
            
            const articles = await NewsArticle.find(
                { 
                    $text: { $search: q },
                    status: 'published'
                },
                { score: { $meta: 'textScore' } }
            )
            .populate('category_id', 'name slug')
            .sort({ score: { $meta: 'textScore' } })
            .limit(20)
            .select('-content -gallery_images');
            
            res.json({
                success: true,
                query: q,
                count: articles.length,
                articles
            });
        } catch (error) {
            console.error('Search error:', error);
            res.status(500).json({ success: false, error: 'Server error' });
        }
    });

    return router;
};
