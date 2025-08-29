const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  name: { type: String, unique: true },
  seq: { type: Number, default: 4000 }
});

module.exports = mongoose.model('Counter', counterSchema);
