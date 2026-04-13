// ============================================
// SECURITY LOGGING API (Node.js/Express)
// ============================================

const fs = require('fs');
const path = require('path');

// Security log file path
const SECURITY_LOG_PATH = path.join(__dirname, '../logs/security.log');

// Ensure logs directory exists
if (!fs.existsSync(path.dirname(SECURITY_LOG_PATH))) {
    fs.mkdirSync(path.dirname(SECURITY_LOG_PATH), { recursive: true });
}

// Security logging middleware
function securityLogger(req, res, next) {
    const startTime = Date.now();
    
    // Log request
    const logEntry = {
        timestamp: new Date().toISOString(),
        ip: req.ip || req.connection.remoteAddress,
        method: req.method,
        url: req.url,
        userAgent: req.headers['user-agent'],
        referer: req.headers['referer'] || null
    };
    
    // Log after response
    res.on('finish', () => {
        logEntry.statusCode = res.statusCode;
        logEntry.responseTime = Date.now() - startTime;
        
        // Only log suspicious activity
        if (res.statusCode >= 400 || 
            req.url.includes('login') || 
            req.url.includes('admin') ||
            req.url.includes('api/auth')) {
            appendToSecurityLog(logEntry);
        }
    });
    
    next();
}

function appendToSecurityLog(entry) {
    const logLine = JSON.stringify(entry) + '\n';
    fs.appendFile(SECURITY_LOG_PATH, logLine, (err) => {
        if (err) console.error('Failed to write security log:', err);
    });
}

// Rate limiting storage
const rateLimitStore = new Map();

function rateLimiter(maxAttempts = 5, windowMs = 15 * 60 * 1000) {
    return (req, res, next) => {
        const ip = req.ip || req.connection.remoteAddress;
        const key = `${ip}:${req.path}`;
        const now = Date.now();
        
        if (!rateLimitStore.has(key)) {
            rateLimitStore.set(key, { count: 1, firstAttempt: now, lockedUntil: 0 });
            return next();
        }
        
        const record = rateLimitStore.get(key);
        
        // Check if locked
        if (record.lockedUntil > now) {
            const remainingMinutes = Math.ceil((record.lockedUntil - now) / 60000);
            return res.status(429).json({
                success: false,
                message: `Too many attempts. Try again in ${remainingMinutes} minutes.`
            });
        }
        
        // Reset after window
        if (now - record.firstAttempt > windowMs) {
            record.count = 1;
            record.firstAttempt = now;
            rateLimitStore.set(key, record);
            return next();
        }
        
        record.count++;
        
        if (record.count > maxAttempts) {
            record.lockedUntil = now + windowMs;
            rateLimitStore.set(key, record);
            
            // Log rate limit exceeded
            appendToSecurityLog({
                timestamp: new Date().toISOString(),
                ip,
                event: 'RATE_LIMIT_EXCEEDED',
                path: req.path,
                attempts: record.count
            });
            
            return res.status(429).json({
                success: false,
                message: `Too many failed attempts. Locked for ${windowMs / 60000} minutes.`
            });
        }
        
        rateLimitStore.set(key, record);
        next();
    };
}

// Clean up rate limit store periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitStore.entries()) {
        if (now - record.firstAttempt > 60 * 60 * 1000) {
            rateLimitStore.delete(key);
        }
    }
}, 60 * 60 * 1000);

module.exports = { securityLogger, rateLimiter };
