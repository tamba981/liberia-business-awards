const express = require('express');
const router = express.Router();

// Test authentication route
router.get('/test', (req, res) => {
  res.json({ 
    message: 'Authentication routes working!',
    timestamp: new Date().toISOString(),
    endpoints: {
      register: 'POST /api/auth/register',
      login: 'POST /api/auth/login (coming soon)',
      user: 'GET /api/auth/user/:id'
    }
  });
});

// Health check for auth
router.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'Liberia Business Awards Auth API',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
