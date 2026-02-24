// ============================================
// LIBERIA BUSINESS AWARDS - PRODUCTION SYSTEM
// WITH ADS & BUSINESS SPOTLIGHT INTEGRATION
// ============================================
console.log('🚀 Liberia Business Awards - Production System Starting...');

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const cors = require('cors');
const crypto = require('crypto');
const admin = require('firebase-admin');
const session = require('express-session');
const cookieParser = require('cookie-parser');

const app = express();
const PORT = process.env.PORT || 10000;

// ============ FIREBASE INITIALIZATION ============
let firebaseApp;
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
    firebaseApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET
    });
    console.log('✅ Firebase Admin initialized');
} catch (error) {
    console.warn('⚠️ Firebase Admin initialization failed:', error.message);
}

// ============ ENVIRONMENT VARIABLES ============
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@liberiabusinessawardslr.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123!';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const GOOGLE_SHEETS_API = 'https://script.google.com/macros/s/AKfycbwHzw3mG57vNFI6HxxhjsUMH5tt07emTZcn65Y06CClnzwd5wCcvWJubri31miz47VY/exec';
const UPLOAD_DIR = path.join(__dirname, 'uploads');

// ============ SECURITY CONFIGURATION ============
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

// Global rate limiting
app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: 'Too many requests from this IP, please try again later.'
}));

// ============ MIDDLEWARE ============
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

// Session configuration for ad tracking
app.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax'
    }
}));

