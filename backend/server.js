// LIBERIA BUSINESS AWARDS BACKEND - GUARANTEED WORKING
console.log('🚀 Starting Liberia Business Awards Backend Server...');

const express = require('express');
const mongoose = require('mongoose');
const app = express();
const PORT = process.env.PORT || 10000;

// ============ MONGODB CONNECTION ============
const MONGODB_URI = process.env.MONGODB_URI;

console.log('📡 MongoDB Connection Attempt:');
console.log('   URI Present:', !!MONGODB_URI);

async function connectToMongoDB() {
    if (!MONGODB_URI) {
        console.log('❌ ERROR: MONGODB_URI environment variable is missing');
        console.log('💡 Fix: Add MONGODB_URI to Render Environment Variables');
        return false;
    }
    
    console.log('   Connecting with URI (password masked):', 
        MONGODB_URI.replace(/:[^:@]*@/, ':****@'));
    
    try {
        // SIMPLEST POSSIBLE CONNECTION - NO EXTRA OPTIONS
        await mongoose.connect(MONGODB_URI);
        
        console.log('✅ SUCCESS: Connected to MongoDB Atlas!');
        console.log('   Connection State:', mongoose.connection.readyState);
        console.log('   Host:', mongoose.connection.host);
        
        return true;
    } catch (error) {
        console.error('❌ CRITICAL ERROR: MongoDB connection failed');
        console.error('   Error:', error.message);
        console.error('   Code:', error.code);
        
        // SPECIFIC FIXES BASED ON ERROR
        if (error.message.includes('bad auth')) {
            console.log('💡 FIX: Wrong username/password. Check:');
            console.log('   1. Username: liberia-admin');
            console.log('   2. Password: Motiva6060');
            console.log('   3. User exists in MongoDB Atlas → Database Access');
        } else if (error.message.includes('whitelist')) {
            console.log('💡 FIX: IP not allowed. Check:');
            console.log('   1. MongoDB Atlas → Network Access');
            console.log('   2. Add 0.0.0.0/0 (allow from anywhere)');
        } else if (error.message.includes('ENOTFOUND')) {
            console.log('💡 FIX: Invalid cluster URL. Check:');
            console.log('   1. Cluster URL: cluster0.9outgyt.mongodb.net');
            console.log('   2. Get exact URL from MongoDB Atlas Connect button');
        }
        
        return false;
    }
}

// ============ SIMPLE SCHEMA ============
const SubmissionSchema = new mongoose.Schema({
    form_type: String,
    data: Object,
    timestamp: { type: Date, default: Date.now }
});
const Submission = mongoose.model('Submission', SubmissionSchema);

// ============ MIDDLEWARE ============
app.use(express.json());
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

// ============ ROUTES ============

// TEST ENDPOINT - FORCE MONGODB CONNECTION
app.get('/api/test', async (req, res) => {
    const isConnected = mongoose.connection.readyState === 1;
    
    if (!isConnected) {
        // Try to reconnect
        const reconnected = await connectToMongoDB();
        if (!reconnected) {
            return res.json({
                success: false,
                message: 'MongoDB not connected',
                error: 'Connection failed',
                connection_string: MONGODB_URI ? 'Present' : 'Missing'
            });
        }
    }
    
    // Try to create a document
    try {
        const testDoc = await Submission.create({
            form_type: 'test',
            data: { test: true, time: new Date().toISOString() }
        });
        
        res.json({
            success: true,
            message: 'MongoDB WORKING!',
            connected: true,
            document_id: testDoc._id,
            total_documents: await Submission.countDocuments()
        });
    } catch (error) {
        res.json({
            success: false,
            message: 'MongoDB connection works but save failed',
            error: error.message,
            connected: true
        });
    }
});

// HEALTH CHECK
app.get('/api/health', (req, res) => {
    const isConnected = mongoose.connection.readyState === 1;
    
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        database: isConnected ? 'connected' : 'disconnected',
        mongodb_uri_provided: !!MONGODB_URI,
        connection_state: mongoose.connection.readyState
    });
});

// FORM SUBMISSION
app.post('/api/submit-form', async (req, res) => {
    const isConnected = mongoose.connection.readyState === 1;
    
    if (!isConnected) {
        // Still accept form even if MongoDB is down
        return res.json({
            success: true,
            message: 'Form received (MongoDB offline)',
            saved_to_mongodb: false,
            mongodb_connected: false,
            data: req.body
        });
    }
    
    try {
        const submission = await Submission.create({
            form_type: req.body.form_type || 'unknown',
            data: req.body
        });
        
        res.json({
            success: true,
            message: 'Form saved to MongoDB!',
            saved_to_mongodb: true,
            mongodb_connected: true,
            document_id: submission._id,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.json({
            success: true,
            message: 'Form received (MongoDB save error)',
            saved_to_mongodb: false,
            mongodb_connected: true,
            error: error.message
        });
    }
});

// HOME
app.get('/', (req, res) => {
    res.json({
        message: 'Liberia Business Awards API',
        status: 'Operational',
        mongodb: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
        endpoints: [
            'GET  /api/health',
            'GET  /api/test',
            'POST /api/submit-form'
        ]
    });
});

// ============ START SERVER ============
async function startServer() {
    console.log('🔧 Server Configuration:');
    console.log('   Port:', PORT);
    console.log('   Node:', process.version);
    
    // Connect to MongoDB
    await connectToMongoDB();
    
    // Start server
    app.listen(PORT, () => {
        console.log(`✅ Server running on port ${PORT}`);
        console.log(`🌐 URL: https://liberia-business-awards-backend.onrender.com`);
        console.log(`🧪 Test: GET /api/test`);
        console.log(`📨 Submit: POST /api/submit-form`);
        console.log(`💪 Status: GET /api/health`);
        console.log(`🗄️  MongoDB: ${mongoose.connection.readyState === 1 ? '✅ CONNECTED' : '❌ DISCONNECTED'}`);
    });
}

// Handle errors
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
});

// Start
startServer().catch(err => {
    console.error('Failed to start:', err);
    process.exit(1);
});
