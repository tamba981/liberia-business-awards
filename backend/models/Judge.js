const mongoose = require('mongoose');

const judgeSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    profession: { type: String, required: true },
    organization: { type: String, default: '' },
    expertise: { type: String, default: '' },
    phone: { type: String, default: '' },
    photo: { type: String, default: '' },
    bio: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'active', 'inactive'], default: 'pending' },
    votes_cast: { type: Number, default: 0 },
    last_login: { type: Date },
    login_attempts: { type: Number, default: 0 },
    lock_until: { type: Date },
    reset_password_token: { type: String },
    reset_password_expires: { type: Date },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' }
}, { timestamps: true });

// Hash password before saving
judgeSchema.pre('save', async function(next) {
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
judgeSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Check if account is locked
judgeSchema.methods.isLocked = function() {
    return !!(this.lock_until && this.lock_until > Date.now());
};

// Increment login attempts
judgeSchema.methods.incrementLoginAttempts = function() {
    this.login_attempts += 1;
    if (this.login_attempts >= 5) {
        this.lock_until = Date.now() + 30 * 60 * 1000;
    }
    return this.save();
};

// Reset login attempts
judgeSchema.methods.resetLoginAttempts = function() {
    this.login_attempts = 0;
    this.lock_until = undefined;
    return this.save();
};

module.exports = mongoose.model('Judge', judgeSchema);
