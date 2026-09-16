(function(root){
  'use strict';
  const P=typeof module!=='undefined'?require('./physics'):root.Physics;
  const Rules=typeof module!=='undefined'?require('./rules'):root.AlkkagiRules;
  // Whitelist observations so neither side's private ability can reach the planner.
  const visible=stones=>stones.map(({id,team,x,y,vx,vy,alive})=>({id,team,x,y,vx,vy,alive}));
  class Belief{
    constructor(stones){
      const enemy=visible(stones).filter(s=>s.team===0&&s.alive);
      this.active=Object.fromEntries(enemy.map(s=>[s.id,1/enemy.length]));
      this.spent=enemy.length?0:1;
    }
    normalize(){
      const sum=this.spent+Object.values(this.active).reduce((a,b)=>a+b,0);
      if(!sum){this.spent=1;return;}
      this.spent/=sum;for(const id in this.active)this.active[id]/=sum;
    }
    observeShot(id,team){
      if(team!==0)return;
      this.spent+=this.active[id]||0;this.active[id]=0;
      // A small, fallible bias toward stones the opponent keeps in reserve.
      for(const key in this.active)this.active[key]*=1.06;
      this.normalize();
    }
    observeStep(beforeStones,afterStones){
      const before=visible(beforeStones),after=visible(afterStones);
      for(const target of before.filter(s=>s.team===0&&s.alive)){
        const end=after.find(s=>s.id===target.id);
        if(!end?.alive){this.spent+=this.active[target.id]||0;this.active[target.id]=0;continue;}
        if(Math.hypot(target.vx,target.vy)>.1)continue;
        for(const attacker of before.filter(s=>s.team===1&&s.alive)){
          const out=after.find(s=>s.id===attacker.id);if(!out)continue;
          const dx=target.x-attacker.x,dy=target.y-attacker.y,d=Math.hypot(dx,dy);if(!d)continue;
          const nx=dx/d,ny=dy/d,incoming=attacker.vx*nx+attacker.vy*ny;
          if(incoming<20||Math.hypot(out.x-end.x,out.y-end.y)>P.R*2+1)continue;
          const fixed=Math.hypot(end.x-target.x,end.y-target.y)<1e-6&&Math.hypot(end.vx,end.vy)<.1;
          if(fixed&&out.vx*nx+out.vy*ny< -10){
            // Stationary defender plus a reversing attacker is the visible one-use block.
            for(const id in this.active)this.active[id]=0;this.spent=1;return;
          }
          if(Math.hypot(end.vx,end.vy)>20)this.active[target.id]=0;
        }
      }
      this.normalize();
    }
    probability(id){return this.active[id]||0;}
  }
  // Conservative swept-disc visibility against the two fixed hinges.
  function clearLane(a,b,rules){
    return !(rules.hinges?P.hinges:[]).some(h=>{
      let enter=0,exit=1;
      for(const [start,delta,lo,hi] of [[a.x,b.x-a.x,h.x-P.R-2,h.x+h.w+P.R+2],[a.y,b.y-a.y,h.y-P.R-2,h.y+h.h+P.R+2]]){
        if(Math.abs(delta)<1e-9){if(start<lo||start>hi)return false;}
        else{const t1=(lo-start)/delta,t2=(hi-start)/delta;enter=Math.max(enter,Math.min(t1,t2));exit=Math.min(exit,Math.max(t1,t2));if(enter>exit)return false;}
      }
      return true;
    });
  }
  function approachCost(stone,targets,rules){
    return targets.length?Math.min(...targets.map(t=>Math.hypot(t.x-stone.x,t.y-stone.y)+(clearLane(stone,t,rules)?0:600))):0;
  }
  function outcome(board,shot,ironId=null,rules=Rules.get()){
    const sim=board.map(s=>({...s,iron:s.id===ironId})),contacts=new Set();
    const shooter=sim.find(s=>s.id===shot.id);
    P.shoot(shooter,Math.cos(shot.angle)*shot.speed,Math.sin(shot.angle)*shot.speed);
    for(let n=0;n<1300&&P.moving(sim);n++)P.step(sim,1/120,()=>{},()=>{},(a,b)=>{
      if(b&&a.team!==b.team)contacts.add(a.team===0?a.id:b.id);
    },rules);
    let value=0;
    for(const s of sim){
      const orig=board.find(v=>v.id===s.id);if(!orig.alive)continue;
      if(!s.alive)value+=s.team===0?100:-115;
      else if(s.team===0)value+=(Math.hypot(s.x-600,s.y-600)-Math.hypot(orig.x-600,orig.y-600))*.035;
    }
    if(shooter.alive){
      const original=board.find(s=>s.id===shot.id);
      const targets=board.filter(s=>s.alive&&s.team===0);
      // A quiet move is useful when it opens a firing lane for the next turn.
      if(!contacts.size)value+=Math.max(-20,Math.min(20,(approachCost(original,targets,rules)-approachCost(shooter,targets,rules))*.025));
      const edge=Math.min(shooter.x-P.EDGE,P.SIZE-P.EDGE-shooter.x,shooter.y-P.EDGE,P.SIZE-P.EDGE-shooter.y);
      value-=Math.max(0,90-edge)*.1;
    }
    return{value,contacts,survived:shooter.alive,consumed:ironId!==null&&!sim.find(s=>s.id===ironId)?.iron};
  }
  function evaluate(stones,shot,belief,rules=Rules.get()){
    const board=visible(stones),normal=outcome(board,shot,null,rules);
    let value=normal.value;
    // Hypotheses the ordinary trajectory never touches produce the same outcome.
    for(const id of (rules.iron?normal.contacts:[])){
      const probability=belief.probability(id);if(!probability)continue;
      const blocked=outcome(board,shot,id,rules);
      value+=probability*(blocked.value-normal.value);
      if(blocked.consumed&&blocked.survived)value+=probability*6;
    }
    return value;
  }
  function chooseShot(stones,belief=new Belief(stones),rng=Math.random,rules=Rules.get()){
    const board=visible(stones),targets=board.filter(s=>s.alive&&s.team===0),candidates=[];
    for(const s of board.filter(s=>s.alive&&s.team===1)){
      for(const target of targets)for(const offset of [-.14,0,.14])for(const speed of [250,480,750,1030,1330]){
        const shot={id:s.id,angle:Math.atan2(target.y-s.y,target.x-s.x)+offset,speed};
        candidates.push({...shot,value:evaluate(board,shot,belief,rules)});
      }
      if(targets.some(t=>!clearLane(s,t,rules))){
        // Include sideways and diagonal approaches, not just shots at the hidden target.
        const angles=Array.from({length:8},(_,i)=>i*Math.PI/4);
        for(const h of (rules.hinges?P.hinges:[]))for(const x of [h.x-P.R-40,h.x+h.w+P.R+40])for(const y of [h.y-P.R-40,h.y+h.h+P.R+40])angles.push(Math.atan2(y-s.y,x-s.x));
        for(const angle of angles)for(const speed of [200,350,500]){
          const shot={id:s.id,angle,speed};candidates.push({...shot,value:evaluate(board,shot,belief,rules)});
        }
      }
    }
    if(!candidates.length)return null;
    candidates.sort((a,b)=>b.value-a.value);
    const shortlist=candidates.filter(s=>s.value>=candidates[0].value-8).slice(0,6);
    const pick=shortlist[Math.floor(rng()*shortlist.length)];
    const angle=pick.angle+(rng()-.5)*2*Math.PI/180,speed=Math.min(1360,pick.speed*(.9+rng()*.2));
    // Human-like inaccuracy must not turn a safe plan into an obvious rebound suicide.
    const adjusted={id:pick.id,angle,speed};
    const chosen=evaluate(board,adjusted,belief,rules)>=pick.value-8?adjusted:pick;
    return{id:chosen.id,vx:Math.cos(chosen.angle)*chosen.speed,vy:Math.sin(chosen.angle)*chosen.speed};
  }
  const api={visible,Belief,evaluate,chooseShot};
  if(typeof module!=='undefined')module.exports=api;root.AlkkagiAI=api;
})(typeof globalThis!=='undefined'?globalThis:this);
