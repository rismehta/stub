const express = require('express');
const router = express.Router();
const axios = require('axios');

const ApiMock = require('../models/ApiMock');

// In combined setup, Mountebank runs in same container on localhost
const MB_URL = process.env.MB_URL || 'http://localhost:2525';
const MB_IMPOSTER_PORT = process.env.MB_IMPOSTER_PORT || 4000;
const IMPOSTER_NAME = 'mock-api-imposter';

// Build Mountebank stubs from DB records
function buildStubs(apiMocks) {
  return apiMocks.map(doc => {
    const predicates = [];

    // Match based on path containing the API name (primary predicate)
    predicates.push({ contains: { path: `/${doc.apiName}` } });
    predicates.push({ equals: { method: 'POST' } });
    
    // Optional: match on request body if provided
    const requestPred =
      doc.predicate && Object.keys(doc.predicate.request || {}).length > 0
        ? doc.predicate.request
        
        : doc.requestPayload && Object.keys(doc.requestPayload || {}).length > 0
        ? doc.requestPayload
        : null;

    if (requestPred) {
      predicates.push({ contains: { body: requestPred } });
    }

    // Use simple 'is' response instead of injection for reliability
    const headers = Object.assign({}, doc.responseHeaders || {});
    if (!headers['content-type']) {
      headers['content-type'] = 'application/json';
    }

    const stub = {
      predicates,
      responses: [
        {
          is: {
            statusCode: 200,
            headers: headers,
            body: doc.responseBody
          }
        }
      ]
    };

    // Debug log for first stub
    if (doc.apiName === 'rish') {
      console.log('Creating stub for rish:', JSON.stringify(stub, null, 2));
    }

    return stub;
  });
}

// Create or update the single Mountebank imposter with all stubs
async function upsertImposter(apiMocks) {
  const imposter = {
    port: parseInt(MB_IMPOSTER_PORT),
    protocol: 'http',
    name: IMPOSTER_NAME,
    stubs: buildStubs(apiMocks)
  };

  try {
    // Delete existing imposter if exists (ignore error if not found)
    await axios.delete(`${MB_URL}/imposters/${MB_IMPOSTER_PORT}`).catch(() => {});

    // Create new imposter with all stubs
    await axios.post(`${MB_URL}/imposters`, imposter);
    console.log(`Imposter updated on port ${MB_IMPOSTER_PORT} with ${apiMocks.length} stubs`);
    console.log('Stubs created for APIs:', apiMocks.map(m => m.apiName).join(', '));
  } catch (err) {
    console.error('Error upserting imposter:', err.message);
    if (err.response) {
      console.error('Mountebank error:', JSON.stringify(err.response.data, null, 2));
    }
    throw err;
  }
}

// Save or update mock route
router.post('/saveOrUpdate', async (req, res) => {
  try {
    const { apiName, predicate, requestPayload, responseHeaders, responseBody } = req.body;

    if (!apiName || !responseBody) {
      return res.status(400).json({ error: 'apiName and responseBody are required' });
    }

    const predReq = predicate?.request || {};

    let doc = await ApiMock.findOne({ apiName, 'predicate.request': predReq});

    if (doc) {
      // Update existing
      doc.requestPayload = requestPayload || {};
      doc.responseHeaders = responseHeaders || {};
      doc.responseBody = responseBody;
      await doc.save();
    } else {
      // Create new
      doc = new ApiMock({
        apiName,
        predicate: { request: predReq},
        requestPayload: requestPayload || {},
        responseHeaders: responseHeaders || {},
        responseBody
      });
      await doc.save();
    }

    // Reload all mocks into single imposter
    const allMocks = await ApiMock.find({});
    await upsertImposter(allMocks);

    res.json({ 
      message: 'Mock saved and imposter updated', 
      port: MB_IMPOSTER_PORT,
      apiName: apiName 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Reload all imposters
router.post('/reloadAllImposters', async (req, res) => {
  try {
    const allMocks = await ApiMock.find({});
    console.log(`Reloading ${allMocks.length} mocks into single imposter`);
    
    if (allMocks.length > 0) {
      await upsertImposter(allMocks);
    } else {
      console.log('No mocks to load');
    }
    
    res.json({ message: 'All mocks reloaded into imposter', count: allMocks.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reload imposters' });
  }
});

// Debug endpoint - check what's in Mountebank
router.get('/debug/imposters', async (req, res) => {
  try {
    const response = await axios.get(`${MB_URL}/imposters/${MB_IMPOSTER_PORT}`);
    res.json({
      port: MB_IMPOSTER_PORT,
      stubCount: response.data.stubs?.length || 0,
      stubs: response.data.stubs?.map(stub => ({
        predicates: stub.predicates,
        responses: stub.responses
      })) || []
    });
  } catch (err) {
    res.status(500).json({ 
      error: 'Failed to get imposter info',
      message: err.message 
    });
  }
});

// Debug endpoint - test direct Mountebank call
router.post('/debug/testMock/:apiName', async (req, res) => {
  try {
    const { apiName } = req.params;
    const response = await axios.post(
      `http://localhost:${MB_IMPOSTER_PORT}/${apiName}`,
      req.body,
      { 
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      }
    );
    res.json({
      message: 'Direct Mountebank call succeeded',
      status: response.status,
      data: response.data
    });
  } catch (err) {
    res.status(500).json({
      error: 'Direct Mountebank call failed',
      message: err.message,
      timeout: err.code === 'ECONNABORTED'
    });
  }
});

module.exports = router;
