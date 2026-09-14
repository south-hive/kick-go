'use strict';
function clean(value,limit,fallback){return typeof value==='string'?[...value.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,'').trim()].slice(0,limit).join('')||fallback:fallback;}
function configure(room,message){
  room.lobby=message.lobby===true;
  room.title=clean(message.title,32,'함께 한 판');
  room.public=room.lobby&&message.public!==false;
  room.lobbyReady=[false,false];
  if(room.lobby)room.phase='lobby';
}
function namePlayer(room,team,nickname){
  let name=clean(nickname,16,`플레이어 ${team+1}`);
  if(room.players.some((p,i)=>i!==team&&p?.name===name))name+=' (2)';
  room.players[team].name=name;
}
function prepare(room,team,message,nextPhase){
  if(room.phase!=='lobby'||message.match!==room.match||typeof message.ready!=='boolean')throw Error('PREPARATION_CLOSED');
  if(!room.players.every(p=>p?.socket?.readyState===1))throw Error('OPPONENT_OFFLINE');
  room.lobbyReady[team]=message.ready;
  if(room.lobbyReady.every(Boolean))room.phase=nextPhase;
  room.revision++;room.lastActivity=Date.now();
}
function metadata(room){return {lobby:!!room.lobby,title:room.title,public:!!room.public,lobbyReady:[...(room.lobbyReady||[false,false])],names:room.players.map(p=>p?.name||'참가자 대기 중')};}
module.exports={configure,namePlayer,prepare,metadata};
