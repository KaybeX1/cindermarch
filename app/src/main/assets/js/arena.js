'use strict';
/* ===== arena update: movement, the skill rotation, persistent gems, minions, enemy AI, bosses, projectiles ===== */
const INPUT = { x: 0, z: 0 };
function rotationSlots() { // slots whose skill gem can fire now (Schéma 7)
  const st = G.stats; return ROTATION.filter(s => st.rot[s]);
}
function castInterval() {
  const st = G.stats, P = G.P; let as = st.as + (P.active.blood_rage ? 25 : 0) + (P.buffs.rampage > 0 ? 15 : 0) + (P.inBanner ? 20 : 0) + (RUN.corr('overwhelm') && P.rage >= maxRage() ? 20 : 0);
  if (RUN.corr('soul_eater')) as += Math.min(30, P.essence * 2);
  let iv = 1 / (1 + as / 100); if (st.keys['Ice Fortress']) iv *= 1.2; return Math.max(0.35, iv);
}
function updatePlayer(dt) {
  const P = G.P, st = G.stats, R = G.room; if (P.dead) { P.anim.t += dt; return; }
  P.t = G.t; P.inv = Math.max(0, P.inv - dt); P.hitFlash = Math.max(0, P.hitFlash - dt); P.swing = Math.max(0, (P.swing || 0) - dt);
  for (const k in P.active) { P.active[k] -= dt; if (P.active[k] <= 0) delete P.active[k]; }
  for (const k in P.buffs) { P.buffs[k] -= dt; if (P.buffs[k] <= 0) delete P.buffs[k]; }
  // movement
  const mx = INPUT.x, mz = INPUT.z, ml = Math.hypot(mx, mz);
  let spd = 7 * (1 + stat(st, 'moveSpeed') / 100) * (st.keys['Frozen Heart'] ? 0.85 : 1) * (P.active.flash_step ? 1.25 : 1);
  P.moving = ml > 0.15;
  if (P.moving) { const vx = mx / Math.max(1, ml) * spd, vz = mz / Math.max(1, ml) * spd; const nx = P.x + vx * dt, nz = P.z + vz * dt;
    if (canStand(R, nx, P.z, P.r)) P.x = nx; if (canStand(R, P.x, nz, P.r)) P.z = nz; P.face = Math.atan2(vx, vz); P.moveT += dt; P.stillT = 0; }
  else { P.stillT += dt; if (P.stillT > 0.05 && P.moveT > 0) { if (P.arcOrbs && P.arcOrbs.length) { for (const o of P.arcOrbs) nova(o.x, o.z, 1.8, o.d, { el: 'light', skill: 'arc_runner' }); P.arcOrbs = []; } P.moveT = 0; } }
  // resources
  P.rageT = (P.rageT || 0) + dt; if (P.rageT > 3 && !P.active.blood_rage && !st.keys.Berserker && P.rage > 0) P.rage = Math.max(0, P.rage - dt);
  if (st.keys.Berserker && P.rage >= maxRage()) P.hp -= P.max * 0.01 * dt;
  if (P.moving && !st.keys['Living Furnace'] && !RUN.corr('fuel')) P.heat = Math.max(0, P.heat - dt * 0.8);
  if (st.keys['Living Furnace'] && P.heat >= 10) P.hp -= P.max * 0.01 * dt;
  if (P.chargeT > 0) { P.chargeT -= dt; if (P.chargeT <= 0 && !st.keys['Static Body']) P.charge = 0; }
  if (st.keys['Ice Fortress']) { P.iceT = (P.iceT || 0) + dt; if (P.iceT > 2) { P.iceT = 0; gainCrystal(); } }
  if (P.overcharge > 0 && P.charge < 10) {}
  if (P.active.blood_rage) P.hp -= P.max * 0.01 * dt;
  if (P.hp <= 0 && !P.dead) { P.dead = true; P.hp = 0; }
  // rotation
  const melee = st.melee, slots = rotationSlots();
  if (slots.length && (!P.moving || melee) && !G.clear) {
    P.rot.t -= dt;
    if (P.rot.t <= 0) {
      const slot = slots[P.rot.i % slots.length]; P.rot.i = (P.rot.i + 1) % slots.length;
      const g = st.rot[slot]; if (alive().length || SKILLS[g.id].group === 'trvalé' || SKILLS[g.id].group === 'spouštěč') castSkill(g.id, g.lvl);
      P.rot.t = castInterval(); P.lastSlot = slot;
    }
  }
  P.anim.t += dt;
  const want = P.dead ? 'Death_A' : P.moving ? 'Running_A' : P.castT > 0 ? (melee ? 'Throw' : 'Use_Item') : 'Idle_A';
  if (P.anim.clip !== want && !(P.castT > 0 && P.anim.clip === want)) { P.anim = { clip: want, t: 0, prev: P.anim.clip, prevT: P.anim.t, blend: 0, loop: want !== 'Throw' && want !== 'Use_Item' }; }
  if (P.anim.blend < 1) P.anim.blend = Math.min(1, P.anim.blend + dt * 6);
  P.castT = Math.max(0, P.castT - dt);
  persistentTick(dt);
}
function castSkill(id, lvl) {
  const P = G.P, c = ctx(id, lvl), f = SKL[id]; if (!f) return;
  const t = aimTarget(); if (t && !P.moving) P.face = ang(P, t);
  f(c); P.castCount++; P.castT = 0.35;
  if (P.overcharge > 0 && SKILLS[id].group !== 'trvalé' && SKILLS[id].group !== 'spouštěč') P.overcharge--;
  if (P.buffs.tempest) { const es = alive(); if (es.length) { const e = pick(es); boltAt(e.x, e.z, 1.4, G.stats.dmg * 1.2, { id: 'tempest_form', corr: () => false, L: () => 0 }); } }
  if (P.active.hail_of_thorns && P.castCount % 3 === 0) for (const e of alive()) { hit(e, G.stats.dmg * 0.5, { el: 'chaos', skill: 'hail_of_thorns', pois: 3 }); G.fx.push({ k: 'arrowfall', x: e.x, z: e.z, t: 0, life: 0.4 }); }
}
// continuous effects of persistent and trigger gems
function persistentTick(dt) {
  const P = G.P, st = G.stats, A = P.active, D = st.dmg; P.tick = (P.tick || 0) + dt;
  const every = (key, sec) => { P['_' + key] = (P['_' + key] || 0) + dt; if (P['_' + key] >= sec) { P['_' + key] -= sec; return true; } return false; };
  const lv = id => gemMult(st.gemLvl[id] || 1);
  if (A.whirlwind && P.moving && every('ww', 0.3)) nova(P.x, P.z, (2 + P.rage * 0.12) * (1 + 0.1 * RUN.supLvl('whirlwind', 'wide_swing')), D * 0.38 * lv('whirlwind'), { el: 'phys', skill: 'whirlwind', burst: false });
  if (A.war_cry && every('cry', 8)) { let n = 0; inRadius(P.x, P.z, 6, e => { const a = ang(e, P); e.x += Math.sin(a) * 1.5; e.z += Math.cos(a) * 1.5; addStun(e, 100 * (1 + 0.12 * RUN.supLvl('war_cry', 'concussion'))); n++; }); gainRage(n); G.fx.push({ k: 'ring', x: P.x, z: P.z, r: 6, t: 0, life: 0.5, col: [1, 0.9, 0.7] }); }
  const orbit = (id, n, r, d, el, col, extra) => { if (!A[id]) return; P['o_' + id] = (P['o_' + id] || 0) + dt * 2.4; for (let i = 0; i < n; i++) { const a = P['o_' + id] + i / n * Math.PI * 2, x = P.x + Math.sin(a) * r, z = P.z + Math.cos(a) * r; G.fx.push({ k: 'orb', x, z, y: 1, t: 0, life: 0.001, col, s: 0.32 });
    inRadius(x, z, 0.6, e => { e.oc = e.oc || {}; if ((e.oc[id] || 0) > G.t) return; e.oc[id] = G.t + 0.4; hit(e, d, Object.assign({ el, skill: id, quiet: false }, extra)); }); } };
  orbit('fire_ring', 3 + (RUN.corr('searing_heat') ? 1 : 0), 2.2 * (1 + 0.1 * RUN.supLvl('fire_ring', 'searing_heat')), D * 0.32 * lv('fire_ring') * (1 + 0.12 * RUN.supLvl('fire_ring', 'searing_heat')), 'fire', EL.fire.rgb);
  orbit('frost_orbit', 4, 2, D * 0.3 * lv('frost_orbit'), 'cold', EL.cold.rgb, { chill: 1 });
  orbit('ion_orbit', 5, 2.5, D * 0.25 * lv('ion_orbit'), 'light', EL.light.rgb, { chain: 0 });
  if (A.inferno_crown) { const n = Math.floor(P.heat / 2); orbit('inferno_crown', Math.max(1, n), 1.6, D * 0.25 * lv('inferno_crown'), 'fire', [1, 0.7, 0.2]); if (P.heat >= 10) { P.heat = RUN.corr('conflagration') ? 5 : 0; for (let i = 0; i < 5; i++) { const t = pick(alive()); if (t) shoot({ x: P.x, z: P.z, a: ang(P, t) + (rnd() - 0.5) * 0.4, spd: 15, dmg: D * 1.0 * lv('inferno_crown'), el: 'fire', skill: 'inferno_crown', r: 0.35, col: EL.fire.rgb, explode: { r: 1.8, dmg: D * 0.5 } }); } } }
  const trail = (id, sec, mk) => { if (A[id] && P.moving && every(id, sec)) mk(); };
  trail('ash_step', 0.35, () => zone({ kind: 'fire', x: P.x, z: P.z, r: 1.1, dur: 2.5 + RUN.supLvl('ash_step', 'lingering_flames'), tick: 0.4, dmg: D * 0.25 * lv('ash_step'), el: 'fire', skill: 'ash_step', col: EL.fire.rgb }));
  trail('frost_trail', 0.35, () => zone({ kind: 'ice', x: P.x, z: P.z, r: 1.2, dur: 3 + 0.5 * RUN.supLvl('frost_trail', 'permafrost'), tick: 0.5, dmg: D * 0.06, el: 'cold', skill: 'frost_trail', chill: 0.6, slow: 0.4, col: [0.65, 0.88, 1] }));
  trail('flash_step', 0.4 - 0.03 * RUN.supLvl('flash_step', 'blink_mastery'), () => { zone({ kind: 'shock', x: P.x, z: P.z, r: 1, dur: 1.5, tick: 0.5, dmg: D * 0.2 * lv('flash_step'), el: 'light', skill: 'flash_step', col: EL.light.rgb }); if (RUN.supLvl('flash_step', 'blink_mastery')) nova(P.x, P.z, 1.8, D * 0.3, { el: 'light', skill: 'flash_step', burst: false }); if (RUN.corr('blink_mastery')) P.inv = Math.max(P.inv, 0.5); });
  if (A.arc_runner && P.moving && every('arc', 0.5)) { P.arcOrbs = P.arcOrbs || []; if (P.arcOrbs.length < 6) P.arcOrbs.push({ x: P.x, z: P.z, d: D * 0.7 * lv('arc_runner') }); }
  if (P.arcOrbs) for (const o of P.arcOrbs) G.fx.push({ k: 'orb', x: o.x, z: o.z, y: 0.6, t: 0, life: 0.001, col: EL.light.rgb, s: 0.28 });
  const aura = (id, r, fn) => { if (A[id] && every('aura_' + id, 0.5)) inRadius(P.x, P.z, r, fn); if (A[id]) G.fx.push({ k: 'aura', x: P.x, z: P.z, r, t: 0, life: 0.001, col: id === 'winter_aura' ? EL.cold.rgb : [0.5, 0.9, 0.3] }); };
  aura('winter_aura', 3.5 * (1 + 0.1 * RUN.supLvl('winter_aura', 'frost_familiar')), e => { chillE(e, 0.6 * (1 + 0.1 * RUN.supLvl('winter_aura', 'deep_freeze'))); hit(e, D * 0.12 * lv('winter_aura'), { el: 'cold', skill: 'winter_aura', noAil: true, quiet: true }); });
  aura('plague_aura', 3.2 * (1 + 0.1 * RUN.supLvl('plague_aura', 'lingering_toxins')), e => poison(e, D * 0.2 * lv('plague_aura'), 1, { skill: 'plague_aura' }));
  if (A.fly_swarm && every('flies', 0.3)) { const t = nearest(P, 4.5); if (t) { hit(t, D * 0.16 * lv('fly_swarm') * (1 + 0.1 * RUN.supLvl('fly_swarm', 'feral_bond')), { el: 'chaos', skill: 'fly_swarm', minion: true, quiet: true }); } }
  if (A.fly_swarm) for (let i = 0; i < 6; i++) G.fx.push({ k: 'orb', x: P.x + Math.sin(G.t * 5 + i) * 1.6, z: P.z + Math.cos(G.t * 4 + i * 2) * 1.6, y: 1.2, t: 0, life: 0.001, col: [0.35, 0.3, 0.2], s: 0.12 });
  if (A.locust_swarm && every('loc', 0.3)) { const n = Math.floor(P.locust || 3); for (let i = 0; i < Math.min(4, Math.ceil(n / 3)); i++) { const t = nearest(P, 8); if (t) hit(t, D * 0.12 * (n / 3) * lv('locust_swarm'), { el: 'chaos', skill: 'locust_swarm', minion: true, quiet: true, pois: 1 }); } }
  if (A.overheat && P.heat >= 10) { P.heat = 0; nova(P.x, P.z, 4.5 * (1 + 0.15 * RUN.supLvl('overheat', 'fuel') * 0), D * 3 * lv('overheat') * (1 + 0.12 * RUN.supLvl('overheat', 'conflagration')), { el: 'fire', skill: 'overheat' }); G.shake = 0.4; }
  if (A.blazing_shield) { if (P.bShield === 0) { P.bShieldT = (P.bShieldT || 4) - dt; if (P.bShieldT <= 0) P.bShield = 1; } if (P.bShield) G.fx.push({ k: 'aura', x: P.x, z: P.z, r: 1.1, t: 0, life: 0.001, col: [1, 0.5, 0.15] }); }
  if (A.lightning_web && every('web', 0.4)) { const es = alive(); const nodes = es.concat(G.pylons); for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) { if (dist(nodes[i], nodes[j]) > 6) continue; fxLine(nodes[i].x, nodes[i].z, nodes[j].x, nodes[j].z, EL.light.rgb, 0.3); for (const n of [nodes[i], nodes[j]]) if (n.hp) hit(n, D * 0.15 * lv('lightning_web'), { el: 'light', skill: 'lightning_web', quiet: true, chain: 0 }); } }
  if (A.overload_core) { P.core = (P.core || 0) + dt * 1.2 + (P.charge >= maxCharge() ? dt * 2 : 0); G.fx.push({ k: 'orb', x: P.x, z: P.z, y: 3, t: 0, life: 0.001, col: EL.light.rgb, s: 0.3 + P.core * 0.04 }); if (P.core >= 10) { P.core = 0; const t = strongest(); if (t) { fxLine(P.x, P.z, t.x, t.z, [1, 1, 0.6], 0.3); hit(t, D * 4 * lv('overload_core'), { el: 'light', skill: 'overload_core', crit: true, chain: 3 }); } } }
  if (A.warlords_banner && P.banner) { const inb = Math.hypot(P.x - P.banner.x, P.z - P.banner.z) < 4; P.inBanner = inb; if (inb && every('ban', 1)) gainRage(1); if (inb && P.rage >= maxRage() && every('banShout', 3)) inRadius(P.x, P.z, 5, e => addStun(e, 100)); G.fx.push({ k: 'banner', x: P.banner.x, z: P.banner.z, t: 0, life: 0.001 }); } else P.inBanner = false;
  if (A.maelstrom_blade) { inRadius(P.x, P.z, 3.4, e => { const a = ang(e, P); if (!e.boss) { e.x += Math.sin(a) * dt * 2; e.z += Math.cos(a) * dt * 2; } }); if (every('mael', 0.3)) { nova(P.x, P.z, 2.6, D * 0.32 * lv('maelstrom_blade'), { el: 'phys', skill: 'maelstrom_blade', burst: false }); P.maelN = (P.maelN || 0) + 1; if (P.maelN % 3 === 0) crack(P.x, P.z); } G.fx.push({ k: 'aura', x: P.x, z: P.z, r: 2.6, t: 0, life: 0.001, col: [0.85, 0.85, 0.9] }); }
  if (A.plague_bearer && P.bearer > D * 6 && every('bear', 6)) { nova(P.x, P.z, 5, P.bearer, { el: 'chaos', skill: 'plague_bearer', pois: 2 }); P.bearer = 0; }
  if (A.ember_harvest) for (const e of G.embers) { const d = Math.hypot(e.x - P.x, e.z - P.z); if (d < 9) { e.x += (P.x - e.x) / d * dt * 8; e.z += (P.z - e.z) / d * dt * 8; } }
}
function updateMinions(dt) {
  const P = G.P, st = G.stats;
  for (const m of G.minions) {
    m.life -= dt; m.t += dt; m.a += dt * 1.5; const c = m.c, D = c.D;
    if (m.kind === 'titan') { G.taunt = m; m.fireT -= dt; if (m.fireT <= 0) { m.fireT = 1; nova(m.x, m.z, 2.5, D * 0.6, { el: 'cold', skill: c.id, chill: 1, minion: true }); } continue; }
    const tx = P.x + Math.sin(m.a) * 1.8, tz = P.z + Math.cos(m.a) * 1.8; m.x += (tx - m.x) * Math.min(1, dt * 4); m.z += (tz - m.z) * Math.min(1, dt * 4);
    m.fireT -= dt; if (m.fireT > 0) continue; const t = nearest(m, 12); if (!t) continue;
    if (m.kind === 'spirit') { m.fireT = 1; shoot({ x: m.x, z: m.z, a: ang(m, t), spd: 14, dmg: D * 0.5 * (1 + 0.08 * P.heat), el: 'fire', skill: c.id, r: 0.28, col: EL.fire.rgb, minion: true, explode: { r: 1.4, dmg: D * 0.2 } }); }
    else if (m.kind === 'wraith') { m.fireT = 1; shoot({ x: m.x, z: m.z, a: ang(m, t), spd: 16, dmg: D * 0.5, el: 'cold', skill: c.id, r: 0.26, col: EL.cold.rgb, minion: true, chill: 1, freezeHit: RUN.corr('frost_familiar') }); }
    else if (m.kind === 'hawk') { m.fireT = 0.8; fxLine(m.x, m.z, t.x, t.z, EL.light.rgb); hit(t, D * 0.5, { el: 'light', skill: c.id, minion: true }); if (RUN.corr('thunderbird')) gainCharge(1); }
    else if (m.kind === 'raven') { m.fireT = 0.9; m.x = t.x + 0.6; m.z = t.z + 0.6; hit(t, D * 0.5, { el: 'chaos', skill: c.id, pois: 2, minion: true }); }
    else if (m.kind === 'phoenix') { m.fireT = 0.7; hit(t, D * 0.6, { el: 'fire', skill: c.id, minion: true }); fxLine(m.x, m.z, t.x, t.z, EL.fire.rgb); }
  }
  G.minions = G.minions.filter(m => m.life > 0); if (G.taunt && !G.minions.includes(G.taunt)) G.taunt = null;
  for (const p of G.pylons) {
    p.t -= dt; p.fireT -= dt; if (p.follow && !p.follow.dead) { p.x += (p.follow.x - p.x) * Math.min(1, dt * 2); p.z += (p.follow.z - p.z) * Math.min(1, dt * 2); } else if (p.kind === 'cloud' && p.follow && p.follow.dead) p.follow = strongest();
    if (p.fireT > 0) continue; const c = p.c, D = c.D;
    if (p.kind === 'pylon') { p.fireT = 0.6; const t = nearest(p, 7); if (t) { fxLine(p.x, p.z, t.x, t.z, EL.light.rgb); hit(t, D * 0.45, { el: 'light', skill: c.id }); } for (const q of G.pylons) if (q !== p && dist(p, q) < 9) { inLine(p, q, e => hit(e, D * 0.2, { el: 'light', skill: c.id, quiet: true, chain: 0 })); fxLine(p.x, p.z, q.x, q.z, [1, 1, 0.6], 0.12); } }
    else if (p.kind === 'rod') { p.fireT = 0.8; const t = nearest(p, 6); if (t) { fxLine(p.x, p.z, t.x, t.z, EL.light.rgb); hit(t, D * 0.5, { el: 'light', skill: c.id, chain: 2 }); } }
    else if (p.kind === 'cloud') { p.fireT = 0.7; if (p.follow && !p.follow.dead) boltAt(p.follow.x, p.follow.z, 1.3, D * 0.6, c); }
  }
  G.pylons = G.pylons.filter(p => p.t > 0);
}
function inLine(a, b, fn) { const L = dist(a, b) || 1; for (const e of alive()) { const t = clamp(((e.x - a.x) * (b.x - a.x) + (e.z - a.z) * (b.z - a.z)) / (L * L), 0, 1); if (Math.hypot(e.x - (a.x + (b.x - a.x) * t), e.z - (a.z + (b.z - a.z) * t)) < 0.8) fn(e); } }

