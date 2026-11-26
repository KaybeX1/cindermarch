'use strict';
/* ===== game flow: save, characters, equipment stats, runs, tower, world boss, rewards, shop, tree ===== */
const SAVE_KEY = 'cindermarch_v3';
let S = null;                 // whole save
let CH = null;                // current character
let RS = null;                // current session (run / tower / world boss) state that is saved
let MODE = 'menu';            // 'menu' | 'run' | 'tower' | 'wb'
const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
const weekId = () => { const d = new Date(); const day = (d.getDay() + 6) % 7; const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day); return m.toDateString(); };

// ---------- support state used by combat (RUN.*) ----------
const RUN = {
  sup: {},
  supLvl(skill, s) { if (!skill) return 0; const q = this.sup[s]; if (!q || q.gone) return 0; return SUPPORTS[s].gems.includes(skill) ? q.lvl : 0; },
  anySup(s) { const q = this.sup[s]; return q && !q.gone ? q.lvl : 0; },
  corr(s) { const q = this.sup[s]; return !!(q && !q.gone && q.fx); },
  rotDur() { return Math.max(1, rotationSlots().length) * castInterval(); },
  gainXp(v) { sessionXp(v); }, gainGold(n) { if (RS) RS.gold += Math.round(n * goldPerOrb()); },
  onKill(e) { sessionKill(e); },
};

