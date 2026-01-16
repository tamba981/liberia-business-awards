// server/models/Nomination.js
const mongoose = require('mongoose');

const NominationSchema = new mongoose.Schema({
  businessName: {
    type: String,
    required: true
  },
  contactPerson: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  phone: {
    type: String,
    required: true
  },
  category: {
    type: String,
    required: true
  },
  county: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  status: {
    type: String,
    default: 'Pending'
  },
  dateSubmitted: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Nomination', NominationSchema);