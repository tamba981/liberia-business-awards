// ============================================
// LIBERIA BUSINESS AWARDS - ENTERPRISE MVP
// ============================================
console.log('🚀 Starting Liberia Business Awards MVP System...');

// Core dependencies
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

const app = express();
const PORT = process.env.PORT || 10000;

// ============ SECURITY CONFIGURATION ============
app.use(helmet());
app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: 'Too many requests from this IP, please try again later.'
}));

// ============ ENVIRONMENT VARIABLES ============
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://your-mongodb-uri';
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const BACKUP_DIR = path.join(__dirname, 'backups');
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@liberiabusinessawards.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123!';

// ============ DATABASE CONNECTION ============
async function connectToMongoDB() {
    try {
        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
        });
        console.log('✅ MongoDB Atlas Connected');
        await createDefaultAdmin();
        return true;
    } catch (error) {
        console.error('❌ MongoDB Connection Failed:', error.message);
        return false;
    }
}

// ============ CREATE DEFAULT ADMIN ============
async function createDefaultAdmin() {
    try {
        const adminExists = await User.findOne({ email: ADMIN_EMAIL });
        
        if (!adminExists) {
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, salt);
            
            const admin = new User({
                email: ADMIN_EMAIL,
                password: hashedPassword,
                company_name: 'Liberia Business Awards',
                contact_person: 'System Administrator',
                phone: '+231 886 590 302',
                address: 'Monrovia, Liberia',
                role: 'admin',
                status: 'active',
                verified: true
            });
            
            await admin.save();
            console.log('👑 Default admin account created');
        }
    } catch (error) {
        console.error('Admin creation error:', error);
    }
}

// ============ DATABASE SCHEMAS ============

// 1. Enhanced User Schema
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    company_name: { type: String, required: true },
    contact_person: { type: String, required: true },
    phone: { type: String, required: true },
    address: { type: String, required: true },
    website: { type: String },
    business_type: { 
        type: String, 
        enum: [
            'agriculture', 'mining', 'oil-gas', 'manufacturing', 'construction',
            'energy', 'transportation', 'technology', 'finance', 'education',
            'health', 'tourism', 'trade', 'public-sector', 'civil-society',
            'media', 'arts-culture', 'sports', 'other'
        ],
        required: true
    },
    
    // Business Registration Details
    registration_number: { type: String },
    tax_clearance_certificate: { type: String },
    business_license: { type: String },
    tin_number: { type: String },
    registration_date: { type: Date },
    
    // Business Details
    year_established: { type: Number, required: true },
    number_of_employees: { 
        type: String, 
        enum: ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'],
        required: true
    },
    annual_revenue: {
        type: String,
        enum: ['< $100K', '$100K - $500K', '$500K - $1M', '$1M - $5M', '$5M - $10M', '> $10M']
    },
    
    // Business Profile
    description: { type: String, required: true },
    mission_statement: { type: String },
    vision_statement: { type: String },
    core_values: [{ type: String }],
    achievements: [{ 
        title: String,
        description: String,
        year: Number,
        impact: String
    }],
    certifications: [{
        name: String,
        issuer: String,
        year: Number,
        expiry_date: Date
    }],
    
    // Awards History
    awards: [{ 
        name: String,
        issuer: String,
        year: Number,
        category: String,
        description: String
    }],
    
    // Documents
    logo_url: { type: String },
    documents: [{
        name: String,
        url: String,
        type: String,
        uploaded_at: { type: Date, default: Date.now },
        verified: { type: Boolean, default: false }
    }],
    
    // Social Media
    social_media: {
        facebook: String,
        linkedin: String,
        twitter: String,
        instagram: String,
        youtube: String
    },
    
    // Account Management
    role: { type: String, enum: ['business', 'admin', 'judge', 'moderator'], default: 'business' },
    status: { type: String, enum: ['pending', 'active', 'suspended', 'rejected', 'verified'], default: 'pending' },
    verified: { type: Boolean, default: false },
    verification_token: { type: String },
    reset_token: { type: String },
    reset_expires: { type: Date },
    last_login: { type: Date },
    login_history: [{
        ip: String,
        device: String,
        timestamp: { type: Date, default: Date.now }
    }],
    
    // Preferences
    email_notifications: { type: Boolean, default: true },
    sms_notifications: { type: Boolean, default: false },
    newsletter_subscription: { type: Boolean, default: true },
    
    // Timestamps
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { timestamps: true });