// ---------- save ----------
function load() {
  try { S = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { S = null; }
  if (!S || !S.chars) S = { chars: [], cur: null, set: { autoSell: 0, sound: 1 } };
  CH = S.chars.find(c => c.id === S.cur) || null;
}
function save() { try { if (CH && RS) CH.session = RS; else if (CH) CH.session = null; localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {} }

// ---------- characters (Schéma 2) ----------
function newChar(name, gender, el) {
  const [wt, gem] = STARTER[el];
  const c = { id: uid(), name: name || 'Poutník', gender, el, lvl: 1, xp: 0, gold: 0, dia: START_DIAMONDS, energy: TOWER.maxEnergy, energyT: Date.now(), keys: WB_KEYS_PER_DAY, keyDay: today(),
    items: [], gems: [], sgems: [], equip: {}, tree: [0], prog: { maxCh: [1, 0, 0], cleared: {} }, runsDone: 0, tower: { floor: [1, 0, 0], best: [0, 0, 0] },
    wb: { day: today(), dmg: 0, claimed: 0, killed: 0, tierBest: -1, week: weekId(), weekKills: [0, 0, 0, 0], weekLoot: [{ g: 0, d: 0 }, { g: 0, d: 0 }, { g: 0, d: 0 }, { g: 0, d: 0 }], wbTier: 0 },
    shop: null, zoneReached: 1, created: Date.now() };
  const w = makeItem('weapon', 0, wt); c.items.push(w); c.equip.weapon = w.id;
  const g = { id: uid(), sk: gem }; c.gems.push(g); w.gem = g.id;
  S.chars.push(c); S.cur = c.id; CH = c; save(); return c;
}
function selectChar(id) { S.cur = id; CH = S.chars.find(c => c.id === id); save(); }
function deleteChar(id) { S.chars = S.chars.filter(c => c.id !== id); if (S.cur === id) { S.cur = null; CH = null; } save(); }

// ---------- items (Schéma 1) ----------
function makeItem(slot, rar, type) {
  const it = { id: uid(), slot, rar, lvl: 1, spent: 0, gem: null };
  if (slot === 'weapon') it.type = type || pick(Object.keys(WEAPONS));
  else if (slot === 'offhand') it.type = type || 'shield';
  else if (slot === 'ring1' || slot === 'ring2') it.stat = rnd() < 0.5 ? 'dmg' : 'hp';
  else if (slot === 'amulet') it.stat = rnd() < 0.5 ? 'dmg' : 'as';
  return it;
}
function itemName(it) {
  if (it.rar === 3) return UNIQUE_NAMES[it.slot] || 'Unikát';
  if (it.slot === 'weapon') return WEAPONS[it.type].name;
  if (it.slot === 'offhand') return it.type === 'wand' ? 'Hůlka (druhá)' : SHIELD.name;
  return SLOT[it.slot].name;
}
// main stat value of an item: {k: 'dmg'|'hp'|'armour'|'as', v}
function itemStat(it) {
  const m = RARITY[it.rar].mult, L = it.lvl;
  if (it.slot === 'weapon') return { k: 'dmg', v: WEAPONS[it.type].dmg * itemScale(L) * m };
  if (it.slot === 'offhand') return it.type === 'wand' ? { k: 'dmg', v: WEAPONS.wand.dmg * 0.5 * itemScale(L) * m } : { k: 'armour', v: SHIELD.base * itemScale(L) * m };
  const s = SLOT[it.slot];
  if (it.stat) { const b = s.base[it.stat]; return { k: it.stat, v: it.stat === 'as' ? b * asScale(L) * m : b * itemScale(L) * m }; }
  return { k: s.stat, v: s.stat === 'as' ? s.base * asScale(L) * m : s.base * itemScale(L) * m };
}
const STATNAME = { dmg: 'dmg', hp: 'HP', armour: 'armour', as: '% rychlost útoku' };
const statText = s => s.k === 'as' ? '+' + s.v.toFixed(1) + STATNAME.as : '+' + fmt(s.v) + ' ' + STATNAME[s.k];
const itemById = id => CH.items.find(i => i.id === id);
const gemById = id => CH.gems.find(g => g.id === id) || CH.sgems.find(g => g.id === id);
const equipped = slot => CH.equip[slot] ? itemById(CH.equip[slot]) : null;
const offhandUnlocked = () => CH.tree.some(n => TREE_DATA.nodes[n] && TREE_DATA.nodes[n][4] === 'offhand');
function canEquip(it) {
  const w = equipped('weapon');
  if (it.slot === 'offhand') { if (!offhandUnlocked()) return 'Off-hand se odemyká ve skill tree (Dual Mastery).'; if (!w) return null; if (WEAPONS[w.type].hands === 2) return 'Obouruční zbraň nemá off-hand.'; if (w.type === 'wand' && it.type !== 'wand') return 'K hůlce jde jen druhá hůlka.'; if (w.type === 'mace' && it.type !== 'shield') return 'K palcátu jde jen štít.'; }
  return null;
}
function equipItem(it) {
  const slot = it.slot === 'ring1' || it.slot === 'ring2' ? (CH.equip.ring1 && !CH.equip.ring2 ? 'ring2' : CH.equip.ring1 && CH.equip.ring2 && CH.equip.ring1 !== it.id ? (it._target || 'ring1') : 'ring1') : it.slot;
  const old = equipped(slot); if (old) { old.gem = null && 0; }
  if (old && old.gem) { /* gems of the swapped item return to the bag (Doplněná rozhodnutí) */ old.gem = null; }
  CH.equip[slot] = it.id;
  if (slot === 'weapon') { const off = equipped('offhand'); if (off && canEquip(off)) { delete CH.equip.offhand; } }
  save();
}
function unequip(slot) { const it = equipped(slot); if (!it) return; it.gem = null; delete CH.equip[slot]; save(); }
const isEquipped = it => Object.values(CH.equip).includes(it.id);
function sellItem(it) { if (isEquipped(it)) return; CH.gold += sellValue(it); it.gem = null; CH.items = CH.items.filter(i => i !== it); save(); }
function upgradeItem(it, times = 1) { let n = 0; while (n < times && it.lvl < 100) { const c = upgradeCost(it.lvl, it.rar); if (CH.gold < c) break; CH.gold -= c; it.spent += c; it.lvl++; n++; } save(); return n; }
// ---------- gems ----------
const gemSocketKind = slot => SLOT[slot === 'offhand' ? 'offhand' : slot].socket;
function socketOk(it, gem) {
  if (gem.sk) { if (it.slot === 'offhand') return it.type === 'wand'; return SLOT[it.slot].socket === 'skill'; }
  if (it.slot === 'offhand') return it.type === 'shield'; return SLOT[it.slot].socket === 'stat';
}
function socketGem(it, gem) { for (const i of CH.items) if (i.gem === gem.id) i.gem = null; it.gem = gem.id; save(); }
const gemInUse = g => CH.items.some(i => i.gem === g.id);
function slotUnlocked(slot) {
  const L = CH.lvl;
  if (slot === 'weapon') return true;
  if (slot === 'offhand') { const it = equipped('offhand'); return offhandUnlocked() && (!it || it.type === 'wand' || L >= STAT_SOCKET_LEVEL); }
  if (slot === 'body') return L >= 10; if (slot === 'boots') return L >= 25; if (slot === 'helmet') return L >= 40; if (slot === 'gloves') return CH.runsDone >= 50;
  return L >= STAT_SOCKET_LEVEL;
}
function slotUnlockText(slot) { return { body: 'level 10', boots: 'level 25', helmet: 'level 40', gloves: '50 dokončených runů', offhand: 'Dual Mastery ve stromu' }[slot] || 'level 30'; }

// ---------- tree (Schéma 13) ----------
const TREE_ADJ = (() => { const a = TREE_DATA.nodes.map(() => []); for (const [x, y] of TREE_DATA.edges) { a[x].push(y); a[y].push(x); } return a; })();
const treePoints = () => CH.lvl < 5 ? 0 : 5 + (CH.lvl - 5);
const treeFree = () => treePoints() - (CH.tree.length - 1);
function canAlloc(n) { return !CH.tree.includes(n) && treeFree() > 0 && TREE_ADJ[n].some(m => CH.tree.includes(m)); }
function allocNode(n) { if (!canAlloc(n)) return false; CH.tree.push(n); const nd = TREE_DATA.nodes[n]; if (nd[4] === 'gem') { const id = gemIdByName(nd[6]); if (id && !CH.gems.some(g => g.sk === id && g.tree)) CH.gems.push({ id: uid(), sk: id, tree: n }); } save(); return true; }
function canRefund(n) { if (n === 0 || !CH.tree.includes(n)) return false; const rest = new Set(CH.tree.filter(x => x !== n)); const seen = new Set([0]), q = [0]; while (q.length) { const c = q.pop(); for (const m of TREE_ADJ[c]) if (rest.has(m) && !seen.has(m)) { seen.add(m); q.push(m); } } return seen.size === rest.size; }
const refundCost = () => 50 + CH.lvl * 20;
function refundNode(n) { if (!canRefund(n) || CH.gold < refundCost()) return false; CH.gold -= refundCost(); CH.tree = CH.tree.filter(x => x !== n); const g = CH.gems.find(g => g.tree === n); if (g) { for (const i of CH.items) if (i.gem === g.id) i.gem = null; CH.gems = CH.gems.filter(x => x !== g); } if (TREE_DATA.nodes[n][4] === 'offhand' && !offhandUnlocked()) delete CH.equip.offhand; save(); return true; }
const gemIdByName = name => Object.keys(SKILLS).find(k => SKILLS[k].name === name);

// ---------- derived stats ----------
function computeStats(c = CH) {
  const t = {}; const keys = {};
  for (const n of c.tree) { const nd = TREE_DATA.nodes[n]; if (!nd) continue; for (const k in nd[7]) t[k] = (t[k] || 0) + nd[7][k]; if (nd[4] === 'keystone') keys[nd[6]] = 1; }
  const eq = s => c.equip[s] ? c.items.find(i => i.id === c.equip[s]) : null;
  const w = eq('weapon'), wt = w ? WEAPONS[w.type] : WEAPONS.sword, el = wt.el;
  let dmg = 0, hp = 100 + 8 * (c.lvl - 1), armour = 0, as = 0, redP = 0, greenP = 0, yellow = 0;
  for (const s of SLOTS) { const it = eq(s); if (!it) continue; if (s === 'offhand' && !offhandUnlockedC(c)) continue; const v = itemStat(it); if (v.k === 'dmg') dmg += v.v; else if (v.k === 'hp') hp += v.v; else if (v.k === 'armour') armour += v.v; else if (v.k === 'as') as += v.v;
    if (it.gem && SLOT[s].socket === 'stat' || it.gem && s === 'offhand' && it.type === 'shield') { const g = c.sgems.find(x => x.id === it.gem); if (g && c.lvl >= STAT_SOCKET_LEVEL) { const val = statGemValue(g, gemLevelFromItem(it.lvl)); if (g.col === 'red' || g.col === 'white') redP += val; if (g.col === 'green' || g.col === 'white') greenP += val; if (g.col === 'yellow' || g.col === 'white') yellow += g.col === 'white' ? val * 0.45 : val; } } }
  if (!w) dmg = 5;
  hp *= (1 + ((t.lifePct || 0) + greenP) / 100) * (keys['Pact of Rot'] ? 0.8 : 1);
  armour *= (1 + (t.armourPct || 0) / 100) * (keys.Unbreakable ? 1.4 : 1);
  as += (t.atkSpeed || 0) + (t.castSpeed || 0) + yellow - (keys.Unbreakable ? 15 : 0);
  dmg *= 1 + redP / 100;
  // rotation: gems in unlocked sockets that match the weapon element
  const rot = {}, gemLvl = {};
  for (const s of ROTATION) { const it = eq(s); if (!it || !it.gem) continue; const g = c.gems.find(x => x.id === it.gem); if (!g) continue; const sk = SKILLS[g.sk]; if (!sk || sk.el !== el) continue;
    if (s === 'offhand' && !(it.type === 'wand' && offhandUnlockedC(c))) continue; if (!slotUnlockedC(c, s)) continue; if (sk.group === 'jen se štítem' && !(eq('offhand') && eq('offhand').type === 'shield')) {}
    rot[s] = { id: g.sk, lvl: gemLevelFromItem(it.lvl) }; gemLvl[g.sk] = rot[s].lvl; }
  const sh = eq('offhand');
  return { el, melee: !!wt.melee, weaponType: w ? w.type : 'sword', dmg, hp: Math.round(hp), armour, as, crit: 5 + (t.crit || 0), critMulti: 150 + (t.critMulti || 0), dodge: Math.min(40, t.dodge || 0), t, keys, rot, gemLvl,
    shield: !!(sh && sh.type === 'shield' && offhandUnlockedC(c)), offWand: !!(sh && sh.type === 'wand' && offhandUnlockedC(c)) };
}
const offhandUnlockedC = c => c.tree.some(n => TREE_DATA.nodes[n] && TREE_DATA.nodes[n][4] === 'offhand');
function slotUnlockedC(c, s) { const o = CH; CH = c; const r = slotUnlocked(s); CH = o; return r; }
const power = st => Math.round(st.dmg * 3 + st.hp / 4 + st.armour / 2);

// ---------- energy, keys, daily resets ----------
function tickTimers() {
  if (!CH) return; const now = Date.now();
  if (CH.energy < TOWER.maxEnergy) { const n = Math.floor((now - CH.energyT) / (TOWER.regenMin * 60000)); if (n > 0) { CH.energy = Math.min(TOWER.maxEnergy, CH.energy + n); CH.energyT += n * TOWER.regenMin * 60000; } } else CH.energyT = now;
  if (CH.keyDay !== today()) { CH.keyDay = today(); CH.keys += WB_KEYS_PER_DAY; }
  if (CH.wb.day !== today()) { CH.wb.day = today(); CH.wb.dmg = 0; CH.wb.claimed = 0; CH.wb.killed = 0; }
  if (CH.wb.week !== weekId()) { CH.wb.week = weekId(); CH.wb.weekKills = [0, 0, 0, 0]; CH.wb.weekLoot = [0, 1, 2, 3].map(() => ({ g: 0, d: 0 })); CH.wb.weekDays = [[], [], [], []]; }
  if (!CH.shop || CH.shop.day !== today()) rollShop();
}

// ---------- level (Schéma 6, 11) ----------
function addCharXp(v) {
  const ups = []; if (CH.lvl >= 100) return ups; CH.xp += v;
  while (CH.lvl < 100 && CH.xp >= xpToNext(CH.lvl)) { CH.xp -= xpToNext(CH.lvl); CH.lvl++; const r = levelReward(CH.lvl); grantLevelReward(r); ups.push({ lvl: CH.lvl, r }); }
  return ups;
}
function grantLevelReward(r) {
  if (r.kind === 'gold') CH.gold += r.n; else if (r.kind === 'energy') CH.energy = Math.min(TOWER.maxEnergy * 2, CH.energy + r.n); else if (r.kind === 'diamonds') CH.dia += r.n; else if (r.kind === 'key') CH.keys += r.n;
  else if (r.kind === 'gem') { const g = rollSkillGem(rnd() < 0.4 ? computeStats().el : null); CH.gems.push(g); r.gem = g.sk; }
}
function rollSkillGem(el) {
  if (!el) { const st = computeStats(); const others = ELS.filter(e => e !== st.el); el = rnd() < 0.4 ? st.el : pick(others); }
  const tier = gemsUnlockedTier(CH.zoneReached); const pool = Object.values(SKILLS).filter(s => s.el === el && !s.ex && s.tier <= tier);
  return { id: uid(), sk: pick(pool).id };
}

// ---------- shop (Schéma 12) ----------
const fitRunGold = () => BASE_RUN_XP * fitChapterMult(CH.lvl);
function rollShop() {
  const items = []; for (let i = 0; i < 4; i++) { const slots = SLOTS.filter(s => s !== 'offhand' || offhandUnlocked()); const it = makeItem(pick(slots), rnd() < 0.15 ? 3 : 2); it.price = Math.round(fitRunGold() * (it.rar === 3 ? SHOP.uniqueRuns : SHOP.rareRuns)); items.push(it); }
  const gems = [0, 1].map(() => { const g = rollSkillGem(); g.price = Math.round(fitRunGold() * SHOP.gemRuns); return g; });
  CH.shop = { day: today(), items, gems, bought: [] };
}
function buyShop(kind, i) { const sh = CH.shop, x = kind === 'item' ? sh.items[i] : sh.gems[i]; if (!x || x.sold || CH.gold < x.price) return false; CH.gold -= x.price; x.sold = 1; if (kind === 'item') { const it = Object.assign({}, x); delete it.price; delete it.sold; it.id = uid(); CH.items.push(it); } else CH.gems.push({ id: uid(), sk: x.sk }); save(); return true; }
function buyChest(el) { if (CH.dia < SHOP.chest) return null; CH.dia -= SHOP.chest; const g = rollSkillGem(el); CH.gems.push(g); save(); return g; }
function refreshShop() { if (CH.dia < SHOP.refresh) return false; CH.dia -= SHOP.refresh; rollShop(); save(); return true; }

// ---------- stat gem merging (Schéma 8) ----------
function mergeGems(gs) {
  if (gs.length !== 3) return null; const tier = Math.min(...gs.map(g => g.tier)); const cost = mergeCost(tier); if (CH.gold < cost) return null;
  const cols = gs.map(g => g.col), cnt = {}; cols.forEach(c => cnt[c] = (cnt[c] || 0) + 1);
  let col; if (cnt.white === 3) col = 'white'; else { const colored = cols.filter(c => c !== 'white'); const c2 = {}; colored.forEach(c => c2[c] = (c2[c] || 0) + 1); const maj = Object.keys(c2).find(k => c2[k] >= 2); col = maj || (colored.length === 2 && cnt.white === 1 && colored[0] === colored[1] ? colored[0] : (Object.keys(c2).length === 1 && colored.length ? colored[0] : pick(['red', 'green', 'yellow']))); }
  let q = gs.reduce((a, g) => a + (g.q || 0), 0) / 3; let nt = tier + 1; if (gs.every(g => g.tier === 15)) { nt = 15; q = Math.min(20, q + 1); }
  CH.gold -= cost; for (const g of gs) { for (const i of CH.items) if (i.gem === g.id) i.gem = null; } CH.sgems = CH.sgems.filter(g => !gs.includes(g));
  const ng = { id: uid(), col, tier: Math.min(15, nt), q: Math.round(q * 10) / 10 }; CH.sgems.push(ng); save(); return ng;
}
const newStatGem = (tier, white) => ({ id: uid(), col: white ? 'white' : pick(['red', 'green', 'yellow']), tier, q: Math.round((1 + rnd() * 19) * 10) / 10 });

// ================= sessions =================
// RS: { kind, ch, diff, room, stage, sxp, picks, hp, sup, gold, xp, dia, items:[], kills, done, ... }
function sessionStats() { const st = computeStats(); if (RS && RS.insane) st.hp = 1; return st; }
function startRun(ch, diff) {
  RS = { kind: 'run', ch, diff, room: 1, stage: 1, sxp: 0, picks: 1, hp: null, sup: {}, gold: 0, xp: 0, xpRooms: 0, dia: 0, items: [], kills: 0, insane: diff === 2, seed: (Math.random() * 1e9) | 0, res: null };
  MODE = 'run'; RUN.sup = RS.sup; enterRoom(); save();
}
function roomKind(r) { return TRADER_ROOMS.includes(r) ? 'trader' : ELITE_ROOMS.includes(r) ? 'elite' : BOSS_ROOMS.includes(r) ? 'boss' : 'normal'; }
const zoneEnemyPool = z => [['minion', 'minion', 'archer', 'swarm', 'warrior'], ['minion', 'archer', 'mage', 'rogue', 'warrior', 'swarm'], ['minion', 'mage', 'rogue', 'warrior', 'totem', 'archer'], ['warrior', 'mage', 'rogue', 'totem', 'archer', 'minion'], ['warrior', 'mage', 'rogue', 'totem', 'archer', 'swarm']][z];
const BOSS_PATS = [[['fan', 'slam', 'summon'], ['ring', 'slam', 'dash', 'summon']], [['fan', 'dash', 'summon', 'slam'], ['ring', 'spiral', 'slam', 'summon']], [['fan', 'ring', 'dash', 'pools'], ['spiral', 'slam', 'pools', 'summon', 'ring']],
  [['ring', 'dash', 'anvils', 'summon'], ['spiral', 'anvils', 'dash', 'summon', 'fan']], [['spiral', 'fan', 'pools', 'dash'], ['ring', 'spiral', 'anvils', 'firering', 'summon', 'dash']]];
function enterRoom() {
  const r = RS.room, kind = roomKind(r), z = zoneOf(RS.ch), st = sessionStats();
  const room = genRoom(RS.seed + r * 7919, kind === 'boss' ? 'boss' : kind === 'trader' ? 'trader' : 'normal');
  newArena({ mode: 'run', room, zone: z, mlvl: monsterLevel(RS.ch, RS.diff, r), stats: st, hp: RS.hp == null ? st.hp : Math.min(RS.hp, st.hp), res: RS.res, onClear: roomCleared });
  G.kind = kind;
  if (kind === 'trader') { G.started = true; G.clear = true; G.doorOpen = true; room.open = true; G.trader = !RS.traded; }
  else if (kind === 'boss') {
    const B = r === 50 ? ZONES[z].boss : ZONES[z].mini, res = {}; const pct = zoneResPct(z); for (const e of B.res) res[e] = -pct; res[B.vuln] = pct;
    const e = spawnEnemy('warrior', 11, 9, { boss: true, hpMult: r === 50 ? 26 : 16, dmgMult: 1.4, model: B.model, tint: B.tint, scale: r === 50 ? 2 : 1.6, name: B.name, res, pat: BOSS_PATS[z][r === 50 ? 1 : 0] });
    e.r = r === 50 ? 1.3 : 1.05; e.spd = 2.6; G.boss = e; G.started = true;
  } else spawnPack(kind, z);
  G.started = true;
  if (RS.picks > 0) UI.showPick();
}
function spawnPack(kind, z) {
  const pool = zoneEnemyPool(z), spots = floorSpots(G.room, 3, 24); let budget = 3.4 + RS.room * 0.07 + z * 0.4 + (kind === 'elite' ? 2.5 : 0);
  const tint = ZONES[z].tint;
  for (let guard = 0; budget > 0.5 && guard < 40 && spots.length; guard++) {
    const type = pick(pool), d = ENEMY[type], [x, zz] = spots.splice(Math.floor(rnd() * spots.length), 1)[0];
    const rare = kind === 'elite' ? (rnd() < 0.2 ? 2 : rnd() < 0.6 ? 1 : 0) : (rnd() < 0.08 + z * 0.01 ? 1 : 0);
    if (type === 'swarm') { for (let i = 0; i < 3; i++) spawnEnemy('swarm', x + (i - 1) * 0.8, zz + (i % 2) * 0.6, { tint }); budget -= d.cost * 3 * 0.6; continue; }
    spawnEnemy(type, x, zz, { rare, tint }); budget -= d.cost * [1, 2, 3][rare];
  }
}
function roomCleared() {
  if (MODE !== 'run') return sessionCleared();
  const kind = G.kind, m = chapterMult(RS.ch, RS.diff), r = RS.room;
  if (kind === 'trader') return;
  const k = kind === 'elite' ? 'elite' : kind === 'boss' ? (r === 50 ? 'boss50' : 'boss25') : 'normal';
  RS.xp += ROOM_XP[k] * m; RS.gold += Math.round(ROOM_GOLD[k] * (1 + 0.1 * (RS.ch - 1)) * [1, 1.5, 2][RS.diff]);
  if (kind === 'elite') dropItem(false);
  if (kind === 'boss') { const z = zoneOf(RS.ch), dv = DIAMONDS_BOSS[z][RS.diff]; RS.dia += r === 50 ? dv : Math.round(dv / 2); dropItem(true); if (r === 50) dropItem(true); if (r === 25) { stageUp(); } }
  RS.cleared = r;
}
function dropItem(boss) {
  const slots = SLOTS.filter(s => s !== 'offhand' || offhandUnlocked()); const slot = pick(slots); const rar = rollRarity(RS.ch, RS.diff, boss);
  let type = null; if (slot === 'weapon') { const st = computeStats(); type = rnd() < 0.5 ? st.weaponType : null; } if (slot === 'offhand') type = equipped('weapon') && equipped('weapon').type === 'wand' ? 'wand' : 'shield';
  const it = makeItem(slot, rar, type); RS.items.push(it); if (G) { G.loot.push({ x: G.P.x, z: G.P.z - 2, rar, t: 0 }); pushWord(G.P.x, G.P.z, RARITY[rar].name + ' předmět', RARITY[rar].col); }
}
function sessionKill(e) {
  if (!RS) return; RS.kills++;
  if (MODE === 'run' && !e.boss && rnd() < 0.015) dropItem(false);
  if (MODE === 'wb' && e.add && G.P.cursed > 0) G.P.cursed = 0;
}
const goldPerOrb = () => MODE === 'run' ? (1 + 0.1 * (RS.ch - 1)) * [1, 1.5, 2][RS.diff] * 1.2 : 0;
function sessionXp(v) {
  if (!RS) return; const max = 15;
  if (RS.stage >= max) { heal(G.P.max * 0.02 * v); RS.xp += v * 2; return; }
  RS.sxp += v * (MODE === 'tower' ? 3.2 : 1);
  while (RS.stage < max && RS.sxp >= stageNeed(RS.stage)) { RS.sxp -= stageNeed(RS.stage); stageUp(); }
}
function stageUp() { if (RS.stage >= 15) return; RS.stage++; RS.picks++; if (UI.onStage) UI.onStage(); }
// support choices: 3 random, each must help at least one equipped skill gem (Schéma 3, 5)
function rollSupports() {
  const st = computeStats(), skills = Object.values(st.rot).map(r => r.id);
  const pool = Object.values(SUPPORTS).filter(s => s.gems.some(g => skills.includes(g))).filter(s => { const q = RS.sup[s.id]; return !q || (!q.gone && !q.corr && q.lvl < 5); });
  const out = []; while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0].id); return out;
}
function takeSupport(id) { const q = RS.sup[id]; if (q) q.lvl++; else RS.sup[id] = { lvl: 1 }; RS.picks--; save(); }
function takeHealInstead() { RS.picks--; if (G) heal(G.P.max * 0.3); }
// trader (Schéma 4): heal or corrupt one support
function traderHeal() { RS.traded = true; heal(G.P.max); G.trader = false; save(); }
function traderCorrupt(id) { const q = RS.sup[id]; RS.traded = true; G.trader = false; const r = rnd(); let res;
  if (r < 0.6) { q.fx = true; res = 'fx'; } else if (r < 0.85) { q.lvl += 2; res = 'lvl'; } else { q.gone = true; res = 'gone'; } q.corr = true; q.lvl = Math.min(q.lvl, 7); save(); return res; }
