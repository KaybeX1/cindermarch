'use strict';
/* ===== skill gems: what each of the 125 gems does when its turn in the rotation comes ===== */
const SUP_DMG = { deep_cracks: 10, lingering_flames: 10, searing_heat: 12, wildfire: 10, hair_trigger: 10, kindled_spirit: 10, conflagration: 12, splinter: 8, heavy_ice: 15, frost_familiar: 10, grid: 10, high_voltage: 15, thunderbird: 10, barbed: 5, split_arrow: 5, feral_bond: 10 };
const SUP_AREA = { wide_swing: 10, volatile: 15, searing_heat: 10, permafrost: 10, cascade: 10, lingering_toxins: 10, storm_front: 10 };
const gemMult = lvl => 1 + 0.1 * (lvl - 1);
// cast context for one skill: damage, area and support levels that apply to it
function ctx(id, lvl) {
  const st = G.stats, P = G.P; let dm = 1, ar = 1 + stat(st, 'areaPct') / 100;
  for (const s in RUN.sup) { const L = RUN.supLvl(id, s); if (!L) continue; if (SUP_DMG[s]) dm *= 1 + SUP_DMG[s] * L / 100; if (SUP_AREA[s]) ar *= 1 + SUP_AREA[s] * L / 100; }
  const mom = RUN.supLvl(id, 'momentum'); if (mom && P.t - (P.lastLeap || -9) < 2) dm *= 1 + 0.15 * mom;
  const sh = RUN.supLvl(id, 'shadow'); if (sh && P.moveT > 0 && P.stillT < 0.6) dm *= 1 + 0.15 * sh;
  if (st.keys.Berserker) dm *= 1 + 0.03 * P.rage;
  if (P.heat) dm *= 1 + 0.02 * P.heat;
  const bw = RUN.supLvl(id, 'bulwark');
  const D = st.dmg * gemMult(lvl) * dm + (bw ? st.armour * 0.1 * bw * 0.1 : 0);
  return { id, lvl, D, A: ar, L: s => RUN.supLvl(id, s), corr: s => RUN.supLvl(id, s) && RUN.corr(s), el: SKILLS[id].el, skill: id };
}
const aimTarget = (r = 40) => { const P = G.P; let b = null, bd = r; for (const e of G.ents) { if (e.dead || e.spawnT > 0.3) continue; let d = dist(P, e); if (!losClear(G.room, P.x, P.z, e.x, e.z)) d += 6; if (d < bd) { bd = d; b = e; } } return b; };
const extraProj = c => (c.L('splinter') >= 2 ? 1 : 0) + (c.L('splinter') >= 4 ? 1 : 0) + (c.L('split_arrow') >= 2 ? 1 : 0) + (c.L('split_arrow') >= 4 ? 1 : 0);
function fan(c, n, spread, p) { const P = G.P, t = aimTarget(), a0 = t ? ang(P, t) : P.face; n += extraProj(c);
  for (let i = 0; i < n; i++) { const a = a0 + (n > 1 ? (i / (n - 1) - 0.5) * spread : 0); shoot(Object.assign({ x: P.x + Math.sin(a) * 0.5, z: P.z + Math.cos(a) * 0.5, a, skill: c.skill, el: c.el }, p)); }
  if (G.P.active.shadow_archer && c.el === 'chaos') setTimeout0(0.25, () => { const t2 = aimTarget(), b = t2 ? ang(G.P, t2) : G.P.face; for (let i = 0; i < n; i++) shoot(Object.assign({ x: G.P.x, z: G.P.z, a: b + (n > 1 ? (i / (n - 1) - 0.5) * spread : 0), skill: c.skill, el: c.el }, p, { dmg: p.dmg * 0.6, col: [0.45, 0.25, 0.6] })); });
  return a0; }
