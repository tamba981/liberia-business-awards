// ============================================
// LIBERIA BUSINESS AWARDS - PRODUCTION SYSTEM V4.0
// COMPLETE AUTHENTICATION SYSTEM
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

const app = express();
const PORT = process.env.PORT || 10000;

// ============ ENVIRONMENT VARIABLES ============
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@liberiabusinessawardslr.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123!';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

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
            'http://127.0.0.1:3000'
        ];
        
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// ============ DATABASE SCHEMAS ============

// Admin Schema
const adminSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    role: { type: String, enum: ['super_admin', 'admin'], default: 'admin' },
    last_login: { type: Date },
    login_attempts: { type: Number, default: 0 },
    lock_until: { type: Date },
    is_active: { type: Boolean, default: true }
}, { timestamps: true });

// Business User Schema
const businessUserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    business_name: { type: String, required: true },
    contact_name: { type: String },
    phone: { type: String },
    business_type: { type: String },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'suspended'], default: 'pending' },
    rejection_reason: { type: String },
    approved_at: { type: Date },
    approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    last_login: { type: Date },
    login_attempts: { type: Number, default: 0 },
    lock_until: { type: Date },
    notes: { type: String }
}, { timestamps: true });

// Hash password middleware
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

// Password comparison methods
adminSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

businessUserSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Check if account is locked
businessUserSchema.methods.isLocked = function() {
    return !!(this.lock_until && this.lock_until > Date.now());
};

// Increment login attempts
businessUserSchema.methods.incrementLoginAttempts = function() {
    this.login_attempts += 1;
    if (this.login_attempts >= 5) {
        this.lock_until = Date.now() + 30 * 60 * 1000; // Lock for 30 minutes
    }
    return this.save();
};

// Reset login attempts
businessUserSchema.methods.resetLoginAttempts = function() {
    this.login_attempts = 0;
    this.lock_until = undefined;
    return this.save();
};

// Create models
const Admin = mongoose.model('Admin', adminSchema);
const BusinessUser = mongoose.model('BusinessUser', businessUserSchema);

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
                is_active: true
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

// ============ ADMIN BUSINESS MANAGEMENT ENDPOINTS ============

