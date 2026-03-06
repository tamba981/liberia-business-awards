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

// ============ NEW AUTHENTICATION SCHEMAS ============

// Admin Schema (NEW)
const adminSchema = new mongoose.Schema({
    email: { 
        type: String, 
        required: true, 
        unique: true, 
        lowercase: true,
        trim: true
    },
    password: { 
        type: String, 
        required: true 
    },
    name: { 
        type: String, 
        required: true 
    },
    role: { 
        type: String, 
        enum: ['super_admin', 'admin', 'moderator'], 
        default: 'admin' 
    },
    permissions: {
        manage_businesses: { type: Boolean, default: true },
        manage_advertisements: { type: Boolean, default: true },
        manage_news: { type: Boolean, default: true },
        manage_users: { type: Boolean, default: false },
        manage_settings: { type: Boolean, default: false }
    },
    last_login: { type: Date },
    login_attempts: { type: Number, default: 0 },
    lock_until: { type: Date },
    is_active: { type: Boolean, default: true },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { timestamps: true });

// Business User Schema (NEW - Separate from User)
const businessUserSchema = new mongoose.Schema({
    email: { 
        type: String, 
        required: true, 
        unique: true, 
        lowercase: true,
        trim: true
    },
    password: { 
        type: String, 
        required: true 
    },
    business_name: { 
        type: String, 
        required: true 
    },
    contact_name: { 
        type: String 
    },
    phone: { 
        type: String 
    },
    address: { 
        type: String 
    },
    registration_number: { 
        type: String 
    },
    tax_id: { 
        type: String 
    },
    business_type: { 
        type: String,
        enum: ['Startup', 'SME', 'Enterprise', 'Nonprofit', 'Other']
    },
    industry: { 
        type: String 
    },
    year_established: { 
        type: Number 
    },
    employee_count: { 
        type: String 
    },
    website: { 
        type: String 
    },
    logo_url: { 
        type: String 
    },
    documents: [{
        name: String,
        url: String,
        type: String,
        uploaded_at: { type: Date, default: Date.now }
    }],
    status: { 
        type: String, 
        enum: ['pending', 'active', 'suspended', 'rejected'],
        default: 'pending'
    },
    verification_status: {
        email_verified: { type: Boolean, default: false },
        phone_verified: { type: Boolean, default: false },
        documents_verified: { type: Boolean, default: false }
    },
    last_login: { type: Date },
    login_attempts: { type: Number, default: 0 },
    lock_until: { type: Date },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
    notes: { type: String },
    approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    approved_at: { type: Date }
}, { timestamps: true });

// Login History Schema (NEW)
const loginHistorySchema = new mongoose.Schema({
    user_id: { 
        type: mongoose.Schema.Types.ObjectId, 
        required: true 
    },
    user_type: { 
        type: String, 
        enum: ['admin', 'business'],
        required: true 
    },
    email: { 
        type: String, 
        required: true 
    },
    ip_address: { 
        type: String 
    },
    user_agent: { 
        type: String 
    },
    success: { 
        type: Boolean, 
        default: false 
    },
    login_time: { 
        type: Date, 
        default: Date.now 
    },
    logout_time: { 
        type: Date 
    }
}, { timestamps: true });

// User Schema (Legacy - kept for backward compatibility)
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

// ============ ADS & SPOTLIGHT SCHEMAS ============

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

// ============ HASH PASSWORD MIDDLEWARE FOR NEW SCHEMAS ============

// Hash password for Admin schema
adminSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Hash password for BusinessUser schema
businessUserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// ============ PASSWORD COMPARISON METHODS ============

adminSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

businessUserSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// ============ ACCOUNT LOCKING METHODS ============

adminSchema.methods.isLocked = function() {
    return this.lock_until && this.lock_until > Date.now();
};

adminSchema.methods.incrementLoginAttempts = async function() {
    const MAX_ATTEMPTS = 5;
    const LOCK_TIME = 15 * 60 * 1000; // 15 minutes
    
    this.login_attempts += 1;
    
    if (this.login_attempts >= MAX_ATTEMPTS) {
        this.lock_until = Date.now() + LOCK_TIME;
        this.login_attempts = 0;
    }
    
    await this.save();
};

adminSchema.methods.resetLoginAttempts = async function() {
    this.login_attempts = 0;
    this.lock_until = undefined;
    this.last_login = new Date();
    await this.save();
};

businessUserSchema.methods.isLocked = function() {
    return this.lock_until && this.lock_until > Date.now();
};

businessUserSchema.methods.incrementLoginAttempts = async function() {
    const MAX_ATTEMPTS = 5;
    const LOCK_TIME = 15 * 60 * 1000; // 15 minutes
    
    this.login_attempts += 1;
    
    if (this.login_attempts >= MAX_ATTEMPTS) {
        this.lock_until = Date.now() + LOCK_TIME;
        this.login_attempts = 0;
    }
    
    await this.save();
};

businessUserSchema.methods.resetLoginAttempts = async function() {
    this.login_attempts = 0;
    this.lock_until = undefined;
    this.last_login = new Date();
    await this.save();
};

// ============ CREATE MODELS ============
const Admin = mongoose.model('Admin', adminSchema);
const BusinessUser = mongoose.model('BusinessUser', businessUserSchema);
const LoginHistory = mongoose.model('LoginHistory', loginHistorySchema);
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
            'newscategories', 'newsarticles', 'newscomments',
            'admins', 'businessusers', 'loginhistories' // NEW collections
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
        // Check in Admin collection first
        let adminExists = await Admin.findOne({ email: ADMIN_EMAIL });
        
        if (!adminExists) {
            const salt = await bcrypt.genSalt(12);
            const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, salt);
            
            const admin = new Admin({
                email: ADMIN_EMAIL,
                password: hashedPassword,
                name: 'System Administrator',
                role: 'super_admin',
                permissions: {
                    manage_businesses: true,
                    manage_advertisements: true,
                    manage_news: true,
                    manage_users: true,
                    manage_settings: true
                },
                is_active: true
            });
            
            await admin.save();
            console.log('👑 Default admin account created in Admin collection');
        } else {
            console.log('👑 Admin account already exists in Admin collection');
        }
        
        // Also check legacy User collection for backward compatibility
        const legacyAdmin = await User.findOne({ email: ADMIN_EMAIL });
        if (!legacyAdmin) {
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
            console.log('👑 Default admin account created in legacy User collection');
        }
    } catch (error) {
        console.error('Admin creation error:', error);
    }
}

