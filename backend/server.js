 // ===========================================
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
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'Accept', 'Origin', 'X-Requested-With'],
    exposedHeaders: ['Authorization', 'Content-Length', 'X-Response-Time']
};

// Apply CORS to all routes
app.use(cors(corsOptions));

// Handle preflight requests for all routes
app.options('*', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-CSRF-Token, Accept, Origin, X-Requested-With');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.sendStatus(200);
});

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
const GOOGLE_APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL || 'https://script.google.com/macros/s/AKfycbxxJTXMjUdlzxa3Y5u-Cvhzso0ln_6Fv2rX7Qb9w6d7c-JvoA_yuNa6ObLSgigjiCz3/exec';

// ============ AI CONFIGURATION ============
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const AI_PROVIDER = process.env.AI_PROVIDER || 'openrouter';

// Log AI configuration status (don't log the actual key!)
if (OPENROUTER_API_KEY) {
    console.log('✅ OpenRouter API key configured');
} else {
    console.log('⚠️ OpenRouter API key not set - AI features will not work');
}
console.log(`🤖 AI Provider: ${AI_PROVIDER}`);

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

// ============================================
// FIXED: STATIC FILE SERVING WITH PROPER CORS AND DOMAIN SUPPORT
// ============================================
app.use('/uploads', (req, res, next) => {
    // Log the request for debugging
    console.log(`📸 Static file request: ${req.url} from ${req.get('host')}`);
    next();
}, express.static(uploadDir, {
    setHeaders: (res, filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        const contentType = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.pdf': 'application/pdf'
        }[ext] || 'application/octet-stream';
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.setHeader('Cache-Control', 'public, max-age=86400');
    }
}));

// Handle OPTIONS for static files
app.options('/uploads/*', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.sendStatus(200);
});

// ============================================
// ADD A FALLBACK ROUTE FOR IMAGES
// ============================================
app.get('/uploads/:filename', async (req, res) => {
    try {
        const filename = req.params.filename;
        const filePath = path.join(uploadDir, filename);
        
        console.log(`📸 Serving file: ${filename} from ${filePath}`);
        
        if (!fs.existsSync(filePath)) {
            console.log(`❌ File not found: ${filePath}`);
            return res.status(404).json({ error: 'File not found' });
        }
        
        const ext = path.extname(filename).toLowerCase();
        const contentType = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp'
        }[ext] || 'application/octet-stream';
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.sendFile(filePath);
        
    } catch (error) {
        console.error('Upload serve error:', error);
        res.status(500).json({ error: 'Failed to serve file' });
    }
});

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

// ============================================
// MULTER ERROR HANDLING HELPER
// ============================================
function handleUpload(uploadMiddleware) {
    return function(req, res, next) {
        uploadMiddleware(req, res, function(err) {
            if (err instanceof multer.MulterError) {
                console.error('❌ Multer Error:', err.message);
                console.error('   Field:', err.field);
                console.error('   Code:', err.code);
                return res.status(400).json({
                    success: false,
                    message: `Upload error: ${err.message}`,
                    code: err.code
                });
            } else if (err) {
                console.error('❌ Upload Error:', err);
                return res.status(500).json({
                    success: false,
                    message: 'File upload failed: ' + err.message
                });
            }
            next();
        });
    };
}

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
    nomination_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Nomination' },
    business_id: { type: String, required: true },
    business_name: { type: String, required: true },
    category: { type: String, required: true },
    voter_email: { type: String, required: true },
    voter_ip: { type: String },
    vote_value: { type: Number, required: true, min: 1, max: 10 },
    vote_weight: { type: Number, default: 1 },
    is_jury: { type: Boolean, default: false },
    is_verified: { type: Boolean, default: true },
    comment: { type: String, default: '' }
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
    user_type: { type: String, enum: ['admin', 'business', 'judge', 'partner'], required: true },
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

// ============ ANNOUNCEMENT SCHEMA ============
const announcementSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    image: { type: String },
    status: { type: String, enum: ['published', 'draft'], default: 'draft' },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

const Announcement = mongoose.model('Announcement', announcementSchema);

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
    recipient_id: { type: mongoose.Schema.Types.ObjectId, required: true },
    recipient_type: { type: String, enum: ['business', 'partner', 'admin'], required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, enum: ['info', 'success', 'warning', 'error'], default: 'info' },
    priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
    read: { type: Boolean, default: false },
    read_at: { type: Date },
    archived: { type: Boolean, default: false },
    scheduled_for: { type: Date },
    sent_at: { type: Date, default: Date.now },
    related_id: { type: mongoose.Schema.Types.ObjectId },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

// ============ ADD AD SCHEMA HERE (BEFORE creating models) ============
const adSchema = new mongoose.Schema({
    title: { type: String, required: true, maxlength: 200 },
    description: { type: String, maxlength: 500 },
    image_url: { type: String, required: true },
    link_url: { type: String },
    type: { type: String, enum: ['top-banner', 'sidebar', 'inline', 'floating', 'bottom-popup'], default: 'sidebar' },
    placement: { type: String, default: 'sidebar' },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'expired'], default: 'pending' },
    business_id: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessUser' },
    business_name: { type: String },
    start_date: { type: Date, default: Date.now },
    end_date: { type: Date, required: true },
    display_order: { type: Number, default: 0 },
    views: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    rejection_reason: { type: String }
}, { timestamps: true });

// ============ EVENT SCHEMA ============
const eventSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    start_date: { type: Date, required: true },
    end_date: { type: Date, required: true },
    location: { type: String, default: '' },
    type: { type: String, enum: ['workshop', 'seminar', 'networking', 'conference', 'webinar', 'other'], default: 'other' },
    image_url: { type: String, default: '' },
    registration_link: { type: String, default: '' },
    status: { type: String, enum: ['draft', 'published', 'cancelled'], default: 'draft' },
    approval_status: { type: String, enum: ['pending', 'approved', 'rejected', 'changes_requested'], default: 'pending' },
    admin_notes: { type: String, default: '' },
    requested_changes: { type: String, default: '' },
    approved_at: { type: Date },
    approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    attendees: { type: Number, default: 0 },
    partner_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner' },
    partner_name: { type: String, default: '' },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner' }
}, { timestamps: true });

// ============ SESSION SCHEMA ============
const sessionSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, default: '' },
    date: { type: Date, required: true },
    time: { type: String, required: true },
    duration: { type: Number, default: 60 }, // minutes
    platform: { type: String, enum: ['zoom', 'google_meet', 'teams', 'custom'], default: 'custom' },
    meeting_link: { type: String, default: '' },
    meeting_id: { type: String, default: '' },
    embed_url: { type: String, default: '' },
    featured_image: { type: String, default: '' },
    max_attendees: { type: Number, default: 100 },
    attendees: { type: Number, default: 0 },
    status: { type: String, enum: ['scheduled', 'live', 'ended', 'cancelled'], default: 'scheduled' },
    is_embedded: { type: Boolean, default: false },
    partner_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner' },
    partner_name: { type: String, default: '' },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner' },
    visibility: { type: String, enum: ['public', 'partner_only'], default: 'public' }
}, { timestamps: true });

// ============ MESSAGE THREAD SCHEMA ============
const messageThreadSchema = new mongoose.Schema({
    participants: [{
        user_id: { type: mongoose.Schema.Types.ObjectId, required: true },
        user_type: { type: String, enum: ['partner', 'admin'], required: true },
        name: { type: String, required: true }
    }],
    subject: { type: String, required: true },
    last_message_at: { type: Date, default: Date.now },
    last_message_preview: { type: String, default: '' },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
    unread_count: { 
        partner: { type: Number, default: 0 },
        admin: { type: Number, default: 0 }
    }
}, { timestamps: true });

// ============ MESSAGE SCHEMA (ENHANCED) ============
const messageSchema = new mongoose.Schema({
    thread_id: { type: mongoose.Schema.Types.ObjectId, ref: 'MessageThread', required: true },
    sender_id: { type: mongoose.Schema.Types.ObjectId, required: true },
    sender_type: { type: String, enum: ['partner', 'admin'], required: true },
    sender_name: { type: String, required: true },
    content: { type: String, required: true },
    priority: { type: String, enum: ['normal', 'high', 'urgent'], default: 'normal' },
    read_by: [{ 
        user_id: { type: mongoose.Schema.Types.ObjectId },
        user_type: { type: String, enum: ['partner', 'admin'] },
        read_at: { type: Date, default: Date.now }
    }],
    attachments: [{
        name: { type: String },
        url: { type: String },
        type: { type: String }
    }],
    status: { type: String, enum: ['sent', 'delivered', 'read'], default: 'sent' }
}, { timestamps: true });

// Create Models
const Admin = mongoose.model('Admin', adminSchema);
const BusinessUser = mongoose.model('BusinessUser', businessUserSchema); 
const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);
const Nomination = mongoose.model('Nomination', nominationSchema);
const BusinessDocument = mongoose.model('BusinessDocument', businessDocumentSchema);
const Notification = mongoose.model('Notification', notificationSchema);
const Ad = mongoose.model('Ad', adSchema);
const Event = mongoose.model('Event', eventSchema);      
const Session = mongoose.model('Session', sessionSchema); 
const MessageThread = mongoose.model('MessageThread', messageThreadSchema);
const Message = mongoose.model('Message', messageSchema); 


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

