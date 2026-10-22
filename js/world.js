// Воксельный мир: данные, генерация карты, рейкаст, коллизии.
import { BLOCKS, B, SOLID, LIQUID } from './blocks.js';
import { gen2Fort, genDust2 } from './maps.js';

export const SX = 112, SY = 40, SZ = 60;
export const CHUNK = 16;
export const CX = Math.ceil(SX / CHUNK), CY = Math.ceil(SY / CHUNK), CZ = Math.ceil(SZ / CHUNK);

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(seed) {
  const r = mulberry(seed);
  const perm = new Float32Array(256 * 256);
  for (let i = 0; i < perm.length; i++) perm[i] = r();
  const at = (x, y) => perm[((x & 255) << 8) | (y & 255)];
  const smooth = (t) => t * t * (3 - 2 * t);
  const n2 = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = smooth(x - xi), yf = smooth(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
  return (x, y, oct = 4) => {
    let s = 0, amp = 1, f = 1, tot = 0;
    for (let i = 0; i < oct; i++) { s += n2(x * f, y * f) * amp; tot += amp; amp *= 0.5; f *= 2; }
    return s / tot;
  };
}

export class World {
  constructor() {
    this.data = new Uint8Array(SX * SY * SZ);
    this.dmg = new Uint8Array(SX * SY * SZ); // 0..255 повреждение
    this.onChange = null; // (x,y,z) => void
    this.base = null;     // сгенерированные данные для diff
    this.info = null;
  }
  idx(x, y, z) { return (y * SZ + z) * SX + x; }
  inside(x, y, z) { return x >= 0 && y >= 0 && z >= 0 && x < SX && y < SY && z < SZ; }
  get(x, y, z) {
    if (x < 0 || z < 0 || x >= SX || z >= SZ) return B.BEDROCK; // невидимые стены по краям
    if (y < 0) return B.BEDROCK;
    if (y >= SY) return 0;
    return this.data[(y * SZ + z) * SX + x];
  }
  // для рендера: за пределами карты — воздух, чтобы были видны грани
  getR(x, y, z) {
    if (x < 0 || z < 0 || x >= SX || z >= SZ || y < 0 || y >= SY) return 0;
    return this.data[(y * SZ + z) * SX + x];
  }
  solid(x, y, z) { return SOLID[this.get(x, y, z)] === 1; }
  liquid(x, y, z) { return LIQUID[this.get(x, y, z)] === 1; }
  set(x, y, z, id, dmg = 0) {
    if (!this.inside(x, y, z)) return;
    const i = this.idx(x, y, z);
    if (this.data[i] === id && this.dmg[i] === dmg) return;
    this.data[i] = id; this.dmg[i] = id ? dmg : 0;
    if (this.onChange) this.onChange(x, y, z);
  }
  heightAt(x, z) {
    for (let y = SY - 1; y >= 0; y--) if (this.data[this.idx(x, y, z)]) return y;
    return -1;
  }

  // ---------- генерация ----------
  generate(seed, map = 'classic') {
    this.mapId = map;
    if (map === '2fort' || map === 'dust2') {
      this.data.fill(0); this.dmg.fill(0);
      const info = map === '2fort' ? gen2Fort(this, seed) : genDust2(this, seed);
      this.base = new Uint8Array(this.data);
      this.info = info;
      return info;
    }
    return this.genClassic(seed);
  }
  genClassic(seed) {
    const noise = makeNoise(seed);
    const noise2 = makeNoise(seed * 7 + 3);
    const r = mulberry(seed * 13 + 5);
    const d = this.data; d.fill(0); this.dmg.fill(0);
    const set = (x, y, z, id) => { if (this.inside(x, y, z)) d[this.idx(x, y, z)] = id; };
    const get = (x, y, z) => this.inside(x, y, z) ? d[this.idx(x, y, z)] : 0;

    const midZ = Math.floor(SZ / 2);
    const baseH = 12;
    const bases = [
      { team: 0, x0: 4, x1: 23, z0: midZ - 10, z1: midZ + 9 },
      { team: 1, x0: SX - 24, x1: SX - 5, z0: midZ - 10, z1: midZ + 9 },
    ];
    const midX = SX / 2;
    const heights = new Int16Array(SX * SZ);

    for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) {
      let h = 11 + noise(x * 0.035, z * 0.035, 4) * 12 - 4;
      // хребты и холмы
      h += Math.pow(noise2(x * 0.06, z * 0.06, 2), 3) * 10;
      // долина по центру
      const dv = (x - midX) / 7;
      h -= 5 * Math.exp(-dv * dv);
      // выравнивание баз
      for (const b of bases) {
        const dx = Math.max(b.x0 - 3 - x, 0, x - b.x1 - 3);
        const dz = Math.max(b.z0 - 3 - z, 0, z - b.z1 - 3);
        const dist = Math.hypot(dx, dz);
        const k = Math.min(1, dist / 10);
        const s = k * k * (3 - 2 * k);
        h = baseH * (1 - s) + h * s;
      }
      h = Math.max(3, Math.min(SY - 12, Math.round(h)));
      heights[z * SX + x] = h;
      const valley = Math.abs(x - midX) < 5 && h < 9;
      for (let y = 0; y <= h; y++) {
        let id;
        if (y === 0) id = B.BEDROCK;
        else if (y < h - 4) id = (noise2(x * 0.2 + y * 0.3, z * 0.2) > 0.72) ? B.DARKSTONE : B.STONE;
        else if (y < h) id = valley ? B.SAND : B.DIRT;
        else id = valley ? (r() < 0.3 ? B.GRAVEL : B.SAND) : (h > 22 ? B.SNOW : B.GRASS);
        set(x, y, z, id);
      }
    }

    const inBase = (x, z, pad = 4) => bases.some(b => x >= b.x0 - pad && x <= b.x1 + pad && z >= b.z0 - pad && z <= b.z1 + pad);

    // деревья
    for (let i = 0; i < 70; i++) {
      const x = 2 + Math.floor(r() * (SX - 4)), z = 2 + Math.floor(r() * (SZ - 4));
      if (inBase(x, z, 6)) continue;
      const h = heights[z * SX + x];
      if (get(x, h, z) !== B.GRASS) continue;
      const th = 4 + Math.floor(r() * 3);
      for (let y = 1; y <= th; y++) set(x, h + y, z, B.LOG);
      const top = h + th;
      for (let dy = -2; dy <= 1; dy++) {
        const rad = dy >= 0 ? 1 : 2;
        for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
          if (Math.abs(dx) === rad && Math.abs(dz) === rad && r() < 0.6) continue;
          if (!get(x + dx, top + dy, z + dz)) set(x + dx, top + dy, z + dz, B.LEAVES);
        }
      }
      set(x, top + 1, z, B.LEAVES);
    }

    // камни
    for (let i = 0; i < 18; i++) {
      const x = Math.floor(r() * SX), z = Math.floor(r() * SZ);
      if (inBase(x, z, 5)) continue;
      const h = heights[z * SX + x];
      const rad = 1 + r() * 1.8;
      for (let dx = -2; dx <= 2; dx++) for (let dy = -1; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) {
        if (dx * dx + dy * dy * 1.6 + dz * dz <= rad * rad) set(x + dx, h + dy, z + dz, r() < 0.2 ? B.GRAVEL : B.STONE);
      }
    }

    // руины в центре
    for (let i = 0; i < 7; i++) {
      const x = Math.floor(midX - 22 + r() * 44), z = 4 + Math.floor(r() * (SZ - 8));
      const h = heights[z * SX + x];
      const len = 3 + Math.floor(r() * 5), hh = 2 + Math.floor(r() * 3);
      const alongX = r() < 0.5;
      const mat = r() < 0.5 ? B.BRICK : (r() < 0.5 ? B.CONCRETE : B.STONE);
      for (let k = 0; k < len; k++) {
        const wx = alongX ? x + k : x, wz = alongX ? z : z + k;
        const gh = heights[Math.min(SZ - 1, wz) * SX + Math.min(SX - 1, wx)];
        const colH = hh - (r() < 0.3 ? 1 : 0);
        for (let y = 1; y <= colH; y++) set(wx, gh + y, wz, mat);
      }
    }

    // мост и укрытия у долины
    const bz = midZ;
    for (let x = Math.floor(midX - 7); x <= Math.ceil(midX + 7); x++) {
      for (let z = bz - 1; z <= bz + 1; z++) set(x, 10, z, B.PLANKS);
      if (x % 3 === 0) { set(x, 11, bz - 2, B.PLANKS); set(x, 11, bz + 2, B.PLANKS); }
      for (let y = 4; y < 10; y++) if (x % 5 === 0) { set(x, y, bz - 1, B.LOG); set(x, y, bz + 1, B.LOG); }
    }
    // ящики с ТНТ — весело
    for (let i = 0; i < 8; i++) {
      const x = Math.floor(midX - 25 + r() * 50), z = 3 + Math.floor(r() * (SZ - 6));
      const h = heights[z * SX + x];
      if (get(x, h + 1, z)) continue;
      set(x, h + 1, z, r() < 0.5 ? B.TNT : B.CRATE);
      if (r() < 0.5) set(x + 1, h + 1, z, B.CRATE);
      if (r() < 0.4) set(x, h + 2, z, B.CRATE);
    }
    for (let i = 0; i < 10; i++) {
      const x = Math.floor(midX - 30 + r() * 60), z = 3 + Math.floor(r() * (SZ - 6));
      const h = heights[z * SX + x];
      for (let k = 0; k < 3; k++) if (!get(x + k, h + 1, z)) set(x + k, h + 1, z, B.SANDBAG);
    }

    // ---------- базы ----------
    const info = { spawns: [[], []], eggs: [], bases };
    for (const b of bases) {
      const wool = b.team === 0 ? B.WOOL_RED : B.WOOL_BLUE;
      // фундамент
      for (let x = b.x0; x <= b.x1; x++) for (let z = b.z0; z <= b.z1; z++) {
        for (let y = 1; y < baseH; y++) if (!get(x, y, z)) set(x, y, z, B.DIRT);
        set(x, baseH, z, ((x + z) % 7 === 0) ? wool : B.CONCRETE);
        for (let y = baseH + 1; y < SY; y++) set(x, y, z, 0);
      }
      // стены по периметру с проходами
      const cx = Math.floor((b.x0 + b.x1) / 2), cz = Math.floor((b.z0 + b.z1) / 2);
      const front = b.team === 0 ? b.x1 : b.x0;
      const back = b.team === 0 ? b.x0 : b.x1;
      for (let x = b.x0; x <= b.x1; x++) for (let z = b.z0; z <= b.z1; z++) {
        const edge = x === b.x0 || x === b.x1 || z === b.z0 || z === b.z1;
        if (!edge) continue;
        const gateF = x === front && Math.abs(z - cz) <= 1;
        const gateS = (z === b.z0 || z === b.z1) && Math.abs(x - cx) <= 1;
        if (gateF || gateS) continue;
        const hh = (x === front) ? 3 : 2;
        for (let y = 1; y <= hh; y++) set(x, baseH + y, z, y === hh && (x + z) % 2 ? wool : B.BRICK);
      }
      // угловые башни
      const corners = [[b.x0, b.z0], [b.x0, b.z1], [b.x1, b.z0], [b.x1, b.z1]];
      for (const [tx, tz] of corners) {
        const sx = tx === b.x0 ? 1 : -1, sz = tz === b.z0 ? 1 : -1;
        for (let y = 1; y <= 6; y++) {
          set(tx, baseH + y, tz, B.LOG);
          set(tx + sx * 2, baseH + y, tz, y < 6 ? (y % 2 ? B.PLANKS : 0) : B.LOG);
          set(tx, baseH + y, tz + sz * 2, y < 6 ? (y % 2 ? B.PLANKS : 0) : B.LOG);
          set(tx + sx * 2, baseH + y, tz + sz * 2, B.LOG);
        }
        for (let dx = 0; dx <= 2; dx++) for (let dz = 0; dz <= 2; dz++) {
          set(tx + sx * dx, baseH + 6, tz + sz * dz, B.PLANKS);
          if (dx === 0 || dz === 0 || dx === 2 || dz === 2) set(tx + sx * dx, baseH + 7, tz + sz * dz, (dx + dz) % 2 ? wool : B.PLANKS);
        }
        // лестница к башне
        for (let k = 1; k <= 6; k++) {
          const lx = tx + sx * (3 + 6 - k), lz = tz + sz;
          for (let y = 1; y <= k; y++) set(lx, baseH + y, lz, y === k ? B.PLANKS : B.LOG);
        }
        set(tx + sx * 2, baseH + 7, tz + sz, 0);
      }
      // постамент с яйцом и защита
      const ex = b.team === 0 ? b.x0 + 5 : b.x1 - 5;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) set(ex + dx, baseH + 1, cz + dz, B.STEEL);
      for (let dz = -2; dz <= 2; dz++) {
        set(ex + (b.team === 0 ? 3 : -3), baseH + 1, cz + dz, B.SANDBAG);
        set(ex + (b.team === 0 ? 3 : -3), baseH + 2, cz + dz, dz % 2 ? B.SANDBAG : B.GLASS);
      }
      info.eggs.push({ team: b.team, x: ex + 0.5, y: baseH + 2, z: cz + 0.5 });
      // фонари
      set(cx, baseH + 1, b.z0 + 2, B.LAMP); set(cx, baseH + 1, b.z1 - 2, B.LAMP);
      // укрытия у ворот
      const fx = front + (b.team === 0 ? 4 : -4);
      for (let dz = -3; dz <= 3; dz++) if (Math.abs(dz) > 1) {
        const gh = heights[(cz + dz) * SX + fx];
        set(fx, Math.max(gh, baseH - 1) + 1, cz + dz, B.SANDBAG);
      }
      // точки возрождения
      const sx0 = b.team === 0 ? b.x0 + 2 : b.x1 - 2;
      for (let k = 0; k < 6; k++) {
        const sz = b.z0 + 3 + Math.floor(k * (b.z1 - b.z0 - 6) / 5);
        const sx = sx0 + (k % 2 ? (b.team === 0 ? 2 : -2) : 0);
        info.spawns[b.team].push([sx + 0.5, baseH + 1, sz + 0.5]);
      }
      void back;
    }

    info.sky = 0x9fd0ff; info.space = 'open'; info.name = 'Курятник';
    this.base = new Uint8Array(d);
    this.info = info;
    return info;
  }

  // diff относительно сгенерированной карты (для подключения в середине боя)
  diff() {
    const out = [];
    const d = this.data, b = this.base, dm = this.dmg;
    for (let i = 0; i < d.length; i++) {
      if (d[i] !== b[i] || dm[i]) out.push(i, d[i], dm[i]);
    }
    return out;
  }
  applyDiff(list) {
    for (let k = 0; k < list.length; k += 3) {
      this.data[list[k]] = list[k + 1];
      this.dmg[list[k]] = list[k + 2];
    }
  }

  // ---------- рейкаст (DDA) ----------
  raycast(ox, oy, oz, dx, dy, dz, maxDist, skipGlass = false) {
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tDX = Math.abs(1 / dx), tDY = Math.abs(1 / dy), tDZ = Math.abs(1 / dz);
    let tMX = dx !== 0 ? (dx > 0 ? (x + 1 - ox) : (ox - x)) * tDX : Infinity;
    let tMY = dy !== 0 ? (dy > 0 ? (y + 1 - oy) : (oy - y)) * tDY : Infinity;
    let tMZ = dz !== 0 ? (dz > 0 ? (z + 1 - oz) : (oz - z)) * tDZ : Infinity;
    let nx = 0, ny = 0, nz = 0, t = 0;
    for (let i = 0; i < 400; i++) {
      if (y >= SY && dy >= 0) return null;
      const id = (x < 0 || z < 0 || x >= SX || z >= SZ || y < 0) ? (y < 0 ? B.BEDROCK : 0) : (y >= SY ? 0 : this.data[(y * SZ + z) * SX + x]);
      if (id && SOLID[id] && !(skipGlass && BLOCKS[id].glass)) return { x, y, z, id, nx, ny, nz, dist: t };
      if (x < -1 || z < -1 || x > SX || z > SZ) return null;
      if (tMX < tMY && tMX < tMZ) { t = tMX; if (t > maxDist) return null; x += stepX; tMX += tDX; nx = -stepX; ny = 0; nz = 0; }
      else if (tMY < tMZ) { t = tMY; if (t > maxDist) return null; y += stepY; tMY += tDY; nx = 0; ny = -stepY; nz = 0; }
      else { t = tMZ; if (t > maxDist) return null; z += stepZ; tMZ += tDZ; nx = 0; ny = 0; nz = -stepZ; }
    }
    return null;
  }

  // Пересекает ли AABB какой-нибудь твёрдый блок
  boxHits(minX, minY, minZ, maxX, maxY, maxZ) {
    const x0 = Math.floor(minX), x1 = Math.floor(maxX - 1e-6);
    const y0 = Math.floor(minY), y1 = Math.floor(maxY - 1e-6);
    const z0 = Math.floor(minZ), z1 = Math.floor(maxZ - 1e-6);
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      if (y >= SY) continue;
      if (SOLID[this.get(x, y, z)]) return true;
    }
    return false;
  }

  // Движение тела с коллизиями по осям. body: {pos:{x,y,z}, vel:{x,y,z}, onGround}
  // поднимаемся на уступ, если над ним и над головой есть место
  tryStep(body, nx, nz, hw, h, step) {
    if (!step) return false;
    const p = body.pos;
    const sy = Math.floor(p.y + 0.02) + 1;
    if (sy - p.y > step || sy - p.y <= 0.02) return false;
    if (this.boxHits(nx - hw, sy, nz - hw, nx + hw, sy + h, nz + hw)) return false;
    if (this.boxHits(p.x - hw, p.y, p.z - hw, p.x + hw, sy + h, p.z + hw)) return false;
    body.stepped += sy - p.y;
    p.y = sy;
    return true;
  }

  // step — на какую высоту тело само «шагает» на уступ (как в Source/Roblox: без прыжка, без застреваний)
  moveBody(body, dt, hw, h, step = 0) {
    const p = body.pos, v = body.vel;
    const canStep = step > 0 && body.onGround && v.y <= 0.5;
    body.stepped = 0;
    body.onGround = false;
    body.hitWall = false;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)) * dt / 0.3));
    const sdt = dt / steps;
    for (let s = 0; s < steps; s++) {
      // Y
      let ny = p.y + v.y * sdt;
      if (this.boxHits(p.x - hw, ny, p.z - hw, p.x + hw, ny + h, p.z + hw)) {
        if (v.y < 0) { ny = Math.floor(ny) + 1; body.onGround = true; if (this.boxHits(p.x - hw, ny, p.z - hw, p.x + hw, ny + h, p.z + hw)) ny = p.y; }
        else { ny = Math.ceil(ny + h) - 1 - h - 0.001; if (ny < p.y - 0.5) ny = p.y; }
        v.y = 0;
      }
      p.y = ny;
      // X
      let nx = p.x + v.x * sdt;
      if (this.boxHits(nx - hw, p.y, p.z - hw, nx + hw, p.y + h, p.z + hw) && !this.tryStep(body, nx, p.z, hw, h, canStep ? step : 0)) {
        nx = v.x > 0 ? Math.floor(nx + hw) - hw - 0.001 : Math.floor(nx - hw) + 1 + hw + 0.001;
        if (this.boxHits(nx - hw, p.y, p.z - hw, nx + hw, p.y + h, p.z + hw)) nx = p.x;
        v.x = 0; body.hitWall = true;
      }
      p.x = nx;
      // Z
      let nz = p.z + v.z * sdt;
      if (this.boxHits(p.x - hw, p.y, nz - hw, p.x + hw, p.y + h, nz + hw) && !this.tryStep(body, p.x, nz, hw, h, canStep ? step : 0)) {
        nz = v.z > 0 ? Math.floor(nz + hw) - hw - 0.001 : Math.floor(nz - hw) + 1 + hw + 0.001;
        if (this.boxHits(p.x - hw, p.y, nz - hw, p.x + hw, p.y + h, nz + hw)) nz = p.z;
        v.z = 0; body.hitWall = true;
      }
      p.z = nz;
    }
    // проверка "стоим ли на земле"
    if (!body.onGround && v.y <= 0 && this.boxHits(p.x - hw, p.y - 0.05, p.z - hw, p.x + hw, p.y, p.z + hw)) body.onGround = true;
  }
}
