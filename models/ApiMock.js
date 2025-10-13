const mongoose = require('mongoose');

const ApiMockSchema = new mongoose.Schema({
  businessName: { type: String, default: '' },
  apiName: { type: String, required: true },
  method: { type: String, default: 'POST', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
  predicate: {
    request: { type: mongoose.Schema.Types.Mixed, default: {} },
    headers: { type: mongoose.Schema.Types.Mixed, default: {} },
    query: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  requestPayload: { type: mongoose.Schema.Types.Mixed, default: {} },
  responseHeaders: { type: mongoose.Schema.Types.Mixed, default: {} },
  responseBody: { type: mongoose.Schema.Types.Mixed, required: true }
}, { timestamps: true });

ApiMockSchema.index({ apiName: 1, 'predicate.request': 1, 'predicate.headers': 1 }, { unique: true });

module.exports = mongoose.model('ApiMock', ApiMockSchema);
