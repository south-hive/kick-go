(function(root){
  'use strict';
  const P=typeof module!=='undefined'?require('./physics'):root.Physics;
  const Rules=typeof module!=='undefined'?require('./rules'):root.AlkkagiRules;
  const DT=1/120,MAX_TICKS=3000;
  const copy=stones=>stones.map(s=>({...s}));
  function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
  // Observers cannot mutate the simulation or prevent the remaining observers from running.
  class Hooks{
    constructor(onError=error=>console.error('Alkkagi effect hook:',error)){this.listeners=new Map();this.onError=onError;}
    on(type,handler){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(handler);return()=>this.listeners.get(type)?.delete(handler);}
    emit(type,detail){for(const handler of [...(this.listeners.get(type)||[]),...(this.listeners.get('*')||[])])try{handler(detail,type);}catch(error){this.onError(error);}}
  }
  function plan(stones,shot,{ruleset='modern',id='shot',guideName=null}={}){
    const rules=Rules.get(ruleset),sim=copy(stones),shooter=sim.find(s=>s.id===shot.stone&&s.alive);
    if(!shooter||![shot.vx,shot.vy,shot.side??0,shot.follow??0].every(Number.isFinite)||Math.hypot(shot.vx,shot.vy)<1||Math.hypot(shot.vx,shot.vy)>1360.001||Math.hypot(shot.side??0,shot.follow??0)>1.001)throw Error('INVALID_SHOT');
    if(!rules.spin&&(shot.side||shot.follow))throw Error('RULE_DISABLED');
    if(!rules.iron)sim.forEach(s=>s.iron=false);
    if(guideName!==null&&(!rules.guides||typeof guideName!=='string'))throw Error('RULE_DISABLED');
    const events=[],frames=[],team=shooter.team,contacts=new Set(),knockouts=[],struck=new Set();
    const cue=guideName===null?null:{id:`${id}:guide`,team,name:guideName,duration:1.35,remaining:1.35};
    const add=(type,tick,data={})=>events.push({id:`${id}:${events.length}`,sequence:events.length,type,tick,time:tick<0?-1.35:tick*DT,actorTeam:team,targetTeam:1-team,...data});
    if(cue)add('guide:used',-1,{team:cue.team,name:cue.name,duration:cue.duration,remaining:cue.remaining,cueId:cue.id});
    const protectedBefore=!!shooter.iron;
    P.shoot(shooter,shot.vx,shot.vy,shot.side??0,shot.follow??0);
    add('shot:start',0,{stone:shooter.id,team});
    if(protectedBefore)add('protection:spent',0,{stone:shooter.id,team,reason:'shot',privateTeam:team});
    frames.push(copy(sim));
    let tick=0;
    while(P.moving(sim)&&tick<MAX_TICKS){
      tick++;
      const guarded=sim.filter(s=>s.iron).map(s=>s.id);
      P.step(sim,DT,(s,speed)=>add('impact',tick,{stone:s.id,x:s.x,y:s.y,speed}),
        s=>{
          add('stone:fall',tick,{stone:s.id,team:s.team,x:s.x,y:s.y});
          if(s.team!==team){
            add('shot:knockout',tick,{stone:s.id,team,count:knockouts.length+1,x:s.x,y:s.y});
            knockouts.push(events[events.length-1]);
          }
          if(s.id===shooter.id&&!contacts.has(s.id))add('shot:clean-miss',tick,{stone:s.id,team:s.team,x:s.x,y:s.y});
        },
        (a,b,contact={})=>{
          contacts.add(a.id);if(b)contacts.add(b.id);
          add(b?'stone:collision':'obstacle:collision',tick,{stones:b?[a.id,b.id]:[a.id],x:a.x,y:a.y});
          if(b)for(const target of [a,b])if(target.team!==team&&!struck.has(target.id)){
            struck.add(target.id);
            add('shot:combo-hit',tick,{stone:target.id,team,count:struck.size,x:target.x,y:target.y});
          }
          if(contact.ironBlock||contact.ironClash){
            const attacker=sim.find(s=>s.id===contact.attacker),defender=sim.find(s=>s.id===contact.defender);
            const clash=!!contact.ironClash;
            add(clash?'iron:clash':'iron:hit',tick,{actorTeam:attacker.team,targetTeam:defender.team,
              attacker:attacker.id,defender:defender.id,x:defender.x,y:defender.y});
          }
        },rules,(a,b)=>{contacts.add(a.id);if(b)contacts.add(b.id);});
      for(const stone of guarded){const s=sim.find(s=>s.id===stone);if(!s.iron)add('protection:spent',tick,{stone,team:s.team,reason:'collision',privateTeam:s.team});}
      frames.push(copy(sim));
    }
    const capped=P.moving(sim);
    if(capped){sim.forEach(s=>{s.vx=0;s.vy=0;s.spinPower=0;s.spinSide=0;s.spinFollow=0;});frames[tick]=copy(sim);add('shot:limit',tick);}
    // Only multi-knockouts earn counts, shown at those stones' first impact ticks.
    const removed=new Set(knockouts.map(event=>event.stone));
    let comboCount=0;
    for(let i=events.length-1;i>=0;i--)if(events[i].type==='shot:combo-hit'&&(removed.size<2||!removed.has(events[i].stone)))events.splice(i,1);
    events.forEach((event,index)=>{
      event.sequence=index;event.id=`${id}:${index}`;
      if(event.type==='shot:combo-hit')event.count=++comboCount;
    });
    const remaining=[0,1].map(t=>sim.filter(s=>s.alive&&s.team===t).length);
    const fallen=events.filter(e=>e.type==='stone:fall');
    const enemyFalls=fallen.filter(e=>e.team!==team),ownFalls=fallen.filter(e=>e.team===team);
    const over=remaining.some(n=>n===0),winner=over?(remaining[0]===remaining[1]?null:remaining[0]===0?1:0):null;
    const result={team,remaining,fallen:fallen.map(e=>e.stone),enemyRemoved:enemyFalls.length,ownRemoved:ownFalls.length,shooterFell:!shooter.alive,over,winner,capped};
    if(enemyFalls.length>=2)add('shot:multi-knockout',tick,{team,count:enemyFalls.length});
    if(!shooter.alive)add('shot:self-knockout',tick,{team,stone:shooter.id});
    add('shot:end',tick,{result});
    if(over)add('match:end',tick,{winner,draw:winner===null});
    return freeze({id,ruleset,cue,shot:{stone:shot.stone,vx:shot.vx,vy:shot.vy,side:shot.side??0,follow:shot.follow??0},dt:DT,duration:tick*DT,frames,events,result});
  }
  class Playback{
    constructor(record,stones,emit=()=>{}){this.record=record;this.stones=stones;this.emit=emit;this.tick=0;this.elapsed=0;this.eventIndex=0;this.started=false;this.prepared=false;}
    apply(){const frame=this.record.frames[this.tick];this.stones.splice(0,this.stones.length,...copy(frame));while(this.eventIndex<this.record.events.length&&this.record.events[this.eventIndex].tick<=this.tick)this.emit(this.record.events[this.eventIndex++]);}
    prepare(){if(this.prepared)return;this.prepared=true;while(this.eventIndex<this.record.events.length&&this.record.events[this.eventIndex].tick<0)this.emit(this.record.events[this.eventIndex++]);}
    start(){if(this.started)return;this.prepare();this.started=true;this.apply();}
    advance(dt){if(!Number.isFinite(dt)||dt<0)throw Error('INVALID_TIME');this.start();this.elapsed+=dt;const target=Math.min(this.record.frames.length-1,Math.floor((this.elapsed+1e-9)/DT));while(this.tick<target){this.tick++;this.apply();}return this.done;}
    get done(){return this.started&&this.tick===this.record.frames.length-1;}
    // Never send future events, frames, inputs, or hidden ability state to clients.
    snapshot(viewer,cue=null){return {cue:cue?{...cue}:null,id:this.record.id,tick:this.tick,started:this.started,done:this.done,
      events:this.prepared?this.record.events.slice(0,this.eventIndex).filter(e=>e.privateTeam===undefined||viewer===null||e.privateTeam===viewer).map(({privateTeam,...event})=>event):[],
      result:this.done?this.record.result:null};}
  }
  // First snapshot after join/reconnect establishes a cursor; old effects do not replay.
  class RemoteEvents{
    constructor(hooks){this.hooks=hooks;this.reset();}
    reset(){this.initialized=false;this.id=null;this.sequence=-1;}
    receive(snapshot){
      if(!this.initialized){this.initialized=true;this.id=snapshot?.id||null;this.sequence=snapshot?.events.at(-1)?.sequence??-1;if(snapshot)this.hooks.emit('shot:resume',snapshot);return;}
      if(!snapshot){this.id=null;this.sequence=-1;return;}
      if(snapshot.id!==this.id){this.id=snapshot.id;this.sequence=-1;}
      for(const event of snapshot.events)if(event.sequence>this.sequence){this.sequence=event.sequence;this.hooks.emit(event.type,event.type==='guide:used'?{...event,remaining:snapshot.cue?.remaining??0}:event);}
    }
  }
  const api={DT,MAX_TICKS,Hooks,plan,Playback,RemoteEvents};
  if(typeof module!=='undefined')module.exports=api;root.AlkkagiShots=api;
})(typeof globalThis!=='undefined'?globalThis:this);
