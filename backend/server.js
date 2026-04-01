// ============================================
// LIBERIA BUSINESS AWARDS - PRODUCTION SYSTEM V5.0
// COMPLETE AUTHENTICATION SYSTEM WITH ALL MODELS
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
const PORT = process.env.PORT || 10000;

// ============ CORS CONFIGURATION - MUST BE FIRST ============
const corsOptions = {
    origin: function (origin, callback) {
        // Allowed origins
        const allowedOrigins = [
            'https://liberiabusinessawardslr.com',
            'https://www.liberiabusinessawardslr.com',
            'https://liberia-business-awards.up.railway.app',
            'http://localhost:5500',
            'http://localhost:3000',
            'http://127.0.0.1:5500',
            'http://127.0.0.1:3000',
            'http://localhost:5501',
            'http://127.0.0.1:5501'
        ];
        
        // Allow all origins - this will definitely work
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'Accept', 'Origin', 'X-Requested-With'],
    credentials: false,
    optionsSuccessStatus: 200
}));

// Add a custom middleware to ensure CORS headers are always present
app.use((req, res, next) => {
    // Set CORS headers for every response
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token, Accept, Origin, X-Requested-With');
    res.header('Access-Control-Allow-Credentials', 'false');
    
    // Handle preflight requests immediately
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    
    next();
});

// Log all requests for debugging
app.use((req, res, next) => {
    console.log(`📡 ${req.method} ${req.url} - Origin: ${req.headers.origin || 'no origin'}`);
    next();
});

// SIMPLE HEALTH CHECK - MUST COME FIRST
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Server is running',
        timestamp: new Date().toISOString(),
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        cors_enabled: true
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

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// ============ RATE LIMITING ============
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts per window
    message: { success: false, message: 'Too many login attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60, // 60 requests per minute
    message: { success: false, message: 'Rate limit exceeded. Please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// ============ MIDDLEWARE ============
app.set('trust proxy', 1);

app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
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

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============ CSRF TOKEN GENERATION ============
app.use((req, res, next) => {
    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }
    res.locals.csrfToken = req.session.csrfToken;
    next();
});

// CSRF Protection Middleware (for state-changing requests)
const csrfProtection = (req, res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        const token = req.headers['x-csrf-token'] || req.body._csrf;
        
        if (!token || token !== req.session.csrfToken) {
            return res.status(403).json({ 
                success: false, 
                message: 'CSRF token validation failed' 
            });
        }
    }
    next();
};

// ============ DATABASE SCHEMAS ============

// Admin Schema
const adminSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, enum: ['super_admin', 'admin', 'moderator'], default: 'admin' },
    last_login: { type: Date },
    login_attempts: { type: Number, default: 0 },
    lock_until: { type: Date },
    is_active: { type: Boolean, default: true },
    permissions: [{ type: String }]
}, { timestamps: true });

// Business User Schema
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
    verified: { type: Boolean, default: false }
}, { timestamps: true });

// Nomination Schema
const nominationSchema = new mongoose.Schema({
    business_id: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessUser', required: true },
    title: { type: String, required: true },
    category: { type: String, required: true },
    year: { type: Number, default: new Date().getFullYear() },
    description: { type: String, required: true },
    achievements: [{ type: String }],
    documents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Document' }],
    status: { 
        type: String, 
        enum: ['draft', 'submitted', 'under_review', 'shortlisted', 'approved', 'rejected', 'winner'], 
        default: 'draft' 
    },
    score: { type: Number, min: 0, max: 100 },
    reviewer_notes: { type: String },
    reviewed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    reviewed_at: { type: Date },
    is_featured: { type: Boolean, default: false },
    submission_date: { type: Date, default: Date.now },
    last_modified: { type: Date, default: Date.now }
}, { timestamps: true });

