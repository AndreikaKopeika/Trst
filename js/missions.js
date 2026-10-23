// Сценарии кампании «Последнее яйцо».
// Каждая миссия: карта, брифинг, setup (окружение, оружие) и этапы. Этап начинается с точки `at`
// (туда же возрождаешься после провала этапа), его run — сценарий на промисах (см. campaign.js).
import { W } from './weapons.js';
import { B, LIQUID } from './blocks.js';

const PI = Math.PI, EAST = -PI / 2, WEST = PI / 2, NORTH = 0, SOUTH = PI;
const face = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// герои
const GREB = { name: 'Кап. Гребень', hat: 'boonie', weapon: W.AK, god: true, tag: '#ffb347' };
const RYABA = { name: 'Ряба', hat: 'beanie', weapon: W.AK, god: true, tag: '#8fe388' };
const SGT = { name: 'Серж. Петух', hat: 'helmet', capColor: 0x6a3a1a, weapon: W.LMG, god: true, tag: '#ff9f6b' };
const SOLDIER = { hatAlly: 'helmet', respawn: false };
const follow = (side = 1, dist = 3) => ({ type: 'follow', id: 0, side, dist });
const hold = (x, y, z, r = 2, look) => ({ type: 'hold', x, y, z, r, look });

// дождаться, пока группа перебита. Если остался 1 враг и долго не находится — «его снимают напарники»
async function clearGroup(C, name, obj, o = {}) {
  const total = C.group(name).length;
  let lowT = 0;
  await C.until((dt) => {
    const n = C.aliveIn(name);
    if (obj) obj.count(total - n, total);
    if (n <= (o.leave ?? 0)) return true;
    if (n <= (o.low ?? 1)) { lowT += dt; if (lowT > (o.grace ?? 40)) { for (const b of C.group(name)) C.kill(b); return true; } } else lowT = 0;
    return false;
  });
}
// бот идёт по точкам; промис — когда дошёл до последней
async function walk(C, b, pts, r = 1.6) {
  for (const p of pts) {
    if (!b.alive) return;
    C.order(b, { type: 'goto', x: p[0], y: p[1], z: p[2], r: 0.8 });
    await C.until(() => !b.alive || Math.hypot(b.pos.x - p[0] - 0.5, b.pos.z - p[2] - 0.5) < r, 40);
    if (Math.hypot(b.pos.x - p[0] - 0.5, b.pos.z - p[2] - 0.5) > 6) C.teleport(b, [p[0] + 0.5, p[1], p[2] + 0.5]);
  }
}
// волна врагов: появляются партиями, чтобы не дёргать кадр
async function wave(C, n, spot, o = {}) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const [x, z] = spot(i);
    const wpn = o.weapons ? o.weapons[i % o.weapons.length] : undefined;
    list.push(C.spawn(1, x, C.gy(x, z), z, { group: o.group, weapon: wpn, order: o.order ? o.order(i) : null, hp: o.hp, vest: o.vest, hat: o.hat }));
    if (i % 3 === 2) await C.wait(o.gap ?? 1.5);
  }
  return list;
}
const cnt = (C, name) => C.aliveIn(name);

// ============================ ТЕКСТЫ ============================
export const STORY = [
  '2029 год.',
  'Люди ушли с ферм. Однажды утром их просто не стало.',
  'Никто не знает, куда они делись. Остались только мы.',
  '',
  'Без людей встали инкубаторы. Обычные яйца больше не дают цыплят.',
  'Жизнь теперь рождается только из Золотых Яиц.',
  'Их осталось два.',
  'Одно — у нас, у свободных кур Долины Красного Гребня.',
  'Второе — у бройлеров Синего Инкубатора, выращенных под лампами, без солнца.',
  '',
  'Год назад на старой трассе перевернулась армейская фура людей.',
  'Ящики разлетелись по полю. В ящиках было оружие.',
  '',
  'Генерал Гриль, командир Синего Инкубатора, сказал:',
  '#«ЯИЦ ХВАТИТ ТОЛЬКО ОДНОЙ СТАЕ»',
  '',
  'С той ночи курицы стреляют друг в друга.',
  '#ПОСЛЕДНЕЕ ЯЙЦО',
];

export const CREDITS = [
  '#ПОСЛЕДНЕЕ ЯЙЦО',
  '~Кампания Chicken Blocks',
  '', '', '',
  '~В ролях',
  'Капитан Гребень — командир отряда «Коготь»',
  'Ряба — снайпер, лучший друг и самая громкая курица отряда',
  'Сержант «Пух» — ты',
  'Рядовой Цыпа — 2-й Курятный полк',
  'Сержант Квочка — инструктор, который никогда не спит',
  'Сержант Петух — тот, кто кричит «вперёд»',
  '«Индюк» — пилот, который всегда прилетает',
  'Генерал Гриль — Синий Инкубатор',
  'Генерал Шпора — герой войны',
  '', '',
  '~Миссии',
  'Учебка · Груз · В перьях · Ни шагу назад',
  'Шок и трепет · Великий фронт · Расплата',
  '', '',
  '~Мир из блоков, дым, огонь и взрывы',
  'Three.js · WebAudio · много терпения',
  '', '',
  '~Музыка',
  'синтезирована на лету: тайко, струнные, хор из пил',
  '', '',
  '~Посвящается',
  'всем курицам, которые не вернулись на ферму',
  '', '', '',
  'В ту весну из двух Золотых Яиц вылупились цыплята.',
  'Красные и синие.',
  'Им никто не сказал, что яиц хватит только одной стае.',
  '',
  'Потому что это была неправда.',
  '', '', '',
  '#КОНЕЦ',
];

