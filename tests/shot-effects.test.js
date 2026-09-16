'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const C=require('../web/characters');
const S=require('../web/shot-engine');
const catalog=require('../web/character-dialogue');

// Run the actual renderer against a small DOM adapter: resolver-only tests missed lost dialogue.
function screen(){
  let time=100;
  function element(){
    const children=[],parts=new Map();
    return {hidden:true,dataset:{},children,style:{setProperty(){},removeProperty(){}},
      offsetHeight:30,offsetWidth:300,textContent:'',
      getBoundingClientRect:()=>({top:0,height:600}),setAttribute(){},
      querySelector(key){if(!parts.has(key))parts.set(key,element());return parts.get(key);},
      append(child){children.push(child);},replaceChildren(){children.length=0;}};
  }
  const elements=new Map();
  const $=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
  $('game').parentElement=element();$('shot-cue').firstElementChild=element();
  const context={document:{getElementById:$,createElement:element},performance:{now:()=>time},innerHeight:600,matchMedia:()=>({matches:true})};
  vm.runInNewContext(fs.readFileSync(require.resolve('../web/shot-effects'),'utf8'),context);
  const hooks=new S.Hooks(),renderer=context.AlkkagiPresentation.install(hooks,{impact(){},fall(){}});
  const players=[{characterId:'kurupping',name:'A'},{characterId:'naruto',name:'B'}];
  C.bind(hooks,()=>players);
  return {$,hooks,players,draw:()=>renderer.draw({},time),advance:ms=>{time+=ms;},renderer};
}

test('every shipped dialogue reaches its declared screen channel for both player seats',()=>{
  for(const preset of catalog.presets)for(const [type,responses] of Object.entries(preset.responses))for(const [role,response] of Object.entries(responses)){
    for(const team of [0,1])for(let count=1;count<=(response.countLines?.length||1);count++){
      const ui=screen();ui.players[team].characterId=preset.id;
      const actorTeam=role==='actor'?team:1-team;
      const event={id:`${preset.id}:${type}:${team}:${count}`,type,actorTeam,targetTeam:1-actorTeam,count,duration:1.35,remaining:1};
      const reaction=C.resolve(event,ui.players).find(r=>r.team===team);
      ui.hooks.emit('character:reaction',reaction);ui.draw();
      const label=`${preset.id} ${type} ${role} ${count}`;
      if(reaction.presentation==='silent'){
        assert.ok(ui.$('shot-highlight').hidden,label);assert.ok(ui.$('character-reaction-'+team).hidden,label);continue;
      }
      const node=reaction.effects.some(e=>e.type==='guide-cue')?ui.$('shot-cue-line'):
        reaction.effects.some(e=>['shout','caption'].includes(e.type))?ui.$('shot-highlight'):ui.$('character-reaction-'+team).querySelector('span');
      assert.equal(node.textContent,reaction.line,label);
    }
  }
});

test('combo speech advances immediately past a queued shout while numeric chips accumulate',()=>{
  const ui=screen();ui.hooks.emit('iron:clash',{id:'clash',actorTeam:0,targetTeam:1});ui.draw();
  for(const count of [1,2,3]){
    ui.hooks.emit('shot:combo-hit',{id:`hit:${count}`,actorTeam:0,targetTeam:1,count});ui.draw();
    assert.equal(ui.$('shot-highlight').textContent,C.get('kurupping').responses['shot:combo-hit'].actor.countLines[count-1]);
    assert.equal(ui.$('shot-combo').children.map(e=>e.textContent).join(' '),Array.from({length:count},(_,i)=>`${i+1}타`).join(' '));
  }
  ui.hooks.emit('shot:end',{});ui.advance(1200);ui.draw();assert.ok(ui.$('shot-combo').hidden);
  ui.renderer.reset();assert.ok(ui.$('shot-highlight').hidden);
});

test('basic combo remains numeric only and finished reconnect does not replay dialogue',()=>{
  const ui=screen();ui.players[0].characterId='default';
  const event={id:'combo',type:'shot:combo-hit',actorTeam:0,targetTeam:1,count:2};
  ui.hooks.emit(event.type,event);ui.draw();assert.equal(ui.$('shot-combo').children.length,2);assert.ok(ui.$('shot-highlight').hidden);
  ui.players[0].characterId='kurupping';ui.hooks.emit('shot:resume',{done:true,events:[event]});ui.draw();
  assert.ok(ui.$('shot-highlight').hidden);assert.ok(ui.$('shot-combo').hidden);
});

test('the game server serves the shared dialogue catalog before the resolver on both entry pages',async()=>{
  const {createGameServer}=require('../server');
  const {once}=require('node:events');
  const game=createGameServer({automatic:false});game.server.listen(0,'127.0.0.1');await once(game.server,'listening');
  const base=`http://127.0.0.1:${game.server.address().port}`;
  try{
    const response=await fetch(base+'/character-dialogue.js?v=1.8.2');assert.equal(response.status,200);assert.match(await response.text(),/AlkkagiDialogue/);
    for(const page of ['alkkagi.html','lobby.html']){
      const html=await (await fetch(base+'/'+page)).text();
      assert.ok(html.indexOf('character-dialogue.js')>=0);assert.ok(html.indexOf('character-dialogue.js')<html.indexOf('characters.js'));
    }
  }finally{await game.close();}
});
