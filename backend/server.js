// ============================================
// LIBERIA BUSINESS AWARDS - PRODUCTION FIXED
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
const axios = require('axios');

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
const GOOGLE_SHEETS_API = 'https://script.google.com/macros/s/AKfycbwHzw3mG57vNFI6HxxhjsUMH5tt07emTZcn65Y06CClnzwd5wCcvWJubri31miz47VY/exec';
const UPLOAD_DIR = path.join(__dirname, 'uploads');

// ============ SECURITY CONFIGURATION ============
app.use(helmet({
    contentSecurityPolicy: false, // Disable for development
    crossOriginEmbedderPolicy: false
}));

app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: 'Too many requests from this IP, please try again later.'
}));

// ============ MIDDLEWARE ============
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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
        
        // Create collections if they don't exist
        await createCollections();
        await createDefaultAdmin();
        
        return true;
    } catch (error) {
        console.error('❌ MongoDB Connection Failed:', error.message);
        return false;
    }
}

// ============ DATABASE SCHEMAS ============

// User Schema (Simplified for quick setup)
const userSchema = new mongoose.Schema({
    // Basic Info
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    company: { type: String, required: true },
    phone: { type: String },
    
    // Business Details
    business_type: { type: String },
    industry: { type: String },
    location: { type: String },
    year_established: { type: Number },
    employee_count: { type: String },
    
    // Account
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
    
    // Profile
    avatar: { type: String },
    bio: { type: String },
    website: { type: String },
    
    // Stats
    awards_count: { type: Number, default: 0 },
    nominations_count: { type: Number, default: 0 },
    documents_count: { type: Number, default: 0 },
    profile_completion: { type: Number, default: 0 },
    
    // Timestamps
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
    
    // Details
    title: { type: String, required: true },
    description: { type: String, required: true },
    achievements: [String],
    challenges: [String],
    impact: { type: String },
    
    // Documents
    documents: [{
        name: String,
        url: String,
        type: String,
        uploaded_at: { type: Date, default: Date.now }
    }],
    
    // Status
    status: { 
        type: String, 
        enum: ['draft', 'submitted', 'under_review', 'shortlisted', 'approved', 'rejected', 'winner'],
        default: 'draft'
    },
    
    // Evaluation
    score: { type: Number, min: 0, max: 100 },
    feedback: { type: String },
    evaluated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    evaluated_at: { type: Date },
    
    // Dates
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
    
    // Publishing
    is_published: { type: Boolean, default: false },
    is_featured: { type: Boolean, default: false },
    publish_date: { type: Date, default: Date.now },
    expiry_date: { type: Date },
    
    // Stats
    views: { type: Number, default: 0 },
    
    // Metadata
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

// Create Models
const User = mongoose.model('User', userSchema);
const Nomination = mongoose.model('Nomination', nominationSchema);
const Announcement = mongoose.model('Announcement', announcementSchema);

// ============ UTILITY FUNCTIONS ============
async function createCollections() {
    try {
        // Create collections if they don't exist
        const collections = await mongoose.connection.db.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);
        
        if (!collectionNames.includes('users')) {
            await mongoose.connection.db.createCollection('users');
            console.log('✅ Created users collection');
        }
        
        if (!collectionNames.includes('nominations')) {
            await mongoose.connection.db.createCollection('nominations');
            console.log('✅ Created nominations collection');
        }
        
        if (!collectionNames.includes('announcements')) {
            await mongoose.connection.db.createCollection('announcements');
            console.log('✅ Created announcements collection');
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
        version: '2.0.0',
        database: isConnected ? 'connected' : 'disconnected',
        stats: {
            users: userCount,
            nominations: nominationCount,
            businesses: await User.countDocuments({ role: 'business' }).catch(() => 0)
        },
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

// 2. AUTHENTICATION
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Validate input
        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email and password are required.' 
            });
        }
        
        // Find user
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid credentials.' 
            });
        }
        
        // Check password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid credentials.' 
            });
        }
        
        // Check account status
        if (!['active', 'verified'].includes(user.status)) {
            return res.status(403).json({ 
                success: false, 
                message: `Account is ${user.status}. Please contact administrator.` 
            });
        }
        
        // Update last login
        user.last_login = new Date();
        await user.save();
        
        // Create token
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
        
        // Check if user exists
        let user = await User.findOne({ email: email.toLowerCase() });
        if (user) {
            return res.status(400).json({ 
                success: false, 
                message: 'Business already registered with this email.' 
            });
        }
        
        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        // Create user
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
        
        // Create token
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
        
        // Get business stats
        const [nominations, awards, documents] = await Promise.all([
            Nomination.countDocuments({ business_id: user._id }),
            Nomination.countDocuments({ business_id: user._id, status: 'winner' }),
            User.findById(user._id).select('documents_count')
        ]);
        
        // Get recent nominations
        const recentNominations = await Nomination.find({ business_id: user._id })
            .sort({ created_at: -1 })
            .limit(5)
            .select('title category status created_at');
        
        // Get announcements
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

