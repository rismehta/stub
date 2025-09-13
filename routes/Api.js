const express = require('express');
const router = express.Router();
const axios = require('axios');

const ApiMock = require('../models/ApiMock');
const Counter = require('../models/Counter');

const MB_URL = process.env.MB_URL || 'http://localhost:2525';
const PROXY_URL=process.env.PROXY_URL || "http://localhost"
const MB_PROXY_HOST=process.env.MB_PROXY_HOST ||"localhost"

// Port management - increment counter in MongoDB
async function getNextPort() {
  const startPort = parseInt(process.env.PORT_COUNTER_START) || 4000;

  let counter = await Counter.findOne({ name: 'apiPort' });
  if (!counter) {
    counter = new Counter({ name: 'apiPort', seq: startPort - 1 });
    await counter.save();
  }

  const updated = await Counter.findOneAndUpdate(
    { name: 'apiPort' },
    { $inc: { seq: 1 } },
    { new: true }
  );

  if (updated.seq < startPort) {
    updated.seq = startPort;
    await updated.save();
  }

  return updated.seq;
}

// Build Mountebank stubs from DB records
function buildStubs(apiMocks) {
  return apiMocks.map(doc => {
    const predicates = [];

    const requestPred =
      doc.predicate && Object.keys(doc.predicate.request || {}).length > 0
        ? doc.predicate.request
        : doc.requestPayload && Object.keys(doc.requestPayload || {}).length > 0
        ? doc.requestPayload
        : null;

    if (requestPred) {
      predicates.push({ contains: { body: requestPred } });
    } else {
      predicates.push({ contains: { path: `/${doc.apiName}` } });
    }

    predicates.push({ equals: { method: 'POST' } });

    // Prepare JSON strings safely
    const responseBodyStr = JSON.stringify(doc.responseBody || {});
    const responseHeadersStr = JSON.stringify(doc.responseHeaders || { 'content-type': 'application/json' });

    // Template literal for injection function as a string
    const injectFn = `
      function(request) {
        var responseBody = ${responseBodyStr};
        var userHeaders = ${responseHeadersStr};
        var authHeader = request.headers['authorization'] || '';
        var combinedHeaders = Object.assign({}, userHeaders);
        if (authHeader) {
          combinedHeaders['authorization'] = authHeader;    
        }
        return {
          statusCode: 200,
          headers: combinedHeaders,
          body: responseBody
        };
      }
    `;

    return {
      predicates,
      responses: [
        {
          inject: injectFn
        }
      ]
    };
  });
}

// Create or update Mountebank imposter
async function upsertImposter(apiName, port, apiMocks) {
  const imposter = {
    port,
    protocol: 'http',
    name: apiName,
    stubs: buildStubs(apiMocks)
  };

    try {
    // Delete existing imposter if exists (ignore error if not found)
    await axios.delete(`${MB_URL}/imposters/${port}`).catch(() => {});

    // Create new imposter with updated stubs
    await axios.post(`${MB_URL}/imposters`, imposter);
  } catch (err) {
    throw err;
  }
}

// Keep proxy map updated with API port
let apiPortMap = {};

async function updateProxyMap(apiName, port) {
  apiPortMap[apiName] = {
    host: MB_PROXY_HOST,
    port: port
  };
  try {
    await axios.post(`${PROXY_URL}:${process.env.CONTROL_API_PORT}/update-map`, apiPortMap);
    console.log(`Updated proxy map for API ${apiName}:`, apiPortMap[apiName]);
  } catch (e) {
    console.error('Failed to update proxy map:', e);
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

    let port;
    if (doc) {
      // Update existing
      doc.requestPayload = requestPayload || {};
      doc.responseHeaders = responseHeaders || {};
      doc.responseBody = responseBody;
      await doc.save();
      port = doc.port;
    } else {
      // Assign port (re-use if apiName exists, else new port)
      const existingApiDoc = await ApiMock.findOne({ apiName });
      port = existingApiDoc ? existingApiDoc.port : await getNextPort();

      doc = new ApiMock({
        apiName,
        port,
        predicate: { request: predReq},
        requestPayload: requestPayload || {},
        responseHeaders: responseHeaders || {},
        responseBody
      });
      await doc.save();
    }

    const apiMocks = await ApiMock.find({ apiName });
    await upsertImposter(apiName, port, apiMocks);
    await updateProxyMap(apiName, port);

    res.json({ message: 'Mock saved and imposter updated', port });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Reload all imposters
router.post('/reloadAllImposters', async (req, res) => {
  try {
    const allMocks = await ApiMock.find({});
    console.log("Total mock to be loaded : "+allMocks.length);
    const grouped = allMocks.reduce((acc, doc) => {
      acc[doc.apiName] = acc[doc.apiName] || [];
      acc[doc.apiName].push(doc);
      return acc;
    }, {});
    
    for (const apiName in grouped) {
      const port = grouped[apiName][0].port;
      console.log("Api loaded "+apiName+" on port : "+port);
      await upsertImposter(apiName, port, grouped[apiName]);
      await updateProxyMap(apiName, port);
    }
    res.json({ message: 'All imposters reloaded' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reload imposters' });
  }
});

module.exports = router;
