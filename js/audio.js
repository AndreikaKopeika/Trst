// Синтез звуков через WebAudio — никаких файлов, всё генерируется.
export class Audio {
  constructor() {
    this.ctx = null; this.master = null; this.enabled = true; this.voices = 0; this.frameVoices = 0;
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 6;
    this.master.connect(comp); comp.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 1.5;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.6 + b * 2.5; }
  }
  frame() { this.frameVoices = 0; }
  out(vol, pan) {
    const c = this.ctx;
    const g = c.createGain(); g.gain.value = vol;
    if (pan && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); p.connect(this.master); }
    else g.connect(this.master);
    return g;
  }
  ok(vol) {
    if (!this.ctx || !this.enabled || vol < 0.01) return false;
    if (this.frameVoices > 10) return false;
    this.frameVoices++;
    return true;
  }
  noiseBurst(dst, t, dur, type, freq, q, a = 1) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(a, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(dst);
    s.start(t, Math.max(0, Math.random() * (1.45 - dur)), dur + 0.05);
    return f;
  }
  tone(dst, t, dur, f0, f1, type = 'sine', a = 1) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(a, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dst); o.start(t); o.stop(t + dur + 0.02);
  }

  shot(kind, vol = 1, pan = 0) {
    if (!this.ok(vol)) return;
    const t = this.ctx.currentTime, o = this.out(vol, pan);
    switch (kind) {
      case 'ak':
        this.noiseBurst(o, t, 0.12, 'bandpass', 1400, 0.8, 1.2);
        this.noiseBurst(o, t, 0.25, 'lowpass', 600, 0.5, 0.8);
        this.tone(o, t, 0.08, 160, 50, 'triangle', 0.8);
        break;
      case 'lmg':
        this.noiseBurst(o, t, 0.14, 'bandpass', 1100, 0.7, 1.2);
        this.noiseBurst(o, t, 0.3, 'lowpass', 500, 0.5, 0.9);
        this.tone(o, t, 0.1, 130, 45, 'triangle', 0.9);
        break;
      case 'hmg':
        this.noiseBurst(o, t, 0.16, 'bandpass', 800, 0.6, 1.3);
        this.noiseBurst(o, t, 0.35, 'lowpass', 350, 0.4, 1.1);
        this.tone(o, t, 0.12, 100, 35, 'sawtooth', 0.5);
        break;
      case 'sniper':
        this.noiseBurst(o, t, 0.08, 'highpass', 2500, 0.5, 1.3);
        this.noiseBurst(o, t, 0.9, 'lowpass', 900, 0.4, 1.2);
        this.tone(o, t, 0.25, 120, 30, 'triangle', 1.2);
        break;
      case 'shotgun':
        this.noiseBurst(o, t, 0.4, 'lowpass', 1200, 0.4, 1.6);
        this.tone(o, t, 0.18, 110, 35, 'triangle', 1.2);
        // перезарядка помпы
        this.noiseBurst(o, t + 0.35, 0.05, 'bandpass', 2500, 4, 0.4);
        this.noiseBurst(o, t + 0.5, 0.05, 'bandpass', 2000, 4, 0.4);
        break;
      case 'rpg':
        this.noiseBurst(o, t, 0.6, 'bandpass', 600, 0.5, 1.2);
        this.tone(o, t, 0.4, 300, 80, 'sawtooth', 0.3);
        break;
      case 'throw':
        this.noiseBurst(o, t, 0.15, 'bandpass', 900, 1.5, 0.5);
        break;
    }
  }
  explosion(vol = 1, pan = 0) {
    if (!this.ok(vol)) return;
    const t = this.ctx.currentTime, o = this.out(vol, pan);
    this.noiseBurst(o, t, 1.6, 'lowpass', 500, 0.3, 2.0);
    this.noiseBurst(o, t, 0.3, 'bandpass', 1500, 0.5, 1.0);
    this.tone(o, t, 0.7, 90, 25, 'sine', 2.0);
    this.noiseBurst(o, t + 0.2, 1.2, 'lowpass', 200, 0.3, 0.8);
  }
  ricochet(vol = 0.5, pan = 0) {
    if (!this.ok(vol)) return;
    const t = this.ctx.currentTime, o = this.out(vol, pan);
    const f = 1800 + Math.random() * 1600;
    this.tone(o, t, 0.25 + Math.random() * 0.15, f, f * 0.55, 'sine', 0.35);
    this.noiseBurst(o, t, 0.03, 'highpass', 4000, 1, 0.5);
  }
  impact(hard, vol = 0.5, pan = 0) {
    if (!this.ok(vol)) return;
    const t = this.ctx.currentTime, o = this.out(vol, pan);
    if (hard) this.noiseBurst(o, t, 0.05, 'bandpass', 3000, 2, 0.8);
    else this.noiseBurst(o, t, 0.08, 'lowpass', 800, 1, 0.9);
  }
  blockBreak(vol = 0.6, pan = 0, glass = false) {
    if (!this.ok(vol)) return;
    const t = this.ctx.currentTime, o = this.out(vol, pan);
    if (glass) { for (let i = 0; i < 4; i++) this.tone(o, t + i * 0.03, 0.15, 3000 + Math.random() * 3000, 2000, 'sine', 0.2); this.noiseBurst(o, t, 0.2, 'highpass', 3000, 1, 0.6); }
    else { this.noiseBurst(o, t, 0.22, 'lowpass', 700, 0.8, 1.1); this.noiseBurst(o, t + 0.04, 0.12, 'bandpass', 1500, 1, 0.5); }
  }
  place(vol = 0.5) {
    if (!this.ok(vol)) return;
    const t = this.ctx.currentTime, o = this.out(vol, 0);
    this.noiseBurst(o, t, 0.08, 'lowpass', 500, 1, 1); this.tone(o, t, 0.06, 220, 110, 'triangle', 0.5);
  }
  hitmark(head = false) {
    if (!this.ok(1)) return;
    const t = this.ctx.currentTime, o = this.out(0.5, 0);
    this.tone(o, t, 0.06, head ? 1700 : 1200, head ? 1500 : 1000, 'square', 0.25);
  }
  killmark() {
    if (!this.ok(1)) return;
    const t = this.ctx.currentTime, o = this.out(0.5, 0);
    this.tone(o, t, 0.08, 900, 900, 'square', 0.25); this.tone(o, t + 0.09, 0.15, 1400, 1400, 'square', 0.25);
  }
  cluck(vol = 0.6, pan = 0, pitch = 1) {
    if (!this.ok(vol)) return;
    const t = this.ctx.currentTime, o = this.out(vol, pan);
    // "кудах!"
    this.tone(o, t, 0.09, 700 * pitch, 450 * pitch, 'sawtooth', 0.35);
    this.tone(o, t + 0.1, 0.18, 950 * pitch, 520 * pitch, 'sawtooth', 0.45);
    this.noiseBurst(o, t, 0.25, 'bandpass', 1800, 3, 0.25);
  }
  hurt() {
    if (!this.ok(1)) return;
    const t = this.ctx.currentTime, o = this.out(0.6, 0);
    this.tone(o, t, 0.12, 600, 300, 'sawtooth', 0.3);
    this.noiseBurst(o, t, 0.08, 'lowpass', 400, 1, 0.8);
  }
  reload(stage) {
    if (!this.ok(1)) return;
    const t = this.ctx.currentTime, o = this.out(0.4, 0.2);
    this.noiseBurst(o, t, 0.05, 'bandpass', stage ? 2600 : 1600, 5, 0.9);
    this.tone(o, t, 0.04, stage ? 900 : 500, 300, 'square', 0.15);
  }
  empty() {
    if (!this.ok(1)) return;
    const t = this.ctx.currentTime, o = this.out(0.4, 0);
    this.noiseBurst(o, t, 0.03, 'bandpass', 3000, 6, 0.8);
  }
  jump() {
    if (!this.ok(0.3)) return;
    const t = this.ctx.currentTime, o = this.out(0.25, 0);
    this.noiseBurst(o, t, 0.1, 'bandpass', 600, 1.5, 0.5);
  }
  flap(vol = 0.25) {
    if (!this.ok(vol)) return;
    const t = this.ctx.currentTime, o = this.out(vol, 0);
    this.noiseBurst(o, t, 0.07, 'bandpass', 500, 1, 0.7);
  }
  spin(vol = 0.3) {
    if (!this.ok(vol)) return;
    const t = this.ctx.currentTime, o = this.out(vol, 0);
    this.tone(o, t, 0.4, 80, 400, 'sawtooth', 0.15);
  }
  egg(vol = 0.6, pan = 0) {
    if (!this.ok(vol)) return;
    const t = this.ctx.currentTime, o = this.out(vol, pan);
    this.tone(o, t, 0.15, 520, 260, 'triangle', 0.6); this.noiseBurst(o, t, 0.1, 'bandpass', 2400, 3, 0.4);
  }
  alarm() {
    if (!this.ok(1)) return;
    const t = this.ctx.currentTime, o = this.out(0.35, 0);
    for (let i = 0; i < 3; i++) this.tone(o, t + i * 0.22, 0.18, 880, 660, 'square', 0.2);
  }
  win() {
    if (!this.ok(1)) return;
    const t = this.ctx.currentTime, o = this.out(0.5, 0);
    [523, 659, 784, 1046].forEach((f, i) => this.tone(o, t + i * 0.14, 0.3, f, f, 'triangle', 0.5));
  }
}
