// LIBERIA BUSINESS AWARDS BACKEND - ENHANCED VERSION WITH DATABASE
console.log('🚀 Starting Liberia Business Awards Backend Server...');

const express = require('express');
const mongoose = require('mongoose');
require('dotenv').config();
const app = express();
const PORT = process.env.PORT || 10000;

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/liberia-awards';

mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

// Form Submission Schema
const formSubmissionSchema = new mongoose.Schema({
    form_type: String,
    form_data: Object,
    submission_source: String,
    ip_address: String,
    user_agent: String,
    timestamp: { type: Date, default: Date.now }
});

const FormSubmission = mongoose.model('FormSubmission', formSubmissionSchema);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// PROPER CORS HANDLING
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
const fs = require('fs').promises;
const path = require('path');

// Create submissions directory
const SUBMISSIONS_DIR = path.join(__dirname, 'submissions');

// Function to save submission to file
async function saveSubmission(data) {
    try {
        // Create directory if it doesn't exist
        await fs.mkdir(SUBMISSIONS_DIR, { recursive: true });
        
        // Create filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${data.form_type}-${timestamp}.json`;
        const filepath = path.join(SUBMISSIONS_DIR, filename);
        
        // Save the data
        await fs.writeFile(filepath, JSON.stringify(data, null, 2));
        
        console.log(`💾 Saved submission to: ${filename}`);
        return filename;
    } catch (error) {
        console.error('❌ Error saving submission:', error);
        return null;
    }
}
// ============ ROUTES ============

// 1. Health check with DB status
app.get('/api/health', async (req, res) => {
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    
    res.json({
        status: 'OK',
        message: 'Liberia Business Awards Backend',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        database: dbStatus,
        submissions_count: await FormSubmission.countDocuments()
    });
});

// 2. Homepage
app.get('/', (req, res) => {
    res.json({
        message: 'Welcome to Liberia Business Awards API',
        version: '2.0.0',
        features: ['Form storage', 'Database backup', 'Analytics'],
        endpoints: [
            'GET  /api/health',
            'GET  /api/submit-form (info)',
            'POST /api/submit-form (submit data)',
            'GET  /api/submissions (view submissions)',
            'GET  /api/submit-form/test'
        ]
    });
});

// 3. Form submission POST (store in database)
app.post('/api/submit-form', async (req, res) => {
    try {
        console.log('📥 Form submission received:', req.body.form_type);
        
        // Create new submission record
        const submission = new FormSubmission({
            form_type: req.body.form_type,
            form_data: req.body,
            submission_source: req.body.submission_source || 'liberia-business-awards-website',
            ip_address: req.ip || req.headers['x-forwarded-for'],
            user_agent: req.headers['user-agent']
        });
        
        // Save to database
        await submission.save();
        
        const response = {
            success: true,
            message: `Form '${req.body.form_type}' submitted and stored successfully`,
            data_received: true,
            submission_id: submission._id,
            timestamp: new Date().toISOString(),
            form_type: req.body.form_type,
            fields_count: Object.keys(req.body).length
        };
        
        console.log('✅ Response:', response);
        res.json(response);
        
    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing form',
            error: error.message
        });
    }
});

// 4. View all submissions (protected - for admin)
app.get('/api/submissions', async (req, res) => {
    try {
        const submissions = await FormSubmission.find()
            .sort({ timestamp: -1 })
            .limit(100);
        
        res.json({
            success: true,
            count: submissions.length,
            submissions: submissions
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching submissions',
            error: error.message
        });
    }
});

// 5. Test endpoint
app.get('/api/submit-form/test', (req, res) => {
    res.json({
        message: 'Form endpoint test successful',
        status: 'Ready to receive submissions',
        test_data: {
            form_type: 'test',
            name: 'Test User',
            email: 'test@example.com'
        }
    });
});

// 6. Catch-all 404
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        requested: `${req.method} ${req.originalUrl}`,
        available_endpoints: [
            'GET  /',
            'GET  /api/health',
            'GET  /api/submit-form',
            'POST /api/submit-form',
            'GET  /api/submissions',
            'GET  /api/submit-form/test'
        ]
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🌐 Base URL: http://localhost:${PORT}`);
    console.log(`📨 Form endpoint: POST http://localhost:${PORT}/api/submit-form`);
    console.log(`🗄️  Database: ${MONGODB_URI}`);
});

// Error handling
process.on('unhandledRejection', (err) => {
    console.error('🔥 Unhandled Rejection:', err);
});
