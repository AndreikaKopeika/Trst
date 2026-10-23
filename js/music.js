// Музыка и звуки кампании: процедурный «оркестр» (барабаны тайко, бас-остинато, струнные, хор),
// рация, вертолёт, дождь, гром, сирена, гул ядерного взрыва. Всё синтезируется на лету — без файлов.
const rnd = (a, b) => a + Math.random() * (b - a);
const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);

// аккорды в полутонах от тоники; ре минор
const D = 38; // D2
const PROG = {
  minor: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -1, 2]],        // Dm Bb C A
  sad: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]],             // Dm Bb F C
  dark: [[0, 3, 7], [1, 5, 8], [0, 3, 7], [-1, 3, 6]],               // Dm Eb Dm C#dim
  hero: [[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]],             // D G A D
};
const BASS = {
  action: [0, 0, 3, 0, -2, 0, -4, -5],
  epic: [0, 0, 0, 3, 0, 0, -2, -4],
};

export const MOODS = {
  tension: { bpm: 72, drone: true, prog: 'dark' },
  stealth: { bpm: 84, drone: true, prog: 'minor' },
  action: { bpm: 128, drone: false, prog: 'minor' },
  epic: { bpm: 132, drone: true, prog: 'minor' },
  sad: { bpm: 60, drone: false, prog: 'sad' },
  victory: { bpm: 100, drone: false, prog: 'hero' },
  dread: { bpm: 56, drone: true, prog: 'dark' },
};

export class Music {
  constructor(audio) {
    this.a = audio; this.mood = null; this.vol = 1; this.on = true;
    this.step = 0; this.next = 0; this.timer = null; this.droneNodes = null;
  }
  get ctx() { return this.a.ctx; }
  ensure() {
    const c = this.ctx;
    if (!c) return false;
    if (!this.out) {
      this.out = c.createGain(); this.out.gain.value = 0.0001;
      // своя небольшая реверберация «зала»
      this.hall = c.createConvolver();
      const sr = c.sampleRate, n = Math.floor(sr * 2.8), ir = c.createBuffer(2, n, sr);
      for (let ch = 0; ch < 2; ch++) { const o = ir.getChannelData(ch); for (let i = 0; i < n; i++) o[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6) * 0.5; }
      this.hall.buffer = ir;
      this.wet = c.createGain(); this.wet.gain.value = 0.45;
      this.bus = c.createGain(); this.bus.gain.value = 1;
      this.bus.connect(this.out); this.bus.connect(this.wet); this.wet.connect(this.hall); this.hall.connect(this.out);
      this.out.connect(this.a.master);
    }
    return true;
  }
  setVolume(v) { this.vol = v; if (this.out && this.mood) this.out.gain.setTargetAtTime(0.55 * v, this.ctx.currentTime, 0.3); }
  play(mood) {
    if (!this.ensure() || mood === this.mood) return;
    const c = this.ctx, t = c.currentTime;
    this.mood = mood;
    this.stopDrone();
    if (!mood || !MOODS[mood] || !this.on) { this.out.gain.setTargetAtTime(0.0001, t, 0.8); return; }
    this.M = MOODS[mood];
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(0.55 * this.vol, t, 0.6);
    this.step = 0; this.next = t + 0.12;
    if (this.M.drone) this.startDrone(mood === 'dread' ? 0.3 : 0.22);
    if (!this.timer) this.timer = setInterval(() => this.pump(), 40);
  }
  stop() { this.play(null); }
  dispose() { this.play(null); if (this.timer) clearInterval(this.timer); this.timer = null; }
  pump() {
    const c = this.ctx;
    if (!c || !this.mood || !this.M) return;
    if (c.state !== 'running') { this.next = c.currentTime + 0.1; return; }
    const s16 = 60 / this.M.bpm / 4;
    while (this.next < c.currentTime + 0.25) { this.tick(this.mood, this.step, this.next, s16); this.step++; this.next += s16; }
  }

