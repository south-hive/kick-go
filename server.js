const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const files = { '/': 'index.html', '/index.html': 'index.html', '/style.css': 'style.css', '/game.js': 'game.js', '/physics.js': 'physics.js' };
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
http.createServer((req, res) => {
  const file = files[new URL(req.url, 'http://localhost').pathname];
  if (!file) { res.writeHead(404); res.end('Not found'); return; }
  fs.readFile(path.join(__dirname, 'web', file), (err, data) => {
    if (err) { res.writeHead(500); res.end('Unable to load asset'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] + '; charset=utf-8' }); res.end(data);
  });
}).listen(Number(process.env.PORT) || 8080, '0.0.0.0', () => console.log('알까기: http://localhost:8080'));