async function createDemoBusiness() {
    try {
        const demoExists = await BusinessUser.findOne({ email: 'demo@business.com' });
        
        if (!demoExists) {
            const business = new BusinessUser({
                email: 'demo@business.com',
                password: 'demo123',
                business_name: 'Demo Company Liberia',
                contact_name: 'John Doe',
                phone: '+231 123 456 789',
                address: '123 Main Street, Monrovia',
                business_type: 'Enterprise',
                industry: 'Technology',
                year_established: 2020,
                employee_count: '11-50',
                website: 'https://demo-company.com',
                status: 'active',
                verification_status: {
                    email_verified: true,
                    phone_verified: true,
                    documents_verified: true
                }
            });
            
            await business.save();
            console.log('✅ Demo business account created');
            console.log('📧 Email: demo@business.com');
            console.log('🔑 Password: demo123');
        }
    } catch (error) {
        console.error('❌ Error creating demo business:', error);
    }
}

// ============ AUTHENTICATION MIDDLEWARE ============

// JWT Token functions
const generateToken = (userId, userType, email) => {
    return jwt.sign(
        { 
            userId, 
            userType,
            email 
        }, 
        JWT_SECRET, 
        { expiresIn: JWT_EXPIRES_IN }
    );
};

const verifyToken = (token) => {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
};

// Rate limiting for login attempts
const loginRateLimiter = {
    attempts: new Map(),
    
    check: (email, ip) => {
        const key = `${email}_${ip}`;
        const now = Date.now();
        const windowMs = 15 * 60 * 1000; // 15 minutes
        const maxAttempts = 10;
        
        const record = loginRateLimiter.attempts.get(key) || { count: 0, firstAttempt: now };
        
        if (now - record.firstAttempt > windowMs) {
            // Reset if window expired
            record.count = 1;
            record.firstAttempt = now;
        } else {
            record.count += 1;
        }
        
        loginRateLimiter.attempts.set(key, record);
        
        // Cleanup old entries
        setTimeout(() => {
            loginRateLimiter.attempts.delete(key);
        }, windowMs);
        
        return {
            allowed: record.count <= maxAttempts,
            remaining: Math.max(0, maxAttempts - record.count),
            resetTime: record.firstAttempt + windowMs
        };
    }
};