// ============================ 0. УЧЕБКА ============================
const M0 = {
  title: 'Учебка', sub: 'Пролог · лагерь «Курятник»', map: 'camp', seed: 101, hero: 'Пух',
  brief: {
    meta: ['Лагерь «Курятник», Долина Красного Гребня', 'День 1 — 06:40', 'Рядовой «Пух» · учебная рота'],
    text: [
      'Новобранцы Долины проходят курс за три дня. У тебя — одно утро.',
      'Сержант Квочка покажет автомат, прицел, снайперку, гранаты и стройку. Слушай его: он пережил налёт на Старый курятник.',
      'В лагере хранится наше Золотое Яйцо. Разведка видела синих у леса. Это, конечно, ничего не значит.',
    ],
    view: [56, 0, 30],
  },
  setup(C) {
    C.env({ sky: 0xb4dcff, zen: 0x4a8ad8, fog: [45, 140], hemi: 1.6, sun: 1.9, sunColor: 0xffe8c8 });
    C.g.me.name = 'Пух';
    C.weapons([W.AK], { nades: 0 });
    C.onEggCb = (e) => { if (e.team === 0) C.fail('Золотое Яйцо разбито. Стая обречена.'); };
  },
  stages: [
    { // ---------- стрельбище ----------
      at: [12.5, 10, 22.5, EAST],
      async run(C) {
        const g = C.g, me = g.me;
        C.stamp(['День 1 — 06:40', 'Лагерь «Курятник», Долина Красного Гребня', 'Рядовой «Пух»', 'Учебная рота']);
        C.kv = C.spawn(0, 42.5, 10, 11.5, { name: 'Серж. Квочка', hat: 'cap', capColor: 0x8a1a14, god: true, passive: true, weapon: W.AK, yaw: EAST, tag: '#ffd23a' });
        await C.wait(1.2);
        await C.say('kvochka', 'Подъём, Пух! Курицы спят — война не спит. Бегом на стрельбище!');
        let o = C.obj('Явиться на стрельбище', { mark: [42.5, 12, 11.5] });
        C.hint('Ходить — левая половина экрана (или <b>WASD</b>). Смотреть — правая (или мышь).', 7);
        await C.reach([42.5, 10, 11.5], 4); o.complete();
        await C.say('kvochka', 'Это автомат. Им тебя ощипают, если не научишься пользоваться им раньше врага.');
        const dummy = (x, y, z, grp) => C.spawn(1, x, y, z, { name: 'Мишень', noTag: true, passive: true, group: grp, hp: 30, weapon: W.AK, yaw: WEST, hat: 'helmet' });
        for (const [x, z] of [[56, 8], [56, 12], [56, 16], [64, 10], [64, 14]]) dummy(x + 0.5, 11, z + 0.5, 't1');
        await C.say('kvochka', 'Пять мишеней. Огонь!');
        C.hint('Огонь — большая красная кнопка (или <b>ЛКМ</b>)', 6);
        o = C.obj('Поразить мишени', { max: 5 });
        await clearGroup(C, 't1', o, { grace: 120 }); o.complete();
        await C.say('kvochka', 'Неплохо. Теперь целься. В прицеле пули ложатся кучнее.');
        let aimed = 0;
        o = C.obj('Поразить мишени в прицеле', { max: 3 });
        for (const [x, z] of [[72, 8], [72, 12], [72, 16]]) dummy(x + 0.5, 11, z + 0.5, 't2');
        C.hint('Прицел — кнопка с перекрестием (или зажать <b>ПКМ</b>)', 7);
        C.onKillCb = (v, a) => {
          if (v.group !== 't2' || a !== me) return;
          if (me.aiming) { aimed++; o.count(aimed, 3); }
          else { C.hint('Сначала прицелься — <b>кнопка прицела</b> (ПКМ)', 4); const p = v.pos.clone(); C.wait(1).then(() => dummy(p.x, p.y + 0.3, p.z, 't2')); }
        };
        await C.until(() => aimed >= 3 || (cnt(C, 't2') === 0 && aimed >= 2), 240);
        C.onKillCb = null; o.complete();
        await C.say('kvochka', 'Снайперка. Видишь помост в конце стрельбища? Три мишени. Задержи дыхание.');
        await C.say('kvochka', 'Шучу. У кур нет лёгких. Почти.');
        C.weapons([W.AK, W.SNIPER], { nades: 0 }); g.switchWeapon(W.SNIPER);
        C.hint('Оружие меняется кнопками внизу экрана (или <b>1–7</b>)', 6);
        for (const [x, z] of [[95, 10], [96.5, 11], [97.5, 10]]) dummy(x + 0.5, 13, z + 0.5, 't3');
        o = C.obj('Снайперка: поразить дальние мишени', { max: 3, mark: [96, 15, 10.5] });
        await clearGroup(C, 't3', o, { grace: 150 }); o.complete();
        await C.say('kvochka', 'Гранаты. Видишь яму? Там трое. Не жалей.');
        C.weapons([W.AK, W.SNIPER], { nades: 3 }); me.nades = 3;
        for (const [x, z] of [[51, 27], [54, 30], [52, 32]]) dummy(x + 0.5, 7, z + 0.5, 't4');
        C.hint('Граната — кнопка с гранатой (или <b>G</b>). Она отскакивает от стен.', 7);
        o = C.obj('Гранаты: зачистить яму', { max: 3, mark: [52.5, 9, 29.5] });
        const stopN = C.tick(() => { if (me.alive && me.nades === 0 && cnt(C, 't4') > 0) { me.nades = 2; C.hint('Держи ещё парочку', 3); } });
        await clearGroup(C, 't4', o, { grace: 150 }); stopN(); o.complete();
        await C.say('kvochka', 'Курица без стены — суп. Построй укрытие на песчаной площадке. Шесть блоков.');
        C.weapons([W.AK, W.SNIPER, W.BUILD], { nades: 3, res: 40 });
        const inBox = () => { let n = 0; for (let y = 10; y <= 13; y++) for (let z = 40; z <= 50; z++) for (let x = 36; x <= 44; x++) { const id = g.world.get(x, y, z); if (id && !LIQUID[id] && id !== B.LOG && id !== B.LEAVES) n++; } return n; };
        const base0 = inBox();
        o = C.obj('Построить укрытие на песке', { max: 6, mark: [40, 11, 45] });
        C.hint('Стройка — кнопка с кубом (или <b>Q</b>). Ставить — «＋», ломать — «⛏».', 8);
        await C.until(() => { const n = Math.max(0, inBox() - base0); o.count(Math.min(6, n), 6); if (me.res < 4) me.res = 20; return n >= 6; });
        o.complete();
        if (me.weapon === W.BUILD) g.switchWeapon(W.AK);
        await C.say('kvochka', 'Последнее. Полоса препятствий: на вышку — и перелети на вторую.');
        o = C.obj('Подняться на вышку', { mark: [56.5, 18.5, 46.5] });
        await C.until(() => me.alive && me.pos.x > 53.5 && me.pos.x < 60 && me.pos.y > 16.5); o.complete();
        C.hint('Разбегись (<b>Shift</b>), прыгни и <b>держи прыжок</b> в воздухе — курица планирует.', 9);
        await C.say('kvochka', 'Разбег, прыжок — и держи крылья! Свалишься — начнёшь сначала.');
        o = C.obj('Перелететь на вторую вышку', { mark: [72.5, 15.5, 46.5] });
        await C.until(() => {
          if (me.alive && me.pos.y < 8.5 && me.pos.x > 59 && me.pos.x < 70.5) { C.teleport(me, [47.5, 10, 46.5, EAST]); C.line('kvochka', pick(['Мокрая курица — не курица. Ещё раз!', 'Крылья держи, а не клюв! Заново!', 'Плавать будешь потом. Ещё раз!'])); }
          return me.alive && me.pos.x > 69.5 && me.pos.y > 13.5;
        });
        o.complete();
        // появляется капитан
        const greb = C.greb = C.spawn(0, 80.5, 10, 48.5, { ...GREB, passive: true, yaw: face(80, 48, 72, 46) });
        await C.cine([
          { from: [79, 12.2, 51], to: [78.5, 12, 50], look: [80.5, 11.3, 48.5], dur: 2.6, fov: 50 },
        ], { skip: true });
        await C.say('greb', 'Неплохо летаешь для новобранца.');
        await C.say('kvochka', 'Капитан Гребень! Смирно, Пух!');
        await C.say('greb', 'Вольно. Пух, верно? Мне нужен ещё один в отряд «Коготь». Квочка говорит, ты...');
        // налёт
        C.explode([16, 11, 8], 'rocket'); C.fakeBoom([30, 12, 52], 5);
        g.shake = 1.2;
        const siren = C.sfx.loop('siren'); if (siren) siren.set(0.12, 0.5);
        C.siren = siren;
        await C.wait(0.6);
        C.say('hq', 'Тревога! Синие у восточной ограды! Защищайте Яйцо!', { radio: true });
        await C.say('greb', 'Это не учения! К Яйцу, бегом!');
      },
    },
    { // ---------- нападение ----------
      at: [72.5, 14, 46.5, WEST],
      skip(C) { C.greb = null; },
      async run(C) {
        const g = C.g, me = g.me;
        C.music.play('action');
        C.weapons([W.AK, W.LMG, W.SNIPER, W.SHOTGUN, W.RPG, W.BUILD], { nades: 3, res: 80 });
        if (me.weapon === W.SNIPER) g.switchWeapon(W.AK);
        C.allyHome = [12.5, 10, 22.5, EAST];
        if (C.greb) C.remove(C.greb);
        if (C.kv) C.remove(C.kv);
        const greb = C.spawn(0, 30.5, 10, 30.5, { ...GREB, order: hold(29, 10, 30, 4, EAST) });
        C.spawn(0, 22.5, 10, 26.5, { name: 'Серж. Квочка', hat: 'cap', capColor: 0x8a1a14, god: true, weapon: W.LMG, tag: '#ffd23a', order: hold(22, 10, 26, 3, EAST) });
        for (const [x, z] of [[20, 34], [27, 25], [27, 35], [19, 23]]) C.spawn(0, x + 0.5, 10, z + 0.5, { ...SOLDIER, respawn: true, order: hold(x, 10, z, 5, EAST) });
        C.eggs({ 0: { at: [24.5, 11, 30.5] }, 1: { at: [104.5, 10, 30.5], virtual: true } });
        const o = C.obj('Защитить Золотое Яйцо', { mark: () => [24.5, 13.5, 30.5] });
        C.hint('Можно строить стены вокруг яйца. Синие пойдут из леса через ворота.', 7);
        const forest = () => [rnd(98, 106), rnd(8, 52)];
        // волна 1
        await wave(C, 6, forest, { group: 'w1', weapons: [W.AK, W.AK, W.LMG, W.SHOTGUN] });
        const ow = C.obj('Отбить первую волну', { max: 6 });
        await clearGroup(C, 'w1', ow, { grace: 35 }); ow.complete();
        await C.say('greb', 'Перезаряжайся! Это только начало!');
        await C.wait(4);
        C.say('hq', 'Вторая группа с базуками! Северо-восток!', { radio: true });
        await wave(C, 8, () => [rnd(98, 106), rnd(6, 26)], { group: 'w2', weapons: [W.AK, W.RPG, W.LMG, W.AK, W.RPG, W.SHOTGUN] });
        const ow2 = C.obj('Отбить вторую волну', { max: 8 });
        await clearGroup(C, 'w2', ow2, { grace: 35 }); ow2.complete();
        await C.wait(3);
        C.say('okorok', 'Курятник! Это полковник Окорок! Ваше Яйцо — наше!', { radio: true });
        await C.say('greb', 'Окорок лично... Значит, Гриль совсем рядом.');
        const ok = C.spawn(1, 104.5, C.gy(104, 30), 30.5, { name: 'Полк. Окорок', hat: 'cap', capColor: 0x1f3a7a, weapon: W.HMG, hp: 260, group: 'w3', tag: '#79a6ff' });
        await wave(C, 9, forest, { group: 'w3', weapons: [W.AK, W.LMG, W.RPG, W.SHOTGUN, W.AK, W.HMG] });
        const ow3 = C.obj('Отбить штурм полковника Окорока', { max: 10 });
        await clearGroup(C, 'w3', ow3, { grace: 40 }); ow3.complete();
        if (C.siren) C.siren.stop();
        o.complete();
        C.music.play('sad');
        void ok;
        await C.wait(1.5);
        greb.ai.order = hold(26, 10, 33, 1); C.teleport(greb, [27.5, 10, 34.5, face(27, 34, 24, 30)]);
        await C.cine([
          { from: [20, 13, 38], to: [21, 12.6, 37], look: [24.5, 11.5, 30.5], dur: 4, fov: 55 },
          { from: [31, 11.6, 37], to: [30, 11.6, 36.5], look: [27.5, 11.2, 34.5], dur: 7, fov: 45 },
        ], { skip: true });
        await C.say('greb', 'Это была разведка боем. Гриль проверял, как мы держим удар.');
        await C.say('greb', 'Окорок ушёл. Но разведка перехватила их рацию: в Студёном море идёт корабль с грузом для Гриля.');
        await C.say('greb', 'Ночью вылетаем, Пух. Добро пожаловать в «Коготь».');
        await C.fade('black', 1.5);
      },
    },
  ],
};

