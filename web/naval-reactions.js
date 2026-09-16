(function(root){
  'use strict';
  const Characters=typeof module!=='undefined'?require('./characters'):root.GameCharacters;
  function resolve(state,shot){
    const kind=shot.result==='miss'?(shot.sonar?'sonar':'miss'):shot.result;
    return Characters.resolve({id:`${state.code}:${state.match}:${shot.id}`,type:`naval:${kind}`,actorTeam:shot.team,targetTeam:1-shot.team,count:shot.streak||1},
      state.names.map((name,team)=>({name,characterId:state.characters?.[team]||'default'})));
  }
  function install(element,{schedule=setTimeout,cancel=clearTimeout,counts=null}={}){
    let timer=null;
    function reset(){if(timer!==null)cancel(timer);timer=null;element.hidden=true;element.querySelector('strong').textContent='';element.querySelector('span').textContent='';if(counts){counts.hidden=true;counts.textContent='';}}
    return {reset,show(state,shot){
      reset();const reaction=resolve(state,shot).find(r=>r.line&&r.presentation!=='silent');if(!reaction)return;
      element.dataset.event=reaction.eventType;element.dataset.team=String(reaction.team);
      element.querySelector('strong').textContent=`${reaction.name} · ${Characters.get(reaction.characterId).name}`;
      element.querySelector('span').textContent=reaction.line;element.hidden=false;
      if(counts&&['hit','sunk'].includes(shot.result)&&Number.isInteger(shot.streak)&&shot.streak>0){
        counts.textContent=Array.from({length:Math.min(17,shot.streak)},(_,i)=>`${i+1}타`).join(' · ');counts.hidden=false;
        counts.setAttribute('aria-label',`${state.names[shot.team]} ${shot.streak}회 연속 명중`);
      }
      timer=schedule(reset,reaction.duration);
    }};
  }
  const api={resolve,install};if(typeof module!=='undefined')module.exports=api;root.NavalReactions=api;
})(typeof globalThis!=='undefined'?globalThis:this);