// Updated authenticate middleware
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

        const decoded = verifyToken(token);
        if (!decoded) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid or expired token.' 
            });
        }

        // Get user based on type
        let user;
        if (decoded.userType === 'admin') {
            user = await Admin.findById(decoded.userId).select('-password');
        } else if (decoded.userType === 'business') {
            user = await BusinessUser.findById(decoded.userId).select('-password');
        } else {
            // Fallback to legacy User model
            user = await User.findById(decoded.userId).select('-password');
        }

        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'User not found.' 
            });
        }

        // Check if user is active
        if (decoded.userType === 'admin') {
            if (!user.is_active) {
                return res.status(403).json({ 
                    success: false, 
                    message: 'Account is deactivated. Contact administrator.' 
                });
            }
        } else if (decoded.userType === 'business') {
            if (user.status !== 'active') {
                return res.status(403).json({ 
                    success: false, 
                    message: `Account is ${user.status}. Please contact administrator.` 
                });
            }
        } else {
            if (user.status !== 'active' && user.status !== 'verified') {
                return res.status(403).json({ 
                    success: false, 
                    message: `Account is ${user.status}. Please contact administrator.` 
                });
            }
        }

        req.user = user;
        req.userType = decoded.userType;
        next();
    } catch (error) {
        console.error('❌ Auth middleware error:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Authentication error.' 
        });
    }
};

// Role-based authorization middleware
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Authentication required.' 
            });
        }

        // Check if userType matches
        if (req.userType === 'admin' && roles.includes('admin')) {
            return next();
        }
        
        if (req.userType === 'business' && roles.includes('business')) {
            return next();
        }

        // Legacy role check
        if (req.user.role && roles.includes(req.user.role)) {
            return next();
        }

        return res.status(403).json({ 
            success: false, 
            message: 'Access denied. Insufficient permissions.' 
        });
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
const authRoutes = require('./routes/auth.routes');
const businessRoutes = require('./routes/business.routes');

// ============ API ROUTES ============

