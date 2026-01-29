// SIMPLE WORKING SERVER FOR RENDER
console.log('🚀 Starting Liberia Business Awards Backend...');

const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 10000;

// =============== MIDDLEWARE ===============
app.use(cors());
app.use(express.json());

// Debug middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// =============== ROUTES ===============
// Health check endpoint
app.get('/api/health', (req, res) => {
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
      health: 'GET /api/health',
      submit_form: 'POST /api/submit-form',
      test_form: 'GET /api/submit-form/test',
      auth_test: 'GET /api/auth/test'
    }
  });
});

// Auth test endpoint
app.get('/api/auth/test', (req, res) => {
  res.json({
    message: 'Authentication test endpoint',
    status: 'Not implemented yet',
    future: 'Will integrate Firebase Auth here'
  });
});

// =============== FORM SUBMISSION ENDPOINTS ===============
// GET endpoint for testing
app.get('/api/submit-form', (req, res) => {
  res.json({
    message: 'Form submission endpoint',
    instructions: 'Use POST method to submit forms',
    endpoint: 'POST /api/submit-form',
    cors: 'Enabled',
    example_curl: `curl -X POST https://liberia-business-awards-backend.onrender.com/api/submit-form -H "Content-Type: application/json" -d '{"form_type":"test","name":"Test"}'`
  });
});

// POST endpoint for actual submissions
app.post('/api/submit-form', (req, res) => {
    try {
        const formData = req.body;
        const formType = formData.form_type || 'unknown';
        
        console.log('📥 FORM SUBMISSION RECEIVED via POST:');
        console.log('Form Type:', formType);
        console.log('Data fields:', Object.keys(formData));
        
        const response = {
            success: true,
            message: `Form '${formType}' received successfully`,
            form_type: formType,
            received_at: new Date().toISOString(),
            data_received: true,
            backend_version: '1.0.0'
        };
        
        console.log('✅ Response:', response.message);
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

// Test endpoint for debugging
app.get('/api/submit-form/test', (req, res) => {
    res.json({
        message: 'Form submission endpoint is ready!',
        test: 'Send a POST request to /api/submit-form',
        example: {
            form_type: 'contact',
            name: 'John Doe',
            email: 'john@example.com'
        }
    });
});

// =============== 404 HANDLER (LAST!) ===============
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Endpoint not found',
    requested: `${req.method} ${req.url}`,
    available_endpoints: [
      'GET /',
      'GET /api/health',
      'GET /api/auth/test',
      'GET /api/submit-form (info)',
      'POST /api/submit-form (submit data)',
      'GET /api/submit-form/test'
    ]
  });
});

// =============== START SERVER ===============
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🌐 Available at: https://liberia-business-awards-backend.onrender.com`);
  console.log(`📨 Form endpoint ready: POST /api/submit-form`);
});

