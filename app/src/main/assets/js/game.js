'use strict';
/* ===== state ===== */
const SAVE_KEY = 'cindermarch_v1';
const LEVEL_CAP = 80;
const PLAYER_R = 11;
let S = null;   // saved state
let P = null;   // computed stats
let G = null;   // runtime state of the current zone
const VIEW = { w: 420, h: 800 };   // logical view size, set by render.js
const input = { x: 0, y: 0 };
let statsDirty = false;
const UI = { toast() {}, onLevel() {}, onDeath() {}, onZone() {}, onLoot() {} };   // filled in by ui.js

function save() {
  if (!S) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable */ }
}
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    if (!d || d.v !== 1 || !d.slots || !d.tree) return false;
    S = d;
    S.opts = S.opts || { autoSell: 0 };
    S.stats = S.stats || { kills: 0, deaths: 0 };
    S.shop = S.shop || [];
    return true;
  } catch (e) { return false; }
}
function newGame(starter) {
  S = { v: 1, level: 1, xp: 0, gold: 0, inv: [], equip: {}, gems: [],
    slots: [0, 1, 2, 3].map(() => ({ skill: null, sup: [null, null, null] })),
    tree: ['start'], zone: 1, maxZone: 1, shop: [], opts: { autoSell: 0 }, stats: { kills: 0, deaths: 0 } };
  const g = makeGem(starter);
  S.gems.push(g); S.slots[0].skill = g.uid;
  S.equip.weapon = makeItem(1, { slot: 'weapon', rarity: 0, wtype: SKILLS[starter].tags.includes('spell') ? 'wand' : 'sword' });
  rollShop();
  computeStats();
  startZone(1);
  save();
}

