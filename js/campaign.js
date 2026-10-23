// Кампания «Последнее яйцо»: сценарии миссий поверх обычной игры.
// Миссия — это список этапов (async-функций). Сценарий ждёт событий через промисы:
// await C.say(...), await C.until(() => ...), await C.cine([...]) — всё по игровому времени.
// Смерть — возрождение на контрольной точке, провал — перезапуск этапа.
import * as THREE from './lib/three.module.min.js';
import { WEAPONS, W, MAX_HP } from './weapons.js';
import { SX, SY, SZ } from './world.js';
import { Heli, Rain, Ash, Nuke } from './cinefx.js';
import { Music, CampSfx } from './music.js';
import { esc } from './hud.js';
import { HW, PH } from './game.js';

const $ = (id) => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export const DIFF = [
  { name: 'Новобранец', skill: 0, dmg: 0.5, note: 'Для знакомства с историей: враги слабее, ты крепче.' },
  { name: 'Солдат', skill: 1, dmg: 0.8, note: 'Как задумано: честный бой.' },
  { name: 'Ветеран', skill: 2, dmg: 1.25, note: 'Враги метко стреляют и быстро реагируют. Каждая пуля на счету.' },
];

// голоса персонажей: цвет имени, высота и темп синтезатора речи
export const SPEAKERS = {
  greb: { name: 'Кап. Гребень', color: '#ffb347', pitch: 0.55, rate: 1.02 },
  ryaba: { name: 'Ряба', color: '#8fe388', pitch: 1.25, rate: 1.12 },
  shpora: { name: 'Ген. Шпора', color: '#ff7a70', pitch: 0.7, rate: 0.98 },
  grill: { name: 'Ген. Гриль', color: '#79a6ff', pitch: 0.4, rate: 0.9 },
  kvochka: { name: 'Серж. Квочка', color: '#ffd23a', pitch: 1.05, rate: 1.15 },
  indyuk: { name: '«Индюк»', color: '#9ed0ff', pitch: 0.85, rate: 1.18, radio: true },
  hq: { name: 'Штаб', color: '#c9c9c9', pitch: 0.9, rate: 1.15, radio: true },
  tsypa: { name: 'Цыпа', color: '#ffe08a', pitch: 1.45, rate: 1.1 },
  sgt: { name: 'Серж. Петух', color: '#ff9f6b', pitch: 0.8, rate: 1.12 },
  okorok: { name: 'Полк. Окорок', color: '#79a6ff', pitch: 0.6, rate: 1.0 },
  ally: { name: 'Боец', color: '#ff9c90', pitch: 1.0, rate: 1.15 },
  enemy: { name: 'Бройлер', color: '#79a6ff', pitch: 0.75, rate: 1.15 },
  pukh: { name: 'Пух', color: '#ffffff', pitch: 1.1, rate: 1.1 },
  nar: { name: '', color: '#ffffff', pitch: 0.8, rate: 0.95 },
};

const QUOTES = [
  '«Курица — не птица, а солдат — не курица». — Сержант Квочка',
  '«Война не решает, кто прав. Только — кто остался». — Неизвестная несушка',
  '«В окопе нет атеистов. И нет яиц». — Капитан Гребень',
  '«Тот, кто прячется за мешками, живёт дольше того, кто их носит». — Старая поговорка',
  '«Никогда не перебегай дорогу под огнём. Особенно — если ты курица». — Устав Красного Гребня',
  '«Пуля — дура, а дробь — тем более». — Ряба',
  '«Генералы планируют войны. Курицы их доигрывают». — Рядовой Цыпа',
  '«Лучшая граната — та, что улетела к врагу». — Сержант Петух',
  '«Хочешь мира — береги яйцо». — Надпись на стене курятника',
  '«Высота — это жизнь. Особенно когда у тебя есть крылья». — «Индюк», пилот',
];

const ENEMY_NAMES = ['Бройлер', 'Окорочок', 'Наггетс', 'Филе', 'Голень', 'Крылышко', 'Шаурма', 'Табака', 'Бульон', 'Котлета', 'Шницель', 'Гриль', 'Фарш', 'Пашот', 'Окорок', 'Грудка', 'Чахохбили', 'Сациви', 'Пельмень', 'Кляр'];
const ALLY_NAMES = ['Пеструшка', 'Хохлатка', 'Ряженка', 'Квочка-2', 'Зёрнышко', 'Пшено', 'Клювик', 'Гребешок', 'Петушок', 'Несушка', 'Цыплёнок', 'Пух-2', 'Кочет', 'Шпорник', 'Кукарека', 'Перышко', 'Наседка', 'Ряба-2'];

const EMPTY = { mx: 0, my: 0, lookX: 0, lookY: 0, fire: false, jump: false, place: false, mine: false, sprint: false, aimHold: false, taps: [] };

export class Campaign {
  constructor(o) {
    this.o = o;
    this.M = o.mission; this.mi = o.index;
    this.D = DIFF[o.diff ?? 1];
    this.skill = this.D.skill;
    this.seed = this.M.seed || 1337;
    this.map = this.M.map;
    this.title = this.M.title;
    this.startStage = o.stage || 0;
    this.stage = this.startStage;
    this.t = 0; this.waiters = []; this.ticks = [];
    this.subQ = []; this.subCur = null; this.subT = 0;
    this.objs = []; this.objSeq = 0;
    this.cineOn = false; this.shots = null; this.hideMe = false;
    this.roll = 0; this.speedMul = 1; this.respawnTime = 4;
    this.loadout = null; this.nadeN = 3; this.silent = new Set();
    this.locked = false; this.dead = false; this.cp = null;
    this.bots = []; this.fxObjs = new Set();
    this.stats = { kills: 0, deaths: 0, shots: 0, hits: 0, t0: 0, head: 0 };
    this.alarm = false; this.pendingAlerts = [];
    this.fog = null; this.lightning = null; this.flashT = 0;
    this.eggDead = new Set();
    this.dmgMul = 1; this.invuln = false;
    this.voice = o.voice !== false && 'speechSynthesis' in window;
    this.audio = o.audio; this.music = o.music; this.sfx = o.sfx;
    this.timerEl = null;
  }

