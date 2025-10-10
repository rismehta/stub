require('dotenv').config();
const http = require('http');
const httpProxy = require('http-proxy');
const url = require('url');

const PROXY_PORT = process.env.PORT || process.env.PROXY_PORT || 10000;

const proxy = httpProxy.createProxyServer({});
let apiPortMap = {};

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  
  // Handle control API endpoint on same port
  if (pathname === '/update-map' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const newMap = JSON.parse(body);
        if (typeof newMap === 'object') {
          apiPortMap = { ...newMap };
          console.log('Proxy map updated:', apiPortMap);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Map updated' }));
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid format' }));
        }
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }
  
  // Regular proxy logic
  const apiName = pathname.split('/')[1];
  const targetInfo = apiPortMap[apiName];

  if (apiName && targetInfo && targetInfo.host && targetInfo.port) {
    const target = `http://${targetInfo.host}:${targetInfo.port}`;
    proxy.web(req, res, { target }, (err) => {
      res.writeHead(502);
      res.end('Bad Gateway: ' + err.message);
    });
  } else {
    res.writeHead(404);
    res.end('API Not Found');
  }
});

server.listen(PROXY_PORT, () => {
  console.log(`Reverse proxy and control API listening on port ${PROXY_PORT}`);
});