// ============================ 1. ГРУЗ ============================
const NIGHT = { sky: 0x0b0e16, zen: 0x05070c, fog: [6, 62], hemi: 0.42, sun: 0.18, sunColor: 0x8090b0, hemiColor: 0x8a9ab8, ground: 0x202830, tint: 0x56607a, lamp: 1.4, smoke: 0x40485a, noSun: true, noClouds: true, sunGlow: 0x223044 };
const M1 = {
  title: 'Груз', sub: 'Сухогруз «Несушка-7», Студёное море', map: 'ship', seed: 202, hero: 'Пух', keepBlack: true,
  brief: {
    meta: ['Сухогруз «Несушка-7», Студёное море', 'День 2 — 01:14, шторм', 'Сержант «Пух» · отряд «Коготь»'],
    text: [
      'Перехвачено: корабль синих идёт к южному берегу с грузом, который генерал Гриль лично велел «не открывать».',
      'Задача: высадка с вертолёта, захват мостика, досмотр трюма. Груз опознать. Экипаж — по обстановке.',
      'Капитан Гребень и Ряба идут с тобой. Пилот — «Индюк». Волна до шести метров. Глушители на автоматах.',
    ],
    view: [55, 0, 30],
  },
  setup(C) {
    C.env(NIGHT);
    C.rain(true); C.storm(true, [5, 11]);
    C.g.me.name = 'Пух';
    C.weapons([W.AK, W.SHOTGUN], { nades: 2 });
    C.silence(['ak']);
    C.sea = C.sfx.loop('sea'); if (C.sea) C.sea.set(0.25, 1);
    C.rollK = 1;
    C.tickRoll = C.tick(() => { C.roll = (Math.sin(C.t * 0.55) * 0.03 + Math.sin(C.t * 0.23) * 0.02) * C.rollK + (C.tilt || 0); });
  },
  async intro(C) {
    const h = C.heli({ at: [-25, 30, 34], yaw: EAST, light: true });
    h.fly([[8, 26, 32], [40, 23, 30]], 11, { yaw: EAST });
    C.fade(null, 1.5);
    C.say('indyuk', 'Минута до цели. Болтанка, держитесь за что-нибудь пернатое.');
    const v = new h.pos.constructor();
    await C.cine([
      { at: () => { h.door(v); return [v.x - 1, v.y + 2.5, v.z - 7]; }, lookAt: () => [h.pos.x + 8, h.pos.y - 3, h.pos.z], dur: 5.5, fov: 62, shake: 0.2 },
      { from: [36, 20, 48], to: [34, 21, 44], lookAt: () => [h.pos.x, h.pos.y, h.pos.z], dur: 5.5, fov: 55 },
    ], { skip: true, hideMe: true });
    C.say('greb', 'Свет за бортом гасим. Работаем тихо. Пошли, пошли!');
    await C.fade('black', 0.7);
    h.set(46, 27, 31, EAST); h.fly([[70, 30, 10], [130, 40, -40]], 9);
    C.introHeli = h;
    C.teleport(C.g.me, [34.5, 14, 30.5, WEST]);
    C.greb = C.spawn(0, 36.5, 14, 28.5, { ...GREB, order: follow(-1, 3) });
    C.ryaba = C.spawn(0, 36.5, 14, 32.5, { ...RYABA, order: follow(1, 3), silent: true });
    C.greb.ai.silent = true;
  },
  stages: [
    { // ---------- надстройка ----------
      at: [34.5, 14, 30.5, WEST],
      async run(C) {
        if (!C.greb) { C.greb = C.spawn(0, 36.5, 14, 28.5, { ...GREB, order: follow(-1, 3), silent: true }); C.ryaba = C.spawn(0, 36.5, 14, 32.5, { ...RYABA, order: follow(1, 3), silent: true }); }
        C.stamp(['День 2 — 01:14', 'Студёное море, 60 км от берега', 'Сержант «Пух»', 'Отряд «Коготь»']);
        const calm = { calm: true, calmSight: 15, group: 'bridge', weapon: W.AK };
        C.spawn(1, 29.5, 14, 27.5, { ...calm, order: hold(29, 14, 27, 1, SOUTH) });
        C.spawn(1, 16.5, 14, 32.5, { ...calm, order: hold(16, 14, 32, 2, EAST) });
        C.spawn(1, 22.5, 14, 28.5, { ...calm, weapon: W.SHOTGUN, order: hold(22, 14, 28, 2, EAST) });
        C.spawn(1, 15.5, 19, 31.5, { ...calm, order: hold(15, 19, 31, 2, EAST) });
        C.spawn(1, 22.5, 19, 33.5, { ...calm, order: hold(22, 19, 33, 2, WEST) });
        C.spawn(1, 17.5, 24, 29.5, { ...calm, order: hold(17, 24, 29, 1, EAST) });
        C.spawn(1, 23.5, 24, 32.5, { ...calm, weapon: W.SHOTGUN, order: hold(23, 24, 32, 1, WEST) });
        C.music.play('stealth');
        await C.say('greb', 'Мостик впереди. Часовой у двери — твой.');
        const o = C.obj('Зачистить надстройку и мостик', { mark: [26, 16, 30], max: 7 });
        C.hint('Автомат с глушителем: пока тебя не заметили, выстрелы почти не слышны.', 6);
        let lines = 0;
        C.onKillCb = (v, a) => {
          if (v.group !== 'bridge') return;
          const left = cnt(C, 'bridge');
          if (lines++ % 2 === 0 && left > 0) C.line(pick(['greb', 'ryaba']), pick(['Чисто.', 'Минус один.', 'Готов.', 'Спит. Насовсем.', 'Хороший выстрел.']));
          if (left === 3) o.at([20, 25, 30]);
          void a;
        };
        C.onAlarm = () => { C.music.play('action'); C.line('ryaba', 'Нас засекли!'); };
        await clearGroup(C, 'bridge', o, { grace: 45 }); o.complete();
        C.onKillCb = null;
        await C.say('greb', 'Мостик чист. Ряба, смотри палубу.');
        await C.say('ryaba', 'Понял. Тихо внизу... Слишком тихо.');
      },
    },
    { // ---------- палуба ----------
      at: [27.5, 14, 30.5, EAST],
      async run(C) {
        C.alarm = false;
        const spots = [[42, 14, 29], [58, 14, 31], [66, 14, 29], [84, 14, 30], [38, 17, 24.5], [62, 17, 35], [78, 17, 24.5], [90, 17, 35], [70, 14, 31]];
        for (const [x, y, z] of spots) C.spawn(1, x + 0.5, y, z, { group: 'deck', calm: true, calmSight: 22, weapon: pick([W.AK, W.AK, W.LMG, W.SHOTGUN]), order: hold(x, y, z, 3) });
        await C.say('ryaba', 'Движение на контейнерах! Много!');
        C.silence([]);
        C.music.play('action');
        C.say('greb', 'Глушители больше не помогут. Огонь по готовности!');
        for (const b of C.group('deck')) b.ai.calm = false;
        const o = C.obj('Зачистить палубу', { mark: [52.5, 15.5, 30.5], max: spots.length });
        C.onKillCb = (v) => { if (v.group === 'deck' && Math.random() < 0.35) C.line(pick(['greb', 'ryaba']), pick(['Минус!', 'Есть!', 'Двое слева!', 'На контейнере сверху!', 'Перезаряжаюсь!'])); };
        await clearGroup(C, 'deck', o, { grace: 40 }); o.complete();
        C.onKillCb = null;
        await C.say('greb', 'Груз в трюме. Люк впереди. Вниз, по одному.');
      },
    },
    { // ---------- коридор и трюм ----------
      at: [56.5, 14, 30.5, WEST],
      async run(C) {
        C.music.play('tension');
        const cab = [[37, 9, 25], [43, 9, 34], [48, 9, 25], [55, 9, 34]];
        for (const [x, y, z] of cab) C.spawn(1, x + 0.5, y, z + 0.5, { group: 'cor', calm: true, calmSight: 10, weapon: pick([W.SHOTGUN, W.AK]), order: hold(x, y, z, 1) });
        const hold_ = [[66, 4, 26], [66, 4, 34], [77, 4, 30], [84, 4, 25], [84, 4, 35], [80, 9, 24], [88, 9, 36]];
        for (const [x, y, z] of hold_) C.spawn(1, x + 0.5, y, z + 0.5, { group: 'hold', weapon: pick([W.AK, W.LMG, W.AK]), order: hold(x, y, z, 2) });
        let o = C.obj('Спуститься по люку', { mark: [48.5, 11, 30.5] });
        await C.until(() => C.g.me.pos.y < 12.5 && C.g.me.pos.x < 58); o.complete();
        await C.say('ryaba', 'Каюты экипажа. Проверяй каждую.');
        o = C.obj('Найти груз в трюме', { mark: [60, 11, 30.5] });
        await C.until(() => C.g.me.pos.x > 59.5); o.set('Найти груз в трюме');
        o.at([85.5, 6, 30.5]);
        C.music.play('action');
        await C.until(() => C.near([85.5, 4, 30.5], 3.5));
        o.complete();
        const sc = C.obj('Осмотреть контейнер', { mark: [87, 6, 30] });
        let held = 0;
        await C.until((dt) => { held = C.near([85.5, 4, 30.5], 3.5) ? held + dt : Math.max(0, held - dt); sc.set(`Осмотреть контейнер ${Math.min(100, Math.round(held / 3 * 100))}%`); return held >= 3; });
        sc.complete();
        for (const b of C.enemies()) C.kill(b);
        await C.cine([{ from: [83.5, 6.6, 33], to: [84.6, 6, 31.5], look: [86.5, 5.2, 29.8], dur: 5, fov: 45 }], { skip: true });
        await C.say('ryaba', 'Счётчик щёлкает как бешеный... Капитан, тут маркировка людей.');
        await C.say('ryaba', '«Объект Духовка». И надпись мелом: «Яйцо Судного дня».');
        await C.say('greb', 'Ядерный заряд. Гриль везёт себе бомбу людей. Фотографируй и уходим.');
        await C.say('hq', 'Коготь, это Штаб! Два бомбардировщика синих идут прямо на вас! Они топят корабль вместе с грузом!', { radio: true });
        await C.say('greb', 'Заметают следы. Наверх, быстро!');
      },
    },
    { // ---------- корабль тонет ----------
      at: [82.5, 4, 30.5, WEST],
      async run(C) {
        const g = C.g, me = g.me;
        C.music.play('epic');
        C.env({ ...NIGHT, tint: 0x7a4e52, lamp: 2.2, hemiColor: 0xb06060 });
        const siren = C.sfx.loop('siren'); if (siren) siren.set(0.1);
        C.explode([66, 7, 23.5], 'rocket'); C.fakeBoom([90, 10, 37], 6);
        g.shake = 1.5;
        for (const p of [C.greb, C.ryaba]) if (p) { C.teleport(p, [me.pos.x + 1.5, me.pos.y, me.pos.z + (p === C.greb ? -1.5 : 1.5)]); p.ai.order = follow(p === C.greb ? -1 : 1, 2.5); }
        // вода поднимается в трюме и коридоре
        let level = 3, nextW = C.t + 1;
        const flood = C.tick(() => {
          if (C.t < nextW || level >= 12) return false;
          nextW = C.t + 2.6; level++;
          const W_ = g.world;
          const boxes = [[60, 23, 94, 37], [11, 23, 29, 37]];
          if (level >= 9) boxes.push([31, 29, 58, 31], [11, 24, 58, 36]);
          for (const [x0, z0, x1, z1] of boxes) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (!W_.get(x, level, z)) W_.set(x, level, z, B.WATER);
          return false;
        });
        C.tilt = 0;
        const tiltT = C.tick((dt) => { C.tilt = Math.min(0.1, C.tilt + dt * 0.0012); });
        const booms = C.tick(() => {
          if (Math.random() > 0.012) return false;
          const x = rnd(20, 95), z = rnd(24, 36), y = rnd(5, 15);
          if (Math.hypot(x - me.pos.x, z - me.pos.z) > 9) C.explode([x, y, z], Math.random() < 0.3 ? 'rocket' : 'nade');
          else C.fakeBoom([x, y, z], 3);
          return false;
        });
        for (const [x, y, z] of [[45, 14, 29], [70, 14, 31], [88, 17, 24.5], [40, 9, 30]]) C.spawn(1, x + 0.5, y, z, { group: 'sink', weapon: pick([W.AK, W.SHOTGUN]), order: hold(x, y, z, 2) });
        let drowned = false;
        const T = C.timer(105, 'Корабль тонет', () => C.fail('Корабль ушёл на дно вместе с тобой.'));
        let o = C.obj('Выбраться на палубу', { mark: [56.5, 15.5, 30.5] });
        C.say('greb', 'Наверх! Вода прибывает!');
        await C.until(() => me.alive && me.pos.y > 13.6);
        o.complete();
        const h = C.heli({ at: [118, 30, 60], yaw: -PI / 2, light: true });
        h.fly([[104, 22, 50], [95, 16, 42.5]], 7, { yaw: -PI / 2, face: false });
        C.say('indyuk', 'Коготь, я у носа! Прыгайте, я не могу сесть!', { radio: true });
        await C.say('greb', 'К носу! Бегом!');
        const dv = new h.pos.constructor();
        o = C.obj('Прыгнуть в вертолёт', { mark: () => { if (!h.arrived) return [95.5, 15.5, 35.5]; h.door(dv); return [dv.x, dv.y + 1.5, dv.z]; } });
        C.hint('Разбегись (<b>Shift</b>) и прыгай! В воздухе держи прыжок.', 6);
        await C.until(() => {
          h.door(dv);
          if (me.alive && me.pos.y < 9.5 && me.pos.z > 38.5) drowned = true;
          return drowned || (me.alive && h.arrived && Math.hypot(me.pos.x - dv.x, me.pos.z - dv.z) < 3.2 && me.pos.y > dv.y - 4 && me.pos.y < dv.y + 4);
        });
        if (drowned) { T.stop(); C.fail('Ты сорвался в море.'); return; }
        T.stop(); o.complete(); flood(); booms(); tiltT();
        if (siren) siren.stop();
        C.invuln = true;
        for (const b of C.enemies()) C.kill(b);
        const sv = new h.pos.constructor();
        const keep = C.tick(() => { h.seat(sv); me.pos.copy(sv); me.vel.set(0, 0, 0); });
        h.fly([[104, 22, 52], [120, 32, 70], [150, 40, 90]], 12, { face: true });
        C.music.play('victory');
        C.cine([{ at: () => { h.seat(sv); return [sv.x, sv.y, sv.z]; }, lookAt: () => [55, 10, 30], dur: 11, fov: 60, shake: 0.3 }], { skip: true, hideMe: true });
        await C.say('greb', 'Держу! Индюк, уходим!');
        C.explode([60, 13, 30], 'tnt'); C.explode([80, 10, 30], 'tnt');
        await C.say('indyuk', 'Двигатели на максимум! Держитесь!');
        C.explode([30, 13, 30], 'tnt');
        await C.say('ryaba', 'Груз... Он ушёл на дно вместе с кораблём?');
        await C.say('greb', 'Нет. Это был не весь груз. Документы у нас — теперь мы знаем, где искать. Чернобройль.');
        await C.fade('black', 2);
        keep();
        C.endCine();
      },
    },
  ],
};

