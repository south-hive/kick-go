(function(root){
  'use strict';
  const MAX_SPEED=1360;
  function velocity(angle,power,flipped=false){
    if(typeof angle!=='number'||typeof power!=='number'||!Number.isFinite(angle)||!Number.isFinite(power)||angle<0||angle>360||power<0.1||power>100)return null;
    const a=(angle%360)*Math.PI/180,speed=power/100*MAX_SPEED,sign=flipped?-1:1;
    return {vx:Math.sin(a)*speed*sign,vy:-Math.cos(a)*speed*sign};
  }
  function angle(vx,vy,flipped=false){const sign=flipped?-1:1;return (Math.atan2(vx*sign,-vy*sign)*180/Math.PI+360)%360;}
  const api={velocity,angle};if(typeof module!=='undefined')module.exports=api;root.AlkkagiAim=api;
})(typeof globalThis!=='undefined'?globalThis:this);
