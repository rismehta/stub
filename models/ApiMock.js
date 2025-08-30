const mongoose = require('mongoose');

const ApiMockSchema = new mongoose.Schema({
  apiName: { type: String, required: true },
  port: { type: Number, required: true },
  predicate: {
    request: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  requestPayload: { type: mongoose.Schema.Types.Mixed, default: {} },
  responseHeaders: { type: mongoose.Schema.Types.Mixed, default: {} },
  responseBody: { type: mongoose.Schema.Types.Mixed, required: true }
}, { timestamps: true });

ApiMockSchema.index({ apiName: 1, 'predicate.request': 1, 'predicate.headers': 1 }, { unique: true });

module.exports = mongoose.model('ApiMock', ApiMockSchema);
