'use strict';
/* ===== state ===== */
const SAVE_KEY = 'cindermarch_v2', OLD_SAVE_KEY = 'cindermarch_v1';
const LEVEL_CAP = 80, PLAYER_R = 11, MAX_CHARS = 8;
const MOB_RESET = 10 * 60 * 1000;    // slain monsters and opened chests come back
const BOSS_RESET = 20 * 60 * 1000;   // the arena boss comes back
let SAVE = null;   // everything that is stored: all characters
let S = null;      // the character being played
let P = null;      // its computed stats
let G = null;      // runtime state of the current zone
const VIEW = { w: 420, h: 800 };   // logical view size, set by render.js
const input = { x: 0, y: 0 };
let statsDirty = false;
const UI = { toast() {}, onLevel() {}, onDeath() {}, onZone() {}, onLoot() {} };   // filled in by ui.js

function save() {
  if (!SAVE) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch (e) { /* storage unavailable */ }
}
function fixChar(c) {
  c.id = c.id || uid();
  if (!CLASSES[c.cls]) {
    const first = c.gems && c.slots && c.gems.find(g => g.uid === c.slots[0].skill);
    c.cls = { arc: 'warden', orbit: 'reaver', blink: 'stalker', bolt: 'arcanist', chain: 'arcanist' }[first && first.id] || 'warden';
  }
  c.name = c.name || 'Exile';
  c.opts = c.opts || { autoSell: 0 };
  c.stats = c.stats || { kills: 0, deaths: 0 };
  c.shop = c.shop || [];
  c.zs = c.zs || {};
  c.sigils = c.sigils || 0;
  delete c.v;
}
function loadSave() {
  SAVE = null;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) { const d = JSON.parse(raw); if (d && d.v === 2 && Array.isArray(d.chars)) SAVE = d; }
    if (!SAVE) {   // a character from version 1.0.0
      const old = localStorage.getItem(OLD_SAVE_KEY);
      if (old) { const d = JSON.parse(old); if (d && d.v === 1 && d.slots && d.tree) SAVE = { v: 2, chars: [d], sel: 0 }; }
    }
  } catch (e) { SAVE = null; }
  if (!SAVE) SAVE = { v: 2, chars: [], sel: 0 };
  SAVE.chars = SAVE.chars.filter(c => c && c.slots && c.tree && c.equip);
  SAVE.chars.forEach(fixChar);
  SAVE.sel = clamp(SAVE.sel | 0, 0, Math.max(0, SAVE.chars.length - 1));
}
function createChar(cls, name) {
  const C = CLASSES[cls];
  const c = { id: uid(), cls, name: name || pick(HERO_NAMES), level: 1, xp: 0, gold: 0, inv: [], equip: {}, gems: [],
    slots: [0, 1, 2, 3].map(() => ({ skill: null, sup: [null, null, null] })),
    tree: ['start'], zone: 1, maxZone: 1, shop: [], opts: { autoSell: 0 }, stats: { kills: 0, deaths: 0 }, zs: {}, sigils: 0 };
  const g = makeGem(C.skill);
  c.gems.push(g); c.slots[0].skill = g.uid;
  c.equip.weapon = makeItem(1, { slot: 'weapon', rarity: 0, wtype: C.wtype });
  SAVE.chars.push(c);
  return SAVE.chars.length - 1;
}
function selectChar(i) {
  S = SAVE.chars[i]; SAVE.sel = i;
  if (!S.shop.length) rollShop();
  computeStats();
  startZone(S.zone);
  save();
}
function deleteChar(i) { SAVE.chars.splice(i, 1); SAVE.sel = clamp(SAVE.sel, 0, Math.max(0, SAVE.chars.length - 1)); save(); }
function exitToTitle() { save(); S = null; P = null; G = null; input.x = input.y = 0; }

