// LIBERIA BUSINESS AWARDS BACKEND - SIMPLE VERSION
console.log('🚀 Starting Liberia Business Awards Backend Server...');

const express = require('express');
const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simple CORS - allow all origins for now
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    next();
});

// ============ ROUTES ============

// 1. Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'Liberia Business Awards Backend',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// 2. Homepage
app.get('/', (req, res) => {
    res.json({
        message: 'Welcome to Liberia Business Awards API',
        endpoints: [
            'GET  /api/health',
            'GET  /api/submit-form (info)',
            'POST /api/submit-form (submit data)',
            'GET  /api/submit-form/test'
        ]
    });
});

// 3. Form submission GET (info page)
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

// 4. Form submission POST (actual submission)
app.post('/api/submit-form', (req, res) => {
    try {
        console.log('📥 Form submission received:', req.body.form_type);
        
        const response = {
            success: true,
            message: `Form '${req.body.form_type || 'unknown'}' submitted successfully`,
            data_received: true,
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
            'GET  /api/submit-form/test'
        ]
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`🌐 Base URL: http://localhost:${PORT}`);
    console.log(`📨 Form endpoint: POST http://localhost:${PORT}/api/submit-form`);
});

// Error handling
process.on('unhandledRejection', (err) => {
    console.error('🔥 Unhandled Rejection:', err);
});
