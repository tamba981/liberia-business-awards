// ============================================
// LIBERIA BUSINESS AWARDS - PRODUCTION SYSTEM V4.0
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
app.use(cors({
    origin: ['https://liberiabusinessawardslr.com', 'http://localhost:5500', 'http://localhost:3000'],
    credentials: true,
    optionsSuccessStatus: 200
}));

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
    status: { type: String, enum: ['pending', 'active', 'suspended'], default: 'pending' },
    last_login: { type: Date },
    login_attempts: { type: Number, default: 0 },
    lock_until: { type: Date }
}, { timestamps: true });

// Hash password middleware
adminSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

businessUserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// Password comparison methods
adminSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

businessUserSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Create models
const Admin = mongoose.model('Admin', adminSchema);
const BusinessUser = mongoose.model('BusinessUser', businessUserSchema);

// ============ AUTHENTICATION MIDDLEWARE ============

// JWT Token verification middleware
const authenticate = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                message: 'Access denied. No token provided.' 
            });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await Admin.findById(decoded.userId).select('-password');
        
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'User not found.' 
            });
        }

        if (!user.is_active) {
            return res.status(403).json({ 
                success: false, 
                message: 'Account is deactivated.' 
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

// Role-based authorization middleware
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Authentication required.' 
            });
        }

        if (!roles.includes(req.user.role)) {
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
        await mongoose.connect(MONGODB_URI);
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

// Get all businesses
app.get('/api/admin/businesses', authenticate, authorize('admin'), async (req, res) => {
    try {
        const businesses = await BusinessUser.find().sort({ created_at: -1 });
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

// Approve business
app.post('/api/admin/businesses/:id/approve', authenticate, authorize('admin'), async (req, res) => {
    try {
        const business = await BusinessUser.findByIdAndUpdate(
            req.params.id,
            { status: 'active' },
            { new: true }
        );
        res.json({ success: true, business });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Reject business
app.post('/api/admin/businesses/:id/reject', authenticate, authorize('admin'), async (req, res) => {
    try {
        const { reason } = req.body;
        const business = await BusinessUser.findByIdAndUpdate(
            req.params.id,
            { status: 'rejected', notes: reason },
            { new: true }
        );
        res.json({ success: true, business });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ AUTH ROUTES ============

// Admin Login
app.post('/api/auth/admin/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log('Admin login attempt:', email);
        
        const admin = await Admin.findOne({ email });
        if (!admin) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        const isMatch = await admin.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        const token = jwt.sign({ userId: admin._id, role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
        
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
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Business Login
app.post('/api/auth/business/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log('Business login attempt:', email);
        
        const business = await BusinessUser.findOne({ email });
        if (!business) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        if (business.status !== 'active') {
            return res.status(403).json({ success: false, message: 'Account pending approval' });
        }
        
        const isMatch = await business.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        const token = jwt.sign({ userId: business._id, role: 'business' }, JWT_SECRET, { expiresIn: '7d' });
        
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
        console.error('Business login error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Business Registration
app.post('/api/business/register', async (req, res) => {
    try {
        const { email, password, business_name, contact_name, phone, business_type } = req.body;
        console.log('Business registration:', email);
        
        const existing = await BusinessUser.findOne({ email });
        if (existing) {
            return res.status(400).json({ success: false, message: 'Email already registered' });
        }
        
        const business = new BusinessUser({
            email,
            password,
            business_name,
            contact_name,
            phone,
            business_type,
            status: 'pending'
        });
        
        await business.save();
        
        res.json({
            success: true,
            message: 'Registration successful! Please wait for admin approval.'
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Health Check
app.get('/api/health', async (req, res) => {
    const isConnected = mongoose.connection.readyState === 1;
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        service: 'Liberia Business Awards API',
        version: '4.0.0',
        database: isConnected ? 'connected' : 'disconnected',
        stats: {
            businesses: await BusinessUser.countDocuments().catch(() => 0)
        },
        uptime: process.uptime()
    });
});

// Test routes
app.get('/api/auth/test', (req, res) => {
    res.json({ message: 'Auth routes working!' });
});

app.get('/api/business/test', (req, res) => {
    res.json({ message: 'Business routes working!' });
});

// Home route
app.get('/', (req, res) => {
    res.json({
        service: 'Liberia Business Awards API',
        version: '4.0.0',
        status: 'operational',
        endpoints: {
            auth: ['/api/auth/test', '/api/auth/admin/login', '/api/auth/business/login'],
            business: ['/api/business/test', '/api/business/register']
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
        console.log(`🌐 Public: https://liberia-business-awards-backend.onrender.com`);
        console.log(`🗄️  MongoDB: ${connected ? '✅ CONNECTED' : '❌ DISCONNECTED'}`);
        console.log('='.repeat(70));
        console.log('\n🚀 System ready for production!');
    });

    // Handle errors
    server.on('error', (error) => {
        console.error('❌ Server error:', error);
        process.exit(1);
    });
}

// Error handlers
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




