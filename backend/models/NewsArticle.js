const mongoose = require('mongoose');

const newsArticleSchema = new mongoose.Schema({
    category_id: { type: mongoose.Schema.Types.ObjectId, ref: 'NewsCategory', required: true },
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    excerpt: String,
    content: { type: String, required: true },
    
    // Author
    author_name: { type: String, required: true },
    author_bio: String,
    author_image: String,
    
    // Business Featured
    business_name: { type: String, required: true },
    business_owner: String,
    business_logo: String,
    business_website: String,
    business_email: String,
    business_phone: String,
    
    // Media
    featured_image: { type: String, required: true },
    gallery_images: [String],
    video_url: String,
    
    // Metadata
    meta_title: String,
    meta_description: String,
    meta_keywords: String,
    
    // Publishing
    status: { 
        type: String, 
        enum: ['draft', 'pending', 'published', 'featured', 'archived'],
        default: 'draft'
    },
    published_at: Date,
    view_count: { type: Number, default: 0 },
    share_count: { type: Number, default: 0 },
    
    // Flags
    is_featured: { type: Boolean, default: false },
    is_breaking: { type: Boolean, default: false },
    is_interview: { type: Boolean, default: false },
    is_sponsored: { type: Boolean, default: false },
    
    // SEO
    canonical_url: String,
    robots_meta: { type: String, default: 'index, follow' }
}, { timestamps: true });

// Text search index
newsArticleSchema.index({ 
    title: 'text', 
    content: 'text', 
    business_name: 'text' 
});

newsArticleSchema.index({ status: 1, published_at: -1 });
newsArticleSchema.index({ slug: 1 });

module.exports = mongoose.model('NewsArticle', newsArticleSchema);