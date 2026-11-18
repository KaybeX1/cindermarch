'use strict';
/* ===== state ===== */
const SAVE_KEY = 'cindermarch_v2', OLD_SAVE_KEY = 'cindermarch_v1';
const LEVEL_CAP = 80, PLAYER_R = 11, MAX_CHARS = 8;
let SAVE = null;   // everything that is stored: all characters
let S = null;      // the character being played
let P = null;      // its computed stats
let R = null;      // the current run: chapter, room, run level, abilities picked
let G = null;      // the current room
const VIEW = { w: 420, h: 800 };   // logical view size, set by render.js
const input = { x: 0, y: 0 };
let statsDirty = false;
const UI = { toast() {}, onLevel() {}, onDeath() {}, onRoom() {}, onLoot() {}, onClear() {}, onRunEnd() {} };   // filled in by ui.js

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
  c.shop = c.shop && c.shop.every(o => o && o.gem && !o.gem.sup) ? c.shop : [];
  // chapters replace the old zones: three zones' worth of difficulty per chapter
  c.maxCh = c.maxCh || Math.max(1, Math.ceil((c.maxZone || 1) / 3));
  c.chSel = clamp(c.chSel || c.maxCh, 1, c.maxCh);
  c.best = c.best || {};
  // support gems are run abilities now: refund them
  const sup = c.gems.filter(g => g.sup);
  if (sup.length) { c.gold += 60 * sup.length; c.gems = c.gems.filter(g => !g.sup); }
  c.slots = c.slots.map(s => ({ skill: s && c.gems.some(g => g.uid === s.skill) ? s.skill : null }));
  delete c.v; delete c.zone; delete c.maxZone; delete c.zs; delete c.sigils;
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
  SAVE.chars = SAVE.chars.filter(c => c && c.slots && c.tree && c.equip && c.gems);
  SAVE.chars.forEach(fixChar);
  SAVE.sel = clamp(SAVE.sel | 0, 0, Math.max(0, SAVE.chars.length - 1));
}
function createChar(cls, name) {
  const C = CLASSES[cls];
  const c = { id: uid(), cls, name: name || pick(HERO_NAMES), level: 1, xp: 0, gold: 0, inv: [], equip: {}, gems: [],
    slots: [0, 1, 2, 3].map(() => ({ skill: null })), tree: ['start'], maxCh: 1, chSel: 1, best: {}, shop: [],
    opts: { autoSell: 0 }, stats: { kills: 0, deaths: 0 } };
  const g = makeGem(C.skill);
  c.gems.push(g); c.slots[0].skill = g.uid;
  c.equip.weapon = makeItem(1, { slot: 'weapon', rarity: 0, wtype: C.wtype });
  SAVE.chars.push(c);
  return SAVE.chars.length - 1;
}
function selectChar(i) {
  S = SAVE.chars[i]; SAVE.sel = i; R = null; G = null;
  if (!S.shop.length) rollShop();
  computeStats();
  save();
}
function deleteChar(i) { SAVE.chars.splice(i, 1); SAVE.sel = clamp(SAVE.sel, 0, Math.max(0, SAVE.chars.length - 1)); save(); }
function exitToTitle() { save(); S = null; P = null; R = null; G = null; input.x = input.y = 0; }

