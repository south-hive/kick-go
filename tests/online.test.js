const { test } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const WebSocket = require('ws');
const { createGameServer } = require('../server');
const publicState = state => ({ ...state, stones: state.stones.map(({ iron, ...s }) => s) });

async function harness(t, select = true, firstPlayer = 0) {
  const game = createGameServer({ automatic: false, firstPlayer });
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
  if (select) {
    room.selectIron(0, { stone: 4, match: 1 }); room.selectIron(1, { stone: 9, match: 1 });
    game.broadcast(room);
  }
  const shot = (stone = 0) => ({ type: 'shot', stone, vx: 200, vy: 0, side: 0, follow: -.5, revision: room.revision, match: room.match });
  return { game, connect, host, guest, h, g, room, shot };
}

test('two clients join opposite seats and receive identical authoritative states', async t => {
  const { host, guest, h, g } = await harness(t);
  assert.equal(h.team, 0); assert.equal(g.team, 1); assert.notEqual(h.token, g.token);
  const a = await host.next(m => m.type === 'state' && m.phase === 'aim');
  const b = await guest.next(m => m.type === 'state' && m.phase === 'aim');
  assert.deepEqual(publicState(a), publicState(b)); assert.equal(JSON.stringify(a).includes(h.token), false);
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
  const b = await guest.next(m => m.type === 'state' && m.turn === 1); assert.deepEqual(publicState(a), publicState(b));
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
  assert.equal(room.stones.filter(s => s.alive).length, 10); assert.equal(room.turn, 1);
  assert.deepEqual(room.guideRemaining,[2,1]);assert.deepEqual(room.guideArmed,[false,false]);
  assert.equal(room.phase,'select');assert.deepEqual(room.ironReady,[false,false]);assert.ok(room.stones.every(s=>!s.iron));
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

test('secret iron selection is required, immutable, private on sync and preserved on reconnect', async t => {
  const {host,guest,room,shot,connect,h}=await harness(t,false);
  host.send(shot());assert.equal((await host.next(m=>m.type==='error')).code,'NOT_YOUR_TURN');
  host.send({type:'selectIron',stone:5,match:1});assert.equal((await host.next(m=>m.type==='error')).code,'INVALID_SELECTION');
  host.send({type:'selectIron',stone:2,match:1});
  const own=await host.next(m=>m.type==='state'&&m.ironReady[0]);
  const rival=await guest.next(m=>m.type==='state'&&m.ironReady[0]);
  assert.equal(own.stones[2].iron,true);assert.ok(rival.stones.filter(s=>s.team===0).every(s=>!('iron' in s)));
  host.send({type:'selectIron',stone:3,match:1});assert.equal((await host.next(m=>m.type==='error')).code,'SELECTION_CLOSED');
  guest.send({type:'selectIron',stone:7,match:1});await guest.next(m=>m.type==='state'&&m.phase==='aim');
  guest.send({type:'sync'});const synced=await guest.next(m=>m.type==='state'&&m.phase==='aim');
  assert.equal(synced.stones[7].iron,true);assert.equal('iron' in synced.stones[2],false);
  const replacement=await connect();replacement.send({type:'resume',code:room.code,token:h.token});
  const restored=await replacement.next(m=>m.type==='state'&&m.phase==='aim');
  assert.equal(restored.stones[2].iron,true);assert.equal('iron' in restored.stones[7],false);
  replacement.send(shot(2));await replacement.next(m=>m.type==='accepted');
  const consumed=await guest.next(m=>m.type==='state'&&m.phase==='moving');
  assert.equal(room.stones[2].iron,false);assert.equal('iron' in consumed.stones[2],false);
});

test('white can open and rematches alternate the opener instead of the final turn',async t=>{
  const {guest,host,room,shot}=await harness(t,true,1);
  assert.equal(room.firstPlayer,1);assert.equal(room.turn,1);assert.deepEqual(room.guideRemaining,[2,1]);
  guest.send(shot(5));await guest.next(m=>m.type==='accepted');
  room.phase='over';room.turn=0;
  guest.send({type:'rematch',match:1});const request=await host.next(m=>m.type==='state'&&m.votes[1]);
  assert.equal(request.phase,'over');assert.equal(request.votes[0],false);
  host.send({type:'rematch',match:1});await host.next(m=>m.type==='state'&&m.match===2);
  assert.equal(room.firstPlayer,0);assert.equal(room.turn,0);assert.deepEqual(room.guideRemaining,[1,2]);
});

test('guide credit is reserved once, survives reconnect, and is spent only by an accepted shot',async t=>{
  const {host,guest,room,shot,connect,h,game}=await harness(t);
  const guide=()=>({type:'guide',match:room.match,revision:room.revision});
  guest.send(guide());assert.equal((await guest.next(m=>m.type==='error')).code,'NOT_YOUR_TURN');
  host.send(guide());await host.next(m=>m.type==='state'&&m.guideArmed[0]);
  host.send(guide());await host.next(m=>m.type==='state'&&m.guideArmed[0]);
  assert.equal(room.guideRemaining[0],1);
  host.send({...shot(),vx:9999});await host.next(m=>m.type==='error');assert.equal(room.guideRemaining[0],1);
  const resumed=await connect();resumed.send({type:'resume',code:room.code,token:h.token});
  const restored=await resumed.next(m=>m.type==='state');assert.equal(restored.guideArmed[0],true);assert.equal(restored.guideRemaining[0],1);
  resumed.send(shot());await resumed.next(m=>m.type==='accepted');assert.equal(room.guideRemaining[0],0);
  for(let i=0;i<2000&&room.phase==='moving';i++)room.step(1/120);
  guest.send(shot(5));await guest.next(m=>m.type==='accepted');
  for(let i=0;i<2000&&room.phase==='moving';i++)room.step(1/120);
  game.broadcast(room);resumed.send(guide());assert.equal((await resumed.next(m=>m.type==='error')).code,'NO_GUIDES');
  assert.equal(room.guideRemaining[1],2);
});

test('edge contact is eliminated before the server decides the winner',()=>{
  const {Room}=require('../multiplayer');
  const room=new Room('edge-test',Date.now(),0);
  room.phase='moving';
  room.stones=[
    {id:0,team:0,x:86.001,y:400,vx:0,vy:0,alive:true},
    {id:5,team:1,x:122.002,y:400,vx:-1,vy:0,alive:true}
  ];
  room.step(1/120);
  assert.equal(room.phase,'over');
  for(const team of [0,1]){
    const state=room.snapshot(team);
    assert.equal(state.stones[0].alive,false);
    assert.equal(state.stones[1].alive,true);
    assert.ok(state.stones.every(s=>s.vx===0&&s.vy===0));
  }
});
