// ============================================
// LIBERIA BUSINESS AWARDS - PRODUCTION SYSTEM V5.0
// ============================================

console.log('🚀 Liberia Business Awards - Production System Starting...');

const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8080;

// ============ CORS CONFIGURATION ============
const corsOptions = {
    origin: function (origin, callback) {
        // Allow all origins for now (for testing)
        // In production, you can restrict to specific domains
        callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'Accept', 'Origin']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Handle preflight requests
app.options('*', cors());

// Log requests
app.use((req, res, next) => {
    console.log(`📡 ${req.method} ${req.url}`);
    next();
});

// ============ HEALTH CHECK ============
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Server is running',
        timestamp: new Date().toISOString(),
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

app.get('/test', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Test route works!',
        timestamp: new Date().toISOString(),
        port: PORT
    });
});

// ============ KEEP-ALIVE ENDPOINT ============
// For uptime monitoring services to keep the server awake
app.get('/api/keep-alive', (req, res) => {
    res.json({ 
        status: 'alive', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// ============ AUTO SELF-PING (KEEPS SERVER AWAKE) ============
// This pings itself every 4 minutes to prevent sleep
// Only works if the server is already awake, but helps once it's running
setInterval(async () => {
    try {
        const response = await fetch(`http://localhost:${PORT}/api/keep-alive`);
        if (response.ok) {
            console.log('🔄 Self keep-alive ping sent at', new Date().toISOString());
        }
    } catch (error) {
        // Silently fail - this is just a backup
        // console.log('⚠️ Self keep-alive ping failed');
    }
}, 4 * 60 * 1000); // Every 4 minutes 

app.get('/', (req, res) => {
    res.json({
        service: 'Liberia Business Awards API',
        version: '5.0.0',
        status: 'running',
        port: PORT
    });
});



// ============ ENVIRONMENT VARIABLES ============
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || crypto.randomBytes(32).toString('hex');
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@liberiabusinessawardslr.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123!';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

// ============ FILE UPLOAD CONFIGURATION - RAILWAY VOLUME READY ============
// Use Railway volume path if available, otherwise local ./uploads
const uploadDir = process.env.RAILWAY_VOLUME_MOUNT_PATH 
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'uploads')
    : path.join(__dirname, 'uploads');

// Ensure directory exists
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log('📁 Created uploads directory at:', uploadDir);
}

console.log('📁 Uploads directory:', uploadDir);
console.log('✅ Uploads directory writable:', fs.constants.W_OK);


// Log directory permissions for debugging
try {
    fs.access(uploadDir, fs.constants.W_OK, (err) => {
        if (err) {
            console.error('❌ Uploads directory is NOT writable:', err);
        } else {
            console.log('✅ Uploads directory is writable');
        }
    });
} catch (err) {
    console.error('Could not check uploads directory permissions:', err);
}

// Add CORS headers for static files
app.use('/uploads', express.static(uploadDir, {
    setHeaders: (res, filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.pdf') res.setHeader('Content-Type', 'application/pdf');
        if (ext === '.jpg' || ext === '.jpeg') res.setHeader('Content-Type', 'image/jpeg');
        if (ext === '.png') res.setHeader('Content-Type', 'image/png');
        
        // Add these CORS headers
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    }
}));

// Handle preflight OPTIONS request for static files
app.options('/uploads/*', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.sendStatus(200);
});
// ============ RATE LIMITING ============
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { success: false, message: 'Too many login attempts. Please try again later.' }
});

// ============ MIDDLEWARE ============
app.set('trust proxy', 1);

app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }  
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(cookieParser());

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

// ============ FILE UPLOAD CONFIGURATION ============
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type'), false);
    }
};

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: fileFilter
});

// ============ DATABASE CONNECTION ============
async function connectToMongoDB() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ MongoDB Atlas Connected');
        
        const adminExists = await Admin.findOne({ email: ADMIN_EMAIL });
        if (!adminExists) {
            const admin = new Admin({
                email: ADMIN_EMAIL,
                password: ADMIN_PASSWORD,
                name: 'System Administrator',
                role: 'super_admin',
                is_active: true,
                permissions: ['*']
            });
            await admin.save();
            console.log('👑 Default admin account created');
        } else {
            console.log('👑 Admin account already exists');
        }
        
        return true;
    } catch (error) {
        console.error('❌ MongoDB Connection Failed:', error.message);
        return false;
    }
}

// ============ DATABASE SCHEMAS ============

// ============ VOTE SCHEMAS ============
const voteSchema = new mongoose.Schema({
    business_id: { type: String, required: true },
    business_name: { type: String, required: true },
    category: { type: String, required: true },
    voter_email: { type: String, required: true },
    voter_ip: { type: String },
    vote_value: { type: Number, required: true, min: 1, max: 10 },
    vote_weight: { type: Number, default: 1 },
    is_jury: { type: Boolean, default: false },
    is_verified: { type: Boolean, default: true }
}, { timestamps: true });

const voteTotalSchema = new mongoose.Schema({
    business_id: { type: String, required: true, unique: true },
    business_name: { type: String, required: true },
    category: { type: String, required: true },
    total_votes: { type: Number, default: 0 },
    average_score: { type: Number, default: 0 },
    public_votes: { type: Number, default: 0 },
    jury_votes: { type: Number, default: 0 },
    rank: { type: Number, default: 0 }
}, { timestamps: true });

const Vote = mongoose.model('Vote', voteSchema);
const VoteTotal = mongoose.model('VoteTotal', voteTotalSchema);

// ============ VOTE VERIFICATION SCHEMA ============
const voteVerificationSchema = new mongoose.Schema({
    email: { type: String, required: true },
    code: { type: String, required: true },
    verified: { type: Boolean, default: false },
    used_at: { type: Date },
    expires_at: { type: Date, default: () => new Date(Date.now() + 30 * 60 * 1000) }
}, { timestamps: true });

const VoteVerification = mongoose.model('VoteVerification', voteVerificationSchema);

// Admin Schema (CORRECT)
const adminSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, enum: ['super_admin', 'admin', 'moderator'], default: 'admin' },
    last_login: { type: Date },
    login_attempts: { type: Number, default: 0 },
    lock_until: { type: Date },
    is_active: { type: Boolean, default: true },
    permissions: [{ type: String }],
    reset_password_token: { type: String },
    reset_password_expires: { type: Date }
}, { timestamps: true });

// Business User Schema (CORRECT)
const businessUserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    business_name: { type: String, required: true },
    contact_name: { type: String },
    phone: { type: String },
    business_type: { type: String },
    business_category: { type: String },
    industry: { type: String },
    location: { type: String },
    website: { type: String },
    description: { type: String },
    address: { type: String },
    logo: { type: String },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'suspended'], default: 'pending' },
    rejection_reason: { type: String },
    approved_at: { type: Date },
    approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    last_login: { type: Date },
    login_attempts: { type: Number, default: 0 },
    lock_until: { type: Date },
    notes: { type: String },
    verified: { type: Boolean, default: false },
    reset_password_token: { type: String },
    reset_password_expires: { type: Date }
}, { timestamps: true });

// Refresh Token Schema
const refreshTokenSchema = new mongoose.Schema({
    token: { type: String, required: true, unique: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, required: true },
    user_type: { type: String, enum: ['admin', 'business'], required: true },
    expires_at: { type: Date, required: true },
    created_at: { type: Date, default: Date.now },
    revoked: { type: Boolean, default: false }
});

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

adminSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

businessUserSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

businessUserSchema.methods.isLocked = function() {
    return !!(this.lock_until && this.lock_until > Date.now());
};

businessUserSchema.methods.incrementLoginAttempts = function() {
    this.login_attempts += 1;
    if (this.login_attempts >= 5) {
        this.lock_until = Date.now() + 30 * 60 * 1000;
    }
    return this.save();
};

businessUserSchema.methods.resetLoginAttempts = function() {
    this.login_attempts = 0;
    this.lock_until = undefined;
    return this.save();
};

// ============ NOMINATION SCHEMA ============
const nominationSchema = new mongoose.Schema({
    business_id: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessUser', required: true },
    title: { type: String, required: true },
    category: { type: String, required: true },
    year: { type: Number, default: new Date().getFullYear() },
    description: { type: String, required: true },
    achievements: [{ type: String }],
    document_id: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessDocument' },
    status: { type: String, enum: ['draft', 'submitted', 'under_review', 'approved', 'winner', 'rejected'], default: 'draft' },
    score: { type: Number, default: 0 },
    reviewed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    reviewed_at: { type: Date },
    rejection_reason: { type: String }
}, { timestamps: true });

// ============ OPPORTUNITY SCHEMA ============
const opportunitySchema = new mongoose.Schema({
    title: { type: String, required: true },
    type: { type: String, enum: ['grant', 'funding', 'training', 'networking', 'award', 'partnership', 'other'], required: true },
    description: { type: String, required: true },
    requirements: { type: String },
    benefits: { type: String },
    deadline: { type: Date, required: true },
    application_link: { type: String },
    image_url: { type: String },
    status: { type: String, enum: ['active', 'expired', 'draft'], default: 'active' },
    featured: { type: Boolean, default: false },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

const Opportunity = mongoose.model('Opportunity', opportunitySchema);

// ============ OPPORTUNITY APPLICATION SCHEMA ============
const opportunityApplicationSchema = new mongoose.Schema({
    opportunity_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Opportunity', required: true },
    business_id: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessUser', required: true },
    business_name: { type: String, required: true },
    contact_name: { type: String, required: true },
    contact_email: { type: String, required: true },
    contact_phone: { type: String },
    message: { type: String },
    status: { type: String, enum: ['pending', 'reviewed', 'accepted', 'rejected'], default: 'pending' },
    applied_at: { type: Date, default: Date.now }
});

const OpportunityApplication = mongoose.model('OpportunityApplication', opportunityApplicationSchema);

// ============ BUSINESS DOCUMENT SCHEMA ============
const businessDocumentSchema = new mongoose.Schema({
    business_id: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessUser', required: true },
    name: { type: String, required: true },
    type: { type: String, enum: ['registration', 'tax', 'license', 'financial', 'certificate', 'other'], default: 'other' },
    file_url: { type: String, required: true },
    file_name: { type: String },
    file_size: { type: Number },
    mime_type: { type: String }
}, { timestamps: true });

// ============ NOTIFICATION SCHEMA ============
const notificationSchema = new mongoose.Schema({
    business_id: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessUser', required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, enum: ['info', 'success', 'warning', 'error'], default: 'info' },
    read: { type: Boolean, default: false },
    related_id: { type: mongoose.Schema.Types.ObjectId }
}, { timestamps: true });

// Create Models
const Admin = mongoose.model('Admin', adminSchema);
const BusinessUser = mongoose.model('BusinessUser', businessUserSchema);
const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);
const Nomination = mongoose.model('Nomination', nominationSchema);
const BusinessDocument = mongoose.model('BusinessDocument', businessDocumentSchema);
const Notification = mongoose.model('Notification', notificationSchema);

// ============ AUTH ROUTES ============

// Admin Login
app.post('/api/auth/admin/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log('Admin login attempt:', email);
        
        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email and password are required' 
            });
        }
        
        const admin = await Admin.findOne({ email: email.toLowerCase() });
        if (!admin) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        if (!admin.is_active) {
            return res.status(403).json({ success: false, message: 'Account is deactivated' });
        }
        
        const isMatch = await admin.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        const token = jwt.sign(
            { userId: admin._id, role: 'admin' }, 
            JWT_SECRET, 
            { expiresIn: JWT_EXPIRES_IN }
        );
        
        const refreshToken = jwt.sign(
            { userId: admin._id, role: 'admin', type: 'refresh' },
            JWT_REFRESH_SECRET,
            { expiresIn: JWT_REFRESH_EXPIRES_IN }
        );
        
        await RefreshToken.create({
            token: refreshToken,
            user_id: admin._id,
            user_type: 'admin',
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        });
        
        admin.last_login = new Date();
        await admin.save();
        
        res.json({
            success: true,
            token,
            refreshToken,
            user: {
                id: admin._id,
                email: admin.email,
                name: admin.name,
                role: 'admin'
            }
        });
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ success: false, message: 'Server error during login' });
    }
});

// Business Login
app.post('/api/auth/business/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log('Business login attempt:', email);
        
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required' });
        }
        
        const business = await BusinessUser.findOne({ email: email.toLowerCase() });
        if (!business) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        if (business.isLocked()) {
            const lockTime = Math.ceil((business.lock_until - Date.now()) / (60 * 1000));
            return res.status(403).json({ success: false, message: `Account locked. Try again in ${lockTime} minutes` });
        }
        
        if (business.status === 'pending') {
            return res.status(403).json({ success: false, message: 'Your account is awaiting admin approval' });
        }
        
        if (business.status === 'rejected') {
            return res.status(403).json({ success: false, message: business.rejection_reason || 'Your business registration was rejected' });
        }
        
        if (business.status === 'suspended') {
            return res.status(403).json({ success: false, message: 'Your account has been suspended. Contact admin.' });
        }
        
        const isMatch = await business.comparePassword(password);
        if (!isMatch) {
            await business.incrementLoginAttempts();
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        await business.resetLoginAttempts();
        
        const token = jwt.sign(
            { userId: business._id, role: 'business' }, 
            JWT_SECRET, 
            { expiresIn: JWT_EXPIRES_IN }
        );
        
        const refreshToken = jwt.sign(
            { userId: business._id, role: 'business', type: 'refresh' },
            JWT_REFRESH_SECRET,
            { expiresIn: JWT_REFRESH_EXPIRES_IN }
        );
        
        await RefreshToken.create({
            token: refreshToken,
            user_id: business._id,
            user_type: 'business',
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        });
        
        business.last_login = new Date();
        await business.save();
        
        res.json({
            success: true,
            token,
            refreshToken,
            user: {
                id: business._id,
                email: business.email,
                name: business.business_name,
                role: 'business',
                status: business.status
            }
        });
    } catch (error) {
        console.error('Business login error:', error);
        res.status(500).json({ success: false, message: 'Server error during login' });
    }
});

// Business Registration
app.post('/api/business/register', [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('business_name').notEmpty().trim()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        
        const { email, password, business_name, contact_name, phone, business_type } = req.body;
        
        const existing = await BusinessUser.findOne({ email: email.toLowerCase() });
        if (existing) {
            return res.status(400).json({ success: false, message: 'Email already registered' });
        }
        
        const business = new BusinessUser({
            email: email.toLowerCase(),
            password,
            business_name,
            contact_name,
            phone,
            business_type,
            status: 'pending'
        });
        
        await business.save();
        
        res.status(201).json({
            success: true,
            message: 'Registration successful! Your account is pending admin approval.'
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, message: 'Server error during registration' });
    }
});

