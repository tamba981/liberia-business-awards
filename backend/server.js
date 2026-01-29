// SIMPLE WORKING SERVER FOR RENDER
console.log('🚀 Starting Liberia Business Awards Backend...');

const express = require('express');
const app = express();
const PORT = process.env.PORT || 10000;

// Basic middleware
app.use(express.json());

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
      health: '/api/health'
    }
  });
});

// Error handling
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🔗 Health: http://localhost:${PORT}/api/health`);
  console.log(`🌐 Frontend: ${process.env.FRONTEND_URL || 'Not set'}`);
});

// Handle errors
process.on('uncaughtException', (err) => {
  console.error('🔥 Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 Unhandled Rejection at:', promise, 'reason:', reason);
});

// Add this route in your backend
app.post('/api/form-submit', (req, res) => {
    try {
        console.log('📥 Form submission received:', req.body);
        
        // You can add database storage here later
        // For now, just log and respond
        
        res.json({
            success: true,
            message: 'Form received successfully',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error processing form:', error);
        res.status(500).json({
            success: false,
            message: 'Error processing form'
        });
    }
});