// CORS Configuration
const corsOptions = {
    origin: function (origin, callback) {
        const allowedOrigins = [
            'https://liberiabusinessawardslr.com',
            'http://localhost:5500',
            'http://localhost:3000',
            'http://127.0.0.1:5500',
            'http://127.0.0.1:3000',
            'https://liberia-business-awards.netlify.app',
            'https://*.render.com'
        ];
        
        if (!origin || allowedOrigins.some(allowed => origin.includes(allowed))) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// ============ DATABASE CONNECTION ============
async function connectToMongoDB() {
    try {
        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
        console.log('✅ MongoDB Atlas Connected');
        
        await createCollections();
        await createDefaultAdmin();
        
        return true;
    } catch (error) {
        console.error('❌ MongoDB Connection Failed:', error.message);
        return false;
    }
}

// ============ DATABASE SCHEMAS ============

// User Schema
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    company: { type: String, required: true },
    phone: { type: String },
    business_type: { type: String },
    industry: { type: String },
    location: { type: String },
    year_established: { type: Number },
    employee_count: { type: String },
    role: { 
        type: String, 
        enum: ['admin', 'business', 'judge', 'moderator'], 
        default: 'business' 
    },
    status: { 
        type: String, 
        enum: ['pending', 'active', 'suspended', 'verified'], 
        default: 'pending' 
    },
    verified: { type: Boolean, default: false },
    avatar: { type: String },
    bio: { type: String },
    website: { type: String },
    awards_count: { type: Number, default: 0 },
    nominations_count: { type: Number, default: 0 },
    documents_count: { type: Number, default: 0 },
    profile_completion: { type: Number, default: 0 },
    last_login: { type: Date },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { timestamps: true });

// Nomination Schema
const nominationSchema = new mongoose.Schema({
    business_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category: { type: String, required: true },
    subcategory: { type: String },
    year: { type: Number, required: true, default: new Date().getFullYear() },
    title: { type: String, required: true },
    description: { type: String, required: true },
    achievements: [String],
    challenges: [String],
    impact: { type: String },
    documents: [{
        name: String,
        url: String,
        type: String,
        uploaded_at: { type: Date, default: Date.now }
    }],
    status: { 
        type: String, 
        enum: ['draft', 'submitted', 'under_review', 'shortlisted', 'approved', 'rejected', 'winner'],
        default: 'draft'
    },
    score: { type: Number, min: 0, max: 100 },
    feedback: { type: String },
    evaluated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    evaluated_at: { type: Date },
    submitted_at: { type: Date },
    approved_at: { type: Date },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

// Announcement Schema
const announcementSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: { type: String, required: true },
    type: { type: String, enum: ['news', 'event', 'deadline', 'winner', 'update'] },
    category: { type: String },
    is_published: { type: Boolean, default: false },
    is_featured: { type: Boolean, default: false },
    publish_date: { type: Date, default: Date.now },
    expiry_date: { type: Date },
    views: { type: Number, default: 0 },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

// ============ NEW ADS & SPOTLIGHT SCHEMAS ============

// Advertiser Schema
const advertiserSchema = new mongoose.Schema({
    business_name: { type: String, required: true },
    contact_name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    phone: String,
    address: String,
    registration_number: String,
    tax_id: String,
    payment_method: { 
        type: String, 
        enum: ['bank_transfer', 'mobile_money', 'card', 'cash'],
        default: 'bank_transfer'
    },
    payment_details: String,
    status: { 
        type: String, 
        enum: ['active', 'inactive', 'suspended'],
        default: 'inactive'
    },
    verified_at: Date,
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { timestamps: true });

// Ad Campaign Schema
const adCampaignSchema = new mongoose.Schema({
    advertiser_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Advertiser', required: true },
    campaign_name: { type: String, required: true },
    campaign_type: { 
        type: String, 
        enum: ['popup', 'banner', 'sidebar', 'hero'],
        required: true 
    },
    image_url: { type: String, required: true },
    mobile_image_url: String,
    alt_text: String,
    target_url: { type: String, required: true },
    start_date: { type: Date, required: true },
    end_date: { type: Date, required: true },
    total_budget: { type: Number, default: 0 },
    daily_budget: Number,
    max_impressions: Number,
    max_clicks: Number,
    current_impressions: { type: Number, default: 0 },
    current_clicks: { type: Number, default: 0 },
    target_audience: String,
    device_types: { type: String, enum: ['all', 'desktop', 'mobile', 'tablet'], default: 'all' },
    status: { 
        type: String, 
        enum: ['draft', 'pending', 'approved', 'rejected', 'active', 'paused', 'expired', 'completed'],
        default: 'draft'
    },
    approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approved_at: Date,
    rejection_reason: String,
    payment_status: { 
        type: String, 
        enum: ['pending', 'paid', 'failed', 'refunded'],
        default: 'pending'
    },
    payment_reference: String,
    paid_at: Date,
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { timestamps: true });

// Ad Impression Schema
const adImpressionSchema = new mongoose.Schema({
    campaign_id: { type: mongoose.Schema.Types.ObjectId, ref: 'AdCampaign', required: true },
    session_id: { type: String, required: true, index: true },
    ip_address: String,
    user_agent: String,
    referrer: String,
    device_type: { type: String, enum: ['desktop', 'mobile', 'tablet'], default: 'desktop' },
    impression_time: { type: Date, default: Date.now }
}, { timestamps: true });

// Ad Click Schema
const adClickSchema = new mongoose.Schema({
    campaign_id: { type: mongoose.Schema.Types.ObjectId, ref: 'AdCampaign', required: true },
    impression_id: { type: mongoose.Schema.Types.ObjectId, ref: 'AdImpression' },
    session_id: { type: String, required: true },
    ip_address: String,
    user_agent: String,
    click_time: { type: Date, default: Date.now },
    converted: { type: Boolean, default: false },
    conversion_value: Number
}, { timestamps: true });

// News Category Schema
const newsCategorySchema = new mongoose.Schema({
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: String,
    icon: String,
    color: String,
    display_order: { type: Number, default: 0 },
    is_active: { type: Boolean, default: true }
}, { timestamps: true });

// News Article Schema
const newsArticleSchema = new mongoose.Schema({
    category_id: { type: mongoose.Schema.Types.ObjectId, ref: 'NewsCategory', required: true },
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    excerpt: String,
    content: { type: String, required: true },
    author_name: { type: String, required: true },
    author_bio: String,
    author_image: String,
    business_name: { type: String, required: true },
    business_owner: String,
    business_logo: String,
    business_website: String,
    business_email: String,
    business_phone: String,
    featured_image: { type: String, required: true },
    gallery_images: [String],
    video_url: String,
    meta_title: String,
    meta_description: String,
    meta_keywords: String,
    status: { 
        type: String, 
        enum: ['draft', 'pending', 'published', 'featured', 'archived'],
        default: 'draft'
    },
    published_at: Date,
    view_count: { type: Number, default: 0 },
    share_count: { type: Number, default: 0 },
    is_featured: { type: Boolean, default: false },
    is_breaking: { type: Boolean, default: false },
    is_interview: { type: Boolean, default: false },
    is_sponsored: { type: Boolean, default: false },
    canonical_url: String,
    robots_meta: { type: String, default: 'index, follow' }
}, { timestamps: true });

// News Comment Schema
const newsCommentSchema = new mongoose.Schema({
    article_id: { type: mongoose.Schema.Types.ObjectId, ref: 'NewsArticle', required: true },
    parent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'NewsComment' },
    author_name: { type: String, required: true },
    author_email: String,
    author_website: String,
    content: { type: String, required: true },
    is_approved: { type: Boolean, default: false },
    ip_address: String,
    user_agent: String
}, { timestamps: true });

// Create Models
const User = mongoose.model('User', userSchema);
const Nomination = mongoose.model('Nomination', nominationSchema);
const Announcement = mongoose.model('Announcement', announcementSchema);
const Advertiser = mongoose.model('Advertiser', advertiserSchema);
const AdCampaign = mongoose.model('AdCampaign', adCampaignSchema);
const AdImpression = mongoose.model('AdImpression', adImpressionSchema);
const AdClick = mongoose.model('AdClick', adClickSchema);
const NewsCategory = mongoose.model('NewsCategory', newsCategorySchema);
const NewsArticle = mongoose.model('NewsArticle', newsArticleSchema);
const NewsComment = mongoose.model('NewsComment', newsCommentSchema);

// ============ UTILITY FUNCTIONS ============
async function createCollections() {
    try {
        const collections = await mongoose.connection.db.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);
        
        const requiredCollections = [
            'users', 'nominations', 'announcements', 
            'advertisers', 'adcampaigns', 'adimpressions', 'adclicks',
            'newscategories', 'newsarticles', 'newscomments'
        ];
        
        for (const collection of requiredCollections) {
            if (!collectionNames.includes(collection)) {
                await mongoose.connection.db.createCollection(collection);
                console.log(`✅ Created ${collection} collection`);
            }
        }
    } catch (error) {
        console.error('Collection creation error:', error);
    }
}

async function createDefaultAdmin() {
    try {
        const adminExists = await User.findOne({ email: ADMIN_EMAIL });
        
        if (!adminExists) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, salt);
            
            const admin = new User({
                email: ADMIN_EMAIL,
                password: hashedPassword,
                name: 'System Administrator',
                company: 'Liberia Business Awards',
                phone: '+231 886 590 302',
                role: 'admin',
                status: 'active',
                verified: true,
                profile_completion: 100
            });
            
            await admin.save();
            console.log('👑 Default admin account created');
        } else {
            console.log('👑 Admin account already exists');
        }
    } catch (error) {
        console.error('Admin creation error:', error);
    }
}

// Authentication Middleware
const authenticate = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '') || 
                     req.query.token ||
                     req.body.token;

        if (!token) {
            return res.status(401).json({ 
                success: false, 
                message: 'Access denied. No token provided.' 
            });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.userId).select('-password');

        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'User not found.' 
            });
        }

        if (user.status !== 'active' && user.status !== 'verified') {
            return res.status(403).json({ 
                success: false, 
                message: `Account is ${user.status}. Please contact administrator.` 
            });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('Auth error:', error.message);
        return res.status(401).json({ 
            success: false, 
            message: 'Invalid or expired token.' 
        });
    }
};

