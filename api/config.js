// API Configuration for Liberia Business Awards
class APIConfig {
    static getApiUrl(endpoint = '') {
        const baseUrl = window.location.hostname === 'liberiabusinessawardslr.com' 
            ? 'https://liberia-business-awards-backend.onrender.com'
            : 'http://localhost:10000';
        
        return `${baseUrl}${endpoint}`;
    }
    
    static async request(endpoint, options = {}) {
        const url = this.getApiUrl(endpoint);
        const token = localStorage.getItem('lba_auth_token');
        
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };
        
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        
        try {
            const response = await fetch(url, {
                ...options,
                headers
            });
            
            if (response.status === 401) {
                // Token expired, redirect to login
                localStorage.removeItem('lba_auth_token');
                localStorage.removeItem('lba_user_data');
                localStorage.removeItem('lba_user_role');
                window.location.href = '/dashboard/login.html';
                return;
            }
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.message || 'API request failed');
            }
            
            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }
    
    // Authentication methods
    static async login(email, password) {
        return await this.request('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
    }
    
    static async registerBusiness(data) {
        return await this.request('/api/auth/register', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }
    
    // Business methods
    static async getBusinessProfile() {
        return await this.request('/api/business/profile');
    }
    
    static async updateBusinessProfile(data) {
        return await this.request('/api/business/profile', {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    }
    
    static async getBusinessNominations() {
        return await this.request('/api/business/nominations');
    }
    
    static async submitNomination(data) {
        return await this.request('/api/nominations', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }
    
    // Admin methods
    static async getAdminDashboard() {
        return await this.request('/api/admin/dashboard');
    }
    
    static async getBusinesses(filter = {}) {
        const params = new URLSearchParams(filter);
        return await this.request(`/api/admin/businesses?${params}`);
    }
    
    static async updateBusinessStatus(businessId, status) {
        return await this.request(`/api/admin/businesses/${businessId}`, {
            method: 'PUT',
            body: JSON.stringify({ status })
        });
    }
    
    static async getNominations(filter = {}) {
        const params = new URLSearchParams(filter);
        return await this.request(`/api/admin/nominations?${params}`);
    }
    
    // Public methods
    static async getPublicStats() {
        return await this.request('/api/stats/public');
    }
    
    static async getAnnouncements() {
        return await this.request('/api/announcements');
    }
}

// Make it globally available
window.getApiUrl = APIConfig.getApiUrl.bind(APIConfig);
window.API = APIConfig;

// Initialize when loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('📡 Liberia Business Awards API initialized');
    console.log('🌐 API URL:', APIConfig.getApiUrl());
});