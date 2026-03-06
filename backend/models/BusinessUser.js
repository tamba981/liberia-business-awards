const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const businessUserSchema = new mongoose.Schema({
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
    business_name: { 
        type: String, 
        required: true 
    },
    contact_name: { 
        type: String 
    },
    phone: { 
        type: String 
    },
    address: { 
        type: String 
    },
    registration_number: { 
        type: String 
    },
    tax_id: { 
        type: String 
    },
    business_type: { 
        type: String,
        enum: ['Startup', 'SME', 'Enterprise', 'Nonprofit', 'Other']
    },
    industry: { 
        type: String 
    },
    year_established: { 
        type: Number 
    },
    employee_count: { 
        type: String 
    },
    website: { 
        type: String 
    },
    logo_url: { 
        type: String 
    },
    documents: [{
        name: String,
        url: String,
        type: String,
        uploaded_at: { type: Date, default: Date.now }
    }],
    status: { 
        type: String, 
        enum: ['pending', 'active', 'suspended', 'rejected'],
        default: 'pending'
    },
    verification_status: {
        email_verified: { type: Boolean, default: false },
        phone_verified: { type: Boolean, default: false },
        documents_verified: { type: Boolean, default: false }
    },
    last_login: { type: Date },
    login_attempts: { type: Number, default: 0 },
    lock_until: { type: Date },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
    notes: { type: String },
    approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    approved_at: { type: Date }
}, { timestamps: true });

// Hash password before saving
businessUserSchema.pre('save', async function(next) {
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
businessUserSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Check if account is locked
businessUserSchema.methods.isLocked = function() {
    return this.lock_until && this.lock_until > Date.now();
};

// Increment login attempts
businessUserSchema.methods.incrementLoginAttempts = async function() {
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
businessUserSchema.methods.resetLoginAttempts = async function() {
    this.login_attempts = 0;
    this.lock_until = undefined;
    this.last_login = new Date();
    await this.save();
};

module.exports = mongoose.model('BusinessUser', businessUserSchema);