// 2. Enhanced Nomination Schema
const nominationSchema = new mongoose.Schema({
    business_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category: { type: String, required: true },
    sub_category: { type: String },
    year: { type: Number, required: true },
    
    // Nomination Details
    submission_statement: { type: String, required: true },
    executive_summary: { type: String, required: true },
    
    // Business Performance Metrics
    financial_performance: {
        revenue: String,
        growth_percentage: Number,
        profitability: String,
        financial_statement_url: String
    },
    
    // Innovation & Excellence
    innovations: [{
        title: String,
        description: String,
        impact: String,
        evidence_url: String
    }],
    
    // Social Impact
    social_impact: {
        jobs_created: Number,
        community_projects: [{
            name: String,
            description: String,
            beneficiaries: Number
        }],
        environmental_initiatives: String,
        csr_activities: String
    },
    
    // Market Position
    market_position: {
        market_share: String,
        competitive_advantage: String,
        client_testimonials: [{
            name: String,
            position: String,
            testimonial: String,
            company: String
        }]
    },
    
    // Supporting Documents
    documents: [{
        name: String,
        url: String,
        type: String,
        description: String
    }],
    
    // Status & Evaluation
    status: { 
        type: String, 
        enum: ['draft', 'submitted', 'under_review', 'shortlisted', 'finalist', 'winner', 'not_selected'],
        default: 'draft'
    },
    scores: [{
        judge_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        criteria: String,
        score: { type: Number, min: 0, max: 100 },
        comments: String,
        date: { type: Date, default: Date.now }
    }],
    average_score: { type: Number, default: 0 },
    feedback: { type: String },
    winner_position: { type: String, enum: ['gold', 'silver', 'bronze', null] },
    
    // Timeline
    submitted_at: { type: Date },
    reviewed_at: { type: Date },
    shortlisted_at: { type: Date },
    awarded_at: { type: Date },
    
    // Metadata
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

// 3. News & Announcement Schema
const announcementSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: { type: String, required: true },
    excerpt: { type: String },
    type: { type: String, enum: ['news', 'event', 'deadline', 'winner', 'update', 'feature'], required: true },
    category: { type: String },
    target_audience: [{ 
        type: String, 
        enum: ['all', 'businesses', 'nominees', 'winners', 'public', 'admin', 'specific_businesses'] 
    }],
    specific_businesses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    
    // Media
    featured_image: { type: String },
    attachments: [{ 
        name: String, 
        url: String,
        type: String 
    }],
    
    // Publishing
    publish_date: { type: Date, default: Date.now },
    expiry_date: { type: Date },
    is_published: { type: Boolean, default: false },
    is_featured: { type: Boolean, default: false },
    views: { type: Number, default: 0 },
    
    // Author
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    
    // SEO
    slug: { type: String, unique: true },
    meta_title: { type: String },
    meta_description: { type: String },
    tags: [{ type: String }],
    
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

// 4. Notification Schema
const notificationSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { 
        type: String, 
        enum: ['system', 'nomination', 'award', 'announcement', 'reminder', 'verification'],
        default: 'system'
    },
    related_id: { type: mongoose.Schema.Types.ObjectId },
    related_type: { type: String },
    
    // Status
    is_read: { type: Boolean, default: false },
    is_archived: { type: Boolean, default: false },
    priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
    
    // Delivery
    sent_via: [{ type: String, enum: ['in_app', 'email', 'sms'] }],
    delivered_at: { type: Date },
    read_at: { type: Date },
    
    created_at: { type: Date, default: Date.now }
});

// 5. Analytics Schema
const analyticsSchema = new mongoose.Schema({
    date: { type: Date, required: true },
    metrics: {
        total_users: { type: Number, default: 0 },
        new_registrations: { type: Number, default: 0 },
        active_users: { type: Number, default: 0 },
        total_nominations: { type: Number, default: 0 },
        pending_nominations: { type: Number, default: 0 },
        submissions_today: { type: Number, default: 0 },
        page_views: { type: Number, default: 0 }
    },
    category_breakdown: {
        agriculture: { type: Number, default: 0 },
        technology: { type: Number, default: 0 },
        manufacturing: { type: Number, default: 0 },
        finance: { type: Number, default: 0 },
        other: { type: Number, default: 0 }
    }
});

// Create Models
const User = mongoose.model('User', userSchema);
const Nomination = mongoose.model('Nomination', nominationSchema);
const Announcement = mongoose.model('Announcement', announcementSchema);
const Notification = mongoose.model('Notification', notificationSchema);
const Analytics = mongoose.model('Analytics', analyticsSchema);

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
            'https://liberia-business-awards.netlify.app'
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

// Authentication Middleware
const authenticate = async (req, res, next) => {
    try {
        const token = req.header('x-auth-token') || 
                     req.header('Authorization')?.replace('Bearer ', '') ||
                     req.query.token;

        if (!token) {
            return res.status(401).json({ 
                success: false, 
                message: 'Access denied. No token provided.' 
            });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.userId).select('-password -verification_token -reset_token');

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

// File Upload Configuration
const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
        const userDir = req.user ? `users/${req.user.id}` : 'public';
        const dir = path.join(UPLOAD_DIR, userDir);
        await fs.mkdir(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(7)}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
            'application/pdf', 
            'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        ];
        
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Allowed: images, PDF, Word, Excel, PowerPoint'));
        }
    }
});

// ============ UTILITY FUNCTIONS ============
async function ensureDirectories() {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    await fs.mkdir(path.join(UPLOAD_DIR, 'logos'), { recursive: true });
    await fs.mkdir(path.join(UPLOAD_DIR, 'documents'), { recursive: true });
    await fs.mkdir(path.join(UPLOAD_DIR, 'nominations'), { recursive: true });
    console.log('📁 All directories created successfully');
}

// Generate slug
function generateSlug(text) {
    return text
        .toLowerCase()
        .replace(/[^\w ]+/g, '')
        .replace(/ +/g, '-');
}