  // ---------- инструменты ----------
  env(g, t, a, peak, dur, rel) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + Math.max(a, dur - rel));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  taiko(t, v = 1, f = 90) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.42, t + 0.5);
    const g = c.createGain(); this.env(g, t, 0.004, 0.9 * v, 0.7, 0.6);
    o.connect(g); g.connect(this.bus); o.start(t); o.stop(t + 0.75);
    const n = c.createBufferSource(); n.buffer = this.a.noise;
    const nf = c.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 500;
    const ng = c.createGain(); this.env(ng, t, 0.002, 0.5 * v, 0.18, 0.15);
    n.connect(nf); nf.connect(ng); ng.connect(this.bus); n.start(t, Math.random(), 0.2);
  }
  kick(t, v = 1) {
    const c = this.ctx, o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.22);
    const g = c.createGain(); this.env(g, t, 0.002, 1.0 * v, 0.35, 0.3);
    o.connect(g); g.connect(this.out); o.start(t); o.stop(t + 0.4);
  }
  snare(t, v = 1) {
    const c = this.ctx, n = c.createBufferSource(); n.buffer = this.a.noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8;
    const g = c.createGain(); this.env(g, t, 0.002, 0.42 * v, 0.17, 0.15);
    n.connect(f); f.connect(g); g.connect(this.bus); n.start(t, Math.random(), 0.2);
  }
  hat(t, v = 1) {
    const c = this.ctx, n = c.createBufferSource(); n.buffer = this.a.noise;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const g = c.createGain(); this.env(g, t, 0.001, 0.12 * v, 0.045, 0.04);
    n.connect(f); f.connect(g); g.connect(this.out); n.start(t, Math.random(), 0.06);
  }
  bass(t, m, dur, v = 1) {
    const c = this.ctx, o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mf(m);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(160, t + dur);
    const g = c.createGain(); this.env(g, t, 0.006, 0.32 * v, dur, dur * 0.6);
    o.connect(f); f.connect(g); g.connect(this.bus); o.start(t); o.stop(t + dur + 0.05);
  }
  // струнные / медь: несколько расстроенных пил через фильтр
  pad(t, notes, dur, v = 1, bright = 900, attack = 0.5) {
    const c = this.ctx;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = bright; f.Q.value = 0.7;
    const g = c.createGain(); this.env(g, t, attack, 0.09 * v, dur, Math.min(dur * 0.5, 1.4));
    f.connect(g); g.connect(this.bus);
    for (const m of notes) for (const det of [-7, 6]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mf(m); o.detune.value = det + rnd(-3, 3);
      o.connect(f); o.start(t); o.stop(t + dur + 0.1);
    }
  }
  // хор «а-а»: пилы через две форманты
  choir(t, notes, dur, v = 1) {
    const c = this.ctx;
    const g = c.createGain(); this.env(g, t, 0.9, 0.11 * v, dur, 1.2);
    const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 760; f1.Q.value = 4;
    const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1180; f2.Q.value = 5;
    f1.connect(g); f2.connect(g); g.connect(this.bus);
    for (const m of notes) for (const det of [-9, 0, 8]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mf(m); o.detune.value = det;
      const lfo = c.createOscillator(); lfo.frequency.value = rnd(4.5, 5.5); const lg = c.createGain(); lg.gain.value = 6;
      lfo.connect(lg); lg.connect(o.detune); lfo.start(t); lfo.stop(t + dur + 0.1);
      o.connect(f1); o.connect(f2); o.start(t); o.stop(t + dur + 0.1);
    }
  }
  stab(t, notes, v = 1) { this.pad(t, notes, 0.22, v * 1.6, 2200, 0.01); }
  pluck(t, m, v = 1) {
    const c = this.ctx, o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = mf(m);
    const g = c.createGain(); this.env(g, t, 0.003, 0.16 * v, 1.2, 1.1);
    o.connect(g); g.connect(this.bus); o.start(t); o.stop(t + 1.3);
  }
  startDrone(v) {
    const c = this.ctx, t = c.currentTime;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 240; f.Q.value = 2;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07; const lg = c.createGain(); lg.gain.value = 90; lfo.connect(lg); lg.connect(f.frequency);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v * 0.5, t + 3);
    const os = [D - 12, D - 5, D].map((m, i) => { const o = c.createOscillator(); o.type = i === 2 ? 'triangle' : 'sawtooth'; o.frequency.value = mf(m); o.detune.value = rnd(-8, 8); o.connect(f); o.start(t); return o; });
    f.connect(g); g.connect(this.bus); lfo.start(t);
    this.droneNodes = { os, lfo, g };
  }
  stopDrone() {
    const d = this.droneNodes; if (!d) return;
    const t = this.ctx.currentTime;
    d.g.gain.setTargetAtTime(0.0001, t, 0.6);
    for (const o of [...d.os, d.lfo]) o.stop(t + 3);
    this.droneNodes = null;
  }

  // ---------- партитура: один шаг (1/16) ----------
  tick(mood, s, t, s16) {
    const bar = Math.floor(s / 16), b = s % 16;
    const P = PROG[this.M.prog], chord = P[bar % P.length];
    const notes = (oct) => chord.map(x => D + 12 * oct + x);
    if (mood === 'tension' || mood === 'dread') {
      if (b === 0 && bar % 2 === 0) this.pad(t, notes(1), s16 * 32, mood === 'dread' ? 0.9 : 0.7, 600, 2);
      if (b === 0 || (b === 10 && bar % 2)) this.taiko(t, 0.35, 70);
      if (b === 8 && Math.random() < 0.4) this.pluck(t, D + 36 + [0, 3, 7, 10][Math.floor(Math.random() * 4)], 0.6);
      if (mood === 'dread' && b === 0 && bar % 4 === 3) this.choir(t, notes(2), s16 * 32, 0.6);
      return;
    }
    if (mood === 'stealth') {
      if (b === 0 || b === 3) this.kick(t, b ? 0.35 : 0.5);
      if (b % 4 === 2) this.pluck(t, D + 24 + chord[(s >> 2) % 3], 0.45);
      if (b === 0 && bar % 4 === 0) this.pad(t, notes(1), s16 * 64, 0.45, 500, 3);
      if (b % 2 === 1) this.hat(t, 0.25);
      return;
    }
    if (mood === 'action' || mood === 'epic') {
      const big = mood === 'epic';
      if (b === 0 || b === 8 || (b === 11 && bar % 2)) this.taiko(t, b === 0 ? 1 : 0.75, b === 0 ? 85 : 110);
      if (b === 4 || b === 12) this.snare(t, 0.9);
      if (b % 2 === 0) this.hat(t, b % 4 === 0 ? 0.7 : 0.4);
      if (b % 2 === 0) { const bl = BASS[mood]; this.bass(t, D + chord[0] + bl[(b >> 1) % 8], s16 * 1.8, 0.9); }
      if (b === 0) this.stab(t, notes(2), 0.9);
      if (b === 6 || b === 10) this.stab(t, notes(2), 0.55);
      if (big && b === 0) { this.choir(t, notes(2), s16 * 16, 0.9); this.pad(t, notes(1), s16 * 16, 0.6, 1300, 0.3); }
      if (bar % 4 === 3 && b >= 12) this.taiko(t, 0.5 + (b - 12) * 0.15, 120); // нарастающая дробь
      return;
    }
    if (mood === 'sad') {
      if (b === 0) this.pad(t, notes(1), s16 * 16, 0.8, 700, 1.2);
      const mel = [9, 7, 5, 3, 2, 3, 5, 0];
      if (b === 0 || b === 8) this.pluck(t, D + 24 + mel[(bar * 2 + (b ? 1 : 0)) % mel.length] + 12, 0.7);
      if (b === 0 && bar % 2 === 1) this.choir(t, notes(2), s16 * 16, 0.45);
      return;
    }
    if (mood === 'victory') {
      if (b === 0) { this.pad(t, notes(1), s16 * 16, 1.2, 1800, 0.08); this.taiko(t, 0.9, 80); }
      if (b === 8) this.taiko(t, 0.6, 100);
      if (b === 12 || b === 14) this.snare(t, 0.6);
      if (b === 0 && bar % 2 === 0) this.choir(t, notes(2), s16 * 32, 0.7);
    }
  }
}

