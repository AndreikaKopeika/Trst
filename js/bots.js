// Боты-курицы (считаются на телефоне хоста). У каждого есть роль:
//  штурмовик (идёт к вражескому яйцу, иногда собирается в отряд), фланговый (обходной путь),
//  инженер (укрепляет своё яйцо, ставит стены, чинит), снайпер (строит вышку и стреляет издалека),
//  сапёр (подкладывает ТНТ к стенам и яйцу, отходит и подрывает), охранник (без стройки).
// Все умеют строить мосты/столбы по карте путей, ставить укрытия в перестрелке, отступать раненными.
import { WEAPONS, W } from './weapons.js';
import { teamWool, BLOCKS, B } from './blocks.js';
import { SX, SY } from './world.js';

const EYE = 1.32, SPEED = 5.4, REACH = 4.6, INF = 65535;
const TEAM_BLOCK_CAP = 260;   // сколько блоков-построек (не мостов) команда ставит за раунд
const TOWER_H = 4;

export const BOT_NAMES = ['Ряба', 'Наггетс', 'Бройлер', 'Цыпа', 'Кудахтер', 'Окорочок', 'Крылышко', 'Петя Гриль',
  'Табака', 'Пернатый', 'Яйцелоб', 'Клювокрут', 'Несушка', 'Гребешок', 'Пух', 'Шаурма'];
export const BOT_WEAPONS = [W.AK, W.AK, W.LMG, W.SHOTGUN, W.SNIPER, W.HMG, W.RPG, W.LMG];

// сложность: 0 — лёгкие, 1 — обычные, 2 — сложные
const SK = [
  { react: 0.75, reactR: 0.6, err: 2.1, turn: 4.2, nade: 24, think: 0.42, snipe: 1.25, lead: 0, place: 0.3, hpRun: 0 },
  { react: 0.35, reactR: 0.4, err: 1.0, turn: 7, nade: 12, think: 0.26, snipe: 0.7, lead: 0.08, place: 0.22, hpRun: 32 },
  { react: 0.17, reactR: 0.2, err: 0.55, turn: 10, nade: 8, think: 0.17, snipe: 0.45, lead: 0.12, place: 0.16, hpRun: 40 },
];
// состав команды по стратегиям (первые N ролей)
const STRATS = {
  balanced: ['rush', 'engineer', 'sniper', 'sapper', 'flank', 'rush', 'rush', 'sniper'],
  squad: ['rush', 'rush', 'engineer', 'sapper', 'rush', 'sniper', 'rush', 'flank'],
  turtle: ['engineer', 'rush', 'sniper', 'engineer', 'sapper', 'rush', 'sniper', 'rush'],
  aggro: ['rush', 'sapper', 'flank', 'rush', 'sniper', 'rush', 'sapper', 'rush'],
  flank: ['flank', 'rush', 'engineer', 'flank', 'sniper', 'sapper', 'rush', 'rush'],
};
const STRAT_KEYS = Object.keys(STRATS);

const rnd = (a, b) => a + Math.random() * (b - a);
const skillOf = (g) => SK[g.botSkill === 0 || g.botSkill === 2 ? g.botSkill : 1];
const canBuild = (g) => g.botBuild !== false;

function visible(g, b, x, y, z) {
  const ox = b.pos.x, oy = b.pos.y + EYE, oz = b.pos.z;
  const dx = x - ox, dy = y - oy, dz = z - oz;
  const d = Math.hypot(dx, dy, dz);
  if (d < 0.01) return true;
  return !g.world.raycast(ox, oy, oz, dx / d, dy / d, dz / d, d - 0.3, true);
}

// видит ли бот сам блок (луч упирается именно в него)
function seesBlock(g, b, x, y, z) {
  const ox = b.pos.x, oy = b.pos.y + EYE, oz = b.pos.z;
  const dx = x + 0.5 - ox, dy = y + 0.5 - oy, dz = z + 0.5 - oz;
  const d = Math.hypot(dx, dy, dz) || 1;
  const h = g.world.raycast(ox, oy, oz, dx / d, dy / d, dz / d, d + 1, true);
  return !!h && h.x === x && h.y === y && h.z === z;
}

function inBase(g, team, x, z, pad = 0) {
  const b = g.world.info.bases[team];
  return x >= b.x0 - pad && x <= b.x1 + pad && z >= b.z0 - pad && z <= b.z1 + pad;
}
function nearSpawn(g, team, x, z, r) {
  for (const s of g.world.info.spawns[team]) if (Math.abs(s[0] - x - 0.5) < r && Math.abs(s[2] - z - 0.5) < r) return true;
  return false;
}
// можно ли стоять в клетке (ноги в y)
function standOK(W_, x, y, z) { return !W_.solid(x, y, z) && !W_.solid(x, y + 1, z) && W_.solid(x, y - 1, z); }
function groundNear(W_, x, y, z, up = 3, down = 4) {
  for (let yy = y + up; yy >= y - down; yy--) if (yy >= 1 && standOK(W_, x, yy, z)) return yy;
  return -1;
}

// ---------- состояние команды (на раунд) ----------
const TS = new WeakMap();
function teamState(g, team) {
  let s = TS.get(g);
  if (!s || s.eggs !== g.eggs) { s = { eggs: g.eggs, t: [newTeam(g, 0), newTeam(g, 1)] }; TS.set(g, s); }
  return s.t[team];
}
function newTeam(g, team) {
  const strat = STRAT_KEYS[Math.floor(Math.random() * STRAT_KEYS.length)];
  return {
    team, strat, roles: STRATS[strat], squad: strat === 'squad' || Math.random() < 0.35,
    tick: -99, eggHist: [], alarm: 0, recallAt: -99, seenT: -99, seenPos: null,
    path: null, approach: null, pathT: -99, rally: null, pushT: -99,
    fort: [], ringDone: false, walls: 0, wallT: -99, built: 0, towers: 0, stat: {},
  };
}

