'use strict';
/* ===== combat core: the arena state, player, enemies, hits, ailments, element mechanics, projectiles, zones ===== */
let G = null;      // current arena (room of a run, tower floor or world boss fight)
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const ang = (a, b) => Math.atan2(b.x - a.x, b.z - a.z);           // 0 = +z, matches model facing
const dirv = a => [Math.sin(a), Math.cos(a)];

// ---------- arena ----------
function newArena(o) {
  G = {
    mode: o.mode, room: o.room, zone: o.zone || 0, mlvl: o.mlvl, t: 0, ents: [], projs: [], eprojs: [], zones: [], fx: [], texts: [], orbs: [], loot: [],
    cracks: [], embers: [], essences: [], pylons: [], minions: [], marks: [], clear: false, doorOpen: false, kills: 0, shake: 0,
    flow: null, flowT: 0, stats: o.stats, P: null, boss: null, onClear: o.onClear, dmgDone: 0, telegraphs: [],
  };
  const st = o.stats, P = G.P = {
    x: START.x, z: START.z, r: 0.55, hp: o.hp != null ? o.hp : st.hp, max: st.hp, face: Math.PI, moving: false, moveT: 0, stillT: 0, inv: 0, dead: false,
    rage: o.res ? o.res.rage : 0, heat: o.res ? o.res.heat : 0, crystals: o.res ? o.res.crystals : 0, charge: 0, chargeT: 0, essence: o.res ? o.res.essence : 0,
    rot: { i: 0, t: 0.4 }, active: {}, buffs: {}, anim: { clip: 'Idle_A', t: 0 }, hitFlash: 0, castT: 0, shield: 0, lastLeap: -9, castCount: 0, overcharge: 0, killCount: 0,
  };
  return G;
}

// ---------- player stats from equipment, gems and tree ----------
function stat(st, k) { return st.t[k] || 0; }

// ---------- enemies ----------
const ENEMY = {
  minion:  { name: 'Kostlivec', model: 'sk_minion', hp: 1, dmg: 1, spd: 3.6, r: 0.6, ai: 'chase', weapon: 'sk_blade', armour: 0.2, xp: 1, cost: 1 },
  warrior: { name: 'Válečník', model: 'sk_warrior', hp: 2.6, dmg: 1.5, spd: 2.6, r: 0.75, ai: 'chase', weapon: 'sk_axe', shield: 'sk_shield', armour: 1, xp: 2, cost: 2 },
  rogue:   { name: 'Zabiják', model: 'sk_rogue', hp: 0.9, dmg: 1.3, spd: 4.2, r: 0.6, ai: 'dash', weapon: 'sk_blade', armour: 0.2, xp: 1.5, cost: 1.5 },
  mage:    { name: 'Nekromant', model: 'sk_mage', hp: 0.9, dmg: 1.1, spd: 2.4, r: 0.6, ai: 'caster', weapon: 'sk_staff', armour: 0.1, xp: 1.5, cost: 1.4 },
  archer:  { name: 'Střelec', model: 'sk_minion', hp: 0.8, dmg: 1, spd: 2.8, r: 0.6, ai: 'archer', weapon: 'sk_crossbow', armour: 0.2, xp: 1.3, cost: 1.3 },
  swarm:   { name: 'Kostlík', model: 'sk_minion', hp: 0.35, dmg: 0.6, spd: 4.8, r: 0.42, ai: 'chase', weapon: 'sk_blade', armour: 0, xp: 0.5, cost: 0.6, scale: 0.65 },
  totem:   { name: 'Totem', model: 'sk_mage', hp: 1.6, dmg: 0.9, spd: 0, r: 0.7, ai: 'totem', weapon: 'sk_staff', armour: 0.5, xp: 1.5, cost: 1.5 },
};
const monHp = L => 26 * Math.pow(1.062, L - 1);
const monDmg = L => 7 * Math.pow(1.056, L - 1);
const monArmour = L => 6 * Math.pow(1.06, L - 1);
function spawnEnemy(type, x, z, o = {}) {
  const d = ENEMY[type], L = o.mlvl || G.mlvl, rare = o.rare || 0, mult = [1, 2.6, 5][rare];
  const e = { id: Math.random(), type, d, x, z, r: d.r * (o.scale || d.scale || 1) * (rare === 2 ? 1.25 : 1), face: 0, spd: d.spd * (rare ? 1.08 : 1),
    hp: monHp(L) * d.hp * mult * (o.hpMult || 1), dmg: monDmg(L) * d.dmg * (rare ? 1.35 : 1) * (o.dmgMult || 1), armour: monArmour(L) * d.armour,
    max: 0, rare, boss: !!o.boss, res: o.res || {}, atkT: 1 + Math.random() * 1.2, ai: o.ai || d.ai, state: 'idle', stT: 0,
    ign: [], chill: 0, chillT: 0, frozen: 0, shock: 0, shockEff: 0, pois: [], curses: {}, stun: 0, stunT: 0, crush: 0, hitT: 0, flash: 0,
    model: o.model || d.model, tint: o.tint || null, sc: (o.scale || d.scale || 1) * (rare === 2 ? 1.25 : rare ? 1.1 : 1), anim: { clip: 'Spawn_Ground', t: 0 }, spawnT: 0.6,
    xp: d.xp * (rare ? 3 : 1), name: o.name || d.name, pat: o.pat || null, patI: 0, phase: 1, dead: false, vx: 0, vz: 0, knock: 0 };
  e.max = e.hp; G.ents.push(e); return e;
}