/* ===== character stats ===== */
const gemById = id => id ? S.gems.find(g => g.uid === id) : null;
const slotUnlocked = i => S.level >= SLOT_UNLOCK[i];
const passivePoints = () => S.level - 1 - (S.tree.length - 1);
function gemSocketed(id) { for (let i = 0; i < 4; i++) if (S.slots[i].skill === id) return { slot: i }; return null; }
function computeStats() {
  const st = {};
  const add = (src, n) => { for (const k in src) st[k] = (st[k] || 0) + src[k] * (n || 1); };
  add(CLASSES[S.cls].stats);
  for (const sl of EQUIP_SLOTS) if (S.equip[sl]) add(itemStats(S.equip[sl]));
  for (const id of S.tree) { const n = TREE.nodes[id]; if (n) add(n.stats); }
  if (R) for (const id in R.abil) { const a = ABILITIES[id]; if (a.stats) add(a.stats, R.abil[id]); }
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
// abilities picked during the run change every skill they fit, the way support gems used to
function skillInfo(i) {
  const sl = S.slots[i];
  if (!slotUnlocked(i) || !sl.skill) return null;
  const gem = gemById(sl.skill); if (!gem) return null;
  const d = SKILLS[gem.id], l = gem.lvl, st = P.raw, g = k => st[k] || 0;
  let more = 1 + g('moreDmg') / 100, cdm = 1, area = P.area, proj = 0, pierce = d.pierce || 0, chain = d.chain || 0;
  let crit = P.crit, cm = P.critMulti, leech = P.leech, ignite = 0, echo = 0;
  const sups = [];
  if (R) for (const id in R.abil) {
    const sd = ABILITIES[id], n = R.abil[id];
    if (!sd.sup || !supportFits(sd, d)) continue;
    sups.push(sd);
    if (sd.more) more *= sd.more < 1 ? sd.more : Math.pow(sd.more, n);   // a penalty is paid once, a bonus stacks
    if (sd.cd) cdm *= sd.cd < 1 ? Math.pow(sd.cd, n) : sd.cd;
    if (sd.area) area *= Math.pow(sd.area, n);
    if (sd.proj) proj += sd.proj * n;
    if (sd.pierce) pierce += sd.pierce * n;
    if (sd.chain) chain += sd.chain * n;
    if (sd.crit) crit += sd.crit * n;
    if (sd.critMulti) cm += sd.critMulti * n;
    if (sd.leech) leech += sd.leech * n;
    if (sd.ignite) ignite += sd.ignite * n;
    if (sd.echo) echo = n;
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
  let dps = avg * (1 + crit / 100 * (cm / 100 - 1)) / cd * (1 + ignite) * (1 + echo);
  if (d.kind === 'bolt') dps *= 1 + proj * 0.5;
  return { i, def: d, gem, cd, dmg, avg, crit, critMulti: cm, area, proj, pierce, chain, leech, ignite, echo, sups, dps };
}
function rollShop() {
  S.shop = [];
  const owned = new Set(S.gems.map(g => g.id));
  for (let i = 0; i < 3; i++) {
    let g = randomGem(), tries = 0;
    while ((owned.has(g.id) || S.shop.some(o => o.gem.id === g.id)) && tries++ < 12) g = randomGem();
    S.shop.push({ gem: g, price: Math.round(140 * (1 + 0.9 * (S.maxCh - 1))) });
  }
}
const refreshCost = () => Math.round(40 * (1 + 0.9 * (S.maxCh - 1)));
function refreshShop() { const c = refreshCost(); if (S.gold < c) return false; S.gold -= c; rollShop(); save(); return true; }

/* ===== the run ===== */
function startRun(ch) {
  ch = clamp(ch, 1, S.maxCh);
  S.chSel = ch;
  R = { ch, room: 1, lvl: 1, xp: 0, abil: {}, picks: 1, why: 'start', offer: null, kills: 0, gold0: S.gold, items: 0, gems: 0, t0: Date.now(), over: false };
  computeStats();
  startRoom(true);
  G.player.life = P.maxLife;
  save();
}
function startRoom(first) {
  const L = roomLevel(R.ch, R.room), life = G && !first ? G.player.life : P.maxLife;
  const room = genRoom(Math.floor(Math.random() * 2147483647), R.ch, R.room);
  G = { zi: Object.assign(chapterInfo(R.ch), { level: L }), t: 0, W: room.W, H: room.H, grid: room.grid, door: DOOR_X,
    mobs: [], projs: [], eprojs: [], fx: [], drops: [], texts: [], delayed: [], cds: [0, 0, 0, 0], shake: 0, dead: false,
    cleared: false, flow: new Int16Array(room.W * room.H), flowT: 0, boss: isBossRoom(R.room),
    player: { x: START.x, y: START.y, life: Math.min(life, P.maxLife), face: -Math.PI / 2, walk: 0, flash: 0, blink: 0, castT: -9, hurt: 0 } };
  for (const sp of room.spawns) spawnMob(sp);
  UI.onRoom();
}
function spawnMob(sp) {
  const L = G.zi.level;
  if (sp.type === 'boss') return spawnBoss(sp, L);
  const d = MOBS[sp.type], rar = sp.rar || 0;
  let x = sp.x, y = sp.y;
  if (!walk(x, y)) { x = (Math.floor(x / TILE) + 0.5) * TILE; y = (Math.floor(y / TILE) + 0.5) * TILE; }
  const m = { type: sp.type, x, y, r: d.r, spd: d.spd * rnd(0.9, 1.1), hp: mobHp(L) * d.hp * chHp(R.ch), dmg: mobDmg(L) * d.dmg * chDmg(R.ch), xp: mobXp(L) * d.xp, rar,
    color: d.color, atkT: rnd(0.8, 1.8), chill: 0, burn: 0, burnT: 0, flash: 0, orbT: 0, mods: [], wob: rnd(0, 6.28), name: d.name, dead: false, lunge: 0,
    ranged: !!d.ranged, totem: !!d.totem, charge: !!d.charge, st: 'walk', stT: rnd(1.5, 3), ang: 0, losT: 0, see: false };
  const mk = Object.keys(MOB_MODS);
  if (rar === 1) { m.hp *= 2; m.xp *= 2.5; m.mods = [pick(mk)]; }
  if (rar === 2) { m.hp *= 4; m.xp *= 6; m.r *= 1.2; m.dmg *= 1.2; const a = pick(mk); m.mods = [a, pick(mk.filter(k => k !== a))]; }
  for (const mod of m.mods) { if (mod === 'fast') m.spd *= 1.3; if (mod === 'tough') m.hp *= 1.5; if (mod === 'deadly') m.dmg *= 1.35; }
  if (rar) m.name = m.mods.map(k => MOB_MODS[k]).join(' ') + ' ' + d.name;
  m.maxHp = m.hp;
  G.mobs.push(m);
  return m;
}
function spawnBoss(sp, L) {
  const fin = sp.final, B = fin ? { name: G.zi.boss, color: BOSS_COLOR[G.zi.el] || '#8a4a3a', pats: ['ring', 'dash', 'spiral', 'fan', 'summon'], spd: 60 } : MINI_BOSSES[sp.idx % MINI_BOSSES.length];
  const m = { type: 'boss', boss: true, final: fin, x: sp.x, y: sp.y, r: fin ? 32 : 26, spd: B.spd, pats: B.pats, pi: 0, name: B.name, color: B.color,
    hp: mobHp(L) * chHp(R.ch) * (fin ? 24 + 3 * R.ch : 10 + 2 * R.ch), dmg: mobDmg(L) * chDmg(R.ch) * (fin ? 1.8 : 1.5), xp: mobXp(L) * (fin ? 40 : 20), rar: 3,
    atkT: 1, chill: 0, burn: 0, burnT: 0, flash: 0, orbT: 0, mods: [], wob: 0, dead: false, lunge: 0, st: 'idle', stT: 1.6, ang: 0, emitT: 0, n: 0, losT: 0, see: false };
  m.maxHp = m.hp;
  G.mobs.push(m);
  return m;
}
const bossMob = () => G && G.mobs.find(m => m.boss && !m.dead) || null;
// leaving through the door: loot still lying around is picked up on the way out
function collectAll() {
  for (const d of G.drops) pickUp(d, true);
  G.drops.length = 0;
}
function nextRoom() {
  collectAll();
  if (R.room >= CH_ROOMS) { endRun(true); return; }
  R.room++;
  startRoom(false);
  save();
}
function endRun(won, abandoned) {
  if (!R || R.over) return;
  if (G) collectAll();
  R.over = true; R.won = won;
  const cleared = won ? CH_ROOMS : R.room - 1 + (G && G.cleared ? 1 : 0);
  R.cleared = cleared;
  if (cleared > (S.best[R.ch] || 0)) { S.best[R.ch] = cleared; R.newBest = true; }
  if (won) {
    R.bonus = Math.round((60 + 40 * R.ch) * R.ch * P.gold);
    S.gold += R.bonus;
    if (R.ch >= S.maxCh) { S.maxCh = R.ch + 1; R.unlocked = true; rollShop(); }
    S.chSel = Math.min(S.maxCh, R.ch + 1);
  }
  R.abandoned = !!abandoned;
  input.x = input.y = 0;
  save();
  UI.onRunEnd();
}
function leaveRun() { R = null; G = null; computeStats(); save(); }

/* ===== run level and the 1-of-3 ability choice ===== */
function gainRunXp(x) {
  R.xp += x;
  while (R.xp >= runXpNext(R.lvl)) { R.xp -= runXpNext(R.lvl); R.lvl++; R.picks++; R.why = R.why === 'boss' ? 'boss' : 'level'; }
}
function abilityOk(id) {
  const a = ABILITIES[id], n = R.abil[id] || 0;
  if (n >= a.max) return false;
  if (a.sup) return P.skills.some(s => s && supportFits(a, s.def));
  return true;
}
function rollAbilities() {
  const ids = Object.keys(ABILITIES).filter(abilityOk), out = [];
  const weight = id => id === 'mend' ? (G.player.life < P.maxLife * 0.6 ? 2 : 0.4) : ABILITIES[id].sup ? 1.4 : 1;
  while (out.length < 3 && ids.length) {
    let tot = 0; for (const id of ids) tot += weight(id);
    let r = Math.random() * tot, k = 0;
    for (; k < ids.length - 1; k++) { r -= weight(ids[k]); if (r <= 0) break; }
    out.push(ids.splice(k, 1)[0]);
  }
  return out;
}
function takeAbility(id) {
  if (!R || !R.offer || !R.offer.includes(id)) return;
  const a = ABILITIES[id];
  R.abil[id] = (R.abil[id] || 0) + 1;
  computeStats();
  if (a.heal) heal(P.maxLife * a.heal);
  R.picks = Math.max(0, R.picks - 1); R.offer = null; R.why = 'level';
  save();
}

/* ===== room queries ===== */
const tileAt = (x, y) => { const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE); return tx >= 0 && ty >= 0 && tx < G.W && ty < G.H ? G.grid[ty * G.W + tx] : 0; };
const walk = (x, y) => tileAt(x, y) === 1;
// shots fly over pits but stop at walls, rocks and the closed door
const solid = (x, y) => { const t = tileAt(x, y); return t === 0 || t === 2 || t === 4; };
function free(x, y, r) { r *= 0.75; return walk(x - r, y - r) && walk(x + r, y - r) && walk(x - r, y + r) && walk(x + r, y + r); }
function moveEnt(e, dx, dy, r) {
  if (!free(e.x, e.y, r)) {   // squeezed against a wall: let it step out instead of freezing in place
    if (walk(e.x + dx, e.y + dy)) { e.x += dx; e.y += dy; }
    return false;
  }
  let moved = false;
  if (dx && free(e.x + dx, e.y, r)) { e.x += dx; moved = true; }
  if (dy && free(e.x, e.y + dy, r)) { e.y += dy; moved = true; }
  return moved;
}
function los(x0, y0, x1, y1, walking) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 5);
  for (let i = 1; i < n; i++) {
    const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
    if (walking ? !walk(x, y) : solid(x, y)) return false;
  }
  return true;
}
// steps to the player from every tile, so monsters find their way around rocks and pits
const FLOW_Q = new Int32Array(ROOM_W * ROOM_H + 8);
function updateFlow() {
  const W = G.W, H = G.H, f = G.flow, g = G.grid, pl = G.player;
  f.fill(32767);
  const s = Math.floor(pl.y / TILE) * W + Math.floor(pl.x / TILE);
  if (s < 0 || s >= W * H || g[s] !== 1) return;
  let h = 0, t = 0; f[s] = 0; FLOW_Q[t++] = s;
  while (h < t) {
    const c = FLOW_Q[h++], d = f[c] + 1, x = c % W;
    if (x > 0 && g[c - 1] === 1 && f[c - 1] > d) { f[c - 1] = d; FLOW_Q[t++] = c - 1; }
    if (x < W - 1 && g[c + 1] === 1 && f[c + 1] > d) { f[c + 1] = d; FLOW_Q[t++] = c + 1; }
    if (c >= W && g[c - W] === 1 && f[c - W] > d) { f[c - W] = d; FLOW_Q[t++] = c - W; }
    if (c < W * (H - 1) && g[c + W] === 1 && f[c + W] > d) { f[c + W] = d; FLOW_Q[t++] = c + W; }
  }
}
function canWalkTo(m) {
  if (m.losT <= G.t) { m.losT = G.t + 0.25; m.see = los(m.x, m.y, G.player.x, G.player.y, true); }
  return m.see;
}
function stepToward(m, tx, ty, sp) { const dx = tx - m.x, dy = ty - m.y, d = Math.hypot(dx, dy) || 1; moveEnt(m, dx / d * sp, dy / d * sp, m.r); }
function chase(m, sp) {
  const pl = G.player;
  if (canWalkTo(m)) { stepToward(m, pl.x, pl.y, sp); return; }
  const W = G.W, H = G.H, f = G.flow, g = G.grid, tx = Math.floor(m.x / TILE), ty = Math.floor(m.y / TILE);
  if (tx < 0 || ty < 0 || tx >= W || ty >= H) return;
  let best = f[ty * W + tx], bx = -1, by = -1;
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
    if (!ox && !oy) continue;
    const nx = tx + ox, ny = ty + oy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H || g[ny * W + nx] !== 1) continue;
    if (ox && oy && (g[ty * W + nx] !== 1 || g[ny * W + tx] !== 1)) continue;   // no cutting corners
    if (f[ny * W + nx] < best) { best = f[ny * W + nx]; bx = nx; by = ny; }
  }
  if (bx >= 0) stepToward(m, (bx + 0.5) * TILE, (by + 0.5) * TILE, sp);
}

