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
            success: true