// Token verification
app.post('/api/auth/verify', async (req, res) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ success: false, message: 'No token provided' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        let user;
        if (decoded.role === 'admin') {
            user = await Admin.findById(decoded.userId).select('-password');
        } else {
            user = await BusinessUser.findById(decoded.userId).select('-password');
        }
        
        if (!user) {
            return res.status(401).json({ success: false, message: 'User not found' });
        }
        
        res.json({
            success: true,
            user: {
                id: user._id,
                email: user.email,
                name: user.business_name || user.name,
                role: decoded.role,
                status: user.status
            }
        });
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Invalid token' });
    }
});

// ============ AUTHENTICATION MIDDLEWARE ============

// Update authenticate middleware to check query token
const authenticate = async (req, res, next) => {
    try {
        // Check Authorization header first, then query parameter
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
        
        let user;
        if (decoded.role === 'admin') {
            user = await Admin.findById(decoded.userId).select('-password');
        } else {
            user = await BusinessUser.findById(decoded.userId).select('-password');
        }
        
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'User not found.' 
            });
        }

        req.user = user;
        req.userRole = decoded.role;
        next();
    } catch (error) {
        console.error('Auth error:', error.message);
        return res.status(401).json({ 
            success: false, 
            message: 'Invalid or expired token.' 
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

        if (!roles.includes(req.userRole)) {
            return res.status(403).json({ 
                success: false, 
                message: 'Access denied. Insufficient permissions.' 
            });
        }

        next();
    };
};

// ============ ADMIN BUSINESS MANAGEMENT ENDPOINTS ============

// Get all businesses (with filtering)
app.get('/api/admin/businesses', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { status, page = 1, limit = 20, search } = req.query;
        let query = {};
        
        if (status && status !== 'all') {
            query.status = status;
        }
        
        if (search) {
            query.$or = [
                { business_name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { contact_name: { $regex: search, $options: 'i' } }
            ];
        }
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const [businesses, total] = await Promise.all([
            BusinessUser.find(query)
                .select('-password')
                .sort({ created_at: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            BusinessUser.countDocuments(query)
        ]);
        
        res.json({
            success: true,
            businesses: businesses.map(b => ({
                _id: b._id,
                business_name: b.business_name,
                email: b.email,
                contact_name: b.contact_name,
                phone: b.phone,
                business_type: b.business_type,
                status: b.status,
                created_at: b.created_at,
                approved_at: b.approved_at
            })),
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get business stats
app.get('/api/admin/businesses/stats', authenticate, authorize('admin'), async (req, res) => {
    try {
        const [total, pending, approved, rejected] = await Promise.all([
            BusinessUser.countDocuments(),
            BusinessUser.countDocuments({ status: 'pending' }),
            BusinessUser.countDocuments({ status: 'approved' }),
            BusinessUser.countDocuments({ status: 'rejected' })
        ]);
        
        res.json({
            success: true,
            stats: {
                total,
                pending,
                approved,
                rejected
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get single business by ID
app.get('/api/admin/businesses/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const business = await BusinessUser.findById(req.params.id).select('-password');
        
        if (!business) {
            return res.status(404).json({ success: false, error: 'Business not found' });
        }

        res.json({
            success: true,
            business: {
                _id: business._id,
                business_name: business.business_name,
                email: business.email,
                contact_name: business.contact_name,
                phone: business.phone,
                business_type: business.business_type,
                status: business.status,
                rejection_reason: business.rejection_reason,
                created_at: business.created_at,
                approved_at: business.approved_at
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});


// Approve business
app.post('/api/admin/businesses/:id/approve', authenticate, authorize('admin'), async (req, res) => {
    try {
        const business = await BusinessUser.findById(req.params.id);
        
        if (!business) {
            return res.status(404).json({ success: false, error: 'Business not found' });
        }
        
        business.status = 'approved';
        business.approved_at = new Date();
        business.approved_by = req.user._id;
        business.rejection_reason = undefined;
        
        await business.save();
        
        res.json({
            success: true,
            message: 'Business approved successfully',
            business: {
                _id: business._id,
                business_name: business.business_name,
                email: business.email,
                status: business.status
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Reject business
app.post('/api/admin/businesses/:id/reject', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { reason } = req.body;
        
        if (!reason) {
            return res.status(400).json({ success: false, error: 'Rejection reason is required' });
        }
        
        const business = await BusinessUser.findById(req.params.id);
        
        if (!business) {
            return res.status(404).json({ success: false, error: 'Business not found' });
        }
        
        business.status = 'rejected';
        business.rejection_reason = reason;
        business.approved_by = req.user._id;
        
        await business.save();
        
        res.json({
            success: true,
            message: 'Business rejected',
            business: {
                _id: business._id,
                business_name: business.business_name,
                email: business.email,
                status: business.status,
                rejection_reason: business.rejection_reason
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ VOTING SYSTEM ROUTES ============

// Check if voting is active
app.get('/api/voting/status', async (req, res) => {
    try {
        const now = new Date();
        const votingStart = new Date('2026-06-01');
        const votingEnd = new Date('2026-07-30T23:59:59');
        
        res.json({
            success: true,
            isActive: now >= votingStart && now <= votingEnd,
            startDate: votingStart,
            endDate: votingEnd,
            daysRemaining: Math.max(0, Math.ceil((votingEnd - now) / (1000 * 60 * 60 * 24)))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get all businesses eligible for voting
app.get('/api/voting/businesses', async (req, res) => {
    try {
        const { category, page = 1, limit = 20 } = req.query;
        
        let query = { status: 'approved' };
        if (category && category !== 'all') {
            query.business_category = category;
        }
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const businesses = await BusinessUser.find(query)
            .select('business_name email business_category location logo')
            .skip(skip)
            .limit(parseInt(limit));
        
        // Get vote totals for each business
        const businessIds = businesses.map(b => b._id.toString());
        const voteTotals = await VoteTotal.find({ business_id: { $in: businessIds } });
        
        const voteMap = {};
        voteTotals.forEach(vt => {
            voteMap[vt.business_id] = {
                total_votes: vt.total_votes,
                average_score: vt.average_score,
                rank: vt.rank
            };
        });
        
        const total = await BusinessUser.countDocuments(query);
        
        res.json({
            success: true,
            businesses: businesses.map(b => ({
                _id: b._id,
                business_name: b.business_name,
                category: b.business_category,
                location: b.location,
                logo: b.logo,
                vote_stats: voteMap[b._id.toString()] || { total_votes: 0, average_score: 0 }
            })),
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get leaderboard
app.get('/api/voting/leaderboard', async (req, res) => {
    try {
        const { category, limit = 20 } = req.query;
        
        let query = {};
        if (category && category !== 'all') {
            query.category = category;
        }
        
        const leaders = await VoteTotal.find(query)
            .sort({ average_score: -1, total_votes: -1 })
            .limit(parseInt(limit));
        
        // Add rank
        const leaderboard = leaders.map((leader, index) => ({
            rank: index + 1,
            business_id: leader.business_id,
            business_name: leader.business_name,
            category: leader.category,
            total_votes: leader.total_votes,
            average_score: leader.average_score,
            public_votes: leader.public_votes,
            jury_votes: leader.jury_votes
        }));
        
        res.json({ success: true, leaderboard });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Cast a vote
app.post('/api/voting/cast', [
    body('business_id').notEmpty(),
    body('business_name').notEmpty(),
    body('category').notEmpty(),
    body('vote_value').isInt({ min: 1, max: 10 }),
    body('voter_email').isEmail()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }
        
        const { business_id, business_name, category, vote_value, voter_email, verification_code } = req.body;
        
        // Check voting period
        const now = new Date();
        const votingStart = new Date('2026-06-01');
        const votingEnd = new Date('2026-07-30T23:59:59');
        
        if (now < votingStart) {
            return res.status(403).json({ success: false, error: 'Voting has not started yet' });
        }
        
        if (now > votingEnd) {
            return res.status(403).json({ success: false, error: 'Voting period has ended' });
        }
        
        // Verify email
        let isVerified = false;
        if (verification_code) {
            const verification = await VoteVerification.findOne({
                email: voter_email,
                code: verification_code,
                verified: false,
                expires_at: { $gt: now }
            });
            
            if (verification) {
                verification.verified = true;
                verification.used_at = now;
                await verification.save();
                isVerified = true;
            }
        }
        
        if (!isVerified) {
            return res.status(403).json({ success: false, error: 'Email verification required' });
        }
        
        // Check for duplicate vote
        const existingVote = await Vote.findOne({
            business_id: business_id,
            voter_email: voter_email
        });
        
        if (existingVote) {
            return res.status(403).json({ success: false, error: 'You have already voted for this business' });
        }
        
        // Determine vote weight (jury vs public)
        const isJury = req.user?.role === 'admin';
        const voteWeight = isJury ? 3 : 1;
        
        // Save vote
        const vote = new Vote({
            business_id,
            business_name,
            category,
            voter_email,
            voter_ip: req.ip,
            vote_value,
            vote_weight: voteWeight,
            is_verified: true,
            is_jury: isJury
        });
        
        await vote.save();
        
        // Update vote totals
        await updateVoteTotals(business_id, business_name, category);
        
        res.json({
            success: true,
            message: 'Your vote has been recorded!',
            vote_id: vote._id
        });
        
    } catch (error) {
        console.error('Cast vote error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Send verification code
app.post('/api/voting/send-verification', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ success: false, error: 'Email is required' });
        }
        
        // Generate verification code
        const code = Math.random().toString(36).substring(2, 10).toUpperCase();
        
        // Save to database
        await VoteVerification.findOneAndDelete({ email }); // Remove old
        await VoteVerification.create({
            email,
            code,
            verified: false,
            expires_at: new Date(Date.now() + 30 * 60 * 1000)
        });
        
        // In production, send actual email
        console.log(`📧 Verification code for ${email}: ${code}`);
        
        res.json({
            success: true,
            message: 'Verification code sent to your email'
        });
        
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Verify verification code
app.post('/api/voting/verify', async (req, res) => {
    try {
        const { email, code } = req.body;
        
        if (!email || !code) {
            return res.status(400).json({ success: false, error: 'Email and code are required' });
        }
        
        const verification = await VoteVerification.findOne({
            email: email,
            code: code,
            verified: false,
            expires_at: { $gt: new Date() }
        });
        
        if (!verification) {
            return res.status(400).json({ success: false, error: 'Invalid or expired verification code' });
        }
        
        // Mark as verified but don't delete yet (will be used when casting vote)
        verification.verified = true;
        await verification.save();
        
        res.json({ 
            success: true, 
            verified: true, 
            message: 'Email verified successfully!' 
        });
        
    } catch (error) {
        console.error('Verify error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get vote statistics for a business
app.get('/api/voting/business/:businessId/stats', async (req, res) => {
    try {
        const { businessId } = req.params;
        
        const voteTotal = await VoteTotal.findOne({ business_id: businessId });
        const recentVotes = await Vote.find({ business_id: businessId })
            .sort({ created_at: -1 })
            .limit(10)
            .select('vote_value vote_weight created_at is_jury');
        
        res.json({
            success: true,
            stats: voteTotal || {
                business_id: businessId,
                total_votes: 0,
                average_score: 0,
                public_votes: 0,
                jury_votes: 0
            },
            recent_votes: recentVotes
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Admin: Get all votes
app.get('/api/admin/votes', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { page = 1, limit = 50, business_id, status } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        let query = {};
        if (business_id) query.business_id = business_id;
        
        const votes = await Vote.find(query)
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(parseInt(limit));
        
        const total = await Vote.countDocuments(query);
        
        res.json({
            success: true,
            votes,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Admin: Update vote totals (recalculate)
app.post('/api/admin/votes/recalculate', authenticate, authorize('admin'), async (req, res) => {
    try {
        await recalculateAllVoteTotals();
        res.json({ success: true, message: 'Vote totals recalculated' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Helper function to update vote totals
async function updateVoteTotals(businessId, businessName, category) {
    const votes = await Vote.find({ business_id: businessId });
    
    let totalScore = 0;
    let voteCount = 0;
    let publicVotes = 0;
    let juryVotes = 0;
    
    votes.forEach(vote => {
        totalScore += vote.vote_value * vote.vote_weight;
        voteCount += vote.vote_weight;
        if (vote.is_jury) {
            juryVotes++;
        } else {
            publicVotes++;
        }
    });
    
    const averageScore = voteCount > 0 ? totalScore / voteCount : 0;
    
    await VoteTotal.findOneAndUpdate(
        { business_id: businessId },
        {
            business_name: businessName,
            category,
            total_votes: voteCount,
            average_score: averageScore,
            public_votes: publicVotes,
            jury_votes: juryVotes
        },
        { upsert: true }
    );
}

// Helper function to recalculate all vote totals
async function recalculateAllVoteTotals() {
    const allBusinesses = await Vote.distinct('business_id');
    
    for (const businessId of allBusinesses) {
        const business = await BusinessUser.findById(businessId);
        if (business) {
            await updateVoteTotals(businessId, business.business_name, business.business_category);
        }
    }
    
    // Update ranks
    const allTotals = await VoteTotal.find().sort({ average_score: -1 });
    for (let i = 0; i < allTotals.length; i++) {
        allTotals[i].rank = i + 1;
        await allTotals[i].save();
    }
}

// ============ BUSINESS PROFILE ROUTES ============

// Get business profile
app.get('/api/business/profile', authenticate, authorize('business'), async (req, res) => {
    try {
        const business = await BusinessUser.findById(req.user._id).select('-password');
        
        if (!business) {
            return res.status(404).json({ success: false, message: 'Business not found' });
        }
        
        res.json({
            success: true,
            profile: {
                _id: business._id,
                business_name: business.business_name,
                email: business.email,
                contact_name: business.contact_name,
                phone: business.phone,
                business_type: business.business_type,
                industry: business.industry,
                business_category: business.business_category,
                location: business.location,
                website: business.website,
                description: business.description,
                address: business.address,
                logo: business.logo,
                status: business.status,
                verified: business.verified,
                created_at: business.created_at
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update business profile
app.put('/api/business/profile', authenticate, authorize('business'), upload.single('logo'), async (req, res) => {
    try {
        const business = await BusinessUser.findById(req.user._id);
        
        if (!business) {
            return res.status(404).json({ success: false, message: 'Business not found' });
        }
        
        // Update fields
        const allowedFields = [
            'business_name', 'contact_name', 'phone', 'business_type', 'industry',
            'business_category', 'location', 'website', 'description', 'address'
        ];
        
        allowedFields.forEach(field => {
            if (req.body[field] !== undefined) {
                business[field] = req.body[field];
            }
        });
        
        // Handle logo upload
        if (req.file) {
            const logoUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
            business.logo = logoUrl;
        }
        
        await business.save();
        
        res.json({
            success: true,
            message: 'Profile updated successfully',
            profile: {
                business_name: business.business_name,
                email: business.email,
                contact_name: business.contact_name,
                phone: business.phone,
                logo: business.logo
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============ OPPORTUNITY ROUTES ============

// Get all active opportunities (public/business view)
app.get('/api/opportunities', async (req, res) => {
    try {
        const { type, featured, limit = 20, page = 1 } = req.query;
        let query = { status: 'active', deadline: { $gte: new Date() } };
        
        if (type && type !== 'all') query.type = type;
        if (featured === 'true') query.featured = true;
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const opportunities = await Opportunity.find(query)
            .sort({ featured: -1, deadline: 1, created_at: -1 })
            .skip(skip)
            .limit(parseInt(limit));
        
        const total = await Opportunity.countDocuments(query);
        
        res.json({
            success: true,
            opportunities: opportunities,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get single opportunity
app.get('/api/opportunities/:id', async (req, res) => {
    try {
        const opportunity = await Opportunity.findById(req.params.id);
        if (!opportunity) {
            return res.status(404).json({ success: false, message: 'Opportunity not found' });
        }
        res.json({ success: true, opportunity });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Admin: Create opportunity
app.post('/api/admin/opportunities', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { title, type, description, requirements, benefits, deadline, application_link, image_url, status, featured } = req.body;
        
        if (!title || !type || !description || !deadline) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }
        
        const opportunity = new Opportunity({
            title,
            type,
            description,
            requirements,
            benefits,
            deadline: new Date(deadline),
            application_link,
            image_url,
            status: status || 'active',
            featured: featured || false,
            created_by: req.user._id
        });
        
        await opportunity.save();
        
        res.status(201).json({
            success: true,
            message: 'Opportunity created successfully',
            opportunity
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Admin: Update opportunity
app.put('/api/admin/opportunities/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const opportunity = await Opportunity.findById(req.params.id);
        if (!opportunity) {
            return res.status(404).json({ success: false, message: 'Opportunity not found' });
        }
        
        const { title, type, description, requirements, benefits, deadline, application_link, image_url, status, featured } = req.body;
        
        if (title) opportunity.title = title;
        if (type) opportunity.type = type;
        if (description) opportunity.description = description;
        if (requirements) opportunity.requirements = requirements;
        if (benefits) opportunity.benefits = benefits;
        if (deadline) opportunity.deadline = new Date(deadline);
        if (application_link) opportunity.application_link = application_link;
        if (image_url) opportunity.image_url = image_url;
        if (status) opportunity.status = status;
        if (featured !== undefined) opportunity.featured = featured;
        opportunity.updated_at = new Date();
        
        await opportunity.save();
        
        res.json({
            success: true,
            message: 'Opportunity updated successfully',
            opportunity
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Admin: Delete opportunity
app.delete('/api/admin/opportunities/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const opportunity = await Opportunity.findByIdAndDelete(req.params.id);
        if (!opportunity) {
            return res.status(404).json({ success: false, message: 'Opportunity not found' });
        }
        res.json({ success: true, message: 'Opportunity deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Business: Apply for opportunity
app.post('/api/opportunities/:id/apply', authenticate, authorize('business'), async (req, res) => {
    try {
        const opportunity = await Opportunity.findById(req.params.id);
        if (!opportunity) {
            return res.status(404).json({ success: false, message: 'Opportunity not found' });
        }
        
        if (opportunity.status !== 'active' || new Date(opportunity.deadline) < new Date()) {
            return res.status(400).json({ success: false, message: 'This opportunity is no longer available' });
        }
        
        const { message } = req.body;
        
        // Check if already applied
        const existingApplication = await OpportunityApplication.findOne({
            opportunity_id: req.params.id,
            business_id: req.user._id
        });
        
        if (existingApplication) {
            return res.status(400).json({ success: false, message: 'You have already applied for this opportunity' });
        }
        
        const application = new OpportunityApplication({
            opportunity_id: req.params.id,
            business_id: req.user._id,
            business_name: req.user.business_name,
            contact_name: req.user.contact_name || req.user.name,
            contact_email: req.user.email,
            contact_phone: req.user.phone,
            message: message || ''
        });
        
        await application.save();
        
        // Create notification for admin
        const adminNotification = new Notification({
            business_id: req.user._id,
            title: 'New Opportunity Application',
            message: `${req.user.business_name} has applied for "${opportunity.title}"`,
            type: 'info',
            read: false
        });
        await adminNotification.save();
        
        res.json({
            success: true,
            message: 'Application submitted successfully!'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get applications for an opportunity (admin only)
app.get('/api/admin/opportunities/:id/applications', authenticate, authorize('admin'), async (req, res) => {
    try {
        const applications = await OpportunityApplication.find({ opportunity_id: req.params.id })
            .sort({ applied_at: -1 });
        
        res.json({
            success: true,
            applications
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============ BUSINESS NOMINATION ROUTES ============

// Get business nominations
app.get('/api/business/nominations', authenticate, authorize('business'), async (req, res) => {
    try {
        const { page = 1, limit = 10, status } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        let query = { business_id: req.user._id };
        if (status && status !== 'all') {
            query.status = status;
        }
        
       const nominations = await Nomination.find(query)
    .sort({ created_at: -1 })
    .skip(skip)
    .limit(parseInt(limit));
        
        const total = await Nomination.countDocuments(query);
        
        res.json({
            success: true,
            nominations: nominations.map(n => ({
                _id: n._id,
                title: n.title,
                category: n.category || 'General',
                year: n.year,
                description: n.description,
                achievements: n.achievements || [],
                status: n.status,
                score: n.score,
                document_id: n.document_id,
                created_at: n.created_at
            })),
            total,
            pages: Math.ceil(total / parseInt(limit)),
            currentPage: parseInt(page)
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create nomination
app.post('/api/business/nominations', authenticate, authorize('business'), async (req, res) => {
    try {
        const { title, category, year, description, achievements, document_id, status } = req.body;
        
        if (!title || !category || !description) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }
        
        const nomination = new Nomination({
            business_id: req.user._id,
            title,
            category,
            year: year || new Date().getFullYear(),
            description,
            achievements: achievements || [],
            document_id: document_id || null,
            status: status || 'draft'
        });
        
        await nomination.save();
        
        res.status(201).json({
            success: true,
            message: 'Nomination created successfully',
            nomination
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update nomination
app.put('/api/business/nominations/:id', authenticate, authorize('business'), async (req, res) => {
    try {
        const nomination = await Nomination.findOne({
            _id: req.params.id,
            business_id: req.user._id
        });
        
        if (!nomination) {
            return res.status(404).json({ success: false, message: 'Nomination not found' });
        }
        
        // Only allow editing if status is draft or submitted
        if (nomination.status !== 'draft' && nomination.status !== 'submitted') {
            return res.status(403).json({ success: false, message: 'Cannot edit nomination at this stage' });
        }
        
        const { title, category, year, description, achievements, document_id, status } = req.body;
        
        if (title) nomination.title = title;
        if (category) nomination.category = category;
        if (year) nomination.year = year;
        if (description) nomination.description = description;
        if (achievements) nomination.achievements = achievements;
        if (document_id !== undefined) nomination.document_id = document_id;
        if (status) nomination.status = status;
        
        await nomination.save();
        
        res.json({
            success: true,
            message: 'Nomination updated successfully',
            nomination
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete nomination
app.delete('/api/business/nominations/:id', authenticate, authorize('business'), async (req, res) => {
    try {
        const nomination = await Nomination.findOneAndDelete({
            _id: req.params.id,
            business_id: req.user._id
        });
        
        if (!nomination) {
            return res.status(404).json({ success: false, message: 'Nomination not found' });
        }
        
        res.json({
            success: true,
            message: 'Nomination deleted successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============ VIEW DOCUMENT (INLINE) - FIXED ============
app.get('/api/business/documents/:id/view', authenticate, authorize('business'), async (req, res) => {
    try {
        console.log('🔍 View document request for ID:', req.params.id);
        
        const document = await BusinessDocument.findOne({
            _id: req.params.id,
            business_id: req.user._id
        });
        
        if (!document) {
            console.log('❌ Document not found in database');
            return res.status(404).json({ success: false, message: 'Document not found' });
        }
        
        console.log('📄 Document found:', {
            name: document.name,
            file_url: document.file_url,
            file_name: document.file_name
        });
        
        // Get just the filename from the stored path
        const fileName = path.basename(document.file_url);
        const filePath = path.join(__dirname, 'uploads', fileName);
        
        console.log('📁 Looking for file at:', filePath);
        
        // Check if file exists
        if (!fs.existsSync(filePath)) {
            console.log('❌ File not found at:', filePath);
            // Try alternative path
            const altPath = path.join('/app/uploads', fileName);
            console.log('📁 Trying alternative path:', altPath);
            if (fs.existsSync(altPath)) {
                console.log('✅ Found file at alternative path');
                return res.sendFile(altPath);
            }
            return res.status(404).json({ success: false, message: 'File not found on server' });
        }
        
        // Get file extension
        const ext = path.extname(document.file_name || fileName).toLowerCase();
        let contentType = 'application/octet-stream';
        
        switch(ext) {
            case '.pdf': contentType = 'application/pdf'; break;
            case '.jpg': case '.jpeg': contentType = 'image/jpeg'; break;
            case '.png': contentType = 'image/png'; break;
            case '.gif': contentType = 'image/gif'; break;
            case '.doc': contentType = 'application/msword'; break;
            case '.docx': contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'; break;
        }
        
        console.log('📄 Serving file with Content-Type:', contentType);
        
        // Set headers for inline viewing
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `inline; filename="${document.name}${ext}"`);
        
        // Send file
        res.sendFile(filePath);
        
    } catch (error) {
        console.error('View document error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============ DOWNLOAD DOCUMENT - FIXED ============
// Update your download endpoint to handle images properly
app.get('/api/business/documents/:id/download', authenticate, authorize('business'), async (req, res) => {
    try {
        console.log('⬇️ Download document request for ID:', req.params.id);
        
        const document = await BusinessDocument.findOne({
            _id: req.params.id,
            business_id: req.user._id
        });
        
        if (!document) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }
        
        const fileName = path.basename(document.file_url);
        const filePath = path.join(__dirname, 'uploads', fileName);
        
        if (!fs.existsSync(filePath)) {
            const altPath = path.join('/app/uploads', fileName);
            if (fs.existsSync(altPath)) {
                // FIXED: Set proper headers for images
                const ext = path.extname(document.file_name || fileName).toLowerCase();
                let contentType = 'application/octet-stream';
                
                if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
                else if (ext === '.png') contentType = 'image/png';
                else if (ext === '.gif') contentType = 'image/gif';
                else if (ext === '.pdf') contentType = 'application/pdf';
                else if (ext === '.doc') contentType = 'application/msword';
                else if (ext === '.docx') contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
                
                res.setHeader('Content-Type', contentType);
                res.setHeader('Content-Disposition', `attachment; filename="${document.name}${ext}"`);
                return res.sendFile(altPath);
            }
            return res.status(404).json({ success: false, message: 'File not found' });
        }
        
        const ext = path.extname(document.file_name || fileName).toLowerCase();
        let contentType = 'application/octet-stream';
        
        if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
        else if (ext === '.png') contentType = 'image/png';
        else if (ext === '.gif') contentType = 'image/gif';
        else if (ext === '.pdf') contentType = 'application/pdf';
        else if (ext === '.doc') contentType = 'application/msword';
        else if (ext === '.docx') contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${document.name}${ext}"`);
        res.sendFile(filePath);
        
    } catch (error) {
        console.error('Download error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============ ADMIN VIEW DOCUMENT (for admin dashboard) ============
app.get('/api/admin/documents/:id/view', authenticate, authorize('admin'), async (req, res) => {
    try {
        const document = await BusinessDocument.findById(req.params.id);
        
        if (!document) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }
        
        // Construct full file path
        const filePath = path.join(__dirname, document.file_url);
        
        // Check if file exists
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: 'File not found on server' });
        }
        
        // Get file extension
        const ext = path.extname(document.file_name || document.file_url).toLowerCase();
        let contentType = 'application/octet-stream';
        
        switch(ext) {
            case '.pdf':
                contentType = 'application/pdf';
                break;
            case '.jpg':
            case '.jpeg':
                contentType = 'image/jpeg';
                break;
            case '.png':
                contentType = 'image/png';
                break;
        }
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `inline; filename="${document.name}${ext}"`);
        
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
        
    } catch (error) {
        console.error('Admin view document error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============ ADMIN DOWNLOAD DOCUMENT ============
app.get('/api/admin/documents/:id/download', authenticate, authorize('admin'), async (req, res) => {
    try {
        const document = await BusinessDocument.findById(req.params.id);
        
        if (!document) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }
        
        const filePath = path.join(__dirname, document.file_url);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: 'File not found on server' });
        }
        
        const ext = path.extname(document.file_name || document.file_url);
        
        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${document.name}${ext}"`);
        
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
        
    } catch (error) {
        console.error('Admin download document error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============ BUSINESS DOCUMENT ROUTES ============

// Get business documents
app.get('/api/business/documents', authenticate, authorize('business'), async (req, res) => {
    try {
        const { page = 1, limit = 12 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const documents = await BusinessDocument.find({ business_id: req.user._id })
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(parseInt(limit));
        
        const total = await BusinessDocument.countDocuments({ business_id: req.user._id });
        
        res.json({
            success: true,
            documents: documents.map(d => ({
                _id: d._id,
                name: d.name,
                type: d.type,
                file_url: d.file_url,
                uploaded_at: d.created_at
            })),
            total,
            pages: Math.ceil(total / parseInt(limit)),
            currentPage: parseInt(page)
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Upload document
app.post('/api/business/documents', authenticate, authorize('business'), upload.single('document'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        
        const { name, type } = req.body;
        
        if (!name) {
            return res.status(400).json({ success: false, message: 'Document name is required' });
        }
        
        // IMPORTANT: Store the correct file path for retrieval
        const fileUrl = `/uploads/${req.file.filename}`;
        
        const document = new BusinessDocument({
            business_id: req.user._id,
            name,
            type: type || 'other',
            file_url: fileUrl,  // Store relative path
            file_name: req.file.originalname,
            file_size: req.file.size,
            mime_type: req.file.mimetype
        });
        
        await document.save();
        
        res.status(201).json({
            success: true,
            message: 'Document uploaded successfully',
            document: {
                _id: document._id,
                name: document.name,
                type: document.type,
                file_url: document.file_url
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});
// Delete document
app.delete('/api/business/documents/:id', authenticate, authorize('business'), async (req, res) => {
    try {
        const document = await BusinessDocument.findOneAndDelete({
            _id: req.params.id,
            business_id: req.user._id
        });
        
        if (!document) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }
        
        // Delete file from filesystem
        const filePath = path.join(__dirname, document.file_url);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        
        res.json({
            success: true,
            message: 'Document deleted successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============ ADMIN DOCUMENT MANAGEMENT ROUTES ============
// Get all documents for a specific business (admin only)
app.get('/api/admin/businesses/:businessId/documents', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { businessId } = req.params;
        const { page = 1, limit = 50 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        // Verify business exists
        const business = await BusinessUser.findById(businessId);
        if (!business) {
            return res.status(404).json({ success: false, message: 'Business not found' });
        }
        
        const documents = await BusinessDocument.find({ business_id: businessId })
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(parseInt(limit));
        
        const total = await BusinessDocument.countDocuments({ business_id: businessId });
        
        res.json({
            success: true,
            documents: documents.map(d => ({
                _id: d._id,
                name: d.name,
                type: d.type,
                file_url: d.file_url,
                file_name: d.file_name,
                file_size: d.file_size,
                uploaded_at: d.created_at
            })),
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Admin get documents error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Upload document for a specific business (admin only)
app.post('/api/admin/businesses/:businessId/documents', authenticate, authorize('admin'), upload.single('document'), async (req, res) => {
    try {
        const { businessId } = req.params;
        const { name, type } = req.body;
        
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        
        if (!name) {
            return res.status(400).json({ success: false, message: 'Document name is required' });
        }
        
        // Verify business exists
        const business = await BusinessUser.findById(businessId);
        if (!business) {
            return res.status(404).json({ success: false, message: 'Business not found' });
        }
        
        const fileUrl = `/uploads/${req.file.filename}`;
        
        const document = new BusinessDocument({
            business_id: businessId,
            name,
            type: type || 'other',
            file_url: fileUrl,
            file_name: req.file.originalname,
            file_size: req.file.size,
            mime_type: req.file.mimetype
        });
        
        await document.save();
        
        // Create notification for the business
        const notification = new Notification({
            business_id: businessId,
            title: 'New Document Uploaded',
            message: `Admin has uploaded "${name}" to your account.`,
            type: 'info',
            read: false
        });
        await notification.save();
        
        // Also send email notification
        try {
            const emailHtml = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #FF0000;">New Document Uploaded</h2>
                    <p>Dear ${business.business_name},</p>
                    <p>An administrator has uploaded a new document to your business account:</p>
                    <ul>
                        <li><strong>Document:</strong> ${name}</li>
                        <li><strong>Type:</strong> ${type || 'other'}</li>
                        <li><strong>Uploaded:</strong> ${new Date().toLocaleString()}</li>
                    </ul>
                    <p>Please log in to your dashboard to view this document.</p>
                    <hr>
                    <p style="font-size: 12px; color: #666;">Liberia Business Awards</p>
                </div>
            `;
            
            if (emailTransporter) {
                await emailTransporter.sendMail({
                    from: '"Liberia Business Awards" <liberiabusinessawards@gmail.com>',
                    to: business.email,
                    subject: `New Document Uploaded - ${name}`,
                    html: emailHtml
                });
            }
            console.log(`📧 Document upload notification sent to ${business.email}`);
        } catch (emailError) {
            console.error('Email notification failed:', emailError);
        }
        
        res.status(201).json({
            success: true,
            message: 'Document uploaded successfully',
            document: {
                _id: document._id,
                name: document.name,
                type: document.type,
                file_url: document.file_url
            }
        });
    } catch (error) {
        console.error('Admin upload document error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete document (admin only)
app.delete('/api/admin/documents/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const document = await BusinessDocument.findById(req.params.id);
        
        if (!document) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }
        
        // Delete file from filesystem
        const filePath = path.join(__dirname, document.file_url);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        
        await BusinessDocument.findByIdAndDelete(req.params.id);
        
        res.json({
            success: true,
            message: 'Document deleted successfully'
        });
    } catch (error) {
        console.error('Admin delete document error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============ BUSINESS NOTIFICATION ROUTES ============

// Get notifications
app.get('/api/business/notifications', authenticate, authorize('business'), async (req, res) => {
    try {
        const notifications = await Notification.find({ business_id: req.user._id })
            .sort({ created_at: -1 })
            .limit(50);
        
        res.json({
            success: true,
            notifications: notifications.map(n => ({
                _id: n._id,
                title: n.title,
                message: n.message,
                type: n.type,
                read: n.read,
                created_at: n.created_at
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Mark notification as read
app.post('/api/business/notifications/:id/read', authenticate, authorize('business'), async (req, res) => {
    try {
        await Notification.updateOne(
            { _id: req.params.id, business_id: req.user._id },
            { read: true }
        );
        
        res.json({ success: true, message: 'Notification marked as read' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Mark all notifications as read
app.post('/api/business/notifications/read-all', authenticate, authorize('business'), async (req, res) => {
    try {
        await Notification.updateMany(
            { business_id: req.user._id, read: false },
            { read: true }
        );
        
        res.json({ success: true, message: 'All notifications marked as read' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============ CHANGE PASSWORD ============
app.post('/api/auth/change-password', authenticate, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, message: 'Current and new password are required' });
        }
        
        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
        }
        
        const user = await BusinessUser.findById(req.user._id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        const isValid = await user.comparePassword(currentPassword);
        if (!isValid) {
            return res.status(401).json({ success: false, message: 'Current password is incorrect' });
        }
        
        user.password = newPassword;
        await user.save();
        
        res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============ EMAIL SENDING FUNCTION ============
const nodemailer = require('nodemailer');

// Configure email transporter (for production)
let emailTransporter = null;

// Initialize email transporter if Gmail credentials are available
if (process.env.GMAIL_APP_PASSWORD) {
    emailTransporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: 'liberiabusinessawards@gmail.com',
            pass: process.env.GMAIL_APP_PASSWORD
        }
    });
    console.log('✅ Email transporter configured for Gmail');
} else {
    console.log('⚠️ GMAIL_APP_PASSWORD not set - Email sending will be simulated');
}

async function sendPasswordResetEmail(toEmail, userName, resetUrl, userType) {
    try {
        const subject = `Password Reset Request - Liberia Business Awards`;
        
        const htmlBody = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Password Reset - Liberia Business Awards</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #FF0000, #87CEEB); color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; }
        .reset-btn { display: inline-block; background: #FF0000; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
        .warning { background: #fef2f2; padding: 15px; border-left: 4px solid #EF4444; margin: 20px 0; }
        .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Liberia Business Awards</h1>
        </div>
        <div class="content">
            <p>Dear ${userName || 'Valued User'},</p>
            <p>We received a request to reset the password for your ${userType === 'admin' ? 'Administrator' : 'Business'} account.</p>
            <div style="text-align: center;">
                <a href="${resetUrl}" class="reset-btn">Reset Your Password</a>
            </div>
            <div class="warning">
                <p><strong>⚠️ This link will expire in 1 hour.</strong></p>
                <p>If you did not request a password reset, please ignore this email.</p>
            </div>
            <p>Or copy this link: ${resetUrl}</p>
        </div>
        <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Liberia Business Awards. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
        `;
        
        // If email transporter is configured, send real email
        if (emailTransporter) {
            const mailOptions = {
                from: '"Liberia Business Awards" <liberiabusinessawards@gmail.com>',
                to: toEmail,
                subject: subject,
                html: htmlBody,
                text: `Reset your password: ${resetUrl}`
            };
            
            const info = await emailTransporter.sendMail(mailOptions);
            console.log('✅ Email sent:', info.messageId);
            return true;
        } else {
            // Development mode: just log the reset URL
            console.log('📧 DEVELOPMENT MODE - Reset link would be sent to:', toEmail);
            console.log('🔗 Reset URL:', resetUrl);
            return true; // Return true in development mode
        }
        
    } catch (error) {
        console.error('❌ Email sending failed:', error);
        return false;
    }
}
// ============ END OF EMAIL FUNCTION ============

// Forgot Password - Request reset link with REAL EMAIL
app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }
        
        // Find user by email
        let user = await Admin.findOne({ email: email.toLowerCase() });
        let userType = 'admin';
        let userName = user?.name || '';
        
        if (!user) {
            user = await BusinessUser.findOne({ email: email.toLowerCase() });
            userType = 'business';
            userName = user?.business_name || '';
        }
        
        if (!user) {
            // Security: Don't reveal that email doesn't exist
            return res.json({ success: true, message: 'If an account exists, a password reset link has been sent to your email.' });
        }
        
        // Generate reset token (expires in 1 hour)
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenExpiry = Date.now() + 3600000; // 1 hour
        
        // Store reset token in database
        user.reset_password_token = resetToken;
        user.reset_password_expires = resetTokenExpiry;
        await user.save();
        
        // Create reset URL (frontend URL)
        const frontendUrl = process.env.FRONTEND_URL || 'https://liberiabusinessawardslr.com';
        const resetUrl = `${frontendUrl}/reset-password.html?token=${resetToken}&type=${userType}`;
        
        // ============ SEND EMAIL USING GMAIL ============
        const emailSent = await sendPasswordResetEmail(email, userName, resetUrl, userType);
        
        if (emailSent) {
            res.json({ 
                success: true, 
                message: 'Password reset link has been sent to your email. Please check your inbox.' 
            });
        } else {
            // Still return success for security, but log error
            console.error(`Failed to send reset email to ${email}`);
            res.json({ 
                success: true, 
                message: 'If an account exists, a password reset link has been sent to your email.' 
            });
        }
        
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
    }
});

// ============ RESET PASSWORD ENDPOINT ============
// Reset Password - Use token to set new password
app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { token, newPassword, userType } = req.body;
        
        if (!token || !newPassword) {
            return res.status(400).json({ success: false, message: 'Token and new password are required' });
        }
        
        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }
        
        // Find user by reset token
        let user;
        if (userType === 'admin') {
            user = await Admin.findOne({
                reset_password_token: token,
                reset_password_expires: { $gt: Date.now() }
            });
        } else {
            user = await BusinessUser.findOne({
                reset_password_token: token,
                reset_password_expires: { $gt: Date.now() }
            });
        }
        
        if (!user) {
            return res.status(400).json({ success: false, message: 'Password reset token is invalid or has expired.' });
        }
        
        // Update password
        user.password = newPassword;
        user.reset_password_token = undefined;
        user.reset_password_expires = undefined;
        await user.save();
        
        res.json({ success: true, message: 'Password has been reset successfully. You can now login with your new password.' });
        
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
    }
});

// ============ ACCOUNT DELETION ENDPOINT  ============
app.delete('/api/business/account', authenticate, authorize('business'), async (req, res) => {
    try {
        const { password } = req.body;
        
        if (!password) {
            return res.status(400).json({ success: false, message: 'Password is required to delete account' });
        }
        
        const business = await BusinessUser.findById(req.user._id);
        if (!business) {
            return res.status(404).json({ success: false, message: 'Business not found' });
        }
        
        // Verify password
        const isValid = await business.comparePassword(password);
        if (!isValid) {
            return res.status(401).json({ success: false, message: 'Invalid password' });
        }
        
        // Delete all related data
        await Nomination.deleteMany({ business_id: business._id });
        await BusinessDocument.deleteMany({ business_id: business._id });
        await Notification.deleteMany({ business_id: business._id });
        
        // Delete the business account
        await BusinessUser.findByIdAndDelete(business._id);
        
        res.json({ 
            success: true, 
            message: 'Account deleted successfully' 
        });
    } catch (error) {
        console.error('Account deletion error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});


// ============================================
// DELETE BUSINESS ACCOUNT (COMPLETE REMOVAL)
// ============================================
app.delete('/api/admin/businesses/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const businessId = req.params.id;
        
        // Find the business first
        const business = await BusinessUser.findById(businessId);
        if (!business) {
            return res.status(404).json({ 
                success: false, 
                message: 'Business not found' 
            });
        }
        
        console.log(`🗑️ Admin ${req.user.email} deleting business: ${business.business_name} (${business.email})`);
        
        // Delete all related data
        await Nomination.deleteMany({ business_id: businessId });
        await BusinessDocument.deleteMany({ business_id: businessId });
        await Notification.deleteMany({ business_id: businessId });
        await RefreshToken.deleteMany({ user_id: businessId, user_type: 'business' });
        
        // Delete the business account
        await BusinessUser.findByIdAndDelete(businessId);
        
        res.json({
            success: true,
            message: `Business "${business.business_name}" has been permanently deleted`
        });
        
    } catch (error) {
        console.error('Delete business error:', error);
        res.status(500).json({ 
            success: false, 
            message: error.message || 'Failed to delete business'
        });
    }
});

// ============ START SERVER ============
async function startServer() {
    console.log('='.repeat(70));
    console.log('🚀 LIBERIA BUSINESS AWARDS - PRODUCTION SYSTEM V5.0');
    console.log('='.repeat(70));
    console.log(`📡 PORT: ${PORT}`);
    console.log(`🌍 NODE_ENV: ${process.env.NODE_ENV}`);
    
    connectToMongoDB().catch(err => {
        console.error('MongoDB connection error:', err.message);
    });
    
    const server = app.listen(PORT, '0.0.0.0', () => {
        console.log('\n✅ SERVER RUNNING');
        console.log('='.repeat(70));
        console.log(`📡 Port: ${PORT}`);
        console.log(`🌍 Health: liberia-business-awards-production.up.railway.app/api/health`);
        console.log('='.repeat(70));
        console.log('\n🚀 System ready!');
    });


    server.on('error', (error) => {
        console.error('❌ Server error:', error);
        process.exit(1);
    });
}

// Diagnostic endpoint - Check what files are in uploads
app.get('/api/debug/uploads-list', authenticate, authorize('business'), async (req, res) => {
    try {
        const files = fs.existsSync(uploadDir) ? fs.readdirSync(uploadDir) : [];
        
        const documents = await BusinessDocument.find({ business_id: req.user._id });
        
        res.json({
            success: true,
            uploads_directory: uploadDir,
            physical_files: files,
            database_documents: documents.map(d => ({
                id: d._id,
                name: d.name,
                stored_path: d.file_url,
                filename_from_path: path.basename(d.file_url)
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});
startServer();
