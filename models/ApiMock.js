const mongoose = require('mongoose');

const ApiMockSchema = new mongoose.Schema({
  businessName: { type: String, default: '' },
  apiName: { type: String, required: true },
  method: { type: String, default: 'POST', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
  latencyMs: { type: Number, default: 0, min: 0, max: 30000 },
  predicate: {
    request: { type: mongoose.Schema.Types.Mixed, default: {} },
    headers: { type: mongoose.Schema.Types.Mixed, default: {} },
    query: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  requestPayload: { type: mongoose.Schema.Types.Mixed, default: {} },
  responseType: { type: String, default: 'static', enum: ['static', 'dynamic'] },
  responseFunction: { type: String, default: '' },
  responseFunctionName: { type: String, default: '' },
  responseHeaders: { type: mongoose.Schema.Types.Mixed, default: {} },
  responseBody: { type: mongoose.Schema.Types.Mixed, required: true }
}, { timestamps: true });

// Note: No unique index - users can create multiple stubs for the same path
// with different or even identical predicates. Mountebank will use the first
// matching stub based on the order (sorted by specificity in our code).

module.exports = mongoose.model('ApiMock', ApiMockSchema);