// Send notification
async function sendNotification(userId, title, message, type = 'system', relatedId = null) {
    try {
        const notification = new Notification({
            user_id: userId,
            title,
            message,
            type,
            related_id: relatedId
        });
        await notification.save();
        return notification;
    } catch (error) {
        console.error('Notification error:', error);
    }
}

// Update analytics
async function updateAnalytics() {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const metrics = {
            total_users: await User.countDocuments(),
            new_registrations: await User.countDocuments({ created_at: { $gte: today } }),
            active_users: await User.countDocuments({ status: 'active' }),
            total_nominations: await Nomination.countDocuments(),
            pending_nominations: await Nomination.countDocuments({ status: 'submitted' }),
            submissions_today: await Nomination.countDocuments({ submitted_at: { $gte: today } })
        };

        await Analytics.findOneAndUpdate(
            { date: today },
            { metrics, $setOnInsert: { date: today } },
            { upsert: true, new: true }
        );
    } catch (error) {
        console.error('Analytics update error:', error);
    }
}

// ============ API ROUTES ============

// 1. AUTHENTICATION & REGISTRATION
app.post('/api/auth/register', [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
    body('company_name').notEmpty().trim(),
    body('contact_person').notEmpty().trim(),
    body('phone').notEmpty().trim(),
    body('address').notEmpty().trim(),
    body('business_type').notEmpty(),
    body('year_established').isInt({ min: 1900, max: new Date().getFullYear() }),
    body('number_of_employees').notEmpty(),
    body('description').notEmpty().trim()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        
        const { email, password, company_name, contact_person, phone, address, business_type, year_established, number_of_employees, description } = req.body;
        
        // Check if user exists
        let user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ 
                success: false, 
                message: 'Business already registered with this email.' 
            });
        }
        
        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        
        // Create verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        
        // Create user
        user = new User({
            email,
            password: hashedPassword,
            company_name,
            contact_person,
            phone,
            address,
            business_type,
            year_established,
            number_of_employees,
            description,
            verification_token: verificationToken,
            role: 'business',
            status: 'pending'
        });
        
        await user.save();
        
        // Create token
        const token = jwt.sign({ 
            userId: user._id, 
            role: user.role,
            email: user.email
        }, JWT_SECRET, { expiresIn: '30d' });
        
        // Send welcome notification
        await sendNotification(
            user._id,
            'Welcome to Liberia Business Awards!',
            'Your account has been created and is pending verification. Our team will review your registration shortly.',
            'system'
        );
        
        // Update analytics
        await updateAnalytics();
        
        res.status(201).json({
            success: true,
            message: 'Business registered successfully! Your account is pending verification.',
            token,
            user: {
                id: user._id,
                email: user.email,
                company_name: user.company_name,
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

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Find user
        const user = await User.findOne({ email });
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
        user.login_history.push({
            ip: req.ip,
            device: req.headers['user-agent']
        });
        await user.save();
        
        // Create token
        const token = jwt.sign({ 
            userId: user._id, 
            role: user.role,
            email: user.email
        }, JWT_SECRET, { expiresIn: '30d' });
        
        res.json({
            success: true,
            message: 'Login successful',
            token,
            user: {
                id: user._id,
                email: user.email,
                company_name: user.company_name,
                contact_person: user.contact_person,
                role: user.role,
                status: user.status,
                business_type: user.business_type,
                verified: user.verified
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

// 2. BUSINESS PORTAL ROUTES
app.get('/api/business/profile', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user.id)
            .select('-password -verification_token -reset_token -login_history')
            .populate('awards', 'name year category')
            .populate('documents', 'name type uploaded_at verified');
        
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'Business profile not found.' 
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

app.put('/api/business/profile', authenticate, async (req, res) => {
    try {
        const updates = req.body;
        
        // Remove fields that shouldn't be updated directly
        delete updates.password;
        delete updates.role;
        delete updates.status;
        delete updates.verified;
        delete updates.email;
        
        // If updating registration documents, mark as unverified
        if (updates.registration_number || updates.tax_clearance_certificate || updates.business_license) {
            updates.verified = false;
        }
        
        const user = await User.findByIdAndUpdate(
            req.user.id,
            { ...updates, updated_at: new Date() },
            { new: true, runValidators: true }
        ).select('-password');
        
        // Send notification about profile update
        await sendNotification(
            user._id,
            'Profile Updated',
            'Your business profile has been updated successfully.',
            'system'
        );
        
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

app.post('/api/business/upload', authenticate, upload.array('files', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'No files uploaded.' 
            });
        }
        
        const documents = req.files.map(file => ({
            name: file.originalname,
            url: `/uploads/users/${req.user.id}/${file.filename}`,
            type: file.mimetype.split('/')[1] || 'file',
            uploaded_at: new Date()
        }));
        
        await User.findByIdAndUpdate(req.user.id, {
            $push: { documents: { $each: documents } }
        });
        
        // Send notification
        await sendNotification(
            req.user.id,
            'Documents Uploaded',
            `${documents.length} document(s) have been uploaded to your profile.`,
            'system'
        );
        
        res.json({
            success: true,
            message: 'Files uploaded successfully.',
            documents,
            count: documents.length
        });
        
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error uploading files.' 
        });
    }
});

// 3. NOMINATION MANAGEMENT
app.post('/api/nominations', authenticate, async (req, res) => {
    try {
        // Check if business is verified
        if (!req.user.verified) {
            return res.status(403).json({ 
                success: false, 
                message: 'Please complete your business verification before submitting nominations.' 
            });
        }
        
        const nominationData = {
            ...req.body,
            business_id: req.user.id,
            status: 'draft'
        };
        
        const nomination = new Nomination(nominationData);
        await nomination.save();
        
        // Send notification
        await sendNotification(
            req.user.id,
            'Nomination Draft Created',
            `Your nomination for ${nomination.category} has been saved as draft.`,
            'nomination',
            nomination._id
        );
        
        res.status(201).json({
            success: true,
            message: 'Nomination draft created successfully.',
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

app.get('/api/business/nominations', authenticate, async (req, res) => {
    try {
        const { status, year } = req.query;
        let query = { business_id: req.user.id };
        
        if (status && status !== 'all') {
            query.status = status;
        }
        
        if (year) {
            query.year = parseInt(year);
        }
        
        const nominations = await Nomination.find(query)
            .populate('business_id', 'company_name logo_url')
            .sort({ created_at: -1 });
        
        const stats = {
            total: await Nomination.countDocuments({ business_id: req.user.id }),
            draft: await Nomination.countDocuments({ business_id: req.user.id, status: 'draft' }),
            submitted: await Nomination.countDocuments({ business_id: req.user.id, status: 'submitted' }),
            shortlisted: await Nomination.countDocuments({ business_id: req.user.id, status: 'shortlisted' }),
            finalist: await Nomination.countDocuments({ business_id: req.user.id, status: 'finalist' }),
            winner: await Nomination.countDocuments({ business_id: req.user.id, status: 'winner' })
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

app.put('/api/nominations/:id/submit', authenticate, async (req, res) => {
    try {
        const nomination = await Nomination.findOne({
            _id: req.params.id,
            business_id: req.user.id
        });
        
        if (!nomination) {
            return res.status(404).json({ 
                success: false, 
                message: 'Nomination not found.' 
            });
        }
        
        if (nomination.status !== 'draft') {
            return res.status(400).json({ 
                success: false, 
                message: 'Nomination has already been submitted.' 
            });
        }
        
        nomination.status = 'submitted';
        nomination.submitted_at = new Date();
        await nomination.save();
        
        // Send notification to admin
        const admins = await User.find({ role: 'admin', status: 'active' });
        for (const admin of admins) {
            await sendNotification(
                admin._id,
                'New Nomination Submitted',
                `${req.user.company_name} has submitted a nomination for ${nomination.category}.`,
                'nomination',
                nomination._id
            );
        }
        
        // Send notification to business
        await sendNotification(
            req.user.id,
            'Nomination Submitted',
            `Your nomination for ${nomination.category} has been submitted successfully.`,
            'nomination',
            nomination._id
        );
        
        res.json({
            success: true,
            message: 'Nomination submitted successfully.',
            nomination
        });
        
    } catch (error) {
        console.error('Nomination submission error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error submitting nomination.' 
        });
    }
});

// 4. ADMIN DASHBOARD ROUTES
app.get('/api/admin/dashboard', authenticate, authorize('admin'), async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        
        // Get all metrics
        const [
            totalBusinesses,
            activeBusinesses,
            pendingBusinesses,
            verifiedBusinesses,
            totalNominations,
            pendingNominations,
            recentBusinesses,
            recentNominations,
            recentActivity,
            categoryStats,
            registrationTrend,
            nominationTrend
        ] = await Promise.all([
            User.countDocuments({ role: 'business' }),
            User.countDocuments({ role: 'business', status: 'active' }),
            User.countDocuments({ role: 'business', status: 'pending' }),
            User.countDocuments({ role: 'business', verified: true }),
            Nomination.countDocuments(),
            Nomination.countDocuments({ status: 'submitted' }),
            User.find({ role: 'business' })
                .sort({ created_at: -1 })
                .limit(10)
                .select('company_name email status verified created_at'),
            Nomination.find()
                .populate('business_id', 'company_name')
                .sort({ submitted_at: -1 })
                .limit(10)
                .select('category status submitted_at average_score'),
            User.aggregate([
                { $match: { role: 'business' } },
                { $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$created_at" } },
                    count: { $sum: 1 }
                }},
                { $sort: { _id: -1 } },
                { $limit: 30 }
            ]),
            Nomination.aggregate([
                { $group: {
                    _id: "$category",
                    count: { $sum: 1 },
                    average_score: { $avg: "$average_score" }
                }},
                { $sort: { count: -1 } }
            ]),
            User.aggregate([
                { $match: { 
                    role: 'business',
                    created_at: { $gte: monthAgo }
                }},
                { $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$created_at" } },
                    count: { $sum: 1 }
                }},
                { $sort: { _id: 1 } }
            ]),
            Nomination.aggregate([
                { $match: { 
                    submitted_at: { $gte: monthAgo }
                }},
                { $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$submitted_at" } },
                    count: { $sum: 1 }
                }},
                { $sort: { _id: 1 } }
            ])
        ]);
        
        res.json({
            success: true,
            dashboard: {
                overview: {
                    businesses: {
                        total: totalBusinesses,
                        active: activeBusinesses,
                        pending: pendingBusinesses,
                        verified: verifiedBusinesses,
                        pending_verification: totalBusinesses - verifiedBusinesses
                    },
                    nominations: {
                        total: totalNominations,
                        pending: pendingNominations,
                        shortlisted: await Nomination.countDocuments({ status: 'shortlisted' }),
                        winners: await Nomination.countDocuments({ status: 'winner' })
                    }
                },
                recent_activity: {
                    businesses: recentBusinesses,
                    nominations: recentNominations,
                    registrations_today: await User.countDocuments({ 
                        role: 'business', 
                        created_at: { $gte: today } 
                    }),
                    submissions_today: await Nomination.countDocuments({ 
                        submitted_at: { $gte: today } 
                    })
                },
                analytics: {
                    category_stats: categoryStats,
                    registration_trend: registrationTrend,
                    nomination_trend: nominationTrend,
                    recent_activity: recentActivity
                }
            }
        });
        
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error loading dashboard.' 
        });
    }
});

// Admin - Get all businesses with filters
app.get('/api/admin/businesses', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { 
            status, 
            verified, 
            business_type, 
            search, 
            sort = 'created_at', 
            order = 'desc',
            page = 1, 
            limit = 20 
        } = req.query;
        
        let query = { role: 'business' };
        
        // Apply filters
        if (status && status !== 'all') {
            query.status = status;
        }
        
        if (verified !== undefined) {
            query.verified = verified === 'true';
        }
        
        if (business_type && business_type !== 'all') {
            query.business_type = business_type;
        }
        
        if (search) {
            query.$or = [
                { company_name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { contact_person: { $regex: search, $options: 'i' } },
                { registration_number: { $regex: search, $options: 'i' } }
            ];
        }
        
        // Sorting
        const sortOptions = {};
        sortOptions[sort] = order === 'desc' ? -1 : 1;
        
        // Pagination
        const skip = (page - 1) * limit;
        
        const [businesses, total] = await Promise.all([
            User.find(query)
                .select('-password -verification_token -reset_token -login_history')
                .sort(sortOptions)
                .skip(skip)
                .limit(parseInt(limit))
                .populate('documents', 'name type verified')
                .populate('nominations', 'category status year'),
            User.countDocuments(query)
        ]);
        
        // Get business types for filter
        const businessTypes = await User.distinct('business_type', { role: 'business' });
        
        res.json({
            success: true,
            businesses,
            filters: {
                statuses: ['all', 'pending', 'active', 'suspended', 'rejected', 'verified'],
                business_types: ['all', ...businessTypes],
                verified_options: ['all', 'true', 'false']
            },
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

// Admin - Update business status
app.put('/api/admin/businesses/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { status, verified, notes } = req.body;
        
        const updateData = { updated_at: new Date() };
        if (status) updateData.status = status;
        if (verified !== undefined) updateData.verified = verified;
        
        const business = await User.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        ).select('-password');
        
        if (!business) {
            return res.status(404).json({ 
                success: false, 
                message: 'Business not found.' 
            });
        }
        
        // Send notification to business
        let notificationMessage = 'Your account status has been updated.';
        if (status === 'active') {
            notificationMessage = 'Your account has been approved and activated!';
        } else if (status === 'rejected') {
            notificationMessage = 'Your registration has been rejected. Please contact support for details.';
        }
        
        await sendNotification(
            business._id,
            'Account Status Updated',
            notificationMessage,
            'system'
        );
        
        res.json({
            success: true,
            message: `Business ${status ? 'status' : 'verification'} updated successfully.`,
            business
        });
        
    } catch (error) {
        console.error('Business update error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error updating business.' 
        });
    }
});

// Admin - Delete business
app.delete('/api/admin/businesses/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const business = await User.findById(req.params.id);
        
        if (!business) {
            return res.status(404).json({ 
                success: false, 
                message: 'Business not found.' 
            });
        }
        
        // Archive instead of delete
        business.status = 'suspended';
        await business.save();
        
        res.json({
            success: true,
            message: 'Business account has been suspended.'
        });
        
    } catch (error) {
        console.error('Business delete error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error deleting business.' 
        });
    }
});

// Admin - Get all nominations
app.get('/api/admin/nominations', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { 
            status, 
            category, 
            year, 
            search,
            page = 1, 
            limit = 20 
        } = req.query;
        
        let query = {};
        
        if (status && status !== 'all') {
            query.status = status;
        }
        
        if (category && category !== 'all') {
            query.category = category;
        }
        
        if (year) {
            query.year = parseInt(year);
        }
        
        if (search) {
            query.$or = [
                { category: { $regex: search, $options: 'i' } },
                { submission_statement: { $regex: search, $options: 'i' } }
            ];
        }
        
        const [nominations, total] = await Promise.all([
            Nomination.find(query)
                .populate('business_id', 'company_name email phone business_type verified')
                .sort({ submitted_at: -1 })
                .skip((page - 1) * limit)
                .limit(parseInt(limit)),
            Nomination.countDocuments(query)
        ]);
        
        // Get categories and years for filters
        const categories = await Nomination.distinct('category');
        const years = await Nomination.distinct('year');
        
        res.json({
            success: true,
            nominations,
            filters: {
                statuses: ['all', 'draft', 'submitted', 'under_review', 'shortlisted', 'finalist', 'winner', 'not_selected'],
                categories: ['all', ...categories.sort()],
                years: years.sort((a, b) => b - a)
            },
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            },
            stats: {
                total,
                submitted: await Nomination.countDocuments({ status: 'submitted' }),
                under_review: await Nomination.countDocuments({ status: 'under_review' }),
                shortlisted: await Nomination.countDocuments({ status: 'shortlisted' }),
                winners: await Nomination.countDocuments({ status: 'winner' })
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

// Admin - Update nomination status
app.put('/api/admin/nominations/:id/status', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { status, feedback } = req.body;
        
        const nomination = await Nomination.findById(req.params.id)
            .populate('business_id', 'company_name email');
        
        if (!nomination) {
            return res.status(404).json({ 
                success: false, 
                message: 'Nomination not found.' 
            });
        }
        
        nomination.status = status;
        if (feedback) nomination.feedback = feedback;
        
        if (status === 'shortlisted') {
            nomination.shortlisted_at = new Date();
        } else if (status === 'winner') {
            nomination.awarded_at = new Date();
        }
        
        await nomination.save();
        
        // Send notification to business
        let notificationTitle = 'Nomination Status Updated';
        let notificationMessage = `Your nomination for ${nomination.category} has been updated to ${status}.`;
        
        if (status === 'shortlisted') {
            notificationTitle = 'Congratulations! You have been shortlisted!';
            notificationMessage = `Your nomination for ${nomination.category} has been shortlisted.`;
        } else if (status === 'winner') {
            notificationTitle = '🏆 Congratulations! You are a Winner!';
            notificationMessage = `Your nomination for ${nomination.category} has been selected as a winner!`;
        }
        
        await sendNotification(
            nomination.business_id._id,
            notificationTitle,
            notificationMessage,
            'award',
            nomination._id
        );
        
        res.json({
            success: true,
            message: `Nomination status updated to ${status}.`,
            nomination
        });
        
    } catch (error) {
        console.error('Nomination status update error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error updating nomination status.' 
        });
    }
});

// 5. ANNOUNCEMENTS & NEWS
app.post('/api/admin/announcements', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { title, content, type, category, target_audience, specific_businesses, is_published, is_featured } = req.body;
        
        const slug = generateSlug(title);
        
        const announcement = new Announcement({
            title,
            content,
            excerpt: content.substring(0, 200) + '...',
            type,
            category,
            target_audience: target_audience || ['all'],
            specific_businesses: specific_businesses || [],
            is_published: is_published || false,
            is_featured: is_featured || false,
            slug,
            created_by: req.user.id,
            updated_by: req.user.id
        });
        
        await announcement.save();
        
        // If published, send notifications
        if (is_published) {
            let targetUsers = [];
            
            if (target_audience.includes('all')) {
                targetUsers = await User.find({ role: 'business', status: 'active' });
            } else if (target_audience.includes('businesses')) {
                targetUsers = await User.find({ role: 'business', status: 'active' });
            } else if (specific_businesses && specific_businesses.length > 0) {
                targetUsers = await User.find({ _id: { $in: specific_businesses } });
            }
            
            for (const user of targetUsers) {
                await sendNotification(
                    user._id,
                    `New Announcement: ${title}`,
                    type === 'winner' ? '🏆 Check out the latest award winners!' : announcement.excerpt,
                    'announcement',
                    announcement._id
                );
            }
        }
        
        res.status(201).json({
            success: true,
            message: 'Announcement created successfully.',
            announcement
        });
        
    } catch (error) {
        console.error('Announcement creation error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error creating announcement.' 
        });
    }
});