/* ===== character stats ===== */
const gemById = id => id ? S.gems.find(g => g.uid === id) : null;
const slotUnlocked = i => S.level >= SLOT_UNLOCK[i];
const supportSockets = () => Math.min(3, 1 + Math.floor(S.level / 8));
const passivePoints = () => S.level - 1 - (S.tree.length - 1);
function gemSocketed(id) {
  for (let i = 0; i < 4; i++) { const s = S.slots[i]; if (s.skill === id) return { slot: i, sup: -1 }; const j = s.sup.indexOf(id); if (j >= 0) return { slot: i, sup: j }; }
  return null;
}
function computeStats() {
  const st = {};
  const add = src => { for (const k in src) st[k] = (st[k] || 0) + src[k]; };
  for (const sl of EQUIP_SLOTS) if (S.equip[sl]) add(itemStats(S.equip[sl]));
  for (const id of S.tree) { const n = TREE.nodes[id]; if (n) add(n.stats); }
  const g = k => st[k] || 0;
  const p = { raw: st };
  p.maxLife = Math.max(10, Math.round((80 + 10 * (S.level - 1) + g('life')) * (1 + g('lifePct') / 100)));
  p.regen = g('regen') + p.maxLife * (0.6 + g('regenPct')) / 100;
  p.armour = Math.max(0, Math.round(g('armour') * (1 + g('armourPct') / 100)));
  p.dodge = clamp(g('dodge'), 0, 60);
  p.speed = 130 * Math.max(0.4, 1 + g('moveSpeed') / 100);
  p.res = { fire: Math.min(75, g('resFire') + g('resAll')), cold: Math.min(75, g('resCold') + g('resAll')), light: Math.min(75, g('resLight') + g('resAll')) };
  p.crit = 5 + g('crit'); p.critMulti = 150 + g('critMulti');
  p.skillSpeed = Math.max(0.3, 1 + g('atkSpeed') / 100);
  p.area = Math.max(0.3, 1 + g('areaPct') / 100);
  p.leech = g('leech'); p.lifeOnKill = g('lifeOnKill');
  p.rarity = 1 + g('rarityPct') / 100; p.gold = 1 + g('goldPct') / 100; p.pickup = 46;
  const w = S.equip.weapon, wm = 1 + g('wPct') / 100;
  p.wMin = w ? w.wMin * wm : 1; p.wMax = w ? w.wMax * wm : 3;
  P = p;
  p.skills = [0, 1, 2, 3].map(skillInfo);
  if (G && G.player) G.player.life = Math.min(G.player.life, p.maxLife);
  statsDirty = false;
}
function skillInfo(i) {
  const sl = S.slots[i];
  if (!slotUnlocked(i) || !sl.skill) return null;
  const gem = gemById(sl.skill); if (!gem) return null;
  const d = SKILLS[gem.id], l = gem.lvl, st = P.raw, g = k => st[k] || 0;
  let more = 1 + g('moreDmg') / 100, cdm = 1, area = P.area, proj = 0, pierce = d.pierce || 0, chain = d.chain || 0;
  let crit = P.crit, cm = P.critMulti, leech = P.leech, ignite = 0, echo = 0;
  const sups = [], n = supportSockets();
  for (let j = 0; j < n; j++) {
    const sg = gemById(sl.sup[j]); if (!sg) continue;
    const sd = SUPPORTS[sg.id]; if (!sd || !supportFits(sd, d)) continue;
    sups.push(sd);
    const bonus = 0.008 * (sg.lvl - 1);
    if (sd.more) more *= sd.more + bonus; else more *= 1 + bonus;
    if (sd.cd) cdm *= sd.cd;
    if (sd.area) area *= sd.area;
    if (sd.proj) proj += sd.proj;
    if (sd.pierce) pierce += sd.pierce;
    if (sd.chain) chain += sd.chain;
    if (sd.crit) crit += sd.crit;
    if (sd.critMulti) cm += sd.critMulti;
    if (sd.leech) leech += sd.leech;
    if (sd.ignite) ignite += sd.ignite;
    if (sd.echo) echo = 1;
  }
  const isAtk = d.tags.includes('attack');
  if (isAtk) more *= 1 + g('moreAtk') / 100;
  const dmg = { phys: 0, fire: 0, cold: 0, light: 0 };
  const eff = isAtk ? d.eff * (1 + 0.035 * (l - 1)) : d.eff;
  if (isAtk) dmg.phys += (P.wMin + P.wMax) / 2 * eff; else dmg[d.el] += d.base * (1 + 0.32 * (l - 1));
  dmg.phys += g('addPhys') * eff; dmg.fire += g('addFire') * eff; dmg.cold += g('addCold') * eff; dmg.light += g('addLight') * eff;
  const incG = g('dmgPct') + (isAtk ? g('attackPct') : g('spellPct'));
  const inc = { phys: g('physPct'), fire: g('firePct') + g('elePct'), cold: g('coldPct') + g('elePct'), light: g('lightPct') + g('elePct') };
  let avg = 0;
  for (const t in dmg) { dmg[t] *= Math.max(0.1, 1 + (incG + inc[t]) / 100) * more * (t === 'fire' ? 1 + g('moreFire') / 100 : 1); avg += dmg[t]; }
  const cd = Math.max(0.12, d.cd * cdm / P.skillSpeed);
  crit = clamp(crit, 0, 100);
  let dps = avg * (1 + crit / 100 * (cm / 100 - 1)) / cd * (1 + ignite) * (echo ? 2 : 1);
  if (d.kind === 'bolt') dps *= 1 + proj * 0.5;
  return { i, def: d, gem, cd, dmg, avg, crit, critMulti: cm, area, proj, pierce, chain, leech, ignite, echo, sups, dps };
}
function rollShop() {
  S.shop = [];
  const owned = new Set(S.gems.map(g => g.id));
  for (let i = 0; i < 3; i++) {
    let g = randomGem(i === 0 ? 0.25 : 0.7), tries = 0;
    while ((owned.has(g.id) || S.shop.some(o => o.gem.id === g.id)) && tries++ < 8) g = randomGem(i === 0 ? 0.25 : 0.7);
    S.shop.push({ gem: g, price: Math.round((g.sup ? 90 : 140) * (1 + 0.35 * (S.maxZone - 1))) });
  }
}

