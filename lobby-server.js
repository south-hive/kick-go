'use strict';
const {WebSocketServer}=require('ws');
function attachLobby(server,games){
  const wss=new WebSocketServer({noServer:true,maxPayload:1024,perMessageDeflate:false});
  function listing(){return Object.entries(games).flatMap(([game,rooms])=>[...rooms.values()].filter(r=>r.lobby&&r.public).map(r=>({game,ruleset:r.ruleset,code:r.code,title:r.title,host:r.players[0]?.name||'방장',names:r.players.map(p=>p?.name||null),count:r.players.filter(Boolean).length,phase:r.phase,connected:r.players.map(p=>!!(p?.socket?.readyState===1)),spectators:r.spectators?.size||0})));}
  function send(ws){if(ws.readyState!==1)return;if(ws.bufferedAmount>256*1024)return ws.terminate();ws.send(JSON.stringify({type:'rooms',version:1,rooms:listing()}));}
  server.on('upgrade',(req,socket,head)=>{
    if(req.url!=='/ws/lobby')return;
    let own=false;try{own=new URL(req.headers.origin).host===req.headers.host;}catch{}
    const origins=(process.env.ALLOWED_ORIGINS||'https://south-hive.github.io').split(',');
    if(wss.clients.size>=200||(req.headers.origin&&!own&&!origins.includes(req.headers.origin)))return socket.destroy();
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws));
  });
  wss.on('connection',ws=>{ws.alive=true;ws.on('error',()=>{});ws.on('pong',()=>ws.alive=true);send(ws);});
  const update=setInterval(()=>wss.clients.forEach(send),1000);
  const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(!ws.alive){ws.terminate();continue;}ws.alive=false;ws.ping();}},15000);
  return{listing,async close(){clearInterval(update);clearInterval(heartbeat);wss.clients.forEach(ws=>ws.terminate());await new Promise(resolve=>wss.close(resolve));}};
}
module.exports={attachLobby};
