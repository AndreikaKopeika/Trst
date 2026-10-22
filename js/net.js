// Сеть: хост-клиент. Хост — телефон того, кто создал комнату.
// Два канала: прямое соединение WebRTC (PeerJS) и запасной ретранслятор (публичный MQTT-сервер
// по WebSocket на порту 443) — он работает, когда телефоны не могут соединиться напрямую
// (мобильный интернет, разные операторы). Поверх ретранслятора — нумерация пакетов и переотправка.
// Для отладки в одном браузере: ?local=1 — используется BroadcastChannel.
import { MiniMQTT } from './mqtt.js';
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
        const id = this.alloc ? this.alloc() : this.next++;
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
  start(code, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      if (!window.Peer) return reject(new Error('PeerJS не загрузился'));
      const peer = this.peer = new window.Peer(undefined, { config: { iceServers: ICE }, debug: 0 });
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; reject(new Error('Не удалось подключиться (таймаут). Проверь код комнаты.')); } }, timeoutMs);
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

// ---------- Ретранслятор (MQTT) ----------
const BROKERS = [
  { url: 'wss://public.cloud.shiftr.io', user: 'public', pass: 'public' },
  { url: 'wss://broker.emqx.io:8084/mqtt' },
  { url: 'wss://broker.hivemq.com:8884/mqtt' },
];
const TOPIC = 'chickblocks/v2/';
const MAX_PKT = 48000;