// 1. HEALTH CHECK
app.get('/api/health', async (req, res) => {
    const isConnected = mongoose.connection.readyState === 1;
    const adminCount = await Admin.countDocuments().catch(() => 0);
    const businessCount = await BusinessUser.countDocuments().catch(() => 0);
    const userCount = await User.countDocuments().catch(() => 0);
    const nominationCount = await Nomination.countDocuments().catch(() => 0);
    
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'Liberia Business Awards API',
        version: '4.0.0',
        database: isConnected ? 'connected' : 'disconnected',
        stats: {
            admins: adminCount,
            businesses: businessCount,
            legacy_users: userCount,
            nominations: nominationCount,
            advertisers: await Advertiser.countDocuments().catch(() => 0),
            campaigns: await AdCampaign.countDocuments().catch(() => 0),
            articles: await NewsArticle.countDocuments().catch(() => 0)
        },
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

// ============ AUTHENTICATION ROUTES ============
app.use('/api', authRoutes);
app.use('/api', businessRoutes);

// ============ BUSINESS DASHBOARD ROUTES (Legacy) ============
app.get('/api/business/dashboard', authenticate, authorize('business'), async (req, res) => {
    try {
        const user = req.user;
        
        const [nominations, awards, documents] = await Promise.all([
            Nomination.countDocuments({ business_id: user._id }),
            Nomination.countDocuments({ business_id: user._id, status: 'winner' }),
            BusinessUser.findById(user._id).select('documents_count')
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
                    name: user.name || user.business_name,
                    company: user.company || user.business_name,
                    email: user.email,
                    status: user.status,
                    verified: user.verified || user.verification_status?.email_verified
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

// ============ ADMIN DASHBOARD ROUTES ============
app.get('/api/admin/dashboard', authenticate, authorize('admin'), async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        
        const [
            totalBusinesses,
            pendingBusinesses,
            totalAdmins,
            totalAdvertisers,
            totalCampaigns,
            pendingCampaigns,
            totalArticles,
            pendingArticles,
            recentBusinesses
        ] = await Promise.all([
            BusinessUser.countDocuments(),
            BusinessUser.countDocuments({ status: 'pending' }),
            Admin.countDocuments(),
            Advertiser.countDocuments(),
            AdCampaign.countDocuments(),
            AdCampaign.countDocuments({ status: 'pending' }),
            NewsArticle.countDocuments(),
            NewsArticle.countDocuments({ status: 'pending' }),
            BusinessUser.find()
                .sort({ created_at: -1 })
                .limit(5)
                .select('business_name email status created_at')
        ]);
        
        const registrationTrend = await BusinessUser.aggregate([
            { $match: { 
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
                    pending_businesses: pendingBusinesses,
                    active_admins: totalAdmins,
                    advertisers: totalAdvertisers,
                    campaigns: totalCampaigns,
                    pending_campaigns: pendingCampaigns,
                    articles: totalArticles,
                    pending_articles: pendingArticles
                },
                recent_activity: {
                    businesses: recentBusinesses,
                    registrations_today: await BusinessUser.countDocuments({ 
                        created_at: { $gte: today } 
                    })
                },
                analytics: {
                    registration_trend: registrationTrend,
                    business_status: await BusinessUser.aggregate([
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

// ============ GOOGLE SHEETS INTEGRATION ============
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

// ============ PUBLIC STATS ============
app.get('/api/stats/public', async (req, res) => {
    try {
        const [totalBusinesses, totalNominations, recentWinners] = await Promise.all([
            BusinessUser.countDocuments({ status: 'active' }),
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

// ============ FILE UPLOAD (Firebase) ============
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

// ============ ADS & SPOTLIGHT ROUTES ============
app.use('/api', adsRoutes);
app.use('/api', newsRoutes);

// ============ ADMIN SPOTLIGHT ROUTES ============
app.get('/api/admin/articles', authenticate, authorize('admin'), async (req, res) => {
    try {
        const articles = await NewsArticle.find()
            .populate('category_id')
            .sort('-created_at');
        res.json({ success: true, articles });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/admin/articles', authenticate, authorize('admin'), async (req, res) => {
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

app.put('/api/admin/articles/:id', authenticate, authorize('admin'), async (req, res) => {
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

app.delete('/api/admin/articles/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        await NewsArticle.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/admin/categories', authenticate, authorize('admin'), async (req, res) => {
    try {
        const categories = await NewsCategory.find().sort('display_order');
        res.json({ success: true, categories });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/admin/categories', authenticate, authorize('admin'), async (req, res) => {
    try {
        const category = new NewsCategory(req.body);
        await category.save();
        res.json({ success: true, category });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/admin/categories/:id', authenticate, authorize('admin'), async (req, res) => {
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

app.delete('/api/admin/categories/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        await NewsCategory.findByIdAndDelete(req.params.id);
        await NewsArticle.updateMany(
            { category_id: req.params.id },
            { $unset: { category_id: 1 } }
        );
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ NEWSLETTER SUBSCRIPTION ============
app.post('/api/newsletter/subscribe', async (req, res) => {
    try {
        const { email, source } = req.body;
        
        if (!email) {
            return res.status(400).json({ success: false, error: 'Email required' });
        }
        
        console.log('📧 Newsletter subscription:', email, 'source:', source);
        
        res.json({ 
            success: true, 
            message: 'Subscription successful' 
        });
        
    } catch (error) {
        console.error('Newsletter error:', error);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

// ============ HOME ROUTE ============
app.get('/', (req, res) => {
    res.json({
        service: 'Liberia Business Awards API',
        version: '4.0.0',
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
                'POST /api/business/register',
                'POST /api/newsletter/subscribe',
                'POST /api/news/comment'
            ],
            auth: [
                'POST /api/auth/admin/login',
                'POST /api/auth/business/login',
                'POST /api/auth/logout',
                'GET  /api/auth/verify'
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
                'GET  /api/sheets/data',
                'POST /api/auth/admin/impersonate/:businessId'
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

// ============ 404 HANDLER ============
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
    console.log('🚀 LIBERIA BUSINESS AWARDS - PRODUCTION SYSTEM V4.0');
    console.log('='.repeat(70));
    
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    
    const connected = await connectToMongoDB();
    
    // Create demo business after connection
    if (connected) {
        await createDemoBusiness();
    }
    
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
        console.log('\n📊 NEW FEATURES IN V4.0:');
        console.log('   • 🔐 Separate Admin & Business Authentication');
        console.log('   • 🚫 Account Locking after 5 failed attempts');
        console.log('   • 📝 Login History Tracking');
        console.log('   • 👤 Admin Impersonation');
        console.log('   • 📧 Business Registration');
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

