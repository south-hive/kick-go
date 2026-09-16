(function(root){
  'use strict';
  const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
  const presets=new Map();
  function register(preset){
    if(!preset||typeof preset.id!=='string'||!/^[-a-z0-9]+$/.test(preset.id)||typeof preset.name!=='string'||!preset.responses||typeof preset.responses!=='object')throw Error('INVALID_CHARACTER');
    if(presets.has(preset.id))throw Error('DUPLICATE_CHARACTER');
    for(const responses of Object.values(preset.responses))for(const [role,response] of Object.entries(responses)){
      if(!['actor','target','other'].includes(role)||!response||
        (response.lines!==undefined&&(!Array.isArray(response.lines)||!response.lines.every(line=>typeof line==='string')))||
        (response.effects!==undefined&&(!Array.isArray(response.effects)||!response.effects.every(effect=>effect&&typeof effect.type==='string')))||
        (response.duration!==undefined&&(!Number.isFinite(response.duration)||response.duration<0||response.duration>10000)))throw Error('INVALID_CHARACTER');
    }
    // Presets are data, never executable code received from a player.
    const stored=freeze(JSON.parse(JSON.stringify(preset)));presets.set(stored.id,stored);return stored;
  }
  function get(id='default'){if(typeof id!=='string'||!presets.has(id))throw Error('INVALID_CHARACTER');return presets.get(id);}
  function hash(value){let n=2166136261;for(const char of value)n=Math.imul(n^char.charCodeAt(0),16777619);return n>>>0;}
  function resolve(event,players){
    const actor=event.actorTeam??event.team,target=event.targetTeam??(actor===0?1:actor===1?0:null);
    return players.flatMap((player,team)=>{
      const preset=get(player.characterId||'default'),role=team===actor?'actor':team===target?'target':'other';
      const responses=Object.hasOwn(preset.responses,event.type)?preset.responses[event.type]:get().responses[event.type];
      const response=responses?.[role];if(!response)return[];
      const lines=response.lines||[],key=`${event.id||event.type}:${team}:${preset.id}`;
      const values={name:player.name||`${team+1}P`,actor:players[actor]?.name||'',target:players[target]?.name||'',count:event.count??''};
      const line=(lines.length?lines[hash(key)%lines.length]:'').replace(/\{(name|actor|target|count)\}/g,(_,name)=>String(values[name]));
      return[freeze({id:key,eventType:event.type,event,team,role,characterId:preset.id,name:values.name,line,
        effects:response.effects||[],duration:response.duration??1800})];
    });
  }
  function bind(hooks,getPlayers){
    return hooks.on('*',(detail,type)=>{
      if(type==='character:reaction')return;
      if(type==='shot:resume'){
        if(!detail.cue)return;
        const guide=detail.events.find(event=>event.type==='guide:used');if(!guide)return;
        for(const reaction of resolve({...guide,remaining:detail.cue.remaining},getPlayers()))hooks.emit('character:reaction',{...reaction,resumed:true});
        return;
      }
      if(!detail)return;
      for(const reaction of resolve({...detail,type},getPlayers()))hooks.emit('character:reaction',reaction);
    });
  }
  // The basic character; other presets inherit events they do not override.
  register({id:'default',name:'기본 캐릭터',responses:{
    'guide:used':{actor:{lines:['겁쟁이 녀석!'],effects:[{type:'guide-cue'}]}},
    'shot:clean-miss':{target:{lines:['집중하세요.'],effects:[]}},
    'shot:combo-hit':{actor:{lines:['{count}타'],effects:[{type:'shout'}],duration:650}},
    'shot:multi-knockout':{},
    'iron:hit':{actor:{lines:['금강불괴에 막혔어요'],effects:[{type:'ring',color:'#7cf4d8'}]}},
    'iron:clash':{actor:{lines:['파쇄!'],effects:[{type:'shout'},{type:'ring',color:'#ffd16d'}],duration:900}},
  }});
  const api={register,get,resolve,bind,list:()=>[...presets.values()]};
  if(typeof module!=='undefined')module.exports=api;root.AlkkagiCharacters=api;
})(typeof globalThis!=='undefined'?globalThis:this);
