// ============================================
// ADVANCED SECURITY MIDDLEWARE
// ============================================

const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');

// ============================================
// 1. REQUEST ENCRYPTION (Prevent sniffing)
// ============================================
const encryptionKey = crypto.randomBytes(32);
const algorithm = 'aes-256-gcm';

function encryptResponse(data) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, encryptionKey, iv);
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return {
        encrypted: true,
        iv: iv.toString('hex'),
        data: encrypted,
        authTag: authTag.toString('hex')
    };
}

function decryptRequest(encryptedData) {
    try {
        const decipher = crypto.createDecipheriv(
            algorithm, 
            encryptionKey, 
            Buffer.from(encryptedData.iv, 'hex')
        );
        decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
        let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return JSON.parse(decrypted);
    } catch (error) {
        return null;
    }
}

// ============================================
// 2. RATE LIMITING (Prevent brute force)
// ============================================
const strictLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
    message: { success: false, message: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        return req.ip || req.connection.remoteAddress;
    }
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { success: false, message: 'Too many login attempts. Try again in 15 minutes.' },
    skipSuccessfulRequests: true
});

const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60, // 60 requests per minute
    message: { success: false, message: 'Rate limit exceeded. Please slow down.' }
});

// ============================================
// 3. DEVICE FINGERPRINTING (Prevent session hijacking)
// ============================================
function generateDeviceFingerprint(req) {
    const fingerprintData = {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        acceptLanguage: req.headers['accept-language'],
        acceptEncoding: req.headers['accept-encoding'],
        connection: req.headers['connection']
    };
    
    const fingerprint = crypto
        .createHash('sha256')
        .update(JSON.stringify(fingerprintData))
        .digest('hex');
    
    return fingerprint;
}

function validateDeviceFingerprint(req, storedFingerprint) {
    const currentFingerprint = generateDeviceFingerprint(req);
    return currentFingerprint === storedFingerprint;
}

// ============================================
// 4. SESSION PROTECTION MIDDLEWARE
// ============================================
function sessionProtection(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (token) {
        // Check if session exists in database
        req.db.collection('sessions').findOne({ token: token }, (err, session) => {
            if (err || !session) {
                return res.status(401).json({ success: false, message: 'Invalid session' });
            }
            
            // Validate device fingerprint
            if (!validateDeviceFingerprint(req, session.fingerprint)) {
                // Possible session hijacking - invalidate session
                req.db.collection('sessions').deleteOne({ token: token });
                return res.status(401).json({ success: false, message: 'Session invalidated: Device mismatch' });
            }
            
            // Check session expiry
            if (session.expiresAt < Date.now()) {
                req.db.collection('sessions').deleteOne({ token: token });
                return res.status(401).json({ success: false, message: 'Session expired' });
            }
            
            // Renew session expiry
            req.db.collection('sessions').updateOne(
                { token: token },
                { $set: { expiresAt: Date.now() + 60 * 60 * 1000 } }
            );
            
            req.session = session;
            next();
        });
    } else {
        next();
    }
}

// ============================================
// 5. INPUT VALIDATION & SANITIZATION
// ============================================
function sanitizeInput(input) {
    if (typeof input === 'string') {
        return input
            .replace(/[<>]/g, '') // Remove < and >
            .replace(/javascript:/gi, '')
            .replace(/on\w+=/gi, '')
            .trim();
    }
    return input;
}

function validateInput(schema) {
    return (req, res, next) => {
        const errors = [];
        
        Object.keys(schema).forEach(field => {
            const value = req.body[field];
            const rules = schema[field];
            
            if (rules.required && !value) {
                errors.push(`${field} is required`);
            }
            
            if (value && rules.type === 'email') {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(value)) {
                    errors.push(`${field} must be a valid email`);
                }
            }
            
            if (value && rules.minLength && value.length < rules.minLength) {
                errors.push(`${field} must be at least ${rules.minLength} characters`);
            }
            
            if (value && rules.maxLength && value.length > rules.maxLength) {
                errors.push(`${field} must be less than ${rules.maxLength} characters`);
            }
            
            // Sanitize the value
            if (value && typeof value === 'string') {
                req.body[field] = sanitizeInput(value);
            }
        });
        
        if (errors.length > 0) {
            return res.status(400).json({ success: false, errors });
        }
        
        next();
    };
}

