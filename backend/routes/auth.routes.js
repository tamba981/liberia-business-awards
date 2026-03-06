const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const Admin = require('../models/Admin');
const BusinessUser = require('../models/BusinessUser');
const LoginHistory = require('../models/LoginHistory');
const { generateToken, loginRateLimiter } = require('../middleware/auth');

// ==================== ADMIN LOGIN ====================
router.post('/auth/admin/login', [
    body('email').isEmail().normalizeEmail().toLowerCase(),
    body('password').notEmpty().isLength({ min: 6 })
], async (req, res) => {
    try {
        // Validate input
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid input',
                errors: errors.array() 
            });
        }

        const { email, password } = req.body;
        const ip = req.ip || req.connection.remoteAddress;
        const userAgent = req.headers['user-agent'];

        // Check rate limiting
        const rateLimit = loginRateLimiter.check(email, ip);
        if (!rateLimit.allowed) {
            return res.status(429).json({ 
                success: false, 
                message: 'Too many login attempts. Please try again later.',
                remainingTime: Math.ceil((rateLimit.resetTime - Date.now()) / 60000)
            });
        }

        // Find admin
        const admin = await Admin.findOne({ email });
        if (!admin) {
            // Log failed attempt
            await LoginHistory.create({
                user_id: null,
                user_type: 'admin',
                email,
                ip_address: ip,
                user_agent: userAgent,
                success: false
            });
            
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid email or password.' 
            });
        }

        // Check if account is locked
        if (admin.isLocked()) {
            const lockTimeRemaining = Math.ceil((admin.lock_until - Date.now()) / 60000);
            return res.status(403).json({ 
                success: false, 
                message: `Account locked. Try again in ${lockTimeRemaining} minutes.` 
            });
        }

        // Verify password
        const isMatch = await admin.comparePassword(password);
        if (!isMatch) {
            await admin.incrementLoginAttempts();
            
            // Log failed attempt
            await LoginHistory.create({
                user_id: admin._id,
                user_type: 'admin',
                email,
                ip_address: ip,
                user_agent: userAgent,
                success: false
            });
            
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid email or password.' 
            });
        }

        // Reset login attempts and update last login
        await admin.resetLoginAttempts();

        // Generate JWT token
        const token = generateToken(admin._id, 'admin', admin.email);

        // Log successful login
        const loginHistory = await LoginHistory.create({
            user_id: admin._id,
            user_type: 'admin',
            email: admin.email,
            ip_address: ip,
            user_agent: userAgent,
            success: true
        });

        // Return success response
        res.json({
            success: true,
            message: 'Login successful',
            token,
            user: {
                id: admin._id,
                email: admin.email,
                name: admin.name,
                role: admin.role,
                permissions: admin.permissions
            },
            login_id: loginHistory._id
        });

    } catch (error) {
        console.error('❌ Admin login error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error during login.' 
        });
    }
});

// ==================== BUSINESS LOGIN ====================
router.post('/auth/business/login', [
    body('email').isEmail().normalizeEmail().toLowerCase(),
    body('password').notEmpty().isLength({ min: 6 })
], async (req, res) => {
    try {
        // Validate input
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid input',
                errors: errors.array() 
            });
        }

        const { email, password } = req.body;
        const ip = req.ip || req.connection.remoteAddress;
        const userAgent = req.headers['user-agent'];

        // Check rate limiting
        const rateLimit = loginRateLimiter.check(email, ip);
        if (!rateLimit.allowed) {
            return res.status(429).json({ 
                success: false, 
                message: 'Too many login attempts. Please try again later.',
                remainingTime: Math.ceil((rateLimit.resetTime - Date.now()) / 60000)
            });
        }

        // Find business user
        const business = await BusinessUser.findOne({ email });
        if (!business) {
            // Log failed attempt
            await LoginHistory.create({
                user_id: null,
                user_type: 'business',
                email,
                ip_address: ip,
                user_agent: userAgent,
                success: false
            });
            
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid email or password.' 
            });
        }

        // Check if account is locked
        if (business.isLocked()) {
            const lockTimeRemaining = Math.ceil((business.lock_until - Date.now()) / 60000);
            return res.status(403).json({ 
                success: false, 
                message: `Account locked. Try again in ${lockTimeRemaining} minutes.` 
            });
        }

        // Check account status
        if (business.status !== 'active') {
            return res.status(403).json({ 
                success: false, 
                message: `Account is ${business.status}. Please contact administrator.` 
            });
        }

        // Verify password
        const isMatch = await business.comparePassword(password);
        if (!isMatch) {
            await business.incrementLoginAttempts();
            
            // Log failed attempt
            await LoginHistory.create({
                user_id: business._id,
                user_type: 'business',
                email,
                ip_address: ip,
                user_agent: userAgent,
                success: false
            });
            
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid email or password.' 
            });
        }

        // Reset login attempts and update last login
        await business.resetLoginAttempts();

        // Generate JWT token
        const token = generateToken(business._id, 'business', business.email);

        // Log successful login
        await LoginHistory.create({
            user_id: business._id,
            user_type: 'business',
            email: business.email,
            ip_address: ip,
            user_agent: userAgent,
            success: true
        });

        // Return success response with business data
        res.json({
            success: true,
            message: 'Login successful',
            token,
            user: {
                id: business._id,
                email: business.email,
                name: business.contact_name || business.business_name,
                company: business.business_name,
                business_type: business.business_type,
                status: business.status,
                verification: business.verification_status,
                has_logo: !!business.logo_url
            },
            business: {
                name: business.business_name,
                industry: business.industry,
                established: business.year_established,
                documents_count: business.documents.length,
                profile_completion: calculateProfileCompletion(business)
            }
        });

    } catch (error) {
        console.error('❌ Business login error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error during login.' 
        });
    }
});