/* ===== combat ===== */
function addText(x, y, txt, color, big) { if (G.texts.length < 60) G.texts.push({ x: x + rnd(-6, 6), y, txt, color, big, t: 0 }); }
function addFx(o) { if (G.fx.length < 140) { o.t = 0; G.fx.push(o); } }
function heal(v) { const pl = G && G.player; if (pl) pl.life = Math.min(P.maxLife, pl.life + v); }
// a shot of some width gets through: checks the centre line and both edges
function losWide(x0, y0, x1, y1, w) {
  const d = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / d * w, ny = (x1 - x0) / d * w;
  return los(x0, y0, x1, y1) && los(x0 + nx, y0 + ny, x1 + nx, y1 + ny) && los(x0 - nx, y0 - ny, x1 - nx, y1 - ny);
}
function nearestMob(x, y, range, exclude) {
  let best = null, bd = range * range;
  for (const m of G.mobs) {
    if (m.dead || (exclude && exclude.includes(m))) continue;
    const d = dist2(x, y, m.x, m.y) - m.r * m.r;
    if (d < bd && losWide(x, y, m.x, m.y, 5)) { bd = d; best = m; }
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
      computeStats();
      addFx({ k: 'ring', x: G.player.x, y: G.player.y, r: 120, d: 0.7, color: '#ffe9a0', follow: true });
      UI.onLevel();
    }
  }
  for (const s of S.slots) {
    const g = gemById(s.skill); if (!g || g.lvl >= GEM_MAX) continue;
    g.xp += x;
    while (g.lvl < GEM_MAX && g.xp >= gemXpNext(g.lvl)) { g.xp -= gemXpNext(g.lvl); g.lvl++; statsDirty = true; UI.toast(SKILLS[g.id].name + ' reached level ' + g.lvl, '#58d8c8'); }
  }
}
function dropAt(x, y, o, spread) {
  spread = spread || 14;
  o.x = x + rnd(-spread, spread); o.y = y + rnd(-spread, spread);
  if (!walk(o.x, o.y)) { o.x = x; o.y = y; }
  o.t = 0; G.drops.push(o);
}
function killMob(m) {
  m.dead = true; S.stats.kills++; R.kills++;
  const L = G.zi.level, diff = S.level - L, find = zoneFind(L), qty = zoneQuantity(L);
  gainXp(m.xp * (diff > 4 ? Math.max(0.1, 1 - (diff - 4) * 0.15) : 1));
  gainRunXp(m.boss ? (m.final ? 10 : 6) : [1, 2, 4][m.rar]);
  if (P.lifeOnKill) heal(P.lifeOnKill);
  addFx({ k: 'burst', x: m.x, y: m.y, r: m.r * 2.2, d: 0.35, color: m.color });
  const ri = m.boss ? 3 : m.rar;
  if (Math.random() < [0.4, 0.8, 1, 1][ri]) dropAt(m.x, m.y, { gold: Math.max(1, Math.round((3 + L * 1.6) * rnd(0.6, 1.4) * [1, 2, 4, 12][ri] * P.gold)) });
  const n = m.boss ? (m.final ? 4 : 2) : (Math.random() < [0.06, 0.25, 0.8][m.rar] * qty ? 1 : 0);
  for (let i = 0; i < n; i++) dropAt(m.x, m.y, { item: makeItem(L + (m.boss ? 1 : 0), { rarityMult: P.rarity * find * [1, 1.5, 2.5, 4][ri], rarity: m.boss && i === 0 ? (m.final ? 2 : 1) : undefined }) }, m.boss ? 34 : 14);
  if (Math.random() < [0.004, 0.015, 0.06, m.final ? 0.6 : 0.2][ri]) dropAt(m.x, m.y, { gem: randomGem() });
  if (m.boss) {
    S.stats.bosses = (S.stats.bosses || 0) + 1;
    for (const o of G.mobs) if (!o.dead && o !== m) { o.dead = true; addFx({ k: 'burst', x: o.x, y: o.y, r: o.r * 2, d: 0.3, color: o.color }); }
    G.eprojs.length = 0;
    R.picks++; R.why = 'boss';
    heal(P.maxLife * 0.3);
  }
}
function pickUp(d, quiet) {
  const pl = G.player;
  if (d.gold) { S.gold += d.gold; if (!quiet) addText(pl.x, pl.y - 26, '+' + d.gold, '#ffd84a'); return true; }
  if (d.gem) { S.gems.push(d.gem); R.gems++; UI.toast('Gem found: ' + SKILLS[d.gem.id].name, '#58d8c8'); UI.onLoot('gem'); return true; }
  if (d.item.rarity < S.opts.autoSell) { const v = itemValue(d.item); S.gold += v; if (!quiet) addText(pl.x, pl.y - 26, '+' + v, '#ffd84a'); return true; }
  if (S.inv.length < INV_SIZE) {
    S.inv.push(d.item); R.items++;
    if (d.item.rarity >= 2) UI.toast(d.item.name, RARITY_COLOR[d.item.rarity]);
    UI.onLoot(); return true;
  }
  if (quiet) { S.gold += itemValue(d.item); return true; }   // bag full on the way out: sold instead of lost
  return false;
}
function damagePlayer(amt, type) {
  const pl = G.player;
  if (G.dead || pl.blink > 0 || pl.hurt > 0) return;
  if (Math.random() * 100 < P.dodge) { addText(pl.x, pl.y - 18, 'Dodge', '#9fe6a0'); return; }
  if (type === 'phys') amt *= 1 - Math.min(0.8, P.armour / (P.armour + 8 * amt));
  else amt *= 1 - (P.res[type] || 0) / 100;
  pl.life -= amt; pl.flash = 0.15; pl.hurt = 0.18; G.shake = Math.min(8, G.shake + 3 + amt / P.maxLife * 20);
  addText(pl.x, pl.y - 18, String(Math.max(1, Math.round(amt))), '#ff6a5c');
  if (pl.life <= 0) { pl.life = 0; G.dead = true; S.stats.deaths++; input.x = input.y = 0; endRun(false); }
}

