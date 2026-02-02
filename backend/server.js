// LIBERIA BUSINESS AWARDS BACKEND - WITH MONGODB
console.log('🚀 Starting Liberia Business Awards Backend Server...');

const express = require('express');
const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');
const app = express();
const PORT = process.env.PORT || 10000;

// ============ CONFIGURATION ============
const MONGODB_URI = process.env.MONGODB_URI;
const SUBMISSIONS_DIR = path.join(__dirname, 'submissions');

// ============ DATABASE CONNECTION ============
let isMongoConnected = false;

async function connectToMongoDB() {
    if (!MONGODB_URI) {
        console.log('⚠️ MONGODB_URI not set. Using file storage only.');
        return false;
    }
    
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB Atlas');
        isMongoConnected = true;
        return true;
    } catch (error) {
        console.error('❌ MongoDB connection error:', error.message);
        console.log('⚠️ Falling back to file storage only');
        return false;
    }
}

// ============ MONGOOSE SCHEMA ============
const formSubmissionSchema = new mongoose.Schema({
    form_type: String,
    form_data: Object,
    submission_source: String,
    received_at: { type: Date, default: Date.now }
});

const FormSubmission = mongoose.model('FormSubmission', formSubmissionSchema);

// ============ FILE STORAGE ============
async function saveToFile(data) {
    try {
        await fs.mkdir(SUBMISSIONS_DIR, { recursive: true });
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${data.form_type}-${timestamp}.json`;
        const filepath = path.join(SUBMISSIONS_DIR, filename);
        
        const dataToSave = {
            ...data,
            _saved_at: new Date().toISOString(),
            _storage: 'file'
        };
        
        await fs.writeFile(filepath, JSON.stringify(dataToSave, null, 2));
        console.log(`💾 Saved to file: ${filename}`);
        return { success: true, filename };
    } catch (error) {
        console.error('❌ Error saving to file:', error.message);
        return { success: false, error: error.message };
    }
}

async function saveToDatabase(data) {
    if (!isMongoConnected) {
        return { success: false, reason: 'MongoDB not connected' };
    }
    
    try {
        const submission = new FormSubmission({
            form_type: data.form_type,
            form_data: data,
            submission_source: data.submission_source || 'liberia-business-awards-website'
        });
        
        await submission.save();
        console.log(`💾 Saved to database ID: ${submission._id}`);
        return { success: true, id: submission._id };
    } catch (error) {
        console.error('❌ Error saving to database:', error.message);
        return { success: false, error: error.message };
    }
}

// ============ MIDDLEWARE ============
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS
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
    
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    next();
});

// ============ ROUTES ============

// Health check
app.get('/api/health', async (req, res) => {
    const dbStatus = isMongoConnected ? 'connected' : 'disconnected';
    let fileCount = 0;
    let dbCount = 0;
    
    try {
        const files = await fs.readdir(SUBMISSIONS_DIR);
        fileCount = files.filter(f => f.endsWith('.json')).length;
    } catch { /* Directory doesn't exist yet */ }
    
    if (isMongoConnected) {
        try {
            dbCount = await FormSubmission.countDocuments();
        } catch { /* Ignore */ }
    }
    
    res.json({
        status: 'OK',
        message: 'Liberia Business Awards Backend',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        storage: {
            database: dbStatus,
            file_system: 'active',
            submissions: {
                database: dbCount,
                files: fileCount,
                total: dbCount + fileCount
            }
        }
    });
});

// Form submission
app.post('/api/submit-form', async (req, res) => {
    try {
        console.log('📥 Form submission received:', req.body.form_type);
        
        if (!req.body.form_type) {
            return res.status(400).json({
                success: false,
                message: 'Form type is required'
            });
        }
        
        // Add timestamp
        req.body.received_at = new Date().toISOString();
        
        // Save to file (always works)
        const fileResult = await saveToFile(req.body);
        
        // Save to database (if available)
        const dbResult = await saveToDatabase(req.body);
        
        // Response
        const response = {
            success: true,
            message: `Form '${req.body.form_type}' submitted successfully`,
            storage: {
                file_system: fileResult.success,
                database: dbResult.success,
                dual_backup: fileResult.success && dbResult.success
            },
            details: {
                timestamp: new Date().toISOString(),
                form_type: req.body.form_type,
                fields_count: Object.keys(req.body).length
            }
        };
        
        if (fileResult.success && fileResult.filename) {
            response.details.file_name = fileResult.filename;
        }
        
        if (dbResult.success && dbResult.id) {
            response.details.database_id = dbResult.id;
        }
        
        console.log('✅ Response:', JSON.stringify(response, null, 2));
        res.json(response);
        
    } catch (error) {
        console.error('❌ Form submission error:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing form',
            error: error.message
        });
    }
});

// Homepage
app.get('/', (req, res) => {
    res.json({
        message: 'Welcome to Liberia Business Awards API',
        version: '2.0.0',
        endpoints: [
            'GET  /',
            'GET  /api/health',
            'POST /api/submit-form',
            'GET  /api/submit-form/test'
        ]
    });
});

// Test endpoint
app.get('/api/submit-form/test', (req, res) => {
    res.json({
        message: 'API is working',
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        available: ['/', '/api/health', '/api/submit-form']
    });
});

// ============ START SERVER ============
async function startServer() {
    await connectToMongoDB();
    
    app.listen(PORT, () => {
        console.log(`✅ Server running on port ${PORT}`);
        console.log(`🌐 URL: http://localhost:${PORT}`);
        console.log(`📨 Endpoint: POST /api/submit-form`);
        console.log(`🗄️  MongoDB: ${isMongoConnected ? '✅ Connected' : '❌ Not connected'}`);
        console.log(`💾 File storage: ${SUBMISSIONS_DIR}`);
    });
}

// Error handlers
process.on('unhandledRejection', (err) => {
    console.error('🔥 Unhandled Rejection:', err);
});

startServer().catch(console.error);
