'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, randomInt } = require('node:crypto');
const { WebSocketServer } = require('ws');
const { Room, VERSION } = require('./multiplayer');
const { attachNaval } = require('./naval-server');
const { attachLobby } = require('./lobby-server');
const L = require('./lobby-rules');
const Rules = require('./web/rules');
const Characters = require('./web/characters');
const files = Object.fromEntries(['lobby.html', 'lobby.css', 'lobby.js', 'index.html', 'battleship.html', 'naval.css', 'naval-model.js', 'naval-client.js', 'naval.js', 'robots.html', 'robots.css', 'robot-model.js', 'robots.js', 'alkkagi.html', 'flight.html', 'style.css', 'arcade.css', 'game.js', 'physics.js', 'online.js', 'config.js', 'hub.js', 'flight-model.js', 'flight.js', 'assets/pywel-panorama.png', 'assets/damiane-sprites-v2.png'].map(f => ['/' + f, f]));
files['/'] = 'index.html';
files['/ai.js'] = 'ai.js';
for (const file of ['rules.js','shot-engine.js','shot-effects.js','characters.js']) files['/'+file]=file;
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png' };

function createGameServer({ automatic = true, firstPlayer } = {}) {
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
  const lobby = attachLobby(server,{alkkagi:rooms,naval:naval.rooms});
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false });
  server.on('upgrade', (req, socket, head) => {
    if (['/ws/naval','/ws/lobby'].includes(req.url)) return;
    const origins = (process.env.ALLOWED_ORIGINS || 'https://south-hive.github.io').split(',');
    let ownOrigin = false;
    try { const origin = new URL(req.headers.origin); ownOrigin = origin.host === req.headers.host; } catch {}
    if (req.url !== '/ws' || wss.clients.size >= 400 || (req.headers.origin && !ownOrigin && !origins.includes(req.headers.origin))) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
  });
  const send = (ws, data) => { if (ws?.readyState === 1) { if (ws.bufferedAmount > 256 * 1024) { ws.terminate(); return; } ws.send(JSON.stringify(data)); } };
  const broadcast = room => { room.players.forEach((p, team) => send(p?.socket, room.snapshot(team))); room.spectators.forEach(ws=>send(ws,room.snapshot(null))); };
  function closeRoom(room, reason) {
    rooms.delete(room.code);
    room.spectators.forEach(ws=>{ws.room=null;send(ws,{type:'ended',reason});});room.spectators.clear();
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
        if (m.type === 'create' || m.type === 'join' || m.type === 'resume' || m.type === 'watch') {
          if (ws.room) throw Error('ALREADY_JOINED');
          let room, team, player;
          const characterId=(m.type==='create'||m.type==='join')?(m.characterId==='random'?Characters.list()[randomInt(Characters.list().length)].id:Characters.get(m.characterId).id):null;
          if (m.type === 'create') {
            if (rooms.size >= 100) throw Error('SERVER_FULL');
            let code; do { code = randomBytes(6).toString('hex').toUpperCase(); } while (rooms.has(code));
            room = new Room(code, Date.now(), firstPlayer, m.ruleset); L.configure(room,m); rooms.set(code, room); team = 0; player = room.seat(team, ws, Date.now(), characterId);
          } else {
            room = rooms.get(typeof m.code === 'string' ? m.code.toUpperCase() : '');
            if (!room) throw Error('ROOM_NOT_FOUND');
            if(m.type==='watch'){
              if(room.spectators.size>=20)throw Error('SPECTATORS_FULL');
              room.spectators.add(ws);ws.room=room;ws.spectator=true;ws.team=null;
              send(ws,{type:'joined',version:VERSION,code:room.code,team:null,role:'spectator'});broadcast(room);return;
            }
            if (m.type === 'resume') {
              const resumed = room.resume(m.token, ws); team = resumed.team; player = resumed.player;
              if (resumed.previous && resumed.previous !== ws) { resumed.previous.room = null; send(resumed.previous, { type: 'ended', reason: 'REPLACED' }); resumed.previous.close(); }
            } else {
              if (room.players[1]) throw Error('ROOM_FULL');
              team = 1; player = room.seat(team, ws, Date.now(), characterId);
            }
          }
          if(m.type!=='resume')L.namePlayer(room,team,m.nickname);
          ws.room = room; ws.team = team; ws.spectator=false;
          send(ws, { type: 'joined', version: VERSION, code: room.code, token: player.token, team, role:'player' }); broadcast(room);
        } else {
          const room = ws.room;
          if(ws.spectator&&room){
            if(m.type==='sync')send(ws,room.snapshot(null));
            else if(m.type==='leave'){room.spectators.delete(ws);ws.room=null;send(ws,{type:'ended',reason:'LEFT'});broadcast(room);}
            else throw Error('READ_ONLY');
            return;
          }
          if (!room || room.players[ws.team]?.socket !== ws) throw Error('NOT_JOINED');
          if(m.type==='prepare'){L.prepare(room,ws.team,m,Rules.initialPhase(room.ruleset));broadcast(room);}
          else if (m.type === 'shot') { room.shot(ws.team, m); send(ws, { type: 'accepted', request: m.request }); broadcast(room); }
          else if (m.type === 'selectIron') { room.selectIron(ws.team, m); broadcast(room); }
          else if (m.type === 'guide') { room.armGuide(ws.team, m); broadcast(room); }
          else if (m.type === 'rematch') { room.rematch(ws.team, m); broadcast(room); }
          else if (m.type === 'leave') closeRoom(room, 'LEFT');
          else if (m.type === 'sync') send(ws, room.snapshot(ws.team));
          else throw Error('INVALID_MESSAGE');
        }
      } catch (error) { send(ws, { type: 'error', code: error instanceof SyntaxError ? 'INVALID_MESSAGE' : error.message, request: m?.request }); }
    });
    ws.on('close', () => {
      const room = ws.room, p = room?.players[ws.team];
      if(ws.spectator&&room){room.spectators.delete(ws);broadcast(room);return;}
      if (p?.socket === ws) { p.socket = null; p.lastSeen = Date.now(); if(room.phase==='lobby')room.lobbyReady=[false,false]; broadcast(room); }
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
    await lobby.close(); await naval.close();
    wss.clients.forEach(ws => ws.terminate());
    await new Promise(resolve => wss.close(resolve));
    await new Promise(resolve => server.close(resolve));
  }
  return { server, rooms, naval, lobby, close, broadcast };
}
if (require.main === module) {
  const game = createGameServer(), port = Number(process.env.PORT) || 8080;
  game.server.listen(port, '0.0.0.0', () => console.log(`알까기: http://localhost:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { game.close().then(() => process.exit(0)); });
}
module.exports = { createGameServer };
