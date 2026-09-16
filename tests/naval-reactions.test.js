'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../web/characters'),R=require('../web/naval-reactions');
const catalog=require('../web/character-dialogue');
test('every character displays each naval outcome through the shared catalog and actual renderer',()=>{
  const cases=[{result:'hit'},{result:'sunk'},{result:'miss',sonar:true},{result:'miss',sonar:false}];
  for(const preset of catalog.presets)for(const actor of [0,1])for(const outcome of cases){
    const nodes={strong:{textContent:''},span:{textContent:''}},element={dataset:{},hidden:true,querySelector:key=>nodes[key]};
    let expire;
    const ui=R.install(element,{schedule:fn=>(expire=fn,1),cancel(){}});
    const state={code:'TEST',match:1,names:['<공격>','바다'],characters:[preset.id,preset.id]};
    const shot={id:1,team:actor,...outcome},[reaction]=R.resolve(state,shot);
    const type=`naval:${outcome.result==='miss'?(outcome.sonar?'sonar':'miss'):outcome.result}`;
    const role=type==='naval:miss'?'target':'actor';
    assert.ok(preset.responses[type]?.[role]?.lines.length,`${preset.id} ${type} missing`);
    assert.equal(reaction.team,role==='actor'?actor:1-actor);
    ui.show(state,shot);assert.equal(element.hidden,false);assert.equal(nodes.span.textContent,reaction.line);assert.equal(element.dataset.team,String(reaction.team));
    assert.deepEqual(R.resolve(JSON.parse(JSON.stringify(state)),shot),R.resolve(state,shot));
    expire();assert.equal(element.hidden,true);assert.equal(nodes.span.textContent,'');
  }
});
test('a new naval reaction cancels the previous expiry and reset clears its text',()=>{
  const nodes={strong:{},span:{}},element={dataset:{},querySelector:key=>nodes[key]};let id=0,cancelled=[];
  const ui=R.install(element,{schedule:()=>++id,cancel:id=>cancelled.push(id)});
  const state={code:'A',match:1,names:['A','B'],characters:['faker','kurupping']};
  ui.show(state,{id:1,team:0,result:'hit'});assert.equal(nodes.span.textContent,'잡았죠?');
  ui.show(state,{id:2,team:0,result:'miss'});assert.equal(nodes.span.textContent,'못 때리쥬? 약오르쥬!');assert.deepEqual(cancelled,[1]);
  ui.reset();assert.deepEqual(cancelled,[1,2]);assert.equal(element.hidden,true);
});

test('hit count labels accumulate with dialogue, disappear together and never appear for sonar',()=>{
  const nodes={strong:{},span:{}},element={dataset:{},querySelector:key=>nodes[key]},counts={setAttribute(){}};
  const state={code:'A',match:1,names:['A','B'],characters:['faker','naruto']};let expire;
  const ui=R.install(element,{counts,schedule:fn=>(expire=fn,1),cancel(){}});
  for(let streak=1;streak<=3;streak++){
    ui.show(state,{id:streak,team:0,result:streak===3?'sunk':'hit',streak});
    assert.equal(counts.hidden,false);assert.equal(counts.textContent,Array.from({length:streak},(_,i)=>`${i+1}타`).join(' · '));
    assert.equal(element.hidden,false);
  }
  expire();assert.equal(counts.hidden,true);assert.equal(element.hidden,true);
  ui.show(state,{id:4,team:0,result:'miss',sonar:true,streak:0});assert.equal(counts.hidden,true);assert.equal(nodes.span.textContent,'위치는 파악했습니다.');
});