function teamThink(g, ts) {
  const now = g.now;
  ts.tick = now;
  const egg = g.eggs[ts.team];
  // урон по своему яйцу за последние ~6 с
  if (egg) {
    ts.eggHist.push(egg.hp);
    if (ts.eggHist.length > 12) ts.eggHist.shift();
    const lost = ts.eggHist[0] - egg.hp;
    ts.alarm = lost > 150 ? 2 : lost > 15 ? 1 : 0;
  }
  // пути: от своего респа к вражескому яйцу и от вражеского респа к нашему
  const nav = g.nav;
  if (nav && nav.ready[0] && nav.ready[1] && now - ts.pathT > 12) {
    ts.pathT = now;
    const info = g.world.info;
    const s = info.spawns[ts.team][Math.floor(Math.random() * info.spawns[ts.team].length)];
    const p = nav.trace(1 - ts.team, { x: s[0], y: s[1], z: s[2] }, 600);
    if (p && p.length > 8 && p[p.length - 1][3] === 0) {
      ts.path = p;
      ts.rally = p[Math.floor(p.length * rnd(0.36, 0.48))];
    }
    const es = info.spawns[1 - ts.team][Math.floor(Math.random() * info.spawns[1 - ts.team].length)];
    const a = nav.trace(ts.team, { x: es[0], y: es[1], z: es[2] }, 600);
    if (a && a.length > 8 && a[a.length - 1][3] === 0) ts.approach = a;
  }
  // яйцо под сильным огнём — ближайший атакующий возвращается
  if (ts.alarm === 2 && now - ts.recallAt > 18 && nav && nav.ready[ts.team]) {
    let best = null, bd = 1e9;
    for (const p of g.players.values()) {
      if (!p.isBot || p.team !== ts.team || !p.alive || !p.ai || !p.ai.job) continue;
      if (p.ai.job === 'engineer' || p.ai.job === 'guard' || p.ai.job === 'sniper') continue;
      const d = p.pos.distanceTo(egg.pos);
      if (d < bd) { bd = d; best = p; }
    }
    if (best) { best.ai.recallUntil = now + 20; ts.recallAt = now; }
  }
}

// выбор роли при возрождении (учитывает текущих ботов команды)
function pickRole(g, b, ts) {
  const mates = [...g.players.values()].filter(p => p.isBot && p.team === b.team);
  const n = mates.length;
  const want = {};
  for (let i = 0; i < n; i++) { const r = ts.roles[i % ts.roles.length]; want[r] = (want[r] || 0) + 1; }
  if (!canBuild(g)) { want.rush = (want.rush || 0) + (want.sapper || 0); want.sapper = 0; want.guard = want.engineer || 0; want.engineer = 0; }
  const have = {};
  for (const p of mates) if (p !== b && p.ai && p.ai.job) have[p.ai.job] = (have[p.ai.job] || 0) + 1;
  const cur = b.ai.job;
  if (cur && (have[cur] || 0) < (want[cur] || 0)) return cur; // своя роль ещё нужна
  const order = ['engineer', 'guard', 'sniper', 'sapper', 'flank', 'rush'];
  for (const r of order) if ((have[r] || 0) < (want[r] || 0)) return r;
  return 'rush';
}

function setWeapon(b, wi) {
  if (b.weapon === wi) return;
  b.weapon = wi; b.reloadT = -1; b.cool = 0.3;
  if (b.ammo) b.ammo[wi] = WEAPONS[wi].mag;
  if (b.model && b.model.setWeapon) b.model.setWeapon(wi);
}

function onSpawn(g, b, ts) {
  const ai = b.ai, sk = skillOf(g);
  ai.target = null; ai.react = 0; ai.think = 0; ai.strafe = 1; ai.strafeT = 0;
  ai.blockedT = 0; ai.stuckT = 0; ai.lastX = b.pos.x; ai.lastZ = b.pos.z; ai.sideT = 0; ai.side = 1;
  ai.aimT = 0; ai.nadeT = sk.nade * rnd(0.4, 1.2); ai.burstT = 0; ai.pauseT = 0; ai.wander = null; ai.wanderT = 0;
  ai.pillar = false; ai.stuckN = 0; ai.digging = false; ai.navDig = null;
  ai.route = null; ai.wp = 0; ai.flankT = 0; ai.pushed = false; ai.rallyT = 0;
  ai.coverPlan = null; ai.coverUntil = 0; ai.coverCool = rnd(3, 10); ai.retreatUntil = 0;
  ai.tnt = null; ai.tntCool = rnd(2, 6); ai.task = null; ai.taskT = 0;
  ai.spot = null; ai.sstate = 'pick'; ai.campUntil = 0; ai.tower = 0; ai.recallUntil = 0;
  ai.lastSeen = null; ai.lookAt = null; ai.lookT = 0; ai.placeT = 0; ai.decideT = 0;
  if (ai.climber === undefined) ai.climber = Math.random() < 0.5;
  ai.job = pickRole(g, b, ts);
  if (ai.baseWeapon === undefined) ai.baseWeapon = b.weapon;
  setWeapon(b, ai.job === 'sniper' ? W.SNIPER : ai.baseWeapon === W.SNIPER && ai.job !== 'sniper' ? W.AK : ai.baseWeapon);
}

// ---------- стройка ----------
// kind: bridge/pillar (по карте путей), ring/wall (укрепления), tower, cover, tnt
function place(g, b, x, y, z, id, kind) {
  const ai = b.ai;
  if (ai.placeT > 0) return false;
  const cost = BLOCKS[id].cost || 1;
  if (b.res < cost) return false;
  const dx = x + 0.5 - b.pos.x, dy = y + 0.5 - (b.pos.y + EYE), dz = z + 0.5 - b.pos.z;
  if (dx * dx + dy * dy + dz * dz > REACH * REACH) return false;
  if (!g.canPlace(x, y, z)) return false;
  if (nearSpawn(g, 1 - b.team, x, z, 4)) return false;
  g.hostSetBlock(x, y, z, id, 0);
  b.res -= cost;
  ai.placeT = skillOf(g).place;
  ai.lookAt = { x: x + 0.5, y: y + 0.5, z: z + 0.5 }; ai.lookT = 0.25;
  if (b.model && b.model.fire) b.model.fire(0.3);
  const ts = teamState(g, b.team);
  if (kind === 'ring' || kind === 'wall' || kind === 'tower' || kind === 'cover') ts.built++;
  ts.stat[kind] = (ts.stat[kind] || 0) + 1;
  return true;
}
function startPillar(ai, b, n, id, kind = 'pillar') {
  ai.pillar = true; ai.pillarN = 0; ai.pillarMax = n; ai.pillarId = id; ai.pillarT = 0; ai.pillarKind = kind;
  ai.pX = Math.floor(b.pos.x) + 0.5; ai.pZ = Math.floor(b.pos.z) + 0.5; ai.py = undefined;
}