  // ===================== ЗАПУСК =====================
  begin() {
    const g = this.g;
    this.cp = this.M.start ? this.M.start.slice() : [g.world.info.spawns[0][0][0], g.world.info.spawns[0][0][1], g.world.info.spawns[0][0][2], 0];
    const st = this.M.stages[this.startStage];
    if (st && st.at) this.cp = st.at.slice();
    if (this.M.setup) this.M.setup(this, this.startStage);
    if (this.startStage > 0) for (let i = 0; i < this.startStage; i++) if (this.M.stages[i].skip) this.M.stages[i].skip(this);
    g.hostSpawn(g.me);
    this.ui(true);
  }
  afterStart() {
    this.stats.t0 = this.t;
    this.run();
  }
  // брифинг: спутниковый снимок района (камера высоко над картой), текст печатается по буквам
  async briefing() {
    const B = this.M.brief, g = this.g;
    if (!B) return;
    const el = $('brief');
    document.body.classList.add('briefing');
    el.classList.remove('hidden'); $('brGo').classList.add('hidden');
    $('brN').textContent = `МИССИЯ ${this.mi}${this.mi === 0 ? ' · ПРОЛОГ' : ''}`;
    $('brT').textContent = '«' + this.M.title + '»';
    $('brMeta').textContent = B.meta.join('\n');
    $('brCoord').textContent = B.coord || `${(51 + this.mi * 1.37).toFixed(4)}° С.Ш.\n${(39 + this.mi * 2.11).toFixed(4)}° В.Д.\nСПУТНИК «КЛЮВ-3»`;
    this.locked = true;
    // на ПК курсор должен быть свободен, чтобы нажать «НАЧАТЬ»
    this.cursor = true;
    if (document.pointerLockElement) document.exitPointerLock();
    const cam = g.camera, far0 = cam.far, fog0 = this.fog;
    cam.far = 1500; cam.updateProjectionMatrix(); this.fog = [600, 1400];
    const c = B.view || [SX / 2, 0, SZ / 2];
    const h = Math.max(SX, SZ) * 0.62 + 30;
    this.cine([{ from: [c[0] - 30, h, c[2] + 40], to: [c[0] + 30, h * 0.9, c[2] + 20], look: [c[0] - 10, 0, c[2]], lookTo: [c[0] + 10, 0, c[2] - 5], dur: 60, fov: 55, lin: true }], { skip: false, hold: true, hideMe: true });
    this.music.play('tension');
    const txt = $('brText'); txt.innerHTML = '';
    const full = B.text.join('\n\n');
    let skip = false;
    const tapSkip = () => { skip = true; };
    this.briefSkip = tapSkip;
    el.addEventListener('pointerdown', tapSkip);
    for (let k = 0; k <= full.length && !this.dead; k++) {
      if (skip) k = full.length;
      txt.innerHTML = esc(full.slice(0, k)).replace(/\n/g, '<br>') + '<span class="cur"></span>';
      if (k % 3 === 0 && !skip) this.sfx.type();
      if (!skip) await new Promise(r => setTimeout(r, full[k - 1] === '\n' ? 160 : 16));
    }
    el.removeEventListener('pointerdown', tapSkip);
    $('brGo').classList.remove('hidden');
    await new Promise(r => { $('brGo').onclick = r; this.brGo = r; });
    this.brGo = null;
    this.cursor = false;
    this.o.onGo && this.o.onGo();
    this.sfx.boom();
    await this.fade('black', 0.5);
    el.classList.add('hidden');
    document.body.classList.remove('briefing');
    cam.far = far0; cam.updateProjectionMatrix(); this.fog = fog0;
    if (!this.fog) g.applyQuality(g.settings.quality);
    if (this.envState) this.envApply();
    this.endCine();
    this.locked = false;
  }
  async run() {
    try {
      if (this.startStage === 0) await this.briefing();
      else await this.fade('black', 0);
      this.stats.t0 = this.t;
      if (this.M.intro && this.startStage === 0) await this.M.intro(this);
      if (!this.M.keepBlack || this.startStage > 0) this.fade(null, 1.2);
      for (let i = this.startStage; i < this.M.stages.length; i++) {
        if (this.dead) return;
        this.stage = i;
        const st = this.M.stages[i];
        if (i > this.startStage && st.at) this.checkpoint(st.at, true);
        await st.run(this);
      }
      if (!this.dead) this.complete();
    } catch (e) {
      console.error(e);
      if (!this.dead) this.fail('Ошибка сценария: ' + (e && e.message || e));
    }
  }

