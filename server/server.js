const http = require('http');
const path = require('path');
const fs = require('fs');
const { WebSocketServer } = require('ws');

const PUBLIC = path.join(__dirname, '..', 'public');
const server = http.createServer((req, res) => {
  let pathname = decodeURIComponent(req.url.split('?')[0]);
  if (pathname === '/') pathname = '/index.html';
  const file = path.normalize(path.join(PUBLIC, pathname));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(file);
    const types = { '.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.mp3':'audio/mpeg' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: '/ws' });
const clients = new Map();

function sendTo(id, data) {
  const socket = clients.get(String(id));
  if (!socket || socket.readyState !== socket.OPEN) return false;
  socket.send(JSON.stringify(data));
  return true;
}

wss.on('connection', (ws) => {
  let id = null;
  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.type === 'register' && ['1001','1002'].includes(String(msg.id))) {
      id = String(msg.id);
      clients.set(id, ws);
      ws.send(JSON.stringify({ type: 'registered', id }));
      return;
    }
    if (!id || String(msg.from) !== id) return;
    const to = String(msg.to || '');
    if (!['1001','1002'].includes(to) || to === id) return;
    if (msg.type === 'call') {
      if (!sendTo(to, { type: 'incoming', from: id, offer: msg.offer })) ws.send(JSON.stringify({ type:'unavailable', to }));
      return;
    }
    if (['answer','ice','decline','hangup'].includes(msg.type)) {
      sendTo(to, { ...msg, from: id, to });
    }
  });
  ws.on('close', () => {
    if (id && clients.get(id) === ws) clients.delete(id);
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => console.log(`ZERO server running on http://0.0.0.0:${PORT}`));