// ---------- движение ----------
// идти по карте путей к яйцу team (с мостами, столбами и пробиванием)
function followNav(g, b, c, team) {
  const ai = b.ai;
  if (!g.nav) return false;
  const grounded = b.onGround || b.inWater;
  const nx = g.nav.next(team, b.pos, grounded);
  if (!nx) return false;
  c.gx = nx.x; c.gz = nx.z; c.nav = true;
  ai.navDist = nx.dist;
  if (nx.done) return true;
  if (nx.dig) ai.navDig = nx.dig;
  if (nx.up) c.jump = true;
  if (b.onGround && !b.inWater && !ai.pillar) {
    if (nx.bridge) {
      const [x, y, z] = nx.bridge;
      if (!g.world.solid(x, y, z) && !place(g, b, x, y, z, teamWool(b.team), 'bridge')) {
        // блок ещё не поставлен — ждём на краю своей клетки
        const fx = Math.floor(b.pos.x) + 0.5, fz = Math.floor(b.pos.z) + 0.5;
        c.gx = fx + (x + 0.5 - fx) * 0.25; c.gz = fz + (z + 0.5 - fz) * 0.25;
      }
      ai.bridgeN = (ai.bridgeN || 0) + 1;
    } else if (nx.pillar) startPillar(ai, b, 1, teamWool(b.team));
  }
  return true;
}
// идти к точке: по карте путей (вперёд или назад), пока далеко, затем напрямую
function goPoint(g, b, c, pt) {
  const hd = Math.hypot(pt[0] + 0.5 - b.pos.x, pt[2] + 0.5 - b.pos.z);
  const nav = g.nav;
  if (nav && hd > 3.5) {
    const bx = Math.floor(b.pos.x), bz = Math.floor(b.pos.z);
    for (const t of [1 - b.team, b.team]) {
      if (!nav.ready[t]) continue;
      const by = nav.cellOf(t, b.pos, true);
      if (by < 0) continue;
      const dp = nav.dist(t, pt[0], pt[1], pt[2]), db = nav.dist(t, bx, by, bz);
      if (dp < INF && db < INF && db > dp + 3 && followNav(g, b, c, t)) return hd;
    }
  }
  c.gx = pt[0] + 0.5; c.gz = pt[2] + 0.5; c.direct = true;
  return hd;
}

function route(g, b) {
  const R = g.world.info.routes;
  if (R) {
    const lanes = R[b.team];
    // фланговый берёт не самый прямой путь
    const k = lanes.length > 1 ? 1 + Math.floor(Math.random() * (lanes.length - 1)) : 0;
    return lanes[k].map(p => p.slice());
  }
  const own = g.world.info.bases[b.team], en = g.world.info.bases[1 - b.team];
  const dir = b.team === 0 ? 1 : -1;
  const ownFront = b.team === 0 ? own.x1 : own.x0;
  const enFront = b.team === 0 ? en.x0 : en.x1;
  const cz = Math.floor((own.z0 + own.z1) / 2) + 0.5;
  const side = Math.random() < 0.5 ? -1 : 1;
  const lane = side * rnd(12, 22);
  const egg = g.eggs[1 - b.team];
  const clampZ = (z) => Math.max(3, Math.min(56, z));
  return [
    [ownFront + dir * 4 + 0.5, cz],
    [ownFront + dir * 10, clampZ(cz + lane * 0.8)],
    [(ownFront + enFront) / 2, clampZ(cz + lane)],
    [enFront - dir * 8, clampZ(cz + lane * 0.8)],
    [enFront - dir * 2 + 0.5, cz],
    egg ? [egg.pos.x, egg.pos.z] : [enFront + dir * 6, cz],
  ];
}

// ---------- планы построек ----------
// кольцо мешков вокруг своего яйца (проход сзади)
function planRing(g, ts) {
  const e = g.eggs[ts.team], W_ = g.world;
  if (!e) return;
  const ex = Math.floor(e.pos.x), ey = Math.floor(e.pos.y + 0.01), ez = Math.floor(e.pos.z);
  const back = g.eggs[1 - ts.team] && g.eggs[1 - ts.team].pos.x > e.pos.x ? -1 : 1;
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    if (Math.abs(dx) !== 2 && Math.abs(dz) !== 2) continue;
    if (dx === back * 2 && Math.abs(dz) <= 0) continue;
    const x = ex + dx, z = ez + dz;
    if (nearSpawn(g, ts.team, x, z, 1.6)) continue;
    let gy = -1;
    for (let y = ey + 1; y >= ey - 2; y--) if (!W_.solid(x, y, z) && W_.solid(x, y - 1, z)) { gy = y; break; }
    if (gy < 0 || gy > ey) continue;
    for (let y = gy; y <= ey; y++) ts.fort.push({ x, y, z, id: y === ey ? B.SANDBAG : B.PLANKS, kind: 'ring' });
  }
  ts.ringDone = true;
}
// стена 3x2 поперёк пути врага к нашему яйцу (только на открытом месте)
function planWall(g, ts) {
  const A = ts.approach, W_ = g.world, e = g.eggs[ts.team];
  if (!A || !e) return false;
  for (let tries = 0; tries < 6; tries++) {
    const k = A.length - 1 - Math.floor(rnd(8, 16));
    if (k < 3) return false;
    const [x, y, z] = A[k], [x0, , z0] = A[Math.max(0, k - 3)], [x1, , z1] = A[Math.min(A.length - 1, k + 3)];
    if (Math.hypot(x - e.pos.x, z - e.pos.z) < 5 || nearSpawn(g, ts.team, x, z, 2.5) || nearSpawn(g, 1 - ts.team, x, z, 5)) continue;
    const ax = x1 - x0, az = z1 - z0;
    const lx = Math.abs(ax) >= Math.abs(az) ? 0 : 1, lz = 1 - lx; // поперёк движения
    // сбоку должен быть обход
    const open = (s) => standOK(W_, x + lx * s, y, z + lz * s) || W_.liquid(x + lx * s, y - 1, z + lz * s);
    if (!(open(2) && open(3)) && !(open(-2) && open(-3))) continue;
    const cells = [];
    for (let l = -1; l <= 1; l++) {
      const cx = x + lx * l, cz = z + lz * l;
      if (!W_.solid(cx, y - 1, cz) || W_.solid(cx, y, cz)) continue;
      cells.push({ x: cx, y, z: cz, id: B.SANDBAG, kind: 'wall' }, { x: cx, y: y + 1, z: cz, id: l === 0 ? B.SANDBAG : B.BRICK, kind: 'wall' });
    }
    if (cells.length < 4) continue;
    ts.fort.push(...cells); ts.walls++;
    return true;
  }
  return false;
}
function missing(g, f) { const id = g.world.get(f.x, f.y, f.z); return !id || g.world.liquid(f.x, f.y, f.z); }

