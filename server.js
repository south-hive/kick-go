'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { WebSocketServer } = require('ws');
const { Room, VERSION } = require('./multiplayer');
const { attachNaval } = require('./naval-server');
const files = Object.fromEntries(['index.html', 'battleship.html', 'naval.css', 'naval-model.js', 'naval-client.js', 'naval.js', 'robots.html', 'robots.css', 'robot-model.js', 'robots.js', 'alkkagi.html', 'flight.html', 'style.css', 'arcade.css', 'game.js', 'physics.js', 'online.js', 'config.js', 'hub.js', 'flight-model.js', 'flight.js', 'assets/pywel-panorama.png', 'assets/damiane-sprites-v2.png'].map(f => ['/' + f, f]));
files['/'] = 'index.html';
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png' };

function createGameServer({ automatic = true } = {}) {
  const rooms = new Map();
  const server = http.createServer((req, res) => {
    let pathname;
    try { pathname = new URL(req.url, 'http://localhost').pathname; } catch { res.writeHead(400); res.end(); return; }
    if (pathname === '/health') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}'); return; }
    const file = files[pathname];
    if (!file) { res.writeHead(404); res.end('Not found'); return; }
    fs.readFile(path.join(__dirname, 'web', file), (err, data) => {
      if (err) { res.writeHead(500); res.end('Unable to load asset'); return; }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] + '; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' }); res.end(data);
    });
  });
  const naval = attachNaval(server);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
  server.on('upgrade', (req, socket, head) => {
    if (req.url === '/ws/naval') return;
    const origins = (process.env.ALLOWED_ORIGINS || 'https://south-hive.github.io').split(',');
    let ownOrigin = false;
    try { const origin = new URL(req.headers.origin); ownOrigin = origin.host === req.headers.host; } catch {}
    if (req.url !== '/ws' || wss.clients.size >= 400 || (req.headers.origin && !ownOrigin && !origins.includes(req.headers.origin))) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
  });
  const send = (ws, data) => { if (ws?.readyState === 1) { if (ws.bufferedAmount > 256 * 1024) { ws.terminate(); return; } ws.send(JSON.stringify(data)); } };
  const broadcast = room => { const state = room.snapshot(); room.players.forEach(p => send(p?.socket, state)); };
  function closeRoom(room, reason) {
    rooms.delete(room.code);
    room.players.forEach(p => { if (p?.socket) { p.socket.room = null; send(p.socket, { type: 'ended', reason }); } });
  }
  wss.on('connection', ws => {
    ws.alive = true; ws.messages = 0; ws.window = Date.now(); ws.joinedAt = Date.now();
    ws.on('pong', () => { ws.alive = true; });
    ws.on('error', () => {});
    ws.on('message', raw => {
      let m;
      try {
        if (Date.now() - ws.window > 10000) { ws.messages = 0; ws.window = Date.now(); }
        if (++ws.messages > 80) { ws.close(1008, 'Rate limit'); return; }
        m = JSON.parse(raw.toString());
        if (!m || m.version !== VERSION) throw Error('VERSION_MISMATCH');
        if (m.type === 'create' || m.type === 'join' || m.type === 'resume') {
          if (ws.room) throw Error('ALREADY_JOINED');
          let room, team, player;
          if (m.type === 'create') {
            if (rooms.size >= 100) throw Error('SERVER_FULL');
            let code; do { code = randomBytes(6).toString('hex').toUpperCase(); } while (rooms.has(code));
            room = new Room(code); rooms.set(code, room); team = 0; player = room.seat(team, ws);
          } else {
            room = rooms.get(typeof m.code === 'string' ? m.code.toUpperCase() : '');
            if (!room) throw Error('ROOM_NOT_FOUND');
            if (m.type === 'resume') {
              const resumed = room.resume(m.token, ws); team = resumed.team; player = resumed.player;
              if (resumed.previous && resumed.previous !== ws) { resumed.previous.room = null; send(resumed.previous, { type: 'ended', reason: 'REPLACED' }); resumed.previous.close(); }
            } else {
              if (room.players[1]) throw Error('ROOM_FULL');
              team = 1; player = room.seat(team, ws);
            }
          }
          ws.room = room; ws.team = team;
          send(ws, { type: 'joined', version: VERSION, code: room.code, token: player.token, team }); broadcast(room);
        } else {
          const room = ws.room;
          if (!room || room.players[ws.team]?.socket !== ws) throw Error('NOT_JOINED');
          if (m.type === 'shot') { room.shot(ws.team, m); send(ws, { type: 'accepted', request: m.request }); broadcast(room); }
          else if (m.type === 'rematch') { room.rematch(ws.team, m); broadcast(room); }
          else if (m.type === 'leave') closeRoom(room, 'LEFT');
          else if (m.type === 'sync') send(ws, room.snapshot());
          else throw Error('INVALID_MESSAGE');
        }
      } catch (error) { send(ws, { type: 'error', code: error instanceof SyntaxError ? 'INVALID_MESSAGE' : error.message, request: m?.request }); }
    });
    ws.on('close', () => {
      const room = ws.room, p = room?.players[ws.team];
      if (p?.socket === ws) { p.socket = null; p.lastSeen = Date.now(); broadcast(room); }
    });
  });
  let last = performance.now(), accumulator = 0, lastBroadcast = 0;
  const simulation = automatic ? setInterval(() => {
    const now = performance.now(); accumulator += Math.min((now - last) / 1000, .1); last = now;
    const active = [...rooms.values()].filter(r => r.phase === 'moving');
    while (accumulator >= 1 / 120) { active.forEach(r => r.step(1 / 120)); accumulator -= 1 / 120; }
    if (now - lastBroadcast >= 50) { active.forEach(broadcast); lastBroadcast = now; }
    active.filter(r => r.phase !== 'moving').forEach(broadcast);
  }, 1000 / 60) : null;
  const maintenance = setInterval(() => {
    const now = Date.now();
    wss.clients.forEach(ws => {
      if (!ws.alive || (!ws.room && now - ws.joinedAt > 60000)) return ws.terminate();
      ws.alive = false; ws.ping();
    });
    rooms.forEach(room => {
      if (now - room.lastActivity > 30 * 60000 || room.players.some(p => p && !p.socket && now - p.lastSeen > 10 * 60000)) closeRoom(room, 'EXPIRED');
    });
  }, 15000);
  async function close() {
    clearInterval(simulation); clearInterval(maintenance);
    await naval.close();
    wss.clients.forEach(ws => ws.terminate());
    await new Promise(resolve => wss.close(resolve));
    await new Promise(resolve => server.close(resolve));
  }
  return { server, rooms, naval, close, broadcast };
}
if (require.main === module) {
  const game = createGameServer(), port = Number(process.env.PORT) || 8080;
  game.server.listen(port, '0.0.0.0', () => console.log(`알까기: http://localhost:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { game.close().then(() => process.exit(0)); });
}
module.exports = { createGameServer };
