// LIBERIA BUSINESS AWARDS BACKEND - DEBUG VERSION
console.log('🚀 Starting Liberia Business Awards Backend Server...');

const express = require('express');
const mongoose = require('mongoose');
const app = express();
const PORT = process.env.PORT || 10000;

// ============ CONFIGURATION ============
const MONGODB_URI = process.env.MONGODB_URI;

console.log('🔧 ENVIRONMENT CHECK:');
console.log('   PORT:', PORT);
console.log('   NODE_ENV:', process.env.NODE_ENV);
console.log('   MONGODB_URI present:', !!MONGODB_URI);

// Mask URI for security in logs
if (MONGODB_URI) {
    const maskedURI = MONGODB_URI.replace(/:\/\/[^:]+:[^@]+@/, '://***:***@');
    console.log('   MONGODB_URI (masked):', maskedURI);
}

// ============ MONGODB CONNECTION ============
async function connectToMongoDB() {
    if (!MONGODB_URI) {
        console.log('❌ MONGODB_URI not found in environment variables');
        console.log('💡 Add MONGODB_URI to Render environment variables');
        return false;
    }
    
    console.log('🔄 Attempting MongoDB connection...');
    
    try {
        // Use mongoose with detailed options
        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
            family: 4, // Force IPv4
            maxPoolSize: 10,
        });
        
        console.log('✅ MongoDB Connection SUCCESS!');
        console.log('📊 Connection State:', mongoose.connection.readyState);
        console.log('🏷️  Database Name:', mongoose.connection.name || 'Not specified');
        console.log('👤 Connected as:', mongoose.connection.client?.s?.auth?.user || 'Unknown');
        
        return true;
    } catch (error) {
        console.error('❌ MongoDB Connection FAILED!');
        console.error('   Error:', error.message);
        console.error('   Code:', error.code);
        console.error('   Name:', error.name);
        
        // Detailed error analysis
        if (error.message.includes('bad auth') || error.message.includes('authentication')) {
            console.log('\n🔐 AUTHENTICATION FAILURE DIAGNOSIS:');
            console.log('   1. Check username/password in MongoDB Atlas');
            console.log('   2. Verify user "liberia-admin" exists and is active');
            console.log('   3. Try resetting password in MongoDB Atlas');
            console.log('   4. URL encode special characters in password (! → %21)');
        } else if (error.message.includes('ENOTFOUND')) {
            console.log('\n🌐 NETWORK FAILURE:');
            console.log('   1. Check cluster URL: cluster0.9outgyt.mongodb.net');
            console.log('   2. Verify network access allows 0.0.0.0/0');
        } else if (error.message.includes('whitelist')) {
            console.log('\n🛡️ IP WHITELIST ISSUE:');
            console.log('   1. Go to MongoDB Atlas → Network Access');
            console.log('   2. Add 0.0.0.0/0 (allow from anywhere)');
        }
        
        return false;
    }
}

// ============ DATABASE SCHEMA ============
const formSchema = new mongoose.Schema({
    form_type: { type: String, required: true },
    data: { type: Object, required: true },
    submitted_at: { type: Date, default: Date.now }
});

const Form = mongoose.model('Form', formSchema);

// ============ MIDDLEWARE ============
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS - Simplified
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    next();
});

// ============ ROUTES ============

// Debug endpoint
app.get('/api/debug', async (req, res) => {
    const isConnected = mongoose.connection.readyState === 1;
    
    let testResult = null;
    if (isConnected) {
        try {
            const testDoc = await Form.create({ 
                form_type: 'debug-test',
                data: { test: true, timestamp: new Date().toISOString() }
            });
            testResult = { id: testDoc._id, created: true };
        } catch (error) {
            testResult = { error: error.message };
        }
    }
    
    res.json({
        timestamp: new Date().toISOString(),
        server: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            node: process.version
        },
        mongodb: {
            connection_string_provided: !!MONGODB_URI,
            ready_state: mongoose.connection.readyState,
            state_description: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown',
            is_connected: isConnected,
            test_operation: testResult
        },
        environment: {
            keys: Object.keys(process.env).filter(k => k.includes('MONGO') || k.includes('DB') || k === 'NODE_ENV' || k === 'PORT')
        }
    });
});

// Health check
app.get('/api/health', async (req, res) => {
    const isConnected = mongoose.connection.readyState === 1;
    let count = 0;
    
    if (isConnected) {
        try {
            count = await Form.countDocuments();
        } catch (e) {
            // Ignore count errors
        }
    }
    
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        database: isConnected ? 'connected' : 'disconnected',
        submissions: count,
        mongodb_uri_provided: !!MONGODB_URI
    });
});

// Form submission (simplified)
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

// Homepage
app.get('/', (req, res) => {
    res.json({
        service: 'Liberia Business Awards API',
        version: '2.1.0',
        status: 'operational',
        endpoints: [
            'GET  /',
            'GET  /api/health',
            'GET  /api/debug',
            'POST /api/submit-form'
        ],
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// ============ START SERVER ============
async function startServer() {
    console.log('\n' + '='.repeat(50));
    console.log('🚀 SERVER STARTUP SEQUENCE');
    console.log('='.repeat(50));
    
    const connected = await connectToMongoDB();
    
    app.listen(PORT, () => {
        console.log('\n' + '='.repeat(50));
        console.log('✅ SERVER RUNNING');
        console.log('='.repeat(50));
        console.log(`📡 Port: ${PORT}`);
        console.log(`🌐 Local: http://localhost:${PORT}`);
        console.log(`🌍 Public: https://liberia-business-awards-backend.onrender.com`);
        console.log(`🗄️  MongoDB: ${connected ? '✅ CONNECTED' : '❌ DISCONNECTED'}`);
        console.log(`🔗 Connection string: ${MONGODB_URI ? 'Provided' : 'Missing'}`);
        console.log('='.repeat(50));
        
        if (!connected && MONGODB_URI) {
            console.log('\n🔧 TROUBLESHOOTING REQUIRED:');
            console.log('   1. Check /api/debug for detailed error info');
            console.log('   2. Verify MongoDB Atlas user credentials');
            console.log('   3. Ensure Network Access allows 0.0.0.0/0');
            console.log('   4. Test connection string format');
        }
    });
}

// Error handling
process.on('unhandledRejection', (err) => {
    console.error('🔥 UNHANDLED REJECTION:', err);
    console.error('Stack:', err.stack);
});

process.on('uncaughtException', (err) => {
    console.error('💥 UNCAUGHT EXCEPTION:', err);
    console.error('Stack:', err.stack);
    process.exit(1);
});

// Start server
startServer().catch(err => {
    console.error('❌ SERVER STARTUP FAILED:', err);
    process.exit(1);
});
