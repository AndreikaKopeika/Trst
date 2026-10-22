// Боты-курицы (считаются на телефоне хоста): ищут врагов, идут на вражескую базу, пробивают стены, бьют яйцо.
import { WEAPONS, W } from './weapons.js';
import { teamWool, BLOCKS } from './blocks.js';

const EYE = 1.32, SPEED = 5.4;

export const BOT_NAMES = ['Ряба', 'Наггетс', 'Бройлер', 'Цыпа', 'Кудахтер', 'Окорочок', 'Крылышко', 'Петя Гриль',
  'Табака', 'Пернатый', 'Яйцелоб', 'Клювокрут', 'Несушка', 'Гребешок', 'Пух', 'Шаурма'];
export const BOT_WEAPONS = [W.AK, W.AK, W.LMG, W.SHOTGUN, W.SNIPER, W.HMG, W.RPG, W.LMG];

function visible(g, b, x, y, z) {
  const ox = b.pos.x, oy = b.pos.y + EYE, oz = b.pos.z;
  const dx = x - ox, dy = y - oy, dz = z - oz;
  const d = Math.hypot(dx, dy, dz);
  if (d < 0.01) return true;
  return !g.world.raycast(ox, oy, oz, dx / d, dy / d, dz / d, d - 0.3, true);
}

function inBase(g, team, x, z, pad = 0) {
  const b = g.world.info.bases[team];
  return x >= b.x0 - pad && x <= b.x1 + pad && z >= b.z0 - pad && z <= b.z1 + pad;
}

function route(g, b) {
  const R = g.world.info.routes;
  if (R) { const lanes = R[b.team]; return lanes[Math.floor(Math.random() * lanes.length)].map(p => p.slice()); }
  const own = g.world.info.bases[b.team], en = g.world.info.bases[1 - b.team];
  const dir = b.team === 0 ? 1 : -1;
  const ownFront = b.team === 0 ? own.x1 : own.x0;
  const enFront = b.team === 0 ? en.x0 : en.x1;
  const cz = Math.floor((own.z0 + own.z1) / 2) + 0.5;
  const lane = (Math.random() - 0.5) * 30;
  const egg = g.eggs[1 - b.team];
  return [
    [ownFront - dir * 2 + 0.5, cz],
    [ownFront + dir * 4 + 0.5, cz],
    [(ownFront + enFront) / 2, cz + lane],
    [enFront - dir * 4 + 0.5, cz + lane * 0.2],
    [enFront + dir * 2 + 0.5, cz],
    egg ? [egg.pos.x, egg.pos.z] : [enFront + dir * 6, cz],
  ];
}

