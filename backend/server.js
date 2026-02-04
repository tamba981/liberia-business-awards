// ============================================
// LIBERIA BUSINESS AWARDS - ENTERPRISE SYSTEM
// ============================================
console.log('🚀 Starting Liberia Business Awards Enterprise System...');

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

const app = express();
const PORT = process.env.PORT || 10000;

// ============ SECURITY CONFIGURATION ============
app.use(helmet());
app.use(rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
}));

// ============ ENVIRONMENT VARIABLES ============
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'liberia-business-awards-secret-2026';
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const BACKUP_DIR = path.join(__dirname, 'backups');

// ============ DATABASE CONNECTION ============
async function connectToMongoDB() {
    if (!MONGODB_URI) {
        console.log('❌ MONGODB_URI not found');
        return false;
    }
    
    try {
        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
        });
        console.log('✅ MongoDB Atlas Connected');
        return true;
    } catch (error) {
        console.error('❌ MongoDB Connection Failed:', error.message);
        return false;
    }
}

// ============ DATABASE SCHEMAS ============

// 1. User Schema (Businesses & Admin)
const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    company_name: { type: String, required: true },
    contact_person: { type: String, required: true },
    phone: { type: String },
    address: { type: String },
    website: { type: String },
    business_type: { type: String, enum: ['technology', 'finance', 'healthcare', 'education', 'manufacturing', 'retail', 'other'] },
    year_established: { type: Number },
    number_of_employees: { type: String, enum: ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'] },
    
    // Business Profile
    description: { type: String },
    achievements: [{ type: String }],
    awards: [{ 
        name: String,
        year: Number,
        category: String
    }],
    logo_url: { type: String },
    documents: [{
        name: String,
        url: String,
        type: String,
        uploaded_at: { type: Date, default: Date.now }
    }],
    
    // Account Management
    role: { type: String, enum: ['business', 'admin', 'judge'], default: 'business' },
    status: { type: String, enum: ['pending', 'active', 'suspended', 'rejected'], default: 'pending' },
    verification_token: { type: String },
    reset_token: { type: String },
    reset_expires: { type: Date },
    
    // Timestamps
    last_login: { type: Date },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { timestamps: true });

// 2. Nomination Schema
const nominationSchema = new mongoose.Schema({
    business_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    category: { type: String, required: true },
    year: { type: Number, required: true },
    
    // Nomination Details
    submission_statement: { type: String, required: true },
    achievements: [{
        title: String,
        description: String,
        impact: String,
        evidence_url: String
    }],
    financial_performance: {
        revenue: String,
        growth: String,
        profitability: String
    },
    social_impact: {
        jobs_created: Number,
        community_projects: String,
        environmental_initiatives: String
    },
    
    // Supporting Documents
    documents: [{
        name: String,
        url: String,
        type: String
    }],
    
    // Status & Evaluation
    status: { 
        type: String, 
        enum: ['draft', 'submitted', 'under_review', 'shortlisted', 'winner', 'not_selected'],
        default: 'draft'
    },
    scores: [{
        judge_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        criteria: String,
        score: Number,
        comments: String,
        date: { type: Date, default: Date.now }
    }],
    average_score: { type: Number, default: 0 },
    feedback: { type: String },
    
    // Timestamps
    submitted_at: { type: Date },
    reviewed_at: { type: Date },
    created_at: { type: Date, default: Date.now }
});

// 3. Event/Announcement Schema
const announcementSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: { type: String, required: true },
    type: { type: String, enum: ['news', 'event', 'deadline', 'winner'], required: true },
    target_audience: [{ type: String, enum: ['all', 'businesses', 'nominees', 'winners', 'public'] }],
    attachments: [{ name: String, url: String }],
    publish_date: { type: Date, default: Date.now },
    expiry_date: { type: Date },
    is_published: { type: Boolean, default: false },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    created_at: { type: Date, default: Date.now }
});

