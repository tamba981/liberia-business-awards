const express = require('express');
const router = express.Router();
const BusinessUser = require('../models/BusinessUser');

// Business Registration
router.post('/business/register', async (req, res) => {
    try {
        const { email, password, business_name, contact_name, phone, business_type } = req.body;
        
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
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