// ============================================
// 6. SECURITY HEADERS (Enhanced)
// ============================================
function securityHeaders(req, res, next) {
    // Remove identifying headers
    res.removeHeader('X-Powered-By');
    
    // Set security headers
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');
    
    // Content Security Policy
    res.setHeader('Content-Security-Policy', [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://script.google.com",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self' https://cdnjs.cloudflare.com",
        "connect-src 'self' https://liberia-business-awards-production.up.railway.app https://script.google.com",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'"
    ].join('; '));
    
    // HSTS
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    
    // Cache control
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.setHeader('Pragma', 'no-cache');
    
    next();
}

// ============================================
// 7. ANTI-CLONING / ANTI-TAMPERING
// ============================================
function antiCloningProtection(req, res, next) {
    // Check for suspicious headers that indicate scraping tools
    const suspiciousAgents = [
        'python', 'curl', 'wget', 'go-http-client', 'java', 
        'perl', 'ruby', 'php', 'scrapy', 'bot', 'crawler',
        'spider', 'scrape', 'fetch', 'http-client'
    ];
    
    const userAgent = req.headers['user-agent'] || '';
    const isSuspicious = suspiciousAgents.some(agent => 
        userAgent.toLowerCase().includes(agent.toLowerCase())
    );
    
    if (isSuspicious) {
        console.log(`⚠️ Suspicious user agent blocked: ${userAgent}`);
        return res.status(403).json({ success: false, message: 'Access denied' });
    }
    
    // Check for headless browsers
    if (req.headers['x-requested-with'] === 'XMLHttpRequest' && 
        !req.headers['referer']?.includes(req.headers.host)) {
        return res.status(403).json({ success: false, message: 'Invalid request origin' });
    }
    
    next();
}

// ============================================
// 8. AUDIT LOGGING
// ============================================
function auditLog(req, res, next) {
    const startTime = Date.now();
    
    // Capture original end function
    const originalEnd = res.end;
    let responseBody = '';
    
    // Override write to capture response
    res.write = function(chunk) {
        responseBody += chunk;
        return originalWrite.call(this, chunk);
    };
    
    res.end = function(chunk) {
        if (chunk) responseBody += chunk;
        
        const duration = Date.now() - startTime;
        
        // Log suspicious activities
        const shouldLog = (
            res.statusCode >= 400 ||
            req.method !== 'GET' ||
            req.url.includes('admin') ||
            req.url.includes('login')
        );
        
        if (shouldLog) {
            const logEntry = {
                timestamp: new Date().toISOString(),
                ip: req.ip,
                method: req.method,
                url: req.url,
                statusCode: res.statusCode,
                duration: `${duration}ms`,
                userAgent: req.headers['user-agent'],
                referer: req.headers['referer'] || null
            };
            
            // Async log to database (don't block response)
            setImmediate(() => {
                req.db?.collection('audit_logs').insertOne(logEntry).catch(console.error);
            });
            
            console.log(`📝 AUDIT: ${logEntry.method} ${logEntry.url} - ${logEntry.statusCode} (${logEntry.duration})`);
        }
        
        originalEnd.call(this, chunk);
    };
    
    next();
}

// ============================================
// 9. TOKEN ENCRYPTION (JWT with encryption)
// ============================================
function encryptToken(token) {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', encryptionKey.slice(0, 32), iv);
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
}

function decryptToken(encryptedToken) {
    try {
        const [ivHex, encrypted] = encryptedToken.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', encryptionKey.slice(0, 32), iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        return null;
    }
}

// ============================================
// EXPORT ALL MIDDLEWARE
// ============================================
module.exports = {
    encryptResponse,
    decryptRequest,
    strictLimiter,
    loginLimiter,
    apiLimiter,
    generateDeviceFingerprint,
    validateDeviceFingerprint,
    sessionProtection,
    validateInput,
    sanitizeInput,
    securityHeaders,
    antiCloningProtection,
    auditLog,
    encryptToken,
    decryptToken
};
