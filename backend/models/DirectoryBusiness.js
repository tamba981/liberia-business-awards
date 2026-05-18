// models/DirectoryBusiness.js
const mongoose = require('mongoose');

const directoryBusinessSchema = new mongoose.Schema({
    name: { type: String, required: true },
    category: { type: String, required: true },
    description: { type: String, required: true },
    location: { type: String, required: true },
    website: { type: String, default: '' },
    phone: { type: String, required: true },
    award: { type: String, default: '' },
    founder: { type: String, default: '' },
    year: { type: String, default: '' },
    impact: { type: String, default: '' },
    logo_url: { type: String, default: '' },
    display_order: { type: Number, default: 999 },
    is_active: { type: Boolean, default: true },
    verified: { type: Boolean, default: false },
    views: { type: Number, default: 0 },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('DirectoryBusiness', directoryBusinessSchema);
