// Сеть: хост-клиент поверх WebRTC (PeerJS). Хост — это телефон того, кто создал комнату.
// Для отладки в одном браузере: ?local=1 — используется BroadcastChannel.
const PREFIX = 'chickblocks-v1-';
const ICE = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
];

export function makeCode() {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

class Emitter {
  constructor() { this.h = {}; }
  on(e, f) { (this.h[e] ||= []).push(f); }
  emit(e, ...a) { for (const f of this.h[e] || []) f(...a); }
}

// ---------- PeerJS ----------
class PeerHost extends Emitter {
  constructor() { super(); this.conns = new Map(); this.next = 1; }
  start(code) {
    return new Promise((resolve, reject) => {
      if (!window.Peer) return reject(new Error('PeerJS не загрузился'));
      const peer = this.peer = new window.Peer(PREFIX + code, { config: { iceServers: ICE }, debug: 0 });
      let opened = false;
      peer.on('open', () => { opened = true; resolve(code); });
      peer.on('error', (err) => {
        if (!opened) reject(err);
        else console.warn('peer error', err);
      });
      peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* ignore */ } });
      peer.on('connection', (conn) => {
        const id = this.next++;
        conn.on('open', () => { this.conns.set(id, conn); this.emit('join', id); });
        conn.on('data', (d) => this.emit('msg', id, d));
        const gone = () => { if (this.conns.has(id)) { this.conns.delete(id); this.emit('leave', id); } };
        conn.on('close', gone);
        conn.on('error', gone);
      });
    });
  }
  sendTo(id, msg) { const c = this.conns.get(id); if (c && c.open) c.send(msg); }
  broadcast(msg, except) { for (const [id, c] of this.conns) if (id !== except && c.open) c.send(msg); }
  kick(id) { const c = this.conns.get(id); if (c) c.close(); this.conns.delete(id); }
  close() { try { this.peer.destroy(); } catch (e) { /* ignore */ } }
}

class PeerClient extends Emitter {
  start(code) {
    return new Promise((resolve, reject) => {
      if (!window.Peer) return reject(new Error('PeerJS не загрузился'));
      const peer = this.peer = new window.Peer(undefined, { config: { iceServers: ICE }, debug: 0 });
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; reject(new Error('Не удалось подключиться (таймаут). Проверь код комнаты.')); } }, 20000);
      peer.on('error', (err) => {
        if (!done) { done = true; clearTimeout(timer); reject(err.type === 'peer-unavailable' ? new Error('Комната не найдена') : err); }
        else console.warn('peer error', err);
      });
      peer.on('open', () => {
        const conn = this.conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
        conn.on('open', () => { if (!done) { done = true; clearTimeout(timer); resolve(); } });
        conn.on('data', (d) => this.emit('msg', d));
        conn.on('close', () => this.emit('close'));
        conn.on('error', () => this.emit('close'));
      });
    });
  }
  send(msg) { if (this.conn && this.conn.open) this.conn.send(msg); }
  close() { try { this.peer.destroy(); } catch (e) { /* ignore */ } }
}

// ---------- BroadcastChannel (отладка в одном браузере) ----------
class LocalHost extends Emitter {
  constructor() { super(); this.conns = new Map(); this.next = 1; }
  start(code) {
    this.ch = new BroadcastChannel('cb-' + code);
    this.ch.onmessage = (e) => {
      const m = e.data;
      if (m.to !== 'host') return;
      if (m.hello) {
        const id = this.next++;
        this.conns.set(id, m.from);
        this.ch.postMessage({ to: m.from, welcome: true });
        setTimeout(() => this.emit('join', id), 0);
        return;
      }
      for (const [id, f] of this.conns) if (f === m.from) {
        if (m.bye) { this.conns.delete(id); this.emit('leave', id); }
        else this.emit('msg', id, m.d);
      }
    };
    return Promise.resolve(code);
  }
  sendTo(id, msg) { const f = this.conns.get(id); if (f) this.ch.postMessage({ to: f, d: msg }); }
  broadcast(msg, except) { for (const [id, f] of this.conns) if (id !== except) this.ch.postMessage({ to: f, d: msg }); }
  kick(id) { this.conns.delete(id); }
  close() { this.ch.close(); }
}
class LocalClient extends Emitter {
  start(code) {
    this.me = 'c' + Math.random().toString(36).slice(2);
    this.ch = new BroadcastChannel('cb-' + code);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('Комната не найдена')), 3000);
      this.ch.onmessage = (e) => {
        const m = e.data;
        if (m.to !== this.me) return;
        if (m.welcome) { clearTimeout(t); resolve(); return; }
        this.emit('msg', m.d);
      };
      this.ch.postMessage({ to: 'host', from: this.me, hello: true });
      window.addEventListener('beforeunload', () => this.ch.postMessage({ to: 'host', from: this.me, bye: true }));
    });
  }
  send(msg) { this.ch.postMessage({ to: 'host', from: this.me, d: msg }); }
  close() { this.ch.postMessage({ to: 'host', from: this.me, bye: true }); this.ch.close(); }
}

export function createHost() {
  return new URLSearchParams(location.search).has('local') ? new LocalHost() : new PeerHost();
}
export function createClient() {
  return new URLSearchParams(location.search).has('local') ? new LocalClient() : new PeerClient();
}
