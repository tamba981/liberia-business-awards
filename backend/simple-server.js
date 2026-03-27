const express = require('express');
const app = express();
const PORT = process.env.PORT || 8080;

console.log('🚀 Starting simple test server...');
console.log('PORT:', PORT);
console.log('NODE_ENV:', process.env.NODE_ENV);

// Simple routes
app.get('/', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Test server is running!',
        timestamp: new Date().toISOString(),
        port: PORT,
        env: process.env.NODE_ENV
    });
});

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Health check passed!',
        timestamp: new Date().toISOString(),
        port: PORT
    });
});

app.get('/test', (req, res) => {
    res.json({ 
        status: 'ok', 
        message: 'Test route works!',
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Test server running on port ${PORT}`);
    console.log(`📍 URL: https://liberia-business-awards.up.railway.app`);
});