// место для снайперской вышки: на своей половине, у пути к врагу, с длинным обзором
function pickSpot(g, b, ts) {
  const P = ts.path, W_ = g.world, e = g.eggs[1 - b.team];
  if (!P || !e) return null;
  let best = null, bs = -1;
  for (let k = 0; k < 9; k++) {
    const c = P[Math.floor(P.length * rnd(0.15, 0.42))];
    const x = c[0] + Math.round(rnd(-5, 5)), z = c[2] + Math.round(rnd(-6, 6));
    if (x < 2 || z < 2 || x > SX - 3 || z > 57) continue;
    if ((b.team === 0 && x > SX / 2 - 6) || (b.team === 1 && x < SX / 2 + 6)) continue;
    const y = groundNear(W_, x, c[1], z, 3, 4);
    if (y < 0 || W_.liquid(x, y, z) || nearSpawn(g, b.team, x, z, 2.5)) continue;
    if (g.nav && g.nav.dist(1 - b.team, x, y, z) >= INF) continue;
    // столб и голова на вершине должны быть свободны
    let clear = true;
    for (let h = 0; h <= TOWER_H + 2; h++) if (W_.solid(x, y + h, z)) { clear = false; break; }
    const top = y + (clear && canBuild(g) && ts.towers < 3 ? TOWER_H : 0) + EYE;
    const a0 = Math.atan2(e.pos.z - z, e.pos.x - x);
    let sc = 0;
    for (const da of [-0.5, -0.25, 0, 0.25, 0.5]) {
      const dx = Math.cos(a0 + da), dz = Math.sin(a0 + da);
      const h = W_.raycast(x + 0.5, top, z + 0.5, dx * 0.995, -0.1, dz * 0.995, 80, true);
      sc += h ? h.dist : 80;
    }
    sc += clear ? 30 : 0;
    if (sc > bs) { bs = sc; best = { x, y, z, tower: clear }; }
  }
  return best;
}

