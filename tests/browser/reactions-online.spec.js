const {test,expect}=require('@playwright/test');
const {once}=require('node:events');
const {createGameServer}=require('../../server');
test('host and guest see the same character reactions on opposite board sides',async({browser})=>{
  const game=createGameServer({automatic:false,firstPlayer:0});game.server.listen(0,'127.0.0.1');await once(game.server,'listening');
  const baseURL=`http://127.0.0.1:${game.server.address().port}`;
  const contexts=await Promise.all([0,1,2].map(()=>browser.newContext({baseURL,viewport:{width:393,height:852}})));
  const [host,guest,watch]=await Promise.all(contexts.map(c=>c.newPage()));const errors=[];
  for(const p of [host,guest,watch])p.on('pageerror',e=>errors.push(e.message));
  try{
    await host.goto('/alkkagi.html');await host.evaluate(()=>{setMode('online');net.begin('create',undefined,{characterId:'kurupping'});});
    await expect.poll(()=>host.evaluate(()=>net.session?.code)).toBeTruthy();const code=await host.evaluate(()=>net.session.code);
    await guest.goto('/alkkagi.html');await guest.evaluate(code=>{setMode('online');net.begin('join',code,{characterId:'naruto'});},code);
    await expect.poll(()=>guest.evaluate(()=>net.state?.phase)).toBe('select');const room=game.rooms.get(code);
    await watch.goto('/alkkagi.html');await watch.evaluate(code=>{setMode('online');net.begin('watch',code);},code);
    await expect.poll(()=>watch.evaluate(()=>net.session?.role)).toBe('spectator');
    function setup(stones,turn=0){room.stones=stones;room.turn=turn;room.phase='aim';room.playback=null;room.lastShot=null;room.revision++;game.broadcast(room);}
    const stone=(id,team,x,iron=false)=>({id,team,x,y:400,vx:0,vy:0,alive:true,iron});
    async function play(){room.shot(room.turn,{stone:room.turn*5,vx:room.turn? -100:100,vy:0,side:0,follow:0,revision:room.revision,match:room.match});for(let i=0;i<15;i++)room.step(1/120);game.broadcast(room);}
    setup([stone(0,0,400),stone(5,1,437,true)]);
    await expect.poll(()=>host.evaluate(()=>net.state.phase)).toBe('aim');await play();
    for(const p of [host,guest])await expect(p.locator('#character-reaction-0')).toContainText('이건 몰랐쥬!');
    await expect(host.locator('#character-reaction-0')).toHaveAttribute('data-position','bottom');await expect(guest.locator('#character-reaction-0')).toHaveAttribute('data-position','top');
    setup([stone(0,0,400,true),stone(5,1,437,true)],1);await expect.poll(()=>guest.evaluate(()=>net.state.phase)).toBe('aim');await play();
    for(const p of [host,guest])await expect(p.locator('#shot-highlight')).toHaveText('이거 보여주려고 어그로 끌었다!');
    await expect(host.locator('#shot-highlight')).toHaveAttribute('data-position','top');await expect(guest.locator('#shot-highlight')).toHaveAttribute('data-position','bottom');
    setup([stone(0,0,1105),stone(5,1,400)]);await expect.poll(()=>host.evaluate(()=>net.state.phase)).toBe('aim');await play();
    for(const p of [host,guest])await expect(p.locator('#character-reaction-1')).toContainText('승부는 여기라니깐!');
    for(const p of [host,guest]){await p.setViewportSize({width:393,height:600});await p.evaluate(()=>{shotEffects.reset();scrollTo(0,0);});}
    setup([[0,0,930,400],[5,1,1072,347],[6,1,1038,427],[7,1,1083,442]].map(([id,team,x,y])=>({...stone(id,team,x),y})));
    await expect.poll(()=>host.evaluate(()=>net.state.phase)).toBe('aim');
    await host.evaluate(()=>launch(stones.find(s=>s.id===0),1360,0));
    await expect.poll(()=>room.phase).toBe('moving');
    for(let i=0;i<200;i++)room.step(1/120);game.broadcast(room);
    for(const p of [host,guest,watch]){
      await expect(p.locator('#shot-combo')).toHaveText('1타2타3타');
      await expect(p.locator('#shot-combo')).toBeInViewport({ratio:.95});
    }
    expect(errors).toEqual([]);
  }finally{await Promise.all(contexts.map(c=>c.close()));await game.close();}
});
