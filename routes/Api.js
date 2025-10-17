const express = require('express');
const router = express.Router();
const axios = require('axios');

const ApiMock = require('../models/ApiMock');

// In combined setup, Mountebank runs in same container on localhost
const MB_URL = process.env.MB_URL || 'http://localhost:2525';
const MB_IMPOSTER_PORT = process.env.MB_IMPOSTER_PORT || 4000;
const IMPOSTER_NAME = 'mock-api-imposter';

// External mock repository URL (GitHub raw or AEM Edge Delivery)
const EXTERNAL_MOCKS_URL = process.env.EXTERNAL_MOCKS_URL || 'https://main--api-virtualization--hdfc-forms.aem.page/mocks.json';
const EXTERNAL_FUNCTIONS_URL = process.env.EXTERNAL_FUNCTIONS_URL || ' https://main--api-virtualization--hdfc-forms.aem.page/functions.js';

// Store loaded functions from external source
let loadedFunctions = {};

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

    // Get latency (default to 200ms if not specified or 0 for no delay)
    const latencyMs = doc.latencyMs !== undefined ? doc.latencyMs : 0;

    const stub = {
      predicates,
      responses: []
    };

    // Auto-detect: if responseFunction is provided, it's dynamic (regardless of responseType)
    if (doc.responseFunction && doc.responseFunction.trim() !== '') {
      // Resolve function: check if it's an external function name or inline code
      let functionCode = null;
      
      // Check if responseFunction is a reference to an external function
      if (loadedFunctions[doc.responseFunction]) {
        // Use external function by name
        functionCode = loadedFunctions[doc.responseFunction];
        console.log(`   Using external function: ${doc.responseFunction}`);
      } else {
        // Use inline function code
        functionCode = doc.responseFunction;
        console.log(`   Using inline function`);
      }
      
      // Use inject for dynamic responses
      const response = {
        inject: functionCode
      };
      
      // Add latency behavior for dynamic responses
      if (latencyMs > 0) {
        response._behaviors = { wait: latencyMs };
        console.log(`Dynamic response (inject) for ${doc.apiName} with ${latencyMs}ms latency`);
      } else {
        console.log(`Dynamic response (inject) for ${doc.apiName}`);
      }
      
      stub.responses.push(response);
    } else {
      // Use is for static responses (default)
      const response = {
        is: {
          statusCode: 200,
          headers: headers,
          body: doc.responseBody
        }
      };
      
      // Add latency behavior for static responses
      if (latencyMs > 0) {
        response._behaviors = { wait: latencyMs };
        console.log(`Static response for ${doc.apiName} with ${latencyMs}ms latency`);
      } else {
        console.log(`Static response for ${doc.apiName}`);
      }
      
      stub.responses.push(response);
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
    
    // Auto-detect response type: if responseFunction is provided, it's dynamic
    // Otherwise it's static and requires responseBody
    const hasDynamicFunction = responseFunction && responseFunction.trim() !== '';
    
    if (!hasDynamicFunction) {
      // Static response - responseBody is required
      if (responseBody === undefined || responseBody === null) {
        return res.status(400).json({ error: 'responseBody is required for static responses (or provide responseFunction for dynamic)' });
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

// Fetch mocks from external repository (GitHub/AEM)
async function fetchMocksFromExternal() {
  try {
    console.log(`Fetching mocks from: ${EXTERNAL_MOCKS_URL}`);
    const response = await axios.get(EXTERNAL_MOCKS_URL, {
      timeout: 10000,
      headers: {
        'Accept': 'application/json'
      }
    });
    
    const data = response.data;
    
    // Validate structure
    if (!data.mocks || !Array.isArray(data.mocks)) {
      throw new Error('Invalid mocks.json structure: missing mocks array');
    }
    
    console.log(`Fetched ${data.totalMocks} mock(s) from external source`);
    console.log(`Generated at: ${data.generatedAt}`);
    
    return data.mocks;
  } catch (err) {
    console.error('Error fetching external mocks:', err.message);
    throw err;
  }
}

// Fetch and parse functions.js from external repository
async function fetchFunctionsFromExternal() {
  try {
    console.log(`Fetching functions from: ${EXTERNAL_FUNCTIONS_URL}`);
    const response = await axios.get(EXTERNAL_FUNCTIONS_URL, {
      timeout: 10000,
      headers: {
        'Accept': 'text/plain'
      }
    });
    
    const functionCode = response.data;
    
    // Parse and extract exported functions
    const functions = parseFunctionsFromCode(functionCode);
    
    console.log(` Loaded ${Object.keys(functions).length} function(s) from external source`);
    console.log(`   Functions available: ${Object.keys(functions).join(', ')}`);
    
    return functions;
  } catch (err) {
    // If functions.js doesn't exist, just log warning and continue
    if (err.response && err.response.status === 404) {
      console.log('No functions.js found (optional file)');
      return {};
    }
    console.error('Error fetching external functions:', err.message);
    throw err;
  }
}

// Parse functions from JS code and extract exports
function parseFunctionsFromCode(code) {
  const functions = {};
  
  try {
    // Create a sandbox to evaluate the code safely
    // The code should use module.exports or exports to export functions
    const sandbox = {
      module: { exports: {} },
      exports: {},
      console: console
    };
    
    // Wrap code in a function to isolate scope
    const wrappedCode = `
      (function(module, exports) {
        ${code}
        return module.exports;
      })
    `;
    
    // Evaluate the code
    const evalFunc = eval(wrappedCode);
    const exportedFunctions = evalFunc(sandbox.module, sandbox.exports);
    
    // Extract all exported functions
    for (const [name, func] of Object.entries(exportedFunctions)) {
      if (typeof func === 'function') {
        // Convert function to string for Mountebank injection
        functions[name] = func.toString();
        console.log(`   Loaded function: ${name}`);
      }
    }
    
    return functions;
  } catch (err) {
    console.error('Error parsing functions:', err.message);
    throw new Error(`Failed to parse functions.js: ${err.message}`);
  }
}

// Load mocks from external source and reload Mountebank
async function reloadFromExternal() {
  // Fetch both mocks and functions in parallel
  const [externalMocks, externalFunctions] = await Promise.all([
    fetchMocksFromExternal(),
    fetchFunctionsFromExternal()
  ]);
  
  // Store functions globally for use in buildStubs
  loadedFunctions = externalFunctions;
  
  // Option 1: Just load into Mountebank (ephemeral)
  console.log(`Loading ${externalMocks.length} external mocks into Mountebank`);
  await upsertImposter(externalMocks);
  
  
  return {
    mocksLoaded: externalMocks.length,
    functionsLoaded: Object.keys(externalFunctions).length,
    mongoImport: null
  };
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

// Reload from external repository (GitHub/AEM)
// North Star: Pure ephemeral mode - no MongoDB persistence
router.post('/reloadFromExternal', async (req, res) => {
  try {
    const results = await reloadFromExternal();
    
    res.json({
      message: 'Mocks loaded from external source (ephemeral, not persisted)',
      url: EXTERNAL_MOCKS_URL,
      ...results
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ 
      error: 'Failed to reload from external source',
      details: err.message 
    });
  }
});

// Get external mocks info (without loading)
router.get('/externalMocks/info', async (req, res) => {
  try {
    const mocks = await fetchMocksFromExternal();
    res.json({
      url: EXTERNAL_MOCKS_URL,
      totalMocks: mocks.length,
      mocks: mocks.map(m => ({
        businessName: m.businessName,
        apiName: m.apiName,
        method: m.method || 'POST'
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ 
      error: 'Failed to fetch external mocks info',
      details: err.message 
    });
  }
});

// Fetch and return all external mocks (full data)
router.get('/externalMocks', async (req, res) => {
  try {
    const mocks = await fetchMocksFromExternal();
    res.json(mocks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ 
      error: 'Failed to fetch external mocks',
      details: err.message 
    });
  }
});

// Get currently loaded functions from external source
router.get('/externalFunctions', async (req, res) => {
  try {
    res.json({
      url: EXTERNAL_FUNCTIONS_URL,
      totalFunctions: Object.keys(loadedFunctions).length,
      functions: Object.keys(loadedFunctions).map(name => ({
        name,
        codePreview: loadedFunctions[name].substring(0, 100) + '...'
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ 
      error: 'Failed to get loaded functions',
      details: err.message 
    });
  }
});

// Webhook endpoint for GitHub to trigger reload automatically
// GitHub calls this when mocks.json is updated
router.post('/webhook/github-mocks-updated', async (req, res) => {
  try {
    console.log('Webhook received: GitHub mocks updated');
    
    // Optional: Verify webhook signature for security
    // const signature = req.headers['x-hub-signature-256'];
    // if (!verifyGitHubSignature(signature, req.body)) {
    //   return res.status(401).json({ error: 'Invalid signature' });
    // }
    
    // Check if mocks.json or functions.js was actually changed
    const commits = req.body.commits || [];
    const mocksJsonChanged = commits.some(commit => 
      (commit.added || []).includes('mocks.json') ||
      (commit.modified || []).includes('mocks.json')
    );
    const functionsJsChanged = commits.some(commit => 
      (commit.added || []).includes('functions.js') ||
      (commit.modified || []).includes('functions.js')
    );
    
    if (!mocksJsonChanged && !functionsJsChanged) {
      console.log('   No changes to mocks.json or functions.js, skipping reload');
      return res.json({ 
        message: 'Webhook received but mocks.json/functions.js not changed',
        skipped: true 
      });
    }
    
    if (mocksJsonChanged) {
      console.log('   mocks.json changed');
    }
    if (functionsJsChanged) {
      console.log('   functions.js changed');
    }
    
    console.log('   Reloading mocks from external source...');
    const results = await reloadFromExternal(false); // Never persist to MongoDB
    
    console.log(`Webhook: Successfully reloaded ${results.mocksLoaded} mocks`);
    
    res.json({
      message: 'Mocks reloaded successfully',
      trigger: 'github-webhook',
      ...results
    });
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(500).json({ 
      error: 'Webhook processing failed',
      details: err.message 
    });
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
    const loadFromExternal = true;
    
    if (loadFromExternal) {
      // When using external mode, fetch from GitHub (what's actually serving)
      console.log('Fetching mocks from external source for UI display');
      const externalMocks = await fetchMocksFromExternal();
      
      // Return external mocks with indicator that they're from external source
      const mocksWithSource = externalMocks.map(mock => ({
        ...mock,
        _id: mock._metadata?.sourceFile || mock.apiName, // Use sourceFile as ID since they don't have MongoDB _id
        _source: 'external',
        _isReadOnly: true // Indicate these can't be edited via UI
      }));
      
      return res.json(mocksWithSource);
    }
    
    // Default: Load from MongoDB
    const mocks = await ApiMock.find({}).sort({ apiName: 1, createdAt: -1 });
    const mocksWithSource = mocks.map(mock => ({
      ...mock.toObject(),
      _source: 'mongodb',
      _isReadOnly: false
    }));
    
    res.json(mocksWithSource);
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
module.exports.reloadFromExternal = reloadFromExternal;
