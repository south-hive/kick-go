(function(root){
  'use strict';
  const SIZE=1200, EDGE=86, R=18;
  const RESTITUTION=.75, FRICTION=135, SLOW_SPEED=300, EXTRA_FRICTION=135;
  const hinges=[{x:214.5,y:584,w:111,h:32},{x:874.5,y:584,w:111,h:32}];
  // Arcade spin: preserve the launch frame, then release stored rotation on stone impact.
  function shoot(s,vx,vy,side=0,follow=0){
    const speed=Math.hypot(vx,vy),length=Math.max(1,Math.hypot(side,follow));
    s.vx=vx;s.vy=vy;s.spinSide=side/length;s.spinFollow=follow/length;
    s.shotX=speed?vx/speed:0;s.shotY=speed?vy/speed:0;s.spinPower=speed;
  }
  function releaseSpin(s,impact){
    if(!s.spinPower||impact<20)return;
    const amount=Math.min(s.spinPower,impact)*.62;
    s.vx+=amount*(s.shotX*s.spinFollow-s.shotY*s.spinSide);
    s.vy+=amount*(s.shotY*s.spinFollow+s.shotX*s.spinSide);
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
  function step(stones,dt,onHit=()=>{},onFall=()=>{}){
    for(const s of stones){if(!s.alive)continue;s.x+=s.vx*dt;s.y+=s.vy*dt;
      if(s.x<EDGE||s.x>SIZE-EDGE||s.y<EDGE||s.y>SIZE-EDGE){s.alive=false;onFall(s);continue;}
      for(const h of hinges)if(hitRect(s,h))onHit(s,Math.hypot(s.vx,s.vy));
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
      a.x-=nx*overlap;a.y-=ny*overlap;b.x+=nx*overlap;b.y+=ny*overlap;
      const v=(b.vx-a.vx)*nx+(b.vy-a.vy)*ny;if(v<0){const impulse=-v*(1+RESTITUTION)/2;a.vx-=impulse*nx;a.vy-=impulse*ny;b.vx+=impulse*nx;b.vy+=impulse*ny;releaseSpin(a,-v);releaseSpin(b,-v);onHit(a,-v);}
    }
  }
  const moving=stones=>stones.some(s=>s.alive&&Math.hypot(s.vx,s.vy)>.1);
  const api={SIZE,EDGE,R,hinges,setup,step,moving,shoot};
  if(typeof module!=='undefined')module.exports=api;root.Physics=api;
})(typeof globalThis!=='undefined'?globalThis:this);
