// Run this script once to populate sample data
const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI;

// Define schemas (copy from your models)
const newsCategorySchema = new mongoose.Schema({
    name: String,
    slug: String,
    description: String,
    icon: String,
    color: String,
    display_order: Number,
    is_active: Boolean
});

const newsArticleSchema = new mongoose.Schema({
    category_id: { type: mongoose.Schema.Types.ObjectId, ref: 'NewsCategory' },
    title: String,
    slug: String,
    excerpt: String,
    content: String,
    author_name: String,
    author_bio: String,
    business_name: String,
    business_owner: String,
    featured_image: String,
    status: String,
    published_at: Date,
    view_count: Number,
    is_featured: Boolean,
    is_breaking: Boolean,
    is_interview: Boolean
});

const NewsCategory = mongoose.model('NewsCategory', newsCategorySchema);
const NewsArticle = mongoose.model('NewsArticle', newsArticleSchema);

async function seedSpotlight() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Create categories
        const categories = await NewsCategory.insertMany([
            {
                name: 'Startup Spotlight',
                slug: 'startup-spotlight',
                description: 'Featured stories of emerging Liberian startups',
                icon: 'fa-rocket',
                color: '#FF0000',
                display_order: 1,
                is_active: true
            },
            {
                name: 'SME Success',
                slug: 'sme-success',
                description: 'Small and medium enterprises making an impact',
                icon: 'fa-building',
                color: '#87CEEB',
                display_order: 2,
                is_active: true
            },
            {
                name: 'Women Entrepreneurs',
                slug: 'women-entrepreneurs',
                description: 'Celebrating Liberian women in business',
                icon: 'fa-female',
                color: '#F59E0B',
                display_order: 3,
                is_active: true
            },
            {
                name: 'Business Interviews',
                slug: 'business-interviews',
                description: 'In-depth conversations with business leaders',
                icon: 'fa-microphone',
                color: '#8B5CF6',
                display_order: 4,
                is_active: true
            }
        ]);

        console.log('✅ Created categories');

        // Create sample articles
        const now = new Date();
        const articles = await NewsArticle.insertMany([
            {
                category_id: categories[0]._id,
                title: 'How J-Palm Liberia is Transforming Agriculture',
                slug: 'jpalm-liberia-transforming-agriculture',
                excerpt: 'From small beginnings to international recognition, discover how J-Palm Liberia is revolutionizing sustainable palm oil production.',
                content: 'Full article content here...',
                author_name: 'Darlington F. Tamba',
                business_name: 'J-Palm Liberia',
                business_owner: 'Mahmud Johnson',
                featured_image: '/images/featured/jpalm.jpg',
                status: 'published',
                published_at: now,
                view_count: 1245,
                is_featured: true,
                is_breaking: true,
                is_interview: true
            },
            {
                category_id: categories[1]._id,
                title: 'Annita: Building Africa\'s Digital Heartbeat',
                slug: 'annita-building-africa-digital-heartbeat',
                excerpt: 'Liberia\'s first startup showcased at IATF 2025 - a platform integrating e-commerce, fintech, and AI.',
                content: 'Full article content here...',
                author_name: 'Christopher O. Fallah',
                business_name: 'Annita',
                business_owner: 'Christopher O. Fallah',
                featured_image: '/images/featured/annita.jpg',
                status: 'published',
                published_at: new Date(now - 2*24*60*60*1000),
                view_count: 892,
                is_featured: true,
                is_interview: true
            },
            {
                category_id: categories[2]._id,
                title: 'Liberian Girls Lunchbox: Empowering Through Food',
                slug: 'liberian-girls-lunchbox-empowering',
                excerpt: 'Social enterprise providing nutritious meals while training young women in culinary arts.',
                content: 'Full article content here...',
                author_name: 'Shermanlyn Quaye',
                business_name: 'Liberian Girls Lunchbox',
                business_owner: 'Christollie Ade Suah',
                featured_image: '/images/featured/lunchbox.jpg',
                status: 'published',
                published_at: new Date(now - 5*24*60*60*1000),
                view_count: 567,
                is_featured: true
            },
            {
                category_id: categories[3]._id,
                title: 'Gonet Academy: Empowering Minds, Transforming Futures',
                slug: 'gonet-academy-empowering-minds',
                excerpt: 'Professional development academy that has certified 500+ professionals across 12 cohorts.',
                content: 'Full article content here...',
                author_name: 'Stephen V. Shilue',
                business_name: 'Gonet Academy',
                business_owner: 'Mohammed Kerkulah',
                featured_image: '/images/featured/gonet.jpg',
                status: 'published',
                published_at: new Date(now - 7*24*60*60*1000),
                view_count: 2341,
                is_featured: true,
                is_breaking: true
            }
        ]);

        console.log('✅ Created', articles.length, 'sample articles');
        console.log('🎉 Seeding complete!');

    } catch (error) {
        console.error('❌ Seeding error:', error);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
}

seedSpotlight();