// 4. Form Submission Schema (Existing)
const formSchema = new mongoose.Schema({
    form_type: { type: String, required: true },
    data: { type: Object, required: true },
    submitted_at: { type: Date, default: Date.now }
});

// Create Models
const User = mongoose.model('User', userSchema);
const Nomination = mongoose.model('Nomination', nominationSchema);
const Announcement = mongoose.model('Announcement', announcementSchema);
const Form = mongoose.model('Form', formSchema);

// ============ MIDDLEWARE ============
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS Configuration
app.use((req, res, next) => {
    const allowedOrigins = [
        'https://liberiabusinessawardslr.com',
        'http://localhost:5500',
        'http://localhost:3000',
        'http://127.0.0.1:5500',
        'https://liberia-business-awards.netlify.app'
    ];
    
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
    }
    
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-auth-token');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    next();
});

// Authentication Middleware
const authenticate = async (req, res, next) => {
    const token = req.header('x-auth-token') || req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({ 
            success: false, 
            message: 'Access denied. No token provided.' 
        });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.userId).select('-password');
        
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'User not found.' 
            });
        }
        
        req.user = user;
        next();
    } catch (error) {
        res.status(401).json({ 
            success: false, 
            message: 'Invalid token.' 
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
        const dir = path.join(UPLOAD_DIR, req.user?.id || 'public');
        await fs.mkdir(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|xls|xlsx|ppt|pptx/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (extname && mimetype) {
            return cb(null, true);
        }
        cb(new Error('Only image, PDF, and document files are allowed'));
    }
});

// ============ UTILITY FUNCTIONS ============
async function ensureDirectories() {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    console.log('📁 Upload directory:', UPLOAD_DIR);
    console.log('📁 Backup directory:', BACKUP_DIR);
}

// ============ API ROUTES ============

// 1. AUTHENTICATION ROUTES
app.post('/api/auth/register', [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
    body('company_name').notEmpty().trim(),
    body('contact_person').notEmpty().trim()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        
        const { email, password, company_name, contact_person, phone, address } = req.body;
        
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
        
        // Create user
        user = new User({
            email,
            password: hashedPassword,
            company_name,
            contact_person,
            phone,
            address,
            role: 'business',
            status: 'pending'
        });
        
        await user.save();
        
        // Create token
        const token = jwt.sign({ userId: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        
        res.status(201).json({
            success: true,
            message: 'Business registered successfully. Awaiting approval.',
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
        
        // Check if account is active
        if (user.status !== 'active') {
            return res.status(403).json({ 
                success: false, 
                message: `Account is ${user.status}. Please contact administrator.` 
            });
        }
        
        // Update last login
        user.last_login = new Date();
        await user.save();
        
        // Create token
        const token = jwt.sign({ userId: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
        
        res.json({
            success: true,
            message: 'Login successful',
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
        const user = await User.findById(req.user.id).select('-password -verification_token -reset_token');
        
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
        delete updates.password; // Prevent password update here
        delete updates.role; // Prevent role change
        delete updates.status; // Prevent status change
        
        const user = await User.findByIdAndUpdate(
            req.user.id,
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

app.post('/api/business/upload', authenticate, upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                message: 'No file uploaded.' 
            });
        }
        
        const fileUrl = `/uploads/${req.user.id}/${req.file.filename}`;
        const document = {
            name: req.body.name || req.file.originalname,
            url: fileUrl,
            type: req.file.mimetype.split('/')[1] || 'file'
        };
        
        await User.findByIdAndUpdate(req.user.id, {
            $push: { documents: document }
        });
        
        res.json({
            success: true,
            message: 'File uploaded successfully.',
            document: {
                ...document,
                uploaded_at: new Date()
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

// 3. NOMINATION ROUTES
app.post('/api/nominations', authenticate, async (req, res) => {
    try {
        const nominationData = {
            ...req.body,
            business_id: req.user.id,
            status: 'draft'
        };
        
        const nomination = new Nomination(nominationData);
        await nomination.save();
        
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
        
        nomination.status = 'submitted';
        nomination.submitted_at = new Date();
        await nomination.save();
        
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

app.get('/api/business/nominations', authenticate, async (req, res) => {
    try {
        const nominations = await Nomination.find({ business_id: req.user.id })
            .sort({ created_at: -1 });
        
        res.json({
            success: true,
            nominations,
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

// 4. ADMIN DASHBOARD ROUTES
app.get('/api/admin/dashboard', authenticate, authorize('admin'), async (req, res) => {
    try {
        const [
            totalBusinesses,
            activeBusinesses,
            pendingBusinesses,
            totalNominations,
            pendingNominations,
            recentBusinesses,
            recentNominations
        ] = await Promise.all([
            User.countDocuments({ role: 'business' }),
            User.countDocuments({ role: 'business', status: 'active' }),
            User.countDocuments({ role: 'business', status: 'pending' }),
            Nomination.countDocuments(),
            Nomination.countDocuments({ status: 'submitted' }),
            User.find({ role: 'business' })
                .sort({ created_at: -1 })
                .limit(5)
                .select('company_name email status created_at'),
            Nomination.find()
                .populate('business_id', 'company_name')
                .sort({ created_at: -1 })
                .limit(5)
                .select('category year status submitted_at')
        ]);
        
        res.json({
            success: true,
            dashboard: {
                businesses: {
                    total: totalBusinesses,
                    active: activeBusinesses,
                    pending: pendingBusinesses
                },
                nominations: {
                    total: totalNominations,
                    pending: pendingNominations
                },
                recent_businesses: recentBusinesses,
                recent_nominations: recentNominations
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

app.get('/api/admin/businesses', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        const query = { role: 'business' };
        
        if (status && status !== 'all') {
            query.status = status;
        }
        
        const businesses = await User.find(query)
            .select('-password -verification_token -reset_token')
            .sort({ created_at: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));
        
        const total = await User.countDocuments(query);
        
        res.json({
            success: true,
            businesses,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
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

app.put('/api/admin/businesses/:id/status', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { status } = req.body;
        
        if (!['active', 'suspended', 'rejected'].includes(status)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid status value.' 
            });
        }
        
        const business = await User.findByIdAndUpdate(
            req.params.id,
            { status, updated_at: new Date() },
            { new: true }
        ).select('-password');
        
        if (!business) {
            return res.status(404).json({ 
                success: false, 
                message: 'Business not found.' 
            });
        }
        
        res.json({
            success: true,
            message: `Business status updated to ${status}.`,
            business
        });
        
    } catch (error) {
        console.error('Status update error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error updating status.' 
        });
    }
});

app.get('/api/admin/nominations', authenticate, authorize('admin'), async (req, res) => {
    try {
        const nominations = await Nomination.find()
            .populate('business_id', 'company_name email')
            .sort({ submitted_at: -1 });
        
        res.json({
            success: true,
            nominations,
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

// 5. PUBLIC ROUTES (Existing functionality)
app.get('/api/health', async (req, res) => {
    const isConnected = mongoose.connection.readyState === 1;
    const formCount = await Form.countDocuments();
    
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        version: '3.0.0',
        database: isConnected ? 'connected' : 'disconnected',
        submissions: formCount,
        service: 'Liberia Business Awards Enterprise System'
    });
});

app.post('/api/submit-form', async (req, res) => {
    try {
        console.log('📥 Form submission received:', req.body.form_type || 'unknown');
        
        const isConnected = mongoose.connection.readyState === 1;
        let savedId = null;
        
        if (isConnected) {
            try {
                const form = new Form({
                    form_type: req.body.form_type || 'unknown',
                    data: req.body
                });
                
                const savedDoc = await form.save();
                savedId = savedDoc._id;
                console.log(`💾 Saved to MongoDB: ${savedId}`);
            } catch (dbError) {
                console.error('Database save error:', dbError.message);
            }
        }
        
        const response = {
            success: true,
            message: `Form '${req.body.form_type || 'unknown'}' submitted successfully`,
            timestamp: new Date().toISOString(),
            mongodb: {
                connected: isConnected,
                saved: !!savedId,
                document_id: savedId
            }
        };
        
        console.log('✅ Response:', JSON.stringify(response));
        res.json(response);
        
    } catch (error) {
        console.error('❌ Form error:', error);
        res.status(500).json({
            success: false,
            message: 'Form processing error',
            error: error.message
        });
    }
});

// 6. FILE SERVING ROUTE
app.use('/uploads', express.static(UPLOAD_DIR));

// 7. BACKUP ROUTE
app.get('/api/admin/backup', authenticate, authorize('admin'), async (req, res) => {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = path.join(BACKUP_DIR, `backup-${timestamp}.json`);
        
        const [users, nominations, forms, announcements] = await Promise.all([
            User.find().select('-password'),
            Nomination.find().populate('business_id', 'company_name'),
            Form.find(),
            Announcement.find()
        ]);
        
        const backupData = {
            timestamp: new Date().toISOString(),
            users_count: users.length,
            nominations_count: nominations.length,
            forms_count: forms.length,
            announcements_count: announcements.length,
            data: {
                users,
                nominations,
                forms,
                announcements
            }
        };
        
        await fs.writeFile(backupFile, JSON.stringify(backupData, null, 2));
        
        res.json({
            success: true,
            message: 'Backup created successfully.',
            backup: {
                file: `backup-${timestamp}.json`,
                size: (JSON.stringify(backupData).length / 1024 / 1024).toFixed(2) + ' MB',
                timestamp: new Date().toISOString()
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
        service: 'Liberia Business Awards Enterprise System',
        version: '3.0.0',
        status: 'operational',
        endpoints: {
            public: [
                'GET  /api/health',
                'POST /api/submit-form',
                'POST /api/auth/register',
                'POST /api/auth/login'
            ],
            business: [
                'GET  /api/business/profile',
                'PUT  /api/business/profile',
                'POST /api/business/upload',
                'GET  /api/business/nominations',
                'POST /api/nominations',
                'PUT  /api/nominations/:id/submit'
            ],
            admin: [
                'GET  /api/admin/dashboard',
                'GET  /api/admin/businesses',
                'PUT  /api/admin/businesses/:id/status',
                'GET  /api/admin/nominations',
                'GET  /api/admin/backup'
            ]
        }
    });
});

// 404 Handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint not found',
        available_endpoints: {
            public: ['/api/health', '/api/submit-form', '/api/auth/register', '/api/auth/login'],
            info: 'Use / for complete endpoint list'
        }
    });
});

// ============ START SERVER ============
async function startServer() {
    console.log('='.repeat(60));
    console.log('🚀 LIBERIA BUSINESS AWARDS ENTERPRISE SYSTEM');
    console.log('='.repeat(60));
    
    // Ensure directories exist
    await ensureDirectories();
    
    // Connect to MongoDB
    const connected = await connectToMongoDB();
    
    // Start server
    app.listen(PORT, () => {
        console.log('\n✅ SERVER RUNNING');
        console.log('='.repeat(60));
        console.log(`📡 Port: ${PORT}`);
        console.log(`🌐 Local: http://localhost:${PORT}`);
        console.log(`🌍 Public: https://liberia-business-awards-backend.onrender.com`);
        console.log(`🗄️  MongoDB: ${connected ? '✅ CONNECTED' : '❌ DISCONNECTED'}`);
        console.log(`🔐 JWT Secret: ${JWT_SECRET ? 'Configured' : 'Using default'}`);
        console.log(`📁 Uploads: ${UPLOAD_DIR}`);
        console.log(`💾 Backups: ${BACKUP_DIR}`);
        console.log('='.repeat(60));
        console.log('\n👥 USER ROLES:');
        console.log('   • Business: Register, update profile, submit nominations');
        console.log('   • Admin: Manage businesses, nominations, view analytics');
        console.log('   • Judge: Score nominations (coming soon)');
        console.log('\n🚀 Ready for enterprise operations!');
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
