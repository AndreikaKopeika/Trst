// Навигация ботов: для каждой клетки мира — "стоимость" пути до цели (яйца команды).
// Ходы: шаг, ступенька (+1), спуск (до 5 вниз), плавание, пробивание стен, а также стройка:
// мост (поставить блок под ногами над ямой/водой) и столб (подпрыгнуть и поставить блок под себя).
// Клетки без пола ("виртуальные") допускаются не выше H блоков над поверхностью.
// Считается кусочками (с ограничением по времени), чтобы не было рывков.
import { BLOCKS, SOLID, LIQUID } from './blocks.js';
import { SX, SY, SZ } from './world.js';

const N = SX * SY * SZ;
const L = SX * SZ;            // шаг по высоте в индексе
const INF = 65535;
const VIRT = 254, BAD = 255;  // коды клеток (0 — можно стоять, 1..40 — цена пробивания)
const H = 6;                  // макс. высота моста/столба над поверхностью
export const BRIDGE_COST = 2, PILLAR_COST = 6;
const RING = 64, RM = RING - 1;
const DX = [1, -1, 0, 0], DZ = [0, 0, 1, -1], DI = [1, -1, SX, -SX];
const DIG = new Uint8Array(256);
for (let i = 1; i < 256; i++) { const d = BLOCKS[i]; DIG[i] = !d || d.hp === Infinity ? 255 : Math.min(10, 1 + Math.ceil(d.hp / 60)); }

