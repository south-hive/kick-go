const {test}=require('node:test'),assert=require('node:assert/strict');
const {once}=require('node:events'),WebSocket=require('ws');
const {NavalRoom}=require('../naval-server'),M=require('../web/naval-model');
const {createGameServer}=require('../server');
const fleet=M.FLEET.map((s,i)=>({id:s.id,start:i*10,vertical:false}));
function room(){const r=new NavalRoom('ABCDEF123456');r.seat(0,{readyState:1},'하늘');r.seat(1,{readyState:1},'바다');return r;}
function ready(r){r.ready(0,{ships:fleet,match:r.match});r.ready(1,{ships:fleet.map(s=>({...s,start:s.start+5})),match:r.match});}
const message=(r,cell)=>({cell,revision:r.revision,match:r.match});
test('fleet placement enforces all five distinct straight ships without overlap or overflow',()=>{
  assert.equal(M.validate(fleet).length,5);
  for(const ships of [fleet.slice(1),[...fleet,fleet[0]],fleet.map(s=>({...s,start:0})),fleet.map(s=>({...s,start:99})),fleet.map(s=>({...s,vertical:'yes'}))])assert.throws(()=>M.validate(ships),/INVALID_FLEET/);
  assert.throws(()=>M.validate([{id:'unknown',start:0,vertical:false}]),/INVALID_FLEET/);
  for(let i=0;i<100;i++)assert.equal(M.validate(M.randomFleet()).length,5);
  assert.equal(M.coordinate(99),'J10');
});
test('private snapshots hide rival placements and all placement details from spectators',()=>{
  const r=room();r.ready(0,{ships:fleet,match:1});
  assert.deepEqual(r.snapshot(0).ownShips,fleet);assert.deepEqual(r.snapshot(1).opponentShips,[]);
  assert.deepEqual(r.snapshot(null).ownShips,[]);assert.deepEqual(r.snapshot(null).opponentShips,[]);
  assert.equal(JSON.stringify(r.snapshot(1)).includes(r.players[0].token),false);
  r.ready(1,{ships:fleet,match:1});assert.equal(r.phase,'battle');
  assert.deepEqual(r.snapshot(null).ownShips,[]);assert.deepEqual(r.snapshot(null).opponentShips,[]);
});
test('turns alternate on hits, invalid and duplicate shots are rejected, sunk ships alone are revealed',()=>{
  const r=room();ready(r);
  assert.throws(()=>r.fire(1,message(r,0)),/NOT_YOUR_TURN/);
  assert.throws(()=>r.fire(0,message(r,-1)),/INVALID_SHOT/);
  for(let i=0;i<5;i++){r.fire(0,message(r,5+i));assert.equal(r.turn,1);if(i<4)assert.deepEqual(r.snapshot(0).opponentShips,[]);r.fire(1,message(r,90+i));}
  assert.equal(r.snapshot(0).opponentShips.length,1);assert.equal(r.snapshot(null).opponentShips.length,1);
  assert.deepEqual(r.snapshot(0).ownShots.slice(5,10),[3,3,3,3,3]);
  assert.throws(()=>r.fire(0,message(r,5)),/ALREADY_SHOT/);
  assert.throws(()=>r.fire(0,{...message(r,20),revision:0}),/STALE_STATE/);
  r.players[1].socket=null;assert.throws(()=>r.fire(0,message(r,20)),/OPPONENT_OFFLINE/);
});
test('sinking all 17 cells ends the game, reveals fleets and requires both rematch votes',()=>{
  const r=room();ready(r);let miss=80;
  for(const cell of r.players[1].ships.flatMap(M.cells)){r.fire(0,message(r,cell));if(r.phase!=='over')r.fire(1,message(r,miss++));}
  assert.equal(r.phase,'over');assert.equal(r.winner,0);assert.equal(r.snapshot(null).ownShips.length,5);
  r.rematch(0,{match:1});assert.equal(r.phase,'over');r.rematch(1,{match:1});assert.equal(r.phase,'placing');assert.equal(r.match,2);
  assert.equal(r.players[0].ships.length,0);assert.equal(r.lastShot,null);assert.equal(r.players[0].shots.every(x=>x===0),true);
  assert.throws(()=>r.ready(0,{ships:fleet,match:1}),/STALE_STATE/);ready(r);assert.equal(r.turn,1);
});
async function harness(t){const game=createGameServer({automatic:false});game.server.listen(0,'127.0.0.1');await once(game.server,'listening');t.after(()=>game.close());async function connect(){const ws=new WebSocket(`ws://127.0.0.1:${game.server.address().port}/ws/naval`),queue=[],waiters=[];ws.on('message',raw=>{const m=JSON.parse(raw),i=waiters.findIndex(w=>w.predicate(m));if(i>=0){const [w]=waiters.splice(i,1);clearTimeout(w.timer);w.resolve(m);}else queue.push(m);});await once(ws,'open');return{ws,send:m=>ws.send(JSON.stringify({version:1,...m})),next(predicate){const i=queue.findIndex(predicate);if(i>=0)return Promise.resolve(queue.splice(i,1)[0]);return new Promise((resolve,reject)=>{const w={predicate,resolve,timer:setTimeout(()=>{waiters.splice(waiters.indexOf(w),1);reject(Error('timeout'));},2500)};waiters.push(w);});}};}return{game,connect};}
test('real sockets support two players, read-only spectator, reconnection and room teardown',async t=>{
  const {game,connect}=await harness(t),host=await connect();host.send({type:'create',nickname:'함장 <a>'});const h=await host.next(m=>m.type==='joined');
  const guest=await connect();guest.send({type:'join',code:h.code});const g=await guest.next(m=>m.type==='joined');assert.equal(g.team,1);
  const watcher=await connect();watcher.send({type:'watch',code:h.code});await watcher.next(m=>m.type==='joined');
  const r=game.naval.rooms.get(h.code);host.send({type:'ready',match:1,ships:fleet});await host.next(m=>m.type==='state'&&m.ready[0]);
  const visible=await watcher.next(m=>m.type==='state'&&m.ready[0]);assert.deepEqual(visible.ownShips,[]);assert.deepEqual(visible.opponentShips,[]);
  watcher.send({type:'fire',...message(r,0)});assert.equal((await watcher.next(m=>m.type==='error')).code,'READ_ONLY');
  const third=await connect();third.send({type:'join',code:h.code});assert.equal((await third.next(m=>m.type==='error')).code,'ROOM_FULL');
  guest.send({type:'ready',match:1,ships:fleet});await guest.next(m=>m.type==='state'&&m.phase==='battle');
  host.send({type:'fire',...message(r,0)});await host.next(m=>m.type==='state'&&m.lastShot?.id===1);
  const seen=await watcher.next(m=>m.type==='state'&&m.lastShot?.id===1);assert.equal(seen.ownShots[0],2);assert.deepEqual(seen.opponentShips,[]);
  guest.ws.close();await once(guest.ws,'close');await host.next(m=>m.type==='state'&&!m.connected[1]);
  const replacement=await connect();replacement.send({type:'resume',code:h.code,token:g.token});await replacement.next(m=>m.type==='joined');
  const restored=await replacement.next(m=>m.type==='state');assert.equal(restored.incomingShots[0],2);assert.equal(restored.ownShips.length,5);
  watcher.send({type:'leave'});await watcher.next(m=>m.type==='ended');assert.equal(game.naval.rooms.size,1);
  host.send({type:'leave'});await replacement.next(m=>m.type==='ended');assert.equal(game.naval.rooms.size,0);
});
