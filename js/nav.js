// Навигация ботов: для каждой клетки мира — сколько "шагов" до цели (яйца команды).
// Учитывает ступеньки (+1), спуски (до 5 блоков вниз), плавание и стены, которые можно пробить
// (стоят дороже, поэтому боты сначала ищут обход). Считается кусочками, чтобы не было рывков.
import { BLOCKS, SOLID, LIQUID } from './blocks.js';
import { SX, SY, SZ } from './world.js';

const N = SX * SY * SZ;
const INF = 65535;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIG = new Uint8Array(256);
for (let i = 1; i < 256; i++) { const d = BLOCKS[i]; DIG[i] = !d || d.hp === Infinity ? 255 : Math.min(10, 1 + Math.ceil(d.hp / 60)); }

export class Nav {
  constructor(world) {
    this.w = world;
    this.field = [new Uint16Array(N).fill(INF), new Uint16Array(N).fill(INF)]; // готовые поля (к яйцу 0 и 1)
    this.ready = [false, false];
    this.job = null; this.queue = [0, 1]; this.dirty = true; this.lastBuild = -99;
    this.goals = [null, null];
  }
  idx(x, y, z) { return (y * SZ + z) * SX + x; }
  sol(x, y, z) {
    if (x < 0 || z < 0 || x >= SX || z >= SZ || y < 0) return true;
    if (y >= SY) return false;
    return SOLID[this.w.data[(y * SZ + z) * SX + x]] === 1;
  }
  liq(x, y, z) { return y >= 0 && y < SY && x >= 0 && z >= 0 && x < SX && z < SZ && LIQUID[this.w.data[(y * SZ + z) * SX + x]] === 1; }
  standable(x, y, z) {
    if (x < 0 || z < 0 || x >= SX || z >= SZ || y < 1 || y >= SY - 2) return false;
    if (this.sol(x, y, z) || this.sol(x, y + 1, z)) return false;
    return this.sol(x, y - 1, z) || this.liq(x, y - 1, z) || this.liq(x, y, z);
  }
  // стоимость пробивания клетки (0 — свободна, 255 — нельзя)
  digCost(x, y, z) {
    if (x < 0 || z < 0 || x >= SX || z >= SZ || y < 1 || y >= SY - 3) return 255;
    if (!this.sol(x, y - 1, z)) return 255;
    if (this.sol(x, y + 2, z) && this.sol(x, y + 3, z)) return 255; // не роем туннели в горе
    const d = this.w.data;
    let c = 0;
    for (const yy of [y, y + 1]) {
      const id = d[(yy * SZ + z) * SX + x];
      if (SOLID[id]) { if (DIG[id] === 255) return 255; c += DIG[id]; }
    }
    return c;
  }

  setGoals(eggs) {
    for (const e of eggs) this.goals[e.team] = [Math.floor(e.pos.x), Math.round(e.pos.y), Math.floor(e.pos.z)];
    this.dirty = true;
  }
  markDirty() { this.dirty = true; }

