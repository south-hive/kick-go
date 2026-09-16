(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.NavalModel=api;})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const SIZE=10,FLEET=[{id:'carrier',name:'항공모함',length:5},{id:'battleship',name:'전함',length:4},{id:'cruiser',name:'순양함',length:3},{id:'submarine',name:'잠수함',length:3},{id:'destroyer',name:'구축함',length:2}];
  const RULESETS=Object.freeze({
    classic:Object.freeze({id:'classic',name:'클래식',sonar:false}),
    modern:Object.freeze({id:'modern',name:'모던',sonar:true}),
  });
  function rules(id='modern'){if(typeof id!=='string'||!Object.hasOwn(RULESETS,id))throw Error('INVALID_RULESET');return RULESETS[id];}
  function scanArea(cell){
    if(!Number.isInteger(cell)||cell<0||cell>=SIZE*SIZE)throw Error('INVALID_SHOT');
    const row=Math.floor(cell/SIZE),col=cell%SIZE,area=[];
    for(let y=Math.max(0,row-1);y<=Math.min(SIZE-1,row+1);y++)for(let x=Math.max(0,col-1);x<=Math.min(SIZE-1,col+1);x++)area.push(y*SIZE+x);
    return area;
  }
  function sonar(ships,cell){const area=new Set(scanArea(cell));return ships.some(ship=>cells(ship).some(c=>area.has(c)));}
  function cells(ship){const spec=FLEET.find(s=>s.id===ship?.id);if(!spec||!Number.isInteger(ship.start)||ship.start<0||ship.start>=100||typeof ship.vertical!=='boolean')return null;const row=Math.floor(ship.start/10),col=ship.start%10;if(ship.vertical?row+spec.length>10:col+spec.length>10)return null;return Array.from({length:spec.length},(_,i)=>ship.start+i*(ship.vertical?10:1));}
  function validate(ships,complete=true){if(!Array.isArray(ships)||ships.length>5||(complete&&ships.length!==5))throw Error('INVALID_FLEET');const occupied=new Set(),ids=new Set();const result=[];for(const ship of ships){const squares=cells(ship);if(!squares||ids.has(ship.id)||squares.some(c=>occupied.has(c)))throw Error('INVALID_FLEET');ids.add(ship.id);squares.forEach(c=>occupied.add(c));result.push({id:ship.id,start:ship.start,vertical:ship.vertical});}return result;}
  function place(ships,ship){return validate([...ships.filter(s=>s.id!==ship.id),ship],false);}
  function randomFleet(random=Math.random){for(let attempt=0;attempt<100;attempt++){let ships=[];for(const spec of FLEET){let placed=false;for(let i=0;i<200;i++){try{ships=place(ships,{id:spec.id,start:Math.floor(random()*100),vertical:random()<.5});placed=true;break;}catch{}}if(!placed)break;}if(ships.length===5)return ships;}throw Error('INVALID_FLEET');}
  const coordinate=cell=>`${String.fromCharCode(65+Math.floor(cell/10))}${cell%10+1}`;
  return{SIZE,FLEET,RULESETS,rules,scanArea,sonar,cells,validate,place,randomFleet,coordinate};
});
