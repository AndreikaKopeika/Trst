// Игровой интерфейс (DOM). Обновляем только изменившиеся значения.
import { WEAPONS, EGG_HP, MAX_HP } from './weapons.js';
import { BLOCKS, BUILDABLE, blockIconStyle, teamWool } from './blocks.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.el = $('hud');
    this.cache = {};
    this.bannerT = 0; this.subT = 0;
    this.feedEl = $('feed');
    this.cross = $('crosshair');
    this.crossParts = [...this.cross.querySelectorAll('.ch')];
    this.hm = $('hitmarker');
    this.dmgFlash = $('dmgFlash');
    this.flashV = 0;
    this.dmgNums = $('dmgNums');
    // слоты оружия
    const wc = $('weapons'); wc.innerHTML = '';
    this.wslots = WEAPONS.map((w, i) => {
      const d = document.createElement('div');
      d.className = 'wslot'; d.dataset.btn = 'w' + i; d.dataset.key = String(i + 1); d.textContent = w.short;
      wc.appendChild(d); return d;
    });
  }
  show(on) { this.el.classList.toggle('hidden', !on); }
  set(key, val, fn) { if (this.cache[key] !== val) { this.cache[key] = val; fn(val); } }

  buildHotbar(atlasURL, team, onPick) {
    const hb = $('hotbar'); hb.innerHTML = '';
    this.bslots = BUILDABLE.map((id, i) => {
      const real = id === -1 ? teamWool(team) : id;
      const d = document.createElement('div');
      d.className = 'bslot'; d.dataset.btn = 'b' + i;
      d.style.cssText = blockIconStyle(real, atlasURL);
      const c = BLOCKS[real].cost || 1;
      d.innerHTML = `<small>${c}</small>`;
      d.title = BLOCKS[real].name;
      hb.appendChild(d); return d;
    });
    void onPick;
  }

  score(k0, k1, e0, e1) {
    this.set('k0', k0, v => $('kills0').textContent = v);
    this.set('k1', k1, v => $('kills1').textContent = v);
    this.set('e0', Math.ceil(e0), v => { $('egg0').style.width = Math.max(0, v / EGG_HP * 100) + '%'; });
    this.set('e1', Math.ceil(e1), v => { $('egg1').style.width = Math.max(0, v / EGG_HP * 100) + '%'; });
  }
  eggHit(team) {
    const el = document.querySelector('#score .team.' + (team === 0 ? 'red' : 'blue'));
    el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit');
  }
  hp(v) {
    v = Math.max(0, Math.ceil(v));
    this.set('hp', v, x => {
      $('hpFill').style.width = (x / MAX_HP * 100) + '%';
      $('hpFill').classList.toggle('low', x < 35);
      $('hpText').textContent = x;
    });
  }
  weapon(i, build) {
    this.set('w', i, x => this.wslots.forEach((s, k) => s.classList.toggle('sel', k === x)));
    this.set('build', build, b => {
      $('hotbar').classList.toggle('hidden', !b);
      $('resCount').classList.toggle('hidden', !b);
      $('btnFire').classList.toggle('hidden', b);
      $('btnAim').classList.toggle('hidden', b);
      $('btnPlace').classList.toggle('hidden', !b);
      $('btnMine').classList.toggle('hidden', !b);
      $('btnBuild').classList.toggle('on', b);
      this.cross.classList.toggle('build', b);
    });
  }
  block(sel) { this.set('bsel', sel, x => this.bslots && this.bslots.forEach((s, k) => s.classList.toggle('sel', k === x))); }
  res(n) { this.set('res', n, v => $('resCount').textContent = '🧱 ' + v); }
  ammo(text, name) {
    this.set('ammo', text, v => $('ammoMag').textContent = v);
    this.set('aname', name, v => $('ammoName').textContent = v);
  }
  reload(p) {
    const on = p >= 0;
    this.set('rl', on, v => $('reloadBar').classList.toggle('on', v));
    if (on) $('reloadFill').style.width = (p * 100).toFixed(0) + '%';
  }
  nades(n) { this.set('nades', n, v => $('nadeCount').textContent = '×' + v); }
  aim(on) { this.set('aimOn', on, v => $('btnAim').classList.toggle('on', v)); }
  scope(on, kind) {
    this.set('scope', on ? kind : '', v => {
      const el = $('scope');
      el.classList.toggle('show', !!v);
      el.classList.toggle('pgo', v === 'pgo');
      el.classList.toggle('pso', v === 'pso');
      this.scopeOn = !!v; this.crossVis();
    });
  }
  // прицеливание через открытый прицел оружия — перекрестие не нужно
  iron(on) { this.set('iron', on, v => { this.ironOn = v; this.crossVis(); }); }
  crossVis() { this.cross.style.display = this.scopeOn || this.ironOn ? 'none' : ''; }
  crosshair(px, enemy) {
    px = Math.round(Math.min(80, Math.max(4, px)));
    this.set('cpx', px, v => {
      const [t, b, l, r] = this.crossParts;
      t.style.top = (-v - 9) + 'px'; b.style.top = v + 'px';
      l.style.left = (-v - 9) + 'px'; r.style.left = v + 'px';
    });
    this.set('cen', enemy, v => this.cross.classList.toggle('enemy', v));
  }
  hit(kill, head) {
    const h = this.hm;
    h.classList.remove('show', 'kill', 'head'); void h.offsetWidth;
    h.classList.add('show'); if (kill) h.classList.add('kill'); else if (head) h.classList.add('head');
  }
  dmgNumber(x, y, val, head, egg) {
    if (this.dmgNums.childElementCount > 12) this.dmgNums.firstChild.remove();
    const d = document.createElement('div');
    d.className = 'dmgNum' + (head ? ' head' : '') + (egg ? ' egg' : '');
    d.textContent = Math.round(val);
    d.style.left = (x + (Math.random() - 0.5) * 30) + 'px'; d.style.top = (y - 20 - Math.random() * 20) + 'px';
    this.dmgNums.appendChild(d);
    setTimeout(() => d.remove(), 700);
  }
  hurt(amount, angle) {
    this.flashV = Math.min(1, this.flashV + amount / 40);
    if (angle !== null && angle !== undefined) {
      const a = document.createElement('div');
      a.className = 'dirArc';
      a.style.transform = `rotate(${angle}rad) translateY(-110px)`;
      $('dirInd').appendChild(a);
      setTimeout(() => a.remove(), 1200);
    }
  }
  banner(text, cls = '', dur = 2.5, sub = '') {
    const b = $('banner');
    b.className = 'show ' + cls; b.textContent = text; this.bannerT = dur;
    const s = $('subBanner');
    if (sub) { s.textContent = sub; s.className = 'show'; this.subT = dur; }
  }
  feed(html, mine) {
    const d = document.createElement('div');
    d.innerHTML = html;
    if (mine) d.classList.add('me');
    this.feedEl.appendChild(d);
    while (this.feedEl.childElementCount > 5) this.feedEl.firstChild.remove();
    setTimeout(() => d.remove(), 6000);
  }
  death(show, by, t) {
    this.set('dead', show, v => $('death').classList.toggle('hidden', !v));
    if (show) {
      this.set('deathBy', by, v => $('deathBy').textContent = v);
      this.set('deathT', t, v => $('deathT').textContent = v > 0 ? v : '');
    }
  }
  room(text) { this.set('room', text, v => $('roomInfo').textContent = v); }
  scoreboard(players, myId) {
    for (const team of [0, 1]) {
      const col = $('sb' + team);
      const list = players.filter(p => p.team === team).sort((a, b) => b.kills - a.kills);
      col.innerHTML = `<h3 style="color:${team ? '#7aa6ff' : '#ff7a70'}">${team ? 'Синие' : 'Красные'}</h3>` +
        list.map(p => `<div class="sb-row ${p.id === myId ? 'me' : ''}"><span>${p.isBot ? '🤖 ' : '🐔 '}${esc(p.name)}</span><span>${p.kills} / ${p.deaths}</span></div>`).join('');
    }
  }
  update(dt) {
    if (this.bannerT > 0) { this.bannerT -= dt; if (this.bannerT <= 0) $('banner').classList.remove('show'); }
    if (this.subT > 0) { this.subT -= dt; if (this.subT <= 0) $('subBanner').classList.remove('show'); }
    this.flashV = Math.max(0, this.flashV - dt * 1.5);
    this.set('flash', Math.round(this.flashV * 20), v => this.dmgFlash.style.opacity = v / 20);
  }
}

export function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