  // ===================== КАДР =====================
  update(dt) {
    if (this.dead && !this.keepTicking) return;
    this.t += dt;
    const g = this.g;
    // ожидания сценария
    for (let i = 0; i < this.waiters.length; i++) {
      const w = this.waiters[i];
      let r = false;
      try { r = w.fn ? !!w.fn(dt) : false; } catch (e) { console.error(e); r = true; }
      if (r || (w.until !== undefined && this.t >= w.until)) { this.waiters.splice(i--, 1); w.res(r); }
    }
    for (let i = 0; i < this.ticks.length; i++) { let r = false; try { r = this.ticks[i](dt); } catch (e) { console.error(e); r = true; } if (r === true) this.ticks.splice(i--, 1); }
    if (this.M.tick) this.M.tick(this, dt);
    // отложенная тревога (часовые кричат друг другу)
    for (let i = 0; i < this.pendingAlerts.length; i++) {
      const a = this.pendingAlerts[i];
      if (this.t >= a.t) { this.pendingAlerts.splice(i--, 1); this.alertBot(a.b, a.pos, a.chain); }
    }
    // убираем тела ботов, которые не возрождаются
    for (const b of this.bots) if (!b.alive && b.noRespawn && !b.removed && g.now - (b.diedAt || g.now) > 7) { b.removed = true; g.removePlayer(b.id); }
    if (this.bots.length > 60) this.bots = this.bots.filter(b => !b.removed);
    // эффекты
    for (const f of this.fxObjs) f.update(dt, g.camera);
    // туман и молнии
    if (this.fog) { g.scene.fog.near = this.fog[0]; g.scene.fog.far = this.fog[1]; }
    if (this.lightning) this.updLightning(dt);
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.envApply(); }
    this.updSubs(dt);
    this.updMarker();
    this.updTimer();
  }

  // ===================== API СЦЕНАРИЯ =====================
  wait(s) { return new Promise(res => this.waiters.push({ until: this.t + s, res })); }
  until(fn, timeout) { return new Promise(res => this.waiters.push({ fn, until: timeout !== undefined ? this.t + timeout : undefined, res })); }
  tick(fn) { this.ticks.push(fn); return () => { const i = this.ticks.indexOf(fn); if (i >= 0) this.ticks.splice(i, 1); }; }
  get me() { return this.g.me; }
  dist(p, a) { return Math.hypot(p.pos.x - a[0], (a[1] === undefined ? 0 : p.pos.y - a[1]) * 0.5, p.pos.z - a[2]); }
  near(a, r = 3, p = this.g.me) { return p.alive && Math.hypot(p.pos.x - a[0], p.pos.z - a[2]) < r && (a[1] === undefined || Math.abs(p.pos.y - a[1]) < 4); }
  inBox(b, p = this.g.me) { const q = p.pos; return p.alive && q.x >= b[0] && q.x <= b[3] && q.y >= b[1] - 0.5 && q.y <= b[4] + 0.5 && q.z >= b[2] && q.z <= b[5]; }
  reach(a, r = 3) { return this.until(() => this.near(a, r)); }

  // ---------- курицы ----------
  spawn(team, x, y, z, o = {}) {
    const g = this.g, id = g.botSeq++;
    const used = new Set([...g.players.values()].map(p => p.name));
    const pool = team === 0 ? ALLY_NAMES : ENEMY_NAMES;
    let name = o.name || pool.find(n => !used.has(n)) || (pool[id % pool.length] + '-' + (id % 100));
    while (g.world.boxHits(x - HW, y, z - HW, x + HW, y + PH, z + HW) && y < SY - 2) y++;
    const p = g.addPlayer(id, name, team, true, false, { vest: o.vest, hat: o.hat ?? (team === 1 ? (Math.random() < 0.5 ? 'helmet' : null) : o.hatAlly), capColor: o.capColor, tag: o.tag, noTag: o.noTag ?? (team === 1 && !o.name) });
    if (p.model.tag && o.noTag === undefined && team === 1 && !o.name) { p.model.root.remove(p.model.tag); p.model.tag = null; }
    const wpn = o.weapon ?? (team === 1 ? [W.AK, W.AK, W.LMG, W.SHOTGUN, W.AK][Math.floor(Math.random() * 5)] : [W.AK, W.AK, W.LMG][Math.floor(Math.random() * 3)]);
    p.weapon = wpn; p.model.setWeapon(wpn);
    p.ai = { fixWeapon: wpn, fixJob: o.job || 'rush', order: o.order || null, calm: !!o.calm, passive: !!o.passive, puppet: !!o.puppet, sight: o.sight, calmSight: o.calmSight, ear: o.ear, silent: !!o.silent };
    p.noRespawn = !o.respawn; p.god = !!o.god; p.ghost = !!o.ghost; p.noRegen = !!o.noRegen;
    p.res = 60; p.group = o.group || null; p.spawnHp = o.hp; p.armor = o.armor || 1; p.home = o.home || null;
    p.nadesN = o.nades ?? (team === 1 ? (Math.random() < 0.4 ? 1 : 0) : 1);
    const yaw = o.yaw ?? Math.atan2(-(g.me.pos.x - x), -(g.me.pos.z - z));
    g.emit({ t: 'spawn', id, x, y, z, yaw });
    p.spawnProt = g.now + (o.prot ?? 0.3);
    this.bots.push(p);
    return p;
  }
  // несколько сразу: list = [[x, y, z, opts?], ...]
  squad(team, list, common = {}) { return list.map(a => this.spawn(team, a[0], a[1], a[2], { ...common, ...(a[3] || {}) })); }
  group(name) { return this.bots.filter(b => b.group === name && !b.removed); }
  aliveIn(name) { return this.bots.filter(b => b.group === name && b.alive && !b.removed).length; }
  cleared(name) { return this.until(() => this.aliveIn(name) === 0); }
  enemies() { return this.bots.filter(b => b.team === 1 && b.alive && !b.removed); }
  allies() { return this.bots.filter(b => b.team === 0 && b.alive && !b.removed); }
  order(list, o) { for (const b of [].concat(list)) if (b && b.ai) b.ai.order = typeof o === 'function' ? o(b) : (o ? { ...o } : null); }
  kill(b) { if (b && b.alive) { b.god = false; this.g.hostDamage(b, 9999, b.id, 'nade', false, b.pos); } }
  remove(b) { if (b && !b.removed) { b.removed = true; this.g.removePlayer(b.id); } }
  teleport(p, a) { p.pos.set(a[0], a[1], a[2]); p.vel.set(0, 0, 0); if (a[3] !== undefined) { p.yaw = a[3]; p.pitch = 0; } if (p.hist) p.hist = []; }
  // цель для карты путей: team 1 идёт к goal(0), team 0 — к goal(1)
  goal(team, a) {
    const g = this.g;
    if (!this.goals) this.goals = g.eggs.map(e => ({ team: e.team, pos: e.pos.clone() }));
    this.goals[team].pos.set(a[0], a[1], a[2]);
    const e = g.eggs[team];
    // невидимое яйцо — просто метка цели, его можно двигать (боты ориентируются на него)
    if (e && e.virtual) { e.pos.set(a[0], a[1], a[2]); e.mesh.position.copy(e.pos); }
    if (g.nav) g.nav.setGoals(this.goals);
  }
  // оставить на карте только нужные яйца: { 0: {virtual}, 1: {...} }
  eggs(def) {
    const g = this.g;
    for (const e of g.eggs) g.scene.remove(e.mesh);
    g.eggs = [0, 1].map(t => g.makeEgg({ team: t, x: def[t].at[0], y: def[t].at[1], z: def[t].at[2], virtual: !!def[t].virtual, hp: def[t].hp, style: def[t].style, scale: def[t].scale }));
    this.goals = null;
    if (g.nav) g.nav.setGoals(g.eggs);
  }

  // ---------- игрок ----------
  checkpoint(a, silent) {
    this.cp = a.slice();
    if (!silent) { this.toast('Контрольная точка'); }
    else this.toast('Контрольная точка');
  }
  weapons(list, o = {}) {
    this.loadout = list; this.nadeN = o.nades ?? this.nadeN;
    const me = this.g.me;
    if (me) {
      me.nades = this.nadeN;
      if (!this.allowWeapon(me.weapon)) { const i = list.find(w => w !== W.BUILD) ?? list[0]; if (i !== undefined) { me.weapon = -1; this.g.switchWeapon(i); } }
      if (o.res !== undefined) me.res = o.res;
    }
    this.g.hud.wslots.forEach((s, i) => s.classList.toggle('hidden', !this.allowWeapon(i)));
    $('btnBuild').classList.toggle('hidden', !this.allowWeapon(W.BUILD));
    $('btnNade').classList.toggle('hidden', this.nadeN <= 0 && !o.keepNade);
  }
  allowWeapon(i) { return !this.loadout || this.loadout.includes(i); }
  silence(keys) { this.silent = new Set(keys); }
  onSpawned(p) {
    if (p.isLocal) {
      p.nades = this.nadeN;
      if (this.loadout && !this.allowWeapon(p.weapon)) { const i = this.loadout.find(w => w !== W.BUILD) ?? this.loadout[0]; if (i !== undefined) { p.weapon = i; p.model.setWeapon(i); } }
      if (this.M.res !== undefined) p.res = Math.max(p.res, this.M.res);
      this.respawned = this.t;
    } else {
      if (p.spawnHp) p.hp = p.spawnHp;
      if (p.nadesN !== undefined) p.nades = p.nadesN;
    }
  }
  spawnPoint(p) {
    if (p.isLocal) return this.cp;
    if (p.home) return p.home;
    if (p.team === 0 && this.allyHome) return this.allyHome;
    return null;
  }

  // ===================== ХУКИ ИГРЫ =====================
  adjustDamage(v, dmg, a, wi) {
    if (v.onHit) v.onHit(dmg, a, wi);
    if (v.god) return 0;
    if (v.isLocal) { if (this.invuln) return 0; return dmg * this.D.dmg * this.dmgMul; }
    if (a && a.isLocal) { this.stats.hits++; return dmg / (v.armor || 1); }
    if (v.team === 0 && a && a.team === 1) return dmg * 0.7; // напарники чуть крепче
    void wi;
    return dmg / (v.armor || 1);
  }
  onKill(v, a, wi, head) {
    v.diedAt = this.g.now;
    if (a && a.isLocal && v !== a) { this.stats.kills++; if (head) this.stats.head++; }
    if (v.isLocal) { this.stats.deaths++; this.quote = QUOTES[Math.floor(Math.random() * QUOTES.length)]; }
    // часовые рядом видят тело
    if (v.team === 1) for (const b of this.bots) {
      if (!b.alive || b.team !== 1 || !b.ai || !b.ai.calm) continue;
      const d = b.pos.distanceTo(v.pos);
      if (d < 11) this.pendingAlerts.push({ t: this.t + rnd(0.6, 1.4), b, pos: a ? a.pos.clone() : v.pos.clone(), chain: true });
    }
    if (this.onKillCb) this.onKillCb(v, a, wi);
  }
  onEgg(e, attackerId) { this.eggDead.add(e.team); if (this.onEggCb) this.onEggCb(e, attackerId); }
  onEggHurt(e) {
    if (e.team === 0 && this.t > (this.eggWarnT || 0)) { this.eggWarnT = this.t + 10; this.g.hud.banner('ЯЙЦО АТАКУЮТ!', 'warn', 2.2); this.g.audio.alarm(); }
  }
  onAlert(b, target) {
    if (!this.alarm) { this.alarm = true; this.alarmAt = this.t; if (this.onAlarm) this.onAlarm(b, target); }
    // кричит соседям
    for (const q of this.bots) if (q !== b && q.alive && q.team === b.team && q.ai && q.ai.calm && q.pos.distanceTo(b.pos) < 24) this.pendingAlerts.push({ t: this.t + rnd(0.5, 1.6), b: q, pos: target.pos.clone(), chain: false });
  }
  alertBot(b, pos, chain) {
    if (!b.alive || !b.ai || !b.ai.calm) return;
    b.ai.calm = false;
    b.ai.lastSeen = { x: pos.x, y: pos.y, z: pos.z, t: this.g.now };
    if (b.ai.order && b.ai.order.type === 'patrol') b.ai.order = { type: 'goto', x: pos.x + rnd(-3, 3), y: pos.y, z: pos.z + rnd(-3, 3), r: 4 };
    else if (b.ai.order && b.ai.order.type === 'hold' && (b.ai.order.r || 2) < 4) b.ai.order.r = 6;
    if (!this.alarm) { this.alarm = true; this.alarmAt = this.t; if (this.onAlarm) this.onAlarm(b, null); }
    if (chain) for (const q of this.bots) if (q !== b && q.alive && q.team === b.team && q.ai && q.ai.calm && q.pos.distanceTo(b.pos) < 18) this.pendingAlerts.push({ t: this.t + rnd(0.6, 1.8), b: q, pos, chain: false });
  }
  // выстрел: шумит, будит часовых
  shot(p, w) {
    let r;
    if (p.isLocal) { this.stats.shots++; r = this.silent.has(w.key) ? 6 : w.key === 'hmg' ? 75 : w.key === 'rpg' ? 60 : 48; }
    else r = p.ai && p.ai.silent ? 0 : 40;
    this.noise(p, r);
  }
  noise(p, r) {
    if (!r) return;
    for (const b of this.bots) {
      if (!b.alive || b.team === p.team || !b.ai || !b.ai.calm) continue;
      if (b.pos.distanceTo(p.pos) < r) this.pendingAlerts.push({ t: this.t + rnd(0.3, 1.0), b, pos: p.pos.clone(), chain: false });
    }
  }
  filterInput(inp) {
    if (this.noGun && !this.cineOn && !this.locked) return { ...inp, fire: false, aimHold: false, place: false, mine: false, taps: inp.taps.filter(t => !/^(w\d|b\d|reload|nade|build|aim|next|prev)$/.test(t)) };
    if (this.cineOn || this.locked) {
      const taps = inp.taps.filter(t => t === 'pause' || t === 'score' || t === 'scoreOn' || t === 'scoreOff');
      return { ...EMPTY, taps };
    }
    return inp;
  }
  deathText() { return this.quote || ''; }

  // ===================== РОЛИКИ (камера) =====================
  // shots: [{ from, to?, look, lookTo?, dur, fov?, fovTo?, at?: () => [x,y,z], lookAt?: () => [x,y,z], shake?, roll?, lin? }]
  cine(shots, o = {}) {
    this.setCine(true, o);
    this.shots = { list: shots, i: 0, t: 0, o };
    return new Promise(res => { this.shots.res = res; });
  }
  setCine(on, o = {}) {
    this.cineOn = on;
    document.body.classList.toggle('cine', on);
    $('skipCine').classList.toggle('hidden', !(on && o.skip !== false));
    if (on) { this.hideMe = !!o.hideMe; const p = this.g.me; p.firing = false; p.aiming = false; }
    else { this.hideMe = false; this.g.camera.fov = this.g.baseFov; this.g.camera.updateProjectionMatrix(); }
  }
  endCine() {
    const S = this.shots;
    this.shots = null;
    this.setCine(false);
    if (S && S.res) S.res();
  }
  skip() {
    // пропуск ролика: перескакиваем на последний кадр
    const S = this.shots; if (!S) return;
    if (S.o.noSkip) return;
    S.i = S.list.length; S.t = 0;
  }
  camUpdate(dt, cam) {
    const S = this.shots;
    if (!this.cineOn || !S) return false;
    let sh = S.list[S.i];
    if (!sh) {
      if (S.o.hold) { const last = S.list[S.list.length - 1]; this.applyShot(last, 1, cam, dt); if (S.res) { const r = S.res; S.res = null; r(); } return true; }
      this.endCine(); return false;
    }
    S.t += dt;
    let u = sh.dur ? Math.min(1, S.t / sh.dur) : 0;
    this.applyShot(sh, u, cam, dt);
    if (sh.dur && S.t >= sh.dur) { S.i++; S.t = 0; if (sh.then) sh.then(); }
    return true;
  }
  applyShot(sh, u, cam, dt) {
    const e = sh.lin ? u : u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    const f = sh.at ? sh.at() : sh.from, t2 = sh.to || f;
    if (sh.at) cam.position.set(f[0], f[1], f[2]);
    else cam.position.set(f[0] + (t2[0] - f[0]) * e, f[1] + (t2[1] - f[1]) * e, f[2] + (t2[2] - f[2]) * e);
    const l = sh.lookAt ? sh.lookAt() : sh.look, l2 = sh.lookTo || l;
    if (l) cam.lookAt(l[0] + (l2[0] - l[0]) * e, l[1] + (l2[1] - l[1]) * e, l[2] + (l2[2] - l[2]) * e);
    const fov = sh.fov ? sh.fov + ((sh.fovTo ?? sh.fov) - sh.fov) * e : this.g.baseFov;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    if (sh.roll) cam.rotateZ(sh.roll * (sh.rollK ? Math.sin(this.t * sh.rollK) : 1));
    const shk = (sh.shake || 0) + (this.g.shake || 0) * 0.5;
    if (shk > 0.001) { cam.position.x += (Math.random() - 0.5) * shk * 0.15; cam.position.y += (Math.random() - 0.5) * shk * 0.15; cam.rotateZ((Math.random() - 0.5) * shk * 0.03); }
    this.g.shake = Math.max(0, (this.g.shake || 0) - dt * 2);
  }

  // затемнение экрана: 'black' | 'white' | 'red' | null
  fade(to, dur = 1) {
    const el = $('fadeL');
    el.style.transition = `opacity ${dur}s ease, background ${dur > 0 ? 0.01 : 0}s`;
    if (to) { el.style.background = to === 'white' ? '#fff' : to === 'red' ? '#5a0000' : '#000'; el.style.opacity = 1; }
    else el.style.opacity = 0;
    return this.wait(dur);
  }
  // буквы появляются по одной: место, время, персонаж (как в начале миссий MW)
  async stamp(lines) {
    const el = $('stamp'); el.innerHTML = ''; el.classList.add('show');
    for (const [i, ln] of lines.entries()) {
      const d = document.createElement('div'); d.className = 'l' + i; el.appendChild(d);
      for (let k = 1; k <= ln.length; k++) { d.textContent = ln.slice(0, k); if (k % 2) this.sfx.type(); await this.wait(0.035); }
      await this.wait(0.25);
    }
    this.wait(4).then(() => el.classList.remove('show'));
  }
  toast(text) {
    const el = $('campToast'); el.textContent = text; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }
  hint(text, dur = 5) {
    const el = $('campHint'); el.innerHTML = text; el.classList.add('show');
    clearTimeout(this.hintT); this.hintT = setTimeout(() => el.classList.remove('show'), dur * 1000);
  }
  banner(text, sub = '', dur = 3, cls = '') { this.g.hud.banner(text, cls, dur, sub); }

  // ---------- субтитры и голоса ----------
  say(who, text, o = {}) {
    return new Promise(res => { this.subQ.push({ who, text, o, res }); });
  }
  line(who, text, o = {}) { this.say(who, text, o); }
  updSubs(dt) {
    if (!this.subCur && this.subQ.length) {
      const s = this.subCur = this.subQ.shift();
      const S = SPEAKERS[s.who] || { name: s.who, color: '#fff' };
      const el = document.createElement('div');
      el.className = 'sub';
      el.innerHTML = (S.name ? `<b style="color:${S.color}">${esc(S.name)}:</b> ` : '') + esc(s.text);
      const box = $('subs'); box.appendChild(el);
      while (box.childElementCount > 3) box.firstChild.remove();
      s.el = el;
      s.left = s.o.dur ?? Math.max(2.0, 0.8 + s.text.length * 0.058);
      s.min = s.left;
      if (S.radio || s.o.radio) this.sfx.radio();
      if (this.voice && !s.o.mute) this.speak(s, S);
    }
    const s = this.subCur;
    if (!s) return;
    s.left -= dt;
    const speaking = s.utt && !s.spoken && s.left > -s.min * 2;
    if (s.left <= 0 && !speaking) {
      this.subCur = null;
      const el = s.el;
      el.classList.add('out'); setTimeout(() => el.remove(), 2500);
      s.res();
    }
  }
  speak(s, S) {
    try {
      const ss = window.speechSynthesis;
      const u = new SpeechSynthesisUtterance(s.text.replace(/[«»]/g, ''));
      u.lang = 'ru-RU';
      if (!this.ruVoice) { const vs = ss.getVoices(); this.ruVoice = vs.find(v => /^ru/i.test(v.lang) && /google|yandex|milena|irina/i.test(v.name)) || vs.find(v => /^ru/i.test(v.lang)) || null; }
      if (this.ruVoice) u.voice = this.ruVoice;
      else if (ss.getVoices().length) { return; } // русского голоса нет — только субтитры
      u.pitch = S.pitch ?? 1; u.rate = (S.rate ?? 1.05) * 1.05; u.volume = Math.min(1, (this.audio.volume ?? 1));
      u.onend = u.onerror = () => { s.spoken = true; };
      s.utt = u;
      ss.speak(u);
    } catch (e) { /* без голоса */ }
  }
  shutUp() { try { if (this.voice) window.speechSynthesis.cancel(); } catch (e) { /* ignore */ } this.subQ.forEach(s => s.res()); this.subQ = []; if (this.subCur) { this.subCur.res(); this.subCur = null; } $('subs').innerHTML = ''; }

  // ---------- задачи ----------
  obj(text, o = {}) {
    const h = { id: ++this.objSeq, text, mark: o.mark || null, done: false, failed: false, n: o.n, max: o.max, opt: !!o.opt };
    h.complete = () => { if (h.done) return; h.done = true; h.doneT = this.t; this.sfx.objective(true); this.renderObjs(); this.toast('Задача выполнена'); };
    h.set = (t) => { h.text = t; this.renderObjs(); };
    h.count = (n, max = h.max) => { if (h.n === n && h.max === max) return; h.n = n; h.max = max; this.renderObjs(); };
    h.at = (m) => { h.mark = m; };
    this.objs.push(h);
    this.sfx.objective(false);
    this.renderObjs();
    if (!o.quiet) this.toast('Новая задача');
    return h;
  }
  renderObjs() {
    const el = $('objPanel');
    this.objs = this.objs.filter(h => !h.done || this.t - h.doneT < 6);
    el.innerHTML = this.objs.slice(-4).map(h => `<div class="ob ${h.done ? 'done' : ''}"><i>${h.done ? '✔' : '◆'}</i>${esc(h.text)}${h.max ? ` <small>${h.n || 0}/${h.max}</small>` : ''}</div>`).join('');
    if (this.objs.some(h => h.done)) setTimeout(() => this.renderObjs(), 6200);
  }
  updMarker() {
    const el = $('objMark');
    const h = [...this.objs].reverse().find(q => !q.done && q.mark);
    if (!h || this.cineOn || !this.g.me.alive) { el.style.display = 'none'; return; }
    let m = typeof h.mark === 'function' ? h.mark() : h.mark;
    if (m && m.pos) m = [m.pos.x, m.pos.y + 2.2, m.pos.z];
    if (!m) { el.style.display = 'none'; return; }
    const cam = this.g.camera;
    _v.set(m[0], m[1], m[2]);
    const d = cam.position.distanceTo(_v);
    _v.project(cam);
    let x = _v.x, y = _v.y;
    const behind = _v.z > 1;
    if (behind) { x = -x; y = -y; }
    const edge = behind || Math.abs(x) > 0.92 || Math.abs(y) > 0.86;
    if (edge) { const k = Math.max(Math.abs(x) / 0.92, Math.abs(y) / 0.86); x /= k; y /= k; if (behind) y = Math.min(y, -0.6); }
    el.style.display = '';
    el.style.transform = `translate(${((x + 1) / 2 * innerWidth).toFixed(0)}px, ${((1 - y) / 2 * innerHeight).toFixed(0)}px)`;
    el.classList.toggle('edge', edge);
    el.lastChild.textContent = Math.round(d) + ' м';
  }
  // обратный отсчёт; onEnd вызывается, когда время вышло
  timer(sec, label, onEnd) {
    const T = { end: this.t + sec, label, onEnd, on: true, get left() { return Math.max(0, this.end - this.c.t); } };
    T.c = this;
    T.stop = () => { T.on = false; if (this.curTimer === T) { this.curTimer = null; $('campTimer').classList.add('hidden'); } };
    this.curTimer = T;
    $('campTimer').classList.remove('hidden');
    return T;
  }
  updTimer() {
    const T = this.curTimer;
    if (!T || !T.on) return;
    const left = T.left;
    const s = Math.ceil(left);
    $('campTimer').innerHTML = `<small>${esc(T.label || '')}</small>${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    $('campTimer').classList.toggle('low', left < 20);
    if (left <= 0) { T.stop(); if (T.onEnd) T.onEnd(); }
  }

  // ---------- мир и эффекты ----------
  // высота, на которой стоят (над верхним твёрдым блоком; листву и брёвна пропускаем)
  gy(x, z) {
    const w = this.g.world, xi = Math.floor(x), zi = Math.floor(z);
    for (let y = SY - 1; y > 0; y--) { const id = w.get(xi, y, zi); if (id && id !== 5 && id !== 6 && w.solid(xi, y, zi)) return y + 1; }
    return 1;
  }
  // взрыв только для атмосферы (без урона)
  fakeBoom(a, r = 4) {
    const g = this.g, p = new THREE.Vector3(a[0], a[1], a[2]);
    g.fx.explosion(p, r, 1); g.audio.explosion(p, true);
    const d = g.camera.position.distanceTo(p);
    g.shake = Math.min(1.2, g.shake + Math.max(0, 0.8 - d / 40));
  }
  // артиллерия по площади: настоящие взрывы, но не ближе minD к игроку
  artillery(box, every = [3, 7], minD = 7, kind = 'nade') {
    let next = this.t + rnd(every[0], every[1]);
    return this.tick(() => {
      if (this.t < next) return false;
      next = this.t + rnd(every[0], every[1]);
      for (let k = 0; k < 6; k++) {
        const x = rnd(box[0], box[2]), z = rnd(box[1], box[3]);
        if (Math.hypot(x - this.g.me.pos.x, z - this.g.me.pos.z) < minD) continue;
        const y = this.gy(x, z);
        this.sfx.a.synth({ x, y: y + 8, z }, 0.5, { wet: 0.2 }, (o, t) => this.sfx.a.tone(o, t, 0.9, 1800, 500, 'sine', 0.25, 0.05));
        this.wait(0.9).then(() => { if (!this.dead) this.explode([x, y + 0.3, z], kind, -1); });
        break;
      }
      return false;
    });
  }
  // надписи на чёрном (как эпитафия в конце миссии)
  async epitaph(lines, hold = 3) {
    const el = $('crawl'), box = $('crawlText');
    el.classList.remove('hidden'); $('crawlSkip').classList.add('hidden');
    box.className = ''; box.innerHTML = '';
    for (const l of lines) {
      const p = document.createElement('p');
      p.className = l[0] === '#' ? 'big' : l[0] === '~' ? 'dim' : '';
      p.textContent = l.replace(/^[#~]/, ''); box.appendChild(p);
      requestAnimationFrame(() => p.classList.add('on'));
      await this.wait(1.2 + l.length * 0.045);
    }
    await this.wait(hold);
    el.classList.add('hidden'); $('crawlSkip').classList.remove('hidden');
  }
  explode(a, kind = 'rocket', owner = -1) { this.g.hostExplode(a[0], a[1], a[2], kind, owner); }
  ignite(x, y, z, dur) { return this.g.fire.ignite(x, y, z, -1, dur); }
  block(x, y, z, id) { this.g.hostSetBlock(x, y, z, id, 0); }
  fill(x0, y0, z0, x1, y1, z1, id) { for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (this.g.world.get(x, y, z) !== id) this.g.hostSetBlock(x, y, z, id, 0); }
  heli(o = {}) {
    const h = new Heli(this.g.scene, o);
    if (o.at) h.set(o.at[0], o.at[1], o.at[2], o.yaw || 0);
    h.update(0);
    this.fxObjs.add(h);
    if (o.sound !== false) h.snd = this.sfx.loop('heli', () => h.pos);
    if (h.snd) h.snd.set(o.vol ?? 1.1, 0.5);
    const g = this.g;
    // пыль от винта у земли
    h.dustT = 0;
    const upd = h.update.bind(h);
    h.update = (dt, cam) => {
      upd(dt, cam);
      h.dustT -= dt;
      if (h.dustT <= 0 && h.rotorV > 0.5) {
        h.dustT = 0.12;
        const x = Math.floor(h.pos.x), z = Math.floor(h.pos.z);
        let gy = -1; for (let y = Math.floor(h.pos.y); y > Math.max(0, h.pos.y - 14); y--) if (g.world.solid(x, y, z) || g.world.liquid(x, y, z)) { gy = y + 1; break; }
        if (gy > 0) { const a = Math.random() * 6.28, sp = rnd(6, 10); g.vfx.puff(h.pos.x + Math.cos(a) * 2, gy + 0.3, h.pos.z + Math.sin(a) * 2, Math.cos(a) * sp, 0.4, Math.sin(a) * sp, rnd(1.2, 2), 0.8, 2.8, 0.75, 0.35, 0, 0, { drag: 1.6, buoy: 0.1 }); }
      }
    };
    h.kill = () => { this.fxObjs.delete(h); h.dispose(); if (h.snd) h.snd.stop(); };
    return h;
  }
  rain(on, n) {
    if (this.rainFx) { this.fxObjs.delete(this.rainFx); this.rainFx.dispose(); this.rainFx = null; }
    if (this.rainSnd) { this.rainSnd.stop(); this.rainSnd = null; }
    if (!on) return;
    this.rainFx = new Rain(this.g.scene, this.g.world, n || Math.round(500 + 700 * this.g.fx.q));
    this.fxObjs.add(this.rainFx);
    this.rainSnd = this.sfx.loop('rain'); if (this.rainSnd) this.rainSnd.set(0.22, 1);
  }
  ash(on, color, size, fall, n) {
    if (this.ashFx) { this.fxObjs.delete(this.ashFx); this.ashFx.dispose(); this.ashFx = null; }
    if (!on) return;
    this.ashFx = new Ash(this.g.scene, n || Math.round(500 + 900 * this.g.fx.q), color, size, fall);
    this.fxObjs.add(this.ashFx);
  }
  nuke(a, k = 1) {
    const n = new Nuke(this.g.scene, a[0], a[1], a[2], k);
    n.update(0, this.g.camera);
    this.fxObjs.add(n);
    const cam = this.g.camera; cam.far = 4000; cam.updateProjectionMatrix();
    return n;
  }
  addFx(obj) { this.fxObjs.add(obj); return obj; }
  // окружение: небо, туман, свет, ночь
  env(o) {
    this.envState = { ...(this.envState || {}), ...o };
    this.envApply();
  }
  envApply(flash = 0) {
    const g = this.g, E = this.envState || {};
    if (!g) return;
    const sky = new THREE.Color(E.sky ?? (g.world.info.sky || 0x9fd0ff));
    if (flash) sky.lerp(new THREE.Color(0xdfe8ff), flash);
    g.scene.background = sky;
    g.scene.fog.color.copy(sky);
    if (g.skyMat) {
      g.skyMat.uniforms.hor.value.copy(sky);
      g.skyMat.uniforms.zen.value.set(E.zen ?? sky.getHex()); if (flash) g.skyMat.uniforms.zen.value.lerp(new THREE.Color(0xffffff), flash * 0.6);
      g.skyMat.uniforms.sunCol.value.set(E.sunGlow ?? 0xfff1c8);
    }
    if (E.fog) this.fog = E.fog;
    g.env.hemi = (E.hemi ?? 1.6) * (1 + flash * 3); g.env.sun = (E.sun ?? 1.8) * (1 + flash);
    if (E.hemiColor !== undefined) g.hemi.color.set(E.hemiColor);
    if (E.ground !== undefined) g.hemi.groundColor.set(E.ground);
    if (E.sunColor !== undefined) g.sun.color.set(E.sunColor);
    g.updateLights();
    const night = E.tint ?? 0xffffff;
    const tc = new THREE.Color(night); if (flash) tc.lerp(new THREE.Color(0xffffff), flash * 0.8);
    if (g.mesher.lit) tc.lerp(new THREE.Color(0xffffff), 0.6); // при солнечном освещении мир и так темнеет от света
    g.mesher.setNight(tc, E.lamp ?? 0);
    g.vfx.U.uAmb.value.copy(new THREE.Color(E.smoke ?? night)).lerp(new THREE.Color(0xffffff), 0.25);
    if (g.vm && g.vm.setLight) g.vm.setLight(Math.min(1, ((E.hemi ?? 1.6) + (E.sun ?? 1.8)) / 3.4) * (1 + flash), E.vmColor ?? E.hemiColor ?? 0xffffff);
    if (g.sunSprite) g.sunSprite.visible = !E.noSun;
    if (g.clouds) g.clouds.visible = !E.noClouds && g.Q.clouds;
  }
  storm(on, every = [6, 14]) { this.lightning = on ? { next: this.t + rnd(3, 6), every } : null; }
  updLightning(dt) {
    const L = this.lightning;
    if (this.t < L.next) return;
    L.next = this.t + rnd(L.every[0], L.every[1]);
    const d = rnd(0.2, 1.5);
    this.envApply(0.9); this.flashT = 0.07;
    setTimeout(() => { if (!this.dead) { this.envApply(0.6); this.flashT = 0.06; } }, 140);
    this.wait(d).then(() => this.sfx.thunder(d));
  }

  // ===================== КОНЕЦ =====================
  stopAll() {
    this.shutUp();
    this.waiters = []; this.ticks = [];
    if (this.curTimer) this.curTimer.stop();
    this.sfx.stopAll();
  }
  fail(reason) {
    if (this.dead) return;
    this.dead = true;
    this.stopAll();
    this.music.play('dread');
    this.locked = true; this.cursor = true;
    this.setCine(false);
    const el = $('mres');
    el.className = 'fail';
    el.innerHTML = `<div class="mr-card"><h2>МИССИЯ ПРОВАЛЕНА</h2><p>${esc(reason || '')}</p><p class="q">${esc(QUOTES[Math.floor(Math.random() * QUOTES.length)])}</p>
      <div class="btnrow"><button id="mrRetry" class="primary">↻ С контрольной точки</button><button id="mrQuit">Выйти</button></div></div>`;
    $('mrRetry').onclick = () => { el.className = 'hidden'; this.o.onResult({ type: 'retry', stage: this.stage }); };
    $('mrQuit').onclick = () => { el.className = 'hidden'; this.o.onResult({ type: 'quit' }); };
    if (document.pointerLockElement) document.exitPointerLock();
  }
  complete() {
    if (this.dead) return;
    this.dead = true;
    this.stopAll();
    this.locked = true; this.cursor = true;
    const s = this.stats, t = Math.round(this.t - s.t0);
    const acc = s.shots ? Math.round(s.hits / s.shots * 100) : 0;
    const next = this.o.hasNext;
    const el = $('mres');
    el.className = 'win';
    el.innerHTML = `<div class="mr-card"><h2>МИССИЯ ВЫПОЛНЕНА</h2><h3>${esc(this.M.title)}</h3>
      <div class="mr-stats"><div><b>${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}</b><small>время</small></div><div><b>${s.kills}</b><small>врагов</small></div><div><b>${s.head}</b><small>в голову</small></div><div><b>${acc}%</b><small>точность</small></div><div><b>${s.deaths}</b><small>смертей</small></div></div>
      <div class="btnrow">${next ? '<button id="mrNext" class="primary">▶ Следующая миссия</button>' : ''}<button id="mrQuit">${next ? 'В меню' : 'Финал'}</button></div></div>`;
    if (next) $('mrNext').onclick = () => { el.className = 'hidden'; this.o.onResult({ type: 'next', stats: s }); };
    $('mrQuit').onclick = () => { el.className = 'hidden'; this.o.onResult({ type: next ? 'menu' : 'end', stats: s }); };
    if (document.pointerLockElement) document.exitPointerLock();
  }
  ui(on) {
    $('campUI').classList.toggle('hidden', !on);
    $('subs').innerHTML = ''; $('objPanel').innerHTML = ''; $('campTimer').classList.add('hidden');
  }
  dispose() {
    this.dead = true;
    this.stopAll();
    for (const f of this.fxObjs) { if (f.kill) f.kill(); else f.dispose(); }
    this.fxObjs.clear();
    this.setCine(false);
    this.ui(false);
    if (this.g.vm && this.g.vm.setLight) this.g.vm.setLight(1);
    $('fadeL').style.transition = 'none'; $('fadeL').style.opacity = 0;
    $('stamp').classList.remove('show');
    $('crawl').classList.add('hidden'); $('crawlSkip').classList.remove('hidden');
    document.body.classList.remove('nogun');
    this.g.hud.wslots.forEach(s => s.classList.remove('hidden'));
    $('btnBuild').classList.remove('hidden'); $('btnNade').classList.remove('hidden');
  }
}

export { V, rnd, SX, SY, SZ, MAX_HP };
