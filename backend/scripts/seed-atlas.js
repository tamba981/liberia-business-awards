const { MongoClient, ServerApiVersion } = require('mongodb');

// EXACT connection string from Atlas with password replaced
const uri = "mongodb+srv://liberia-admin:%40Motiva6060@cluster0.9outgyt.mongodb.net/liberia-business-awards?retryWrites=true&w=majority&appName=Cluster0";

// Create a MongoClient with the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function seedAtlas() {
  try {
    // Connect to MongoDB
    await client.connect();
    console.log("✅ Connected to MongoDB Atlas!");
    
    // Send a ping to confirm connection
    await client.db("admin").command({ ping: 1 });
    console.log("✅ Pinged your deployment. Connection is working!");
    
    const db = client.db("liberia-business-awards");
    
    // Clear existing data
    await db.collection("newscategories").deleteMany({});
    await db.collection("newsarticles").deleteMany({});
    console.log("🗑️ Cleared existing data");
    
    // Create categories
    const categories = [
      {
        name: "Startup Spotlight",
        slug: "startup-spotlight",
        description: "Featured stories of emerging Liberian startups",
        icon: "fa-rocket",
        color: "#FF0000",
        display_order: 1,
        is_active: true
      },
      {
        name: "SME Success",
        slug: "sme-success",
        description: "Small and medium enterprises making an impact",
        icon: "fa-building",
        color: "#87CEEB",
        display_order: 2,
        is_active: true
      },
      {
        name: "Women Entrepreneurs",
        slug: "women-entrepreneurs",
        description: "Celebrating Liberian women in business",
        icon: "fa-female",
        color: "#F59E0B",
        display_order: 3,
        is_active: true
      },
      {
        name: "Business Interviews",
        slug: "business-interviews",
        description: "In-depth conversations with business leaders",
        icon: "fa-microphone",
        color: "#8B5CF6",
        display_order: 4,
        is_active: true
      }
    ];
    
    const catResult = await db.collection("newscategories").insertMany(categories);
    console.log(`✅ Created ${catResult.insertedCount} categories`);
    
    // Get category IDs
    const insertedCats = await db.collection("newscategories").find().toArray();
    const catMap = {};
    insertedCats.forEach(cat => {
      catMap[cat.name] = cat._id;
    });
    
    // Create articles
    const now = new Date();
    const articles = [
      {
        category_id: catMap["Startup Spotlight"],
        title: "How J-Palm Liberia is Transforming Agriculture",
        slug: "jpalm-liberia-transforming-agriculture",
        excerpt: "From small beginnings to international recognition, discover how J-Palm Liberia is revolutionizing sustainable palm oil production.",
        content: "Full article content here...",
        author_name: "Darlington F. Tamba",
        business_name: "J-Palm Liberia",
        business_owner: "Mahmud Johnson",
        featured_image: "/images/featured/jpalm.jpg",
        status: "published",
        published_at: now,
        view_count: 1245,
        is_featured: true,
        is_breaking: true,
        is_interview: true
      },
      {
        category_id: catMap["SME Success"],
        title: "Annita: Building Africa's Digital Heartbeat",
        slug: "annita-building-africa-digital-heartbeat",
        excerpt: "Liberia's first startup showcased at IATF 2025 - a platform integrating e-commerce, fintech, and AI.",
        content: "Full article content here...",
        author_name: "Christopher O. Fallah",
        business_name: "Annita",
        business_owner: "Christopher O. Fallah",
        featured_image: "/images/featured/annita.jpg",
        status: "published",
        published_at: new Date(now - 2*24*60*60*1000),
        view_count: 892,
        is_featured: true,
        is_interview: true
      },
      {
        category_id: catMap["Women Entrepreneurs"],
        title: "Liberian Girls Lunchbox: Empowering Through Food",
        slug: "liberian-girls-lunchbox-empowering",
        excerpt: "Social enterprise providing nutritious meals while training young women in culinary arts.",
        content: "Full article content here...",
        author_name: "Shermanlyn Quaye",
        business_name: "Liberian Girls Lunchbox",
        business_owner: "Christollie Ade Suah",
        featured_image: "/images/featured/lunchbox.jpg",
        status: "published",
        published_at: new Date(now - 5*24*60*60*1000),
        view_count: 567,
        is_featured: true
      },
      {
        category_id: catMap["Business Interviews"],
        title: "Gonet Academy: Empowering Minds, Transforming Futures",
        slug: "gonet-academy-empowering-minds",
        excerpt: "Professional development academy that has certified 500+ professionals across 12 cohorts.",
        content: "Full article content here...",
        author_name: "Stephen V. Shilue",
        business_name: "Gonet Academy",
        business_owner: "Mohammed Kerkulah",
        featured_image: "/images/featured/gonet.jpg",
        status: "published",
        published_at: new Date(now - 7*24*60*60*1000),
        view_count: 2341,
        is_featured: true,
        is_breaking: true
      }
    ];
    
    const artResult = await db.collection("newsarticles").insertMany(articles);
    console.log(`✅ Created ${artResult.insertedCount} articles`);
    
    // Verify
    const catCount = await db.collection("newscategories").countDocuments();
    const artCount = await db.collection("newsarticles").countDocuments();
    console.log(`📊 Final counts: ${catCount} categories, ${artCount} articles`);
    console.log("🎉 Seeding complete!");
    
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await client.close();
    console.log("👋 Disconnected");
  }
}

seedAtlas();