/* ===== zone / runtime ===== */
function startZone(z) {
  S.zone = z;
  G = { zi: zoneInfo(z), t: 0, player: { x: 0, y: 0, life: P.maxLife, face: -Math.PI / 2, walk: 0, flash: 0, blink: 0, castT: -9 },
    mobs: [], projs: [], eprojs: [], fx: [], drops: [], texts: [], delayed: [],
    kills: 0, quota: zoneQuota(z), boss: null, bossDead: false, portal: null, spawnT: 0.6, cds: [0, 0, 0, 0], shake: 0, dead: false };
  UI.onZone();
}
function spawnMob(type, x, y, rar, boss) {
  const d = MOBS[type], L = G.zi.level;
  const m = { type, x, y, r: d.r, spd: d.spd * rnd(0.9, 1.1), hp: mobHp(L) * d.hp, dmg: mobDmg(L) * d.dmg, xp: mobXp(L) * d.xp, rar: rar || 0,
    color: d.color, atkT: rnd(0.4, 1.1), chill: 0, burn: 0, burnT: 0, flash: 0, orbT: 0, mods: [], wob: rnd(0, 6.28), ranged: !!d.ranged, name: d.name, dead: false, lunge: 0 };
  const mk = Object.keys(MOB_MODS);
  if (rar === 1) { m.hp *= 2.2; m.xp *= 2.5; m.mods = [pick(mk)]; }
  if (rar === 2) { m.hp *= 5; m.xp *= 6; m.r *= 1.25; m.dmg *= 1.2; const a = pick(mk); m.mods = [a, pick(mk.filter(k => k !== a))]; }
  for (const mod of m.mods) { if (mod === 'fast') m.spd *= 1.35; if (mod === 'tough') m.hp *= 1.6; if (mod === 'deadly') m.dmg *= 1.4; }
  if (rar) m.name = m.mods.map(k => MOB_MODS[k]).join(' ') + ' ' + d.name;
  if (boss) { m.boss = true; m.name = G.zi.boss; m.hp = mobHp(L) * (14 + 4 * Math.min(L, 19)); m.dmg = mobDmg(L) * 2; m.r = 30; m.spd = 64; m.xp = mobXp(L) * 30; m.rar = 3; m.novaT = 4; m.sumT = 7; m.mods = []; }
  m.maxHp = m.hp;
  G.mobs.push(m);
  return m;
}
function edgePoint() {
  const vw = VIEW.w / 2 + 40, vh = VIEW.h / 2 + 40, a = rnd(0, Math.PI * 2);
  const c = Math.cos(a), s = Math.sin(a);
  const k = Math.min(vw / Math.max(1e-6, Math.abs(c)), vh / Math.max(1e-6, Math.abs(s)));
  return { x: G.player.x + c * k, y: G.player.y + s * k };
}
function spawnPack() {
  const p = edgePoint(), z = G.zi.level;
  let r = Math.random(), type = r < 0.48 ? 'ghoul' : r < 0.7 ? 'swarm' : r < 0.86 ? 'caster' : 'brute';
  if (z < 2 && (type === 'caster' || type === 'brute')) type = 'ghoul';
  const n = type === 'swarm' ? rndi(4, 6) : type === 'brute' ? 1 : rndi(2, 3);
  const rr = Math.random(), packMagic = rr < 0.12, hasRare = rr > 0.95 - Math.min(0.05, z * 0.004);
  for (let i = 0; i < n; i++) spawnMob(type, p.x + rnd(-28, 28), p.y + rnd(-28, 28), hasRare && i === 0 ? 2 : packMagic ? 1 : 0);
}
function spawnBoss() {
  const p = edgePoint();
  G.boss = spawnMob('brute', p.x, p.y, 0, true);
  UI.toast(G.zi.boss + ' approaches!', '#ff7a5c');
}