// ---------- flow field toward the player for walkers ----------
function updateFlow() {
  const R = G.room, P = G.P; G.flow = bfs(R.grid, R.W, R.H, clamp(Math.floor(P.x / T), 0, R.W - 1), clamp(Math.floor(P.z / T), 0, R.H - 1), v => v === 1 || v === 4);
}
function flowDir(e) {
  const R = G.room, tx = Math.floor(e.x / T), tz = Math.floor(e.z / T), W = R.W, f = G.flow; if (!f) return null;
  const here = f[tz * W + tx]; if (here <= 1) return null;
  let best = here, bx = 0, bz = 0;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const nx = tx + dx, nz = tz + dz; if (nx < 0 || nz < 0 || nx >= W || nz >= R.H) continue; const v = f[nz * W + nx];
    if (v < 0 || v >= best) continue; if (dx && dz && (f[tz * W + nx] < 0 || f[nz * W + tx] < 0)) continue; best = v; bx = dx; bz = dz;
  }
  if (!bx && !bz) return null; const cx = (tx + bx + 0.5) * T - e.x, cz = (tz + bz + 0.5) * T - e.z, l = Math.hypot(cx, cz) || 1; return [cx / l, cz / l];
}
function moveEnt(e, dx, dz, dt) {
  const R = G.room, nx = e.x + dx * dt, nz = e.z + dz * dt, r = Math.min(e.r, 0.8);
  if (!canStand(R, e.x, e.z, r)) { if (walkable(R, nx, nz)) { e.x = nx; e.z = nz; } return; }
  if (canStand(R, nx, e.z, r)) e.x = nx; if (canStand(R, e.x, nz, r)) e.z = nz;
}