app.get('/api/announcements', async (req, res) => {
    try {
        const { type, category, limit = 10, page = 1 } = req.query;
        
        let query = { is_published: true };
        
        if (type && type !== 'all') {
            query.type = type;
        }
        
        if (category && category !== 'all') {
            query.category = category;
        }
        
        const [announcements, total] = await Promise.all([
            Announcement.find(query)
                .populate('created_by', 'company_name')
                .sort({ publish_date: -1, is_featured: -1 })
                .skip((page - 1) * limit)
                .limit(parseInt(limit)),
            Announcement.countDocuments(query)
        ]);
        
        // Increment views
        for (const announcement of announcements) {
            announcement.views += 1;
            await announcement.save();
        }
        
        res.json({
            success: true,
            announcements,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            },
            featured: announcements.filter(a => a.is_featured),
            categories: await Announcement.distinct('category', { is_published: true })
        });
        
    } catch (error) {
        console.error('Announcements fetch error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error fetching announcements.' 
        });
    }
});

// 6. NOTIFICATIONS
app.get('/api/notifications', authenticate, async (req, res) => {
    try {
        const { unread_only, limit = 20 } = req.query;
        
        let query = { user_id: req.user.id };
        
        if (unread_only === 'true') {
            query.is_read = false;
        }
        
        const notifications = await Notification.find(query)
            .sort({ created_at: -1 })
            .limit(parseInt(limit));
        
        const unreadCount = await Notification.countDocuments({ 
            user_id: req.user.id, 
            is_read: false 
        });
        
        res.json({
            success: true,
            notifications,
            unread_count: unreadCount,
            total: notifications.length
        });
        
    } catch (error) {
        console.error('Notifications fetch error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error fetching notifications.' 
        });
    }
});