// ---------- enemies ----------
function updateEnemies(dt) {
  const P = G.P; G.flowT -= dt; if (G.flowT <= 0) { G.flowT = 0.25; updateFlow(); }
  for (const e of G.ents) {
    if (e.dead) { e.deadT -= dt; e.anim.t += dt; continue; }
    e.anim.t += dt; e.hitT = Math.max(0, e.hitT - dt);
    if (e.spawnT > 0) { e.spawnT -= dt; continue; }
    // ailments
    let dot = 0; e.ign = e.ign.filter(q => (q.t -= dt) > 0); for (const q of e.ign) dot += q.dps;
    const pt = RUN.corr('potent_venom') ? 2 : 1; e.pois = e.pois.filter(q => (q.t -= dt * pt) > 0); let pd = 0; for (const q of e.pois) pd += q.dps * pt;
    if (dot) { e.dotT = (e.dotT || 0) + dt; } if (dot || pd) { e.dotAcc = (e.dotAcc || 0) + (dot + pd) * dt; e.dotShow = (e.dotShow || 0) + dt; if (e.dotShow > 0.5) { e.dotShow = 0; const v = e.dotAcc; e.dotAcc = 0; hit(e, v, { dot: true, el: pd > dot ? 'chaos' : 'fire', quiet: false, noAil: true, crit: false }); if (e.dead) continue; } }
    if (e.chillT > 0) { e.chillT -= dt; if (e.chillT <= 0) e.chill = 0; }
    if (e.frozen > 0) { e.frozen -= dt; if (RUN.corr('deep_freeze')) e.hp -= e.max * 0.02 * dt; }
    if (e.shock > 0) { e.shock -= dt; if (e.shock <= 0) e.shockEff = 0; }
    if (e.stunT > 0) e.stunT -= dt;
    for (const k in e.curses) { const cu = e.curses[k]; cu.t -= dt; if (k === 'wither') { cu.acc = (cu.acc || 0) + dt; if (cu.acc >= 1) { cu.acc = 0; cu.stacks++; hit(e, (cu.d || G.stats.dmg) * 0.12 * cu.stacks * 0.3, { el: 'chaos', skill: 'wither', quiet: true, dot: true }); } } if (cu.t <= 0) delete e.curses[k]; }
    if (e.dead) continue;
    if (e.bomb) { e.bomb.t -= dt; if (e.bomb.t <= 0) { const b = e.bomb; e.bomb = null; nova(e.x, e.z, b.r, b.d, { el: 'fire', skill: b.skill }); if (b.corr) setTimeout0(0.3, () => nova(e.x, e.z, b.r * 0.8, b.d * 0.5, { el: 'fire' })); } }
    if (e.prison) { e.prison.t -= dt; if (e.prison.t <= 0) { const taken = Math.max(0, e.prison.taken - e.hp); nova(e.x, e.z, 3, e.prison.d + taken * 0.5, { el: 'cold', skill: 'crystal_prison' }); e.prison = null; } }
    if (e.knock > 0) { e.knock -= dt; moveEnt(e, e.vx, e.vz, dt); continue; }
    if (e.frozen > 0 || e.stunT > 0) continue;
    let slow = 1 - Math.min(0.6, e.chill * 0.1); if (e.curses.frailty) slow *= 0.7; if (e.inZoneSlow) slow *= 1 - e.inZoneSlow; e.inZoneSlow = 0;
    e.atkT -= dt * (e.curses.frailty ? 0.8 : 1) * (RUN.corr('decay') && e.pois.length ? 0.8 : 1) * (e.zoneAtkSlow ? 0.75 : 1); e.zoneAtkSlow = 0;
    const target = G.taunt && dist(e, G.taunt) < 7 ? G.taunt : P;
    if (e.boss) bossAI(e, dt, slow); else enemyAI(e, dt, slow, target);
  }
  // separation
  const es = G.ents; for (let i = 0; i < es.length; i++) { const a = es[i]; if (a.dead) continue; for (let j = i + 1; j < es.length; j++) { const b = es[j]; if (b.dead) continue; const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), m = (a.r + b.r) * 0.8; if (d > 0.001 && d < m) { const p = (m - d) / d * 0.5; if (!a.boss) moveEnt(a, -dx * p, -dz * p, 1); if (!b.boss) moveEnt(b, dx * p, dz * p, 1); } } }
  G.ents = G.ents.filter(e => !e.dead || e.deadT > 0);
}
function enemyAI(e, dt, slow, tgt) {
  const P = G.P, d = dist(e, tgt), frail = !!e.curses.frailty;
  const walkTo = (sp) => { let v = walkClear(G.room, e.x, e.z, tgt.x, tgt.z, Math.min(e.r, 0.8)) || tgt !== P ? [Math.sin(ang(e, tgt)), Math.cos(ang(e, tgt))] : flowDir(e); if (!v) v = [Math.sin(ang(e, tgt)), Math.cos(ang(e, tgt))]; moveEnt(e, v[0] * sp, v[1] * sp, dt); e.face = Math.atan2(v[0], v[1]); e.walk = true; };
  e.walk = false;
  if (e.state === 'wind') { e.stT -= dt; e.face = ang(e, tgt); if (e.stT <= 0) { e.state = 'idle'; if (d < e.r + 1.6) { if (tgt === P) hurt(e.dmg * (frail ? 0.75 : 1), { ent: e, frail }); } e.atkT = 1.3 + rnd() * 0.5; } return; }
  if (e.state === 'aim') { e.stT -= dt; if (e.stT <= 0) { e.state = 'dash'; e.stT = 0.45; } return; }
  if (e.state === 'dash') { e.stT -= dt; moveEnt(e, Math.sin(e.face) * 11, Math.cos(e.face) * 11, dt); if (dist(e, P) < e.r + P.r + 0.2 && !e.dashHit) { e.dashHit = true; hurt(e.dmg * (frail ? 0.75 : 1), { ent: e, frail }); } if (e.stT <= 0) { e.state = 'idle'; e.dashHit = false; e.atkT = 2 + rnd(); } return; }
  switch (e.ai) {
    case 'chase': if (d > e.r + 1.2) walkTo(e.spd * slow); else if (e.atkT <= 0) { e.state = 'wind'; e.stT = 0.4; e.anim = { clip: 'Throw', t: 0, loop: false }; } break;
    case 'dash': if (d > 7) walkTo(e.spd * slow); else if (e.atkT <= 0 && losClear(G.room, e.x, e.z, P.x, P.z)) { e.state = 'aim'; e.stT = 0.6; e.face = ang(e, P); G.telegraphs.push({ line: 1, x: e.x, z: e.z, a: e.face, len: 5.5, t: 0.6, max: 0.6, dmg: 0 }); } else if (d > e.r + 1.2) walkTo(e.spd * slow * 0.6); break;
    case 'caster': if (d > 9 || !losClear(G.room, e.x, e.z, P.x, P.z)) walkTo(e.spd * slow); else if (d < 5) { const a = ang(P, e); moveEnt(e, Math.sin(a) * e.spd * slow, Math.cos(a) * e.spd * slow, dt); e.walk = true; }
      e.face = ang(e, P); if (e.atkT <= 0 && losClear(G.room, e.x, e.z, P.x, P.z)) { e.atkT = 2.2 + rnd(); e.anim = { clip: 'Use_Item', t: 0, loop: false }; const a = ang(e, P); for (let i = -1; i <= 1; i++) eshoot(e.x, e.z, a + i * 0.28, 6, e.dmg * 0.8 * (frail ? 0.75 : 1), { col: [0.75, 0.4, 1], frail }); } break;
    case 'archer': if (d > 11 || !losClear(G.room, e.x, e.z, P.x, P.z)) walkTo(e.spd * slow); else if (d < 5) { const a = ang(P, e); moveEnt(e, Math.sin(a) * e.spd * slow, Math.cos(a) * e.spd * slow, dt); e.walk = true; }
      e.face = ang(e, P); if (e.atkT <= 0 && losClear(G.room, e.x, e.z, P.x, P.z)) { e.atkT = 1.8 + rnd() * 0.6; const a = ang(e, P); G.telegraphs.push({ line: 1, x: e.x, z: e.z, a, len: 8, t: 0.35, max: 0.35, dmg: 0, after: () => { if (!e.dead && e.frozen <= 0) eshoot(e.x, e.z, a, 12, e.dmg * (frail ? 0.75 : 1), { col: [1, 0.85, 0.5], arrow: 1, frail }); } }); } break;
    case 'totem': e.face += dt; if (e.atkT <= 0) { e.atkT = 3; for (let i = 0; i < 8; i++) eshoot(e.x, e.z, i / 8 * Math.PI * 2 + G.t, 5, e.dmg * 0.7, { col: [1, 0.4, 0.4] }); } break;
  }
  const want = e.walk ? 'Walking_A' : e.state === 'wind' || e.anim.clip === 'Throw' && e.anim.t < 0.6 ? 'Throw' : e.anim.clip === 'Use_Item' && e.anim.t < 0.7 ? 'Use_Item' : e.ai === 'totem' ? 'Idle_B' : 'Idle_A';
  if (e.anim.clip !== want && !(want === 'Throw' && e.anim.clip === 'Throw')) e.anim = { clip: want, t: 0, loop: want !== 'Throw' && want !== 'Use_Item' };
}
// bosses: rotate through their patterns, faster in later phases
function bossAI(e, dt, slow) {
  const P = G.P, frac = e.hp / e.max; e.phase = frac < 0.33 ? 3 : frac < 0.66 ? 2 : 1;
  if (e.enrage) e.dmgMul = 1 + 0.25 * Math.floor(Math.max(0, G.t - 240) / 10); const dm = (e.dmgMul || 1) * (e.curses.frailty ? 0.75 : 1);
  if (e.immune > 0) e.immune -= dt;
  const d = dist(e, P);
  if (d > 3.5) { const v = walkClear(G.room, e.x, e.z, P.x, P.z, Math.min(e.r, 0.8)) ? [Math.sin(ang(e, P)), Math.cos(ang(e, P))] : flowDir(e) || [0, 0]; moveEnt(e, v[0] * e.spd * slow * 0.7, v[1] * e.spd * slow * 0.7, dt); e.walk = true; } else e.walk = false;
  e.face = ang(e, P);
  if (d < e.r + 1.4 && e.atkT <= 0) { e.atkT = 1.2; hurt(e.dmg * dm, { ent: e }); }
  e.patT = (e.patT == null ? 2 : e.patT) - dt * (e.phase === 3 ? 1.5 : e.phase === 2 ? 1.2 : 1);
  if (e.patT <= 0) { e.patT = 2.6; const list = e.pat || ['ring', 'fan', 'slam']; const p = list[e.patI++ % list.length]; bossPattern(e, p, dm); }
  const want = e.walk ? 'Walking_A' : 'Idle_A'; if (e.anim.clip !== want && e.anim.clip !== 'Throw' || (e.anim.clip === 'Throw' && e.anim.t > 0.8)) e.anim = { clip: want, t: 0, loop: true };
}
function bossPattern(e, p, dm) {
  const P = G.P, D = e.dmg * dm, a0 = ang(e, P); e.anim = { clip: 'Throw', t: 0, loop: false };
  const ring = (n, sp, off = 0) => { for (let i = 0; i < n; i++) eshoot(e.x, e.z, off + i / n * Math.PI * 2, sp, D * 0.7, { col: [1, 0.4, 0.35], r: 0.38 }); };
  switch (p) {
    case 'ring': ring(10 + e.phase * 2, 5.5, G.t); break;
    case 'fan': for (let i = -3; i <= 3; i++) eshoot(e.x, e.z, a0 + i * 0.16, 8, D * 0.7, { col: [1, 0.6, 0.3] }); break;
    case 'spiral': for (let k = 0; k < 12; k++) setTimeout0(k * 0.08, () => { if (!e.dead) eshoot(e.x, e.z, G.t * 3 + k * 0.5, 6, D * 0.6, { col: [0.6, 0.85, 1] }); }); break;
    case 'slam': case 'anvils': { const n = p === 'anvils' ? 4 + e.phase : 1; for (let i = 0; i < n; i++) { const x = p === 'slam' ? P.x : P.x + (rnd() - 0.5) * 8, z = p === 'slam' ? P.z : P.z + (rnd() - 0.5) * 8; G.telegraphs.push({ x, z, r: p === 'slam' ? 3 : 1.8, t: 1, max: 1, dmg: D * 1.4, enemy: true }); } break; }
    case 'dash': case 'dive': e.state = 'aim'; e.face = a0; G.telegraphs.push({ line: 1, x: e.x, z: e.z, a: a0, len: 9, t: 0.7, max: 0.7, dmg: 0 }); setTimeout0(0.7, () => { const st = { t: 0.5 }; const go = () => { if (e.dead) return; moveEnt(e, Math.sin(a0) * 13, Math.cos(a0) * 13, 0.05); if (dist(e, P) < e.r + 0.8 && !st.h) { st.h = 1; hurt(D * 1.2, { ent: e }); } st.t -= 0.05; if (st.t > 0) setTimeout0(0.05, go); }; go(); }); break;
    case 'summon': case 'eggs': case 'phoenix': { const n = 2 + e.phase; for (let i = 0; i < n; i++) { const a = rnd() * 6.28; const x = clamp(e.x + Math.sin(a) * 3, 3, 19), z = clamp(e.z + Math.cos(a) * 3, 4, 34); if (canStand(G.room, x, z, 0.5)) spawnEnemy(p === 'eggs' ? 'swarm' : p === 'phoenix' ? 'mage' : 'minion', x, z, { mlvl: G.mlvl, add: true, hpMult: 0.6, tint: e.tint }); } break; }
    case 'pools': case 'clouds': for (let i = 0; i < 2 + e.phase; i++) { const x = P.x + (rnd() - 0.5) * 6, z = P.z + (rnd() - 0.5) * 6; G.telegraphs.push({ x, z, r: 2.2, t: 1, max: 1, dmg: 0, enemy: true, after: () => G.ezones.push({ x, z, r: 2.2, t: 6, dmg: D * 0.5, col: p === 'pools' ? [1, 0.4, 0.1] : [0.5, 0.9, 0.3] }) }); } break;
    case 'firering': G.ezones.push({ ring: 1, x: 11, z: 18, r: 11, t: 6, dmg: D * 0.6, col: [1, 0.35, 0.1] }); ring(16, 5); break;
    case 'walls': for (let i = 0; i < 2; i++) { const z = P.z + (i ? 3 : -3); G.telegraphs.push({ line: 1, x: 1, z, a: Math.PI / 2, len: 20, t: 1, max: 1, dmg: D, wall: 1 }); } break;
    case 'breath': G.telegraphs.push({ cone: 1, x: e.x, z: e.z, a: a0, w: 1, r: 9, t: 0.9, max: 0.9, dmg: D * 1.3, chillP: 1, enemy: true }); break;
    case 'towers': for (let i = 0; i < 2; i++) { const t = spawnEnemy('totem', 4 + i * 14, 8 + rnd() * 6, { mlvl: G.mlvl, add: true, hpMult: 1.2 }); t.shieldFor = e; } e.immune = 99; break;
    case 'chain': for (let i = 0; i < 5; i++) setTimeout0(i * 0.15, () => { const a = a0 + (rnd() - 0.5) * 0.6; eshoot(e.x, e.z, a, 14, D * 0.6, { col: [1, 1, 0.4], r: 0.25 }); }); break;
    case 'shield': e.immune = 4; break;
    case 'curse': P.cursed = 8; break;
    case 'mirror': for (let i = 0; i < 2; i++) eshoot(e.x, e.z, a0 + (i - 0.5) * 0.3, 10, D * 0.9, { col: EL[G.stats.el].rgb, r: 0.4 }); break;
    case 'clones': if (!e.cloned && e.phase >= 2) { e.cloned = true; const c = spawnEnemy('warrior', e.x + 3, e.z, { mlvl: G.mlvl, add: true, hpMult: 4, model: e.model, tint: e.tint, scale: 1.4, name: 'Klon' }); c.clone = true; } break;
  }
}

