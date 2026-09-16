'use strict';
const { randomBytes, randomInt, timingSafeEqual } = require('node:crypto');
const P = require('./web/physics');
const L = require('./lobby-rules');
const Rules = require('./web/rules');
const Shots = require('./web/shot-engine');
const Characters = require('./web/characters');
const VERSION = 1;
const token = () => randomBytes(24).toString('hex');
const counts = stones => [0, 1].map(team => stones.filter(s => s.alive && s.team === team).length);
const equalToken = (a, b) => typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

class Room {
  constructor(code, now = Date.now(), firstPlayer = randomInt(2), ruleset = 'modern') {
    this.ruleset = Rules.get(ruleset).id; this.hooks = new Shots.Hooks(); this.playback = null; this.lastShot = null;
    this.code = code; this.players = [null, null]; this.stones = P.setup();
    this.firstPlayer = firstPlayer; this.turn = firstPlayer; this.phase = 'waiting'; this.revision = 0; this.match = 1;
    this.guideRemaining = Rules.guideCounts(this.ruleset,firstPlayer); this.guideArmed = [false,false];
    this.votes = [false, false]; this.lastActivity = now; this.shotTime = 0;
    this.shotCue = null; this.pendingShot = null;
    this.ironReady = [false, false]; this.spectators = new Set();
  }
  seat(index, socket, now = Date.now(), characterId = 'default') {
    Characters.get(characterId);
    const player = { token: token(), socket, lastSeen: now, characterId };
    this.players[index] = player; this.lastActivity = now;
    if (this.players.every(Boolean)) { this.phase = this.lobby ? 'lobby' : Rules.initialPhase(this.ruleset); this.revision++; }
    return player;
  }
  resume(secret, socket) {
    const team = this.players.findIndex(p => p && equalToken(secret, p.token));
    if (team < 0) throw Error('INVALID_SESSION');
    const player = this.players[team], previous = player.socket;
    player.socket = socket; player.lastSeen = Date.now(); this.lastActivity = Date.now();
    return { team, previous, player };
  }
  ready() { return this.players.every(p => p && p.socket && p.socket.readyState === 1); }
  selectIron(team, message) {
    if (!Rules.get(this.ruleset).iron) throw Error('RULE_DISABLED');
    if (!this.ready()) throw Error('OPPONENT_OFFLINE');
    if (this.phase !== 'select' || this.ironReady[team] || message.match !== this.match) throw Error('SELECTION_CLOSED');
    const stone = this.stones.find(s => s.id === message.stone && s.team === team && s.alive);
    if (!stone) throw Error('INVALID_SELECTION');
    stone.iron = true; this.ironReady[team] = true;
    if (this.ironReady.every(Boolean)) this.phase = 'aim';
    this.revision++; this.lastActivity = Date.now();
  }
  shot(team, message) {
    if (!this.ready()) throw Error('OPPONENT_OFFLINE');
    if (this.phase !== 'aim' || this.turn !== team || message.revision !== this.revision || message.match !== this.match) throw Error('NOT_YOUR_TURN');
    const s = this.stones.find(s => s.id === message.stone && s.alive && s.team === team);
    const { vx, vy, side, follow } = message;
    if (!s || ![vx, vy, side, follow].every(Number.isFinite) || Math.hypot(vx, vy) < 1 || Math.hypot(vx, vy) > 1360.001 || Math.hypot(side, follow) > 1.001) throw Error('INVALID_SHOT');
    const record = Shots.plan(this.stones,{stone:s.id,vx,vy,side,follow},{ruleset:this.ruleset,id:`${this.match}:${this.revision+1}`,guideName:this.guideArmed[team]?(this.players[team].name||`플레이어 ${team+1}`):null});
    this.lastShot = record;
    this.playback = new Shots.Playback(record,this.stones,event=>this.hooks.emit(event.type,event));
    this.hooks.emit('shot:prepared',record);
    if (this.guideArmed[team]) {
      this.guideRemaining[team]--; this.guideArmed[team] = false;
      this.shotCue = {...record.cue};
      this.playback.prepare();
      this.pendingShot = { stone:s.id, vx, vy, side, follow };
    } else this.playback.start();
    this.phase = 'moving'; this.revision++; this.shotTime = 0; this.lastActivity = Date.now();
  }
  armGuide(team, message) {
    if (!Rules.get(this.ruleset).guides) throw Error('RULE_DISABLED');
    if (!this.ready()) throw Error('OPPONENT_OFFLINE');
    if (this.phase !== 'aim' || this.turn !== team || message.match !== this.match || message.revision !== this.revision) throw Error('NOT_YOUR_TURN');
    if (this.guideRemaining[team] <= 0) throw Error('NO_GUIDES');
    this.guideArmed[team] = true; this.lastActivity = Date.now();
  }
  step(dt) {
    if (this.phase !== 'moving') return;
    if (this.shotCue) {
      this.shotCue.remaining = Math.max(0,this.shotCue.remaining-dt);
      if(this.shotCue.remaining>1e-9)return;
      this.playback.start();
      this.pendingShot=null;this.shotCue=null;
      return;
    }
    this.playback.advance(dt); this.shotTime += dt;
    if (this.playback.done) {
      this.phase = counts(this.stones).some(n => n === 0) ? 'over' : 'aim';
      if (this.phase === 'aim') this.turn = 1 - this.turn;
      this.revision++; this.lastActivity = Date.now();
    }
  }
  rematch(team, message) {
    if (this.phase !== 'over' || !this.ready() || message.match !== this.match) throw Error('REMATCH_UNAVAILABLE');
    this.votes[team] = true;
    if (this.votes.every(Boolean)) {
      this.firstPlayer = 1 - this.firstPlayer;
      this.stones = P.setup(); this.turn = this.firstPlayer; this.phase = Rules.initialPhase(this.ruleset); this.ironReady = [false, false];
      this.guideRemaining = Rules.guideCounts(this.ruleset,this.firstPlayer); this.guideArmed = [false,false];
      this.shotCue=null;this.pendingShot=null;this.playback=null;this.lastShot=null;
      this.match++; this.revision++; this.votes = [false, false];
    }
    this.lastActivity = Date.now();
  }
  snapshot(viewer) {
    const stones = this.stones.map(s => {
      const { iron, ironShot, ...publicStone } = s;
      return viewer === null || s.team === viewer ? { ...publicStone, iron: !!iron } : publicStone;
    });
    return { ...L.metadata(this), characters:this.players.map(p=>p?.characterId||'default'), ruleset:this.ruleset, shotPlayback:this.playback?.snapshot(viewer,this.shotCue)||null, shotCue:this.shotCue?{...this.shotCue}:null, role: viewer === null ? 'spectator' : 'player', spectators: this.spectators.size, type: 'state', version: VERSION, code: this.code, stones, ironReady: [...this.ironReady],
      firstPlayer: this.firstPlayer, guideRemaining: [...this.guideRemaining], guideArmed: [...this.guideArmed],
      turn: this.turn, phase: this.phase, revision: this.revision, match: this.match,
      connected: this.players.map(p => !!(p && p.socket && p.socket.readyState === 1)), votes: this.votes };
  }
}
module.exports = { Room, VERSION };