// ---------- damage to enemies ----------
const elMult = (st, el) => 1 + (stat(st, el + 'Dmg') + stat(st, 'dmgPct')) / 100;
function crit(st, bonus = 0) { return rnd() * 100 < st.crit + bonus || G.P.overcharge > 0; }
// o: {el, skill, crit, noAil, ailMult, src, chain, pen, stun, aoe}
function hit(e, base, o = {}) {
  if (e.dead || e.spawnT > 0.2) return 0;
  if (e.immune > 0) { if (!o.quiet && rnd() < 0.2) pushWord(e.x, e.z, 'imunní', '#ccc'); return 0; }
  const st = G.stats, P = G.P, el = o.el || st.el;
  let d = base * elMult(st, el) * (o.mult || 1) * (P.cursed > 0 ? 0.7 : 1);
  let isCrit = o.crit != null ? o.crit : crit(st, (o.critBonus || 0) + (RUN.supLvl(o.skill, 'critical_arc') * 3));
  if (isCrit) d *= st.critMulti / 100 * (st.keys.Overload ? 2 : 1); else if (st.keys.Overload) d *= 0.6;
  if (st.keys['Plague Lord'] && !o.dot) d *= 0.5;
  if (st.keys.Pyromaniac && el === 'fire' && !o.dot) d *= 0.7;
  // enemy side
  if (e.shock > 0) d *= 1 + e.shockEff;
  if (e.frozen > 0 && P.active.frostbite) d *= 1.3 + RUN.supLvl('frostbite', 'numbing_cold') * 0.05;
  else if (e.chill > 0 && P.active.frostbite && RUN.corr('numbing_cold')) d *= 1.3;
  if (e.stunT > 0 && RUN.corr('concussion')) d *= 1.25;
  if (e.curses.doom) d *= 1.15;
  if (e.curses.wither) d *= 1 + Math.min(e.curses.wither.stacks, 20) * 0.03 * (el === 'chaos' ? 1 : 0.5);
  if (e.boss && e.res) { if (e.res[el] != null) d *= 1 + e.res[el] / 100; }
  if (el === 'phys' && !o.dot) { const pen = 0.3 + stat(st, 'armourPen') / 100 + e.crush * 0.06; const arm = e.armour * Math.max(0, 1 - pen); d *= 1 - Math.min(0.6, arm / (arm + 4 * d + 1)); }
  d = Math.max(1, d);
  e.hp -= d; e.hitT = 0.12; G.dmgDone += d; if (e === G.boss) G.bossDmg = (G.bossDmg || 0) + Math.min(d, e.hp + d);
  if (!o.quiet) pushText(e.x, e.z, d, isCrit, el);
  if (o.dot) { if (e.hp <= 0) kill(e, o); return d; }
  // lifesteal / bloodlust; melee weapons leech a little so close combat stays survivable
  if (st.melee) heal(d * 0.03);
  const bl = RUN.supLvl(o.skill, 'bloodlust'); if (bl) heal(d * 0.005 * bl, RUN.corr('bloodlust'));
  if (P.active.feral_link && o.minion && RUN.corr('feral_bond')) heal(d * 0.01);
  // mechanics on hit
  if (el === 'phys') { gainRage(o.rage != null ? o.rage : 1); addStun(e, (o.stun || 8) * (1 + stat(st, 'stunBuild') / 100) * (1 + 0.12 * RUN.supLvl(o.skill, 'concussion'))); if (st.keys['Searing Steel']) ignite(e, d * 0.3); if (st.keys['Rending Venom']) poison(e, d * 0.2, 1); }
  if (el === 'light') { gainCharge(isCrit ? 1 + (P.active.feedback ? 2 : 0) : 0.5); }
  if (!o.noAil) applyAil(e, el, d * (o.ailMult || 1), o);
  if (isCrit && el === 'light' && RUN.corr('critical_arc') && !o.chained) chainFrom(e, d * 0.5, 2, o);
  if (e.hp <= 0) kill(e, o);
  return d;
}
function applyAil(e, el, d, o) {
  const st = G.stats, P = G.P;
  if (el === 'fire') ignite(e, d * (0.4 + RUN.supLvl(o.skill, 'scorch') * 0.06), o);
  else if (el === 'cold') chillE(e, o.chill || 1);
  else if (el === 'chaos') poison(e, d * 0.28, o.pois || 1, o);
  else if (el === 'light') { if (o.shock !== false) shockE(e, 0.15 + stat(st, 'shockEff') / 100 * 0.15); if (!o.chained && o.chain !== 0) chainFrom(e, d * 0.6, (o.chain || 1), o); }
}
function ignite(e, total, o = {}) {
  const st = G.stats, mult = (1 + stat(st, 'igniteDmg') / 100) * (st.keys.Pyromaniac ? 2 : 1), dur = 4 * (1 + RUN.supLvl(o.skill, 'scorch') * 0.1);
  const was = e.ign.length > 0; e.ign.push({ dps: total * mult / dur, t: dur }); if (RUN.corr('scorch') && o.skill && RUN.supLvl(o.skill, 'scorch')) e.ign.push({ dps: total * mult / dur, t: dur });
  if (e.ign.length > 12) e.ign.shift();
  if (!was && e.chill > 0 && st.keys['Thermal Shock']) thermal(e);
}
function chillE(e, n) {
  const st = G.stats, mult = (1 + stat(st, 'chillBuild') / 100) * (1 + 0.1 * RUN.anySup('deep_freeze'));
  if (e.boss) n *= 0.4; const wasChilled = e.chill > 0;
  e.chill = Math.min(5, e.chill + n * mult); e.chillT = 3;
  if (!wasChilled && e.ign.length && st.keys['Thermal Shock']) thermal(e);
  if (e.chill >= 5 && e.frozen <= 0) freeze(e, 2);
}
function freeze(e, dur) {
  const st = G.stats; e.frozen = (e.boss ? dur * 0.35 : dur) * (1 + stat(st, 'freezeDur') / 100 + 0.1 * RUN.anySup('winters_grip')) + 0.2 * RUN.anySup('deep_freeze'); e.chill = 0;
  if (G.P.active.cold_snap) { const r = 3 * (1 + 0.1 * RUN.supLvl('cold_snap', 'cascade')); nova(e.x, e.z, r, G.stats.dmg * 0.7 * (1 + 0.1 * RUN.supLvl('cold_snap', 'cascade')), { el: 'cold', skill: 'cold_snap', chill: 2, col: EL.cold.rgb, noFreezeLoop: true }); }
}
function shockE(e, eff) { e.shock = 2 * (1 + 0.1 * RUN.anySup('static_buildup')); e.shockEff = Math.max(e.shockEff, eff * (1 + 0.1 * RUN.anySup('static_buildup'))); if (G.stats.keys['Corrupted Current']) poison(e, G.stats.dmg * 0.2, 1); }
function poison(e, total, stacks = 1, o = {}) {
  const st = G.stats, dur = 4 * (1 + stat(st, 'poisonDur') / 100), mult = (1 + stat(st, 'poisonDmg') / 100) * (1 + 0.1 * RUN.anySup('potent_venom'));
  let n = stacks; if (G.P.active.festering && Object.keys(e.curses).length) n *= 2;
  for (let i = 0; i < n; i++) e.pois.push({ dps: total * mult / dur, t: dur });
  const cap = st.keys['Plague Lord'] ? 999 : 60; while (e.pois.length > cap) e.pois.shift();
  if (G.P.active.virulence) { e.virCount = (e.virCount || 0) + n; if (e.virCount >= 10) { e.virCount -= 10; nova(e.x, e.z, 2.6, st.dmg * 0.9, { el: 'chaos', skill: 'virulence', col: EL.chaos.rgb, pois: 2 }); } }
}
function addStun(e, v) { if (e.boss) v *= 0.35; e.stun += v; if (e.stun >= 100) { e.stun = 0; e.stunT = 1 + 0.2 * RUN.anySup('concussion'); } }
function thermal(e) { nova(e.x, e.z, 2.4, G.stats.dmg * 0.8, { el: 'fire', quiet: false, noAil: true, col: [1, 0.6, 0.8] }); }
function chainFrom(src, d, n, o, seen) {
  seen = seen || new Set([src]); if (n <= 0) return;
  const bonus = G.stats.keys.Superconductor ? G.ents.filter(e => e.frozen > 0).length : 0; n += bonus;
  let cur = src;
  for (let i = 0; i < n; i++) {
    let best = null, bd = 7; for (const e of G.ents) { if (e.dead || seen.has(e) && !RUN.corr('fork')) continue; if (e === cur) continue; const dd = dist(cur, e); if (dd < bd) { bd = dd; best = e; } }
    // conductors pull extra jumps
    if (!best) break; seen.add(best); fxLine(cur.x, cur.z, best.x, best.z, EL.light.rgb);
    const mult = G.P.active.conduction ? 1 + 0.12 * (i + 1) * (1 + 0.1 * RUN.supLvl('conduction', 'grid')) : Math.pow(0.85, i);
    hit(best, d * mult, Object.assign({}, o, { chained: true, el: 'light' })); cur = best;
  }
}
function kill(e, o = {}) {
  if (e.dead) return; e.dead = true; e.hp = 0; G.kills++; const P = G.P, st = G.stats;
  e.anim = { clip: 'Death_A', t: 0, loop: false }; e.deadT = 1.2;
  if (e.boss && e === G.boss) for (const a of G.ents) if (!a.dead && a !== e) { a.dead = true; a.hp = 0; a.deadT = 0.6; a.anim = { clip: 'Death_A', t: 0, loop: false }; }
  // drops
  dropOrbs(e);
  if (RUN.onKill) RUN.onKill(e);
  // element deaths
  if (e.frozen > 0) shatter(e);
  if (e.ign.length && P.active.pyre) nova(e.x, e.z, 2.6 * (1 + 0.1 * RUN.supLvl('pyre', 'wildfire')), st.dmg * 0.9 * (1 + 0.1 * RUN.supLvl('pyre', 'wildfire')), { el: 'fire', skill: 'pyre', col: EL.fire.rgb });
  if (e.ign.length) { const n = 1 + (rnd() < 0.2 * RUN.anySup('ember_mastery') ? 1 : 0); for (let i = 0; i < n; i++) G.embers.push({ x: e.x + (rnd() - 0.5), z: e.z + (rnd() - 0.5), t: 8 }); }
  if (e.pois.length) {
    const total = e.pois.reduce((a, p) => a + p.dps * p.t, 0), share = P.active.contagion ? 1 : 0.5, reach = 4 * (1 + 0.15 * RUN.anySup('pandemic'));
    const near = G.ents.filter(x => !x.dead && x !== e && dist(x, e) < reach).sort((a, b) => dist(a, e) - dist(b, e)).slice(0, RUN.corr('pandemic') ? 2 : 1);
    for (const x of near) poison(x, total * share, Math.max(1, Math.round(e.pois.length * share * 0.5)));
    G.essences.push({ x: e.x, z: e.z, t: 10, n: 1 + stat(st, 'essenceGain') / 100 + 0.1 * RUN.anySup('soul_eater') });
    if (P.active.plague_bearer) P.bearer = (P.bearer || 0) + total * 0.5;
  }
  if (e.shock > 0 && P.active.static_discharge) nova(e.x, e.z, 2.8, st.dmg * 0.8 * (1 + 0.1 * RUN.supLvl('static_discharge', 'static_buildup')), { el: 'light', skill: 'static_discharge', col: EL.light.rgb, chain: 0 });
  if (e.shock > 0 && RUN.corr('static_buildup')) { const n = nearest(e, 6, e); if (n) shockE(n, e.shockEff); }
  if (Object.keys(e.curses).length && (st.keys['Pact of Rot'] || RUN.corr('hexmaster'))) { const n = nearest(e, 7, e); if (n) for (const k in e.curses) n.curses[k] = Object.assign({}, e.curses[k]); }
  if (e.curses.doom) { const n = strongest(e); if (n) n.curses.doom = { t: 8 }; }
  if (e.bomb) { const n = nearest(e, 8, e); if (n) { n.bomb = e.bomb; n.bomb.t = Math.max(1, n.bomb.t); } }
  if (P.active.rampage) { P.killCount++; gainRage(1); P.buffs.rampage = 3; if (P.killCount % 10 === 0) nova(P.x, P.z, 3.5, st.dmg * 2, { el: 'phys', skill: 'rampage', col: EL.phys.rgb }); }
  if (P.active.locust_swarm) P.locust = Math.min(12, (P.locust || 3) + 0.5);
  if (o.finisher && RUN.corr('executioner') && st.el === 'phys') P.rage = Math.min(maxRage(), P.rage + 5);
  if (o.minion && P.active.flame_spirit && RUN.corr('kindled_spirit')) nova(e.x, e.z, 2, st.dmg * 0.6, { el: 'fire', col: EL.fire.rgb });
}
function shatter(e) {
  const st = G.stats, P = G.P, big = P.active.shatter, n = big ? 8 : 5, d = st.dmg * (big ? 0.6 : 0.35) * (1 + stat(st, 'shatterDmg') / 100) * (1 + 0.12 * RUN.supLvl('shatter', 'brittle'));
  for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; shoot({ x: e.x, z: e.z, a, spd: 12, dmg: d, el: 'cold', life: 0.45, r: 0.25, col: EL.cold.rgb, chill: 1, skill: 'shatter', small: true }); }
  if (P.active.rime_harvest || RUN.corr('brittle')) gainCrystal(P.active.rime_harvest ? 2 : 1);
  fxBurst(e.x, 0.8, e.z, EL.cold.rgb, 2.2);
}
function dropOrbs(e) {
  const n = Math.max(1, Math.round(e.xp * (e.boss ? 0 : 1)));
  for (let i = 0; i < n; i++) G.orbs.push({ x: e.x + (rnd() - 0.5) * 1.2, z: e.z + (rnd() - 0.5) * 1.2, v: e.xp / n, t: 0, gold: 0 });
  if (rnd() < 0.5) G.orbs.push({ x: e.x + (rnd() - 0.5), z: e.z + (rnd() - 0.5), v: 0, gold: 1, t: 0 });
}
const nearest = (p, r, not) => { let b = null, bd = r; for (const e of G.ents) { if (e.dead || e === not || e.spawnT > 0.3) continue; const d = dist(p, e); if (d < bd) { bd = d; b = e; } } return b; };
const strongest = not => { let b = null; for (const e of G.ents) if (!e.dead && e !== not && (!b || e.hp > b.hp)) b = e; return b; };
const alive = () => G.ents.filter(e => !e.dead);
function biggestGroup(r = 3) { let best = null, bn = 0; for (const e of G.ents) { if (e.dead) continue; let n = 0; for (const f of G.ents) if (!f.dead && dist(e, f) < r) n++; if (n > bn) { bn = n; best = e; } } return best; }
function inRadius(x, z, r, fn) { for (const e of G.ents) if (!e.dead && Math.hypot(e.x - x, e.z - z) < r + e.r * 0.6) fn(e); }