// ============================ 2. В ПЕРЬЯХ ============================
const DAWN = { sky: 0xb5c0bc, zen: 0x7f95a8, fog: [12, 78], hemi: 1.15, sun: 0.95, sunColor: 0xffd8a8, hemiColor: 0xd8e0d8, ground: 0x6a6a50, tint: 0xd0d6cc, smoke: 0xb0b4b0, noClouds: true };
const M2 = {
  title: 'В перьях', sub: 'Чернобройль, зона отчуждения', map: 'town', seed: 303, hero: 'Пух',
  brief: {
    meta: ['Чернобройль, заброшенный город людей', 'День 15 — 05:50, туман', 'Сержант «Пух» · отряд «Коготь»'],
    text: [
      'Документы с «Несушки-7»: сделка по «Яйцу Судного дня» пройдёт в мёртвом городе Чернобройль. Покупатель — генерал Гриль. Лично.',
      'Ты и капитан Гребень идёте вдвоём. Маскировка, снайперские винтовки с глушителями. Город патрулируют.',
      'Позиция для выстрела — верхний этаж гостиницы «Полесье». Отход к колесу обозрения в старом парке, там заберёт «Индюк».',
    ],
    view: [80, 0, 56],
  },
  setup(C) {
    C.env(DAWN);
    C.g.me.name = 'Пух';
    C.weapons([W.SNIPER, W.AK], { nades: 1 });
    C.silence(['sniper']);
    C.eggs({ 0: { at: [16.5, 10, 38.5], virtual: true }, 1: { at: [116.5, 10, 46.5], virtual: true } });
    C.ash(true, 0xd8dcd0, 0.06, 0.25, 300);
  },
  stages: [
    { // ---------- подход ----------
      at: [10.5, 10, 100.5, -PI / 4],
      async run(C) {
        const g = C.g, me = g.me;
        C.music.play('stealth');
        C.stamp(['День 15 — 05:50', 'Чернобройль, зона отчуждения', 'Сержант «Пух»', 'Отряд «Коготь»']);
        const greb = C.greb = C.spawn(0, 12.5, 10, 98.5, { ...GREB, weapon: W.SNIPER, silent: true, order: null });
        await C.say('greb', 'Двенадцать лет назад здесь жили люди. Теперь только мы. И радиация.');
        await C.say('greb', 'Держись за мной и не высовывайся.');
        const o = C.obj('Следовать за капитаном', { mark: () => greb });
        await walk(C, greb, [[22, 10, 92], [30, 10, 83]]);
        C.order(greb, hold(30, 10, 83, 0.5, NORTH));
        await C.until(() => C.near([30.5, 10, 83.5], 6), 40);
        // патруль
        const pat = [];
        for (let i = 0; i < 4; i++) pat.push(C.spawn(1, 84.5 + i * 2.2, 10, 70.5 + (i % 2), { group: 'pat', calm: true, calmSight: 18, weapon: pick([W.AK, W.LMG]), order: { type: 'patrol', pts: [[60, 10, 70], [4, 10, 70]], walk: 0.42, pause: 0.2 } }));
        await C.say('greb', 'Стоп. Патруль. Четверо, с запада им идти мимо нас.');
        await C.say('greb', 'Замри. Пусть пройдут.');
        const op = C.obj('Пропустить патруль (или снять без шума)');
        const passed = () => pat.every(b => !b.alive || b.removed || b.pos.x < 14);
        await C.until(() => { for (const b of pat) if (b.alive && !b.removed && b.pos.x < 9 && b.ai.calm) C.remove(b); return passed() || C.alarm; }, 120);
        if (C.alarm) { await C.say('greb', 'Засекли! Огонь!'); C.music.play('action'); await clearGroup(C, 'pat', null, { grace: 30 }); C.music.play('stealth'); C.alarm = false; }
        op.complete();
        for (const b of pat) C.remove(b);
        await C.say('greb', 'Чисто. Идём к гостинице.');
        await walk(C, greb, [[42, 10, 70], [50, 10, 61]]);
        C.order(greb, hold(50, 10, 61, 0.5, NORTH));
        o.complete();
        await C.until(() => C.near([50.5, 10, 61.5], 7), 60);
      },
    },
    { // ---------- двое у входа и гостиница ----------
      at: [49.5, 10, 62.5, NORTH],
      async run(C) {
        const g = C.g, me = g.me;
        const greb = C.greb || (C.greb = C.spawn(0, 51.5, 10, 62.5, { ...GREB, weapon: W.SNIPER, silent: true }));
        const L = C.spawn(1, 44.5, 10, 49.5, { group: 'door', calm: true, calmSight: 14, order: hold(44, 10, 49, 0.5, SOUTH) });
        const R = C.spawn(1, 51.5, 10, 50.5, { group: 'door', calm: true, calmSight: 14, order: hold(51, 10, 50, 0.5, SOUTH) });
        await C.say('greb', 'Двое у входа. Мой — правый, твой — левый.');
        await C.say('greb', 'Стреляю вместе с тобой. Бери левого.');
        const o = C.obj('Снять часового слева — одновременно с капитаном', { mark: () => L });
        let fired = false;
        const was = C.shot.bind(C);
        C.shot = (p, w) => { if (p === me && !fired) { fired = true; C.wait(0.12).then(() => C.kill(R)); } return was(p, w); };
        await C.until(() => !L.alive && !R.alive || C.alarm, 90);
        C.shot = was;
        if (!fired) C.kill(R);
        if (L.alive || C.alarm) { C.music.play('action'); await C.say('greb', 'Шумно получилось. Добивай!'); await clearGroup(C, 'door', null, { grace: 20 }); C.music.play('stealth'); C.alarm = false; }
        else await C.say('greb', 'Два выстрела — один звук. Отлично.');
        o.complete();
        C.order(greb, follow(1, 2.5));
        C.spawn(1, 48.5, 19, 41.5, { group: 'hotel', calm: true, calmSight: 12, weapon: W.SHOTGUN, order: hold(48, 19, 41, 2) });
        C.spawn(1, 49.5, 28, 42.5, { group: 'hotel', calm: true, calmSight: 12, order: hold(49, 28, 42, 2) });
        const o2 = C.obj('Подняться на верхний этаж гостиницы', { mark: [47.5, 12, 45.5] });
        await C.until(() => me.pos.x > 40 && me.pos.x < 54 && me.pos.z > 34 && me.pos.z < 46);
        o2.at([42.5, 36, 36.5]);
        C.hint('Лестница — в северо-западном углу, марши поворачивают на каждом этаже.', 6);
        C.say('greb', 'Наверх. Девятый этаж.');
        await C.until(() => me.alive && me.pos.y > 33.5 && me.pos.x > 40 && me.pos.x < 54);
        o2.complete();
      },
    },
    { // ---------- выстрел ----------
      at: [50.5, 34, 40.5, EAST],
      async run(C) {
        const g = C.g, me = g.me;
        C.env({ ...DAWN, fog: [25, 150] });
        const greb = C.greb || (C.greb = C.spawn(0, 49.5, 34, 42.5, { ...GREB, weapon: W.SNIPER, silent: true }));
        C.teleport(greb, [49.5, 34, 43.5, EAST]); C.order(greb, hold(49, 34, 43, 0.5, EAST));
        const hh = C.heli({ at: [121, 10.85, 37], yaw: PI, color: 0x2a3a6a, vol: 0.5 });
        hh.rotorV = 0.25;
        const grill = C.grill = C.spawn(1, 113.5, 10, 46.5, { name: 'Ген. Гриль', hat: 'cap', capColor: 0x1f3a7a, weapon: W.HMG, god: true, passive: true, yaw: face(113, 46, 121, 37), tag: '#79a6ff' });
        const guards = C.squad(1, [[111, 10, 44], [116, 10, 49], [118, 10, 44], [110, 10, 49], [114, 10, 52], [120, 10, 41]].map(([x, y, z]) => [x + 0.5, y, z + 0.5, { order: hold(x, y, z, 1, face(x, z, 50, 40)) }]), { group: 'sq', calm: true, calmSight: 25, weapon: W.AK });
        C.music.play('tension');
        await C.say('greb', 'Вот он. Генерал Гриль. Тот, кто сказал: «Яиц хватит только одной стае».');
        await C.say('greb', 'Шестьдесят пять метров, ветра почти нет. Целься в корпус. Это твой выстрел, Пух.');
        C.hint('Прицел СВД — кнопка прицела. В голову — смертельно.', 6);
        const o = C.obj('Поразить генерала Гриля', { mark: () => grill });
        let hit = false;
        grill.onHit = (d, a) => { if (a === me || a === greb) hit = true; };
        let nag = 0;
        await C.until((dt) => {
          nag += dt;
          if (nag > 45 && nag - dt <= 45) C.line('greb', 'Ну же, Пух. Пока он не ушёл.');
          if (nag > 110) { hit = true; C.line('greb', 'Ладно, сам.'); }
          return hit;
        });
        o.complete();
        grill.god = true; grill.onHit = null;
        g.fx.feathers(grill.pos.clone().setY(grill.pos.y + 1), 30, 1);
        C.music.play('action');
        await C.say('greb', 'Попал! Он упал!');
        grill.ai.passive = false; grill.ai.order = { type: 'goto', x: 120, y: 10, z: 38, r: 0.6 }; grill.ai.fixWeapon = W.AK;
        for (const b of guards) if (b.alive) C.alertBot(b, me.pos, false);
        hh.rotorV = 1;
        await C.say('greb', 'Чёрт... Он жив! Его тащат к вертолёту!');
        await C.until(() => !grill.alive || Math.hypot(grill.pos.x - 120.5, grill.pos.z - 38.5) < 2.5, 8);
        C.remove(grill);
        hh.fly([[121, 22, 40], [130, 40, 20], [180, 50, -40]], 8);
        C.wait(9).then(() => hh.kill());
        await C.say('greb', 'Ушёл. Ничего. Сейчас здесь будет вся армия Гриля — уходим!');
      },
    },
    { // ---------- отход ----------
      at: [47.5, 10, 47.5, WEST],
      async run(C) {
        const g = C.g, me = g.me;
        const greb = C.greb || (C.greb = C.spawn(0, 48.5, 34, 42.5, { ...GREB, weapon: W.SNIPER }));
        C.order(greb, follow(1, 3)); greb.ai.silent = false;
        C.silence([]);
        C.env(DAWN);
        C.music.play('action');
        C.alarm = true;
        const hunters = () => C.enemies().length;
        const spawnH = (n) => wave(C, n, () => pick([[rnd(64, 74), rnd(36, 62)], [rnd(56, 66), rnd(4, 20)], [rnd(56, 70), rnd(64, 70)]]), { weapons: [W.AK, W.LMG, W.AK, W.SHOTGUN, W.RPG] });
        spawnH(5);
        let o = C.obj('Спуститься вниз', { mark: [47.5, 12, 45.5] });
        await C.until(() => me.alive && me.pos.y < 11.5); o.complete();
        o = C.obj('Добраться до парка — к точке эвакуации', { mark: [16.5, 12, 38.5] });
        C.say('greb', 'К колесу обозрения! Бегом!');
        await C.until(() => C.near([16.5, 10, 38.5], 6));
        o.complete();
        await C.say('indyuk', 'Коготь, это «Индюк». Буду через семьдесят пять секунд. Держитесь.', { radio: true });
        await C.say('greb', 'Занимай позицию за мешками. Они пойдут со всех сторон.');
        const od = C.obj('Продержаться до прибытия вертолёта');
        const T = C.timer(75, 'Эвакуация');
        const maxA = [5, 7, 9][C.D.skill];
        let nextL = C.t + 10;
        await C.until(() => {
          if (hunters() < maxA && Math.random() < 0.04) spawnH(2);
          if (C.t > nextL) { nextL = C.t + rnd(9, 15); C.line('greb', pick(['Слева, у карусели!', 'Держи сектор!', 'Перезаряжаюсь — прикрой!', 'Справа по дороге!', 'Их всё больше!', 'Не высовывайся!'])); }
          return T.left <= 0;
        });
        T.stop(); od.complete();
        const h = C.heli({ at: [-30, 45, -10], yaw: SOUTH });
        h.fly([[4, 25, 20], [16.5, 10.85, 38.5]], 9, { yaw: -PI / 2, face: false });
        await C.say('indyuk', 'Вижу вас! Сажусь!');
        const dv = new h.pos.constructor();
        o = C.obj('В вертолёт!', { mark: () => { h.door(dv); return [dv.x, dv.y + 1.5, dv.z]; } });
        await C.until(() => { h.door(dv); return h.arrived && me.alive && Math.hypot(me.pos.x - dv.x, me.pos.z - dv.z) < 3.5; });
        o.complete();
        C.invuln = true; C.remove(greb);
        const sv = new h.pos.constructor();
        const keep = C.tick(() => { h.seat(sv); me.pos.copy(sv); me.vel.set(0, 0, 0); });
        h.fly([[20, 24, 30], [30, 36, 10], [70, 45, -30]], 12);
        C.music.play('sad');
        C.cine([{ at: () => { h.seat(sv); return [sv.x, sv.y + 0.2, sv.z]; }, lookAt: () => [28, 25, 14], dur: 11, fov: 62, shake: 0.15 }], { skip: true, hideMe: true });
        await C.say('greb', 'Гриль выжил. Но теперь он знает: мы придём за ним.');
        await C.say('greb', 'А бомбу он уже купил. Вопрос только — куда он её повезёт.');
        await C.fade('black', 2.5);
        keep();
        C.endCine();
      },
    },
  ],
};