// Document Schema
const documentSchema = new mongoose.Schema({
    business_id: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessUser', required: true },
    name: { type: String, required: true },
    filename: { type: String, required: true },
    original_name: { type: String, required: true },
    mime_type: { type: String, required: true },
    size: { type: Number, required: true },
    path: { type: String, required: true },
    document_type: { type: String, enum: ['registration', 'tax', 'license', 'financial', 'certificate', 'other'] },
    uploaded_at: { type: Date, default: Date.now },
    metadata: { type: mongoose.Schema.Types.Mixed }
});

// Announcement Schema
const announcementSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    image: { type: String },
    status: { type: String, enum: ['published', 'draft'], default: 'draft' },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    published_at: { type: Date },
    expires_at: { type: Date }
}, { timestamps: true });

// Judge Schema
const judgeSchema = new mongoose.Schema({
    name: { type: String, required: true },
    profession: { type: String, required: true },
    organization: { type: String },
    photo: { type: String },
    bio: { type: String },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' }
}, { timestamps: true });

// Category Schema
const categorySchema = new mongoose.Schema({
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String },
    icon: { type: String, default: 'fa-tag' },
    color: { type: String, default: '#FF0000' },
    display_order: { type: Number, default: 1 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' }
}, { timestamps: true });

// Business Spotlight Schema
const businessSpotlightSchema = new mongoose.Schema({
    business_id: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessUser', required: true },
    title: { type: String, required: true },
    story: { type: String, required: true },
    logo: { type: String },
    featured_until: { type: Date },
    status: { type: String, enum: ['featured', 'pending', 'expired'], default: 'pending' },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }
}, { timestamps: true });

// System User Schema (for additional staff)
const systemUserSchema = new mongoose.Schema({
    fullName: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    role: { type: String, enum: ['staff', 'moderator', 'admin'], default: 'staff' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    permissions: [{ type: String }],
    last_login: { type: Date }
}, { timestamps: true });

// System Settings Schema
const systemSettingsSchema = new mongoose.Schema({
    platformName: { type: String, default: 'Liberia Business Awards' },
    adminEmail: { type: String },
    logo: { type: String },
    systemStatus: { type: String, enum: ['online', 'maintenance'], default: 'online' },
    features: { type: mongoose.Schema.Types.Mixed },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }
}, { timestamps: true });

// Audit Log Schema
const auditLogSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, required: true },
    user_type: { type: String, enum: ['admin', 'business', 'system'], required: true },
    action: { type: String, required: true },
    resource: { type: String },
    resource_id: { type: String },
    changes: { type: mongoose.Schema.Types.Mixed },
    ip_address: { type: String },
    user_agent: { type: String },
    timestamp: { type: Date, default: Date.now }
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

// ============ HASHING MIDDLEWARE ============
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