// ---------- element resources ----------
const maxRage = () => 10 + RUN.anySup('overwhelm');
function gainRage(n) { const st = G.stats; G.P.rage = Math.min(maxRage(), G.P.rage + n * (1 + stat(st, 'rageGain') / 100 + 0.1 * RUN.anySup('overwhelm'))); G.P.rageT = 0; }
function gainHeat(n) { const st = G.stats; G.P.heat = Math.min(10, G.P.heat + n * (1 + stat(st, 'heatGain') / 100 + 0.15 * RUN.anySup('fuel'))); }
const maxCrystals = () => 6 + RUN.anySup('crystal_lattice');
function gainCrystal(n = 1) { G.P.crystals = Math.min(maxCrystals(), G.P.crystals + n); }
const maxCharge = () => G.stats.keys['Static Body'] ? 5 : 10 + RUN.anySup('supercharge');
function gainCharge(n) { const st = G.stats, P = G.P; P.charge = Math.min(maxCharge(), P.charge + n * (1 + stat(st, 'chargeGain') / 100)); P.chargeT = RUN.corr('supercharge') ? 4 : 2; if (P.charge >= 10 && P.active.overcharge && !P.overcharge) P.overcharge = 3; }
function heal(n, toShield) { const P = G.P; const over = P.hp + n - P.max; P.hp = Math.min(P.max, P.hp + n); if (toShield && over > 0) P.shield = Math.min(P.max * 0.3, P.shield + over); }

