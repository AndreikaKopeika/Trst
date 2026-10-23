// Огонь и дым. От взрывов загорается земля и всё горючее рядом; огонь перекидывается
// по дереву, листве, шерсти и ящикам, горящий ТНТ взрывается.
// Что горит, решает хост и рассылает клиентам; пламя и дым рисует каждый у себя.
import { BLOCKS, LIQUID } from './blocks.js';
import { SX, SY, SZ } from './world.js';

const MAX_FIRES = 260;
const rnd = (a, b) => a + Math.random() * (b - a);
// сколько секунд горит блок, пока не сгорит совсем
const BURN_TIME = { 5: [12, 16], 6: [2.5, 4], 7: [7, 10], 12: [4, 6], 13: [4, 6], 16: [0.6, 0.9], 19: [5, 7], 26: [6, 8], 27: [7, 10] };
// шанс перекинуться на соседний блок этого типа
const CATCH = { 5: 0.2, 6: 0.45, 7: 0.45, 12: 0.5, 13: 0.5, 16: 0.8, 19: 0.5, 26: 0.4, 27: 0.4 };
const NB = [];
for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (dx || dy || dz) NB.push([dx, dy, dz]);
NB.push([0, 2, 0]); // пламя тянется вверх

export class Fire {
  constructor(game) {
    this.g = game;
    this.cells = new Map(); // idx -> { x, y, z, blk, end, owner, next, hit, acc }
    this.ops = []; // [idx, 0 — земля / 1 — блок / 2 — потух] по порядку
    this.hurt = new Map(); // игрок -> накопленный урон
    this.smog = new Map(); // игрок -> урон от дыма
    this.hurtT = 0;
  }
  clear() { this.cells.clear(); this.ops.length = 0; this.hurt.clear(); }
  key(x, y, z) { return x + SX * (z + SZ * y); }
  burning(x, y, z) { return this.cells.has(this.key(x, y, z)); }

  // ---------- хост ----------
  ignite(x, y, z, owner, groundDur) {
    const w = this.g.world;
    if (x < 0 || y < 1 || z < 0 || x >= SX || y >= SY || z >= SZ) return false;
    const k = this.key(x, y, z);
    if (this.cells.has(k) || this.cells.size >= MAX_FIRES) return false;
    const id = w.get(x, y, z), now = this.g.now;
    let c;
    if (id) {
      const def = BLOCKS[id];
      if (!def || !def.burn) return false;
      const bt = BURN_TIME[id] || [5, 8];
      const dur = rnd(bt[0], bt[1]);
      c = { x, y, z, blk: id, end: now + dur, dps: def.hp / dur, owner, next: now + rnd(0.4, 1.0), hit: now + 0.5 };
    } else {
      // огонь на земле — только в пустоте над твёрдым блоком и не в воде
      const below = w.get(x, y - 1, z);
      if (!below || LIQUID[below] || !w.solid(x, y - 1, z)) return false;
      c = { x, y, z, blk: 0, end: now + (groundDur || rnd(3, 7)), owner, next: now + rnd(0.5, 1.2) };
    }
    this.cells.set(k, c);
    this.ops.push(k, c.blk ? 1 : 0);
    return true;
  }
  extinguish(k) { if (this.cells.delete(k)) this.ops.push(k, 2); }