// ============================ 3. НИ ШАГУ НАЗАД ============================
const M3 = {
  title: 'Ни шагу назад', sub: 'Каньон «Две крепости», Красный бастион', map: '2fort', seed: 404, hero: 'Цыпа',
  brief: {
    meta: ['Каньон «Две крепости», Красный бастион', 'День 19 — 15:20', 'Рядовой Цыпа · 2-й Курятный полк'],
    text: [
      'Синий Инкубатор бросил на каньон всё, что у него есть. Если бастион падёт — дорога к Долине открыта.',
      'Приказ генерала Шпоры: держать бастион до подхода подкрепления. Затем — контратака через мост.',
      'Твой сержант — Петух. Он громкий. Слушай его.',
    ],
    view: [56, 0, 30],
  },
  setup(C) {
    C.env({ sky: 0x9aa6b6, zen: 0x5a6a86, fog: [30, 115], hemi: 1.35, sun: 1.25, sunColor: 0xfff0d8, smoke: 0xd8d8d8 });
    C.g.me.name = 'Цыпа';
    C.weapons([W.AK, W.LMG, W.SNIPER, W.SHOTGUN, W.RPG, W.BUILD], { nades: 3, res: 90 });
    C.allyHome = [9.5, 10, 30.5, EAST];
    C.eggs({ 0: { at: [20.5, 11, 30.5] }, 1: { at: [91.5, 11, 30.5], virtual: true } });
    C.onEggCb = (e) => { if (e.team === 0) C.fail('Бастион пал: Золотое Яйцо разбито.'); };
  },
  stages: [
    { // ---------- оборона ----------
      at: [30.5, 16, 30.5, EAST],
      async run(C) {
        const g = C.g;
        C.stamp(['День 19 — 15:20', 'Каньон «Две крепости», Красный бастион', 'Рядовой Цыпа', '2-й Курятный полк']);
        C.music.play('action');
        C.spawn(0, 32.5, 16, 34.5, { ...SGT, order: hold(32, 16, 34, 3, EAST) });
        for (const [x, y, z] of [[33, 16, 14], [33, 16, 20], [33, 16, 40], [33, 16, 46], [39, 10, 25], [39, 10, 36], [24, 10, 30]]) C.spawn(0, x + 0.5, y, z + 0.5, { ...SOLDIER, respawn: true, order: hold(x, y, z, 3, EAST) });
        await C.say('sgt', 'Цыпа! Они идут через мост, через реку и по канализации!');
        await C.say('sgt', 'Держать бастион! Ни шагу назад!');
        const o = C.obj('Удержать бастион до подхода подкрепления', { mark: () => [20.5, 13, 30.5] });
        C.hint('Строй укрытия у бойниц и ворот (<b>Q</b>). Базука сносит стены вместе с врагами.', 7);
        const T = C.timer(200, 'До подкрепления');
        const art = C.artillery([36, 10, 47, 50], [5, 9], 9);
        const cap = [7, 9, 11][C.D.skill];
        let nextS = 0, nextL = C.t + 14;
        await C.until(() => {
          const el = 200 - T.left;
          const want = Math.min(cap, 4 + Math.floor(el / 35));
          if (C.enemies().length < want && C.t > nextS) {
            nextS = C.t + 1.2;
            const z = rnd(12, 48);
            C.spawn(1, rnd(100, 105), 10, z, { weapon: pick([W.AK, W.AK, W.LMG, W.SHOTGUN, W.RPG, el > 100 ? W.HMG : W.AK]) });
          }
          if (C.t > nextL) { nextL = C.t + rnd(12, 18); C.line('sgt', pick(['Огонь по мосту!', 'Базуки во дворе!', 'Они в канализации!', 'Держать бойницы!', 'Миномёты! Ложись!', 'Цыпа, не спать!'])); }
          return T.left <= 0;
        });
        T.stop(); art(); o.complete();
        await C.say('hq', 'Бастион, держитесь! Подкрепление на мосту!', { radio: true });
        await C.say('sgt', 'Вот оно! Контратака! За мной — на мост!');
      },
    },
    { // ---------- контратака ----------
      at: [34.5, 16, 30.5, EAST],
      async run(C) {
        const g = C.g, me = g.me;
        C.music.play('epic');
        C.goal(1, [91.5, 10, 30.5]);
        for (const b of C.allies()) if (b.name !== SGT.name) b.ai.order = null;
        const sgt = C.allies().find(b => b.name === SGT.name) || C.spawn(0, 32.5, 16, 31.5, { ...SGT });
        C.order(sgt, follow(1, 3));
        for (let i = 0; i < 5; i++) C.spawn(0, 10.5 + i, 10, 28.5 + (i % 3), { ...SOLDIER, respawn: true });
        for (const b of C.enemies()) C.kill(b);
        const bf = [[66, 16, 30], [72, 16, 29], [80, 16, 20], [80, 16, 40], [88, 16, 14], [88, 16, 46], [96, 16, 30], [89, 10, 26], [93, 10, 34], [84, 10, 30], [98, 10, 20], [78, 10, 30]];
        for (const [x, y, z] of bf) C.spawn(1, x + 0.5, y, z + 0.5, { group: 'bf', weapon: pick([W.AK, W.LMG, W.SHOTGUN, W.AK, W.RPG]), order: hold(x, y, z, 3) });
        let o = C.obj('Захватить мост', { mark: [72.5, 17.5, 30.5] });
        await C.until(() => me.alive && me.pos.x > 70); // мост могли разнести — можно и вброд
        o.complete();
        await C.say('sgt', 'Мост наш! В форт! Зачистить всё!');
        o = C.obj('Зачистить форт синих', { max: bf.length, mark: [80, 17.5, 30.5] });
        await clearGroup(C, 'bf', o, { grace: 40, low: 2 }); o.complete();
        o = C.obj('Найти штабную комнату', { mark: [90.5, 12, 30.5] });
        await C.until(() => C.near([90.5, 10, 30.5], 4));
        o.complete();
        C.music.play('tension');
        await C.cine([{ from: [86.5, 12, 27], to: [87.5, 11.8, 28], look: [91.5, 10.5, 31], dur: 5, fov: 55 }], { skip: true });
        await C.say('sgt', 'Пусто... Ни яйца, ни Гриля. Они ушли заранее.');
        await C.say('tsypa', 'Сержант, тут карта. Пустынный город. Все стрелки ведут туда.');
        await C.say('hq', 'Всем полкам: наступление на Пустынный город. Выдвигаемся утром.', { radio: true });
        await C.fade('black', 1.5);
      },
    },
  ],
};

