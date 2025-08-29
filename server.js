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

const PORT = process.env.BACKEND_PORT || 5000;
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