// ---------- роли (задают куда идти) ----------
function roleMove(g, b, c, ts, dt) {
  const ai = b.ai, now = g.now, W_ = g.world;
  const ownEgg = g.eggs[b.team], enEgg = g.eggs[1 - b.team];
  const build = canBuild(g);
  let job = ai.job;
  if (ai.recallUntil > now) job = 'guard';

  // сапёр: ТНТ заложен — отходим и подрываем
  if (ai.tnt) {
    const t = ai.tnt;
    if (W_.get(t.x, t.y, t.z) !== B.TNT) { ai.tnt = null; ai.tntCool = rnd(4, 8); }
    else {
      const d = Math.hypot(t.x + 0.5 - b.pos.x, t.z + 0.5 - b.pos.z);
      t.t += dt;
      if (t.state === 'back') {
        if (d < 8.5 && t.t < 4) { if (!followNav(g, b, c, b.team)) { c.gx = b.pos.x * 2 - t.x; c.gz = b.pos.z * 2 - t.z; } return; }
        t.state = 'shoot'; t.t = 0;
      }
      if (t.t > 5) { ai.tnt = null; ai.tntCool = rnd(3, 6); }
      else {
        c.aim = { x: t.x + 0.5, y: t.y + 0.5, z: t.z + 0.5 }; c.shoot = true; c.precise = true;
        if (t.t > 1.5 && !seesBlock(g, b, t.x, t.y, t.z)) { ai.sideT = 0.6; ai.side = Math.random() < 0.5 ? -1 : 1; t.t = 0.2; }
        return;
      }
    }
  }

  if (job === 'engineer' || job === 'guard') {
    if (!ownEgg) return;
    const de = Math.hypot(ownEgg.pos.x - b.pos.x, ownEgg.pos.z - b.pos.z);
    // работа инженера: кольцо, стена, починка
    if (job === 'engineer' && build && ts.alarm < 2) {
      if (!ts.ringDone) planRing(g, ts);
      if (ts.walls < 2 && now - ts.seenT < 25 && now - ts.wallT > 35 && ts.built < TEAM_BLOCK_CAP - 20) { ts.wallT = now; planWall(g, ts); }
      ai.taskT -= dt;
      if (ai.taskT <= 0) {
        ai.taskT = 1;
        ai.task = null;
        if (b.res >= 2 && ts.built < TEAM_BLOCK_CAP) {
          let bd = 1e9;
          for (const f of ts.fort) {
            if (f.skipT > now || !missing(g, f)) continue;
            if (f.y > 0 && !W_.solid(f.x, f.y - 1, f.z) && f.id !== B.SANDBAG) continue;
            const d = Math.hypot(f.x - b.pos.x, f.z - b.pos.z) + Math.abs(f.y - b.pos.y);
            if (d < bd) { bd = d; ai.task = f; }
          }
        }
      }
      const f = ai.task;
      if (f) {
        const hd = Math.hypot(f.x + 0.5 - b.pos.x, f.z + 0.5 - b.pos.z);
        if (hd < 3.2 && Math.abs(f.y + 0.5 - b.pos.y - EYE) < 3.5) {
          if (!missing(g, f)) { ai.task = null; ai.taskT = 0; return; }
          // стоим рядом, но не в клетке
          if (hd < 1.1) { c.gx = b.pos.x * 2 - f.x - 0.5; c.gz = b.pos.z * 2 - f.z - 0.5; }
          if (place(g, b, f.x, f.y, f.z, f.id, f.kind)) { ai.task = null; ai.taskT = 0.15; }
          else if (ai.placeT <= 0 && !g.canPlace(f.x, f.y, f.z)) { f.skipT = now + 4; ai.task = null; ai.taskT = 0.2; }
          return;
        }
        if (Math.hypot(f.x - ownEgg.pos.x, f.z - ownEgg.pos.z) < 30) { goPoint(g, b, c, [f.x, f.y, f.z]); return; }
        ai.task = null;
      }
    }
    if (de > 12) { if (!followNav(g, b, c, b.team)) { c.gx = ownEgg.pos.x; c.gz = ownEgg.pos.z; } return; }
    ai.wanderT -= dt;
    if (!ai.wander || ai.wanderT <= 0) {
      ai.wanderT = rnd(3, 7);
      const fwd = enEgg && enEgg.pos.x > ownEgg.pos.x ? 1 : -1;
      ai.wander = { x: ownEgg.pos.x + rnd(-6, 6) + fwd * rnd(1, 6), z: ownEgg.pos.z + rnd(-7, 7) };
    }
    c.gx = ai.wander.x; c.gz = ai.wander.z; c.direct = true;
    if (Math.hypot(c.gx - b.pos.x, c.gz - b.pos.z) < 1.5) c.gx = null;
    return;
  }

  if (job === 'sniper') {
    if (ai.sstate === 'pick') {
      ai.decideT -= dt;
      if (ai.decideT > 0) { followNav(g, b, c, 1 - b.team); return; }
      ai.decideT = 1.5;
      ai.spot = pickSpot(g, b, ts);
      if (!ai.spot) { followNav(g, b, c, 1 - b.team); return; }
      ai.sstate = 'go'; ai.goT = 0;
    }
    const s = ai.spot;
    if (ai.sstate === 'go') {
      ai.goT += dt;
      const hd = goPoint(g, b, c, [s.x, s.y, s.z]);
      if (hd < 0.6 || (hd < 1.5 && ai.goT > 25)) {
        ai.sstate = s.tower && build && ts.towers < 3 && b.res >= TOWER_H * 2 ? 'build' : 'camp';
        ai.campY = b.pos.y; ai.campUntil = now + rnd(40, 75);
        if (ai.sstate === 'build') { ts.towers++; startPillar(ai, b, TOWER_H, B.BRICK, 'tower'); ai.buildT = 0; }
      } else if (ai.goT > 45) ai.sstate = 'pick';
      return;
    }
    if (ai.sstate === 'build') {
      ai.buildT += dt;
      c.gx = null;
      if (ai.pillar) return;
      // парапет вокруг на уровне ног
      const x = Math.floor(b.pos.x), y = Math.floor(b.pos.y + 0.1), z = Math.floor(b.pos.z);
      if (b.onGround && ai.buildT < 12) {
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
          if (W_.solid(x + dx, y, z + dz)) continue;
          if (b.res < 2 || ts.built >= TEAM_BLOCK_CAP) break;
          place(g, b, x + dx, y, z + dz, B.SANDBAG, 'tower');
          return;
        }
      }
      ai.sstate = 'camp'; ai.campY = b.pos.y;
      return;
    }
    // camp: стоим и смотрим на врага
    c.gx = null; c.camp = true;
    if (!c.aim && enEgg) c.look = { x: enEgg.pos.x, y: enEgg.pos.y + 2, z: enEgg.pos.z };
    if (now > ai.campUntil || b.pos.y < ai.campY - 1.5) { ai.sstate = 'pick'; ai.decideT = 0; }
    return;
  }

  // штурмовик/сапёр в отряде: ждём товарищей на точке сбора
  if ((job === 'rush' || job === 'sapper') && ts.squad && !ai.pushed && ts.rally) {
    if (now - ts.pushT < 6) ai.pushed = true;
    else {
      const r = ts.rally;
      const hd = goPoint(g, b, c, r);
      if (hd < 4) {
        ai.rallyT += dt;
        c.gx = null;
        let n = 0;
        for (const p of g.players.values()) if (p.alive && p.team === b.team && Math.hypot(p.pos.x - r[0], p.pos.z - r[2]) < 9) n++;
        if (n >= 3 || ai.rallyT > 14) { ai.pushed = true; ts.pushT = now; }
      }
      if (ai.rallyT > 14 || hd > 60) ai.pushed = true;
      return;
    }
  }

  // фланговый: сначала по обходному маршруту, потом по карте путей
  if (job === 'flank' && ai.flankT < 70) {
    ai.flankT += dt;
    if (!ai.route) { ai.route = route(g, b); ai.wp = 0; }
    if (ai.stuckN >= 2 || ai.blockedT > 1.5) ai.flankT = 99; // обход не получается — по карте путей
    else if (ai.wp < ai.route.length - 1) {
      const wp = ai.route[ai.wp];
      c.gx = wp[0]; c.gz = wp[1]; c.direct = true;
      if (Math.hypot(wp[0] - b.pos.x, wp[1] - b.pos.z) < 3) ai.wp++;
      if (!g.world.info.routes && ai.wp === 0 && !inBase(g, b.team, b.pos.x, b.pos.z)) ai.wp = 1;
      return;
    }
    ai.flankT = 99;
  }

  // атака: к вражескому яйцу по карте путей
  if (!followNav(g, b, c, 1 - b.team)) {
    if (!ai.route) { ai.route = route(g, b); ai.wp = 0; }
    const wp = ai.route[Math.min(ai.wp, ai.route.length - 1)];
    c.gx = wp[0]; c.gz = wp[1]; c.direct = true;
    if (ai.wp < ai.route.length - 1 && Math.hypot(wp[0] - b.pos.x, wp[1] - b.pos.z) < 3) ai.wp++;
  }
  // сапёр: ТНТ к стене на пути или к яйцу
  if (job === 'sapper' && build && !ai.tnt && ai.tntCool <= 0 && b.res >= 6 && b.onGround) {
    let spot = null;
    if (enEgg && enEgg.hp > 0 && Math.hypot(enEgg.pos.x - b.pos.x, enEgg.pos.z - b.pos.z) < 6.5) {
      spot = tntSpot(g, b, EGG_TNT.map(([dx, dy, dz]) => [Math.floor(enEgg.pos.x) + dx, Math.floor(enEgg.pos.y + 0.01) + dy, Math.floor(enEgg.pos.z) + dz]));
    }
    if (!spot && ai.navDig) {
      const [x, y, z] = ai.navDig;
      const id = W_.get(x, y, z);
      if (BLOCKS[id] && BLOCKS[id].hp >= 120 && Math.hypot(x + 0.5 - b.pos.x, z + 0.5 - b.pos.z) < 2.6) {
        spot = tntSpot(g, b, [[x, y + 1, z], [x + 1, y, z], [x - 1, y, z], [x, y, z + 1], [x, y, z - 1], [x, y - 1, z]]);
      }
    }
    if (spot && place(g, b, spot[0], spot[1], spot[2], B.TNT, 'tnt')) ai.tnt = { x: spot[0], y: spot[1], z: spot[2], state: 'back', t: 0 };
    else ai.tntCool = 0.7;
  }
}
// клетки вокруг яйца для ТНТ — ближние первыми
const EGG_TNT = [];
for (let dy = 0; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) if (dx || dz) EGG_TNT.push([dx, dy, dz]);
EGG_TNT.sort((a, b) => Math.hypot(a[0], a[2]) + a[1] * 0.5 - Math.hypot(b[0], b[2]) - b[1] * 0.5);
function tntSpot(g, b, cands) {
  for (const [x, y, z] of cands) {
    if (g.world.solid(x, y, z) || !g.canPlace(x, y, z)) continue;
    const dx = x + 0.5 - b.pos.x, dy = y + 0.5 - b.pos.y - EYE, dz = z + 0.5 - b.pos.z;
    if (dx * dx + dy * dy + dz * dz < REACH * REACH) return [x, y, z];
  }
  return null;
}

