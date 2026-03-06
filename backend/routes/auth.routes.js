const express = require('express');
const router = express.Router();
const Admin = require('../models/Admin');
const BusinessUser = require('../models/BusinessUser');
const jwt = require('jsonwebtoken');

// Get JWT_SECRET from environment or use default
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Admin Login
router.post('/auth/admin/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const admin = await Admin.findOne({ email });
        if (!admin) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        const isMatch = await admin.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        const token = jwt.sign({ userId: admin._id, role: 'admin' }, JWT_SECRET, { expiresIn: '7d' });
        
        res.json({
            success: true,
            token,
            user: {
                id: admin._id,
                email: admin.email,
                name: admin.name,
                role: 'admin'
            }
        });
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Business Login
router.post('/auth/business/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const business = await BusinessUser.findOne({ email });
        if (!business) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        if (business.status !== 'active') {
            return res.status(403).json({ success: false, message: 'Account pending approval' });
        }
        
        const isMatch = await business.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid credentials' });
        }
        
        const token = jwt.sign({ userId: business._id, role: 'business' }, JWT_SECRET, { expiresIn: '7d' });
        
        res.json({
            success: true,
            token,
            user: {
                id: business._id,
                email: business.email,
                name: business.business_name,
                role: 'business'
            }
        });
    } catch (error) {
        console.error('Business login error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Create default admin (run once)
const createDefaultAdmin = async () => {
    try {
        const adminExists = await Admin.findOne({ email: 'admin@liberiabusinessawardslr.com' });
        if (!adminExists) {
            const admin = new Admin({
                email: 'admin@liberiabusinessawardslr.com',
                password: 'Admin123!',
                name: 'System Administrator'
            });
            await admin.save();
            console.log('✅ Default admin created');
        }
    } catch (error) {
        console.error('Error creating default admin:', error);
    }
};

// Call this when the app starts
setTimeout(createDefaultAdmin, 2000);

module.exports = router;
