// SIMPLE SEED SCRIPT - No complex dependencies
const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://your-connection-string';

async function seedSimple() {
    console.log('🔌 Connecting to MongoDB...');
    
    const client = new MongoClient(MONGODB_URI);
    
    try {
        await client.connect();
        console.log('✅ Connected to MongoDB');
        
        const db = client.db(); // Uses default database from connection string
        
        // Clear existing data
        await db.collection('newscategories').deleteMany({});
        await db.collection('newsarticles').deleteMany({});
        console.log('🗑️ Cleared existing data');
        
        // Create categories
        const categories = [
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
        ];
        
        const categoryResult = await db.collection('newscategories').insertMany(categories);
        console.log(`✅ Created ${categoryResult.insertedCount} categories`);
        
        // Get the inserted category IDs
        const insertedCategories = await db.collection('newscategories').find().toArray();
        const categoryMap = {};
        insertedCategories.forEach(cat => {
            categoryMap[cat.name] = cat._id;
        });
        
        // Create articles
        const now = new Date();
        const articles = [
            {
                category_id: categoryMap['Startup Spotlight'],
                title: 'How J-Palm Liberia is Transforming Agriculture',
                slug: 'jpalm-liberia-transforming-agriculture',
                excerpt: 'From small beginnings to international recognition, discover how J-Palm Liberia is revolutionizing sustainable palm oil production.',
                content: 'Full article content here...',
                author_name: 'Darlington F. Tamba',
                business_name: 'J-Palm Liberia',
                business_owner: 'Mahmud Johnson',
                featured_image: 'https://liberiabusinessawardslr.com/images/featured/jpalm.jpg',
                status: 'published',
                published_at: now,
                view_count: 1245,
                is_featured: true,
                is_breaking: true,
                is_interview: true
            },
            {
                category_id: categoryMap['SME Success'],
                title: 'Annita: Building Africa\'s Digital Heartbeat',
                slug: 'annita-building-africa-digital-heartbeat',
                excerpt: 'Liberia\'s first startup showcased at IATF 2025 - a platform integrating e-commerce, fintech, and AI.',
                content: 'Full article content here...',
                author_name: 'Christopher O. Fallah',
                business_name: 'Annita',
                business_owner: 'Christopher O. Fallah',
                featured_image: 'https://liberiabusinessawardslr.com/images/featured/annita.jpg',
                status: 'published',
                published_at: new Date(now - 2*24*60*60*1000),
                view_count: 892,
                is_featured: true,
                is_interview: true
            },
            {
                category_id: categoryMap['Women Entrepreneurs'],
                title: 'Liberian Girls Lunchbox: Empowering Through Food',
                slug: 'liberian-girls-lunchbox-empowering',
                excerpt: 'Social enterprise providing nutritious meals while training young women in culinary arts.',
                content: 'Full article content here...',
                author_name: 'Shermanlyn Quaye',
                business_name: 'Liberian Girls Lunchbox',
                business_owner: 'Christollie Ade Suah',
                featured_image: 'https://liberiabusinessawardslr.com/images/featured/lunchbox.jpg',
                status: 'published',
                published_at: new Date(now - 5*24*60*60*1000),
                view_count: 567,
                is_featured: true
            },
            {
                category_id: categoryMap['Business Interviews'],
                title: 'Gonet Academy: Empowering Minds, Transforming Futures',
                slug: 'gonet-academy-empowering-minds',
                excerpt: 'Professional development academy that has certified 500+ professionals across 12 cohorts.',
                content: 'Full article content here...',
                author_name: 'Stephen V. Shilue',
                business_name: 'Gonet Academy',
                business_owner: 'Mohammed Kerkulah',
                featured_image: 'https://liberiabusinessawardslr.com/images/featured/gonet.jpg',
                status: 'published',
                published_at: new Date(now - 7*24*60*60*1000),
                view_count: 2341,
                is_featured: true,
                is_breaking: true
            }
        ];
        
        const articleResult = await db.collection('newsarticles').insertMany(articles);
        console.log(`✅ Created ${articleResult.insertedCount} articles`);
        
        // Verify
        const catCount = await db.collection('newscategories').countDocuments();
        const artCount = await db.collection('newsarticles').countDocuments();
        console.log(`📊 Final counts: ${catCount} categories, ${artCount} articles`);
        
    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await client.close();
        console.log('👋 Disconnected');
    }
}

// Get MongoDB URI from .env or prompt
const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
});

readline.question('Enter your MongoDB connection string: ', async (uri) => {
    if (uri) {
        process.env.MONGODB_URI = uri;
    }
    await seedSimple();
    readline.close();
});