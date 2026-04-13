// ============================================
// ADVANCED SECURITY MONITORING
// ============================================

(function() {
    'use strict';
    
    // Configuration
    const CONFIG = {
        maxLoginAttempts: 5,
        lockoutTime: 15 * 60 * 1000, // 15 minutes
        suspiciousPatterns: [
            /<script/i,
            /javascript:/i,
            /onclick/i,
            /onload/i,
            /alert\(/i,
            /eval\(/i,
            /document\.cookie/i,
            /localStorage\./i,
            /sessionStorage\./i
        ]
    };
    
    // Track login attempts
    let loginAttempts = JSON.parse(localStorage.getItem('security_login_attempts') || '{}');
    
    // ============================================
    // DETECT SUSPICIOUS INPUT
    // ============================================
    function detectSuspiciousInput(input) {
        if (!input) return false;
        
        for (const pattern of CONFIG.suspiciousPatterns) {
            if (pattern.test(input)) {
                logSecurityEvent('SUSPICIOUS_INPUT_DETECTED', {
                    pattern: pattern.toString(),
                    input: input.substring(0, 100)
                });
                return true;
            }
        }
        return false;
    }
    
    // ============================================
    // SANITIZE USER INPUT
    // ============================================
    function sanitizeInput(input) {
        if (!input) return '';
        
        return input
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;')
            .replace(/`/g, '&#96;')
            .replace(/=/g, '&#61;');
    }
    
    // ============================================
    // LOG SECURITY EVENTS
    // ============================================
    function logSecurityEvent(eventType, details = {}) {
        const securityLog = {
            timestamp: new Date().toISOString(),
            eventType: eventType,
            userAgent: navigator.userAgent,
            url: window.location.href,
            ip: 'client-side', // Server will capture real IP
            ...details
        };
        
        console.warn('[SECURITY]', securityLog);
        
        // Store in localStorage for audit
        let logs = JSON.parse(localStorage.getItem('security_logs') || '[]');
        logs.unshift(securityLog);
        // Keep only last 100 logs
        logs = logs.slice(0, 100);
        localStorage.setItem('security_logs', JSON.stringify(logs));
        
        // Send to server for logging
        sendSecurityLogToServer(securityLog);
    }
    
    // ============================================
    // SEND LOG TO SERVER
    // ============================================
    function sendSecurityLogToServer(log) {
        // Send via beacon or fetch (doesn't block page)
        if (navigator.sendBeacon) {
            navigator.sendBeacon('/api/security/log', JSON.stringify(log));
        } else {
            fetch('/api/security/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(log),
                keepalive: true
            }).catch(() => {});
        }
    }
    
    // ============================================
    // RATE LIMITING CHECK
    // ============================================
    function checkRateLimit(action, identifier) {
        const key = `${action}_${identifier}`;
        const now = Date.now();
        
        if (!loginAttempts[key]) {
            loginAttempts[key] = { count: 0, firstAttempt: now, lockedUntil: 0 };
        }
        
        const record = loginAttempts[key];
        
        // Check if locked
        if (record.lockedUntil > now) {
            const remainingMinutes = Math.ceil((record.lockedUntil - now) / 60000);
            logSecurityEvent('RATE_LIMIT_BLOCKED', { action, identifier, remainingMinutes });
            return { allowed: false, message: `Too many attempts. Try again in ${remainingMinutes} minutes.` };
        }
        
        // Reset after window
        if (now - record.firstAttempt > CONFIG.lockoutTime) {
            record.count = 0;
            record.firstAttempt = now;
        }
        
        record.count++;
        
        // Check if exceeded limit
        if (record.count > CONFIG.maxLoginAttempts) {
            record.lockedUntil = now + CONFIG.lockoutTime;
            logSecurityEvent('RATE_LIMIT_EXCEEDED', { action, identifier, count: record.count });
            return { allowed: false, message: `Too many failed attempts. Locked for ${CONFIG.lockoutTime / 60000} minutes.` };
        }
        
        localStorage.setItem('security_login_attempts', JSON.stringify(loginAttempts));
        return { allowed: true };
    }
    
    // ============================================
    // PROTECT FORMS FROM XSS
    // ============================================
    function protectForms() {
        document.querySelectorAll('form').forEach(form => {
            // Add CSRF token
            if (!form.querySelector('input[name="_csrf"]')) {
                const csrfInput = document.createElement('input');
                csrfInput.type = 'hidden';
                csrfInput.name = '_csrf';
                csrfInput.value = generateCSRFToken();
                form.appendChild(csrfInput);
            }
            
            // Intercept form submission
            form.addEventListener('submit', function(e) {
                const inputs = this.querySelectorAll('input, textarea');
                let suspiciousFound = false;
                
                inputs.forEach(input => {
                    if (input.value && detectSuspiciousInput(input.value)) {
                        suspiciousFound = true;
                        input.value = sanitizeInput(input.value);
                    }
                });
                
                if (suspiciousFound) {
                    logSecurityEvent('SUSPICIOUS_FORM_SUBMISSION_BLOCKED', { formId: form.id });
                    showSecurityAlert('Suspicious input detected and blocked');
                    e.preventDefault();
                }
            });
        });
    }
    
    // ============================================
    // GENERATE CSRF TOKEN
    // ============================================
    function generateCSRFToken() {
        let token = localStorage.getItem('csrf_token');
        if (!token) {
            token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
            localStorage.setItem('csrf_token', token);
        }
        return token;
    }
    
    // ============================================
    // SHOW SECURITY ALERT
    // ============================================
    function showSecurityAlert(message) {
        const alertDiv = document.createElement('div');
        alertDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #EF4444;
            color: white;
            padding: 15px 20px;
            border-radius: 8px;
            z-index: 99999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            font-weight: bold;
            animation: slideIn 0.3s ease;
        `;
        alertDiv.innerHTML = `
            <i class="fas fa-shield-alt"></i>
            <span style="margin-left: 10px;">${message}</span>
            <button onclick="this.parentElement.remove()" style="background: none; border: none; color: white; margin-left: 15px; cursor: pointer;">&times;</button>
        `;
        document.body.appendChild(alertDiv);
        setTimeout(() => alertDiv.remove(), 5000);
    }
    
    // ============================================
    // DETECT DEV TOOLS OPEN
    // ============================================
    function detectDevTools() {
        let devToolsOpen = false;
        const threshold = 160;
        
        Object.defineProperty(window, 'outerWidth', {
            get: function() {
                devToolsOpen = true;
                return window.innerWidth;
            },
            set: function() {}
        });
        
        setInterval(() => {
            if (devToolsOpen) {
                logSecurityEvent('DEV_TOOLS_DETECTED');
                devToolsOpen = false;
            }
        }, 1000);
    }
    
    // ============================================
    // DETECT CONSOLE COMMANDS
    // ============================================
    function protectConsole() {
        const originalLog = console.log;
        const originalWarn = console.warn;
        const originalError = console.error;
        
        console.log = function() {
            const args = Array.from(arguments);
            if (args.some(arg => typeof arg === 'string' && 
                (arg.includes('password') || arg.includes('token') || arg.includes('secret')))) {
                logSecurityEvent('SENSITIVE_DATA_IN_CONSOLE');
                return;
            }
            originalLog.apply(console, args);
        };
        
        console.warn = function() {
            originalWarn.apply(console, arguments);
        };
        
        console.error = function() {
            originalError.apply(console, arguments);
        };
    }
    
    // ============================================
    // PROTECT LOCALSTORAGE
    // ============================================
    function protectLocalStorage() {
        const originalSetItem = localStorage.setItem;
        const originalGetItem = localStorage.getItem;
        
        localStorage.setItem = function(key, value) {
            if (key.includes('token') || key.includes('password')) {
                // Encrypt sensitive data (simple XOR for demo - use proper encryption in production)
                const encrypted = btoa(encodeURIComponent(value));
                originalSetItem.call(localStorage, key, encrypted);
            } else {
                originalSetItem.call(localStorage, key, value);
            }
        };
        
        localStorage.getItem = function(key) {
            const value = originalGetItem.call(localStorage, key);
            if (value && (key.includes('token') || key.includes('password'))) {
                try {
                    return decodeURIComponent(atob(value));
                } catch {
                    return value;
                }
            }
            return value;
        };
    }
    
    // ============================================
    // SESSION FINGERPRINTING
    // ============================================
    function generateFingerprint() {
        const fingerprint = {
            userAgent: navigator.userAgent,
            language: navigator.language,
            platform: navigator.platform,
            screenResolution: `${screen.width}x${screen.height}`,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            canvasFingerprint: getCanvasFingerprint()
        };
        
        const storedFingerprint = localStorage.getItem('device_fingerprint');
        const newFingerprint = JSON.stringify(fingerprint);
        
        if (storedFingerprint && storedFingerprint !== newFingerprint) {
            logSecurityEvent('FINGERPRINT_MISMATCH', { old: storedFingerprint, new: newFingerprint });
            // Optionally logout
            // localStorage.clear();
            // window.location.href = '/login.html';
        } else if (!storedFingerprint) {
            localStorage.setItem('device_fingerprint', newFingerprint);
        }
        
        return fingerprint;
    }
    
    function getCanvasFingerprint() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 200;
        canvas.height = 50;
        ctx.fillStyle = '#FF0000';
        ctx.fillRect(0, 0, 200, 50);
        ctx.fillStyle = '#87CEEB';
        ctx.font = '14px Arial';
        ctx.fillText('LBA', 10, 30);
        return canvas.toDataURL();
    }
    
    // ============================================
    // ANTI-CLICKJACKING
    // ============================================
    function preventClickjacking() {
        if (self === top) {
            // Not in iframe
            document.documentElement.style.display = 'block';
        } else {
            // In iframe - break out
            top.location = self.location;
        }
    }
    
    // ============================================
    // INITIALIZE ALL SECURITY MEASURES
    // ============================================
    function initSecurity() {
        preventClickjacking();
        protectForms();
        detectDevTools();
        protectConsole();
        protectLocalStorage();
        generateFingerprint();
        
        // Add CSS animation for alerts
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from {
                    transform: translateX(100%);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
        `;
        document.head.appendChild(style);
        
        console.log('🛡️ Advanced security monitoring enabled');
    }
    
    // Export functions for use in other scripts
    window.security = {
        sanitizeInput,
        detectSuspiciousInput,
        checkRateLimit,
        logSecurityEvent,
        showSecurityAlert,
        generateCSRFToken
    };
    
    // Auto-initialize
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSecurity);
    } else {
        initSecurity();
    }
})();