// ---------- damage to the player ----------
function hurt(dmg, src) {
  const P = G.P, st = G.stats; if (P.dead || P.inv > 0 || G.clear) return;
  if (rnd() * 100 < st.dodge) { pushWord(P.x, P.z, 'úhyb', '#9fe'); return; }
  if (P.active.fade && P.moving && rnd() < 0.3) { pushWord(P.x, P.z, 'úhyb', '#c9f'); return; }
  if (src && src.proj && P.crystals > 0 && G.stats.el === 'cold') { P.crystals--; fxBurst(P.x, 1, P.z, EL.cold.rgb, 1.2); return; }
  if (P.active.blazing_shield && P.bShield > 0) { P.bShield = 0; P.bShieldT = 4; nova(P.x, P.z, 3, st.dmg * 1.4 * (1 + 0.12 * RUN.supLvl('blazing_shield', 'searing_heat')), { el: 'fire', skill: 'blazing_shield', col: EL.fire.rgb }); return; }
  if (src && src.frail) dmg *= 0.75;
  const arm = st.armour; let red = arm / (arm + 6 * dmg); red = Math.min(0.75, red); if (!st.keys.Unbreakable && src && src.el && src.el !== 'phys') red = 0; else if (st.keys.Unbreakable && src && src.el && src.el !== 'phys') red *= 0.5;
  let d = dmg * (1 - red);
  if (P.shield > 0) { const a = Math.min(P.shield, d); P.shield -= a; d -= a; }
  P.hp -= d; P.hitFlash = 0.2; P.inv = 0.25; G.shake = Math.min(0.5, G.shake + 0.2);
  pushText(P.x, P.z, d, false, 'hurt');
  if (P.active.static_shield && src && src.ent) hit(src.ent, st.dmg * 0.8 * (1 + 0.1 * RUN.supLvl('static_shield', 'static_buildup')), { el: 'light', skill: 'static_shield' });
  if (P.active.reckoning) { P.reckon = (P.reckon || 0) + 1; if (P.reckon >= Math.max(1, 3 - Math.floor(RUN.supLvl('reckoning', 'bulwark') / 2))) { P.reckon = 0; nova(P.x, P.z, 3.2, st.dmg * 1.3 + st.armour * 0.05, { el: 'phys', skill: 'reckoning', col: EL.phys.rgb }); } }
  if (P.active.phoenix && P.hp < P.max * 0.3 && !P.phoenixUsed) { P.phoenixUsed = true; nova(P.x, P.z, 5, st.dmg * 3, { el: 'fire', skill: 'phoenix', col: EL.fire.rgb }); heal(P.max * 0.4); }
  if (P.hp <= 0) { P.hp = 0; P.dead = true; P.anim = { clip: 'Death_A', t: 0, loop: false }; }
}