// ---------- звуки кампании ----------
export class CampSfx {
  constructor(audio) { this.a = audio; this.loopsOn = []; }
  get ctx() { return this.a.ctx; }
  ok() { return !!this.ctx && this.a.enabled; }
  radio(out = false) {
    if (!this.ok()) return;
    this.a.synth(null, 0.3, { wet: 0 }, (o, t) => {
      this.a.noiseBurst(o, t, out ? 0.12 : 0.08, 'bandpass', 2600, 1.4, 0.55);
      this.a.tone(o, t + 0.015, 0.05, out ? 900 : 1300, out ? 700 : 1300, 'square', 0.06);
    });
  }
  type() { if (this.ok()) this.a.synth(null, 0.12, { wet: 0 }, (o, t) => this.a.noiseBurst(o, t, 0.02, 'highpass', 4000, 1, 0.5)); }
  objective(done) {
    if (!this.ok()) return;
    this.a.synth(null, 0.4, { wet: 0.25 }, (o, t) => {
      const f = done ? [587, 880] : [440, 659];
      this.a.tone(o, t, 0.25, f[0], f[0], 'triangle', 0.4); this.a.tone(o, t + 0.12, 0.45, f[1], f[1], 'triangle', 0.4);
    });
  }
  // удар на титре миссии
  boom() {
    if (!this.ok()) return;
    this.a.synth(null, 0.9, { wet: 0.5 }, (o, t) => {
      this.a.tone(o, t, 2.2, 70, 30, 'sine', 1.4, 0.004);
      this.a.noiseBurst(o, t, 1.6, 'lowpass', 300, 0.5, 0.8);
      this.a.tone(o, t, 1.8, 146.8, 146.8, 'sawtooth', 0.08, 0.02);
    });
  }
  // долгий гул и рёв ядерного взрыва
  nuke(dist = 1) {
    if (!this.ok()) return;
    this.a.synth(null, 1.2, { wet: 0.6 }, (o, t) => {
      this.a.noiseBurst(o, t + dist, 7, 'lowpass', 220, 0.4, 2.2);
      this.a.tone(o, t + dist, 6, 48, 18, 'sine', 2.0, 0.05);
      this.a.noiseBurst(o, t + dist + 0.3, 5, 'bandpass', 700, 0.5, 0.6, 120);
    });
  }
  thunder(d = 1) {
    if (!this.ok()) return;
    this.a.synth(null, 0.8 / (0.6 + d), { wet: 0.7 }, (o, t) => {
      this.a.noiseBurst(o, t, 0.4, 'lowpass', 1600, 0.4, 1.0);
      this.a.noiseBurst(o, t + 0.1, rnd(2.5, 4), 'lowpass', 180, 0.5, 1.6);
      this.a.tone(o, t, 2.5, 55, 28, 'sine', 0.9, 0.02);
    });
  }
  heartbeat() { if (this.ok()) this.a.heartbeat(); }
  breath() { if (this.ok()) this.a.synth(null, 0.25, { wet: 0 }, (o, t) => { this.a.noiseBurst(o, t, 0.9, 'bandpass', 600, 0.8, 0.5); this.a.noiseBurst(o, t + 1.1, 1.2, 'bandpass', 450, 0.8, 0.4); }); }
  // зацикленный шум (дождь, сирена, вертолёт): возвращает { set(v), stop() }
  loop(kind, getPos) {
    if (!this.ok()) return null;
    const c = this.ctx, t = c.currentTime;
    const g = c.createGain(); g.gain.value = 0.0001;
    let out = g, panner = null;
    if (getPos) {
      panner = c.createPanner(); panner.panningModel = this.a.isDesktop ? 'HRTF' : 'equalpower'; panner.distanceModel = 'inverse'; panner.refDistance = 8; panner.rolloffFactor = 0.8;
      g.connect(panner); panner.connect(this.a.master); out = panner;
    } else g.connect(this.a.master);
    void out;
    const nodes = [];
    const src = () => { const s = c.createBufferSource(); s.buffer = this.a.noise; s.loop = true; s.start(t, Math.random()); nodes.push(s); return s; };
    if (kind === 'rain') {
      const s = src(), f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 900;
      const f2 = c.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 7000;
      s.connect(f); f.connect(f2); f2.connect(g);
      const s2 = src(), lf = c.createBiquadFilter(); lf.type = 'lowpass'; lf.frequency.value = 300; const lg = c.createGain(); lg.gain.value = 0.6;
      s2.connect(lf); lf.connect(lg); lg.connect(g);
    } else if (kind === 'sea') {
      const s = src(), f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
      const lfo = c.createOscillator(); lfo.frequency.value = 0.12; const lg = c.createGain(); lg.gain.value = 300; lfo.connect(lg); lg.connect(f.frequency); lfo.start(t); nodes.push(lfo);
      s.connect(f); f.connect(g);
    } else if (kind === 'siren') {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 600; nodes.push(o);
      const lfo = c.createOscillator(); lfo.frequency.value = 0.45; const lg = c.createGain(); lg.gain.value = 220; lfo.connect(lg); lg.connect(o.frequency);
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.5;
      o.connect(f); f.connect(g); o.start(t); lfo.start(t); nodes.push(lfo);
    } else if (kind === 'heli') {
      // лопасти: шум, промодулированный с частотой ~5.5 Гц, плюс вой турбины
      const s = src(), f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; f.Q.value = 1.2;
      const am = c.createGain(); am.gain.value = 0.5;
      const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 5.6; const lg = c.createGain(); lg.gain.value = 0.5;
      lfo.connect(lg); lg.connect(am.gain); lfo.start(t); nodes.push(lfo);
      s.connect(f); f.connect(am); am.connect(g);
      const tu = c.createOscillator(); tu.type = 'sawtooth'; tu.frequency.value = 1450; nodes.push(tu);
      const tf = c.createBiquadFilter(); tf.type = 'bandpass'; tf.frequency.value = 1500; tf.Q.value = 8; const tg = c.createGain(); tg.gain.value = 0.05;
      tu.connect(tf); tf.connect(tg); tg.connect(g); tu.start(t);
    } else if (kind === 'fire') {
      const s = src(), f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.4; s.connect(f); f.connect(g);
    } else if (kind === 'ring') {
      const o = c.createOscillator(); o.frequency.value = 3700; o.connect(g); o.start(t); nodes.push(o);
    }
    const L = {
      set: (v, tc = 0.4) => g.gain.setTargetAtTime(Math.max(0.0001, v), c.currentTime, tc),
      update: () => { if (!panner || !getPos) return; const q = getPos(); if (!q) return; if (panner.positionX) { panner.positionX.value = q.x; panner.positionY.value = q.y; panner.positionZ.value = q.z; } else panner.setPosition(q.x, q.y, q.z); },
      stop: () => { g.gain.setTargetAtTime(0.0001, c.currentTime, 0.4); for (const n of nodes) { try { n.stop(c.currentTime + 2); } catch (e) { /* ignore */ } } this.a.loops.delete(L); },
    };
    this.a.loops.add(L);
    this.loopsOn.push(L);
    return L;
  }
  stopAll() { for (const l of this.loopsOn) l.stop(); this.loopsOn = []; }
}
