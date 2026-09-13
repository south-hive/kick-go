(function(root){
  'use strict';
  const P=typeof module!=='undefined'?require('./physics'):root.Physics;
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
  function outcome(board,shot,ironId=null){
    const sim=board.map(s=>({...s,iron:s.id===ironId})),contacts=new Set();
    const shooter=sim.find(s=>s.id===shot.id);
    P.shoot(shooter,Math.cos(shot.angle)*shot.speed,Math.sin(shot.angle)*shot.speed);
    for(let n=0;n<1300&&P.moving(sim);n++)P.step(sim,1/120,()=>{},()=>{},(a,b)=>{
      if(b&&a.team!==b.team)contacts.add(a.team===0?a.id:b.id);
    });
    let value=0;
    for(const s of sim){
      const orig=board.find(v=>v.id===s.id);if(!orig.alive)continue;
      if(!s.alive)value+=s.team===0?100:-115;
      else if(s.team===0)value+=(Math.hypot(s.x-600,s.y-600)-Math.hypot(orig.x-600,orig.y-600))*.035;
    }
    return{value,contacts,survived:shooter.alive,consumed:ironId!==null&&!sim.find(s=>s.id===ironId)?.iron};
  }
  function evaluate(stones,shot,belief){
    const board=visible(stones),normal=outcome(board,shot);
    let value=normal.value;
    // Hypotheses the ordinary trajectory never touches produce the same outcome.
    for(const id of normal.contacts){
      const probability=belief.probability(id);if(!probability)continue;
      const blocked=outcome(board,shot,id);
      value+=probability*(blocked.value-normal.value);
      if(blocked.consumed&&blocked.survived)value+=probability*6;
    }
    return value;
  }
  function chooseShot(stones,belief=new Belief(stones),rng=Math.random){
    const board=visible(stones),targets=board.filter(s=>s.alive&&s.team===0),candidates=[];
    for(const s of board.filter(s=>s.alive&&s.team===1))for(const target of targets)for(const offset of [-.14,0,.14])for(const speed of [750,1030,1330]){
      const shot={id:s.id,angle:Math.atan2(target.y-s.y,target.x-s.x)+offset,speed};
      candidates.push({...shot,value:evaluate(board,shot,belief)});
    }
    if(!candidates.length)return null;
    candidates.sort((a,b)=>b.value-a.value);
    const pick=candidates[Math.floor(rng()*Math.min(15,candidates.length))];
    const angle=pick.angle+(rng()-.5)*2*Math.PI/180,speed=Math.min(1360,pick.speed*(.9+rng()*.2));
    return{id:pick.id,vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed};
  }
  const api={visible,Belief,evaluate,chooseShot};
  if(typeof module!=='undefined')module.exports=api;root.AlkkagiAI=api;
})(typeof globalThis!=='undefined'?globalThis:this);