// Role-based Authorization
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ 
                success: false, 
                message: 'Access denied. Insufficient permissions.' 
            });
        }
        next();
    };
};

// Ad tracking utilities
function getSessionId(req) {
    if (req.session && req.session.adSessionId) {
        return req.session.adSessionId;
    }
    
    if (req.cookies && req.cookies.ad_session) {
        return req.cookies.ad_session;
    }
    
    const sessionId = crypto.randomBytes(16).toString('hex');
    
    if (req.session) {
        req.session.adSessionId = sessionId;
    }
    
    res.cookie('ad_session', sessionId, { 
        maxAge: 24 * 60 * 60 * 1000, 
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production'
    });
    
    return sessionId;
}

function getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }
    return req.connection.remoteAddress || req.socket.remoteAddress || '0.0.0.0';
}

// ============ IMPORT ROUTES ============
const adsRoutes = require('./routes/ads.routes')(AdCampaign, AdImpression, AdClick, getSessionId, getClientIp);
const newsRoutes = require('./routes/news.routes')(NewsArticle, NewsCategory, NewsComment);

// ============ API ROUTES ============

// 1. HEALTH CHECK
app.get('/api/health', async (req, res) => {
    const isConnected = mongoose.connection.readyState === 1;
    const userCount = await User.countDocuments().catch(() => 0);
    const nominationCount = await Nomination.countDocuments().catch(() => 0);
    
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'Liberia Business Awards API',
        version: '3.0.0',
        database: isConnected ? 'connected' : 'disconnected',
        stats: {
            users: userCount,
            nominations: nominationCount,
            businesses: await User.countDocuments({ role: 'business' }).catch(() => 0),
            advertisers: await Advertiser.countDocuments().catch(() => 0),
            campaigns: await AdCampaign.countDocuments().catch(() => 0),
            articles: await NewsArticle.countDocuments().catch(() => 0)
        },
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

// 2. AUTHENTICATION
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email and password are required.' 
            });
        }
        
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid credentials.' 
            });
        }
        
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid credentials.' 
            });
        }
        
        if (!['active', 'verified'].includes(user.status)) {
            return res.status(403).json({ 
                success: false, 
                message: `Account is ${user.status}. Please contact administrator.` 
            });
        }
        
        user.last_login = new Date();
        await user.save();
        
        const token = jwt.sign({ 
            userId: user._id, 
            role: user.role,
            email: user.email
        }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
        
        res.json({
            success: true,
            message: 'Login successful',
            token,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                company: user.company,
                role: user.role,
                status: user.status,
                avatar: user.avatar
            }
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error during login.' 
        });
    }
});

