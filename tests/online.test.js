const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const WebSocket = require('ws');
const { createGameServer } = require('../server');

async function harness(t) {
  const game = createGameServer({ automatic: false });
  game.server.listen(0, '127.0.0.1'); await once(game.server, 'listening');
  t.after(() => game.close());
  async function connect() {
    const ws = new WebSocket(`ws://127.0.0.1:${game.server.address().port}/ws`);
    const queue = [], waiters = [];
    ws.on('message', raw => {
      const m = JSON.parse(raw); const index = waiters.findIndex(w => w.predicate(m));
      if (index >= 0) { const [w] = waiters.splice(index, 1); clearTimeout(w.timer); w.resolve(m); }
      else queue.push(m);
    });
    await once(ws, 'open');
    return { ws, send: m => ws.send(JSON.stringify({ version: 1, ...m })), next(predicate) {
      const index = queue.findIndex(predicate); if (index >= 0) return Promise.resolve(queue.splice(index, 1)[0]);
      return new Promise((resolve, reject) => { const w = { predicate, resolve }; w.timer = setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); reject(Error('Message timeout')); }, 2500); waiters.push(w); });
    } };
  }
  const host = await connect(); host.send({ type: 'create' }); const h = await host.next(m => m.type === 'joined');
  const guest = await connect(); guest.send({ type: 'join', code: h.code }); const g = await guest.next(m => m.type === 'joined');
  const room = game.rooms.get(h.code);
  const shot = (stone = 0) => ({ type: 'shot', stone, vx: 200, vy: 0, side: 0, follow: -.5, revision: room.revision, match: room.match });
  return { game, connect, host, guest, h, g, room, shot };
}

test('two clients join opposite seats and receive identical authoritative states', async t => {
  const { host, guest, h, g } = await harness(t);
  assert.equal(h.team, 0); assert.equal(g.team, 1); assert.notEqual(h.token, g.token);
  const a = await host.next(m => m.type === 'state' && m.phase === 'aim');
  const b = await guest.next(m => m.type === 'state' && m.phase === 'aim');
  assert.deepEqual(a, b); assert.equal(JSON.stringify(a).includes(h.token), false);
});

test('out-of-turn, overpowered, duplicate and opponent-stone shots are rejected', async t => {
  const { host, guest, room, shot } = await harness(t);
  guest.send(shot(5)); assert.equal((await guest.next(m => m.type === 'error')).code, 'NOT_YOUR_TURN');
  host.send(shot(5)); assert.equal((await host.next(m => m.type === 'error')).code, 'INVALID_SHOT');
  host.send({ ...shot(), vx: 2000 }); assert.equal((await host.next(m => m.type === 'error')).code, 'INVALID_SHOT');
  const message = shot(); host.send(message); host.send(message);
  await host.next(m => m.type === 'accepted'); assert.equal((await host.next(m => m.type === 'error')).code, 'NOT_YOUR_TURN');
  assert.equal(room.phase, 'moving');
});

test('a shot completes once, both clients agree, and the guest can counterattack', async t => {
  const { host, guest, game, room, shot } = await harness(t);
  host.send(shot()); await host.next(m => m.type === 'accepted');
  for (let i = 0; i < 2000 && room.phase === 'moving'; i++) room.step(1 / 120);
  assert.equal(room.phase, 'aim'); assert.equal(room.turn, 1); game.broadcast(room);
  const a = await host.next(m => m.type === 'state' && m.turn === 1);
  const b = await guest.next(m => m.type === 'state' && m.turn === 1); assert.deepEqual(a, b);
  guest.send(shot(5)); await guest.next(m => m.type === 'accepted'); assert.equal(room.phase, 'moving');
});

test('a third player cannot enter and reconnect restores the reserved seat and board', async t => {
  const { host, guest, g, room, connect, shot } = await harness(t);
  const third = await connect(); third.send({ type: 'join', code: room.code });
  assert.equal((await third.next(m => m.type === 'error')).code, 'ROOM_FULL');
  const before = JSON.stringify(room.stones);
  guest.ws.close(); await once(guest.ws, 'close');
  await host.next(m => m.type === 'state' && !m.connected[1]);
  host.send(shot()); assert.equal((await host.next(m => m.type === 'error')).code, 'OPPONENT_OFFLINE');
  third.send({ type: 'resume', code: room.code, token: 'not-a-token' }); assert.equal((await third.next(m => m.type === 'error')).code, 'INVALID_SESSION');
  third.send({ type: 'resume', code: room.code, token: g.token });
  assert.equal((await third.next(m => m.type === 'joined')).team, 1);
  assert.equal(JSON.stringify(room.stones), before); assert.equal(room.ready(), true);
});

test('both players must consent to rematch and leaving ends the room', async t => {
  const { host, guest, room, game, shot } = await harness(t);
  room.phase = 'over';
  host.send({ type: 'rematch', match: 1 }); await host.next(m => m.type === 'state' && m.votes[0]);
  assert.equal(room.match, 1);
  guest.send({ type: 'rematch', match: 1 }); await guest.next(m => m.type === 'state' && m.match === 2);
  assert.equal(room.stones.filter(s => s.alive).length, 10); assert.equal(room.turn, 0);
  host.send({ ...shot(), match: 1 }); assert.equal((await host.next(m => m.type === 'error')).code, 'NOT_YOUR_TURN');
  guest.send({ type: 'leave' }); await host.next(m => m.type === 'ended'); assert.equal(game.rooms.size, 0);
});

test('malformed input does not crash the server and newer connections replace the old session', async t => {
  const { host, h, room, connect } = await harness(t);
  host.ws.send('{broken'); assert.equal((await host.next(m => m.type === 'error')).code, 'INVALID_MESSAGE');
  const replacement = await connect(); replacement.send({ type: 'resume', code: room.code, token: h.token });
  assert.equal((await replacement.next(m => m.type === 'joined')).team, 0);
  assert.equal((await host.next(m => m.type === 'ended')).reason, 'REPLACED');
  assert.equal(room.ready(), true);
});