/* ===== character stats ===== */
const gemById = id => id ? S.gems.find(g => g.uid === id) : null;
const slotUnlocked = i => S.level >= SLOT_UNLOCK[i];
const SUPPORT_UNLOCK = [1, 8, 16];
const supportSockets = () => Math.min(3, 1 + Math.floor(S.level / 8));
const passivePoints = () => S.level - 1 - (S.tree.length - 1);
function gemSocketed(id) {
  for (let i = 0; i < 4; i++) { const s = S.slots[i]; if (s.skill === id) return { slot: i, sup: -1 }; const j = s.sup.indexOf(id); if (j >= 0) return { slot: i, sup: j }; }
  return null;
}
function computeStats() {
  const st = {};
  const add = src => { for (const k in src) st[k] = (st[k] || 0) + src[k]; };
  add(CLASSES[S.cls].stats);
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
const refreshCost = () => Math.round(40 * (1 + 0.35 * (S.maxZone - 1)));
function refreshShop() { const c = refreshCost(); if (S.gold < c) return false; S.gold -= c; rollShop(); save(); return true; }

/* ===== zone: a bounded map plus its boss arena ===== */
const AREA_KEYS = ['W', 'H', 'grid', 'mobs', 'projs', 'eprojs', 'fx', 'drops', 'texts', 'delayed', 'portals', 'chests', 'seen', 'reveal', 'flow'];
const FLOW_Q = new Int32Array(84 * 84 + 16);
// what is remembered about a zone between visits: its layout, who is dead, which chests are open, when the boss died
function zoneState(z) {
  const now = Date.now();
  for (const k in S.zs) {
    const o = S.zs[k];
    if (+k !== z && now - o.t >= MOB_RESET && (!o.boss || now - o.boss >= BOSS_RESET)) delete S.zs[k];
  }
  let st = S.zs[z];
  if (st && now - st.t >= MOB_RESET) {
    if (!st.boss || now - st.boss >= BOSS_RESET) st = null;       // nothing left to remember: a fresh layout
    else { st.dead = []; st.ch = []; st.t = now; }
  }
  if (!st) st = S.zs[z] = { seed: Math.floor(Math.random() * 2147483647), t: now, dead: [], ch: [], boss: 0 };
  if (st.boss && now - st.boss >= BOSS_RESET) st.boss = 0;
  return st;
}
function makeArea(g, portals) {
  return { W: g.W, H: g.H, grid: g.grid, mobs: [], projs: [], eprojs: [], fx: [], drops: [], texts: [], delayed: [], portals, chests: [],
    seen: new Uint8Array(g.W * g.H), reveal: [], flow: new Int16Array(g.W * g.H), start: g.start };
}
function bindArea(name) { G.area = name; const a = G.areas[name]; for (const k of AREA_KEYS) G[k] = a[k]; G.lastTile = -1; G.flowT = 0; G.near = null; }
function startZone(z) {
  S.zone = z;
  const zs = zoneState(z), m = genMap(zs.seed, z), ar = genArena();
  const map = makeArea(m, [{ kind: 'arena', x: m.arena.x, y: m.arena.y, seen: false }, { kind: 'exit', x: m.exit.x, y: m.exit.y, seen: false }]);
  map.defs = m.mobs;
  const arena = makeArea(ar, [{ kind: 'leave', x: ar.exit.x, y: ar.exit.y, seen: true }]);
  arena.bossAt = ar.boss;
  G = { zi: zoneInfo(z), zs, t: 0, area: 'map', areas: { map, arena }, cds: [0, 0, 0, 0], shake: 0, dead: false, near: null, tickT: 0, flowT: 0, lastTile: -1,
    player: { x: m.start.x, y: m.start.y, life: P.maxLife, face: -Math.PI / 2, walk: 0, flash: 0, blink: 0, castT: -9 } };
  const dead = new Set(zs.dead), open = new Set(zs.ch);
  m.chests.forEach((c, i) => map.chests.push({ x: c.x, y: c.y, tier: c.tier, idx: i, open: open.has(i), seen: false }));
  m.mobs.forEach((d, i) => { if (!dead.has(i)) spawnMob(map, d, i); });
  if (!zs.boss) spawnBoss();
  bindArea('map');
  explore();
  UI.onZone();
}
function spawnMob(area, def, idx, boss) {
  const d = MOBS[def.type], L = G ? G.zi.level : S.zone, rar = def.rar || 0;
  const m = { type: def.type, x: def.x, y: def.y, sx: def.x, sy: def.y, idx, pack: def.pack, r: d.r, spd: d.spd * rnd(0.9, 1.1), hp: mobHp(L) * d.hp, dmg: mobDmg(L) * d.dmg, xp: mobXp(L) * d.xp, rar,
    color: d.color, atkT: rnd(0.4, 1.1), chill: 0, burn: 0, burnT: 0, flash: 0, orbT: 0, mods: [], wob: rnd(0, 6.28), ranged: !!d.ranged, name: d.name, dead: false, lunge: 0, awake: false, losT: 0, see: false };
  const mk = Object.keys(MOB_MODS);
  if (rar === 1) { m.hp *= 2.2; m.xp *= 2.5; m.mods = [pick(mk)]; }
  if (rar === 2) { m.hp *= 5; m.xp *= 6; m.r *= 1.25; m.dmg *= 1.2; const a = pick(mk); m.mods = [a, pick(mk.filter(k => k !== a))]; }
  for (const mod of m.mods) { if (mod === 'fast') m.spd *= 1.35; if (mod === 'tough') m.hp *= 1.6; if (mod === 'deadly') m.dmg *= 1.4; }
  if (rar) m.name = m.mods.map(k => MOB_MODS[k]).join(' ') + ' ' + d.name;
  if (boss) { m.boss = true; m.name = zoneInfo(L).boss; m.hp = mobHp(L) * (14 + 4 * Math.min(L, 19)); m.dmg = mobDmg(L) * 2; m.r = 30; m.spd = 64; m.xp = mobXp(L) * 30; m.rar = 3; m.novaT = 4; m.sumT = 7; m.mods = []; }
  m.maxHp = m.hp;
  area.mobs.push(m);
  return m;
}
function spawnBoss() {
  const a = G ? G.areas.arena : null; if (!a) return;
  spawnMob(a, { type: 'brute', x: a.bossAt.x, y: a.bossAt.y }, undefined, true);
}
const arenaBoss = () => G.areas.arena.mobs.find(m => m.boss && !m.dead) || null;
const bossWait = () => G.zs.boss ? Math.max(0, BOSS_RESET - (Date.now() - G.zs.boss)) : 0;
const mobWait = () => Math.max(0, MOB_RESET - (Date.now() - G.zs.t));
function resetArena() {
  const a = G.areas.arena;
  for (let i = a.mobs.length - 1; i >= 0; i--) if (!a.mobs[i].boss) a.mobs.splice(i, 1);
  a.eprojs.length = 0; a.projs.length = 0; a.delayed.length = 0;
  const b = arenaBoss();
  if (b) { b.hp = b.maxHp; b.awake = false; b.x = a.bossAt.x; b.y = a.bossAt.y; b.burn = 0; b.burnT = 0; b.chill = 0; b.novaT = 4; b.sumT = 7; }
}
function enterArea(name, x, y) {
  bindArea(name);
  G.player.x = x; G.player.y = y; G.player.blink = 0.3;
  input.x = input.y = 0;
  explore();
}
// timers that run on the real clock, so they keep counting while the game is closed
function zoneTick() {
  const now = Date.now(), zs = G.zs, map = G.areas.map, pl = G.player;
  if (now - zs.t >= MOB_RESET) {
    zs.t = now;
    const inMap = G.area === 'map', far = (x, y) => !inMap || dist2(x, y, pl.x, pl.y) > 520 * 520, still = [];
    for (const i of zs.dead) { const d = map.defs[i]; if (far(d.x, d.y)) spawnMob(map, d, i); else still.push(i); }
    zs.dead = still;
    const stillOpen = [];
    for (const c of map.chests) if (c.open) { if (far(c.x, c.y)) c.open = false; else stillOpen.push(c.idx); }
    zs.ch = stillOpen;
    UI.toast('The monsters have returned', '#ff9a7a');
  }
  if (zs.boss && now - zs.boss >= BOSS_RESET) { zs.boss = 0; spawnBoss(); UI.toast(G.zi.boss + ' has returned to the arena', '#ff9a7a'); }
}

/* ===== map queries ===== */
function walk(x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  return tx >= 0 && ty >= 0 && tx < G.W && ty < G.H && G.grid[ty * G.W + tx] === 1;
}
function free(x, y, r) { r *= 0.75; return walk(x - r, y - r) && walk(x + r, y - r) && walk(x - r, y + r) && walk(x + r, y + r); }
function moveEnt(e, dx, dy, r) {
  if (!free(e.x, e.y, r)) {   // squeezed against a wall: let it step out instead of freezing in place
    if (walk(e.x + dx, e.y + dy)) { e.x += dx; e.y += dy; }
    return;
  }
  if (dx && free(e.x + dx, e.y, r)) e.x += dx;
  if (dy && free(e.x, e.y + dy, r)) e.y += dy;
}
function los(x0, y0, x1, y1) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (TILE * 0.45));
  for (let i = 1; i < n; i++) if (!walk(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n)) return false;
  return true;
}
// uncover the minimap around the player
function explore() {
  const pl = G.player, W = G.W, H = G.H, tx = Math.floor(pl.x / TILE), ty = Math.floor(pl.y / TILE), key = ty * W + tx;
  if (key === G.lastTile) return;
  G.lastTile = key; G.flowT = 0;
  const R = 8;
  for (let y = Math.max(0, ty - R); y <= Math.min(H - 1, ty + R); y++) for (let x = Math.max(0, tx - R); x <= Math.min(W - 1, tx + R); x++) {
    if ((x - tx) * (x - tx) + (y - ty) * (y - ty) > R * R) continue;
    const i = y * W + x;
    if (!G.seen[i]) { G.seen[i] = 1; if (G.reveal.length < 20000) G.reveal.push(i); }
  }
  const lim = (R + 0.5) * TILE * (R + 0.5) * TILE;
  for (const p of G.portals) if (!p.seen && dist2(p.x, p.y, pl.x, pl.y) < lim) {
    p.seen = true;
    UI.toast(p.kind === 'arena' ? 'You found the Arena portal' : 'You found the way to the next zone', '#9fe6ff');
  }
  for (const c of G.chests) if (!c.seen && dist2(c.x, c.y, pl.x, pl.y) < lim) c.seen = true;
}
// steps to the player from every nearby tile, so monsters can find their way around walls
function updateFlow() {
  const W = G.W, H = G.H, f = G.flow, g = G.grid, pl = G.player;
  f.fill(32767);
  const s = Math.floor(pl.y / TILE) * W + Math.floor(pl.x / TILE);
  if (s < 0 || s >= W * H || !g[s]) return;
  let h = 0, t = 0; f[s] = 0; FLOW_Q[t++] = s;
  while (h < t) {
    const c = FLOW_Q[h++], d = f[c] + 1; if (d > 32) continue;
    const x = c % W;
    if (x > 0 && g[c - 1] && f[c - 1] > d) { f[c - 1] = d; FLOW_Q[t++] = c - 1; }
    if (x < W - 1 && g[c + 1] && f[c + 1] > d) { f[c + 1] = d; FLOW_Q[t++] = c + 1; }
    if (c >= W && g[c - W] && f[c - W] > d) { f[c - W] = d; FLOW_Q[t++] = c - W; }
    if (c < W * (H - 1) && g[c + W] && f[c + W] > d) { f[c + W] = d; FLOW_Q[t++] = c + W; }
  }
}
function sees(m) {
  if (m.losT <= G.t) { m.losT = G.t + 0.25; m.see = los(m.x, m.y, G.player.x, G.player.y); }
  return m.see;
}
function stepToward(m, tx, ty, sp) { const dx = tx - m.x, dy = ty - m.y, d = Math.hypot(dx, dy) || 1; moveEnt(m, dx / d * sp, dy / d * sp, m.r); }
function chase(m, sp) {
  const pl = G.player;
  if (sees(m)) { stepToward(m, pl.x, pl.y, sp); return; }
  const W = G.W, H = G.H, f = G.flow, g = G.grid, tx = Math.floor(m.x / TILE), ty = Math.floor(m.y / TILE);
  if (tx < 0 || ty < 0 || tx >= W || ty >= H) return;
  let best = f[ty * W + tx], bx = -1, by = -1;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    if (!ox && !oy) continue;
    const nx = tx + ox, ny = ty + oy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H || !g[ny * W + nx]) continue;
    if (ox && oy && (!g[ty * W + nx] || !g[ny * W + tx])) continue;   // no cutting corners
    if (f[ny * W + nx] < best) { best = f[ny * W + nx]; bx = nx; by = ny; }
  }
  if (bx >= 0) stepToward(m, (bx + 0.5) * TILE, (by + 0.5) * TILE, sp);
}
function wake(m) {
  if (m.awake) return;
  m.awake = true;
  if (m.pack !== undefined) for (const o of G.mobs) if (o.pack === m.pack) o.awake = true;
}

