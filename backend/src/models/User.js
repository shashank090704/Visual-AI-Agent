const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  agentId: { type: String, required: true, unique: true, index: true },
  name: { type: String, default: 'Default Agent User' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);
