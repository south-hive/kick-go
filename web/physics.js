(function(root){
  'use strict';
  const SIZE=1200, EDGE=86, R=18;
  // Equal-mass elastic impacts transfer all normal velocity; board friction handles slowing.
  const RESTITUTION=1, FRICTION=135, SLOW_SPEED=300, EXTRA_FRICTION=135;
  const hinges=[{x:214.5,y:584,w:111,h:32},{x:874.5,y:584,w:111,h:32}];
  // Arcade spin: preserve the launch frame, then release stored rotation on stone impact.
  function shoot(s,vx,vy,side=0,follow=0){
    s.iron=false;
    const speed=Math.hypot(vx,vy),length=Math.max(1,Math.hypot(side,follow));
    s.vx=vx;s.vy=vy;s.spinSide=side/length;s.spinFollow=follow/length;
    s.shotX=speed?vx/speed:0;s.shotY=speed?vy/speed:0;s.spinPower=speed;
  }
  function releaseSpin(s,impact){
    if(!s.spinPower||impact<20)return;
    const amount=Math.min(s.spinPower,impact);
    const follow=amount*.40*s.spinFollow,side=amount*.62*s.spinSide;
    s.vx+=s.shotX*follow-s.shotY*side;
    s.vy+=s.shotY*follow+s.shotX*side;
    s.spinPower=0;s.spinSide=0;s.spinFollow=0;
  }
  function setup(){return [0,1].flatMap(team=>Array.from({length:5},(_,i)=>({id:team*5+i,team,x:256+i*172,y:team===0?[984,804,924,804,984][i]:1200-[984,804,924,804,984][i],vx:0,vy:0,alive:true})));}
  function hitRect(s,h){
    const x=Math.max(h.x,Math.min(s.x,h.x+h.w)),y=Math.max(h.y,Math.min(s.y,h.y+h.h));
    let dx=s.x-x,dy=s.y-y,d=Math.hypot(dx,dy),nx,ny,depth;
    if(d>=R)return false;
    if(d>0){nx=dx/d;ny=dy/d;depth=R-d;}
    else{const sides=[{d:s.x-h.x,nx:-1,ny:0},{d:h.x+h.w-s.x,nx:1,ny:0},{d:s.y-h.y,nx:0,ny:-1},{d:h.y+h.h-s.y,nx:0,ny:1}].sort((a,b)=>a.d-b.d);nx=sides[0].nx;ny=sides[0].ny;depth=R+sides[0].d;}
    s.x+=nx*depth;s.y+=ny*depth;const v=s.vx*nx+s.vy*ny;
    if(v<0){s.vx-=1.74*v*nx;s.vy-=1.74*v*ny;}return v<-15;
  }
  function step(stones,dt,onHit=()=>{},onFall=()=>{},onCollision=()=>{}){
    for(const s of stones){if(!s.alive)continue;s.x+=s.vx*dt;s.y+=s.vy*dt;
      if(s.x<EDGE||s.x>SIZE-EDGE||s.y<EDGE||s.y>SIZE-EDGE){s.alive=false;onFall(s);continue;}
      for(const h of hinges)if(hitRect(s,h)){onHit(s,Math.hypot(s.vx,s.vy));onCollision(s,null);}
      // Keep fast chain shots lively; smoothly brake the slow glide afterward.
      const speed=Math.hypot(s.vx,s.vy);
      const friction=FRICTION+EXTRA_FRICTION*Math.max(0,1-speed/SLOW_SPEED);
      const next=Math.max(0,speed-friction*dt);
      if(speed){s.vx*=next/speed;s.vy*=next/speed;}
      if(s.spinPower){s.spinPower*=Math.exp(-.18*dt);if(next===0)s.spinPower=0;}
    }
    for(let i=0;i<stones.length;i++)for(let j=i+1;j<stones.length;j++){
      const a=stones[i],b=stones[j];if(!a.alive||!b.alive)continue;
      const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);if(d>=R*2)continue;
      const nx=d?dx/d:1,ny=d?dy/d:0,overlap=(R*2-d)/2+.01;
      const closing=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;
      if(closing<0&&a.team!==b.team&&(a.iron||b.iron)){
        const guard=a.iron?a:b,other=guard===a?b:a,sign=guard===a?1:-1;
        const gx=nx*sign,gy=ny*sign;
        guard.iron=false;guard.vx=0;guard.vy=0;
        other.x+=gx*overlap*2;other.y+=gy*overlap*2;
        const normal=other.vx*gx+other.vy*gy;
        if(normal<0){other.vx-=1.55*normal*gx;other.vy-=1.55*normal*gy;}
        other.spinPower=0;other.spinSide=0;other.spinFollow=0;
        onHit(other,-closing);onCollision(a,b);continue;
      }
      a.x-=nx*overlap;a.y-=ny*overlap;b.x+=nx*overlap;b.y+=ny*overlap;
      const v=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;if(v<0){const impulse=-v*(1+RESTITUTION)/2;a.vx-=impulse*nx;a.vy-=impulse*ny;b.vx+=impulse*nx;b.vy+=impulse*ny;releaseSpin(a,-v);releaseSpin(b,-v);onHit(a,-v);onCollision(a,b);}
    }
  }
  const moving=stones=>stones.some(s=>s.alive&&Math.hypot(s.vx,s.vy)>.1);
  function predict(stones,id,vx,vy,side=0,follow=0){
    const sim=stones.map(s=>({...s,iron:false})),shooter=sim.find(s=>s.id===id&&s.alive);
    const result={approach:[],branches:[],collision:false};
    if(!shooter)return result;
    const point=s=>({x:s.x,y:s.y});
    result.approach.push(point(shooter));shoot(shooter,vx,vy,side,follow);
    let contacts=0,after=0,participants=[];
    // Match live 120 Hz physics, but expose only the first impact and a short exit path.
    for(let tick=0;tick<1200&&moving(sim);tick++){
      step(sim,1/120,()=>{},()=>{},(a,b)=>{
        contacts++;
        if(contacts===1){participants=b?[a,b]:[a];result.collision=true;}
      });
      if(contacts>1)break;
      if(!result.branches.length){
        result.approach.push(point(shooter));
        if(contacts)result.branches=participants.map(s=>({id:s.id,team:s.team,points:[point(s)]}));
      }else{
        participants.forEach((s,i)=>result.branches[i].points.push(point(s)));
        if(++after>=24)break;
      }
    }
    return result;
  }
  const api={SIZE,EDGE,R,hinges,setup,step,moving,shoot,predict};
  if(typeof module!=='undefined')module.exports=api;root.Physics=api;
})(typeof globalThis!=='undefined'?globalThis:this);
