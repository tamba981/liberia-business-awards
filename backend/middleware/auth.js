const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const BusinessUser = require('../models/BusinessUser');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// Generate JWT token
const generateToken = (userId, userType, email) => {
    return jwt.sign(
        { 
            userId, 
            userType,
            email 
        }, 
        JWT_SECRET, 
        { expiresIn: JWT_EXPIRES_IN }
    );
};

// Verify JWT token
const verifyToken = (token) => {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
};

// Authentication middleware
const authenticate = async (req, res, next) => {
    try {
        // Get token from header
        const authHeader = req.header('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ 
                success: false, 
                message: 'Authentication required. No token provided.' 
            });
        }

        const token = authHeader.replace('Bearer ', '');
        
        // Verify token
        const decoded = verifyToken(token);
        if (!decoded) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid or expired token.' 
            });
        }

        // Get user based on type
        let user;
        if (decoded.userType === 'admin') {
            user = await Admin.findById(decoded.userId).select('-password');
        } else if (decoded.userType === 'business') {
            user = await BusinessUser.findById(decoded.userId).select('-password');
        }

        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'User not found.' 
            });
        }

        // Check if user is active
        if (decoded.userType === 'admin') {
            if (!user.is_active) {
                return res.status(403).json({ 
                    success: false, 
                    message: 'Account is deactivated. Contact administrator.' 
                });
            }
        } else {
            if (user.status !== 'active') {
                return res.status(403).json({ 
                    success: false, 
                    message: `Account is ${user.status}. Please contact administrator.` 
                });
            }
        }

        // Attach user to request
        req.user = user;
        req.userType = decoded.userType;
        next();

    } catch (error) {
        console.error('❌ Auth middleware error:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Authentication error.' 
        });
    }
};

// Role-based authorization middleware
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Authentication required.' 
            });
        }

        // For admin, check role
        if (req.userType === 'admin') {
            if (roles.includes('admin') || roles.includes('super_admin')) {
                return next();
            }
            
            // Check specific permissions if needed
            const requiredPermission = roles.find(r => r.startsWith('perm_'));
            if (requiredPermission) {
                const perm = requiredPermission.replace('perm_', '');
                if (req.user.permissions && req.user.permissions[perm]) {
                    return next();
                }
            }
            
            return res.status(403).json({ 
                success: false, 
                message: 'Access denied. Insufficient permissions.' 
            });
        }

        // For business, just check if they're authenticated
        if (req.userType === 'business' && roles.includes('business')) {
            return next();
        }

        return res.status(403).json({ 
            success: false, 
            message: 'Access denied.' 
        });
    };
};

// Rate limiting for login attempts
const loginRateLimiter = {
    attempts: new Map(),
    
    check: (email, ip) => {
        const key = `${email}_${ip}`;
        const now = Date.now();
        const windowMs = 15 * 60 * 1000; // 15 minutes
        const maxAttempts = 10;
        
        const record = loginRateLimiter.attempts.get(key) || { count: 0, firstAttempt: now };
        
        if (now - record.firstAttempt > windowMs) {
            // Reset if window expired
            record.count = 1;
            record.firstAttempt = now;
        } else {
            record.count += 1;
        }
        
        loginRateLimiter.attempts.set(key, record);
        
        // Cleanup old entries
        setTimeout(() => {
            loginRateLimiter.attempts.delete(key);
        }, windowMs);
        
        return {
            allowed: record.count <= maxAttempts,
            remaining: Math.max(0, maxAttempts - record.count),
            resetTime: record.firstAttempt + windowMs
        };
    }
};

module.exports = {
    authenticate,
    authorize,
    generateToken,
    verifyToken,
    loginRateLimiter
};