app.put('/api/notifications/:id/read', authenticate, async (req, res) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, user_id: req.user.id },
            { is_read: true, read_at: new Date() },
            { new: true }
        );
        
        if (!notification) {
            return res.status(404).json({ 
                success: false, 
                message: 'Notification not found.' 
            });
        }
        
        res.json({
            success: true,
            message: 'Notification marked as read.',
            notification
        });
        
    } catch (error) {
        console.error('Notification update error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error updating notification.' 
        });
    }
});

// 7. ANALYTICS & REPORTS
app.get('/api/admin/analytics', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { period = '30d' } = req.query;
        
        let days = 30;
        if (period === '7d') days = 7;
        if (period === '90d') days = 90;
        if (period === '365d') days = 365;
        
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        const [
            registrationTrend,
            nominationTrend,
            businessTypeDistribution,
            nominationStatusDistribution,
            topCategories,
            topPerformingBusinesses,
            dailyActivity
        ] = await Promise.all([
            User.aggregate([
                { $match: { 
                    role: 'business',
                    created_at: { $gte: startDate }
                }},
                { $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$created_at" } },
                    count: { $sum: 1 }
                }},
                { $sort: { _id: 1 } }
            ]),
            Nomination.aggregate([
                { $match: { 
                    submitted_at: { $gte: startDate }
                }},
                { $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$submitted_at" } },
                    count: { $sum: 1 }
                }},
                { $sort: { _id: 1 } }
            ]),
            User.aggregate([
                { $match: { role: 'business' } },
                { $group: {
                    _id: "$business_type",
                    count: { $sum: 1 }
                }},
                { $sort: { count: -1 } }
            ]),
            Nomination.aggregate([
                { $group: {
                    _id: "$status",
                    count: { $sum: 1 }
                }},
                { $sort: { count: -1 } }
            ]),
            Nomination.aggregate([
                { $group: {
                    _id: "$category",
                    count: { $sum: 1 },
                    avg_score: { $avg: "$average_score" }
                }},
                { $sort: { count: -1 } },
                { $limit: 10 }
            ]),
            Nomination.aggregate([
                { $match: { average_score: { $gt: 0 } } },
                { $group: {
                    _id: "$business_id",
                    total_nominations: { $sum: 1 },
                    avg_score: { $avg: "$average_score" },
                    wins: { 
                        $sum: { 
                            $cond: [{ $eq: ["$status", "winner"] }, 1, 0] 
                        } 
                    }
                }},
                { $sort: { avg_score: -1 } },
                { $limit: 10 },
                { $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'business'
                }},
                { $unwind: "$business" },
                { $project: {
                    business_name: "$business.company_name",
                    business_type: "$business.business_type",
                    total_nominations: 1,
                    avg_score: { $round: ["$avg_score", 2] },
                    wins: 1
                }}
            ]),
            Analytics.find({ date: { $gte: startDate } })
                .sort({ date: 1 })
        ]);
        
        res.json({
            success: true,
            analytics: {
                period,
                registration_trend: registrationTrend,
                nomination_trend: nominationTrend,
                business_type_distribution: businessTypeDistribution,
                nomination_status_distribution: nominationStatusDistribution,
                top_categories: topCategories,
                top_performing_businesses: topPerformingBusinesses,
                daily_activity: dailyActivity,
                summary: {
                    total_businesses: await User.countDocuments({ role: 'business' }),
                    total_nominations: await Nomination.countDocuments(),
                    avg_nominations_per_business: await Nomination.countDocuments() / Math.max(await User.countDocuments({ role: 'business' }), 1),
                    completion_rate: (await User.countDocuments({ verified: true, role: 'business' }) / Math.max(await User.countDocuments({ role: 'business' }), 1)) * 100
                }
            }
        });
        
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error fetching analytics.' 
        });
    }
});

