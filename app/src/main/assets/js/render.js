'use strict';
/* ===== drawing: 3D room, characters and effects through G3, plus a 2D overlay for numbers and bars ===== */
const RENDER = (function () {
  let cv, hud, hx, ok = false, scen = null, scenKey = '', W = 1, H = 1, dpr = 1;
  const insts = new Map();          // entity -> model instance
  let playerInst = null, playerKey = '', weaponInsts = {};
  function init(canvas, overlay) { cv = canvas; hud = overlay; hx = hud.getContext('2d'); ok = G3.init(cv); return ok; }
  function resize() { dpr = Math.min(2, window.devicePixelRatio || 1); W = window.innerWidth; H = window.innerHeight; if (ok) G3.resize(W, H, dpr); hud.width = W * dpr; hud.height = H * dpr; hud.style.width = W + 'px'; hud.style.height = H + 'px'; cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
  const P = G3.place;
  // ---------- scenery per theme ----------
  function buildScene() {
    const R = G.room, Z = ZONES[G.zone], th = Z.theme, list = [], rr = seeded(R.seed + 11), tz = Z.tint;
    const add = (key, m, outline, tint) => list.push({ key, m, outline: !!outline, tint });
    const dark = th === 'dungeon' || th === 'ash';
    for (let y = 0; y < R.H + 3; y++) for (let x = -2; x < R.W + 2; x++) {
      const inside = x >= 0 && x < R.W && y < R.H, t = inside ? R.grid[y * R.W + x] : (y >= R.H && x > 0 && x < R.W - 1 ? 1 : 0), X = x * T + 1, Zc = y * T + 1;
      const floorTint = th === 'autumn' ? [1, 0.82, 0.55] : th === 'burnt' ? [0.75, 0.62, 0.5] : th === 'ash' ? [0.55, 0.48, 0.46] : th === 'dungeon' ? [0.8, 0.78, 0.85] : [1, 1, 1];
      const floor = () => { if (dark) { const v = rr(); add(v < 0.12 ? 'd_floor_tile_small_broken_A' : v < 0.2 ? 'd_floor_tile_small_weeds_A' : v < 0.24 ? 'd_floor_tile_small_decorated' : 'd_floor_tile_small', P(X, 0, Zc), false, floorTint); }
        else { const k = th === 'burnt' ? (rr() < 0.3 ? 'b_gravel' : 'b_dirt') : ((x + y) % 2 ? 'b_grass' : 'b_dirt_with_grass'); add(k, P(X, -1, Zc, 0, 0.93), false, ((x + y) % 2 ? floorTint : floorTint.map(v => v * 0.93))); if (!dark && th !== 'burnt' && rr() < 0.3) add(rr() < 0.5 ? 'f_Grass_1_A' : 'f_Grass_2_B', P(X - 0.6 + rr() * 1.2, 0, Zc - 0.6 + rr() * 1.2, rr() * 6, 1.3), false, floorTint); } };
      if (t === 0) {
        if (!inside && (x < -1 || x > R.W) ) continue;
        const k = dark ? (th === 'ash' ? 'b_stone_dark' : 'b_stone') : th === 'burnt' ? 'b_dirt' : 'b_dirt_with_grass';
        add(k, P(X, 1, Zc, 0, 0.93), false, th === 'ash' ? [0.7, 0.62, 0.6] : floorTint);
        if (y === 0 && dark && x > 0 && x < R.W - 1 && x !== DOOR_X && x % 3 === 1) add('d_torch_mounted', P(X, 2.2, Zc + 1.05, 0, 1.3), true);
        continue;
      }
      if (t === 3) { if (th === 'ash') add('b_lava', P(X, -1.1, Zc, 0, 0.93), false, [1.4, 1.2, 1]); else add('b_dirt', P(X, -2.2, Zc, 0, 0.93), false, [0.35, 0.3, 0.28]); continue; }
      floor();
      if (t === 2) {
        const r = rr();
        if (dark) add(r < 0.4 ? 'd_barrel_large' : r < 0.7 ? 'd_crates_stacked' : 'd_pillar', P(X, 0, Zc, r * 6, r < 0.4 ? 0.85 : r < 0.7 ? 0.7 : 0.75, r >= 0.7 ? 0.45 : null), true, th === 'ash' ? [0.7, 0.6, 0.58] : [0.9, 0.88, 0.95]);
        else add(th === 'burnt' ? 'f_Rock_3_B' : r < 0.5 ? 'f_Rock_1_A' : 'f_Rock_1_C', P(X, th === 'burnt' ? 1.1 : 0, Zc, r * 6, th === 'burnt' ? 2.2 : 3.2), true, th === 'burnt' ? [0.7, 0.6, 0.55] : th === 'autumn' ? [1, 0.92, 0.8] : null);
      }
    }
    // door
    add('d_wall_doorway', P((DOOR_X + 0.5) * T, 1.6, 1.4, 0, 0.62), true, dark ? [0.8, 0.75, 0.75] : [1, 0.95, 0.85]);
    // outside decoration
    if (!dark) { const trees = th === 'burnt' ? ['f_Tree_Bare_1_A', 'f_Tree_Bare_2_A'] : th === 'autumn' ? ['f_Tree_2_A', 'f_Tree_Bare_1_A', 'f_Tree_4_A'] : ['f_Tree_1_A', 'f_Tree_2_A', 'f_Tree_3_A'];
      for (let i = 0; i < 16; i++) { const side = i % 2, z = (i >> 1) * 5 + rr() * 3 - 3, x = side ? R.W * T + 1.5 + rr() * 3 : -1.5 - rr() * 3; add(pick(trees), P(x, 1.8, z, rr() * 6, 1.8 + rr() * 0.6), true, th === 'autumn' ? [1, 0.75, 0.45] : th === 'burnt' ? [0.55, 0.45, 0.4] : null); }
      for (let i = 0; i < 7; i++) add('f_Tree_' + (1 + (i % 3)) + '_A', P(2 + i * 3.2 + rr(), 1.8, -2.5 - rr() * 2, rr() * 6, 2), true, th === 'autumn' ? [1, 0.75, 0.45] : th === 'burnt' ? [0.5, 0.42, 0.38] : null); }
    else for (let i = 0; i < 8; i++) add('d_pillar', P(i % 2 ? R.W * T + 1.2 : -1.2, 0, 4 + (i >> 1) * 9, 0, 0.8), true, th === 'ash' ? [0.55, 0.48, 0.46] : [0.75, 0.73, 0.8]);
    if (G.kind === 'trader') { add('d_chest_gold', P(14, 0, 18, -0.6, 1.2), true); add('d_banner_red', P(8, 0, 17, 0.4, 1), true); }
    G3.freeBatch(scen); scen = G3.batch(list);
  }
  // ---------- character instances ----------
  function playerModel() { return CH && CH.gender === 'f' ? 'rogue' : 'knight'; }
  function getInst(e) { let i = insts.get(e); if (!i) { i = G3.instance(e.model); insts.set(e, i); } return i; }
  function holdItem(inst, slot, key, extra) { if (!key || !G3.has(key)) return; const w = G3.nodeWorld(inst, slot); if (!w) return; const wi = weaponInsts[key] || (weaponInsts[key] = G3.instance(key)); G3.pose(wi, null); G3.draw(wi, extra ? G3.m4.mul(w, extra) : w, { ow: 0.02 }); }
  const animPose = a => ({ clip: a.clip, t: a.t, loop: a.loop !== false, prev: a.prev, prevT: a.prevT, blend: a.blend == null ? 1 : a.blend });
  // ---------- frame ----------
  function frame() {
    if (!ok || !G) return;
    const key = G.room.seed + ':' + G.zone + ':' + G.kind; if (key !== scenKey) { scenKey = key; buildScene(); insts.clear(); }
    const Z = ZONES[G.zone], Pp = G.P;
    const cz = clamp(Pp.z, 11, RH * T - 9), sh = G.shake > 0 ? (rnd() - 0.5) * G.shake * 0.6 : 0;
    const aspect = W / H, back = aspect < 0.6 ? 1.18 : 1;
    const eye = [11 + sh, 22 * back, cz + 15 * back], ctr = [11, 0, cz - 2.5];
    G3.begin(Z.sky, eye, ctr, 0.95, Z.fog, [Pp.x, 0, Pp.z], Z.fogd);
    G3.drawBatch(scen);
    // floor marks: cracks, zones, telegraphs, shadows
    for (const k of G.cracks) G3.sprite('ground', k.x, 0.08, k.z, 0.8, 0.35, [0.18, 0.12, 0.1], Math.min(0.85, k.t), k.x * 3);
    for (const z of G.zones) { const a = Math.min(1, (z.dur - z.t) * 2) * 0.55; if (z.kind === 'trap') G3.sprite('ring', z.x, 0.09, z.z, z.r, z.r, z.col, 0.9); else if (z.block) G3.sprite('gglow', z.x, 0.6, z.z, z.r * 1.2, z.r * 1.2, [0.7, 0.9, 1], 0.9); else G3.sprite('gglow', z.x, 0.1, z.z, z.r, z.r, z.col, a); if (z.snow) for (let i = 0; i < 3; i++) G3.sprite('glow', z.x + (rnd() - 0.5) * z.r * 2, 0.5 + rnd() * 3, z.z + (rnd() - 0.5) * z.r * 2, 0.12, null, [1, 1, 1], 0.8); }
    for (const z of (G.ezones || [])) { if (z.ring) { for (let i = 0; i < 24; i++) { const a = i / 24 * 6.28; G3.sprite('gglow', z.x + Math.sin(a) * z.r * 0.55, 0.1, z.z + Math.cos(a) * z.r * 0.95, 1.6, 1.6, z.col, 0.7); } } else G3.sprite('gglow', z.x, 0.1, z.z, z.r, z.r, z.col, 0.7); }
    for (const tg of G.telegraphs) { const f = 1 - tg.t / tg.max, col = tg.mine ? EL[(tg.o && tg.o.el) || 'fire'].rgb : [1, 0.15, 0.12];
      if (tg.line) { const n = Math.ceil(tg.len / 0.9); for (let i = 0; i <= n; i++) { const d = i / n * tg.len; G3.sprite('ground', tg.x + Math.sin(tg.a) * d, 0.11, tg.z + Math.cos(tg.a) * d, 0.55, 0.55, col, 0.35 + 0.3 * f); } }
      else if (tg.cone) { for (let r = 1; r < tg.r; r += 1) for (let k = -2; k <= 2; k++) { const a = tg.a + k * tg.w / 4; G3.sprite('ground', tg.x + Math.sin(a) * r, 0.11, tg.z + Math.cos(a) * r, 0.5 + r * 0.12, null, col, 0.3 + 0.3 * f); } }
      else { G3.sprite('ring', tg.x, 0.12, tg.z, tg.r, tg.r, col, tg.mine ? 0.5 : 0.75); G3.sprite('ground', tg.x, 0.13, tg.z, tg.r * f, tg.r * f, col, 0.45); } }
    const shadow = (x, z, r) => G3.sprite('ground', x, 0.1, z, r, r * 0.9, [0, 0, 0], 0.32);
    // enemies
    for (const e of G.ents) {
      const inst = getInst(e); shadow(e.x, e.z, e.r * 1.2 * (e.boss ? 1.2 : 1));
      G3.pose(inst, animPose(e.anim));
      let tint = e.tint ? e.tint.slice() : [1, 1, 1]; if (e.rare === 1) tint = tint.map((v, i) => v * [0.8, 0.9, 1.25][i]); if (e.rare === 2) tint = tint.map((v, i) => v * [1.25, 1.05, 0.6][i]);
      if (e.frozen > 0) tint = [0.6, 0.85, 1.3]; else if (e.chill > 0) tint = tint.map((v, i) => v * [0.85, 0.95, 1.15][i]);
      const flash = e.hitT > 0 ? [0.5, 0.5, 0.5] : e.immune > 0 ? [0.15, 0.15, 0.3] : null;
      const y = e.spawnT > 0 ? -1.5 * (e.spawnT / 0.6) : e.dead ? -Math.max(0, 0.6 - e.deadT) * 1.2 : 0;
      G3.draw(inst, P(e.x, y, e.z, e.face, e.sc * 1.2), { ow: e.boss ? 0.045 : 0.035, tint, flash, alpha: e.dead ? Math.min(1, e.deadT * 2) : 1 });
      if (!e.dead) { const d = ENEMY[e.type]; holdItem(inst, 'handslot.r', e.boss ? 'sk_axe' : d.weapon); if (d.shield || e.boss) holdItem(inst, 'handslot.l', 'sk_shield'); }
      if (e.ign.length) G3.sprite('glow', e.x, 1.2, e.z, 0.7, null, EL.fire.rgb, 0.45);
      if (e.pois.length) G3.sprite('glow', e.x, 1.6, e.z, 0.5, null, EL.chaos.rgb, 0.4);
      if (e.shock > 0) G3.sprite('glow', e.x + (rnd() - 0.5), 1.4, e.z, 0.4, null, EL.light.rgb, 0.8);
      if (e.bomb) G3.sprite('glow', e.x, 2.6, e.z, 0.5 + Math.sin(G.t * 12) * 0.1, null, [1, 0.3, 0.1], 0.9);
    }
    // player
    const pk = playerModel(); if (pk !== playerKey || !playerInst) { playerKey = pk; playerInst = G3.instance(pk); }
    const st = G.stats, hasHelmet = !!(CH && CH.equip.helmet), hasBody = !!(CH && CH.equip.body);
    G3.hideParts(playerInst, n => /Helmet|Visor/.test(n) && !hasHelmet || /Cape/.test(n) && !hasBody);
    G3.pose(playerInst, animPose(Pp.anim)); shadow(Pp.x, Pp.z, 0.75);
    G3.draw(playerInst, P(Pp.x, 0, Pp.z, Pp.face, 1.15), { ow: 0.035, flash: Pp.hitFlash > 0 ? [0.6, 0.1, 0.1] : null, alpha: Pp.active && Pp.active.fade && Pp.moving ? 0.55 : 1 });
    const wt = WEAPONS[st.weaponType]; holdItem(playerInst, wt.model === 'w_bow' ? 'handslot.l' : 'handslot.r', wt.model);
    if (st.shield) holdItem(playerInst, 'handslot.l', 'w_shield'); else if (st.offWand) holdItem(playerInst, 'handslot.l', 'w_wand');
    // minions and pylons
    for (const m of G.minions) { const col = EL[m.el || 'fire'].rgb; if (m.kind === 'titan') { G3.sprite('glow', m.x, 1.5, m.z, 1.6, null, [0.6, 0.85, 1], 0.6); G3.sprite('ring', m.x, 0.1, m.z, 2.5, 2.5, [0.6, 0.85, 1], 0.4); } else { G3.sprite('glow', m.x, 1.8 + Math.sin(G.t * 4) * 0.2, m.z, 0.7, null, col, 0.85); G3.sprite('glow', m.x, 1.8, m.z, 0.3, null, [1, 1, 1], 0.9); } }
    for (const p of G.pylons) { if (p.kind === 'cloud') { G3.sprite('glow', p.x, 4.5, p.z, 1.6, null, [0.5, 0.5, 0.6], 0.8); } else { for (let h = 0; h < 4; h++) G3.sprite('glow', p.x, 0.4 + h * 0.5, p.z, 0.25, null, EL.light.rgb, 0.8); G3.sprite('glow', p.x, 2.4, p.z, 0.6, null, [1, 1, 0.7], 0.9); } }
    // projectiles
    for (const p of G.projs) { const s = (p.big || 1) * (p.small ? 0.6 : 1); G3.sprite('glow', p.x, p.y, p.z, 0.55 * s, null, p.col, 0.85); G3.sprite('glow', p.x, p.y, p.z, 0.22 * s, null, [1, 1, 1], 0.9); if (p.arrow || p.long) { const a = Math.atan2(p.vx, p.vz); for (let i = 1; i < 4; i++) G3.sprite('glow', p.x - Math.sin(a) * i * 0.3, p.y, p.z - Math.cos(a) * i * 0.3, 0.22 * s, null, p.col, 0.6 - i * 0.12); } }
    for (const b of G.eprojs) { G3.sprite('glow', b.x, b.y, b.z, 0.6, null, b.col, 0.9); G3.sprite('glow', b.x, b.y, b.z, 0.25, null, [1, 1, 1], 0.95); }
    // pickups
    for (const o of G.orbs) G3.sprite('glow', o.x, 0.6 + Math.sin(G.t * 5 + o.x) * 0.1, o.z, o.gold ? 0.35 : 0.28, null, o.gold ? [1, 0.85, 0.3] : [0.35, 0.75, 1], 0.95);
    for (const e of G.embers) G3.sprite('glow', e.x, 0.4, e.z, 0.3, null, [1, 0.5, 0.15], 0.9);
    for (const e of G.essences) G3.sprite('glow', e.x, 0.7, e.z, 0.35, null, [0.7, 0.3, 1], 0.9);
    for (const l of G.loot) { l.t += 0.016; G3.sprite('glow', l.x, 0.6, l.z, 0.7, null, RARITY[l.rar].col === '#ffd54a' ? [1, 0.85, 0.3] : l.rar === 3 ? [1, 0.55, 0.2] : l.rar === 1 ? [0.45, 0.6, 1] : [0.9, 0.88, 0.8], 0.8); }
    // fx
    for (const f of G.fx) { const k = f.t / f.life;
      if (f.k === 'ring') { G3.sprite('ring', f.x, 0.15, f.z, f.r * (0.4 + 0.6 * k), null, f.col, 1 - k); G3.sprite('gglow', f.x, 0.14, f.z, f.r * 0.8, null, f.col, 0.5 * (1 - k)); }
      else if (f.k === 'burst') { G3.sprite('glow', f.x, f.y + 0.4, f.z, f.s * (0.6 + k), null, f.col, 0.9 * (1 - k)); }
      else if (f.k === 'line') { const n = Math.ceil(Math.hypot(f.x1 - f.x, f.z1 - f.z) / 0.5); for (let i = 0; i <= n; i++) { const q = i / n; G3.sprite('glow', f.x + (f.x1 - f.x) * q + (rnd() - 0.5) * 0.25, 1.2 + (rnd() - 0.5) * 0.3, f.z + (f.z1 - f.z) * q, 0.3, null, f.col, 0.9 * (1 - k)); } }
      else if (f.k === 'cone') { for (let r = 1; r <= f.r; r += 0.9) for (let i = -2; i <= 2; i++) { const a = f.a + i * f.w / 4; G3.sprite('glow', f.x + Math.sin(a) * r, 1, f.z + Math.cos(a) * r, 0.4 + r * 0.08, null, f.col, 0.7 * (1 - k)); } }
      else if (f.k === 'bolt') { for (let h = 0; h < 10; h++) G3.sprite('glow', f.x + (rnd() - 0.5) * 0.4, h * 0.8, f.z + (rnd() - 0.5) * 0.4, 0.35, null, [1, 1, 0.7], 1 - k); G3.sprite('gglow', f.x, 0.15, f.z, f.r, null, EL.light.rgb, 0.8 * (1 - k)); }
      else if (f.k === 'orb') G3.sprite('glow', f.x, f.y, f.z, f.s, null, f.col, 0.9);
      else if (f.k === 'aura') G3.sprite('ring', f.x, 0.12, f.z, f.r, f.r, f.col, 0.35);
      else if (f.k === 'spike') G3.sprite('glow', f.x, 0.6 + k, f.z, 0.6, null, [0.7, 0.62, 0.55], 1 - k);
      else if (f.k === 'banner') { for (let h = 0; h < 5; h++) G3.sprite('glow', f.x, h * 0.6, f.z, 0.2, null, [1, 0.3, 0.2], 0.9); G3.sprite('ring', f.x, 0.12, f.z, 4, 4, [1, 0.4, 0.2], 0.3); }
      else if (f.k === 'wall') for (let x = 2; x < 21; x += 1.2) G3.sprite('glow', x, 1, f.z, 0.9, null, f.col, 0.8 * (1 - k));
      else if (f.k === 'arrowfall') G3.sprite('glow', f.x, 3 * (1 - k), f.z, 0.3, null, EL.chaos.rgb, 1 - k);
    }
    if (G.doorOpen) G3.sprite('glow', (DOOR_X + 0.5) * T, 1.6, 2, 2.2, null, [1, 0.9, 0.55], 0.6 + Math.sin(G.t * 3) * 0.15);
    if (Z.embers) { const er = seeded(9); for (let i = 0; i < Z.embers; i++) { const x = er() * 26 - 2, z = er() * 40, y = (er() * 8 + G.t * (0.8 + er())) % 8; G3.sprite('glow', x, y, z, 0.07, null, [1, 0.55, 0.2], 0.9); } }
    G3.flushFx();
    drawHud();
  }
  // ---------- 2D overlay: bars and numbers ----------
  function drawHud() {
    hx.setTransform(dpr, 0, 0, dpr, 0, 0); hx.clearRect(0, 0, W, H);
    const Pp = G.P;
    const bar = (x, y, w, f, col) => { hx.fillStyle = 'rgba(20,14,24,.85)'; hx.fillRect(x - w / 2 - 1, y - 1, w + 2, 6); hx.fillStyle = col; hx.fillRect(x - w / 2, y, w * clamp(f, 0, 1), 4); };
    for (const e of G.ents) { if (e.dead || e.boss || e.spawnT > 0.2) continue; const [sx, sy] = G3.project(e.x, 2.7 * e.sc + (e.r > 0.7 ? 0.4 : 0), e.z); bar(sx, sy, e.rare ? 40 : 30, e.hp / e.max, e.rare === 2 ? '#ffb340' : e.rare ? '#7fa6ff' : '#ff5555');
      if (e.chill > 0 && e.frozen <= 0) { hx.fillStyle = '#9fd8ff'; hx.fillRect(sx - 15, sy + 6, 30 * e.chill / 5, 2); } }
    const [px, py] = G3.project(Pp.x, 2.9, Pp.z); bar(px, py, 46, Pp.hp / Pp.max, '#5ee05e'); if (Pp.shield > 0) { hx.fillStyle = '#cfe8ff'; hx.fillRect(px - 23, py - 3, 46 * Math.min(1, Pp.shield / Pp.max), 2); }
    hx.textAlign = 'center'; hx.lineJoin = 'round';
    for (const t of G.texts) { const [sx, sy] = G3.project(t.x, t.y + t.t * 1.5, t.z); const a = 1 - t.t / 0.9;
      hx.globalAlpha = Math.max(0, a); const txt = t.w || fmt(t.v); const sz = t.w ? 13 : t.crit ? 17 : 13;
      hx.font = '900 ' + sz + 'px system-ui,sans-serif'; hx.lineWidth = 3.5; hx.strokeStyle = '#1b1320'; hx.strokeText(txt, sx, sy);
      hx.fillStyle = t.col || (t.el === 'hurt' ? '#ff6060' : t.crit ? '#ffd23a' : t.el ? EL[t.el] ? EL[t.el].col : '#fff' : '#fff'); hx.fillText(txt, sx, sy); }
    hx.globalAlpha = 1;
    for (const f of G.fx) if (f.k === 'flash') { hx.fillStyle = `rgba(${f.col.map(v => Math.round(v * 255)).join(',')},${0.35 * (1 - f.t / f.life)})`; hx.fillRect(0, 0, W, H); }
    if (G.trader) { const [tx, ty] = G3.project(14, 2.5, 18); hx.font = '900 14px system-ui'; hx.lineWidth = 4; hx.strokeStyle = '#1b1320'; hx.strokeText('Obchodník', tx, ty); hx.fillStyle = '#ffd54a'; hx.fillText('Obchodník', tx, ty); }
  }
  // preview of the character for menus (rendered into the same canvas)
  let menuInst = null, menuKey = '', menuT = 0;
  function menuFrame(dt, char) {
    if (!ok) return; const key = char ? (char.gender === 'f' ? 'rogue' : 'knight') : 'knight'; if (key !== menuKey) { menuKey = key; menuInst = G3.instance(key); }
    menuT += dt; G3.begin([0.07, 0.055, 0.05], [0, 2.6, 11], [0, 0.2, 0], 0.55, [0, 0, 0], [0, 0, 0], 0);
    G3.sprite('ground', 0, 0.92, 0, 1.6, 1.4, [1, 0.5, 0.2], 0.25); for (let i = 0; i < 14; i++) G3.sprite('glow', Math.sin(i * 2.3 + menuT * 0.3) * 3, ((i * 0.7 + menuT * 0.6) % 5), Math.cos(i * 1.7) * 2 - 1, 0.07, null, [1, 0.55, 0.2], 0.9);
    if (char) { const eq = s => char.equip[s]; G3.hideParts(menuInst, n => /Helmet|Visor/.test(n) && !eq('helmet') || /Cape/.test(n) && !eq('body')); }
    G3.pose(menuInst, { clip: 'Idle_A', t: menuT, loop: true });
    const W0 = char && char.equip.weapon ? char.items.find(i => i.id === char.equip.weapon) : null;
    G3.draw(menuInst, P(0, 0.9, 0, Math.sin(menuT * 0.4) * 0.5, 1.15), { ow: 0.03 });
    if (W0) holdItem(menuInst, WEAPONS[W0.type].model === 'w_bow' ? 'handslot.l' : 'handslot.r', WEAPONS[W0.type].model);
    G3.flushFx(); hx.setTransform(dpr, 0, 0, dpr, 0, 0); hx.clearRect(0, 0, W, H);
  }
  return { init, resize, frame, menuFrame, get ok() { return ok; } };
})();