  // взрыв: горит земля вокруг и горючие блоки, которые уцелели
  fromExplosion(x, y, z, R, frac, owner) {
    if (!frac) return;
    const w = this.g.world;
    const n = Math.min(36, Math.round(R * R * frac * 0.9));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * R * 0.85;
      const fx = Math.floor(x + Math.cos(a) * r), fz = Math.floor(z + Math.sin(a) * r);
      // ищем поверхность рядом с высотой взрыва
      for (let fy = Math.min(SY - 1, Math.floor(y + R * 0.5)); fy >= Math.max(1, Math.floor(y - R)); fy--) {
        if (!w.get(fx, fy, fz) && w.solid(fx, fy - 1, fz)) { this.ignite(fx, fy, fz, owner); break; }
      }
    }
    // горючее в радиусе взрыва (то, что не разнесло)
    const R2 = Math.ceil(R * 1.1), ch = Math.min(0.9, frac * 1.6);
    let tries = 0;
    for (let dy = -R2; dy <= R2; dy++) for (let dz = -R2; dz <= R2; dz++) for (let dx = -R2; dx <= R2; dx++) {
      const bx = Math.floor(x) + dx, by = Math.floor(y) + dy, bz = Math.floor(z) + dz;
      const id = w.get(bx, by, bz);
      if (!id || !BLOCKS[id] || !BLOCKS[id].burn) continue;
      if (dx * dx + dy * dy + dz * dz > R2 * R2 || Math.random() > ch) continue;
      if (this.ignite(bx, by, bz, owner) && ++tries > 120) return;
    }
  }

  hostTick(dt) {
    const g = this.g, w = g.world, now = g.now;
    for (const [k, c] of this.cells) {
      if (c.blk) {
        if (w.get(c.x, c.y, c.z) !== c.blk) {
          // сгорел — на его месте ещё немного тлеют угли
          this.extinguish(k);
          if (!w.get(c.x, c.y, c.z) && Math.random() < 0.5) this.ignite(c.x, c.y, c.z, c.owner, rnd(1.5, 3));
          continue;
        }
        if (now >= c.hit) { c.hit = now + 0.5; g.hostBlockDamage(k, c.dps * 0.55, c.owner); }
        if (now > c.end + 2) { this.extinguish(k); continue; }
      } else {
        if (now >= c.end || w.get(c.x, c.y, c.z) || !w.solid(c.x, c.y - 1, c.z)) { this.extinguish(k); continue; }
      }
      // перекидывается на соседей
      if (now >= c.next) {
        c.next = now + rnd(0.5, 1.1);
        for (let t = 0; t < 3; t++) {
          const o = NB[Math.floor(Math.random() * NB.length)];
          const nx = c.x + o[0], ny = c.y + o[1], nz = c.z + o[2];
          const id = w.get(nx, ny, nz);
          if (id && BLOCKS[id] && BLOCKS[id].burn && Math.random() < (CATCH[id] || 0.3) * (c.blk ? 1 : 0.6)) this.ignite(nx, ny, nz, c.owner);
        }
      }
    }
    // урон: огонь жжёт, густой горячий дым душит
    this.hurtT -= dt;
    const tick = this.hurtT <= 0;
    if (tick) this.hurtT = 0.3;
    const F = g.vfx && g.vfx.field;
    for (const p of g.players.values()) {
      if (!p.alive || !F) continue;
      const hx = p.pos.x, hy = p.pos.y + 1.35, hz = p.pos.z;
      const d = F.sample(hx, hy, hz);
      if (d > 0.9) {
        const heat = F.heatAt(hx, hy, hz);
        const dps = Math.min(12, (d - 0.9) * 4.5) + heat * Math.min(1, d) * 22;
        const i = F.ci(hx, hy, hz), own = F.own.get(i);
        const s = this.smog.get(p) || { v: 0, o: own };
        s.v += dps * dt; if (own !== undefined) s.o = own;
        this.smog.set(p, s);
      }
    }
    if (tick) {
      for (const [p, s] of this.smog) if (s.v > 0.4) g.hostDamage(p, s.v, s.o !== undefined ? s.o : p.id, 'smoke', false, p.pos);
      this.smog.clear();
    }
    if (!this.cells.size) return;
    for (const p of g.players.values()) {
      if (!p.alive) continue;
      const x = Math.floor(p.pos.x), y = Math.floor(p.pos.y + 0.05), z = Math.floor(p.pos.z);
      const c = this.cells.get(this.key(x, y, z)) || this.cells.get(this.key(x, y + 1, z)) || (y > 0 && this.cells.get(this.key(x, y - 1, z)));
      if (!c) continue;
      const d = (this.hurt.get(p) || { v: 0, c });
      d.v += 16 * dt; d.c = c;
      this.hurt.set(p, d);
    }
    if (tick) {
      for (const [p, d] of this.hurt) if (d.v > 0.5) g.hostDamage(p, d.v, d.c.owner, 'fire', false, { x: d.c.x + 0.5, y: d.c.y + 0.5, z: d.c.z + 0.5 });
      this.hurt.clear();
    }
  }
  // изменения для клиентов
  pack() {
    if (!this.ops.length) return null;
    const m = { t: 'fire', o: this.ops };
    this.ops = [];
    return m;
  }
  // клиент
  apply(m) {
    const o = m.o, now = this.g.now;
    for (let i = 0; i < o.length; i += 2) {
      const k = o[i];
      if (o[i + 1] === 2) { this.cells.delete(k); continue; }
      const x = k % SX, z = Math.floor(k / SX) % SZ, y = Math.floor(k / (SX * SZ));
      this.cells.set(k, { x, y, z, blk: o[i + 1], end: now + (o[i + 1] ? 25 : 12) });
    }
  }
  // клиент: страховка, если сообщение о том, что огонь потух, потерялось
  clientTick() {
    const now = this.g.now, w = this.g.world;
    for (const [k, c] of this.cells) if (now > c.end || (c.blk && !w.get(c.x, c.y, c.z))) this.cells.delete(k);
  }

  // ---------- картинка (у всех) ----------
  fx(dt, cam) {
    if (!this.cells.size) return;
    const vfx = this.g.vfx, fx = this.g.fx, q = fx.q;
    const cx = cam.x, cy = cam.y, cz = cam.z;
    for (const c of this.cells.values()) {
      const dx = c.x - cx, dy = c.y - cy, dz = c.z - cz;
      const vis = dx * dx + dy * dy + dz * dz < 4900;
      vfx.fire(c, dt, vis);
      if (!vis) continue;
      // искры и угольки улетают вверх
      c.ea = (c.ea || Math.random()) + dt * (c.blk ? 3 : 1.5) * q;
      while (c.ea >= 1) {
        c.ea -= 1;
        fx.glow.spawn(c.x + rnd(0.1, 0.9), c.y + rnd(0.3, 1.2), c.z + rnd(0.1, 0.9), rnd(-0.6, 0.6), rnd(1.5, 3.5), rnd(-0.6, 0.6), rnd(0.8, 1.8), rnd(0.05, 0.09), 0.02,
          1, rnd(0.5, 0.75), 0.15, { grav: -0.6, drag: 0.8, end: [0.9, 0.15, 0.02] });
      }
    }
  }
}
