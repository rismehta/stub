require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const axios = require('axios');
const httpProxy = require('http-proxy');

const apiRoutes = require('./routes/Api');

const app = express();
const proxy = httpProxy.createProxyServer({});

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', apiRoutes);

// Forward all mock API requests to local Mountebank imposter
const MB_IMPOSTER_PORT = process.env.MB_IMPOSTER_PORT || 4000;
app.use('/mock', (req, res) => {
  const target = `http://localhost:${MB_IMPOSTER_PORT}`;
  console.log(`Forwarding mock request ${req.method} ${req.url} to ${target}`);
  proxy.web(req, res, { target }, (err) => {
    console.error('Proxy error:', err.message);
    res.status(502).json({ error: 'Bad Gateway: ' + err.message });
  });
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
