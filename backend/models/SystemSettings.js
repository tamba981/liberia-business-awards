const mongoose = require('mongoose');

const systemSettingsSchema = new mongoose.Schema({
    platformName: { type: String, default: 'Liberia Business Awards' },
    adminEmail: { type: String, default: 'admin@liberiabusinessawardslr.com' },
    logo: { type: String },
    systemStatus: { type: String, enum: ['online', 'maintenance'], default: 'online' },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    updated_at: { type: Date, default: Date.now }
}, { timestamps: true });

// Ensure only one settings document exists
systemSettingsSchema.statics.getSettings = async function() {
    let settings = await this.findOne();
    if (!settings) {
        settings = await this.create({});
    }
    return settings;
};

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);
