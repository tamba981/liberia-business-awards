// ============================================
// CODE OBFUSCATION & ANTI-TAMPERING
// ============================================

(function() {
    'use strict';
    
    // ============================================
    // 1. PREVENT RIGHT-CLICK
    // ============================================
    document.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        return false;
    });
    
    // ============================================
    // 2. PREVENT DEV TOOLS SHORTCUTS
    // ============================================
    document.addEventListener('keydown', function(e) {
        // F12
        if (e.key === 'F12') {
            e.preventDefault();
            return false;
        }
        // Ctrl+Shift+I (Windows)
        if (e.ctrlKey && e.shiftKey && e.key === 'I') {
            e.preventDefault();
            return false;
        }
        // Ctrl+Shift+J (Windows)
        if (e.ctrlKey && e.shiftKey && e.key === 'J') {
            e.preventDefault();
            return false;
        }
        // Ctrl+U (View Source)
        if (e.ctrlKey && e.key === 'u') {
            e.preventDefault();
            return false;
        }
        // Ctrl+S (Save)
        if (e.ctrlKey && e.key === 's') {
            e.preventDefault();
            return false;
        }
        // Command+Option+I (Mac)
        if (e.metaKey && e.altKey && e.key === 'I') {
            e.preventDefault();
            return false;
        }
    });
    
    // ============================================
    // 3. DETECT DEV TOOLS OPEN
    // ============================================
    let devToolsOpen = false;
    const threshold = 160;
    
    Object.defineProperty(window, 'outerWidth', {
        get: function() {
            devToolsOpen = true;
            return window.innerWidth;
        },
        set: function() {}
    });
    
    setInterval(function() {
        if (devToolsOpen) {
            // Clear sensitive data
            localStorage.removeItem('lba_auth_token');
            localStorage.removeItem('lba_user_data');
            // Redirect to login
            window.location.href = '/dashboard/login.html';
        }
        devToolsOpen = false;
    }, 1000);
    
    // ============================================
    // 4. OVERRIDE CONSOLE METHODS
    // ============================================
    const noop = function() {};
    const blockedConsole = ['log', 'info', 'warn', 'error', 'debug', 'trace'];
    
    blockedConsole.forEach(method => {
        if (window.console && window.console[method]) {
            window.console[method] = noop;
        }
    });
    
    // Keep our own logger for security events only
    window.secureLog = function(message, type = 'info') {
        // Send to server silently
        fetch('/api/security/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, type, timestamp: new Date().toISOString() }),
            keepalive: true
        }).catch(() => {});
    };
    
    // ============================================
    // 5. DETECT AND BLOCK DEBUGGERS
    // ============================================
    function detectDebugger() {
        const start = performance.now();
        debugger;
        const end = performance.now();
        const duration = end - start;
        
        if (duration > 100) {
            // Debugger detected
            document.body.innerHTML = '<h1>Access Denied</h1><p>Debugging tools are not allowed.</p>';
            setTimeout(() => {
                window.location.href = '/dashboard/login.html';
            }, 2000);
            return true;
        }
        return false;
    }
    
    setInterval(detectDebugger, 2000);
    
    // ============================================
    // 6. PREVENT CODE INJECTION
    // ============================================
    const originalCreateElement = document.createElement;
    document.createElement = function(tagName) {
        const element = originalCreateElement.call(document, tagName);
        
        if (tagName.toLowerCase() === 'script') {
            const originalSetAttribute = element.setAttribute;
            element.setAttribute = function(name, value) {
                if (name.toLowerCase() === 'src') {
                    // Only allow allowed domains
                    const allowedDomains = [
                        window.location.origin,
                        'https://cdnjs.cloudflare.com',
                        'https://script.google.com'
                    ];
                    const isAllowed = allowedDomains.some(domain => value.startsWith(domain));
                    if (!isAllowed) {
                        secureLog(`Blocked script from: ${value}`, 'warning');
                        return;
                    }
                }
                originalSetAttribute.call(this, name, value);
            };
        }
        
        return element;
    };
    
    // ============================================
    // 7. PROTECT COOKIES
    // ============================================
    const originalCookie = document.__lookupSetter__('cookie');
    Object.defineProperty(document, 'cookie', {
        get: function() {
            return originalCookie ? originalCookie : '';
        },
        set: function(value) {
            // Block attempts to read/modify auth cookies via JavaScript
            if (value.includes('lba_auth_token')) {
                secureLog('Blocked cookie tampering attempt', 'warning');
                return;
            }
            if (originalCookie) {
                originalCookie(value);
            }
        }
    });
    
    // ============================================
    // 8. PREVENT SCREEN CAPTURE
    // ============================================
    document.addEventListener('keyup', function(e) {
        if (e.key === 'PrintScreen') {
            navigator.clipboard.writeText('');
            secureLog('Screenshot attempt blocked', 'warning');
            alert('Screenshots are disabled on this site');
        }
    });
    
    // ============================================
    // 9. OBFUSCATE HTML COMMENTS
    // ============================================
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === Node.COMMENT_NODE) {
                        node.remove();
                    }
                });
            }
        });
    });
    
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });
    
    // ============================================
    // 10. ANTI-CLONING (Detect iframe embedding)
    // ============================================
    if (window.self !== window.top) {
        // Site is inside an iframe - break out
        window.top.location = window.self.location;
    }
    
    // Detect if page is being cloned
    const originalFetch = window.fetch;
    window.fetch = function(url, options) {
        // Detect if someone is trying to clone our API
        if (url.includes('/api/') && !options?.headers?.Authorization) {
            secureLog(`Unauthorized API access attempt: ${url}`, 'warning');
            return Promise.reject(new Error('Unauthorized'));
        }
        return originalFetch.apply(this, arguments);
    };
    
    console.log('🛡️ Advanced security enabled - Code protection active');
})();