async function connectBroker(clientId) {
  let lastErr;
  for (const b of BROKERS) {
    const m = new MiniMQTT(b.url, clientId, b.user, b.pass);
    try { await m.connect(7000); m.broker = b; return m; } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('Ретранслятор недоступен');
}

// Надёжный упорядоченный канал поверх потерь: seq + накопительные подтверждения + переотправка
class Link {
  constructor(send) { this.send = send; this.seq = 0; this.out = []; this.next = 0; this.buf = new Map(); this.q = []; this.ackDirty = false; this.srtt = 800; this.stats = { sent: 0, resent: 0, pkts: 0 }; }
  push(msg) { this.q.push(msg); }
  flush(now) {
    let sent = false;
    while (this.q.length) {
      const part = []; let bytes = 0;
      while (this.q.length && (bytes < MAX_PKT || !part.length)) { const m = this.q.shift(); part.push(m); bytes += JSON.stringify(m).length; }
      const o = { s: this.seq++, m: part, t: now, t0: now, n: 0 };
      this.out.push(o);
      this.send({ s: o.s, m: o.m, a: this.next });
      this.stats.sent++; this.stats.pkts++;
      sent = true;
    }
    // переотправка только того, что точно потерялось (таймаут от измеренной задержки)
    const rto = Math.min(4000, Math.max(1000, this.srtt * 2.2));
    let budget = 3;
    for (const o of this.out) {
      if (budget <= 0) break;
      if (now - o.t > rto * (1 + o.n)) { o.t = now; o.n++; budget--; this.send({ s: o.s, m: o.m, a: this.next }); this.stats.resent++; this.stats.pkts++; sent = true; }
    }
    if (!sent && this.ackDirty) this.send({ a: this.next });
    this.ackDirty = false;
  }
  receive(p, deliver) {
    if (p.a !== undefined && this.out.length && this.out[0].s < p.a) {
      const now = performance.now();
      for (const o of this.out) if (o.s < p.a && o.n === 0) this.srtt = this.srtt * 0.85 + (now - o.t0) * 0.15;
      this.out = this.out.filter(o => o.s >= p.a);
    }
    if (p.s === undefined) return;
    this.ackDirty = true;
    if (p.s < this.next || this.buf.has(p.s)) return;
    this.buf.set(p.s, p.m);
    while (this.buf.has(this.next)) {
      const ms = this.buf.get(this.next); this.buf.delete(this.next); this.next++;
      for (const m of ms) deliver(m);
    }
  }
}

class RelayHost extends Emitter {
  constructor() { super(); this.peers = new Map(); this.byCid = new Map(); this.next = 1; }
  async start(code) {
    this.code = code; this.base = TOPIC + code;
    await this.open();
    this.timer = setInterval(() => this.tick(), 66);
    return code;
  }
  async open() {
    this.mq = await connectBroker('cbh' + Math.random().toString(36).slice(2, 10));
    this.mq.onMessage = (t, txt) => this.onPacket(txt);
    this.mq.onClose = () => this.reopen();
    this.mq.subscribe(this.base + '/h', 0);
  }
  reopen() {
    if (this.closed) return;
    setTimeout(() => this.open().catch(() => this.reopen()), 1500);
  }
  onPacket(txt) {
    let p; try { p = JSON.parse(txt); } catch (e) { return; }
    const cid = p.f; if (!cid) return;
    let peer = this.byCid.get(cid);
    if (p.hello) {
      if (!peer) {
        const id = this.alloc ? this.alloc() : this.next++;
        peer = { id, cid, seen: performance.now() };
        peer.link = new Link((obj) => this.mq.publish(this.base + '/c/' + cid, JSON.stringify(obj)));
        this.byCid.set(cid, peer); this.peers.set(id, peer);
        this.mq.publish(this.base + '/c/' + cid, JSON.stringify({ hi: 1 }));
        this.emit('join', id);
      } else this.mq.publish(this.base + '/c/' + cid, JSON.stringify({ hi: 1 }));
      return;
    }
    if (!peer) return;
    peer.seen = performance.now();
    if (p.bye) { this.drop(peer); return; }
    peer.link.receive(p, (m) => this.emit('msg', peer.id, m));
  }
  drop(peer) { this.peers.delete(peer.id); this.byCid.delete(peer.cid); this.emit('leave', peer.id); }
  tick() {
    const now = performance.now();
    for (const peer of [...this.peers.values()]) {
      if (now - peer.seen > 15000) { this.drop(peer); continue; }
      if (this.mq && this.mq.open) peer.link.flush(now);
    }
  }
  has(id) { return this.peers.has(id); }
  sendTo(id, msg) { const p = this.peers.get(id); if (p) p.link.push(msg); }
  broadcast(msg, except) { for (const [id, p] of this.peers) if (id !== except) p.link.push(msg); }
  kick(id) { const p = this.peers.get(id); if (p) this.drop(p); }
  close() { this.closed = true; clearInterval(this.timer); try { this.mq.close(); } catch (e) { /* ignore */ } }
}

class RelayClient extends Emitter {
  async start(code) {
    this.base = TOPIC + code;
    this.cid = 'c' + Math.random().toString(36).slice(2, 12);
    this.mq = await connectBroker('cbc' + this.cid);
    this.link = new Link((obj) => { obj.f = this.cid; this.mq.publish(this.base + '/h', JSON.stringify(obj)); });
    this.seen = performance.now();
    await new Promise((resolve, reject) => {
      let ok = false;
      this.mq.onMessage = (t, txt) => {
        let p; try { p = JSON.parse(txt); } catch (e) { return; }
        this.seen = performance.now();
        if (p.hi) { if (!ok) { ok = true; clearInterval(hello); resolve(); } return; }
        this.link.receive(p, (m) => this.emit('msg', m));
      };
      this.mq.onClose = () => { if (ok) this.emit('close'); };
      this.mq.subscribe(this.base + '/c/' + this.cid, 0);
      const sayHello = () => this.mq.publish(this.base + '/h', JSON.stringify({ f: this.cid, hello: 1 }));
      setTimeout(sayHello, 300);
      const hello = setInterval(sayHello, 1200);
      setTimeout(() => { if (!ok) { clearInterval(hello); reject(new Error('Комната не найдена. Проверь код и что у друга открыта игра (не свёрнута).')); } }, 9000);
    });
    this.timer = setInterval(() => {
      const now = performance.now();
      if (now - this.seen > 15000) { clearInterval(this.timer); this.emit('close'); return; }
      if (this.mq.open) this.link.flush(now);
    }, 66);
  }
  send(msg) { if (this.link) this.link.push(msg); }
  close() {
    clearInterval(this.timer);
    try { this.mq.publish(this.base + '/h', JSON.stringify({ f: this.cid, bye: 1 })); } catch (e) { /* ignore */ }
    setTimeout(() => { try { this.mq.close(); } catch (e) { /* ignore */ } }, 100);
  }
}

// ---------- Хост слушает оба канала, клиент пробует напрямую, потом через ретранслятор ----------
class HybridHost extends Emitter {
  constructor() {
    super();
    this.next = 1;
    this.subs = [new PeerHost(), new RelayHost()];
    for (const s of this.subs) {
      s.alloc = () => this.next++;
      s.on('join', (id) => this.emit('join', id));
      s.on('msg', (id, m) => this.emit('msg', id, m));
      s.on('leave', (id) => this.emit('leave', id));
    }
  }
  async start(code) {
    const res = await Promise.allSettled(this.subs.map(s => s.start(code)));
    if (res[0].status === 'rejected' && res[0].reason && res[0].reason.type === 'unavailable-id') { this.close(); throw res[0].reason; }
    this.ok = res.map(r => r.status === 'fulfilled');
    if (!this.ok[0] && !this.ok[1]) { this.close(); throw res[0].reason || res[1].reason; }
    return code;
  }
  owner(id) { return this.subs[0].conns.has(id) ? this.subs[0] : this.subs[1]; }
  sendTo(id, msg) { this.owner(id).sendTo(id, msg); }
  broadcast(msg, except) { for (const s of this.subs) s.broadcast(msg, except); }
  kick(id) { this.owner(id).kick(id); }
  close() { for (const s of this.subs) { try { s.close(); } catch (e) { /* ignore */ } } }
}

class HybridClient extends Emitter {
  async start(code, onStage = () => {}) {
    onStage('Соединяемся напрямую…');
    const p2p = new PeerClient();
    try {
      await p2p.start(code, 7000);
      this.sub = p2p; this.mode = 'напрямую';
    } catch (e) {
      try { p2p.close(); } catch (e2) { /* ignore */ }
      onStage('Напрямую не вышло, подключаемся через сервер…');
      const r = new RelayClient();
      await r.start(code);
      this.sub = r; this.mode = 'через сервер';
    }
    this.sub.on('msg', (m) => this.emit('msg', m));
    this.sub.on('close', () => this.emit('close'));
  }
  send(msg) { this.sub && this.sub.send(msg); }
  close() { if (this.sub) this.sub.close(); }
}

export function createHost() {
  return new URLSearchParams(location.search).has('local') ? new LocalHost() : new HybridHost();
}
export function createClient() {
  return new URLSearchParams(location.search).has('local') ? new LocalClient() : new HybridClient();
}
