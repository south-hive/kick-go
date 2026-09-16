const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function client(t) {
  const sockets=[],accepted=[];
  class Socket {
    static OPEN=1;
    constructor(){this.readyState=1;sockets.push(this);}
    send(){}
    close(){this.readyState=3;}
    receive(data){this.onmessage({data:JSON.stringify(data)});}
  }
  const context=vm.createContext({window:{},location:{origin:'http://localhost:8080',hostname:'localhost',protocol:'http:'},URL,WebSocket:Socket,setTimeout,clearTimeout});
  vm.runInContext(fs.readFileSync(require.resolve('../web/online.js'),'utf8'),context);
  const net=new context.window.OnlineGame(state=>accepted.push(state),()=>{});
  t.after(()=>net.stop(false));net.begin('create');
  const socket=sockets[0];socket.onopen();
  socket.receive({type:'joined',version:1,code:'ABCDEF123456',team:0,token:'test-session'});
  const state={type:'state',version:1,code:'ABCDEF123456',ruleset:'modern',shotPlayback:null,phase:'aim',turn:0,connected:[true,true],votes:[false,false],firstPlayer:0,guideRemaining:[1,2],guideArmed:[false,false]};
  return{net,socket,state,accepted};
}
test('legacy server without iron selection is rejected instead of silently playing ordinary stones',t=>{
  const {net,socket,state,accepted}=client(t);socket.receive(state);
  assert.equal(accepted.length,0);assert.equal(net.canShoot(),false);
  assert.equal(net.active,false);assert.equal(socket.readyState,3);
  assert.match(net.text(),/구버전/);assert.equal(net.state,null);
});
test('current server proceeds through secret selection and allows play after both are ready',t=>{
  const {net,socket,state,accepted}=client(t);
  socket.receive({...state,phase:'select',ironReady:[false,false]});
  assert.equal(net.canShoot(),false);assert.equal(accepted.length,1);
  socket.receive({...state,ironReady:[true,true]});
  assert.equal(accepted.length,2);assert.equal(net.canShoot(),true);
});
test('server without rule sets and recorded playback is rejected',t=>{
  const {net,socket,state,accepted}=client(t);
  delete state.ruleset;delete state.shotPlayback;
  socket.receive({...state,ironReady:[true,true]});
  assert.equal(accepted.length,0);assert.match(net.text(),/구버전/);assert.equal(net.canShoot(),false);
});
