require('dotenv').config();
const http = require('http');
const httpProxy = require('http-proxy');

const PROXY_PORT = process.env.PORT || 10000;
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:10000';

const proxy = httpProxy.createProxyServer({
  changeOrigin: true,
  secure: true
});

const server = http.createServer((req, res) => {
  // Forward all requests to backend's /mock endpoint
  const targetPath = `/mock${req.url}`;
  const target = `${BACKEND_URL}${targetPath}`;
  
  console.log(`Proxying ${req.method} ${req.url} to ${target}`);
  
  // Rewrite the URL to include /mock prefix
  req.url = targetPath;
  
  proxy.web(req, res, { target: BACKEND_URL }, (err) => {
    console.error('Proxy error:', err.message);
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Bad Gateway: ' + err.message);
  });
});

server.listen(PROXY_PORT, () => {
  console.log(`Proxy listening on port ${PROXY_PORT}`);
  console.log(`Forwarding all requests to ${BACKEND_URL}/mock/*`);
});

