const mongoose = require('mongoose');

const judgeSchema = new mongoose.Schema({
    name: { type: String, required: true },
    profession: { type: String, required: true },
    organization: { type: String },
    photo: { type: String },
    bio: { type: String },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    created_at: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Judge', judgeSchema);