/* ===== player skills ===== */
function castSkill(info) {
  const pl = G.player, d = info.def, sa = Math.sqrt(info.area);
  switch (d.kind) {
    case 'arc': {
      // a full-strength sweep up close, and a weaker wave that carries the cut further
      const R0 = d.range * sa, t = nearestMob(pl.x, pl.y, 260 * sa); if (!t) return false;
      const ang = Math.atan2(t.y - pl.y, t.x - pl.x), hit = []; pl.face = ang;
      for (const m of mobsInRange(pl.x, pl.y, R0)) {
        let da = Math.abs(Math.atan2(m.y - pl.y, m.x - pl.x) - ang); if (da > Math.PI) da = Math.PI * 2 - da;
        if (da < 1.25 || dist2(pl.x, pl.y, m.x, m.y) < (m.r + 16) * (m.r + 16)) { hitMob(m, info); hit.push(m); }
      }
      addFx({ k: 'arc', x: pl.x, y: pl.y, r: R0, a: ang, d: 0.18, color: d.color, follow: true });
      const wi = Object.assign({}, info, { dmg: { phys: info.dmg.phys * 0.6, fire: info.dmg.fire * 0.6, cold: info.dmg.cold * 0.6, light: info.dmg.light * 0.6 } });
      G.projs.push({ x: pl.x, y: pl.y, vx: Math.cos(ang) * 380, vy: Math.sin(ang) * 380, r: 14, life: 0.7 * sa, info: wi, pierce: 99, chain: 0, hit, color: d.color, kind: 'wave' });
      return true;
    }
    case 'bolt': case 'lance': {
      const t = nearestMob(pl.x, pl.y, 900); if (!t) return false;
      const ang = Math.atan2(t.y - pl.y, t.x - pl.x); pl.face = ang;
      const n = 1 + info.proj, spd = d.kind === 'lance' ? 440 : 340;
      for (let i = 0; i < n; i++) {
        const a = ang + (i - (n - 1) / 2) * 0.2;
        G.projs.push({ x: pl.x, y: pl.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, r: d.kind === 'lance' ? 5 : 6, life: 2.2, info, pierce: info.pierce, chain: info.chain, hit: [], color: d.color, kind: d.kind });
      }
      return true;
    }
    case 'nova': {
      const R0 = d.range * sa; if (!nearestMob(pl.x, pl.y, R0)) return false;
      for (const m of mobsInRange(pl.x, pl.y, R0)) hitMob(m, info);
      addFx({ k: 'ring', x: pl.x, y: pl.y, r: R0, d: 0.3, color: d.color, fill: true });
      return true;
    }
    case 'chain': {
      let t = nearestMob(pl.x, pl.y, d.range * 1.5); if (!t) return false;
      pl.face = Math.atan2(t.y - pl.y, t.x - pl.x);
      const hit = [], pts = [{ x: pl.x, y: pl.y }];
      for (let i = 0; i <= info.chain && t; i++) { hit.push(t); pts.push({ x: t.x, y: t.y }); hitMob(t, info); t = nearestMob(t.x, t.y, 160, hit); }
      addFx({ k: 'bolt', pts, d: 0.16, color: d.color });
      return true;
    }
    case 'blink': {
      const c = mobsInRange(pl.x, pl.y, d.range).filter(m => los(pl.x, pl.y, m.x, m.y, true)); if (!c.length) return false;
      const t = pick(c), ang = Math.atan2(t.y - pl.y, t.x - pl.x), ox = pl.x, oy = pl.y;
      let nx = t.x - Math.cos(ang) * (t.r + PLAYER_R + 2), ny = t.y - Math.sin(ang) * (t.r + PLAYER_R + 2);
      if (!free(nx, ny, PLAYER_R)) { nx = ox; ny = oy; }
      pl.x = nx; pl.y = ny; pl.face = ang; pl.blink = 0.15;
      const R0 = 46 * sa;
      for (const m of mobsInRange(pl.x, pl.y, R0)) hitMob(m, info, m === t ? 1 : 0.6);
      addFx({ k: 'trail', x: ox, y: oy, x2: pl.x, y2: pl.y, d: 0.22, color: d.color });
      addFx({ k: 'ring', x: pl.x, y: pl.y, r: R0, d: 0.2, color: d.color, fill: true });
      return true;
    }
    case 'meteor': {
      const c = mobsInRange(pl.x, pl.y, d.range * 1.4).filter(m => los(pl.x, pl.y, m.x, m.y)); if (!c.length) return false;
      const t = pick(c), x = t.x, y = t.y, R0 = 72 * sa, room = G;
      addFx({ k: 'warn', x, y, r: R0, d: 0.7, color: d.color });
      G.delayed.push({ t: 0.7, fn() { if (G !== room) return; for (const m of mobsInRange(x, y, R0)) hitMob(m, info); addFx({ k: 'ring', x, y, r: R0 * 1.15, d: 0.35, color: '#ffb060', fill: true }); G.shake = Math.min(8, G.shake + 2.5); } });
      return true;
    }
  }
  return false;
}
function orbitBlades(info) {
  const n = info.def.blades + info.proj, R0 = info.def.range * Math.sqrt(info.area), out = [];
  for (let k = 0; k < n; k++) { const a = G.t * 3.4 + k * Math.PI * 2 / n; out.push({ x: G.player.x + Math.cos(a) * R0, y: G.player.y + Math.sin(a) * R0, a }); }
  return out;
}
function updateOrbit(info) {
  const bl = orbitBlades(info), pl = G.player, reach = info.def.range * Math.sqrt(info.area) + 50;
  for (const m of G.mobs) {
    if (m.dead || G.t < m.orbT || dist2(pl.x, pl.y, m.x, m.y) > reach * reach) continue;
    const inside = dist2(pl.x, pl.y, m.x, m.y) < (reach - 42 + m.r) * (reach - 42 + m.r);
    if (inside || bl.some(b => dist2(b.x, b.y, m.x, m.y) < (m.r + 13) * (m.r + 13))) { hitMob(m, info); m.orbT = G.t + info.cd; }
  }
}

