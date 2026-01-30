// LIBERIA BUSINESS AWARDS BACKEND - ENHANCED VERSION WITH DUAL STORAGE
console.log('🚀 Starting Liberia Business Awards Backend Server...');

const express = require('express');
const mongoose = require('mongoose');
require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const app = express();
const PORT = process.env.PORT || 10000;

// ============ CONFIGURATION ============
const SUBMISSIONS_DIR = path.join(__dirname, 'submissions');
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/liberia-awards';

// ============ DATABASE SETUP ============
let isMongoConnected = false;

async function connectToMongoDB() {
    try {
        if (MONGODB_URI && !MONGODB_URI.includes('localhost')) {
            await mongoose.connect(MONGODB_URI, {
                useNewUrlParser: true,
                useUnifiedTopology: true
            });
            console.log('✅ Connected to MongoDB');
            isMongoConnected = true;
        } else {
            console.log('ℹ️ Using local file storage only (no MongoDB configured)');
            isMongoConnected = false;
        }
    } catch (err) {
        console.error('❌ MongoDB connection error:', err.message);
        console.log('⚠️ Falling back to file storage only');
        isMongoConnected = false;
    }
}

// ============ SCHEMA & MODELS ============
const formSubmissionSchema = new mongoose.Schema({
    form_type: String,
    form_data: Object,
    submission_source: String,
    ip_address: String,
    user_agent: String,
    saved_to_file: { type: Boolean, default: false },
    file_name: String,
    timestamp: { type: Date, default: Date.now }
});

const FormSubmission = mongoose.model('FormSubmission', formSubmissionSchema);

// ============ FILE STORAGE FUNCTIONS ============
async function ensureSubmissionsDir() {
    try {
        await fs.mkdir(SUBMISSIONS_DIR, { recursive: true });
        console.log(`📁 Submissions directory: ${SUBMISSIONS_DIR}`);
    } catch (error) {
        console.error('❌ Error creating submissions directory:', error);
    }
}

async function saveToFile(data) {
    try {
        await ensureSubmissionsDir();
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${data.form_type}-${timestamp}.json`;
        const filepath = path.join(SUBMISSIONS_DIR, filename);
        
        // Add metadata to the saved data
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

async function saveToDatabase(data, fileInfo = null) {
    if (!isMongoConnected) return { success: false, reason: 'MongoDB not connected' };
    
    try {
        const submission = new FormSubmission({
            form_type: data.form_type,
            form_data: data,
            submission_source: data.submission_source || 'liberia-business-awards-website',
            ip_address: null, // Will be set in middleware
            user_agent: null, // Will be set in middleware
            saved_to_file: fileInfo ? fileInfo.success : false,
            file_name: fileInfo ? fileInfo.filename : null
        });
        
        await submission.save();
        console.log(`💾 Saved to database with ID: ${submission._id}`);
        
        return { success: true, id: submission._id };
    } catch (error) {
        console.error('❌ Error saving to database:', error.message);
        return { success: false, error: error.message };
    }
}

// ============ MIDDLEWARE ============
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url} - ${new Date().toISOString()}`);
    next();
});

// CORS middleware
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

// Add IP and User-Agent to request
app.use((req, res, next) => {
    req.clientIp = req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    req.clientUserAgent = req.headers['user-agent'] || 'Unknown';
    next();
});

// ============ ROUTES ============

// 1. Health check endpoint
app.get('/api/health', async (req, res) => {
    try {
        const fileCount = await countFilesInDirectory(SUBMISSIONS_DIR);
        const dbCount = isMongoConnected ? await FormSubmission.countDocuments() : 0;
        
        res.json({
            status: 'OK',
            message: 'Liberia Business Awards Backend',
            timestamp: new Date().toISOString(),
            version: '2.1.0',
            storage: {
                database: isMongoConnected ? 'connected' : 'not_configured',
                file_system: 'active',
                submissions: {
                    database: dbCount,
                    files: fileCount,
                    total: dbCount + fileCount
                }
            },
            endpoints: [
                'GET  /api/health',
                'GET  /api/stats',
                'GET  /api/submissions',
                'POST /api/submit-form',
                'GET  /api/submit-form/test'
            ]
        });
    } catch (error) {
        res.status(500).json({
            status: 'ERROR',
            message: 'Health check failed',
            error: error.message
        });
    }
});

// 2. Statistics endpoint
app.get('/api/stats', async (req, res) => {
    try {
        const fileCount = await countFilesInDirectory(SUBMISSIONS_DIR);
        const recentFiles = await getRecentFiles(SUBMISSIONS_DIR, 10);
        
        let formTypeStats = {};
        if (isMongoConnected) {
            const stats = await FormSubmission.aggregate([
                { $group: { _id: "$form_type", count: { $sum: 1 } } }
            ]);
            stats.forEach(stat => {
                formTypeStats[stat._id] = stat.count;
            });
        }
        
        res.json({
            success: true,
            statistics: {
                total_submissions: fileCount + (isMongoConnected ? await FormSubmission.countDocuments() : 0),
                file_system: {
                    total_files: fileCount,
                    recent_files: recentFiles
                },
                database: {
                    connected: isMongoConnected,
                    total_records: isMongoConnected ? await FormSubmission.countDocuments() : 0,
                    by_form_type: formTypeStats
                }
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching statistics',
            error: error.message
        });
    }
});

// 3. Main form submission endpoint
app.post('/api/submit-form', async (req, res) => {
    try {
        console.log('📥 Form submission received:', req.body.form_type);
        
        // Validate required fields
        if (!req.body.form_type) {
            return res.status(400).json({
                success: false,
                message: 'Form type is required',
                error: 'Missing form_type field'
            });
        }
        
        // Add client info to request body
        req.body.client_ip = req.clientIp;
        req.body.client_user_agent = req.clientUserAgent;
        req.body.received_at = new Date().toISOString();
        
        // DUAL STORAGE: Save to file (always works)
        const fileResult = await saveToFile(req.body);
        
        // DUAL STORAGE: Save to database (if available)
        const dbResult = await saveToDatabase(req.body, fileResult);
        
        // Prepare response
        const response = {
            success: true,
            message: `Form '${req.body.form_type}' submitted successfully`,
            data_received: true,
            storage: {
                file_system: fileResult.success,
                database: dbResult.success,
                dual_backup: fileResult.success && dbResult.success ? 'active' : 'partial'
            },
            details: {
                file_name: fileResult.filename,
                database_id: dbResult.id,
                timestamp: new Date().toISOString(),
                form_type: req.body.form_type,
                fields_count: Object.keys(req.body).length
            }
        };
        
        console.log('✅ Response:', JSON.stringify(response, null, 2));
        res.json(response);
        
    } catch (error) {
        console.error('❌ Form submission error:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing form submission',
            error: error.message,
            note: 'Data may have been saved to file storage'
        });
    }
});

