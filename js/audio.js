// Звуковой движок: настоящие записи (CC0) + синтез, объёмный звук (PannerNode),
// реверберация пространства, затухание высоких частот с расстоянием, задержка звука по
// скорости звука, свист пуль, звон в ушах, фоновая атмосфера.
const SPEED_OF_SOUND = 343;
const rnd = (a, b) => a + Math.random() * (b - a);

// материал блока -> группа звуков
export const MAT = { grass: 'grass', soft: 'soft', stone: 'stone', wood: 'wood', metal: 'metal', glass: 'glass', sand: 'sand' };

export class Audio {
  constructor() {
    this.ctx = null; this.enabled = true; this.volume = 1;
    this.buffers = new Map();   // имя группы -> [AudioBuffer]
    this.rr = new Map();        // круговой выбор вариаций
    this.voices = 0; this.maxVoices = 28;
    this.frameVoices = 0;
    this.listener = { x: 0, y: 0, z: 0 };
    this.isDesktop = !(('ontouchstart' in window) || navigator.maxTouchPoints > 0);
    this.loops = new Set();
    this.ringT = 0;
  }

  init() {
    if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC({ latencyHint: 'interactive' });
    // главная цепочка: всё -> "уши" (фильтр для оглушения) -> компрессор -> лимитер -> выход
    this.master = c.createGain(); this.master.gain.value = 0.9 * this.volume;
    this.ears = c.createBiquadFilter(); this.ears.type = 'lowpass'; this.ears.frequency.value = 20000; this.ears.Q.value = 0.5;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
    const lim = c.createDynamicsCompressor();
    lim.threshold.value = -2; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
    this.master.connect(this.ears); this.ears.connect(comp); comp.connect(lim); lim.connect(c.destination);
    // шина эха пространства
    this.verb = c.createConvolver();
    this.verbIn = c.createGain(); this.verbIn.gain.value = 0.32;
    this.verbIn.connect(this.verb); this.verb.connect(this.master);
    this.setSpace('open');
    // шум для синтеза
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.6 + b * 2.2; }
    this.load();
    this.ambience();
  }

  // Импульсная характеристика "пространства": ранние отражения + затухающий хвост
  setSpace(kind) {
    if (!this.ctx) { this.space = kind; return; }
    const c = this.ctx, sr = c.sampleRate;
    const P = { open: [1.6, 2.6, 0.22], canyon: [2.6, 1.8, 0.34], desert: [1.2, 3.2, 0.2], indoor: [0.9, 4, 0.4] }[kind] || [1.6, 2.6, 0.22];
    const [dur, decay, wet] = P;
    const n = Math.floor(sr * dur), ir = c.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const o = ir.getChannelData(ch);
      for (let i = 0; i < n; i++) { const t = i / n; o[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * 0.6; }
      // ранние отражения (стены, земля)
      for (let k = 0; k < 7; k++) { const at = Math.floor(sr * rnd(0.008, 0.12)); o[at] += rnd(-0.9, 0.9); }
      // лёгкое затемнение хвоста
      let lp = 0; for (let i = 0; i < n; i++) { lp += (o[i] - lp) * (0.35 - 0.25 * i / n); o[i] = lp; }
    }
    this.verb.buffer = ir;
    this.verbIn.gain.value = wet;
    this.space = kind;
  }

  async load() {
    const base = new URL('../sfx/', import.meta.url);
    const lists = await Promise.all(['guns.json', 'misc.json'].map(f => fetch(new URL(f, base)).then(r => r.json()).catch(() => ({}))));
    const jobs = [];
    for (const man of lists) for (const [key, files] of Object.entries(man)) {
      for (const f of files) jobs.push([key, f]);
    }
    let i = 0;
    const worker = async () => {
      while (i < jobs.length) {
        const [key, f] = jobs[i++];
        try {
          const ab = await fetch(new URL(f, base)).then(r => r.arrayBuffer());
          const buf = await new Promise((res, rej) => this.ctx.decodeAudioData(ab, res, rej));
          const arr = this.buffers.get(key) || [];
          arr.push(this.trim(buf));
          this.buffers.set(key, arr);
        } catch (e) { /* без этого звука обойдёмся синтезом */ }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    this.loaded = true;
  }
  // убираем тишину в начале (у MP3 есть задержка кодека) — выстрел должен звучать мгновенно
  trim(buf) {
    const d = buf.getChannelData(0); let peak = 0;
    for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > peak) peak = Math.abs(d[i]);
    let s = 0; const thr = peak * 0.03;
    while (s < d.length && Math.abs(d[s]) < thr) s++;
    s = Math.max(0, s - Math.floor(buf.sampleRate * 0.001));
    if (s < 8) return buf;
    const out = this.ctx.createBuffer(1, buf.length - s, buf.sampleRate);
    out.getChannelData(0).set(d.subarray(s));
    return out;
  }
  pick(key) {
    const arr = this.buffers.get(key);
    if (!arr || !arr.length) return null;
    let k = (this.rr.get(key) || 0) + 1 + (arr.length > 2 ? Math.floor(Math.random() * (arr.length - 1)) : 0);
    k %= arr.length; this.rr.set(key, k);
    return arr[k];
  }

  // ---------- слушатель ----------
  setListener(cam) {
    const c = this.ctx; if (!c) return;
    const L = c.listener, p = cam.position;
    this.listener.x = p.x; this.listener.y = p.y; this.listener.z = p.z;
    const e = cam.matrixWorld.elements;
    const fx = -e[8], fy = -e[9], fz = -e[10], ux = e[4], uy = e[5], uz = e[6];
    if (L.positionX) {
      const t = c.currentTime;
      L.positionX.setTargetAtTime(p.x, t, 0.02); L.positionY.setTargetAtTime(p.y, t, 0.02); L.positionZ.setTargetAtTime(p.z, t, 0.02);
      L.forwardX.setTargetAtTime(fx, t, 0.02); L.forwardY.setTargetAtTime(fy, t, 0.02); L.forwardZ.setTargetAtTime(fz, t, 0.02);
      L.upX.setTargetAtTime(ux, t, 0.02); L.upY.setTargetAtTime(uy, t, 0.02); L.upZ.setTargetAtTime(uz, t, 0.02);
    } else { L.setPosition(p.x, p.y, p.z); L.setOrientation(fx, fy, fz, ux, uy, uz); }
    for (const l of this.loops) l.update && l.update();
  }
  dist(pos) { const l = this.listener; return Math.hypot(pos.x - l.x, pos.y - l.y, pos.z - l.z); }

  frame(dt = 0.016) {
    this.frameVoices = 0;
    if (this.ringT > 0 && this.ctx) {
      this.ringT -= dt;
      if (this.ringT <= 0) this.ears.frequency.setTargetAtTime(20000, this.ctx.currentTime, 0.4);
    }
  }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = 0.9 * v; }

  can(vol) {
    if (!this.ctx || !this.enabled || this.ctx.state !== 'running') return false;
    if (vol < 0.015 || this.voices >= this.maxVoices || this.frameVoices >= 10) return false;
    this.frameVoices++; return true;
  }
  // Цепочка источника: [фильтр по расстоянию] -> громкость -> панорама/3D -> мастер и эхо
  chain(pos, vol, opt = {}) {
    const c = this.ctx;
    const g = c.createGain(); g.gain.value = vol;
    let head = g, d = 0;
    if (pos) {
      d = this.dist(pos);
      const p = c.createPanner();
      p.panningModel = this.isDesktop ? 'HRTF' : 'equalpower';
      p.distanceModel = 'inverse'; p.refDistance = opt.ref || 3; p.rolloffFactor = opt.roll || 0.9; p.maxDistance = 400;
      if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
      g.connect(p); p.connect(this.master);
      if (d > 12) { // воздух "съедает" высокие частоты
        const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = Math.max(1200, 18000 / (1 + d / 18)); f.Q.value = 0.3;
        f.connect(g); head = f;
      }
      const send = c.createGain(); send.gain.value = Math.min(1.2, (opt.wet ?? 0.35) * (0.5 + d / 30));
      g.connect(send); send.connect(this.verbIn);
    } else {
      if (opt.pan && c.createStereoPanner) { const sp = c.createStereoPanner(); sp.pan.value = opt.pan; g.connect(sp); sp.connect(this.master); }
      else g.connect(this.master);
      const send = c.createGain(); send.gain.value = opt.wet ?? 0.18; g.connect(send); send.connect(this.verbIn);
    }
    return { in: head, d };
  }
  // проиграть запись
  sample(key, pos, vol = 1, opt = {}) {
    const buf = this.pick(key);
    if (!buf) return false;
    if (!this.can(vol)) return true;
    const c = this.ctx;
    const ch = this.chain(pos, vol, opt);
    const s = c.createBufferSource(); s.buffer = buf;
    s.playbackRate.value = (opt.rate || 1) * rnd(1 - (opt.var ?? 0.04), 1 + (opt.var ?? 0.04));
    s.connect(ch.in);
    const delay = pos && opt.delay !== false ? ch.d / SPEED_OF_SOUND : 0;
    this.voices++; s.onended = () => { this.voices--; };
    s.start(c.currentTime + delay + (opt.at || 0));
    return true;
  }

  // ---------- синтез-примитивы ----------
  noiseBurst(dst, t, dur, type, freq, q, a = 1, sweepTo) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(a, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dst);
    s.start(t, Math.random() * 1.2, dur + 0.05);
    return f;
  }
  tone(dst, t, dur, f0, f1, type = 'sine', a = 1, attack = 0.003) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(a, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dst); o.start(t); o.stop(t + dur + 0.05);
  }
  synth(pos, vol, opt, fn) {
    if (!this.can(vol)) return;
    const c = this.ctx, ch = this.chain(pos, vol, opt);
    const delay = pos && opt && opt.delay ? ch.d / SPEED_OF_SOUND : 0;
    this.voices++; setTimeout(() => this.voices--, 600);
    fn(ch.in, c.currentTime + delay);
  }

  // ---------- оружие ----------
  // key — ключ оружия; pos = null — свой выстрел от первого лица
  gunshot(key, pos, vol = 1) {
    if (!this.ctx) return;
    if (key === 'rpg') return this.rocketLaunch(pos, vol);
    const local = !pos;
    const d = pos ? this.dist(pos) : 0;
    const near = key, far = key + '_far';
    // ближний выстрел — запись "рядом", дальний — запись "издалека"; между ними плавный переход
    const farMix = Math.min(1, Math.max(0, (d - 20) / 40));
    const rate = key === 'hmg' ? 1 : 1;
    let ok = false;
    if (farMix < 1) ok = this.sample(near, pos, vol * (1 - farMix) * (local ? 0.95 : 1.15), { ref: 6, rate, var: 0.035, wet: local ? 0.16 : 0.3 });
    if (farMix > 0) ok = this.sample(far, pos, vol * farMix * 1.6, { ref: 10, roll: 0.5, var: 0.05, wet: 0.6 }) || ok;
    if (!ok) this.synthShot(key, pos, vol);
    // свой выстрел: механика + удар в грудь (низы)
    if (local) {
      this.synth(null, 0.5 * vol, { wet: 0 }, (o, t) => {
        this.tone(o, t, 0.09, key === 'shotgun' || key === 'sniper' ? 75 : 95, 38, 'sine', key === 'hmg' ? 0.7 : 0.9);
        this.noiseBurst(o, t, 0.025, 'highpass', 5000, 0.7, 0.25);
      });
    } else if (key === 'hmg' && d < 30) {
      this.synth(pos, 0.5 * vol, { delay: true }, (o, t) => this.tone(o, t, 0.12, 70, 35, 'sine', 0.8));
    }
  }
  synthShot(key, pos, vol) {
    this.synth(pos, vol, { delay: true }, (o, t) => {
      const P = { ak: [1400, 600], lmg: [1100, 500], sniper: [2500, 900], hmg: [800, 350], shotgun: [1200, 400] }[key] || [1200, 500];
      this.noiseBurst(o, t, 0.12, 'bandpass', P[0], 0.8, 1.2);
      this.noiseBurst(o, t, 0.35, 'lowpass', P[1], 0.5, 0.9);
      this.tone(o, t, 0.1, 140, 45, 'triangle', 0.8);
    });
  }
  rocketLaunch(pos, vol) {
    this.synth(pos, vol, { delay: true, wet: 0.4 }, (o, t) => {
      this.noiseBurst(o, t, 0.25, 'lowpass', 900, 0.6, 1.4);
      this.tone(o, t, 0.2, 90, 35, 'sine', 1.0);
      this.noiseBurst(o, t + 0.03, 0.9, 'bandpass', 500, 0.8, 0.8, 2600);
    });
    this.sample('bang', pos, vol * 0.45, { rate: 1.6, var: 0.05 });
  }
  // свист летящей ракеты, привязан к снаряду
  rocketLoop(getPos) {
    if (!this.ctx || !this.enabled) return null;
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 1.2;
    const g = c.createGain(); g.gain.value = 0.0001;
    const p = c.createPanner(); p.panningModel = this.isDesktop ? 'HRTF' : 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = 4; p.rolloffFactor = 1;
    s.connect(f); f.connect(g); g.connect(p); p.connect(this.master);
    s.start();
    g.gain.setTargetAtTime(0.55, c.currentTime, 0.05);
    const loop = {
      update: () => {
        const q = getPos(); if (!q) return;
        if (p.positionX) { p.positionX.value = q.x; p.positionY.value = q.y; p.positionZ.value = q.z; } else p.setPosition(q.x, q.y, q.z);
        f.frequency.value = 1100 + Math.sin(c.currentTime * 40) * 150;
      },
      stop: () => { g.gain.setTargetAtTime(0.0001, c.currentTime, 0.03); s.stop(c.currentTime + 0.2); this.loops.delete(loop); },
    };
    this.loops.add(loop);
    return loop;
  }
  // пуля пролетела рядом с ухом: свист с эффектом Доплера
  whiz(pos, side = 0) {
    this.synth(pos, 0.7, { ref: 1, wet: 0.05 }, (o, t) => {
      const f = 2600 + Math.random() * 1500;
      this.noiseBurst(o, t, 0.16, 'bandpass', f * 1.4, 6, 0.9, f * 0.6);
      this.tone(o, t, 0.14, f, f * 0.55, 'sine', 0.12, 0.01);
    });
    void side;
  }
  ricochet(pos, vol = 0.6) {
    this.synth(pos, vol, { delay: true, wet: 0.35 }, (o, t) => {
      const f = 2000 + Math.random() * 2200;
      this.tone(o, t, 0.3 + Math.random() * 0.25, f, f * rnd(0.45, 0.65), 'sine', 0.3, 0.002);
      this.tone(o, t, 0.25, f * 1.51, f * 0.8, 'sine', 0.08, 0.002);
      this.noiseBurst(o, t, 0.03, 'highpass', 5000, 1, 0.5);
    });
  }
  // попадание в блок по материалу
  impact(mat, pos, vol = 0.6) {
    const key = { metal: 'imp_metal', wood: 'imp_wood', glass: 'imp_glass', stone: 'imp_stone', soft: 'imp_soft', grass: 'imp_soft', sand: 'imp_soft', flesh: 'imp_flesh' }[mat] || 'imp_stone';
    if (!this.sample(key, pos, vol, { ref: 2, var: 0.12, rate: mat === 'stone' ? 1.25 : 1 })) {
      this.synth(pos, vol, {}, (o, t) => this.noiseBurst(o, t, 0.06, mat === 'metal' ? 'bandpass' : 'lowpass', mat === 'metal' ? 3000 : 800, 1.5, 0.9));
    }
  }
  blockBreak(mat, pos, vol = 0.7) {
    const key = mat === 'glass' ? 'imp_glass' : mat === 'wood' ? 'brk_wood' : mat === 'metal' ? 'imp_plate' : (mat === 'soft' || mat === 'grass' || mat === 'sand') ? 'brk_soft' : 'imp_stone';
    this.sample(key, pos, vol, { ref: 3, var: 0.1, rate: mat === 'stone' ? 0.85 : 1 });
    if (mat === 'glass') this.sample('imp_glass', pos, vol * 0.7, { at: 0.05, rate: 1.3 });
  }
  place(mat, pos, vol = 0.5) {
    const key = mat === 'wood' ? 'imp_wood' : mat === 'metal' ? 'imp_plate' : mat === 'glass' ? 'imp_glass' : 'imp_soft';
    if (!this.sample(key, pos, vol, { ref: 2, rate: 0.8, var: 0.1 }))
      this.synth(pos, vol, {}, (o, t) => { this.noiseBurst(o, t, 0.08, 'lowpass', 500, 1, 1); this.tone(o, t, 0.06, 220, 110, 'triangle', 0.5); });
  }
  step(mat, pos, vol = 0.35) {
    const key = { grass: 'step_grass', soft: 'step_grass', wood: 'step_wood', sand: 'step_snow', stone: 'step_concrete', metal: 'step_concrete', glass: 'step_concrete' }[mat] || 'step_concrete';
    this.sample(key, pos, vol, { ref: 1.5, roll: 1.4, var: 0.08, rate: mat === 'metal' ? 1.3 : 1.1, wet: 0.1, delay: false });
  }
  land(mat, vol = 0.6) { this.step(mat, null, vol); this.synth(null, vol * 0.5, { wet: 0 }, (o, t) => this.tone(o, t, 0.08, 120, 50, 'sine', 0.6)); }
  casing(pos, shotgun = false) {
    if (shotgun) return this.sample('imp_soft', pos, 0.15, { rate: 2.2, at: rnd(0.35, 0.55) });
    this.sample('imp_tin', pos, 0.18, { rate: rnd(1.6, 2.2), at: rnd(0.3, 0.5), var: 0.1, delay: false });
  }
  // взрыв: запись + инфранизкий удар + "звон в ушах" вблизи
  explosion(pos, big = true) {
    if (!this.ctx) return;
    const d = this.dist(pos);
    if (!this.sample(big ? 'boom' : 'bang', pos, 1.3, { ref: 8, roll: 0.6, var: 0.06, wet: 0.7, rate: big ? 0.9 : 1 })) {
      this.synth(pos, 1.2, { delay: true, wet: 0.7 }, (o, t) => { this.noiseBurst(o, t, 1.6, 'lowpass', 500, 0.3, 2.0); this.tone(o, t, 0.7, 90, 25, 'sine', 2.0); });
    }
    this.synth(pos, 1.0, { ref: 10, roll: 0.5, delay: true, wet: 0.2 }, (o, t) => {
      this.tone(o, t, 0.9, 60, 22, 'sine', 1.6, 0.005);
      this.noiseBurst(o, t + 0.15, 1.4, 'lowpass', 260, 0.4, 0.8);   // гул
      for (let i = 0; i < 6; i++) this.noiseBurst(o, t + 0.25 + Math.random() * 0.9, 0.05, 'bandpass', 1800 + Math.random() * 2000, 4, 0.25); // падающие обломки
    });
    if (d < 9) this.deafen(1 - d / 9);
  }
  deafen(k) {
    const c = this.ctx; if (!c) return;
    this.ears.frequency.cancelScheduledValues(c.currentTime);
    this.ears.frequency.setTargetAtTime(500 + 2500 * (1 - k), c.currentTime, 0.02);
    this.ringT = 0.8 + k * 1.8;
    this.synth(null, 0.12 * k, { wet: 0 }, (o, t) => this.tone(o, t, this.ringT + 0.8, 3800, 3600, 'sine', 1, 0.05));
  }

  // ---------- перезарядка ----------
  reloadFx(kind, weapon) {
    const map = { click: ['rl_shell', 1.6], slap: ['rl_magin', 1], slam: ['rl_magin', 0.85], rack: [weapon === 'shotgun' ? 'rl_pump' : 'rl_bolt', 1], shell: ['rl_shell', 1], cover: ['rl_magout', 1.2], magout: ['rl_magout', 1] };
    if (kind === 'drop') { this.sample('imp_plate', null, 0.25, { at: 0.38, rate: 1.4 }); this.sample('rl_magout', null, 0.5, {}); return; }
    if (kind === 'whoosh') return this.synth(null, 0.4, { wet: 0.1 }, (o, t) => this.noiseBurst(o, t, 0.35, 'bandpass', 400, 1.2, 0.8, 2400));
    if (kind === 'spin') return this.spin(0.6);
    const m = map[kind];
    if (m && this.sample(m[0], null, 0.75, { rate: m[1], wet: 0.12 })) return;
    this.synth(null, 0.5, { wet: 0.1 }, (o, t) => { this.noiseBurst(o, t, 0.05, 'bandpass', 2400, 5, 0.9); this.tone(o, t, 0.04, 1400, 700, 'square', 0.12); });
  }
  reload(stage) { this.reloadFx(stage ? 'rack' : 'click'); }
  empty() { this.synth(null, 0.5, { wet: 0.05 }, (o, t) => { this.noiseBurst(o, t, 0.03, 'bandpass', 3200, 6, 0.9); this.tone(o, t, 0.02, 2200, 1800, 'square', 0.1); }); }
  spin(vol = 0.4) { this.synth(null, vol, { wet: 0.1 }, (o, t) => { this.tone(o, t, 0.5, 90, 520, 'sawtooth', 0.12, 0.05); this.noiseBurst(o, t, 0.5, 'bandpass', 1200, 2, 0.3, 4000); }); }

  // ---------- интерфейс и курицы ----------
  hitmark(head = false) {
    this.synth(null, 0.5, { wet: 0 }, (o, t) => {
      if (head) { this.tone(o, t, 0.35, 2400, 2350, 'sine', 0.35, 0.002); this.tone(o, t, 0.25, 3600, 3550, 'sine', 0.12, 0.002); }
      else { this.tone(o, t, 0.05, 1500, 1200, 'triangle', 0.4); this.noiseBurst(o, t, 0.02, 'highpass', 6000, 1, 0.3); }
    });
  }
  killmark() {
    this.synth(null, 0.55, { wet: 0.05 }, (o, t) => {
      this.tone(o, t, 0.12, 1320, 1320, 'triangle', 0.4); this.tone(o, t + 0.1, 0.3, 1980, 1980, 'triangle', 0.4);
      this.tone(o, t + 0.1, 0.3, 2640, 2640, 'sine', 0.12);
    });
  }
  // "кудах!": тональный голос с формантами и хрипом
  cluck(vol = 0.6, pos = null, pitch = 1) {
    this.synth(pos, vol, { wet: 0.2, ref: 3 }, (o, t) => {
      const c = this.ctx;
      const notes = [[0, 0.07, 620, 480], [0.09, 0.08, 700, 520], [0.2, 0.22, 980, 560]];
      for (const [dt, dur, f0, f1] of notes) {
        const osc = c.createOscillator(); osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(f0 * pitch, t + dt); osc.frequency.exponentialRampToValueAtTime(f1 * pitch, t + dt + dur);
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, t + dt); g.gain.exponentialRampToValueAtTime(0.5, t + dt + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dt + dur);
        const f1n = c.createBiquadFilter(); f1n.type = 'bandpass'; f1n.frequency.value = 1100 * pitch; f1n.Q.value = 3;
        const f2n = c.createBiquadFilter(); f2n.type = 'bandpass'; f2n.frequency.value = 2600 * pitch; f2n.Q.value = 4;
        osc.connect(g); g.connect(f1n); g.connect(f2n); f1n.connect(o); f2n.connect(o);
        osc.start(t + dt); osc.stop(t + dt + dur + 0.02);
      }
      this.noiseBurst(o, t, 0.3, 'bandpass', 3000, 3, 0.12);
    });
  }
  hurt() {
    this.sample('imp_flesh', null, 0.6, { var: 0.1 });
    this.synth(null, 0.5, { wet: 0 }, (o, t) => this.tone(o, t, 0.12, 180, 70, 'sine', 0.7));
  }
  fleshHit(pos) { this.sample('imp_flesh', pos, 0.55, { var: 0.15 }); }
  heartbeat() { this.synth(null, 0.45, { wet: 0 }, (o, t) => { this.tone(o, t, 0.12, 60, 45, 'sine', 1); this.tone(o, t + 0.18, 0.1, 55, 42, 'sine', 0.7); }); }
  jump() { this.synth(null, 0.22, { wet: 0 }, (o, t) => this.noiseBurst(o, t, 0.1, 'bandpass', 700, 1.2, 0.6)); }
  flap(vol = 0.25) { this.synth(null, vol, { wet: 0 }, (o, t) => { this.noiseBurst(o, t, 0.08, 'bandpass', 500, 0.8, 0.8); this.noiseBurst(o, t + 0.01, 0.05, 'highpass', 3000, 0.6, 0.2); }); }
  egg(pos, vol = 0.6) { this.synth(pos, vol, { wet: 0.25 }, (o, t) => { this.tone(o, t, 0.15, 520, 260, 'triangle', 0.6); this.noiseBurst(o, t, 0.1, 'bandpass', 2400, 3, 0.4); }); }
  alarm() { this.synth(null, 0.35, { wet: 0.1 }, (o, t) => { for (let i = 0; i < 3; i++) this.tone(o, t + i * 0.22, 0.18, 880, 660, 'square', 0.2); }); }
  win() { this.synth(null, 0.5, { wet: 0.3 }, (o, t) => [523, 659, 784, 1046].forEach((f, i) => this.tone(o, t + i * 0.14, 0.4, f, f, 'triangle', 0.5))); }
  ui() { this.synth(null, 0.3, { wet: 0 }, (o, t) => this.tone(o, t, 0.05, 900, 1200, 'triangle', 0.3)); }

  // ---------- фон: ветер и птицы ----------
  ambience() {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 400; f.Q.value = 0.7;
    const g = c.createGain(); g.gain.value = 0.05;
    s.connect(f); f.connect(g); g.connect(this.master); s.start();
    const lfo = c.createOscillator(); lfo.frequency.value = 0.08;
    const lg = c.createGain(); lg.gain.value = 220; lfo.connect(lg); lg.connect(f.frequency); lfo.start();
    const lfo2 = c.createOscillator(); lfo2.frequency.value = 0.13;
    const lg2 = c.createGain(); lg2.gain.value = 0.025; lfo2.connect(lg2); lg2.connect(g.gain); lfo2.start();
    this.windGain = g;
    const bird = () => {
      if (this.ctx && this.enabled && this.space !== 'indoor' && Math.random() < 0.7) {
        const l = this.listener;
        const pos = { x: l.x + rnd(-40, 40), y: l.y + rnd(5, 15), z: l.z + rnd(-40, 40) };
        this.synth(pos, 0.25, { ref: 6, wet: 0.4 }, (o, t) => {
          const base = rnd(2500, 4200), n = 2 + Math.floor(Math.random() * 4);
          for (let i = 0; i < n; i++) this.tone(o, t + i * rnd(0.08, 0.14), 0.07, base * rnd(1, 1.2), base * rnd(0.7, 1.4), 'sine', 0.3, 0.005);
        });
      }
      setTimeout(bird, rnd(3000, 9000));
    };
    setTimeout(bird, 4000);
  }
  setWind(v) { if (this.windGain) this.windGain.gain.value = v; }
}
