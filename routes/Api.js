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

// In-memory storage for temporary test mocks (uploaded via UI for testing before GitHub commit)
// These are automatically cleaned up when matching mocks are loaded from GitHub
let temporaryMocks = [];

/**
 * Check if two mocks match (same API endpoint and method)
 * Used to detect when a temporary mock should be removed because it's now in GitHub
 */
function mocksMatch(mock1, mock2) {
  const normalizeApiName = (name) => (name || '').replace(/^\/+/, '').toLowerCase();
  const normalizeMethod = (method) => (method || 'POST').toUpperCase();
  
  return normalizeApiName(mock1.apiName) === normalizeApiName(mock2.apiName) &&
         normalizeMethod(mock1.method) === normalizeMethod(mock2.method);
}

/**
 * Clean up temporary mocks that match GitHub mocks
 * Called automatically after loading from GitHub
 */
function cleanupMatchingTempMocks(githubMocks) {
  const beforeCount = temporaryMocks.length;
  
  temporaryMocks = temporaryMocks.filter(tempMock => {
    const hasMatch = githubMocks.some(githubMock => mocksMatch(tempMock, githubMock));
    if (hasMatch) {
      console.log(`Removing temp mock "${tempMock.businessName}" (${tempMock.apiName}) - now in GitHub`);
    }
    return !hasMatch;
  });
  
  const removedCount = beforeCount - temporaryMocks.length;
  if (removedCount > 0) {
    console.log(`Cleaned up ${removedCount} temporary mock(s) that are now in GitHub`);
  }
  
  return removedCount;
}

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

/**
 * Extract all fields with their JSONPath from predicate object
 * Used for creating individual JSONPath predicates for boolean/number fields
 * 
 * @param {Object} predicate - The predicate object to scan
 * @param {String} pathPrefix - Current JSONPath prefix (for recursion)
 * @returns {Array} Array of {jsonPath, value} objects
 */
function extractFieldsWithPath(predicate, pathPrefix = '$') {
  const fields = [];
  
  if (!predicate || typeof predicate !== 'object' || Array.isArray(predicate)) {
    return fields;
  }
  
  for (const [key, value] of Object.entries(predicate)) {
    const currentPath = `${pathPrefix}.${key}`;
    
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      // Recursively process nested objects
      fields.push(...extractFieldsWithPath(value, currentPath));
    } else {
      // Leaf value (string, number, boolean, null)
      fields.push({ jsonPath: currentPath, value });
    }
  }
  
  return fields;
}

/**
 * Extract regex patterns from predicate object
 * 
 * Syntax: Use "regex:pattern" in predicate values
 * Example: {"CRMnextObject": {"MobilePhone": "regex:^\\d{10}$"}}
 * 
 * @param {Object} predicate - The predicate object to scan
 * @param {String} pathPrefix - Current JSONPath prefix (for recursion)
 * @returns {Object} { regexFields: [{jsonPath, pattern}], nonRegexPred: {...} }
 */