// Get pending businesses
app.get('/api/admin/businesses/pending', authenticate, authorize('admin'), async (req, res) => {
    try {
        const businesses = await BusinessUser.find({ status: 'pending' })
            .sort({ created_at: -1 });
        
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

// Get all businesses
app.get('/api/admin/businesses', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { status } = req.query;
        let query = {};
        if (status && status !== 'all') {
            query.status = status;
        }
        
        const businesses = await BusinessUser.find(query)
            .sort({ created_at: -1 });
        
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
            }))
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

// ============ ANNOUNCEMENTS MANAGEMENT ============
// Get all announcements
app.get('/api/admin/announcements', authenticate, authorize('admin'), async (req, res) => {
    try {
        const announcements = await Announcement.find().sort({ created_at: -1 });
        res.json({ success: true, announcements });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Create announcement
app.post('/api/admin/announcements', authenticate, authorize('admin'), async (req, res) => {
    try {
        const announcement = new Announcement({
            ...req.body,
            created_by: req.user._id
        });
        await announcement.save();
        res.json({ success: true, announcement });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update announcement
app.put('/api/admin/announcements/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const announcement = await Announcement.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );
        res.json({ success: true, announcement });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Delete announcement
app.delete('/api/admin/announcements/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        await Announcement.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ JUDGES MANAGEMENT ============
app.get('/api/admin/judges', authenticate, authorize('admin'), async (req, res) => {
    try {
        const judges = await Judge.find().sort({ created_at: -1 });
        res.json({ success: true, judges });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/admin/judges', authenticate, authorize('admin'), async (req, res) => {
    try {
        const judge = new Judge(req.body);
        await judge.save();
        res.json({ success: true, judge });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/admin/judges/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const judge = await Judge.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ success: true, judge });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/admin/judges/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        await Judge.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ CATEGORIES MANAGEMENT ============
app.get('/api/admin/categories', authenticate, authorize('admin'), async (req, res) => {
    try {
        const categories = await Category.find().sort({ name: 1 });
        res.json({ success: true, categories });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/admin/categories', authenticate, authorize('admin'), async (req, res) => {
    try {
        const category = new Category(req.body);
        await category.save();
        res.json({ success: true, category });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/admin/categories/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const category = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ success: true, category });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/admin/categories/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        await Category.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ SYSTEM USERS MANAGEMENT ============
app.get('/api/admin/system-users', authenticate, authorize('admin'), async (req, res) => {
    try {
        const users = await SystemUser.find().select('-password').sort({ created_at: -1 });
        res.json({ success: true, users });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/admin/system-users', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { fullName, email, password, role } = req.body;
        
        // Check if user exists
        const existing = await SystemUser.findOne({ email });
        if (existing) {
            return res.status(400).json({ success: false, error: 'Email already exists' });
        }
        
        const user = new SystemUser({
            fullName,
            email,
            password,
            role,
            status: 'active'
        });
        await user.save();
        
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

app.put('/api/admin/system-users/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { fullName, email, role, status } = req.body;
        const user = await SystemUser.findById(req.params.id);
        
        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        user.fullName = fullName || user.fullName;
        user.email = email || user.email;
        user.role = role || user.role;
        user.status = status || user.status;
        
        await user.save();
        
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

app.delete('/api/admin/system-users/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        // Prevent deleting yourself
        if (req.params.id === req.user._id.toString()) {
            return res.status(400).json({ success: false, error: 'Cannot delete your own account' });
        }
        
        await SystemUser.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/admin/system-users/:id/toggle-status', authenticate, authorize('admin'), async (req, res) => {
    try {
        const user = await SystemUser.findById(req.params.id);
        user.status = user.status === 'active' ? 'inactive' : 'active';
        await user.save();
        res.json({ success: true, status: user.status });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ SYSTEM SETTINGS ============
app.get('/api/admin/settings', authenticate, authorize('admin'), async (req, res) => {
    try {
        const settings = await SystemSettings.getSettings();
        res.json({ success: true, settings });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/admin/settings', authenticate, authorize('admin'), async (req, res) => {
    try {
        let settings = await SystemSettings.findOne();
        if (!settings) {
            settings = new SystemSettings();
        }
        
        Object.assign(settings, req.body, { updated_by: req.user._id });
        await settings.save();
        
        res.json({ success: true, settings });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ ANALYTICS ============
app.get('/api/admin/analytics', authenticate, authorize('admin'), async (req, res) => {
    try {
        const [
            totalBusinesses,
            totalNominations,
            pendingBusinesses,
            featuredBusinesses,
            totalUsers,
            totalAnnouncements,
            totalJudges,
            totalCategories
        ] = await Promise.all([
            BusinessUser.countDocuments(),
            require('./models/Nomination')?.countDocuments?.() || 0,
            BusinessUser.countDocuments({ status: 'pending' }),
            require('./models/BusinessSpotlight')?.countDocuments?.({ status: 'featured' }) || 0,
            SystemUser.countDocuments(),
            Announcement.countDocuments(),
            Judge.countDocuments(),
            Category.countDocuments()
        ]);

        // Get monthly registration data (last 6 months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        
        const monthlyRegistrations = await BusinessUser.aggregate([
            { $match: { created_at: { $gte: sixMonthsAgo } } },
            { $group: {
                _id: { $month: "$created_at" },
                count: { $sum: 1 }
            }},
            { $sort: { _id: 1 } }
        ]);

        res.json({
            success: true,
            analytics: {
                overview: {
                    totalBusinesses,
                    totalNominations,
                    pendingBusinesses,
                    featuredBusinesses,
                    totalUsers,
                    totalAnnouncements,
                    totalJudges,
                    totalCategories
                },
                charts: {
                    monthlyRegistrations
                }
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ REPORTS ============
app.post('/api/admin/reports/generate', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { type, format } = req.body;
        let data = [];
        
        switch(type) {
            case 'businesses':
                data = await BusinessUser.find().sort({ created_at: -1 });
                break;
            case 'nominations':
                data = await require('./models/Nomination')?.find().populate('business_id') || [];
                break;
            case 'judges':
                data = await Judge.find().sort({ created_at: -1 });
                break;
            default:
                return res.status(400).json({ success: false, error: 'Invalid report type' });
        }

        if (format === 'csv') {
            // Return as CSV
            const csv = convertToCSV(data);
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename=${type}-report.csv`);
            res.send(csv);
        } else {
            // Return as JSON
            res.json({ success: true, data });
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Helper function for CSV conversion
function convertToCSV(data) {
    if (!data || data.length === 0) return '';
    
    const headers = Object.keys(data[0]).filter(key => 
        !key.includes('password') && !key.includes('__v')
    );
    
    let csv = headers.join(',') + '\n';
    
    data.forEach(item => {
        const row = headers.map(header => {
            let value = item[header];
            if (value instanceof Date) value = value.toISOString().split('T')[0];
            if (typeof value === 'object') value = JSON.stringify(value);
            return `"${value || ''}"`;
        }).join(',');
        csv += row + '\n';
    });
    
    return csv;
}


// ============ AUTH ROUTES ============

// Admin Login
app.post('/api/auth/admin/login', async (req, res) => {
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
        
        const token = jwt.sign(
            { userId: admin._id, role: 'admin' }, 
            JWT_SECRET, 
            { expiresIn: JWT_EXPIRES_IN }
        );
        
        admin.last_login = new Date();
        await admin.save();
        
        res.json({
            success: true,
            token,
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
app.post('/api/auth/business/login', async (req, res) => {
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
        
        const token = jwt.sign(
            { userId: business._id, role: 'business' }, 
            JWT_SECRET, 
            { expiresIn: JWT_EXPIRES_IN }
        );
        
        business.last_login = new Date();
        await business.save();
        
        res.json({
            success: true,
            token,
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
        
        res.status(201).json({
            success: true,
            message: 'Registration successful! Your account is pending admin approval. You will be able to login once approved.'
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
            name: req.user.business_name || req.user.name,
            role: req.userRole,
            status: req.user.status
        }
    });
});

// ============ BUSINESS DASHBOARD ROUTES ============

// Get business dashboard data
app.get('/api/business/dashboard', authenticate, authorize('business'), async (req, res) => {
    try {
        const business = req.user;
        
        res.json({
            success: true,
            dashboard: {
                profile: {
                    business_name: business.business_name,
                    email: business.email,
                    contact_name: business.contact_name,
                    phone: business.phone,
                    business_type: business.business_type,
                    status: business.status,
                    member_since: business.created_at
                },
                stats: {
                    profile_completion: calculateProfileCompletion(business),
                    total_nominations: 0,
                    active_nominations: 0
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
app.put('/api/business/profile', authenticate, authorize('business'), async (req, res) => {
    try {
        const { business_name, contact_name, phone, business_type } = req.body;
        const business = req.user;
        
        if (business_name) business.business_name = business_name;
        if (contact_name) business.contact_name = contact_name;
        if (phone) business.phone = phone;
        if (business_type) business.business_type = business_type;
        
        await business.save();
        
        res.json({
            success: true,
            message: 'Profile updated successfully',
            profile: {
                business_name: business.business_name,
                email: business.email,
                contact_name: business.contact_name,
                phone: business.phone,
                business_type: business.business_type,
                status: business.status
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
    let completed = 0;
    const total = 5; // email, business_name, contact_name, phone, business_type
    
    if (business.email) completed++;
    if (business.business_name) completed++;
    if (business.contact_name) completed++;
    if (business.phone) completed++;
    if (business.business_type) completed++;
    
    return Math.round((completed / total) * 100);
}

// ============ HEALTH CHECK ============
app.get('/api/health', async (req, res) => {
    const isConnected = mongoose.connection.readyState === 1;
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'Liberia Business Awards API',
        version: '4.0.0',
        database: isConnected ? 'connected' : 'disconnected',
        stats: {
            businesses: await BusinessUser.countDocuments().catch(() => 0),
            pending: await BusinessUser.countDocuments({ status: 'pending' }).catch(() => 0),
            approved: await BusinessUser.countDocuments({ status: 'approved' }).catch(() => 0),
            rejected: await BusinessUser.countDocuments({ status: 'rejected' }).catch(() => 0)
        },
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
            verify: '/api/auth/verify'
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
            profile: '/api/business/profile'
        }
    });
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
                'GET  /api/auth/test',
                'GET  /api/business/test',
                'POST /api/auth/admin/login',
                'POST /api/auth/business/login',
                'POST /api/business/register',
                'POST /api/auth/verify'
            ],
            admin: [
                'GET  /api/admin/businesses',
                'GET  /api/admin/businesses/pending',
                'GET  /api/admin/businesses/stats',
                'POST /api/admin/businesses/:id/approve',
                'POST /api/admin/businesses/:id/reject'
            ],
            business: [
                'GET  /api/business/dashboard',
                'PUT  /api/business/profile'
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

// ============ START SERVER ============
async function startServer() {
    console.log('='.repeat(70));
    console.log('🚀 LIBERIA BUSINESS AWARDS - PRODUCTION SYSTEM V4.0');
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
        console.log('\n🚀 System ready for production!');
    });

    server.on('error', (error) => {
        console.error('❌ Server error:', error);
        process.exit(1);
    });
}

// ============ ERROR HANDLERS ============
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

