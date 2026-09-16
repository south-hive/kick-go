(function(root){
  'use strict';
  // Presentation consumes reactions and semantic events, never board state or physics.
  function install(hooks,{impact,fall,cueTone=()=>{},flipped=()=>false}){
    const $=id=>root.document.getElementById(id),rings=[],queues=[[],[]],highlights=[];
    let cueKey=null,pausedAt=null,highlightKey=null;
    const now=()=>pausedAt??performance.now();
    function hideCue(){$('shot-cue').hidden=true;cueKey=null;}
    function guideCue(reaction){
      const event=reaction.event;if(event.remaining<=0)return;
      const el=$('shot-cue'),key=event.cueId||event.id;if(cueKey===key)return;
      cueKey=key;$('shot-cue-name').textContent=(event.name||reaction.name)+',';
      $('shot-cue-line').textContent=reaction.line;el.hidden=false;
      for(const node of [el,el.firstElementChild]){
        node.style.animation='none';void node.offsetWidth;node.style.animation='';
        node.style.animationDelay=`-${Math.max(0,event.duration-event.remaining)}s`;
        node.style.animationPlayState=pausedAt===null?'running':'paused';
      }
      if(!reaction.resumed)cueTone();
    }
    function highlight(reaction,style){
      if(highlights.length<16)highlights.push({...reaction,style,start:highlights.length?null:now()});
    }
    const effects=new Map([
      ['ring',(reaction,effect)=>{const event=reaction.event;if(Number.isFinite(event.x)&&Number.isFinite(event.y))rings.push({x:event.x,y:event.y,start:now(),strong:true,color:effect.color||'#ffe4a0'});}],
      ['caption',reaction=>highlight(reaction,'caption')],
      ['shout',reaction=>highlight(reaction,'shout')],
      ['guide-cue',guideCue],
    ]);
    function react(reaction){
      // Reconnect restores the current guide card, not past speech/sounds/particles.
      const selected=reaction.resumed?reaction.effects.filter(effect=>effect.type==='guide-cue'):reaction.effects;
      if(!reaction.resumed&&reaction.line&&!selected.some(effect=>['caption','shout','guide-cue'].includes(effect.type))){
        const queue=queues[reaction.team];if(queue.length<8)queue.push({...reaction,start:queue.length?null:now()});
      }
      for(const effect of selected)try{effects.get(effect.type)?.(reaction,effect);}catch(error){hooks.emit('effect:error',{error,effect:effect.type});}
    }
    function reset(){rings.length=0;queues.forEach(queue=>queue.length=0);highlights.length=0;highlightKey=null;hideCue();for(const team of [0,1])$('character-reaction-'+team).hidden=true;$('shot-highlight').hidden=true;}
    const subscriptions=[
      hooks.on('impact',event=>{impact(event);rings.push({x:event.x,y:event.y,start:now(),strong:event.speed>500});}),
      hooks.on('stone:fall',fall),
      hooks.on('character:reaction',react),
      hooks.on('shot:start',hideCue),
      hooks.on('shot:resume',state=>{if(!state.cue)hideCue();}),
      hooks.on('match:start',reset),
      hooks.on('session:ended',reset),
    ];
    return {
      registerEffect(type,handler){const previous=effects.get(type);effects.set(type,handler);return()=>{if(previous)effects.set(type,previous);else effects.delete(type);};},
      pause(paused){
        if(paused&&pausedAt===null)pausedAt=performance.now();
        else if(!paused&&pausedAt!==null){const elapsed=performance.now()-pausedAt;rings.forEach(r=>r.start+=elapsed);if(highlights[0])highlights[0].start+=elapsed;for(const queue of queues)if(queue[0]&&queue[0].start!==null)queue[0].start+=elapsed;pausedAt=null;}
        for(const node of [$('shot-cue'),$('shot-cue').firstElementChild,$('shot-highlight')])node.style.animationPlayState=paused?'paused':'running';
      },
      draw(ctx,time){
        time=pausedAt??time;
        const reduced=root.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        for(let i=rings.length-1;i>=0;i--){const r=rings[i],age=(time-r.start)/300;if(age>=1){rings.splice(i,1);continue;}if(reduced)continue;
          ctx.save();ctx.globalAlpha=1-age;ctx.strokeStyle=r.color||(r.strong?'#ffe4a0':'#fff4d1');ctx.lineWidth=r.strong?4:2;ctx.beginPath();ctx.arc(r.x,r.y,20+age*38,0,Math.PI*2);ctx.stroke();ctx.restore();
        }
        for(const team of [0,1]){
          const queue=queues[team];if(queue[0]&&time-queue[0].start>=queue[0].duration){queue.shift();if(queue[0])queue[0].start=time;}
          const el=$('character-reaction-'+team),current=queue[0];el.hidden=!current;
          el.dataset.position=(flipped()?team===1:team===0)?'bottom':'top';
          if(current){el.querySelector('strong').textContent=current.name;el.querySelector('span').textContent=current.line;}
        }
        if(highlights[0]&&time-highlights[0].start>=highlights[0].duration){highlights.shift();if(highlights[0])highlights[0].start=time;}
        const current=highlights[0],el=$('shot-highlight');el.hidden=!current;
        if(current&&highlightKey!==current.id){
          highlightKey=current.id;el.textContent=current.line;el.dataset.speaker=current.name;el.dataset.style=current.style;
          el.setAttribute('aria-label',`${current.name}: ${current.line}`);
          el.style.animation='none';void el.offsetWidth;el.style.animation='';
          el.style.animationPlayState=pausedAt===null?'running':'paused';
        }
        if(!current)highlightKey=null;
      },
      reset,
      dispose(){subscriptions.forEach(off=>off());reset();},
    };
  }
  root.AlkkagiPresentation={install};
})(typeof globalThis!=='undefined'?globalThis:this);