/* ===== monsters ===== */
const EL_COLOR = { fire: '#ff7a3c', cold: '#8fd8ff', light: '#f7f08a', phys: '#c9b8a0' };
function shoot(m, ang, spd, dmg, r) {
  const el = G.zi.el;
  G.eprojs.push({ x: m.x + Math.cos(ang) * m.r * 0.8, y: m.y + Math.sin(ang) * m.r * 0.8, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, r: r || 6, life: 5, dmg, el, color: EL_COLOR[el] });
}
function fan(m, n, spread, spd, dmg) { const a = Math.atan2(G.player.y - m.y, G.player.x - m.x); for (let i = 0; i < n; i++) shoot(m, a + (i - (n - 1) / 2) * spread, spd, dmg); }
function ring(m, n, off, spd, dmg) { for (let i = 0; i < n; i++) shoot(m, off + i * Math.PI * 2 / n, spd, dmg); }
function dashStep(m, dt, speed) {
  const moved = moveEnt(m, Math.cos(m.ang) * speed * dt, Math.sin(m.ang) * speed * dt, m.r);
  const pl = G.player;
  if (!m.dashHit && dist2(m.x, m.y, pl.x, pl.y) < (m.r + PLAYER_R) * (m.r + PLAYER_R)) { m.dashHit = true; damagePlayer(m.dmg * 1.3, 'phys'); }
  return moved;
}
function updateMob(m, dt) {
  const pl = G.player, dx = pl.x - m.x, dy = pl.y - m.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
  const slow = m.chill > 0 ? 0.65 : 1, sp = m.spd * slow * dt;
  m.atkT -= dt * slow; m.wob += dt * 6;
  const contact = () => { if (d < m.r + PLAYER_R + 4 && m.atkT <= 0) { m.atkT = 1.1; m.lunge = 0.18; damagePlayer(m.dmg, 'phys'); } };
  if (m.boss) { updateBoss(m, dt, d, sp); return; }
  if (m.totem) {
    if (m.atkT <= 0 && los(m.x, m.y, pl.x, pl.y)) {
      m.atkT = 2.8; m.n = (m.n || 0) + 1;
      if (m.n % 2) ring(m, 8, m.wob, 120, m.dmg * 0.8); else fan(m, 3, 0.28, 150, m.dmg);
    }
    return;
  }
  if (m.charge) {
    m.stT -= dt * slow;
    if (m.st === 'walk') {
      chase(m, sp); contact();
      if (m.stT <= 0 && d < 360 && los(m.x, m.y, pl.x, pl.y, true)) { m.st = 'aim'; m.stT = 0.65; m.ang = Math.atan2(dy, dx); addFx({ k: 'line', x: m.x, y: m.y, a: m.ang, len: 300, w: m.r * 2, d: 0.65, color: '#ff5a3a' }); }
    } else if (m.st === 'aim') { if (m.stT <= 0) { m.st = 'dash'; m.stT = 0.6; m.dashHit = false; } }
    else if (m.st === 'dash') { if (!dashStep(m, dt, 360) || m.stT <= 0) { m.st = 'rest'; m.stT = 0.6; } }
    else if (m.st === 'rest' && m.stT <= 0) { m.st = 'walk'; m.stT = rnd(2.2, 3.4); }
    return;
  }
  if (m.ranged) {
    const sees = los(m.x, m.y, pl.x, pl.y);
    if (!sees || d > 250) chase(m, sp);
    else if (d < 150) moveEnt(m, -ux * sp * 0.8, -uy * sp * 0.8, m.r);
    else moveEnt(m, -uy * sp * 0.5 * Math.sin(m.wob * 0.2), ux * sp * 0.5 * Math.sin(m.wob * 0.2), m.r);
    if (m.atkT <= 0 && sees && d < 420) { m.atkT = 2.2; shoot(m, Math.atan2(dy, dx), 165, m.dmg); m.lunge = 0.15; }
    return;
  }
  if (d > m.r + PLAYER_R + 2) chase(m, sp);
  contact();
}
// bosses cycle through their attack patterns
function updateBoss(m, dt, d, sp) {
  const pl = G.player, fin = m.final, bd = m.dmg * 0.5;
  m.stT -= dt;
  if (m.st === 'idle') {
    if (d > m.r + PLAYER_R + 6) chase(m, sp * 0.8);
    if (d < m.r + PLAYER_R + 6 && m.atkT <= 0) { m.atkT = 1.2; m.lunge = 0.2; damagePlayer(m.dmg, 'phys'); }
    if (m.stT <= 0) {
      m.st = m.pats[m.pi % m.pats.length]; m.pi++; m.n = 0; m.emitT = 0;
      if (m.st === 'ring') m.stT = fin ? 0.8 : 0.4;
      if (m.st === 'fan') m.stT = fin ? 1.0 : 0.7;
      if (m.st === 'spiral') { m.stT = 2.2; m.ang = rnd(0, 6.28); }
      if (m.st === 'dash') { m.stT = fin ? 0.65 : 0.8; m.ang = Math.atan2(pl.y - m.y, pl.x - m.x); addFx({ k: 'line', x: m.x, y: m.y, a: m.ang, len: 520, w: m.r * 2, d: m.stT, color: '#ff3a2a' }); }
      if (m.st === 'summon') m.stT = 0.3;
    }
    return;
  }
  m.emitT -= dt;
  if (m.st === 'ring') {
    if (m.emitT <= 0 && m.n < (fin ? 2 : 1)) { m.emitT = 0.35; ring(m, fin ? 18 : 14, m.n * 0.17 + m.wob, 125, bd); m.n++; addFx({ k: 'ring', x: m.x, y: m.y, r: 60, d: 0.3, color: EL_COLOR[G.zi.el] }); }
  } else if (m.st === 'fan') {
    if (m.emitT <= 0 && m.n < (fin ? 3 : 2)) { m.emitT = 0.32; fan(m, 5, 0.22, 165, bd); m.n++; }
  } else if (m.st === 'spiral') {
    if (m.emitT <= 0) { m.emitT = fin ? 0.07 : 0.09; m.ang += 0.32; shoot(m, m.ang, 130, bd * 0.8); shoot(m, m.ang + Math.PI, 130, bd * 0.8); }
  } else if (m.st === 'dash') {
    if (m.n === 0 && m.stT <= 0) { m.n = 1; m.stT = 0.7; m.dashHit = false; }
    else if (m.n === 1) { if (!dashStep(m, dt, fin ? 470 : 430) && m.stT < 0.6) m.stT = 0; }
  } else if (m.st === 'summon') {
    if (m.n === 0) { m.n = 1; const alive = G.mobs.filter(o => !o.boss && !o.dead).length; for (let k = 0; k < Math.min(3, 8 - alive); k++) spawnMob({ type: 'swarm', x: m.x + rnd(-40, 40), y: m.y + rnd(-40, 40) }); addFx({ k: 'ring', x: m.x, y: m.y, r: 70, d: 0.4, color: '#9fe66a', fill: true }); }
  }
  if (m.stT <= 0 && !(m.st === 'dash' && m.n === 0)) { m.st = 'idle'; m.stT = fin ? 1.1 : 1.5; }
}

