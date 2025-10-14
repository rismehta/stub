require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const axios = require('axios');

const apiRoutes = require('./routes/Api');

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', apiRoutes);

// Forward all mock API requests to local Mountebank imposter using axios
const MB_IMPOSTER_PORT = process.env.MB_IMPOSTER_PORT || 4000;
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
    
    // Log request body
    if (req.body && Object.keys(req.body).length > 0) {
      console.log('Request Body:', JSON.stringify(req.body, null, 2));
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
const BACKEND_BASE_URL=process.env.BACKEND_BASE_URL|| "http://localhost"
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost/mock-api-db';

mongoose.connect(MONGODB_URI)
.then(async () => {
  
  app.listen(PORT, async () => {
    console.log(`Backend server running on port ${PORT}`);
    try {
     await axios.post(`${BACKEND_BASE_URL}:${PORT}/api/reloadAllImposters`);
      console.log('All imposters reloaded on startup');
    } catch (err) {
      console.error('Error reloading imposters on startup:', err.message);
    }
  });
})
.catch(err => {
  console.error('MongoDB connection error:', err);
});
