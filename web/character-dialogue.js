(function(root){
  'use strict';
  // Single source for dialogue and event presentation. Numeric combo chips remain a shared HUD.
  const events={
    'naval:hit':{label:'배틀십 명중'},
    'naval:sunk':{label:'배틀십 격침'},
    'naval:sonar':{label:'배틀십 소나 탐지'},
    'naval:miss':{label:'배틀십 빗나감'},
    'guide:used':{label:'겁쟁이 사용'},
    'shot:clean-miss':{label:'상대의 무충돌 자멸'},
    'shot:knockout':{label:'상대 돌 아웃'},
    'shot:combo-hit':{label:'다중 아웃',presentation:'latest'},
    'shot:multi-knockout':{label:'샷 종료 요약'},
    'iron:hit':{label:'금강불괴 방어'},
    'iron:clash':{label:'파쇄'},
  };
  const presets=[];
  // The basic character; other presets inherit events they do not override.
  presets.push({id:'default',name:'기본 캐릭터',responses:{
    'naval:hit':{actor:{lines:['명중!'],effects:[],duration:1800}},
    'naval:sunk':{actor:{lines:['격침!'],effects:[],duration:1800}},
    'naval:sonar':{actor:{lines:['주변에 함선이 있습니다.'],effects:[],duration:1800}},
    'naval:miss':{target:{lines:['집중하세요.'],effects:[],duration:1800}},
    'guide:used':{actor:{lines:['겁쟁이 녀석!'],effects:[{type:'guide-cue'}]}},
    'shot:clean-miss':{target:{lines:['집중하세요.'],effects:[]}},
    'shot:combo-hit':{actor:{lines:['{count}타'],presentation:'silent',effects:[],duration:650}},
    'shot:multi-knockout':{},
    'iron:hit':{actor:{lines:['금강불괴에 막혔어요'],effects:[{type:'ring',color:'#7cf4d8'}]}},
    'iron:clash':{actor:{lines:['파쇄!'],effects:[{type:'shout'},{type:'ring',color:'#ffd16d'}],duration:900}},
  }});
  // Game dialogue and the user-requested meme line, not anime quotations.
  // Research and event mapping: docs/character-dialogue.md.
  presets.push({id:'naruto',name:'나루토',responses:{
    'naval:hit':{actor:{lines:['좋았어! 이 기세로 간다니깐!'],effects:[],duration:1800}},
    'naval:sunk':{actor:{lines:['이거 보여주려고 어그로 끌었다!'],effects:[],duration:1800}},
    'naval:sonar':{actor:{lines:['거기 숨어 있었구나!'],effects:[],duration:1800}},
    'naval:miss':{target:{lines:['어딜 보는 거야! 승부는 여기라니깐!'],effects:[],duration:1800}},
    'guide:used':{actor:{lines:['좋아, 이번엔 똑바로 노린다니깐!'],effects:[{type:'guide-cue'}]}},
    'shot:clean-miss':{target:{lines:['어딜 보는 거야! 승부는 여기라니깐!'],effects:[]}},
    'shot:combo-hit':{actor:{lines:['{count}타'],presentation:'silent',effects:[],duration:650}},
    'shot:multi-knockout':{},
    'shot:knockout':{actor:{lines:['좋았어! 이 기세로 간다니깐!'],effects:[]}},
    'iron:hit':{actor:{lines:['으악, 단단하잖아! 다음엔 뚫는다니깐!'],effects:[{type:'ring',color:'#ff9c42'}]}},
    'iron:clash':{actor:{lines:['이거 보여주려고 어그로 끌었다!'],effects:[{type:'shout'},{type:'ring',color:'#69cfff'}],duration:1800}},
  }});
  // Playful meme persona requested by the user; original situation-specific dialogue.
  presets.push({id:'kurupping',name:'쿠루삥삥',responses:{
    'naval:hit':{actor:{lines:['맞았쥬? 아프쥬!'],effects:[],duration:1800}},
    'naval:sunk':{actor:{lines:['하나 가라앉았쥬? 쿠쿠루삥뽕!'],effects:[],duration:1800}},
    'naval:sonar':{actor:{lines:['거기 있쥬? 다 들켰쥬!'],effects:[],duration:1800}},
    'naval:miss':{target:{lines:['못 때리쥬? 약오르쥬!'],effects:[],duration:1800}},
    'guide:used':{actor:{lines:['겁쟁이 아니쥬? 신중한 거쥬!'],effects:[{type:'guide-cue'}]}},
    'shot:clean-miss':{target:{lines:['못 때리쥬? 약오르쥬!'],effects:[]}},
    'shot:combo-hit':{actor:{countLines:['하나 나갔쥬?','또 나갔쥬?','계속 나가쥬? 약오르쥬!','아직도 나가쥬? 쿠쿠루삥뽕!'],effects:[{type:'shout'}],duration:1100}},
    'shot:multi-knockout':{},
    'shot:knockout':{actor:{lines:['하나 나갔쥬? 쿠쿠루삥뽕!'],effects:[]}},
    'iron:hit':{
      actor:{lines:['앗, 금강불괴였쥬? 이건 몰랐쥬!'],effects:[{type:'ring',color:'#da9bff'}]},
      target:{lines:['못 뚫쥬? 단단하쥬!'],effects:[]},
    },
    'iron:clash':{actor:{lines:['금강불괴도 튕기쥬?'],effects:[{type:'shout'},{type:'ring',color:'#da9bff'}],duration:900}},
  }});
  // Researched meme phrases plus original game dialogue; no stat differences.
  presets.push({id:'faker',name:'페이커',responses:{
    'naval:hit':{actor:{lines:['잡았죠?'],effects:[],duration:1800}},
    'naval:sunk':{actor:{lines:['불 좀 꺼줄래?'],effects:[],duration:1800}},
    'naval:sonar':{actor:{lines:['위치는 파악했습니다.'],effects:[],duration:1800}},
    'naval:miss':{target:{lines:['{actor} 선수, 증명하세요.'],effects:[],duration:1800}},
    'guide:used':{actor:{lines:['불 좀 꺼줄래?'],effects:[{type:'guide-cue'}]}},
    'shot:clean-miss':{target:{lines:['{actor} 선수, 증명하세요.'],effects:[]}},
    'shot:knockout':{actor:{lines:['잡았죠?'],effects:[]}},
    'shot:combo-hit':{actor:{countLines:['잡았죠?','이 판은 제가 지배합니다.','승부는 이미 기울었습니다.','전설은 멈추지 않습니다.','불사대마왕 강림!'],effects:[{type:'shout'}],duration:1100}},
    'shot:multi-knockout':{},
    'iron:hit':{
      actor:{lines:['버근가?'],effects:[{type:'ring',color:'#ff6262'}]},
      target:{lines:['여기까지입니다.'],effects:[]},
    },
    'iron:clash':{actor:{lines:['불 좀 꺼줄래?'],effects:[{type:'shout'},{type:'ring',color:'#ff6262'}],duration:1100}},
  }});
  const catalog={events,presets};
  if(typeof module!=='undefined')module.exports=catalog;root.AlkkagiDialogue=catalog;
})(typeof globalThis!=='undefined'?globalThis:this);
