const express = require('express');
const router = express.Router();
const axios = require('axios');

const ApiMock = require('../models/ApiMock');

// In combined setup, Mountebank runs in same container on localhost
const MB_URL = process.env.MB_URL || 'http://localhost:2525';
const MB_IMPOSTER_PORT = process.env.MB_IMPOSTER_PORT || 4000;
const IMPOSTER_NAME = 'mock-api-imposter';

// Calculate predicate specificity (more fields = more specific)
function calculateSpecificity(doc) {
  let count = 0;
  
  // Count request body predicate fields
  const requestPred = doc.predicate?.request || {};
  count += Object.keys(requestPred).length;
  
  // Count header predicate fields
  const headersPred = doc.predicate?.headers || {};
  count += Object.keys(headersPred).length;
  
  // Count query predicate fields
  const queryPred = doc.predicate?.query || {};
  count += Object.keys(queryPred).length;
  
  return count;
}

// Build Mountebank stubs from DB records with smart defaults
// Sorts by specificity (most specific first) to handle overlapping predicates
function buildStubs(apiMocks) {
  // Sort by specificity DESC, then by creation date DESC
  const sortedMocks = [...apiMocks].sort((a, b) => {
    const specificityA = calculateSpecificity(a);
    const specificityB = calculateSpecificity(b);
    
    // More specific first
    if (specificityB !== specificityA) {
      return specificityB - specificityA;
    }
    
    // If same specificity, newer first
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
  
  console.log('Stub order (most specific first):');
  sortedMocks.forEach((doc, i) => {
    const spec = calculateSpecificity(doc);
    console.log(`  ${i+1}. ${doc.apiName} (${doc.businessName || 'no name'}) - specificity: ${spec}`);
  });
  
  return sortedMocks.map(doc => {
    const predicates = [];

    // PATH MATCHING: Auto-detect regex vs exact match
    const pathPattern = `/${doc.apiName}`;
    const hasRegexChars = /[.*+?^${}()|[\]\\]/.test(pathPattern);
    
    if (hasRegexChars) {
      // Regex pattern detected - use matches with anchors for full path match
      const anchoredPath = `^${pathPattern}$`;
      predicates.push({ matches: { path: anchoredPath } });
      console.log(`Path regex match: ${anchoredPath}`);
    } else {
      // Plain path - use equals for exact match
      predicates.push({ equals: { path: pathPattern } });
      console.log(`Path exact match: ${pathPattern}`);
    }
    
    // Match on HTTP method (default to POST if not specified)
    const method = doc.method || 'POST';
    predicates.push({ equals: { method: method } });
    
    // SMART BODY MATCHING: Use 'contains' for partial match
    // This allows extra fields like UUIDs, timestamps to be present
    const requestPred =
      doc.predicate && Object.keys(doc.predicate.request || {}).length > 0
        ? doc.predicate.request
        : doc.requestPayload && Object.keys(doc.requestPayload || {}).length > 0
        ? doc.requestPayload
        : null;

    if (requestPred) {
      predicates.push({ contains: { body: requestPred } });
      console.log(`Body match (contains): ${JSON.stringify(requestPred)} - ignores extra fields`);
    }

    // HEADER MATCHING: Use * for flexible matching, otherwise exact match
    const headersPred = doc.predicate?.headers || {};
    if (Object.keys(headersPred).length > 0) {
      Object.keys(headersPred).forEach(headerName => {
        const lowerName = headerName.toLowerCase();
        const headerValue = headersPred[headerName];
        
        if (headerValue === '*') {
          // Flexible: just check header exists (handles dynamic tokens)
          predicates.push({ 
            exists: { 
              headers: { [lowerName]: true } 
            } 
          });
          console.log(`Header '${headerName}': flexible (* = any value)`);
        } else {
          // Exact match
          predicates.push({ 
            equals: { 
              headers: { [lowerName]: headerValue } 
            } 
          });
          console.log(`Header '${headerName}': exact match = ${headerValue}`);
        }
      });
    }

    // QUERY MATCHING: Use * for flexible matching, otherwise exact match
    const queryPred = doc.predicate?.query || {};
    if (Object.keys(queryPred).length > 0) {
      const flexibleParams = {};
      const exactParams = {};
      
      Object.keys(queryPred).forEach(param => {
        const value = queryPred[param];
        
        if (value === '*') {
          flexibleParams[param] = true;
        } else {
          exactParams[param] = value;
        }
      });
      
      // Add flexible params (exists check)
      Object.keys(flexibleParams).forEach(param => {
        predicates.push({ 
          exists: { 
            query: { [param]: true } 
          } 
        });
        console.log(`Query param '${param}': flexible (* = any value)`);
      });
      
      // Add exact params (equals check)
      if (Object.keys(exactParams).length > 0) {
        predicates.push({ equals: { query: exactParams } });
        console.log(`Query params exact match:`, exactParams);
      }
    }

    // Build response based on type (static vs dynamic)
    const headers = Object.assign({}, doc.responseHeaders || {});
    if (!headers['content-type']) {
      headers['content-type'] = 'application/json';
    }

    const stub = {
      predicates,
      responses: []
    };

    if (doc.responseType === 'dynamic' && doc.responseFunction) {
      // Use inject for dynamic responses
      stub.responses.push({
        inject: doc.responseFunction
      });
      console.log(`Dynamic response (inject) for ${doc.apiName}`);
    } else {
      // Use is for static responses (default)
      stub.responses.push({
        is: {
          statusCode: 200,
          headers: headers,
          body: doc.responseBody
        }
      });
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
    const { businessName, apiName, method, predicate, requestPayload, responseType, responseFunction, responseHeaders, responseBody } = req.body;

    if (!apiName) {
      return res.status(400).json({ error: 'apiName is required' });
    }
    
    // Validate based on response type
    if (responseType === 'dynamic') {
      if (!responseFunction || responseFunction.trim() === '') {
        return res.status(400).json({ error: 'responseFunction is required for dynamic responses' });
      }
    } else {
      // responseBody can be empty object {}, just not null/undefined
      if (responseBody === undefined || responseBody === null) {
        return res.status(400).json({ error: 'responseBody is required (can be empty object)' });
      }
    }

    const predReq = predicate?.request || {};
    const predHeaders = predicate?.headers || {};
    const predQuery = predicate?.query || {};

    // Check if updating existing mock (by _id in request body)
    const mockId = req.body._id || req.body.mockId;
    let doc;

    if (mockId) {
      // Update existing by ID
      doc = await ApiMock.findById(mockId);
      if (!doc) {
        return res.status(404).json({ error: 'Mock not found' });
      }
      doc.businessName = businessName || '';
      doc.apiName = apiName;
      doc.method = method || 'POST';
      doc.predicate = { request: predReq, headers: predHeaders, query: predQuery };
      doc.requestPayload = requestPayload || {};
      doc.responseType = responseType || 'static';
      doc.responseFunction = responseFunction || '';
      doc.responseHeaders = responseHeaders || {};
      doc.responseBody = responseBody || {};
      await doc.save();
    } else {
      // Create new mock
      doc = new ApiMock({
        businessName: businessName || '',
        apiName,
        method: method || 'POST',
        predicate: { request: predReq, headers: predHeaders, query: predQuery },
        requestPayload: requestPayload || {},
        responseType: responseType || 'static',
        responseFunction: responseFunction || '',
        responseHeaders: responseHeaders || {},
        responseBody: responseBody || {}
      });
      await doc.save();
    }

    // Reload all mocks into single imposter
    const allMocks = await ApiMock.find({});
    await upsertImposter(allMocks);

    res.json({ 
      message: mockId ? 'Mock updated and imposter reloaded' : 'Mock created and imposter updated',
      port: MB_IMPOSTER_PORT,
      apiName: apiName,
      mockId: doc._id
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Reload all imposters
// Standalone reload function (can be called directly or via HTTP)
async function reloadAllImposters() {
  const allMocks = await ApiMock.find({});
  console.log(`Reloading ${allMocks.length} mocks into single imposter`);
  
  if (allMocks.length > 0) {
    await upsertImposter(allMocks);
  } else {
    console.log('No mocks to load');
  }
  
  return allMocks.length;
}

router.post('/reloadAllImposters', async (req, res) => {
  try {
    const count = await reloadAllImposters();
    res.json({ message: 'All mocks reloaded into imposter', count });
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

// GET all mocks
router.get('/mocks', async (req, res) => {
  try {
    const mocks = await ApiMock.find({}).sort({ apiName: 1, createdAt: -1 });
    res.json(mocks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch mocks' });
  }
});

// GET single mock by ID
router.get('/mocks/:id', async (req, res) => {
  try {
    const mock = await ApiMock.findById(req.params.id);
    if (!mock) {
      return res.status(404).json({ error: 'Mock not found' });
    }
    res.json(mock);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch mock' });
  }
});

// DELETE mock by ID
router.delete('/mocks/:id', async (req, res) => {
  try {
    const mock = await ApiMock.findByIdAndDelete(req.params.id);
    if (!mock) {
      return res.status(404).json({ error: 'Mock not found' });
    }
    
    // Reload all remaining mocks into imposter
    const allMocks = await ApiMock.find({});
    await upsertImposter(allMocks);
    
    res.json({ message: 'Mock deleted and imposter updated', apiName: mock.apiName });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete mock' });
  }
});

// Batch import endpoint
router.post('/import/batch', async (req, res) => {
  try {
    const { mocks } = req.body;
    
    if (!Array.isArray(mocks) || mocks.length === 0) {
      return res.status(400).json({ error: 'Mocks array is required' });
    }
    
    const results = [];
    
    for (const mockData of mocks) {
      try {
        // Validate required fields
        if (!mockData.apiName) {
          results.push({ 
            success: false, 
            apiName: mockData.apiName || 'unknown',
            error: 'apiName is required' 
          });
          continue;
        }
        
        // responseBody can be empty object {}, just not null/undefined
        if (mockData.responseBody === undefined || mockData.responseBody === null) {
          results.push({ 
            success: false, 
            apiName: mockData.apiName,
            error: 'responseBody is required (can be empty object)' 
          });
          continue;
        }
        
        // Create new mock
        const doc = new ApiMock({
          businessName: mockData.businessName || '',
          apiName: mockData.apiName,
          method: mockData.method || 'POST',
          predicate: {
            request: mockData.predicate?.request || {},
            headers: mockData.predicate?.headers || {},
            query: mockData.predicate?.query || {}
          },
          requestPayload: mockData.requestPayload || {},
          responseHeaders: mockData.responseHeaders || {},
          responseBody: mockData.responseBody
        });
        
        await doc.save();
        results.push({ success: true, apiName: mockData.apiName, mockId: doc._id });
      } catch (err) {
        results.push({ 
          success: false, 
          apiName: mockData.apiName || 'unknown',
          error: err.message 
        });
      }
    }
    
    // Reload all mocks into imposter
    try {
      const allMocks = await ApiMock.find({});
      await upsertImposter(allMocks);
    } catch (err) {
      console.error('Error reloading imposter after batch import:', err);
    }
    
    res.json({ results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
module.exports.reloadAllImposters = reloadAllImposters;