// ============================ 4. ШОК И ТРЕПЕТ ============================
const NOON = { sky: 0xf0d8a8, zen: 0x6a98d0, fog: [35, 125], hemi: 1.5, sun: 2.2, sunColor: 0xffe2b0, smoke: 0xe0d0b8 };
const ASH = { sky: 0x8a3818, zen: 0x2a0c06, fog: [8, 70], hemi: 0.95, sun: 1.3, sunColor: 0xff6a2a, hemiColor: 0xff9a70, ground: 0x402010, tint: 0xd09078, smoke: 0x5a3020, noSun: true, noClouds: true, sunGlow: 0xff5a1a };
const M4 = {
  title: 'Шок и трепет', sub: 'Пустынный город', map: 'dust2', seed: 505, hero: 'Цыпа',
  brief: {
    meta: ['Пустынный город', 'День 21 — 12:05', 'Рядовой Цыпа · 2-й Курятный полк'],
    text: [
      'Разведка: штаб генерала Гриля — на площади у точки A. Город держат остатки его гвардии.',
      'Полк идёт через Длинную, вертушки ждут на миде. Генерал Шпора обещал: к вечеру война закончится.',
      'Найти Гриля. Взять живым, если получится.',
    ],
    view: [56, 0, 30],
  },
  setup(C) {
    C.env(NOON);
    C.g.me.name = 'Цыпа';
    C.weapons([W.AK, W.LMG, W.SHOTGUN, W.SNIPER, W.RPG], { nades: 3 });
    C.allyHome = [12.5, 10, 30.5, EAST];
    C.eggs({ 0: { at: [6.5, 11, 30.5], virtual: true }, 1: { at: [92.5, 11, 46.5], virtual: true } });
  },
  stages: [
    { // ---------- Длинная и точка A ----------
      at: [12.5, 10, 30.5, face(12, 30, 20, 45)],
      async run(C) {
        const g = C.g, me = g.me;
        C.stamp(['День 21 — 12:05', 'Пустынный город', 'Рядовой Цыпа', '2-й Курятный полк']);
        C.music.play('action');
        const sgt = C.spawn(0, 14.5, 10, 33.5, { ...SGT, order: follow(-1, 3) });
        for (let i = 0; i < 7; i++) C.spawn(0, 8.5 + (i % 4) * 2, 10, 24.5 + Math.floor(i / 4) * 10, { ...SOLDIER, respawn: true });
        for (const [x, y, z] of [[40, 10, 51], [50, 10, 55], [60, 10, 49], [70, 10, 53], [78, 10, 49], [86, 10, 48], [84, 10, 40], [88, 10, 54]]) C.spawn(1, x + 0.5, y, z + 0.5, { group: 'long', weapon: pick([W.AK, W.LMG, W.SNIPER, W.AK]), order: hold(x, y, z, 3) });
        for (const [x, y, z] of [[92, 11, 44], [96, 11, 48], [99, 11, 42], [94, 10, 37], [88, 10, 36], [99, 13, 54], [86, 10, 44]]) C.spawn(1, x + 0.5, y, z + 0.5, { group: 'asite', weapon: pick([W.AK, W.HMG, W.SHOTGUN, W.RPG, W.AK]), order: hold(x, y, z, 3) });
        await C.say('sgt', 'Штаб Гриля — на точке A! Идём через Длинную!');
        await C.say('sgt', 'Вперёд, вперёд, вперёд!');
        let o = C.obj('Прорваться через Длинную', { mark: [34, 12, 49.5] });
        await C.reach([36, 10, 51], 5);
        o.set('Зачистить Длинную'); o.at([84, 12, 51]);
        await clearGroup(C, 'long', o, { grace: 40 }); o.complete();
        await C.say('sgt', 'Длинная наша! Точка A — штурм!');
        o = C.obj('Зачистить точку A', { mark: [93, 13, 45] });
        await clearGroup(C, 'asite', o, { grace: 40 }); o.complete();
      },
    },
    { // ---------- штаб ----------
      at: [93.5, 11, 45.5, NORTH],
      async run(C) {
        const g = C.g;
        for (const [x, y, z] of [[94, 10, 30], [100, 10, 20], [88, 10, 18], [104, 10, 28], [98, 10, 26], [84, 10, 24]]) C.spawn(1, x + 0.5, y, z + 0.5, { group: 'ct', weapon: pick([W.AK, W.LMG, W.SHOTGUN]), order: hold(x, y, z, 3) });
        C.goal(1, [100.5, 10, 23.5]);
        await C.say('sgt', 'Штаб за проходом! Обыскать всё!');
        const o = C.obj('Обыскать штаб Гриля', { mark: [104.5, 12.5, 23.5] });
        await C.until(() => C.near([103.5, 10, 23.5], 4) && C.aliveIn('ct') <= 2);
        for (const b of C.group('ct')) C.kill(b);
        o.complete();
        C.music.play('tension');
        await C.cine([{ from: [99, 12.5, 27], to: [100.5, 12, 26], look: [104.5, 11, 23.5], dur: 4, fov: 50 }], { skip: true });
        await C.say('sgt', 'Пусто. Только рация. Она... включена.');
        await C.say('grill', 'Курятник. Вы такие предсказуемые. Добро пожаловать в Пустынный город.', { radio: true });
        C.music.play('dread');
        await C.say('hq', 'Всем подразделениям! В городе ядерный заряд! Повторяю: ядерный заряд! Немедленная эвакуация!', { radio: true });
        await C.say('sgt', 'Вертушки на миде! Бегом, Цыпа, бегом!');
      },
    },
    { // ---------- эвакуация и взрыв ----------
      at: [100.5, 10, 25.5, WEST],
      async run(C) {
        const g = C.g, me = g.me;
        C.music.play('epic');
        const h = C.heli({ at: [38.5, 10.85, 30.5], yaw: EAST });
        const h2 = C.heli({ at: [26, 26, 20], yaw: EAST, vol: 0.5 });
        C.goal(0, [38.5, 10, 30.5]);
        for (const b of C.allies()) C.order(b, { type: 'goto', x: 40, y: 10, z: 29 + Math.floor(Math.random() * 3), r: 4 });
        wave(C, 4, () => [rnd(60, 70), rnd(8, 18)], { weapons: [W.AK, W.SHOTGUN] });
        const T = C.timer(90, 'Эвакуация', () => C.fail('Ты не успел к вертолёту.'));
        const dv = new h.pos.constructor();
        const o = C.obj('К вертолётам на миде!', { mark: () => { h.door(dv); return [dv.x, dv.y + 1.6, dv.z]; } });
        C.say('indyuk', 'Борт ноль-один на миде! Ждём тридцать секунд и взлетаем — с вами или без!', { radio: true });
        await C.until(() => { h.door(dv); return me.alive && Math.hypot(me.pos.x - dv.x, me.pos.z - dv.z) < 3.4; });
        T.stop(); o.complete();
        C.invuln = true;
        for (const b of C.enemies()) C.kill(b);
        for (const b of C.allies()) C.remove(b);
        const sv = new h.pos.constructor();
        const keep = C.tick(() => { h.seat(sv); me.pos.copy(sv); me.vel.set(0, 0, 0); });
        h.fly([[40, 30, 32], [62, 42, 42], [88, 46, 50], [112, 46, 56]], 15, { yaw: EAST, face: false });
        h2.fly([[50, 36, 30], [80, 44, 36], [120, 48, 44]], 14, { yaw: EAST, face: false });
        const ov = new h.pos.constructor();
        C.cine([{ at: () => { h.seat(sv); return [sv.x, sv.y, sv.z]; }, lookAt: () => C.nk ? [C.nk.c.x, C.nk.c.y + 45 + Math.min(40, C.nk.T * 4), C.nk.c.z] : (h.out(ov), [ov.x, ov.y, ov.z]), dur: 60, fov: 64, shake: 0.12 }], { skip: false, noSkip: true, hold: true, hideMe: true });
        await C.say('indyuk', 'Все на борту! Уходим!');
        await C.say('sgt', 'Давай, давай, давай!');
        await C.wait(2.5);
        // вспышка
        const nk = C.nk = C.nuke([40, 9, -170], 1);
        C.sfx.nuke(1.6); if (g.audio.deafen) g.audio.deafen(1);
        if (g.post && g.post.flashOn) g.post.flashOn(1);
        $fade(C, '#fff', 0.05);
        C.music.play(null);
        await C.wait(0.25);
        C.fade(null, 3);
        await C.say('indyuk', 'Господи... Ударная волна! Держитесь!');
        await C.wait(1.2);
        g.shake = 2;
        h.spin = 2.6; h2.spin = -1.8;
        h.fly([[118, 36, 50], [104, 22, 34], [97, 11.5, 22]], 5.5, { face: false, linear: true });
        h2.fly([[130, 30, 30], [140, 6, 20]], 5, { face: false });
        await C.say('indyuk', 'Хвостовой винт! Падаем! Падаем!');
        await C.until(() => h.arrived, 7);
        C.fakeBoom([97, 12, 22], 6); g.shake = 2;
        await C.fade('black', 0.15);
        keep(); C.endCine(); C.shutUp();
        // город после взрыва
        h.spin = 0; h.rotorV = 0; h.roll = 0.5; h.pitch = -0.2; h.bob = 0; h.set(106, 10.5, 30, 2.2); if (h.snd) h.snd.stop();
        h2.kill();
        nk.T = 19;
        const W_ = g.world;
        const crater = (cx, cy, cz, r) => { for (let y = Math.max(9, Math.floor(cy - r)); y <= cy + r; y++) for (let z = Math.floor(cz - r); z <= cz + r; z++) for (let x = Math.floor(cx - r); x <= cx + r; x++) if ((x - cx) ** 2 + (y - cy) ** 2 + (z - cz) ** 2 < r * r && W_.get(x, y, z) && y > 9) W_.data[W_.idx(x, y, z)] = 0; };
        for (let i = 0; i < 140; i++) { const x = rnd(4, 108), z = rnd(2, 58); if (Math.random() < 1.15 - z / 70) crater(x, rnd(12, 19), z, rnd(2.5, 5.5)); }
        g.mesher.rebuildAll(); g.nav && g.nav.markDirty();
        for (let i = 0; i < 40; i++) { const x = Math.floor(rnd(20, 108)), z = Math.floor(rnd(4, 56)); const y = C.gy(x, z); C.ignite(x, y, z, rnd(60, 200)); }
        for (const [x, z] of [[104, 29], [106, 31], [103, 31], [107, 28]]) C.ignite(x, 10, z, 300);
        C.env(ASH);
        C.ash(true, 0xb8a8a0, 0.08, 0.5);
        C.noGun = true; document.body.classList.add('nogun'); C.speedMul = 0.32; me.hp = 34; me.noRegen = true; C.weapons([], { nades: 0 });
        C.teleport(me, [99.5, 10, 26.5, face(99, 26, 40, -170)]); me.pitch = 0.18;
        const ring = C.sfx.loop('ring'); if (ring) ring.set(0.035, 2);
        const wind = C.sfx.loop('sea'); if (wind) wind.set(0.18, 3);
        await C.wait(1);
        // очнулся: мигаем
        for (const [a, b] of [[null, 0.4], ['black', 0.5], [null, 0.8], ['black', 0.3], [null, 1.2]]) { await C.fade(a, b); await C.wait(0.3); }
        C.music.play('dread');
        let t = 0, beat = 0;
        const life = C.tick((dt) => {
          t += dt; beat -= dt;
          if (beat <= 0) { beat = 0.9 + t * 0.03; C.sfx.heartbeat(); if (Math.random() < 0.35) C.sfx.breath(); }
          me.hp = Math.max(4, 34 - t * 1.1);
          g.hud.flashV = Math.max(g.hud.flashV, 0.25 + Math.sin(t * 2) * 0.1);
          return false;
        });
        await C.until(() => t > 30);
        life();
        // падает
        const c0 = g.camera.position.clone();
        const yaw = me.yaw;
        await C.cine([{ from: [c0.x, c0.y, c0.z], to: [c0.x, c0.y - 1.1, c0.z], look: [c0.x - Math.sin(yaw) * 10, c0.y, c0.z - Math.cos(yaw) * 10], lookTo: [40, 120, -170], dur: 3.5, fov: 70, roll: 0.5 }], { skip: false, noSkip: true, hold: true, hideMe: true });
        await C.fade('white', 4);
        if (ring) ring.stop(); if (wind) wind.stop();
        C.music.play('sad');
        await C.epitaph(['Рядовой Цыпа', 'погиб в Пустынном городе.', '', '~Вместе с ним — тридцать тысяч кур Красного Гребня.', '', '~Взрыв видели из Долины.'], 3);
        C.endCine();
      },
    },
  ],
};
function $fade(C, color, dur) { const el = document.getElementById('fadeL'); el.style.transition = `opacity ${dur}s`; el.style.background = color; el.style.opacity = 1; void C; }

