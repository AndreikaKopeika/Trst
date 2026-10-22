// Минимальный MQTT 3.1.1 клиент поверх WebSocket (только то, что нужно игре:
// подключение, подписка, публикация QoS 0/1, пинг).
const enc = new TextEncoder(), dec = new TextDecoder();

function varLen(n) {
  const out = [];
  do { let b = n % 128; n = Math.floor(n / 128); if (n > 0) b |= 128; out.push(b); } while (n > 0);
  return out;
}
function str(s) { const b = enc.encode(s); return [b.length >> 8, b.length & 255, ...b]; }
function packet(type, body) {
  const head = [type, ...varLen(body.length)];
  const u = new Uint8Array(head.length + body.length);
  u.set(head, 0); u.set(body, head.length);
  return u;
}

export class MiniMQTT {
  constructor(url, clientId, user = '', pass = '') {
    this.url = url; this.clientId = clientId; this.user = user; this.pass = pass;
    this.buf = new Uint8Array(0); this.pid = 1;
    this.onMessage = null; this.onClose = null;
    this.closed = false;
  }
  connect(timeout = 8000) {
    return new Promise((resolve, reject) => {
      let done = false;
      const fail = (e) => { if (!done) { done = true; clearTimeout(t); reject(e); } };
      const t = setTimeout(() => { fail(new Error('timeout')); try { this.ws.close(); } catch (e) { /* ignore */ } }, timeout);
      let ws;
      try { ws = this.ws = new WebSocket(this.url, ['mqtt']); } catch (e) { fail(e); return; }
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => {
        let flags = 0x02;
        const payload = [...str(this.clientId)];
        if (this.user) { flags |= 0x80; payload.push(...str(this.user)); }
        if (this.pass) { flags |= 0x40; payload.push(...str(this.pass)); }
        const body = [...str('MQTT'), 4, flags, 0, 30, ...payload];
        ws.send(packet(0x10, body));
      };
      ws.onmessage = (e) => {
        const d = new Uint8Array(e.data);
        const b = new Uint8Array(this.buf.length + d.length);
        b.set(this.buf, 0); b.set(d, this.buf.length);
        this.buf = b;
        this.parse((type, flags, body) => {
          if (type === 2) { // CONNACK
            if (body[1] === 0) {
              done = true; clearTimeout(t);
              this.ping = setInterval(() => { if (ws.readyState === 1) ws.send(new Uint8Array([0xC0, 0])); }, 20000);
              resolve();
            } else fail(new Error('MQTT отказ ' + body[1]));
          } else if (type === 3) { // PUBLISH
            const tl = (body[0] << 8) | body[1];
            const topic = dec.decode(body.subarray(2, 2 + tl));
            let off = 2 + tl;
            const qos = (flags >> 1) & 3;
            if (qos > 0) {
              const id = (body[off] << 8) | body[off + 1]; off += 2;
              ws.send(new Uint8Array([0x40, 2, id >> 8, id & 255]));
            }
            if (this.onMessage) this.onMessage(topic, dec.decode(body.subarray(off)));
          }
        });
      };
      ws.onclose = () => { clearInterval(this.ping); fail(new Error('closed')); if (!this.closed && this.onClose) this.onClose(); this.closed = true; };
      ws.onerror = () => fail(new Error('ws error'));
    });
  }
  parse(cb) {
    const b = this.buf;
    let i = 0;
    while (i + 2 <= b.length) {
      const h = b[i];
      let mult = 1, len = 0, j = i + 1, byte;
      do { if (j >= b.length) { this.buf = b.subarray(i); return; } byte = b[j++]; len += (byte & 127) * mult; mult *= 128; } while (byte & 128);
      if (j + len > b.length) break;
      cb(h >> 4, h & 15, b.subarray(j, j + len));
      i = j + len;
    }
    this.buf = b.slice(i);
  }
  subscribe(topic, qos = 0) {
    const id = this.pid++ & 0xffff || 1;
    this.ws.send(packet(0x82, [id >> 8, id & 255, ...str(topic), qos]));
  }
  publish(topic, text, qos = 0) {
    if (!this.ws || this.ws.readyState !== 1) return;
    const payload = enc.encode(text);
    const head = str(topic);
    if (qos > 0) { const id = (this.pid++ & 0xffff) || 1; head.push(id >> 8, id & 255); }
    const body = new Uint8Array(head.length + payload.length);
    body.set(head, 0); body.set(payload, head.length);
    const hl = varLen(body.length);
    const u = new Uint8Array(1 + hl.length + body.length);
    u[0] = 0x30 | (qos << 1); u.set(hl, 1); u.set(body, 1 + hl.length);
    this.ws.send(u);
  }
  get open() { return this.ws && this.ws.readyState === 1; }
  close() {
    this.closed = true;
    clearInterval(this.ping);
    try { if (this.ws.readyState === 1) this.ws.send(new Uint8Array([0xE0, 0])); this.ws.close(); } catch (e) { /* ignore */ }
  }
}
