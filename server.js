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
app.all('/mock/*', async (req, res) => {
  const targetUrl = `http://localhost:${MB_IMPOSTER_PORT}${req.url.replace('/mock', '')}`;
  console.log(`Forwarding mock request ${req.method} ${req.url} to ${targetUrl}`);
  
  try {
    const response = await axios({
      method: req.method,
      url: targetUrl,
      data: req.body,
      headers: {
        'Content-Type': 'application/json',
        ...req.headers
      },
      timeout: 10000
    });
    
    console.log(`Received response from Mountebank: ${response.status}`);
    res.status(response.status).json(response.data);
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
