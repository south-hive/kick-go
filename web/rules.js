(function(root){
  'use strict';
  // Add future rule sets here; only released rule sets belong in this registry.
  const sets=Object.freeze({
    classic:Object.freeze({id:'classic',name:'클래식',description:'기본 타격으로 겨루는 알까기',spin:false,iron:false,guides:false,hinges:true}),
    modern:Object.freeze({id:'modern',name:'모던',description:'회전 타격 · 금강불괴 · 겁쟁이 모드',spin:true,iron:true,guides:true,hinges:true}),
  });
  function get(id='modern'){
    if(typeof id!=='string'||!Object.prototype.hasOwnProperty.call(sets,id))throw Error('INVALID_RULESET');
    return sets[id];
  }
  const guideCounts=(id,first)=>[0,1].map(team=>get(id).guides?(team===first?1:2):0);
  const initialPhase=id=>get(id).iron?'select':'aim';
  const api={sets,get,guideCounts,initialPhase};
  if(typeof module!=='undefined')module.exports=api;root.AlkkagiRules=api;
})(typeof globalThis!=='undefined'?globalThis:this);