function nextRoom() {
  if (MODE !== 'run') return;
  RS.hp = G.P.hp; RS.res = { rage: G.P.rage, heat: G.P.heat, crystals: G.P.crystals, essence: G.P.essence };
  if (RS.room >= ROOMS) return endSession(true);
  RS.room++; RS.traded = false; enterRoom(); save();
}
// ---------- tower (Schéma 8) ----------
function towerUnlocked() { return CH.lvl >= TOWER.unlock; }
function towerDiffOpen(d) { return d === 0 || CH.tower.best[d - 1] >= 5; }
function startTower(diff, floor) {
  tickTimers(); if (CH.energy < TOWER.cost[diff]) return false; CH.energy -= TOWER.cost[diff];
  RS = { kind: 'tower', diff, floor, stage: 5, sxp: 0, picks: 5, sup: {}, gold: 0, xp: 0, dia: 0, items: [], sgems: [], kills: 0, insane: diff === 2, t: 0, bossUp: false };
  MODE = 'tower'; RUN.sup = RS.sup; const st = sessionStats();
  newArena({ mode: 'tower', room: genRoom((Math.random() * 1e9) | 0, 'arena'), zone: Math.min(4, 2 + diff), mlvl: towerMonsterLevel(diff, floor), stats: st, onClear: sessionCleared });
  G.kind = 'arena'; G.started = false; G.room.open = false; G.spawnT = 1; UI.showPick(); save(); return true;
}
function towerTick(dt) {
  if (MODE !== 'tower' || !G || G.P.dead) return; RS.t += dt;
  if (!RS.bossUp) {
    G.spawnT -= dt; if (G.spawnT <= 0 && alive().length < 14) { G.spawnT = 1.6 - Math.min(0.9, RS.t / 300); const pool = zoneEnemyPool(Math.min(4, 2 + RS.diff)); const a = rnd() * 6.28, rr = 5 + rnd() * 3; const x = clamp(G.P.x + Math.sin(a) * rr, 3, 19), z = clamp(G.P.z + Math.cos(a) * rr, 3, 35); if (canStand(G.room, x, z, 0.6)) spawnEnemy(pick(pool), x, z, { rare: rnd() < 0.08 ? 1 : 0 }); }
    if (RS.t >= TOWER.arena) { RS.bossUp = true; for (const e of G.ents) if (!e.dead) { e.dead = true; e.deadT = 0.3; } const B = ZONES[Math.min(4, 2 + RS.diff)].boss; G.started = true; const e = spawnEnemy('warrior', 11, 10, { boss: true, hpMult: 22, dmgMult: 1.3, model: B.model, tint: B.tint, scale: 1.8, name: 'Strážce patra ' + RS.floor, pat: BOSS_PATS[Math.min(4, 2 + RS.diff)][1] }); e.r = 1.2; G.boss = e; }
  }
}
// ---------- world boss (Schéma 14) ----------
const wbToday = () => WB_BOSSES[new Date().getDay()];
function wbTierOpen(t) { return CH.lvl >= WB_TIERS[t].level && (t === 0 || CH.wb.tierBest >= t - 1); }
const wbBossHp = t => monHp(50) * 90 * WB_TIERS[t].hp * (wbToday().hp || 1);
function startWB(tier) {
  tickTimers(); if (CH.keys <= 0 || !wbTierOpen(tier)) return false; CH.keys--;
  if (CH.wb.wbTier !== tier) { CH.wb.wbTier = tier; CH.wb.dmg = 0; CH.wb.claimed = 0; CH.wb.killed = 0; }
  RS = { kind: 'wb', tier, stage: 15, sxp: 0, picks: 15, sup: {}, gold: 0, xp: 0, dia: 0, items: [], sgems: [], gems: [], kills: 0, t: 0, startDmg: CH.wb.dmg };
  MODE = 'wb'; RUN.sup = RS.sup; const st = sessionStats(), B = wbToday();
  newArena({ mode: 'wb', room: genRoom(4242, 'arena'), zone: 4, mlvl: 50, stats: st, onClear: sessionCleared });
  G.kind = 'wb'; G.started = true;
  const e = spawnEnemy('warrior', 11, 10, { boss: true, hpMult: 1, model: B.model, tint: B.tint, scale: 2.2, name: B.name, pat: B.mech.concat(['fan', 'ring']), dmgMult: WB_TIERS[tier].dmg * 0.55 });
  e.max = e.hp = wbBossHp(tier); e.hp = Math.max(1, e.max - CH.wb.dmg); e.enrage = true; e.r = 1.4; G.boss = e; G.mlvl = 50;
  UI.showPick(); save(); return true;
}
function wbTick(dt) { if (MODE !== 'wb' || !G) return; RS.t += dt; if (RS.t >= WB_TIME && !G.P.dead && !G.clear) { G.P.dead = true; G.timeUp = true; } }
function wbClaim() {
  // milestones reached by the summed damage of both daily attempts
  const tier = CH.wb.wbTier, T = WB_TIERS[tier], max = wbBossHp(tier), frac = CH.wb.dmg / max, got = [];
  const goldLvl = 2 * upgradeCost(CH.lvl, 0) * T.gold * (wbToday().reward || 1);
  const give = (i, mult) => { const g = Math.round(goldLvl * WB_GOLD_SHARE[i] * mult), d = Math.round(T.dia[i] * mult * (wbToday().reward || 1)); CH.gold += g; CH.dia += d; CH.wb.weekLoot[tier].g += g; CH.wb.weekLoot[tier].d += d; got.push({ g, d });
    if (i === 1) { const sg = newStatGem(clamp(1 + Math.floor(rnd() * 3) + tier * 3, 1, 15)); CH.sgems.push(sg); got[got.length - 1].sg = sg; }
    if (i === 2) { const gm = rollSkillGem(pick(ELS)); CH.gems.push(gm); got[got.length - 1].gem = gm.sk; }
    if (i === 4) { const it = makeItem(pick(SLOTS.filter(s => s !== 'offhand' || offhandUnlocked())), T.item); CH.items.push(it); got[got.length - 1].item = it; } };
  for (let i = 0; i < 5; i++) if (frac >= WB_MILES[i] && !(CH.wb.claimed & (1 << i))) { CH.wb.claimed |= 1 << i; give(i, 1); }
  const killed = frac >= 0.9999 && !CH.wb.killed;
  if (killed) { CH.wb.killed = 1; for (let i = 0; i < 5; i++) give(i, 1); CH.wb.tierBest = Math.max(CH.wb.tierBest, tier);
    const day = new Date().getDay(); CH.wb.weekDays = CH.wb.weekDays || [[], [], [], []]; if (!CH.wb.weekDays[tier].includes(day)) CH.wb.weekDays[tier].push(day);
    if (CH.wb.weekDays[tier].length >= 7) { const L = CH.wb.weekLoot[tier]; CH.gold += L.g; CH.dia += L.d; got.push({ week: true, g: L.g, d: L.d }); } }
  return { got, killed, frac };
}

