'use strict';
const {randomBytes,timingSafeEqual}=require('node:crypto');
const {WebSocketServer}=require('ws');
const M=require('./web/naval-model');
const token=()=>randomBytes(24).toString('hex');
function same(a,b){return typeof a==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));}
class NavalRoom{
  constructor(code){this.code=code;this.players=[null,null];this.spectators=new Set();this.phase='waiting';this.turn=0;this.match=1;this.revision=0;this.votes=[false,false];this.winner=null;this.lastShot=null;this.shotCount=0;this.lastActivity=Date.now();}
  seat(team,socket,nickname){const name=typeof nickname==='string'?[...nickname.replace(/[\u0000-\u001f\u007f]/g,'').trim()].slice(0,16).join(''):'';const player={socket,token:token(),name:name||`함장 ${team+1}`,lastSeen:Date.now(),ships:[],shots:Array(100).fill(0),ready:false};this.players[team]=player;if(this.players.every(Boolean))this.phase='placing';this.revision++;this.lastActivity=Date.now();return player;}
  resume(secret,socket){const team=this.players.findIndex(p=>p&&same(secret,p.token));if(team<0)throw Error('INVALID_SESSION');const player=this.players[team],previous=player.socket;player.socket=socket;player.lastSeen=Date.now();this.lastActivity=Date.now();return{team,player,previous};}
  connected(){return this.players.every(p=>p?.socket?.readyState===1);}
  check(message){if(message.match!==this.match||message.revision!==this.revision)throw Error('STALE_STATE');}
  ready(team,message){if(message.match!==this.match)throw Error('STALE_STATE');if(this.phase!=='placing'||this.players[team].ready)throw Error('PLACEMENT_LOCKED');const ships=M.validate(message.ships);this.players[team].ships=ships;this.players[team].ready=true;if(this.players.every(p=>p?.ready)){this.phase='battle';this.turn=(this.match-1)%2;}this.revision++;this.lastActivity=Date.now();}
  fire(team,message){this.check(message);if(!this.connected())throw Error('OPPONENT_OFFLINE');if(this.phase!=='battle'||this.turn!==team)throw Error('NOT_YOUR_TURN');const cell=message.cell;if(!Number.isInteger(cell)||cell<0||cell>=100)throw Error('INVALID_SHOT');const actor=this.players[team],target=this.players[1-team];if(actor.shots[cell])throw Error('ALREADY_SHOT');const ship=target.ships.find(s=>M.cells(s).includes(cell));actor.shots[cell]=ship?2:1;let sunk=null;if(ship&&M.cells(ship).every(c=>actor.shots[c]>=2)){sunk=ship.id;M.cells(ship).forEach(c=>actor.shots[c]=3);}this.shotCount++;this.lastShot={id:this.shotCount,team,cell,result:sunk?'sunk':ship?'hit':'miss',sunk,cells:sunk?M.cells(ship):[]};if(target.ships.every(s=>M.cells(s).every(c=>actor.shots[c]>=2))){this.phase='over';this.winner=team;}else this.turn=1-team;this.revision++;this.lastActivity=Date.now();}
  rematch(team,message){if(this.phase!=='over'||message.match!==this.match||!this.connected())throw Error('REMATCH_UNAVAILABLE');this.votes[team]=true;if(this.votes.every(Boolean)){this.match++;this.phase='placing';this.turn=(this.match-1)%2;this.votes=[false,false];this.winner=null;this.lastShot=null;this.shotCount=0;for(const p of this.players){p.ships=[];p.shots=Array(100).fill(0);p.ready=false;}}this.revision++;this.lastActivity=Date.now();}
  snapshot(team){const observer=team===null,side=observer?0:team,me=this.players[side],other=this.players[1-side];const sunk=(fleet,shots)=>fleet.filter(s=>M.cells(s).every(c=>shots[c]===3)).map(s=>({...s}));const ownShots=me?[...me.shots]:Array(100).fill(0),incoming=other?[...other.shots]:Array(100).fill(0);return{type:'state',version:1,code:this.code,team,role:observer?'spectator':'player',match:this.match,revision:this.revision,phase:this.phase,turn:this.turn,winner:this.winner,names:this.players.map(p=>p?.name||'상대 대기 중'),connected:this.players.map(p=>!!(p?.socket?.readyState===1)),ready:this.players.map(p=>!!p?.ready),votes:[...this.votes],spectators:this.spectators.size,ownShips:me?(observer&&this.phase!=='over'?sunk(me.ships,incoming):me.ships.map(s=>({...s}))):[],ownShots,incomingShots:incoming,opponentShips:this.phase==='over'&&other?other.ships.map(s=>({...s})):other?sunk(other.ships,ownShots):[],lastShot:this.lastShot?{...this.lastShot,cells:[...this.lastShot.cells]}:null};}

}
function attachNaval(server){
  const rooms=new Map(),wss=new WebSocketServer({noServer:true,maxPayload:4096,perMessageDeflate:false});
  const send=(ws,m)=>{if(ws?.readyState===1){if(ws.bufferedAmount>256*1024)return ws.terminate();ws.send(JSON.stringify(m));}};
  const broadcast=room=>{room.players.forEach((p,i)=>p&&send(p.socket,room.snapshot(i)));for(const ws of room.spectators)send(ws,room.snapshot(null));};
  const closeRoom=(room,reason)=>{rooms.delete(room.code);for(const ws of room.spectators){ws.room=null;send(ws,{type:'ended',reason});}room.spectators.clear();for(const p of room.players)if(p?.socket){p.socket.room=null;send(p.socket,{type:'ended',reason});}};
  server.on('upgrade',(req,socket,head)=>{if(req.url!=='/ws/naval')return;const origins=(process.env.ALLOWED_ORIGINS||'https://south-hive.github.io').split(',');let own=false;try{own=new URL(req.headers.origin).host===req.headers.host;}catch{}if(wss.clients.size>=200||(req.headers.origin&&!own&&!origins.includes(req.headers.origin))){socket.destroy();return;}wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));});
  wss.on('connection',ws=>{
    ws.alive=true;ws.window=Date.now();ws.messages=0;ws.joinedAt=Date.now();ws.on('pong',()=>ws.alive=true);ws.on('error',()=>{});
    ws.on('message',raw=>{let m;try{
      if(Date.now()-ws.window>10000){ws.window=Date.now();ws.messages=0;}if(++ws.messages>80){ws.close(1008,'Rate limit');return;}
      m=JSON.parse(raw);if(!m||m.version!==1)throw Error('VERSION_MISMATCH');
      if(['create','join','resume','watch'].includes(m.type)){
        if(ws.room)throw Error('ALREADY_JOINED');let room,team,player;
        if(m.type==='create'){if(rooms.size>=100)throw Error('SERVER_FULL');let code;do{code=randomBytes(6).toString('hex').toUpperCase();}while(rooms.has(code));room=new NavalRoom(code);rooms.set(code,room);team=0;player=room.seat(team,ws,m.nickname);}
        else{room=rooms.get(typeof m.code==='string'?m.code.toUpperCase():'');if(!room)throw Error('ROOM_NOT_FOUND');if(m.type==='watch'){if(room.spectators.size>=20)throw Error('SPECTATORS_FULL');room.spectators.add(ws);ws.spectator=true;ws.room=room;send(ws,{type:'joined',version:1,code:room.code,team:null,role:'spectator'});broadcast(room);return;}if(m.type==='join'){if(room.players[1])throw Error('ROOM_FULL');team=1;player=room.seat(team,ws,m.nickname);}else{const resumed=room.resume(m.token,ws);({team,player}=resumed);if(resumed.previous){resumed.previous.room=null;send(resumed.previous,{type:'ended',reason:'REPLACED'});resumed.previous.close();}}}
        ws.room=room;ws.team=team;ws.spectator=false;send(ws,{type:'joined',version:1,role:'player',code:room.code,team,token:player.token});broadcast(room);
      }else{const room=ws.room;if(ws.spectator&&room){if(m.type==='sync')send(ws,room.snapshot(null));else if(m.type==='leave'){room.spectators.delete(ws);ws.room=null;send(ws,{type:'ended',reason:'LEFT'});broadcast(room);}else throw Error('READ_ONLY');return;}if(!room||room.players[ws.team]?.socket!==ws)throw Error('NOT_JOINED');
        if(m.type==='ready'){room.ready(ws.team,m);broadcast(room);}
        else if(m.type==='fire'){room.fire(ws.team,m);broadcast(room);}
        else if(m.type==='rematch'){room.rematch(ws.team,m);broadcast(room);}
        else if(m.type==='sync')send(ws,room.snapshot(ws.team));
        else if(m.type==='leave')closeRoom(room,'LEFT');else throw Error('INVALID_MESSAGE');
      }
    }catch(e){send(ws,{type:'error',code:e instanceof SyntaxError?'INVALID_MESSAGE':e.message});if(e.message==='STALE_STATE'&&ws.room)send(ws,ws.room.snapshot(ws.team));}});
    ws.on('close',()=>{const room=ws.room;if(ws.spectator&&room){room.spectators.delete(ws);broadcast(room);return;}const p=room?.players[ws.team];if(p?.socket===ws){p.socket=null;p.lastSeen=Date.now();broadcast(room);}});
  });
  const maintenance=setInterval(()=>{const now=Date.now();for(const ws of wss.clients){if(!ws.alive||(!ws.room&&now-ws.joinedAt>60000)){ws.terminate();continue;}ws.alive=false;ws.ping();}for(const room of rooms.values())if(now-room.lastActivity>30*60000||room.players.some(p=>p&&!p.socket&&now-p.lastSeen>10*60000))closeRoom(room,'EXPIRED');},15000);
  return{rooms,broadcast,async close(){clearInterval(maintenance);for(const ws of wss.clients)ws.terminate();await new Promise(resolve=>wss.close(resolve));}};
}
module.exports={NavalRoom,attachNaval};
