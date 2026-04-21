const mongoose = require('mongoose');

const DocumentSchema = new mongoose.Schema({
    businessId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BusinessUser',
        required: true
    },
    name: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['registration', 'tax', 'license', 'financial', 'certificate', 'other'],
        default: 'other'
    },
    fileType: String,
    fileSize: Number,
    filePath: String,
    fileUrl: String,
    uploaded_at: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Document', DocumentSchema);