app.post('/api/auth/register', [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('name').notEmpty().trim(),
    body('company').notEmpty().trim(),
    body('phone').notEmpty().trim()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        
        const { email, password, name, company, phone, business_type } = req.body;
        
        let user = await User.findOne({ email: email.toLowerCase() });
        if (user) {
            return res.status(400).json({ 
                success: false, 
                message: 'Business already registered with this email.' 
            });
        }
        
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        user = new User({
            email: email.toLowerCase(),
            password: hashedPassword,
            name,
            company,
            phone,
            business_type,
            role: 'business',
            status: 'pending',
            verified: false
        });
        
        await user.save();
        
        const token = jwt.sign({ 
            userId: user._id, 
            role: user.role,
            email: user.email
        }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
        
        res.status(201).json({
            success: true,
            message: 'Business registered successfully!',
            token,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                company: user.company,
                role: user.role,
                status: user.status
            }
        });
        
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error during registration.' 
        });
    }
});

// 3. BUSINESS DASHBOARD ROUTES
app.get('/api/business/dashboard', authenticate, authorize('business'), async (req, res) => {
    try {
        const user = req.user;
        
        const [nominations, awards, documents] = await Promise.all([
            Nomination.countDocuments({ business_id: user._id }),
            Nomination.countDocuments({ business_id: user._id, status: 'winner' }),
            User.findById(user._id).select('documents_count')
        ]);
        
        const recentNominations = await Nomination.find({ business_id: user._id })
            .sort({ created_at: -1 })
            .limit(5)
            .select('title category status created_at');
        
        const announcements = await Announcement.find({ 
            is_published: true,
            publish_date: { $lte: new Date() },
            $or: [
                { expiry_date: { $exists: false } },
                { expiry_date: { $gte: new Date() } }
            ]
        })
        .sort({ publish_date: -1 })
        .limit(3)
        .select('title content type publish_date');
        
        res.json({
            success: true,
            dashboard: {
                stats: {
                    total_awards: awards,
                    active_nominations: await Nomination.countDocuments({ 
                        business_id: user._id, 
                        status: { $in: ['submitted', 'under_review', 'shortlisted'] } 
                    }),
                    documents_uploaded: documents?.documents_count || 0,
                    profile_completion: user.profile_completion || 0
                },
                recent_nominations,
                announcements,
                profile: {
                    name: user.name,
                    company: user.company,
                    email: user.email,
                    status: user.status,
                    verified: user.verified
                }
            }
        });
        
    } catch (error) {
        console.error('Business dashboard error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error loading dashboard.' 
        });
    }
});