app.get('/api/business/profile', authenticate, authorize('business'), async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .select('-password')
            .populate('nominations', 'title category status year');
        
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'Profile not found.' 
            });
        }
        
        res.json({
            success: true,
            profile: user
        });
        
    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error fetching profile.' 
        });
    }
});

app.put('/api/business/profile', authenticate, authorize('business'), async (req, res) => {
    try {
        const updates = req.body;
        
        // Remove fields that shouldn't be updated directly
        delete updates.password;
        delete updates.role;
        delete updates.status;
        delete updates.email;
        
        // Calculate profile completion
        let completion = 0;
        const requiredFields = ['name', 'company', 'phone', 'business_type', 'industry', 'location'];
        requiredFields.forEach(field => {
            if (updates[field] || req.user[field]) completion += 14.28; // 100/7
        });
        
        updates.profile_completion = Math.min(100, Math.round(completion));
        
        const user = await User.findByIdAndUpdate(
            req.user._id,
            { ...updates, updated_at: new Date() },
            { new: true, runValidators: true }
        ).select('-password');
        
        res.json({
            success: true,
            message: 'Profile updated successfully.',
            profile: user
        });
        
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error updating profile.' 
        });
    }
});

// 4. NOMINATION MANAGEMENT
app.get('/api/business/nominations', authenticate, authorize('business'), async (req, res) => {
    try {
        const { status } = req.query;
        let query = { business_id: req.user._id };
        
        if (status && status !== 'all') {
            query.status = status;
        }
        
        const nominations = await Nomination.find(query)
            .populate('business_id', 'company name')
            .sort({ created_at: -1 });
        
        const stats = {
            total: await Nomination.countDocuments({ business_id: req.user._id }),
            draft: await Nomination.countDocuments({ business_id: req.user._id, status: 'draft' }),
            submitted: await Nomination.countDocuments({ business_id: req.user._id, status: 'submitted' }),
            approved: await Nomination.countDocuments({ business_id: req.user._id, status: 'approved' }),
            winner: await Nomination.countDocuments({ business_id: req.user._id, status: 'winner' })
        };
        
        res.json({
            success: true,
            nominations,
            stats,
            count: nominations.length
        });
        
    } catch (error) {
        console.error('Nominations fetch error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error fetching nominations.' 
        });
    }
});

app.post('/api/nominations', authenticate, authorize('business'), async (req, res) => {
    try {
        const nominationData = {
            ...req.body,
            business_id: req.user._id,
            status: 'draft'
        };
        
        const nomination = new Nomination(nominationData);
        await nomination.save();
        
        // Update user's nomination count
        await User.findByIdAndUpdate(req.user._id, {
            $inc: { nominations_count: 1 }
        });
        
        res.status(201).json({
            success: true,
            message: 'Nomination created successfully.',
            nomination
        });
        
    } catch (error) {
        console.error('Nomination creation error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error creating nomination.' 
        });
    }
});

