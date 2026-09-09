'use strict';
const { randomBytes, timingSafeEqual } = require('node:crypto');
const P = require('./web/physics');
const VERSION = 1;
const token = () => randomBytes(24).toString('hex');
const counts = stones => [0, 1].map(team => stones.filter(s => s.alive && s.team === team).length);
const equalToken = (a, b) => typeof a === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

class Room {
  constructor(code, now = Date.now()) {
    this.code = code; this.players = [null, null]; this.stones = P.setup();
    this.turn = 0; this.phase = 'waiting'; this.revision = 0; this.match = 1;
    this.votes = [false, false]; this.lastActivity = now; this.shotTime = 0;
  }
  seat(index, socket, now = Date.now()) {
    const player = { token: token(), socket, lastSeen: now };
    this.players[index] = player; this.lastActivity = now;
    if (this.players.every(Boolean)) { this.phase = 'aim'; this.revision++; }
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
  shot(team, message) {
    if (!this.ready()) throw Error('OPPONENT_OFFLINE');
    if (this.phase !== 'aim' || this.turn !== team || message.revision !== this.revision || message.match !== this.match) throw Error('NOT_YOUR_TURN');
    const s = this.stones.find(s => s.id === message.stone && s.alive && s.team === team);
    const { vx, vy, side, follow } = message;
    if (!s || ![vx, vy, side, follow].every(Number.isFinite) || Math.hypot(vx, vy) < 1 || Math.hypot(vx, vy) > 1360.001 || Math.hypot(side, follow) > 1.001) throw Error('INVALID_SHOT');
    P.shoot(s, vx, vy, side, follow);
    this.phase = 'moving'; this.revision++; this.shotTime = 0; this.lastActivity = Date.now();
  }
  step(dt) {
    if (this.phase !== 'moving') return;
    P.step(this.stones, dt); this.shotTime += dt;
    if (this.shotTime > 25) this.stones.forEach(s => { s.vx = 0; s.vy = 0; s.spinPower = 0; });
    if (!P.moving(this.stones)) {
      this.phase = counts(this.stones).some(n => n === 0) ? 'over' : 'aim';
      if (this.phase === 'aim') this.turn = 1 - this.turn;
      this.revision++; this.lastActivity = Date.now();
    }
  }
  rematch(team, message) {
    if (this.phase !== 'over' || !this.ready() || message.match !== this.match) throw Error('REMATCH_UNAVAILABLE');
    this.votes[team] = true;
    if (this.votes.every(Boolean)) {
      this.stones = P.setup(); this.turn = 0; this.phase = 'aim';
      this.match++; this.revision++; this.votes = [false, false];
    }
    this.lastActivity = Date.now();
  }
  snapshot() {
    return { type: 'state', version: VERSION, code: this.code, stones: this.stones,
      turn: this.turn, phase: this.phase, revision: this.revision, match: this.match,
      connected: this.players.map(p => !!(p && p.socket && p.socket.readyState === 1)), votes: this.votes };
  }
}
module.exports = { Room, VERSION };