// 4. ADMIN DASHBOARD ROUTES
app.get('/api/admin/dashboard', authenticate, authorize('admin'), async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        
        const [
            totalBusinesses,
            totalNominations,
            pendingBusinesses,
            totalAdvertisers,
            totalCampaigns,
            pendingCampaigns,
            totalArticles,
            pendingArticles,
            recentBusinesses,
            recentNominations
        ] = await Promise.all([
            User.countDocuments({ role: 'business' }),
            Nomination.countDocuments(),
            User.countDocuments({ role: 'business', status: 'pending' }),
            Advertiser.countDocuments(),
            AdCampaign.countDocuments(),
            AdCampaign.countDocuments({ status: 'pending' }),
            NewsArticle.countDocuments(),
            NewsArticle.countDocuments({ status: 'pending' }),
            User.find({ role: 'business' })
                .sort({ created_at: -1 })
                .limit(5)
                .select('name company email status created_at'),
            Nomination.find()
                .populate('business_id', 'company name')
                .sort({ created_at: -1 })
                .limit(5)
                .select('title category status created_at')
        ]);
        
        const registrationTrend = await User.aggregate([
            { $match: { 
                role: 'business',
                created_at: { $gte: weekAgo }
            }},
            { $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$created_at" } },
                count: { $sum: 1 }
            }},
            { $sort: { _id: 1 } }
        ]);
        
        res.json({
            success: true,
            dashboard: {
                overview: {
                    total_businesses: totalBusinesses,
                    total_nominations: totalNominations,
                    pending_businesses: pendingBusinesses,
                    approved_nominations: await Nomination.countDocuments({ status: 'approved' }),
                    active_users: await User.countDocuments({ status: 'active' }),
                    advertisers: totalAdvertisers,
                    campaigns: totalCampaigns,
                    pending_campaigns: pendingCampaigns,
                    articles: totalArticles,
                    pending_articles: pendingArticles
                },
                recent_activity: {
                    businesses: recentBusinesses,
                    nominations: recentNominations,
                    registrations_today: await User.countDocuments({ 
                        role: 'business', 
                        created_at: { $gte: today } 
                    }),
                    submissions_today: await Nomination.countDocuments({ 
                        created_at: { $gte: today } 
                    })
                },
                analytics: {
                    registration_trend: registrationTrend,
                    business_types: await User.aggregate([
                        { $match: { role: 'business' } },
                        { $group: {
                            _id: "$business_type",
                            count: { $sum: 1 }
                        }}
                    ]),
                    nomination_status: await Nomination.aggregate([
                        { $group: {
                            _id: "$status",
                            count: { $sum: 1 }
                        }}
                    ]),
                    campaign_types: await AdCampaign.aggregate([
                        { $group: {
                            _id: "$campaign_type",
                            count: { $sum: 1 }
                        }}
                    ])
                }
            }
        });
        
    } catch (error) {
        console.error('Admin dashboard error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error loading dashboard.' 
        });
    }
});