// 5. ADMIN DASHBOARD ROUTES
app.get('/api/admin/dashboard', authenticate, authorize('admin'), async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        
        // Get all metrics
        const [
            totalBusinesses,
            totalNominations,
            pendingBusinesses,
            recentBusinesses,
            recentNominations
        ] = await Promise.all([
            User.countDocuments({ role: 'business' }),
            Nomination.countDocuments(),
            User.countDocuments({ role: 'business', status: 'pending' }),
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
        
        // Get registration trend (last 7 days)
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
                    active_users: await User.countDocuments({ status: 'active' })
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

app.get('/api/admin/businesses', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { status, search, page = 1, limit = 20 } = req.query;
        
        let query = { role: 'business' };
        
        if (status && status !== 'all') {
            query.status = status;
        }
        
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { company: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }
        
        const skip = (page - 1) * limit;
        
        const [businesses, total] = await Promise.all([
            User.find(query)
                .select('-password')
                .sort({ created_at: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            User.countDocuments(query)
        ]);
        
        res.json({
            success: true,
            businesses,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            },
            stats: {
                total,
                pending: await User.countDocuments({ ...query, status: 'pending' }),
                active: await User.countDocuments({ ...query, status: 'active' }),
                verified: await User.countDocuments({ ...query, verified: true })
            }
        });
        
    } catch (error) {
        console.error('Businesses fetch error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error fetching businesses.' 
        });
    }
});

app.get('/api/admin/nominations', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        
        let query = {};
        
        if (status && status !== 'all') {
            query.status = status;
        }
        
        const skip = (page - 1) * limit;
        
        const [nominations, total] = await Promise.all([
            Nomination.find(query)
                .populate('business_id', 'company name email')
                .sort({ created_at: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            Nomination.countDocuments(query)
        ]);
        
        res.json({
            success: true,
            nominations,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            },
            stats: {
                total,
                draft: await Nomination.countDocuments({ status: 'draft' }),
                submitted: await Nomination.countDocuments({ status: 'submitted' }),
                approved: await Nomination.countDocuments({ status: 'approved' }),
                winner: await Nomination.countDocuments({ status: 'winner' })
            }
        });
        
    } catch (error) {
        console.error('Nominations fetch error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error fetching nominations.' 
        });
    }
});

// 6. GOOGLE SHEETS INTEGRATION
app.get('/api/sheets/data', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { sheet } = req.query;
        const sheetId = sheet || 'businesses'; // Default to businesses sheet
        
        // This would normally fetch from your Google Sheet
        // For now, return mock data
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
            }
        };
        
        res.json({
            success: true,
            sheet: sheetId,
            data: mockData[sheetId] || mockData.businesses,
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

// 7. PUBLIC STATS
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

// 8. FILE UPLOAD (Firebase)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB
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
        
        // Upload to Firebase Storage if available
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
                
                // Make file publicly accessible
                await blob.makePublic();
                fileUrl = `https://storage.googleapis.com/${bucket.name}/${blob.name}`;
                
            } catch (firebaseError) {
                console.warn('Firebase upload failed, using local:', firebaseError.message);
                // Save locally as fallback
                await fs.writeFile(path.join(UPLOAD_DIR, fileName), file.buffer);
            }
        } else {
            // Save locally
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

// 9. HOME ROUTE
app.get('/', (req, res) => {
    res.json({
        service: 'Liberia Business Awards API',
        version: '2.0.0',
        status: 'operational',
        endpoints: {
            public: [
                'GET  /',
                'GET  /api/health',
                'GET  /api/stats/public',
                'POST /api/auth/login',
                'POST /api/auth/register'
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
    console.log('🚀 LIBERIA BUSINESS AWARDS - PRODUCTION SYSTEM');
    console.log('='.repeat(70));
    
    // Ensure upload directory exists
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    
    // Connect to MongoDB
    const connected = await connectToMongoDB();
    
    // Start server
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
        console.log('\n👥 AVAILABLE ENDPOINTS:');
        console.log('   • POST /api/auth/login');
        console.log('   • POST /api/auth/register');
        console.log('   • GET  /api/business/dashboard');
        console.log('   • GET  /api/admin/dashboard');
        console.log('   • GET  /api/health');
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

// Start the server
startServer().catch(err => {
    console.error('❌ SERVER STARTUP FAILED:', err);
    process.exit(1);
});
