// ============================================
// CENTRALIZED AUTHENTICATION CHECK
// Include this file in ALL protected pages
// ============================================

(function() {
    const BACKEND_URL = 'https://liberia-business-awards-production.up.railway.app/api';
    
    async function checkAuthentication() {
        // Get tokens
        const token = localStorage.getItem('lba_auth_token');
        const userRole = localStorage.getItem('lba_user_role');
        const userData = localStorage.getItem('lba_user_data');
        
        // Get current page path to determine required role
        const currentPath = window.location.pathname;
        const isAdminPage = currentPath.includes('/admin/');
        const isBusinessPage = currentPath.includes('/business/');
        
        // No token - redirect to login
        if (!token) {
            console.warn('🔒 No authentication token found');
            redirectToLogin();
            return false;
        }
        
        // Role validation - admin page requires admin role
        if (isAdminPage && userRole !== 'admin') {
            console.warn('🔒 Non-admin user trying to access admin page');
            redirectToLogin();
            return false;
        }
        
        // Business page requires business role
        if (isBusinessPage && userRole !== 'business') {
            console.warn('🔒 Non-business user trying to access business page');
            redirectToLogin();
            return false;
        }
        
        // Verify token with backend
        try {
            const response = await fetch(`${BACKEND_URL}/auth/verify`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                console.warn('🔒 Token verification failed');
                clearAuthAndRedirect();
                return false;
            }
            
            const data = await response.json();
            
            // Update stored user data if needed
            if (data.user && JSON.stringify(data.user) !== userData) {
                localStorage.setItem('lba_user_data', JSON.stringify(data.user));
            }
            
            console.log('✅ Authentication verified for:', userRole);
            return true;
            
        } catch (error) {
            console.error('❌ Auth verification error:', error);
            clearAuthAndRedirect();
            return false;
        }
    }
    
    function redirectToLogin() {
        window.location.href = '../login.html';
    }
    
    function clearAuthAndRedirect() {
        localStorage.removeItem('lba_auth_token');
        localStorage.removeItem('lba_refresh_token');
        localStorage.removeItem('lba_user_data');
        localStorage.removeItem('lba_user_role');
        localStorage.removeItem('csrf_token');
        redirectToLogin();
    }
    
    // Execute immediately
    checkAuthentication();
    
    // Optional: Set up periodic token refresh
    setInterval(async () => {
        const token = localStorage.getItem('lba_auth_token');
        if (token) {
            try {
                const response = await fetch(`${BACKEND_URL}/auth/refresh`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (response.ok) {
                    const data = await response.json();
                    if (data.token) {
                        localStorage.setItem('lba_auth_token', data.token);
                    }
                }
            } catch (e) {
                // Silent fail - will catch on next full check
            }
        }
    }, 15 * 60 * 1000); // Refresh every 15 minutes
})();
