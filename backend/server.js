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

// ============ DEBUG: Log all requests ============
app.use((req, res, next) => {
    console.log(`📡 ${req.method} ${req.url}`);
    next();
});

// ============ SIMPLE TEST ENDPOINTS (MUST WORK FIRST) ============
app.get('/ping', (req, res) => {
    res.json({ status: 'ok', message: 'pong', timestamp: new Date().toISOString() });
});

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
        status: 'operational',
        port: PORT,
        timestamp: new Date().toISOString(),
        endpoints: {
            health: '/api/health',
            test: '/test',
            ping: '/ping',
            auth: '/api/auth'
        }
    });
});

// ============ HEALTH CHECK (SINGLE VERSION) ============
app.get('/api/health', (req, res) => {
    const isConnected = mongoose.connection.readyState === 1;
    
    res.json({
        status: isConnected ? 'ok' : 'starting',
        message: isConnected ? 'Server is running' : 'Server starting, waiting for MongoDB',
        timestamp: new Date().toISOString(),
        mongodb: isConnected ? 'connected' : 'connecting',
        port: PORT,
        uptime: process.uptime(),
        environment: process.env.NODE_ENV
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
    message: { success: false, message: 'Too many login attempts. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    message: { success: false, message: 'Rate limit exceeded. Please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// ============ CORS CONFIGURATION (IMPORTANT FIX) ============
const allowedOrigins = [
    'https://liberiabusinessawardslr.com',
    'https://www.liberiabusinessawardslr.com',
    'https://liberia-business-awards.up.railway.app',
    'http://localhost:5500',
    'http://localhost:3000',
    'http://127.0.0.1:5500',
    'http://127.0.0.1:3000'
];

const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
            callback(null, true);
        } else {
            console.log('❌ CORS blocked origin:', origin);
            // For testing, still allow (remove in production)
            callback(null, true);
        }
    },
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'Accept', 'Origin']
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));

// ============ OTHER MIDDLEWARE ============
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

// ============ DATABASE SCHEMAS & MODELS (KEEP YOUR EXISTING SCHEMAS) ============
// [PASTE ALL YOUR EXISTING SCHEMAS HERE - adminSchema, businessUserSchema, etc.]
// ... (Keep all your existing schema definitions from lines 150-400)

// ============ AUTH ROUTES ============
// [PASTE ALL YOUR EXISTING ROUTES HERE]
// ... (Keep all your existing routes from lines 500-2200)

// ============ DEBUG: LIST ALL REGISTERED ROUTES ============
console.log('\n📋 REGISTERED ROUTES:');
app._router.stack.forEach(r => {
    if (r.route && r.route.path) {
        console.log(`   ${Object.keys(r.route.methods).join(',')} ${r.route.path}`);
    }
});
console.log('');

// ============ START SERVER ============
async function startServer() {
    console.log('='.repeat(70));
    console.log('🚀 LIBERIA BUSINESS AWARDS - PRODUCTION SYSTEM V5.0');
    console.log('='.repeat(70));
    console.log(`📡 PORT: ${PORT}`);
    console.log(`🌍 NODE_ENV: ${process.env.NODE_ENV}`);
    console.log(`🗄️  MONGODB_URI: ${MONGODB_URI ? 'Set' : 'NOT SET!'}`);
    
    // Connect to MongoDB in background
    connectToMongoDB().catch(err => {
        console.error('❌ MongoDB connection error:', err.message);
    });
    
    const server = app.listen(PORT, '0.0.0.0', () => {
        console.log('\n✅ SERVER RUNNING');
        console.log('='.repeat(70));
        console.log(`📡 Port: ${PORT}`);
        console.log(`🌍 URL: https://liberia-business-awards.up.railway.app`);
        console.log(`🏥 Health: /api/health`);
        console.log(`🧪 Test: /test`);
        console.log(`🔔 Ping: /ping`);
        console.log('='.repeat(70));
        console.log('\n🚀 System ready!');
    });

    server.on('error', (error) => {
        console.error('❌ Server error:', error);
        process.exit(1);
    });
}

// ============ PROCESS HANDLERS ============
process.on('uncaughtException', (err) => {
    console.error('💥 UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (err) => {
    console.error('🔥 UNHANDLED REJECTION:', err);
});

// Start the server
startServer();

// Keep your existing connectToMongoDB function and all other route handlers here
// Make sure you paste your existing connectToMongoDB function here
async function connectToMongoDB() {
    try {
        await mongoose.connect(MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
        console.log('✅ MongoDB Atlas Connected');
        // ... rest of your connectToMongoDB code
    } catch (error) {
        console.error('❌ MongoDB Connection Failed:', error.message);
        return false;
    }
}
