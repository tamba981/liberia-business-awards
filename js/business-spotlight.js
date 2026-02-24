/**
 * LBA Business Spotlight v1.0
 * Professional News Portal for Liberia Business Awards
 */

const LBASpotlight = (function() {
    'use strict';
    
    // ============================================
    // CONFIGURATION
    // ============================================
    const CONFIG = {
        apiUrl: 'https://liberia-business-awards-backend.onrender.com/api',
        articlesPerPage: 12,
        cacheTime: 5 * 60 * 1000, // 5 minutes
        debug: true,
        shareButtons: true,
        commentsEnabled: true
    };
    
    // ============================================
    // STATE
    // ============================================
    let state = {
        initialized: false,
        currentPage: 1,
        categories: [],
        featuredArticles: [],
        currentArticle: null,
        cache: {},
        isLoading: false,
        totalPages: 1
    };
    
    // ============================================
    // UTILITIES
    // ============================================
    
    function logDebug(...args) {
        if (CONFIG.debug) {
            console.log('📰 [LBA Spotlight]:', ...args);
        }
    }
    
    function showLoader(container) {
        if (!container) return;
        container.innerHTML = `
            <div class="lba-spotlight-loader" style="text-align: center; padding: 60px 20px;">
                <div class="lba-spinner" style="width: 50px; height: 50px; border: 4px solid #f1f5f9; border-top-color: #FF0000; border-radius: 50%; margin: 0 auto 20px; animation: spin 1s linear infinite;"></div>
                <p style="color: #64748b;">Loading inspiring stories...</p>
            </div>
        `;
    }
    
    function hideLoader(container) {
        // Loader will be replaced by content
    }
    
    async function fetchWithCache(endpoint, params = {}) {
        const cacheKey = endpoint + JSON.stringify(params);
        const cached = state.cache[cacheKey];
        
        if (cached && Date.now() - cached.timestamp < CONFIG.cacheTime) {
            logDebug('Using cached data for:', endpoint);
            return cached.data;
        }
        
        const url = new URL(`${CONFIG.apiUrl}${endpoint}`);
        
        Object.entries(params).forEach(([key, value]) => {
            url.searchParams.append(key, value);
        });
        
        logDebug('Fetching:', url.toString());
        
        try {
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.success) {
                state.cache[cacheKey] = {
                    timestamp: Date.now(),
                    data: data.data || data
                };
                return data.data || data;
            }
            
            throw new Error(data.error || 'API error');
            
        } catch (error) {
            logDebug('Fetch error:', error);
            throw error;
        }
    }
    
    // ============================================
    // RENDERING FUNCTIONS
    // ============================================
    
    function renderArticleCard(article) {
        const categoryColor = article.category?.color || '#FF0000';
        const categoryName = article.category?.name || article.category_name || 'Business';
        
        return `
            <article class="lba-spotlight-card" data-article-id="${article.id || article._id}">
                <div class="lba-card-media">
                    <img 
                        src="${article.featured_image || '/images/placeholder-news.jpg'}" 
                        alt="${article.title}"
                        loading="lazy"
                        onerror="this.onerror=null; this.src='/images/placeholder-news.jpg';"
                    >
                    <span class="lba-card-category" style="background: ${categoryColor}">
                        ${categoryName}
                    </span>
                    ${article.is_breaking ? '<span class="lba-breaking-badge">BREAKING</span>' : ''}
                    ${article.is_interview ? '<span class="lba-interview-badge">INTERVIEW</span>' : ''}
                </div>
                
                <div class="lba-card-content">
                    <h3 class="lba-card-title">
                        <a href="/spotlight/${article.slug}">${article.title}</a>
                    </h3>
                    
                    <div class="lba-card-meta">
                        <span class="lba-card-author">
                            <i class="fas fa-user"></i> ${article.author_name}
                        </span>
                        <span class="lba-card-date">
                            <i class="far fa-calendar"></i> ${formatDate(article.published_at)}
                        </span>
                        <span class="lba-card-views">
                            <i class="far fa-eye"></i> ${article.view_count || 0}
                        </span>
                    </div>
                    
                    <p class="lba-card-excerpt">${article.excerpt || ''}</p>
                    
                    <div class="lba-card-footer">
                        <span class="lba-card-business">
                            <i class="fas fa-building"></i> ${article.business_name}
                        </span>
                        <a href="/spotlight/${article.slug}" class="lba-read-more">
                            Read Full Story <i class="fas fa-arrow-right"></i>
                        </a>
                    </div>
                </div>
            </article>
        `;
    }
    
    function formatDate(dateString) {
        if (!dateString) return 'Recent';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }
    
    function renderFeaturedSection(articles) {
        if (!articles || !articles.length) return '';
        
        const featured = articles[0];
        const rest = articles.slice(1);
        
        return `
            <div class="lba-spotlight-featured">
                <div class="lba-featured-main">
                    ${renderArticleCard(featured)}
                </div>
                
                ${rest.length ? `
                    <div class="lba-featured-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-top: 20px;">
                        ${rest.map(renderArticleCard).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    function renderArticleGrid(articles) {
        if (!articles || !articles.length) {
            return `
                <div style="text-align: center; padding: 60px 20px;">
                    <i class="fas fa-newspaper" style="font-size: 48px; color: #cbd5e0; margin-bottom: 20px;"></i>
                    <h3 style="color: #1a202c; margin-bottom: 10px;">No Stories Yet</h3>
                    <p style="color: #64748b;">Check back soon for inspiring business stories!</p>
                </div>
            `;
        }
        
        return `
            <div class="lba-spotlight-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 25px;">
                ${articles.map(renderArticleCard).join('')}
            </div>
        `;
    }
    
    function renderPagination(current, total) {
        if (total <= 1) return '';
        
        return `
            <div class="lba-spotlight-pagination" style="display: flex; justify-content: center; align-items: center; gap: 20px; margin-top: 40px;">
                ${current > 1 ? `
                    <button onclick="LBASpotlight.loadPage(${current - 1})" class="lba-page-prev" style="padding: 10px 20px; border-radius: 8px; background: white; color: #1a202c; border: 1px solid #e2e8f0; cursor: pointer;">
                        <i class="fas fa-chevron-left"></i> Previous
                    </button>
                ` : ''}
                
                <div class="lba-page-numbers" style="display: flex; gap: 8px;">
                    ${Array.from({ length: Math.min(5, total) }, (_, i) => {
                        let pageNum;
                        if (total <= 5) {
                            pageNum = i + 1;
                        } else if (current <= 3) {
                            pageNum = i + 1;
                        } else if (current >= total - 2) {
                            pageNum = total - 4 + i;
                        } else {
                            pageNum = current - 2 + i;
                        }
                        
                        return `
                            <button onclick="LBASpotlight.loadPage(${pageNum})" 
                                    class="lba-page-number" 
                                    style="padding: 10px 15px; border-radius: 8px; background: ${pageNum === current ? '#FF0000' : 'white'}; color: ${pageNum === current ? 'white' : '#1a202c'}; border: 1px solid #e2e8f0; cursor: pointer; min-width: 40px;">
                                ${pageNum}
                            </button>
                        `;
                    }).join('')}
                </div>
                
                ${current < total ? `
                    <button onclick="LBASpotlight.loadPage(${current + 1})" class="lba-page-next" style="padding: 10px 20px; border-radius: 8px; background: white; color: #1a202c; border: 1px solid #e2e8f0; cursor: pointer;">
                        Next <i class="fas fa-chevron-right"></i>
                    </button>
                ` : ''}
            </div>
        `;
    }
    
    function renderCategories(categories) {
        if (!categories || !categories.length) return '';
        
        return `
            <div class="lba-spotlight-categories" style="background: white; border-radius: 12px; padding: 25px; box-shadow: 0 5px 20px rgba(0,0,0,0.05);">
                <h3 style="font-size: 18px; font-weight: 700; margin-bottom: 20px; color: #1a202c;">Categories</h3>
                <ul class="lba-category-list" style="list-style: none; padding: 0; margin: 0;">
                    ${categories.map(cat => `
                        <li style="margin-bottom: 10px;">
                            <a href="/spotlight/category/${cat.slug}" 
                               style="display: flex; align-items: center; padding: 12px 15px; background: #f8fafc; border-radius: 8px; color: #1a202c; text-decoration: none; transition: all 0.3s; border-left: 4px solid ${cat.color || '#FF0000'};">
                                <i class="${cat.icon || 'fa-tag'}" style="width: 20px; margin-right: 10px; color: #FF0000;"></i>
                                ${cat.name}
                                <span class="lba-category-count" style="margin-left: auto; background: white; padding: 2px 8px; border-radius: 20px; font-size: 12px; font-weight: 600; color: #64748b;">${cat.article_count || 0}</span>
                            </a>
                        </li>
                    `).join('')}
                </ul>
            </div>
        `;
    }
    
    // ============================================
    // STYLES
    // ============================================
    
    function addStyles() {
        if (document.getElementById('lba-spotlight-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'lba-spotlight-styles';
        style.textContent = `
            /* Business Spotlight Styles */
            .lba-spotlight-section {
                max-width: 1200px;
                margin: 0 auto;
                padding: 0 20px 40px;
                font-family: 'Poppins', sans-serif;
            }
            
            .lba-spotlight-layout {
                display: grid;
                grid-template-columns: 1fr 300px;
                gap: 30px;
            }
            
            .lba-spotlight-main {
                min-width: 0;
            }
            
            .lba-spotlight-sidebar {
                position: sticky;
                top: 100px;
                align-self: start;
            }
            
            /* Article Cards */
            .lba-spotlight-card {
                background: white;
                border-radius: 12px;
                overflow: hidden;
                box-shadow: 0 5px 20px rgba(0, 0, 0, 0.05);
                transition: all 0.3s ease;
                border: 1px solid rgba(0, 0, 0, 0.05);
                height: 100%;
                display: flex;
                flex-direction: column;
            }
            
            .lba-spotlight-card:hover {
                transform: translateY(-5px);
                box-shadow: 0 15px 30px rgba(0, 0, 0, 0.1);
                border-color: #87CEEB;
            }
            
            .lba-card-media {
                position: relative;
                height: 200px;
                overflow: hidden;
            }
            
            .lba-card-media img {
                width: 100%;
                height: 100%;
                object-fit: cover;
                transition: transform 0.5s;
            }
            
            .lba-spotlight-card:hover .lba-card-media img {
                transform: scale(1.05);
            }
            
            .lba-card-category {
                position: absolute;
                top: 15px;
                left: 15px;
                padding: 6px 15px;
                border-radius: 20px;
                color: white;
                font-size: 12px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                z-index: 2;
            }
            
            .lba-breaking-badge,
            .lba-interview-badge {
                position: absolute;
                top: 15px;
                right: 15px;
                padding: 4px 10px;
                border-radius: 20px;
                font-size: 11px;
                font-weight: 700;
                text-transform: uppercase;
                z-index: 2;
            }
            
            .lba-breaking-badge {
                background: #EF4444;
                color: white;
                animation: pulse 2s infinite;
            }
            
            .lba-interview-badge {
                background: #8B5CF6;
                color: white;
            }
            
            .lba-card-content {
                padding: 20px;
                flex: 1;
                display: flex;
                flex-direction: column;
            }
            
            .lba-card-title {
                font-size: 18px;
                font-weight: 700;
                margin-bottom: 10px;
                line-height: 1.4;
            }
            
            .lba-card-title a {
                color: #1a202c;
                text-decoration: none;
                transition: color 0.3s;
            }
            
            .lba-card-title a:hover {
                color: #FF0000;
            }
            
            .lba-card-meta {
                display: flex;
                flex-wrap: wrap;
                gap: 15px;
                margin-bottom: 10px;
                font-size: 13px;
                color: #64748b;
            }
            
            .lba-card-meta span {
                display: flex;
                align-items: center;
                gap: 5px;
            }
            
            .lba-card-excerpt {
                color: #4b5563;
                font-size: 14px;
                line-height: 1.6;
                margin-bottom: 15px;
                flex: 1;
            }
            
            .lba-card-footer {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding-top: 15px;
                border-top: 1px solid #e2e8f0;
            }
            
            .lba-card-business {
                font-size: 13px;
                font-weight: 600;
                color: #FF0000;
                display: flex;
                align-items: center;
                gap: 5px;
            }
            
            .lba-read-more {
                color: #87CEEB;
                text-decoration: none;
                font-size: 13px;
                font-weight: 600;
                display: flex;
                align-items: center;
                gap: 5px;
                transition: gap 0.3s;
            }
            
            .lba-read-more:hover {
                gap: 8px;
            }
            
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
            
            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.7; }
            }
            
            /* Responsive */
            @media (max-width: 1024px) {
                .lba-spotlight-layout {
                    grid-template-columns: 1fr;
                }
                
                .lba-spotlight-sidebar {
                    position: static;
                }
            }
            
            @media (max-width: 768px) {
                .lba-featured-grid {
                    grid-template-columns: 1fr !important;
                }
                
                .lba-spotlight-grid {
                    grid-template-columns: 1fr !important;
                }
            }
        `;
        
        document.head.appendChild(style);
    }
    
    // ============================================
    // MAIN FUNCTIONS
    // ============================================
    
    return {
        /**
         * Initialize spotlight section
         */
        init: async function(containerId, options = {}) {
            Object.assign(CONFIG, options);
            
            const container = document.getElementById(containerId);
            if (!container) {
                logDebug('Container not found:', containerId);
                return this;
            }
            
            addStyles();
            
            // Show loader
            showLoader(container);
            
            // Load initial data
            try {
                const [featured, categories] = await Promise.all([
                    this.getFeatured(),
                    this.getCategories()
                ]);
                
                state.featuredArticles = featured;
                state.categories = categories;
                
                // Render layout
                container.innerHTML = `
                    <div class="lba-spotlight-section">
                        <div class="lba-spotlight-layout">
                            <div class="lba-spotlight-main">
                                <div class="lba-spotlight-featured-container"></div>
                                <div class="lba-spotlight-grid-container"></div>
                                <div class="lba-spotlight-pagination-container"></div>
                            </div>
                            
                            <div class="lba-spotlight-sidebar">
                                ${renderCategories(categories)}
                            </div>
                        </div>
                    </div>
                `;
                
                // Load first page
                await this.loadPage(1);
                
            } catch (error) {
                logDebug('Init error:', error);
                container.innerHTML = `
                    <div class="lba-spotlight-error" style="text-align: center; padding: 60px 20px;">
                        <i class="fas fa-exclamation-triangle" style="font-size: 48px; color: #EF4444; margin-bottom: 20px;"></i>
                        <h3 style="color: #1a202c; margin-bottom: 10px;">Unable to Load Stories</h3>
                        <p style="color: #64748b; margin-bottom: 20px;">Please refresh the page or try again later.</p>
                        <button onclick="location.reload()" style="background: #FF0000; color: white; border: none; padding: 12px 30px; border-radius: 25px; font-weight: 600; cursor: pointer;">Refresh Page</button>
                    </div>
                `;
            }
            
            return this;
        },
        
        /**
         * Load page of articles
         */
        loadPage: async function(page = 1) {
            const gridContainer = document.querySelector('.lba-spotlight-grid-container');
            const featuredContainer = document.querySelector('.lba-spotlight-featured-container');
            const paginationContainer = document.querySelector('.lba-spotlight-pagination-container');
            
            if (!gridContainer) return;
            
            state.isLoading = true;
            showLoader(gridContainer);
            
            try {
                const data = await fetchWithCache('/news/articles', {
                    page: page,
                    limit: CONFIG.articlesPerPage
                });
                
                // Update featured section on first page only
                if (page === 1 && state.featuredArticles.length > 0 && featuredContainer) {
                    featuredContainer.innerHTML = renderFeaturedSection(state.featuredArticles);
                }
                
                gridContainer.innerHTML = renderArticleGrid(data.articles || []);
                paginationContainer.innerHTML = renderPagination(page, data.pages || 1);
                
                state.currentPage = page;
                state.totalPages = data.pages || 1;
                
                // Scroll to top smoothly
                gridContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
                
            } catch (error) {
                logDebug('Load page error:', error);
                gridContainer.innerHTML = `
                    <div style="text-align: center; padding: 40px;">
                        <p style="color: #64748b;">Failed to load articles. Please try again.</p>
                        <button onclick="LBASpotlight.loadPage(${page})" style="background: #FF0000; color: white; border: none; padding: 10px 20px; border-radius: 25px; margin-top: 20px; cursor: pointer;">
                            Retry
                        </button>
                    </div>
                `;
            } finally {
                state.isLoading = false;
            }
        },
        
        /**
         * Get featured articles
         */
        getFeatured: async function() {
            try {
                const data = await fetchWithCache('/news/featured', { limit: 5 });
                return data.articles || [];
            } catch (error) {
                logDebug('Get featured error:', error);
                return [];
            }
        },
        
        /**
         * Get categories
         */
        getCategories: async function() {
            try {
                const data = await fetchWithCache('/news/categories');
                return data.categories || [];
            } catch (error) {
                logDebug('Get categories error:', error);
                return [];
            }
        },
        
        /**
         * Debug mode
         */
        setDebug: function(enabled) {
            CONFIG.debug = enabled;
            return this;
        }
    };
})();

// Auto-initialize if container exists
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('lba-spotlight')) {
        LBASpotlight.init('lba-spotlight', {
            debug: true,
            articlesPerPage: 12
        });
    }
});
