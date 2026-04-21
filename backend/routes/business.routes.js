const express = require('express');
const router = express.Router();
const BusinessUser = require('../models/BusinessUser');
const Document = require('../models/Document');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

// ============================================
// MULTER CONFIGURATION FOR FILE UPLOADS
// ============================================
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../uploads/documents');
        // Create directory if it doesn't exist
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/jpeg', 'image/png'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type'), false);
    }
};

const upload = multer({ 
    storage: storage, 
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: fileFilter
});

// ============================================
// AUTHENTICATION MIDDLEWARE
// ============================================
const authenticateBusiness = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ success: false, message: 'No token provided' });
        }
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        
        const business = await BusinessUser.findById(decoded.userId);
        if (!business || business.status !== 'active') {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        
        req.user = { userId: business._id, role: 'business' };
        next();
    } catch (error) {
        console.error('Auth error:', error);
        res.status(401).json({ success: false, message: 'Invalid token' });
    }
};

// ============================================
// TEST ROUTE
// ============================================
router.get('/business/test', (req, res) => {
    res.json({ message: 'Business routes working!' });
});

// ============================================
// BUSINESS REGISTRATION
// ============================================
router.post('/business/register', async (req, res) => {
    try {
        const { email, password, business_name, contact_name, phone, business_type } = req.body;
        console.log('Business registration:', email);
        
        const existing = await BusinessUser.findOne({ email });
        if (existing) {
            return res.status(400).json({ success: false, message: 'Email already registered' });
        }
        
        const business = new BusinessUser({
            email,
            password,
            business_name,
            contact_name,
            phone,
            business_type,
            status: 'pending'
        });
        
        await business.save();
        
        res.json({
            success: true,
            message: 'Registration successful! Please wait for admin approval.'
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================
// BUSINESS PROFILE ROUTES
// ============================================

// Get business profile
router.get('/business/profile', authenticateBusiness, async (req, res) => {
    try {
        const business = await BusinessUser.findById(req.user.userId).select('-password');
        if (!business) {
            return res.status(404).json({ success: false, message: 'Business not found' });
        }
        res.json({ success: true, profile: business });
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Update business profile
router.put('/business/profile', authenticateBusiness, upload.single('logo'), async (req, res) => {
    try {
        const updates = {
            business_name: req.body.business_name,
            business_category: req.body.business_category,
            industry: req.body.industry,
            contact_name: req.body.contact_name,
            phone: req.body.phone,
            location: req.body.location,
            website: req.body.website,
            address: req.body.address,
            description: req.body.description
        };
        
        // Remove undefined fields
        Object.keys(updates).forEach(key => updates[key] === undefined && delete updates[key]);
        
        if (req.file) {
            updates.logo = `/uploads/documents/${req.file.filename}`;
        }
        
        const business = await BusinessUser.findByIdAndUpdate(
            req.user.userId,
            updates,
            { new: true }
        ).select('-password');
        
        res.json({ success: true, profile: business });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================
// BUSINESS DOCUMENT ROUTES
// ============================================

// Get all documents for a business
router.get('/business/documents', authenticateBusiness, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const skip = (page - 1) * limit;
        
        const documents = await Document.find({ businessId: req.user.userId })
            .sort({ uploaded_at: -1 })
            .skip(skip)
            .limit(limit);
        
        const total = await Document.countDocuments({ businessId: req.user.userId });
        
        res.json({
            success: true,
            documents: documents,
            total: total,
            page: page,
            pages: Math.ceil(total / limit)
        });
    } catch (error) {
        console.error('Get documents error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Upload document
router.post('/business/documents', authenticateBusiness, upload.single('document'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        
        const BACKEND_URL = process.env.BACKEND_URL || 'https://liberia-business-awards-production.up.railway.app';
        
        const document = new Document({
            businessId: req.user.userId,
            name: req.body.name,
            type: req.body.type,
            fileType: req.file.mimetype,
            fileSize: req.file.size,
            filePath: `/uploads/documents/${req.file.filename}`,
            fileUrl: `${BACKEND_URL}/uploads/documents/${req.file.filename}`,
            uploaded_at: new Date()
        });
        
        await document.save();
        
        res.json({ success: true, document: document });
    } catch (error) {
        console.error('Upload document error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================
// FIXED: VIEW DOCUMENT ROUTE
// ============================================
router.get('/business/documents/:id/view', authenticateBusiness, async (req, res) => {
    try {
        const document = await Document.findOne({ 
            _id: req.params.id, 
            businessId: req.user.userId 
        });
        
        if (!document) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }
        
        // Check if file exists
        if (!document.fileUrl && !document.filePath) {
            return res.status(404).json({ success: false, message: 'File not found' });
        }
        
        // Redirect to the file URL
        if (document.fileUrl) {
            return res.redirect(document.fileUrl);
        }
        
        res.status(404).json({ success: false, message: 'File not accessible' });
        
    } catch (error) {
        console.error('View document error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// ============================================
// FIXED: DOWNLOAD DOCUMENT ROUTE
// ============================================
router.get('/business/documents/:id/download', authenticateBusiness, async (req, res) => {
    try {
        const document = await Document.findOne({ 
            _id: req.params.id, 
            businessId: req.user.userId 
        });
        
        if (!document) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }
        
        // Set headers for download
        const filename = encodeURIComponent(document.name || 'document');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', document.fileType || 'application/octet-stream');
        
        // If file is stored on cloud
        if (document.fileUrl) {
            return res.redirect(document.fileUrl);
        }
        
        // If file is stored locally
        if (document.filePath) {
            const filePath = path.join(__dirname, '..', document.filePath);
            if (fs.existsSync(filePath)) {
                return res.sendFile(filePath);
            }
        }
        
        res.status(404).json({ success: false, message: 'File not found' });
        
    } catch (error) {
        console.error('Download document error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Delete document
router.delete('/business/documents/:id', authenticateBusiness, async (req, res) => {
    try {
        const document = await Document.findOneAndDelete({ 
            _id: req.params.id, 
            businessId: req.user.userId 
        });
        
        if (!document) {
            return res.status(404).json({ success: false, message: 'Document not found' });
        }
        
        // Delete physical file if exists locally
        if (document.filePath) {
            const filePath = path.join(__dirname, '..', document.filePath);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
        
        res.json({ success: true, message: 'Document deleted' });
    } catch (error) {
        console.error('Delete document error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