// 5. GOOGLE SHEETS INTEGRATION
app.get('/api/sheets/data', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { sheet } = req.query;
        
        const mockData = {
            businesses: {
                headers: ['ID', 'Company', 'Email', 'Status', 'Registered', 'Nominations'],
                data: Array.from({ length: 20 }, (_, i) => [
                    `BUS${1000 + i}`,
                    `Company ${i + 1}`,
                    `company${i + 1}@example.com`,
                    i % 3 === 0 ? 'Active' : i % 3 === 1 ? 'Pending' : 'Suspended',
                    new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toLocaleDateString(),
                    Math.floor(Math.random() * 10)
                ])
            },
            nominations: {
                headers: ['ID', 'Business', 'Category', 'Status', 'Submitted', 'Score'],
                data: Array.from({ length: 15 }, (_, i) => [
                    `NOM${2000 + i}`,
                    `Company ${i % 5 + 1}`,
                    ['Technology', 'Agriculture', 'Manufacturing', 'Finance', 'Tourism'][i % 5],
                    ['Submitted', 'Under Review', 'Approved', 'Rejected', 'Winner'][i % 5],
                    new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toLocaleDateString(),
                    Math.floor(Math.random() * 100)
                ])
            },
            advertisers: {
                headers: ['ID', 'Business', 'Contact', 'Email', 'Status', 'Campaigns'],
                data: Array.from({ length: 10 }, (_, i) => [
                    `ADV${3000 + i}`,
                    `Advertiser ${i + 1}`,
                    `Contact ${i + 1}`,
                    `advertiser${i + 1}@example.com`,
                    i % 2 === 0 ? 'Active' : 'Inactive',
                    Math.floor(Math.random() * 5)
                ])
            },
            campaigns: {
                headers: ['ID', 'Campaign', 'Type', 'Status', 'Impressions', 'CTR'],
                data: Array.from({ length: 12 }, (_, i) => {
                    const impressions = Math.floor(Math.random() * 10000);
                    const clicks = Math.floor(Math.random() * impressions);
                    const ctr = impressions > 0 ? ((clicks / impressions) * 100).toFixed(2) + '%' : '0%';
                    return [
                        `CAMP${4000 + i}`,
                        `Campaign ${i + 1}`,
                        ['Popup', 'Banner', 'Sidebar', 'Hero'][i % 4],
                        ['Active', 'Pending', 'Completed'][i % 3],
                        impressions.toLocaleString(),
                        ctr
                    ];
                })
            }
        };
        
        res.json({
            success: true,
            sheet: sheet || 'all',
            data: mockData[sheet] || mockData.businesses,
            last_updated: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('Sheets data error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error fetching sheets data.' 
        });
    }
});

// 6. PUBLIC STATS
app.get('/api/stats/public', async (req, res) => {
    try {
        const [totalBusinesses, totalNominations, recentWinners] = await Promise.all([
            User.countDocuments({ role: 'business', status: 'active' }),
            Nomination.countDocuments({ status: { $in: ['approved', 'winner'] } }),
            Nomination.find({ status: 'winner' })
                .populate('business_id', 'company name')
                .sort({ approved_at: -1 })
                .limit(5)
                .select('title category approved_at')
        ]);
        
        res.json({
            success: true,
            stats: {
                total_businesses: totalBusinesses,
                total_nominations: totalNominations,
                award_categories: ['Technology', 'Agriculture', 'Manufacturing', 'Finance', 'Tourism', 'Healthcare', 'Education'],
                recent_winners: recentWinners
            }
        });
        
    } catch (error) {
        console.error('Public stats error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error fetching public stats.' 
        });
    }
});

// 7. FILE UPLOAD (Firebase)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }
});

