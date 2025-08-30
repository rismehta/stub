require('dotenv').config();
const http = require('http');
const httpProxy = require('http-proxy');
const express = require('express');

const PROXY_PORT = process.env.PROXY_PORT || 8080;
const CONTROL_API_PORT = process.env.CONTROL_API_PORT || 3005;
const PROXY_URL=process.env.PROXY_URL || "http://localhost";

const proxy = httpProxy.createProxyServer({});
let apiPortMap = {};

const server = http.createServer((req, res) => {    
  const apiName = req.url.split('/')[1];
  if (apiName && apiPortMap[apiName]) {
    proxy.web(req, res, { target: `${PROXY_URL}:${apiPortMap[apiName]}` }, (err) => {
      res.writeHead(502);
      res.end('Bad Gateway: ' + err.message);
    });
  } else {
    res.writeHead(404);
    res.end('API Not Found');
  }
});

server.listen(PROXY_PORT, () => {
  console.log(`Reverse proxy listening on port ${PROXY_PORT}`);
});

// Control API for updating map
const app = express();
app.use(express.json());

app.post('/update-map', (req, res) => {
  if (typeof req.body === 'object') {
    apiPortMap = { ...req.body };
    console.log('Proxy map updated:', apiPortMap);
    res.json({ message: 'Map updated' });
  } else {
    res.status(400).json({ error: 'Invalid format' });
  }
});

app.listen(CONTROL_API_PORT, () => {
  console.log(`Proxy control API running on port ${CONTROL_API_PORT}`);
});