// 8. PUBLIC ROUTES
app.get('/api/health', async (req, res) => {
    const isConnected = mongoose.connection.readyState === 1;
    const [userCount, nominationCount, announcementCount] = await Promise.all([
        User.countDocuments(),
        Nomination.countDocuments(),
        Announcement.countDocuments({ is_published: true })
    ]);
    
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        version: '3.0.0',
        service: 'Liberia Business Awards Enterprise System',
        database: isConnected ? 'connected' : 'disconnected',
        statistics: {
            businesses: userCount,
            nominations: nominationCount,
            announcements: announcementCount
        },
        uptime: process.uptime(),
        memory: process.memoryUsage()
    });
});

app.get('/api/stats/public', async (req, res) => {
    try {
        const [totalBusinesses, totalNominations, awardCategories, featuredAnnouncements] = await Promise.all([
            User.countDocuments({ role: 'business', status: 'active' }),
            Nomination.countDocuments({ status: { $in: ['shortlisted', 'finalist', 'winner'] } }),
            Nomination.distinct('category'),
            Announcement.find({ is_published: true, is_featured: true })
                .sort({ publish_date: -1 })
                .limit(3)
                .select('title excerpt publish_date')
        ]);
        
        res.json({
            success: true,
            stats: {
                total_businesses: totalBusinesses,
                total_nominations: totalNominations,
                award_categories: awardCategories.length,
                featured_announcements: featuredAnnouncements
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

// 9. FILE SERVING
app.use('/uploads', express.static(UPLOAD_DIR));

// 10. BACKUP & SYSTEM
app.get('/api/admin/backup', authenticate, authorize('admin'), async (req, res) => {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = path.join(BACKUP_DIR, `backup-${timestamp}.json`);
        
        const [users, nominations, announcements, notifications] = await Promise.all([
            User.find().select('-password -verification_token -reset_token -login_history'),
            Nomination.find().populate('business_id', 'company_name'),
            Announcement.find(),
            Notification.find()
        ]);
        
        const backupData = {
            timestamp: new Date().toISOString(),
            version: '3.0.0',
            statistics: {
                users: users.length,
                nominations: nominations.length,
                announcements: announcements.length,
                notifications: notifications.length
            },
            data: {
                users,
                nominations,
                announcements,
                notifications
            }
        };
        
        await fs.writeFile(backupFile, JSON.stringify(backupData, null, 2));
        
        // Also backup to cloud storage (optional)
        // await backupToCloud(backupFile);
        
        res.json({
            success: true,
            message: 'Backup created successfully.',
            backup: {
                file: `backup-${timestamp}.json`,
                size: `${(JSON.stringify(backupData).length / 1024 / 1024).toFixed(2)} MB`,
                timestamp: new Date().toISOString(),
                items_backed_up: backupData.statistics
            }
        });
        
    } catch (error) {
        console.error('Backup error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error creating backup.' 
        });
    }
});

// Homepage
app.get('/', (req, res) => {
    res.json({
        service: 'Liberia Business Awards Enterprise MVP System',
        version: '3.0.0',
        status: 'operational',
        documentation: 'https://liberiabusinessawardslr.com/api-docs',
        endpoints: {
            public: [
                'GET  /api/health',
                'GET  /api/stats/public',
                'GET  /api/announcements',
                'POST /api/auth/register',
                'POST /api/auth/login'
            ],
            business: [
                'GET  /api/business/profile',
                'PUT  /api/business/profile',
                'POST /api/business/upload',
                'GET  /api/business/nominations',
                'POST /api/nominations',
                'PUT  /api/nominations/:id/submit',
                'GET  /api/notifications',
                'PUT  /api/notifications/:id/read'
            ],
            admin: [
                'GET  /api/admin/dashboard',
                'GET  /api/admin/businesses',
                'PUT  /api/admin/businesses/:id',
                'DELETE /api/admin/businesses/:id',
                'GET  /api/admin/nominations',
                'PUT  /api/admin/nominations/:id/status',
                'POST /api/admin/announcements',
                'GET  /api/admin/analytics',
                'GET  /api/admin/backup'
            ]
        },
        support: {
            email: 'support@liberiabusinessawardslr.com',
            phone: '+231 886 590 302',
            website: 'https://liberiabusinessawardslr.com'
        }
    });
});

// 404 Handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found',
        available_endpoints: {
            public: ['/', '/api/health', '/api/stats/public', '/api/announcements'],
            info: 'Visit / for complete API documentation'
        }
    });
});