/* ===== combat ===== */
function addText(x, y, txt, color, big) { if (G.texts.length < 60) G.texts.push({ x: x + rnd(-6, 6), y, txt, color, big, t: 0 }); }
function addFx(o) { if (G.fx.length < 120) { o.t = 0; G.fx.push(o); } }
function heal(v) { const pl = G.player; pl.life = Math.min(P.maxLife, pl.life + v); }
// nearest monster that can be seen from (x, y)
function nearestMob(x, y, range, exclude) {
  let best = null, bd = range * range;
  for (const m of G.mobs) {
    if (m.dead || (exclude && exclude.includes(m))) continue;
    const d = dist2(x, y, m.x, m.y) - m.r * m.r;
    if (d < bd && los(x, y, m.x, m.y)) { bd = d; best = m; }
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
  wake(m);
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
function dropAt(x, y, o, spread) {
  spread = spread || 14;
  o.x = x + rnd(-spread, spread); o.y = y + rnd(-spread, spread);
  if (!walk(o.x, o.y)) { o.x = x; o.y = y; }
  o.t = 0; G.drops.push(o);
}
function killMob(m) {
  m.dead = true; S.stats.kills++;
  if (m.idx !== undefined && G.area === 'map') G.zs.dead.push(m.idx);
  const L = G.zi.level, diff = S.level - L, find = zoneFind(L), qty = zoneQuantity(L);
  gainXp(m.xp * (diff > 4 ? Math.max(0.1, 1 - (diff - 4) * 0.15) : 1));
  if (P.lifeOnKill) heal(P.lifeOnKill);
  addFx({ k: 'burst', x: m.x, y: m.y, r: m.r * 2.2, d: 0.35, color: m.color });
  const ri = m.boss ? 3 : m.rar;
  if (Math.random() < [0.35, 0.75, 1, 1][ri]) dropAt(m.x, m.y, { gold: Math.max(1, Math.round((3 + L * 1.6) * rnd(0.6, 1.4) * [1, 2, 4, 14][ri] * P.gold)) });
  const n = m.boss ? 5 : (Math.random() < [0.13, 0.45, 1][m.rar] * qty ? 1 : 0) + (m.rar === 2 && Math.random() < 0.5 * qty ? 1 : 0);
  for (let i = 0; i < n; i++) dropAt(m.x, m.y, { item: makeItem(L + (m.boss ? 1 : 0), { rarityMult: P.rarity * find * [1, 1.5, 2.5, 4][ri], rarity: m.boss && i === 0 ? 2 : undefined }) }, m.boss ? 34 : 14);
  if (Math.random() < [0.006, 0.025, 0.09, 1][ri]) dropAt(m.x, m.y, { gem: randomGem() });
  if (Math.random() < [0.0004, 0.0015, 0.006, 0.03][ri]) dropAt(m.x, m.y, { sigil: 1 });
  if (m.boss) {
    G.zs.boss = Date.now();
    S.stats.bosses = (S.stats.bosses || 0) + 1;
    for (const o of G.mobs) if (!o.dead && o !== m) { o.dead = true; addFx({ k: 'burst', x: o.x, y: o.y, r: o.r * 2, d: 0.3, color: o.color }); }
    G.eprojs.length = 0;
    UI.toast(m.name + ' is defeated — returns in 20 minutes', '#9fe6ff');
    save();
  }
}
function openChest(c) {
  c.open = true;
  if (G.area === 'map') G.zs.ch.push(c.idx);
  const L = G.zi.level, T = CHESTS[c.tier], find = zoneFind(L);
  const n = rndi(T.items[0], T.items[1]) + (Math.random() < zoneQuantity(L) - 1 ? 1 : 0);
  for (let i = 0; i < n; i++) dropAt(c.x, c.y, { item: makeItem(L, { rarityMult: P.rarity * find * T.rar, rarity: c.tier === 'ornate' && i === 0 ? 2 : undefined }) }, 34);
  for (let i = 0; i < 3; i++) dropAt(c.x, c.y, { gold: Math.max(1, Math.round((3 + L * 1.6) * T.gold / 3 * rnd(0.7, 1.3) * P.gold)) }, 30);
  if (Math.random() < T.gem) dropAt(c.x, c.y, { gem: randomGem() }, 30);
  if (Math.random() < T.sigil) dropAt(c.x, c.y, { sigil: 1 }, 30);
  addFx({ k: 'ring', x: c.x, y: c.y, r: 44, d: 0.35, color: '#ffd84a' });
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
// back to the zone entrance; slain monsters stay dead, everything else calms down
function resurrect() {
  resetArena();
  const map = G.areas.map;
  for (const m of map.mobs) if (m.awake) { m.awake = false; m.x = m.sx; m.y = m.sy; m.hp = m.maxHp; m.burn = 0; m.burnT = 0; }
  map.eprojs.length = 0; map.projs.length = 0; map.delayed.length = 0;
  G.dead = false; G.cds = [0, 0, 0, 0];
  G.player.life = P.maxLife; G.player.flash = 0;
  enterArea('map', map.start.x, map.start.y);
}

/* ===== portals and other things the player can use ===== */
function actions() {
  const out = [];
  if (!G || G.dead) return out;
  const n = G.near;
  if (n && n.kind === 'arena') out.push({ id: 'arena', label: 'Enter Arena' });
  if (n && n.kind === 'leave') out.push({ id: 'leave', label: 'Leave Arena' });
  if (n && n.kind === 'exit') out.push({ id: 'exit', label: 'Travel to ' + zoneInfo(S.zone + 1).name });
  if (S.sigils > 0 && G.zs.boss && (G.area === 'arena' || (n && n.kind === 'arena'))) out.push({ id: 'sigil', label: 'Use ' + SIGIL_NAME + ' (' + S.sigils + ')' });
  return out;
}
function doAction(id) {
  if (!actions().some(a => a.id === id)) return;
  const map = G.areas.map, arena = G.areas.arena;
  if (id === 'arena') { resetArena(); enterArea('arena', arena.start.x, arena.start.y); }
  else if (id === 'leave') { resetArena(); const p = map.portals[0]; enterArea('map', p.x, p.y); }
  else if (id === 'exit') {
    const next = S.zone + 1;
    if (next > S.maxZone) { S.maxZone = next; rollShop(); }
    startZone(next); save();
  } else if (id === 'sigil') {
    S.sigils--; G.zs.boss = 0; spawnBoss();
    UI.toast(G.zi.boss + ' answers the sigil', '#ff5ad0');
    if (G.area === 'arena') addFx({ k: 'ring', x: arena.bossAt.x, y: arena.bossAt.y, r: 90, d: 0.6, color: '#ff5ad0', fill: true });
    save();
  }
}

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
      const c = mobsInRange(pl.x, pl.y, d.range).filter(m => los(pl.x, pl.y, m.x, m.y)); if (!c.length) return false;
      const t = pick(c), ang = Math.atan2(t.y - pl.y, t.x - pl.x), ox = pl.x, oy = pl.y;
      let nx = t.x - Math.cos(ang) * (t.r + PLAYER_R + 2), ny = t.y - Math.sin(ang) * (t.r + PLAYER_R + 2);
      if (!free(nx, ny, PLAYER_R)) { nx = t.x; ny = t.y; }
      if (!free(nx, ny, PLAYER_R)) { nx = ox; ny = oy; }
      pl.x = nx; pl.y = ny; pl.face = ang; pl.blink = 0.12;
      const R = 46 * sa;
      for (const m of mobsInRange(pl.x, pl.y, R)) hitMob(m, info, m === t ? 1 : 0.6);
      addFx({ k: 'trail', x: ox, y: oy, x2: pl.x, y2: pl.y, d: 0.22, color: d.color });
      addFx({ k: 'ring', x: pl.x, y: pl.y, r: R, d: 0.2, color: d.color, fill: true });
      return true;
    }
    case 'meteor': {
      const c = mobsInRange(pl.x, pl.y, d.range).filter(m => los(pl.x, pl.y, m.x, m.y)); if (!c.length) return false;
      const t = pick(c), x = t.x, y = t.y, R = 72 * sa, area = G.area;
      addFx({ k: 'warn', x, y, r: R, d: 0.7, color: d.color });
      G.delayed.push({ t: 0.7, fn() { if (G.area !== area) return; for (const m of mobsInRange(x, y, R)) hitMob(m, info); addFx({ k: 'ring', x, y, r: R * 1.15, d: 0.35, color: '#ffb060', fill: true }); G.shake = Math.min(8, G.shake + 2.5); } });
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
  const bl = orbitBlades(info), pl = G.player, reach = info.def.range * Math.sqrt(info.area) + 50;
  for (const m of G.mobs) {
    if (m.dead || G.t < m.orbT || dist2(pl.x, pl.y, m.x, m.y) > reach * reach) continue;
    // the blades sweep the whole circle, so anything inside it is cut once per rotation step
    const inside = dist2(pl.x, pl.y, m.x, m.y) < (reach - 42 + m.r) * (reach - 42 + m.r);
    if (inside || bl.some(b => dist2(b.x, b.y, m.x, m.y) < (m.r + 13) * (m.r + 13))) { hitMob(m, info); m.orbT = G.t + info.cd; }
  }
}

/* ===== main update ===== */
const EL_COLOR = { fire: '#ff7a3c', cold: '#8fd8ff', light: '#f7f08a', phys: '#c9b8a0' };
function update(dt) {
  if (!G || G.dead) return;
  const pl = G.player;
  G.t += dt;
  let ix = input.x, iy = input.y; const il = Math.hypot(ix, iy);
  if (il > 1) { ix /= il; iy /= il; }
  moveEnt(pl, ix * P.speed * dt, iy * P.speed * dt, PLAYER_R);
  if (il > 0.1) { pl.walk += dt * Math.min(1, il); if (G.t - pl.castT > 0.45) pl.face = Math.atan2(iy, ix); }
  pl.life = Math.min(P.maxLife, pl.life + P.regen * dt);
  if (pl.flash > 0) pl.flash -= dt;
  if (pl.blink > 0) pl.blink -= dt;
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 22);
  explore();
  G.flowT -= dt;
  if (G.flowT <= 0) { G.flowT = 0.3; updateFlow(); }
  G.tickT -= dt;
  if (G.tickT <= 0) { G.tickT = 0.5; zoneTick(); }

  // skills fire on their own as soon as they are ready and have a target in sight
  for (let i = 0; i < 4; i++) {
    const info = P.skills[i]; if (!info) continue;
    if (info.def.kind === 'orbit') { updateOrbit(info); continue; }
    G.cds[i] -= dt;
    if (G.cds[i] <= 0) {
      if (castSkill(info, false)) { G.cds[i] = info.cd; pl.castT = G.t; if (info.echo) { const area = G.area; G.delayed.push({ t: 0.22, fn() { if (G.area === area) castSkill(info, true); } }); } }
      else G.cds[i] = 0.08;
    }
  }
  for (let i = G.delayed.length - 1; i >= 0; i--) { const d = G.delayed[i]; d.t -= dt; if (d.t <= 0) { G.delayed.splice(i, 1); d.fn(); } }

  // player projectiles
  for (let i = G.projs.length - 1; i >= 0; i--) {
    const p = G.projs[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    let gone = p.life <= 0;
    if (!gone && !walk(p.x, p.y)) { gone = true; addFx({ k: 'burst', x: p.x, y: p.y, r: 10, d: 0.15, color: p.color }); }
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
    if (p.life <= 0 || !walk(p.x, p.y)) { G.eprojs.splice(i, 1); continue; }
    if (dist2(p.x, p.y, pl.x, pl.y) < (PLAYER_R + p.r) * (PLAYER_R + p.r)) { damagePlayer(p.dmg, p.el); G.eprojs.splice(i, 1); if (G.dead) return; }
  }

  // monsters: asleep until the player comes into view
  const awake = [];
  for (const m of G.mobs) {
    if (m.dead) continue;
    if (m.flash > 0) m.flash -= dt;
    if (m.burnT > 0) { m.burnT -= dt; damageMob(m, m.burn * dt, false, true); if (m.dead) continue; if (m.burnT <= 0) m.burn = 0; }
    const dx = pl.x - m.x, dy = pl.y - m.y, d = Math.hypot(dx, dy) || 1;
    if (!m.awake) {
      const sight = m.boss ? 330 : m.ranged ? 300 : 250;
      if (d < sight && los(m.x, m.y, pl.x, pl.y)) wake(m); else continue;
    }
    awake.push(m);
    if (m.lunge > 0) m.lunge -= dt;
    if (m.chill > 0) m.chill -= dt;
    const slow = m.chill > 0 ? 0.65 : 1, ux = dx / d, uy = dy / d, sp = m.spd * slow * dt;
    m.atkT -= dt * slow; m.wob += dt * 6;
    if (m.ranged) {
      if (!sees(m) || d > 210) chase(m, sp);
      else if (d < 130) moveEnt(m, -ux * sp * 0.8, -uy * sp * 0.8, m.r);
      else moveEnt(m, -uy * sp * 0.5, ux * sp * 0.5, m.r);
      if (m.atkT <= 0 && d < 320 && m.see) {
        m.atkT = 2.3; const el = G.zi.el;
        G.eprojs.push({ x: m.x, y: m.y, vx: ux * 150, vy: uy * 150, r: 5, life: 3.5, dmg: m.dmg, el, color: EL_COLOR[el] });
      }
    } else {
      const reach = m.r + PLAYER_R + 4;
      if (d > reach - 2) chase(m, sp);
      if (d < reach + 4 && m.atkT <= 0) { m.atkT = m.boss ? 1.3 : 1.15; m.lunge = 0.18; damagePlayer(m.dmg, 'phys'); if (G.dead) return; }
    }
    if (m.boss) {
      m.novaT -= dt; m.sumT -= dt;
      if (m.novaT <= 0) {
        m.novaT = 4.5; const el = G.zi.el, n = 12, off = rnd(0, 1);
        for (let k = 0; k < n; k++) { const a = off + k * Math.PI * 2 / n; G.eprojs.push({ x: m.x, y: m.y, vx: Math.cos(a) * 135, vy: Math.sin(a) * 135, r: 6, life: 3.2, dmg: m.dmg * 0.55, el, color: EL_COLOR[el] }); }
        addFx({ k: 'ring', x: m.x, y: m.y, r: 60, d: 0.3, color: EL_COLOR[el] });
      }
      if (m.sumT <= 0) {
        m.sumT = 9;
        for (let k = 0; k < 4; k++) {
          let x = m.x + rnd(-50, 50), y = m.y + rnd(-50, 50);
          if (!free(x, y, 8)) { x = m.x; y = m.y; }
          spawnMob(G.areas[G.area], { type: 'swarm', x, y }).awake = true;
        }
      }
    }
  }
  // keep monsters from stacking on top of each other
  for (let i = 0; i < awake.length; i++) {
    const a = awake[i]; if (a.dead) continue;
    for (let j = i + 1; j < awake.length; j++) {
      const b = awake[j]; if (b.dead) continue;
      const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 === 0) continue;
      const d = Math.sqrt(d2), push = (rr - d) / 2, nx = dx / d, ny = dy / d;
      const wa = a.boss ? 0 : b.boss ? 2 : 1, wb = b.boss ? 0 : a.boss ? 2 : 1;
      moveEnt(a, -nx * push * wa, -ny * push * wa, a.r); moveEnt(b, nx * push * wb, ny * push * wb, b.r);
    }
  }
  for (let i = G.mobs.length - 1; i >= 0; i--) if (G.mobs[i].dead) G.mobs.splice(i, 1);

  // chests open when touched
  for (const c of G.chests) if (!c.open && dist2(c.x, c.y, pl.x, pl.y) < 34 * 34) openChest(c);

  // loot
  for (let i = G.drops.length - 1; i >= 0; i--) {
    const d = G.drops[i]; d.t += dt;
    const dd = Math.sqrt(dist2(d.x, d.y, pl.x, pl.y));
    if (d.gold) {
      if (dd < 130 && d.t > 0.25) { const sp = 320 * dt / Math.max(dd, 1); d.x += (pl.x - d.x) * Math.min(1, sp); d.y += (pl.y - d.y) * Math.min(1, sp); }
      if (dd < 18) { S.gold += d.gold; addText(pl.x, pl.y - 26, '+' + d.gold, '#ffd84a'); G.drops.splice(i, 1); }
    } else if (dd < P.pickup && d.t > 0.3) {
      if (d.sigil) { S.sigils++; UI.toast(SIGIL_NAME + ' found!', '#ff5ad0'); G.drops.splice(i, 1); save(); }
      else if (d.gem) { S.gems.push(d.gem); UI.toast('Gem found: ' + gemDef(d.gem).name, '#58d8c8'); UI.onLoot('gem'); G.drops.splice(i, 1); }
      else if (d.item.rarity < S.opts.autoSell) { const v = itemValue(d.item); S.gold += v; addText(pl.x, pl.y - 26, '+' + v, '#ffd84a'); G.drops.splice(i, 1); }
      else if (S.inv.length < INV_SIZE) {
        S.inv.push(d.item); if (d.item.rarity >= 2) UI.toast(d.item.name, RARITY_COLOR[d.item.rarity]);
        UI.onLoot(); G.drops.splice(i, 1);
      } else if (!d.warned || G.t - d.warned > 4) { d.warned = G.t; UI.toast('Inventory is full', '#ff8a7a'); }
    }
  }
  if (G.drops.length > 120) G.drops.splice(0, G.drops.length - 120);

  // which portal is the player standing on
  G.near = null;
  for (const p of G.portals) if (dist2(p.x, p.y, pl.x, pl.y) < 40 * 40) G.near = p;

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
