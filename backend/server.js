// LIBERIA BUSINESS AWARDS BACKEND - SIMPLE & WORKING VERSION
console.log('🚀 Starting Liberia Business Awards Backend Server...');

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const app = express();
const PORT = process.env.PORT || 10000;

// Create submissions directory
const SUBMISSIONS_DIR = path.join(__dirname, 'submissions');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS configuration
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

// 1. Homepage
app.get('/', (req, res) => {
    res.json({
        message: 'Welcome to Liberia Business Awards API',
        version: '1.0.0',
        endpoints: [
            'GET  /',
            'GET  /api/health',
            'GET  /api/submit-form (info)',
            'POST /api/submit-form (submit data)',
            'GET  /api/stats',
            'GET  /api/submit-form/test'
        ]
    });
});

// 2. Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'Liberia Business Awards Backend',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        uptime: process.uptime()
    });
});

// 3. Form submission info
app.get('/api/submit-form', (req, res) => {
    res.json({
        message: 'Form submission endpoint',
        instructions: 'Use POST method to submit form data',
        example: {
            method: 'POST',
            url: '/api/submit-form',
            headers: { 'Content-Type': 'application/json' },
            body: {
                form_type: 'contact',
                name: 'John Doe',
                email: 'john@example.com'
            }
        }
    });
});

// 4. Save submission to file
async function saveSubmissionToFile(data) {
    try {
        // Create directory if it doesn't exist
        await fs.mkdir(SUBMISSIONS_DIR, { recursive: true });
        
        // Create filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `${data.form_type}-${timestamp}.json`;
        const filepath = path.join(SUBMISSIONS_DIR, filename);
        
        // Add metadata
        const dataToSave = {
            ...data,
            received_at: new Date().toISOString(),
            saved_at: new Date().toISOString()
        };
        
        // Save the data
        await fs.writeFile(filepath, JSON.stringify(dataToSave, null, 2));
        
        console.log(`💾 Saved submission to: ${filename}`);
        return { success: true, filename };
    } catch (error) {
        console.error('❌ Error saving submission:', error.message);
        return { success: false, error: error.message };
    }
}

// 5. Main form submission endpoint
app.post('/api/submit-form', async (req, res) => {
    try {
        console.log('📥 Form submission received:', req.body.form_type);
        
        // Validate
        if (!req.body.form_type) {
            return res.status(400).json({
                success: false,
                message: 'Form type is required',
                error: 'Missing form_type field'
            });
        }
        
        // Save to file
        const saveResult = await saveSubmissionToFile(req.body);
        
        // Response
        const response = {
            success: true,
            message: `Form '${req.body.form_type}' submitted successfully`,
            data_received: true,
            saved_to_file: saveResult.success,
            timestamp: new Date().toISOString(),
            form_type: req.body.form_type,
            fields_count: Object.keys(req.body).length
        };
        
        if (saveResult.success && saveResult.filename) {
            response.file_name = saveResult.filename;
        }
        
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

// 6. Statistics endpoint
app.get('/api/stats', async (req, res) => {
    try {
        let fileCount = 0;
        try {
            const files = await fs.readdir(SUBMISSIONS_DIR);
            fileCount = files.filter(file => file.endsWith('.json')).length;
        } catch (error) {
            // Directory doesn't exist yet
            fileCount = 0;
        }
        
        res.json({
            success: true,
            stats: {
                total_submissions: fileCount,
                storage_type: 'file_system',
                directory: SUBMISSIONS_DIR
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

// 7. Test endpoint
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

// 8. Catch-all 404
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Endpoint not found',
        requested: `${req.method} ${req.originalUrl}`,
        available_endpoints: [
            'GET  /',
            'GET  /api/health',
            'GET  /api/submit-form',
            'POST /api/submit-form',
            'GET  /api/stats',
            'GET  /api/submit-form/test'
        ]
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🌐 Base URL: http://localhost:${PORT}`);
    console.log(`📨 Form endpoint: POST http://localhost:${PORT}/api/submit-form`);
    console.log(`📊 Stats endpoint: GET http://localhost:${PORT}/api/stats`);
    console.log(`💾 Storage: ${SUBMISSIONS_DIR}`);
    console.log('🚀 Ready to receive form submissions!');
});

// Error handling
process.on('unhandledRejection', (err) => {
    console.error('🔥 Unhandled Rejection:', err);
});
