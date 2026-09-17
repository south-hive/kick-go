const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../web/game'),'utf8');
const handler=source.slice(source.indexOf("canvas.addEventListener('pointerup',e=>"),source.indexOf('function cancelDrag()'));
function release({shiftKey=false,pointerType='mouse',distance=100,allowed=true,cancel=false}={}){
  let listener,shots=[],cleared=false;
  const stone={id:0},context={drag:{id:1,s:stone},MAX_SPEED:1360,
    canvas:{addEventListener:(type,fn)=>listener=fn,hasPointerCapture:()=>true,releasePointerCapture(){}},
    $:()=>({getBoundingClientRect:()=>({left:1000,right:1100,top:1000,bottom:1100})}),
    pos:()=>({x:0,y:0}),showDragValues(){},shotVector:()=>({dx:distance,dy:0,d:distance,p:.5}),
    canSetStrike:()=>allowed,cancelDrag:()=>{cleared=true;},syncAim(){},launch:(s,vx,vy)=>shots.push({s,vx,vy})};
  vm.runInNewContext(handler,context);listener({pointerId:1,shiftKey,pointerType,clientX:cancel?1050:0,clientY:cancel?1050:0});
  return {shots,cleared};
}
test('normal mouse and touch drag releases fire immediately',()=>{
  for(const pointerType of ['mouse','touch']){const r=release({pointerType});assert.equal(r.shots.length,1);assert.equal(r.shots[0].vx,680);assert.equal(r.shots[0].vy,0);}
});
test('Shift release and a tap retain numeric aiming without firing',()=>{
  assert.equal(release({shiftKey:true}).shots.length,0);
  assert.equal(release({distance:0}).shots.length,0);
  assert.equal(release({pointerType:'touch',distance:5}).shots.length,0);
});
test('cancellation and losing permission cannot fire on release',()=>{
  for(const options of [{allowed:false},{cancel:true}]){const r=release(options);assert.equal(r.shots.length,0);assert.equal(r.cleared,true);}
});
