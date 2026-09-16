const P=require('../web/physics'),AI=require('../web/ai'),Shots=require('../web/shot-engine'),Rules=require('../web/rules');
const rng=seed=>()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
const view=(b,t)=>AI.visible(b).map(s=>({...s,team:s.team===t?1:0}));
for(const ruleset of ['classic','modern']){
 const rows=[];
 for(let g=0;g<40;g++){
  const b=P.setup(),t=g%2,random=[rng(20260916+g*2),rng(20260917+g*2)];
  if(ruleset==='modern')for(let i=0;i<2;i++)b.filter(s=>s.team===i)[Math.floor(random[i]()*5)].iron=true;
  const v=view(b,t),s=AI.chooseShot(v,new AI.Belief(v),random[t],Rules.get(ruleset));
  const r=Shots.plan(b,{stone:s.id,vx:s.vx,vy:s.vy},{ruleset});
  rows.push({enemy:r.result.enemyRemoved,own:r.result.ownRemoved,block:r.events.filter(e=>e.type==='iron:hit').length,shatter:r.events.filter(e=>e.type==='iron:clash').length,shooter:s.id%5});
 }
 console.log(JSON.stringify({ruleset,n:rows.length,enemyAverage:rows.reduce((s,r)=>s+r.enemy,0)/40,ownAverage:rows.reduce((s,r)=>s+r.own,0)/40,multi:rows.filter(r=>r.enemy>=2).length,blocks:rows.filter(r=>r.block).length,shatters:rows.filter(r=>r.shatter).length,shooterCounts:[0,1,2,3,4].map(i=>rows.filter(r=>r.shooter===i).length),outcomes:rows.reduce((a,r)=>(a[`${r.enemy}:${r.own}`]=(a[`${r.enemy}:${r.own}`]||0)+1,a),{})}));
}