export class Nav {
  constructor(world) {
    this.w = world;
    this.field = [new Uint16Array(N).fill(INF), new Uint16Array(N).fill(INF)]; // готовые поля (к яйцу 0 и 1)
    this.spare = null;
    this.ready = [false, false];
    this.job = null; this.queue = [0, 1]; this.dirty = true; this.lastBuild = -99;
    this.goals = [null, null];
    this.stats = { builds: 0, lastMs: 0, maxSlice: 0, pops: 0 };
    this.near = new Int16Array(SX * SZ).fill(SY); // макс. высота рельефа в радиусе NR
    this.tmp = new Int16Array(SX * SZ);
    this.ver = 0; this.hver = -1;
  }
  // карта высот (без листвы и брёвен), расширенная на NR клеток
  heights() {
    const d = this.w.data, T = this.tmp, NR = 4;
    for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) {
      let y = SY - 1, i = (y * SZ + z) * SX + x;
      for (; y > 0; y--, i -= L) { const id = d[i]; if ((SOLID[id] || LIQUID[id]) && id !== 5 && id !== 6) break; }
      T[z * SX + x] = y;
    }
    const A = this.near;
    for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) {
      let m = 0;
      for (let k = Math.max(0, x - NR); k <= Math.min(SX - 1, x + NR); k++) if (T[z * SX + k] > m) m = T[z * SX + k];
      A[z * SX + x] = m;
    }
    for (let x = 0; x < SX; x++) for (let z = 0; z < SZ; z++) {
      let m = 0;
      for (let k = Math.max(0, z - NR); k <= Math.min(SZ - 1, z + NR); k++) if (A[k * SX + x] > m) m = A[k * SX + x];
      T[z * SX + x] = m;
    }
    const t = this.near; this.near = this.tmp; this.tmp = t;
  }
  idx(x, y, z) { return (y * SZ + z) * SX + x; }
  sol(x, y, z) {
    if (x < 0 || z < 0 || x >= SX || z >= SZ || y < 0) return true;
    if (y >= SY) return false;
    return SOLID[this.w.data[(y * SZ + z) * SX + x]] === 1;
  }
  liq(x, y, z) { return y >= 0 && y < SY && x >= 0 && z >= 0 && x < SX && z < SZ && LIQUID[this.w.data[(y * SZ + z) * SX + x]] === 1; }
  standable(x, y, z) { return this.kind(x, y, z) === 0; }
  // что за клетка (ноги в y): 0 — можно стоять, VIRT — нет пола (мост/столб), 1..40 — пробить, BAD — нельзя
  kind(x, y, z) {
    if (x < 0 || z < 0 || x >= SX || z >= SZ || y < 1 || y >= SY - 2) return BAD;
    const d = this.w.data, i = (y * SZ + z) * SX + x;
    const a = d[i], b = d[i + L];
    if (SOLID[a] || SOLID[b]) {
      if (y >= SY - 3) return BAD;
      const f = d[i - L];
      if (!SOLID[f]) return BAD;
      if (SOLID[d[i + 2 * L]] && SOLID[d[i + 3 * L]]) return BAD; // не роем туннели в горе
      let c = 0;
      if (SOLID[a]) { if (DIG[a] === 255) return BAD; c += DIG[a]; }
      if (SOLID[b]) { if (DIG[b] === 255) return BAD; c += DIG[b]; }
      return c;
    }
    if (LIQUID[a]) return 0;
    const f = d[i - L];
    if (SOLID[f] || LIQUID[f]) return 0;
    if (y < 2) return BAD;
    if (y - 1 > this.near[z * SX + x]) return BAD; // выше окрестного рельефа — бесполезно
    for (let k = 2, j = i - 2 * L; k <= H + 1 && j >= 0; k++, j -= L) if (SOLID[d[j]] || LIQUID[d[j]]) return VIRT;
    return BAD;
  }
  // свободна ли клетка для тела (ноги и голова)
  free2(x, y, z) { return !this.sol(x, y, z) && !this.sol(x, y + 1, z); }

  setGoals(eggs) {
    for (const e of eggs) this.goals[e.team] = [Math.floor(e.pos.x), Math.round(e.pos.y), Math.floor(e.pos.z)];
    this.dirty = true;
  }
  markDirty() { this.dirty = true; this.ver++; }

  // вызывается каждый кадр на хосте; budget — макс. число клеток за кадр, maxMs — по времени
  update(now, budget = 2500, maxMs = 3.5) {
    const t0 = performance.now();
    if (!this.job) {
      if (!this.dirty && this.ready[0] && this.ready[1]) return;
      if (now - this.lastBuild < 3 && this.ready[0] && this.ready[1]) return;
      // карта высот — отдельным кадром
      if (this.hver !== this.ver) { this.hver = this.ver; this.heights(); return; }
      const team = this.queue.shift(); this.queue.push(team);
      const g = this.goals[team]; if (!g) return;
      let dist = this.spare; this.spare = null;
      if (!dist) dist = new Uint16Array(N);
      dist.fill(INF);
      if (!this.buckets) this.buckets = Array.from({ length: RING }, () => []);
      for (const q of this.buckets) q.length = 0;
      this.job = { team, dist, buckets: this.buckets, cur: 0, left: 0, t0: now, ms: 0, pops: 0 };
      // старт: клетки вокруг яйца
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) {
        const x = g[0] + dx, y = g[1] + dy, z = g[2] + dz;
        if (this.kind(x, y, z) === 0) this.push(this.job, this.idx(x, y, z), Math.abs(dx) + Math.abs(dz));
      }
      if (team === 1) this.dirty = false;
      if (performance.now() - t0 > 1) return; // подготовка заняла время — считаем со следующего кадра
    }
    const J = this.job, D = J.dist, data = this.w.data;
    let n = 0;
    while (n < budget) {
      if (J.left === 0) { J.ms += performance.now() - t0; this.finish(now); return; }
      if ((n & 255) === 255 && performance.now() - t0 > maxMs) break;
      let b = J.buckets[J.cur & RM];
      while (!b.length) { J.cur++; b = J.buckets[J.cur & RM]; }
      const i = b.pop(); J.left--;
      const d = J.cur;
      n++;
      if (D[i] < d) continue;
      const x = i % SX, z = ((i / SX) | 0) % SZ, y = (i / L) | 0;
      const kv = this.kind(x, y, z);
      const enter = kv === 0 ? 0 : kv === VIRT ? BRIDGE_COST : kv; // цена входа в эту клетку
      for (let k = 0; k < 4; k++) {
        const ux = x + DX[k], uz = z + DZ[k];
        if (ux < 0 || uz < 0 || ux >= SX || uz >= SZ) continue;
        // 1) с той же высоты (с земли, с моста или из пробитой клетки)
        const ku = this.kind(ux, y, uz);
        if (ku !== BAD) this.relax(J, i + DI[k], d + 1 + enter);
        if (kv !== 0) continue;
        // 2) спрыгнуть к нам сверху (до 5 блоков)
        for (let uy = y + 1; uy <= y + 5 && uy < SY - 2; uy++) {
          const c = i + (uy - y) * L;
          if (SOLID[data[c]] || SOLID[data[c + L]]) break;
          const kk = this.kind(ux, uy, uz);
          if (kk === 0) { this.relax(J, c + DI[k], d + 1); break; }
          if (kk === VIRT) this.relax(J, c + DI[k], d + 1);
        }
        // 3) запрыгнуть к нам на ступеньку (с земли или с моста)
        if (y > 1 && SOLID[data[i - L]] && !SOLID[data[i + DI[k] + L]]) {
          const kk = this.kind(ux, y - 1, uz);
          if (kk === 0 || kk === VIRT) this.relax(J, i - L + DI[k], d + 2);
        }
      }
      if (kv === 0) {
        // 4) всплыть к нам снизу
        if (y > 1 && LIQUID[data[i - L]] && this.kind(x, y - 1, z) === 0) this.relax(J, i - L, d + 1);
      } else if (kv === VIRT) {
        // 5) столб: из клетки под нами подпрыгнуть и поставить блок
        const ku = this.kind(x, y - 1, z);
        if ((ku === 0 || ku === VIRT) && !LIQUID[data[i - L]] && !LIQUID[data[i - 2 * L]]) this.relax(J, i - L, d + PILLAR_COST);
      }
    }
    const ms = performance.now() - t0;
    J.ms += ms; J.pops += n; this.stats.maxSlice = Math.max(this.stats.maxSlice, ms);
  }
  push(J, i, d) { if (d < J.dist[i]) { J.dist[i] = d; J.buckets[d & RM].push(i); J.left++; } }
  relax(J, i, d) { if (d < J.dist[i] && d - J.cur < RM) { J.dist[i] = d; J.buckets[d & RM].push(i); J.left++; } }
  finish(now) {
    const J = this.job;
    this.spare = this.field[J.team];
    this.field[J.team] = J.dist; this.ready[J.team] = true;
    this.job = null; this.lastBuild = now;
    this.stats.builds++; this.stats.lastMs = J.ms;
  }

  // клетка, в которой стоит игрок (по полю team)
  cellOf(team, p, grounded = true) {
    const F = this.field[team];
    const x = Math.floor(p.x), z = Math.floor(p.z), y = Math.floor(p.y + 0.1);
    if (x < 0 || z < 0 || x >= SX || z >= SZ) return -1;
    if (grounded) {
      for (const yy of [y, y - 1, y + 1]) if (yy >= 1 && yy < SY - 1 && F[this.idx(x, yy, z)] < INF && this.free2(x, yy, z)) return yy;
      return -1;
    }
    // в воздухе: ищем клетку с полом под собой
    for (let yy = y; yy >= y - 3 && yy >= 1; yy--) if (this.kind(x, yy, z) === 0 && F[this.idx(x, yy, z)] < INF) return yy;
    for (const yy of [y, y - 1]) if (yy >= 1 && yy < SY - 1 && F[this.idx(x, yy, z)] < INF && this.free2(x, yy, z)) return yy;
    return -1;
  }

  // лучший следующий шаг из клетки (tx,ty,tz): [x,y,z,v,type]; type: 0 шаг, 1 вверх, 2 вниз, 3 мост, 4 столб, 5 пробить
  // (минимум цены хода + значения поля — как в самом поиске)
  step(F, tx, ty, tz, td) {
    let best = null, bc = INF;
    // столб
    if (ty + 1 < SY - 2) {
      const v = F[this.idx(tx, ty + 1, tz)];
      if (v < td && v + PILLAR_COST < bc && !this.sol(tx, ty + 2, tz) && !this.liq(tx, ty, tz) && !this.liq(tx, ty - 1, tz)) { bc = v + PILLAR_COST; best = [tx, ty + 1, tz, v, 4]; }
    }
    for (let k = 0; k < 4; k++) {
      const nx = tx + DX[k], nz = tz + DZ[k];
      if (nx < 0 || nz < 0 || nx >= SX || nz >= SZ) continue;
      // тот же уровень
      let v = F[this.idx(nx, ty, nz)];
      if (v < td) {
        const kn = this.kind(nx, ty, nz);
        if (kn !== BAD) {
          const c = v + 1 + (kn === 0 ? 0 : kn === VIRT ? BRIDGE_COST : kn);
          if (c < bc) { bc = c; best = [nx, ty, nz, v, kn === 0 ? 0 : kn === VIRT ? 3 : 5]; }
        }
      }
      // ступенька вверх
      if (ty + 1 < SY - 2) {
        v = F[this.idx(nx, ty + 1, nz)];
        if (v < td && v + 2 < bc && this.sol(nx, ty, nz) && this.free2(nx, ty + 1, nz) && !this.sol(tx, ty + 2, tz)) { bc = v + 2; best = [nx, ty + 1, nz, v, 1]; }
      }
      // спуск
      if (this.free2(nx, ty, nz)) {
        for (let ny = ty - 1; ny >= ty - 5 && ny >= 1; ny--) {
          if (this.sol(nx, ny, nz)) break;
          if (this.sol(nx, ny - 1, nz) || this.liq(nx, ny - 1, nz) || this.liq(nx, ny, nz)) {
            v = F[this.idx(nx, ny, nz)];
            if (v < td && v + 1 < bc) { bc = v + 1; best = [nx, ny, nz, v, 2]; }
            break;
          }
        }
      }
    }
    return best;
  }

  // Куда идти из точки p к яйцу команды team.
  // Возвращает {x, z, dig: [x,y,z] | null, bridge: [x,y,z] | null, pillar, up, dist, cy} или null
  next(team, p, grounded = true) {
    if (!this.ready[team]) return null;
    const F = this.field[team];
    const x = Math.floor(p.x), z = Math.floor(p.z);
    const y = this.cellOf(team, p, grounded);
    if (y < 0) return null;
    const cd = F[this.idx(x, y, z)];
    if (cd === 0) return { x: x + 0.5, z: z + 0.5, done: true, dist: 0, cy: y };
    let tx = x, ty = y, tz = z, td = cd;
    const r = { x: 0, z: 0, dig: null, bridge: null, pillar: false, up: false, dist: cd, cy: y };
    for (let s = 0; s < 3; s++) {
      const b = this.step(F, tx, ty, tz, td);
      if (!b) break;
      const type = b[4];
      if (s > 0 && type !== 0) break; // дальше смотрим только по ровному
      tx = b[0]; ty = b[1]; tz = b[2]; td = b[3];
      if (s === 0) {
        if (type === 5) r.dig = this.sol(tx, ty + 1, tz) ? [tx, ty + 1, tz] : [tx, ty, tz];
        else if (type === 3) r.bridge = [tx, ty - 1, tz];
        else if (type === 4) r.pillar = true;
        r.up = type === 1;
        if (type !== 0) break;
      }
    }
    r.x = tx + 0.5; r.z = tz + 0.5;
    return r;
  }

  // путь из точки p к яйцу team: массив клеток [x,y,z,dist] (для выбора позиций)
  trace(team, p, max = 400) {
    if (!this.ready[team]) return null;
    const F = this.field[team];
    let x = Math.floor(p.x), z = Math.floor(p.z), y = this.cellOf(team, p, true);
    if (y < 0) return null;
    let d = F[this.idx(x, y, z)];
    const out = [[x, y, z, d]];
    for (let s = 0; s < max && d > 0; s++) {
      const b = this.step(F, x, y, z, d);
      if (!b) break;
      x = b[0]; y = b[1]; z = b[2]; d = b[3];
      out.push([x, y, z, d]);
    }
    return out;
  }
  dist(team, x, y, z) {
    if (!this.ready[team] || x < 0 || z < 0 || y < 0 || x >= SX || z >= SZ || y >= SY) return INF;
    return this.field[team][this.idx(x, y, z)];
  }
}
