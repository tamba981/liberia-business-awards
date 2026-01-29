
// Load environment variables for Render.com
if (process.env.NODE_ENV === 'production') {
  // Render.com provides PORT environment variable
  console.log('🚀 Running in PRODUCTION mode on Render.com');
} else {
  require('dotenv').config();
  console.log('🔧 Running in DEVELOPMENT mode locally');
}

// Load environment variables
if (process.env.NODE_ENV === 'production') {
  require('dotenv').config({ path: '.env.production' });
} else {
  require('dotenv').config();
}

// Liberia Business Awards Backend Server
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

// Initialize Express app
const app = express();

// ======================
// MIDDLEWARE
// ======================
app.use(helmet());
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ======================
// FIREBASE INITIALIZATION
// ======================
try {
    const { auth } = require('./config/firebase.config');
    if (auth) {
        console.log('✅ Firebase Admin available');
    }
} catch (error) {
    console.log('⚠️  Firebase not configured: ' + error.message);
}

// ======================
// API ROUTES
// ======================
const authRoutes = require('./routes/auth.routes');
app.use('/api/auth', authRoutes);

// ======================
// BASIC ROUTES
// ======================

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        service: 'Liberia Business Awards Backend',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Welcome endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to Liberia Business Awards API',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth'
    }
  });
});

// ======================
// ERROR HANDLING
// ======================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message
  });
});

// ======================
// START SERVER
// ======================
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log('🚀 Liberia Business Awards Backend Server running:');
  console.log('   📍 Port: ' + PORT);
  console.log('   🔗 Local: http://localhost:' + PORT);
  console.log('   📊 Health: http://localhost:' + PORT + '/api/health');
  console.log('   🌐 Environment: ' + (process.env.NODE_ENV || 'development'));
});