// ---------- ending a session ----------
function sessionCleared() {
  if (MODE === 'tower' && G.boss && G.boss.dead) {
    const d = towerDrop(RS.diff, RS.floor), n = rnd() < d.second ? 2 : 1;
    for (let i = 0; i < n; i++) RS.sgems.push(newStatGem(d.tier, rnd() < d.white));
    RS.gold += 500; RS.dia += towerDiamonds(RS.diff, RS.floor); RS.xp += BASE_RUN_XP * fitChapterMult(CH.lvl) / 10; RS.won = true;
    setTimeout0(1.2, () => endSession(true));
  }
  if (MODE === 'wb' && G.boss && G.boss.dead) setTimeout0(1.2, () => endSession(true));
}
function endSession(won) {
  const res = { kind: RS.kind, won, gold: RS.gold, xp: 0, dia: RS.dia, items: RS.items.slice(), sgems: (RS.sgems || []).slice(), ups: [], extra: null };
  if (RS.kind === 'run') {
    let xp = RS.xp; if (CH.lvl >= 90 && !won) xp = 0; res.xp = Math.round(xp);
    if (won) { CH.runsDone++; const key = RS.ch + ':' + RS.diff; CH.prog.cleared[key] = (CH.prog.cleared[key] || 0) + 1;
      if (RS.diff === 0 && RS.ch >= CH.prog.maxCh[0] && RS.ch < 20) CH.prog.maxCh[0] = RS.ch + 1;
      if (zoneOf(RS.ch) >= 2) { if (RS.diff < 2) { const nd = RS.diff + 1; CH.prog.hcOpen = CH.prog.hcOpen || {}; CH.prog.hcOpen[RS.ch + ':' + nd] = 1; } if (RS.diff > 0 && RS.ch % 4 !== 0) CH.prog.hcOpen[(RS.ch + 1) + ':' + RS.diff] = 1; }
      CH.zoneReached = Math.max(CH.zoneReached, zoneOf(Math.min(20, RS.ch + 1)) + 1);
    } else if (RS.diff > 0) { res.extra = 'Smrt na ' + DIFFS[RS.diff] + ': postup v zóně se vrací na první kapitolu.'; const z0 = zoneOf(RS.ch) * 4 + 1; for (let c = z0 + 1; c <= z0 + 3; c++) if (CH.prog.hcOpen) delete CH.prog.hcOpen[c + ':' + RS.diff]; }
    CH.zoneReached = Math.max(CH.zoneReached, zoneOf(RS.ch) + 1);
  } else if (RS.kind === 'tower') {
    res.xp = Math.round(RS.xp);
    if (won) { CH.tower.best[RS.diff] = Math.max(CH.tower.best[RS.diff], RS.floor); CH.tower.floor[RS.diff] = Math.max(CH.tower.floor[RS.diff], Math.min(25, RS.floor + 1)); }
    else { CH.energy = Math.max(0, CH.energy - TOWER.cost[RS.diff]); if (RS.diff > 0) { CH.tower.floor[RS.diff] = 1; res.extra = 'Smrt na ' + DIFFS[RS.diff] + ': věž se vrací na 1. patro.'; } }
  } else if (RS.kind === 'wb') {
    const add = Math.max(0, G.bossDmg || 0); CH.wb.dmg = Math.min(wbBossHp(RS.tier), CH.wb.dmg + add); res.wbDmg = add; res.wb = wbClaim();
  }
  CH.gold += res.gold; CH.dia += res.dia;
  for (const it of res.items) { if (S.set.autoSell && it.rar < S.set.autoSell) { CH.gold += sellValue(it); it.sold = 1; } else CH.items.push(it); }
  for (const g of res.sgems) CH.sgems.push(g);
  res.ups = addCharXp(res.xp);
  RS = null; MODE = 'menu'; RUN.sup = {}; G = null; save();
  UI.showEnd(res);
}
function abandonSession() { if (!RS) return; if (RS.kind === 'run') endSession(false); else { if (G) G.P.dead = true; endSession(false); } }
function resumeSession() {
  const s = CH && CH.session; if (!s) return false; RS = s; RUN.sup = RS.sup; MODE = RS.kind;
  if (RS.kind === 'run') { enterRoom(); return true; }
  RS = null; MODE = 'menu'; CH.session = null; save(); return false;   // tower / world boss attempts are not resumable
}
// chapters open for play
function chapterOpen(ch, diff) { if (diff === 0) return ch <= CH.prog.maxCh[0]; if (zoneOf(ch) < 2) return false; if (ch % 4 === 1 && CH.prog.cleared[(ch) + ':' + (diff - 1)]) return true; return !!(CH.prog.hcOpen && CH.prog.hcOpen[ch + ':' + diff]); }

// ---------- main loop hooks ----------
function gameStep(dt) {
  if (!G || MODE === 'menu') return;
  if (UI.paused()) return;
  arenaStep(dt); if (!G) return; towerTick(dt); wbTick(dt); if (!G) return;
  if (G.P.dead && !G.endT) { G.endT = 1.4; }
  if (G.endT) { G.endT -= dt; if (G.endT <= 0) { const won = MODE === 'wb' && G.timeUp ? false : false; endSession(won); return; } }
  // leaving through the door
  if (MODE === 'run' && G.clear && !G.trader && G.P.z < 2.6 && Math.abs(G.P.x - (DOOR_X + 0.5) * T) < 1.8) nextRoom();
}