app.post('/api/upload', authenticate, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                message: 'No file uploaded.' 
            });
        }
        
        const file = req.file;
        const fileName = `${Date.now()}-${file.originalname}`;
        
        let fileUrl = `/uploads/${fileName}`;
        
        if (firebaseApp) {
            try {
                const bucket = admin.storage().bucket();
                const blob = bucket.file(`business-documents/${req.user._id}/${fileName}`);
                
                await blob.save(file.buffer, {
                    metadata: {
                        contentType: file.mimetype,
                        metadata: {
                            userId: req.user._id.toString(),
                            originalName: file.originalname
                        }
                    }
                });
                
                await blob.makePublic();
                fileUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
                
            } catch (firebaseError) {
                console.warn('Firebase upload failed, using local:', firebaseError.message);
                await fs.writeFile(path.join(UPLOAD_DIR, fileName), file.buffer);
            }
        } else {
            await fs.mkdir(UPLOAD_DIR, { recursive: true });
            await fs.writeFile(path.join(UPLOAD_DIR, fileName), file.buffer);
        }
        
        res.json({
            success: true,
            message: 'File uploaded successfully.',
            file: {
                name: file.originalname,
                url: fileUrl,
                size: file.size,
                type: file.mimetype
            }
        });
        
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error uploading file.' 
        });
    }
});

// 8. ADS & SPOTLIGHT ROUTES
app.use('/api', adsRoutes);
app.use('/api', newsRoutes);

// 9. HOME ROUTE
app.get('/', (req, res) => {
    res.json({
        service: 'Liberia Business Awards API',
        version: '3.0.0',
        status: 'operational',
        endpoints: {
            public: [
                'GET  /',
                'GET  /api/health',
                'GET  /api/stats/public',
                'GET  /api/ads',
                'GET  /api/ads/next',
                'GET  /api/news/articles',
                'GET  /api/news/featured',
                'GET  /api/news/categories',
                'POST /api/auth/login',
                'POST /api/auth/register',
                'POST /api/news/comment'
            ],
            business: [
                'GET  /api/business/dashboard',
                'GET  /api/business/profile',
                'PUT  /api/business/profile',
                'GET  /api/business/nominations',
                'POST /api/nominations'
            ],
            admin: [
                'GET  /api/admin/dashboard',
                'GET  /api/admin/businesses',
                'GET  /api/admin/nominations',
                'GET  /api/sheets/data'
            ],
            ads: [
                'POST /api/ads/track/impression',
                'POST /api/ads/track/click'
            ],
            upload: [
                'POST /api/upload'
            ]
        },
        documentation: 'https://liberiabusinessawardslr.com/docs',
        support: 'support@liberiabusinessawardslr.com'
    });
});

// 404 Handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found',
        available_endpoints: {
            public: ['/', '/api/health', '/api/stats/public'],
            info: 'Visit / for complete API documentation'
        }
    });
});

// ============ START SERVER ============
async function startServer() {
    console.log('='.repeat(70));
    console.log('🚀 LIBERIA BUSINESS AWARDS - PRODUCTION SYSTEM V3.0');
    console.log('='.repeat(70));
    
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    
    const connected = await connectToMongoDB();
    
    app.listen(PORT, () => {
        console.log('\n✅ SERVER RUNNING');
        console.log('='.repeat(70));
        console.log(`📡 Port: ${PORT}`);
        console.log(`🌐 Local: http://localhost:${PORT}`);
        console.log(`🌍 Public: https://liberia-business-awards-backend.onrender.com`);
        console.log(`🗄️  MongoDB: ${connected ? '✅ CONNECTED' : '❌ DISCONNECTED'}`);
        console.log(`🔥 Firebase: ${firebaseApp ? '✅ INITIALIZED' : '⚠️ NOT CONFIGURED'}`);
        console.log(`📁 Uploads: ${UPLOAD_DIR}`);
        console.log('='.repeat(70));
        console.log('\n📊 NEW FEATURES:');
        console.log('   • 💰 Paid Ads System');
        console.log('   • 📰 Business Spotlight');
        console.log('   • 📈 Impression Tracking');
        console.log('   • 👥 Advertiser Management');
        console.log('\n🚀 System ready for production!');
    });
}

// Error Handling
process.on('unhandledRejection', (err) => {
    console.error('🔥 UNHANDLED REJECTION:', err.message);
});

process.on('uncaughtException', (err) => {
    console.error('💥 UNCAUGHT EXCEPTION:', err);
    process.exit(1);
});

startServer().catch(err => {
    console.error('❌ SERVER STARTUP FAILED:', err);
    process.exit(1);
});