/* ===== combat ===== */
function addText(x, y, txt, color, big) { if (G.texts.length < 60) G.texts.push({ x: x + rnd(-6, 6), y, txt, color, big, t: 0 }); }
function addFx(o) { if (G.fx.length < 120) { o.t = 0; G.fx.push(o); } }
function heal(v) { const pl = G.player; pl.life = Math.min(P.maxLife, pl.life + v); }
function nearestMob(x, y, range, exclude) {
  let best = null, bd = range * range;
  for (const m of G.mobs) {
    if (m.dead || (exclude && exclude.includes(m))) continue;
    const d = dist2(x, y, m.x, m.y) - m.r * m.r;
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}
function mobsInRange(x, y, r) { const out = []; for (const m of G.mobs) if (!m.dead && dist2(x, y, m.x, m.y) < (r + m.r) * (r + m.r)) out.push(m); return out; }
function hitMob(m, info, mult) {
  if (m.dead) return;
  const d = info.dmg;
  let total = d.phys * rnd(0.8, 1.2) + d.fire * rnd(0.8, 1.2) + d.cold * rnd(0.8, 1.2) + d.light * rnd(0.45, 1.55);
  total *= mult || 1;
  const crit = Math.random() * 100 < info.crit;
  if (crit) total *= info.critMulti / 100;
  if (m.chill > 0 && P.raw.chillBonus) total *= 1 + P.raw.chillBonus / 100;
  if (d.cold > 0) m.chill = 2;
  if (info.ignite) { m.burn = Math.max(m.burn, total * info.ignite / 3); m.burnT = 3; }
  if (info.leech) heal(total * info.leech / 100);
  damageMob(m, total, crit);
}
function damageMob(m, amt, crit, quiet) {
  if (m.dead) return;
  m.hp -= amt; m.flash = 0.1;
  if (!quiet) addText(m.x, m.y - m.r, String(Math.max(1, Math.round(amt))), crit ? '#ffd84a' : '#ffffff', crit);
  if (m.hp <= 0) killMob(m);
}
function gainXp(x) {
  if (S.level < LEVEL_CAP) {
    S.xp += x;
    while (S.level < LEVEL_CAP && S.xp >= xpNext(S.level)) {
      S.xp -= xpNext(S.level); S.level++;
      statsDirty = true;
      computeStats(); G.player.life = P.maxLife;
      addFx({ k: 'ring', x: G.player.x, y: G.player.y, r: 120, d: 0.7, color: '#ffe9a0', follow: true });
      UI.onLevel();
    }
  }
  for (const s of S.slots) for (const id of [s.skill, s.sup[0], s.sup[1], s.sup[2]]) {
    const g = gemById(id); if (!g || g.lvl >= GEM_MAX) continue;
    g.xp += x;
    while (g.lvl < GEM_MAX && g.xp >= gemXpNext(g.lvl)) { g.xp -= gemXpNext(g.lvl); g.lvl++; statsDirty = true; UI.toast(gemDef(g).name + ' reached level ' + g.lvl, '#58d8c8'); }
  }
}
function dropAt(x, y, o) { o.x = x + rnd(-14, 14); o.y = y + rnd(-14, 14); o.t = 0; G.drops.push(o); }
function killMob(m) {
  m.dead = true; G.kills++; S.stats.kills++;
  const L = G.zi.level, diff = S.level - L;
  gainXp(m.xp * (diff > 4 ? Math.max(0.1, 1 - (diff - 4) * 0.15) : 1));
  if (P.lifeOnKill) heal(P.lifeOnKill);
  addFx({ k: 'burst', x: m.x, y: m.y, r: m.r * 2.2, d: 0.35, color: m.color });
  const ri = m.boss ? 3 : m.rar;
  if (Math.random() < [0.3, 0.7, 1, 1][ri]) dropAt(m.x, m.y, { gold: Math.max(1, Math.round((3 + L * 1.6) * rnd(0.6, 1.4) * [1, 2, 4, 12][ri] * P.gold)) });
  let n = m.boss ? 4 : (Math.random() < [0.1, 0.38, 1][m.rar] ? 1 : 0) + (m.rar === 2 && Math.random() < 0.5 ? 1 : 0);
  for (let i = 0; i < n; i++) dropAt(m.x, m.y, { item: makeItem(L + (m.boss ? 1 : 0), { rarityMult: P.rarity * [1, 1.5, 2.5, 4][ri], rarity: m.boss && i === 0 ? 2 : undefined }) });
  if (Math.random() < [0.004, 0.02, 0.08, 0.6][ri]) dropAt(m.x, m.y, { gem: randomGem() });
  if (m.boss) {
    G.bossDead = true; G.boss = null; G.portal = { x: m.x, y: m.y };
    for (const o of G.mobs) if (!o.dead && o !== m) { o.dead = true; addFx({ k: 'burst', x: o.x, y: o.y, r: o.r * 2, d: 0.3, color: o.color }); }
    G.eprojs.length = 0;
    if (S.zone >= S.maxZone) { S.maxZone = S.zone + 1; rollShop(); }
    UI.toast(G.zi.name + ' cleared — enter the portal', '#9fe6ff');
    save();
  }
}
function damagePlayer(amt, type) {
  const pl = G.player;
  if (G.dead || pl.blink > 0) return;
  if (Math.random() * 100 < P.dodge) { addText(pl.x, pl.y - 18, 'Dodge', '#9fe6a0'); return; }
  if (type === 'phys') amt *= 1 - Math.min(0.8, P.armour / (P.armour + 8 * amt));
  else amt *= 1 - (P.res[type] || 0) / 100;
  pl.life -= amt; pl.flash = 0.15; G.shake = Math.min(8, G.shake + 3 + amt / P.maxLife * 20);
  addText(pl.x, pl.y - 18, String(Math.max(1, Math.round(amt))), '#ff6a5c');
  if (pl.life <= 0) { pl.life = 0; G.dead = true; S.stats.deaths++; input.x = input.y = 0; UI.onDeath(); }
}
function resurrect() { startZone(S.zone); }

/* ===== skills ===== */
function castSkill(info, isEcho) {
  const pl = G.player, d = info.def, sa = Math.sqrt(info.area);
  switch (d.kind) {
    case 'arc': {
      const R = d.range * sa, t = nearestMob(pl.x, pl.y, R); if (!t) return false;
      const ang = Math.atan2(t.y - pl.y, t.x - pl.x); pl.face = ang;
      for (const m of mobsInRange(pl.x, pl.y, R)) {
        let da = Math.abs(Math.atan2(m.y - pl.y, m.x - pl.x) - ang); if (da > Math.PI) da = Math.PI * 2 - da;
        if (da < 1.25 || dist2(pl.x, pl.y, m.x, m.y) < (m.r + 16) * (m.r + 16)) hitMob(m, info);
      }
      addFx({ k: 'arc', x: pl.x, y: pl.y, r: R, a: ang, d: 0.18, color: d.color, follow: true });
      return true;
    }
    case 'bolt': case 'lance': {
      const t = nearestMob(pl.x, pl.y, d.range); if (!t) return false;
      const ang = Math.atan2(t.y - pl.y, t.x - pl.x); pl.face = ang;
      const n = 1 + info.proj, spd = d.kind === 'lance' ? 420 : 300;
      for (let i = 0; i < n; i++) {
        const a = ang + (i - (n - 1) / 2) * 0.2;
        G.projs.push({ x: pl.x, y: pl.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: d.kind === 'lance' ? 5 : 6, life: 1.3, info, pierce: info.pierce, chain: info.chain, hit: [], color: d.color, kind: d.kind });
      }
      return true;
    }
    case 'nova': {
      const R = d.range * sa; if (!nearestMob(pl.x, pl.y, R)) return false;
      for (const m of mobsInRange(pl.x, pl.y, R)) hitMob(m, info);
      addFx({ k: 'ring', x: pl.x, y: pl.y, r: R, d: 0.3, color: d.color, fill: true });
      return true;
    }
    case 'chain': {
      let t = nearestMob(pl.x, pl.y, d.range); if (!t) return false;
      pl.face = Math.atan2(t.y - pl.y, t.x - pl.x);
      const hit = [], pts = [{ x: pl.x, y: pl.y }];
      for (let i = 0; i <= info.chain && t; i++) { hit.push(t); pts.push({ x: t.x, y: t.y }); hitMob(t, info); t = nearestMob(t.x, t.y, 150, hit); }
      addFx({ k: 'bolt', pts, d: 0.16, color: d.color });
      return true;
    }
    case 'blink': {
      const c = mobsInRange(pl.x, pl.y, d.range); if (!c.length) return false;
      const t = pick(c), ang = Math.atan2(t.y - pl.y, t.x - pl.x), ox = pl.x, oy = pl.y;
      pl.x = t.x - Math.cos(ang) * (t.r + PLAYER_R + 2); pl.y = t.y - Math.sin(ang) * (t.r + PLAYER_R + 2); pl.face = ang; pl.blink = 0.12;
      const R = 46 * sa;
      for (const m of mobsInRange(pl.x, pl.y, R)) hitMob(m, info, m === t ? 1 : 0.6);
      addFx({ k: 'trail', x: ox, y: oy, x2: pl.x, y2: pl.y, d: 0.22, color: d.color });
      addFx({ k: 'ring', x: pl.x, y: pl.y, r: R, d: 0.2, color: d.color, fill: true });
      return true;
    }
    case 'meteor': {
      const c = mobsInRange(pl.x, pl.y, d.range); if (!c.length) return false;
      const t = pick(c), x = t.x, y = t.y, R = 72 * sa;
      addFx({ k: 'warn', x, y, r: R, d: 0.7, color: d.color });
      G.delayed.push({ t: 0.7, fn() { for (const m of mobsInRange(x, y, R)) hitMob(m, info); addFx({ k: 'ring', x, y, r: R * 1.15, d: 0.35, color: '#ffb060', fill: true }); G.shake = Math.min(8, G.shake + 2.5); } });
      return true;
    }
  }
  return false;
}
function orbitBlades(info) {
  const n = info.def.blades + info.proj, R = info.def.range * Math.sqrt(info.area), out = [];
  for (let k = 0; k < n; k++) { const a = G.t * 3.4 + k * Math.PI * 2 / n; out.push({ x: G.player.x + Math.cos(a) * R, y: G.player.y + Math.sin(a) * R, a }); }
  return out;
}
function updateOrbit(info) {
  const bl = orbitBlades(info);
  for (const m of G.mobs) {
    if (m.dead || G.t < m.orbT) continue;
    for (const b of bl) if (dist2(b.x, b.y, m.x, m.y) < (m.r + 13) * (m.r + 13)) { hitMob(m, info); m.orbT = G.t + info.cd; break; }
  }
}

/* ===== main update ===== */
function update(dt) {
  if (!G || G.dead) return;
  const pl = G.player;
  G.t += dt;
  let ix = input.x, iy = input.y; const il = Math.hypot(ix, iy);
  if (il > 1) { ix /= il; iy /= il; }
  pl.x += ix * P.speed * dt; pl.y += iy * P.speed * dt;
  if (il > 0.1) { pl.walk += dt * Math.min(1, il); if (G.t - pl.castT > 0.45) pl.face = Math.atan2(iy, ix); }
  pl.life = Math.min(P.maxLife, pl.life + P.regen * dt);
  if (pl.flash > 0) pl.flash -= dt;
  if (pl.blink > 0) pl.blink -= dt;
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 22);

  // skills fire on their own as soon as they are ready and have a target
  for (let i = 0; i < 4; i++) {
    const info = P.skills[i]; if (!info) continue;
    if (info.def.kind === 'orbit') { updateOrbit(info); continue; }
    G.cds[i] -= dt;
    if (G.cds[i] <= 0) {
      if (castSkill(info, false)) { G.cds[i] = info.cd; pl.castT = G.t; if (info.echo) G.delayed.push({ t: 0.22, fn() { castSkill(info, true); } }); }
      else G.cds[i] = 0.06;
    }
  }
  for (let i = G.delayed.length - 1; i >= 0; i--) { const d = G.delayed[i]; d.t -= dt; if (d.t <= 0) { G.delayed.splice(i, 1); d.fn(); } }

  // player projectiles
  for (let i = G.projs.length - 1; i >= 0; i--) {
    const p = G.projs[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    let gone = p.life <= 0;
    if (!gone) for (const m of G.mobs) {
      if (m.dead || p.hit.includes(m) || dist2(p.x, p.y, m.x, m.y) > (m.r + p.r) * (m.r + p.r)) continue;
      p.hit.push(m); hitMob(m, p.info);
      addFx({ k: 'burst', x: p.x, y: p.y, r: 12, d: 0.15, color: p.color });
      if (p.chain > 0) {
        const t = nearestMob(p.x, p.y, 190, p.hit);
        if (t) { const sp = Math.hypot(p.vx, p.vy), a = Math.atan2(t.y - p.y, t.x - p.x); p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp; p.chain--; p.life = Math.max(p.life, 0.7); break; }
      }
      if (p.pierce > 0) { p.pierce--; continue; }
      gone = true; break;
    }
    if (gone) G.projs.splice(i, 1);
  }
  // enemy projectiles
  for (let i = G.eprojs.length - 1; i >= 0; i--) {
    const p = G.eprojs[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    if (p.life <= 0) { G.eprojs.splice(i, 1); continue; }
    if (dist2(p.x, p.y, pl.x, pl.y) < (PLAYER_R + p.r) * (PLAYER_R + p.r)) { damagePlayer(p.dmg, p.el); G.eprojs.splice(i, 1); if (G.dead) return; }
  }

  // monsters
  const EL_COLOR = { fire: '#ff7a3c', cold: '#8fd8ff', light: '#f7f08a', phys: '#c9b8a0' };
  for (const m of G.mobs) {
    if (m.dead) continue;
    if (m.flash > 0) m.flash -= dt;
    if (m.lunge > 0) m.lunge -= dt;
    if (m.chill > 0) m.chill -= dt;
    if (m.burnT > 0) { m.burnT -= dt; damageMob(m, m.burn * dt, false, true); if (m.dead) continue; if (m.burnT <= 0) m.burn = 0; }
    const slow = m.chill > 0 ? 0.65 : 1;
    const dx = pl.x - m.x, dy = pl.y - m.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    m.atkT -= dt * slow; m.wob += dt * 6;
    if (d > 1400) { const p = edgePoint(); m.x = p.x; m.y = p.y; continue; }   // left far behind: re-enter from the edge
    if (m.ranged) {
      let mv = 0, sx = 0, sy = 0;
      if (d > 200) mv = 1; else if (d < 130) mv = -0.8; else { sx = -uy * 0.5; sy = ux * 0.5; }
      m.x += (ux * mv + sx) * m.spd * slow * dt; m.y += (uy * mv + sy) * m.spd * slow * dt;
      if (m.atkT <= 0 && d < 320) {
        m.atkT = 2.3; const el = G.zi.el;
        G.eprojs.push({ x: m.x, y: m.y, vx: ux * 150, vy: uy * 150, r: 5, life: 3.5, dmg: m.dmg, el, color: EL_COLOR[el] });
      }
    } else {
      const reach = m.r + PLAYER_R + 4;
      if (d > reach - 2) { m.x += ux * m.spd * slow * dt; m.y += uy * m.spd * slow * dt; }
      if (d < reach + 4 && m.atkT <= 0) { m.atkT = m.boss ? 1.3 : 1.15; m.lunge = 0.18; damagePlayer(m.dmg, 'phys'); if (G.dead) return; }
    }
    if (m.boss) {
      m.novaT -= dt; m.sumT -= dt;
      if (m.novaT <= 0) {
        m.novaT = 4.5; const el = G.zi.el, n = 12, off = rnd(0, 1);
        for (let k = 0; k < n; k++) { const a = off + k * Math.PI * 2 / n; G.eprojs.push({ x: m.x, y: m.y, vx: Math.cos(a) * 135, vy: Math.sin(a) * 135, r: 6, life: 3.2, dmg: m.dmg * 0.55, el, color: EL_COLOR[el] }); }
        addFx({ k: 'ring', x: m.x, y: m.y, r: 60, d: 0.3, color: EL_COLOR[el] });
      }
      if (m.sumT <= 0) { m.sumT = 9; for (let k = 0; k < 4; k++) spawnMob('swarm', m.x + rnd(-40, 40), m.y + rnd(-40, 40), 0); }
    }
  }
  // keep monsters from stacking on top of each other
  const mobs = G.mobs;
  for (let i = 0; i < mobs.length; i++) {
    const a = mobs[i]; if (a.dead) continue;
    for (let j = i + 1; j < mobs.length; j++) {
      const b = mobs[j]; if (b.dead) continue;
      const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 === 0) continue;
      const d = Math.sqrt(d2), push = (rr - d) / 2, nx = dx / d, ny = dy / d;
      const wa = a.boss ? 0 : b.boss ? 2 : 1, wb = b.boss ? 0 : a.boss ? 2 : 1;
      a.x -= nx * push * wa; a.y -= ny * push * wa; b.x += nx * push * wb; b.y += ny * push * wb;
    }
  }
  if (mobs.some(m => m.dead)) G.mobs = mobs.filter(m => !m.dead);

  // spawning
  if (!G.bossDead) {
    if (!G.boss && G.kills >= G.quota) spawnBoss();
    G.spawnT -= dt;
    const cap = Math.min(42, 8 + G.zi.level * 2) * (G.boss ? 0.35 : 1);
    if (G.spawnT <= 0) { G.spawnT = G.boss ? 2.5 : 0.9; if (G.mobs.length < cap) spawnPack(); }
  }

  // loot
  for (let i = G.drops.length - 1; i >= 0; i--) {
    const d = G.drops[i]; d.t += dt;
    const dd = Math.sqrt(dist2(d.x, d.y, pl.x, pl.y));
    if (d.gold) {
      if (dd < 130 && d.t > 0.25) { const sp = 320 * dt / Math.max(dd, 1); d.x += (pl.x - d.x) * Math.min(1, sp); d.y += (pl.y - d.y) * Math.min(1, sp); }
      if (dd < 18) { S.gold += d.gold; addText(pl.x, pl.y - 26, '+' + d.gold, '#ffd84a'); G.drops.splice(i, 1); }
    } else if (dd < P.pickup && d.t > 0.3) {
      if (d.gem) { S.gems.push(d.gem); UI.toast('Gem found: ' + gemDef(d.gem).name, '#58d8c8'); UI.onLoot('gem'); G.drops.splice(i, 1); }
      else if (d.item.rarity < S.opts.autoSell) { const v = itemValue(d.item); S.gold += v; addText(pl.x, pl.y - 26, '+' + v, '#ffd84a'); G.drops.splice(i, 1); }
      else if (S.inv.length < INV_SIZE) {
        S.inv.push(d.item); if (d.item.rarity >= 2) UI.toast(d.item.name, RARITY_COLOR[d.item.rarity]);
        UI.onLoot(); G.drops.splice(i, 1);
      } else if (!d.warned || G.t - d.warned > 4) { d.warned = G.t; UI.toast('Inventory is full', '#ff8a7a'); }
    }
  }
  if (G.drops.length > 90) G.drops.splice(0, G.drops.length - 90);

  // portal to the next zone
  if (G.portal && dist2(pl.x, pl.y, G.portal.x, G.portal.y) < 28 * 28) { startZone(S.zone + 1); save(); return; }

  for (let i = G.fx.length - 1; i >= 0; i--) { const f = G.fx[i]; f.t += dt; if (f.follow) { f.x = pl.x; f.y = pl.y; } if (f.t >= f.d) G.fx.splice(i, 1); }
  for (let i = G.texts.length - 1; i >= 0; i--) { const t = G.texts[i]; t.t += dt; t.y -= 34 * dt; if (t.t > 0.8) G.texts.splice(i, 1); }
  if (statsDirty) computeStats();
}

/* ===== inventory / gem actions (used by the UI) ===== */
function equipItem(it) {
  let slot = it.slot;
  if (slot === 'ring') slot = !S.equip.ring1 ? 'ring1' : !S.equip.ring2 ? 'ring2' : (itemScore(S.equip.ring1) <= itemScore(S.equip.ring2) ? 'ring1' : 'ring2');
  const i = S.inv.indexOf(it); if (i < 0) return;
  const old = S.equip[slot];
  if (old) S.inv[i] = old; else S.inv.splice(i, 1);
  S.equip[slot] = it;
  computeStats(); save();
}
function unequip(slot) {
  const it = S.equip[slot]; if (!it || S.inv.length >= INV_SIZE) return false;
  delete S.equip[slot]; S.inv.push(it); computeStats(); save(); return true;
}
function sellItem(it) { const i = S.inv.indexOf(it); if (i < 0) return; S.inv.splice(i, 1); S.gold += itemValue(it); }
function sellBelow(rarity) { let n = 0; for (const it of S.inv.slice()) if (it.rarity <= rarity) { sellItem(it); n++; } save(); return n; }
function socketGem(slot, supIdx, gemId) {
  const g = gemById(gemId); if (!g) return;
  const prev = gemSocketed(gemId);
  if (prev) { if (prev.sup < 0) S.slots[prev.slot].skill = null; else S.slots[prev.slot].sup[prev.sup] = null; }
  if (supIdx < 0) S.slots[slot].skill = gemId; else S.slots[slot].sup[supIdx] = gemId;
  computeStats(); save();
}
function unsocket(slot, supIdx) { if (supIdx < 0) S.slots[slot].skill = null; else S.slots[slot].sup[supIdx] = null; computeStats(); save(); }
function buyGem(i) {
  const o = S.shop[i]; if (!o || S.gold < o.price) return false;
  S.gold -= o.price; S.gems.push(o.gem); S.shop.splice(i, 1); save(); return true;
}
function sellGem(id) {
  const g = gemById(id); if (!g || gemSocketed(id)) return false;
  S.gems.splice(S.gems.indexOf(g), 1); S.gold += 25 + g.lvl * 10; save(); return true;
}
function canAllocate(id) {
  const n = TREE.nodes[id];
  return !!n && !S.tree.includes(id) && passivePoints() > 0 && n.adj.some(a => S.tree.includes(a));
}
function allocate(id) { if (!canAllocate(id)) return false; S.tree.push(id); computeStats(); save(); return true; }
const respecCost = () => (S.tree.length - 1) * 12 * Math.max(1, Math.floor(S.level / 5));
function respec() { const c = respecCost(); if (S.gold < c || S.tree.length <= 1) return false; S.gold -= c; S.tree = ['start']; computeStats(); save(); return true; }
