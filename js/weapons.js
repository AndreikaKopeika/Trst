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
    key: 'shotgun', name: 'Дробовик', short: 'ДРОБ', dmg: 13, head: 1.5, bdmg: 9, rate: 1.4, mag: 7, reload: 2.9,
    spread: 0.075, adsSpread: 0.055, recoil: 0.06, kick: 0.9, range: 40, pellets: 9, speedMul: 1.02,
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
export const W = { AK: 0, LMG: 1, SNIPER: 2, HMG: 3, SHOTGUN: 4, RPG: 5, BUILD: 6 };

export const EXPLOSIONS = {
  rocket: { radius: 3.6, power: 340, dmg: 120, push: 16 },
  nade: { radius: 3.2, power: 300, dmg: 110, push: 14 },
  tnt: { radius: 4.2, power: 420, dmg: 140, push: 18 },
};

export const MAX_HP = 100;
export const EGG_HP = 2500;
export const RESPAWN_TIME = 4;
export const START_RES = 80;
export const MINE_DMG = 45; // урон по блоку от ломания в режиме стройки