// Helper function to calculate profile completion
function calculateProfileCompletion(business) {
    const fields = [
        'business_name', 'contact_name', 'phone', 'address', 
        'business_type', 'industry', 'year_established', 
        'employee_count', 'website', 'logo_url'
    ];
    
    const completed = fields.filter(f => business[f]).length;
    const documentScore = business.documents.length > 0 ? 2 : 0;
    const verificationScore = Object.values(business.verification_status).filter(Boolean).length;
    
    const totalScore = completed + documentScore + verificationScore;
    const maxScore = fields.length + 2 + 3; // 10 fields + 2 docs + 3 verifications = 15
    
    return Math.min(100, Math.round((totalScore / maxScore) * 100));
}

// ==================== LOGOUT ====================
router.post('/auth/logout', async (req, res) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (token) {
            // Could blacklist token here if needed
            // For now, just return success
        }
        
        res.json({ 
            success: true, 
            message: 'Logout successful' 
        });
        
    } catch (error) {
        console.error('❌ Logout error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error during logout.' 
        });
    }
});

// ==================== VERIFY TOKEN ====================
router.get('/auth/verify', async (req, res) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                message: 'No token provided' 
            });
        }
        
        const decoded = require('../middleware/auth').verifyToken(token);
        
        if (!decoded) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid or expired token' 
            });
        }
        
        // Find user
        let user;
        if (decoded.userType === 'admin') {
            user = await Admin.findById(decoded.userId).select('-password');
        } else {
            user = await BusinessUser.findById(decoded.userId).select('-password');
        }
        
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        res.json({
            success: true,
            valid: true,
            user: {
                id: user._id,
                email: user.email,
                role: decoded.userType,
                name: user.name || user.business_name
            }
        });
        
    } catch (error) {
        console.error('❌ Token verification error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
});

// ==================== ADMIN SWITCH TO BUSINESS (IMPERSONATION) ====================
router.post('/auth/admin/impersonate/:businessId', 
    require('../middleware/auth').authenticate,
    require('../middleware/auth').authorize('admin'),
    async (req, res) => {
        try {
            const { businessId } = req.params;
            
            // Find business user
            const business = await BusinessUser.findById(businessId).select('-password');
            if (!business) {
                return res.status(404).json({ 
                    success: false, 
                    message: 'Business not found' 
                });
            }
            
            // Generate temporary token for admin to access business dashboard
            const token = generateToken(business._id, 'business', business.email);
            
            // Log the impersonation
            console.log(`👤 Admin ${req.user.email} impersonating business ${business.business_name}`);
            
            res.json({
                success: true,
                message: `Accessing business dashboard as ${business.business_name}`,
                token,
                user: {
                    id: business._id,
                    email: business.email,
                    name: business.contact_name || business.business_name,
                    company: business.business_name,
                    role: 'business',
                    impersonated_by: req.user.email
                }
            });
            
        } catch (error) {
            console.error('❌ Impersonation error:', error);
            res.status(500).json({ 
                success: false, 
                message: 'Server error' 
            });
        }
    }
);

// ==================== CREATE DEFAULT ADMIN (RUN ONCE) ====================
const createDefaultAdmin = async () => {
    try {
        const adminExists = await Admin.findOne({ email: 'admin@liberiabusinessawardslr.com' });
        
        if (!adminExists) {
            const admin = new Admin({
                email: 'admin@liberiabusinessawardslr.com',
                password: 'Admin123!',
                name: 'System Administrator',
                role: 'super_admin',
                permissions: {
                    manage_businesses: true,
                    manage_advertisements: true,
                    manage_news: true,
                    manage_users: true,
                    manage_settings: true
                },
                is_active: true
            });
            
            await admin.save();
            console.log('✅ Default admin account created');
            console.log('📧 Email: admin@liberiabusinessawardslr.com');
            console.log('🔑 Password: Admin123!');
        } else {
            console.log('✅ Admin account already exists');
        }
    } catch (error) {
        console.error('❌ Error creating default admin:', error);
    }
};

// Create default business demo account
const createDemoBusiness = async () => {
    try {
        const demoExists = await BusinessUser.findOne({ email: 'demo@business.com' });
        
        if (!demoExists) {
            const business = new BusinessUser({
                email: 'demo@business.com',
                password: 'demo123',
                business_name: 'Demo Company Liberia',
                contact_name: 'John Doe',
                phone: '+231 123 456 789',
                address: '123 Main Street, Monrovia',
                business_type: 'Enterprise',
                industry: 'Technology',
                year_established: 2020,
                employee_count: '11-50',
                website: 'https://demo-company.com',
                status: 'active',
                verification_status: {
                    email_verified: true,
                    phone_verified: true,
                    documents_verified: true
                }
            });
            
            await business.save();
            console.log('✅ Demo business account created');
            console.log('📧 Email: demo@business.com');
            console.log('🔑 Password: demo123');
        }
    } catch (error) {
        console.error('❌ Error creating demo business:', error);
    }
};

// Run setup
createDefaultAdmin();
createDemoBusiness();

module.exports = router;
