'use strict';
/* ===== helpers ===== */
const rnd = (a, b) => a + Math.random() * (b - a);
const rndi = (a, b) => Math.floor(rnd(a, b + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
let _uid = 1;
const uid = () => Date.now().toString(36) + (_uid++).toString(36) + rndi(0, 1295).toString(36);

/* ===== stats ===== */
const STAT_TEXT = {
  life: '+# to Maximum Life', lifePct: '#% increased Maximum Life',
  regen: '# Life Regenerated per second', regenPct: 'Regenerate #% of Life per second',
  armour: '+# to Armour', armourPct: '#% increased Armour', dodge: '+#% chance to Dodge',
  moveSpeed: '#% increased Movement Speed',
  dmgPct: '#% increased Damage', attackPct: '#% increased Attack Damage', spellPct: '#% increased Spell Damage',
  physPct: '#% increased Physical Damage', firePct: '#% increased Fire Damage',
  coldPct: '#% increased Cold Damage', lightPct: '#% increased Lightning Damage', elePct: '#% increased Elemental Damage',
  addPhys: 'Adds # Physical Damage', addFire: 'Adds # Fire Damage', addCold: 'Adds # Cold Damage', addLight: 'Adds # Lightning Damage',
  wPct: '#% increased Weapon Damage', atkSpeed: '#% increased Skill Speed',
  crit: '+#% to Critical Strike Chance', critMulti: '+#% to Critical Strike Multiplier',
  resFire: '+#% to Fire Resistance', resCold: '+#% to Cold Resistance', resLight: '+#% to Lightning Resistance',
  resAll: '+#% to all Elemental Resistances',
  areaPct: '#% increased Area of Effect', leech: '#% of Damage Leeched as Life', lifeOnKill: '+# Life gained on Kill',
  rarityPct: '#% increased Rarity of Items found', goldPct: '#% increased Gold found',
  moreDmg: '#% more Damage', moreAtk: '#% more Attack Damage', moreFire: '#% more Fire Damage',
  chillBonus: 'Chilled enemies take #% increased Damage'
};
const FLAT_STATS = { life: 1, regen: 1, armour: 1, addPhys: 1, addFire: 1, addCold: 1, addLight: 1, lifeOnKill: 1 };
function fmtNum(v) { const a = Math.abs(v); return a >= 10 || a === Math.round(a) ? String(Math.round(a)) : a.toFixed(1); }
function statLine(k, v) {
  let t = STAT_TEXT[k] || (k + ' #');
  if (v < 0) {
    if (t.includes('increased')) t = t.replace('increased', 'reduced');
    else if (t.includes('more')) t = t.replace('more', 'less');
    else t = t.replace('+#', '-#').replace(/^#/, '-#');
  }
  return t.replace('#', fmtNum(v));
}

/* ===== items ===== */
const RARITY_NAME = ['Normal', 'Magic', 'Rare', 'Unique'];
const RARITY_COLOR = ['#c8c8c8', '#8f8fff', '#f5e663', '#d9772b'];
const EQUIP_SLOTS = ['weapon', 'helmet', 'body', 'gloves', 'boots', 'ring1', 'ring2', 'amulet'];
const SLOT_LABEL = { weapon: 'Weapon', helmet: 'Helmet', body: 'Body', gloves: 'Gloves', boots: 'Boots', ring1: 'Ring', ring2: 'Ring', ring: 'Ring', amulet: 'Amulet' };
const SLOT_ICON = { weapon: '⚔️', helmet: '⛑️', body: '🛡️', gloves: '🧤', boots: '🥾', ring: '💍', ring1: '💍', ring2: '💍', amulet: '📿' };
const INV_SIZE = 40;

const WEAPONS = {
  sword: { names: ['Rusted Blade', 'Soldier Sword', 'Runed Longsword'], dm: 1, imp: { crit: 1.5 } },
  axe: { names: ['Chipped Hatchet', 'Reaver Axe', 'Dread Cleaver'], dm: 1.15, imp: {} },
  mace: { names: ['Driftwood Club', 'War Maul', 'Titan Hammer'], dm: 1.05, imp: { lifePct: 4 } },
  wand: { names: ['Twig Wand', 'Carved Wand', 'Opal Wand'], dm: 0.55, imp: { spellPct: 14 } },
  staff: { names: ['Gnarled Staff', 'Mystic Staff', 'Eclipse Staff'], dm: 0.75, imp: { spellPct: 10, areaPct: 8 } }
};
const ARMOURS = {
  helmet: { names: ['Leather Cap', 'Iron Helm', 'Dread Visor'], arm: 1 },
  body: { names: ['Padded Vest', 'Chain Hauberk', 'Warlord Plate'], arm: 2.2 },
  gloves: { names: ['Wrapped Mitts', 'Bronze Gauntlets', 'Titan Grips'], arm: 0.8 },
  boots: { names: ['Rawhide Boots', 'Steel Greaves', 'Drakescale Boots'], arm: 0.8, imp: { moveSpeed: 5 } }
};
const JEWELS = {
  ring: [{ n: 'Iron Ring', imp: { addPhys: 1 } }, { n: 'Coral Ring', imp: { life: 8 } }, { n: 'Topaz Ring', imp: { resLight: 8 } },
    { n: 'Ruby Ring', imp: { resFire: 8 } }, { n: 'Sapphire Ring', imp: { resCold: 8 } }],
  amulet: [{ n: 'Bone Amulet', imp: { dmgPct: 6 } }, { n: 'Jade Amulet', imp: { lifePct: 4 } }, { n: 'Onyx Amulet', imp: { resAll: 4 } }]
};
const ARM = ['helmet', 'body', 'gloves', 'boots'];
const JEW = ['ring', 'amulet'];
// type p = prefix, s = suffix. value = roll(min,max) * (1 + g * (ilvl-1))
const AFFIXES = [
  { id: 'life', t: 'p', n: 'Sturdy', stat: 'life', min: 8, max: 16, g: 0.12, slots: [...ARM, ...JEW] },
  { id: 'arm', t: 'p', n: 'Plated', stat: 'armour', min: 6, max: 12, g: 0.15, slots: ARM },
  { id: 'armp', t: 'p', n: 'Reinforced', stat: 'armourPct', min: 10, max: 22, g: 0.02, slots: ARM },
  { id: 'wpct', t: 'p', n: 'Cruel', stat: 'wPct', min: 18, max: 36, g: 0.035, slots: ['weapon'] },
  { id: 'phys', t: 'p', n: 'Heavy', stat: 'physPct', min: 8, max: 16, g: 0.025, slots: ['weapon', ...JEW] },
  { id: 'aphys', t: 'p', n: 'Jagged', stat: 'addPhys', min: 1.5, max: 3, g: 0.16, slots: ['weapon', 'gloves', ...JEW] },
  { id: 'afire', t: 'p', n: 'Flaming', stat: 'addFire', min: 2, max: 4.5, g: 0.16, slots: ['weapon', 'gloves', ...JEW] },
  { id: 'acold', t: 'p', n: 'Freezing', stat: 'addCold', min: 2, max: 4, g: 0.16, slots: ['weapon', 'gloves', ...JEW] },
  { id: 'alight', t: 'p', n: 'Shocking', stat: 'addLight', min: 2, max: 5, g: 0.16, slots: ['weapon', 'gloves', ...JEW] },
  { id: 'spell', t: 'p', n: 'Arcane', stat: 'spellPct', min: 10, max: 20, g: 0.025, slots: ['weapon', 'amulet', 'helmet'] },
  { id: 'atk', t: 'p', n: 'Savage', stat: 'attackPct', min: 10, max: 20, g: 0.025, slots: ['weapon', 'amulet', 'gloves'] },
  { id: 'dmg', t: 'p', n: 'Vicious', stat: 'dmgPct', min: 5, max: 10, g: 0.02, slots: ['ring', 'amulet'] },
  { id: 'haste', t: 's', n: 'of Haste', stat: 'atkSpeed', min: 4, max: 8, g: 0.015, slots: ['weapon', 'gloves', 'ring'] },
  { id: 'wind', t: 's', n: 'of the Wind', stat: 'moveSpeed', min: 6, max: 12, g: 0.015, slots: ['boots'] },
  { id: 'prec', t: 's', n: 'of Precision', stat: 'crit', min: 1, max: 2.5, g: 0.02, slots: ['weapon', 'gloves', ...JEW] },
  { id: 'ruin', t: 's', n: 'of Ruin', stat: 'critMulti', min: 8, max: 16, g: 0.025, slots: ['weapon', ...JEW] },
  { id: 'rf', t: 's', n: 'of Cinders', stat: 'resFire', min: 8, max: 14, g: 0.03, slots: [...ARM, ...JEW] },
  { id: 'rc', t: 's', n: 'of Frost', stat: 'resCold', min: 8, max: 14, g: 0.03, slots: [...ARM, ...JEW] },
  { id: 'rl', t: 's', n: 'of Storms', stat: 'resLight', min: 8, max: 14, g: 0.03, slots: [...ARM, ...JEW] },
  { id: 'regen', t: 's', n: 'of Mending', stat: 'regen', min: 0.6, max: 1.4, g: 0.12, slots: [...ARM, ...JEW] },
  { id: 'leech', t: 's', n: 'of Leeching', stat: 'leech', min: 0.3, max: 0.6, g: 0.012, slots: ['weapon', 'gloves', 'ring', 'amulet'] },
  { id: 'fort', t: 's', n: 'of Fortune', stat: 'rarityPct', min: 6, max: 12, g: 0.02, slots: ['helmet', 'boots', ...JEW] },
  { id: 'gold', t: 's', n: 'of Greed', stat: 'goldPct', min: 8, max: 16, g: 0.02, slots: ['gloves', 'boots', ...JEW] },
  { id: 'reap', t: 's', n: 'of the Reaper', stat: 'lifeOnKill', min: 1, max: 3, g: 0.1, slots: ['weapon', 'gloves', 'ring'] },
  { id: 'emb', t: 's', n: 'of Embers', stat: 'firePct', min: 8, max: 16, g: 0.025, slots: ['weapon', ...JEW] },
  { id: 'rime', t: 's', n: 'of Rime', stat: 'coldPct', min: 8, max: 16, g: 0.025, slots: ['weapon', ...JEW] },
  { id: 'thun', t: 's', n: 'of Thunder', stat: 'lightPct', min: 8, max: 16, g: 0.025, slots: ['weapon', ...JEW] },
  { id: 'reach', t: 's', n: 'of Reach', stat: 'areaPct', min: 5, max: 10, g: 0.015, slots: ['weapon', 'amulet', 'helmet'] },
  { id: 'dodge', t: 's', n: 'of Shadows', stat: 'dodge', min: 2, max: 4, g: 0.012, slots: ARM }
];
const RARE_A = ['Doom', 'Grim', 'Ash', 'Blight', 'Storm', 'Dread', 'Hollow', 'Ember', 'Rune', 'Wrath', 'Gloom', 'Vile', 'Carrion', 'Dusk', 'Iron', 'Plague'];
const RARE_B = {
  weapon: ['Bite', 'Edge', 'Fang', 'Thirst', 'Song', 'Ruin', 'Spike'], helmet: ['Crown', 'Gaze', 'Brow', 'Veil'],
  body: ['Shell', 'Hide', 'Ward', 'Mantle'], gloves: ['Grasp', 'Clutch', 'Touch', 'Fist'], boots: ['Stride', 'Trail', 'Spur', 'Tread'],
  ring: ['Loop', 'Coil', 'Band', 'Knot'], amulet: ['Heart', 'Charm', 'Idol', 'Locket']
};
// unique items: stats are [value, growth-per-level]
const UNIQUES = [
  { n: 'Cinderbrand', slot: 'weapon', wtype: 'sword', stats: { addFire: [6, 0.2], firePct: [30, 0.02], wPct: [40, 0.03], resFire: [15, 0] } },
  { n: "Stormcaller's Loop", slot: 'ring', stats: { lightPct: [25, 0.02], crit: [3, 0.02], addLight: [3, 0.18], resLight: [15, 0] } },
  { n: "Wanderer's Stride", slot: 'boots', stats: { moveSpeed: [22, 0], dodge: [8, 0], life: [15, 0.12] } },
  { n: 'Heart of the Mountain', slot: 'body', stats: { life: [40, 0.14], armourPct: [60, 0.01], regen: [2, 0.12], moveSpeed: [-6, 0] } },
  { n: 'Gravetouch', slot: 'gloves', stats: { leech: [1, 0.01], lifeOnKill: [4, 0.1], atkSpeed: [10, 0.01] } },
  { n: 'The Hollow Crown', slot: 'helmet', stats: { spellPct: [28, 0.02], areaPct: [15, 0], life: [20, 0.12] } },
  { n: 'Widowmaker', slot: 'weapon', wtype: 'axe', stats: { wPct: [70, 0.035], critMulti: [35, 0.01], atkSpeed: [-8, 0] } },
  { n: 'Eye of Winter', slot: 'amulet', stats: { coldPct: [30, 0.02], addCold: [4, 0.18], resCold: [20, 0], chillBonus: [10, 0] } }
];

function tierOf(ilvl) { return ilvl < 13 ? 0 : ilvl < 31 ? 1 : 2; }
function rollAffix(a, ilvl) {
  let v = rnd(a.min, a.max) * (1 + a.g * (ilvl - 1));
  v = v >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
  return { id: a.id, t: a.t, stat: a.stat, v };
}
function makeItem(ilvl, o) {
  o = o || {};
  ilvl = Math.max(1, Math.round(ilvl));
  const slot = o.slot || pick(['weapon', 'weapon', 'helmet', 'body', 'gloves', 'boots', 'ring', 'ring', 'amulet']);
  let rarity = o.rarity;
  if (rarity === undefined) {
    const R = o.rarityMult || 1;
    const w = [62, 30 * R, 7.5 * R, 0.4 * R];
    let r = Math.random() * (w[0] + w[1] + w[2] + w[3]);
    rarity = r < w[0] ? 0 : r < w[0] + w[1] ? 1 : r < w[0] + w[1] + w[2] ? 2 : 3;
  }
  const it = { uid: uid(), slot, ilvl, rarity, imp: {}, affixes: [] };
  let uq = null;
  if (rarity === 3) {
    const c = UNIQUES.filter(u => u.slot === slot);
    if (c.length) uq = pick(c); else rarity = it.rarity = 2;
  }
  const scaleImp = imp => { for (const k in imp) it.imp[k] = FLAT_STATS[k] ? Math.round(imp[k] * (1 + 0.12 * (ilvl - 1))) : imp[k]; };
  if (slot === 'weapon') {
    const wt = (uq && uq.wtype) || o.wtype || pick(Object.keys(WEAPONS));
    const W = WEAPONS[wt];
    it.wtype = wt; it.base = W.names[tierOf(ilvl)];
    const avg = 6 * (1 + 0.28 * (ilvl - 1)) * W.dm;
    it.wMin = Math.max(1, Math.round(avg * 0.7)); it.wMax = Math.max(2, Math.round(avg * 1.3));
    scaleImp(W.imp);
  } else if (ARMOURS[slot]) {
    const A = ARMOURS[slot];
    it.base = A.names[tierOf(ilvl)];
    it.arm = Math.round(A.arm * 6 * (1 + 0.2 * (ilvl - 1)));
    if (A.imp) scaleImp(A.imp);
  } else {
    const J = pick(JEWELS[slot]);
    it.base = J.n; scaleImp(J.imp);
  }
  if (uq) {
    it.name = uq.n;
    for (const k in uq.stats) {
      let v = uq.stats[k][0] * (1 + uq.stats[k][1] * (ilvl - 1));
      v = Math.abs(v) >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
      it.affixes.push({ id: 'u_' + k, t: 'u', stat: k, v });
    }
    return it;
  }
  const pool = AFFIXES.filter(a => a.slots.includes(slot));
  const pre = pool.filter(a => a.t === 'p'), suf = pool.filter(a => a.t === 's');
  let np = 0, ns = 0;
  if (rarity === 1) { if (Math.random() < 0.5) { np = 1; ns = 1; } else if (Math.random() < 0.5) np = 1; else ns = 1; }
  if (rarity === 2) { const n = rndi(3, 6); np = clamp(Math.round(n / 2 + rnd(-0.6, 0.6)), 1, 3); ns = clamp(n - np, 1, 3); }
  const take = (list, n) => {
    const l = list.slice();
    for (let i = 0; i < n && l.length; i++) { const a = l.splice(Math.floor(Math.random() * l.length), 1)[0]; it.affixes.push(rollAffix(a, ilvl)); }
  };
  take(pre, np); take(suf, ns);
  if (rarity === 0) it.name = it.base;
  else if (rarity === 1) {
    const p = it.affixes.find(a => a.t === 'p'), s = it.affixes.find(a => a.t === 's');
    const pn = p ? AFFIXES.find(a => a.id === p.id).n + ' ' : '', sn = s ? ' ' + AFFIXES.find(a => a.id === s.id).n : '';
    it.name = pn + it.base + sn;
  } else it.name = pick(RARE_A) + ' ' + pick(RARE_B[slot]);
  return it;
}
function itemStats(it) {
  const st = {};
  for (const k in it.imp) st[k] = (st[k] || 0) + it.imp[k];
  for (const a of it.affixes) st[a.stat] = (st[a.stat] || 0) + a.v;
  if (it.arm) st.armour = (st.armour || 0) + it.arm;
  return st;
}
function itemValue(it) { return Math.round((4 + it.ilvl * 2) * [1, 2.5, 6, 25][it.rarity]); }
// rough power score for quick comparison arrows
function itemScore(it) {
  const st = itemStats(it); let s = 0;
  const W = { life: 1, armour: 0.35, lifePct: 6, armourPct: 1, regen: 6, addPhys: 5, addFire: 5, addCold: 5, addLight: 5, leech: 30, lifeOnKill: 4, crit: 8, critMulti: 1.2, atkSpeed: 3, moveSpeed: 2.5, resAll: 4.5, areaPct: 1.5, rarityPct: 0.8, goldPct: 0.5, dodge: 3, wPct: 0 };
  for (const k in st) s += st[k] * (W[k] !== undefined ? W[k] : 1.5);
  if (it.slot === 'weapon') s += (it.wMin + it.wMax) / 2 * (1 + (st.wPct || 0) / 100) * 6;
  return s;
}

/* ===== gems ===== */
// kind: arc | bolt | nova | chain | orbit | blink | lance | meteor
const SKILLS = {
  arc: { name: 'Rending Arc', icon: '⚔️', color: '#d8d0c0', kind: 'arc', tags: ['attack', 'melee', 'area', 'phys'], cd: 0.75, eff: 1.4, range: 84,
    desc: 'Sweeps your weapon in a wide arc, hitting every enemy in front of you.' },
  bolt: { name: 'Ember Bolt', icon: '🔥', color: '#ff8a3c', kind: 'bolt', tags: ['spell', 'projectile', 'fire'], el: 'fire', cd: 0.8, base: 9, eff: 0.8, range: 330,
    desc: 'Hurls a bolt of fire at the nearest enemy.' },
  nova: { name: 'Glacial Burst', icon: '❄️', color: '#8fd8ff', kind: 'nova', tags: ['spell', 'area', 'cold'], el: 'cold', cd: 1.5, base: 11, eff: 0.9, range: 100,
    desc: 'A burst of frost around you. Cold damage chills, slowing enemies.' },
  chain: { name: 'Arc Lash', icon: '⚡', color: '#f7f08a', kind: 'chain', tags: ['spell', 'lightning', 'chain'], el: 'light', cd: 1.0, base: 8, eff: 0.7, range: 260, chain: 3,
    desc: 'Lightning strikes an enemy and leaps to others nearby. Damage is highly variable.' },
  orbit: { name: 'Whirling Steel', icon: '🌀', color: '#c0c8d8', kind: 'orbit', tags: ['attack', 'orbit', 'area', 'phys'], cd: 0.5, eff: 0.5, range: 62, blades: 3,
    desc: 'Blades circle you constantly, cutting anything they touch.' },
  blink: { name: 'Shadowstep', icon: '👣', color: '#b78cff', kind: 'blink', tags: ['attack', 'melee', 'area', 'phys'], cd: 1.1, eff: 1.9, range: 230,
    desc: 'Teleport to a nearby enemy and strike everything around you.' },
  lance: { name: 'Bone Lance', icon: '🦴', color: '#e8e2cf', kind: 'lance', tags: ['spell', 'projectile', 'phys'], el: 'phys', cd: 1.1, base: 12, eff: 0.9, range: 340, pierce: 99,
    desc: 'A spear of bone that pierces through every enemy in its path.' },
  meteor: { name: 'Skyfall', icon: '☄️', color: '#ff6a3c', kind: 'meteor', tags: ['spell', 'area', 'fire'], el: 'fire', cd: 2.2, base: 28, eff: 1.6, range: 300,
    desc: 'Calls a meteor onto an enemy. It lands after a short delay for heavy damage.' }
};
const SUPPORTS = {
  multi: { name: 'Split Shot', icon: '🔱', req: ['projectile', 'orbit'], proj: 2, more: 0.75, desc: '+2 projectiles (or blades), 25% less damage.' },
  pierce: { name: 'Impale', icon: '📍', req: ['projectile'], pierce: 2, more: 1.05, desc: 'Projectiles pierce 2 more enemies, 5% more damage.' },
  rico: { name: 'Ricochet', icon: '♻️', req: ['projectile', 'chain'], chain: 2, more: 0.9, desc: 'Chains to 2 more enemies, 10% less damage.' },
  wide: { name: 'Wide Reach', icon: '⭕', req: ['area'], area: 1.4, desc: '40% more area of effect.' },
  focus: { name: 'Focused Blast', icon: '🎯', req: ['area'], area: 0.75, more: 1.4, desc: '40% more damage, 25% less area.' },
  quick: { name: 'Quickening', icon: '⏩', req: null, cd: 0.75, desc: 'Skill is used 33% faster.' },
  brute: { name: 'Brute Force', icon: '💪', req: null, more: 1.3, cd: 1.1, desc: '30% more damage, used 10% slower.' },
  keen: { name: 'Keen Edge', icon: '🗡️', req: null, crit: 4, critMulti: 40, desc: '+4% critical chance, +40% critical multiplier.' },
  blood: { name: 'Blood Pact', icon: '❤️', req: null, leech: 1.5, desc: '1.5% of damage is leeched as life.' },
  kindle: { name: 'Kindling', icon: '🕯️', req: null, ignite: 0.5, desc: 'Hits ignite, dealing 50% of the hit as burning over 3 seconds.' },
  echo: { name: 'Echo', icon: '🔁', req: ['spell'], echo: 1, more: 0.75, desc: 'Spell repeats once, 25% less damage.' },
  heavy: { name: 'Heavy Blows', icon: '🔨', req: ['attack'], more: 1.28, desc: '28% more attack damage.' },
  surge: { name: 'Elemental Surge', icon: '🌈', req: ['fire', 'cold', 'lightning'], more: 1.3, desc: '30% more damage for elemental skills.' }
};
const GEM_MAX = 20;
const gemXpNext = l => Math.floor(80 * Math.pow(l, 1.9));
function makeGem(id, lvl) { return { uid: uid(), id, sup: !!SUPPORTS[id], lvl: lvl || 1, xp: 0 }; }
function randomGem(supChance) {
  return Math.random() < (supChance === undefined ? 0.6 : supChance) ? makeGem(pick(Object.keys(SUPPORTS))) : makeGem(pick(Object.keys(SKILLS)));
}
const gemDef = g => g.sup ? SUPPORTS[g.id] : SKILLS[g.id];
function supportFits(sd, skillDef) { return !sd.req || sd.req.some(t => skillDef.tags.includes(t)); }
const SLOT_UNLOCK = [1, 5, 10, 16];

/* ===== monsters & zones ===== */
const MOBS = {
  ghoul: { name: 'Ghoul', hp: 1, dmg: 1, spd: 58, r: 12, color: '#7d8a5c', xp: 1 },
  swarm: { name: 'Gnawer', hp: 0.42, dmg: 0.55, spd: 98, r: 8, color: '#a0564a', xp: 0.5 },
  brute: { name: 'Brute', hp: 2.8, dmg: 1.8, spd: 40, r: 18, color: '#6d5a7a', xp: 2.4 },
  caster: { name: 'Cultist', hp: 0.8, dmg: 1.1, spd: 50, r: 11, color: '#4f7f8f', xp: 1.4, ranged: true }
};
const MOB_MODS = { fast: 'Swift', tough: 'Stalwart', deadly: 'Deadly' };
const ZONES = [
  { name: 'Ashen Shore', ground: '#26221f', tint: '#3a322b', el: 'fire', boss: 'Harbormaster Vosk' },
  { name: 'Drowned Vault', ground: '#182428', tint: '#243a40', el: 'cold', boss: 'The Tide Warden' },
  { name: 'Blighted Wood', ground: '#1d2619', tint: '#2e3d26', el: 'phys', boss: 'Old Mother Rot' },
  { name: 'Ember Mines', ground: '#2a1c18', tint: '#472a20', el: 'fire', boss: 'Foreman Karg' },
  { name: 'Frost Hollow', ground: '#1e2630', tint: '#30404f', el: 'cold', boss: 'Skadi the Pale' },
  { name: 'Storm Peak', ground: '#22212e', tint: '#383652', el: 'light', boss: 'The Thunder Herald' }
];
const ROMAN = ['', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X'];
function zoneInfo(z) { const b = ZONES[(z - 1) % ZONES.length]; const t = Math.floor((z - 1) / ZONES.length); return Object.assign({}, b, { name: b.name + (t < ROMAN.length ? ROMAN[t] : ' ' + (t + 1)), level: z }); }
const mobHp = L => 20 * (1 + 0.55 * (L - 1) + 0.07 * (L - 1) * (L - 1)) * Math.pow(1.045, L - 1);
const mobDmg = L => 5 * (1 + 0.25 * (L - 1) + 0.012 * (L - 1) * (L - 1)) * Math.pow(1.02, L - 1);
const mobXp = L => 5 + 3 * L;
const xpNext = L => Math.floor(40 * Math.pow(L, 1.6) + 60 * L);
const zoneQuota = z => Math.min(220, 60 + z * 8);