// ============ AUTHENTICATION MIDDLEWARE (FIXED) ============
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
        
        // Handle different user types - USE DIRECT MODEL REFERENCES
        if (decoded.role === 'admin') {
            user = await Admin.findById(decoded.userId).select('-password');
        } else if (decoded.role === 'business') {
            user = await BusinessUser.findById(decoded.userId).select('-password');
        } else if (decoded.role === 'judge') {
            // Check if Judge model exists, if not, try to get it
            let Judge;
            try {
                Judge = mongoose.model('Judge');
            } catch (e) {
                // Judge model might not be registered yet
                console.log('⚠️ Judge model not found, trying to require it');
                try {
                    Judge = require('./models/Judge');
                } catch (err) {
                    console.error('❌ Judge model not available');
                    return res.status(401).json({ success: false, message: 'User type not supported.' });
                }
            }
            user = await Judge.findById(decoded.userId).select('-password');
        } else if (decoded.role === 'partner') {
            // ============ FIXED: Use the already-registered Partner model ============
            const Partner = mongoose.model('Partner');
            user = await Partner.findById(decoded.userId).select('-password');
        }
        
        if (!user) {
            console.log(`❌ User not found for role: ${decoded.role}, userId: ${decoded.userId}`);
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

// Add this to server.js - Business create notification endpoint
app.post('/api/business/notifications', authenticate, authorize('business'), async (req, res) => {
    try {
        const { title, message, type } = req.body;
       
        if (!title || !message) {
            return res.status(400).json({ success: false, message: 'Title and message are required' });
        }
       
        const notification = new Notification({
            business_id: req.user._id,
            title,
            message,
            type: type || 'info',
            read: false
        });
       
        await notification.save();
       
        res.json({
            success: true,
            message: 'Notification created',
            notification
        });
    } catch (error) {
        console.error('Create notification error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});
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
app.put('/api/business/profile', authenticate, authorize('business'), handleUpload(upload.single('logo')), async (req, res) => {
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

// ============ ANNOUNCEMENT ROUTES ============

// Get all announcements (public/business view - only published)
app.get('/api/announcements', async (req, res) => {
    try {
        const announcements = await Announcement.find({ status: 'published' })
            .sort({ created_at: -1 });
        
        res.json({
            success: true,
            announcements
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Admin: Get all announcements (including drafts)
app.get('/api/admin/announcements', authenticate, authorize('admin'), async (req, res) => {
    try {
        const announcements = await Announcement.find()
            .sort({ created_at: -1 });
        
        res.json({
            success: true,
            announcements: announcements.map(a => ({
                _id: a._id,
                title: a.title,
                description: a.description,
                image: a.image,
                status: a.status,
                created_at: a.created_at
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============ ADMIN ANNOUNCEMENTS WITH NOTIFICATIONS ============

// Admin: Create announcement AND notify all businesses
app.post('/api/admin/announcements', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { title, description, image, status } = req.body;
        
        if (!title || !description) {
            return res.status(400).json({ success: false, message: 'Title and description are required' });
        }
        
        // Save announcement to database
        const announcement = new Announcement({
            title,
            description,
            image: image || '',
            status: status || 'draft',
            created_by: req.user._id
        });
        
        await announcement.save();
        
        // If published, send notifications to all businesses
        if (status === 'published') {
            console.log('📢 Sending announcement notifications to all businesses...');
            
            // Get all approved businesses
            const businesses = await BusinessUser.find({ status: 'approved' }).select('_id email business_name');
            
            let notificationCount = 0;
            
            // Create notifications for each business
            for (const business of businesses) {
                try {
                    const notification = new Notification({
                        business_id: business._id,
                        title: `📢 New Announcement: ${title}`,
                        message: description.substring(0, 200),
                        type: 'info',
                        read: false
                    });
                    await notification.save();
                    notificationCount++;
                } catch (notifError) {
                    console.error(`Failed to create notification for ${business.email}:`, notifError);
                }
            }
            
            console.log(`✅ Created ${notificationCount} notifications for businesses`);
            
            // Also send email notifications (optional - can be moved to a background job)
            try {
                for (const business of businesses) {
                    await sendAnnouncementEmail(business.email, business.business_name, title, description);
                }
                console.log(`📧 Sent email notifications to ${businesses.length} businesses`);
            } catch (emailError) {
                console.error('Email sending error:', emailError);
            }
        }
        
        res.status(201).json({
            success: true,
            message: 'Announcement created successfully',
            announcement: {
                _id: announcement._id,
                title: announcement.title,
                description: announcement.description,
                image: announcement.image,
                status: announcement.status,
                created_at: announcement.created_at
            }
        });
        
    } catch (error) {
        console.error('Create announcement error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});


// Admin: Delete announcement
app.delete('/api/admin/announcements/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const announcement = await Announcement.findById(req.params.id);
        
        if (!announcement) {
            return res.status(404).json({ success: false, message: 'Announcement not found' });
        }
        
        await Announcement.findByIdAndDelete(req.params.id);
        
        // Also delete associated notifications (optional)
        await Notification.deleteMany({ related_id: req.params.id });
        
        res.json({
            success: true,
            message: 'Announcement deleted successfully'
        });
    } catch (error) {
        console.error('Delete announcement error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Admin: Update announcement
app.put('/api/admin/announcements/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { title, description, image, status } = req.body;
        
        const announcement = await Announcement.findById(req.params.id);
        
        if (!announcement) {
            return res.status(404).json({ success: false, message: 'Announcement not found' });
        }
        
        // Update fields
        if (title) announcement.title = title;
        if (description) announcement.description = description;
        if (image !== undefined) announcement.image = image;
        if (status) announcement.status = status;
        announcement.updated_at = new Date();
        
        await announcement.save();
        
        // If status changed to published, send notifications
        if (status === 'published' && announcement.status !== 'published') {
            const businesses = await BusinessUser.find({ status: 'approved' }).select('_id email business_name');
            
            for (const business of businesses) {
                const notification = new Notification({
                    business_id: business._id,
                    title: `📢 Announcement Updated: ${title}`,
                    message: description.substring(0, 200),
                    type: 'info',
                    read: false,
                    related_id: announcement._id
                });
                await notification.save();
            }
        }
        
        res.json({
            success: true,
            message: 'Announcement updated successfully',
            announcement
        });
    } catch (error) {
        console.error('Update announcement error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Helper function to send announcement email
async function sendAnnouncementEmail(email, businessName, title, description) {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: 'liberiabusinessawards@gmail.com',
            pass: process.env.GMAIL_APP_PASSWORD
        }
    });
    
    const htmlBody = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New Announcement - Liberia Business Awards</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: #1a202c; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 35px -10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #FF0000 0%, #87CEEB 100%); padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; font-weight: 700; color: white; }
        .content { padding: 30px; }
        .badge { display: inline-block; background: #FF0000; color: white; padding: 6px 16px; border-radius: 30px; font-size: 12px; font-weight: 600; margin-bottom: 20px; }
        .btn { display: inline-block; background: #FF0000; color: white; padding: 12px 28px; text-decoration: none; border-radius: 40px; font-weight: 600; margin-top: 20px; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #718096; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📢 Liberia Business Awards</h1>
        </div>
        <div class="content">
            <div style="text-align: center;">
                <div class="badge">NEW ANNOUNCEMENT</div>
            </div>
            <h2 style="color: #FF0000;">${title}</h2>
            <p>Dear ${businessName},</p>
            <p>${description}</p>
            <div style="text-align: center;">
                <a href="https://liberiabusinessawardslr.com/dashboard/business.html" class="btn" target="_blank">
                    View in Dashboard
                </a>
            </div>
        </div>
        <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Liberia Business Awards | Recognizing Local Excellence, Celebrating National Impact</p>
        </div>
    </div>
</body>
</html>`;
    
    await transporter.sendMail({
        from: '"Liberia Business Awards" <liberiabusinessawards@gmail.com>',
        to: email,
        subject: `📢 New Announcement: ${title}`,
        html: htmlBody
    });
}

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
app.post('/api/business/documents', authenticate, authorize('business'), handleUpload(upload.single('document')), async (req, res) => {
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
app.post('/api/admin/businesses/:businessId/documents', authenticate, authorize('admin'), handleUpload(upload.single('document')), async (req, res) => {
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

// ============ EMAIL SENDING FUNCTION - SENDGRID ============
const sgMail = require('@sendgrid/mail');

// Get SendGrid API key from environment ONLY
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;

if (SENDGRID_API_KEY) {
    sgMail.setApiKey(SENDGRID_API_KEY);
    console.log('✅ SendGrid configured');
} else {
    console.log('⚠️ SENDGRID_API_KEY not set - Email sending will fail');
}

async function sendPasswordResetEmail(toEmail, userName, resetUrl, userType) {
    try {
        if (!SENDGRID_API_KEY) {
            console.error('❌ SendGrid API key not configured');
            return false;
        }

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
            <p style="font-size: 12px; color: #666; margin-top: 20px;">This is an automated message from Liberia Business Awards.</p>
        </div>
        <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Liberia Business Awards. All rights reserved.</p>
            <p><a href="mailto:contact@liberiabusinessawardslr.com">contact@liberiabusinessawardslr.com</a></p>
        </div>
    </div>
</body>
</html>
        `;

        const msg = {
            to: toEmail,
            from: 'contact@liberiabusinessawardslr.com',  // Verified sender
            subject: subject,
            html: htmlBody,
            text: `Reset your password: ${resetUrl}`
        };

        await sgMail.send(msg);
        console.log(`✅ Password reset email sent to ${toEmail} via SendGrid`);
        return true;

    } catch (error) {
        console.error('❌ Email sending failed:', error.message);
        if (error.response) {
            console.error('   Response body:', error.response.body);
        }
        return false;
    }
}

// Test email endpoint
app.post('/api/test-email', async (req, res) => {
    try {
        const { email } = req.body;
        const testEmail = email || 'contact@liberiabusinessawardslr.com';
        
        const result = await sendPasswordResetEmail(
            testEmail,
            'Test User',
            'https://liberiabusinessawardslr.com/reset-password.html?token=test123&type=business',
            'business'
        );
        
        res.json({
            success: result,
            message: result ? 'Test email sent successfully' : 'Failed to send test email',
            email: testEmail,
            provider: 'SendGrid'
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});



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
        
        console.log(`🔄 Reset password attempt - Token: ${token.substring(0, 20)}..., UserType: ${userType}`);
        
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
            console.log('❌ Reset token not found or expired');
            return res.status(400).json({ success: false, message: 'Password reset token is invalid or has expired.' });
        }
        
        console.log(`✅ User found: ${user.email}`);
        
        // ============ FIX: Hash the password and save ============
        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        
        // Use findByIdAndUpdate to bypass middleware issues
        const Model = userType === 'admin' ? Admin : BusinessUser;
        await Model.findByIdAndUpdate(user._id, {
            password: hashedPassword,
            reset_password_token: undefined,
            reset_password_expires: undefined
        });
        
        console.log(`✅ Password reset successfully for ${user.email}`);
        
        res.json({ 
            success: true, 
            message: 'Password has been reset successfully. You can now login with your new password.' 
        });
        
    } catch (error) {
        console.error('❌ Reset password error:', error);
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

// ============================================
// SPOTLIGHT MANAGEMENT SYSTEM - BACKEND ENDPOINTS
// ============================================

// Spotlight Category Schema
const spotlightCategorySchema = new mongoose.Schema({
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, default: '' },
    icon: { type: String, default: 'fa-tag' },
    color: { type: String, default: '#FF0000' },
    display_order: { type: Number, default: 1 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' }
}, { timestamps: true });

// Spotlight Story Schema
const spotlightStorySchema = new mongoose.Schema({
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    category_id: { type: mongoose.Schema.Types.ObjectId, ref: 'SpotlightCategory', required: true },
    status: { type: String, enum: ['published', 'draft'], default: 'draft' },
    business_name: { type: String, required: true },
    business_owner: { type: String, default: '' },
    author_name: { type: String, required: true },
    author_bio: { type: String, default: '' },
    excerpt: { type: String, required: true },
    content: { type: String, required: true },
    featured_image: { type: String, default: '' },
    is_featured: { type: Boolean, default: false },
    is_breaking: { type: Boolean, default: false },
    is_interview: { type: Boolean, default: false },
    published_at: { type: Date, default: Date.now },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }
}, { timestamps: true });

const SpotlightCategory = mongoose.model('SpotlightCategory', spotlightCategorySchema);
const SpotlightStory = mongoose.model('SpotlightStory', spotlightStorySchema);

// ============ SPOTLIGHT CATEGORY ROUTES ============

// Get all categories (public)
app.get('/api/spotlight/categories', async (req, res) => {
    try {
        const categories = await SpotlightCategory.find({ status: 'active' }).sort({ display_order: 1 });
        res.json({ success: true, categories });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get all stories (public)
app.get('/api/spotlight/stories', async (req, res) => {
    try {
        const { category, limit = 20, page = 1 } = req.query;
        let query = { status: 'published' };
        
        if (category && category !== 'all') {
            query.category_id = category;
        }
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const stories = await SpotlightStory.find(query)
            .populate('category_id', 'name color icon')
            .sort({ is_featured: -1, published_at: -1 })
            .skip(skip)
            .limit(parseInt(limit));
        
        const total = await SpotlightStory.countDocuments(query);
        
        res.json({
            success: true,
            stories,
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

// Get single story (public)
app.get('/api/spotlight/stories/:slug', async (req, res) => {
    try {
        const story = await SpotlightStory.findOne({ slug: req.params.slug, status: 'published' })
            .populate('category_id', 'name color icon');
        
        if (!story) {
            return res.status(404).json({ success: false, message: 'Story not found' });
        }
        
        // Increment view count (optional)
        res.json({ success: true, story });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// BUSINESS SPOTLIGHT SUBMISSION ENDPOINT
// ============================================

// Business: Submit a spotlight story (creates as draft for admin approval)
app.post('/api/business/spotlight/stories', authenticate, authorize('business'), async (req, res) => {
    try {
        const { title, category_id, excerpt, content, featured_image } = req.body;
        
        if (!title || !category_id || !excerpt || !content) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }
        
        // Generate slug from title
        const slug = title.toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '') + '-' + Date.now();
        
        const story = new SpotlightStory({
            title,
            slug,
            category_id,
            status: 'draft',  // Always draft until admin approves
            business_name: req.user.business_name,
            business_owner: req.user.contact_name || '',
            author_name: req.user.contact_name || req.user.business_name,
            excerpt,
            content,
            featured_image: featured_image || '',
            created_by: req.user._id
        });
        
        await story.save();
        
        // Create notification for admin (optional - you can log or send email)
        console.log(`📢 New spotlight story submitted: "${title}" by ${req.user.business_name}`);
        
        // Create notification for the business
        const notification = new Notification({
            business_id: req.user._id,
            title: 'Spotlight Story Submitted',
            message: `Your story "${title}" has been submitted for review. You'll be notified once approved.`,
            type: 'info',
            read: false
        });
        await notification.save();
        
        res.status(201).json({
            success: true,
            message: 'Your story has been submitted for review!',
            story: {
                _id: story._id,
                title: story.title,
                status: story.status
            }
        });
        
    } catch (error) {
        console.error('Business spotlight submission error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Business: Get my submitted spotlight stories
app.get('/api/business/spotlight/stories', authenticate, authorize('business'), async (req, res) => {
    try {
        const stories = await SpotlightStory.find({ created_by: req.user._id })
            .populate('category_id', 'name color')
            .sort({ created_at: -1 });
        
        res.json({
            success: true,
            stories: stories.map(s => ({
                _id: s._id,
                title: s.title,
                slug: s.slug,
                status: s.status,
                category: s.category_id,
                excerpt: s.excerpt,
                featured_image: s.featured_image,
                created_at: s.created_at,
                published_at: s.published_at
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Business: Edit my own spotlight story (only if draft)
app.put('/api/business/spotlight/stories/:id', authenticate, authorize('business'), async (req, res) => {
    try {
        const story = await SpotlightStory.findOne({
            _id: req.params.id,
            created_by: req.user._id
        });
        
        if (!story) {
            return res.status(404).json({ success: false, message: 'Story not found' });
        }
        
        // Only allow editing if status is draft
        if (story.status !== 'draft') {
            return res.status(403).json({ success: false, message: 'Cannot edit story after submission' });
        }
        
        const { title, category_id, excerpt, content, featured_image } = req.body;
        
        if (title) story.title = title;
        if (category_id) story.category_id = category_id;
        if (excerpt) story.excerpt = excerpt;
        if (content) story.content = content;
        if (featured_image !== undefined) story.featured_image = featured_image;
        
        await story.save();
        
        res.json({
            success: true,
            message: 'Story updated successfully',
            story
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Business: Delete my own spotlight story (only if draft)
app.delete('/api/business/spotlight/stories/:id', authenticate, authorize('business'), async (req, res) => {
    try {
        const story = await SpotlightStory.findOneAndDelete({
            _id: req.params.id,
            created_by: req.user._id,
            status: 'draft'
        });
        
        if (!story) {
            return res.status(404).json({ success: false, message: 'Story not found or cannot be deleted' });
        }
        
        res.json({
            success: true,
            message: 'Story deleted successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============ ADMIN SPOTLIGHT ROUTES ============

// Admin: Get all categories
app.get('/api/admin/spotlight/categories', authenticate, authorize('admin'), async (req, res) => {
    try {
        const categories = await SpotlightCategory.find().sort({ display_order: 1 });
        res.json({ success: true, categories });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Admin: Create category
app.post('/api/admin/spotlight/categories', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { name, slug, description, icon, color, display_order } = req.body;
        
        if (!name || !slug) {
            return res.status(400).json({ success: false, message: 'Name and slug are required' });
        }
        
        const existing = await SpotlightCategory.findOne({ slug });
        if (existing) {
            return res.status(400).json({ success: false, message: 'Category with this slug already exists' });
        }
        
        const category = new SpotlightCategory({
            name, slug, description, icon, color, display_order
        });
        
        await category.save();
        res.status(201).json({ success: true, category });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Admin: Update category
app.put('/api/admin/spotlight/categories/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { name, slug, description, icon, color, display_order, status } = req.body;
        
        const category = await SpotlightCategory.findById(req.params.id);
        if (!category) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }
        
        if (slug && slug !== category.slug) {
            const existing = await SpotlightCategory.findOne({ slug });
            if (existing) {
                return res.status(400).json({ success: false, message: 'Category with this slug already exists' });
            }
            category.slug = slug;
        }
        
        if (name) category.name = name;
        if (description !== undefined) category.description = description;
        if (icon) category.icon = icon;
        if (color) category.color = color;
        if (display_order !== undefined) category.display_order = display_order;
        if (status) category.status = status;
        
        await category.save();
        res.json({ success: true, category });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Admin: Delete category
app.delete('/api/admin/spotlight/categories/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const category = await SpotlightCategory.findById(req.params.id);
        if (!category) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }
        
        // Un-categorize stories with this category
        await SpotlightStory.updateMany(
            { category_id: req.params.id },
            { category_id: null }
        );
        
        await SpotlightCategory.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Category deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Admin: Get all stories
app.get('/api/admin/spotlight/stories', authenticate, authorize('admin'), async (req, res) => {
    try {
        const stories = await SpotlightStory.find()
            .populate('category_id', 'name color')
            .sort({ created_at: -1 });
        
        res.json({ success: true, stories });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Admin: Create story
app.post('/api/admin/spotlight/stories', authenticate, authorize('admin'), async (req, res) => {
    try {
        const storyData = req.body;
        
        if (!storyData.title || !storyData.slug || !storyData.category_id || !storyData.business_name || !storyData.author_name || !storyData.excerpt || !storyData.content) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }
        
        const existing = await SpotlightStory.findOne({ slug: storyData.slug });
        if (existing) {
            return res.status(400).json({ success: false, message: 'Story with this slug already exists' });
        }
        
        const story = new SpotlightStory({
            ...storyData,
            created_by: req.user._id,
            published_at: storyData.status === 'published' ? new Date() : null
        });
        
        await story.save();
        
        // Populate category for response
        await story.populate('category_id', 'name color');
        
        res.status(201).json({ success: true, story });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Admin: Update story
app.put('/api/admin/spotlight/stories/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const story = await SpotlightStory.findById(req.params.id);
        if (!story) {
            return res.status(404).json({ success: false, message: 'Story not found' });
        }
        
        const updateData = req.body;
        
        if (updateData.slug && updateData.slug !== story.slug) {
            const existing = await SpotlightStory.findOne({ slug: updateData.slug });
            if (existing) {
                return res.status(400).json({ success: false, message: 'Story with this slug already exists' });
            }
        }
        
        Object.assign(story, updateData);
        
        // Update published_at if status changed to published
        if (updateData.status === 'published' && story.status !== 'published') {
            story.published_at = new Date();
        }
        
        await story.save();
        await story.populate('category_id', 'name color');
        
        res.json({ success: true, story });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Admin: Delete story
app.delete('/api/admin/spotlight/stories/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const story = await SpotlightStory.findByIdAndDelete(req.params.id);
        if (!story) {
            return res.status(404).json({ success: false, message: 'Story not found' });
        }
        
        res.json({ success: true, message: 'Story deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

console.log('✅ Spotlight Management System Ready');

// ============================================
// SPOTLIGHT STATIC ROUTES - ADD THIS SECTION
// ============================================
// Serve spotlight page - FIXES 404 ERROR
const spotlightPath = path.join(__dirname, 'spotlight');

// Check if spotlight directory exists, create if not
if (!fs.existsSync(spotlightPath)) {
    fs.mkdirSync(spotlightPath, { recursive: true });
    console.log('📁 Created spotlight directory at:', spotlightPath);
}

// Serve static files from spotlight folder (images, css, etc)
app.use('/spotlight', express.static(spotlightPath));

// Route for /spotlight (without trailing slash)
app.get('/spotlight', (req, res) => {
    // Try to find index.html first, then spotlight.index.html
    const indexFile = path.join(spotlightPath, 'index.html');
    const spotlightIndexFile = path.join(spotlightPath, 'spotlight.index.html');
    
    if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
    } else if (fs.existsSync(spotlightIndexFile)) {
        res.sendFile(spotlightIndexFile);
    } else {
        res.status(404).send(`
            <!DOCTYPE html>
            <html>
            <head><title>Spotlight Not Found</title></head>
            <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                <h1 style="color: #FF0000;">⚠️ Spotlight Page Not Found</h1>
                <p>Please upload your spotlight.index.html file to: <strong>/spotlight/</strong></p>
                <p>Expected location: <code>${spotlightPath}/spotlight.index.html</code></p>
                <hr>
                <p>Contact administrator to fix this issue.</p>
            </body>
            </html>
        `);
    }
});

// Route for /spotlight/ (with trailing slash)
app.get('/spotlight/', (req, res) => {
    const indexFile = path.join(spotlightPath, 'index.html');
    const spotlightIndexFile = path.join(spotlightPath, 'spotlight.index.html');
    
    if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
    } else if (fs.existsSync(spotlightIndexFile)) {
        res.sendFile(spotlightIndexFile);
    } else {
        res.status(404).send('Spotlight page not found. Please upload spotlight.index.html to /spotlight/ folder.');
    }
});

// Also handle any sub-paths (for individual story pages if needed)
app.get('/spotlight/*', (req, res) => {
    // Check if it's a story slug (like /spotlight/my-story-slug)
    const storySlug = req.params[0];
    if (storySlug && !storySlug.includes('.')) {
        // This might be a story detail page - send the main spotlight page
        const indexFile = path.join(spotlightPath, 'index.html');
        const spotlightIndexFile = path.join(spotlightPath, 'spotlight.index.html');
        
        if (fs.existsSync(indexFile)) {
            res.sendFile(indexFile);
        } else if (fs.existsSync(spotlightIndexFile)) {
            res.sendFile(spotlightIndexFile);
        } else {
            res.status(404).send('Spotlight page not found');
        }
    } else {
        // Serve static files
        const filePath = path.join(spotlightPath, storySlug);
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            res.sendFile(filePath);
        } else {
            const indexFile = path.join(spotlightPath, 'index.html');
            const spotlightIndexFile = path.join(spotlightPath, 'spotlight.index.html');
            
            if (fs.existsSync(indexFile)) {
                res.sendFile(indexFile);
            } else if (fs.existsSync(spotlightIndexFile)) {
                res.sendFile(spotlightIndexFile);
            } else {
                res.status(404).send('Spotlight page not found');
            }
        }
    }
});

console.log('✅ Spotlight static routes configured');

// ============================================
// ADS MANAGEMENT SYSTEM - ADD THIS ENTIRE SECTION
// ============================================

// ============ FRONTEND FETCH ADS ============
app.get('/api/ads', async (req, res) => {
    try {
        const { type, placement, limit = 10 } = req.query;
        
        let query = { 
            status: 'approved',
            end_date: { $gt: new Date() }
        };
        
        if (type && type !== 'all') {
            query.type = type;
        }
        
        if (placement && placement !== 'all') {
            query.placement = placement;
        }
        
        const ads = await Ad.find(query)
            .sort({ display_order: 1, created_at: -1 })
            .limit(parseInt(limit));
        
        res.json({
            success: true,
            ads,
            count: ads.length
        });
    } catch (error) {
        console.error('Error fetching ads:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============ BUSINESS SUBMIT AD WITH FILE UPLOAD ============
app.post('/api/business/ads/upload', authenticate, authorize('business'), upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No image uploaded' });
        }
        
        const { title, description, placement, duration, link_url } = req.body;
        
        if (!title) {
            return res.status(400).json({ success: false, message: 'Title is required' });
        }
        
        const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
        
        const endDate = new Date(Date.now() + parseInt(duration) * 24 * 60 * 60 * 1000);
        
        const ad = new Ad({
            title,
            description: description || '',
            image_url: imageUrl,
            link_url: link_url || '',
            type: placement || 'sidebar',
            placement: placement || 'sidebar',
            status: 'pending',
            business_id: req.user._id,
            business_name: req.user.business_name,
            start_date: new Date(),
            end_date: endDate,
            display_order: 0
        });
        
        await ad.save();
        
        // Create notification for business
        const notification = new Notification({
            business_id: req.user._id,
            title: 'Ad Submitted',
            message: `Your ad "${title}" has been submitted for review. You'll be notified once approved.`,
            type: 'info',
            read: false
        });
        await notification.save();
        
        console.log(`📢 New ad submitted: "${title}" by ${req.user.business_name}`);
        
        res.status(201).json({
            success: true,
            message: 'Ad submitted for review!',
            ad: { _id: ad._id, title: ad.title, status: ad.status }
        });
        
    } catch (error) {
        console.error('Business ad upload error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============ ADMIN CREATE AD WITH FILE UPLOAD ============
app.post('/api/admin/ads/upload', authenticate, authorize('admin'), upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No image uploaded' });
        }
        
        const { title, description, placement, type, end_date, display_order, link_url, start_date, business_id } = req.body;
        
        if (!title) {
            return res.status(400).json({ success: false, message: 'Title is required' });
        }
        
        const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
        
        const ad = new Ad({
            title,
            description: description || '',
            image_url: imageUrl,
            link_url: link_url || '',
            type: type || placement || 'sidebar',
            placement: placement || 'sidebar',
            status: 'approved',
            business_id: business_id || null,
            business_name: business_id ? null : 'Admin',
            start_date: start_date ? new Date(start_date) : new Date(),
            end_date: end_date ? new Date(end_date) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            display_order: display_order || 0
        });
        
        await ad.save();
        
        // If associated with a business, notify them
        if (business_id) {
            const business = await BusinessUser.findById(business_id);
            if (business) {
                const notification = new Notification({
                    business_id: business_id,
                    title: 'New Ad Created',
                    message: `Admin has created an ad "${title}" for your business.`,
                    type: 'info',
                    read: false
                });
                await notification.save();
            }
        }
        
        console.log(`📢 Admin created ad: "${title}"`);
        
        res.status(201).json({
            success: true,
            message: 'Ad created successfully',
            ad
        });
        
    } catch (error) {
        console.error('Admin ad upload error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============ ADMIN UPDATE AD WITH FILE UPLOAD ============
app.put('/api/admin/ads/upload/:id', authenticate, authorize('admin'), upload.single('image'), async (req, res) => {
    try {
        const ad = await Ad.findById(req.params.id);
        if (!ad) {
            return res.status(404).json({ success: false, message: 'Ad not found' });
        }
        
        const { title, description, placement, type, end_date, display_order, link_url, start_date, business_id } = req.body;
        
        if (title) ad.title = title;
        if (description !== undefined) ad.description = description;
        if (link_url !== undefined) ad.link_url = link_url;
        if (type) ad.type = type;
        if (placement) ad.placement = placement;
        if (start_date) ad.start_date = new Date(start_date);
        if (end_date) ad.end_date = new Date(end_date);
        if (display_order !== undefined) ad.display_order = display_order;
        if (business_id !== undefined) ad.business_id = business_id;
        
        // If new image uploaded, update it
        if (req.file) {
            ad.image_url = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
        }
        
        ad.updated_at = new Date();
        await ad.save();
        
        res.json({
            success: true,
            message: 'Ad updated successfully',
            ad
        });
        
    } catch (error) {
        console.error('Admin ad update error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============ BUSINESS SUBMIT AD ============
app.post('/api/business/ads', authenticate, authorize('business'), async (req, res) => {
    try {
        const { title, description, image_url, link_url, placement, type, end_date } = req.body;
        
        if (!title || !image_url) {
            return res.status(400).json({ success: false, message: 'Title and image are required' });
        }
        
        // Validate end_date (must be at least 1 day from now, max 90 days)
        let endDate = end_date ? new Date(end_date) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        if (endDate < new Date()) {
            endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        }
        
        const ad = new Ad({
            title,
            description: description || '',
            image_url,
            link_url: link_url || '',
            type: type || placement || 'sidebar',
            placement: placement || 'sidebar',
            status: 'pending',
            business_id: req.user._id,
            business_name: req.user.business_name,
            start_date: new Date(),
            end_date: endDate,
            display_order: 0
        });
        
        await ad.save();
        
        // Create notification for admin
        console.log(`📢 New ad submitted: "${title}" by ${req.user.business_name}`);
        
        // Create notification for business
        const notification = new Notification({
            business_id: req.user._id,
            title: 'Ad Submitted',
            message: `Your ad "${title}" has been submitted for review. You'll be notified once approved.`,
            type: 'info',
            read: false
        });
        await notification.save();
        
        res.status(201).json({
            success: true,
            message: 'Ad submitted for review!',
            ad: { _id: ad._id, title: ad.title, status: ad.status }
        });
        
    } catch (error) {
        console.error('Submit ad error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============ BUSINESS GET MY ADS ============
app.get('/api/business/ads', authenticate, authorize('business'), async (req, res) => {
    try {
        const ads = await Ad.find({ business_id: req.user._id })
            .sort({ created_at: -1 });
        
        res.json({
            success: true,
            ads
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============ ADMIN GET ALL ADS ============
app.get('/api/admin/ads', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        let query = {};
        
        if (status && status !== 'all') {
            query.status = status;
        }
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const ads = await Ad.find(query)
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(parseInt(limit));
        
        const total = await Ad.countDocuments(query);
        
        res.json({
            success: true,
            ads,
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

// ============ ADMIN APPROVE AD ============
app.post('/api/admin/ads/:id/approve', authenticate, authorize('admin'), async (req, res) => {
    try {
        const ad = await Ad.findById(req.params.id);
        if (!ad) {
            return res.status(404).json({ success: false, message: 'Ad not found' });
        }
        
        ad.status = 'approved';
        ad.updated_at = new Date();
        await ad.save();
        
        // Notify business if they submitted it
        if (ad.business_id) {
            const notification = new Notification({
                business_id: ad.business_id,
                title: 'Ad Approved',
                message: `Your ad "${ad.title}" has been approved and is now live!`,
                type: 'success',
                read: false
            });
            await notification.save();
            
            console.log(`📧 Ad approved notification sent to ${ad.business_name}`);
        }
        
        res.json({ success: true, message: 'Ad approved successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============ ADMIN REJECT AD ============
app.post('/api/admin/ads/:id/reject', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { reason } = req.body;
        const ad = await Ad.findById(req.params.id);
        
        if (!ad) {
            return res.status(404).json({ success: false, message: 'Ad not found' });
        }
        
        ad.status = 'rejected';
        ad.rejection_reason = reason || 'Does not meet our guidelines';
        ad.updated_at = new Date();
        await ad.save();
        
        // Notify business
        if (ad.business_id) {
            const notification = new Notification({
                business_id: ad.business_id,
                title: 'Ad Rejected',
                message: `Your ad "${ad.title}" was rejected. Reason: ${ad.rejection_reason}`,
                type: 'error',
                read: false
            });
            await notification.save();
        }
        
        res.json({ success: true, message: 'Ad rejected' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============ ADMIN CREATE AD (DIRECT) ============
app.post('/api/admin/ads', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { title, description, image_url, link_url, type, placement, end_date, display_order } = req.body;
        
        if (!title || !image_url) {
            return res.status(400).json({ success: false, message: 'Title and image are required' });
        }
        
        const ad = new Ad({
            title,
            description: description || '',
            image_url,
            link_url: link_url || '',
            type: type || 'sidebar',
            placement: placement || 'sidebar',
            status: 'approved',  // Admin-created ads are auto-approved
            business_name: 'Admin',
            start_date: new Date(),
            end_date: end_date ? new Date(end_date) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            display_order: display_order || 0
        });
        
        await ad.save();
        
        res.status(201).json({ success: true, ad });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============ ADMIN UPDATE AD ============
app.put('/api/admin/ads/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const ad = await Ad.findById(req.params.id);
        if (!ad) {
            return res.status(404).json({ success: false, message: 'Ad not found' });
        }
        
        const { title, description, image_url, link_url, type, placement, end_date, display_order } = req.body;
        
        if (title) ad.title = title;
        if (description !== undefined) ad.description = description;
        if (image_url) ad.image_url = image_url;
        if (link_url !== undefined) ad.link_url = link_url;
        if (type) ad.type = type;
        if (placement) ad.placement = placement;
        if (end_date) ad.end_date = new Date(end_date);
        if (display_order !== undefined) ad.display_order = display_order;
        ad.updated_at = new Date();
        
        await ad.save();
        
        res.json({ success: true, message: 'Ad updated', ad });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============ ADMIN DELETE AD ============
app.delete('/api/admin/ads/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const ad = await Ad.findByIdAndDelete(req.params.id);
        if (!ad) {
            return res.status(404).json({ success: false, message: 'Ad not found' });
        }
        
        res.json({ success: true, message: 'Ad deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============ TRACK AD CLICK ============
app.post('/api/ads/:id/click', async (req, res) => {
    try {
        await Ad.findByIdAndUpdate(req.params.id, { $inc: { clicks: 1 } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

// ============ TRACK AD VIEW ============
app.post('/api/ads/:id/view', async (req, res) => {
    try {
        await Ad.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false });
    }
});

console.log('✅ Ad Management System Ready');


// ============================================
// BUSINESS DIRECTORY SYSTEM - ADD THIS ENTIRE SECTION
// ============================================

// Directory Business Schema
const directoryBusinessSchema = new mongoose.Schema({
    name: { type: String, required: true },
    category: { type: String, required: true },
    description: { type: String, required: true },
    location: { type: String, required: true },
    website: { type: String, default: '' },
    phone: { type: String, required: true },
    award: { type: String, default: '' },
    founder: { type: String, default: '' },
    year: { type: String, default: '' },
    impact: { type: String, default: '' },
    logo_url: { type: String, default: '' },
    display_order: { type: Number, default: 999 },
    is_active: { type: Boolean, default: true },
    verified: { type: Boolean, default: false },
    views: { type: Number, default: 0 }
}, { timestamps: true });

const DirectoryBusiness = mongoose.model('DirectoryBusiness', directoryBusinessSchema);

// ============ PUBLIC DIRECTORY ROUTES ============

// GET all directory businesses (PUBLIC - no auth required)
app.get('/api/directory/businesses', async (req, res) => {
    try {
        const { category, limit = 200 } = req.query;
        let query = { is_active: true };
        
        if (category && category !== 'all') {
            query.category = category;
        }
        
        const businesses = await DirectoryBusiness.find(query)
            .sort({ display_order: 1, created_at: -1 })
            .limit(parseInt(limit));
        
        console.log(`📂 Directory API: Returning ${businesses.length} businesses`);
        
        res.json({ 
            success: true, 
            businesses,
            count: businesses.length
        });
    } catch (error) {
        console.error('Directory API error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET single directory business (PUBLIC)
app.get('/api/directory/businesses/:id', async (req, res) => {
    try {
        const business = await DirectoryBusiness.findById(req.params.id);
        if (!business) {
            return res.status(404).json({ success: false, error: 'Business not found' });
        }
        res.json({ success: true, business });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ ADMIN DIRECTORY ROUTES ============

// GET all directory businesses (ADMIN - includes inactive)
app.get('/api/admin/directory/businesses', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { category, status, page = 1, limit = 20 } = req.query;
        let query = {};
        
        if (category && category !== 'all') query.category = category;
        if (status && status !== 'all') query.is_active = status === 'active';
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const businesses = await DirectoryBusiness.find(query)
            .sort({ display_order: 1, created_at: -1 })
            .skip(skip)
            .limit(parseInt(limit));
        
        const total = await DirectoryBusiness.countDocuments(query);
        
        res.json({
            success: true,
            businesses,
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

// CREATE directory business (ADMIN)
app.post('/api/admin/directory/businesses', authenticate, authorize('admin'), async (req, res) => {
    try {
        const business = new DirectoryBusiness(req.body);
        await business.save();
        res.status(201).json({ success: true, business });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// UPDATE directory business (ADMIN)
app.put('/api/admin/directory/businesses/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const business = await DirectoryBusiness.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );
        if (!business) {
            return res.status(404).json({ success: false, error: 'Business not found' });
        }
        res.json({ success: true, business });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE directory business (ADMIN)
app.delete('/api/admin/directory/businesses/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const business = await DirectoryBusiness.findByIdAndDelete(req.params.id);
        if (!business) {
            return res.status(404).json({ success: false, error: 'Business not found' });
        }
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// BULK IMPORT - Migrate existing businesses (ADMIN)
app.post('/api/admin/directory/businesses/import', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { businesses } = req.body;
        
        if (!businesses || !Array.isArray(businesses)) {
            return res.status(400).json({ success: false, error: 'Invalid businesses array' });
        }
        
        // Transform data to match schema
        const transformed = businesses.map(b => ({
            name: b.name,
            category: b.category,
            description: b.description,
            location: b.location,
            website: b.website || '',
            phone: b.phone,
            award: b.award || '',
            founder: b.founder || b.president || b.supervisor || '',
            year: b.year || '',
            impact: b.impact || '',
            verified: b.verified === true,
            is_active: true
        }));
        
        const imported = await DirectoryBusiness.insertMany(transformed, { ordered: false });
        
        res.json({
            success: true,
            count: imported.length,
            message: `Successfully imported ${imported.length} businesses`
        });
    } catch (error) {
        console.error('Bulk import error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET directory stats (ADMIN)
app.get('/api/admin/directory/stats', authenticate, authorize('admin'), async (req, res) => {
    try {
        const total = await DirectoryBusiness.countDocuments();
        const active = await DirectoryBusiness.countDocuments({ is_active: true });
        const byCategory = await DirectoryBusiness.aggregate([
            { $group: { _id: '$category', count: { $sum: 1 } } }
        ]);
        
        res.json({
            success: true,
            stats: { total, active, byCategory }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

console.log('✅ Business Directory System Ready');

// ============================================
// JUDGE MANAGEMENT SYSTEM - COMPLETE
// ============================================

// Get Judge model (make sure it's imported)
const Judge = require('./models/Judge');

// ============ JUDGE AUTH ROUTES ============

// Judge Login
app.post('/api/judge/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log('Judge login attempt:', email);
        
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required' });
        }
        
        const judge = await Judge.findOne({ email: email.toLowerCase() });
        if (!judge) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        if (judge.isLocked()) {
            const lockTime = Math.ceil((judge.lock_until - Date.now()) / (60 * 1000));
            return res.status(403).json({ success: false, message: `Account locked. Try again in ${lockTime} minutes` });
        }
        
        if (judge.status === 'pending') {
            return res.status(403).json({ success: false, message: 'Your account is awaiting admin approval' });
        }
        
        if (judge.status === 'inactive') {
            return res.status(403).json({ success: false, message: 'Your account has been deactivated. Contact the awards committee.' });
        }
        
        const isMatch = await judge.comparePassword(password);
        if (!isMatch) {
            await judge.incrementLoginAttempts();
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        await judge.resetLoginAttempts();
        
        const token = jwt.sign(
            { userId: judge._id, role: 'judge' }, 
            JWT_SECRET, 
            { expiresIn: JWT_EXPIRES_IN }
        );
        
        const refreshToken = jwt.sign(
            { userId: judge._id, role: 'judge', type: 'refresh' },
            JWT_REFRESH_SECRET,
            { expiresIn: JWT_REFRESH_EXPIRES_IN }
        );
        
        await RefreshToken.create({
            token: refreshToken,
            user_id: judge._id,
            user_type: 'judge',
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        });
        
        judge.last_login = new Date();
        await judge.save();
        
        res.json({
            success: true,
            token,
            refreshToken,
            user: {
                id: judge._id,
                email: judge.email,
                name: judge.name,
                role: 'judge',
                status: judge.status
            }
        });
    } catch (error) {
        console.error('Judge login error:', error);
        res.status(500).json({ success: false, message: 'Server error during login' });
    }
});

// Judge Token Verification
app.post('/api/judge/verify', async (req, res) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ success: false, message: 'No token provided' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'judge') {
            return res.status(401).json({ success: false, message: 'Invalid token type' });
        }
        
        const judge = await Judge.findById(decoded.userId).select('-password');
        if (!judge) {
            return res.status(401).json({ success: false, message: 'Judge not found' });
        }
        
        if (judge.status !== 'active') {
            return res.status(403).json({ success: false, message: 'Account not active' });
        }
        
        res.json({
            success: true,
            judge: {
                id: judge._id,
                name: judge.name,
                email: judge.email,
                profession: judge.profession,
                organization: judge.organization,
                expertise: judge.expertise,
                phone: judge.phone,
                photo: judge.photo,
                bio: judge.bio,
                status: judge.status,
                created_at: judge.created_at
            }
        });
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Invalid token' });
    }
});

// Judge Change Password
app.post('/api/judge/change-password', authenticate, async (req, res) => {
    try {
        if (req.userRole !== 'judge') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }
        
        const { current_password, new_password } = req.body;
        
        if (!current_password || !new_password) {
            return res.status(400).json({ success: false, message: 'Current and new password are required' });
        }
        
        if (new_password.length < 6) {
            return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
        }
        
        const judge = await Judge.findById(req.user._id);
        if (!judge) {
            return res.status(404).json({ success: false, message: 'Judge not found' });
        }
        
        const isValid = await judge.comparePassword(current_password);
        if (!isValid) {
            return res.status(401).json({ success: false, message: 'Current password is incorrect' });
        }
        
        judge.password = new_password;
        await judge.save();
        
        res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
        console.error('Judge change password error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Judge Forgot Password
app.post('/api/judge/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }
        
        const judge = await Judge.findOne({ email: email.toLowerCase() });
        if (!judge) {
            return res.json({ success: true, message: 'If an account exists, a reset link has been sent.' });
        }
        
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenExpiry = Date.now() + 3600000;
        
        judge.reset_password_token = resetToken;
        judge.reset_password_expires = resetTokenExpiry;
        await judge.save();
        
        const frontendUrl = process.env.FRONTEND_URL || 'https://liberiabusinessawardslr.com';
        const resetUrl = `${frontendUrl}/reset-password.html?token=${resetToken}&type=judge`;
        
        await sendJudgePasswordResetEmail(judge.email, judge.name, resetUrl);
        
        res.json({ success: true, message: 'Password reset link has been sent to your email.' });
    } catch (error) {
        console.error('Judge forgot password error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Helper function for judge password reset email
async function sendJudgePasswordResetEmail(email, name, resetUrl) {
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: 'liberiabusinessawards@gmail.com',
                pass: process.env.GMAIL_APP_PASSWORD
            }
        });
        
        const htmlBody = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Password Reset - Judge Portal</title>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #FF0000, #87CEEB); color: white; padding: 20px; text-align: center; }
                    .btn { display: inline-block; background: #FF0000; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; margin: 20px 0; }
                    .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Judge Portal - Liberia Business Awards</h1>
                    </div>
                    <div class="content">
                        <p>Dear Judge ${name},</p>
                        <p>We received a request to reset your password for the Judge Portal.</p>
                        <div style="text-align: center;">
                            <a href="${resetUrl}" class="btn">Reset Your Password</a>
                        </div>
                        <p>This link will expire in 1 hour.</p>
                        <p>If you did not request this, please ignore this email.</p>
                    </div>
                    <div class="footer">
                        <p>&copy; ${new Date().getFullYear()} Liberia Business Awards</p>
                    </div>
                </div>
            </body>
            </html>
        `;
        
        await transporter.sendMail({
            from: '"Liberia Business Awards" <liberiabusinessawards@gmail.com>',
            to: email,
            subject: 'Judge Portal - Password Reset Request',
            html: htmlBody
        });
        
        console.log('✅ Judge password reset email sent to:', email);
    } catch (error) {
        console.error('Email send error:', error);
    }
}

// ============ JUDGE DASHBOARD ROUTES ============

// Judge Stats
app.get('/api/judge/stats', authenticate, async (req, res) => {
    try {
        if (req.userRole !== 'judge') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }
        
        const judgeId = req.user._id;
        
        // Get pending nominations (not voted by this judge)
        const pending = await Nomination.countDocuments({
            status: { $in: ['submitted', 'under_review'] },
            _id: { $nin: await Vote.find({ voter_email: judgeId.toString(), is_jury: true }).distinct('nomination_id') }
        });
        
        // Get reviewed nominations
        const reviewed = await Vote.countDocuments({ voter_email: judgeId.toString(), is_jury: true });
        
        // Get average score
        const votes = await Vote.find({ voter_email: judgeId.toString(), is_jury: true });
        const avgScore = votes.length > 0 
            ? (votes.reduce((sum, v) => sum + v.vote_value, 0) / votes.length).toFixed(1)
            : 0;
        
        res.json({
            success: true,
            stats: {
                pending,
                reviewed,
                avgScore,
                totalVotes: votes.length
            }
        });
    } catch (error) {
        console.error('Judge stats error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get nominations for judge to review
app.get('/api/judge/nominations', authenticate, async (req, res) => {
    try {
        if (req.userRole !== 'judge') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }
        
        const { page = 1, limit = 10, category } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const judge = await Judge.findById(req.user._id);
        let query = { status: { $in: ['submitted', 'under_review'] } };
        
        if (category && category !== 'all') {
            query.category = category;
        }
        
        // Get all votes this judge has already cast
        const existingVotes = await Vote.find({ 
            voter_email: judge.email,
            is_jury: true 
        }).select('nomination_id vote_value comment');
        
        const votedNominationIds = existingVotes.map(v => v.nomination_id);
        
        const nominations = await Nomination.find(query)
            .populate('business_id', 'business_name business_type logo')
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(parseInt(limit));
        
        const total = await Nomination.countDocuments(query);
        
        // Add judge's existing vote info
        const nominationsWithVote = nominations.map(n => {
            const existingVote = existingVotes.find(v => v.nomination_id?.toString() === n._id.toString());
            return {
                _id: n._id,
                business_name: n.business_id?.business_name || 'Unknown',
                business_type: n.business_id?.business_type || '',
                category: n.category,
                description: n.description,
                my_score: existingVote?.vote_value || null,
                my_comment: existingVote?.comment || null,
                has_voted: !!existingVote
            };
        });
        
        res.json({
            success: true,
            nominations: nominationsWithVote.filter(n => !n.has_voted),
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Get judge nominations error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get categories for filter
app.get('/api/judge/categories', authenticate, async (req, res) => {
    try {
        if (req.userRole !== 'judge') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }
        
        const categories = await Nomination.distinct('category');
        res.json({ success: true, categories });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Submit judge vote
app.post('/api/judge/vote', authenticate, async (req, res) => {
    try {
        if (req.userRole !== 'judge') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }
        
        const { nomination_id, score, comment } = req.body;
        
        if (!nomination_id || !score || score < 1 || score > 10) {
            return res.status(400).json({ success: false, message: 'Valid nomination ID and score (1-10) are required' });
        }
        
        const judge = await Judge.findById(req.user._id);
        const nomination = await Nomination.findById(nomination_id).populate('business_id');
        
        if (!nomination) {
            return res.status(404).json({ success: false, message: 'Nomination not found' });
        }
        
        // Check if already voted
        const existingVote = await Vote.findOne({
            nomination_id: nomination_id,
            voter_email: judge.email,
            is_jury: true
        });
        
        if (existingVote) {
            return res.status(400).json({ success: false, message: 'You have already voted for this nomination' });
        }
        
        // Create vote (jury vote has weight 3)
        const vote = new Vote({
            nomination_id: nomination_id,
            business_id: nomination.business_id?._id,
            business_name: nomination.business_id?.business_name,
            category: nomination.category,
            voter_email: judge.email,
            voter_ip: req.ip,
            vote_value: score,
            vote_weight: 3,  // Jury votes weigh more
            is_jury: true,
            is_verified: true,
            comment: comment || ''
        });
        
        await vote.save();
        
        // Update judge's vote count
        judge.votes_cast = (judge.votes_cast || 0) + 1;
        await judge.save();
        
        // Update nomination score
        const allVotes = await Vote.find({ nomination_id: nomination_id });
        const totalScore = allVotes.reduce((sum, v) => sum + (v.vote_value * v.vote_weight), 0);
        const totalWeight = allVotes.reduce((sum, v) => sum + v.vote_weight, 0);
        nomination.score = totalWeight > 0 ? (totalScore / totalWeight) * 10 : 0;
        await nomination.save();
        
        res.json({
            success: true,
            message: 'Vote submitted successfully!'
        });
    } catch (error) {
        console.error('Judge vote error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Save judge comment
app.post('/api/judge/comment', authenticate, async (req, res) => {
    try {
        if (req.userRole !== 'judge') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }
        
        const { nomination_id, comment } = req.body;
        
        if (!nomination_id) {
            return res.status(400).json({ success: false, message: 'Nomination ID is required' });
        }
        
        const judge = await Judge.findById(req.user._id);
        
        // Update or create comment
        await Vote.findOneAndUpdate(
            { nomination_id: nomination_id, voter_email: judge.email, is_jury: true },
            { comment: comment || '' },
            { upsert: true, new: true }
        );
        
        res.json({
            success: true,
            message: 'Comment saved successfully'
        });
    } catch (error) {
        console.error('Save comment error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get judge voting history
app.get('/api/judge/history', authenticate, async (req, res) => {
    try {
        if (req.userRole !== 'judge') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }
        
        const { page = 1, limit = 10 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const judge = await Judge.findById(req.user._id);
        
        const votes = await Vote.find({ 
            voter_email: judge.email, 
            is_jury: true 
        })
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(parseInt(limit));
        
        const total = await Vote.countDocuments({ voter_email: judge.email, is_jury: true });
        
        res.json({
            success: true,
            votes: votes.map(v => ({
                _id: v._id,
                business_name: v.business_name,
                category: v.category,
                score: v.vote_value,
                comment: v.comment,
                created_at: v.created_at
            })),
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Judge history error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============ ADMIN JUDGE MANAGEMENT ROUTES ============

// Get all judges (admin)
app.get('/api/admin/judges', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        let query = {};
        
        if (status && status !== 'all') {
            query.status = status;
        }
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const judges = await Judge.find(query)
            .select('-password')
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(parseInt(limit));
        
        const total = await Judge.countDocuments(query);
        
        res.json({
            success: true,
            judges,
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

// Get single judge (admin)
app.get('/api/admin/judges/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const judge = await Judge.findById(req.params.id).select('-password');
        if (!judge) {
            return res.status(404).json({ success: false, message: 'Judge not found' });
        }
        res.json({ success: true, judge });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create judge (admin)
app.post('/api/admin/judges', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { name, email, password, profession, organization, expertise, phone, photo, bio, status } = req.body;
        
        if (!name || !email || !password || !profession) {
            return res.status(400).json({ success: false, message: 'Name, email, password, and profession are required' });
        }
        
        const existing = await Judge.findOne({ email: email.toLowerCase() });
        if (existing) {
            return res.status(400).json({ success: false, message: 'Judge with this email already exists' });
        }
        
        const judge = new Judge({
            name,
            email: email.toLowerCase(),
            password,
            profession,
            organization: organization || '',
            expertise: expertise || '',
            phone: phone || '',
            photo: photo || '',
            bio: bio || '',
            status: status || 'pending',
            created_by: req.user._id
        });
        
        await judge.save();
        
        // Send welcome email to judge
        await sendJudgeWelcomeEmail(judge.email, judge.name, password);
        
        res.status(201).json({
            success: true,
            message: 'Judge created successfully. Login credentials sent to their email.',
            judge: { _id: judge._id, name: judge.name, email: judge.email, status: judge.status }
        });
    } catch (error) {
        console.error('Create judge error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update judge (admin)
app.put('/api/admin/judges/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const judge = await Judge.findById(req.params.id);
        if (!judge) {
            return res.status(404).json({ success: false, message: 'Judge not found' });
        }
        
        const { name, profession, organization, expertise, phone, photo, bio, status } = req.body;
        
        if (name) judge.name = name;
        if (profession) judge.profession = profession;
        if (organization !== undefined) judge.organization = organization;
        if (expertise !== undefined) judge.expertise = expertise;
        if (phone !== undefined) judge.phone = phone;
        if (photo !== undefined) judge.photo = photo;
        if (bio !== undefined) judge.bio = bio;
        if (status) judge.status = status;
        
        await judge.save();
        
        res.json({
            success: true,
            message: 'Judge updated successfully',
            judge: { _id: judge._id, name: judge.name, email: judge.email, status: judge.status }
        });
    } catch (error) {
        console.error('Update judge error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Reset judge password (admin)
app.post('/api/admin/judges/:id/reset-password', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { password } = req.body;
        
        if (!password || password.length < 6) {
            return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
        }
        
        const judge = await Judge.findById(req.params.id);
        if (!judge) {
            return res.status(404).json({ success: false, message: 'Judge not found' });
        }
        
        judge.password = password;
        await judge.save();
        
        // Send email with new password
        await sendJudgePasswordResetEmail(judge.email, judge.name, null);
        
        res.json({
            success: true,
            message: 'Password reset successfully. New credentials sent to judge email.'
        });
    } catch (error) {
        console.error('Reset judge password error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete judge (admin)
app.delete('/api/admin/judges/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const judge = await Judge.findByIdAndDelete(req.params.id);
        if (!judge) {
            return res.status(404).json({ success: false, message: 'Judge not found' });
        }
        
        res.json({ success: true, message: 'Judge deleted successfully' });
    } catch (error) {
        console.error('Delete judge error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Helper function for judge welcome email
async function sendJudgeWelcomeEmail(email, name, tempPassword) {
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: 'liberiabusinessawards@gmail.com',
                pass: process.env.GMAIL_APP_PASSWORD
            }
        });
        
        const loginUrl = 'https://liberiabusinessawardslr.com/login.html';
        
        const htmlBody = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Welcome to the Judge Portal</title>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #FF0000, #87CEEB); color: white; padding: 20px; text-align: center; }
                    .credentials { background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0; }
                    .btn { display: inline-block; background: #FF0000; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; }
                    .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>Welcome to the Judge Portal!</h1>
                    </div>
                    <div class="content">
                        <p>Dear Judge ${name},</p>
                        <p>You have been appointed as a judge for the Liberia Business Awards.</p>
                        
                        <div class="credentials">
                            <h3>Your Login Credentials:</h3>
                            <p><strong>Email:</strong> ${email}</p>
                            <p><strong>Temporary Password:</strong> ${tempPassword}</p>
                            <p><strong>Login URL:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
                        </div>
                        
                        <p>Please log in using the credentials above. You will be prompted to change your password after your first login.</p>
                        
                        <div style="text-align: center;">
                            <a href="${loginUrl}" class="btn">Login to Judge Portal</a>
                        </div>
                        
                        <p>As a judge, you will be reviewing nominations and casting votes. Your expertise and honest evaluation are crucial to the success of the awards.</p>
                        
                        <p>If you have any questions, please contact the awards committee.</p>
                    </div>
                    <div class="footer">
                        <p>&copy; ${new Date().getFullYear()} Liberia Business Awards</p>
                    </div>
                </div>
            </body>
            </html>
        `;
        
        await transporter.sendMail({
            from: '"Liberia Business Awards" <liberiabusinessawards@gmail.com>',
            to: email,
            subject: 'Welcome to the Judge Portal - Liberia Business Awards',
            html: htmlBody
        });
        
        console.log('✅ Welcome email sent to judge:', email);
    } catch (error) {
        console.error('Welcome email error:', error);
    }
}

// ============================================
// PARTNER MANAGEMENT SYSTEM - COMPLETE
// ============================================

// Partner Schema
const partnerSchema = new mongoose.Schema({
    organization_name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    contact_name: { type: String, default: '' },
    phone: { type: String, default: '' },
    website: { type: String, default: '' },
    bio: { type: String, default: '' },
    type: { 
        type: String, 
        enum: ['sponsor', 'media', 'community', 'government', 'ngo', 'corporate', 'other'], 
        default: 'other' 
    },
    status: { 
        type: String, 
        enum: ['pending', 'active', 'inactive'], 
        default: 'pending' 
    },
    logo: { type: String, default: '' },
    events_count: { type: Number, default: 0 },
    last_login: { type: Date },
    login_attempts: { type: Number, default: 0 },
    lock_until: { type: Date },
    reset_password_token: { type: String },
    reset_password_expires: { type: Date },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    approved_at: { type: Date },
    approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }
}, { timestamps: true });

// Partner methods
partnerSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    try {
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

partnerSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

partnerSchema.methods.isLocked = function() {
    return !!(this.lock_until && this.lock_until > Date.now());
};

partnerSchema.methods.incrementLoginAttempts = function() {
    this.login_attempts += 1;
    if (this.login_attempts >= 5) {
        this.lock_until = Date.now() + 30 * 60 * 1000;
    }
    return this.save();
};

partnerSchema.methods.resetLoginAttempts = function() {
    this.login_attempts = 0;
    this.lock_until = undefined;
    return this.save();
};

// ============ REGISTER PARTNER MODEL BEFORE MIDDLEWARE USES IT ============
const Partner = mongoose.model('Partner', partnerSchema);

// Export for use in middleware
module.exports.Partner = Partner;


// ============ PARTNER AUTH ROUTES ============

// Partner Login
app.post('/api/partner/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log('Partner login attempt:', email);
        
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required' });
        }
        
        const partner = await Partner.findOne({ email: email.toLowerCase() });
        if (!partner) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        if (partner.isLocked()) {
            const lockTime = Math.ceil((partner.lock_until - Date.now()) / (60 * 1000));
            return res.status(403).json({ success: false, message: `Account locked. Try again in ${lockTime} minutes` });
        }
        
        if (partner.status === 'pending') {
            return res.status(403).json({ success: false, message: 'Your account is awaiting admin approval' });
        }
        
        if (partner.status === 'inactive') {
            return res.status(403).json({ success: false, message: 'Your account has been deactivated. Contact the administrator.' });
        }
        
        const isMatch = await partner.comparePassword(password);
        if (!isMatch) {
            await partner.incrementLoginAttempts();
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        await partner.resetLoginAttempts();
        
        const token = jwt.sign(
            { userId: partner._id, role: 'partner' }, 
            JWT_SECRET, 
            { expiresIn: JWT_EXPIRES_IN }
        );
        
        const refreshToken = jwt.sign(
            { userId: partner._id, role: 'partner', type: 'refresh' },
            JWT_REFRESH_SECRET,
            { expiresIn: JWT_REFRESH_EXPIRES_IN }
        );
        
        await RefreshToken.create({
            token: refreshToken,
            user_id: partner._id,
            user_type: 'partner',
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        });
        
        partner.last_login = new Date();
        await partner.save();
        
        res.json({
            success: true,
            token,
            refreshToken,
            user: {
                id: partner._id,
                email: partner.email,
                name: partner.organization_name,
                role: 'partner',
                status: partner.status
            }
        });
    } catch (error) {
        console.error('Partner login error:', error);
        res.status(500).json({ success: false, message: 'Server error during login' });
    }
});

// Partner Token Verification
app.post('/api/partner/verify', async (req, res) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ success: false, message: 'No token provided' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.role !== 'partner') {
            return res.status(401).json({ success: false, message: 'Invalid token type' });
        }
        
        const partner = await Partner.findById(decoded.userId).select('-password');
        if (!partner) {
            return res.status(401).json({ success: false, message: 'Partner not found' });
        }
        
        if (partner.status !== 'active') {
            return res.status(403).json({ success: false, message: 'Account not active' });
        }
        
        res.json({
            success: true,
            partner: {
                id: partner._id,
                organization_name: partner.organization_name,
                email: partner.email,
                contact_name: partner.contact_name,
                phone: partner.phone,
                type: partner.type,
                status: partner.status,
                bio: partner.bio,
                website: partner.website,
                logo: partner.logo,
                created_at: partner.created_at
            }
        });
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Invalid token' });
    }
});

// ============ ADMIN PARTNER MANAGEMENT ROUTES ============

// Get all partners (admin)
app.get('/api/admin/partners', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { status, page = 1, limit = 20, search } = req.query;
        let query = {};
        
        if (status && status !== 'all') {
            query.status = status;
        }
        
        if (search) {
            query.$or = [
                { organization_name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { contact_name: { $regex: search, $options: 'i' } }
            ];
        }
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const [partners, total] = await Promise.all([
            Partner.find(query)
                .select('-password')
                .sort({ created_at: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            Partner.countDocuments(query)
        ]);
        
        res.json({
            success: true,
            partners: partners.map(p => ({
                _id: p._id,
                organization_name: p.organization_name,
                email: p.email,
                contact_name: p.contact_name,
                phone: p.phone,
                website: p.website,
                bio: p.bio,
                type: p.type,
                status: p.status,
                logo: p.logo,
                events_count: p.events_count || 0,
                created_at: p.created_at,
                approved_at: p.approved_at
            })),
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Get partners error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get partner stats (admin)
app.get('/api/admin/partners/stats', authenticate, authorize('admin'), async (req, res) => {
    try {
        const [total, active, inactive, pending] = await Promise.all([
            Partner.countDocuments(),
            Partner.countDocuments({ status: 'active' }),
            Partner.countDocuments({ status: 'inactive' }),
            Partner.countDocuments({ status: 'pending' })
        ]);
        
        res.json({
            success: true,
            stats: { total, active, inactive, pending }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get single partner (admin)
app.get('/api/admin/partners/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const partner = await Partner.findById(req.params.id).select('-password');
        if (!partner) {
            return res.status(404).json({ success: false, message: 'Partner not found' });
        }
        res.json({ success: true, partner });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create partner (admin)
app.post('/api/admin/partners', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { 
            organization_name, email, password, contact_name, phone, 
            website, bio, type, status 
        } = req.body;
        
        if (!organization_name || !email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Organization name, email, and password are required' 
            });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ 
                success: false, 
                message: 'Password must be at least 6 characters' 
            });
        }
        
        const existing = await Partner.findOne({ email: email.toLowerCase() });
        if (existing) {
            return res.status(400).json({ 
                success: false, 
                message: 'Partner with this email already exists' 
            });
        }
        
        const partner = new Partner({
            organization_name,
            email: email.toLowerCase(),
            password,
            contact_name: contact_name || '',
            phone: phone || '',
            website: website || '',
            bio: bio || '',
            type: type || 'other',
            status: status || 'pending',
            created_by: req.user._id
        });
        
        await partner.save();
        
        // Send welcome email
        try {
            await sendPartnerWelcomeEmail(partner.email, partner.organization_name, password);
        } catch (emailError) {
            console.error('Failed to send partner welcome email:', emailError);
        }
        
        res.status(201).json({
            success: true,
            message: 'Partner created successfully! Welcome email sent.',
            partner: {
                _id: partner._id,
                organization_name: partner.organization_name,
                email: partner.email,
                status: partner.status
            }
        });
    } catch (error) {
        console.error('Create partner error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update partner (admin)
app.put('/api/admin/partners/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const partner = await Partner.findById(req.params.id);
        if (!partner) {
            return res.status(404).json({ success: false, message: 'Partner not found' });
        }
        
        const { 
            organization_name, contact_name, phone, website, 
            bio, type, status 
        } = req.body;
        
        if (organization_name) partner.organization_name = organization_name;
        if (contact_name !== undefined) partner.contact_name = contact_name;
        if (phone !== undefined) partner.phone = phone;
        if (website !== undefined) partner.website = website;
        if (bio !== undefined) partner.bio = bio;
        if (type) partner.type = type;
        if (status) partner.status = status;
        
        await partner.save();
        
        res.json({
            success: true,
            message: 'Partner updated successfully',
            partner: {
                _id: partner._id,
                organization_name: partner.organization_name,
                email: partner.email,
                status: partner.status
            }
        });
    } catch (error) {
        console.error('Update partner error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Approve partner (admin)
app.post('/api/admin/partners/:id/approve', authenticate, authorize('admin'), async (req, res) => {
    try {
        const partner = await Partner.findById(req.params.id);
        if (!partner) {
            return res.status(404).json({ success: false, message: 'Partner not found' });
        }
        
        partner.status = 'active';
        partner.approved_at = new Date();
        partner.approved_by = req.user._id;
        await partner.save();
        
        // Send approval notification
        try {
            await sendPartnerApprovalEmail(partner.email, partner.organization_name);
        } catch (emailError) {
            console.error('Failed to send partner approval email:', emailError);
        }
        
        res.json({
            success: true,
            message: 'Partner approved successfully',
            partner: {
                _id: partner._id,
                organization_name: partner.organization_name,
                status: partner.status
            }
        });
    } catch (error) {
        console.error('Approve partner error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Reset partner password (admin)
app.post('/api/admin/partners/:id/reset-password', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { password } = req.body;
        
        if (!password || password.length < 6) {
            return res.status(400).json({ 
                success: false, 
                message: 'Password must be at least 6 characters' 
            });
        }
        
        const partner = await Partner.findById(req.params.id);
        if (!partner) {
            return res.status(404).json({ success: false, message: 'Partner not found' });
        }
        
        partner.password = password;
        await partner.save();
        
        // Send new password email
        try {
            await sendPartnerPasswordResetEmail(partner.email, partner.organization_name, password);
        } catch (emailError) {
            console.error('Failed to send password reset email:', emailError);
        }
        
        res.json({
            success: true,
            message: 'Password reset successfully. New credentials sent to partner email.'
        });
    } catch (error) {
        console.error('Reset partner password error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete partner (admin)
app.delete('/api/admin/partners/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const partner = await Partner.findByIdAndDelete(req.params.id);
        if (!partner) {
            return res.status(404).json({ success: false, message: 'Partner not found' });
        }
        
        // Clean up related data
        await RefreshToken.deleteMany({ user_id: partner._id, user_type: 'partner' });
        
        res.json({
            success: true,
            message: 'Partner deleted successfully'
        });
    } catch (error) {
        console.error('Delete partner error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});



// ============ PARTNER FORGOT PASSWORD ROUTES ============

// Partner Forgot Password
app.post('/api/partner/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }
        
        const partner = await Partner.findOne({ email: email.toLowerCase() });
        if (!partner) {
            return res.json({ 
                success: true, 
                message: 'If an account exists, a reset link has been sent.' 
            });
        }
        
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenExpiry = Date.now() + 3600000;
        
        partner.reset_password_token = resetToken;
        partner.reset_password_expires = resetTokenExpiry;
        await partner.save();
        
        const frontendUrl = process.env.FRONTEND_URL || 'https://liberiabusinessawardslr.com';
        const resetUrl = `${frontendUrl}/reset-password.html?token=${resetToken}&type=partner`;
        
        // Send email
        try {
            await sendPartnerPasswordResetEmail(partner.email, partner.organization_name, resetUrl);
        } catch (emailError) {
            console.error('Failed to send partner password reset email:', emailError);
        }
        
        res.json({ 
            success: true, 
            message: 'Password reset link has been sent to your email.' 
        });
    } catch (error) {
        console.error('Partner forgot password error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Partner Reset Password
app.post('/api/partner/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        
        if (!token || !newPassword) {
            return res.status(400).json({ 
                success: false, 
                message: 'Token and new password are required' 
            });
        }
        
        if (newPassword.length < 6) {
            return res.status(400).json({ 
                success: false, 
                message: 'Password must be at least 6 characters' 
            });
        }
        
        const partner = await Partner.findOne({
            reset_password_token: token,
            reset_password_expires: { $gt: Date.now() }
        });
        
        if (!partner) {
            return res.status(400).json({ 
                success: false, 
                message: 'Password reset token is invalid or has expired.' 
            });
        }
        
        partner.password = newPassword;
        partner.reset_password_token = undefined;
        partner.reset_password_expires = undefined;
        await partner.save();
        
        res.json({ 
            success: true, 
            message: 'Password has been reset successfully.' 
        });
    } catch (error) {
        console.error('Partner reset password error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============ PARTNER EMAIL FUNCTIONS ============

async function sendPartnerWelcomeEmail(email, orgName, tempPassword) {
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: 'liberiabusinessawards@gmail.com',
                pass: process.env.GMAIL_APP_PASSWORD
            }
        });
        
        const loginUrl = 'https://liberiabusinessawardslr.com/partner/login.html';
        const dashboardUrl = 'https://liberiabusinessawardslr.com/dashboard/partner.html';
        
        const htmlBody = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Welcome Partner - Liberia Business Awards</title>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #8B5CF6, #6D28D9); color: white; padding: 20px; text-align: center; }
                    .credentials { background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0; }
                    .btn { display: inline-block; background: #8B5CF6; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; }
                    .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🤝 Welcome to the Partner Portal!</h1>
                    </div>
                    <div class="content">
                        <p>Dear ${orgName},</p>
                        <p>Congratulations! Your organization has been registered as a partner for the Liberia Business Awards.</p>
                        
                        <div class="credentials">
                            <h3>Your Login Credentials:</h3>
                            <p><strong>Email:</strong> ${email}</p>
                            <p><strong>Temporary Password:</strong> ${tempPassword}</p>
                            <p><strong>Login URL:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
                        </div>
                        
                        <p>Please log in using the credentials above. You will be prompted to change your password after your first login.</p>
                        
                        <div style="text-align: center;">
                            <a href="${loginUrl}" class="btn">Login to Partner Portal</a>
                        </div>
                        
                        <p>Once logged in, you can manage your partnership, view events, and access exclusive resources.</p>
                        
                        <p>If you have any questions, please contact the awards committee.</p>
                    </div>
                    <div class="footer">
                        <p>&copy; ${new Date().getFullYear()} Liberia Business Awards</p>
                    </div>
                </div>
            </body>
            </html>
        `;
        
        await transporter.sendMail({
            from: '"Liberia Business Awards" <liberiabusinessawards@gmail.com>',
            to: email,
            subject: 'Welcome to the Partner Portal - Liberia Business Awards',
            html: htmlBody
        });
        
        console.log('✅ Welcome email sent to partner:', email);
    } catch (error) {
        console.error('Partner welcome email error:', error);
    }
}

async function sendPartnerApprovalEmail(email, orgName) {
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: 'liberiabusinessawards@gmail.com',
                pass: process.env.GMAIL_APP_PASSWORD
            }
        });
        
        const loginUrl = 'https://liberiabusinessawardslr.com/partner/login.html';
        
        const htmlBody = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Partner Approved - Liberia Business Awards</title>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #8B5CF6, #6D28D9); color: white; padding: 20px; text-align: center; }
                    .btn { display: inline-block; background: #8B5CF6; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; }
                    .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>✅ Partner Approved!</h1>
                    </div>
                    <div class="content">
                        <p>Dear ${orgName},</p>
                        <p>Your partner account has been approved by the administrator!</p>
                        
                        <p>You can now log in to the Partner Portal and access all features.</p>
                        
                        <div style="text-align: center;">
                            <a href="${loginUrl}" class="btn">Login to Partner Portal</a>
                        </div>
                        
                        <p>Thank you for being a valued partner of the Liberia Business Awards.</p>
                    </div>
                    <div class="footer">
                        <p>&copy; ${new Date().getFullYear()} Liberia Business Awards</p>
                    </div>
                </div>
            </body>
            </html>
        `;
        
        await transporter.sendMail({
            from: '"Liberia Business Awards" <liberiabusinessawards@gmail.com>',
            to: email,
            subject: '✅ Partner Account Approved - Liberia Business Awards',
            html: htmlBody
        });
        
        console.log('✅ Approval email sent to partner:', email);
    } catch (error) {
        console.error('Partner approval email error:', error);
    }
}

async function sendPartnerPasswordResetEmail(email, orgName, resetUrlOrPassword) {
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: 'liberiabusinessawards@gmail.com',
                pass: process.env.GMAIL_APP_PASSWORD
            }
        });
        
        const isPassword = resetUrlOrPassword && resetUrlOrPassword.length < 100 && !resetUrlOrPassword.includes('http');
        
        let content;
        if (isPassword) {
            content = `
                <div class="credentials" style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <h3>Your New Password:</h3>
                    <p><strong>${resetUrlOrPassword}</strong></p>
                    <p style="font-size: 14px; color: #666;">Please log in and change your password immediately.</p>
                </div>
                <div style="text-align: center;">
                    <a href="https://liberiabusinessawardslr.com/partner/login.html" class="btn">Login to Partner Portal</a>
                </div>
            `;
        } else {
            content = `
                <div style="text-align: center;">
                    <a href="${resetUrlOrPassword}" class="btn">Reset Your Password</a>
                </div>
                <p style="font-size: 12px; color: #666;">This link will expire in 1 hour.</p>
            `;
        }
        
        const htmlBody = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Password Reset - Partner Portal</title>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #8B5CF6, #6D28D9); color: white; padding: 20px; text-align: center; }
                    .btn { display: inline-block; background: #8B5CF6; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; }
                    .footer { text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🔑 Partner Portal - Password Reset</h1>
                    </div>
                    <div class="content">
                        <p>Dear ${orgName},</p>
                        <p>We received a request to reset your password for the Partner Portal.</p>
                        ${content}
                        <p>If you did not request this, please ignore this email.</p>
                    </div>
                    <div class="footer">
                        <p>&copy; ${new Date().getFullYear()} Liberia Business Awards</p>
                    </div>
                </div>
            </body>
            </html>
        `;
        
        await transporter.sendMail({
            from: '"Liberia Business Awards" <liberiabusinessawards@gmail.com>',
            to: email,
            subject: isPassword ? '🔑 New Password - Partner Portal' : '🔑 Password Reset Request - Partner Portal',
            html: htmlBody
        });
        
        console.log('✅ Password reset email sent to partner:', email);
    } catch (error) {
        console.error('Partner password reset email error:', error);
    }
}

console.log('✅ Partner Management System Ready');

// ============================================
// PARTNER DASHBOARD ROUTES - Profile & Dashboard
// ============================================

// ============ PARTNER PROFILE ROUTES ============

// Get partner profile
app.get('/api/partner/profile', authenticate, authorize('partner'), async (req, res) => {
    try {
        const partner = await Partner.findById(req.user._id).select('-password');
        if (!partner) {
            return res.status(404).json({ success: false, message: 'Partner not found' });
        }
        
        res.json({
            success: true,
            profile: {
                _id: partner._id,
                organization_name: partner.organization_name,
                email: partner.email,
                contact_name: partner.contact_name,
                phone: partner.phone,
                website: partner.website,
                bio: partner.bio,
                type: partner.type,
                status: partner.status,
                logo: partner.logo,
                created_at: partner.created_at
            }
        });
    } catch (error) {
        console.error('Get partner profile error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update partner profile
app.put('/api/partner/profile', authenticate, authorize('partner'), async (req, res) => {
    try {
        const partner = await Partner.findById(req.user._id);
        if (!partner) {
            return res.status(404).json({ success: false, message: 'Partner not found' });
        }
        
        const { organization_name, contact_name, phone, website, bio } = req.body;
        
        if (organization_name) partner.organization_name = organization_name;
        if (contact_name !== undefined) partner.contact_name = contact_name;
        if (phone !== undefined) partner.phone = phone;
        if (website !== undefined) partner.website = website;
        if (bio !== undefined) partner.bio = bio;
        
        await partner.save();
        
        res.json({
            success: true,
            message: 'Profile updated successfully',
            profile: {
                _id: partner._id,
                organization_name: partner.organization_name,
                email: partner.email,
                contact_name: partner.contact_name,
                phone: partner.phone,
                website: partner.website,
                bio: partner.bio,
                type: partner.type,
                status: partner.status
            }
        });
    } catch (error) {
        console.error('Update partner profile error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Partner change password
app.post('/api/partner/change-password', authenticate, authorize('partner'), async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, message: 'Current and new password are required' });
        }
        
        if (newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
        }
        
        const partner = await Partner.findById(req.user._id);
        if (!partner) {
            return res.status(404).json({ success: false, message: 'Partner not found' });
        }
        
        const isValid = await partner.comparePassword(currentPassword);
        if (!isValid) {
            return res.status(401).json({ success: false, message: 'Current password is incorrect' });
        }
        
        partner.password = newPassword;
        await partner.save();
        
        res.json({ success: true, message: 'Password changed successfully' });
    } catch (error) {
        console.error('Partner change password error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============ PARTNER EVENTS ROUTES ============

// Get partner events
app.get('/api/partner/events', authenticate, authorize('partner'), async (req, res) => {
    try {
        const { page = 1, limit = 10, status } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        let query = { partner_id: req.user._id };
        if (status && status !== 'all') {
            query.status = status;
        }
        
        // Use your existing Event model or create a new one
        const Event = mongoose.model('Event');
        const events = await Event.find(query)
            .sort({ start_date: -1 })
            .skip(skip)
            .limit(parseInt(limit));
        
        const total = await Event.countDocuments(query);
        
        res.json({
            success: true,
            events,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Get partner events error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create partner event
app.post('/api/partner/events', authenticate, authorize('partner'), async (req, res) => {
    try {
        const { title, description, start_date, end_date, location, type, image_url, registration_link, status } = req.body;
        
        if (!title || !description || !start_date || !end_date) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }
        
        const Event = mongoose.model('Event');
        const event = new Event({
            title,
            description,
            start_date: new Date(start_date),
            end_date: new Date(end_date),
            location,
            type: type || 'other',
            image_url,
            registration_link,
            status: status || 'draft',
            partner_id: req.user._id,
            partner_name: req.user.organization_name,
            created_by: req.user._id
        });
        
        await event.save();
        
        res.status(201).json({
            success: true,
            message: 'Event created successfully',
            event
        });
    } catch (error) {
        console.error('Create partner event error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete partner event
app.delete('/api/partner/events/:id', authenticate, authorize('partner'), async (req, res) => {
    try {
        const Event = mongoose.model('Event');
        const event = await Event.findOneAndDelete({
            _id: req.params.id,
            partner_id: req.user._id
        });
        
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }
        
        res.json({ success: true, message: 'Event deleted successfully' });
    } catch (error) {
        console.error('Delete partner event error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============ PARTNER SESSIONS ROUTES ============

// Get partner sessions
app.get('/api/partner/sessions', authenticate, authorize('partner'), async (req, res) => {
    try {
        const { page = 1, limit = 10, status } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        let query = { partner_id: req.user._id };
        if (status && status !== 'all') {
            query.status = status;
        }
        
        const Session = mongoose.model('Session');
        const sessions = await Session.find(query)
            .sort({ date: -1 })
            .skip(skip)
            .limit(parseInt(limit));
        
        const total = await Session.countDocuments(query);
        
        res.json({
            success: true,
            sessions,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Get partner sessions error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create partner session
app.post('/api/partner/sessions', authenticate, authorize('partner'), async (req, res) => {
    try {
        const { title, description, date, time, meeting_link, max_attendees, status } = req.body;
        
        if (!title || !date || !time) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }
        
        const Session = mongoose.model('Session');
        const session = new Session({
            title,
            description,
            date: new Date(date),
            time,
            meeting_link,
            max_attendees: max_attendees || 100,
            status: status || 'scheduled',
            partner_id: req.user._id,
            partner_name: req.user.organization_name,
            created_by: req.user._id
        });
        
        await session.save();
        
        res.status(201).json({
            success: true,
            message: 'Session created successfully',
            session
        });
    } catch (error) {
        console.error('Create partner session error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete partner session
app.delete('/api/partner/sessions/:id', authenticate, authorize('partner'), async (req, res) => {
    try {
        const Session = mongoose.model('Session');
        const session = await Session.findOneAndDelete({
            _id: req.params.id,
            partner_id: req.user._id
        });
        
        if (!session) {
            return res.status(404).json({ success: false, message: 'Session not found' });
        }
        
        res.json({ success: true, message: 'Session deleted successfully' });
    } catch (error) {
        console.error('Delete partner session error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});


// ============ ENHANCED SESSION ROUTES ============

// Start session (partner)
app.put('/api/partner/sessions/:id/start', authenticate, authorize('partner'), async (req, res) => {
    try {
        const session = await Session.findOne({
            _id: req.params.id,
            partner_id: req.user._id
        });
        
        if (!session) {
            return res.status(404).json({ success: false, message: 'Session not found' });
        }
        
        session.status = 'live';
        await session.save();
        
        // Generate embed URL if not set
        let embedUrl = session.meeting_link;
        if (session.platform === 'zoom' && session.meeting_link.includes('zoom.us/j/')) {
            const match = session.meeting_link.match(/zoom\.us\/j\/(\d+)/);
            if (match) {
                embedUrl = `https://zoom.us/embed/${match[1]}`;
            }
        }
        
        res.json({
            success: true,
            message: 'Session started',
            session: {
                ...session.toObject(),
                embed_url: embedUrl
            }
        });
    } catch (error) {
        console.error('Start session error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// End session (partner)
app.put('/api/partner/sessions/:id/end', authenticate, authorize('partner'), async (req, res) => {
    try {
        const session = await Session.findOne({
            _id: req.params.id,
            partner_id: req.user._id
        });
        
        if (!session) {
            return res.status(404).json({ success: false, message: 'Session not found' });
        }
        
        session.status = 'ended';
        await session.save();
        
        res.json({
            success: true,
            message: 'Session ended'
        });
    } catch (error) {
        console.error('End session error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});


// ============ PARTNER MESSAGES ROUTES ============

// Get partner messages
app.get('/api/partner/messages', authenticate, authorize('partner'), async (req, res) => {
    try {
        const { limit = 50 } = req.query;
        
        // Use existing Message model or create one
        const Message = mongoose.model('Message');
        const messages = await Message.find({
            $or: [
                { recipient_id: req.user._id, recipient_type: 'partner' },
                { sender_id: req.user._id, sender_type: 'partner' }
            ]
        })
        .sort({ created_at: -1 })
        .limit(parseInt(limit));
        
        res.json({
            success: true,
            messages
        });
    } catch (error) {
        console.error('Get partner messages error:', error);
        // If Message model doesn't exist, return empty array
        res.json({ success: true, messages: [] });
    }
});

// Send partner message
app.post('/api/partner/messages', authenticate, authorize('partner'), async (req, res) => {
    try {
        const { subject, content, priority } = req.body;
        
        if (!subject || !content) {
            return res.status(400).json({ success: false, message: 'Subject and content are required' });
        }
        
        // Get admin users to send to
        const admins = await Admin.find().select('_id');
        
        const Message = mongoose.model('Message');
        const message = new Message({
            sender_id: req.user._id,
            sender_type: 'partner',
            sender_name: req.user.organization_name,
            recipient_type: 'admin',
            recipient_id: admins[0]?._id || null,
            subject,
            content,
            priority: priority || 'normal',
            status: 'sent'
        });
        
        await message.save();
        
        // Create notifications for admins
        for (const admin of admins) {
            const Notification = mongoose.model('Notification');
            await Notification.create({
                recipient_id: admin._id,
                recipient_type: 'admin',
                title: `New Message from Partner: ${req.user.organization_name}`,
                message: `${subject}`,
                type: 'info',
                read: false,
                related_id: message._id
            });
        }
        
        res.status(201).json({
            success: true,
            message: 'Message sent successfully',
            message
        });
    } catch (error) {
        console.error('Send partner message error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Mark partner message as read
app.post('/api/partner/messages/:id/read', authenticate, authorize('partner'), async (req, res) => {
    try {
        const Message = mongoose.model('Message');
        await Message.updateOne(
            { _id: req.params.id, recipient_id: req.user._id },
            { read: true }
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Mark message read error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});


// ============ ENHANCED PARTNER NOTIFICATION ROUTES ============

// Get all notifications with filtering
app.get('/api/partner/notifications', authenticate, authorize('partner'), async (req, res) => {
    try {
        const { limit = 50, filter = 'all' } = req.query;
        let query = { recipient_id: req.user._id, recipient_type: 'partner' };
        
        if (filter === 'unread') {
            query.read = false;
        } else if (filter === 'archived') {
            query.archived = true;
        } else {
            query.archived = { $ne: true };
        }
        
        const notifications = await Notification.find(query)
            .sort({ created_at: -1 })
            .limit(parseInt(limit));
        
        const unreadCount = await Notification.countDocuments({
            recipient_id: req.user._id,
            recipient_type: 'partner',
            read: false,
            archived: { $ne: true }
        });
        
        res.json({
            success: true,
            notifications,
            unreadCount,
            total: notifications.length
        });
    } catch (error) {
        console.error('Get partner notifications error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Mark notification as read
app.post('/api/partner/notifications/:id/read', authenticate, authorize('partner'), async (req, res) => {
    try {
        const { id } = req.params;
        const notification = await Notification.findOne({
            _id: id,
            recipient_id: req.user._id,
            recipient_type: 'partner'
        });
        
        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }
        
        notification.read = true;
        notification.read_at = new Date();
        await notification.save();
        
        res.json({ success: true });
    } catch (error) {
        console.error('Mark notification read error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Mark all notifications as read
app.post('/api/partner/notifications/read-all', authenticate, authorize('partner'), async (req, res) => {
    try {
        await Notification.updateMany(
            {
                recipient_id: req.user._id,
                recipient_type: 'partner',
                read: false,
                archived: { $ne: true }
            },
            {
                read: true,
                read_at: new Date()
            }
        );
        
        res.json({ success: true });
    } catch (error) {
        console.error('Mark all read error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete notification
app.delete('/api/partner/notifications/:id', authenticate, authorize('partner'), async (req, res) => {
    try {
        const { id } = req.params;
        const result = await Notification.findOneAndDelete({
            _id: id,
            recipient_id: req.user._id,
            recipient_type: 'partner'
        });
        
        if (!result) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Delete notification error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Archive notification
app.post('/api/partner/notifications/:id/archive', authenticate, authorize('partner'), async (req, res) => {
    try {
        const { id } = req.params;
        const notification = await Notification.findOne({
            _id: id,
            recipient_id: req.user._id,
            recipient_type: 'partner'
        });
        
        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }
        
        notification.archived = true;
        await notification.save();
        
        res.json({ success: true });
    } catch (error) {
        console.error('Archive notification error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Unarchive notification
app.post('/api/partner/notifications/:id/unarchive', authenticate, authorize('partner'), async (req, res) => {
    try {
        const { id } = req.params;
        const notification = await Notification.findOne({
            _id: id,
            recipient_id: req.user._id,
            recipient_type: 'partner'
        });
        
        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }
        
        notification.archived = false;
        await notification.save();
        
        res.json({ success: true });
    } catch (error) {
        console.error('Unarchive notification error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============ PARTNER NOTIFICATIONS ROUTES ============

// Get partner notifications
app.get('/api/partner/notifications', authenticate, authorize('partner'), async (req, res) => {
    try {
        const { limit = 50 } = req.query;
        
        const Notification = mongoose.model('Notification');
        const notifications = await Notification.find({
            recipient_id: req.user._id,
            recipient_type: 'partner'
        })
        .sort({ created_at: -1 })
        .limit(parseInt(limit));
        
        res.json({
            success: true,
            notifications
        });
    } catch (error) {
        console.error('Get partner notifications error:', error);
        // If model doesn't exist, return empty array
        res.json({ success: true, notifications: [] });
    }
});

// Mark partner notification as read
app.post('/api/partner/notifications/:id/read', authenticate, authorize('partner'), async (req, res) => {
    try {
        const Notification = mongoose.model('Notification');
        await Notification.updateOne(
            { _id: req.params.id, recipient_id: req.user._id },
            { read: true }
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Mark notification read error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Mark all partner notifications as read
app.post('/api/partner/notifications/read-all', authenticate, authorize('partner'), async (req, res) => {
    try {
        const Notification = mongoose.model('Notification');
        await Notification.updateMany(
            { recipient_id: req.user._id, recipient_type: 'partner', read: false },
            { read: true }
        );
        res.json({ success: true });
    } catch (error) {
        console.error('Mark all notifications read error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

console.log('✅ Partner Dashboard API Routes Ready');


// ============================================
// ADMIN PARTNER EVENTS MANAGEMENT ROUTES
// ============================================

// Get all partner events (admin)
app.get('/api/admin/partner/events', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { approval_status, search, page = 1, limit = 20 } = req.query;
        let query = {};
        
        if (approval_status && approval_status !== 'all') {
            query.approval_status = approval_status;
        }
        
        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { partner_name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const [events, total] = await Promise.all([
            Event.find(query)
                .sort({ created_at: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            Event.countDocuments(query)
        ]);
        
        res.json({
            success: true,
            events,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Get partner events error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Approve partner event (admin)
app.put('/api/admin/partner/events/:id/approve', authenticate, authorize('admin'), async (req, res) => {
    try {
        const event = await Event.findById(req.params.id);
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }
        
        event.approval_status = 'approved';
        event.approved_at = new Date();
        event.approved_by = req.user._id;
        event.status = 'published';
        await event.save();
        
        // Notify partner
        if (event.partner_id) {
            const Notification = mongoose.model('Notification');
            await Notification.create({
                recipient_id: event.partner_id,
                recipient_type: 'partner',
                title: `✅ Event Approved: ${event.title}`,
                message: `Your event "${event.title}" has been approved and is now visible to the public.`,
                type: 'success',
                read: false,
                related_id: event._id,
                metadata: { event_id: event._id }
            });
        }
        
        res.json({
            success: true,
            message: 'Event approved successfully',
            event
        });
    } catch (error) {
        console.error('Approve event error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Reject partner event (admin)
app.put('/api/admin/partner/events/:id/reject', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { reason } = req.body;
        const event = await Event.findById(req.params.id);
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }
        
        event.approval_status = 'rejected';
        event.admin_notes = reason || 'Event rejected by administrator';
        await event.save();
        
        // Notify partner
        if (event.partner_id) {
            const Notification = mongoose.model('Notification');
            await Notification.create({
                recipient_id: event.partner_id,
                recipient_type: 'partner',
                title: `❌ Event Rejected: ${event.title}`,
                message: `Your event "${event.title}" was rejected. Reason: ${event.admin_notes}`,
                type: 'error',
                read: false,
                related_id: event._id,
                metadata: { event_id: event._id, reason: event.admin_notes }
            });
        }
        
        res.json({
            success: true,
            message: 'Event rejected',
            event
        });
    } catch (error) {
        console.error('Reject event error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Request changes for partner event (admin)
app.put('/api/admin/partner/events/:id/request-changes', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { changes } = req.body;
        const event = await Event.findById(req.params.id);
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }
        
        event.approval_status = 'changes_requested';
        event.requested_changes = changes || 'Changes requested by administrator';
        await event.save();
        
        // Notify partner
        if (event.partner_id) {
            const Notification = mongoose.model('Notification');
            await Notification.create({
                recipient_id: event.partner_id,
                recipient_type: 'partner',
                title: `📝 Changes Requested: ${event.title}`,
                message: `Please review and update your event "${event.title}". Requested changes: ${event.requested_changes}`,
                type: 'warning',
                read: false,
                related_id: event._id,
                metadata: { event_id: event._id, changes: event.requested_changes }
            });
        }
        
        res.json({
            success: true,
            message: 'Changes requested',
            event
        });
    } catch (error) {
        console.error('Request changes error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get single partner event (admin)
app.get('/api/admin/partner/events/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const event = await Event.findById(req.params.id);
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }
        res.json({ success: true, event });
    } catch (error) {
        console.error('Get event error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ADMIN PARTNER SESSIONS MANAGEMENT ROUTES
// ============================================

// Get all partner sessions (admin)
app.get('/api/admin/partner/sessions', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { status, search, page = 1, limit = 20 } = req.query;
        let query = {};
        
        if (status && status !== 'all') {
            query.status = status;
        }
        
        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { partner_name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } }
            ];
        }
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const [sessions, total] = await Promise.all([
            Session.find(query)
                .sort({ date: -1, time: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            Session.countDocuments(query)
        ]);
        
        res.json({
            success: true,
            sessions,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Get partner sessions error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Start session (admin)
app.put('/api/admin/partner/sessions/:id/start', authenticate, authorize('admin'), async (req, res) => {
    try {
        const session = await Session.findById(req.params.id);
        if (!session) {
            return res.status(404).json({ success: false, message: 'Session not found' });
        }
        
        session.status = 'live';
        await session.save();
        
        // Generate embed URL if not set
        let embedUrl = session.meeting_link;
        if (session.platform === 'zoom' && session.meeting_link.includes('zoom.us/j/')) {
            const match = session.meeting_link.match(/zoom\.us\/j\/(\d+)/);
            if (match) {
                embedUrl = `https://zoom.us/embed/${match[1]}`;
            }
        }
        
        // Notify partner
        if (session.partner_id) {
            const Notification = mongoose.model('Notification');
            await Notification.create({
                recipient_id: session.partner_id,
                recipient_type: 'partner',
                title: `🔴 Session Started: ${session.title}`,
                message: `Your session "${session.title}" is now live!`,
                type: 'success',
                read: false,
                related_id: session._id,
                metadata: { session_id: session._id }
            });
        }
        
        res.json({
            success: true,
            message: 'Session started',
            session: {
                ...session.toObject(),
                embed_url: embedUrl
            }
        });
    } catch (error) {
        console.error('Start session error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// End session (admin)
app.put('/api/admin/partner/sessions/:id/end', authenticate, authorize('admin'), async (req, res) => {
    try {
        const session = await Session.findById(req.params.id);
        if (!session) {
            return res.status(404).json({ success: false, message: 'Session not found' });
        }
        
        session.status = 'ended';
        await session.save();
        
        // Notify partner
        if (session.partner_id) {
            const Notification = mongoose.model('Notification');
            await Notification.create({
                recipient_id: session.partner_id,
                recipient_type: 'partner',
                title: `⏹️ Session Ended: ${session.title}`,
                message: `Your session "${session.title}" has ended.`,
                type: 'info',
                read: false,
                related_id: session._id,
                metadata: { session_id: session._id }
            });
        }
        
        res.json({
            success: true,
            message: 'Session ended'
        });
    } catch (error) {
        console.error('End session error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete session (admin)
app.delete('/api/admin/partner/sessions/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const session = await Session.findByIdAndDelete(req.params.id);
        if (!session) {
            return res.status(404).json({ success: false, message: 'Session not found' });
        }
        res.json({ success: true, message: 'Session deleted' });
    } catch (error) {
        console.error('Delete session error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});


// ============================================
// ADMIN PARTNER DOCUMENTS MANAGEMENT ROUTES
// ============================================

// Partner Document Schema (if not already defined)
const partnerDocumentSchema = new mongoose.Schema({
    partner_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', required: true },
    partner_name: { type: String, default: '' },
    name: { type: String, required: true },
    type: { type: String, enum: ['registration', 'certificate', 'proposal', 'agreement', 'presentation', 'financial', 'legal', 'other'], default: 'other' },
    file_url: { type: String, required: true },
    file_name: { type: String },
    file_size: { type: Number },
    mime_type: { type: String },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    admin_notes: { type: String, default: '' },
    version: { type: Number, default: 1 },
    version_history: [{
        version: Number,
        file_url: String,
        uploaded_at: Date,
        note: String
    }],
    uploaded_by: { type: String, enum: ['partner', 'admin'], default: 'partner' },
    uploaded_by_id: { type: mongoose.Schema.Types.ObjectId }
}, { timestamps: true });

// Check if model exists before creating
const PartnerDocument = mongoose.models.PartnerDocument || mongoose.model('PartnerDocument', partnerDocumentSchema);

// Get all partner documents (admin)
app.get('/api/admin/partner/documents', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { status, search, page = 1, limit = 20 } = req.query;
        let query = {};
        
        if (status && status !== 'all') {
            query.status = status;
        }
        
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { partner_name: { $regex: search, $options: 'i' } },
                { file_name: { $regex: search, $options: 'i' } }
            ];
        }
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const [documents, total] = await Promise.all([
            PartnerDocument.find(query)
                .populate('partner_id', 'organization_name email')
                .sort({ created_at: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            PartnerDocument.countDocuments(query)
        ]);
        
        res.json({
            success: true,
            documents,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Get partner documents error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Upload document for partner (admin)
app.post('/api/admin/partner/documents', authenticate, authorize('admin'), handleUpload(upload.single('document')), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        
        const { partner_id, name, type } = req.body;
        
        if (!partner_id || !name) {
            return res.status(400).json({ success: false, message: 'Partner ID and document name are required' });
        }
        
        // Verify partner exists
        const partner = await Partner.findById(partner_id);
        if (!partner) {
            return res.status(404).json({ success: false, message: 'Partner not found' });
        }
        
        const fileUrl = `/uploads/${req.file.filename}`;
        
        const document = new PartnerDocument({
            partner_id: partner_id,
            partner_name: partner.organization_name,
            name: name,
            type: type || 'other',
            file_url: fileUrl,
            file_name: req.file.originalname,
            file_size: req.file.size,
            mime_type: req.file.mimetype,
            status: 'pending',
            uploaded_by: 'admin',
            uploaded_by_id: req.user._id
        });
        
        await document.save();
        
        // Notify partner
        const Notification = mongoose.model('Notification');
        await Notification.create({
            recipient_id: partner_id,
            recipient_type: 'partner',
            title: `📄 New Document Uploaded: ${name}`,
            message: `An administrator has uploaded a new document "${name}" to your account. Please review it.`,
            type: 'info',
            read: false,
            related_id: document._id,
            metadata: { document_id: document._id }
        });
        
        res.status(201).json({
            success: true,
            message: 'Document uploaded successfully',
            document
        });
    } catch (error) {
        console.error('Upload partner document error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Approve partner document (admin)
app.put('/api/admin/partner/documents/:id/approve', authenticate, authorize('admin'), async (req, res) => {
    try {
        const document = await PartnerDocument.findById(req.params.id);
        if (!document) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }
        
        document.status = 'approved';
        await document.save();
        
        // Notify partner
        if (document.partner_id) {
            const Notification = mongoose.model('Notification');
            await Notification.create({
                recipient_id: document.partner_id,
                recipient_type: 'partner',
                title: `✅ Document Approved: ${document.name}`,
                message: `Your document "${document.name}" has been approved.`,
                type: 'success',
                read: false,
                related_id: document._id,
                metadata: { document_id: document._id }
            });
        }
        
        res.json({
            success: true,
            message: 'Document approved',
            document
        });
    } catch (error) {
        console.error('Approve document error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Reject partner document (admin)
app.put('/api/admin/partner/documents/:id/reject', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { reason } = req.body;
        const document = await PartnerDocument.findById(req.params.id);
        if (!document) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }
        
        document.status = 'rejected';
        document.admin_notes = reason || 'Document rejected by administrator';
        await document.save();
        
        // Notify partner
        if (document.partner_id) {
            const Notification = mongoose.model('Notification');
            await Notification.create({
                recipient_id: document.partner_id,
                recipient_type: 'partner',
                title: `❌ Document Rejected: ${document.name}`,
                message: `Your document "${document.name}" was rejected. Reason: ${document.admin_notes}`,
                type: 'error',
                read: false,
                related_id: document._id,
                metadata: { document_id: document._id, reason: document.admin_notes }
            });
        }
        
        res.json({
            success: true,
            message: 'Document rejected',
            document
        });
    } catch (error) {
        console.error('Reject document error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// View partner document (admin)
app.get('/api/admin/partner/documents/:id/view', authenticate, authorize('admin'), async (req, res) => {
    try {
        const document = await PartnerDocument.findById(req.params.id);
        if (!document) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }
        
        const fileName = path.basename(document.file_url);
        const filePath = path.join(uploadDir, fileName);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }
        
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
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `inline; filename="${document.name}${ext}"`);
        res.sendFile(filePath);
        
    } catch (error) {
        console.error('View document error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Download partner document (admin)
app.get('/api/admin/partner/documents/:id/download', authenticate, authorize('admin'), async (req, res) => {
    try {
        const document = await PartnerDocument.findById(req.params.id);
        if (!document) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }
        
        const fileName = path.basename(document.file_url);
        const filePath = path.join(uploadDir, fileName);
        
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }
        
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
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${document.name}${ext}"`);
        res.sendFile(filePath);
        
    } catch (error) {
        console.error('Download document error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete partner document (admin)
app.delete('/api/admin/partner/documents/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const document = await PartnerDocument.findByIdAndDelete(req.params.id);
        if (!document) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }
        
        // Delete file from filesystem
        const fileName = path.basename(document.file_url);
        const filePath = path.join(uploadDir, fileName);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
        
        res.json({ success: true, message: 'Document deleted' });
    } catch (error) {
        console.error('Delete document error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// BUSINESS DASHBOARD - EVENTS & SESSIONS
// ============================================

// Get approved events for businesses
app.get('/api/business/events', authenticate, authorize('business'), async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const query = {
            approval_status: 'approved',
            status: 'published'
        };
        
        const [events, total] = await Promise.all([
            Event.find(query)
                .sort({ start_date: 1 })
                .skip(skip)
                .limit(parseInt(limit)),
            Event.countDocuments(query)
        ]);
        
        res.json({
            success: true,
            events,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Get business events error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get single event details (business)
app.get('/api/business/events/:id', authenticate, authorize('business'), async (req, res) => {
    try {
        const event = await Event.findOne({
            _id: req.params.id,
            approval_status: 'approved',
            status: 'published'
        });
        
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }
        
        res.json({ success: true, event });
    } catch (error) {
        console.error('Get event error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Register for event (business)
app.post('/api/business/events/:id/register', authenticate, authorize('business'), async (req, res) => {
    try {
        const event = await Event.findOne({
            _id: req.params.id,
            approval_status: 'approved',
            status: 'published'
        });
        
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }
        
        // Check if already registered (using attendees count or separate registration tracking)
        // For now, just increment attendees
        event.attendees = (event.attendees || 0) + 1;
        await event.save();
        
        // Create notification for business
        const Notification = mongoose.model('Notification');
        await Notification.create({
            recipient_id: req.user._id,
            recipient_type: 'business',
            title: `✅ Registered for Event: ${event.title}`,
            message: `You have successfully registered for "${event.title}". Check your email for details.`,
            type: 'success',
            read: false,
            related_id: event._id,
            metadata: { event_id: event._id }
        });
        
        res.json({
            success: true,
            message: 'Registration successful!',
            event
        });
    } catch (error) {
        console.error('Register for event error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get live sessions for businesses
app.get('/api/business/sessions', authenticate, authorize('business'), async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const now = new Date();
        const query = {
            status: { $in: ['scheduled', 'live'] },
            visibility: 'public'
        };
        
        const [sessions, total] = await Promise.all([
            Session.find(query)
                .sort({ date: 1, time: 1 })
                .skip(skip)
                .limit(parseInt(limit)),
            Session.countDocuments(query)
        ]);
        
        res.json({
            success: true,
            sessions,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Get business sessions error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get single session (business)
app.get('/api/business/sessions/:id', authenticate, authorize('business'), async (req, res) => {
    try {
        const session = await Session.findOne({
            _id: req.params.id,
            status: { $in: ['scheduled', 'live'] }
        });
        
        if (!session) {
            return res.status(404).json({ success: false, message: 'Session not found' });
        }
        
        // Generate embed URL if available
        let embedUrl = null;
        if (session.is_embedded && session.status === 'live') {
            embedUrl = session.meeting_link;
            if (session.platform === 'zoom' && session.meeting_link.includes('zoom.us/j/')) {
                const match = session.meeting_link.match(/zoom\.us\/j\/(\d+)/);
                if (match) {
                    embedUrl = `https://zoom.us/embed/${match[1]}`;
                }
            }
        }
        
        res.json({
            success: true,
            session: {
                ...session.toObject(),
                embed_url: embedUrl
            }
        });
    } catch (error) {
        console.error('Get session error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Join session (business)
app.post('/api/business/sessions/:id/join', authenticate, authorize('business'), async (req, res) => {
    try {
        const session = await Session.findOne({
            _id: req.params.id,
            status: 'live'
        });
        
        if (!session) {
            return res.status(404).json({ success: false, message: 'Session not found or not live' });
        }
        
        // Increment attendees
        session.attendees = (session.attendees || 0) + 1;
        await session.save();
        
        let embedUrl = session.meeting_link;
        if (session.is_embedded && session.platform === 'zoom' && session.meeting_link.includes('zoom.us/j/')) {
            const match = session.meeting_link.match(/zoom\.us\/j\/(\d+)/);
            if (match) {
                embedUrl = `https://zoom.us/embed/${match[1]}`;
            }
        }
        
        res.json({
            success: true,
            session: {
                ...session.toObject(),
                embed_url: embedUrl
            }
        });
    } catch (error) {
        console.error('Join session error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ADMIN PARTNER MESSAGES MANAGEMENT ROUTES
// ============================================

// Get all partner message threads (admin)
app.get('/api/admin/partner/messages/threads', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { status = 'active', search = '', page = 1, limit = 20 } = req.query;
        let query = { status: status };
        
        if (search) {
            query.subject = { $regex: search, $options: 'i' };
        }
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const threads = await MessageThread.find(query)
            .sort({ last_message_at: -1 })
            .skip(skip)
            .limit(parseInt(limit));
        
        const total = await MessageThread.countDocuments(query);
        
        // Get unread count for admin
        const adminId = req.user._id;
        const threadsWithUnread = await Promise.all(threads.map(async (thread) => {
            const unreadCount = await Message.countDocuments({
                thread_id: thread._id,
                'read_by.user_id': { $ne: adminId }
            });
            return {
                ...thread.toObject(),
                unread_count: unreadCount
            };
        }));
        
        res.json({
            success: true,
            threads: threadsWithUnread,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Get admin threads error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get messages in a thread (admin)
app.get('/api/admin/partner/messages/thread/:threadId', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { threadId } = req.params;
        
        const thread = await MessageThread.findById(threadId);
        if (!thread) {
            return res.status(404).json({ success: false, message: 'Thread not found' });
        }
        
        const messages = await Message.find({ thread_id: threadId })
            .sort({ created_at: 1 });
        
        // Mark messages as read for admin
        await Message.updateMany(
            { 
                thread_id: threadId,
                'read_by.user_id': { $ne: req.user._id }
            },
            { 
                $push: { 
                    read_by: { 
                        user_id: req.user._id, 
                        user_type: 'admin',
                        read_at: new Date()
                    } 
                } 
            }
        );
        
        // Reset unread count for admin
        thread.unread_count.admin = 0;
        await thread.save();
        
        res.json({
            success: true,
            thread: {
                _id: thread._id,
                subject: thread.subject,
                participants: thread.participants
            },
            messages: messages.map(m => ({
                _id: m._id,
                sender_id: m.sender_id,
                sender_type: m.sender_type,
                sender_name: m.sender_name,
                content: m.content,
                priority: m.priority,
                created_at: m.created_at,
                is_read: m.read_by.some(r => r.user_id.toString() === req.user._id.toString())
            }))
        });
    } catch (error) {
        console.error('Get admin thread messages error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Reply to thread (admin)
app.post('/api/admin/partner/messages/thread/:threadId/reply', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { threadId } = req.params;
        const { content } = req.body;
        
        if (!content) {
            return res.status(400).json({ success: false, message: 'Message content is required' });
        }
        
        const thread = await MessageThread.findById(threadId);
        if (!thread) {
            return res.status(404).json({ success: false, message: 'Thread not found' });
        }
        
        // Create message
        const message = new Message({
            thread_id: threadId,
            sender_id: req.user._id,
            sender_type: 'admin',
            sender_name: req.user.name || 'Administrator',
            content: content,
            read_by: [{ user_id: req.user._id, user_type: 'admin', read_at: new Date() }]
        });
        
        await message.save();
        
        // Update thread
        thread.last_message_at = new Date();
        thread.last_message_preview = content.substring(0, 100);
        thread.unread_count.partner = (thread.unread_count.partner || 0) + 1;
        await thread.save();
        
        // Find partner in thread
        const partnerParticipant = thread.participants.find(p => p.user_type === 'partner');
        if (partnerParticipant) {
            // Create notification for partner
            const Notification = mongoose.model('Notification');
            await Notification.create({
                recipient_id: partnerParticipant.user_id,
                recipient_type: 'partner',
                title: `New Reply from Admin: ${thread.subject}`,
                message: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
                type: 'info',
                read: false,
                related_id: thread._id,
                metadata: {
                    message_id: message._id,
                    thread_id: thread._id
                }
            });
        }
        
        res.json({
            success: true,
            message: 'Reply sent',
            data: {
                _id: message._id,
                sender_name: message.sender_name,
                content: message.content,
                created_at: message.created_at
            }
        });
    } catch (error) {
        console.error('Admin reply error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete thread (admin)
app.delete('/api/admin/partner/messages/thread/:threadId', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { threadId } = req.params;
        
        const thread = await MessageThread.findById(threadId);
        if (!thread) {
            return res.status(404).json({ success: false, message: 'Thread not found' });
        }
        
        // Delete all messages in thread
        await Message.deleteMany({ thread_id: threadId });
        
        // Delete thread
        await thread.deleteOne();
        
        res.json({ success: true, message: 'Thread deleted' });
    } catch (error) {
        console.error('Delete thread error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Archive thread (admin)
app.put('/api/admin/partner/messages/thread/:threadId/archive', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { threadId } = req.params;
        
        const thread = await MessageThread.findById(threadId);
        if (!thread) {
            return res.status(404).json({ success: false, message: 'Thread not found' });
        }
        
        thread.status = 'archived';
        await thread.save();
        
        res.json({ success: true, message: 'Thread archived' });
    } catch (error) {
        console.error('Archive thread error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// ADMIN PARTNER NOTIFICATIONS MANAGEMENT ROUTES
// ============================================

// Get all partner notifications (admin)
app.get('/api/admin/partner/notifications', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { status = 'all', search = '', page = 1, limit = 20 } = req.query;
        let query = { recipient_type: 'partner' };
        
        if (status === 'unread') {
            query.read = false;
        } else if (status === 'archived') {
            query.archived = true;
        }
        
        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { message: { $regex: search, $options: 'i' } }
            ];
        }
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const notifications = await Notification.find(query)
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .populate('recipient_id', 'organization_name email');
        
        const total = await Notification.countDocuments(query);
        
        res.json({
            success: true,
            notifications,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Get admin notifications error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create notification for partner (admin)
app.post('/api/admin/partner/notifications', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { 
            partner_id, 
            title, 
            message, 
            type = 'info', 
            priority = 'medium',
            scheduled_for = null
        } = req.body;
        
        if (!partner_id || !title || !message) {
            return res.status(400).json({ success: false, message: 'Partner ID, Title, and Message are required' });
        }
        
        // Verify partner exists
        const partner = await Partner.findById(partner_id);
        if (!partner) {
            return res.status(404).json({ success: false, message: 'Partner not found' });
        }
        
        const notification = new Notification({
            recipient_id: partner_id,
            recipient_type: 'partner',
            title,
            message,
            type,
            priority: priority || 'medium',
            read: false,
            scheduled_for: scheduled_for ? new Date(scheduled_for) : null,
            sent_at: scheduled_for ? null : new Date()
        });
        
        await notification.save();
        
        res.status(201).json({
            success: true,
            notification
        });
    } catch (error) {
        console.error('Create notification error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create notification for ALL partners (admin)
app.post('/api/admin/partner/notifications/all', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { title, message, type = 'info', priority = 'medium' } = req.body;
        
        if (!title || !message) {
            return res.status(400).json({ success: false, message: 'Title and Message are required' });
        }
        
        // Get all active partners
        const partners = await Partner.find({ status: 'active' }).select('_id organization_name');
        
        if (partners.length === 0) {
            return res.status(404).json({ success: false, message: 'No active partners found' });
        }
        
        const notifications = await Promise.all(partners.map(async (partner) => {
            const notification = new Notification({
                recipient_id: partner._id,
                recipient_type: 'partner',
                title,
                message,
                type,
                priority: priority || 'medium',
                read: false,
                sent_at: new Date()
            });
            return await notification.save();
        }));
        
        res.status(201).json({
            success: true,
            message: `Notification sent to ${notifications.length} partners`,
            count: notifications.length
        });
    } catch (error) {
        console.error('Create bulk notification error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update notification (admin)
app.put('/api/admin/partner/notifications/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const { title, message, type, priority, scheduled_for } = req.body;
        
        const notification = await Notification.findById(id);
        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }
        
        if (title) notification.title = title;
        if (message) notification.message = message;
        if (type) notification.type = type;
        if (priority) notification.priority = priority;
        if (scheduled_for !== undefined) notification.scheduled_for = scheduled_for ? new Date(scheduled_for) : null;
        
        await notification.save();
        
        res.json({ success: true, notification });
    } catch (error) {
        console.error('Update notification error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete notification (admin)
app.delete('/api/admin/partner/notifications/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { id } = req.params;
        const notification = await Notification.findByIdAndDelete(id);
        
        if (!notification) {
            return res.status(404).json({ success: false, message: 'Notification not found' });
        }
        
        res.json({ success: true, message: 'Notification deleted' });
    } catch (error) {
        console.error('Delete notification error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============ ENHANCED PARTNER MESSAGES ROUTES ============

// Get all message threads for partner
app.get('/api/partner/messages/threads', authenticate, authorize('partner'), async (req, res) => {
    try {
        const threads = await MessageThread.find({
            'participants.user_id': req.user._id,
            'participants.user_type': 'partner',
            status: 'active'
        }).sort({ last_message_at: -1 });
        
        res.json({
            success: true,
            threads: threads.map(t => ({
                _id: t._id,
                subject: t.subject,
                last_message_at: t.last_message_at,
                last_message_preview: t.last_message_preview,
                unread_count: t.unread_count?.partner || 0,
                participants: t.participants
            }))
        });
    } catch (error) {
        console.error('Get threads error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get messages in a thread
app.get('/api/partner/messages/thread/:threadId', authenticate, authorize('partner'), async (req, res) => {
    try {
        const { threadId } = req.params;
        
        // Verify partner is in the thread
        const thread = await MessageThread.findOne({
            _id: threadId,
            'participants.user_id': req.user._id,
            'participants.user_type': 'partner'
        });
        
        if (!thread) {
            return res.status(404).json({ success: false, message: 'Thread not found' });
        }
        
        const messages = await Message.find({ thread_id: threadId })
            .sort({ created_at: 1 });
        
        // Mark messages as read for partner
        await Message.updateMany(
            { 
                thread_id: threadId,
                'read_by.user_id': { $ne: req.user._id }
            },
            { 
                $push: { 
                    read_by: { 
                        user_id: req.user._id, 
                        user_type: 'partner',
                        read_at: new Date()
                    } 
                }
            }
        );
        
        // Reset unread count for partner
        thread.unread_count.partner = 0;
        await thread.save();
        
        res.json({
            success: true,
            thread: {
                _id: thread._id,
                subject: thread.subject
            },
            messages: messages.map(m => ({
                _id: m._id,
                sender_id: m.sender_id,
                sender_type: m.sender_type,
                sender_name: m.sender_name,
                content: m.content,
                priority: m.priority,
                created_at: m.created_at,
                is_read: m.read_by.some(r => r.user_id.toString() === req.user._id.toString())
            }))
        });
    } catch (error) {
        console.error('Get thread messages error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create new message thread
app.post('/api/partner/messages/thread', authenticate, authorize('partner'), async (req, res) => {
    try {
        const { subject, content, priority } = req.body;
        
        if (!subject || !content) {
            return res.status(400).json({ success: false, message: 'Subject and content are required' });
        }
        
        // Get admin users
        const admins = await Admin.find().select('_id name email');
        if (admins.length === 0) {
            return res.status(404).json({ success: false, message: 'No admin users found' });
        }
        
        // Create thread
        const thread = new MessageThread({
            participants: [
                { 
                    user_id: req.user._id, 
                    user_type: 'partner',
                    name: req.user.organization_name
                },
                ...admins.map(admin => ({
                    user_id: admin._id,
                    user_type: 'admin',
                    name: admin.name
                }))
            ],
            subject: subject,
            last_message_preview: content.substring(0, 100)
        });
        
        await thread.save();
        
        // Create first message
        const message = new Message({
            thread_id: thread._id,
            sender_id: req.user._id,
            sender_type: 'partner',
            sender_name: req.user.organization_name,
            content: content,
            priority: priority || 'normal',
            read_by: [{ user_id: req.user._id, user_type: 'partner', read_at: new Date() }]
        });
        
        await message.save();
        
        // Set unread for admins
        thread.unread_count.admin = 1;
        await thread.save();
        
        // Create notifications for admins
        for (const admin of admins) {
            const Notification = mongoose.model('Notification');
            await Notification.create({
                recipient_id: admin._id,
                recipient_type: 'admin',
                title: `New Message from Partner: ${req.user.organization_name}`,
                message: `${subject}: ${content.substring(0, 100)}...`,
                type: 'info',
                read: false,
                related_id: thread._id,
                metadata: {
                    message_id: message._id,
                    thread_id: thread._id
                }
            });
        }
        
        res.status(201).json({
            success: true,
            message: 'Message sent successfully',
            thread: {
                _id: thread._id,
                subject: thread.subject
            }
        });
    } catch (error) {
        console.error('Create thread error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Send message in existing thread
app.post('/api/partner/messages/thread/:threadId', authenticate, authorize('partner'), async (req, res) => {
    try {
        const { threadId } = req.params;
        const { content } = req.body;
        
        if (!content) {
            return res.status(400).json({ success: false, message: 'Message content is required' });
        }
        
        // Verify thread exists and partner is in it
        const thread = await MessageThread.findOne({
            _id: threadId,
            'participants.user_id': req.user._id,
            'participants.user_type': 'partner'
        });
        
        if (!thread) {
            return res.status(404).json({ success: false, message: 'Thread not found' });
        }
        
        // Create message
        const message = new Message({
            thread_id: threadId,
            sender_id: req.user._id,
            sender_type: 'partner',
            sender_name: req.user.organization_name,
            content: content,
            read_by: [{ user_id: req.user._id, user_type: 'partner', read_at: new Date() }]
        });
        
        await message.save();
        
        // Update thread
        thread.last_message_at = new Date();
        thread.last_message_preview = content.substring(0, 100);
        thread.unread_count.admin = (thread.unread_count.admin || 0) + 1;
        await thread.save();
        
        // Notify admins
        const admins = await Admin.find().select('_id');
        for (const admin of admins) {
            const Notification = mongoose.model('Notification');
            await Notification.create({
                recipient_id: admin._id,
                recipient_type: 'admin',
                title: `New Message from Partner: ${req.user.organization_name}`,
                message: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
                type: 'info',
                read: false,
                related_id: thread._id,
                metadata: {
                    message_id: message._id,
                    thread_id: thread._id
                }
            });
        }
        
        res.json({
            success: true,
            message: 'Message sent',
            data: {
                _id: message._id,
                sender_name: message.sender_name,
                content: message.content,
                created_at: message.created_at
            }
        });
    } catch (error) {
        console.error('Send message error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Mark message as read (legacy support)
app.post('/api/partner/messages/:id/read', authenticate, authorize('partner'), async (req, res) => {
    try {
        const { id } = req.params;
        
        // Find the message and its thread
        const message = await Message.findById(id);
        if (!message) {
            return res.status(404).json({ success: false, message: 'Message not found' });
        }
        
        // Check if already read by partner
        const alreadyRead = message.read_by.some(r => 
            r.user_id.toString() === req.user._id.toString() && 
            r.user_type === 'partner'
        );
        
        if (!alreadyRead) {
            message.read_by.push({
                user_id: req.user._id,
                user_type: 'partner',
                read_at: new Date()
            });
            await message.save();
        }
        
        // Update thread unread count
        const thread = await MessageThread.findById(message.thread_id);
        if (thread) {
            const unreadMessages = await Message.countDocuments({
                thread_id: thread._id,
                'read_by.user_id': { $ne: req.user._id }
            });
            if (thread.unread_count) {
                thread.unread_count.partner = unreadMessages;
                await thread.save();
            }
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Mark message read error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

console.log('✅ Judge Management System Ready');



// ============================================
// AI BUSINESS ASSISTANT - BACKEND IMPLEMENTATION
// ============================================

// AI Usage Tracking Schema
const aiUsageSchema = new mongoose.Schema({
    business_id: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessUser', required: true },
    feature: { type: String, enum: ['chat', 'business_plan', 'proposal', 'idea_analyzer', 'marketing', 'grant_support'], required: true },
    tokens_used: { type: Number, default: 0 },
    cost: { type: Number, default: 0 },
    timestamp: { type: Date, default: Date.now }
});

// Saved AI Documents Schema
const aiDocumentSchema = new mongoose.Schema({
    business_id: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessUser', required: true },
    title: { type: String, required: true },
    type: { type: String, enum: ['business_plan', 'proposal', 'marketing', 'analysis', 'chat'], required: true },
    content: { type: String, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    is_favorite: { type: Boolean, default: false },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

// Business AI Settings Schema
const businessAISettingsSchema = new mongoose.Schema({
    business_id: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessUser', required: true, unique: true },
    plan: { type: String, enum: ['free', 'premium'], default: 'free' },
    daily_limit: { type: Number, default: 10 },
    monthly_limit: { type: Number, default: 100 },
    current_month_usage: { type: Number, default: 0 },
    current_day_usage: { type: Number, default: 0 },
    last_reset_day: { type: String }, // YYYY-MM-DD
    last_reset_month: { type: String }, // YYYY-MM
    upgraded_at: { type: Date },
    upgraded_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }
});

const AIUsage = mongoose.model('AIUsage', aiUsageSchema);
const AIDocument = mongoose.model('AIDocument', aiDocumentSchema);
const BusinessAISettings = mongoose.model('BusinessAISettings', businessAISettingsSchema);

// ============ AI SYSTEM PROMPT ============
const AI_SYSTEM_PROMPT = `You are the Liberia Business Awards AI Business Assistant.

**ABOUT YOUR KNOWLEDGE:** You have access to REAL-TIME WEB SEARCH for current information! When the user asks about current events, business leaders, recent news, or time-sensitive information, you will receive search results to answer accurately.

Your role is to help Liberian businesses, startups, entrepreneurs, SMEs, and founders improve their businesses through strategic guidance, proposal writing, branding support, business planning, funding preparation, growth strategy, and entrepreneurial education.

Your tone should be professional, practical, growth-oriented, and supportive.

Focus on:
• African business environments
• Liberian entrepreneurship
• SME development
• Startup growth
• Funding readiness
• Branding and visibility

Always provide structured and actionable responses. Use clear headings, bullet points, and practical advice.

**For current information questions:** Use the provided search results to answer accurately. Always cite your sources. If search results don't contain the answer, honestly inform the user and suggest official sources.`;

// ============ AI HELPER FUNCTIONS ============
async function checkAIAccess(businessId, feature) {
    const settings = await BusinessAISettings.findOne({ business_id: businessId });
    
    if (!settings || settings.plan === 'free') {
        const today = new Date().toISOString().split('T')[0];
        const thisMonth = new Date().toISOString().slice(0, 7);
        
        let usage = await AIUsage.countDocuments({
            business_id: businessId,
            timestamp: {
                $gte: new Date(new Date().setHours(0, 0, 0, 0))
            }
        });
        
        if (usage >= 10) {
            return { allowed: false, reason: 'Daily limit reached. Upgrade to premium for unlimited access.' };
        }
        
        const monthlyUsage = await AIUsage.countDocuments({
            business_id: businessId,
            timestamp: {
                $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
            }
        });
        
        if (monthlyUsage >= 100) {
            return { allowed: false, reason: 'Monthly limit reached. Upgrade to premium for unlimited access.' };
        }
    }
    
    return { allowed: true };
}

async function trackAIUsage(businessId, feature, tokensUsed = 0) {
    const usage = new AIUsage({
        business_id: businessId,
        feature,
        tokens_used: tokensUsed,
        cost: tokensUsed * 0.000001 // Approximate cost per token
    });
    await usage.save();
    
    // Update daily/monthly counts
    const settings = await BusinessAISettings.findOne({ business_id: businessId });
    if (settings) {
        const today = new Date().toISOString().split('T')[0];
        const thisMonth = new Date().toISOString().slice(0, 7);
        
        if (settings.last_reset_day !== today) {
            settings.current_day_usage = 0;
            settings.last_reset_day = today;
        }
        if (settings.last_reset_month !== thisMonth) {
            settings.current_month_usage = 0;
            settings.last_reset_month = thisMonth;
        }
        
        settings.current_day_usage++;
        settings.current_month_usage++;
        await settings.save();
    }
}

// ============ WEB SEARCH FUNCTION FOR REAL-TIME ANSWERS ============
async function searchWeb(query) {
    const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
    
    if (!TAVILY_API_KEY) {
        console.log('⚠️ TAVILY_API_KEY not set - web search disabled');
        return [];
    }
    
    try {
        const response = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                api_key: TAVILY_API_KEY,
                query: query,
                search_depth: 'basic',
                max_results: 5,
                include_answer: true,
                include_raw_content: false
            })
        });
        
        const data = await response.json();
        
        if (data.results && data.results.length > 0) {
            console.log(`🔍 Web search for "${query}" returned ${data.results.length} results`);
            return data.results;
        }
        
        return [];
        
    } catch (error) {
        console.error('❌ Web search error:', error.message);
        return [];
    }
}

// Function to check if user is asking for current/real-time information
function needsCurrentInfo(query) {
    const currentKeywords = [
        'current', 'now', 'today', 'latest', 'recent', 'this year', 'this month',
        'who is', 'ceo of', 'president of', 'leader of', 'director of',
        'what is the current', 'latest news', 'breaking', 'updated',
        // ADD THESE:
        'president', 'vice president', 'minister', 'government', 'official',
        'elected', 'appointed', 'serving', 'incumbent'
    ];
    
    const queryLower = query.toLowerCase();
    return currentKeywords.some(keyword => queryLower.includes(keyword));
}

// ============ ENHANCED AI ASSISTANT WITH WEB SEARCH ============
async function callAIAssistant(messages, feature) {
    try {
        // Get the user's latest message
        const userMessage = messages[messages.length - 1]?.content || '';
        const needsRealTime = needsCurrentInfo(userMessage);
        
        let searchContext = '';
        let searchResults = [];
        
        // Perform web search if user needs current information
        if (needsRealTime) {
            console.log(`🔍 Performing web search for: "${userMessage.substring(0, 100)}"`);
            searchResults = await searchWeb(userMessage);
            
            if (searchResults.length > 0) {
    const today = new Date().toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
    
    searchContext = `\n\n🔴 **IMPORTANT: REAL-TIME INFORMATION (${today})** 🔴\n\n`;
    searchContext += `The user is asking for CURRENT information. Use the following search results to answer accurately:\n\n`;
    
    searchResults.forEach((result, i) => {
        searchContext += `📌 **Source ${i + 1}**\n`;
        searchContext += `Content: ${result.content}\n`;
        searchContext += `URL: ${result.url}\n\n`;
    });
    
    // ADD THIS LINE - Prioritize text sources over PDFs
    searchContext += `⚠️ Prioritize text-based sources over PDF files when possible. If only PDF sources are available, still answer accurately but note that the source is a PDF document.\n`;
    
    searchContext += `⚠️ If the search results don't contain the answer, honestly say you couldn't find the information and suggest official sources.\n`;
    
} else {
    searchContext = `\n\n⚠️ **NOTE:** The user is asking about current information, but I couldn't find relevant search results. Inform them honestly and suggest checking official sources.\n`;
}
        }
        
        // Use OpenRouter
        const OpenAI = require('openai');
        
        const openrouterClient = new OpenAI({
            baseURL: 'https://openrouter.ai/api/v1',
            apiKey: process.env.OPENROUTER_API_KEY,
            defaultHeaders: {
                'HTTP-Referer': 'https://liberiabusinessawardslr.com',
                'X-Title': 'LBA Business Assistant'
            }
        });
        
        // Choose model
        const model = process.env.AI_MODEL || 'google/gemini-2.0-flash';
        
        // Build system prompt with search context
        let systemPrompt = AI_SYSTEM_PROMPT;
        if (searchContext) {
            systemPrompt += searchContext;
        } else {
            // Add a note about capabilities even without search
            systemPrompt += `\n\n**Note:** Your knowledge has a cutoff date. For current events or specific business leaders, inform the user if you're unsure and suggest official sources.`;
        }
        
        const completion = await openrouterClient.chat.completions.create({
            model: model,
            messages: [
                { role: 'system', content: systemPrompt },
                ...messages
            ],
            temperature: 0.7,
            max_tokens: 1000
        });
        
        return completion.choices[0].message.content;
        
    } catch (error) {
        console.error('AI Assistant Error:', error.message);
        
        // Handle insufficient credits error specifically
        if (error.message && error.message.includes('Insufficient credits')) {
            return `⚠️ **AI Service Temporarily Unavailable**

Our AI assistant is currently experiencing high demand. 

**What you can do:**
• Try again in a few minutes
• Contact support if the issue persists

We apologize for the inconvenience and appreciate your patience. The Liberia Business Awards team is working to restore full service.`;
        }
        
        // Handle other API errors
        if (error.status === 401 || error.message.includes('API key')) {
            return `⚠️ **AI Service Configuration Issue**

Our team has been notified. Please try again later or contact support for assistance.

Thank you for your understanding.`;
        }
        
        // Generic fallback
        return `⚠️ **Unable to Generate Content**

We're experiencing technical difficulties at the moment. 

**Please try:**
• Refreshing the page
• Trying again in a few minutes

If the problem continues, please contact our support team.

Thank you for your patience.`;
    }
}

// ============ AI ROUTES ============

// Get AI Settings & Usage
app.get('/api/ai/settings', authenticate, authorize('business'), async (req, res) => {
    try {
        let settings = await BusinessAISettings.findOne({ business_id: req.user._id });
        
        if (!settings) {
            settings = new BusinessAISettings({
                business_id: req.user._id,
                plan: 'free',
                daily_limit: 10,
                monthly_limit: 100
            });
            await settings.save();
        }
        
        const today = new Date().toISOString().split('T')[0];
        const thisMonth = new Date().toISOString().slice(0, 7);
        
        if (settings.last_reset_day !== today) {
            settings.current_day_usage = 0;
            settings.last_reset_day = today;
            await settings.save();
        }
        if (settings.last_reset_month !== thisMonth) {
            settings.current_month_usage = 0;
            settings.last_reset_month = thisMonth;
            await settings.save();
        }
        
        res.json({
            success: true,
            settings: {
                plan: settings.plan,
                daily_limit: settings.daily_limit,
                monthly_limit: settings.monthly_limit,
                used_today: settings.current_day_usage,
                used_this_month: settings.current_month_usage,
                remaining_today: Math.max(0, settings.daily_limit - settings.current_day_usage),
                remaining_this_month: Math.max(0, settings.monthly_limit - settings.current_month_usage)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Business Plan Generator
app.post('/api/ai/business-plan', authenticate, authorize('business'), async (req, res) => {
    try {
        const access = await checkAIAccess(req.user._id, 'business_plan');
if (!access.allowed) {
    return res.status(200).json({ 
        success: true, 
        content: `⚠️ **Daily Limit Reached**

You've used all your free AI requests for today.

**What you can do:**
• Try again tomorrow when your daily limit resets
• Contact us to upgrade to Premium for unlimited access

Thank you for your understanding!`
    });
}
        
        const { business_name, industry, target_market, description, revenue_model, goals } = req.body;
        
        if (!business_name || !industry || !target_market || !description) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }
        
        const prompt = `Generate a professional business plan for:
        
Business Name: ${business_name}
Industry: ${industry}
Target Market: ${target_market}
Description: ${description}
Revenue Model: ${revenue_model || 'Not specified'}
Goals: ${goals || 'Not specified'}

Provide the following sections:
1. Executive Summary
2. Market Analysis
3. Revenue Strategy
4. Operations Plan
5. Growth Strategy

Make it practical for a Liberian business context.`;
        
        const messages = [{ role: 'user', content: prompt }];
        let response;
try {
    response = await callAIAssistant(messages, 'business_plan');
} catch (error) {
    console.error('Business plan generation error:', error);
    response = `⚠️ **Unable to Generate Business Plan**

We're experiencing technical difficulties at the moment. 

**Please try:**
• Refreshing the page
• Trying again in a few minutes

If the problem continues, please contact our support team.

Thank you for your patience.`;
}
        
        await trackAIUsage(req.user._id, 'business_plan');
        
        res.json({
            success: true,
            content: response
        });
    } catch (error) {
        console.error('Business plan error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Proposal & Letter Writer
app.post('/api/ai/proposal', authenticate, authorize('business'), async (req, res) => {
    try {
        const access = await checkAIAccess(req.user._id, 'proposal');
if (!access.allowed) {
    return res.status(200).json({ 
        success: true, 
        content: `⚠️ **Daily Limit Reached**

You've used all your free AI requests for today.

Please try again tomorrow or upgrade to Premium for unlimited access.`
    });
}
        
        const { type, target, business_name, purpose, details } = req.body;
        
        if (!type || !target || !business_name || !purpose) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }
        
        const typeMap = {
            sponsorship: 'Sponsorship Proposal',
            partnership: 'Partnership Letter',
            funding: 'Funding Request',
            email: 'Business Email',
            investor: 'Investor Introduction'
        };
        
        const prompt = `Write a professional ${typeMap[type] || 'Business Proposal'} from ${business_name}.
        
Target Audience: ${target}
Purpose: ${purpose}
Additional Details: ${details || 'Not provided'}

Requirements:
- Professional tone
- Clear value proposition
- Call to action
- Follow LBA branding style for Liberian businesses`;

        const messages = [{ role: 'user', content: prompt }];
        let response;
try {
    response = await callAIAssistant(messages, 'proposal');
} catch (error) {
    console.error('Proposal generation error:', error);
    response = `⚠️ **Unable to Generate Proposal**

We're experiencing technical difficulties at the moment. 

**Please try:**
• Refreshing the page
• Trying again in a few minutes

If the problem continues, please contact our support team.

Thank you for your patience.`;
}
        
        await trackAIUsage(req.user._id, 'proposal');
        
        res.json({
            success: true,
            content: response
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Business Idea Analyzer
app.post('/api/ai/analyze-idea', authenticate, authorize('business'), async (req, res) => {
    try {
        const access = await checkAIAccess(req.user._id, 'idea_analyzer');
if (!access.allowed) {
    return res.status(200).json({ 
        success: true, 
        content: `⚠️ **Daily Limit Reached**

You've reached your daily limit for AI analyses.

Your limit will reset tomorrow. Upgrade to Premium for unlimited access!`
    });
}
        
        const { idea, industry, market } = req.body;
        
        if (!idea) {
            return res.status(400).json({ success: false, message: 'Business idea is required' });
        }
        
        const prompt = `Analyze this business idea for the Liberian/African market:

Idea: ${idea}
Industry: ${industry || 'Not specified'}
Target Market: ${market || 'Liberian market'}

Provide a structured analysis with:
1. Strengths (SWOT - Strengths)
2. Weaknesses (SWOT - Weaknesses)
3. Opportunities
4. Threats/Risks
5. Practical Improvement Suggestions

Keep it actionable and relevant to the Liberian business environment.`;

        const messages = [{ role: 'user', content: prompt }];
        let response;
try {
    response = await callAIAssistant(messages, 'idea_analyzer');
} catch (error) {
    console.error('Idea analyzer error:', error);
    response = `⚠️ **Unable to Analyze Idea**

We're experiencing technical difficulties at the moment. 

**Please try:**
• Refreshing the page
• Trying again in a few minutes

If the problem continues, please contact our support team.

Thank you for your patience.`;
}
        
        await trackAIUsage(req.user._id, 'idea_analyzer');
        
        res.json({
            success: true,
            content: response
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Marketing Assistant
app.post('/api/ai/marketing', authenticate, authorize('business'), async (req, res) => {
    try {
        const access = await checkAIAccess(req.user._id, 'marketing');
if (!access.allowed) {
    return res.status(200).json({ 
        success: true, 
        content: `⚠️ **Daily Limit Reached**

You've used all your free AI marketing generations for today.

Try again tomorrow or upgrade to Premium!`
    });
}
        
        const { type, business_name, product, target_audience, tone } = req.body;
        
        if (!type || !business_name || !product) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }
        
        const typeMap = {
            captions: 'Social Media Captions',
            ad_copy: 'Ad Copy',
            campaign: 'Campaign Ideas',
            slogan: 'Brand Slogans',
            strategy: 'Marketing Strategy'
        };
        
        const prompt = `Generate ${typeMap[type]} for ${business_name}.

Product/Service: ${product}
Target Audience: ${target_audience || 'Liberian consumers'}
Tone: ${tone || 'Professional yet engaging'}

Provide 3-5 high-quality options that would resonate with the Liberian market.`;

        const messages = [{ role: 'user', content: prompt }];
        let response;
try {
    response = await callAIAssistant(messages, 'marketing');
} catch (error) {
    console.error('Marketing generation error:', error);
    response = `⚠️ **Unable to Generate Marketing Content**

We're experiencing technical difficulties at the moment. 

**Please try:**
• Refreshing the page
• Trying again in a few minutes

If the problem continues, please contact our support team.

Thank you for your patience.`;
}
        
        await trackAIUsage(req.user._id, 'marketing');
        
        res.json({
            success: true,
            content: response
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Grant & Opportunity Support
app.post('/api/ai/grant-support', authenticate, authorize('business'), async (req, res) => {
    try {
        const access = await checkAIAccess(req.user._id, 'grant_support');
if (!access.allowed) {
    return res.status(200).json({ 
        success: true, 
        content: `⚠️ **Daily Limit Reached**

You've reached your daily limit for grant support requests.

Please try again tomorrow or contact us to upgrade to Premium.`
    });
}
        
        const { type, business_name, project, impact, details } = req.body;
        
        if (!type || !business_name || !project) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }
        
        const typeMap = {
            grant_response: 'Grant Application Response',
            project_summary: 'Project Summary',
            impact_statement: 'Impact Statement',
            proposal: 'Grant Proposal Section'
        };
        
        const prompt = `Help draft a ${typeMap[type]} for a grant application.

Organization: ${business_name}
Project: ${project}
Expected Impact: ${impact || 'Not specified'}
Additional Details: ${details || 'Not provided'}

Focus on:
- Clear articulation of need
- Measurable outcomes
- Sustainability
- Alignment with development goals in Liberia`;

        const messages = [{ role: 'user', content: prompt }];
        let response;
try {
    response = await callAIAssistant(messages, 'grant_support');
} catch (error) {
    console.error('Grant support error:', error);
    response = `⚠️ **Unable to Generate Grant Support**

We're experiencing technical difficulties at the moment. 

**Please try:**
• Refreshing the page
• Trying again in a few minutes

If the problem continues, please contact our support team.

Thank you for your patience.`;
}
        
        await trackAIUsage(req.user._id, 'grant_support');
        
        res.json({
            success: true,
            content: response
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Open Chat
app.post('/api/ai/chat', authenticate, authorize('business'), async (req, res) => {
    try {
        const access = await checkAIAccess(req.user._id, 'chat');
if (!access.allowed) {
    return res.status(200).json({ 
        success: true, 
        content: `⚠️ **Daily Limit Reached**

You've used all your free AI chat messages for today.

**What you can do:**
• Try again tomorrow (your limit resets daily)
• Upgrade to Premium for unlimited chat access

Thank you for using LBA AI Business Assistant!`
    });
}
        
        const { message, history = [] } = req.body;
        
        if (!message) {
            return res.status(400).json({ success: false, message: 'Message is required' });
        }
        
        const messages = [
            ...history,
            { role: 'user', content: message }
        ];
        
        let response;
try {
    response = await callAIAssistant(messages, 'chat');
} catch (error) {
    console.error('Chat error:', error);
    response = `⚠️ **Unable to Process Your Request**

We're experiencing technical difficulties at the moment. 

**Please try:**
• Refreshing the page
• Trying again in a few minutes

If the problem continues, please contact our support team.

Thank you for your patience.`;
}
        
        await trackAIUsage(req.user._id, 'chat');
        
        res.json({
            success: true,
            content: response
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Save AI Document
app.post('/api/ai/documents', authenticate, authorize('business'), async (req, res) => {
    try {
        const { title, type, content, metadata } = req.body;
        
        if (!title || !type || !content) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }
        
        const document = new AIDocument({
            business_id: req.user._id,
            title,
            type,
            content,
            metadata: metadata || {}
        });
        
        await document.save();
        
        res.json({
            success: true,
            document: {
                _id: document._id,
                title: document.title,
                type: document.type,
                created_at: document.created_at
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get AI Documents
app.get('/api/ai/documents', authenticate, authorize('business'), async (req, res) => {
    try {
        const { type, limit = 50 } = req.query;
        let query = { business_id: req.user._id };
        
        if (type && type !== 'all') {
            query.type = type;
        }
        
        const documents = await AIDocument.find(query)
            .sort({ updated_at: -1 })
            .limit(parseInt(limit));
        
        res.json({
            success: true,
            documents: documents.map(d => ({
                _id: d._id,
                title: d.title,
                type: d.type,
                content: d.content.substring(0, 200),
                is_favorite: d.is_favorite,
                created_at: d.created_at,
                updated_at: d.updated_at
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get Single Document
app.get('/api/ai/documents/:id', authenticate, authorize('business'), async (req, res) => {
    try {
        const document = await AIDocument.findOne({
            _id: req.params.id,
            business_id: req.user._id
        });
        
        if (!document) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }
        
        res.json({
            success: true,
            document
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update Document
app.put('/api/ai/documents/:id', authenticate, authorize('business'), async (req, res) => {
    try {
        const { title, content, is_favorite } = req.body;
        
        const document = await AIDocument.findOne({
            _id: req.params.id,
            business_id: req.user._id
        });
        
        if (!document) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }
        
        if (title) document.title = title;
        if (content) document.content = content;
        if (is_favorite !== undefined) document.is_favorite = is_favorite;
        document.updated_at = new Date();
        
        await document.save();
        
        res.json({
            success: true,
            message: 'Document updated'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete Document
app.delete('/api/ai/documents/:id', authenticate, authorize('business'), async (req, res) => {
    try {
        await AIDocument.findOneAndDelete({
            _id: req.params.id,
            business_id: req.user._id
        });
        
        res.json({ success: true, message: 'Document deleted' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============ ADMIN AI MANAGEMENT ROUTES ============

// Get AI Usage Statistics (Admin)
app.get('/api/admin/ai/stats', authenticate, authorize('admin'), async (req, res) => {
    try {
        const totalUsers = await BusinessAISettings.countDocuments();
        const premiumUsers = await BusinessAISettings.countDocuments({ plan: 'premium' });
        const freeUsers = totalUsers - premiumUsers;
        
        const totalUsage = await AIUsage.countDocuments();
        const usageByFeature = await AIUsage.aggregate([
            { $group: { _id: '$feature', count: { $sum: 1 } } }
        ]);
        
        const recentUsage = await AIUsage.find()
            .sort({ timestamp: -1 })
            .limit(50)
            .populate('business_id', 'business_name email');
        
        res.json({
            success: true,
            stats: {
                total_users: totalUsers,
                premium_users: premiumUsers,
                free_users: freeUsers,
                total_requests: totalUsage,
                usage_by_feature: usageByFeature,
                recent_usage: recentUsage
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Upgrade Business to Premium (Admin)
app.post('/api/admin/ai/upgrade/:businessId', authenticate, authorize('admin'), async (req, res) => {
    try {
        let settings = await BusinessAISettings.findOne({ business_id: req.params.businessId });
        
        if (!settings) {
            settings = new BusinessAISettings({
                business_id: req.params.businessId,
                plan: 'premium',
                daily_limit: 1000,
                monthly_limit: 10000,
                upgraded_at: new Date(),
                upgraded_by: req.user._id
            });
        } else {
            settings.plan = 'premium';
            settings.daily_limit = 1000;
            settings.monthly_limit = 10000;
            settings.upgraded_at = new Date();
            settings.upgraded_by = req.user._id;
        }
        
        await settings.save();
        
        res.json({
            success: true,
            message: 'Business upgraded to premium AI access'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Set Usage Limits (Admin)
app.put('/api/admin/ai/limits', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { plan, daily_limit, monthly_limit } = req.body;
        
        await BusinessAISettings.updateMany(
            { plan },
            { daily_limit, monthly_limit }
        );
        
        res.json({
            success: true,
            message: 'Usage limits updated'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

console.log('✅ AI Business Assistant System Ready');


// ============================================
// BLOG MANAGEMENT SYSTEM - BACKEND API
// ============================================

// Blog Post Schema (if not already defined)
const blogPostSchema = new mongoose.Schema({
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    category: { type: String, required: true },
    status: { type: String, enum: ['published', 'draft'], default: 'draft' },
    author_name: { type: String, default: 'LBA Team' },
    read_time: { type: String, default: '8 min read' },
    excerpt: { type: String, required: true },
    image: { type: String, default: '' },
    content: { type: String, required: true },
    is_featured: { type: Boolean, default: false },
    views: { type: Number, default: 0 },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    published_at: { type: Date, default: Date.now }
}, { timestamps: true });

// Check if model already exists to prevent overwrite
const BlogPost = mongoose.models.BlogPost || mongoose.model('BlogPost', blogPostSchema);

// ============ PUBLIC BLOG ROUTES ============

// Get all published blog posts (for frontend)
app.get('/api/blog/posts', async (req, res) => {
    try {
        const { category, page = 1, limit = 12, search } = req.query;
        let query = { status: 'published' };
        
        if (category && category !== 'all') {
            query.category = category;
        }
        
        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { excerpt: { $regex: search, $options: 'i' } }
            ];
        }
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const [posts, total] = await Promise.all([
            BlogPost.find(query)
                .select('title slug category excerpt image date read_time views created_at published_at is_featured')
                .sort({ is_featured: -1, published_at: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            BlogPost.countDocuments(query)
        ]);
        
        res.json({
            success: true,
            posts,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Get blog posts error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get single blog post by slug
app.get('/api/blog/posts/:slug', async (req, res) => {
    try {
        const post = await BlogPost.findOne({ slug: req.params.slug, status: 'published' });
        
        if (!post) {
            return res.status(404).json({ success: false, message: 'Post not found' });
        }
        
        // Increment view count
        post.views += 1;
        await post.save();
        
        res.json({
            success: true,
            post
        });
    } catch (error) {
        console.error('Get single post error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============ ADMIN BLOG ROUTES ============

// Get all blog posts (admin)
app.get('/api/admin/blog/posts', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { status, page = 1, limit = 50 } = req.query;
        let query = {};
        
        if (status && status !== 'all') {
            query.status = status;
        }
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const [posts, total] = await Promise.all([
            BlogPost.find(query)
                .sort({ created_at: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            BlogPost.countDocuments(query)
        ]);
        
        res.json({
            success: true,
            posts,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Admin get posts error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Create blog post (admin)
app.post('/api/admin/blog/posts', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { title, slug, category, status, author_name, read_time, excerpt, image, content, is_featured, date } = req.body;
        
        if (!title || !category || !excerpt || !content) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }
        
        // Generate slug if not provided
        let finalSlug = slug;
        if (!finalSlug) {
            finalSlug = title.toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/(^-|-$)/g, '');
        }
        
        // Check if slug exists
        const existing = await BlogPost.findOne({ slug: finalSlug });
        if (existing) {
            finalSlug = finalSlug + '-' + Date.now();
        }
        
        const post = new BlogPost({
            title,
            slug: finalSlug,
            category,
            status: status || 'draft',
            author_name: author_name || 'LBA Team',
            read_time: read_time || '8 min read',
            excerpt,
            image: image || '',
            content,
            is_featured: is_featured || false,
            created_by: req.user._id,
            published_at: status === 'published' ? new Date() : null
        });
        
        await post.save();
        
        // Also save to localStorage as backup (in memory for this request)
        // The frontend will also save to localStorage
        
        res.status(201).json({
            success: true,
            message: 'Post created successfully',
            post: {
                _id: post._id,
                title: post.title,
                slug: post.slug,
                status: post.status
            }
        });
    } catch (error) {
        console.error('Create post error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update blog post (admin)
app.put('/api/admin/blog/posts/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const post = await BlogPost.findById(req.params.id);
        if (!post) {
            return res.status(404).json({ success: false, message: 'Post not found' });
        }
        
        const { title, slug, category, status, author_name, read_time, excerpt, image, content, is_featured } = req.body;
        
        if (title) post.title = title;
        if (slug && slug !== post.slug) {
            const existing = await BlogPost.findOne({ slug });
            if (existing && existing._id.toString() !== post._id.toString()) {
                return res.status(400).json({ success: false, message: 'Slug already exists' });
            }
            post.slug = slug;
        }
        if (category) post.category = category;
        if (status) {
            post.status = status;
            if (status === 'published' && post.status !== 'published') {
                post.published_at = new Date();
            }
        }
        if (author_name) post.author_name = author_name;
        if (read_time) post.read_time = read_time;
        if (excerpt) post.excerpt = excerpt;
        if (image !== undefined) post.image = image;
        if (content) post.content = content;
        if (is_featured !== undefined) post.is_featured = is_featured;
        
        await post.save();
        
        res.json({
            success: true,
            message: 'Post updated successfully',
            post
        });
    } catch (error) {
        console.error('Update post error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete blog post (admin)
app.delete('/api/admin/blog/posts/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const post = await BlogPost.findByIdAndDelete(req.params.id);
        if (!post) {
            return res.status(404).json({ success: false, message: 'Post not found' });
        }
        
        res.json({
            success: true,
            message: 'Post deleted successfully'
        });
    } catch (error) {
        console.error('Delete post error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get blog stats (admin)
app.get('/api/admin/blog/stats', authenticate, authorize('admin'), async (req, res) => {
    try {
        const total = await BlogPost.countDocuments();
        const published = await BlogPost.countDocuments({ status: 'published' });
        const drafts = await BlogPost.countDocuments({ status: 'draft' });
        const totalViews = await BlogPost.aggregate([
            { $group: { _id: null, total: { $sum: '$views' } } }
        ]);
        
        res.json({
            success: true,
            stats: {
                total,
                published,
                drafts,
                totalViews: totalViews[0]?.total || 0
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

console.log('✅ Blog Management API Ready');


// ============================================
// PAST EVENTS & WINNERS MANAGEMENT SYSTEM
// ============================================

// Past Events Schema
const pastEventSchema = new mongoose.Schema({
    title: { type: String, required: true },
    edition: { type: String, required: true },
    tagline: { type: String, default: '' },
    description: { type: String, required: true },
    event_date: { type: Date, required: true },
    status: { type: String, enum: ['published', 'draft'], default: 'draft' },
    image: { type: String, default: '' },
    winner_count: { type: Number, default: 0 },
    category_count: { type: Number, default: 0 },
    partner_count: { type: Number, default: 0 },
    winners: { type: Array, default: [] },  // Array of { name, category, founder, image, story }
    gallery: { type: Array, default: [] },   // Array of { url, caption }
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    views: { type: Number, default: 0 }
}, { timestamps: true });

const PastEvent = mongoose.models.PastEvent || mongoose.model('PastEvent', pastEventSchema);

// ============ PUBLIC PAST EVENTS ROUTES ============

// Get all published past events (for frontend)
app.get('/api/past-events', async (req, res) => {
    try {
        const { limit = 50 } = req.query;
        
        const events = await PastEvent.find({ status: 'published' })
            .sort({ event_date: -1 })
            .limit(parseInt(limit));
        
        // Get total winners count for stats
        let totalWinners = 0;
        events.forEach(e => {
            totalWinners += (e.winners ? e.winners.length : 0) + (e.winner_count || 0);
        });
        
        res.json({
            success: true,
            events,
            stats: {
                totalEvents: events.length,
                totalWinners: totalWinners,
                totalPartners: events.reduce((sum, e) => sum + (e.partner_count || 0), 0)
            }
        });
    } catch (error) {
        console.error('Get past events error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get single past event by ID
app.get('/api/past-events/:id', async (req, res) => {
    try {
        const event = await PastEvent.findById(req.params.id);
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }
        res.json({ success: true, event });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============ ADMIN PAST EVENTS ROUTES ============

// Get all past events (admin)
app.get('/api/admin/events', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { status, page = 1, limit = 50 } = req.query;
        let query = {};
        
        if (status && status !== 'all') {
            query.status = status;
        }
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const [events, total] = await Promise.all([
            PastEvent.find(query)
                .sort({ event_date: -1 })
                .skip(skip)
                .limit(parseInt(limit)),
            PastEvent.countDocuments(query)
        ]);
        
        res.json({
            success: true,
            events,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (error) {
        console.error('Admin get events error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get single past event (admin)
app.get('/api/admin/events/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const event = await PastEvent.findById(req.params.id);
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }
        res.json({ success: true, event });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});




// ============================================
// PAST EVENTS - CREATE WITH ANY FILES
// ============================================
app.post('/api/admin/events', authenticate, authorize('admin'), 
    handleUpload(upload.any()),
    async (req, res) => {
        try {
            console.log('📝 CREATE EVENT - Request received');
            console.log('📦 Body keys:', Object.keys(req.body));
            console.log('📦 Files:', req.files ? req.files.length : 0);
            
            let eventData;
            
            // Handle both JSON and FormData
            if (req.body.eventData) {
                try {
                    eventData = typeof req.body.eventData === 'string' 
                        ? JSON.parse(req.body.eventData) 
                        : req.body.eventData;
                    console.log('✅ Parsed eventData from FormData');
                } catch (e) {
                    console.error('❌ Failed to parse eventData:', e.message);
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid event data format: ' + e.message
                    });
                }
            } else {
                eventData = req.body;
                console.log('📦 Using req.body directly');
            }
            
            // Extract and validate
            const {
                title = '',
                edition = '',
                tagline = '',
                description = '',
                event_date,
                status = 'draft',
                winner_count = 0,
                category_count = 0,
                partner_count = 0,
                winners = [],
                gallery = []
            } = eventData;
            
            // Validate required fields
            if (!title || !edition || !description || !event_date) {
                console.error('❌ Missing required fields');
                return res.status(400).json({
                    success: false,
                    message: 'Missing required fields: title, edition, description, event_date'
                });
            }
            
            // Build event object with proper types
            const event = new PastEvent({
                title: String(title).trim(),
                edition: String(edition).trim(),
                tagline: String(tagline || '').trim(),
                description: String(description).trim(),
                event_date: new Date(event_date),
                status: String(status || 'draft'),
                winner_count: parseInt(winner_count) || 0,
                category_count: parseInt(category_count) || 0,
                partner_count: parseInt(partner_count) || 0,
                winners: Array.isArray(winners) ? winners.map(w => ({
                    name: String(w.name || '').trim(),
                    category: String(w.category || '').trim(),
                    founder: String(w.founder || '').trim(),
                    image: String(w.image || '').trim(),
                    story: String(w.story || '').trim()
                })) : [],
                gallery: Array.isArray(gallery) ? gallery.map(g => ({
                    url: String(g.url || '').trim(),
                    caption: String(g.caption || '').trim()
                })) : [],
                created_by: req.user._id
            });
            
            // Process uploaded files from req.files (all files)
            if (req.files && req.files.length > 0) {
                // Sort files by fieldname to maintain order
                const sortedFiles = req.files.sort((a, b) => {
                    // Extract numbers from fieldname (gallery_0, gallery_1, etc.)
                    const aNum = parseInt(a.fieldname.replace(/[^0-9]/g, '')) || 0;
                    const bNum = parseInt(b.fieldname.replace(/[^0-9]/g, '')) || 0;
                    return aNum - bNum;
                });
                
                let galleryIndex = 0;
                let winnerIndex = 0;
                
                for (const file of sortedFiles) {
                    const fieldname = file.fieldname;
                    
                    // Featured image
                    if (fieldname === 'featured_image') {
                        event.image = `/uploads/${file.filename}`;
                        console.log('📸 Featured image:', event.image);
                    }


                     // Gallery images (gallery_0, gallery_1, gallery_2, etc.)
else if (fieldname.startsWith('gallery_')) {
    const index = parseInt(fieldname.replace('gallery_', ''));
    if (!isNaN(index)) {
        // Make sure we have enough slots in the gallery array
        while (event.gallery.length <= index) {
            event.gallery.push({ url: '', caption: '' });
        }
        event.gallery[index].url = `/uploads/${file.filename}`;
        console.log(`📸 Gallery image ${index}: ${file.filename}`);
    }
}   
                        

                    // Winner images (winner_image_0, winner_image_1, etc. OR winner_images)
                    else if (fieldname.startsWith('winner_image_') || fieldname === 'winner_images') {
                        if (event.winners[winnerIndex]) {
                            event.winners[winnerIndex].image = `/uploads/${file.filename}`;
                        }
                        winnerIndex++;
                    }
                }
                
                console.log(`📸 Processed ${galleryIndex} gallery images, ${winnerIndex} winner images`);
            }
            
            // Save to database
            await event.save();
            console.log('✅ Event saved! ID:', event._id);
            
            res.status(201).json({
                success: true,
                message: 'Event created successfully!',
                event: {
                    _id: event._id,
                    title: event.title,
                    edition: event.edition,
                    status: event.status,
                    event_date: event.event_date,
                    image: event.image,
                    winner_count: event.winners.length,
                    gallery_count: event.gallery.length
                }
            });
            
        } catch (error) {
            console.error('❌ CREATE EVENT ERROR:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to create event'
            });
        }
    }
);



// ============================================
// PAST EVENTS - UPDATE WITH MULTIPLE GALLERY IMAGES
// ============================================
app.put('/api/admin/events/:id', authenticate, authorize('admin'),
    handleUpload(upload.any()),
    async (req, res) => {
        try {
            console.log('📝 UPDATE EVENT - Request received');
            console.log('📦 Body keys:', Object.keys(req.body));
            console.log('📦 Files:', req.files ? req.files.length : 0);
            
            const event = await PastEvent.findById(req.params.id);
            if (!event) {
                return res.status(404).json({ success: false, message: 'Event not found' });
            }
            
            let eventData;
            
            // Handle both JSON and FormData
            if (req.body.eventData) {
                try {
                    eventData = typeof req.body.eventData === 'string' 
                        ? JSON.parse(req.body.eventData) 
                        : req.body.eventData;
                    console.log('✅ Parsed eventData from FormData');
                } catch (e) {
                    console.error('❌ Failed to parse eventData:', e.message);
                    return res.status(400).json({
                        success: false,
                        message: 'Invalid event data format: ' + e.message
                    });
                }
            } else {
                eventData = req.body;
                console.log('📦 Using req.body directly');
            }
            
            // Extract and validate
            const {
                title = '',
                edition = '',
                tagline = '',
                description = '',
                event_date,
                status = 'draft',
                winner_count = 0,
                category_count = 0,
                partner_count = 0,
                winners = [],
                gallery = []
            } = eventData;
            
            // Update basic fields
            if (title) event.title = String(title).trim();
            if (edition) event.edition = String(edition).trim();
            if (tagline !== undefined) event.tagline = String(tagline || '').trim();
            if (description) event.description = String(description).trim();
            if (event_date) event.event_date = new Date(event_date);
            if (status) event.status = status;
            if (winner_count !== undefined) event.winner_count = parseInt(winner_count) || 0;
            if (category_count !== undefined) event.category_count = parseInt(category_count) || 0;
            if (partner_count !== undefined) event.partner_count = parseInt(partner_count) || 0;
            
            // Update winners if provided
            if (winners && Array.isArray(winners)) {
                event.winners = winners.map(w => ({
                    name: String(w.name || '').trim(),
                    category: String(w.category || '').trim(),
                    founder: String(w.founder || '').trim(),
                    image: String(w.image || '').trim(),
                    story: String(w.story || '').trim()
                }));
            }
            
            // Update gallery if provided
            if (gallery && Array.isArray(gallery)) {
                event.gallery = gallery.map(g => ({
                    url: String(g.url || '').trim(),
                    caption: String(g.caption || '').trim()
                }));
            }
            
            // ============================================
            // FIXED: Process uploaded files from req.files
            // ============================================
            if (req.files && req.files.length > 0) {
                // Sort files by fieldname to maintain order
                const sortedFiles = req.files.sort((a, b) => {
                    const aNum = parseInt(a.fieldname.replace(/[^0-9]/g, '')) || 0;
                    const bNum = parseInt(b.fieldname.replace(/[^0-9]/g, '')) || 0;
                    return aNum - bNum;
                });
                
                let galleryIndex = 0;
                let winnerIndex = 0;
                
                for (const file of sortedFiles) {
                    const fieldname = file.fieldname;
                    
                    // Featured image
                    if (fieldname === 'featured_image') {
                        event.image = `/uploads/${file.filename}`;
                        console.log(`📸 Featured image: ${file.filename}`);
                    }
                    // Gallery images (gallery_0, gallery_1, gallery_2, etc.)
                    else if (fieldname.startsWith('gallery_')) {
                        const index = parseInt(fieldname.replace('gallery_', ''));
                        if (!isNaN(index)) {
                            // Make sure we have enough slots in the gallery array
                            while (event.gallery.length <= index) {
                                event.gallery.push({ url: '', caption: '' });
                            }
                            event.gallery[index].url = `/uploads/${file.filename}`;
                            console.log(`📸 Gallery image ${index}: ${file.filename}`);
                        }
                    }
                    // Winner images (winner_image_0, winner_image_1, etc.)
                    else if (fieldname.startsWith('winner_image_')) {
                        const index = parseInt(fieldname.replace('winner_image_', ''));
                        if (!isNaN(index) && event.winners[index]) {
                            event.winners[index].image = `/uploads/${file.filename}`;
                            console.log(`📸 Winner image ${index}: ${file.filename}`);
                        }
                    }
                }
            }
            
            event.updated_by = req.user._id;
            event.updated_at = new Date();
            
            await event.save();
            console.log('✅ Event updated:', event._id);
            
            res.json({
                success: true,
                message: 'Event updated successfully!',
                event: {
                    _id: event._id,
                    title: event.title,
                    edition: event.edition,
                    status: event.status,
                    event_date: event.event_date,
                    image: event.image,
                    winner_count: event.winners.length,
                    gallery_count: event.gallery.length
                }
            });
            
        } catch (error) {
            console.error('❌ UPDATE EVENT ERROR:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Failed to update event'
            });
        }
    }
);



// DELETE past event (admin)
app.delete('/api/admin/events/:id', authenticate, authorize('admin'), async (req, res) => {
    try {
        const event = await PastEvent.findByIdAndDelete(req.params.id);
        if (!event) {
            return res.status(404).json({ success: false, message: 'Event not found' });
        }
        
        res.json({
            success: true,
            message: 'Event deleted successfully'
        });
    } catch (error) {
        console.error('Delete event error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============================================
// PAST EVENTS - STATS (FIXED)
// ============================================
app.get('/api/admin/events/stats', authenticate, authorize('admin'), async (req, res) => {
    try {
        const total = await PastEvent.countDocuments();
        const published = await PastEvent.countDocuments({ status: 'published' });
        const drafts = await PastEvent.countDocuments({ status: 'draft' });
        
        // Get total winners across all events safely
        const allEvents = await PastEvent.find().select('winners winner_count');
        let totalWinners = 0;
        allEvents.forEach(e => {
            totalWinners += (e.winners ? e.winners.length : 0) + (e.winner_count || 0);
        });
        
        res.json({
            success: true,
            stats: {
                total,
                published,
                drafts,
                totalWinners
            }
        });
    } catch (error) {
        console.error('❌ Stats error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to get stats'
        });
    }
});

console.log('✅ Past Events Management API Ready');

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