// ---------- projectiles, zones, telegraphs, pickups ----------
function updateWorld(dt) {
  const P = G.P, R = G.room;
  for (const p of G.projs) {
    p.t += dt; p.life -= dt;
    if (p.homing) { const t = nearest(p, 14); if (t) { const want = ang(p, t), cur = Math.atan2(p.vx, p.vz); let da = ((want - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI; const na = cur + clamp(da, -4 * dt, 4 * dt), sp = Math.hypot(p.vx, p.vz); p.vx = Math.sin(na) * sp; p.vz = Math.cos(na) * sp; } }
    if (p.wobble) { const a = Math.atan2(p.vx, p.vz) + (rnd() - 0.5) * dt * 6, sp = Math.hypot(p.vx, p.vz); p.vx = Math.sin(a) * sp; p.vz = Math.cos(a) * sp; }
    const nx = p.x + p.vx * dt, nz = p.z + p.vz * dt;
    if (!shotFree(R, nx, nz) || nx < 0 || nx > RW * T || nz < 0 || nz > RH * T) {
      if ((p.bounce > 0 || p.bounceWall) && !(p.bounceWall && p.bounced)) { p.bounce--; p.bounced = p.bounceWall ? 1 : 0; if (!shotFree(R, nx, p.z)) p.vx = -p.vx; if (!shotFree(R, p.x, nz)) p.vz = -p.vz; if (shotFree(R, nx, p.z) && shotFree(R, p.x, nz)) { p.vx = -p.vx; p.vz = -p.vz; } continue; }
      projEnd(p); p.life = 0; continue; }
    p.x = nx; p.z = nz;
    for (const z of G.zones) if (z.wall && Math.hypot(z.x - p.x, z.z - p.z) < z.r) p.boost = 1.3;
    if (p.pulse) { p.pt = (p.pt || 0) + dt; if (p.pt >= p.pulse.every) { p.pt = 0; inRadius(p.x, p.z, p.pulse.r, e => hit(e, p.pulse.dmg, { el: p.el, skill: p.skill, quiet: true })); } }
    if (p.zap) { p.pt = (p.pt || 0) + dt; if (p.pt >= p.zap.every) { p.pt = 0; const t = nearest(p, p.zap.r); if (t) { fxLine(p.x, p.z, t.x, t.z, EL.light.rgb, 0.12); hit(t, p.zap.dmg, { el: 'light', skill: p.skill, chain: p.chain || 0 }); } } }
    if (p.shards) { p.pt = (p.pt || 0) + dt; if (p.pt >= p.shards.every) { p.pt = 0; p.sa = (p.sa || 0) + 0.9; shoot({ x: p.x, z: p.z, a: p.sa, spd: 13, dmg: p.shards.dmg, el: 'cold', skill: p.skill, life: 0.6, r: 0.22, col: EL.cold.rgb, chill: 1 }); } }
    if (p.dmg <= 0) continue;
    for (const e of G.ents) {
      if (e.dead || p.hits.has(e) || e.spawnT > 0.2) continue;
      if (Math.hypot(e.x - p.x, e.z - p.z) > e.r + p.r) continue;
      p.hits.add(e); hit(e, p.dmg * (p.boost || 1), { el: p.el, skill: p.skill, chill: p.chill, pois: p.pois, chain: p.chain, minion: p.minion, finisher: p.finisher });
      if (p.freezeHit) freeze(e, 1);
      if (p.onHit) p.onHit(e);
      if (p.explode) explodeAt(p, p.x, p.z);
      if (p.split && !p.child) for (let i = -1; i <= 1; i += 2) shoot(Object.assign({}, p, { a: Math.atan2(p.vx, p.vz) + i * 0.5, dmg: p.dmg * 0.5, child: 1, hits: new Set([e]), life: 0.5, t: 0, x: p.x, z: p.z }));
      if (p.pierce-- <= 0) { p.life = 0; if (p.onEnd) p.onEnd(p.x, p.z); break; }
    }
  }
  G.projs = G.projs.filter(p => { if (p.life <= 0 && p.onEnd && !p.ended && p.dmg > 0 && p.pierce >= 0) { p.ended = 1; } return p.life > 0; });
  // enemy shots
  for (const b of G.eprojs) {
    b.life -= dt; b.x += b.vx * dt; b.z += b.vz * dt;
    if (!shotFree(R, b.x, b.z)) { b.life = 0; continue; }
    if (G.zones.some(z => z.block && Math.hypot(z.x - b.x, z.z - b.z) < z.r + 0.3)) { b.life = 0; continue; }
    if (Math.hypot(b.x - P.x, b.z - P.z) < P.r + b.r) { b.life = 0; hurt(b.dmg, { proj: true, el: b.el, frail: b.frail }); }
  }
  G.eprojs = G.eprojs.filter(b => b.life > 0);
  // player zones
  for (const z of G.zones) {
    z.t += dt;
    if (z.creep) { const t = nearest(z, 10); if (t) { const a = ang(z, t); z.x += Math.sin(a) * dt * 2; z.z += Math.cos(a) * dt * 2; } }
    if (z.kind === 'trap') { if (z.t > 0.4) for (const e of G.ents) if (!e.dead && Math.hypot(e.x - z.x, e.z - z.z) < z.r + e.r) { z.trigger(z); break; } continue; }
    if (z.slow || z.block) inRadius(z.x, z.z, z.r, e => { e.inZoneSlow = Math.max(e.inZoneSlow || 0, z.slow || 0.9); if (RUN.corr('permafrost')) e.zoneAtkSlow = 1; });
    if (z.block) inRadius(z.x, z.z, z.r, e => { if (!e.boss) { const a = ang(z, e); e.x += Math.sin(a) * dt * 3; e.z += Math.cos(a) * dt * 3; } });
    z.tickT += dt; if (z.tickT >= z.tick && z.dmg) { z.tickT = 0; inRadius(z.x, z.z, z.r, e => hit(e, z.dmg, { el: z.el, skill: z.skill, chill: z.chill, quiet: true, ailMult: 1 })); }
  }
  G.zones = G.zones.filter(z => z.t < z.dur);
  // enemy hazard zones
  G.ezones = G.ezones || [];
  for (const z of G.ezones) { z.t -= dt; z.tk = (z.tk || 0) + dt; const d = Math.hypot(P.x - z.x, P.z - z.z); const inside = z.ring ? d > z.r - 1.5 : d < z.r; if (inside && z.tk > 0.5) { z.tk = 0; hurt(z.dmg, { el: 'fire' }); } }
  G.ezones = G.ezones.filter(z => z.t > 0);
  // telegraphs
  for (const tg of G.telegraphs) {
    tg.t -= dt; if (tg.t > 0) continue; tg.done = true;
    if (tg.mine) { const o = tg.o || {}; if (tg.dmg) inRadius(tg.x, tg.z, tg.r, e => hit(e, tg.dmg, o)); G.fx.push({ k: o.bolt ? 'bolt' : 'ring', x: tg.x, z: tg.z, r: tg.r, t: 0, life: o.bolt ? 0.3 : 0.35, col: EL[o.el || 'fire'].rgb }); fxBurst(tg.x, 0.5, tg.z, EL[o.el || 'fire'].rgb, tg.r * 0.6); if (o.after) o.after(tg.x, tg.z); continue; }
    if (tg.after) tg.after();
    if (!tg.dmg) continue;
    if (tg.line) { if (tg.wall) { if (Math.abs(P.z - tg.z) < 1) hurt(tg.dmg, { el: 'cold' }); } else { const ex = tg.x + Math.sin(tg.a) * tg.len, ez = tg.z + Math.cos(tg.a) * tg.len; const L = tg.len; const t = clamp(((P.x - tg.x) * (ex - tg.x) + (P.z - tg.z) * (ez - tg.z)) / (L * L), 0, 1); if (Math.hypot(P.x - (tg.x + (ex - tg.x) * t), P.z - (tg.z + (ez - tg.z) * t)) < 1) hurt(tg.dmg, {}); } }
    else if (tg.cone) { const d = Math.hypot(P.x - tg.x, P.z - tg.z), da = Math.abs(((Math.atan2(P.x - tg.x, P.z - tg.z) - tg.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI); if (d < tg.r && da < tg.w / 2) hurt(tg.dmg, { el: 'cold' }); }
    else if (Math.hypot(P.x - tg.x, P.z - tg.z) < tg.r + P.r) hurt(tg.dmg, {});
    G.fx.push({ k: 'ring', x: tg.x, z: tg.z, r: tg.r || 1.5, t: 0, life: 0.3, col: [1, 0.3, 0.2] });
  }
  G.telegraphs = G.telegraphs.filter(t => !t.done);
  // pickups: xp, gold, embers, essence
  const pull = G.clear;
  for (const o of G.orbs) { o.t += dt; const d = Math.hypot(o.x - P.x, o.z - P.z); if (pull || d < 3) { const s = pull ? 22 : 12; o.x += (P.x - o.x) / (d || 1) * Math.min(d, s * dt); o.z += (P.z - o.z) / (d || 1) * Math.min(d, s * dt); } if (d < 0.8) { o.got = true; if (o.gold) RUN.gainGold(1); else RUN.gainXp(o.v); } }
  G.orbs = G.orbs.filter(o => !o.got);
  for (const e of G.embers) { e.t -= dt; if (Math.hypot(e.x - P.x, e.z - P.z) < 1) { e.t = 0; if (P.active.ember_harvest) { gainHeat(1); heal(P.max * 0.01); } } else if (RUN.corr('ember_mastery') && e.t < 5.8 && !e.boom) { const n = nearest(e, 1.5); if (n) { e.boom = 1; e.t = 0; nova(e.x, e.z, 1.6, G.stats.dmg * 0.5, { el: 'fire' }); } } }
  G.embers = G.embers.filter(e => e.t > 0);
  for (const e of G.essences) { e.t -= dt; const d = Math.hypot(e.x - P.x, e.z - P.z); if (pull && d < 12) { e.x += (P.x - e.x) / d * dt * 14; e.z += (P.z - e.z) / d * dt * 14; } if (d < 1) { e.t = 0; P.essence = Math.min(30, P.essence + e.n); if (P.active.soul_siphon) heal(P.max * 0.03 * (1 + 0.1 * RUN.supLvl('soul_siphon', 'soul_eater'))); } }
  G.essences = G.essences.filter(e => e.t > 0);
  for (const k of G.cracks) k.t -= dt; G.cracks = G.cracks.filter(k => k.t > 0);
  if (RUN.corr('deep_cracks')) for (const k of G.cracks) inRadius(k.x, k.z, 0.9, e => { e.inZoneSlow = Math.max(e.inZoneSlow || 0, 0.35); });
  // effects and their timers
  for (const f of G.fx) { f.t += dt; if (f.k === 'timer' && f.t >= f.life && !f.fired) { f.fired = 1; f.fn(); if (!G) return; } }
  G.fx = G.fx.filter(f => f.t < f.life || (f.k === 'timer' && !f.fired));
  for (const t of G.texts) { t.t += dt; } G.texts = G.texts.filter(t => t.t < 0.9);
  G.shake = Math.max(0, G.shake - dt);
  if (P.cursed > 0) P.cursed -= dt;
  // boss shield from towers
  if (G.boss && G.boss.immune > 50 && !G.ents.some(e => !e.dead && e.shieldFor === G.boss)) G.boss.immune = 0;
}
function explodeAt(p, x, z) { const ex = p.explode; const go = (xx, zz, r, d) => nova(xx, zz, r, d, { el: p.el, skill: p.skill }); go(x, z, ex.r, ex.dmg); if (ex.split) for (let i = 0; i < 3; i++) { const a = i / 3 * 6.28; setTimeout0(0.15, () => go(x + Math.sin(a) * 1.6, z + Math.cos(a) * 1.6, ex.r * 0.6, ex.dmg * 0.5)); } }
function projEnd(p) { if (p.explode) explodeAt(p, p.x, p.z); if (p.onEnd) p.onEnd(p.x, p.z); }

function arenaStep(dt) {
  if (!G) return; G.t += dt;
  updatePlayer(dt); updateMinions(dt); updateEnemies(dt); updateWorld(dt); if (!G) return;
  // boss immunity, clear check
  if (!G.clear && G.started && !G.ents.some(e => !e.dead)) { G.clear = true; G.doorOpen = true; G.room.open = true; if (G.onClear) G.onClear(); }
}
