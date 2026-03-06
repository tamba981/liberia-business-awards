const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const adminSchema = new mongoose.Schema({
    email: { 
        type: String, 
        required: true, 
        unique: true, 
        lowercase: true,
        trim: true
    },
    password: { 
        type: String, 
        required: true 
    },
    name: { 
        type: String, 
        required: true 
    },
    role: { 
        type: String, 
        enum: ['super_admin', 'admin', 'moderator'], 
        default: 'admin' 
    },
    permissions: {
        manage_businesses: { type: Boolean, default: true },
        manage_advertisements: { type: Boolean, default: true },
        manage_news: { type: Boolean, default: true },
        manage_users: { type: Boolean, default: false },
        manage_settings: { type: Boolean, default: false }
    },
    last_login: { type: Date },
    login_attempts: { type: Number, default: 0 },
    lock_until: { type: Date },
    is_active: { type: Boolean, default: true },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, { timestamps: true });

// Hash password before saving
adminSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Compare password method
adminSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Check if account is locked
adminSchema.methods.isLocked = function() {
    return this.lock_until && this.lock_until > Date.now();
};

// Increment login attempts
adminSchema.methods.incrementLoginAttempts = async function() {
    const MAX_ATTEMPTS = 5;
    const LOCK_TIME = 15 * 60 * 1000; // 15 minutes
    
    this.login_attempts += 1;
    
    if (this.login_attempts >= MAX_ATTEMPTS) {
        this.lock_until = Date.now() + LOCK_TIME;
        this.login_attempts = 0;
    }
    
    await this.save();
};

// Reset login attempts
adminSchema.methods.resetLoginAttempts = async function() {
    this.login_attempts = 0;
    this.lock_until = undefined;
    this.last_login = new Date();
    await this.save();
};

module.exports = mongoose.model('Admin', adminSchema);