// укрытие из мешков между собой и врагом
function tryCover(g, b, t, ts) {
  const ai = b.ai, W_ = g.world;
  const dx = t.pos.x - b.pos.x, dz = t.pos.z - b.pos.z;
  const fx = Math.floor(b.pos.x), fy = Math.floor(b.pos.y + 0.1), fz = Math.floor(b.pos.z);
  let sx = 0, sz = 0;
  if (Math.abs(dx) > Math.abs(dz)) sx = Math.sign(dx); else sz = Math.sign(dz);
  const cells = [];
  let have = 0;
  for (let l = -1; l <= 1; l++) {
    const x = fx + sx + (sz ? l : 0), z = fz + sz + (sx ? l : 0);
    if (W_.solid(x, fy, z)) { have++; continue; }
    if (!W_.solid(x, fy - 1, z) || W_.solid(x, fy + 1, z)) continue;
    if (nearSpawn(g, b.team, x, z, 1.5)) continue;
    cells.push([x, fy, z]);
  }
  if (have >= 2) { ai.coverUntil = g.now + rnd(4, 7); ai.coverPos = [b.pos.x, b.pos.z]; return; } // уже есть укрытие
  if (cells.length < 2 || b.res < cells.length * 2 + 2) return;
  ai.coverPlan = cells; ai.coverUntil = g.now + rnd(7, 11); ai.coverPos = [b.pos.x, b.pos.z];
  void ts;
}