// ============================ 5. ВЕЛИКИЙ ФРОНТ ============================
const WAR = { sky: 0x8a96a6, zen: 0x4a5a76, fog: [35, 145], hemi: 1.2, sun: 1.05, sunColor: 0xffe0c0, smoke: 0xa8a8a8, noClouds: false };
const BLACK = 0x1c1c20;
const M5 = {
  title: 'Великий фронт', sub: 'Река Кура, цитадель Синего Инкубатора', map: 'giant', seed: 606, hero: 'Пух',
  brief: {
    meta: ['Великий фронт, река Кура', 'День 22 — 07:00', 'Сержант «Пух» · отряд «Коготь»'],
    text: [
      'Пустынного города больше нет. Генерал Шпора: «Гриль ударил первым. Теперь мы ответим всем, что у нас есть».',
      'Вся армия Долины идёт через реку. Последний оплот Гриля — цитадель на том берегу. Где-то там второе устройство: «Яйцо-2».',
      'Отряд «Коготь» идёт первым: крытый мост, траншеи, ворота, цитадель. Генерал Гриль — живым или нет.',
    ],
    view: [150, 0, 64],
  },
  setup(C) {
    C.env(WAR);
    C.g.me.name = 'Пух';
    C.weapons([W.AK, W.LMG, W.SNIPER, W.SHOTGUN, W.RPG, W.HMG], { nades: 3 });
    C.allyHome = [92.5, 19, 63.5, EAST];
    C.eggs({ 0: { at: [93.5, 19, 64.5], virtual: true }, 1: { at: [136.5, 19, 64.5], virtual: true } });
    // дымы горящих деревень и далёкая канонада
    C.wait(2).then(() => { for (const [x, z] of [[88, 110], [95, 114], [133, 110], [128, 114]]) { const y = C.gy(x, z); C.ignite(x, y, z, 400); C.ignite(x + 1, y, z, 400); } });
    let nb = 0;
    C.tick(() => {
      if (C.t < nb) return false;
      nb = C.t + rnd(2.5, 6);
      const me = C.g.me;
      for (let k = 0; k < 5; k++) { const x = rnd(40, 200), z = rnd(10, 118); if (Math.hypot(x - me.pos.x, z - me.pos.z) > 45) { C.fakeBoom([x, C.gy(x, z), z], 4); break; } }
      return false;
    });
  },
  stages: [
    { // ---------- крытый мост ----------
      at: [93.5, 19, 63.5, EAST],
      async run(C) {
        const g = C.g, me = g.me;
        C.stamp(['День 22 — 07:00', 'Великий фронт, река Кура', 'Сержант «Пух»', 'Отряд «Коготь»']);
        C.music.play('epic');
        C.greb = C.spawn(0, 91.5, 19, 61.5, { ...GREB, order: follow(-1, 3) });
        C.ryaba = C.spawn(0, 91.5, 19, 66.5, { ...RYABA, weapon: W.SNIPER, order: follow(1, 3) });
        for (let i = 0; i < 8; i++) C.spawn(0, 84.5 + (i % 4) * 2, C.gy(85 + (i % 4) * 2, 58 + Math.floor(i / 4) * 10), 58.5 + Math.floor(i / 4) * 10, { ...SOLDIER, respawn: true });
        const br = [[106, 19, 62], [117, 19, 65], [110, null, 54], [113, null, 74], [128, 19, 61], [129, 19, 66], [132, null, 58], [134, null, 70], [130, 19, 64]];
        for (const [x, y, z] of br) { const yy = y ?? C.gy(x, z); C.spawn(1, x + 0.5, yy, z + 0.5, { group: 'br', weapon: x === 130 ? W.HMG : pick([W.AK, W.LMG, W.RPG, W.SNIPER]), order: hold(x, yy, z, 3) }); }
        await C.say('shpora', 'Коготь, говорит Шпора. Вся армия идёт за вами. Мост — ваш.', { radio: true });
        await C.say('greb', 'Ты слышал генерала. Через мост, бегом. На мосту не стоять!');
        const o = C.obj('Перейти крытый мост', { mark: [128, 21, 63.5], max: br.length });
        await C.until(() => { o.count(br.length - cnt(C, 'br'), br.length); return me.alive && me.pos.x > 126 && cnt(C, 'br') <= 2; });
        for (const b of C.group('br')) C.kill(b);
        o.complete();
        await C.say('ryaba', 'Мы на том берегу! Дот впереди — пулемёт!');
      },
    },
    { // ---------- траншеи ----------
      at: [130.5, 19, 64.5, EAST],
      async run(C) {
        const g = C.g;
        C.goal(1, [158.5, C.gy(158, 64), 64.5]);
        const tr = [[160, 64, W.HMG], [161, 62, W.AK], [167, 50, W.AK], [168, 58, W.SNIPER], [167, 70, W.LMG], [168, 78, W.AK], [150, 60, W.SHOTGUN], [152, 70, W.AK], [145, 64, W.RPG], [167, 64, W.AK], [155, 54, W.AK]];
        for (const [x, z, wp] of tr) { const y = C.gy(x, z); C.spawn(1, x + 0.5, y, z + 0.5, { group: 'tr', weapon: wp, order: hold(x, y, z, 2) }); }
        const o = C.obj('Захватить дот и траншею', { mark: [160, C.gy(160, 64) + 3, 64.5], max: tr.length });
        C.hint('Базука (РПГ) пробивает бетон дота.', 5);
        await clearGroup(C, 'tr', o, { grace: 40, low: 2 }); o.complete();
        await C.say('greb', 'Дот наш! Ворота цитадели впереди.');
      },
    },
    { // ---------- ворота ----------
      at: [159.5, 20, 69.5, EAST],
      async run(C) {
        C.goal(1, [190.5, 20, 64.5]);
        const gt = [[183, 20, 62], [183, 20, 66], [186, 20, 58], [186, 20, 70], [181, 24, 52], [181, 24, 76], [183, 30, 44], [183, 30, 84], [190, 20, 50], [190, 20, 78], [192, 20, 64], [188, 20, 64]];
        for (const [x, y, z] of gt) C.spawn(1, x + 0.5, y, z + 0.5, { group: 'gate', weapon: pick([W.AK, W.LMG, W.RPG, W.SNIPER, W.AK]), order: hold(x, y, z, y > 21 ? 0.6 : 3) });
        await C.say('shpora', 'Ворота, Коготь. Артиллерия бьёт по стенам. За вами — весь полк.', { radio: true });
        const art = C.artillery([178, 46, 186, 82], [3, 6], 12, 'rocket');
        const o = C.obj('Прорваться через ворота', { mark: [182, 22, 64.5], max: gt.length });
        await clearGroup(C, 'gate', o, { grace: 40, low: 3 }); o.complete();
        art();
        await C.say('greb', 'Ворота наши. Гриль в цитадели. За мной.');
      },
    },
    { // ---------- цитадель ----------
      at: [186.5, 20, 64.5, EAST],
      async run(C) {
        const g = C.g, me = g.me;
        const greb = C.greb || (C.greb = C.spawn(0, 185.5, 20, 62.5, { ...GREB, order: follow(-1, 3) }));
        const ryaba = C.ryaba || (C.ryaba = C.spawn(0, 185.5, 20, 66.5, { ...RYABA, weapon: W.SNIPER, order: follow(1, 3) }));
        C.goal(1, [203.5, 20, 64.5]);
        C.music.play('epic');
        const grill = C.spawn(1, 203.5, 20, 60.5, { name: 'Ген. Гриль', hat: 'cap', capColor: 0x1f3a7a, weapon: W.HMG, hp: 700, noRegen: true, group: 'boss', tag: '#79a6ff', order: hold(203, 20, 60, 3) });
        for (const [x, z] of [[199, 58], [199, 70], [206, 58], [206, 70], [201, 64], [208, 64]]) C.spawn(1, x + 0.5, 20, z + 0.5, { group: 'elite', hp: 160, weapon: pick([W.LMG, W.SHOTGUN, W.AK]), order: hold(x, 20, z, 2) });
        let o = C.obj('Ворваться в цитадель', { mark: [196, 22, 64.5] });
        await C.until(() => me.alive && me.pos.x > 195 || grill.hp < 690);
        o.complete();
        await C.say('grill', 'Красный Гребень! Вы пришли за мной? Я — последний, кто защищает это Яйцо!');
        o = C.obj('Генерал Гриль', { mark: () => grill });
        let downed = false;
        grill.onHit = (d) => { if (grill.hp - d < 70 && !downed) { downed = true; grill.god = true; grill.ai.passive = true; grill.hp = 20; } };
        await C.until(() => { o.set(`Генерал Гриль — ${Math.max(0, Math.round((grill.hp - 20) / 680 * 100))}%`); return downed || !grill.alive; });
        o.complete();
        for (const b of C.enemies()) if (b !== grill) C.kill(b);
        C.music.play('dread');
        C.invuln = true;
        C.teleport(me, [199.5, 20, 64.5, face(199, 64, 203, 60)]);
        C.teleport(greb, [199.5, 20, 62, face(199, 62, 203, 60)]); C.order(greb, hold(199, 20, 62, 0.4));
        C.teleport(ryaba, [200.5, 20, 67, face(200, 67, 203, 60)]); C.order(ryaba, hold(200, 20, 67, 0.4));
        C.teleport(grill, [203.5, 20, 60.5, face(203, 60, 199, 64)]);
        await C.cine([
          { from: [201, 21.4, 63], to: [201.8, 21, 62.2], look: [203.5, 20.6, 60.5], dur: 6, fov: 45 },
        ], { skip: false, hold: true });
        await C.say('grill', 'Добивай... Только сначала скажи: кто, по-твоему, продал мне «Яйцо Судного дня»?');
        await C.say('greb', 'Говори.');
        await C.say('grill', 'Люди ушли и оставили бомбу. Её нашёл не я. Её нашёл... ваш генерал.');
        // входит Шпора
        const sh = C.shpora = C.spawn(0, 194.5, 20, 64.5, { name: 'Ген. Шпора', hat: 'cap', capColor: 0x7a1010, vest: BLACK, god: true, weapon: W.AK, tag: '#ff7a70', order: hold(197, 20, 64, 0.4) });
        const gds = [[194, 61], [194, 67], [193, 63], [193, 65]].map(([x, z]) => C.spawn(0, x + 0.5, 20, z + 0.5, { name: 'Гвардеец', vest: BLACK, hat: 'beanie', god: true, weapon: W.LMG, order: hold(x + 3, 20, z, 0.4), noTag: true }));
        await C.cine([{ from: [200, 22.5, 66], to: [199.5, 22, 65.5], look: [196, 21, 64.5], dur: 4, fov: 50 }], { skip: false, hold: true });
        await C.say('shpora', 'Хватит болтать, Гриль.');
        sh.yaw = face(197, 64, 203, 60); sh.pitch = -0.1;
        g.botFire(sh, W.AK, 0); grill.god = false; C.kill(grill);
        await C.wait(0.8);
        await C.say('shpora', 'Отличная работа, Коготь. Генерал Гриль мёртв. Война окончена.');
        await C.say('greb', 'Генерал? Вы здесь лично? О чём он говорил?');
        await C.say('shpora', 'Яйцо-2 уже у нас. Дальше — я сам.');
        await C.say('shpora', 'Ничего личного, Гребень. Победителей не судят. Их — помнят.');
        ryaba.god = false;
        for (const q of gds) { q.yaw = face(q.pos.x, q.pos.z, ryaba.pos.x, ryaba.pos.z); g.botFire(q, W.LMG, 0.02); }
        C.kill(ryaba);
        C.say('greb', 'РЯБА!!!', { dur: 1.2 });
        await C.wait(0.6);
        sh.yaw = face(sh.pos.x, sh.pos.z, me.pos.x, me.pos.z);
        g.botFire(sh, W.AK, 0); g.botFire(sh, W.AK, 0);
        g.shake = 1.2; g.hud.flashV = 1;
        const c0 = g.camera.position.clone();
        await C.cine([{ from: [c0.x, c0.y, c0.z], to: [c0.x + 0.3, 20.25, c0.z + 0.2], look: [197, 21.4, 64.5], lookTo: [197, 22.6, 64.5], dur: 2.2, fov: 70, roll: 0.6 }], { skip: false, noSkip: true, hold: true, hideMe: true });
        C.say('shpora', 'Сожгите здесь всё.');
        for (let i = 0; i < 10; i++) C.ignite(195 + Math.floor(Math.random() * 12), 20, 58 + Math.floor(Math.random() * 12), 120);
        await C.fade('red', 2.5);
        await C.fade('black', 1.5);
        await C.say('greb', 'Пух! ПУХ!!!', { radio: true });
        C.endCine();
      },
    },
  ],
};

