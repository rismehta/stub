require('dotenv').config();
const http = require('http');
const httpProxy = require('http-proxy');

const PROXY_PORT = process.env.PORT || process.env.PROXY_PORT || 8080;
const MB_URL = process.env.MB_URL || 'http://localhost:2525';
const MB_HOST = process.env.MB_PROXY_HOST || 'localhost';
const MB_PORT = process.env.MB_PORT || 10000;

const proxy = httpProxy.createProxyServer({});

// Target is always Mountebank - single imposter handles all APIs
const target = `http://${MB_HOST}:${MB_PORT}`;

const server = http.createServer((req, res) => {
  console.log(`Proxying ${req.method} ${req.url} to ${target}`);
  
  proxy.web(req, res, { target }, (err) => {
    console.error('Proxy error:', err.message);
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Bad Gateway: ' + err.message);
  });
});

server.listen(PROXY_PORT, () => {
  console.log(`Simple reverse proxy listening on port ${PROXY_PORT}`);
  console.log(`Forwarding all requests to ${target}`);
});

