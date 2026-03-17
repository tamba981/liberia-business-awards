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

// CORS Configuration
const corsOptions = {
    origin: function (origin, callback) {
        const allowedOrigins = [
            'https://liberiabusinessawardslr.com',
            'http://localhost:5500',
            'http://localhost:3000',
            'http://127.0.0.1:5500',
            'http://127.0.0.1:3000',
            'http://localhost:5501',
            'http://127.0.0.1:5501'
        ];
        
        if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
            callback(null, true);
        } else {
            console.log('CORS blocked origin:', origin);
            callback(null, true); // Allow temporarily for testing
        }
    },
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

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

// ============ ADMIN BUSINESS MANAGEMENT ENDPOINTS ============

// Get pending businesses
app.get('/api/admin/businesses/pending', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const businesses = await BusinessUser.find({ status: 'pending' })
            .sort({ created_at: -1 });
        
        await logAudit(req, req.userId, 'admin', 'VIEW_PENDING_BUSINESSES');
        
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
                created_at: b.created_at
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get all businesses with pagination
app.get('/api/admin/businesses', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const { status, page = 1, limit = 10, search = '' } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
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
        
        const total = await BusinessUser.countDocuments(query);
        const businesses = await BusinessUser.find(query)
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(parseInt(limit));
        
        await logAudit(req, req.userId, 'admin', 'VIEW_BUSINESSES', null, null, { status, page, search });
        
        res.json({
            success: true,
            businesses: businesses.map(b => ({
                _id: b._id,
                business_name: b.business_name,
                email: b.email,
                contact_name: b.contact_name,
                phone: b.phone,
                business_type: b.business_type,
                business_category: b.business_category,
                industry: b.industry,
                location: b.location,
                website: b.website,
                status: b.status,
                verified: b.verified,
                created_at: b.created_at,
                approved_at: b.approved_at
            })),
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get single business details
app.get('/api/admin/businesses/:id', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const business = await BusinessUser.findById(req.params.id).select('-password');
        
        if (!business) {
            return res.status(404).json({ success: false, error: 'Business not found' });
        }
        
        await logAudit(req, req.userId, 'admin', 'VIEW_BUSINESS_DETAILS', 'BusinessUser', req.params.id);
        
        res.json({
            success: true,
            business
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Approve business
app.post('/api/admin/businesses/:id/approve', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const business = await BusinessUser.findById(req.params.id);
        
        if (!business) {
            return res.status(404).json({ success: false, error: 'Business not found' });
        }
        
        const oldStatus = business.status;
        business.status = 'approved';
        business.approved_at = new Date();
        business.approved_by = req.user._id;
        business.rejection_reason = undefined;
        
        await business.save();
        
        // Log audit
        await logAudit(req, req.userId, 'admin', 'APPROVE_BUSINESS', 'BusinessUser', req.params.id, { oldStatus, newStatus: 'approved' });
        
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
app.post('/api/admin/businesses/:id/reject', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const { reason } = req.body;
        
        if (!reason) {
            return res.status(400).json({ success: false, error: 'Rejection reason is required' });
        }
        
        const business = await BusinessUser.findById(req.params.id);
        
        if (!business) {
            return res.status(404).json({ success: false, error: 'Business not found' });
        }
        
        const oldStatus = business.status;
        business.status = 'rejected';
        business.rejection_reason = reason;
        business.approved_by = req.user._id;
        
        await business.save();
        
        // Log audit
        await logAudit(req, req.userId, 'admin', 'REJECT_BUSINESS', 'BusinessUser', req.params.id, { oldStatus, newStatus: 'rejected', reason });
        
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

// Get business stats
app.get('/api/admin/businesses/stats', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const [total, pending, approved, rejected, suspended] = await Promise.all([
            BusinessUser.countDocuments(),
            BusinessUser.countDocuments({ status: 'pending' }),
            BusinessUser.countDocuments({ status: 'approved' }),
            BusinessUser.countDocuments({ status: 'rejected' }),
            BusinessUser.countDocuments({ status: 'suspended' })
        ]);
        
        await logAudit(req, req.userId, 'admin', 'VIEW_BUSINESS_STATS');
        
        res.json({
            success: true,
            stats: {
                total,
                pending,
                approved,
                rejected,
                suspended
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ ADMIN NOMINATIONS ENDPOINTS ============

// Get all nominations (admin)
app.get('/api/admin/nominations', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const { status, page = 1, limit = 1000, search = '' } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        let query = {};
        if (status && status !== 'all') {
            query.status = status;
        }
        
        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { category: { $regex: search, $options: 'i' } }
            ];
        }
        
        const total = await Nomination.countDocuments(query);
        const nominations = await Nomination.find(query)
            .populate('business_id', 'business_name email')
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(parseInt(limit));
        
        await logAudit(req, req.userId, 'admin', 'VIEW_NOMINATIONS', null, null, { status, page, search });
        
        res.json({
            success: true,
            nominations: nominations.map(n => ({
                _id: n._id,
                business_name: n.business_id?.business_name || 'Unknown',
                title: n.title,
                category: n.category,
                year: n.year,
                status: n.status,
                created_at: n.created_at
            })),
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Bulk approve businesses
app.post('/api/admin/businesses/bulk-approve', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const { ids } = req.body;
        
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, error: 'No business IDs provided' });
        }
        
        const result = await BusinessUser.updateMany(
            { _id: { $in: ids }, status: 'pending' },
            { 
                status: 'approved', 
                approved_at: new Date(),
                approved_by: req.user._id
            }
        );
        
        // Log audit
        await logAudit(req, req.userId, 'admin', 'BULK_APPROVE_BUSINESSES', null, null, { count: result.modifiedCount, ids });
        
        res.json({
            success: true,
            message: `${result.modifiedCount} businesses approved`,
            modifiedCount: result.modifiedCount
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Bulk reject businesses
app.post('/api/admin/businesses/bulk-reject', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const { ids, reason } = req.body;
        
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, error: 'No business IDs provided' });
        }
        
        const result = await BusinessUser.updateMany(
            { _id: { $in: ids }, status: 'pending' },
            { 
                status: 'rejected',
                rejection_reason: reason || 'Rejected by admin',
                approved_by: req.user._id
            }
        );
        
        // Log audit
        await logAudit(req, req.userId, 'admin', 'BULK_REJECT_BUSINESSES', null, null, { count: result.modifiedCount, reason });
        
        res.json({
            success: true,
            message: `${result.modifiedCount} businesses rejected`,
            modifiedCount: result.modifiedCount
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Bulk delete businesses
app.delete('/api/admin/businesses/bulk-delete', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const { ids } = req.body;
        
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, error: 'No business IDs provided' });
        }
        
        // Prevent deleting if business has nominations or documents
        const hasNominations = await Nomination.countDocuments({ business_id: { $in: ids } });
        const hasDocuments = await Document.countDocuments({ business_id: { $in: ids } });
        
        if (hasNominations > 0 || hasDocuments > 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Cannot delete businesses with existing nominations or documents. Reject them instead.' 
            });
        }
        
        const result = await BusinessUser.deleteMany({ _id: { $in: ids } });
        
        // Log audit
        await logAudit(req, req.userId, 'admin', 'BULK_DELETE_BUSINESSES', null, null, { count: result.deletedCount, ids });
        
        res.json({
            success: true,
            message: `${result.deletedCount} businesses deleted`,
            deletedCount: result.deletedCount
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ ADMIN IMPERSONATION ============
app.post('/api/admin/impersonate/:businessId', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const business = await BusinessUser.findById(req.params.businessId);
        
        if (!business) {
            return res.status(404).json({ success: false, error: 'Business not found' });
        }
        
        // Generate temporary token for business
        const token = jwt.sign(
            { userId: business._id, role: 'business', impersonatedBy: req.user._id },
            JWT_SECRET,
            { expiresIn: '1h' } // Short expiry for impersonation
        );
        
        // Log audit
        await logAudit(req, req.userId, 'admin', 'IMPERSONATE_BUSINESS', 'BusinessUser', req.params.businessId);
        
        res.json({
            success: true,
            token,
            user: {
                id: business._id,
                email: business.email,
                name: business.business_name,
                role: 'business'
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ NOMINATIONS ENDPOINTS ============

// Get business nominations (for business dashboard)
app.get('/api/business/nominations', authenticate, authorize('business'), async (req, res) => {
    try {
        const { page = 1, limit = 10, status = 'all' } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        let query = { business_id: req.user._id };
        if (status !== 'all') {
            query.status = status;
        }
        
        const total = await Nomination.countDocuments(query);
        const nominations = await Nomination.find(query)
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate('documents');
        
        res.json({
            success: true,
            nominations: nominations.map(n => ({
                _id: n._id,
                title: n.title,
                category: n.category,
                year: n.year,
                status: n.status,
                created_at: n.created_at,
                submission_date: n.submission_date,
                score: n.score
            })),
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create nomination
app.post('/api/business/nominations', authenticate, authorize('business'), async (req, res) => {
    try {
        const { title, category, year, description, achievements, document_id, status } = req.body;
        
        if (!title || !category || !description) {
            return res.status(400).json({ success: false, error: 'Missing required fields' });
        }
        
        const nomination = new Nomination({
            business_id: req.user._id,
            title,
            category,
            year: year || new Date().getFullYear(),
            description,
            achievements: achievements ? achievements.split('\n').filter(a => a.trim()) : [],
            documents: document_id ? [document_id] : [],
            status: status || 'draft',
            last_modified: new Date()
        });
        
        await nomination.save();
        
        // Log audit
        await logAudit(req, req.userId, 'business', 'CREATE_NOMINATION', 'Nomination', nomination._id.toString());
        
        res.status(201).json({
            success: true,
            nomination
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update nomination (only if draft)
app.put('/api/business/nominations/:id', authenticate, authorize('business'), async (req, res) => {
    try {
        const nomination = await Nomination.findOne({ 
            _id: req.params.id, 
            business_id: req.user._id 
        });
        
        if (!nomination) {
            return res.status(404).json({ success: false, error: 'Nomination not found' });
        }
        
        if (!['draft', 'submitted'].includes(nomination.status)) {
            return res.status(403).json({ success: false, error: 'Cannot edit nomination that has been processed' });
        }
        
        const { title, category, year, description, achievements, document_id, status } = req.body;
        
        if (title) nomination.title = title;
        if (category) nomination.category = category;
        if (year) nomination.year = year;
        if (description) nomination.description = description;
        if (achievements) nomination.achievements = achievements.split('\n').filter(a => a.trim());
        if (document_id) nomination.documents = [document_id];
        if (status) nomination.status = status;
        
        nomination.last_modified = new Date();
        await nomination.save();
        
        // Log audit
        await logAudit(req, req.userId, 'business', 'UPDATE_NOMINATION', 'Nomination', nomination._id.toString());
        
        res.json({
            success: true,
            nomination
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete nomination (only if draft)
app.delete('/api/business/nominations/:id', authenticate, authorize('business'), async (req, res) => {
    try {
        const nomination = await Nomination.findOne({ 
            _id: req.params.id, 
            business_id: req.user._id 
        });
        
        if (!nomination) {
            return res.status(404).json({ success: false, error: 'Nomination not found' });
        }
        
        if (nomination.status !== 'draft') {
            return res.status(403).json({ success: false, error: 'Cannot delete submitted nomination' });
        }
        
        await nomination.deleteOne();
        
        // Log audit
        await logAudit(req, req.userId, 'business', 'DELETE_NOMINATION', 'Nomination', req.params.id);
        
        res.json({ success: true, message: 'Nomination deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Save draft (auto-save)
app.post('/api/business/nominations/draft', authenticate, authorize('business'), async (req, res) => {
    try {
        const { id, data } = req.body;
        
        let nomination;
        if (id) {
            nomination = await Nomination.findOne({ 
                _id: id, 
                business_id: req.user._id 
            });
        }
        
        if (!nomination) {
            nomination = new Nomination({
                business_id: req.user._id,
                status: 'draft'
            });
        }
        
        // Update fields from data
        Object.assign(nomination, data);
        nomination.last_modified = new Date();
        
        await nomination.save();
        
        res.json({
            success: true,
            draftId: nomination._id,
            savedAt: nomination.last_modified
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ DOCUMENTS ENDPOINTS ============

// Upload document
app.post('/api/business/documents', authenticate, authorize('business'), upload.single('document'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No file uploaded' });
        }
        
        const { name, type } = req.body;
        
        const document = new Document({
            business_id: req.user._id,
            name: name || req.file.originalname,
            filename: req.file.filename,
            original_name: req.file.originalname,
            mime_type: req.file.mimetype,
            size: req.file.size,
            path: req.file.path,
            document_type: type || 'other'
        });
        
        await document.save();
        
        // Log audit
        await logAudit(req, req.userId, 'business', 'UPLOAD_DOCUMENT', 'Document', document._id.toString());
        
        res.status(201).json({
            success: true,
            document: {
                _id: document._id,
                name: document.name,
                filename: document.filename,
                uploaded_at: document.uploaded_at
            }
        });
    } catch (error) {
        console.error('Document upload error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Get business documents
app.get('/api/business/documents', authenticate, authorize('business'), async (req, res) => {
    try {
        const { page = 1, limit = 12 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const total = await Document.countDocuments({ business_id: req.user._id });
        const documents = await Document.find({ business_id: req.user._id })
            .sort({ uploaded_at: -1 })
            .skip(skip)
            .limit(parseInt(limit));
        
        res.json({
            success: true,
            documents: documents.map(d => ({
                _id: d._id,
                name: d.name,
                filename: d.filename,
                original_name: d.original_name,
                mime_type: d.mime_type,
                size: d.size,
                uploaded_at: d.uploaded_at,
                document_type: d.document_type
            })),
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// View document
app.get('/api/business/documents/:id/view', authenticate, authorize('business'), async (req, res) => {
    try {
        const document = await Document.findOne({ 
            _id: req.params.id, 
            business_id: req.user._id 
        });
        
        if (!document) {
            return res.status(404).json({ success: false, error: 'Document not found' });
        }
        
        res.sendFile(document.path);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Download document
app.get('/api/business/documents/:id/download', authenticate, authorize('business'), async (req, res) => {
    try {
        const document = await Document.findOne({ 
            _id: req.params.id, 
            business_id: req.user._id 
        });
        
        if (!document) {
            return res.status(404).json({ success: false, error: 'Document not found' });
        }
        
        res.download(document.path, document.original_name);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete document
app.delete('/api/business/documents/:id', authenticate, authorize('business'), async (req, res) => {
    try {
        const document = await Document.findOne({ 
            _id: req.params.id, 
            business_id: req.user._id 
        });
        
        if (!document) {
            return res.status(404).json({ success: false, error: 'Document not found' });
        }
        
        // Delete file from disk
        try {
            fs.unlinkSync(document.path);
        } catch (fileError) {
            console.error('File deletion error:', fileError);
        }
        
        await document.deleteOne();
        
        // Log audit
        await logAudit(req, req.userId, 'business', 'DELETE_DOCUMENT', 'Document', req.params.id);
        
        res.json({ success: true, message: 'Document deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ BUSINESS PROFILE ENDPOINTS ============

// Get business dashboard data
app.get('/api/business/dashboard', authenticate, authorize('business'), async (req, res) => {
    try {
        const business = req.user;
        
        // Get counts
        const [nominationsTotal, documentsTotal, nominationsApproved] = await Promise.all([
            Nomination.countDocuments({ business_id: business._id }),
            Document.countDocuments({ business_id: business._id }),
            Nomination.countDocuments({ business_id: business._id, status: { $in: ['approved', 'winner'] } })
        ]);
        
        res.json({
            success: true,
            dashboard: {
                profile: {
                    business_name: business.business_name,
                    email: business.email,
                    contact_name: business.contact_name,
                    phone: business.phone,
                    business_type: business.business_type,
                    business_category: business.business_category,
                    industry: business.industry,
                    location: business.location,
                    website: business.website,
                    description: business.description,
                    address: business.address,
                    logo: business.logo,
                    status: business.status,
                    verified: business.verified,
                    member_since: business.created_at
                },
                stats: {
                    profile_completion: calculateProfileCompletion(business),
                    total_nominations: nominationsTotal,
                    approved_nominations: nominationsApproved,
                    total_documents: documentsTotal
                }
            }
        });
    } catch (error) {
        console.error('Business dashboard error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error loading dashboard' 
        });
    }
});

// Update business profile
app.put('/api/business/profile', authenticate, authorize('business'), upload.single('logo'), async (req, res) => {
    try {
        const business = req.user;
        const updates = req.body;
        
        // Update text fields
        if (updates.business_name) business.business_name = updates.business_name;
        if (updates.contact_name) business.contact_name = updates.contact_name;
        if (updates.phone) business.phone = updates.phone;
        if (updates.business_type) business.business_type = updates.business_type;
        if (updates.business_category) business.business_category = updates.business_category;
        if (updates.industry) business.industry = updates.industry;
        if (updates.location) business.location = updates.location;
        if (updates.website) business.website = updates.website;
        if (updates.description) business.description = updates.description;
        if (updates.address) business.address = updates.address;
        
        // Update logo if uploaded
        if (req.file) {
            business.logo = `/uploads/${business._id}/${req.file.filename}`;
        }
        
        await business.save();
        
        // Log audit
        await logAudit(req, req.userId, 'business', 'UPDATE_PROFILE', 'BusinessUser', business._id.toString());
        
        res.json({
            success: true,
            message: 'Profile updated successfully',
            profile: {
                business_name: business.business_name,
                email: business.email,
                contact_name: business.contact_name,
                phone: business.phone,
                business_type: business.business_type,
                business_category: business.business_category,
                industry: business.industry,
                location: business.location,
                website: business.website,
                description: business.description,
                address: business.address,
                logo: business.logo,
                status: business.status,
                verified: business.verified
            }
        });
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error updating profile' 
        });
    }
});

// Helper function to calculate profile completion
function calculateProfileCompletion(business) {
    const requiredFields = [
        'business_name',
        'email',
        'contact_name',
        'phone',
        'business_type',
        'industry',
        'location',
        'description',
        'address'
    ];
    
    let completed = 0;
    requiredFields.forEach(field => {
        if (business[field]) completed++;
    });
    
    return Math.round((completed / requiredFields.length) * 100);
}

// ============ ANNOUNCEMENTS ENDPOINTS ============

// Get all announcements (public)
app.get('/api/announcements', async (req, res) => {
    try {
        const announcements = await Announcement.find({ status: 'published' })
            .sort({ published_at: -1 })
            .limit(10);
        
        res.json({ success: true, announcements });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Admin: Get all announcements
app.get('/api/admin/announcements', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const announcements = await Announcement.find()
            .sort({ created_at: -1 })
            .populate('created_by', 'name email');
        
        res.json({ success: true, announcements });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Admin: Create announcement
app.post('/api/admin/announcements', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const { title, description, image, status } = req.body;
        
        const announcement = new Announcement({
            title,
            description,
            image,
            status: status || 'draft',
            created_by: req.user._id,
            published_at: status === 'published' ? new Date() : null
        });
        
        await announcement.save();
        
        // Log audit
        await logAudit(req, req.userId, 'admin', 'CREATE_ANNOUNCEMENT', 'Announcement', announcement._id.toString());
        
        res.json({ success: true, announcement });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Admin: Update announcement
app.put('/api/admin/announcements/:id', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const { title, description, image, status } = req.body;
        
        const announcement = await Announcement.findById(req.params.id);
        if (!announcement) {
            return res.status(404).json({ success: false, error: 'Announcement not found' });
        }
        
        if (title) announcement.title = title;
        if (description) announcement.description = description;
        if (image) announcement.image = image;
        if (status) {
            announcement.status = status;
            if (status === 'published' && !announcement.published_at) {
                announcement.published_at = new Date();
            }
        }
        
        await announcement.save();
        
        // Log audit
        await logAudit(req, req.userId, 'admin', 'UPDATE_ANNOUNCEMENT', 'Announcement', req.params.id);
        
        res.json({ success: true, announcement });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Admin: Delete announcement
app.delete('/api/admin/announcements/:id', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        await Announcement.findByIdAndDelete(req.params.id);
        
        // Log audit
        await logAudit(req, req.userId, 'admin', 'DELETE_ANNOUNCEMENT', 'Announcement', req.params.id);
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ JUDGES ENDPOINTS ============

// Get all judges (public)
app.get('/api/judges', async (req, res) => {
    try {
        const judges = await Judge.find({ status: 'active' }).sort({ created_at: -1 });
        res.json({ success: true, judges });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Admin: Get all judges
app.get('/api/admin/judges', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const judges = await Judge.find().sort({ created_at: -1 });
        res.json({ success: true, judges });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Admin: Create judge
app.post('/api/admin/judges', authenticate, authorize('admin'), upload.single('photo'), async (req, res) => {
    try {
        const { name, profession, organization, bio, status } = req.body;
        
        const judgeData = {
            name,
            profession,
            organization,
            bio,
            status: status || 'active'
        };
        
        if (req.file) {
            judgeData.photo = `/uploads/${req.file.filename}`;
        }
        
        const judge = new Judge(judgeData);
        await judge.save();
        
        // Log audit
        await logAudit(req, req.userId, 'admin', 'CREATE_JUDGE', 'Judge', judge._id.toString());
        
        res.json({ success: true, judge });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Admin: Update judge
app.put('/api/admin/judges/:id', authenticate, authorize('admin'), upload.single('photo'), async (req, res) => {
    try {
        const judge = await Judge.findById(req.params.id);
        if (!judge) {
            return res.status(404).json({ success: false, error: 'Judge not found' });
        }
        
        const { name, profession, organization, bio, status } = req.body;
        
        if (name) judge.name = name;
        if (profession) judge.profession = profession;
        if (organization) judge.organization = organization;
        if (bio) judge.bio = bio;
        if (status) judge.status = status;
        
        if (req.file) {
            judge.photo = `/uploads/${req.file.filename}`;
        }
        
        await judge.save();
        
        // Log audit
        await logAudit(req, req.userId, 'admin', 'UPDATE_JUDGE', 'Judge', req.params.id);
        
        res.json({ success: true, judge });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Admin: Delete judge
app.delete('/api/admin/judges/:id', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        await Judge.findByIdAndDelete(req.params.id);
        
        // Log audit
        await logAudit(req, req.userId, 'admin', 'DELETE_JUDGE', 'Judge', req.params.id);
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ CATEGORIES ENDPOINTS ============

// Get all categories (public)
app.get('/api/categories', async (req, res) => {
    try {
        const categories = await Category.find({ status: 'active' }).sort({ display_order: 1 });
        res.json({ success: true, categories });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Admin: Get all categories
app.get('/api/admin/categories', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const categories = await Category.find().sort({ display_order: 1 });
        res.json({ success: true, categories });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Admin: Create category
app.post('/api/admin/categories', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const { name, slug, description, icon, color, display_order, status } = req.body;
        
        const category = new Category({
            name,
            slug,
            description,
            icon: icon || 'fa-tag',
            color: color || '#FF0000',
            display_order: display_order || 1,
            status: status || 'active'
        });
        
        await category.save();
        
        // Log audit
        await logAudit(req, req.userId, 'admin', 'CREATE_CATEGORY', 'Category', category._id.toString());
        
        res.json({ success: true, category });
    } catch (error) {
        if (error.code === 11000) {
            res.status(400).json({ success: false, error: 'Category with this slug already exists' });
        } else {
            res.status(500).json({ success: false, error: error.message });
        }
    }
});

// Admin: Update category
app.put('/api/admin/categories/:id', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const { name, slug, description, icon, color, display_order, status } = req.body;
        
        const category = await Category.findById(req.params.id);
        if (!category) {
            return res.status(404).json({ success: false, error: 'Category not found' });
        }
        
        if (name) category.name = name;
        if (slug) category.slug = slug;
        if (description) category.description = description;
        if (icon) category.icon = icon;
        if (color) category.color = color;
        if (display_order) category.display_order = display_order;
        if (status) category.status = status;
        
        await category.save();
        
        // Log audit
        await logAudit(req, req.userId, 'admin', 'UPDATE_CATEGORY', 'Category', req.params.id);
        
        res.json({ success: true, category });
    } catch (error) {
        if (error.code === 11000) {
            res.status(400).json({ success: false, error: 'Category with this slug already exists' });
        } else {
            res.status(500).json({ success: false, error: error.message });
        }
    }
});

// Admin: Delete category
app.delete('/api/admin/categories/:id', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        await Category.findByIdAndDelete(req.params.id);
        
        // Log audit
        await logAudit(req, req.userId, 'admin', 'DELETE_CATEGORY', 'Category', req.params.id);
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ SYSTEM USERS MANAGEMENT ============

// Get all system users
app.get('/api/admin/system-users', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const users = await SystemUser.find().select('-password').sort({ created_at: -1 });
        res.json({ success: true, users });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create system user
app.post('/api/admin/system-users', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const { fullName, email, password, role } = req.body;
        
        // Check if user exists
        const existing = await SystemUser.findOne({ email: email.toLowerCase() });
        if (existing) {
            return res.status(400).json({ success: false, error: 'Email already exists' });
        }
        
        const user = new SystemUser({
            fullName,
            email: email.toLowerCase(),
            password,
            role: role || 'staff',
            status: 'active'
        });
        
        await user.save();
        
        // Log audit
        await logAudit(req, req.userId, 'admin', 'CREATE_SYSTEM_USER', 'SystemUser', user._id.toString());
        
        res.json({ 
            success: true, 
            user: {
                _id: user._id,
                fullName: user.fullName,
                email: user.email,
                role: user.role,
                status: user.status,
                created_at: user.created_at
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update system user
app.put('/api/admin/system-users/:id', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const { fullName, email, role, status } = req.body;
        const user = await SystemUser.findById(req.params.id);
        
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        if (fullName) user.fullName = fullName;
        if (email) user.email = email.toLowerCase();
        if (role) user.role = role;
        if (status) user.status = status;
        
        await user.save();
        
        // Log audit
        await logAudit(req, req.userId, 'admin', 'UPDATE_SYSTEM_USER', 'SystemUser', req.params.id);
        
        res.json({ 
            success: true, 
            user: {
                _id: user._id,
                fullName: user.fullName,
                email: user.email,
                role: user.role,
                status: user.status
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete system user
app.delete('/api/admin/system-users/:id', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        // Prevent deleting yourself
        if (req.params.id === req.user._id.toString()) {
            return res.status(400).json({ success: false, error: 'Cannot delete your own account' });
        }
        
        await SystemUser.findByIdAndDelete(req.params.id);
        
        // Log audit
        await logAudit(req, req.userId, 'admin', 'DELETE_SYSTEM_USER', 'SystemUser', req.params.id);
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Toggle user status
app.post('/api/admin/system-users/:id/toggle-status', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const user = await SystemUser.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        user.status = user.status === 'active' ? 'inactive' : 'active';
        await user.save();
        
        // Log audit
        await logAudit(req, req.userId, 'admin', 'TOGGLE_USER_STATUS', 'SystemUser', req.params.id, { newStatus: user.status });
        
        res.json({ success: true, status: user.status });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ SYSTEM SETTINGS ============

// Get settings
app.get('/api/admin/settings', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        let settings = await SystemSettings.findOne();
        if (!settings) {
            settings = await SystemSettings.create({
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
        }
        res.json({ success: true, settings });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update settings
app.put('/api/admin/settings', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        let settings = await SystemSettings.findOne();
        if (!settings) {
            settings = new SystemSettings();
        }
        
        Object.assign(settings, req.body, { updated_by: req.user._id });
        await settings.save();
        
        // Log audit
        await logAudit(req, req.userId, 'admin', 'UPDATE_SETTINGS', 'SystemSettings', settings._id?.toString());
        
        res.json({ success: true, settings });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ AUDIT LOGS ============

// Get audit logs
app.get('/api/admin/audit-logs', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const { page = 1, limit = 50, user_id, action } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        let query = {};
        if (user_id) query.user_id = user_id;
        if (action) query.action = action;
        
        const total = await AuditLog.countDocuments(query);
        const logs = await AuditLog.find(query)
            .sort({ timestamp: -1 })
            .skip(skip)
            .limit(parseInt(limit));
        
        res.json({
            success: true,
            logs,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ ANALYTICS ============

// Get analytics
app.get('/api/admin/analytics', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const [
            totalBusinesses,
            totalNominations,
            pendingBusinesses,
            approvedBusinesses,
            rejectedBusinesses,
            featuredBusinesses,
            totalUsers,
            totalAnnouncements,
            totalJudges,
            totalCategories,
            totalSpotlight,
            pendingNominations,
            approvedNominations,
            winnerNominations
        ] = await Promise.all([
            BusinessUser.countDocuments(),
            Nomination.countDocuments(),
            BusinessUser.countDocuments({ status: 'pending' }),
            BusinessUser.countDocuments({ status: 'approved' }),
            BusinessUser.countDocuments({ status: 'rejected' }),
            BusinessSpotlight.countDocuments({ status: 'featured' }),
            SystemUser.countDocuments(),
            Announcement.countDocuments({ status: 'published' }),
            Judge.countDocuments({ status: 'active' }),
            Category.countDocuments({ status: 'active' }),
            BusinessSpotlight.countDocuments(),
            Nomination.countDocuments({ status: 'submitted' }),
            Nomination.countDocuments({ status: 'approved' }),
            Nomination.countDocuments({ status: 'winner' })
        ]);

        // Get monthly registrations (last 6 months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        
        const monthlyRegistrations = await BusinessUser.aggregate([
            { $match: { created_at: { $gte: sixMonthsAgo } } },
            { $group: {
                _id: { $month: "$created_at" },
                count: { $sum: 1 },
                month: { $first: { $dateToString: { format: "%Y-%m", date: "$created_at" } } }
            }},
            { $sort: { _id: 1 } }
        ]);

        // Nominations by category
        const nominationsByCategory = await Nomination.aggregate([
            { $group: {
                _id: "$category",
                count: { $sum: 1 }
            }},
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        // Businesses by sector
        const businessesBySector = await BusinessUser.aggregate([
            { $match: { business_type: { $ne: null } } },
            { $group: {
                _id: "$business_type",
                count: { $sum: 1 }
            }},
            { $sort: { count: -1 } }
        ]);

        // Log audit
        await logAudit(req, req.userId, 'admin', 'VIEW_ANALYTICS');

        res.json({
            success: true,
            analytics: {
                overview: {
                    totalBusinesses,
                    totalNominations,
                    pendingBusinesses,
                    approvedBusinesses,
                    rejectedBusinesses,
                    featuredBusinesses,
                    totalUsers,
                    totalAnnouncements,
                    totalJudges,
                    totalCategories,
                    totalSpotlight,
                    pendingNominations,
                    approvedNominations,
                    winnerNominations
                },
                charts: {
                    monthlyRegistrations,
                    nominationsByCategory,
                    businessesBySector
                }
            }
        });
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ REPORTS ============

// Generate report
app.post('/api/admin/reports/generate', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const { type, format } = req.body;
        let data = [];
        
        switch(type) {
            case 'businesses':
                data = await BusinessUser.find().sort({ created_at: -1 }).lean();
                break;
            case 'nominations':
                data = await Nomination.find()
                    .populate('business_id', 'business_name email')
                    .sort({ created_at: -1 })
                    .lean();
                break;
            case 'judges':
                data = await Judge.find().sort({ created_at: -1 }).lean();
                break;
            case 'documents':
                data = await Document.find()
                    .populate('business_id', 'business_name')
                    .sort({ uploaded_at: -1 })
                    .lean();
                break;
            default:
                return res.status(400).json({ success: false, error: 'Invalid report type' });
        }

        // Log audit
        await logAudit(req, req.userId, 'admin', 'GENERATE_REPORT', null, null, { type, format, count: data.length });

        if (format === 'csv') {
            // Return as CSV
            const csv = convertToCSV(data);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=${type}-${new Date().toISOString().split('T')[0]}.csv`);
            res.send(csv);
        } else if (format === 'json') {
            res.json({ success: true, data });
        } else {
            res.status(400).json({ success: false, error: 'Invalid format' });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Helper function for CSV conversion
function convertToCSV(data) {
    if (!data || data.length === 0) return '';
    
    // Remove sensitive fields
    const cleanData = data.map(item => {
        const clean = { ...item };
        delete clean.password;
        delete clean.__v;
        return clean;
    });
    
    const headers = Object.keys(cleanData[0]).filter(key => 
        !key.includes('password') && 
        !key.includes('__v') &&
        !key.startsWith('_')
    );
    
    let csv = headers.join(',') + '\n';
    
    cleanData.forEach(item => {
        const row = headers.map(header => {
            let value = item[header];
            if (value instanceof Date) value = value.toISOString().split('T')[0];
            if (typeof value === 'object') value = JSON.stringify(value);
            if (value && value.includes(',')) value = `"${value}"`;
            return value || '';
        }).join(',');
        csv += row + '\n';
    });
    
    return csv;
}

// ============ BUSINESS SPOTLIGHT ENDPOINTS ============

// Get spotlight stories (public)
app.get('/api/spotlight', async (req, res) => {
    try {
        const spotlights = await BusinessSpotlight.find({ status: 'featured' })
            .populate('business_id', 'business_name logo industry')
            .sort({ created_at: -1 })
            .limit(10);
        
        res.json({ success: true, spotlights });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Admin: Get all spotlights
app.get('/api/admin/spotlight', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const spotlights = await BusinessSpotlight.find()
            .populate('business_id', 'business_name email status')
            .populate('created_by', 'name email')
            .sort({ created_at: -1 });
        
        res.json({ success: true, spotlights });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Admin: Create spotlight
app.post('/api/admin/spotlight', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const { business_id, title, story, logo, featured_until } = req.body;
        
        const spotlight = new BusinessSpotlight({
            business_id,
            title,
            story,
            logo,
            featured_until: featured_until || null,
            status: 'featured',
            created_by: req.user._id
        });
        
        await spotlight.save();
        
        // Log audit
        await logAudit(req, req.userId, 'admin', 'CREATE_SPOTLIGHT', 'BusinessSpotlight', spotlight._id.toString());
        
        res.json({ success: true, spotlight });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Admin: Update spotlight
app.put('/api/admin/spotlight/:id', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        const { title, story, logo, featured_until, status } = req.body;
        
        const spotlight = await BusinessSpotlight.findById(req.params.id);
        if (!spotlight) {
            return res.status(404).json({ success: false, error: 'Spotlight not found' });
        }
        
        if (title) spotlight.title = title;
        if (story) spotlight.story = story;
        if (logo) spotlight.logo = logo;
        if (featured_until) spotlight.featured_until = featured_until;
        if (status) spotlight.status = status;
        
        await spotlight.save();
        
        // Log audit
        await logAudit(req, req.userId, 'admin', 'UPDATE_SPOTLIGHT', 'BusinessSpotlight', req.params.id);
        
        res.json({ success: true, spotlight });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Admin: Delete spotlight
app.delete('/api/admin/spotlight/:id', authenticate, authorize('admin'), csrfProtection, async (req, res) => {
    try {
        await BusinessSpotlight.findByIdAndDelete(req.params.id);
        
        // Log audit
        await logAudit(req, req.userId, 'admin', 'DELETE_SPOTLIGHT', 'BusinessSpotlight', req.params.id);
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ NOTIFICATIONS ENDPOINTS ============

// Get business notifications
app.get('/api/business/notifications', authenticate, authorize('business'), async (req, res) => {
    try {
        const { page = 1, limit = 50 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        // Get notifications from various sources
        const [nominations, documents, approvals] = await Promise.all([
            Nomination.find({ business_id: req.user._id })
                .sort({ created_at: -1 })
                .limit(10)
                .lean(),
            Document.find({ business_id: req.user._id })
                .sort({ uploaded_at: -1 })
                .limit(10)
                .lean(),
            AuditLog.find({ 
                user_id: req.user._id, 
                user_type: 'business',
                action: { $in: ['APPROVE_BUSINESS', 'REJECT_BUSINESS'] }
            })
                .sort({ timestamp: -1 })
                .limit(10)
                .lean()
        ]);
        
        // Combine and format notifications
        const notifications = [
            ...nominations.map(n => ({
                _id: n._id,
                title: 'Nomination Update',
                message: `Your nomination "${n.title}" is ${n.status}`,
                type: n.status === 'approved' ? 'success' : n.status === 'rejected' ? 'error' : 'info',
                read: false,
                created_at: n.updated_at
            })),
            ...documents.map(d => ({
                _id: d._id,
                title: 'Document Uploaded',
                message: `Document "${d.name}" uploaded successfully`,
                type: 'success',
                read: false,
                created_at: d.uploaded_at
            })),
            ...approvals.map(a => ({
                _id: a._id,
                title: a.action === 'APPROVE_BUSINESS' ? 'Business Approved!' : 'Business Rejected',
                message: a.action === 'APPROVE_BUSINESS' 
                    ? 'Your business has been approved! You can now submit nominations.'
                    : `Your business was rejected: ${a.changes?.reason || 'No reason provided'}`,
                type: a.action === 'APPROVE_BUSINESS' ? 'success' : 'error',
                read: false,
                created_at: a.timestamp
            }))
        ];
        
        // Sort by date
        notifications.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        
        // Paginate
        const total = notifications.length;
        const paginated = notifications.slice(skip, skip + parseInt(limit));
        
        res.json({
            success: true,
            notifications: paginated,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Mark all notifications as read
app.post('/api/business/notifications/read-all', authenticate, authorize('business'), async (req, res) => {
    try {
        // Since notifications are generated on-the-fly, we can't mark them as read
        // Instead, we'll log this action and return success
        await logAudit(req, req.userId, 'business', 'MARK_ALL_NOTIFICATIONS_READ');
        
        res.json({ success: true, message: 'All notifications marked as read' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});
// ============ HEALTH CHECK ============
app.get('/api/health', async (req, res) => {
    const isConnected = mongoose.connection.readyState === 1;
    
    const stats = {
        businesses: await BusinessUser.countDocuments().catch(() => 0),
        pending: await BusinessUser.countDocuments({ status: 'pending' }).catch(() => 0),
        approved: await BusinessUser.countDocuments({ status: 'approved' }).catch(() => 0),
        rejected: await BusinessUser.countDocuments({ status: 'rejected' }).catch(() => 0),
        nominations: await Nomination.countDocuments().catch(() => 0),
        documents: await Document.countDocuments().catch(() => 0),
        announcements: await Announcement.countDocuments().catch(() => 0),
        judges: await Judge.countDocuments().catch(() => 0),
        categories: await Category.countDocuments().catch(() => 0)
    };
    
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'Liberia Business Awards API',
        version: '5.0.0',
        database: isConnected ? 'connected' : 'disconnected',
        stats,
        uptime: process.uptime()
    });
});

// ============ TEST ROUTES ============
app.get('/api/auth/test', (req, res) => {
    res.json({ 
        success: true,
        message: 'Auth routes working!',
        endpoints: {
            admin_login: '/api/auth/admin/login',
            business_login: '/api/auth/business/login',
            business_register: '/api/business/register',
            verify: '/api/auth/verify',
            refresh: '/api/auth/refresh',
            logout: '/api/auth/logout'
        }
    });
});

app.get('/api/business/test', (req, res) => {
    res.json({ 
        success: true,
        message: 'Business routes working!',
        endpoints: {
            register: '/api/business/register',
            login: '/api/auth/business/login',
            dashboard: '/api/business/dashboard',
            profile: '/api/business/profile',
            nominations: '/api/business/nominations',
            documents: '/api/business/documents',
            notifications: '/api/business/notifications'
        }
    });
});

// ============ HOME ROUTE ============
app.get('/', (req, res) => {
    res.json({
        service: 'Liberia Business Awards API',
        version: '5.0.0',
        status: 'operational',
        documentation: {
            public: [
                'GET  /',
                'GET  /api/health',
                'GET  /api/auth/test',
                'GET  /api/business/test',
                'GET  /api/announcements',
                'GET  /api/judges',
                'GET  /api/categories',
                'GET  /api/spotlight',
                'POST /api/auth/admin/login',
                'POST /api/auth/business/login',
                'POST /api/business/register',
                'POST /api/auth/verify',
                'POST /api/auth/refresh',
                'POST /api/auth/logout'
            ],
            admin: [
                'GET    /api/admin/businesses',
                'GET    /api/admin/businesses/pending',
                'GET    /api/admin/businesses/stats',
                'GET    /api/admin/businesses/:id',
                'POST   /api/admin/businesses/:id/approve',
                'POST   /api/admin/businesses/:id/reject',
                'POST   /api/admin/businesses/bulk-approve',
                'POST   /api/admin/businesses/bulk-reject',
                'DELETE /api/admin/businesses/bulk-delete',
                'POST   /api/admin/impersonate/:businessId',
                'GET    /api/admin/announcements',
                'POST   /api/admin/announcements',
                'PUT    /api/admin/announcements/:id',
                'DELETE /api/admin/announcements/:id',
                'GET    /api/admin/judges',
                'POST   /api/admin/judges',
                'PUT    /api/admin/judges/:id',
                'DELETE /api/admin/judges/:id',
                'GET    /api/admin/categories',
                'POST   /api/admin/categories',
                'PUT    /api/admin/categories/:id',
                'DELETE /api/admin/categories/:id',
                'GET    /api/admin/system-users',
                'POST   /api/admin/system-users',
                'PUT    /api/admin/system-users/:id',
                'DELETE /api/admin/system-users/:id',
                'POST   /api/admin/system-users/:id/toggle-status',
                'GET    /api/admin/settings',
                'PUT    /api/admin/settings',
                'GET    /api/admin/audit-logs',
                'GET    /api/admin/analytics',
                'POST   /api/admin/reports/generate',
                'GET    /api/admin/spotlight',
                'POST   /api/admin/spotlight',
                'PUT    /api/admin/spotlight/:id',
                'DELETE /api/admin/spotlight/:id'
            ],
            business: [
                'GET    /api/business/dashboard',
                'PUT    /api/business/profile',
                'GET    /api/business/nominations',
                'POST   /api/business/nominations',
                'PUT    /api/business/nominations/:id',
                'DELETE /api/business/nominations/:id',
                'POST   /api/business/nominations/draft',
                'GET    /api/business/documents',
                'POST   /api/business/documents',
                'GET    /api/business/documents/:id/view',
                'GET    /api/business/documents/:id/download',
                'DELETE /api/business/documents/:id',
                'GET    /api/business/notifications'
            ]
        }
    });
});

// ============ 404 HANDLER ============
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found',
        available_endpoints: {
            public: ['/', '/api/health', '/api/auth/test', '/api/business/test']
        }
    });
});

// ============ ERROR HANDLER ============
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ success: false, message: 'File too large. Max size: 10MB' });
        }
        return res.status(400).json({ success: false, message: err.message });
    }
    
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// ============ START SERVER ============
async function startServer() {
    console.log('='.repeat(70));
    console.log('🚀 LIBERIA BUSINESS AWARDS - PRODUCTION SYSTEM V5.0');
    console.log('='.repeat(70));
    
    const connected = await connectToMongoDB();
    
    const server = app.listen(PORT, '0.0.0.0', () => {
        console.log('\n✅ SERVER RUNNING');
        console.log('='.repeat(70));
        console.log(`📡 Port: ${PORT}`);
        console.log(`🌍 Public: https://liberia-business-awards-backend.onrender.com`);
        console.log(`🗄️  MongoDB: ${connected ? '✅ CONNECTED' : '❌ DISCONNECTED'}`);
        console.log('='.repeat(70));
        console.log('\n📊 BUSINESS AUTHENTICATION SYSTEM:');
        console.log('   • Registration → pending');
        console.log('   • Admin approves → active');
        console.log('   • Business can then login');
        console.log('   • Account locking after 5 failed attempts');
        console.log('   • CSRF protection enabled');
        console.log('   • Rate limiting enabled');
        console.log('   • Audit logging active');
        console.log('\n🚀 System ready for production!');
    });

    server.on('error', (error) => {
        console.error('❌ Server error:', error);
        process.exit(1);
    });
}

// ============ PROCESS HANDLERS ============
process.on('uncaughtException', (err) => {
    console.error('💥 UNCAUGHT EXCEPTION:', err);
    console.error(err.stack);
    process.exit(1);
});

process.on('unhandledRejection', (err) => {
    console.error('🔥 UNHANDLED REJECTION:', err);
    console.error(err.stack);
    process.exit(1);
});

// Start the server
startServer();
