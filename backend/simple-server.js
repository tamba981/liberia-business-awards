const express = require('express');
const app = express();
const PORT = process.env.PORT || 8080;

// CORS - Allow all origins for testing
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running!', timestamp: new Date().toISOString() });
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Health check passed!', timestamp: new Date().toISOString() });
});

app.get('/test', (req, res) => {
    res.json({ status: 'ok', message: 'Test route works!' });
});

app.get('/ping', (req, res) => {
    res.json({ status: 'ok', message: 'pong' });
});

// Add the login endpoint for testing
app.post('/api/auth/admin/login', express.json(), (req, res) => {
    const { email, password } = req.body;
    console.log('Login attempt:', email);
    
    // Simple test credentials
    if (email === 'admin@liberiabusinessawardslr.com' && password === 'Admin123!') {
        res.json({
            success: true,
            token: 'test-token-123',
            user: {
                id: 'admin-1',
                email: email,
                name: 'Admin User',
                role: 'admin'
            }
        });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Test server running on port ${PORT}`);
    console.log(`📍 URL: https://liberia-business-awards.up.railway.app`);
});