systemUserSchema.pre('save', async function(next) {
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

systemUserSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// ============ ACCOUNT LOCK METHODS ============
businessUserSchema.methods.isLocked = function() {
    return !!(this.lock_until && this.lock_until > Date.now());
};

businessUserSchema.methods.incrementLoginAttempts = function() {
    this.login_attempts += 1;
    if (this.login_attempts >= 5) {
        this.lock_until = Date.now() + 30 * 60 * 1000; // Lock for 30 minutes
    }
    return this.save();
};

businessUserSchema.methods.resetLoginAttempts = function() {
    this.login_attempts = 0;
    this.lock_until = undefined;
    return this.save();
};

// ============ CREATE MODELS ============
const Admin = mongoose.model('Admin', adminSchema);
const BusinessUser = mongoose.model('BusinessUser', businessUserSchema);
const Nomination = mongoose.model('Nomination', nominationSchema);
const Document = mongoose.model('Document', documentSchema);
const Announcement = mongoose.model('Announcement', announcementSchema);
const Judge = mongoose.model('Judge', judgeSchema);
const Category = mongoose.model('Category', categorySchema);
const BusinessSpotlight = mongoose.model('BusinessSpotlight', businessSpotlightSchema);
const SystemUser = mongoose.model('SystemUser', systemUserSchema);
const SystemSettings = mongoose.model('SystemSettings', systemSettingsSchema);
const AuditLog = mongoose.model('AuditLog', auditLogSchema);
const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);

// ============ AUDIT LOG MIDDLEWARE ============
const logAudit = async (req, user_id, user_type, action, resource = null, resource_id = null, changes = null) => {
    try {
        const audit = new AuditLog({
            user_id,
            user_type,
            action,
            resource,
            resource_id,
            changes,
            ip_address: req.ip,
            user_agent: req.headers['user-agent']
        });
        await audit.save();
    } catch (error) {
        console.error('Audit log error:', error);
    }
};

// ============ AUTHENTICATION MIDDLEWARE ============

// JWT Token verification middleware
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
        
        // Check if it's admin or business
        let user;
        if (decoded.role === 'admin') {
            user = await Admin.findById(decoded.userId).select('-password');
        } else if (decoded.role === 'business') {
            user = await BusinessUser.findById(decoded.userId).select('-password');
        } else {
            user = await SystemUser.findById(decoded.userId).select('-password');
        }
        
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'User not found.' 
            });
        }

        req.user = user;
        req.userRole = decoded.role;
        req.userId = decoded.userId;
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
        
        // Create default admin
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
            
            // Log audit
            await AuditLog.create({
                user_id: admin._id,
                user_type: 'admin',
                action: 'SYSTEM_INIT',
                resource: 'Admin',
                resource_id: admin._id.toString(),
                changes: { created: true }
            });
        } else {
            console.log('👑 Admin account already exists');
        }
        
        // Create default settings if not exist
        const settingsExists = await SystemSettings.findOne();
        if (!settingsExists) {
            const settings = new SystemSettings({
                platformName: 'Liberia Business Awards',
                adminEmail: ADMIN_EMAIL,
                systemStatus: 'online',
                features: {
                    nominations: true,
                    documents: true,
                    announcements: true,
                    judges: true,
                    spotlight: true
                }
            });
            await settings.save();
            console.log('⚙️ Default system settings created');
        }
        
        return true;
    } catch (error) {
        console.error('❌ MongoDB Connection Failed:', error.message);
        return false;
    }
}

// ============ MULTER CONFIGURATION FOR FILE UPLOADS ============
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const businessId = req.user?._id || 'temp';
        const businessDir = path.join(uploadDir, businessId.toString());
        
        if (!fs.existsSync(businessDir)) {
            fs.mkdirSync(businessDir, { recursive: true });
        }
        
        cb(null, businessDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, uniqueSuffix + ext);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only PDF, DOC, DOCX, JPG, PNG, GIF, WEBP are allowed.'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
    }
});

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
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid credentials' 
            });
        }
        
        if (!admin.is_active) {
            return res.status(403).json({ 
                success: false, 
                message: 'Account is deactivated' 
            });
        }
        
        const isMatch = await admin.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid credentials' 
            });
        }
        
        // Generate access token
        const token = jwt.sign(
            { userId: admin._id, role: 'admin' }, 
            JWT_SECRET, 
            { expiresIn: JWT_EXPIRES_IN }
        );
        
        // Generate refresh token
        const refreshToken = jwt.sign(
            { userId: admin._id, role: 'admin', type: 'refresh' },
            JWT_REFRESH_SECRET,
            { expiresIn: JWT_REFRESH_EXPIRES_IN }
        );
        
        // Store refresh token
        await RefreshToken.create({
            token: refreshToken,
            user_id: admin._id,
            user_type: 'admin',
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        });
        
        admin.last_login = new Date();
        await admin.save();
        
        // Log audit
        await logAudit(req, admin._id, 'admin', 'LOGIN', 'Admin', admin._id.toString());
        
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
        res.status(500).json({ 
            success: false, 
            message: 'Server error during login' 
        });
    }
});

