// ============================================
// LIBERIA BUSINESS AWARDS - VOTING SYSTEM
// ============================================

const VotingSystem = {
    // Configuration
    config: {
        apiUrl: 'https://liberia-business-awards-production.up.railway.app/api',
        sheetsUrl: 'https://script.google.com/macros/s/AKfycbxxJTXMjUdlzxa3Y5u-Cvhzso0ln_6Fv2rX7Qb9w6d7c-JvoA_yuNa6ObLSgigjiCz3/exec',
        // Voting is ALWAYS open - date check removed
        isActive: true
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
        this.displayVotingPeriodMessage();
        this.loadLeaderboard();
        this.loadBusinesses();
        this.setupEventListeners();
        this.loadVotedBusinesses();
    },
    
    // Display voting period message (auto-updates year)
    displayVotingPeriodMessage: function() {
        const currentYear = new Date().getFullYear();
        const votingStart = `June 1, ${currentYear}`;
        const votingEnd = `July 30, ${currentYear}`;
        
        const statusElement = document.getElementById('votingStatus');
        const countdownElement = document.getElementById('votingCountdown');
        
        if (statusElement) {
            statusElement.innerHTML = `
                <div class="voting-active-badge">
                    <i class="fas fa-check-circle"></i> VOTING IS OPEN!
                </div>
                <p>Support Liberian businesses by casting your vote. Public voting and jury evaluation from ${votingStart} - ${votingEnd}, ANNUALLY</p>
            `;
        }
        
        if (countdownElement) {
            countdownElement.innerHTML = '';
        }
        
        console.log('📊 Voting Period:', {
            start: votingStart,
            end: votingEnd,
            isActive: true
        });
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
                    <p class="mt-2 text-muted">Add businesses to the VotingBusinesses sheet to enable voting.</p>
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
                        ` : `
                            <button class="btn-vote" onclick="VotingSystem.openVoteModal('${business._id}', '${this.escapeHtml(business.business_name)}', '${business.category || 'General'}')">
                                <i class="fas fa-vote-yea"></i> Vote Now
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
        // ✅ FIXED: Get vote totals from Google Apps Script instead of Railway API
        const response = await fetch(`${this.config.sheetsUrl}?action=getVoteTotals`);
        const data = await response.json();
        
        console.log('📊 Leaderboard data:', data);
        
        if (data.success && data.totals && data.totals.length > 0) {
            // Sort by average score (highest first)
            const sortedTotals = [...data.totals].sort((a, b) => b.averageScore - a.averageScore);
            
            // Add rank and filter out businesses with zero votes
            const leaderboard = sortedTotals
                .filter(item => item.totalVotes > 0)
                .map((item, index) => ({
                    rank: index + 1,
                    business_name: item.businessName,
                    category: item.category,
                    total_votes: item.totalVotes,
                    average_score: item.averageScore,
                    public_votes: item.publicVotes,
                    jury_votes: item.juryVotes
                }));
            
            if (leaderboard.length > 0) {
                container.innerHTML = `
                    <div class="leaderboard-list">
                        ${leaderboard.map(item => `
                            <div class="leaderboard-item rank-${item.rank}">
                                <div class="leaderboard-rank">#${item.rank}</div>
                                <div class="leaderboard-info">
                                    <div class="leaderboard-name">${this.escapeHtml(item.business_name)}</div>
                                    <div class="leaderboard-category">${this.escapeHtml(item.category)}</div>
                                </div>
                                <div class="leaderboard-score">
                                    <span class="score-number">${item.average_score.toFixed(1)}</span>
                                    <span class="score-max">/10</span>
                                    <div class="leaderboard-votes">${item.total_votes} votes</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                `;
            } else {
                container.innerHTML = '<p class="text-center text-muted">No votes yet. Be the first to vote!</p>';
            }
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
        // REMOVED date check - voting is always open
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
    
    if (!this.isValidEmail(email)) {
        this.showToast('Please enter a valid email address', 'error');
        return;
    }
    
    const sendBtn = document.getElementById('sendCodeBtn');
    const originalText = sendBtn.innerHTML;
    
    sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';
    sendBtn.disabled = true;
    
    try {
        const response = await fetch(this.config.sheetsUrl, {
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
            this.state.voterEmail = email;
            this.showToast('Verification code sent to your email!', 'success');
            // Proceed to verification step
            document.getElementById('emailSection').style.display = 'none';
            document.getElementById('verificationSection').style.display = 'block';
            this.startVerificationCountdown();
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
        const response = await fetch(this.config.sheetsUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                formType: 'verify_voter',
                email: this.state.voterEmail,
                code: code
            })
        });
        
        const data = await response.json();
        console.log('🔐 Verification response:', data);
        
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
        console.error('Verification error:', error);
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
    if (!this.state.selectedBusiness || !this.state.selectedBusiness.id) {
        this.showToast('Please select a business to vote for', 'error');
        this.closeVoteModal();
        return;
    }
    
    const voteValue = parseInt(document.getElementById('voteValue').value);
    
    const submitBtn = document.getElementById('submitVoteBtn');
    const originalText = submitBtn.innerHTML;
    
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';
    submitBtn.disabled = true;
    
    try {
        const businessId = this.state.selectedBusiness.id;
        const businessName = this.state.selectedBusiness.name;
        const businessCategory = this.state.selectedBusiness.category;
        const voterEmail = this.state.voterEmail;
        const verificationCode = this.state.verificationCode;
        
        const response = await fetch(this.config.sheetsUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                formType: 'vote',
                businessId: businessId,
                businessName: businessName,
                category: businessCategory,
                voteValue: voteValue,
                voterEmail: voterEmail,
                verificationCode: verificationCode,
                source: 'website'
            })
        });
        
        const data = await response.json();
        console.log('🗳️ Vote submission response:', data);
        
        if (data.success) {
            this.showToast(data.message, 'success');
            this.closeVoteModal();
            this.state.votedBusinesses.push(businessId);
            localStorage.setItem('votedBusinesses', JSON.stringify(this.state.votedBusinesses));
            this.loadBusinesses(this.state.currentPage);
            this.loadLeaderboard();
        } else {
            this.showToast(data.error || 'Failed to submit vote', 'error');
        }
    } catch (error) {
        console.error('Submit vote error:', error);
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
        // ✅ FIXED: Get business details from Google Apps Script, not Railway API
        // First, get the business basic info from voting businesses list
        const businessesResponse = await fetch(`${this.config.sheetsUrl}?action=getVotingBusinesses&page=1&limit=100`);
        const businessesData = await businessesResponse.json();
        
        let business = null;
        if (businessesData && businessesData.businesses && Array.isArray(businessesData.businesses)) {
            business = businessesData.businesses.find(b => b._id === businessId);
        }
        
        // Get vote stats from Google Apps Script (VoteTotals sheet)
        const totalsResponse = await fetch(`${this.config.sheetsUrl}?action=getVoteTotals`);
        const totalsData = await totalsResponse.json();
        
        // Find stats for this business
        let stats = {
            average_score: 0,
            total_votes: 0,
            public_votes: 0,
            jury_votes: 0
        };
        
        if (totalsData && totalsData.success && totalsData.totals) {
            const businessStats = totalsData.totals.find(t => t.businessId === businessId);
            if (businessStats) {
                stats = {
                    average_score: businessStats.averageScore || 0,
                    total_votes: businessStats.totalVotes || 0,
                    public_votes: businessStats.publicVotes || 0,
                    jury_votes: businessStats.juryVotes || 0
                };
            }
        }
        
        // Get recent votes from Google Apps Script (Votes sheet)
        const votesResponse = await fetch(`${this.config.sheetsUrl}?action=getBusinessVotes&businessId=${businessId}`);
        const votesData = await votesResponse.json();
        
        let recentVotes = [];
        if (votesData && votesData.success && votesData.votes) {
            recentVotes = votesData.votes;
        }
        
        const businessName = business?.business_name || 'Business';
        const businessCategory = business?.category || 'General';
        const businessLocation = business?.location || 'Liberia';
        const businessLogo = business?.logo || null;
        
        content.innerHTML = `
            <div class="business-details">
                <div class="details-header">
                    <div class="details-logo">
                        ${businessLogo ? 
                            `<img src="${businessLogo}" alt="${businessName}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 50%;">` : 
                            `<div class="logo-placeholder large" style="width: 80px; height: 80px; background: linear-gradient(135deg, #FF0000, #87CEEB); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 32px; color: white;">${businessName.charAt(0)}</div>`
                        }
                    </div>
                    <div class="details-info">
                        <h2>${this.escapeHtml(businessName)}</h2>
                        <p><i class="fas fa-tag"></i> ${this.escapeHtml(businessCategory)}</p>
                        <p><i class="fas fa-map-marker-alt"></i> ${this.escapeHtml(businessLocation)}</p>
                    </div>
                </div>
                
                <div class="details-stats">
                    <div class="stat-box">
                        <div class="stat-value">${stats.average_score.toFixed(1)}</div>
                        <div class="stat-label">Average Score</div>
                        <div class="stat-max">out of 10</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-value">${stats.total_votes}</div>
                        <div class="stat-label">Total Votes</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-value">${stats.public_votes}</div>
                        <div class="stat-label">Public Votes</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-value">${stats.jury_votes}</div>
                        <div class="stat-label">Jury Votes</div>
                    </div>
                </div>
                
                <div class="details-recent-votes">
                    <h4>Recent Votes</h4>
                    ${recentVotes.length > 0 ? `
                        <div class="recent-votes-list">
                            ${recentVotes.slice(0, 10).map(v => `
                                <div class="recent-vote-item">
                                    <span class="vote-date">${new Date(v.timestamp).toLocaleDateString()}</span>
                                    <span class="vote-rating">${v.voteValue}/10</span>
                                    <span class="vote-type ${v.voteWeight === 3 ? 'jury' : 'public'}">${v.voteWeight === 3 ? 'Jury' : 'Public'}</span>
                                </div>
                            `).join('')}
                        </div>
                    ` : '<p class="text-muted" style="text-align: center; padding: 20px;">No votes yet</p>'}
                </div>
                
                <div class="details-actions">
                    ${!this.state.votedBusinesses.includes(businessId) ? `
                        <button class="btn-vote large" onclick="VotingSystem.closeDetailsModal(); VotingSystem.openVoteModal('${businessId}', '${this.escapeHtml(businessName)}', '${this.escapeHtml(businessCategory)}')">
                            <i class="fas fa-vote-yea"></i> Vote for this Business
                        </button>
                    ` : ''}
                    <button class="btn-close" onclick="VotingSystem.closeDetailsModal()">Close</button>
                </div>
            </div>
        `;
        
        // Add CSS for the details modal
        const style = document.createElement('style');
        style.textContent = `
            .business-details {
                padding: 20px;
            }
            .details-header {
                display: flex;
                gap: 20px;
                margin-bottom: 25px;
                padding-bottom: 20px;
                border-bottom: 1px solid #e2e8f0;
            }
            .details-info h2 {
                font-size: 1.5rem;
                margin-bottom: 8px;
            }
            .details-info p {
                color: #64748b;
                margin: 5px 0;
            }
            .details-info p i {
                width: 25px;
                color: #FF0000;
            }
            .details-stats {
                display: grid;
                grid-template-columns: repeat(4, 1fr);
                gap: 15px;
                margin-bottom: 25px;
            }
            .stat-box {
                text-align: center;
                padding: 15px;
                background: #f8fafc;
                border-radius: 12px;
            }
            .stat-value {
                font-size: 1.8rem;
                font-weight: 800;
                color: #FF0000;
            }
            .stat-label {
                font-size: 0.75rem;
                color: #64748b;
                margin-top: 5px;
            }
            .stat-max {
                font-size: 0.7rem;
                color: #94a3b8;
            }
            .details-recent-votes {
                margin-bottom: 25px;
            }
            .details-recent-votes h4 {
                font-size: 1rem;
                margin-bottom: 15px;
            }
            .recent-votes-list {
                max-height: 200px;
                overflow-y: auto;
            }
            .recent-vote-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px 0;
                border-bottom: 1px solid #e2e8f0;
            }
            .vote-date {
                font-size: 0.75rem;
                color: #64748b;
            }
            .vote-rating {
                font-weight: 700;
                color: #FF0000;
            }
            .vote-type {
                font-size: 0.7rem;
                padding: 3px 8px;
                border-radius: 20px;
            }
            .vote-type.public {
                background: #DBEAFE;
                color: #1D4ED8;
            }
            .vote-type.jury {
                background: #FEF3C7;
                color: #D97706;
            }
            .details-actions {
                display: flex;
                gap: 15px;
                margin-top: 20px;
                padding-top: 20px;
                border-top: 1px solid #e2e8f0;
            }
            .btn-vote.large {
                flex: 2;
                padding: 12px;
                font-size: 0.9rem;
            }
            .btn-close {
                flex: 1;
                background: #f1f5f9;
                border: none;
                padding: 12px;
                border-radius: 12px;
                font-weight: 600;
                cursor: pointer;
            }
            .btn-close:hover {
                background: #e2e8f0;
            }
            @media (max-width: 600px) {
                .details-header {
                    flex-direction: column;
                    text-align: center;
                }
                .details-stats {
                    grid-template-columns: repeat(2, 1fr);
                }
                .details-actions {
                    flex-direction: column;
                }
            }
        `;
        document.head.appendChild(style);
        
    } catch (error) {
        console.error('Show business details error:', error);
        content.innerHTML = `
            <div class="text-center py-5">
                <i class="fas fa-exclamation-triangle fa-2x text-danger"></i>
                <p class="mt-3">Failed to load business details</p>
                <p class="text-muted mt-2">${error.message}</p>
                <button class="btn btn-primary mt-3" onclick="VotingSystem.showBusinessDetails('${businessId}')" style="background: #FF0000; color: white; border: none; padding: 10px 20px; border-radius: 8px; margin-top: 15px; cursor: pointer;">Retry</button>
            </div>
        `;
    }
},
    
    // Filter by category
    filterByCategory: function(category) {
        this.state.currentCategory = category;
        this.loadBusinesses(1);
        
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

function getVotingSectionUrl() {
    const baseUrl = window.location.href.split('#')[0];
    return `${baseUrl}#voting`;
}

function shareVotingOnFacebook() {
    const url = encodeURIComponent(getVotingSectionUrl());
    const quote = encodeURIComponent('🗳️ Cast your vote for the best businesses in Liberia! Support local entrepreneurs and help choose the winners of the Liberia Business Awards.');
    
    window.open(
        `https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${quote}`,
        'facebook-share-dialog',
        'width=626,height=436'
    );
}

function shareVotingOnTwitter() {
    const url = encodeURIComponent(getVotingSectionUrl());
    const currentYear = new Date().getFullYear();
    const text = encodeURIComponent(`🗳️ Vote for the best businesses in Liberia! 🇱🇷\n\nSupport local entrepreneurs and help choose the winners of the Liberia Business Awards ${currentYear}.\n\n`);
    const hashtags = 'LiberiaBusinessAwards,Vote,Liberia';
    
    window.open(
        `https://twitter.com/intent/tweet?text=${text}&url=${url}&hashtags=${hashtags}`,
        'twitter-share-dialog',
        'width=600,height=450'
    );
}

function shareVotingOnLinkedIn() {
    const url = encodeURIComponent(getVotingSectionUrl());
    const currentYear = new Date().getFullYear();
    const title = encodeURIComponent(`Liberia Business Awards ${currentYear} - Voting Open`);
    const summary = encodeURIComponent('Cast your vote for the best businesses in Liberia! Support local entrepreneurs and help shape the future of Liberian business.');
    
    window.open(
        `https://www.linkedin.com/sharing/share-offsite/?url=${url}&title=${title}&summary=${summary}`,
        'linkedin-share-dialog',
        'width=600,height=450'
    );
}

function shareVotingOnWhatsApp() {
    const url = encodeURIComponent(getVotingSectionUrl());
    const text = encodeURIComponent('🗳️ Vote for Liberia Business Awards!\n\nSupport local businesses and help choose the winners. Cast your vote here:');
    
    window.open(
        `https://api.whatsapp.com/send?text=${text}%20${url}`,
        'whatsapp-share-dialog',
        'width=600,height=450'
    );
}

function shareVotingByEmail() {
    const url = getVotingSectionUrl();
    const currentYear = new Date().getFullYear();
    const subject = encodeURIComponent(`Vote for Liberia Business Awards ${currentYear}`);
    const body = encodeURIComponent(
        'Hi,\n\nI wanted to share the Liberia Business Awards voting page with you.\n\n' +
        'Cast your vote for the best businesses in Liberia! Support local entrepreneurs and help choose the winners.\n\n' +
        'Vote here: ' + url + '\n\n' +
        'Voting period: June 1 - July 30, ' + currentYear + '\n\n' +
        'Best regards,\n' +
        document.title
    );
    
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
}

async function copyVotingLink() {
    const url = getVotingSectionUrl();
    
    try {
        await navigator.clipboard.writeText(url);
        showCopySuccessMessage('Voting section link copied!');
    } catch (err) {
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
    const existingToast = document.querySelector('.copy-success-toast');
    if (existingToast) existingToast.remove();
    
    const toast = document.createElement('div');
    toast.className = 'copy-success-toast';
    toast.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

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
