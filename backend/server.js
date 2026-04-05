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

// Create uploads directory
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

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
        
        const document = new BusinessDocument({
            business_id: req.user._id,
            name,
            type: type || 'other',
            file_url: `/uploads/${req.file.filename}`,
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

startServer();