// ============================ 6. РАСПЛАТА ============================
const SUNSET = { sky: 0xf09a60, zen: 0x5a4480, fog: [40, 150], hemi: 1.05, sun: 1.7, sunColor: 0xff9a50, hemiColor: 0xffc8a0, ground: 0x6a4030, tint: 0xffe2cc, smoke: 0xd8b8a0, sunGlow: 0xff8a40 };
const GUARD = { vest: BLACK, hat: 'beanie' };
const M6 = {
  title: 'Расплата', sub: 'Объект «Духовка», ракетная шахта', map: 'base', seed: 707, hero: 'Пух', keepBlack: true,
  brief: {
    meta: ['Объект «Духовка», брошенная авиабаза людей', 'День 23 — 19:40, закат', 'Сержант «Пух» · отряд «Коготь» (что от него осталось)'],
    text: [
      'Генерал Шпора предал нас. Гриль не врал: бомбу людей нашёл Шпора — и сам продал её Грилю, чтобы начать большую войну.',
      'Теперь у Шпоры «Яйцо-2». Его цель — Синий Инкубатор и последнее Золотое Яйцо бройлеров. После пуска на свете останется одна стая. Его стая. И один герой.',
      'Нас двое. Мы так не воюем.',
    ],
    view: [100, 0, 50],
  },
  setup(C) {
    C.env(SUNSET);
    C.g.me.name = 'Пух';
    C.weapons([W.AK, W.LMG, W.SNIPER, W.SHOTGUN, W.RPG], { nades: 3 });
    const S = C.g.world.info.silo;
    C.eggs({ 0: { at: [12.5, 18, 86.5], virtual: true }, 1: { at: [S.egg.x, S.egg.y, S.egg.z], hp: 1100, style: 'nuke', scale: 2.2 } });
    C.silo = S;
  },
  async intro(C) {
    C.music.play('sad');
    await C.wait(1);
    await C.say('greb', 'Пух... Пух! Живой?');
    await C.say('greb', 'Скорлупа в бронежилете. Повезло тебе, сержант. Рябе — нет.');
    await C.say('greb', 'Шпора увёз Яйцо-2 на «Духовку». Через час он запустит его по Синему Инкубатору.');
    await C.say('greb', 'Там их последнее Золотое Яйцо. И их цыплята. Вставай. Мы так не воюем.');
    const h = C.heli({ at: [-30, 40, 70], yaw: EAST });
    h.fly([[0, 26, 80], [14, 18.85, 84.5]], 9, { yaw: EAST, face: false });
    C.fade(null, 2);
    await C.cine([{ from: [24, 22, 96], to: [22, 20.5, 93], lookAt: () => [h.pos.x, h.pos.y, h.pos.z], dur: 9, fov: 55 }], { skip: true, hideMe: true });
    h.fly([[20, 30, 100], [-40, 50, 110]], 9);
    C.wait(10).then(() => h.kill());
  },
  stages: [
    { // ---------- ангары ----------
      at: [16.5, 18, 82.5, EAST],
      async run(C) {
        const g = C.g, me = g.me;
        C.stamp(['День 23 — 19:40', 'Объект «Духовка»', 'Сержант «Пух»', 'Отряд «Коготь» — двое']);
        C.music.play('action');
        C.greb = C.spawn(0, 15.5, 18, 85.5, { ...GREB, order: follow(-1, 3) });
        const ap = [[30, 62], [40, 66], [55, 60], [70, 63], [85, 61], [98, 64], [105, 58], [24, 48], [54, 46], [84, 50], [60, 52], [41, 67], [112, 56], [118, 58], [124, 54], [100, 70]];
        for (const [x, z] of ap) C.spawn(1, x + 0.5, 18, z + 0.5, { ...GUARD, group: 'ap', weapon: pick([W.AK, W.LMG, W.SHOTGUN, W.RPG, W.SNIPER]), order: hold(x, 18, z, 3) });
        C.goal(1, [114.5, 18, 54.5]);
        await C.say('greb', 'Чёрная гвардия Шпоры. Лучшие из нас. Были.');
        C.say('shpora', 'Гребень. Я знал, что ты придёшь. Ты всегда был сентиментален.', { radio: true });
        const o = C.obj('Пробиться к вышке управления', { mark: [114.5, 21, 52.5], max: ap.length });
        C.hint('Цистерны и ящики с ТНТ взрываются от выстрела.', 5);
        await C.until(() => { o.count(ap.length - cnt(C, 'ap'), ap.length); return C.near([114.5, 18, 53.5], 5) && cnt(C, 'ap') <= 4; });
        for (const b of C.group('ap')) C.kill(b);
        o.complete();
      },
    },
    { // ---------- вышка ----------
      at: [114.5, 18, 54.5, NORTH],
      async run(C) {
        const g = C.g, me = g.me;
        const greb = C.greb || (C.greb = C.spawn(0, 116.5, 18, 55.5, { ...GREB, order: follow(-1, 3) }));
        for (const [x, y, z] of [[117, 21, 48], [113, 24, 49], [117, 27, 44], [116, 30, 49], [113, 33, 48], [116, 36, 49], [118, 36, 44]]) C.spawn(1, x + 0.5, y, z + 0.5, { ...GUARD, group: 'tw', weapon: pick([W.SHOTGUN, W.AK]), order: hold(x, y, z, 1.5) });
        const o = C.obj('Подняться в зал управления', { mark: [115.5, 38, 47.5] });
        await C.until(() => me.alive && me.pos.y > 35.5 && me.pos.x > 108 && me.pos.x < 121);
        o.complete();
        for (const b of C.group('tw')) C.kill(b);
        await C.cine([{ from: [117.5, 37.6, 50.5], to: [116.5, 37.4, 49.5], look: [115.5, 37, 47.5], dur: 4, fov: 50 }], { skip: true });
        await C.say('shpora', 'Поздно. Отсчёт пошёл. Три минуты — и Синего Инкубатора больше нет.', { radio: true });
        await C.say('greb', 'Пульт мёртвый, он запустил его из шахты. Боеголовку надо разбить руками. Вниз, в бункер!');
        void greb;
      },
    },
    { // ---------- шахта ----------
      at: [116.5, 36, 48.5, EAST],
      async run(C) {
        const g = C.g, me = g.me, S = C.silo;
        C.music.play('epic');
        const siren = C.sfx.loop('siren'); if (siren) siren.set(0.08);
        if (!C.greb) C.greb = C.spawn(0, 115.5, 36, 49.5, { ...GREB, order: follow(-1, 3) });
        const T = C.timer(180, 'До пуска', () => C.fail('Ракета взлетела. Синего Инкубатора больше нет.'));
        for (const [x, y, z] of [[121, 18, 38], [120, 18, 33], [132, 6, 27], [137, 6, 26], [141, 6, 30], [147, 6, 24], [147, 6, 30], [118, 18, 30]]) C.spawn(1, x + 0.5, y, z + 0.5, { ...GUARD, group: 'si', weapon: pick([W.AK, W.SHOTGUN, W.LMG]), order: hold(x, y, z, 2) });
        let o = C.obj('Спуститься в бункер', { mark: [123.5, 20, 37.5] });
        await C.until(() => me.alive && (me.pos.y < 12 || C.near([124.5, 18, 37.5], 3)));
        o.at([127.5, 8, 28.5]);
        await C.until(() => me.alive && me.pos.y < 12);
        o.complete();
        o = C.obj('Уничтожить боеголовку «Яйцо-2»', { mark: () => [S.egg.x, S.egg.y + 3.4, S.egg.z] });
        C.hint('Базука разобьёт боеголовку быстрее. Цель — над мостками шахты.', 6);
        const egg = g.eggs[1];
        let lastP = 100;
        await C.until(() => {
          const p = Math.ceil(egg.hp / egg.max * 100);
          if (p !== lastP) { lastP = p; o.set(`Уничтожить боеголовку «Яйцо-2» — ${p}%`); }
          return egg.hp <= 0;
        });
        T.stop(); o.complete();
        if (siren) siren.stop();
        for (const b of C.group('si')) C.kill(b);
        await C.say('greb', 'Боеголовка разбита. Пуска не будет.');
        await C.say('shpora', 'Гребень! Ты не понимаешь, что наделал! Я дал бы им мир!', { radio: true });
        await C.say('greb', 'Он бежит к вертолёту на полосе! Пух — не дай ему уйти!');
      },
    },
    { // ---------- Шпора ----------
      at: [141.5, 6, 25.5, WEST],
      async run(C) {
        const g = C.g, me = g.me;
        C.music.play('epic');
        const greb = C.greb || (C.greb = C.spawn(0, 141.5, 6, 23.5, { ...GREB, order: follow(-1, 3) }));
        const hh = C.heli({ at: [146, 18.85, 87], yaw: NORTH, color: 0x1c1c20 }); hh.rotorV = 0.3;
        const sh = C.spawn(1, 124.5, 18, 62.5, { name: 'Ген. Шпора', hat: 'cap', capColor: 0x7a1010, vest: BLACK, weapon: W.AK, hp: 450, noRegen: true, tag: '#ff7a70', order: { type: 'goto', x: 146, y: 18, z: 83, r: 1.5 } });
        for (const [x, z] of [[122, 60], [126, 64], [123, 66], [127, 59]]) C.spawn(1, x + 0.5, 18, z + 0.5, { ...GUARD, weapon: pick([W.LMG, W.AK]), order: { type: 'goto', x: 140 + Math.random() * 8, y: 18, z: 78 + Math.random() * 6, r: 3 } });
        let downed = false;
        sh.onHit = (d) => { if (sh.hp - d < 50 && !downed) { downed = true; sh.god = true; sh.ai.passive = true; sh.hp = 20; } };
        const T = C.timer(80, 'Вертолёт Шпоры взлетает', () => C.fail('Шпора улетел. Он вернётся — с новой войной.'));
        const o = C.obj('Остановить генерала Шпору', { mark: () => sh });
        const spin = C.tick(() => { hh.rotorV = Math.min(1, 0.3 + (80 - T.left) / 60); });
        await C.until(() => { o.set(`Остановить генерала Шпору — ${Math.max(0, Math.round((sh.hp - 20) / 430 * 100))}%`); return downed; });
        T.stop(); spin(); o.complete();
        for (const b of C.enemies()) if (b !== sh) C.kill(b);
        C.invuln = true;
        C.music.play('sad');
        const px = sh.pos.x, pz = sh.pos.z;
        C.teleport(me, [px - 3.5, sh.pos.y, pz + 0.5, face(px - 3.5, pz + 0.5, px, pz)]);
        C.teleport(greb, [px - 2, sh.pos.y, pz - 2.5, face(px - 2, pz - 2.5, px, pz)]); C.order(greb, hold(Math.floor(px - 2), sh.pos.y, Math.floor(pz - 2.5), 0.3));
        await C.cine([{ from: [px - 4.5, sh.pos.y + 1.6, pz + 2.5], to: [px - 4, sh.pos.y + 1.4, pz + 2], look: [px, sh.pos.y + 0.8, pz], dur: 7, fov: 45 }], { skip: false, hold: true });
        await C.say('shpora', 'Ты... не понимаешь... Одна стая. Одно Яйцо. И никакой войны. Никогда.');
        await C.say('greb', 'Ты дал бы им одно Яйцо и одного героя. Себя.');
        await C.say('shpora', 'Победителей... не судят...');
        await C.say('greb', 'Ты не победитель.');
        greb.yaw = face(greb.pos.x, greb.pos.z, px, pz); greb.pitch = -0.35;
        sh.god = false; g.botFire(greb, W.AK, 0); C.kill(sh);
        hh.rotorV = 0.1;
        await C.wait(1.5);
        await C.cine([{ from: [px - 6, sh.pos.y + 4, pz + 6], to: [px - 14, sh.pos.y + 9, pz + 14], look: [px - 2, sh.pos.y + 1, pz], dur: 7, fov: 55 }], { skip: false, hold: true });
        await C.say('greb', 'Всё кончено, Пух.');
        await C.say('greb', 'Пойдём домой. Нас ждут цыплята. И красные, и синие.');
        await C.fade('black', 2.5);
        C.music.play('victory');
        await C.epitaph(['Война закончилась через неделю.', 'Стаи разделили поля, а Золотые Яйца — охраняют вместе.', '', '~Капитан Гребень ушёл в отставку и разводит подсолнухи.', '~Сержант Пух командует отрядом «Коготь». Отряд никого не ощипал уже год.', '', 'В ту весну из двух Золотых Яиц вылупились цыплята.', '#КРАСНЫЕ И СИНИЕ'], 4);
        C.endCine();
      },
    },
  ],
};

export const MISSIONS = [M0, M1, M2, M3, M4, M5, M6];