function cone(c, range, width, dmg, o = {}) { const P = G.P, t = aimTarget(range + 2), a0 = t ? ang(P, t) : P.face; P.face = a0;
  for (const e of G.ents) { if (e.dead) continue; const d = dist(P, e); if (d > range * c.A + e.r) continue; let da = Math.abs(((ang(P, e) - a0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI); if (da < width / 2 || d < 1.2) hit(e, dmg, Object.assign({ el: c.el, skill: c.skill }, o)); }
  G.fx.push({ k: 'cone', x: P.x, z: P.z, a: a0, w: width, r: range * c.A, t: 0, life: 0.25, col: EL[c.el].rgb }); return a0; }
function melee(c, range, width, dmg, o = {}) { const a0 = cone(c, range, width, dmg, Object.assign({ rage: 1 }, o)); if (c.corr('wide_swing')) cone(c, range, width, dmg * 0.5, o); G.P.swing = 0.25; return a0; }
const crack = (x, z, len = 0, a = 0) => { const dur = 4 * (1 + stat(G.stats, 'fissureDur') / 100) + RUN.anySup('deep_cracks'); const n = Math.max(1, Math.round(len / 1.4));
  for (let i = 0; i < n; i++) G.cracks.push({ x: x + Math.sin(a) * i * 1.4, z: z + Math.cos(a) * i * 1.4, t: dur }); if (G.cracks.length > 40) G.cracks.splice(0, G.cracks.length - 40); };
function slamEcho(c, fn) { if (G.P.active.aftershock) { const e = RUN.supLvl('aftershock', 'seismic_echo'); setTimeout0(1, () => fn(0.5 * (1 + 0.1 * e))); if (e >= 5) setTimeout0(2, () => fn(0.35)); } }
function leapTo(x, z) { const P = G.P; if (G.t - P.lastLeap < 1) return false; const R = G.room; for (let k = 0; k < 8; k++) { if (canStand(R, x, z, P.r)) break; x += (P.x - x) * 0.2; z += (P.z - z) * 0.2; }
  if (!canStand(R, x, z, P.r)) return false; fxLine(P.x, P.z, x, z, [1, 1, 1], 0.25); P.x = x; P.z = z; P.lastLeap = G.t; if (RUN.corr('momentum')) P.inv = Math.max(P.inv, 1); return true; }
const persist = (c, extra) => { const P = G.P; P.active[c.id] = RUN.rotDur() + 0.4; if (extra) extra(); };
// timers that live inside the arena clock
function setTimeout0(sec, fn) { G.fx.push({ k: 'timer', t: 0, life: sec, fn }); }
function summon(c, kind, o) { const P = G.P; let m = G.minions.find(m => m.kind === kind && !m.second); if (!m) { m = Object.assign({ kind, x: P.x + 1, z: P.z, t: 0, fireT: 0.5, el: c.el, a: 0 }, o); G.minions.push(m); } m.c = c; m.life = RUN.rotDur() + 0.5; m.lvl = c.lvl;
  if (o.second && !G.minions.find(q => q.kind === kind && q.second)) G.minions.push(Object.assign({}, m, { second: true, a: Math.PI })); }

const SKL = {
  // ===== physical =====
  cleave: c => melee(c, 3.2, 2.1, c.D * 1.25),
  double_strike: c => { const t = aimTarget(4); if (!t) return melee(c, 3, 1.2, c.D * 0.8); G.P.face = ang(G.P, t); const ru = c.L('ruthless'); for (let i = 0; i < 2; i++) setTimeout0(i * 0.12, () => { G.P.ruth = (G.P.ruth || 0) + 1; const big = ru && G.P.ruth % (c.corr('ruthless') ? 2 : 3) === 0; hit(t, c.D * 0.8 * (big ? 1.2 : 1), { el: 'phys', skill: c.id, stun: big ? 100 : 10 }); }); gainRage(2); G.P.swing = 0.2; },
  blade_flurry: c => { const t = aimTarget(4); const P = G.P; if (t && P.flurryT === t) P.flurry = Math.min(6, (P.flurry || 0) + 1); else P.flurry = 0; P.flurryT = t; const n = 3 + P.flurry; for (let i = 0; i < n; i++) setTimeout0(i * 0.6 / n, () => melee(c, 3, 1.6, c.D * 0.42)); },
  crushing_blow: c => { const t = aimTarget(4); if (t) { G.P.face = ang(G.P, t); hit(t, c.D * 2.1, { el: 'phys', skill: c.id, stun: 45 }); t.crush = Math.min(5, t.crush + 1); fxBurst(t.x, 0.8, t.z, EL.phys.rgb, 1.3); } else melee(c, 3, 1.2, c.D * 1.5); G.P.swing = 0.35; },
  flicker_strike: c => { const P = G.P, n = P.rage >= maxRage() ? 3 : 1; let done = 0; const go = () => { const es = alive(); if (!es.length) return; const t = pick(es); if (done === 0 && G.t - P.lastLeap < 1) return; P.lastLeap = -9; const a = ang(t, P); leapTo(t.x + Math.sin(a) * 1.1, t.z + Math.cos(a) * 1.1); P.face = ang(P, t); hit(t, c.D * 1.4, { el: 'phys', skill: c.id }); done++; if (done < n) setTimeout0(0.18, go); }; go(); },
  leap_slam: c => { const t = biggestGroup(3); if (!t || dist(G.P, t) > 11) return SKL.cleave(c); if (!leapTo(t.x, t.z + 0.8)) return SKL.cleave(c); const f = m => { nova(G.P.x, G.P.z, 2.7 * c.A, c.D * 1.4 * m, { el: 'phys', skill: c.id, stun: 60 }); crack(G.P.x, G.P.z); }; f(1); slamEcho(c, f); G.shake = 0.35; },
  ground_slam: c => { const f = m => { const a = cone(c, 6, 1.1, c.D * 1.35 * m, { stun: 30 }); crack(G.P.x, G.P.z, 6 * c.A, a); }; f(1); slamEcho(c, f); G.shake = 0.3; },
  sunder: c => { const P = G.P, t = aimTarget(), a = t ? ang(P, t) : P.face; const wave = (x, z, a, k, m) => { if (k > 5) return; const nx = x + Math.sin(a) * 1.6, nz = z + Math.cos(a) * 1.6; if (!shotFree(G.room, nx, nz)) return; let hitAny = false; inRadius(nx, nz, 1.3 * c.A, e => { hit(e, c.D * 0.9 * m, { el: 'phys', skill: c.id }); hitAny = true; }); fxBurst(nx, 0.3, nz, EL.phys.rgb, 0.9); setTimeout0(0.07, () => { wave(nx, nz, a, k + 1, m); if (hitAny && k < 4) { wave(nx, nz, a + 0.6, k + 2, m * 0.6); wave(nx, nz, a - 0.6, k + 2, m * 0.6); } }); }; wave(P.x, P.z, a, 0, 1); slamEcho(c, m => wave(G.P.x, G.P.z, a, 0, m)); crack(P.x, P.z, 5, a); },
  rock_spikes: c => { const near = G.cracks.filter(k => Math.hypot(k.x - G.P.x, k.z - G.P.z) < 12); if (!near.length) { const t = aimTarget(10); if (t) { crack(t.x, t.z); near.push(G.cracks[G.cracks.length - 1]); } } for (const k of near.slice(-10)) { nova(k.x, k.z, 1.6 * c.A, c.D * 0.9, { el: 'phys', skill: c.id, stun: 20 }); G.fx.push({ k: 'spike', x: k.x, z: k.z, t: 0, life: 0.5 }); } },
  aftershock: c => persist(c), rampage: c => persist(c), blood_rage: c => persist(c), reckoning: c => persist(c),
  war_cry: c => persist(c, () => { if (!G.P.cryT || G.P.cryT <= 0) { G.P.cryT = 0.01; } }),
  whirlwind: c => persist(c),
  earthquake: c => { const P = G.P, r = P.rage; nova(P.x, P.z, 3 * c.A, c.D * 1.2, { el: 'phys', skill: c.id, finisher: true }); P.rage = 0; const m = (1 + r * 0.12) * (1 + 0.1 * c.L('executioner')); setTimeout0(1.5, () => { for (const k of G.cracks.filter(k => Math.hypot(k.x - G.P.x, k.z - G.P.z) < 12)) nova(k.x, k.z, 2.2 * c.A, c.D * 0.9 * m, { el: 'phys', skill: c.id, finisher: true }); G.shake = 0.5; }); slamEcho(c, mm => nova(G.P.x, G.P.z, 3 * c.A, c.D * mm, { el: 'phys', skill: c.id })); },
  execute: c => { const P = G.P, cost = Math.max(1, 5 - (c.L('executioner') >= 3 ? 1 : 0) - (c.L('executioner') >= 5 ? 1 : 0)); let t = null; for (const e of alive()) if (dist(P, e) < 5 && (!t || e.hp / e.max < t.hp / t.max)) t = e; if (!t) return; const th = 0.3 + 0.04 * c.L('executioner'); const ok = P.rage >= cost && (t.hp / t.max < th || t.stunT > 0); P.face = ang(P, t); if (ok) { P.rage -= cost; hit(t, c.D * 6, { el: 'phys', skill: c.id, finisher: true, critBonus: 25 }); fxBurst(t.x, 1, t.z, [1, 0.3, 0.3], 2); } else hit(t, c.D * 1.3, { el: 'phys', skill: c.id }); P.swing = 0.3; },
  titans_fall: c => { const P = G.P, t = biggestGroup(3) || aimTarget(), r = P.rage; P.rage = 0; const x = t ? t.x : P.x, z = t ? t.z : P.z; const m = (1 + r * 0.25) * (1 + 0.1 * c.L('executioner')); P.inv = Math.max(P.inv, 1); strike(x, z, 3.5 * c.A, 1, c.D * 2 * m, { el: 'phys', skill: c.id, stun: 100, finisher: true, after: () => { leapTo(x, z + 0.5); crack(x, z, 4, 0); crack(x, z, 4, Math.PI / 2); G.shake = 0.7; } }); slamEcho(c, mm => nova(x, z, 3.5 * c.A, c.D * 2 * m * mm, { el: 'phys', skill: c.id })); },
  shield_slam: c => { if (!G.stats.shield) return SKL.cleave(c); melee(c, 2.8, 1.6, c.D * 1.2 + G.stats.armour * 0.06, { stun: 100 }); },
  shield_charge: c => { const P = G.P, t = aimTarget(9); if (!t || !G.stats.shield) return SKL.cleave(c); const a = ang(P, t), L = Math.min(8, dist(P, t) + 2); const x1 = P.x + Math.sin(a) * L, z1 = P.z + Math.cos(a) * L; const x0 = P.x, z0 = P.z; if (!leapTo(x1, z1)) return; for (const e of alive()) { const t2 = ((e.x - x0) * (G.P.x - x0) + (e.z - z0) * (G.P.z - z0)) / (L * L); if (t2 < 0 || t2 > 1) continue; const px = x0 + (G.P.x - x0) * t2, pz = z0 + (G.P.z - z0) * t2; if (Math.hypot(e.x - px, e.z - pz) < 1.4) { hit(e, c.D * 1.1 + G.stats.armour * 0.04, { el: 'phys', skill: c.id, stun: 50 }); e.knock = 0.25; e.vx = Math.sin(a + Math.PI / 2) * 8; e.vz = Math.cos(a + Math.PI / 2) * 8; } } },
  // ===== fire =====
  fireball: c => { gainHeat(1); const vol = c.L('volatile'); fan(c, 1, 0, { spd: 14, dmg: c.D * 1.15, r: 0.35, col: EL.fire.rgb, explode: { r: 1.7 * c.A, dmg: c.D * 0.4, split: c.corr('volatile') } }); },
  flamethrower: c => { gainHeat(2); for (let i = 0; i < 4; i++) setTimeout0(i * 0.15, () => cone(c, 5, 0.9, c.D * 0.36)); },
  searing_ray: c => { gainHeat(1); const t = aimTarget(); if (!t) return; const P = G.P; P.ray = P.rayT === t ? Math.min(8, (P.ray || 0) + 1) : 0; P.rayT = t; for (let i = 0; i < 6; i++) setTimeout0(i * 0.14, () => { if (t.dead) return; fxLine(G.P.x, G.P.z, t.x, t.z, EL.fire.rgb, 0.16); hit(t, c.D * 0.26 * (1 + 0.15 * (P.ray + i / 6)), { el: 'fire', skill: c.id, quiet: i % 2 === 1 }); }); },
  inferno_orb: c => { gainHeat(1); fan(c, 1, 0, { spd: 4, dmg: 0, life: 3, r: 0.5, pierce: 99, col: [1, 0.55, 0.15], big: 1.6, pulse: { every: 0.3, r: 1.8 * c.A, dmg: c.D * 0.26 } }); },
  fire_nova: c => { gainHeat(1); const f = () => nova(G.P.x, G.P.z, 3.6 * c.A, c.D * 1.05, { el: 'fire', skill: c.id }); f(); if (c.corr('searing_heat')) setTimeout0(0.4, f); },
  meteor: c => { gainHeat(1); const t = biggestGroup(3) || aimTarget(); if (!t) return; strike(t.x, t.z, 2.6 * c.A, 1, c.D * 2.3, { el: 'fire', skill: c.id, after: () => { burnGround(c, t.x, t.z, 2.2 * c.A, 3); G.shake = 0.3; } }); },
  ember_storm: c => { gainHeat(1); const P = G.P; for (let i = 0; i < 6; i++) { const t = pick(alive().filter(e => dist(e, P) < 10)) || P; strike(t.x + (rnd() - 0.5) * 2, t.z + (rnd() - 0.5) * 2, 1.4 * c.A, 0.4 + rnd() * 0.6, c.D * 0.6, { el: 'fire', skill: c.id, after: (x, z) => { if (rnd() < 0.4) G.embers.push({ x, z, t: 6 }); } }); } },
  flame_wall: c => { gainHeat(1); const P = G.P, t = aimTarget(), a = t ? ang(P, t) : P.face, d = t ? Math.min(dist(P, t) * 0.6, 6) : 4, cx = P.x + Math.sin(a) * d, cz = P.z + Math.cos(a) * d; const n = 1 + (c.L('hair_trigger') >= 3 ? 1 : 0) + (c.L('hair_trigger') >= 5 ? 1 : 0);
    for (let w = 0; w < n; w++) for (let i = -3; i <= 3; i++) zone({ kind: 'fire', wall: 1, x: cx + Math.cos(a) * i * 1.2 + Math.sin(a) * w * 1.6, z: cz - Math.sin(a) * i * 1.2 + Math.cos(a) * w * 1.6, r: 0.8, dur: 4 + c.L('lingering_flames'), tick: 0.4, dmg: c.D * 0.3, el: 'fire', skill: c.id, col: EL.fire.rgb }); },
  fire_trap: c => { gainHeat(1); const t = aimTarget(12); const n = 1 + (c.L('hair_trigger') >= 3 ? 1 : 0) + (c.L('hair_trigger') >= 5 ? 1 : 0); for (let i = 0; i < n; i++) { const x = (t ? t.x : G.P.x) + (rnd() - 0.5) * 3, z = (t ? t.z : G.P.z - 3) + (rnd() - 0.5) * 3; zone({ kind: 'trap', x, z, r: 0.7, dur: 8, el: 'fire', skill: c.id, creep: c.corr('hair_trigger'), col: EL.fire.rgb, trigger: (q) => { nova(q.x, q.z, 2.4 * c.A, c.D * 1.9, { el: 'fire', skill: c.id }); q.t = q.dur; } }); } },
  lava_pool: c => { gainHeat(1); const t = biggestGroup(3) || aimTarget(); if (!t) return; const n = 1 + (c.L('hair_trigger') >= 3 ? 1 : 0) + (c.L('hair_trigger') >= 5 ? 1 : 0); for (let i = 0; i < n; i++) burnGround(c, t.x + i * 1.5, t.z, 2.4 * c.A, 3, 0.36); },
  living_bomb: c => { gainHeat(1); const t = aimTarget(); if (!t) return; t.bomb = { t: 3, d: c.D * 2.1 * (1 + 0.1 * c.L('wildfire')), r: 2.6 * c.A, skill: c.id, wild: c.L('wildfire'), corr: c.corr('wildfire') }; },
  pyre: c => persist(c), overheat: c => persist(c), ember_harvest: c => persist(c), ash_step: c => persist(c),
  fire_ring: c => persist(c), blazing_shield: c => persist(c, () => { if (G.P.bShield == null) G.P.bShield = 1; }),
  flame_spirit: c => { persist(c); summon(c, 'spirit', { second: c.L('kindled_spirit') >= 5 }); },
  combustion: c => { let n = 0; for (const e of alive()) { if (!e.ign.length) continue; const left = e.ign.reduce((a, q) => a + q.dps * q.t, 0); e.ign = []; hit(e, left * 1.5 * (1 + 0.12 * c.L('conflagration')) + c.D * 0.5, { el: 'fire', skill: c.id, noAil: !c.L('wildfire'), finisher: true }); fxBurst(e.x, 0.8, e.z, EL.fire.rgb, 1.6); n++; } if (!n) { const t = aimTarget(); if (t) hit(t, c.D, { el: 'fire', skill: c.id }); } },
  firestorm: c => { const P = G.P, h = P.heat; P.heat = c.corr('conflagration') ? Math.floor(h / 2) : 0; const m = (1 + h * 0.12) * (1 + 0.12 * c.L('conflagration')); for (let i = 0; i < 20; i++) setTimeout0(i * 0.15, () => { const es = alive(); const t = es.length && rnd() < 0.7 ? pick(es) : { x: 3 + rnd() * 16, z: 3 + rnd() * 30 }; strike(t.x + (rnd() - 0.5), t.z + (rnd() - 0.5), 1.6 * c.A, 0.25, c.D * 0.5 * m, { el: 'fire', skill: c.id, finisher: true }); }); },
  // ===== cold =====
  ice_shard: c => { gainCrystal(); fan(c, 2, 0.07, { spd: 18, dmg: c.D * 0.95, r: 0.28, col: EL.cold.rgb, chill: 1, split: c.corr('splinter') }); },
  frost_lance: c => { gainCrystal(); fan(c, 1, 0.3, { spd: 16, dmg: c.D * 1.05, r: 0.35, pierce: 99, col: [0.6, 0.9, 1], long: 1, chill: 1, split: c.corr('splinter') }); },
  cone_of_cold: c => { gainCrystal(); cone(c, 4.5, 1.05, c.D * 1.0, { chill: 2 }); },
  glacial_spike: c => { gainCrystal(); fan(c, 1, 0, { spd: 9, dmg: c.D * 2.2, r: 0.5, col: [0.75, 0.95, 1], big: 1.4, chill: 2, onHit: (e) => { if (e.frozen > 0) { hit(e, c.D * 1.5 * (1 + 0.12 * c.L('brittle')), { el: 'cold', skill: c.id }); if (!e.dead) { e.frozen = 0; shatter(e); } } if (c.corr('heavy_ice')) inRadius(e.x, e.z, 2, q => freeze(q, 1)); } }); },
  frost_nova: c => { gainCrystal(); nova(G.P.x, G.P.z, 3.5 * c.A, c.D * 0.9, { el: 'cold', skill: c.id, chill: 2 }); },
  hailstorm: c => { gainCrystal(); const t = biggestGroup(3) || aimTarget(); if (!t) return; for (let i = 0; i < 8; i++) strike(t.x + (rnd() - 0.5) * 3.5, t.z + (rnd() - 0.5) * 3.5, 1.3 * c.A, 0.3 + i * 0.08, c.D * 0.45, { el: 'cold', skill: c.id, chill: 1 }); },
  blizzard: c => { gainCrystal(); const t = biggestGroup(3) || aimTarget(); if (!t) return; zone({ kind: 'ice', x: t.x, z: t.z, r: 3 * c.A, dur: 4 + 0.5 * c.L('permafrost'), tick: 0.4, dmg: c.D * 0.24, el: 'cold', skill: c.id, chill: 0.6, slow: 0.3, col: EL.cold.rgb, snow: 1 }); },
  ice_wall: c => { gainCrystal(); const P = G.P, t = aimTarget(), a = t ? ang(P, t) : P.face, d = t ? Math.min(dist(P, t) * 0.5, 5) : 3, cx = P.x + Math.sin(a) * d, cz = P.z + Math.cos(a) * d; for (let i = -3; i <= 3; i++) zone({ kind: 'icewall', block: 1, x: cx + Math.cos(a) * i * 1.1, z: cz - Math.sin(a) * i * 1.1, r: 0.7, dur: 4 + 0.5 * c.L('permafrost'), tick: 0.5, dmg: c.D * 0.1, el: 'cold', skill: c.id, chill: 1, col: [0.7, 0.9, 1] }); },
  ice_mine: c => { gainCrystal(); const t = aimTarget(12); const x = t ? t.x : G.P.x, z = t ? t.z + 1 : G.P.z - 3; zone({ kind: 'trap', x, z, r: 0.7, dur: 8, el: 'cold', skill: c.id, col: EL.cold.rgb, trigger: q => { inRadius(q.x, q.z, 2.6 * c.A, e => { hit(e, c.D * 1.3, { el: 'cold', skill: c.id }); freeze(e, 1.5); }); nova(q.x, q.z, 2.6 * c.A, 0, { el: 'cold', quiet: true }); q.t = q.dur; } }); },
  frozen_ground: c => { gainCrystal(); const t = biggestGroup(3) || aimTarget(); if (!t) return; zone({ kind: 'ice', x: t.x, z: t.z, r: 3 * c.A, dur: 4 + 0.5 * c.L('permafrost'), tick: 0.5, dmg: c.D * 0.1, el: 'cold', skill: c.id, chill: 0.5, slow: 0.45, col: [0.6, 0.85, 1] }); },
  shatter: c => persist(c), cold_snap: c => persist(c), frostbite: c => persist(c), rime_harvest: c => persist(c),
  frost_orbit: c => persist(c), winter_aura: c => persist(c), frost_trail: c => persist(c),
  frost_wraith: c => { persist(c); summon(c, 'wraith', { second: c.L('frost_familiar') >= 5 }); },
  absolute_zero: c => { const P = G.P, n = P.crystals, use = c.corr('winters_grip') ? Math.ceil(n / 2) : n; P.crystals -= use; for (const e of alive()) { freeze(e, 0.5 + 0.4 * use); hit(e, c.D * 0.4 * Math.max(1, use), { el: 'cold', skill: c.id, finisher: true, noAil: true }); } G.fx.push({ k: 'flash', t: 0, life: 0.4, col: [0.7, 0.9, 1] }); },
  avalanche: c => { const t = biggestGroup(3) || aimTarget(); if (!t) return; strike(t.x, t.z, 3 * c.A, 0.6, 0, { el: 'cold', skill: c.id, after: (x, z) => { const fr = alive().filter(e => e.frozen > 0).length; inRadius(x, z, 3 * c.A, e => hit(e, c.D * 2.2 * (1 + 0.25 * fr) * (e.frozen > 0 ? 1 + 0.12 * c.L('brittle') : 1), { el: 'cold', skill: c.id, finisher: true, chill: 3 })); G.shake = 0.4; if (c.corr('heavy_ice')) inRadius(x, z, 4, e => freeze(e, 1.2)); } }); },
  // ===== lightning =====
  spark: c => { gainCharge(0.5); const P = G.P; const n = 4 + extraProj(c), near = alive().sort((a, b) => dist(P, a) - dist(P, b)).slice(0, 3); for (let i = 0; i < n; i++) { const t = near.length ? near[i % near.length] : null, a = (t ? ang(P, t) : P.face) + (rnd() - 0.5) * 0.25; shoot({ x: P.x, z: P.z, a, spd: 13, dmg: c.D * 0.6, el: 'light', skill: c.id, life: 2, r: 0.25, bounce: 3, wobble: 1, col: EL.light.rgb, chain: c.L('fork') ? 1 + c.L('fork') : 0 }); } quick(c, SKL.spark); },
  lightning_bolt: c => { gainCharge(1); const t = aimTarget(); if (!t) return; boltAt(t.x, t.z, 1.4 * c.A, c.D * 1.6, c); quick(c, SKL.lightning_bolt); },
  chain_lightning: c => { gainCharge(1); const t = aimTarget(); if (!t) return; fxLine(G.P.x, G.P.z, t.x, t.z, EL.light.rgb); hit(t, c.D * 1.0, { el: 'light', skill: c.id, chain: 6 + c.L('fork') }); },
  ball_lightning: c => { gainCharge(0.5); fan(c, 1, 0, { spd: 5, dmg: 0, life: 3, r: 0.5, pierce: 99, col: EL.light.rgb, big: 1.3, zap: { every: 0.25, r: 3.2, dmg: c.D * 0.3 }, chain: c.L('fork') }); },
  thunderclap: c => { gainCharge(1); nova(G.P.x, G.P.z, 3.2 * c.A, c.D * 1.0, { el: 'light', skill: c.id, chain: 0 }); quick(c, SKL.thunderclap); },
  storm_call: c => { gainCharge(1); const t = aimTarget(); if (!t) return; const n = 1 + (c.L('storm_front') >= 5 ? 1 : 0); for (let i = 0; i < n; i++) strike(t.x + i * 1.5, t.z, 2.2 * c.A, 1, c.D * 2.0 * (1 + 0.15 * c.L('high_voltage')), { el: 'light', skill: c.id, bolt: 1, stun: c.corr('high_voltage') ? 100 : 0 }); },
  static_field: c => { gainCharge(1); const t = biggestGroup(3) || G.P; zone({ kind: 'shock', x: t.x, z: t.z, r: 3.2 * c.A, dur: 3, tick: 0.5, dmg: c.D * 0.22, el: 'light', skill: c.id, col: EL.light.rgb }); },
  tesla_pylon: c => { const n = 1 + (c.L('grid') >= 3 ? 1 : 0) + (c.L('grid') >= 5 ? 1 : 0); for (let i = 0; i < n; i++) G.pylons.push({ kind: 'pylon', x: G.P.x + (rnd() - 0.5) * 4, z: G.P.z - 1 - rnd() * 3, t: 8, fireT: 0.3, c, keep: c.corr('grid') }); while (G.pylons.length > 6) G.pylons.shift(); },
  lightning_rod: c => { const t = biggestGroup(3); const n = 1 + (c.L('grid') >= 3 ? 1 : 0) + (c.L('grid') >= 5 ? 1 : 0); for (let i = 0; i < n; i++) G.pylons.push({ kind: 'rod', x: (t ? t.x : G.P.x) + (rnd() - 0.5) * 3, z: (t ? t.z : G.P.z - 4) + (rnd() - 0.5) * 3, t: 8, fireT: 0.6, c, keep: c.corr('grid') }); while (G.pylons.length > 6) G.pylons.shift(); },
  storm_cloud: c => { const t = strongest(); if (!t) return; G.pylons.push({ kind: 'cloud', x: t.x, z: t.z, follow: t, t: 6, fireT: 0.5, c, stick: c.corr('storm_front') }); },
  overcharge: c => persist(c), static_discharge: c => persist(c), feedback: c => persist(c), conduction: c => persist(c),
  static_shield: c => persist(c), ion_orbit: c => persist(c), flash_step: c => persist(c),
  storm_hawk: c => { persist(c); summon(c, 'hawk', { second: c.L('thunderbird') >= 5 }); },
  thunderstorm: c => { const P = G.P, ch = Math.floor(P.charge); P.charge = 0; const n = 3 + ch + (c.L('storm_front') >= 5 ? 1 : 0); for (let i = 0; i < n; i++) setTimeout0(i * 0.16, () => { const es = alive(); if (!es.length) return; const t = pick(es); boltAt(t.x, t.z, 1.6 * c.A, c.D * 0.9, c, true); }); },
  wrath_of_the_sky: c => { const P = G.P, ch = Math.floor(P.charge); P.charge = 0; const t = strongest(); if (!t) return; boltAt(t.x, t.z, 2.4 * c.A, c.D * 2 * (1 + 0.3 * ch) * (1 + 0.15 * c.L('high_voltage')), c, true); G.shake = 0.4; },
  // ===== chaos =====
  toxic_arrow: c => fan(c, 1, 0.25, { spd: 20, dmg: c.D * 1.0, r: 0.28, col: EL.chaos.rgb, arrow: 1, pois: 3 + barbed(c), pierce: c.corr('barbed') ? 1 : 0, bounceWall: c.corr('split_arrow') }),
  venom_volley: c => fan(c, 5, 0.9, { spd: 18, dmg: c.D * 0.55, r: 0.26, col: EL.chaos.rgb, arrow: 1, pois: 1, bounceWall: c.corr('split_arrow') }),
  piercing_thorn: c => fan(c, 1, 0, { spd: 22, dmg: c.D * 0.9, r: 0.28, col: [0.75, 0.45, 1], arrow: 1, pierce: 99, pois: 2 + barbed(c) }),
  seeker_arrow: c => fan(c, 1, 0, { spd: 13, dmg: c.D * 1.3, r: 0.3, col: [0.85, 0.5, 1], arrow: 1, homing: 1, life: 3, pois: 1 + barbed(c), pierce: c.corr('barbed') ? 1 : 0 }),
  rain_of_blight: c => { const t = biggestGroup(3) || aimTarget(); if (!t) return; const n = 10 + 2 * extraProj(c); for (let i = 0; i < n; i++) strike(t.x + (rnd() - 0.5) * 4 * c.A, t.z + (rnd() - 0.5) * 4 * c.A, 1.2, 0.3 + i * 0.05, c.D * 0.36, { el: 'chaos', skill: c.id, arrowFall: 1 }); },
  caustic_cloud: c => fan(c, 1, 0, { spd: 16, dmg: c.D * 0.7, r: 0.3, col: EL.chaos.rgb, arrow: 1, onEnd: (x, z) => zone({ kind: 'poison', x, z, r: 2.4 * c.A, dur: 4 * (1 + 0.1 * c.L('lingering_toxins')), tick: 0.5, dmg: c.D * 0.18, el: 'chaos', skill: c.id, col: [0.55, 0.9, 0.3], creep: c.corr('lingering_toxins') }) }),
  plague_burst: c => { const t = aimTarget(); if (!t) return; nova(t.x, t.z, 2.6 * c.A * (1 + 0.15 * c.L('pandemic')), c.D * 1.0, { el: 'chaos', skill: c.id, pois: 2 }); },
  wither: c => curse(c, 'wither', 3),
  frailty_hex: c => curse(c, 'frailty', 3),
  doom_mark: c => { const t = strongest(); if (t) { t.curses.doom = { t: 8 + c.L('hexmaster') }; fxBurst(t.x, 2, t.z, EL.chaos.rgb, 1); } },
  contagion: c => persist(c), virulence: c => persist(c), festering: c => persist(c), soul_siphon: c => persist(c),
  plague_aura: c => persist(c), fly_swarm: c => persist(c), fade: c => persist(c),
  carrion_raven: c => { persist(c); summon(c, 'raven', { second: c.L('feral_bond') >= 5 }); G.P.active.feral_link = RUN.rotDur(); },
  plague_harvest: c => { let sum = 0, n = 0; for (const e of alive()) { if (!e.pois.length) continue; const left = e.pois.reduce((a, p) => a + p.dps * p.t, 0) * 0.8; const m = e.pois.length >= 10 ? 1 + 0.08 * c.L('decay') : 1; e.pois = []; hit(e, left * m + c.D * 0.3, { el: 'chaos', skill: c.id, noAil: true, finisher: true }); sum += left; n++; fxBurst(e.x, 0.8, e.z, EL.chaos.rgb, 1.2); } G.P.essence += n * (1 + 0.1 * c.L('soul_eater')); },
  deaths_arrow: c => { const P = G.P, es = Math.floor(P.essence); P.essence = 0; fan(c, 1, 0, { spd: 24, dmg: c.D * 2 * (1 + 0.25 * es), r: 0.5, col: [0.6, 0.2, 1], arrow: 1, big: 2, pierce: 99, pois: 3, finisher: true }); },
  // ===== exclusive gems from the tree =====
  aegis_crash: c => { const a = melee(c, 4, 2.2, c.D * 1.4 + G.stats.armour * 0.06, { stun: 100 }); G.eprojs = G.eprojs.filter(p => Math.hypot(p.x - G.P.x, p.z - G.P.z) > 4.5); },
  thousand_cuts: c => { const P = G.P, hitL = []; let k = 0; const go = () => { const t = alive().filter(e => !hitL.includes(e)).sort((a, b) => dist(P, a) - dist(P, b))[0]; if (!t || k >= 5) { setTimeout0(0.3, () => hitL.forEach(e => { if (!e.dead) { hit(e, c.D * 0.9, { el: 'phys', skill: c.id }); fxBurst(e.x, 1, e.z, [1, 1, 1], 1.2); } })); return; } P.lastLeap = -9; leapTo(t.x + 0.8, t.z + 0.8); hit(t, c.D * 0.7, { el: 'phys', skill: c.id }); hitL.push(t); k++; setTimeout0(0.12, go); }; go(); },
  warlords_banner: c => persist(c, () => { G.P.banner = { x: G.P.x, z: G.P.z }; }),
  maelstrom_blade: c => persist(c),
  worldbreaker: c => { const t = biggestGroup(3) || aimTarget(); if (!t) return; if (!leapTo(t.x, t.z + 0.6)) { G.P.lastLeap = -9; leapTo(t.x, t.z + 0.6); } const f = m => { nova(G.P.x, G.P.z, 4 * c.A, c.D * 2.5 * m, { el: 'phys', skill: c.id, stun: 80 }); }; f(1); crack(G.P.x - 8, G.P.z, 16, Math.PI / 2); crack(G.P.x, G.P.z - 8, 16, 0); setTimeout0(1, () => f(0.5)); slamEcho(c, f); G.shake = 0.8; },
  solar_lance: c => { gainHeat(2); const P = G.P, t = aimTarget(), a = t ? ang(P, t) : P.face; for (let i = 1; i < 14; i++) { const x = P.x + Math.sin(a) * i * 1.3, z = P.z + Math.cos(a) * i * 1.3; if (!shotFree(G.room, x, z)) break; inRadius(x, z, 0.9, e => { if (e.solar !== G.t) { e.solar = G.t; hit(e, c.D * 1.5, { el: 'fire', skill: c.id }); } }); zone({ kind: 'fire', x, z, r: 0.8, dur: 3 + c.L('lingering_flames'), tick: 0.5, dmg: c.D * 0.18, el: 'fire', skill: c.id, col: EL.fire.rgb }); } fxLine(P.x, P.z, P.x + Math.sin(a) * 18, P.z + Math.cos(a) * 18, [1, 0.85, 0.4], 0.4); },
  ember_tide: c => { gainHeat(2); for (const e of alive()) { hit(e, c.D * 0.8, { el: 'fire', skill: c.id }); if (rnd() < 0.5) G.embers.push({ x: e.x, z: e.z, t: 6 }); } G.fx.push({ k: 'flash', t: 0, life: 0.35, col: [1, 0.5, 0.15] }); },
  volcano: c => { gainHeat(2); for (let i = 0; i < 10; i++) setTimeout0(i * 0.3, () => { const es = alive(); const t = es.length ? pick(es) : G.P; strike(t.x + (rnd() - 0.5) * 2, t.z + (rnd() - 0.5) * 2, 1.4 * c.A, 0.5, c.D * 0.6, { el: 'fire', skill: c.id, after: (x, z) => burnGround(c, x, z, 1.2, 2, 0.15) }); }); },
  inferno_crown: c => persist(c),
  phoenix: c => { persist(c); summon(c, 'phoenix', {}); },
  frozen_orb: c => { gainCrystal(); fan(c, 1, 0, { spd: 5, dmg: 0, life: 2.5, r: 0.55, pierce: 99, col: [0.75, 0.95, 1], big: 1.5, shards: { every: 0.12, dmg: c.D * 0.28 } }); },
  crystal_prison: c => { const t = strongest(); if (!t) return; t.prison = { t: t.boss ? 1 : 3, taken: t.hp, d: c.D }; freeze(t, t.boss ? 1 : 3); },
  glacier: c => { gainCrystal(); const P = G.P; const hitS = new Set(); for (let i = 0; i < 14; i++) setTimeout0(i * 0.1, () => { const z = P.z - i * 2.2; for (let x = 2; x < 21; x += 1.4) inRadius(x, z, 1, e => { if (!hitS.has(e)) { hitS.add(e); hit(e, c.D * 2, { el: 'cold', skill: c.id }); freeze(e, 1.5); } }); G.fx.push({ k: 'wall', z, t: 0, life: 0.25, col: [0.7, 0.9, 1] }); }); },
  eternal_winter: c => { for (let i = 0; i < 5; i++) setTimeout0(i, () => { for (const e of alive()) { chillE(e, 1); hit(e, c.D * 0.15, { el: 'cold', skill: c.id, quiet: true, noAil: true }); } gainCrystal(); G.fx.push({ k: 'flash', t: 0, life: 0.3, col: [0.8, 0.9, 1] }); }); },
  winter_titan: c => { persist(c); summon(c, 'titan', { x: G.P.x, z: G.P.z - 2 }); },
  arc_runner: c => persist(c),
  lightning_web: c => persist(c),
  roc_of_storms: c => { gainCharge(1); for (let i = 0; i < 8; i++) setTimeout0(0.2 + i * 0.15, () => { const es = alive(); if (!es.length) return; const t = pick(es); boltAt(t.x, t.z, 1.6 * c.A, c.D * 0.9, c); }); G.fx.push({ k: 'roc', t: 0, life: 1.6 }); },
  overload_core: c => persist(c),
  tempest_form: c => { G.P.buffs.tempest = 4; },
  hail_of_thorns: c => persist(c),
  malediction: c => { for (const e of alive()) { e.curses.wither = { t: 6 + c.L('hexmaster'), stacks: 0, d: c.D }; e.curses.frailty = { t: 6 + c.L('hexmaster') }; } G.fx.push({ k: 'flash', t: 0, life: 0.3, col: [0.6, 0.3, 0.9] }); },
  shadow_archer: c => persist(c),
  locust_swarm: c => persist(c, () => { if (!G.P.locust) G.P.locust = 3; }),
  plague_bearer: c => persist(c, () => { const P = G.P; if (P.bearer > 0) { nova(P.x, P.z, 5, P.bearer, { el: 'chaos', skill: c.id, pois: 2 }); P.bearer = 0; } }),
};
const barbed = c => { const b = c.L('barbed'); return (b >= 1 ? 1 : 0) + (b >= 3 ? 1 : 0) + (b >= 5 ? 1 : 0); };
function quick(c, fn) { if (c.corr('quickcast')) { G.P.qc = (G.P.qc || 0) + 1; if (G.P.qc % 5 === 0) setTimeout0(0.2, () => fn(Object.assign({}, c, { corr: () => false }))); } }
function boltAt(x, z, r, d, c, fin) { strike(x, z, r, 0.05, d, { el: 'light', skill: c.id, bolt: 1, finisher: fin, stun: c.corr('high_voltage') ? 100 : 0 }); }
function burnGround(c, x, z, r, dur, dmgMul = 0.3) { zone({ kind: 'fire', x, z, r, dur: dur * (1 + stat(G.stats, 'burnGroundDur') / 100) + c.L('lingering_flames'), tick: 0.4, dmg: c.D * dmgMul, el: 'fire', skill: c.id, col: EL.fire.rgb, slow: c.corr('lingering_flames') ? 0.3 : 0 }); }
function curse(c, kind, n) { const P = G.P, maxC = 2 + (c.L('hexmaster') >= 5 ? 1 : 0); const list = alive().sort((a, b) => dist(P, a) - dist(P, b)).slice(0, n); const eff = 1 + stat(G.stats, 'curseEff') / 100 + 0.1 * c.L('hexmaster');
  for (const e of list) { if (Object.keys(e.curses).length >= maxC && !e.curses[kind]) continue; e.curses[kind] = { t: 6 + c.L('hexmaster'), stacks: 0, d: c.D * eff, eff }; fxBurst(e.x, 2, e.z, EL.chaos.rgb, 0.8); } }
