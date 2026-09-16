'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {once}=require('node:events');
const WebSocket=require('ws');
const {createGameServer}=require('../server');
async function harness(t){
  const game=createGameServer({automatic:false,firstPlayer:0});game.server.listen(0,'127.0.0.1');await once(game.server,'listening');
  const sockets=[];t.after(async()=>{sockets.forEach(s=>s.terminate());await game.close();});
  async function client(path){
    const ws=new WebSocket(`ws://127.0.0.1:${game.server.address().port}${path}`),queue=[],waiters=[];sockets.push(ws);
    ws.on('message',raw=>{const m=JSON.parse(raw);const i=waiters.findIndex(w=>w.p(m));if(i<0)queue.push(m);else{const w=waiters.splice(i,1)[0];clearTimeout(w.timer);w.resolve(m);}});
    await once(ws,'open');
    return{ws,send:m=>ws.send(JSON.stringify({version:1,...m})),next(p){const i=queue.findIndex(p);if(i>=0)return Promise.resolve(queue.splice(i,1)[0]);return new Promise((resolve,reject)=>{const w={p,resolve};w.timer=setTimeout(()=>{waiters.splice(waiters.indexOf(w),1);reject(Error('message timeout'));},3000);waiters.push(w);});}};
  }
  return{game,client};
}
for(const kind of ['alkkagi','naval'])test(`${kind}: public listing, private invite, readiness, reconnect and read-only spectators`,async t=>{
  const {game,client}=await harness(t),path=kind==='alkkagi'?'/ws':'/ws/naval';
  const host=await client(path),guest=await client(path),watch=await client(path),directory=await client('/ws/lobby');
  host.send({type:'create',lobby:true,public:true,title:'\u0000친구의 방',nickname:'친구'});
  const joined=await host.next(m=>m.type==='joined'),code=joined.code;
  assert.equal((await host.next(m=>m.type==='state')).phase,'lobby');
  const list=await directory.next(m=>m.type==='rooms'&&m.rooms.some(r=>r.code===code));
  const entry=list.rooms.find(r=>r.code===code);assert.equal(entry.title,'친구의 방');assert.equal(entry.host,'친구');assert.equal(entry.game,kind);
  assert.equal(JSON.stringify(list).includes(joined.token),false);assert.equal('stones' in entry,false);assert.equal('ownShips' in entry,false);
  host.send({type:'prepare',ready:true,match:1});assert.equal((await host.next(m=>m.type==='error')).code,'OPPONENT_OFFLINE');
  guest.send({type:'join',code,nickname:'친구'});const guestJoined=await guest.next(m=>m.type==='joined');
  const pair=await guest.next(m=>m.type==='state');assert.deepEqual(pair.names,['친구','친구 (2)']);assert.equal(pair.phase,'lobby');
  host.send({type:'prepare',ready:true,match:1});await host.next(m=>m.type==='state'&&m.lobbyReady[0]);
  host.send({type:'prepare',ready:false,match:1});await host.next(m=>m.type==='state'&&!m.lobbyReady[0]&&m.connected[1]);
  host.send({type:'prepare',ready:true,match:1});await host.next(m=>m.type==='state'&&m.lobbyReady[0]);
  guest.ws.close();await once(guest.ws,'close');const disconnect=await host.next(m=>m.type==='state'&&!m.connected[1]);assert.deepEqual(disconnect.lobbyReady,[false,false]);
  const resumed=await client(path);resumed.send({type:'resume',code,token:guestJoined.token});await resumed.next(m=>m.type==='joined');assert.deepEqual((await resumed.next(m=>m.type==='state')).names,pair.names);
  watch.send({type:'watch',code});await watch.next(m=>m.type==='joined');
  watch.send({type:'prepare',ready:true,match:1});assert.equal((await watch.next(m=>m.type==='error')).code,'READ_ONLY');
  host.send({type:'prepare',ready:true,match:1});await host.next(m=>m.type==='state'&&m.lobbyReady[0]);
  resumed.send({type:'prepare',ready:true,match:1});const started=await resumed.next(m=>m.type==='state'&&m.phase!=='lobby');assert.equal(started.phase,kind==='alkkagi'?'select':'placing');
  const observed=await watch.next(m=>m.type==='state'&&m.phase===started.phase);
  if(kind==='alkkagi')assert.ok(observed.stones.every(s=>s.iron===false));else{assert.deepEqual(observed.ownShips,[]);assert.deepEqual(observed.opponentShips,[]);}
  const room=(kind==='alkkagi'?game.rooms:game.naval.rooms).get(code);
  // Returning from a finished game preserves names and requires both rematch votes.
  room.phase='over';const oldMatch=room.match;
  host.send({type:'rematch',match:oldMatch});await host.next(m=>m.type==='state'&&m.phase==='over');assert.equal(room.phase,'over');
  resumed.send({type:'rematch',match:oldMatch});const again=await resumed.next(m=>m.type==='state'&&m.match===oldMatch+1);assert.deepEqual(again.names,pair.names);
  watch.send({type:'leave'});await watch.next(m=>m.type==='ended');assert.ok((kind==='alkkagi'?game.rooms:game.naval.rooms).has(code));
  host.send({type:'leave'});await resumed.next(m=>m.type==='ended');assert.equal(game.lobby.listing().some(r=>r.code===code),false);
  const privateHost=await client(path);privateHost.send({type:'create',lobby:true,public:false,nickname:'비공개'});const privateRoom=await privateHost.next(m=>m.type==='joined');
  assert.equal(game.lobby.listing().some(r=>r.code===privateRoom.code),false);
  const invited=await client(path);invited.send({type:'join',code:privateRoom.code,nickname:'초대 손님'});assert.equal((await invited.next(m=>m.type==='joined')).team,1);
});
test('both games share the directory and alkkagi watchers see both protections while players only see their own',async t=>{
  const {game,client}=await harness(t),a=await client('/ws'),b=await client('/ws/naval');
  for(const ws of [a,b])ws.send({type:'create',lobby:true,public:true});
  const aj=await a.next(m=>m.type==='joined');await b.next(m=>m.type==='joined');
  assert.deepEqual(new Set(game.lobby.listing().map(r=>r.game)),new Set(['alkkagi','naval']));
  const room=game.rooms.get(aj.code);room.stones[0].iron=true;room.stones[5].iron=true;
  const watcher=await client('/ws');watcher.send({type:'watch',code:aj.code});const identity=await watcher.next(m=>m.type==='joined');assert.equal(identity.token,undefined);
  const snapshot=await watcher.next(m=>m.type==='state');assert.deepEqual(snapshot.stones.filter(s=>s.iron).map(s=>s.id),[0,5]);
  for(const team of [0,1]){
    const playerView=room.snapshot(team);
    assert.ok(playerView.stones.filter(s=>s.team!==team).every(s=>!('iron' in s)));
    assert.equal(playerView.stones.find(s=>s.id===team*5).iron,true);
  }
  room.stones[0].iron=false;game.broadcast(room);
  const spent=await watcher.next(m=>m.type==='state'&&m.stones[0].iron===false);
  assert.equal(spent.stones[5].iron,true);
  watcher.send({type:'shot',stone:0,vx:100,vy:0,side:0,follow:0});assert.equal((await watcher.next(m=>m.type==='error')).code,'READ_ONLY');
});
