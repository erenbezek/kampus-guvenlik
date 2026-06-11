const mongoose = require('mongoose');

const zoneSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: ['critical', 'restricted', 'lab', 'safe', 'emergency'], default: 'restricted' },
  color: { type: String, default: '#ef4444' },
  description: { type: String, default: '' },
  polygon: [{ lat: Number, lng: Number }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Zone', zoneSchema);