// Error Handler
app.use((err, req, res, next) => {
    console.error('🔥 Error:', err.message);
    
    // Multer file upload error
    if (err instanceof multer.MulterError) {
        return res.status(400).json({
            success: false,
            message: `File upload error: ${err.message}`
        });
    }
    
    // JWT error
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            success: false,
            message: 'Invalid token'
        });
    }
    
    // Validation error
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            message: Object.values(err.errors).map(e => e.message).join(', ')
        });
    }
    
    // Default error
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { error: err.message })
    });
});

// ============ START SERVER ============
async function startServer() {
    console.log('='.repeat(70));
    console.log('🚀 LIBERIA BUSINESS AWARDS ENTERPRISE MVP SYSTEM');
    console.log('='.repeat(70));
    
    // Ensure directories exist
    await ensureDirectories();
    
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
        console.log(`🔐 Security: Enabled (Helmet, Rate Limiting, CORS)`);
        console.log(`📁 Uploads: ${UPLOAD_DIR}`);
        console.log(`💾 Backups: ${BACKUP_DIR}`);
        console.log('='.repeat(70));
        console.log('\n👥 USER ROLES SYSTEM:');
        console.log('   • Business: Complete profile, document upload, nomination management');
        console.log('   • Admin: Full dashboard, user management, analytics, announcements');
        console.log('   • Moderator: User verification, content moderation');
        console.log('   • Judge: Nomination scoring (coming soon)');
        console.log('\n📊 FEATURES:');
        console.log('   • Business verification system');
        console.log('   • Document upload & management');
        console.log('   • Real-time notifications');
        console.log('   • Advanced analytics dashboard');
        console.log('   • Announcement system');
        console.log('   • Backup & recovery');
        console.log('\n🚀 System ready for production deployment!');
    });
}

// Error Handling
process.on('unhandledRejection', (err) => {
    console.error('🔥 UNHANDLED REJECTION:', err);
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