// Business Login
app.post('/api/auth/business/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log('Business login attempt:', email);
        
        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email and password are required' 
            });
        }
        
        const business = await BusinessUser.findOne({ email: email.toLowerCase() });
        if (!business) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid credentials' 
            });
        }
        
        // Check if account is locked
        if (business.isLocked()) {
            const lockTime = Math.ceil((business.lock_until - Date.now()) / (60 * 1000));
            return res.status(403).json({ 
                success: false, 
                message: `Account locked. Try again in ${lockTime} minutes` 
            });
        }
        
        // Check status
        if (business.status === 'pending') {
            return res.status(403).json({ 
                success: false, 
                message: 'Your account is awaiting admin approval' 
            });
        }
        
        if (business.status === 'rejected') {
            return res.status(403).json({ 
                success: false, 
                message: business.rejection_reason || 'Your business registration was rejected' 
            });
        }
        
        if (business.status === 'suspended') {
            return res.status(403).json({ 
                success: false, 
                message: 'Your account has been suspended. Contact admin.' 
            });
        }
        
        const isMatch = await business.comparePassword(password);
        if (!isMatch) {
            await business.incrementLoginAttempts();
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid credentials' 
            });
        }
        
        // Reset login attempts on successful login
        await business.resetLoginAttempts();
        
        // Generate access token
        const token = jwt.sign(
            { userId: business._id, role: 'business' }, 
            JWT_SECRET, 
            { expiresIn: JWT_EXPIRES_IN }
        );
        
        // Generate refresh token
        const refreshToken = jwt.sign(
            { userId: business._id, role: 'business', type: 'refresh' },
            JWT_REFRESH_SECRET,
            { expiresIn: JWT_REFRESH_EXPIRES_IN }
        );
        
        // Store refresh token
        await RefreshToken.create({
            token: refreshToken,
            user_id: business._id,
            user_type: 'business',
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        });
        
        business.last_login = new Date();
        await business.save();
        
        // Log audit
        await logAudit(req, business._id, 'business', 'LOGIN', 'BusinessUser', business._id.toString());
        
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
        res.status(500).json({ 
            success: false, 
            message: 'Server error during login' 
        });
    }
});

// Refresh Token endpoint
app.post('/api/auth/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        
        if (!refreshToken) {
            return res.status(400).json({ success: false, message: 'Refresh token required' });
        }
        
        // Verify refresh token
        const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
        
        // Check if token exists and not revoked
        const storedToken = await RefreshToken.findOne({ 
            token: refreshToken, 
            revoked: false,
            expires_at: { $gt: new Date() }
        });
        
        if (!storedToken) {
            return res.status(401).json({ success: false, message: 'Invalid refresh token' });
        }
        
        // Generate new access token
        const newToken = jwt.sign(
            { userId: decoded.userId, role: decoded.role },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );
        
        res.json({
            success: true,
            token: newToken
        });
    } catch (error) {
        console.error('Refresh token error:', error);
        res.status(401).json({ success: false, message: 'Invalid refresh token' });
    }
});

// Business Registration
app.post('/api/business/register', [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('business_name').notEmpty().trim(),
    body('contact_name').optional().trim(),
    body('phone').optional().trim(),
    body('business_type').optional().trim()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false, 
                errors: errors.array() 
            });
        }
        
        const { email, password, business_name, contact_name, phone, business_type } = req.body;
        console.log('Business registration:', email);
        
        // Check if business exists
        const existing = await BusinessUser.findOne({ email: email.toLowerCase() });
        if (existing) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email already registered' 
            });
        }
        
        // Create new business user
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
        
        // Log audit
        await logAudit(req, business._id, 'business', 'REGISTER', 'BusinessUser', business._id.toString());
        
        res.status(201).json({
            success: true,
            message: 'Registration successful! Your account is pending admin approval.'
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error during registration' 
        });
    }
});

// Token verification endpoint
app.post('/api/auth/verify', authenticate, (req, res) => {
    res.json({
        success: true,
        user: {
            id: req.user._id,
            email: req.user.email,
            name: req.user.business_name || req.user.name || req.user.fullName,
            role: req.userRole,
            status: req.user.status
        }
    });
});

