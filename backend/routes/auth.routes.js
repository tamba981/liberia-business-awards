const express = require('express');
const router = express.Router();
const Admin = require('../models/Admin');
const BusinessUser = require('../models/BusinessUser');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Simple test route
router.get('/auth/test', (req, res) => {
    res.json({ message: 'Auth routes working!' });
});

// ============================================
// VERIFY ENDPOINT - ADD THIS (FIXES INFINITE LOOP)
// ============================================
router.post('/auth/verify', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ success: false, message: 'No token provided' });
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        
        if (decoded.role === 'admin') {
            const admin = await Admin.findById(decoded.userId).select('-password');
            if (!admin) {
                return res.status(401).json({ success: false, message: 'Admin not found' });
            }
            return res.json({
                success: true,
                user: {
                    id: admin._id,
                    email: admin.email,
                    name: admin.name,
                    role: 'admin'
                }
            });
        } 
        else if (decoded.role === 'business') {
            const business = await BusinessUser.findById(decoded.userId).select('-password');
            if (!business) {
                return res.status(401).json({ success: false, message: 'Business not found' });
            }
            
            if (business.status !== 'active') {
                return res.status(403).json({ success: false, message: 'Account pending approval' });
            }
            
            return res.json({
                success: true,
                user: {
                    id: business._id,
                    email: business.email,
                    name: business.business_name,
                    role: 'business',
                    phone: business.phone,
                    status: business.status
                }
            });
        }
        
        return res.status(401).json({ success: false, message: 'Invalid user role' });
        
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ success: false, message: 'Invalid token' });
        }
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: 'Token expired' });
        }
        console.error('Verify error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Admin Login
router.post('/auth/admin/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        console.log('Admin login attempt:', email);
        
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
        console.log('Business login attempt:', email);
        
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
                role: 'business',
                phone: business.phone,
                status: business.status
            }
        });
    } catch (error) {
        console.error('Business login error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Create default admin
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

module.exports = router;
