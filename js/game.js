// Ядро игры: сцена, игроки, стрельба, стройка, сеть (хост — авторитет по урону и блокам).
import * as THREE from './lib/three.module.min.js';
import { World, SX, SY, SZ } from './world.js';
import { Mesher } from './mesher.js';
import { BLOCKS, B, BUILDABLE, buildAtlas, teamWool, matOf } from './blocks.js';
import { ChickenModel, TEAM_COLORS } from './chicken.js';
import { FX } from './fx.js';
import { WEAPONS, W, EXPLOSIONS, MAX_HP, EGG_HP, RESPAWN_TIME, START_RES, MINE_DMG } from './weapons.js';
import { updateBot, BOT_NAMES, BOT_WEAPONS } from './bots.js';
import { esc } from './hud.js';
import { ViewModel } from './viewmodel.js';
import { Nav } from './nav.js';
import { preset } from './quality.js';

export const HW = 0.32, PH = 1.45, EYE = 1.32;
const GRAV = 25, JUMP_V = 8.3, GLIDE_V = -2.3, SPEED = 5.4;
const NET_DT = 1 / 15;
const EGG_BULLET_MUL = 0.35;
const SKY = 0x9fd0ff;

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _dir = new THREE.Vector3();
const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;

function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let t0 = 0, t1 = Infinity;
  const o = [ox, oy, oz], d = [dx, dy, dz], mn = [x0, y0, z0], mx = [x1, y1, z1];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) { if (o[a] < mn[a] || o[a] > mx[a]) return -1; continue; }
    let ta = (mn[a] - o[a]) / d[a], tb = (mx[a] - o[a]) / d[a];
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
    if (t0 > t1) return -1;
  }
  return t0;
}
function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = ox - cx, ly = oy - cy, lz = oz - cz;
  const b = lx * dx + ly * dy + lz * dz;
  const c = lx * lx + ly * ly + lz * lz - r * r;
  const h = b * b - c;
  if (h < 0) return -1;
  const t = -b - Math.sqrt(h);
  return t >= 0 ? t : -1;
}
function angleLerp(a, b, k) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

function crackTextures() {
  const out = [];
  let lines = [];
  for (let s = 0; s < 5; s++) {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 64;
    const c = cv.getContext('2d');
    const g = c.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, '#fff3b0'); g.addColorStop(0.5, '#ffd23a'); g.addColorStop(1, '#e8a417');
    c.fillStyle = g; c.fillRect(0, 0, 128, 64);
    for (let i = 0; i < 30; i++) { c.fillStyle = `rgba(255,255,255,${Math.random() * 0.25})`; c.fillRect(Math.random() * 128, Math.random() * 64, 3, 2); }
    for (let k = 0; k < 3; k++) {
      let x = Math.random() * 128, y = 5 + Math.random() * 20; const pts = [[x, y]];
      for (let j = 0; j < 6; j++) { x += (Math.random() - 0.5) * 20; y += 4 + Math.random() * 6; pts.push([x, y]); }
      lines.push(pts);
    }
    c.strokeStyle = '#3a2405'; c.lineWidth = 2.2;
    for (const pts of lines.slice(0, s * 3)) { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (const p of pts) c.lineTo(p[0], p[1]); c.stroke(); }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    out.push(t);
  }
  return out;
}

export class Game {
  constructor(o) {
    this.o = o;
    this.renderer = o.renderer;
    this.hud = o.hud; this.audio = o.audio; this.input = o.input; this.settings = o.settings;
    this.mode = o.mode; // 'host' | 'client' | 'solo'
    this.isHost = o.mode !== 'client';
    this.net = o.net || null;
    this.now = 0;

    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(SKY);
    scene.fog = new THREE.Fog(SKY, 35, 100);
    this.post = o.post || null;
    this.hemi = new THREE.HemisphereLight(0xe8f4ff, 0x7a6a4a, 1.6); scene.add(this.hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xfff2dd, 1.8); sun.position.set(0.5, 1, 0.3); scene.add(sun);
    this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 400);
    this.camera.rotation.order = 'YXZ';
    this.baseFov = this.settings.fov || 75;

    const atlas = buildAtlas();
    this.atlasURL = atlas.canvas.toDataURL();
    this.world = new World();
    this.mesher = new Mesher(this.world, scene, atlas.texture);
    this.world.onChange = (x, y, z) => { this.mesher.markBlock(x, y, z); if (this.nav) this.nav.markDirty(); };
    this.fx = new FX(scene, this.world, preset(this.settings.quality).fx);
    this.vm = new ViewModel(this.renderer, atlas.texture);
    this.vm.onEvent = (e) => {
      if (e === 'puff') return;
      if (e === 'cluck') { this.audio.cluck(0.45, null, 1.15); return; }
      if (e === 'slam' || e === 'slap') this.shake = Math.min(1, this.shake + (e === 'slam' ? 0.35 : 0.2));
      this.audio.reloadFx(e, this.me ? WEAPONS[this.me.weapon].key : '');
    };
    this.lastLook = [0, 0];
    this.makeSky();