// Logout endpoint
app.post('/api/auth/logout', authenticate, async (req, res) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        // Find and revoke refresh token
        await RefreshToken.updateMany(
            { user_id: req.userId, user_type: req.userRole },
            { revoked: true }
        );
        
        // Log audit
        await logAudit(req, req.userId, req.userRole, 'LOGOUT');
        
        res.json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ success: false, message: 'Logout failed' });
    }
});

// ============ CHANGE PASSWORD ============

// Change password for authenticated user
app.post('/api/auth/change-password', authenticate, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ 
                success: false, 
                message: 'Current password and new password are required' 
            });
        }
        
        if (newPassword.length < 6) {
            return res.status(400).json({ 
                success: false, 
                message: 'New password must be at least 6 characters' 
            });
        }
        
        // Get user based on role
        let user;
        if (req.userRole === 'admin') {
            user = await Admin.findById(req.userId);
        } else if (req.userRole === 'business') {
            user = await BusinessUser.findById(req.userId);
        } else {
            user = await SystemUser.findById(req.userId);
        }
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        // Verify current password
        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Current password is incorrect' });
        }
        
        // Update password
        user.password = newPassword;
        await user.save();
        
        // Log audit
        await logAudit(req, req.userId, req.userRole, 'CHANGE_PASSWORD');
        
        res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============ SIMPLE ROUTES THAT MUST WORK ============
// These routes will work even if MongoDB is down

app.get('/test', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Test route works!',
        timestamp: new Date().toISOString(),
        port: PORT,
        node_env: process.env.NODE_ENV
    });
});

app.get('/', (req, res) => {
    res.json({
        service: 'Liberia Business Awards API',
        version: '5.0.0',
        status: 'running',
        port: PORT,
        mongodb_status: mongoose.connection.readyState === 1 ? 'connected' : 'connecting'
    });
});

// ============ HEALTH CHECK ============
app.get('/api/health', (req, res) => {
    const isConnected = mongoose.connection.readyState === 1;
    
    res.json({
        status: isConnected ? 'ok' : 'starting',
        message: isConnected ? 'Server is running' : 'Server starting, waiting for MongoDB',
        timestamp: new Date().toISOString(),
        mongodb: isConnected ? 'connected' : 'connecting',
        port: PORT,
        uptime: process.uptime()
    });
});

// ============ START SERVER WITH BETTER ERROR HANDLING ============
async function startServer() {
    console.log('='.repeat(70));
    console.log('🚀 LIBERIA BUSINESS AWARDS - PRODUCTION SYSTEM V5.0');
    console.log('='.repeat(70));
    console.log(`📡 PORT: ${PORT}`);
    console.log(`🌍 NODE_ENV: ${process.env.NODE_ENV}`);
    console.log(`🗄️  MONGODB_URI: ${MONGODB_URI ? 'Set' : 'NOT SET!'}`);
    
    // Don't wait for MongoDB to start the server
    // Let MongoDB connect in the background
    connectToMongoDB().catch(err => {
        console.error('❌ MongoDB connection error:', err.message);
    });
    
    const server = app.listen(PORT, '0.0.0.0', () => {
        console.log('\n✅ SERVER RUNNING');
        console.log('='.repeat(70));
        console.log(`📡 Port: ${PORT}`);
        console.log(`🌍 Health: https://liberia-business-awards.up.railway.app/api/health`);
        console.log(`🌍 Test: https://liberia-business-awards.up.railway.app/test`);
        console.log('='.repeat(70));
        console.log('\n🚀 System ready! Waiting for MongoDB connection...');
    });

    server.on('error', (error) => {
        console.error('❌ Server error:', error);
        process.exit(1);
    });
}

// ============ PROCESS HANDLERS ============
process.on('uncaughtException', (err) => {
    console.error('💥 UNCAUGHT EXCEPTION:', err);
    // Don't exit, let the server continue
});

process.on('unhandledRejection', (err) => {
    console.error('🔥 UNHANDLED REJECTION:', err);
    // Don't exit, let the server continue
});

// Start the server
startServer();
