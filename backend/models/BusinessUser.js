const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const businessUserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    business_name: { type: String, required: true },
    contact_name: { type: String },
    phone: { type: String },
    status: { type: String, enum: ['pending', 'active', 'suspended'], default: 'pending' },
    last_login: { type: Date },
    login_attempts: { type: Number, default: 0 },
    lock_until: { type: Date }
}, { timestamps: true });

businessUserSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

businessUserSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('BusinessUser', businessUserSchema);