/* ===== main update ===== */
function update(dt) {
  if (!G || G.dead || !R || R.over) return;
  const pl = G.player;
  G.t += dt;
  let ix = input.x, iy = input.y; const il = Math.hypot(ix, iy);
  if (il > 1) { ix /= il; iy /= il; }
  const moving = il > 0.1;
  moveEnt(pl, ix * P.speed * dt, iy * P.speed * dt, PLAYER_R);
  if (moving) { pl.walk += dt * Math.min(1, il); if (G.t - pl.castT > 0.3) pl.face = Math.atan2(iy, ix); }
  pl.life = Math.min(P.maxLife, pl.life + P.regen * dt);
  if (pl.flash > 0) pl.flash -= dt;
  if (pl.blink > 0) pl.blink -= dt;
  if (pl.hurt > 0) pl.hurt -= dt;
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 22);
  G.flowT -= dt;
  if (G.flowT <= 0) { G.flowT = 0.25; updateFlow(); }
  const awake = G.t > 0.8;   // monsters fade in at the start of a room before they act

  // skills reload all the time but only fire while the player stands still; orbiting blades never stop
  for (let i = 0; i < 4; i++) {
    const info = P.skills[i]; if (!info) continue;
    if (info.def.kind === 'orbit') { if (awake) updateOrbit(info); continue; }
    if (G.cds[i] > 0) G.cds[i] -= dt;
    if (G.cds[i] <= 0 && !moving && awake) {
      if (castSkill(info)) {
        G.cds[i] = info.cd; pl.castT = G.t;
        const room = G;
        for (let e = 1; e <= info.echo; e++) G.delayed.push({ t: 0.2 * e, fn() { if (G === room) castSkill(info); } });
      } else G.cds[i] = 0.06;
    }
  }
  for (let i = G.delayed.length - 1; i >= 0; i--) { const d = G.delayed[i]; d.t -= dt; if (d.t <= 0) { G.delayed.splice(i, 1); d.fn(); } }

  // player projectiles
  for (let i = G.projs.length - 1; i >= 0; i--) {
    const p = G.projs[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    let gone = p.life <= 0;
    if (!gone && solid(p.x, p.y)) { gone = true; addFx({ k: 'burst', x: p.x, y: p.y, r: 10, d: 0.15, color: p.color }); }
    if (!gone) for (const m of G.mobs) {
      if (m.dead || p.hit.includes(m) || dist2(p.x, p.y, m.x, m.y) > (m.r + p.r) * (m.r + p.r)) continue;
      p.hit.push(m); hitMob(m, p.info);
      addFx({ k: 'burst', x: p.x, y: p.y, r: 12, d: 0.15, color: p.color });
      if (p.chain > 0) {
        const t = nearestMob(p.x, p.y, 200, p.hit);
        if (t) { const sp = Math.hypot(p.vx, p.vy), a = Math.atan2(t.y - p.y, t.x - p.x); p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp; p.chain--; p.life = Math.max(p.life, 0.8); break; }
      }
      if (p.pierce > 0) { p.pierce--; continue; }
      gone = true; break;
    }
    if (gone) G.projs.splice(i, 1);
  }
  // enemy projectiles
  for (let i = G.eprojs.length - 1; i >= 0; i--) {
    const p = G.eprojs[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt;
    if (p.life <= 0 || solid(p.x, p.y)) { G.eprojs.splice(i, 1); continue; }
    if (dist2(p.x, p.y, pl.x, pl.y) < (PLAYER_R + p.r - 2) * (PLAYER_R + p.r - 2)) { damagePlayer(p.dmg, p.el); G.eprojs.splice(i, 1); if (G.dead) return; }
  }

  // monsters
  for (const m of G.mobs) {
    if (m.dead) continue;
    if (m.flash > 0) m.flash -= dt;
    if (m.burnT > 0) { m.burnT -= dt; damageMob(m, m.burn * dt, false, true); if (m.dead) continue; if (m.burnT <= 0) m.burn = 0; }
    if (!awake) continue;
    if (m.lunge > 0) m.lunge -= dt;
    if (m.chill > 0) m.chill -= dt;
    updateMob(m, dt);
    if (G.dead) return;
  }
  // keep monsters from stacking on top of each other
  const ms = G.mobs;
  for (let i = 0; i < ms.length; i++) {
    const a = ms[i]; if (a.dead || a.totem) continue;
    for (let j = i + 1; j < ms.length; j++) {
      const b = ms[j]; if (b.dead) continue;
      const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 === 0) continue;
      const d = Math.sqrt(d2), push = (rr - d) / 2, nx = dx / d, ny = dy / d;
      const wa = a.boss ? 0 : b.boss || b.totem ? 2 : 1, wb = b.boss || b.totem ? 0 : a.boss ? 2 : 1;
      moveEnt(a, -nx * push * wa, -ny * push * wa, a.r); moveEnt(b, nx * push * wb, ny * push * wb, b.r);
    }
  }
  for (let i = ms.length - 1; i >= 0; i--) if (ms[i].dead) ms.splice(i, 1);

  // room cleared: the door opens and all loot flies to the player
  if (!G.cleared && !ms.length) {
    G.cleared = true; G.grid[G.door] = 1; G.eprojs.length = 0;
    addFx({ k: 'ring', x: (G.door + 0.5) * TILE, y: TILE * 0.5, r: 70, d: 0.6, color: '#9fe6ff', fill: true });
    UI.onClear();
  }
  for (let i = G.drops.length - 1; i >= 0; i--) {
    const d = G.drops[i]; d.t += dt;
    const dd = Math.sqrt(dist2(d.x, d.y, pl.x, pl.y));
    if ((G.cleared && d.t > 0.4) || (d.gold && dd < 130 && d.t > 0.25)) {
      const sp = (G.cleared ? 520 : 320) * dt / Math.max(dd, 1);
      d.x += (pl.x - d.x) * Math.min(1, sp); d.y += (pl.y - d.y) * Math.min(1, sp);
    }
    if (dd < (d.gold ? 18 : P.pickup) && d.t > 0.3) {
      if (pickUp(d)) G.drops.splice(i, 1);
      else if (!d.warned || G.t - d.warned > 4) { d.warned = G.t; UI.toast('Inventory is full', '#ff8a7a'); }
    }
  }
  if (G.drops.length > 120) G.drops.splice(0, G.drops.length - 120);
  if (G.cleared && !R.picks && pl.y < TILE * 0.9 && Math.abs(pl.x - (G.door + 0.5) * TILE) < TILE) { nextRoom(); return; }

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
function socketGem(slot, gemId) {
  const g = gemById(gemId); if (!g) return;
  const prev = gemSocketed(gemId);
  if (prev) S.slots[prev.slot].skill = null;
  S.slots[slot].skill = gemId;
  computeStats(); save();
}
function unsocket(slot) { S.slots[slot].skill = null; computeStats(); save(); }
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
