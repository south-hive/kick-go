'use strict';
class OnlineGame {
  constructor(onState, onChange) {
    this.onState = onState; this.onChange = onChange;
    this.socket = null; this.session = null; this.state = null; this.connected = false;
    this.active = false; this.pending = false; this.message = ''; this.retry = 0;
    this.timer = null; this.timeout = null;
  }
  endpoint() {
    const configured = window.KICK_GO_SERVER;
    if (!configured && (location.hostname.endsWith('.github.io') || location.protocol === 'file:' || location.hostname === 'game.local')) return null;
    try {
      const url = new URL(configured || location.origin);
      if (!['https:', 'http:'].includes(url.protocol) || (location.protocol === 'https:' && url.protocol !== 'https:')) return null;
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'; url.pathname = '/ws'; url.search = ''; url.hash = '';
      return url.href;
    } catch { return null; }
  }
  storage(value) { try { if (value) sessionStorage.setItem('kick-go-session', JSON.stringify(value)); else sessionStorage.removeItem('kick-go-session'); } catch {} }
  saved() { try { const s = JSON.parse(sessionStorage.getItem('kick-go-session')); return s?.endpoint === this.endpoint() && typeof s.code === 'string' && typeof s.token === 'string' ? s : null; } catch { return null; } }
  change(text) { if (text !== undefined) this.message = text; this.onChange(); }
  begin(action, code) {
    this.stop(false); this.storage(null); this.state = null; this.session = null; this.pending = false; this.retry = 0;
    if (!this.endpoint()) { this.change('온라인 대전 서버 연결을 준비 중입니다. 지금은 혼자 하기와 한 기기 둘이 하기를 이용해 주세요.'); return; }
    this.active = true; this.action = { type: action, code }; this.connect();
  }
  restore(session) {
    this.stop(false); this.state = null; this.session = session; this.active = true; this.retry = 0; this.action = { type: 'resume', code: session.code, token: session.token }; this.connect();
  }
  connect() {
    if (!this.active) return;
    clearTimeout(this.timer); clearTimeout(this.timeout);
    this.connected = false; this.change(this.retry ? '연결이 끊겼습니다. 같은 자리로 재접속 중…' : '대전 서버에 연결 중…');
    const ws = new WebSocket(this.endpoint()); this.socket = ws;
    this.timeout = setTimeout(() => { if (this.socket === ws && !this.connected) { this.change('서버 응답을 기다리는 중입니다. 처음 접속은 조금 걸릴 수 있어요.'); ws.close(); } }, 20000);
    ws.onopen = () => {
      if (ws !== this.socket) return;
      const action = this.session ? { type: 'resume', code: this.session.code, token: this.session.token } : this.action;
      ws.send(JSON.stringify({ ...action, version: 1 }));
    };
    ws.onmessage = event => {
      if (ws !== this.socket) return;
      let m; try { m = JSON.parse(event.data); } catch { return; }
      if (m.type === 'joined') {
        clearTimeout(this.timeout); this.retry = 0; this.connected = true; this.pending = false;
        this.session = { endpoint: this.endpoint(), code: m.code, token: m.token, team: m.team }; this.storage(this.session);
        this.change('');
      } else if (m.type === 'state') {
        if (m.version !== 1 || !this.session || m.code !== this.session.code) return;
        this.state = m; this.pending = false; this.onState(m); this.change('');
      } else if (m.type === 'error') {
        this.pending = false;
        const errors = { ROOM_NOT_FOUND: '방이 없거나 만료됐습니다. 새 초대 링크를 받아 주세요.', ROOM_FULL: '이미 두 명이 입장한 방입니다.', INVALID_SESSION: '이전 경기를 복구할 수 없습니다. 새 방을 만들어 주세요.', NOT_YOUR_TURN: '차례가 바뀌었습니다. 현재 판을 확인해 주세요.', OPPONENT_OFFLINE: '상대가 돌아오면 계속할 수 있습니다.', INVALID_SHOT: '발사 정보를 확인할 수 없습니다. 다시 조준해 주세요.', VERSION_MISMATCH: '게임이 업데이트됐습니다. 새로고침해 주세요.', SERVER_FULL: '대전 방이 가득 찼습니다. 잠시 후 다시 시도해 주세요.', REMATCH_UNAVAILABLE: '경기가 끝나고 두 사람이 연결되면 재대결할 수 있습니다.' };
        if (!this.connected || ['ROOM_NOT_FOUND', 'INVALID_SESSION', 'VERSION_MISMATCH'].includes(m.code)) { this.stop(false); this.storage(null); this.session = null; }
        this.change(errors[m.code] || '요청을 처리하지 못했습니다. 다시 시도해 주세요.');
      } else if (m.type === 'ended') {
        this.stop(false); this.session = null; this.state = null; this.storage(null);
        this.change(m.reason === 'REPLACED' ? '다른 창에서 접속하여 이 창의 대전이 종료됐습니다.' : m.reason === 'EXPIRED' ? '오래 비어 있던 방이 만료됐습니다.' : '플레이어가 방을 나가 경기가 종료됐습니다.');
      }
    };
    ws.onerror = () => {};
    ws.onclose = () => {
      if (ws !== this.socket || !this.active) return;
      clearTimeout(this.timeout); this.connected = false; this.pending = false; this.retry++;
      if (this.retry > 8) { this.active = false; this.change('연결하지 못했습니다. 네트워크를 확인하고 재접속을 눌러 주세요.'); return; }
      this.change('연결이 끊겼습니다. 재접속 중…');
      this.timer = setTimeout(() => this.connect(), Math.min(1000 * 2 ** (this.retry - 1), 10000));
    };
  }
  canShoot() { return this.connected && !this.pending && this.state?.phase === 'aim' && this.state.turn === this.session?.team && this.state.connected.every(Boolean); }
  send(message) { if (this.socket?.readyState !== WebSocket.OPEN) return false; this.socket.send(JSON.stringify({ version: 1, ...message })); return true; }
  shoot(stone, vx, vy, side, follow) {
    if (!this.canShoot()) return;
    this.pending = true;
    if (!this.send({ type: 'shot', stone, vx, vy, side, follow, revision: this.state.revision, match: this.state.match })) this.pending = false;
    this.change('');
  }
  rematch() { if (this.connected && this.state?.phase === 'over') this.send({ type: 'rematch', match: this.state.match }); }
  stop(leave = true) {
    if (leave) { this.send({ type: 'leave' }); this.storage(null); this.session = null; this.state = null; }
    this.active = false; this.connected = false; this.pending = false;
    clearTimeout(this.timer); clearTimeout(this.timeout);
    const ws = this.socket; this.socket = null; if (ws) ws.close();
  }
  text() {
    if (this.message) return this.message;
    if (!this.connected || !this.state) return '방을 만들거나 초대 코드를 입력하세요.';
    if (this.state.phase === 'waiting') return '초대 링크를 보내 주세요 · 상대 입장 대기 중';
    if (!this.state.connected.every(Boolean)) return '상대 연결이 끊겼습니다 · 재접속 대기 중';
    if (this.state.phase === 'moving' || this.pending) return '돌이 멈출 때까지 기다려 주세요';
    if (this.state.phase === 'over') return this.state.votes[this.session.team] ? '상대의 재대결 동의를 기다리고 있어요' : '경기 종료 · 둘 다 재대결을 누르면 새 판 시작';
    return this.state.turn === this.session.team ? '내 차례 · 돌을 당겨 조준하세요' : '상대 차례 · 다음 수를 기다려 주세요';
  }
}
window.OnlineGame = OnlineGame;
