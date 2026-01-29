// SIMPLE WORKING SERVER FOR RENDER
console.log('🚀 Starting Liberia Business Awards Backend...');

const express = require('express');
const cors = require('cors'); // ADD THIS
const app = express();
const PORT = process.env.PORT || 10000;

// =============== MIDDLEWARE ===============
app.use(cors()); // ADD THIS - allows your website to connect
app.use(express.json());

// =============== ROUTES ===============
// Health check endpoint
app.get('/api/health', (req, res) => {
  console.log('📡 Health check requested');
  res.json({ 
    status: 'OK', 
    message: 'Liberia Business Awards Backend',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
    port: PORT
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Welcome to Liberia Business Awards API',
    endpoints: {
      health: '/api/health',
      submit_form: 'POST /api/submit-form',
      test_form: 'GET /api/submit-form/test'
    },
    version: '1.0.0',
    frontend: 'https://liberiabusinessawardslr.com'
  });
});

// =============== FORM SUBMISSION ENDPOINT ===============
app.post('/api/submit-form', (req, res) => {
    try {
        const formData = req.body;
        const formType = formData.form_type || 'unknown';
        
        console.log('📥 FORM SUBMISSION RECEIVED:');
        console.log('Form Type:', formType);
        console.log('Timestamp:', new Date().toISOString());
        console.log('Data received:', Object.keys(formData).length, 'fields');
        
        // For security, don't log sensitive data in production
        if (process.env.NODE_ENV !== 'production') {
            console.log('Full data (development only):', formData);
        }
        
        // TODO: Add these features later:
        // 1. Store in database (MongoDB)
        // 2. Send email notifications
        // 3. Validate form data
        
        // Response
        const response = {
            success: true,
            message: `Form '${formType}' received successfully`,
            form_type: formType,
            received_at: new Date().toISOString(),
            data_received: true,
            fields_received: Object.keys(formData).length,
            backend_version: '1.0.0'
        };
        
        console.log('✅ Sending response:', response.message);
        res.json(response);
        
    } catch (error) {
        console.error('❌ Error processing form submission:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing form submission',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Test endpoint for debugging
app.get('/api/submit-form/test', (req, res) => {
    res.json({
        message: 'Form submission endpoint is ready!',
        endpoint: 'POST /api/submit-form',
        methods_allowed: ['POST'],
        example_payload: {
            form_type: 'contact',
            name: 'John Doe',
            email: 'john@example.com',
            message: 'Test message'
        },
        cors: 'Enabled for all origins'
    });
});

// =============== ERROR HANDLING (MUST BE LAST!) ===============
// 404 handler - THIS MUST COME AFTER ALL OTHER ROUTES
app.use((req, res) => {
  console.log('❌ 404 Not found:', req.method, req.url);
  res.status(404).json({ 
    error: 'Not found',
    path: req.url,
    method: req.method,
    available_endpoints: [
      'GET /',
      'GET /api/health',
      'POST /api/submit-form',
      'GET /api/submit-form/test'
    ]
  });
});

// =============== START SERVER ===============
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🔗 Health: http://localhost:${PORT}/api/health`);
  console.log(`🌐 Frontend: https://liberiabusinessawardslr.com`);
  console.log(`📨 Form endpoint: POST http://localhost:${PORT}/api/submit-form`);
});

// Handle errors
process.on('uncaughtException', (err) => {
  console.error('🔥 Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 Unhandled Rejection at:', promise, 'reason:', reason);
});