function extractRegexPatterns(predicate, pathPrefix = '$') {
  const regexFields = [];
  const nonRegexPred = {};
  
  if (!predicate || typeof predicate !== 'object' || Array.isArray(predicate)) {
    return { regexFields, nonRegexPred: predicate };
  }
  
  // OPTIMIZATION: Quick pre-check to avoid walking the tree if no regex patterns exist
  // This is much faster than always traversing the entire object
  if (pathPrefix === '$') {  // Only check at root level
    try {
      const predicateStr = JSON.stringify(predicate);
      if (!predicateStr.includes('regex:')) {
        // No regex patterns found - return entire predicate as non-regex
        return { regexFields: [], nonRegexPred: predicate };
      }
    } catch (err) {
      // If stringify fails, fall through to regular processing
      console.warn('Failed to stringify predicate for regex check:', err.message);
    }
  }
  
  for (const [key, value] of Object.entries(predicate)) {
    const currentPath = `${pathPrefix}.${key}`;
    
    if (typeof value === 'string' && value.startsWith('regex:')) {
      // Extract regex pattern (remove "regex:" prefix)
      const pattern = value.substring(6); // "regex:".length = 6
      regexFields.push({ jsonPath: currentPath, pattern });
      // Don't add to nonRegexPred
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      // Recursively process nested objects
      const { regexFields: nestedRegex, nonRegexPred: nestedNonRegex } = 
        extractRegexPatterns(value, currentPath);
      
      regexFields.push(...nestedRegex);
      
      // Only add to nonRegexPred if it has content
      if (nestedNonRegex && Object.keys(nestedNonRegex).length > 0) {
        nonRegexPred[key] = nestedNonRegex;
      }
    } else {
      // Regular value (string, number, boolean, array)
      nonRegexPred[key] = value;
    }
  }
  
  return { regexFields, nonRegexPred };
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
    
    // SMART BODY MATCHING: Use 'deepEquals' for robust JSON matching
    // - Matches exact values on specified fields, ignores extra fields
    const requestPred =
      doc.predicate && Object.keys(doc.predicate.request || {}).length > 0
        ? doc.predicate.request
        : doc.requestPayload && Object.keys(doc.requestPayload || {}).length > 0
        ? doc.requestPayload
        : null;

    if (requestPred) {
      // REGEX SUPPORT: Extract regex patterns and non-regex parts
      const { regexFields, nonRegexPred } = extractRegexPatterns(requestPred);
      
      // Add regex-based predicates (using JSONPath + matches operator)
      regexFields.forEach(({ jsonPath, pattern }) => {
        predicates.push({
          matches: {
            body: {
              [jsonPath]: pattern
            }
          }
        });
        console.log(`Body match (regex): ${jsonPath} matches ${pattern}`);
      });
      
      // Add non-regex predicates (using hybrid approach for booleans/numbers)
      if (nonRegexPred && Object.keys(nonRegexPred).length > 0) {
        try {
          // Extract only boolean/number fields with their paths
          const booleanNumberFields = [];
          const extractBooleanNumberFields = (obj, pathPrefix = '$') => {
            if (typeof obj !== 'object' || obj === null) {
              return;
            }
            
            for (const [key, value] of Object.entries(obj)) {
              const currentPath = `${pathPrefix}.${key}`;
              
              if (typeof value === 'boolean' || typeof value === 'number') {
                // Found a boolean/number field
                booleanNumberFields.push({ jsonPath: currentPath, value });
              } else if (typeof value === 'object' && !Array.isArray(value)) {
                // Recurse into nested objects
                extractBooleanNumberFields(value, currentPath);
              } else if (Array.isArray(value)) {
                // Check array elements for booleans/numbers
                value.forEach((item, index) => {
                  if (typeof item === 'boolean' || typeof item === 'number') {
                    booleanNumberFields.push({ jsonPath: `${currentPath}[${index}]`, value: item });
                  } else if (typeof item === 'object' && item !== null) {
                    extractBooleanNumberFields(item, `${currentPath}[${index}]`);
                  }
                });
              }
            }
          };
          
          extractBooleanNumberFields(nonRegexPred);
          
          if (booleanNumberFields.length > 0) {
            // HYBRID APPROACH: Use contains for string-only structure + JSONPath equals for booleans/numbers
            
            // 1. Create a string-only version (strip out booleans/numbers, empty strings, AND problematic field names)
            const removeBooleanNumbersEmptyStringsAndProblematicFields = (obj) => {
              if (typeof obj !== 'object' || obj === null) {
                return obj;
              }
              
              if (Array.isArray(obj)) {
                // Keep arrays as-is, but recursively process elements
                return obj.map(item => removeBooleanNumbersEmptyStringsAndProblematicFields(item));
              }
              
              const result = {};
              for (const [key, value] of Object.entries(obj)) {
                // Skip fields with problematic names that might confuse Mountebank contains
                // Examples: "-xmlns:xsi", "-xsi:type" (starting with dash or containing colon)
                if (key.startsWith('-') || key.includes(':')) {
                  console.log(`  Skipping problematic field name: "${key}"`);
                  continue;
                }
                
                // Skip boolean, number values, and empty strings
                if (typeof value === 'boolean' || typeof value === 'number') {
                  continue;
                }
                
                // Skip empty strings (they cause issues with Mountebank contains)
                if (typeof value === 'string' && value === '') {
                  continue;
                }
                
                if (typeof value === 'object' && value !== null) {
                  const processed = removeBooleanNumbersEmptyStringsAndProblematicFields(value);
                  // Only add if not an empty object (unless it's an array)
                  if (Array.isArray(processed) || Object.keys(processed).length > 0) {
                    result[key] = processed;
                  }
                } else {
                  // It's a non-empty string with a safe field name - keep it
                  result[key] = value;
                }
              }
              return result;
            };
            
            const finalStringPredicate = removeBooleanNumbersEmptyStringsAndProblematicFields(nonRegexPred);
            
            console.log(`DEBUG: Original predicate keys: ${Object.keys(nonRegexPred).join(', ')}`);
            console.log(`DEBUG: String-only predicate keys: ${Object.keys(finalStringPredicate).join(', ')}`);
            console.log(`DEBUG: Boolean/number fields found: ${booleanNumberFields.length}`);
            
            // 2. BACK TO BASICS: Use contains with non-empty strings + equals for booleans
            //    The finalStringPredicate already has empty strings removed, so use it!
            
            console.log(`DEBUG: ABANDONING contains operator - using ONLY JSONPath equals`);
            console.log(`DEBUG: Extracting all non-empty fields for individual matching...`);
            
            // Get ALL non-empty fields (strings, booleans, numbers) with JSONPath
            const allFields = extractFieldsWithPath(nonRegexPred, '$');
            const allNonEmptyFields = allFields.filter(({ jsonPath, value }) => {
              // Skip empty strings
              if (value === '' || value === undefined) return false;
              
              // Skip problematic field names
              const fieldName = jsonPath.split('.').pop();
              if (fieldName.startsWith('-') || fieldName.includes(':')) {
                console.log(`  Skipping problematic field in equals: "${fieldName}"`);
                return false;
              }
              
              return true;
            });
            
            console.log(`DEBUG: Found ${allNonEmptyFields.length} non-empty fields (including booleans/numbers)`);
            console.log(`DEBUG: Will create ${allNonEmptyFields.length} JSONPath equals predicates`);
            
            // Log ALL fields for verification
            console.log(`\n========== ALL PREDICATE FIELDS ==========`);
            allNonEmptyFields.forEach(({ jsonPath, value }, idx) => {
              const valueStr = typeof value === 'string' 
                ? `"${value.substring(0, 50)}${value.length > 50 ? '...' : ''}"` 
                : JSON.stringify(value);
              console.log(`  ${idx + 1}. ${jsonPath} = ${valueStr}`);
            });
            console.log(`==========================================\n`);
            
            // Add individual equals for EACH field
            allNonEmptyFields.forEach(({ jsonPath, value }) => {
              predicates.push({
                equals: {
                  body: {
                    [jsonPath]: value
                  }
                }
              });
            });
            
            console.log(`DEBUG: Total predicates created: ${predicates.length}`);
            console.log(`DEBUG: Breakdown: 1 path + 1 method + ${allNonEmptyFields.length} body fields = ${predicates.length}`);
          } else {
            // Only string values → Use contains (better for deep nesting)
            predicates.push({ contains: { body: nonRegexPred } });
            console.log(`Body match (contains): string values only`);
          }
        } catch (err) {
          // Fallback if extraction fails
          console.warn(`Failed to process predicate, using contains as fallback: ${err.message}`);
          predicates.push({ contains: { body: nonRegexPred } });
        }
      }
      
      // If only regex fields and no non-regex fields, ensure we have at least one predicate
      if (regexFields.length === 0 && (!nonRegexPred || Object.keys(nonRegexPred).length === 0)) {
        console.warn(`Empty predicate after regex extraction, skipping body match`);
      }
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

    // Determine response strategy
    let response;
    
    // Strategy 1: Custom responseFunction (dynamic behavior)
    if (doc.responseFunction && doc.responseFunction.trim() !== '' && loadedFunctions[doc.responseFunction]) {
      // Custom function exists - use it directly
      const functionCode = loadedFunctions[doc.responseFunction];
      console.log(`   Using custom function: ${doc.responseFunction}`);
      
      response = {
        inject: functionCode
      };
    }
    // Strategy 2: Load from EDS (DEFAULT)
    else if (doc._metadata?.sourceFile) {
      // Generate inline inject function to fetch from EDS
      const sourceFile = doc._metadata.sourceFile;
      const edsUrl = `${EXTERNAL_MOCKS_URL.replace('/mocks.json', '')}/mocks/${sourceFile}`;
      
      console.log(`   Loading from: ${sourceFile}`);
      
      // Serialize callback forwarder config for inject function
      const callbackForwarderConfig = JSON.stringify(doc.callbackForwarder || null);
      // Use public-facing proxy URL (not internal stub-generator URL)
      // Local: http://localhost:8080, Production: https://mockapi-proxy.onrender.com
      const baseUrl = process.env.PROXY_URL || 'http://localhost:8080';
      const mockId = doc._metadata?.sourceFile || doc.apiName;
      
      // Generate inject function with embedded EDS URL and callback forwarder logic
      const injectCode = `
        function(request) {
          const https = require('https');
          const http = require('http');
          const url = require('url');
          
          const parsedUrl = url.parse('${edsUrl}');
          
          return new Promise((resolve, reject) => {
            const options = {
              hostname: parsedUrl.hostname,
              path: parsedUrl.path + '?t=' + Date.now(),
              method: 'GET',
              headers: {
                'Accept': 'application/json',
                'Cache-Control': 'no-cache'
              }
            };
            
            const req = https.request(options, (res) => {
              let data = '';
              res.on('data', (chunk) => { data += chunk; });
              res.on('end', () => {
                try {
                  const mockData = JSON.parse(data);
                  
                  // Get headers from mock, ensure Content-Type is set
                  const headers = mockData.responseHeaders || {};
                  if (!headers['Content-Type'] && !headers['content-type']) {
                    headers['Content-Type'] = 'application/json';
                  }
                  
                  let responseBody = mockData.responseBody || {};
                  
                  // Inject callback forwarder if configured
                  const callbackConfig = ${callbackForwarderConfig};
                  if (callbackConfig && callbackConfig.redirectField && callbackConfig.callbackUrlSource) {
                    const redirectField = callbackConfig.redirectField;
                    const callbackUrlSource = callbackConfig.callbackUrlSource;
                    const delaySeconds = callbackConfig.delaySeconds || 5;
                    
                    // Helper to get nested field value (e.g., "data.redirectUrl")
                    function getNestedValue(obj, path) {
                      return path.split('.').reduce((current, key) => current && current[key], obj);
                    }
                    
                    // Helper to set nested field value
                    function setNestedValue(obj, path, value) {
                      const keys = path.split('.');
                      const lastKey = keys.pop();
                      const target = keys.reduce((current, key) => {
                        if (!current[key]) current[key] = {};
                        return current[key];
                      }, obj);
                      target[lastKey] = value;
                    }
                    
                    // Extract callback URL from request (supports nested fields)
                    const fieldPath = callbackUrlSource.replace(/^request\\./, '');
                    const callbackUrl = getNestedValue(request, fieldPath) || 
                                      (request.body && getNestedValue(request.body, fieldPath));
                    
                    // Get current redirect URL value
                    const currentRedirectUrl = getNestedValue(responseBody, redirectField);
                    
                    // Replace redirect URL if both exist
                    if (currentRedirectUrl && callbackUrl) {
                      const forwarderUrl = '${baseUrl}/api/callback-forwarder' +
                        '?callbackUrl=' + encodeURIComponent(callbackUrl) +
                        '&delay=' + delaySeconds +
                        '&mockId=' + encodeURIComponent('${mockId}');
                      
                      setNestedValue(responseBody, redirectField, forwarderUrl);
                      console.log('Injected callback forwarder at ' + redirectField + ': ' + forwarderUrl);
                    }
                  }
                  
                  resolve({
                    statusCode: mockData.statusCode || 200,
                    headers: headers,
                    body: responseBody
                  });
                } catch (err) {
                  resolve({
                    statusCode: 500,
                    headers: { 'Content-Type': 'application/json' },
                    body: { error: 'Failed to parse mock response', details: err.message }
                  });
                }
              });
            });
            
            req.on('error', (err) => {
              resolve({
                statusCode: 500,
                headers: { 'Content-Type': 'application/json' },
                body: { error: 'Failed to fetch mock from EDS', details: err.message }
              });
            });
            
            req.end();
          });
        }
      `;
      
      response = {
        inject: injectCode
      };
    }
    // Strategy 3: Inline function code (legacy support)
    else if (doc.responseFunction && doc.responseFunction.trim() !== '') {
      // Inline function code provided
      console.log(`   Using inline function code`);
      
      response = {
        inject: doc.responseFunction
      };
    }
    // Strategy 4: Static response (fallback - shouldn't happen with external mode)
    else {
      console.log(`   Static response (fallback)`);
      
      response = {
        is: {
          statusCode: 200,
          headers: headers,
          body: doc.responseBody
        }
      };
    }
    
    // Add latency behavior (Mountebank handles this, not the inject function!)
    if (latencyMs > 0) {
      response._behaviors = { wait: latencyMs };
      console.log(`   → Latency: ${latencyMs}ms (handled by Mountebank)`);
    }
    
    stub.responses.push(response);

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
    // Add cache-busting timestamp to avoid CDN caching issues
    const timestamp = Date.now();
    const urlWithCacheBust = `${EXTERNAL_MOCKS_URL}?t=${timestamp}`;
    
    console.log(`Fetching mocks from: ${urlWithCacheBust}`);
    const response = await axios.get(urlWithCacheBust, {
      timeout: 10000,
      headers: {
        'Accept': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
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
    // Add cache-busting timestamp to avoid CDN caching issues
    const timestamp = Date.now();
    const urlWithCacheBust = `${EXTERNAL_FUNCTIONS_URL}?t=${timestamp}`;
    
    console.log(`Fetching functions from: ${urlWithCacheBust}`);
    const response = await axios.get(urlWithCacheBust, {
      timeout: 10000,
      headers: {
        'Accept': 'text/plain',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache'
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
  
  // Clean up temporary mocks that now exist in GitHub
  const removedTempMocks = cleanupMatchingTempMocks(externalMocks);
  
  // Combine external mocks with remaining temporary mocks (temp mocks have higher priority)
  const allMocks = [...temporaryMocks, ...externalMocks];
  
  // Load all mocks into Mountebank (temp mocks first = higher priority in matching)
  console.log(`Loading ${allMocks.length} mocks into Mountebank (${temporaryMocks.length} temporary, ${externalMocks.length} from GitHub)`);
  await upsertImposter(allMocks);
  
  
  return {
    mocksLoaded: externalMocks.length,
    functionsLoaded: Object.keys(externalFunctions).length,
    temporaryMocksActive: temporaryMocks.length,
    temporaryMocksRemoved: removedTempMocks,
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
      
      // Add external mocks with indicator that they're from external source
      const externalMocksWithSource = externalMocks.map(mock => ({
        ...mock,
        _id: mock._metadata?.sourceFile || mock.apiName, // Use sourceFile as ID since they don't have MongoDB _id
        _source: 'external',
        _isReadOnly: true // Indicate these can't be edited via UI
      }));
      
      // Add temporary mocks with indicator that they're temporary
      const tempMocksWithSource = temporaryMocks.map((mock, index) => ({
        ...mock,
        _id: `temp-${index}-${mock.apiName}`, // Unique ID for temporary mocks
        _source: 'temporary',
        _isTemporary: true,
        _isReadOnly: false // Temporary mocks can be deleted
      }));
      
      // Return temp mocks first (so they appear at the top of the list)
      const combinedMocks = [...tempMocksWithSource, ...externalMocksWithSource];
      console.log(`Returning ${combinedMocks.length} total mocks to UI (${tempMocksWithSource.length} temp + ${externalMocksWithSource.length} external)`);
      return res.json(combinedMocks);
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

// POST upload temporary mock (for testing before GitHub commit)
router.post('/mocks/upload-temp', async (req, res) => {
  try {
    const mockData = req.body;
    
    // Validate required fields
    if (!mockData.apiName) {
      return res.status(400).json({ error: 'apiName is required' });
    }
    
    if (!mockData.responseBody) {
      return res.status(400).json({ error: 'responseBody is required' });
    }
    
    // Add default values
    const tempMock = {
      businessName: mockData.businessName || `Temporary Test Mock - ${mockData.apiName}`,
      apiName: mockData.apiName,
      method: mockData.method || 'POST',
      statusCode: mockData.statusCode || 200,
      latencyMs: mockData.latencyMs || 0,
      predicate: mockData.predicate || { request: {}, headers: {}, query: {} },
      responseHeaders: mockData.responseHeaders || { 'Content-Type': 'application/json' },
      responseBody: mockData.responseBody,
      responseFunction: mockData.responseFunction || null,
      _uploadedAt: new Date().toISOString()
    };
    
    // Check if a temp mock with same API already exists (replace it)
    const existingIndex = temporaryMocks.findIndex(m => mocksMatch(m, tempMock));
    if (existingIndex >= 0) {
      console.log(`Replacing existing temp mock for ${tempMock.apiName}`);
      temporaryMocks[existingIndex] = tempMock;
    } else {
      console.log(`Adding new temp mock for ${tempMock.apiName}`);
      temporaryMocks.push(tempMock);
    }
    
    // Reload imposter with all mocks (temp + GitHub)
    try {
      const externalMocks = await fetchMocksFromExternal();
      const allMocks = [...temporaryMocks, ...externalMocks];
      await upsertImposter(allMocks);
      console.log(`Reloaded imposter with ${temporaryMocks.length} temp mocks + ${externalMocks.length} GitHub mocks`);
    } catch (reloadErr) {
      console.error('Failed to reload imposter after adding temp mock:', reloadErr);
      // Continue anyway - mock is in memory
    }
    
    res.json({
      message: 'Temporary mock uploaded successfully',
      mock: tempMock,
      note: 'This mock is in-memory only. It will be removed when you reload from GitHub or push this mock to GitHub.',
      totalTemporaryMocks: temporaryMocks.length,
      testUrl: `${req.protocol}://${req.get('host')}/${tempMock.apiName}`
    });
  } catch (err) {
    console.error('Failed to upload temporary mock:', err);
    res.status(500).json({ 
      error: 'Failed to upload temporary mock',
      details: err.message 
    });
  }
});

// DELETE temporary mock
router.delete('/mocks/temp/:apiName', async (req, res) => {
  try {
    const apiName = decodeURIComponent(req.params.apiName);
    const method = req.query.method || 'POST';
    
    const beforeCount = temporaryMocks.length;
    temporaryMocks = temporaryMocks.filter(m => 
      !(m.apiName === apiName && (m.method || 'POST') === method)
    );
    
    if (temporaryMocks.length === beforeCount) {
      return res.status(404).json({ error: 'Temporary mock not found' });
    }
    
    // Reload imposter without this mock
    try {
      const externalMocks = await fetchMocksFromExternal();
      const allMocks = [...temporaryMocks, ...externalMocks];
      await upsertImposter(allMocks);
      console.log(`Removed temp mock and reloaded imposter`);
    } catch (reloadErr) {
      console.error('Failed to reload imposter after removing temp mock:', reloadErr);
    }
    
    res.json({
      message: 'Temporary mock deleted successfully',
      remainingTemporaryMocks: temporaryMocks.length
    });
  } catch (err) {
    console.error('Failed to delete temporary mock:', err);
    res.status(500).json({ 
      error: 'Failed to delete temporary mock',
      details: err.message 
    });
  }
});

// GET temporary mocks count/info
router.get('/mocks/temp/info', async (req, res) => {
  try {
    res.json({
      totalTemporaryMocks: temporaryMocks.length,
      mocks: temporaryMocks.map(m => ({
        businessName: m.businessName,
        apiName: m.apiName,
        method: m.method || 'POST',
        uploadedAt: m._uploadedAt
      }))
    });
  } catch (err) {
    console.error('Failed to fetch temp mocks info:', err);
    res.status(500).json({ 
      error: 'Failed to fetch temporary mocks info',
      details: err.message 
    });
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

// ============================================================
// CALLBACK FORWARDER ROUTES
// ============================================================

/**
 * Find mock configuration by ID (sourceFile or apiName)
 */
async function findMockById(mockId) {
  try {
    const mocks = await fetchMocksFromExternal();
    
    // Try sourceFile first
    let mock = mocks.find(m => m._metadata?.sourceFile === mockId);
    
    // Fallback to apiName
    if (!mock) {
      mock = mocks.find(m => m.apiName === mockId);
    }
    
    return mock;
  } catch (err) {
    console.error('Error finding mock:', err.message);
    return null;
  }
}

/**
 * Apply templating to callback payload
 * Supports: ${NOW} and ${TIMESTAMP}
 */
function applyCallbackTemplating(payload) {
  try {
    let jsonStr = JSON.stringify(payload);
    
    // Replace ${NOW} with current timestamp
    jsonStr = jsonStr.replace(/\$\{NOW\}/g, new Date().toISOString());
    
    // Replace ${TIMESTAMP} with Unix timestamp
    jsonStr = jsonStr.replace(/\$\{TIMESTAMP\}/g, Date.now());
    
    return JSON.parse(jsonStr);
  } catch (err) {
    console.error('Error applying templating:', err.message);
    return payload;
  }
}

/**
 * GET /callback-forwarder
 * 
 * Simulates external service redirect/callback flow (e.g., Perfios e-KYC)
 * 
 * WHY TWO RESPONSES?
 * 1. Instant HTML response → For user's browser (so they don't see blank page)
 * 2. Delayed POST callback → For AEM backend (simulates external service callback)
 * 
 * Real flow:
 *   User clicks redirect → Perfios site → User fills form → Perfios calls back AEM
 * 
 * Mock flow:
 *   User clicks redirect → See "scheduled" page → Close window → Mock calls back AEM
 */
router.get('/callback-forwarder', async (req, res) => {
  const { callbackUrl, delay = 5, mockId } = req.query;
  
  if (!callbackUrl) {
    return res.status(400).send(`
      <html>
      <body style="font-family: Arial; text-align: center; padding: 50px;">
        <h2>❌ Error: Missing callbackUrl parameter</h2>
        <p>Callback forwarder requires a callbackUrl query parameter.</p>
      </body>
      </html>
    `);
  }
  
  if (!mockId) {
    return res.status(400).send(`
      <html>
      <body style="font-family: Arial; text-align: center; padding: 50px;">
        <h2>❌ Error: Missing mockId parameter</h2>
        <p>Callback forwarder requires a mockId query parameter.</p>
      </body>
      </html>
    `);
  }
  
  const delaySeconds = parseInt(delay) || 5;
  
  // RESPONSE #1: Immediate HTML response to user's browser
  // This prevents the browser from hanging/showing blank page during delay
  // User sees this, then can close the window
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Callback Simulator</title>
      <style>
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; 
          max-width: 600px; 
          margin: 50px auto; 
          padding: 20px; 
          background: #f5f5f5;
        }
        .card { 
          background: white;
          border-radius: 8px; 
          padding: 30px; 
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
        h1 { 
          color: #4CAF50; 
          margin-top: 0;
        }
        .info { 
          background: #e8f5e9; 
          padding: 15px; 
          margin: 20px 0; 
          border-radius: 4px;
          border-left: 4px solid #4CAF50;
        }
        .info strong {
          display: block;
          margin-bottom: 5px;
          color: #2e7d32;
        }
        code {
          background: #f5f5f5;
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 13px;
          word-break: break-all;
        }
        .footer {
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #e0e0e0;
          color: #666;
          font-size: 14px;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>✓ Callback Scheduled</h1>
        
        <div class="info">
          <strong>Callback URL:</strong>
          <code>${callbackUrl}</code>
          
          <strong style="margin-top: 10px;">Delay:</strong>
          ${delaySeconds} seconds
          
          <strong style="margin-top: 10px;">Mock ID:</strong>
          <code>${mockId}</code>
        </div>
        
        <p>✅ Callback will be triggered automatically in <strong>${delaySeconds} seconds</strong>.</p>
        <p>You can close this window. The callback will be sent in the background.</p>
        
        <div class="footer">
          <p>💡 <strong>What's happening:</strong></p>
          <ul style="text-align: left; margin-top: 10px;">
            <li>The mock server is waiting ${delaySeconds} seconds</li>
            <li>Then it will POST the callback payload to your URL</li>
            <li>Your application will process the callback automatically</li>
          </ul>
        </div>
      </div>
    </body>
    </html>
  `);
  
  // RESPONSE #2: Delayed POST callback to AEM backend
  // This happens in the background after the HTML response is already sent
  // Simulates the external service (Perfios) processing and calling back
  setTimeout(async () => {
    try {
      // Fetch mock configuration to get callback payload
      const mock = await findMockById(mockId);
      
      let callbackPayload;
      if (mock && mock.callbackForwarder && mock.callbackForwarder.payload) {
        callbackPayload = mock.callbackForwarder.payload;
        console.log(`Using callback payload from mock: ${mockId}`);
      } else {
        // Fallback to default payload
        callbackPayload = { status: 'success', timestamp: new Date().toISOString() };
        console.warn(`Mock ${mockId} not found or missing payload, using default`);
      }
      
      // Apply runtime templating (${NOW}, ${TIMESTAMP})
      const payload = applyCallbackTemplating(callbackPayload);
      
      // Trigger callback to AEM
      console.log(`🔔 Triggering callback to: ${callbackUrl}`);
      console.log(`   Payload:`, JSON.stringify(payload, null, 2));
      
      const response = await axios.post(callbackUrl, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      });
      
      console.log(`✅ Callback sent successfully (status: ${response.status})`);
    } catch (error) {
      console.error(`❌ Callback failed: ${error.message}`);
      if (error.response) {
        console.error(`   Response status: ${error.response.status}`);
      }
    }
  }, delaySeconds * 1000);
});

module.exports = router;
module.exports.reloadAllImposters = reloadAllImposters;
module.exports.reloadFromExternal = reloadFromExternal;