// ---------- projectiles, novas, zones, effects ----------
// p: {x,z,a,spd,dmg,el,life,r,col,pierce,chain,bounce,homing,explode,onHit,skill,chill,pois,size}
function shoot(p) {
  const q = Object.assign({ life: 1.6, r: 0.3, pierce: 0, bounce: 0, hits: new Set(), y: 1.1, t: 0 }, p);
  q.vx = Math.sin(q.a) * q.spd; q.vz = Math.cos(q.a) * q.spd; G.projs.push(q); return q;
}
function eshoot(x, z, a, spd, dmg, o = {}) { G.eprojs.push(Object.assign({ x, z, vx: Math.sin(a) * spd, vz: Math.cos(a) * spd, dmg, life: 4, r: 0.32, col: [1, 0.35, 0.6], y: 1.1 }, o)); }
function nova(x, z, r, dmg, o = {}) {
  inRadius(x, z, r, e => hit(e, dmg, o));
  G.fx.push({ k: 'ring', x, z, r, t: 0, life: 0.35, col: o.col || EL[o.el || 'phys'].rgb });
  if (o.burst !== false) fxBurst(x, 0.6, z, o.col || EL[o.el || 'phys'].rgb, r * 0.5);
}
// delayed strike with a telegraph on the floor
function strike(x, z, r, delay, dmg, o = {}) { G.telegraphs.push({ x, z, r, t: delay, max: delay, dmg, o, mine: true }); }
// zone: {x,z,r,dur,tick,dmg,el,kind,col,chill,slow,onTick}
function zone(z) { const q = Object.assign({ t: 0, tickT: 0, tick: 0.5 }, z); G.zones.push(q); return q; }
function fxBurst(x, y, z, col, s = 1) { G.fx.push({ k: 'burst', x, y, z, s, t: 0, life: 0.35, col }); }
function fxLine(x0, z0, x1, z1, col, life = 0.18) { G.fx.push({ k: 'line', x: x0, z: z0, x1, z1, t: 0, life, col }); }
function pushText(x, z, v, isCrit, el) { G.texts.push({ x: x + (rnd() - 0.5) * 0.6, z, y: 2.2, v: Math.round(v), crit: isCrit, el, t: 0 }); if (G.texts.length > 60) G.texts.shift(); }
function pushWord(x, z, w, col) { G.texts.push({ x, z, y: 2.4, w, col, t: 0 }); }
