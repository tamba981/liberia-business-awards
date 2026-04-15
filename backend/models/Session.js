const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
    token: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    role: { type: String, required: true },
    fingerprint: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    lastActivity: { type: Date, default: Date.now }
});

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Session', sessionSchema);