    // подсветка блока в режиме стройки
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004));
    this.hl = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6 }));
    this.hl.visible = false; scene.add(this.hl);
    this.ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x66ff88, transparent: true, opacity: 0.15, depthWrite: false }));
    this.ghost.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 })));
    this.ghost.visible = false; scene.add(this.ghost);

    this.players = new Map();
    this.me = null; this.myId = -1;
    this.eggs = [];
    this.crackTex = crackTextures();
    this.projectiles = new Map();
    this.projSeq = 0;
    this.score = [0, 0];
    this.roundState = 'play';
    this.netT = 0;
    this.shake = 0;
    this.firstPerson = this.settings.view !== 'third';
    this.pendingBlk = [];
    this.pendingBd = new Map();
    this.tntQueue = [];
    this.eggWarnT = 0;
    this.enemyCheckT = 0;
    this.enemyUnder = false;
    this.ping = 0; this.pingT = 0;
    this.botSeq = 1000;
    this.pidSeq = 1; this.n2p = new Map(); this.p2n = new Map();
    this.snapFullT = 0;
    this.lastHurtSound = 0;
    this.diffChunks = [];
    this.ready = false;
    this.env = { hemi: 1.6, sun: 1.8 };
    this.applyQuality(this.settings.quality);
  }

  // графика: дальность, тени, освещение мира, облака
  applyQuality(q) {
    const P = this.Q = preset(q);
    const ov = this.settings.gfx || {};
    const far = P.far * (ov.far || 1);
    this.scene.fog.near = far * 0.35; this.scene.fog.far = far;
    this.camera.far = far + 20; this.camera.updateProjectionMatrix();
    if (this.clouds) this.clouds.visible = P.clouds;
    if (this.skyDome) this.skyDome.visible = P.clouds;
    const shadows = ov.shadows === true ? (P.shadows || 1024) : ov.shadows === false ? 0 : P.shadows;
    const r = this.renderer, sun = this.sun;
    const was = r.shadowMap.enabled;
    r.shadowMap.enabled = shadows > 0;
    r.shadowMap.type = shadows >= 2048 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    sun.castShadow = shadows > 0;
    if (shadows > 0) {
      const R = shadows >= 2048 ? 56 : 40;
      if (sun.shadow.map && sun.shadow.mapSize.x !== shadows) { sun.shadow.map.dispose(); sun.shadow.map = null; }
      sun.shadow.mapSize.set(shadows, shadows);
      const c = sun.shadow.camera; c.left = -R; c.right = R; c.top = R; c.bottom = -R; c.near = 1; c.far = 220; c.updateProjectionMatrix();
      sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
      this.shadowR = R;
      if (!sun.target.parent) this.scene.add(sun.target);
    }
    this.mesher.setLit(shadows > 0);
    if (was !== r.shadowMap.enabled) this.scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); });
    for (const p of this.players.values()) this.modelShadows(p.model);
    this.updateLights();
    if (this.ready) this.warmup();
  }
  modelShadows(m) {
    const on = this.renderer.shadowMap.enabled;
    m.root.traverse(o => { if (o.isMesh) { o.castShadow = on; o.receiveShadow = false; } });
    if (m.tag) m.tag.castShadow = false;
    m.shadow.visible = !on;
    m.shadowOff = on;
  }
  updateLights() {
    const lit = this.mesher.lit;
    this.hemi.intensity = this.env.hemi * (lit ? 1.18 : 1);
    this.sun.intensity = this.env.sun * (lit ? 1.05 : 1);
  }

  makeSky() {
    // небесный купол с градиентом: у горизонта цвет тумана, вверху глубже, вокруг солнца — свечение
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { hor: { value: new THREE.Color(SKY) }, zen: { value: new THREE.Color(0x3d7fd6) }, sunDir: { value: new THREE.Vector3(0.6, 0.75, 0.3).normalize() }, sunCol: { value: new THREE.Color(0xfff1c8) } },
      vertexShader: 'varying vec3 vD; void main() { vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w * 0.9999; }',
      fragmentShader: `uniform vec3 hor; uniform vec3 zen; uniform vec3 sunDir; uniform vec3 sunCol; varying vec3 vD;
        void main() { vec3 d = normalize(vD); float h = clamp(d.y, 0.0, 1.0);
          vec3 c = mix(hor, zen, pow(h, 0.55));
          float s = max(dot(d, sunDir), 0.0); c += sunCol * (pow(s, 12.0) * 0.35 + pow(s, 200.0) * 0.6);
          if (d.y < 0.0) c = hor;
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.skyDome = new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12), this.skyMat);
    this.skyDome.frustumCulled = false; this.skyDome.renderOrder = -10;
    this.scene.add(this.skyDome);
    // солнце
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const c = cv.getContext('2d');
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, '#fffbe8'); g.addColorStop(0.3, '#fff2b0'); g.addColorStop(1, 'rgba(255,240,180,0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    const st = new THREE.CanvasTexture(cv);
    this.sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: st, fog: false, depthWrite: false, transparent: true }));
    this.sunSprite.scale.set(40, 40, 1);
    this.scene.add(this.sunSprite);
    // облака: все коробки склеены в один меш — один вызов отрисовки
    const cg = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
    const cp = cg.attributes.position.array, parts = [];
    const m4 = new THREE.Matrix4();
    // полоса облаков шириной 300 повторена трижды — плывёт по кругу без скачков
    for (let i = 0; i < 20; i++) {
      const n = 2 + Math.floor(Math.random() * 3);
      const ox = Math.random() * 300, oy = 58 + Math.random() * 10, oz = Math.random() * 200 - 70;
      const sz = [], off = [];
      for (let k = 0; k < n; k++) { sz.push([8 + Math.random() * 10, 6 + Math.random() * 8]); off.push([k * 6 - n * 3, Math.random(), Math.random() * 6 - 3]); }
      for (const rep of [-300, 0, 300]) for (let k = 0; k < n; k++) {
        m4.makeScale(sz[k][0], 2, sz[k][1]).setPosition(ox + rep + off[k][0], oy + off[k][1], oz + off[k][2]);
        const a = new Float32Array(cp); new THREE.BufferAttribute(a, 3).applyMatrix4(m4); parts.push(a);
      }
    }
    const all = new Float32Array(parts.length * cp.length);
    parts.forEach((a, i) => all.set(a, i * cp.length));
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(all, 3));
    geo.computeBoundingSphere();
    this.clouds = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, fog: false }));
    this.clouds.frustumCulled = false;
    this.scene.add(this.clouds);
  }

  // ===================== СТАРТ =====================
  startHost(name, team, botsPerTeam, map = 'classic', opts = {}) {
    this.botSkill = opts.skill ?? 1; this.botBuild = opts.build ?? true;
    this.loadWorld(Math.floor(Math.random() * 1e9), map);
    this.botsPerTeam = botsPerTeam;
    this.myId = 0;
    this.me = this.addPlayer(0, name, team, false, true);
    for (const t of [0, 1]) for (let i = 0; i < botsPerTeam; i++) this.addBot(t);
    for (const p of this.players.values()) this.hostSpawn(p);
    if (this.net) {
      this.net.on('msg', (cid, m) => this.handleMsg(cid, m));
      this.net.on('leave', (cid) => this.hostLeave(cid));
    }
    this.ready = true;
    this.afterStart();
  }

  startClient(name, team) {
    this.myName = name; this.myTeam = team;
    this.token = Math.random().toString(36).slice(2) + Date.now().toString(36);
    this.attachNet(this.net);
    this.net.send({ t: 'hello', name, team, token: this.token });
  }
  attachNet(net) {
    net.on('msg', (m) => { if (net === this.net) this.onEvent(m); });
    net.on('close', () => { if (net === this.net) this.reconnect(); });
  }
  // обрыв связи: пробуем вернуться в ту же игру тем же игроком
  async reconnect() {
    if (this.reconnecting || this.disposed) return;
    this.reconnecting = true;
    this.hud.banner('СВЯЗЬ ПОТЕРЯНА', 'warn', 60, 'Переподключаемся…');
    const old = this.net;
    for (let i = 0; i < 6 && !this.disposed; i++) {
      try {
        const net = this.o.createNet();
        await net.start(this.o.code, (t) => this.hud.banner('СВЯЗЬ ПОТЕРЯНА', 'warn', 60, t));
        if (this.disposed) { net.close(); return; }
        try { old.close(); } catch (e) { /* ignore */ }
        this.net = net; this.via = net.mode || '';
        this.attachNet(net);
        this.rejoined = true;
        net.send({ t: 'hello', name: this.myName, team: this.myTeam, token: this.token });
        this.reconnecting = false;
        return;
      } catch (e) {
        this.hud.banner('СВЯЗЬ ПОТЕРЯНА', 'warn', 60, `Попытка ${i + 2} из 6…`);
        await new Promise(r => setTimeout(r, 2500));
      }
    }
    this.reconnecting = false;
    if (!this.disposed && this.o.onExit) this.o.onExit('Связь с хостом потеряна');
  }

  afterStart() {
    this.hud.buildHotbar(this.atlasURL, this.me.team);
    this.vm.setTeam(this.me.team);
    this.me.model.setBuildBlock(this.buildBlockId());
    this.hud.show(true);
    this.warmup();
    if (this.o.onReady) this.o.onReady();
  }
  // компилируем все шейдеры заранее (вспышки, взрывы, оружие) — без подлагиваний при первом выстреле
  warmup() {
    const r = this.renderer;
    try {
      // компилируем и один раз рисуем всё (в том числе скрытые вспышки/оружие) в крошечный буфер:
      // первая отрисовка программы тоже дорогая — пусть случится под экраном загрузки
      const rt = this.warmRT || (this.warmRT = new THREE.WebGLRenderTarget(16, 16));
      if (this.post && this.post.main) rt.texture.colorSpace = this.post.main.texture.colorSpace;
      const ac = r.autoClear;
      for (const sc of [this.scene, this.vm.scene]) {
        const hidden = [];
        sc.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true; } });
        const cam = sc === this.scene ? this.camera : this.vm.camera;
        if (this.post) this.post.begin();
        r.compile(sc, cam);
        r.setRenderTarget(this.post ? this.post.main : rt);
        r.autoClear = true;
        r.render(sc, cam);
        for (const o of hidden) o.visible = false;
      }
      r.autoClear = ac;
      if (this.post) this.post.end(); else r.setRenderTarget(null); // и шейдеры постобработки
    } catch (e) { /* не критично */ }
  }

  loadWorld(seed, map) {
    this.seed = seed;
    if (map) this.mapId = map;
    this.world.generate(seed, this.mapId || 'classic');
    this.applyEnvironment(this.world.info);
    this.mesher.rebuildAll();
    this.fx.clear();
    for (const e of this.eggs) this.scene.remove(e.mesh);
    this.eggs = this.world.info.eggs.map(e => this.makeEgg(e));
    if (this.isHost) { this.nav = new Nav(this.world); this.nav.setGoals(this.eggs); }
    for (const pr of this.projectiles.values()) { this.scene.remove(pr.mesh); if (pr.snd) pr.snd.stop(); }
    this.projectiles.clear();
  }

  // небо, туман, свет и акустика под карту
  applyEnvironment(info) {
    const sky = new THREE.Color(info.sky || SKY);
    this.scene.background = sky;
    if (this.scene.fog) this.scene.fog.color.copy(sky);
    const warm = info.space === 'desert';
    this.hemi.color.setHex(warm ? 0xfff0d8 : 0xe8f4ff); this.hemi.groundColor.setHex(warm ? 0x9a7a4a : 0x7a6a4a);
    this.sun.color.setHex(warm ? 0xffe2b0 : 0xfff2dd);
    this.env.sun = warm ? 2.2 : 1.8; this.env.hemi = 1.6;
    if (this.skyMat) {
      this.skyMat.uniforms.hor.value.copy(sky);
      this.skyMat.uniforms.zen.value.copy(sky).lerp(new THREE.Color(warm ? 0x5a8fd0 : 0x2f6fd0), 0.75);
    }
    this.updateLights();
    this.audio.setSpace(info.space || 'open');
    this.audio.setWind && this.audio.setWind(info.space === 'canyon' ? 0.08 : warm ? 0.07 : 0.05);
  }

  makeEgg(e) {
    const g = new THREE.Group();
    const mat = new THREE.MeshPhongMaterial({ color: 0xffffff, map: this.crackTex[0], emissive: 0x332200, shininess: 90, specular: 0xffffff });
    const egg = new THREE.Mesh(new THREE.SphereGeometry(0.5, 22, 16), mat);
    egg.scale.set(0.95, 1.3, 0.95); egg.position.y = 0.66;
    g.add(egg);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.07, 6, 24), new THREE.MeshBasicMaterial({ color: TEAM_COLORS[e.team] }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.1; g.add(ring);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 60, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: TEAM_COLORS[e.team], transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    beam.position.y = 30.5; g.add(beam);
    g.position.set(e.x, e.y, e.z);
    this.scene.add(g);
    return { team: e.team, pos: new THREE.Vector3(e.x, e.y, e.z), hp: EGG_HP, mesh: g, egg, wob: 0, stage: 0 };
  }

  // ===================== ИГРОКИ =====================
  addPlayer(id, name, team, isBot, isLocal) {
    const p = {
      id, name, team, isBot, isLocal,
      pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, pitch: 0, onGround: false, hitWall: false,
      hp: MAX_HP, alive: false, weapon: 0, firing: false, gliding: false, aiming: false,
      kills: 0, deaths: 0, res: START_RES,
      tpos: new THREE.Vector3(), tyaw: 0, tpitch: 0, speed: 0, groundY: 0,
      respawnAt: 0, spawnProt: 0, lastPos: new THREE.Vector3(),
    };
    p.model = new ChickenModel(team, isLocal ? null : name, !isLocal);
    p.model.addTo(this.scene);
    p.model.root.visible = false;
    this.modelShadows(p.model);
    if (isLocal || isBot) {
      p.ammo = WEAPONS.map(w => w.mag); p.reloadT = -1; p.cool = 0; p.spin = 0; p.bloom = 0; p.recoil = 0; p.recoilYaw = 0;
      p.nades = 3; p.buildSel = 0; p.lastWeapon = 0; p.mineCool = 0; p.nadeCool = 0; p.flapT = 0;
    }
    this.players.set(id, p);
    return p;
  }
  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    p.model.removeFrom(this.scene);
    this.players.delete(id);
  }
  addBot(team) {
    const id = this.botSeq++;
    const used = new Set([...this.players.values()].map(p => p.name));
    let name = BOT_NAMES.find(n => !used.has(n)) || ('Бот ' + id);
    const p = this.addPlayer(id, name, team, true, false);
    p.weapon = BOT_WEAPONS[Math.floor(Math.random() * BOT_WEAPONS.length)];
    p.model.setWeapon(p.weapon);
    p.ai = { role: Math.random() < 0.3 ? 'defend' : 'push' };
    return p;
  }
  // ---------- настройки сеанса (хост меняет прямо во время игры) ----------
  setBotCount(n) {
    if (!this.isHost) return;
    this.botsPerTeam = n = Math.max(0, Math.min(8, n | 0));
    for (const t of [0, 1]) {
      const bots = [...this.players.values()].filter(q => q.isBot && q.team === t);
      for (let i = bots.length; i < n; i++) { const b = this.addBot(t); if (this.roundState === 'play') this.hostSpawn(b); }
      for (let i = n; i < bots.length; i++) this.removePlayer(bots[i].id);
    }
    this.emit({ t: 'roster', l: this.roster(), sc: this.score });
  }
  newRound(map) {
    if (!this.isHost) return;
    if (map) this.mapId = map;
    this.roundState = 'end';
    this.newRoundAt = this.now; // новый раунд запустится в ближайшем hostTick
  }
  roster() {
    return [...this.players.values()].map(p => [p.id, p.name, p.team, p.isBot ? 1 : 0, p.kills, p.deaths]);
  }

  // ===================== ФИЗИКА =====================
  stepBody(p, dt, wx, wz, speed, jump) {
    const w0 = this.world;
    const inWater = w0.liquid(Math.floor(p.pos.x), Math.floor(p.pos.y + 0.55), Math.floor(p.pos.z));
    if (inWater && !p.inWater && p.vel.y < -4) { this.fx.splash(p.pos); this.audio.impact('soft', p.pos, 0.6); }
    p.inWater = inWater;
    if (inWater) speed *= 0.62;
    const accel = p.onGround ? 14 : inWater ? 6 : 3.5;
    p.vel.x += (wx * speed - p.vel.x) * Math.min(1, accel * dt);
    p.vel.z += (wz * speed - p.vel.z) * Math.min(1, accel * dt);
    p.jumped = false;
    p.gliding = false;
    if (inWater) {
      // плаваем: слабая гравитация, сопротивление, прыжок — всплыть
      p.vel.y = p.vel.y * Math.max(0, 1 - 2.5 * dt) - 7 * dt;
      if (jump) p.vel.y = Math.min(3.4, p.vel.y + 22 * dt);
      if (p.vel.y < -3) p.vel.y = -3;
      // выбираемся на берег
      const headOut = !w0.liquid(Math.floor(p.pos.x), Math.floor(p.pos.y + 1.2), Math.floor(p.pos.z));
      if (jump && headOut && p.hitWall) p.vel.y = 6.5;
    } else {
      if (jump && p.onGround) { p.vel.y = JUMP_V; p.jumped = true; }
      p.vel.y -= GRAV * dt;
      if (jump && !p.onGround && p.vel.y < GLIDE_V) { p.vel.y = GLIDE_V; p.gliding = true; }
    }
    if (p.vel.y < -40) p.vel.y = -40;
    // шаг на уступ в 1 блок — только когда игрок сам идёт (не когда его толкнуло взрывом)
    this.world.moveBody(p, dt, HW, PH, (wx * wx + wz * wz) > 0.1 ? 1.01 : 0);
    // тело поднялось мгновенно — камеру и модель подтягиваем плавно
    if (p.stepped) { p.onGround = true; p.stepOff = (p.stepOff || 0) - p.stepped; }
    if (p.stepOff) { p.stepOff *= Math.exp(-dt * 16); if (p.stepOff > -0.01) p.stepOff = 0; }
    if (p.pos.y < -5) p.pos.y = SY;
  }
  groundBelow(p) {
    const x = Math.floor(p.pos.x), z = Math.floor(p.pos.z);
    for (let y = Math.floor(p.pos.y + 0.2); y >= 0; y--) if (this.world.solid(x, y, z)) return y + 1;
    return 0;
  }

  // ===================== ТРАССИРОВКА =====================
  trace(ox, oy, oz, dx, dy, dz, range, shooterId, skipGlass) {
    const bh = this.world.raycast(ox, oy, oz, dx, dy, dz, range, skipGlass);
    let best = bh ? bh.dist : range;
    let res = { t: best, kind: bh ? 'block' : null, block: bh };
    for (const p of this.players.values()) {
      if (!p.alive || p.id === shooterId) continue;
      const P = p.pos;
      if (Math.abs(P.x - ox) + Math.abs(P.z - oz) > best + 3) continue;
      const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
      const th = raySphere(ox, oy, oz, dx, dy, dz, P.x + fx * 0.2, P.y + 1.33, P.z + fz * 0.2, 0.27);
      if (th >= 0 && th < best) { best = th; res = { t: th, kind: 'player', player: p, head: true }; }
      const tb = rayBox(ox, oy, oz, dx, dy, dz, P.x - 0.34, P.y, P.z - 0.34, P.x + 0.34, P.y + 1.1, P.z + 0.34);
      if (tb >= 0 && tb < best) { best = tb; res = { t: tb, kind: 'player', player: p, head: false }; }
    }
    for (const e of this.eggs) {
      if (e.hp <= 0) continue;
      const E = e.pos;
      const te = rayBox(ox, oy, oz, dx, dy, dz, E.x - 0.48, E.y, E.z - 0.48, E.x + 0.48, E.y + 1.32, E.z + 0.48);
      if (te >= 0 && te < best) { best = te; res = { t: te, kind: 'egg', egg: e }; }
    }
    res.x = ox + dx * res.t; res.y = oy + dy * res.t; res.z = oz + dz * res.t;
    return res;
  }

  // Выстрел (общий для игрока и ботов). Возвращает список концов для визуала.
  // apply(hit, dmg, w) вызывается для каждого попадания
  doShot(shooter, w, ox, oy, oz, dx, dy, dz, spread, onHit) {
    const ends = [];
    const n = w.pellets;
    for (let i = 0; i < n; i++) {
      _dir.set(dx, dy, dz);
      if (spread > 0) {
        // случайное отклонение в конусе
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
        _v1.set(-dz, 0, dx).normalize(); if (_v1.lengthSq() < 0.1) _v1.set(1, 0, 0);
        _v2.crossVectors(_dir, _v1).normalize();
        _dir.addScaledVector(_v1, Math.cos(a) * r).addScaledVector(_v2, Math.sin(a) * r).normalize();
      }
      const h = this.trace(ox, oy, oz, _dir.x, _dir.y, _dir.z, w.range, shooter.id, w.pierceSoft);
      let kind = 0, nx = 0, ny = 0, nz = 0, ric = 0;
      const fall = w.key === 'shotgun' ? Math.max(0.25, 1 - h.t / 28) : 1;
      if (h.kind === 'block') {
        kind = h.block.id; nx = h.block.nx; ny = h.block.ny; nz = h.block.nz;
        const def = BLOCKS[h.block.id];
        const cosI = Math.abs(_dir.x * nx + _dir.y * ny + _dir.z * nz);
        if (def.ric && Math.random() < def.ric * (1.3 - cosI)) ric = 1;
        onHit(h, w.bdmg * fall);
      } else if (h.kind === 'player') {
        kind = -1;
        onHit(h, w.dmg * (h.head ? w.head : 1) * fall);
      } else if (h.kind === 'egg') {
        kind = -2;
        onHit(h, w.dmg * fall * EGG_BULLET_MUL);
      }
      ends.push(r2(h.x), r2(h.y), r2(h.z), kind, nx, ny, nz, ric);
    }
    return ends;
  }

  // Визуал и звук выстрела
  renderShot(shooter, wi, ends, local) {
    const w = WEAPONS[wi];
    const m = shooter.model;
    const fp = local && this.fpActive();
    const muzzle = fp ? this.vm.muzzleWorld(this.camera, _v3) : m.muzzleWorld(_v3);
    _v2.set(ends[0] - muzzle.x, ends[1] - muzzle.y, ends[2] - muzzle.z).normalize();
    this.fx.muzzle(muzzle, _v2, w, fp);
    m.fire(w.kick);
    this.audio.gunshot(w.key, local ? null : muzzle, 1);
    if (local && w.key !== 'rpg') this.audio.casing(_v1.set(shooter.pos.x + 0.4, shooter.pos.y, shooter.pos.z), w.key === 'shotgun');
    // пуля прошла рядом с ухом — свист
    if (!local && this.me && this.me.alive) {
      const cam = this.camera.position;
      for (let i = 0; i < Math.min(ends.length, 16); i += 8) {
        const ex = ends[i] - muzzle.x, ey = ends[i + 1] - muzzle.y, ez = ends[i + 2] - muzzle.z;
        const L2 = ex * ex + ey * ey + ez * ez; if (L2 < 1) continue;
        const t = Math.max(0, Math.min(1, ((cam.x - muzzle.x) * ex + (cam.y - muzzle.y) * ey + (cam.z - muzzle.z) * ez) / L2));
        const px = muzzle.x + ex * t, py = muzzle.y + ey * t, pz = muzzle.z + ez * t;
        const dd = Math.hypot(px - cam.x, py - cam.y, pz - cam.z);
        if (dd < 2.6 && t * Math.sqrt(L2) > 4) { this.audio.whiz({ x: px, y: py, z: pz }); break; }
      }
    }
    for (let i = 0; i < ends.length; i += 8) {
      const end = new THREE.Vector3(ends[i], ends[i + 1], ends[i + 2]);
      const kind = ends[i + 3];
      const dist = muzzle.distanceTo(end);
      if (i === 0 || Math.random() < 0.5) this.fx.tracers.add(muzzle, end, w.tracer, w.key === 'sniper' ? 0.05 : w.key === 'hmg' ? 0.045 : 0.03, w.key === 'sniper' ? 400 : 260, w.key === 'sniper' ? 30 : 7);
      const n = new THREE.Vector3(ends[i + 4], ends[i + 5], ends[i + 6]);
      const ric = ends[i + 7];
      const delay = Math.min(0.3, dist / 300);
      const dir = end.clone().sub(muzzle).normalize();
      this.fx.later(delay, () => {
        if (kind > 0) {
          const cell = this.world.idx(Math.floor(end.x - n.x * 0.01), Math.floor(end.y - n.y * 0.01), Math.floor(end.z - n.z * 0.01));
          this.fx.impact(end, n, kind, cell, w.key === 'sniper' || w.key === 'hmg' ? 2 : 1);
          const def = BLOCKS[kind];
          if (i === 0) this.audio.impact(matOf(kind), end, 0.55);
          if (ric) {
            const refl = dir.clone().addScaledVector(n, -2 * dir.dot(n));
            refl.x += (Math.random() - 0.5) * 0.4; refl.y += Math.random() * 0.3; refl.z += (Math.random() - 0.5) * 0.4; refl.normalize();
            this.fx.ricochet(end, refl);
            this.audio.ricochet(end, 0.55);
          }
        } else if (kind === -1) {
          this.fx.feathers(end, 6, 0);
          if (i === 0) this.audio.fleshHit(end);
        } else if (kind === -2) {
          for (let k = 0; k < 6; k++) this.fx.glow.spawn(end.x, end.y, end.z, (Math.random() - 0.5) * 6, Math.random() * 5, (Math.random() - 0.5) * 6, 0.4, 0.09, 0.03, 1, 0.85, 0.3, { grav: 14 });
          if (i === 0) this.audio.egg(end, 0.6);
        }
      });
    }
  }

  volAt(p) {
    const d = this.camera.position.distanceTo(p);
    const k = Math.max(0, 1 - d / 95);
    return k * k * 0.9 + (d < 4 ? 0.1 : 0);
  }
  panAt(p) {
    _v1.subVectors(p, this.camera.position).normalize();
    const yaw = this.camera.rotation.y;
    return (_v1.x * Math.cos(yaw) - _v1.z * Math.sin(yaw)) * 0.8;
  }

  // ===================== ЛОКАЛЬНЫЙ ИГРОК =====================
  buildBlockId() {
    const id = BUILDABLE[this.me.buildSel];
    return id === -1 ? teamWool(this.me.team) : id;
  }

  handleTap(t) {
    const p = this.me;
    if (t === 'pause') { this.o.onPause && this.o.onPause(); return; }
    if (t === 'score') { this.toggleScoreboard(); return; }
    if (t === 'scoreOn') { if (!this.sbOpen) this.toggleScoreboard(); return; }
    if (t === 'scoreOff') { if (this.sbOpen) this.toggleScoreboard(); return; }
    if (t === 'view') { this.setView(!this.firstPerson); return; }
    if (!p.alive) return;
    if (t === 'reload') this.startReload();
    else if (t === 'nade') this.throwNade();
    else if (t === 'build') {
      if (p.weapon === W.BUILD) this.switchWeapon(p.lastWeapon);
      else { p.lastWeapon = p.weapon; this.switchWeapon(W.BUILD); }
    } else if (t === 'aim') { if (p.weapon !== W.BUILD) p.aiming = !p.aiming; }
    else if (t[0] === 'w' && t.length === 2) this.switchWeapon(Number(t[1]));
    else if (t[0] === 'b' && t.length === 2) { p.buildSel = Number(t[1]); p.model.setBuildBlock(this.buildBlockId()); if (p.weapon !== W.BUILD) { p.lastWeapon = p.weapon; this.switchWeapon(W.BUILD); } }
    else if (t === 'next' || t === 'prev') {
      const d = t === 'next' ? 1 : -1;
      if (p.weapon === W.BUILD) { p.buildSel = (p.buildSel + d + BUILDABLE.length) % BUILDABLE.length; p.model.setBuildBlock(this.buildBlockId()); }
      else this.switchWeapon((p.weapon + d + W.BUILD) % W.BUILD);
    }
  }
  setView(fp) {
    this.firstPerson = fp;
    this.settings.view = fp ? 'first' : 'third';
    try { localStorage.setItem('cb_view', JSON.stringify(this.settings.view)); } catch (e) { /* ignore */ }
    const b = document.getElementById('btnView');
    if (b) b.textContent = 'Вид: ' + (fp ? 'от 1-го лица' : 'от 3-го лица');
  }
  // виден ли сейчас вид от первого лица
  fpActive() {
    const p = this.me;
    return !!p && p.alive && (this.firstPerson || (WEAPONS[p.weapon].scope && p.aiming));
  }

  switchWeapon(i) {
    const p = this.me;
    if (i === p.weapon) return;
    if (i !== W.BUILD) p.lastWeapon = i;
    p.weapon = i; p.reloadT = -1; p.cool = Math.max(p.cool, 0.25); p.spin = 0;
    if (WEAPONS[i].scope === undefined && p.aiming && i === W.BUILD) p.aiming = false;
    if (i === W.BUILD) p.aiming = false;
    p.model.setWeapon(i);
    this.audio.reload(0);
  }
  startReload() {
    const p = this.me, w = WEAPONS[p.weapon];
    if (w.build || p.reloadT >= 0 || p.ammo[p.weapon] >= w.mag) return;
    p.reloadT = w.reload; p.reloadDur = w.reload; p.aiming = false;
    if (!this.fpActive()) this.audio.reload(0);
  }
  throwNade() {
    const p = this.me;
    if (p.nades <= 0 || p.nadeCool > 0) return;
    p.nades--; p.nadeCool = 0.8;
    const cam = this.camera;
    cam.getWorldDirection(_dir);
    const o = _v1.copy(p.pos); o.y += EYE + 0.1;
    o.addScaledVector(_dir, 0.5);
    const v = _dir.clone().multiplyScalar(18).add(new THREE.Vector3(0, 4, 0)).add(_v2.copy(p.vel).multiplyScalar(0.5));
    const id = this.myId + '_' + (this.projSeq++);
    this.spawnProjectile({ id, k: 'nade', p: [r2(o.x), r2(o.y), r2(o.z)], v: [r2(v.x), r2(v.y), r2(v.z)], o: this.myId });
    this.toHost({ t: 'proj', id, k: 'nade', p: [r2(o.x), r2(o.y), r2(o.z)], v: [r2(v.x), r2(v.y), r2(v.z)] });
    this.audio.reloadFx('whoosh');
    p.model.fire(0.5);
  }

  updateLocal(dt, inp) {
    const p = this.me;
    const fovK = this.camera.fov / this.baseFov;
    const sensK = 0.0042 * fovK * (p.aiming ? 0.8 * (this.settings.adsSens || 1) : 1);
    p.yaw -= inp.lookX * sensK;
    p.pitch -= inp.lookY * sensK;
    p.pitch = Math.max(-1.5, Math.min(1.5, p.pitch));
    this.lastLook[0] = inp.lookX; this.lastLook[1] = inp.lookY;
    for (const t of inp.taps) this.handleTap(t);
    // ПК: прицел, пока зажата правая кнопка мыши
    if (inp.aimHold !== this.prevAimHold) {
      if (p.alive && p.weapon !== W.BUILD) p.aiming = !!inp.aimHold;
      this.prevAimHold = inp.aimHold;
    }
    if (!p.alive) { p.firing = false; return; }
    const w = WEAPONS[p.weapon];
    if (inp.fire && !w.build && this.input.isTouch) this.aimAssist(dt);
    // движение
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    let wx = fx * inp.my + rx * inp.mx, wz = fz * inp.my + rz * inp.mx;
    let speed = SPEED * (w.speedMul || 1) * (p.aiming ? 0.6 : 1) * (inp.sprint ? 1.3 : 1);
    if (w.key === 'hmg' && p.firing) speed *= 0.7;
    const wasGround = p.onGround;
    this.stepBody(p, dt, wx, wz, speed, inp.jump);
    if (p.jumped) this.audio.jump();
    if (p.gliding) { p.flapT -= dt; if (p.flapT <= 0) { p.flapT = 0.12; this.audio.flap(0.15); } }
    if (!wasGround && p.onGround) this.audio.land(this.matUnder(p), Math.min(0.8, 0.3 + (this.fallSpeed || 0) * 0.04));
    this.fallSpeed = p.onGround ? 0 : Math.max(this.fallSpeed || 0, -p.vel.y);
    // шаги
    if (p.onGround && Math.hypot(p.vel.x, p.vel.z) > 1.2) {
      p.stepD = (p.stepD || 0) + Math.hypot(p.vel.x, p.vel.z) * dt;
      if (p.stepD > 1.6) { p.stepD = 0; this.audio.step(this.matUnder(p), null, 0.28); }
    }
    // сердцебиение при малом здоровье
    if (p.hp < 30) { this.beatT = (this.beatT || 0) - dt; if (this.beatT <= 0) { this.beatT = 0.85; this.audio.heartbeat(); } }
    p.speed = Math.hypot(p.vel.x, p.vel.z);

    p.cool -= dt; p.mineCool -= dt; p.nadeCool -= dt;
    p.bloom = Math.max(0, p.bloom - dt * 0.12);
    // отдача возвращается
    const rk = Math.min(1, dt * 7);
    const back = p.recoil * rk; p.recoil -= back; p.pitch += 0; // отдача отдельно, применяется в камере
    p.recoilYaw -= p.recoilYaw * rk;

    if (p.reloadT >= 0) {
      p.reloadT -= dt;
      const fpSnd = !this.fpActive(); // от первого лица звуки даёт анимация
      if (p.reloadT < p.reloadDur * 0.5 && !p.rlHalf) { p.rlHalf = true; if (fpSnd) this.audio.reload(1); }
      if (p.reloadT < 0) { p.ammo[p.weapon] = w.mag; p.rlHalf = false; if (fpSnd) this.audio.reload(1); }
    }

    if (w.build) { p.firing = false; this.updateBuild(dt, inp); return; }
    this.hl.visible = false; this.ghost.visible = false;
    const want = inp.fire;
    if (w.spinup) {
      if (want && p.reloadT < 0) { if (p.spin === 0) this.audio.spin(0.3); p.spin = Math.min(w.spinup, p.spin + dt); }
      else p.spin = Math.max(0, p.spin - dt * 1.5);
    }
    p.firing = want && p.reloadT < 0 && p.ammo[p.weapon] > 0;
    if (want && p.reloadT < 0 && p.cool <= 0 && (!w.spinup || p.spin >= w.spinup)) {
      if (p.ammo[p.weapon] <= 0) { this.audio.empty(); this.startReload(); p.cool = 0.3; }
      else {
        this.fireLocal(w);
        p.ammo[p.weapon]--;
        p.cool = (p.cool < -0.05 ? 0 : p.cool) + 1 / w.rate;
        if (p.ammo[p.weapon] <= 0) this.fx.later(0.25, () => this.startReload());
      }
    }
    if (!want && p.cool < 0) p.cool = 0;
  }

  // Лёгкая помощь в прицеливании на телефоне: при стрельбе прицел чуть "липнет" к врагу рядом с перекрестием
  aimAssist(dt) {
    const p = this.me, cam = this.camera;
    cam.getWorldDirection(_dir);
    let best = null, bestA = 0.075;
    for (const q of this.players.values()) {
      if (!q.alive || q.team === p.team) continue;
      _v1.set(q.pos.x, q.pos.y + 0.8, q.pos.z).sub(cam.position);
      const d = _v1.length();
      if (d > 70 || d < 1) continue;
      const a = _v1.angleTo(_dir);
      if (a < bestA) { bestA = a; best = q; }
    }
    if (!best) return;
    const head = _v2.set(p.pos.x, p.pos.y + EYE, p.pos.z);
    _v1.set(best.pos.x, best.pos.y + 0.8, best.pos.z).sub(head);
    const d = _v1.length();
    _v1.divideScalar(d);
    if (this.world.raycast(head.x, head.y, head.z, _v1.x, _v1.y, _v1.z, d - 0.4, true)) return;
    _v1.set(best.pos.x, best.pos.y + 0.8, best.pos.z).sub(cam.position).normalize();
    const tyaw = Math.atan2(-_v1.x, -_v1.z), tpitch = Math.asin(Math.max(-1, Math.min(1, _v1.y)));
    p.yaw = angleLerp(p.yaw, tyaw, Math.min(1, dt * 2.2));
    p.pitch += (tpitch - p.pitch) * Math.min(1, dt * 1.5);
  }

  currentSpread() {
    const p = this.me, w = WEAPONS[p.weapon];
    let s = (p.aiming ? w.adsSpread : w.spread) + p.bloom;
    if (p.speed > 1) s += 0.012 * (p.aiming ? 0.5 : 1);
    if (!p.onGround) s += 0.03;
    return s;
  }

  camRay() {
    const cam = this.camera;
    cam.getWorldDirection(_dir);
    const head = _v1.copy(this.me.pos); head.y += EYE;
    const t0 = Math.max(0, _v2.subVectors(head, cam.position).dot(_dir));
    const o = cam.position.clone().addScaledVector(_dir, t0);
    return { o, d: _dir.clone() };
  }

  fireLocal(w) {
    const p = this.me;
    const { o, d } = this.camRay();
    const spread = this.currentSpread();
    if (w.projectile) {
      const aim = this.trace(o.x, o.y, o.z, d.x, d.y, d.z, 200, p.id, false);
      const muzzle = this.fpActive() ? this.vm.muzzleWorld(this.camera, new THREE.Vector3()) : p.model.muzzleWorld(new THREE.Vector3());
      if (this.fpActive()) this.vm.fire(p.weapon);
      const dir = new THREE.Vector3(aim.x, aim.y, aim.z).sub(muzzle);
      if (dir.length() < 2) dir.copy(d); dir.normalize();
      const v = dir.multiplyScalar(42);
      const id = this.myId + '_' + (this.projSeq++);
      const msg = { id, k: 'rocket', p: [r2(muzzle.x), r2(muzzle.y), r2(muzzle.z)], v: [r2(v.x), r2(v.y), r2(v.z)], o: this.myId };
      this.spawnProjectile(msg);
      this.toHost({ t: 'proj', ...msg });
      this.fx.muzzle(muzzle, d, w, this.fpActive());
      for (let i = 0; i < 8; i++) this.fx.dust.spawn(muzzle.x - d.x * 0.9, muzzle.y - d.y * 0.9, muzzle.z - d.z * 0.9, -d.x * 4 + Math.random() - 0.5, Math.random(), -d.z * 4 + Math.random() - 0.5, 1.2, 0.3, 1.4, 0.8, 0.8, 0.8, { drag: 3, alpha: 0.5 });
      p.model.fire(w.kick);
      this.audio.gunshot('rpg', null, 1);
      this.toHost({ t: 'shotfx', w: p.weapon });
    } else {
      const hits = [];
      const ends = this.doShot(p, w, o.x, o.y, o.z, d.x, d.y, d.z, spread, (h, dmg) => hits.push([h, dmg]));
      if (this.fpActive()) this.vm.fire(p.weapon);
      this.renderShot(p, p.weapon, ends, true);
      let anyHit = false, headHit = false;
      for (const [h, dmg] of hits) {
        if (h.kind === 'player') {
          if (h.player.team === p.team) continue;
          this.toHost({ t: 'hit', v: h.player.id, d: r2(dmg), h: h.head ? 1 : 0, w: p.weapon });
          anyHit = true; headHit = headHit || h.head;
          this.showDmgNum(h, dmg, h.head);
        } else if (h.kind === 'egg') {
          if (h.egg.team === p.team) continue;
          this.toHost({ t: 'egghit', team: h.egg.team, d: r2(dmg) });
          anyHit = true;
          this.showDmgNum(h, dmg, false, true);
          h.egg.wob = 1;
        } else if (h.kind === 'block') {
          const b = h.block, key = this.world.idx(b.x, b.y, b.z);
          this.pendingBd.set(key, (this.pendingBd.get(key) || 0) + dmg);
        }
      }
      if (anyHit) { this.hud.hit(false, headHit); this.audio.hitmark(headHit); }
      this.toHost({ t: 'shot', w: p.weapon, e: ends });
    }
    p.bloom = Math.min(0.06, p.bloom + w.spread * 0.12);
    p.recoil += w.recoil * (0.7 + Math.random() * 0.5);
    p.recoilYaw += (Math.random() - 0.5) * w.recoil * 0.8;
    this.shake = Math.min(1, this.shake + w.kick * 0.25);
  }

  showDmgNum(h, dmg, head, egg) {
    const v = _v1.set(h.x, h.y, h.z).project(this.camera);
    if (v.z > 1) return;
    this.hud.dmgNumber((v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight, dmg, head, egg);
  }

  updateBuild(dt, inp) {
    const p = this.me;
    const { o, d } = this.camRay();
    const hit = this.world.raycast(o.x, o.y, o.z, d.x, d.y, d.z, 6.5);
    if (!hit || hit.y < 0) { this.hl.visible = false; this.ghost.visible = false; return; }
    this.hl.visible = true;
    this.hl.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    const px = hit.x + hit.nx, py = hit.y + hit.ny, pz = hit.z + hit.nz;
    const bid = this.buildBlockId();
    const ok = this.canPlace(px, py, pz) && p.res >= (BLOCKS[bid].cost || 1);
    this.ghost.visible = true;
    this.ghost.position.set(px + 0.5, py + 0.5, pz + 0.5);
    this.ghost.material.color.setHex(ok ? 0x66ff88 : 0xff5544);
    if ((inp.place || inp.fire) && p.cool <= 0 && ok) {
      p.cool = 0.2;
      this.world.set(px, py, pz, bid);
      this.lastPlaced = this.world.idx(px, py, pz);
      p.res -= BLOCKS[bid].cost || 1;
      this.toHost({ t: 'place', x: px, y: py, z: pz, b: bid });
      this.audio.place(matOf(bid), null, 0.55);
      p.model.fire(0.3);
      this.vm.fire(W.BUILD);
      this.fx.blockBreak(px, py, pz, bid, false);
    }
    if (inp.mine && p.mineCool <= 0 && BLOCKS[hit.id].hp !== Infinity) {
      p.mineCool = 0.22;
      const key = this.world.idx(hit.x, hit.y, hit.z);
      this.pendingBd.set(key, (this.pendingBd.get(key) || 0) + MINE_DMG);
      this.fx.impact(new THREE.Vector3(hit.x + 0.5 + hit.nx * 0.5, hit.y + 0.5 + hit.ny * 0.5, hit.z + 0.5 + hit.nz * 0.5), new THREE.Vector3(hit.nx, hit.ny, hit.nz), hit.id, key, 1);
      this.audio.impact(matOf(hit.id), null, 0.5);
      p.model.fire(0.4);
      this.vm.fire(W.BUILD);
    }
  }

  canPlace(x, y, z) {
    const w = this.world;
    if (x < 0 || z < 0 || x >= SX || z >= SZ || y < 1 || y >= SY) return false;
    if (w.get(x, y, z) && !w.liquid(x, y, z)) return false;
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      const P = p.pos;
      if (x + 1 > P.x - HW && x < P.x + HW && z + 1 > P.z - HW && z < P.z + HW && y + 1 > P.y && y < P.y + PH) return false;
    }
    for (const e of this.eggs) {
      if (Math.floor(e.pos.x) === x && Math.floor(e.pos.z) === z && y >= Math.floor(e.pos.y) && y <= Math.floor(e.pos.y) + 1) return false;
    }
    return true;
  }

  // ===================== КАМЕРА =====================
  updateCamera(dt) {
    const p = this.me, cam = this.camera, w = WEAPONS[p.weapon];
    const scoped = p.alive && w.scope && p.aiming;
    const fp = this.firstPerson || scoped;
    const pitch = p.pitch + p.recoil, yaw = p.yaw + p.recoilYaw;
    const targetFov = this.baseFov / (p.aiming && p.alive ? (w.zoom || 1) : 1);
    cam.fov += (targetFov - cam.fov) * Math.min(1, dt * 14);
    cam.updateProjectionMatrix();
    this.fx.setScale(this.renderer.domElement.height / (2 * Math.tan(cam.fov * Math.PI / 360)));
    const head = _v1.copy(p.pos); head.y += EYE + (p.stepOff || 0);
    if (!p.alive) {
      // камера смерти — отъезжает и смотрит на тушку
      this.deathCamT = (this.deathCamT || 0) + dt;
      const a = p.yaw + this.deathCamT * 0.3;
      const dist = Math.min(6, 3 + this.deathCamT * 1.5);
      const desired = _v2.set(head.x + Math.sin(a) * dist, head.y + 1.5 + this.deathCamT * 0.3, head.z + Math.cos(a) * dist);
      cam.position.lerp(desired, Math.min(1, dt * 3));
      cam.lookAt(head);
      p.model.root.visible = true;
      return;
    }
    this.deathCamT = 0;
    _dir.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    if (fp) {
      cam.position.copy(head).addScaledVector(_dir, 0.15);
    } else {
      const dist = p.aiming ? 1.8 : 3.2;
      const side = p.aiming ? 0.55 : 0.7;
      const rx = Math.cos(yaw), rz = -Math.sin(yaw);
      const desired = _v2.copy(head).addScaledVector(_dir, -dist);
      desired.x += rx * side; desired.z += rz * side; desired.y += 0.3;
      const dv = _v3.subVectors(desired, head);
      const len = dv.length(); dv.divideScalar(len);
      const hit = this.world.raycast(head.x, head.y, head.z, dv.x, dv.y, dv.z, len + 0.3);
      const L = hit ? Math.max(0.2, hit.dist - 0.3) : len;
      cam.position.copy(head).addScaledVector(dv, L);
    }
    cam.rotation.set(pitch, yaw, 0, 'YXZ');
    if (this.shake > 0.01) {
      const s = this.shake * this.shake * 0.08;
      cam.position.x += (Math.random() - 0.5) * s; cam.position.y += (Math.random() - 0.5) * s;
      cam.rotation.x += (Math.random() - 0.5) * s * 0.4; cam.rotation.z += (Math.random() - 0.5) * s * 0.5;
    }
    this.shake = Math.max(0, this.shake - dt * 2.5);
    p.model.root.visible = !fp;
  }

  // ===================== СЕТЬ: ОБЩЕЕ =====================
  toHost(m) {
    if (this.isHost) this.handleMsg(this.myId, m);
    else this.net.send(m);
  }
  broadcast(m, except) { if (this.net && this.isHost) this.net.broadcast(m, except); }
  emit(m) { this.broadcast(m); this.onEvent(m); }

  // ===================== ХОСТ =====================
  handleMsg(cid, m) {
    if (m.t === 'hello') return this.hostJoin(cid, m);
    if (m.t === 'ping') { this.net.sendTo(cid, { t: 'pong', s: m.s }); return; }
    const pid = cid === this.myId ? this.myId : this.n2p.get(cid);
    const p = pid === undefined ? null : this.players.get(pid);
    if (!p || p.gone) return;
    switch (m.t) {
      case 'st': {
        const s = m.p;
        this.pushSample(p, s[0], s[1], s[2], s[3], s[4]);
        if (p.weapon !== s[5]) { p.weapon = s[5]; p.model.setWeapon(s[5]); }
        p.flags = s[6];
        if (s[7]) { p.bb = s[7]; p.model.setBuildBlock(s[7]); }
        break;
      }
      case 'shot':
        if (!p.alive) return;
        this.broadcast({ t: 'shot', s: pid, w: m.w, e: m.e }, cid);
        if (pid !== this.myId) this.renderShot(p, m.w, m.e, false);
        break;
      case 'shotfx':
        this.broadcast({ t: 'shotfx', s: pid, w: m.w }, cid);
        if (pid !== this.myId) this.onEvent({ t: 'shotfx', s: pid, w: m.w });
        break;
      case 'hit': {
        const v = this.players.get(m.v);
        if (!v || !p.alive) return;
        this.hostDamage(v, Math.min(m.d, 260), pid, m.w, !!m.h, p.pos);
        break;
      }
      case 'egghit': {
        const e = this.eggs[m.team];
        if (!e || m.team === p.team || !p.alive) return;
        this.hostEggDamage(e, Math.min(m.d, 120), pid);
        break;
      }
      case 'bd': {
        const l = m.l;
        for (let i = 0; i < l.length; i += 2) this.hostBlockDamage(l[i], Math.min(l[i + 1], 600), pid);
        break;
      }
      case 'place': this.hostPlace(p, m.x, m.y, m.z, m.b, cid); break;
      case 'proj': {
        if (!p.alive) return;
        const msg = { id: m.id, k: m.k === 'rocket' ? 'rocket' : 'nade', p: m.p, v: m.v, o: pid };
        this.broadcast({ t: 'proj', ...msg }, cid);
        if (pid === this.myId) { const pr = this.projectiles.get(m.id); if (pr) pr.auth = true; }
        else this.spawnProjectile(msg, true);
        break;
      }
    }
  }

  hostJoin(cid, m) {
    if (this.n2p.has(cid)) return;
    const team = m.team === 1 ? 1 : 0;
    const name = String(m.name || 'Курица').slice(0, 14);
    const token = typeof m.token === 'string' ? m.token.slice(0, 40) : '';
    let p = token ? [...this.players.values()].find(q => !q.isBot && q.token === token) : null;
    const back = !!p;
    if (p) {
      // тот же игрок вернулся после обрыва связи: старое соединение забываем
      const old = this.p2n.get(p.id);
      if (old !== undefined && old !== cid) { this.n2p.delete(old); try { this.net.kick(old); } catch (e) { /* ignore */ } }
      p.gone = 0;
    } else {
      const bot = [...this.players.values()].find(q => q.isBot && q.team === team);
      if (bot) this.removePlayer(bot.id);
      p = this.addPlayer(this.pidSeq++, name, team, false, false);
      p.token = token;
    }
    this.n2p.set(cid, p.id); this.p2n.set(p.id, cid);
    this.net.sendTo(cid, {
      t: 'welcome', id: p.id, seed: this.seed, map: this.mapId, roster: this.roster(), sc: this.score,
      eggs: this.eggs.map(e => [e.hp, r2(e.pos.y)]), round: this.roundState,
    });
    const diff = this.world.diff();
    const CH = 6000;
    for (let i = 0; i < diff.length; i += CH) this.net.sendTo(cid, { t: 'diff', l: diff.slice(i, i + CH) });
    this.net.sendTo(cid, { t: 'ready' });
    this.emit({ t: 'roster', l: this.roster(), sc: this.score });
    this.hud.feed(back ? `🔌 <b>${esc(p.name)}</b> вернулся` : `🐔 <b>${esc(name)}</b> зашёл в игру`);
    if (this.roundState === 'play' && !p.alive) this.hostSpawn(p);
    else if (p.alive) this.net.sendTo(cid, { t: 'spawn', id: p.id, x: r2(p.pos.x), y: r2(p.pos.y), z: r2(p.pos.z), yaw: r3(p.yaw) });
  }
  hostLeave(cid) {
    const pid = this.n2p.get(cid);
    this.n2p.delete(cid);
    if (pid === undefined) return;
    if (this.p2n.get(pid) === cid) this.p2n.delete(pid);
    const p = this.players.get(pid);
    if (!p || p.gone) return;
    // держим место 45 секунд — вдруг переподключится
    p.gone = this.now; p.alive = false; p.respawnAt = 0;
    this.emit({ t: 'gone', id: pid });
    this.hud.feed(`📶 <b>${esc(p.name)}</b> потерял связь…`);
  }
  hostRemoveGone(p) {
    this.hud.feed(`👋 <b>${esc(p.name)}</b> вышел`);
    const team = p.team;
    this.removePlayer(p.id);
    const bots = [...this.players.values()].filter(q => q.isBot && q.team === team).length;
    const humans = [...this.players.values()].filter(q => !q.isBot && q.team === team).length;
    if (bots + humans < this.botsPerTeam) { const b = this.addBot(team); this.hostSpawn(b); }
    this.emit({ t: 'roster', l: this.roster(), sc: this.score });
  }

  hostSpawn(p) {
    const sp = this.world.info.spawns[p.team];
    let best = sp[Math.floor(Math.random() * sp.length)];
    // выбираем точку подальше от врагов
    let bestD = -1;
    for (const s of sp) {
      let md = 999;
      for (const q of this.players.values()) if (q.alive && q.team !== p.team) md = Math.min(md, Math.hypot(q.pos.x - s[0], q.pos.z - s[2]));
      md += Math.random() * 6;
      if (md > bestD) { bestD = md; best = s; }
    }
    let y = best[1];
    while (this.world.boxHits(best[0] - HW, y, best[2] - HW, best[0] + HW, y + PH, best[2] + HW) && y < SY - 2) y++;
    p.spawnProt = this.now + 2;
    this.emit({ t: 'spawn', id: p.id, x: best[0], y, z: best[2], yaw: p.team === 0 ? -Math.PI / 2 : Math.PI / 2 });
  }

  hostDamage(v, dmg, attackerId, wi, head, fromPos) {
    if (!v.alive || this.now < v.spawnProt || this.roundState !== 'play') return;
    const a = this.players.get(attackerId);
    if (a && a.team === v.team && a !== v) return;
    v.hp -= dmg;
    v.lastHurt = this.now;
    const fp = fromPos || (a ? a.pos : v.pos);
    this.emit({ t: 'hurt', v: v.id, a: attackerId, d: r2(dmg), h: head ? 1 : 0, hp: r2(Math.max(0, v.hp)), x: r2(fp.x), y: r2(fp.y), z: r2(fp.z) });
    if (v.hp <= 0) {
      v.alive = false; v.hp = 0; v.deaths++; v.respawnAt = this.now + RESPAWN_TIME;
      if (a && a !== v) { a.kills++; this.score[a.team]++; a.res = Math.min(999, a.res + 15); }
      this.emit({ t: 'kill', v: v.id, k: attackerId, w: wi, h: head ? 1 : 0, kk: a ? a.kills : 0, vd: v.deaths, sc: this.score });
    }
  }

  hostEggDamage(e, dmg, attackerId) {
    if (e.hp <= 0 || this.roundState !== 'play') return;
    e.hp = Math.max(0, e.hp - dmg);
    this.onEggHurt(e);
    if (e.hp <= 0) {
      this.roundState = 'end';
      const winner = 1 - e.team;
      const a = this.players.get(attackerId);
      this.emit({ t: 'end', w: winner, by: a ? a.name : '', eggs: this.eggs.map(q => q.hp) });
      this.newRoundAt = this.now + 9;
    }
  }

  hostBlockDamage(key, dmg, ownerId) {
    const w = this.world;
    const x = key % SX, z = Math.floor(key / SX) % SZ, y = Math.floor(key / (SX * SZ));
    const id = w.get(x, y, z);
    if (!id || y >= SY) return;
    const def = BLOCKS[id];
    if (def.hp === Infinity) return;
    const cur = w.dmg[key] / 255 * def.hp + dmg;
    if (cur >= def.hp) {
      this.hostSetBlock(x, y, z, 0, 0);
      const p = this.players.get(ownerId);
      if (p) p.res = Math.min(999, p.res + 1);
      if (def.explosive) this.tntQueue.push({ t: this.now + 0.12 + Math.random() * 0.12, x: x + 0.5, y: y + 0.5, z: z + 0.5, o: ownerId });
    } else {
      this.hostSetBlock(x, y, z, id, Math.max(1, Math.min(255, Math.round(cur / def.hp * 255))));
    }
  }

  hostSetBlock(x, y, z, id, dmg) {
    const prev = this.world.get(x, y, z);
    this.world.set(x, y, z, id, dmg);
    this.pendingBlk.push(x, y, z, id, dmg);
    this.onBlockChange(x, y, z, prev, id);
  }

  hostPlace(p, x, y, z, b, cid) {
    const def = BLOCKS[b];
    const allowed = BUILDABLE.includes(b) || b === teamWool(p.team);
    const near = Math.hypot(p.pos.x - x - 0.5, p.pos.y + 1 - y - 0.5, p.pos.z - z - 0.5) < 9;
    const cost = def ? (def.cost || 1) : 99;
    const isMine = cid === this.myId;
    if (isMine) this.world.set(x, y, z, 0); // убираем оптимистичную установку для проверки
    if (!def || !allowed || !p.alive || !near || p.res < cost && !isMine || !this.canPlace(x, y, z)) {
      if (isMine) { this.me.res += cost; }
      // откат у клиента
      if (!isMine) this.net.sendTo(cid, { t: 'blk', l: [x, y, z, this.world.get(x, y, z), this.world.dmg[this.world.idx(x, y, z)] || 0] });
      return;
    }
    if (!isMine) p.res -= cost;
    this.hostSetBlock(x, y, z, b, 0);
  }

  hostExplode(x, y, z, kind, ownerId, pid) {
    const E = EXPLOSIONS[kind];
    const owner = this.players.get(ownerId);
    this.emit({ t: 'boom', x: r2(x), y: r2(y), z: r2(z), k: kind, pid });
    const w = this.world, R = E.radius;
    const x0 = Math.floor(x - R), x1 = Math.floor(x + R), y0 = Math.floor(y - R), y1 = Math.floor(y + R), z0 = Math.floor(z - R), z1 = Math.floor(z + R);
    for (let by = y0; by <= y1; by++) for (let bz = z0; bz <= z1; bz++) for (let bx = x0; bx <= x1; bx++) {
      if (!w.inside(bx, by, bz)) continue;
      const id = w.get(bx, by, bz);
      if (!id) continue;
      const d = Math.hypot(bx + 0.5 - x, by + 0.5 - y, bz + 0.5 - z);
      if (d > R) continue;
      const def = BLOCKS[id];
      const dmg = E.power * (1 - d / R) * (def.tough ?? 1) * (0.85 + Math.random() * 0.3);
      this.hostBlockDamage(w.idx(bx, by, bz), dmg, ownerId);
    }
    const PR = R * 1.6;
    for (const p of this.players.values()) {
      if (!p.alive) continue;
      const d = Math.hypot(p.pos.x - x, p.pos.y + 0.7 - y, p.pos.z - z);
      if (d > PR) continue;
      let dmg = E.dmg * (1 - d / PR);
      if (p.id === ownerId) dmg *= 0.45;
      else if (owner && owner.team === p.team) continue;
      this.hostDamage(p, dmg, ownerId, kind === 'rocket' ? W.RPG : kind === 'tnt' ? 'tnt' : 'nade', false, { x, y, z });
      if (p.isBot) {
        const k = E.push * (1 - d / PR) / Math.max(0.5, d);
        p.vel.x += (p.pos.x - x) * k; p.vel.y += Math.max(3, (p.pos.y + 0.7 - y) * k + 4); p.vel.z += (p.pos.z - z) * k;
      }
    }
    for (const e of this.eggs) {
      if (owner && owner.team === e.team) continue;
      const d = Math.hypot(e.pos.x - x, e.pos.y + 0.6 - y, e.pos.z - z);
      if (d < R + 1.2) this.hostEggDamage(e, E.dmg * 1.5 * (1 - d / (R + 1.2)), ownerId);
    }
  }

  botFire(b, wi, extraSpread) {
    const w = WEAPONS[wi];
    const cp = Math.cos(b.pitch);
    const dx = -Math.sin(b.yaw) * cp, dy = Math.sin(b.pitch), dz = -Math.cos(b.yaw) * cp;
    if (w.projectile) {
      const mz = b.model.muzzleWorld(new THREE.Vector3());
      const msg = { id: b.id + '_' + (this.projSeq++), k: 'rocket', p: [r2(mz.x), r2(mz.y), r2(mz.z)], v: [r2(dx * 42), r2(dy * 42), r2(dz * 42)], o: b.id };
      this.spawnProjectile(msg, true);
      this.broadcast({ t: 'proj', ...msg });
      this.emit({ t: 'shotfx', s: b.id, w: wi });
      return;
    }
    const ends = this.doShot(b, w, b.pos.x, b.pos.y + EYE, b.pos.z, dx, dy, dz, w.spread + extraSpread, (h, dmg) => {
      if (h.kind === 'player') this.hostDamage(h.player, dmg, b.id, wi, h.head, b.pos);
      else if (h.kind === 'egg') { if (h.egg.team !== b.team) this.hostEggDamage(h.egg, dmg, b.id); }
      else if (h.kind === 'block') this.hostBlockDamage(this.world.idx(h.block.x, h.block.y, h.block.z), dmg, b.id);
    });
    this.renderShot(b, wi, ends, false);
    this.broadcast({ t: 'shot', s: b.id, w: wi, e: ends });
  }

  botThrow(b, target) {
    const dx = target.x - b.pos.x, dz = target.z - b.pos.z, d = Math.hypot(dx, dz);
    const sp = Math.min(17, 5 + d * 0.6);
    const v = [r2(dx / d * sp), r2(5 + d * 0.12), r2(dz / d * sp)];
    const msg = { id: b.id + '_' + (this.projSeq++), k: 'nade', p: [r2(b.pos.x), r2(b.pos.y + EYE + 0.2), r2(b.pos.z)], v, o: b.id };
    this.spawnProjectile(msg, true);
    this.broadcast({ t: 'proj', ...msg });
    b.model.fire(0.5);
  }

  hostTick(dt) {
    // карта путей ботов (кусочками)
    if (this.nav && [...this.players.values()].some(p => p.isBot)) {
      this.navGoalT = (this.navGoalT || 0) - dt;
      if (this.navGoalT <= 0) { this.navGoalT = 2; const k = this.eggs.map(e => e.pos.y.toFixed(0)).join(); if (k !== this.navEggKey) { this.navEggKey = k; this.nav.setGoals(this.eggs); } }
      this.nav.update(this.now, 2500);
    }
    // боты
    for (const p of this.players.values()) if (p.isBot) updateBot(this, p, dt);
    // регенерация здоровья через 5 сек без урона
    for (const p of this.players.values()) {
      if (p.alive && p.hp < MAX_HP && this.now - (p.lastHurt || 0) > 5) p.hp = Math.min(MAX_HP, p.hp + 12 * dt);
    }
    // ушедшие игроки, которые не вернулись
    for (const p of [...this.players.values()]) if (p.gone && this.now - p.gone > 45) this.hostRemoveGone(p);
    // возрождение
    if (this.roundState === 'play') {
      for (const p of this.players.values()) if (!p.alive && p.respawnAt && this.now >= p.respawnAt) { p.respawnAt = 0; this.hostSpawn(p); }
    }
    // ТНТ
    for (let i = 0; i < this.tntQueue.length; i++) {
      const t = this.tntQueue[i];
      if (this.now >= t.t) { this.tntQueue.splice(i, 1); i--; this.hostExplode(t.x, t.y, t.z, 'tnt', t.o); }
    }
    // новый раунд
    if (this.roundState === 'end' && this.now >= this.newRoundAt) {
      this.emit({ t: 'round', seed: Math.floor(Math.random() * 1e9), map: this.mapId });
      for (const p of this.players.values()) { p.alive = false; p.respawnAt = this.now + 1; }
    }
    // блоки
    if (this.pendingBlk.length) { this.broadcast({ t: 'blk', l: this.pendingBlk }); this.pendingBlk = []; }
    // снимок
    this.netT -= dt;
    if (this.netT <= 0) {
      this.netT = NET_DT;
      if (this.net) {
        // только изменившиеся игроки, раз в секунду — все
        const full = this.now > this.snapFullT;
        if (full) this.snapFullT = this.now + 1;
        const list = [];
        for (const p of this.players.values()) {
          const t = [p.id, r2(p.pos.x), r2(p.pos.y), r2(p.pos.z), r2(p.yaw), r2(p.pitch), p.weapon, Math.ceil(p.hp), this.flagsOf(p), p.res, p.isLocal ? this.buildBlockId() : (p.bb || 0)];
          const key = t.join(',');
          if (full || key !== p.snapKey) { list.push(t); p.snapKey = key; }
        }
        this.broadcast({ t: 'snap', p: list, e: this.eggs.map(e => [Math.ceil(e.hp), r2(e.pos.y)]) });
      }
    }
  }
  flagsOf(p) {
    if (!p.isLocal && !p.isBot) return ((p.flags || 0) & ~1) | (p.alive ? 1 : 0);
    return (p.alive ? 1 : 0) | (p.firing ? 2 : 0) | (p.gliding ? 4 : 0) | (p.onGround ? 8 : 0) | (p.aiming ? 16 : 0);
  }

  // ===================== СОБЫТИЯ (хост и клиенты) =====================
  onEvent(m) {
    switch (m.t) {
      case 'welcome': {
        this.myId = m.id;
        this.loadWorld(m.seed, m.map || 'classic');
        this.diffChunks = [];
        this.onRoster({ l: m.roster, sc: m.sc });
        this.me = this.players.get(m.id);
        this.score = m.sc;
        this.roundState = m.round;
        m.eggs.forEach((e, i) => { if (this.eggs[i]) { this.eggs[i].hp = e[0]; this.eggs[i].pos.y = e[1]; } });
        break;
      }
      case 'diff': this.world.applyDiff(m.l); break;
      case 'ready': {
        this.mesher.rebuildAll();
        if (this.rejoined) { this.rejoined = false; this.hud.banner('СНОВА В ИГРЕ!', 'warn', 2); }
        this.ready = true;
        this.afterStart();
        break;
      }
      case 'pong': this.ping = Math.round(performance.now() - m.s); break;
      case 'roster': this.onRoster(m); break;
      case 'gone': { const p = this.players.get(m.id); if (p && !p.isLocal) { p.alive = false; p.model.root.visible = false; p.hist = []; } break; }
      case 'snap': this.onSnap(m); break;
      case 'blk': {
        const l = m.l;
        for (let i = 0; i < l.length; i += 5) {
          const prev = this.world.get(l[i], l[i + 1], l[i + 2]);
          this.world.set(l[i], l[i + 1], l[i + 2], l[i + 3], l[i + 4]);
          this.onBlockChange(l[i], l[i + 1], l[i + 2], prev, l[i + 3]);
        }
        break;
      }
      case 'shot': {
        if (m.s === this.myId) return;
        const p = this.players.get(m.s);
        if (p) this.renderShot(p, m.w, m.e, false);
        break;
      }
      case 'shotfx': {
        const p = this.players.get(m.s);
        if (!p || m.s === this.myId) return;
        const mz = p.model.muzzleWorld(new THREE.Vector3());
        p.model.fire(1);
        this.fx.muzzle(mz, new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw)), WEAPONS[m.w]);
        this.audio.gunshot(WEAPONS[m.w].key, mz, 1);
        break;
      }
      case 'hurt': this.onHurt(m); break;
      case 'kill': this.onKill(m); break;
      case 'spawn': {
        const p = this.players.get(m.id);
        if (!p) return;
        p.alive = true; p.hp = MAX_HP;
        p.pos.set(m.x, m.y, m.z); p.tpos.copy(p.pos); p.vel.set(0, 0, 0); p.hist = [];
        p.yaw = p.tyaw = m.yaw; p.pitch = p.tpitch = 0;
        p.model.root.visible = true;
        p.model.root.position.copy(p.pos);
        this.fx.spawnPuff(p.pos, p.team);
        if (p.isLocal || p.isBot) { p.ammo = WEAPONS.map(w => w.mag); p.nades = 3; p.reloadT = -1; p.recoil = 0; p.recoilYaw = 0; p.spin = 0; }
        if (p.isLocal) { this.hud.death(false); p.aiming = false; this.vm.raise(); }
        break;
      }
      case 'proj': if (m.o !== this.myId) this.spawnProjectile(m); break;
      case 'boom': this.onBoom(m); break;
      case 'end': {
        this.roundState = 'end';
        if (m.eggs) m.eggs.forEach((h, i) => this.eggs[i] && (this.eggs[i].hp = h));
        const lost = this.eggs[1 - m.w];
        if (lost) { this.fx.explosion(_v1.copy(lost.pos).add(new THREE.Vector3(0, 0.7, 0)), 3); this.fx.feathers(lost.pos, 40, lost.team, false); lost.mesh.visible = false; }
        const mine = this.me && this.me.team === m.w;
        this.hud.banner(mine ? 'ПОБЕДА!' : 'ПОРАЖЕНИЕ', m.w === 0 ? 'red' : 'blue', 8.5, `${m.w === 0 ? 'Красные' : 'Синие'} разбили яйцо врага${m.by ? ' · последний удар: ' + m.by : ''}. Новый раунд через 9 сек…`);
        if (mine) this.audio.win(); else this.audio.alarm();
        break;
      }
      case 'round': {
        this.loadWorld(m.seed, m.map);
        this.score = [0, 0];
        for (const p of this.players.values()) { p.kills = 0; p.deaths = 0; p.alive = false; p.res = START_RES; p.model.root.visible = false; }
        this.roundState = 'play';
        this.hud.banner('НОВЫЙ РАУНД!', '', 2.5, 'Защищай своё яйцо, разбей чужое');
        break;
      }
    }
  }

  onRoster(m) {
    const ids = new Set();
    for (const [id, name, team, bot, kills, deaths] of m.l) {
      ids.add(id);
      let p = this.players.get(id);
      if (!p) {
        p = this.addPlayer(id, name, team, !!bot, id === this.myId);
        if (id === this.myId) this.me = p;
      }
      p.kills = kills; p.deaths = deaths;
    }
    for (const id of [...this.players.keys()]) if (!ids.has(id)) this.removePlayer(id);
    if (m.sc) this.score = m.sc;
    if (this.sbOpen) this.renderScoreboard();
  }

  onSnap(m) {
    for (const s of m.p) {
      const p = this.players.get(s[0]);
      if (!p) continue;
      if (p.isLocal) { p.hp = s[7]; p.res = s[9]; continue; }
      this.pushSample(p, s[1], s[2], s[3], s[4], s[5]);
      if (p.weapon !== s[6]) { p.weapon = s[6]; p.model.setWeapon(s[6]); }
      p.hp = s[7]; p.flags = s[8]; p.res = s[9];
      if (s[10]) p.model.setBuildBlock(s[10]);
      const alive = !!(s[8] & 1);
      if (alive && !p.alive) { p.alive = true; p.pos.set(s[1], s[2], s[3]); p.hist = []; this.pushSample(p, s[1], s[2], s[3], s[4], s[5]); p.model.root.visible = true; }
    }
    m.e.forEach((e, i) => {
      const egg = this.eggs[i];
      if (!egg) return;
      if (e[0] < egg.hp - 0.5) this.onEggHurt(egg);
      egg.hp = e[0]; egg.pos.y = e[1];
    });
  }

  onEggHurt(egg) {
    egg.wob = 1;
    this.hud.eggHit(egg.team);
    if (this.me && egg.team === this.me.team && this.now > this.eggWarnT) {
      this.eggWarnT = this.now + 8;
      this.hud.banner('НАШЕ ЯЙЦО АТАКУЮТ!', 'warn', 2.5);
      this.audio.alarm();
    }
  }

  onHurt(m) {
    const v = this.players.get(m.v);
    if (!v) return;
    v.hp = m.hp;
    v.model.hurt();
    const at = _v1.copy(v.pos); at.y += m.h ? 1.35 : 0.8;
    if (m.a !== this.myId) this.fx.feathers(at, m.h ? 10 : 5, v.team);
    if (v.isLocal) {
      const ang = Math.atan2(m.x - v.pos.x, m.z - v.pos.z);
      const rel = -(ang - (v.yaw + Math.PI));
      this.hud.hurt(m.d, rel);
      this.shake = Math.min(1, this.shake + m.d / 60);
      if (this.now - this.lastHurtSound > 0.15) { this.lastHurtSound = this.now; this.audio.hurt(); }
    } else if (Math.random() < 0.3) this.audio.cluck(0.45, at, 1.1);
  }

  onKill(m) {
    const v = this.players.get(m.v), k = this.players.get(m.k);
    if (m.sc) this.score = m.sc;
    if (k) k.kills = m.kk;
    if (v) {
      v.alive = false; v.hp = 0; v.deaths = m.vd;
      const at = _v1.copy(v.pos); at.y += 0.8;
      this.fx.feathers(at, 28, v.team);
      this.fx.flashes.add(at, 1.2, 0.15, 0xffffff, 1.5);
      this.audio.cluck(0.8, at, 0.9 + Math.random() * 0.3);
    }
    const wn = typeof m.w === 'number' ? WEAPONS[m.w].short : m.w === 'tnt' ? 'ТНТ' : m.w === 'nade' ? 'ГРАНАТА' : '💥';
    const cls = (p) => p ? (p.team === 0 ? 'r' : 'b') : '';
    const mine = m.k === this.myId || m.v === this.myId;
    if (k && k !== v) this.hud.feed(`<span class="${cls(k)}">${esc(k.name)}</span><span class="w">${m.h ? '🎯' : ''}${wn}</span><span class="${cls(v)}">${esc(v ? v.name : '?')}</span>`, mine);
    else if (v) this.hud.feed(`<span class="${cls(v)}">${esc(v.name)}</span><span class="w">💀 ${wn}</span>`, mine);
    if (m.k === this.myId && m.v !== this.myId) { this.hud.hit(true); this.audio.killmark(); this.hud.banner('+1 ' + (v ? v.name : ''), '', 1.2); }
    if (m.v === this.myId) {
      this.deathBy = k && k !== v ? `Тебя ощипал ${k.name}` : 'Самоподрыв…';
      this.deathAt = this.now;
      this.me.aiming = false;
    }
    if (this.sbOpen) this.renderScoreboard();
  }

  onBoom(m) {
    const pr = this.projectiles.get(m.pid);
    if (pr) this.killProj(pr);
    const p = new THREE.Vector3(m.x, m.y, m.z);
    const E = EXPLOSIONS[m.k];
    this.fx.explosion(p, E.radius);
    this.audio.explosion(p, m.k !== 'nade');
    const d = this.camera.position.distanceTo(p);
    this.shake = Math.min(1.5, this.shake + Math.max(0, 1.2 - d / 25));
    // отбрасывание себя (ракетные прыжки!)
    const me = this.me;
    if (me && me.alive) {
      const dd = Math.hypot(me.pos.x - p.x, me.pos.y + 0.7 - p.y, me.pos.z - p.z);
      const PR = E.radius * 1.6;
      if (dd < PR) {
        const k = E.push * (1 - dd / PR) / Math.max(0.5, dd);
        me.vel.x += (me.pos.x - p.x) * k; me.vel.z += (me.pos.z - p.z) * k;
        me.vel.y += Math.max(3, (me.pos.y + 0.7 - p.y) * k + 4);
        me.onGround = false;
      }
    }
  }

  onBlockChange(x, y, z, prev, id) {
    if (prev && !id) {
      // при взрыве ломаются десятки блоков: полные обломки и звук — только у первых в кадре
      const n = this.breaksThisFrame = (this.breakFrame === this.frameNo ? this.breaksThisFrame : 0) + 1;
      this.breakFrame = this.frameNo;
      this.fx.blockBreak(x, y, z, prev, n <= 6);
      const c = _v1.set(x + 0.5, y + 0.5, z + 0.5);
      if (n <= 2) this.audio.blockBreak(matOf(prev), c, 0.7);
    } else if (!prev && id && !(this.me && this.me.isLocal && this.lastPlaced === this.world.idx(x, y, z))) {
      const c = _v1.set(x + 0.5, y + 0.5, z + 0.5);
      if (this.camera.position.distanceTo(c) < 30) this.audio.place(matOf(id), c, 0.4);
    }
  }

  // ===================== СНАРЯДЫ =====================
  killProj(pr) {
    this.scene.remove(pr.mesh); this.projectiles.delete(pr.id);
    if (pr.snd) { pr.snd.stop(); pr.snd = null; }
  }
  // материал под ногами (для шагов)
  matUnder(p) {
    const w = this.world, x = Math.floor(p.pos.x), z = Math.floor(p.pos.z), y = Math.floor(p.pos.y - 0.05);
    let id = w.get(x, y, z);
    if (!id) id = w.get(Math.floor(p.pos.x + 0.3), y, z) || w.get(Math.floor(p.pos.x - 0.3), y, z) || w.get(x, y, Math.floor(p.pos.z + 0.3)) || w.get(x, y, Math.floor(p.pos.z - 0.3));
    return matOf(id || 3);
  }

  spawnProjectile(m, auth = false) {
    if (this.projectiles.has(m.id)) return;
    let mesh;
    if (m.k === 'rocket') {
      mesh = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.45, 6), new THREE.MeshLambertMaterial({ color: 0x5a6a2a }));
      body.rotation.x = Math.PI / 2; mesh.add(body);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 6), new THREE.MeshLambertMaterial({ color: 0x8a2a1a }));
      tip.rotation.x = -Math.PI / 2; tip.position.z = -0.3; mesh.add(tip);
    } else {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshLambertMaterial({ color: 0x3d4a22 }));
    }
    mesh.position.set(m.p[0], m.p[1], m.p[2]);
    this.scene.add(mesh);
    this.projectiles.set(m.id, {
      id: m.id, k: m.k, pos: mesh.position, vel: new THREE.Vector3(m.v[0], m.v[1], m.v[2]), owner: m.o,
      life: m.k === 'rocket' ? 5 : 2.4, mesh, auth: auth || this.isHost, dead: false, trailT: 0,
    });
    if (m.k === 'rocket') { const pr = this.projectiles.get(m.id); pr.snd = this.audio.rocketLoop(() => pr.pos); }
  }

  updateProjectiles(dt) {
    const w = this.world;
    for (const pr of [...this.projectiles.values()]) {
      pr.life -= dt;
      if (pr.dead) { if (pr.life < -1) this.killProj(pr); continue; }
      let explode = false;
      if (pr.k === 'rocket') {
        pr.vel.y -= 2 * dt;
        const steps = 3;
        for (let s = 0; s < steps && !explode; s++) {
          pr.pos.addScaledVector(pr.vel, dt / steps);
          if (w.solid(Math.floor(pr.pos.x), Math.floor(pr.pos.y), Math.floor(pr.pos.z))) explode = true;
          for (const p of this.players.values()) {
            if (!p.alive || p.id === pr.owner) continue;
            if (Math.abs(p.pos.x - pr.pos.x) < 0.45 && Math.abs(p.pos.z - pr.pos.z) < 0.45 && pr.pos.y > p.pos.y && pr.pos.y < p.pos.y + PH) explode = true;
          }
          for (const e of this.eggs) if (e.hp > 0 && Math.abs(e.pos.x - pr.pos.x) < 0.5 && Math.abs(e.pos.z - pr.pos.z) < 0.5 && pr.pos.y > e.pos.y && pr.pos.y < e.pos.y + 1.4) explode = true;
        }
        pr.mesh.lookAt(_v1.copy(pr.pos).sub(pr.vel));
        pr.trailT -= dt;
        if (pr.trailT <= 0) { pr.trailT = 0.016; this.fx.rocketTrail(pr.pos); }
        if (pr.life <= 0) explode = true;
      } else {
        pr.vel.y -= 22 * dt;
        const p = pr.pos, v = pr.vel;
        const nx = p.x + v.x * dt, ny = p.y + v.y * dt, nz = p.z + v.z * dt;
        if (w.solid(Math.floor(nx), Math.floor(p.y), Math.floor(p.z))) { v.x *= -0.4; this.nadeBounce(pr); } else p.x = nx;
        if (w.solid(Math.floor(p.x), Math.floor(ny), Math.floor(p.z))) { v.y *= -0.38; v.x *= 0.7; v.z *= 0.7; if (Math.abs(v.y) > 2) this.nadeBounce(pr); } else p.y = ny;
        if (w.solid(Math.floor(p.x), Math.floor(p.y), Math.floor(nz))) { v.z *= -0.4; this.nadeBounce(pr); } else p.z = nz;
        pr.mesh.rotation.x += dt * 10; pr.mesh.rotation.z += dt * 7;
        if (Math.random() < 0.3) this.fx.glow.spawn(p.x, p.y + 0.1, p.z, 0, 0.5, 0, 0.2, 0.08, 0.02, 1, 0.4, 0.1);
        if (pr.life <= 0) explode = true;
      }
      if (explode) {
        if (pr.auth && this.isHost) {
          this.killProj(pr);
          this.hostExplode(pr.pos.x, pr.pos.y, pr.pos.z, pr.k === 'rocket' ? 'rocket' : 'nade', pr.owner, pr.id);
        } else { pr.dead = true; pr.mesh.visible = false; pr.life = 0; if (pr.snd) { pr.snd.stop(); pr.snd = null; } }
      }
    }
  }
  nadeBounce(pr) {
    if (this.now - (pr.lastBounce || 0) < 0.1) return;
    pr.lastBounce = this.now;
    this.audio.impact('metal', pr.pos, 0.35);
  }

  // ===================== ИНТЕРПОЛЯЦИЯ =====================
  // Состояния других игроков складываем в буфер и показываем их чуть "в прошлом",
  // плавно переходя между полученными точками — так скачки пинга не видны.
  pushSample(p, x, y, z, yaw, pitch) {
    const t = performance.now() / 1000;
    const h = p.hist || (p.hist = []);
    const last = h[h.length - 1];
    if (last) {
      const gap = t - last.t;
      p.ia = p.ia ? p.ia * 0.9 + gap * 0.1 : gap;
      p.ij = p.ij ? p.ij * 0.9 + Math.abs(gap - p.ia) * 0.1 : 0.02;
      if (Math.abs(last.x - x) + Math.abs(last.z - z) > 6) h.length = 0; // телепорт
    }
    h.push({ t, x, y, z, yaw, pitch });
    if (h.length > 40) h.splice(0, h.length - 40);
    p.tpos.set(x, y, z); p.tyaw = yaw; p.tpitch = pitch;
  }
  interpRemote(p, nowS, k) {
    const h = p.hist;
    if (!h || !h.length) {
      p.pos.lerp(p.tpos, k); p.yaw = angleLerp(p.yaw, p.tyaw, k); p.pitch += (p.tpitch - p.pitch) * k;
      return;
    }
    const ia = Math.min(p.ia || 0.07, 0.5), ij = p.ij || 0.02;
    const delay = Math.max(0.06, Math.min(0.45, ia * 1.3 + ij * 2.5));
    const rt = nowS - delay;
    let i = h.length - 1;
    while (i > 0 && h[i].t > rt) i--;
    const a = h[i], b = h[i + 1];
    let x, y, z, yaw, pitch;
    if (rt <= a.t || !b && h.length === 1) { x = a.x; y = a.y; z = a.z; yaw = a.yaw; pitch = a.pitch; }
    else if (b) {
      const u = Math.min(1, (rt - a.t) / Math.max(0.001, b.t - a.t));
      x = a.x + (b.x - a.x) * u; y = a.y + (b.y - a.y) * u; z = a.z + (b.z - a.z) * u;
      yaw = angleLerp(a.yaw, b.yaw, u); pitch = a.pitch + (b.pitch - a.pitch) * u;
    } else {
      // новых данных нет: недолго продолжаем движение, если игрок явно бежал
      const pr = h[h.length - 2];
      const ex = nowS - a.t < ia * 2.5 ? Math.min(rt - a.t, 0.15) : 0;
      const dtp = Math.max(0.001, a.t - pr.t);
      x = a.x + (a.x - pr.x) / dtp * ex; y = a.y; z = a.z + (a.z - pr.z) / dtp * ex;
      yaw = a.yaw; pitch = a.pitch;
    }
    // мягко подводим (без рывков при перестройке буфера)
    const kk = Math.min(1, k * 2.2);
    p.pos.x += (x - p.pos.x) * kk; p.pos.y += (y - p.pos.y) * kk; p.pos.z += (z - p.pos.z) * kk;
    if (p.pos.distanceToSquared(_v2.set(x, y, z)) > 25) p.pos.set(x, y, z);
    p.yaw = angleLerp(p.yaw, yaw, kk); p.pitch += (pitch - p.pitch) * kk;
    while (h.length > 2 && h[1].t < rt - 0.5) h.shift();
  }

  // ===================== КАДР =====================
  update(dt, inp) {
    this.now += dt;
    this.frameNo = (this.frameNo || 0) + 1;
    this.audio.frame(dt);
    if (!this.ready || !this.me) { if (this.post) this.post.begin(); this.renderer.render(this.scene, this.camera); if (this.post) this.post.end(); return; }
    this.updateLocal(dt, inp);
    // урон по блокам — пачкой
    if (this.pendingBd.size) {
      const l = [];
      for (const [k, v] of this.pendingBd) l.push(k, r2(v));
      this.pendingBd.clear();
      this.toHost({ t: 'bd', l });
    }
    if (this.isHost) this.hostTick(dt);
    else {
      this.netT -= dt;
      if (this.netT <= 0) {
        this.netT = NET_DT;
        const p = this.me;
        const st = [r2(p.pos.x), r2(p.pos.y), r2(p.pos.z), r2(p.yaw), r2(p.pitch + p.recoil), p.weapon, this.flagsOf(p), p.weapon === W.BUILD ? this.buildBlockId() : 0];
        const key = st.join(',');
        if (key !== this.lastSt || this.now > this.stKeepT) { this.lastSt = key; this.stKeepT = this.now + 1; this.net.send({ t: 'st', p: st }); }
      }
      this.pingT -= dt;
      if (this.pingT <= 0) { this.pingT = 2; this.net.send({ t: 'ping', s: performance.now() }); }
    }
    this.updateProjectiles(dt);
    // остальные игроки: интерполяция + анимация
    const k = 1 - Math.exp(-dt * 14);
    for (const p of this.players.values()) {
      if (!p.isLocal && !(p.isBot && this.isHost)) {
        _v1.copy(p.pos);
        this.interpRemote(p, performance.now() / 1000, k);
        p.speed = p.speed * 0.8 + (Math.hypot(p.pos.x - _v1.x, p.pos.z - _v1.z) / Math.max(dt, 0.001)) * 0.2;
        const f = p.flags || 0;
        p.firing = !!(f & 2); p.gliding = !!(f & 4); p.onGround = !!(f & 8);
        if (!(f & 1) && p.alive && this.isHost === false) { /* смерть приходит событием */ }
      }
      // шаги других кур рядом — слышно, кто подкрадывается
      if (!p.isLocal && p.alive && p.onGround !== false && (p.speed || 0) > 1.2) {
        p.stepD = (p.stepD || 0) + p.speed * dt;
        if (p.stepD > 1.6) { p.stepD = 0; if (this.camera.position.distanceToSquared(p.pos) < 900) this.audio.step(this.matUnder(p), p.pos, 0.5); }
      }
      const m = p.model;
      if (!p.alive && m.deadT >= 1 && this.now - (p.diedAt || 0) > 2.5) m.root.visible = false;
      if (p.alive) p.diedAt = this.now;
      m.root.position.copy(p.pos);
      if (p.stepOff) m.root.position.y += p.stepOff;
      m.root.rotation.y = p.yaw;
      p.groundY = this.groundBelow(p);
      m.setLod(p.alive && !p.isLocal && this.camera.position.distanceToSquared(p.pos) > 1600);
      m.animate(dt, { speed: p.speed || 0, onGround: p.onGround, gliding: p.gliding, pitch: p.isLocal ? p.pitch + p.recoil : p.pitch, dead: !p.alive, firing: p.firing, groundY: p.groundY });
      if (m.tag) m.tag.visible = p.alive && this.camera.position.distanceToSquared(p.pos) < 2500; // дальние ники не рисуем
    }
    // яйца
    for (const e of this.eggs) {
      if (e.hp > 0) {
        // падение, если снизу пусто
        if (!this.world.solid(Math.floor(e.pos.x), Math.floor(e.pos.y - 0.05), Math.floor(e.pos.z)) && e.pos.y > 1) e.pos.y = Math.max(Math.floor(e.pos.y - 0.05), e.pos.y - dt * 8);
        e.mesh.visible = true;
      }
      e.mesh.position.copy(e.pos);
      e.wob = Math.max(0, e.wob - dt * 3);
      e.egg.rotation.z = Math.sin(this.now * 40) * e.wob * 0.15;
      e.egg.rotation.y += dt * 0.6;
      const stage = Math.min(4, Math.floor((1 - e.hp / EGG_HP) * 5));
      if (stage !== e.stage) { e.stage = stage; e.egg.material.map = this.crackTex[stage]; e.egg.material.needsUpdate = true; }
      e.egg.material.emissive.setHex(e.wob > 0.5 ? 0x664400 : 0x332200);
    }
    this.updateCamera(dt);
    this.camera.updateMatrixWorld();
    this.audio.setListener(this.camera);
    // под водой: синий оттенок и глухой звук
    const cp = this.camera.position, uw = this.world.liquid(Math.floor(cp.x), Math.floor(cp.y), Math.floor(cp.z));
    if (uw !== this.underwater) {
      this.underwater = uw;
      document.getElementById('underwater').classList.toggle('hidden', !uw);
      if (this.audio.ears && this.audio.ctx) this.audio.ears.frequency.setTargetAtTime(uw ? 700 : 20000, this.audio.ctx.currentTime, 0.05);
    }
    this.sunSprite.position.set(this.camera.position.x + 120, this.camera.position.y + 150, this.camera.position.z + 60);
    this.clouds.position.x = ((this.now * 1.2) % 300) - 150;
    this.skyDome.position.copy(this.camera.position);
    this.mesher.time.value = this.now;
    this.fx.update(dt);
    this.mesher.update(this.mesher.dirtyList.size > 40 ? 6 : 2.5, this.camera.position);
    this.updateHUD(dt);
    this.updateShadowCam();
    if (this.post) this.post.begin();
    this.renderer.render(this.scene, this.camera);
    // оружие от первого лица поверх мира
    if (this.fpActive()) {
      const p = this.me, w = WEAPONS[p.weapon];
      if (w.build) this.vm.setBlock(this.buildBlockId());
      this.vm.update(dt, {
        weapon: p.weapon, aiming: p.aiming, speed: p.speed || 0, onGround: p.onGround, vy: p.vel.y,
        lookX: this.lastLook[0], lookY: this.lastLook[1], firing: p.firing, alive: p.alive,
        reload: p.reloadT >= 0 ? 1 - p.reloadT / p.reloadDur : -1,
        spin: w.spinup ? p.spin / w.spinup : 0,
      });
      if (!(w.scope && this.vm.ads > 0.85)) this.vm.render();
    } else this.vm.ads = 0;
    if (this.post) this.post.end();
  }

  // тень от солнца рисуется в квадрате вокруг игрока (чуть впереди взгляда), с привязкой к текселям — без дрожания
  updateShadowCam() {
    if (!this.sun.castShadow) return;
    const c = this.camera, R = this.shadowR, sun = this.sun;
    c.getWorldDirection(_dir);
    const tx = c.position.x + _dir.x * R * 0.45, tz = c.position.z + _dir.z * R * 0.45, ty = Math.min(SY, Math.max(0, c.position.y - 4));
    const L = _v2.set(0.5, 1, 0.3).normalize();
    // базис света для привязки к сетке теней
    const texel = (2 * R) / sun.shadow.mapSize.x;
    const right = _v3.set(-L.z, 0, L.x).normalize();
    const up = _v1.crossVectors(right, L);
    const a = Math.round((tx * right.x + tz * right.z) / texel) * texel;
    const bU = Math.round((tx * up.x + ty * up.y + tz * up.z) / texel) * texel;
    const dL = tx * L.x + ty * L.y + tz * L.z;
    const px = right.x * a + up.x * bU + L.x * dL, py = right.y * a + up.y * bU + L.y * dL, pz = right.z * a + up.z * bU + L.z * dL;
    sun.target.position.set(px, py, pz); sun.target.updateMatrixWorld();
    sun.position.set(px + L.x * 110, py + L.y * 110, pz + L.z * 110);
    sun.updateMatrixWorld();
    // на «Высокой» тень обновляется через кадр — заметно дешевле
    const r = this.renderer.shadowMap;
    r.autoUpdate = false;
    if (sun.shadow.mapSize.x >= 2048 || (this.frameNo & 1) === 0) r.needsUpdate = true;
  }

  updateHUD(dt) {
    const p = this.me, w = WEAPONS[p.weapon], h = this.hud;
    h.hp(p.hp);
    h.weapon(p.weapon, !!w.build);
    if (w.build) { h.ammo('🧱', BLOCKS[this.buildBlockId()].name); h.block(p.buildSel); h.res(p.res); h.reload(-1); }
    else {
      h.ammo(p.reloadT >= 0 ? '…' : String(p.ammo[p.weapon]), '/ ' + w.mag);
      h.reload(p.reloadT >= 0 ? 1 - p.reloadT / p.reloadDur : -1);
    }
    h.nades(p.nades);
    h.aim(p.aiming);
    h.scope(p.alive && !!w.scope && p.aiming && this.vm.ads > 0.85, w.scope);
    const spread = this.currentSpread();
    const px = Math.tan(spread) * innerHeight / (2 * Math.tan(this.camera.fov * Math.PI / 360));
    this.enemyCheckT -= dt;
    if (this.enemyCheckT <= 0 && p.alive) {
      this.enemyCheckT = 0.1;
      const { o, d } = this.camRay();
      const t = this.trace(o.x, o.y, o.z, d.x, d.y, d.z, w.range || 100, p.id, false);
      this.enemyUnder = (t.kind === 'player' && t.player.team !== p.team) || (t.kind === 'egg' && t.egg.team !== p.team);
    }
    h.crosshair(px + 3, this.enemyUnder);
    h.score(this.score[0], this.score[1], this.eggs[0] ? this.eggs[0].hp : 0, this.eggs[1] ? this.eggs[1].hp : 0);
    if (!p.alive && this.roundState === 'play') {
      const left = Math.max(0, Math.ceil(RESPAWN_TIME - (this.now - (this.deathAt || this.now))));
      h.death(true, this.deathBy || '', left);
    } else h.death(false);
    this.roomT = (this.roomT || 0) - dt;
    if (this.roomT > 0) { h.update(dt); return; }
    this.roomT = 0.5;
    const code = (this.o.code ? `Комната ${this.o.code}` : 'Офлайн') + ' · ' + (this.world.info.name || '');
    h.room(this.isHost ? `${code} · игроков ${[...this.players.values()].filter(q => !q.isBot).length}` : `${code} · пинг ${this.ping}мс${this.via ? ' · ' + this.via : ''}`);
    h.update(dt);
  }

  toggleScoreboard() {
    this.sbOpen = !this.sbOpen;
    document.getElementById('scoreboard').classList.toggle('hidden', !this.sbOpen);
    if (this.sbOpen) this.renderScoreboard();
  }
  renderScoreboard() { this.hud.scoreboard([...this.players.values()], this.myId); }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.vm.resize(w, h);
  }

  dispose() {
    this.disposed = true;
    this.mesher.dispose();
    for (const p of this.players.values()) p.model.removeFrom(this.scene);
    this.players.clear();
    if (this.net) this.net.close();
    this.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
}