// ---------- главный цикл бота ----------
export function updateBot(g, b, dt) {
  const ai = b.ai || (b.ai = {});
  const ts = teamState(g, b.team);
  if (g.now - ts.tick >= 0.5) teamThink(g, ts);
  if (!b.alive) { b.firing = false; ai.alive = false; ai.pillar = false; return; }
  if (!ai.alive || ai.round !== ts) { ai.alive = true; ai.round = ts; onSpawn(g, b, ts); }
  const sk = skillOf(g);
  const w = WEAPONS[b.weapon];
  const now = g.now, W_ = g.world;
  const build = canBuild(g);

  // пассивный доход ресурсов
  ai.incT = (ai.incT || 0) + dt;
  if (ai.incT >= 2) { ai.incT = 0; if (b.res < 60) b.res++; }
  ai.placeT -= dt; ai.tntCool -= dt; ai.coverCool -= dt; ai.lookT -= dt;

  // --- поиск цели ---
  ai.think -= dt;
  if (ai.think <= 0) {
    ai.think = sk.think + Math.random() * 0.15;
    let best = null, bd = 1e9;
    const range = w.key === 'sniper' ? (ai.job === 'sniper' ? 115 : 95) : 65;
    for (const p of g.players.values()) {
      if (!p.alive || p.team === b.team) continue;
      const d = p.pos.distanceTo(b.pos);
      if (d > range || d >= bd) continue;
      if (visible(g, b, p.pos.x, p.pos.y + 0.9, p.pos.z)) { best = p; bd = d; }
    }
    if (best !== ai.target) {
      if (ai.target && ai.target.alive && !best) ai.lastSeen = { x: ai.target.pos.x, y: ai.target.pos.y, z: ai.target.pos.z, t: now };
      ai.target = best; ai.react = sk.react + Math.random() * sk.reactR; ai.aimT = 0;
    }
    ai.tdist = bd;
    if (best) { ts.seenT = now; ts.seenPos = best.pos; }
    // яйцо врага: видно ли центр, верх или низ (из-за укреплений)
    const egg = g.eggs[1 - b.team];
    ai.eggVis = false;
    if (egg && egg.hp > 0 && egg.pos.distanceTo(b.pos) < (w.key === 'sniper' ? 70 : 45)) {
      for (const oy of [0.6, 1.18, 0.2]) if (visible(g, b, egg.pos.x, egg.pos.y + oy, egg.pos.z)) { ai.eggVis = true; ai.eggY = oy; break; }
    }
  }
  ai.react -= dt;

  // --- роль: куда идти ---
  const c = ai.ctl || (ai.ctl = {});
  c.gx = null; c.gz = null; c.aim = null; c.shoot = false; c.precise = false; c.jump = false;
  c.nav = false; c.direct = false; c.camp = false; c.look = null;
  ai.navDig = null;
  if (!ai.pillar) roleMove(g, b, c, ts, dt);

  // --- бой ---
  let strafe = 0;
  const t = ai.target && ai.target.alive ? ai.target : null;
  if (t && !ai.tnt) {
    const d = b.pos.distanceTo(t.pos);
    const lead = sk.lead;
    c.aim = { x: t.pos.x + (t.vel ? t.vel.x * lead : 0), y: t.pos.y + 0.85, z: t.pos.z + (t.vel ? t.vel.z * lead : 0) };
    c.shoot = ai.react <= 0 && !(w.key === 'rpg' && d < 5);
    const want = w.key === 'shotgun' ? 5 : w.key === 'sniper' ? 32 : w.key === 'rpg' ? 18 : 13;
    const guard = ai.job === 'engineer' || ai.job === 'guard';
    if (c.camp) strafe = 0;
    else if (ai.coverUntil > now) { c.gx = ai.coverPos[0]; c.gz = ai.coverPos[1]; c.direct = true; strafe = 0; }
    else {
      strafe = ai.strafe;
      if (d < want - 4) { c.gx = b.pos.x * 2 - t.pos.x; c.gz = b.pos.z * 2 - t.pos.z; c.direct = true; }
      else if (d > want + 4) {
        // защитники гонятся недалеко от яйца, остальные продолжают путь
        const egg = g.eggs[b.team];
        if (guard && egg && t.pos.distanceTo(egg.pos) < 20) { c.gx = t.pos.x; c.gz = t.pos.z; c.direct = true; }
        else if (c.gx === null || ai.job === 'rush' && d < 25) { c.gx = t.pos.x; c.gz = t.pos.z; c.direct = true; }
      } else if (!guard && ai.job !== 'rush') { c.gx = null; }
    }
    // раненый — отступаем
    if (sk.hpRun && b.hp < sk.hpRun && ai.retreatUntil < now - 6 && ai.job !== 'sniper') ai.retreatUntil = now + rnd(3, 5);
    // укрытие в перестрелке на средней дистанции
    if (build && ai.coverCool <= 0 && b.onGround && !b.inWater && !c.camp && d > 11 && d < 45 && ai.job !== 'sniper' && ts.built < TEAM_BLOCK_CAP) {
      ai.coverCool = rnd(1.2, 2.5);
      if (Math.random() < (b.hp < 70 ? 0.6 : 0.3)) { tryCover(g, b, t, ts); if (ai.coverUntil > now) ai.coverCool = rnd(14, 24); }
    }
  } else if (ai.eggVis && !ai.tnt && ai.job !== 'engineer' && ai.job !== 'guard') {
    const egg = g.eggs[1 - b.team];
    c.aim = { x: egg.pos.x, y: egg.pos.y + (ai.eggY || 0.6), z: egg.pos.z };
    c.shoot = true;
    if (Math.hypot(egg.pos.x - b.pos.x, egg.pos.z - b.pos.z) < (w.key === 'shotgun' ? 4 : ai.job === 'sapper' ? 2.5 : 10)) {
      if (ai.job !== 'sapper' || ai.tntCool > 0 || b.res < 6) { c.gx = null; strafe = ai.strafe * 0.5; }
    }
  } else if (ai.coverUntil > now && now - (ai.lastSeen ? ai.lastSeen.t : -99) > 2) ai.coverUntil = 0;
  if (ai.retreatUntil > now) {
    // раненый: за своё укрытие, если оно есть, иначе назад к своему яйцу
    c.gx = null; strafe = 0;
    if (ai.coverUntil > now) { c.gx = ai.coverPos[0]; c.gz = ai.coverPos[1]; c.direct = true; }
    else if (!followNav(g, b, c, b.team) && t) { c.gx = b.pos.x * 2 - t.pos.x; c.gz = b.pos.z * 2 - t.pos.z; c.direct = true; }
  }
  // ставим запланированное укрытие
  if (ai.coverPlan) {
    let done = true;
    for (const [x, y, z] of ai.coverPlan) {
      if (W_.solid(x, y, z)) continue;
      done = false;
      if (place(g, b, x, y, z, B.SANDBAG, 'cover')) break;
    }
    if (done || ai.coverUntil < now) ai.coverPlan = null;
  }

  // --- вектор движения ---
  let mx = 0, mz = 0;
  if (ai.pillar) {
    const dx = ai.pX - b.pos.x, dz = ai.pZ - b.pos.z, l = Math.hypot(dx, dz);
    if (l > 0.15) { mx = dx / l * Math.min(1, l * 2); mz = dz / l * Math.min(1, l * 2); }
  } else if (c.gx !== null) {
    const dx = c.gx - b.pos.x, dz = c.gz - b.pos.z, l = Math.hypot(dx, dz);
    if (l > 0.3) { mx = dx / l; mz = dz / l; }
    else if (l > 0.05) { mx = dx / 0.3; mz = dz / 0.3; }
  }
  ai.strafeT -= dt;
  if (ai.strafeT <= 0) { ai.strafeT = 0.6 + Math.random() * 1.6; ai.strafe = Math.random() < 0.5 ? -1 : 1; }
  if (strafe && !ai.pillar) {
    const fx = c.aim ? c.aim.x - b.pos.x : mx, fz = c.aim ? c.aim.z - b.pos.z : mz;
    const l = Math.hypot(fx, fz) || 1;
    mx += (-fz / l) * strafe * 0.8; mz += (fx / l) * strafe * 0.8;
  }
  if (ai.sideT > 0) {
    ai.sideT -= dt;
    const l = Math.hypot(mx, mz) || 1;
    mx += (-mz / l) * ai.side * 1.2; mz += (mx / l) * ai.side * 1.2;
  }
  const ml = Math.hypot(mx, mz);
  if (ml > 1) { mx /= ml; mz /= ml; }

  // --- препятствия ---
  let jump = c.jump && b.onGround;
  if (ai.navDig && !c.aim) {
    const [dx_, dy_, dz_] = ai.navDig;
    if (Math.hypot(dx_ + 0.5 - b.pos.x, dz_ + 0.5 - b.pos.z) < 2.2) { c.aim = { x: dx_ + 0.5, y: dy_ + 0.5, z: dz_ + 0.5 }; c.shoot = true; ai.digging = true; }
  }
  const fx0 = Math.floor(b.pos.x), fz0 = Math.floor(b.pos.z), fy = Math.floor(b.pos.y + 0.1);
  if (ml > 0.1 && !ai.pillar) {
    // клетки, в которые упираемся: по диагонали и по каждой оси
    const px = Math.floor(b.pos.x + mx * 0.75), pz = Math.floor(b.pos.z + mz * 0.75);
    let feet = false, head = false, cell = null;
    for (let k = 0; k < 3; k++) {
      const cx = k === 1 ? px : k === 2 ? fx0 : px, cz = k === 1 ? fz0 : pz;
      if (k === 1 && px === fx0) continue;
      if (k === 2 && pz === fz0) continue;
      const f = W_.solid(cx, fy, cz), h = W_.solid(cx, fy + 1, cz);
      if (f) feet = true;
      if (h || (f && W_.solid(cx, fy + 2, cz))) { head = true; if (!cell) cell = [cx, cz]; }
    }
    if (feet && !head) jump = true;
    if (head && b.speed < 1.5) {
      ai.blockedT += dt;
      const [cx, cz] = cell;
      const ownBase = inBase(g, b.team, cx, cz, 1);
      const low = !W_.solid(cx, fy + 3, cz) || !W_.solid(cx, fy + 4, cz) && ai.climber;
      const roof = W_.solid(fx0, fy + 2, fz0);
      const navHelp = c.nav && ai.blockedT < 2.5; // карта путей сама знает, где пробить
      if (ai.blockedT > 0.4 && (ai.job === 'guard' || ai.job === 'engineer') && !ai.task) { ai.wanderT = 0; ai.blockedT = 0; }
      else if (ai.blockedT > 0.4 && !c.aim && !navHelp) {
        if ((ownBase || ai.climber) && low && !roof && ai.job !== 'flank') startPillar(ai, b, 4, teamWool(b.team), 'unstuck');
        else if (!ownBase) {
          const ty = W_.solid(cx, fy + 1, cz) ? fy + 1 : W_.solid(cx, fy + 2, cz) ? fy + 2 : fy;
          c.aim = { x: cx + 0.5, y: ty + 0.5, z: cz + 0.5 };
          c.shoot = true;
          ai.digging = true;
        }
      }
      if (ai.blockedT > 6) { ai.sideT = 1.2; ai.side = Math.random() < 0.5 ? -1 : 1; ai.blockedT = 0; ai.pillar = false; }
    } else { ai.blockedT = Math.max(0, ai.blockedT - dt); if (!head && !ai.navDig) ai.digging = false; }
  }
  // строим столб под собой (по карте путей, для вышки или чтобы выбраться)
  if (ai.pillar) {
    ai.pillarT += dt;
    if (Math.hypot(b.pos.x - ai.pX, b.pos.z - ai.pZ) > 1.3 || W_.solid(fx0, fy + 2, fz0) || ai.pillarT > 2 + ai.pillarMax * 1.5) ai.pillar = false;
    else if (b.onGround) { ai.py = Math.floor(b.pos.y + 0.01); if (Math.hypot(b.pos.x - ai.pX, b.pos.z - ai.pZ) < 0.35) jump = true; }
    else if (ai.py !== undefined && b.pos.y >= ai.py + 1.02 && !W_.solid(fx0, ai.py, fz0)) {
      if (place(g, b, fx0, ai.py, fz0, ai.pillarId || teamWool(b.team), ai.pillarKind)) {
        ai.py = undefined;
        if (++ai.pillarN >= ai.pillarMax) ai.pillar = false;
      }
    }
  }
  // застряли? 1 — шаг в сторону и прыжок, 2 — столб, 3+ — прокапываем путь
  ai.stuckT += dt;
  if (ai.stuckT > 2) {
    const moved = Math.hypot(b.pos.x - ai.lastX, b.pos.z - ai.lastZ);
    if (moved < 0.8 && ml > 0.2 && !ai.pillar) {
      ai.stuckN++;
      if (!ai.digging) { ai.sideT = 1.0; ai.side = Math.random() < 0.5 ? -1 : 1; jump = true; }
      if (ai.stuckN >= 2 && ai.stuckN % 2 === 0 && !W_.solid(fx0, fy + 2, fz0)) startPillar(ai, b, 3, teamWool(b.team), 'unstuck');
    } else if (moved >= 0.8) ai.stuckN = 0;
    ai.stuckT = 0; ai.lastX = b.pos.x; ai.lastZ = b.pos.z;
  }
  if (ai.stuckN >= 3 && ml > 0.1 && !c.aim) {
    const px = Math.floor(b.pos.x + mx * 0.75), pz = Math.floor(b.pos.z + mz * 0.75);
    const opts = [[px, fy + 1, pz], [px, fy + 2, pz], [fx0, fy + 2, fz0], [px, fy, pz], [px, fy + 1, fz0], [fx0, fy + 1, pz]];
    for (const [x, y, z] of opts) {
      const id = W_.get(x, y, z);
      if (id && BLOCKS[id].hp !== Infinity && W_.inside(x, y, z)) { c.aim = { x: x + 0.5, y: y + 0.5, z: z + 0.5 }; c.shoot = true; ai.digging = true; break; }
    }
  }
  if (!b.onGround && b.vel.y < -3 && !ai.pillar) jump = true; // планирует
  if (b.inWater) jump = true;                                   // в воде — всплываем и плывём

  const speed = SPEED * (w.speedMul || 1) * (c.shoot && w.key === 'hmg' ? 0.7 : 1);
  g.stepBody(b, dt, mx, mz, speed, jump);
  b.speed = Math.hypot(b.vel.x, b.vel.z);

  // --- прицеливание ---
  let tyaw, tpitch = 0;
  const look = c.aim || (ai.lookT > 0 ? ai.lookAt : null) || c.look;
  if (look) {
    const dx = look.x - b.pos.x, dy = look.y - (b.pos.y + EYE), dz = look.z - b.pos.z;
    tyaw = Math.atan2(-dx, -dz);
    tpitch = Math.atan2(dy, Math.hypot(dx, dz));
  } else if (ml > 0.1) tyaw = Math.atan2(-mx, -mz);
  else tyaw = b.yaw;
  let dyaw = tyaw - b.yaw;
  while (dyaw > Math.PI) dyaw -= Math.PI * 2;
  while (dyaw < -Math.PI) dyaw += Math.PI * 2;
  const turn = sk.turn * dt;
  b.yaw += Math.max(-turn, Math.min(turn, dyaw));
  b.pitch += Math.max(-turn, Math.min(turn, tpitch - b.pitch));
  const aligned = Math.abs(dyaw) < 0.12 && Math.abs(tpitch - b.pitch) < 0.12;
  if (aligned) ai.aimT += dt; else ai.aimT = 0;

  // --- стрельба ---
  const shoot = c.shoot && !!c.aim;
  const precise = c.precise || (ai.digging && !t);
  b.cool -= dt;
  b.firing = false;
  if (b.reloadT >= 0) { b.reloadT -= dt; if (b.reloadT < 0) b.ammo[b.weapon] = w.mag; }
  if (b.spin !== undefined && w.spinup) b.spin = shoot && aligned ? Math.min(w.spinup, b.spin + dt) : Math.max(0, b.spin - dt);
  ai.pauseT -= dt;
  if (shoot && aligned && b.reloadT < 0 && b.cool <= 0 && ai.pauseT <= 0) {
    const needAim = w.key === 'sniper' ? sk.snipe : w.key === 'rpg' ? 0.4 : 0;
    if ((ai.aimT >= needAim || precise) && (!w.spinup || b.spin >= w.spinup)) {
      if (b.ammo[b.weapon] <= 0) b.reloadT = w.reload * 1.2;
      else {
        const dist = Math.hypot(c.aim.x - b.pos.x, c.aim.z - b.pos.z);
        // снайпер прицелился — стреляет как в прицел (без разброса от бедра)
        const scoped = w.scope && ai.aimT >= needAim && b.speed < 1;
        const err = precise ? 0.004 : scoped ? (0.006 + dist * 0.0003) * sk.err : (0.025 + dist * 0.0009 + (b.speed > 1 ? 0.01 : 0)) * sk.err;
        const extra = scoped ? err - w.spread + (w.adsSpread || 0) : err;
        g.botFire(b, precise && w.key === 'rpg' ? W.AK : b.weapon, extra);
        b.ammo[b.weapon]--;
        b.cool = 1 / (w.rate * 0.8);
        b.firing = true;
        ai.burstT += 1 / w.rate;
        if (w.auto && ai.burstT > 0.6 + Math.random() * 0.8) { ai.burstT = 0; ai.pauseT = 0.25 + Math.random() * 0.5; }
      }
    }
  }
  // --- граната: в группу, за укрытие (по последнему месту) или в яйцо ---
  ai.nadeT -= dt;
  if (ai.nadeT <= 0 && b.nades > 0) {
    ai.nadeT = 2;
    let tgt = null, score = 0;
    const cand = [];
    if (t) cand.push(t.pos);
    if (!t && ai.lastSeen && now - ai.lastSeen.t < 3) cand.push(ai.lastSeen);
    if (ai.eggVis && g.eggs[1 - b.team]) cand.push(g.eggs[1 - b.team].pos);
    for (const p of cand) {
      const d = Math.hypot(p.x - b.pos.x, p.z - b.pos.z);
      if (d < 7 || d > 24) continue;
      let s = 1;
      for (const q of g.players.values()) if (q.alive && q.team !== b.team && Math.hypot(q.pos.x - p.x, q.pos.z - p.z) < 4) s++;
      if (p === ai.lastSeen) s += 0.5;
      if (s > score) { score = s; tgt = p; }
    }
    if (tgt && (score >= 2 || Math.random() < 0.5)) {
      g.botThrow(b, tgt); b.nades--;
      ai.nadeT = sk.nade * rnd(0.8, 1.4);
    }
  }
}

// для отладки и тестов: состояние команд
export function botDebug(g) {
  const s = TS.get(g);
  if (!s) return null;
  return s.t.map(t => ({ strat: t.strat, squad: t.squad, built: t.built, towers: t.towers, walls: t.walls, fort: t.fort.length, stat: { ...t.stat }, alarm: t.alarm, path: t.path ? t.path.length : 0 }));
}
