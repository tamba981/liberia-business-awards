// dashboard.js - Shared dashboard functions

// Check authentication
function checkAuth(requiredRole = null) {
    const token = localStorage.getItem('lba_auth_token');
    const userRole = localStorage.getItem('lba_user_role');
    
    if (!token) {
        window.location.href = '../index.html';
        return false;
    }
    
    if (requiredRole && userRole !== requiredRole) {
        alert('Access denied. You do not have permission to view this page.');
        window.location.href = '../index.html';
        return false;
    }
    
    return true;
}

// Format date
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Format currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount);
}

// Show notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">${message}</div>
        <button class="notification-close">&times;</button>
    `;
    
    document.body.appendChild(notification);
    
    notification.querySelector('.notification-close').addEventListener('click', () => {
        notification.remove();
    });
    
    setTimeout(() => notification.remove(), 5000);
}

// Load user profile
async function loadUserProfile() {
    try {
        const token = localStorage.getItem('lba_auth_token');
        const response = await fetch(window.getApiUrl('/api/auth/me'), {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            return await response.json();
        }
    } catch (error) {
        console.error('Error loading user profile:', error);
    }
    return null;
}

// Logout function
function logout() {
    localStorage.removeItem('lba_auth_token');
    localStorage.removeItem('lba_user_data');
    localStorage.removeItem('lba_user_role');
    window.location.href = '../index.html';
}