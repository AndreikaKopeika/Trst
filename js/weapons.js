// Характеристики оружия.
// dmg — урон по курицам, bdmg — урон по блокам, rate — выстрелов в секунду
export const WEAPONS = [
  {
    key: 'ak', name: 'Автомат', short: 'AK', dmg: 24, head: 2.0, bdmg: 14, rate: 10, mag: 30, reload: 2.3,
    spread: 0.018, adsSpread: 0.005, recoil: 0.014, kick: 0.25, range: 140, pellets: 1, speedMul: 1.0,
    zoom: 1.35, tracer: 0xffd27a, sound: 'ak', auto: true,
  },
  {
    key: 'lmg', name: 'Пулемёт', short: 'ПКМ', dmg: 21, head: 1.8, bdmg: 12, rate: 12.5, mag: 80, reload: 3.6,
    spread: 0.03, adsSpread: 0.012, recoil: 0.012, kick: 0.3, range: 140, pellets: 1, speedMul: 0.88,
    zoom: 1.3, tracer: 0xffb04a, sound: 'lmg', auto: true,
  },
  {
    key: 'sniper', name: 'Снайперка', short: 'СВД', dmg: 95, head: 2.5, bdmg: 70, rate: 0.9, mag: 5, reload: 2.8,
    spread: 0.07, adsSpread: 0.0, recoil: 0.07, kick: 1.2, range: 300, pellets: 1, speedMul: 0.95,
    zoom: 4.5, scope: 'pso', tracer: 0xbff6ff, sound: 'sniper', auto: false, pierceSoft: true,
  },
  {
    key: 'hmg', name: 'Тяжёлый пулемёт', short: 'КОРД', dmg: 30, head: 1.6, bdmg: 26, rate: 16, mag: 150, reload: 4.2,
    spread: 0.035, adsSpread: 0.018, recoil: 0.01, kick: 0.55, range: 160, pellets: 1, speedMul: 0.68,
    zoom: 1.25, tracer: 0xff8a3a, sound: 'hmg', auto: true, spinup: 0.45,
  },
  {
    key: 'shotgun', name: 'Дробовик', short: 'ДРОБ', dmg: 19, head: 1.5, bdmg: 12, rate: 1.6, mag: 7, reload: 2.6,
    spread: 0.062, adsSpread: 0.042, recoil: 0.06, kick: 0.9, range: 48, pellets: 10, speedMul: 1.02,
    zoom: 1.15, tracer: 0xffe0a0, sound: 'shotgun', auto: false,
  },
  {
    key: 'rpg', name: 'Базука', short: 'РПГ', dmg: 0, head: 1, bdmg: 0, rate: 0.75, mag: 1, reload: 2.7,
    spread: 0.01, adsSpread: 0.002, recoil: 0.05, kick: 1.0, range: 200, pellets: 0, speedMul: 0.9,
    zoom: 2.7, scope: 'pgo', sound: 'rpg', auto: false, projectile: 'rocket',
  },
  {
    key: 'build', name: 'Стройка', short: 'БЛОК', build: true, rate: 6, mag: 0, speedMul: 1.05, zoom: 1,
  },
];
// урон по блокам от оружия +15%
for (const w of WEAPONS) if (w.bdmg) w.bdmg = Math.round(w.bdmg * 1.15 * 10) / 10;
export const W = { AK: 0, LMG: 1, SNIPER: 2, HMG: 3, SHOTGUN: 4, RPG: 5, BUILD: 6 };

export const EXPLOSIONS = {
  // egg — урон по яйцу в центре и радиус, на котором он спадает до нуля
  rocket: { radius: 6.5, power: 340, dmg: 120, push: 16, egg: [180, 4.8], fire: 0.25 },
  nade: { radius: 3.2, power: 300, dmg: 110, push: 14, egg: [165, 4.4], fire: 0.15 },
  // ТНТ: гигантский взрыв — радиус ×4, урон ×2, а по яйцу вдвое слабее прежнего
  tnt: { radius: 16.8, power: 840, dmg: 280, push: 30, egg: [105, 5.4], fire: 0.5, pr: 1.25 },
};

export const MAX_HP = 100;
export const EGG_HP = 2500;
export const RESPAWN_TIME = 4;
export const START_RES = 80;
export const MINE_DMG = 45; // урон по блоку от ломания в режиме стройки
