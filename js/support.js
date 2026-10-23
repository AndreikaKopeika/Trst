// Обрушение: блоки, которые после разрушений повисли в воздухе ни к чему не прикреплёнными,
// ломаются сами, чтобы небо не засоряли летающие острова. Считает только хост.
// Связь — по граням. Опора — земля (дно карты), бедрок, края карты или просто большая масса блоков.
import { BLOCKS, LIQUID } from './blocks.js';
import { SX, SY, SZ } from './world.js';

const LIMIT = 700;        // компонент больше этого считаем опирающимся (это уже часть ландшафта)
const STEP_BUDGET = 24000; // шагов обхода за кадр
const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

export class Support {
  constructor(game) {
    this.g = game;
    this.seeds = [];
    this.due = 0;
    this.mark = null; this.pass = 0;
    this.stack = new Int32Array(LIMIT + 8);
    this.comp = new Int32Array(LIMIT + 8);
  }
  clear() { this.seeds.length = 0; }
  // блок сломан: соседей надо проверить
  removed(x, y, z) {
    for (const d of DIRS) {
      const nx = x + d[0], ny = y + d[1], nz = z + d[2];
      if (nx < 0 || ny < 1 || nz < 0 || nx >= SX || ny >= SY || nz >= SZ) continue;
      this.seeds.push(nx + SX * (nz + SZ * ny));
    }
    if (this.seeds.length <= 6) this.due = this.g.now + 0.35; // небольшая пауза — успевает доломаться весь взрыв
  }
  // структурный блок: не воздух, не жидкость
  struct(id) { return id && !LIQUID[id]; }

  hostTick() {
    if (!this.seeds.length || this.g.now < this.due) return;
    const w = this.g.world, N = SX * SY * SZ;
    if (!this.mark || this.mark.length !== N) { this.mark = new Uint32Array(N); this.pass = 0; }
    // новый проход: отметки прошлых проходов не действуют (блоки могли поменяться)
    if (!this.inPass) { this.pass += 2; this.inPass = true; if (this.pass > 4e9) { this.mark.fill(0); this.pass = 2; } }
    const P = this.pass, mark = this.mark, data = w.data, stack = this.stack, comp = this.comp;
    const SXZ = SX * SZ;
    let steps = 0;
    while (this.seeds.length && steps < STEP_BUDGET) {
      const s = this.seeds.pop();
      if (mark[s] >= P) continue;
      if (!this.struct(data[s])) continue;
      // обход в глубину до LIMIT блоков
      let sp = 0, cn = 0, grounded = false;
      stack[sp++] = s; mark[s] = P;
      while (sp) {
        const k = stack[--sp];
        comp[cn++] = k;
        const x = k % SX, z = Math.floor(k / SX) % SZ, y = Math.floor(k / SXZ);
        const id = data[k];
        if (y <= 1 || BLOCKS[id].hp === Infinity) { grounded = true; break; }
        if (cn >= LIMIT) { grounded = true; break; }
        for (let d = 0; d < 6; d++) {
          const D = DIRS[d], nx = x + D[0], ny = y + D[1], nz = z + D[2];
          steps++;
          if (nx < 0 || nz < 0 || nx >= SX || nz >= SZ) { grounded = true; break; } // край карты держит
          if (ny < 0 || ny >= SY) continue;
          const nk = nx + SX * (nz + SZ * ny);
          const m = mark[nk];
          if (m === P + 1) { grounded = true; break; }   // уже знаем: держится
          if (m === P) continue;
          if (!this.struct(data[nk])) continue;
          mark[nk] = P; stack[sp++] = nk;
          if (sp >= stack.length) { grounded = true; break; }
        }
        if (grounded) break;
      }
      if (grounded) {
        // всё, что успели обойти, тоже держится
        for (let i = 0; i < cn; i++) mark[comp[i]] = P + 1;
        for (let i = 0; i < sp; i++) mark[stack[i]] = P + 1;
      } else {
        // висит в воздухе — рушим
        for (let i = 0; i < cn; i++) {
          const k = comp[i];
          const x = k % SX, z = Math.floor(k / SX) % SZ, y = Math.floor(k / SXZ);
          mark[k] = P + 1;
          this.g.hostCollapse(x, y, z);
        }
      }
    }
    if (!this.seeds.length) this.inPass = false;
  }
}