  // вызывается каждый кадр на хосте
  update(now, budget = 2500) {
    if (!this.job) {
      if (!this.dirty && this.ready[0] && this.ready[1]) return;
      if (now - this.lastBuild < 3 && this.ready[0] && this.ready[1]) return;
      const team = this.queue.shift(); this.queue.push(team);
      const g = this.goals[team]; if (!g) return;
      this.job = { team, dist: new Uint16Array(N).fill(INF), buckets: Array.from({ length: 32 }, () => []), cur: 0, left: 0 };
      // старт: клетки вокруг яйца
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) {
        const x = g[0] + dx, y = g[1] + dy, z = g[2] + dz;
        if (this.standable(x, y, z)) this.push(this.job, this.idx(x, y, z), Math.abs(dx) + Math.abs(dz));
      }
      if (team === 1) this.dirty = false;
    }
    const J = this.job, D = J.dist;
    let n = 0;
    while (n < budget) {
      if (J.left === 0) { this.finish(now); return; }
      let b = J.buckets[J.cur & 31];
      while (!b.length) { J.cur++; b = J.buckets[J.cur & 31]; }
      const i = b.pop(); J.left--;
      const d = J.cur;
      n++;
      if (D[i] < d) continue;
      const x = i % SX, z = Math.floor(i / SX) % SZ, y = Math.floor(i / (SX * SZ));
      const enter = this.sol(x, y, z) || this.sol(x, y + 1, z) ? this.digCost(x, y, z) : 0; // эта клетка — пробиваемая?
      for (const [dx, dz] of DIRS) {
        const ux = x + dx, uz = z + dz;
        // 1) с той же высоты (в том числе из клетки, которую надо пробить)
        if (this.standable(ux, y, uz)) this.relax(J, ux, y, uz, d + 1 + enter);
        else if (!enter) { const c = this.digCost(ux, y, uz); if (c < 255 && (this.sol(ux, y, uz) || this.sol(ux, y + 1, uz))) this.relax(J, ux, y, uz, d + 1 + c); }
        if (enter) continue;
        // 2) спрыгнуть к нам сверху (до 5 блоков)
        for (let uy = y + 1; uy <= y + 5; uy++) {
          if (this.sol(x, uy, z) || this.sol(x, uy + 1, z)) break;
          if (this.standable(ux, uy, uz)) { this.relax(J, ux, uy, uz, d + 1); break; }
        }
        // 3) запрыгнуть к нам на ступеньку
        if (this.sol(x, y - 1, z) && this.standable(ux, y - 1, uz) && !this.sol(ux, y + 1, uz)) this.relax(J, ux, y - 1, uz, d + 2);
      }
      // 4) всплыть к нам снизу
      if (!enter && this.liq(x, y - 1, z) && this.standable(x, y - 1, z)) this.relax(J, x, y - 1, z, d + 1);
    }
  }
  push(J, i, d) { if (d < J.dist[i]) { J.dist[i] = d; J.buckets[d & 31].push(i); J.left++; } }
  relax(J, x, y, z, d) { if (d - J.cur < 31) this.push(J, this.idx(x, y, z), d); }
  finish(now) {
    const J = this.job;
    this.field[J.team] = J.dist; this.ready[J.team] = true;
    this.job = null; this.lastBuild = now;
  }

  // Куда идти из точки p к яйцу команды team. Возвращает {x, z, dig: [x,y,z] | null, up} или null
  next(team, p) {
    if (!this.ready[team]) return null;
    const F = this.field[team];
    let x = Math.floor(p.x), z = Math.floor(p.z), y = Math.floor(p.y + 0.1);
    // ищем ближайшую известную клетку рядом с ногами
    let cur = -1, cd = INF;
    for (const yy of [y, y - 1, y + 1, y - 2]) {
      if (yy < 0 || yy >= SY) continue;
      const v = F[this.idx(x, yy, z)];
      if (v < cd) { cd = v; cur = yy; }
    }
    if (cur < 0) return null;
    y = cur;
    if (cd === 0) return { x: x + 0.5, z: z + 0.5, done: true };
    // жадно спускаемся по полю до 3 шагов вперёд
    let tx = x, ty = y, tz = z, td = cd, dig = null, up = false;
    for (let step = 0; step < 3; step++) {
      let best = null, bd = td;
      for (const [dx, dz] of DIRS) {
        const nx = tx + dx, nz = tz + dz;
        for (let ny = ty + 1; ny >= ty - 5; ny--) {
          if (ny < 0 || ny >= SY) continue;
          const v = F[this.idx(nx, ny, nz)];
          if (v < bd) { bd = v; best = [nx, ny, nz]; }
        }
      }
      if (!best) break;
      const blocked = this.sol(best[0], best[1], best[2]) || this.sol(best[0], best[1] + 1, best[2]);
      if (step === 0) {
        if (blocked) dig = this.sol(best[0], best[1] + 1, best[2]) ? [best[0], best[1] + 1, best[2]] : best;
        up = best[1] > ty;
      }
      tx = best[0]; ty = best[1]; tz = best[2]; td = bd;
      if (blocked || ty !== y) break; // дальше смотреть не нужно: сначала пробить/подняться
    }
    return { x: tx + 0.5, z: tz + 0.5, dig, up, dist: cd };
  }
}