export function updateBot(g, b, dt) {
  const ai = b.ai;
  if (!b.alive) { b.firing = false; ai.route = null; return; }
  if (!ai.route) {
    ai.route = route(g, b); ai.wp = 0; ai.think = 0; ai.target = null; ai.strafe = 1; ai.strafeT = 0;
    ai.blockedT = 0; ai.stuckT = 0; ai.lastX = b.pos.x; ai.lastZ = b.pos.z; ai.sideT = 0; ai.side = 1;
    ai.aimT = 0; ai.nadeT = 5 + Math.random() * 8; ai.burstT = 0; ai.pauseT = 0; ai.wander = null; ai.wanderT = 0;
    ai.err = { x: 0, y: 0 }; ai.pillar = false; ai.pillarN = 0; ai.stuckN = 0;
    if (ai.climber === undefined) ai.climber = Math.random() < 0.5;
  }
  const w = WEAPONS[b.weapon];
  const now = g.now;

  // --- поиск цели ---
  ai.think -= dt;
  if (ai.think <= 0) {
    ai.think = 0.25 + Math.random() * 0.2;
    let best = null, bd = 1e9;
    for (const p of g.players.values()) {
      if (!p.alive || p.team === b.team) continue;
      const d = p.pos.distanceTo(b.pos);
      const range = w.key === 'sniper' ? 95 : 65;
      if (d > range || d >= bd) continue;
      if (visible(g, b, p.pos.x, p.pos.y + 0.9, p.pos.z)) { best = p; bd = d; }
    }
    if (best !== ai.target) { ai.target = best; ai.react = 0.35 + Math.random() * 0.4; ai.aimT = 0; }
    ai.tdist = bd;
    const egg = g.eggs[1 - b.team];
    ai.eggVis = egg && egg.hp > 0 && egg.pos.distanceTo(b.pos) < 45 && visible(g, b, egg.pos.x, egg.pos.y + 0.6, egg.pos.z);
  }
  ai.react -= dt;

  // --- куда идти ---
  let gx = null, gz = null, aim = null, shoot = false, strafe = 0;
  const t = ai.target && ai.target.alive ? ai.target : null;
  if (t) {
    const d = b.pos.distanceTo(t.pos);
    // упреждение
    aim = { x: t.pos.x + (t.vel ? t.vel.x * 0.08 : 0), y: t.pos.y + 0.85, z: t.pos.z + (t.vel ? t.vel.z * 0.08 : 0) };
    const want = w.key === 'shotgun' ? 5 : w.key === 'sniper' ? 32 : w.key === 'rpg' ? 18 : 13;
    if (d > want + 4) { gx = t.pos.x; gz = t.pos.z; }
    else if (d < want - 4) { gx = b.pos.x * 2 - t.pos.x; gz = b.pos.z * 2 - t.pos.z; }
    strafe = ai.strafe;
    shoot = ai.react <= 0 && !(w.key === 'rpg' && d < 5);
  } else if (ai.role === 'defend' && g.eggs[b.team] && b.pos.distanceTo(g.eggs[b.team].pos) > 14 && g.nav) {
    // защитник далеко от своего яйца — возвращается по карте путей
    const nx = g.nav.next(b.team, b.pos);
    if (nx) { gx = nx.x; gz = nx.z; ai.navDig = nx.dig; ai.navUp = nx.up; }
  } else if (ai.role === 'defend') {
    const egg = g.eggs[b.team];
    if (egg) {
      ai.wanderT -= dt;
      if (!ai.wander || ai.wanderT <= 0) {
        ai.wanderT = 3 + Math.random() * 4;
        ai.wander = { x: egg.pos.x + (Math.random() - 0.5) * 14 + (b.team === 0 ? 4 : -4), z: egg.pos.z + (Math.random() - 0.5) * 14 };
      }
      gx = ai.wander.x; gz = ai.wander.z;
      if (Math.hypot(gx - b.pos.x, gz - b.pos.z) < 1.5) { gx = null; }
    }
  } else {
    // атака: идём к вражескому яйцу по карте путей (обходы, лестницы, пробивание стен)
    const nx = g.nav ? g.nav.next(1 - b.team, b.pos) : null;
    if (nx) { gx = nx.x; gz = nx.z; ai.navDig = nx.dig; ai.navUp = nx.up; ai.navOk = true; }
    else {
      ai.navOk = false;
      const wp = ai.route[Math.min(ai.wp, ai.route.length - 1)];
      gx = wp[0]; gz = wp[1];
      if (ai.wp < ai.route.length - 1 && Math.hypot(gx - b.pos.x, gz - b.pos.z) < 3) ai.wp++;
      if (!g.world.info.routes && ai.wp === 0 && !inBase(g, b.team, b.pos.x, b.pos.z)) ai.wp = 2;
    }
    if (ai.eggVis) {
      const egg = g.eggs[1 - b.team];
      aim = { x: egg.pos.x, y: egg.pos.y + 0.6, z: egg.pos.z };
      shoot = true;
      if (Math.hypot(egg.pos.x - b.pos.x, egg.pos.z - b.pos.z) < (w.key === 'shotgun' ? 4 : 10)) { gx = null; strafe = ai.strafe * 0.5; }
    }
  }

  // --- вектор движения ---
  let mx = 0, mz = 0;
  if (gx !== null) {
    const dx = gx - b.pos.x, dz = gz - b.pos.z, l = Math.hypot(dx, dz);
    if (l > 0.3) { mx = dx / l; mz = dz / l; }
  }
  ai.strafeT -= dt;
  if (ai.strafeT <= 0) { ai.strafeT = 0.6 + Math.random() * 1.6; ai.strafe = Math.random() < 0.5 ? -1 : 1; }
  if (strafe) {
    const fx = aim ? aim.x - b.pos.x : mx, fz = aim ? aim.z - b.pos.z : mz;
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
  let jump = false;
  if (ai.navDig && !aim && !t) {
    const [dx_, dy_, dz_] = ai.navDig;
    if (Math.hypot(dx_ + 0.5 - b.pos.x, dz_ + 0.5 - b.pos.z) < 2.2) { aim = { x: dx_ + 0.5, y: dy_ + 0.5, z: dz_ + 0.5 }; shoot = true; ai.digging = true; }
  }
  if (ai.navUp && b.onGround) jump = true;
  ai.navDig = null; ai.navUp = false;
  const W_ = g.world;
  const fx0 = Math.floor(b.pos.x), fz0 = Math.floor(b.pos.z), fy = Math.floor(b.pos.y + 0.1);
  if (ml > 0.1) {
    // клетки, в которые упираемся: по диагонали и по каждой оси
    const px = Math.floor(b.pos.x + mx * 0.75), pz = Math.floor(b.pos.z + mz * 0.75);
    const cand = [[px, pz]];
    if (px !== fx0) cand.push([px, fz0]);
    if (pz !== fz0) cand.push([fx0, pz]);
    let feet = false, head = false, cell = null;
    for (const [cx, cz] of cand) {
      const f = W_.solid(cx, fy, cz), h = W_.solid(cx, fy + 1, cz);
      if (f) feet = true;
      // стена, либо ступенька с навесом сверху — просто так не пройти
      if (h || (f && W_.solid(cx, fy + 2, cz))) { head = true; if (!cell) cell = [cx, cz]; }
    }
    if (feet && !head) jump = true;
    if (head && b.speed < 1.5) {
      ai.blockedT += dt;
      const [cx, cz] = cell;
      const ownBase = inBase(g, b.team, cx, cz, 1);
      const low = !W_.solid(cx, fy + 3, cz) || !W_.solid(cx, fy + 4, cz) && ai.climber;
      const roof = W_.solid(fx0, fy + 2, fz0);
      if (ai.blockedT > 0.4 && ai.role === 'defend') { ai.wanderT = 0; ai.blockedT = 0; }
      else if (ai.blockedT > 0.4 && !aim && !ai.pillar) {
        if ((ownBase || ai.climber) && low && !roof) {
          ai.pillar = true; ai.pillarN = 0; ai.pX = b.pos.x; ai.pZ = b.pos.z;
        } else if (!ownBase && ai.role !== 'defend') {
          // пробиваем стену
          const ty = W_.solid(cx, fy + 1, cz) ? fy + 1 : W_.solid(cx, fy + 2, cz) ? fy + 2 : fy;
          aim = { x: cx + 0.5, y: ty + 0.5, z: cz + 0.5 };
          shoot = true;
          ai.digging = true;
        }
      }
      if (ai.blockedT > 6) { ai.sideT = 1.2; ai.side = Math.random() < 0.5 ? -1 : 1; ai.blockedT = 0; ai.pillar = false; }
    } else { ai.blockedT = Math.max(0, ai.blockedT - dt); if (!head) ai.digging = false; }
  }
  // строим столб под собой, чтобы выбраться из ямы или перелезть стену
  if (ai.pillar) {
    if (Math.hypot(b.pos.x - ai.pX, b.pos.z - ai.pZ) > 1.3 || W_.solid(fx0, fy + 2, fz0)) ai.pillar = false;
    else if (b.onGround) { ai.py = Math.floor(b.pos.y + 0.01); jump = true; }
    else if (ai.py !== undefined && b.pos.y >= ai.py + 1.02 && !W_.solid(fx0, ai.py, fz0) && g.canPlace(fx0, ai.py, fz0)) {
      g.hostSetBlock(fx0, ai.py, fz0, teamWool(b.team), 0);
      ai.py = undefined;
      if (++ai.pillarN > 5) ai.pillar = false;
    }
  }
  // застряли? 1 — шаг в сторону и прыжок, 2 — столб, 3+ — прокапываем путь
  ai.stuckT += dt;
  if (ai.stuckT > 2) {
    const moved = Math.hypot(b.pos.x - ai.lastX, b.pos.z - ai.lastZ);
    if (moved < 0.8 && ml > 0.2) {
      ai.stuckN++;
      if (!ai.digging) { ai.sideT = 1.0; ai.side = Math.random() < 0.5 ? -1 : 1; jump = true; }
      if (ai.stuckN === 2 && !W_.solid(fx0, fy + 2, fz0)) { ai.pillar = true; ai.pillarN = 0; ai.pX = b.pos.x; ai.pZ = b.pos.z; }
    } else ai.stuckN = 0;
    ai.stuckT = 0; ai.lastX = b.pos.x; ai.lastZ = b.pos.z;
  }
  if (ai.stuckN >= 3 && ml > 0.1 && !aim) {
    const px = Math.floor(b.pos.x + mx * 0.75), pz = Math.floor(b.pos.z + mz * 0.75);
    const opts = [[px, fy + 1, pz], [px, fy + 2, pz], [fx0, fy + 2, fz0], [px, fy, pz], [px, fy + 1, fz0], [fx0, fy + 1, pz]];
    for (const [x, y, z] of opts) {
      const id = W_.get(x, y, z);
      if (id && BLOCKS[id].hp !== Infinity && W_.inside(x, y, z)) { aim = { x: x + 0.5, y: y + 0.5, z: z + 0.5 }; shoot = true; ai.digging = true; break; }
    }
  }
  if (!b.onGround && b.vel.y < -3) jump = true; // планирует
  if (b.inWater) jump = true;                     // в воде — всплываем и плывём

  const speed = SPEED * (w.speedMul || 1) * (shoot && w.key === 'hmg' ? 0.7 : 1);
  g.stepBody(b, dt, mx, mz, speed, jump);
  b.speed = Math.hypot(b.vel.x, b.vel.z);

  // --- прицеливание ---
  let tyaw, tpitch = 0;
  if (aim) {
    const dx = aim.x - b.pos.x, dy = aim.y - (b.pos.y + EYE), dz = aim.z - b.pos.z;
    tyaw = Math.atan2(-dx, -dz);
    tpitch = Math.atan2(dy, Math.hypot(dx, dz));
  } else if (ml > 0.1) tyaw = Math.atan2(-mx, -mz);
  else tyaw = b.yaw;
  let dyaw = tyaw - b.yaw;
  while (dyaw > Math.PI) dyaw -= Math.PI * 2;
  while (dyaw < -Math.PI) dyaw += Math.PI * 2;
  const turn = 7 * dt;
  b.yaw += Math.max(-turn, Math.min(turn, dyaw));
  b.pitch += Math.max(-turn, Math.min(turn, tpitch - b.pitch));
  const aligned = Math.abs(dyaw) < 0.12 && Math.abs(tpitch - b.pitch) < 0.12;
  if (aligned) ai.aimT += dt; else ai.aimT = 0;

  // --- стрельба ---
  b.cool -= dt;
  b.firing = false;
  if (b.reloadT >= 0) { b.reloadT -= dt; if (b.reloadT < 0) b.ammo[b.weapon] = w.mag; }
  if (b.spin !== undefined && w.spinup) b.spin = shoot && aligned ? Math.min(w.spinup, b.spin + dt) : Math.max(0, b.spin - dt);
  ai.pauseT -= dt;
  if (shoot && aligned && b.reloadT < 0 && b.cool <= 0 && ai.pauseT <= 0) {
    const needAim = w.key === 'sniper' ? 0.7 : w.key === 'rpg' ? 0.4 : 0;
    if (ai.aimT >= needAim && (!w.spinup || b.spin >= w.spinup)) {
      if (b.ammo[b.weapon] <= 0) b.reloadT = w.reload * 1.2;
      else {
        const dist = aim ? Math.hypot(aim.x - b.pos.x, aim.z - b.pos.z) : 10;
        const err = ai.digging ? 0.005 : 0.025 + dist * 0.0009 + (b.speed > 1 ? 0.01 : 0);
        g.botFire(b, ai.digging && w.key === 'rpg' ? W.AK : b.weapon, err);
        b.ammo[b.weapon]--;
        b.cool = 1 / (w.rate * 0.8);
        b.firing = true;
        ai.burstT += 1 / w.rate;
        if (w.auto && ai.burstT > 0.6 + Math.random() * 0.8) { ai.burstT = 0; ai.pauseT = 0.25 + Math.random() * 0.5; }
      }
    }
  }
  // --- граната ---
  ai.nadeT -= dt;
  if (ai.nadeT <= 0 && b.nades > 0) {
    ai.nadeT = 10 + Math.random() * 10;
    const tgt = t || (ai.eggVis ? g.eggs[1 - b.team] : null);
    if (tgt) {
      const d = Math.hypot(tgt.pos.x - b.pos.x, tgt.pos.z - b.pos.z);
      if (d > 6 && d < 24) { g.botThrow(b, tgt.pos); b.nades--; }
    }
  }
  void now;
}
