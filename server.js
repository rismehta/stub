require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const axios = require('axios');

const apiRoutes = require('./routes/Api');
const { reloadAllImposters, reloadFromExternal, waitForMountebank } = require('./routes/Api');

const app = express();

app.use(cors());

// Static files (no body parsing needed)
app.use(express.static(path.join(__dirname, 'public')));

// API routes need JSON parsing
app.use('/api', bodyParser.json({ limit: '10mb' }));
app.use('/api', bodyParser.urlencoded({ limit: '10mb', extended: true }));
app.use('/api', apiRoutes);

// Forward all mock API requests to local Mountebank imposter using axios
const MB_IMPOSTER_PORT = process.env.MB_IMPOSTER_PORT || 4000;

// Mock route needs flexible body parsing - accept any content type (JSON, XML, text, binary)
// Parse JSON as JSON (for JSONPath predicates to work), everything else as raw
app.use('/mock', express.json({ type: 'application/json', limit: '10mb' }));
app.use('/mock', express.raw({ type: (req) => req.get('content-type') !== 'application/json', limit: '10mb' }));

app.use('/mock', async (req, res) => {
  const targetUrl = `http://localhost:${MB_IMPOSTER_PORT}${req.url}`;
  
  console.log('\n========== INCOMING MOCK REQUEST ==========');
  console.log(`Method: ${req.method}`);
  console.log(`Path: ${req.url}`);
  console.log(`Query Params:`, req.query && Object.keys(req.query).length > 0 ? JSON.stringify(req.query) : 'None');
  
  try {
    // Forward safe headers, excluding problematic ones
    const skipHeaders = ['host', 'connection', 'content-length', 'transfer-encoding', 'upgrade'];
    const forwardHeaders = {};
    
    Object.keys(req.headers).forEach(key => {
      const lowerKey = key.toLowerCase();
      if (!skipHeaders.includes(lowerKey)) {
        forwardHeaders[key] = req.headers[key];
      }
    });
    
    // Ensure content-type is set
    if (!forwardHeaders['content-type'] && !forwardHeaders['Content-Type']) {
      forwardHeaders['Content-Type'] = 'application/json';
    }
    
    // Log headers (mask sensitive ones)
    console.log('Headers:');
    Object.keys(forwardHeaders).forEach(key => {
      const lowerKey = key.toLowerCase();
      let value = forwardHeaders[key];
      // Mask sensitive headers
      if (lowerKey.includes('auth') || lowerKey.includes('token') || lowerKey.includes('key')) {
        value = value ? `${value.substring(0, 10)}...` : value;
      }
      console.log(`  ${key}: ${value}`);
    });
    
    // Log request body (handle both JSON objects and raw buffers)
    if (req.body) {
      const contentType = req.headers['content-type'] || '';
      
      if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
        // Already parsed as JSON object by express.json()
        console.log('Request Body (JSON):', JSON.stringify(req.body, null, 2));
      } else if (Buffer.isBuffer(req.body) && req.body.length > 0) {
        // Raw buffer (XML, binary, etc.)
        try {
          if (contentType.includes('xml') || contentType.includes('soap')) {
            // Log XML as string (truncate if too long)
            const xmlBody = req.body.toString('utf8');
            console.log('Request Body (XML):', xmlBody.length > 500 ? xmlBody.substring(0, 500) + '...' : xmlBody);
          } else {
            // Log as text or size
            const textBody = req.body.toString('utf8');
            if (textBody.length > 500) {
              console.log('Request Body:', `${textBody.substring(0, 500)}... (${req.body.length} bytes total)`);
            } else {
              console.log('Request Body:', textBody);
            }
          }
        } catch (err) {
          console.log('Request Body:', `Binary data (${req.body.length} bytes)`);
        }
      } else {
        console.log('Request Body: None');
      }
    } else {
      console.log('Request Body: None');
    }
    
    console.log(`Forwarding to Mountebank: ${targetUrl}`);
    
    const response = await axios({
      method: req.method,
      url: targetUrl,
      data: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
      headers: forwardHeaders,
      timeout: 10000,
      validateStatus: () => true // Accept any status code
    });
    
    console.log('\n========== MOUNTEBANK RESPONSE ==========');
    console.log(`Status: ${response.status}`);
    console.log('Response Body:', typeof response.data === 'object' 
      ? JSON.stringify(response.data, null, 2) 
      : response.data);
    console.log('===========================================\n');
    
    // Forward response headers and body
    Object.keys(response.headers).forEach(key => {
      if (key !== 'transfer-encoding') {
        res.setHeader(key, response.headers[key]);
      }
    });
    
    res.status(response.status).send(response.data);
  } catch (err) {
    console.error('Error forwarding to Mountebank:', err.message);
    if (err.response) {
      res.status(err.response.status).json(err.response.data);
    } else {
      res.status(502).json({ error: 'Bad Gateway: ' + err.message });
    }
  }
});

const PORT = process.env.PORT || process.env.BACKEND_PORT || 10000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost/mock-api-db';

mongoose.connect(MONGODB_URI)
.then(async () => {
  console.log('MongoDB connected successfully');
  
  app.listen(PORT, async () => {
    console.log(`Backend server running on port ${PORT}`);
    
    // CRITICAL: Wait for Mountebank to be ready before loading mocks
    // This prevents cold start failures on Render/Heroku where Mountebank takes time to start
    console.log('\n========== WAITING FOR MOUNTEBANK ==========');
    try {
      await waitForMountebank(15, 1000); // 15 retries, starting at 1s (max ~30s total)
      console.log('============================================\n');
    } catch (err) {
      console.error('============================================');
      console.error('WARNING: Mountebank not ready, mocks will not be loaded');
      console.error('   You can manually trigger reload later via /api/reloadFromExternal');
      console.error('============================================\n');
      return; // Exit early, don't try to load mocks if Mountebank isn't ready
    }
    
    // Check if should load from external source or MongoDB
    const loadFromExternal = true; // todo: can be configured
    
    if (loadFromExternal) {
      // Load from external repository (GitHub/AEM) - EPHEMERAL MODE
      // North Star: No MongoDB persistence, mocks loaded directly from external source
      console.log('Auto-loading mocks from external repository (ephemeral mode)...');
      try {
        const results = await reloadFromExternal(false); // ← Never persist to MongoDB
        console.log(`Successfully loaded ${results.mocksLoaded} mocks from external source`);
        console.log('   (Loaded to Mountebank in-memory only, not persisted to MongoDB)');
      } catch (err) {
        console.error('Error loading from external:', err.message);
        console.log('Falling back to MongoDB...');
        try {
          const count = await reloadAllImposters();
          console.log(`Loaded ${count} mocks from MongoDB (fallback)`);
        } catch (fallbackErr) {
          console.error('Fallback also failed:', fallbackErr.message);
        }
      }
    } else {
      // Load from MongoDB (default)
      console.log('Auto-reloading all mocks from database...');
      try {
        const count = await reloadAllImposters();
        console.log(`Successfully reloaded ${count} mocks into Mountebank on startup`);
      } catch (err) {
        console.error('Error reloading imposters on startup:', err.message);
      }
    }
  });
})
.catch(err => {
  console.error('MongoDB connection error:', err);
});
