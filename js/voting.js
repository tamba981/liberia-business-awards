// ============================================
// LIBERIA BUSINESS AWARDS - VOTING SYSTEM
// ============================================

const VotingSystem = {
    // Configuration
    config: {
        apiUrl: 'https://liberia-business-awards-production.up.railway.app/api',
        sheetsUrl: 'https://script.google.com/macros/s/AKfycbxxJTXMjUdlzxa3Y5u-Cvhzso0ln_6Fv2rX7Qb9w6d7c-JvoA_yuNa6ObLSgigjiCz3/exec',
        votingStart: new Date('2026-04-01'),
        votingEnd: new Date('2026-12-31'),
        isActive: false
    },
    
    // State
    state: {
        currentPage: 1,
        currentCategory: 'all',
        selectedBusiness: null,
        voterEmail: null,
        isVerified: false,
        verificationCode: null,
        votedBusinesses: []
    },
    
    // Initialize voting system
    init: function() {
        console.log('🎯 Voting System Initializing...');
        this.checkVotingStatus();
        this.loadLeaderboard();
        this.loadBusinesses();
        this.setupEventListeners();
        this.loadVotedBusinesses();
    },
    
    // Check if voting is active
checkVotingStatus: async function() {
    try {
        // First, check using local config dates (bypass API for testing)
        const now = new Date();
        const isLocallyActive = now >= this.config.votingStart && now <= this.config.votingEnd;
        
        // Try to get status from API, but fall back to local config
        let apiActive = false;
        try {
            const response = await fetch(`${this.config.apiUrl}/voting/status`);
            const data = await response.json();
            apiActive = data.isActive;
        } catch (apiError) {
            console.log('API status check failed, using local config');
        }
        
        // Use local config for testing (override API)
        this.config.isActive = isLocallyActive;
        
        const statusElement = document.getElementById('votingStatus');
        const countdownElement = document.getElementById('votingCountdown');
        
        if (statusElement) {
            if (this.config.isActive) {
                statusElement.innerHTML = `
                    <div class="voting-active-badge">
                        <i class="fas fa-check-circle"></i> VOTING IS OPEN!
                    </div>
                    <p>Cast your vote for Liberia's best businesses. Voting ends ${this.config.votingEnd.toLocaleDateString()}</p>
                `;
                // Hide countdown if voting is active
                if (countdownElement) countdownElement.innerHTML = '';
            } else if (now < this.config.votingStart) {
                statusElement.innerHTML = `
                    <div class="voting-pending-badge">
                        <i class="fas fa-clock"></i> VOTING STARTS SOON
                    </div>
                    <p>Voting begins ${this.config.votingStart.toLocaleDateString()}. Get ready to support your favorite businesses!</p>
                `;
                if (countdownElement && now < this.config.votingStart) {
                    this.startCountdown();
                }
            } else {
                statusElement.innerHTML = `
                    <div class="voting-closed-badge">
                        <i class="fas fa-lock"></i> VOTING HAS CLOSED
                    </div>
                    <p>Thank you for participating! Winners will be announced at the awards ceremony.</p>
                `;
                if (countdownElement) countdownElement.innerHTML = '';
            }
        }
        
        console.log('📊 Voting Status:', {
            isActive: this.config.isActive,
            votingStart: this.config.votingStart,
            votingEnd: this.config.votingEnd,
            now: now
        });
        
    } catch (error) {
        console.error('Status check failed:', error);
        // Fallback to local config
        const now = new Date();
        this.config.isActive = now >= this.config.votingStart && now <= this.config.votingEnd;
    }
},
    
    // Start countdown timer
startCountdown: function() {
    const countdownElement = document.getElementById('votingCountdown');
    if (!countdownElement) return;
    
    const updateCountdown = () => {
        const now = new Date();
        const diff = this.config.votingStart - now;
        
        if (diff <= 0) {
            clearInterval(this.countdownInterval);
            countdownElement.innerHTML = '<span class="text-success">Voting is now OPEN!</span>';
            this.checkVotingStatus();
            return;
        }
        
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        
        countdownElement.innerHTML = `
            <div class="countdown-timer">
                <span class="countdown-number">${days}d</span>
                <span class="countdown-number">${hours}h</span>
                <span class="countdown-number">${minutes}m</span>
                <span class="countdown-number">${seconds}s</span>
            </div>
            <p class="countdown-label">Until voting opens</p>
        `;
    };
    
    updateCountdown();
    if (this.countdownInterval) clearInterval(this.countdownInterval);
    this.countdownInterval = setInterval(updateCountdown, 1000);
},

    // Load businesses for voting (from Google Sheets manual list)
loadBusinesses: async function(page = 1) {
    const container = document.getElementById('votingBusinessesContainer');
    if (!container) return;
    
    this.state.currentPage = page;
    
    container.innerHTML = `
        <div class="text-center py-5">
            <i class="fas fa-spinner fa-spin fa-2x text-lba-red"></i>
            <p class="mt-3">Loading voting businesses...</p>
        </div>
    `;
    
    try {
        const url = `${this.config.sheetsUrl}?action=getVotingBusinesses&page=${page}&limit=12&category=${this.state.currentCategory}`;
        console.log('📡 Fetching voting businesses from:', url);
        
        const response = await fetch(url);
        const data = await response.json();
        
        console.log('📥 Response received:', data);
        
        // Check if we have businesses in the response
        let businesses = [];
        let pagination = null;
        
        if (data && data.businesses && Array.isArray(data.businesses)) {
            businesses = data.businesses;
            pagination = data.pagination;
        } else if (data && data.success && data.businesses && Array.isArray(data.businesses)) {
            businesses = data.businesses;
            pagination = data.pagination;
        } else {
            console.warn('No businesses in response, using fallback data');
            // Only use fallback if API really fails, not just empty
            if (data && data.error) {
                console.error('API Error:', data.error);
                this.loadLocalVotingBusinesses(page);
                return;
            }
        }
        
        if (businesses.length > 0) {
            this.displayBusinesses(businesses);
            if (pagination) {
                this.displayPagination(pagination);
            } else {
                // Create pagination from businesses array
                this.displayPagination({
                    page: page,
                    pages: Math.ceil(businesses.length / 12),
                    total: businesses.length
                });
            }
        } else {
            // No businesses from API, show empty state
            this.displayBusinesses([]);
        }
        
    } catch (error) {
        console.error('Load businesses error:', error);
        // Only fall back to local data on network error
        this.loadLocalVotingBusinesses(page);
    }
},

// Local fallback - businesses you manually add here (EMERGENCY BACKUP ONLY)
loadLocalVotingBusinesses: function(page = 1) {
    console.log('⚠️ Using local fallback voting businesses');
    
    // ============================================
    // ✅ EMERGENCY BACKUP BUSINESSES
    // ============================================
    const votingBusinesses = [
        {
            _id: "vb_001",
            business_name: "Stefix Services",
            category: "General",
            location: "Liberia",
            logo: null,
            vote_stats: { average_score: 0, total_votes: 0 }
        },
        {
            _id: "vb_002",
            business_name: "LBA OBSERVER",
            category: "General",
            location: "Liberia",
            logo: null,
            vote_stats: { average_score: 0, total_votes: 0 }
        },
        {
            _id: "vb_003",
            business_name: "Test Business",
            category: "General",
            location: "Liberia",
            logo: null,
            vote_stats: { average_score: 0, total_votes: 0 }
        }
    ];
    
    // Filter by category
    let filtered = votingBusinesses;
    if (this.state.currentCategory !== 'all') {
        filtered = votingBusinesses.filter(b => b.category === this.state.currentCategory);
    }
    
    // Paginate
    const limit = 12;
    const start = (page - 1) * limit;
    const paginated = filtered.slice(start, start + limit);
    
    this.displayBusinesses(paginated);
    this.displayPagination({
        page: page,
        pages: Math.ceil(filtered.length / limit),
        total: filtered.length
    });
},
    
    // Display businesses
    displayBusinesses: function(businesses) {
        const container = document.getElementById('votingBusinessesContainer');
        if (!container) return;
        
        if (!businesses || businesses.length === 0) {
            container.innerHTML = `
                <div class="text-center py-5">
                    <i class="fas fa-building fa-2x text-muted"></i>
                    <p class="mt-3">No businesses found in this category.</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = businesses.map(business => {
            const hasVoted = this.state.votedBusinesses.includes(business._id);
            const avgScore = business.vote_stats?.average_score || 0;
            const voteCount = business.vote_stats?.total_votes || 0;
            
            return `
                <div class="voting-card" data-business-id="${business._id}">
                    <div class="voting-card-header">
                        <div class="business-logo">
                            ${business.logo ? 
                                `<img src="${business.logo}" alt="${business.business_name}">` : 
                                `<div class="logo-placeholder">${business.business_name.charAt(0)}</div>`
                            }
                        </div>
                        <div class="business-info">
                            <h3>${this.escapeHtml(business.business_name)}</h3>
                            <p><i class="fas fa-tag"></i> ${business.category || 'General'}</p>
                            <p><i class="fas fa-map-marker-alt"></i> ${business.location || 'Liberia'}</p>
                        </div>
                        <div class="vote-stats">
                            <div class="vote-score">
                                <span class="score-value">${avgScore.toFixed(1)}</span>
                                <span class="score-label">/10</span>
                            </div>
                            <div class="vote-count">
                                <i class="fas fa-users"></i> ${voteCount} votes
                            </div>
                        </div>
                    </div>
                    <div class="voting-card-footer">
                        ${hasVoted ? `
                            <div class="already-voted-badge">
                                <i class="fas fa-check-circle"></i> You voted for this business
                            </div>
                        ` : this.config.isActive ? `
                            <button class="btn-vote" onclick="VotingSystem.openVoteModal('${business._id}', '${this.escapeHtml(business.business_name)}', '${business.category || 'General'}')">
                                <i class="fas fa-vote-yea"></i> Vote Now
                            </button>
                        ` : `
                            <button class="btn-vote disabled" disabled>
                                <i class="fas fa-lock"></i> Voting Closed
                            </button>
                        `}
                        <button class="btn-details" onclick="VotingSystem.showBusinessDetails('${business._id}')">
                            <i class="fas fa-info-circle"></i> Details
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    },
    
    // Display pagination
    displayPagination: function(pagination) {
        const container = document.getElementById('votingPagination');
        if (!container) return;
        
        if (!pagination || pagination.pages <= 1) {
            container.innerHTML = '';
            return;
        }
        
        let html = '';
        
        // Previous button
        html += `<button class="page-btn" ${pagination.page === 1 ? 'disabled' : ''} onclick="VotingSystem.loadBusinesses(${pagination.page - 1})">
            <i class="fas fa-chevron-left"></i>
        </button>`;
        
        // Page numbers
        for (let i = 1; i <= pagination.pages; i++) {
            if (i === 1 || i === pagination.pages || (i >= pagination.page - 2 && i <= pagination.page + 2)) {
                html += `<button class="page-btn ${i === pagination.page ? 'active' : ''}" onclick="VotingSystem.loadBusinesses(${i})">${i}</button>`;
            } else if (i === pagination.page - 3 || i === pagination.page + 3) {
                html += `<span class="page-dots">...</span>`;
            }
        }
        
        // Next button
        html += `<button class="page-btn" ${pagination.page === pagination.pages ? 'disabled' : ''} onclick="VotingSystem.loadBusinesses(${pagination.page + 1})">
            <i class="fas fa-chevron-right"></i>
        </button>`;
        
        container.innerHTML = html;
    },
    
    // Load leaderboard
    loadLeaderboard: async function() {
        const container = document.getElementById('votingLeaderboard');
        if (!container) return;
        
        container.innerHTML = '<div class="text-center py-3"><i class="fas fa-spinner fa-spin"></i> Loading leaderboard...</div>';
        
        try {
            const response = await fetch(`${this.config.apiUrl}/voting/leaderboard?limit=10`);
            const data = await response.json();
            
            if (data.success && data.leaderboard.length > 0) {
                container.innerHTML = `
                    <div class="leaderboard-list">
                        ${data.leaderboard.map((item, index) => `
                            <div class="leaderboard-item rank-${item.rank}">
                                <div class="leaderboard-rank">#${item.rank}</div>
                                <div class="leaderboard-info">
                                    <div class="leaderboard-name">${this.escapeHtml(item.business_name)}</div>
                                    <div class="leaderboard-category">${item.category}</div>
                                </div>
                                <div class="leaderboard-score">
                                    <span class="score-number">${item.average_score.toFixed(1)}</span>
                                    <span class="score-max">/10</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `;
            } else {
                container.innerHTML = '<p class="text-center text-muted">No votes yet. Be the first to vote!</p>';
            }
        } catch (error) {
            console.error('Load leaderboard error:', error);
            container.innerHTML = '<p class="text-center text-muted">Leaderboard temporarily unavailable</p>';
        }
    },
    
    // Open vote modal
    openVoteModal: function(businessId, businessName, category) {
        if (!this.config.isActive) {
            this.showToast('Voting is currently closed', 'warning');
            return;
        }
        
        this.state.selectedBusiness = { id: businessId, name: businessName, category: category };
        
        const modal = document.getElementById('voteModal');
        const businessInfo = document.getElementById('voteBusinessInfo');
        
        businessInfo.innerHTML = `
            <strong>${this.escapeHtml(businessName)}</strong>
            <span class="badge">${category}</span>
        `;
        
        // Reset modal state
        document.getElementById('voterEmail').value = '';
        document.getElementById('verificationCode').value = '';
        document.getElementById('verificationSection').style.display = 'none';
        document.getElementById('voteSection').style.display = 'none';
        document.getElementById('emailSection').style.display = 'block';
        document.getElementById('voteValue').value = 5;
        document.getElementById('voteValueDisplay').textContent = '5';
        
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    },
    
    // Send verification code
    sendVerificationCode: async function() {
    const email = document.getElementById('voterEmail').value.trim();
    
    if (!email) {
        this.showToast('Please enter your email address', 'error');
        return;
    }
    
    const sendBtn = document.getElementById('sendCodeBtn');
    const originalText = sendBtn.innerHTML;
    
    sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
    sendBtn.disabled = true;
    
    try {
        const response = await fetch(GOOGLE_APPS_SCRIPT_URL, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                formType: 'send_verification',
                email: email
            })
        });
        
        const data = await response.json();
        console.log('📧 Verification response:', data);
        
        if (data.success) {
            this.showToast('Verification code sent to your email!', 'success');
            // Proceed to verification step
            document.getElementById('emailSection').style.display = 'none';
            document.getElementById('verificationSection').style.display = 'block';
        } else {
            this.showToast(data.error || 'Failed to send code', 'error');
        }
    } catch (error) {
        console.error('Send verification error:', error);
        this.showToast('Network error. Please try again.', 'error');
    } finally {
        sendBtn.innerHTML = originalText;
        sendBtn.disabled = false;
    }
},
    
    // Start verification countdown
    startVerificationCountdown: function() {
        let timeLeft = 60;
        const timerElement = document.getElementById('verificationTimer');
        const resendBtn = document.getElementById('resendCodeBtn');
        
        const interval = setInterval(() => {
            timeLeft--;
            timerElement.textContent = `${timeLeft}s`;
            
            if (timeLeft <= 0) {
                clearInterval(interval);
                resendBtn.style.display = 'inline-block';
                timerElement.textContent = '';
            }
        }, 1000);
        
        this.verificationInterval = interval;
    },
    
    // Verify code
    verifyCode: async function() {
        const code = document.getElementById('verificationCode').value.trim();
        
        if (!code) {
            this.showToast('Please enter the verification code', 'error');
            return;
        }
        
        const verifyBtn = document.getElementById('verifyCodeBtn');
        const originalText = verifyBtn.innerHTML;
        
        verifyBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verifying...';
        verifyBtn.disabled = true;
        
        try {
            const response = await fetch(`${this.config.apiUrl}/voting/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    email: this.state.voterEmail, 
                    code: code 
                })
            });
            
            const data = await response.json();
            
            if (data.success && data.verified) {
                this.state.isVerified = true;
                this.state.verificationCode = code;
                document.getElementById('verificationSection').style.display = 'none';
                document.getElementById('voteSection').style.display = 'block';
                this.showToast('Email verified! You can now vote.', 'success');
            } else {
                this.showToast(data.error || 'Invalid verification code', 'error');
            }
        } catch (error) {
            this.showToast('Verification failed. Please try again.', 'error');
        } finally {
            verifyBtn.innerHTML = originalText;
            verifyBtn.disabled = false;
        }
    },
    
    // Resend code
    resendCode: function() {
        clearInterval(this.verificationInterval);
        this.sendVerificationCode();
        document.getElementById('resendCodeBtn').style.display = 'none';
    },
    
    // Submit vote
    submitVote: async function() {
        const voteValue = parseInt(document.getElementById('voteValue').value);
        
        const submitBtn = document.getElementById('submitVoteBtn');
        const originalText = submitBtn.innerHTML;
        
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
        submitBtn.disabled = true;
        
        try {
            const response = await fetch(`${this.config.apiUrl}/voting/cast`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    business_id: this.state.selectedBusiness.id,
                    business_name: this.state.selectedBusiness.name,
                    category: this.state.selectedBusiness.category,
                    vote_value: voteValue,
                    voter_email: this.state.voterEmail,
                    verification_code: this.state.verificationCode
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showToast(data.message, 'success');
                this.closeVoteModal();
                this.state.votedBusinesses.push(this.state.selectedBusiness.id);
                localStorage.setItem('votedBusinesses', JSON.stringify(this.state.votedBusinesses));
                this.loadBusinesses(this.state.currentPage);
                this.loadLeaderboard();
            } else {
                this.showToast(data.error || 'Failed to submit vote', 'error');
            }
        } catch (error) {
            this.showToast('Network error. Please try again.', 'error');
        } finally {
            submitBtn.innerHTML = originalText;
            submitBtn.disabled = false;
        }
    },
    
    // Load voted businesses from localStorage
    loadVotedBusinesses: function() {
        const saved = localStorage.getItem('votedBusinesses');
        if (saved) {
            try {
                this.state.votedBusinesses = JSON.parse(saved);
            } catch (e) {}
        }
    },
    
    // Show business details
    showBusinessDetails: async function(businessId) {
        const modal = document.getElementById('businessDetailsModal');
        const content = document.getElementById('businessDetailsContent');
        
        content.innerHTML = '<div class="text-center py-5"><i class="fas fa-spinner fa-spin fa-2x"></i><p>Loading details...</p></div>';
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        try {
            const response = await fetch(`${this.config.apiUrl}/voting/business/${businessId}/stats`);
            const data = await response.json();
            
            // Also need business basic info - fetch from businesses endpoint
            const businessesResponse = await fetch(`${this.config.apiUrl}/voting/businesses?page=1&limit=100`);
            const businessesData = await businessesResponse.json();
            const business = businessesData.businesses?.find(b => b._id === businessId);
            
            if (business || data.success) {
                const stats = data.stats || {};
                const votes = data.recent_votes || [];
                
                content.innerHTML = `
                    <div class="business-details">
                        <div class="details-header">
                            <div class="details-logo">
                                ${business?.logo ? 
                                    `<img src="${business.logo}" alt="${business?.business_name}">` : 
                                    `<div class="logo-placeholder large">${business?.business_name?.charAt(0) || 'B'}</div>`
                                }
                            </div>
                            <div class="details-info">
                                <h2>${this.escapeHtml(business?.business_name || 'Business')}</h2>
                                <p><i class="fas fa-tag"></i> ${business?.category || stats.category || 'General'}</p>
                                <p><i class="fas fa-map-marker-alt"></i> ${business?.location || 'Liberia'}</p>
                            </div>
                        </div>
                        
                        <div class="details-stats">
                            <div class="stat-box">
                                <div class="stat-value">${stats.average_score?.toFixed(1) || '0.0'}</div>
                                <div class="stat-label">Average Score</div>
                                <div class="stat-max">out of 10</div>
                            </div>
                            <div class="stat-box">
                                <div class="stat-value">${stats.total_votes || 0}</div>
                                <div class="stat-label">Total Votes</div>
                            </div>
                            <div class="stat-box">
                                <div class="stat-value">${stats.public_votes || 0}</div>
                                <div class="stat-label">Public Votes</div>
                            </div>
                            <div class="stat-box">
                                <div class="stat-value">${stats.jury_votes || 0}</div>
                                <div class="stat-label">Jury Votes</div>
                            </div>
                        </div>
                        
                        <div class="details-recent-votes">
                            <h4>Recent Votes</h4>
                            ${votes.length > 0 ? `
                                <div class="recent-votes-list">
                                    ${votes.map(v => `
                                        <div class="recent-vote-item">
                                            <span class="vote-date">${new Date(v.created_at).toLocaleDateString()}</span>
                                            <span class="vote-rating">${v.vote_value}/10</span>
                                            <span class="vote-type ${v.is_jury ? 'jury' : 'public'}">${v.is_jury ? 'Jury' : 'Public'}</span>
                                        </div>
                                    `).join('')}
                                </div>
                            ` : '<p class="text-muted">No votes yet</p>'}
                        </div>
                        
                        <div class="details-actions">
                            ${this.config.isActive && !this.state.votedBusinesses.includes(businessId) ? `
                                <button class="btn-vote large" onclick="VotingSystem.closeDetailsModal(); VotingSystem.openVoteModal('${businessId}', '${this.escapeHtml(business?.business_name || 'Business')}', '${business?.category || 'General'}')">
                                    <i class="fas fa-vote-yea"></i> Vote for this Business
                                </button>
                            ` : ''}
                            <button class="btn-close" onclick="VotingSystem.closeDetailsModal()">Close</button>
                        </div>
                    </div>
                `;
            }
        } catch (error) {
            content.innerHTML = `
                <div class="text-center py-5">
                    <i class="fas fa-exclamation-triangle fa-2x text-danger"></i>
                    <p class="mt-3">Failed to load business details</p>
                    <button class="btn btn-primary mt-3" onclick="VotingSystem.showBusinessDetails('${businessId}')">Retry</button>
                </div>
            `;
        }
    },
    
    // Filter by category
    filterByCategory: function(category) {
        this.state.currentCategory = category;
        this.loadBusinesses(1);
        
        // Update active button
        document.querySelectorAll('.category-filter-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.category === category) {
                btn.classList.add('active');
            }
        });
    },
    
    // Close vote modal
    closeVoteModal: function() {
        const modal = document.getElementById('voteModal');
        modal.classList.remove('active');
        document.body.style.overflow = 'auto';
        
        if (this.verificationInterval) {
            clearInterval(this.verificationInterval);
        }
        
        this.state.selectedBusiness = null;
        this.state.isVerified = false;
        this.state.verificationCode = null;
    },
    
    // Close details modal
    closeDetailsModal: function() {
        const modal = document.getElementById('businessDetailsModal');
        modal.classList.remove('active');
        document.body.style.overflow = 'auto';
    },
    
    // Update vote value display
    updateVoteValue: function(value) {
        document.getElementById('voteValueDisplay').textContent = value;
    },
    
    // Setup event listeners
    setupEventListeners: function() {
        // Close modals on background click
        document.getElementById('voteModal')?.addEventListener('click', (e) => {
            if (e.target === document.getElementById('voteModal')) {
                this.closeVoteModal();
            }
        });
        
        document.getElementById('businessDetailsModal')?.addEventListener('click', (e) => {
            if (e.target === document.getElementById('businessDetailsModal')) {
                this.closeDetailsModal();
            }
        });
        
        // Escape key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeVoteModal();
                this.closeDetailsModal();
            }
        });
    },
    
    // Helper: Validate email
    isValidEmail: function(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    },
    
    // Helper: Escape HTML
    escapeHtml: function(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    // Helper: Show toast notification
    showToast: function(message, type = 'info') {
        const container = document.getElementById('votingToastContainer');
        if (!container) return;
        
        const toast = document.createElement('div');
        toast.className = `voting-toast ${type}`;
        toast.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
            <button onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>
        `;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 5000);
    }
};

// ============================================
// SOCIAL SHARE FUNCTIONS
// ============================================

// ============================================
// SOCIAL SHARE FUNCTIONS - DIRECT TO VOTING SECTION
// ============================================

// Get voting section URL with hash
function getVotingSectionUrl() {
    // Get the current URL without any existing hash
    const baseUrl = window.location.href.split('#')[0];
    // Add the voting section ID as hash
    return `${baseUrl}#voting`;
}

// Share on Facebook
function shareVotingOnFacebook() {
    const url = encodeURIComponent(getVotingSectionUrl());
    const quote = encodeURIComponent('🗳️ Cast your vote for the best businesses in Liberia! Support local entrepreneurs and help choose the winners of the Liberia Business Awards 2026.');
    
    window.open(
        `https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${quote}`,
        'facebook-share-dialog',
        'width=626,height=436'
    );
}

// Share on Twitter
function shareVotingOnTwitter() {
    const url = encodeURIComponent(getVotingSectionUrl());
    const text = encodeURIComponent('🗳️ Vote for the best businesses in Liberia! 🇱🇷\n\nSupport local entrepreneurs and help choose the winners of the Liberia Business Awards 2026.\n\n');
    const hashtags = 'LiberiaBusinessAwards,Vote,Liberia';
    
    window.open(
        `https://twitter.com/intent/tweet?text=${text}&url=${url}&hashtags=${hashtags}`,
        'twitter-share-dialog',
        'width=600,height=450'
    );
}

// Share on LinkedIn
function shareVotingOnLinkedIn() {
    const url = encodeURIComponent(getVotingSectionUrl());
    const title = encodeURIComponent('Liberia Business Awards 2026 - Voting Open');
    const summary = encodeURIComponent('Cast your vote for the best businesses in Liberia! Support local entrepreneurs and help shape the future of Liberian business.');
    
    window.open(
        `https://www.linkedin.com/sharing/share-offsite/?url=${url}&title=${title}&summary=${summary}`,
        'linkedin-share-dialog',
        'width=600,height=450'
    );
}

// Share on WhatsApp
function shareVotingOnWhatsApp() {
    const url = encodeURIComponent(getVotingSectionUrl());
    const text = encodeURIComponent('🗳️ Vote for Liberia Business Awards 2026!\n\nSupport local businesses and help choose the winners. Cast your vote here:');
    
    window.open(
        `https://api.whatsapp.com/send?text=${text}%20${url}`,
        'whatsapp-share-dialog',
        'width=600,height=450'
    );
}

// Share by Email
function shareVotingByEmail() {
    const url = getVotingSectionUrl();
    const subject = encodeURIComponent('Vote for Liberia Business Awards 2026');
    const body = encodeURIComponent(
        'Hi,\n\nI wanted to share the Liberia Business Awards voting page with you.\n\n' +
        'Cast your vote for the best businesses in Liberia! Support local entrepreneurs and help choose the winners.\n\n' +
        'Vote here: ' + url + '\n\n' +
        'Voting period: June 1 - July 30, 2026\n\n' +
        'Best regards,\n' +
        document.title
    );
    
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
}

// Copy voting link to clipboard
async function copyVotingLink() {
    const url = getVotingSectionUrl();
    
    try {
        await navigator.clipboard.writeText(url);
        showCopySuccessMessage('Voting section link copied!');
    } catch (err) {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = url;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showCopySuccessMessage('Voting section link copied!');
    }
}

function showCopySuccessMessage(message) {
    // Remove existing toast if any
    const existingToast = document.querySelector('.copy-success-toast');
    if (existingToast) existingToast.remove();
    
    // Create new toast
    const toast = document.createElement('div');
    toast.className = 'copy-success-toast';
    toast.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
    document.body.appendChild(toast);
    
    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Add these to window object so they're accessible from HTML
window.shareVotingOnFacebook = shareVotingOnFacebook;
window.shareVotingOnTwitter = shareVotingOnTwitter;
window.shareVotingOnLinkedIn = shareVotingOnLinkedIn;
window.shareVotingOnWhatsApp = shareVotingOnWhatsApp;
window.shareVotingByEmail = shareVotingByEmail;
window.copyVotingLink = copyVotingLink;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    VotingSystem.init();
});