// 4. View submissions (with fallback to file listing)
app.get('/api/submissions', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const page = parseInt(req.query.page) || 1;
        const skip = (page - 1) * limit;
        
        if (isMongoConnected) {
            // Get from database
            const submissions = await FormSubmission.find()
                .sort({ timestamp: -1 })
                .skip(skip)
                .limit(limit);
            
            const total = await FormSubmission.countDocuments();
            
            res.json({
                success: true,
                source: 'database',
                pagination: {
                    page,
                    limit,
                    total,
                    pages: Math.ceil(total / limit)
                },
                count: submissions.length,
                submissions: submissions
            });
        } else {
            // Get from file system
            const files = await getRecentFiles(SUBMISSIONS_DIR, limit);
            const fileContents = [];
            
            for (const file of files) {
                try {
                    const content = await fs.readFile(path.join(SUBMISSIONS_DIR, file), 'utf8');
                    fileContents.push({
                        file_name: file,
                        data: JSON.parse(content)
                    });
                } catch (error) {
                    console.error(`Error reading file ${file}:`, error.message);
                }
            }
            
            res.json({
                success: true,
                source: 'file_system',
                count: fileContents.length,
                submissions: fileContents
            });
        }
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
        message: 'Liberia Business Awards Form API',
        status: 'Operational',
        version: '2.1.0',
        features: ['Dual storage', 'File backup', 'Database storage', 'Statistics'],
        test_submission: {
            method: 'POST',
            url: '/api/submit-form',
            headers: { 'Content-Type': 'application/json' },
            body: {
                form_type: 'test',
                name: 'Test User',
                email: 'test@example.com',
                message: 'This is a test submission'
            }
        }
    });
});

// 6. Download all submissions as backup
app.get('/api/backup', async (req, res) => {
    try {
        const files = await fs.readdir(SUBMISSIONS_DIR);
        const allData = [];
        
        for (const file of files) {
            if (file.endsWith('.json')) {
                try {
                    const content = await fs.readFile(path.join(SUBMISSIONS_DIR, file), 'utf8');
                    allData.push(JSON.parse(content));
                } catch (error) {
                    console.error(`Error reading file ${file}:`, error.message);
                }
            }
        }
        
        res.json({
            success: true,
            backup_date: new Date().toISOString(),
            file_count: files.length,
            data_count: allData.length,
            data: allData
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error creating backup',
            error: error.message
        });
    }
});

// 7. Catch-all 404
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        requested: `${req.method} ${req.originalUrl}`,
        available_endpoints: [
            'GET  /',
            'GET  /api/health',
            'GET  /api/stats',
            'GET  /api/submissions',
            'POST /api/submit-form',
            'GET  /api/backup',
            'GET  /api/submit-form/test'
        ]
    });
});

// ============ HELPER FUNCTIONS ============
async function countFilesInDirectory(dir) {
    try {
        const files = await fs.readdir(dir);
        return files.filter(file => file.endsWith('.json')).length;
    } catch (error) {
        return 0;
    }
}

async function getRecentFiles(dir, limit) {
    try {
        const files = await fs.readdir(dir);
        const jsonFiles = files.filter(file => file.endsWith('.json'));
        
        // Sort by creation time (newest first)
        const filesWithStats = await Promise.all(
            jsonFiles.map(async file => {
                const stat = await fs.stat(path.join(dir, file));
                return { file, mtime: stat.mtime };
            })
        );
        
        return filesWithStats
            .sort((a, b) => b.mtime - a.mtime)
            .slice(0, limit)
            .map(item => item.file);
    } catch (error) {
        return [];
    }
}

// ============ SERVER STARTUP ============
async function startServer() {
    // Initialize storage
    await ensureSubmissionsDir();
    await connectToMongoDB();
    
    // Start server
    app.listen(PORT, () => {
        console.log(`✅ Server running on port ${PORT}`);
        console.log(`🌐 Base URL: http://localhost:${PORT}`);
        console.log(`📨 Form endpoint: POST http://localhost:${PORT}/api/submit-form`);
        console.log(`📊 Stats endpoint: GET http://localhost:${PORT}/api/stats`);
        console.log(`💾 Storage: ${SUBMISSIONS_DIR}`);
        console.log(`🗄️  Database: ${isMongoConnected ? 'Connected' : 'File storage only'}`);
        console.log('🚀 Ready to receive form submissions!');
    });
}

// Error handling
process.on('unhandledRejection', (err) => {
    console.error('🔥 Unhandled Rejection:', err);
});

process.on('uncaughtException', (err) => {
    console.error('💥 Uncaught Exception:', err);
    process.exit(1);
});

// Start the server
startServer().catch(error => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
});
