'use strict';
// Reproducible AI self-play using the shipped shot planner and physics.
const fs=require('node:fs');
const P=require('../web/physics');
const AI=require('../web/ai');
const Shots=require('../web/shot-engine');
const Rules=require('../web/rules');
const games=Number(process.argv[2]||100),baseSeed=Number(process.argv[3]||20260916);
if(!Number.isInteger(games)||games<2||games%2)throw Error('Use an even positive game count per ruleset');
const rng=seed=>()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};
const view=(board,team)=>AI.visible(board).map(s=>({...s,team:s.team===team?1:0}));
const results=[];
for(const ruleset of ['classic','modern']){
  const rules=Rules.get(ruleset),records=[];
  for(let game=0;game<games;game++){
    let board=P.setup(),team=game%2,winner=null,status='turn-limit',turns=0,cappedShots=0;
    const first=team,random=[rng(baseSeed+game*2),rng(baseSeed+game*2+1)];
    if(rules.iron)for(let t=0;t<2;t++)board.filter(s=>s.team===t)[Math.floor(random[t]()*5)].iron=true;
    const ironIds=board.filter(s=>s.iron).map(s=>s.id);
    const belief=[0,1].map(t=>new AI.Belief(view(board,t)));
    for(;turns<100;){
      const shot=AI.chooseShot(view(board,team),belief[team],random[team],rules);
      if(!shot)throw Error('No shot in a live game');
      for(let t=0;t<2;t++)belief[t].observeShot(shot.id,team===t?1:0);
      const record=Shots.plan(board,{stone:shot.id,vx:shot.vx,vy:shot.vy},{ruleset});
      if(record.result.capped)cappedShots++;
      if(rules.iron)for(let i=1;i<record.frames.length;i++)for(let t=0;t<2;t++)belief[t].observeStep(view(record.frames[i-1],t),view(record.frames[i],t));
      board=record.frames.at(-1);turns++;
      if(record.result.over){winner=record.result.winner;status=winner===null?'draw':'win';break;}
      team=1-team;
    }
    records.push({game,first,ironIds,winner,status,turns,cappedShots});
    if((game+1)%10===0)console.error(`${ruleset}: ${game+1}/${games}`);
  }
  const firstWins=records.filter(r=>r.status==='win'&&r.winner===r.first).length;
  const secondWins=records.filter(r=>r.status==='win'&&r.winner!==r.first).length;
  const n=firstWins+secondWins,p=firstWins/n,z=1.96,den=1+z*z/n;
  const mid=(p+z*z/(2*n))/den,half=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den;
  const result={ruleset,games,firstWins,secondWins,draws:records.filter(r=>r.status==='draw').length,turnLimits:records.filter(r=>r.status==='turn-limit').length,
    team0Wins:records.filter(r=>r.winner===0).length,team1Wins:records.filter(r=>r.winner===1).length,
    meanTurns:records.reduce((s,r)=>s+r.turns,0)/games,maxTurns:Math.max(...records.map(r=>r.turns)),cappedShots:records.reduce((s,r)=>s+r.cappedShots,0),firstWinWilson95:[mid-half,mid+half],records};
  results.push(result);console.log(JSON.stringify({...result,records:undefined}));
}
fs.writeFileSync('docs/alkkagi-simulation.json',JSON.stringify({baseSeed,rng:'mulberry32',gamesPerRuleset:games,turnLimit:100,conditions:'Same AI both sides; alternating first team; random iron; no spin or guide usage; 120Hz observations; no character/stat differences',results},null,2)+'\n');
