'use strict';
/* ===== DOM interface: HUD, panels, overlays, main loop ===== */
const $ = id => document.getElementById(id);
const el = { hud: $('hud'), panel: $('panel'), pbody: $('pbody'), sheet: $('sheet'), overlay: $('overlay'), toasts: $('toasts') };
let paused = true, panelTab = null, invNew = false, gemsNew = false, sheetCtx = null, travelSel = 1;
let screen = 'title', titleSel = 0, genCls = 'warden', genName = '', delArm = false, mdlChar = null, mdlAng = 0.6, mdlDrag = null;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : String(Math.round(n));
const WICON = { sword: '🗡️', axe: '🪓', mace: '🔨', wand: '✨', staff: '🔱' };
const itemIcon = it => it.slot === 'weapon' ? WICON[it.wtype] || '⚔️' : SLOT_ICON[it.slot];

/* ---------- toasts & game callbacks ---------- */
UI.toast = (msg, color) => {
  const d = document.createElement('div');
  d.className = 'toast'; d.textContent = msg; if (color) d.style.color = color;
  el.toasts.appendChild(d);
  while (el.toasts.children.length > 4) el.toasts.firstChild.remove();
  setTimeout(() => d.remove(), 2600);
};
UI.onLevel = () => {
  UI.toast('Level ' + S.level + ' — passive point gained', '#ffe9a0');
  if (SLOT_UNLOCK.includes(S.level)) UI.toast('New skill slot unlocked', '#58d8c8');
  if (S.level % 8 === 0 && S.level <= 16) UI.toast('New support socket unlocked', '#58d8c8');
  buildSkillBar(); save();
};
UI.onDeath = () => {
  el.overlay.className = 'death';
  el.overlay.innerHTML = '<h1>YOU DIED</h1><p>You wake at the entrance of ' + esc(G.zi.name) + '. Monsters you killed stay dead; the arena boss recovers.</p><button class="btn pri" data-res="1">Resurrect</button>';
  save();
};
UI.onZone = () => { hudCache = {}; buildSkillBar(); };
UI.onLoot = kind => { if (kind === 'gem') gemsNew = true; else invNew = true; };

/* ---------- HUD ---------- */
let hudCache = {};
function setIf(key, val, fn) { if (hudCache[key] !== val) { hudCache[key] = val; fn(val); } }
function buildSkillBar() {
  let h = '';
  for (let i = 0; i < 4; i++) {
    const info = P.skills[i];
    if (!slotUnlocked(i)) h += '<div class="sk empty">🔒</div>';
    else if (!info) h += '<div class="sk empty">＋</div>';
    else h += '<div class="sk">' + info.def.icon + '<u id="cd' + i + '"></u></div>';
  }
  $('skills').innerHTML = h;
}
function hudFrame() {
  const pl = G.player;
  setIf('life', Math.round(pl.life) + '/' + P.maxLife, v => { $('orbtxt').textContent = v; $('orbfill').style.height = (pl.life / P.maxLife * 100).toFixed(1) + '%'; });
  setIf('xp', S.level >= LEVEL_CAP ? 100 : Math.floor(S.xp / xpNext(S.level) * 200) / 2, v => { $('xpbar').firstElementChild.style.width = v + '%'; });
  setIf('lvl', S.level, v => { $('lvl').textContent = 'Lv ' + v; });
  setIf('gold', S.gold, v => { $('gold').textContent = fmt(v); });
  const inArena = G.area === 'arena';
  setIf('zn', inArena ? 'Arena  ·  ' + G.zi.boss : G.zi.name + '  ·  Lv ' + G.zi.level, v => { $('zname').textContent = v; });
  const total = G.areas.map.defs.length, slain = Math.min(total, G.zs.dead.length);
  setIf('zt', slain + ' / ' + total + ' slain', v => { $('ztxt').textContent = v; $('zbar').firstElementChild.style.width = (slain / total * 100) + '%'; });
  setIf('zi', 'Monsters return in ' + mmss(mobWait()) + (G.zs.boss ? '  ·  Boss in ' + mmss(bossWait()) : ''), v => { $('zinfo').textContent = v; });
  const boss = inArena ? arenaBoss() : null, showBoss = boss && boss.awake ? 1 : 0;
  setIf('boss', showBoss, v => { $('bossbar').classList.toggle('hidden', !v); if (v) $('bname').textContent = boss.name; });
  if (showBoss) setIf('bhp', Math.ceil(boss.hp / boss.maxHp * 100), v => { $('bossbar').querySelector('i').style.width = v + '%'; });
  const acts = actions();
  setIf('act', acts.map(a => a.id + a.label).join('|'), () => { $('act').innerHTML = acts.map(a => '<button class="btn pri' + (a.id === 'sigil' ? ' sigil' : '') + '" data-do="' + a.id + '">' + esc(a.label) + '</button>').join(''); });
  for (let i = 0; i < 4; i++) {
    const info = P.skills[i], u = $('cd' + i); if (!info || !u) continue;
    const f = info.def.kind === 'orbit' ? 0 : Math.round(clamp(G.cds[i] / info.cd, 0, 1) * 20) * 5;
    setIf('cd' + i, f, v => { u.style.height = v + '%'; });
  }
  const pts = passivePoints();
  setIf('dT', pts, v => { const b = $('dotTree'); b.textContent = v; b.classList.toggle('on', v > 0); });
  setIf('dI', invNew, v => { const b = $('dotInv'); b.textContent = '!'; b.classList.toggle('on', v); });
  setIf('dG', gemsNew, v => { const b = $('dotGems'); b.textContent = '!'; b.classList.toggle('on', v); });
}

/* ---------- panel plumbing ---------- */
function openPanel(tab) {
  paused = true; input.x = input.y = 0; joyEnd();
  el.panel.classList.remove('hidden');
  showTab(tab);
}
function closePanel() {
  closeSheet(); el.panel.classList.add('hidden'); panelTab = null; paused = false;
  if (statsDirty) computeStats();
  buildSkillBar(); hudCache = {}; save();
}
function showTab(tab) {
  panelTab = tab; closeSheet();
  for (const b of $('tabs').children) b.classList.toggle('on', b.dataset.p === tab);
  el.pbody.scrollTop = 0;
  ({ inv: renderInv, gems: renderGems, tree: renderTree, menu: renderMenu })[tab]();
}
function refreshTab() { const st = el.pbody.scrollTop; ({ inv: renderInv, gems: renderGems, tree: renderTree, menu: renderMenu })[panelTab](); el.pbody.scrollTop = st; }
function openSheet(html, ctx) { sheetCtx = ctx || null; el.sheet.innerHTML = html; el.sheet.classList.remove('hidden'); el.sheet.scrollTop = 0; }
function closeSheet() { el.sheet.classList.add('hidden'); sheetCtx = null; }

/* ---------- items tab ---------- */
function equippedFor(it) {
  if (it.slot !== 'ring') return S.equip[it.slot] || null;
  if (!S.equip.ring1 || !S.equip.ring2) return null;
  return itemScore(S.equip.ring1) <= itemScore(S.equip.ring2) ? S.equip.ring1 : S.equip.ring2;
}
function isUpgrade(it) { const c = equippedFor(it); return !c || itemScore(it) > itemScore(c) * 1.02; }
function itemCard(it, tag) {
  let h = '<div class="card">' + (tag ? '<div class="tag">' + tag + '</div>' : '') + '<div class="nm" style="color:' + RARITY_COLOR[it.rarity] + '">' + esc(it.name) + '</div>';
  h += '<div class="sub">' + (it.rarity >= 2 ? esc(it.base) + ' · ' : '') + RARITY_NAME[it.rarity] + ' ' + SLOT_LABEL[it.slot] + ' · iLvl ' + it.ilvl + '</div>';
  if (it.wMin) h += '<div class="base">Damage ' + it.wMin + '–' + it.wMax + '</div>';
  if (it.arm) h += '<div class="base">Armour ' + it.arm + '</div>';
  for (const k in it.imp) h += '<div class="imp">' + statLine(k, it.imp[k]) + '</div>';
  if (it.affixes.length) { h += '<hr>'; for (const a of it.affixes) h += '<div class="af"' + (it.rarity === 3 ? ' style="color:#e8a060"' : '') + '>' + statLine(a.stat, a.v) + '</div>'; }
  return h + '</div>';
}
function itemCell(it, kind, key) {
  return '<button class="cell r' + it.rarity + '" data-act="item" data-kind="' + kind + '" data-key="' + key + '">' + itemIcon(it) +
    (kind === 'inv' && isUpgrade(it) ? '<span class="up">▲</span>' : '') + '<span class="lv">' + it.ilvl + '</span></button>';
}
function statsBlock() {
  const r = [['Life', P.maxLife], ['Life regen / s', P.regen.toFixed(1)], ['Armour', P.armour], ['Dodge', P.dodge.toFixed(0) + '%'],
    ['Fire res', Math.round(P.res.fire) + '%'], ['Cold res', Math.round(P.res.cold) + '%'], ['Lightning res', Math.round(P.res.light) + '%'],
    ['Move speed', Math.round(P.speed / 1.3) + '%'], ['Crit chance', P.crit.toFixed(1) + '%'], ['Crit multiplier', Math.round(P.critMulti) + '%'],
    ['Skill speed', Math.round(P.skillSpeed * 100) + '%'], ['Item rarity', '+' + Math.round((P.rarity - 1) * 100) + '%']];
  return '<div class="stats">' + r.map(x => '<div>' + x[0] + '<b>' + x[1] + '</b></div>').join('') + '</div>';
}
function renderInv() {
  invNew = false;
  el.pbody.className = 'notree';
  let h = '<h3>Equipment</h3><div class="grid" id="equip">';
  for (const sl of EQUIP_SLOTS) h += S.equip[sl] ? itemCell(S.equip[sl], 'eq', sl) : '<div class="cell empty">' + SLOT_ICON[sl] + '</div>';
  h += '</div><h3>Character <small>Level ' + S.level + '</small></h3>' + statsBlock();
  h += '<h3>Keys</h3><div class="note"><b style="color:#ff5ad0">' + SIGIL_NAME + ' × ' + S.sigils + '</b><br>A very rare find. Use it at the Arena portal or inside the arena to summon the boss at once instead of waiting 20 minutes.</div>';
  h += '<h3>Bag <small>' + S.inv.length + ' / ' + INV_SIZE + '  ·  ▲ = likely upgrade</small></h3>';
  h += '<div class="row" style="margin-bottom:8px"><button class="btn" data-act="sellN">Sell Normal</button><button class="btn" data-act="sellM">Sell Normal + Magic</button></div><div class="grid" id="inv">';
  S.inv.forEach((it, i) => { h += itemCell(it, 'inv', i); });
  for (let i = S.inv.length; i < INV_SIZE; i++) h += '<div class="cell empty"></div>';
  el.pbody.innerHTML = h + '</div>';
}
function showItem(kind, key) {
  const it = kind === 'eq' ? S.equip[key] : S.inv[+key]; if (!it) return;
  let h = '<div class="cards">' + itemCard(it, kind === 'eq' ? 'Equipped' : 'In bag');
  if (kind === 'inv') { const c = equippedFor(it); if (c) h += itemCard(c, 'Equipped'); }
  h += '</div><div class="row">';
  if (kind === 'inv') h += '<button class="btn" data-act="sell">Sell · ' + itemValue(it) + ' gold</button><button class="btn pri" data-act="equip">Equip</button>';
  else h += '<button class="btn" data-act="unequip">Unequip</button>';
  openSheet(h + '<button class="btn" data-act="closeSheet">Close</button></div>', { it, kind, key });
}

/* ---------- skills tab ---------- */
function gemCard(g, info) {
  const d = gemDef(g);
  let h = '<div class="card"><div class="nm" style="color:' + (g.sup ? 'var(--gem)' : '#ffd9b0') + '">' + d.icon + ' ' + esc(d.name) + '</div>';
  h += '<div class="sub">' + (g.sup ? 'Support gem' : 'Skill gem') + ' · Level ' + g.lvl + (g.lvl < GEM_MAX ? ' · ' + Math.floor(g.xp / gemXpNext(g.lvl) * 100) + '% to next' : ' (max)') + '</div>';
  if (!g.sup) h += '<div class="imp">' + d.tags.filter(t => t !== 'orbit').join(' · ') + '</div>';
  else h += '<div class="imp">Works with: ' + (d.req ? d.req.filter(t => t !== 'orbit').join(', ') + ' skills' : 'any skill') + '</div>';
  h += '<hr><div class="desc">' + esc(d.desc) + '</div>';
  if (g.sup && g.lvl > 1) h += '<div class="af">+' + ((g.lvl - 1) * 0.8).toFixed(1) + '% more damage from gem level</div>';
  if (info) {
    h += '<hr><div class="base">' + fmt(info.dps) + ' DPS · ' + fmt(info.avg) + ' avg hit · every ' + info.cd.toFixed(2) + 's</div>';
    const parts = [['phys', 'physical'], ['fire', 'fire'], ['cold', 'cold'], ['light', 'lightning']].filter(p => info.dmg[p[0]] >= 0.5).map(p => fmt(info.dmg[p[0]]) + ' ' + p[1]);
    h += '<div class="imp">' + parts.join(' + ') + '</div><div class="imp">Crit ' + info.crit.toFixed(1) + '% × ' + Math.round(info.critMulti) + '%</div>';
  }
  return h + '</div>';
}
function gemRow(g, act, extra, dis) {
  const d = gemDef(g), so = gemSocketed(g.uid);
  return '<button class="gemrow' + (g.sup ? '' : ' skill') + (dis ? ' dis' : '') + '" ' + (dis ? '' : 'data-act="' + act + '" data-id="' + g.uid + '"') + '><span class="ic">' + d.icon + '</span><span class="tx"><b>' + esc(d.name) + '</b>' +
    (g.sup ? 'Support' : 'Skill') + ' · Lv ' + g.lvl + (so ? ' · in slot ' + (so.slot + 1) : '') + (dis ? ' · not compatible' : '') + '</span>' + (extra ? '<span class="r">' + extra + '</span>' : '') + '</button>';
}
function renderGems() {
  gemsNew = false;
  el.pbody.className = 'notree';
  const ns = supportSockets();
  let h = '<h3>Skill slots <small>' + ns + ' support socket' + (ns > 1 ? 's' : '') + ' each</small></h3>';
  for (let i = 0; i < 4; i++) {
    const s = S.slots[i];
    if (!slotUnlocked(i)) { h += '<div class="slot locked"><div class="sock lock">🔒</div><div class="info"><b>Locked</b>Unlocks at level ' + SLOT_UNLOCK[i] + '</div></div>'; continue; }
    const g = gemById(s.skill), info = P.skills[i];
    h += '<div class="slot"><button class="sock" data-act="sock" data-slot="' + i + '" data-sup="-1">' + (g ? SKILLS[g.id].icon + '<span class="lv">' + g.lvl + '</span>' : '＋') + '</button>';
    for (let j = 0; j < 3; j++) {
      if (j >= ns) { h += '<button class="sock sup lock" data-act="locked" data-lv="' + SUPPORT_UNLOCK[j] + '">Lv ' + SUPPORT_UNLOCK[j] + '</button>'; continue; }
      const sg = gemById(s.sup[j]), off = sg && g && !supportFits(SUPPORTS[sg.id], SKILLS[g.id]);
      h += '<button class="sock sup' + (off ? ' off' : '') + '" data-act="sock" data-slot="' + i + '" data-sup="' + j + '">' + (sg ? SUPPORTS[sg.id].icon + '<span class="lv">' + sg.lvl + '</span>' : '＋') + '</button>';
    }
    h += '<div class="info">' + (g && info ? '<b>' + esc(SKILLS[g.id].name) + '</b>' + fmt(info.dps) + ' DPS' : '<b>Empty</b>Tap to add a skill') + '</div></div>';
  }
  const row = (ok, txt, lv) => '<div class="' + (ok ? 'ok' : '') + '"><span>' + (ok ? '✓' : '🔒') + ' ' + txt + '</span><b>' + (ok ? 'unlocked' : 'level ' + lv) + '</b></div>';
  h += '<h3>What unlocks when <small>you are level ' + S.level + '</small></h3><div class="unlocks">';
  for (let i = 0; i < 4; i++) h += row(S.level >= SLOT_UNLOCK[i], 'Skill slot ' + (i + 1) + ' — one more skill fires on its own', SLOT_UNLOCK[i]);
  for (let j = 1; j < 3; j++) h += row(S.level >= SUPPORT_UNLOCK[j], 'Support socket ' + (j + 1) + ' on every skill slot', SUPPORT_UNLOCK[j]);
  h += '</div><div class="note">A <b>skill gem</b> is an attack or spell. <b>Support gems</b> in the small sockets next to it change that one skill, but only if the support fits the skill type — a dashed socket means it does not. Socketed gems gain experience and level up to ' + GEM_MAX + ': skills hit harder, supports add 0.8% more damage per level.</div>';
  const rc = refreshCost();
  h += '<h3>Gem trader <small>' + fmt(S.gold) + ' gold</small></h3>';
  h += '<div class="row" style="margin-bottom:8px"><button class="btn" data-act="refresh"' + (S.gold < rc ? ' disabled' : '') + '>New offer · ' + rc + ' gold</button><span class="hint">Also restocks for free when you reach a new zone.</span></div>';
  if (!S.shop.length) h += '<div class="note">Sold out. Pay for a new offer or reach a new zone.</div>';
  S.shop.forEach((o, i) => {
    const d = gemDef(o.gem);
    h += '<button class="gemrow' + (o.gem.sup ? '' : ' skill') + '" data-act="offer" data-i="' + i + '"><span class="ic">' + d.icon + '</span><span class="tx"><b>' + esc(d.name) + '</b>' + (o.gem.sup ? 'Support' : 'Skill') + ' gem</span><span class="r"' + (S.gold < o.price ? ' style="color:#ff8a7a"' : '') + '>' + o.price + ' gold</span></button>';
  });
  h += '<h3>Your gems <small>' + S.gems.length + '</small></h3>';
  S.gems.slice().sort((a, b) => (a.sup - b.sup) || gemDef(a).name.localeCompare(gemDef(b).name) || b.lvl - a.lvl).forEach(g => { h += gemRow(g, 'gem'); });
  el.pbody.innerHTML = h;
}
function showSock(slot, sup) {
  const s = S.slots[slot], cur = gemById(sup < 0 ? s.skill : s.sup[sup]), skill = gemById(s.skill);
  let h = '<h3>' + (sup < 0 ? 'Skill' : 'Support') + ' socket — slot ' + (slot + 1) + '</h3>';
  if (cur) h += '<div class="cards">' + gemCard(cur, sup < 0 ? P.skills[slot] : null) + '</div>';
  const list = S.gems.filter(g => (sup < 0 ? !g.sup : g.sup) && g !== cur);
  if (!list.length) h += '<div style="color:var(--dim);font-size:12px;margin-bottom:10px">No other ' + (sup < 0 ? 'skill' : 'support') + ' gems yet. Gems drop from monsters and are sold by the gem trader.</div>';
  else h += '<div style="color:var(--dim);font-size:12px;margin-bottom:6px">Tap a gem to socket it here:</div>';
  for (const g of list) h += gemRow(g, 'pick', '', sup >= 0 && skill && !supportFits(SUPPORTS[g.id], SKILLS[skill.id]));
  h += '<div class="row" style="margin-top:8px">' + (cur ? '<button class="btn" data-act="unsock">Remove gem</button>' : '') + '<button class="btn" data-act="closeSheet">Close</button></div>';
  openSheet(h, { slot, sup });
}
function showGem(id) {
  const g = gemById(id); if (!g) return;
  const so = gemSocketed(id);
  let h = '<div class="cards">' + gemCard(g, so && so.sup < 0 ? P.skills[so.slot] : null) + '</div><div class="row">';
  if (!so) h += '<button class="btn" data-act="sellGem">Sell · ' + (25 + g.lvl * 10) + ' gold</button>';
  else h += '<span style="color:var(--dim);font-size:12px;flex:1">Socketed in slot ' + (so.slot + 1) + '</span>';
  openSheet(h + '<button class="btn" data-act="closeSheet">Close</button></div>', { gem: id });
}
function showOffer(i) {
  const o = S.shop[i]; if (!o) return;
  openSheet('<div class="cards">' + gemCard(o.gem) + '</div><div class="row"><button class="btn pri" data-act="buy"' + (S.gold < o.price ? ' disabled' : '') + '>Buy · ' + o.price + ' gold</button><button class="btn" data-act="closeSheet">Close</button></div>', { offer: i });
}

/* ---------- passive tree tab ---------- */
const tv = { x: 0, y: 0, s: 0.62, sel: null, cv: null, ptr: new Map(), moved: 0, pinch: 0 };
function renderTree() {
  el.pbody.className = '';
  el.pbody.innerHTML = '<div id="treewrap"><canvas id="treecv"></canvas><div id="treepts"></div><button class="btn" id="treerespec" data-act="respec"></button><div id="treeinfo"></div></div>';
  const c = tv.cv = $('treecv');
  tv.ptr.clear();
  c.addEventListener('pointerdown', e => { tv.ptr.set(e.pointerId, { x: e.clientX, y: e.clientY }); tv.moved = 0; tv.pinch = 0; try { c.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } });
  c.addEventListener('pointermove', e => {
    const p = tv.ptr.get(e.pointerId); if (!p) return;
    const pts = [...tv.ptr.values()];
    if (pts.length === 1) { tv.x += e.clientX - p.x; tv.y += e.clientY - p.y; tv.moved += Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y); }
    p.x = e.clientX; p.y = e.clientY;
    if (pts.length === 2) {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (tv.pinch) {
        const r = c.getBoundingClientRect(), mx = (pts[0].x + pts[1].x) / 2 - r.left - r.width / 2, my = (pts[0].y + pts[1].y) / 2 - r.top - r.height / 2;
        const ns = clamp(tv.s * d / tv.pinch, 0.28, 1.6), k = ns / tv.s;
        tv.x = mx - (mx - tv.x) * k; tv.y = my - (my - tv.y) * k; tv.s = ns;
      }
      tv.pinch = d; tv.moved = 99;
    }
    drawTree();
  });
  const up = e => {
    const had = tv.ptr.has(e.pointerId); tv.ptr.delete(e.pointerId); tv.pinch = 0;
    if (!had || e.type !== 'pointerup' || tv.moved > 10) return;
    const r = c.getBoundingClientRect(), wx = (e.clientX - r.left - r.width / 2 - tv.x) / tv.s, wy = (e.clientY - r.top - r.height / 2 - tv.y) / tv.s;
    let best = null, bd = Math.pow(30 / tv.s, 2);
    for (const id in TREE.nodes) { const n = TREE.nodes[id], d = dist2(wx, wy, n.x, n.y); if (d < bd) { bd = d; best = id; } }
    tv.sel = best; treeInfo(); drawTree();
  };
  c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
  c.addEventListener('wheel', e => { tv.s = clamp(tv.s * (e.deltaY < 0 ? 1.12 : 0.89), 0.28, 1.6); drawTree(); e.preventDefault(); }, { passive: false });
  treeInfo(); drawTree();
}
function nodeTitle(n) { return n.type === 'start' ? 'Origin' : n.name || 'Passive'; }
function treeInfo() {
  const pts = passivePoints(), n = tv.sel ? TREE.nodes[tv.sel] : null;
  $('treepts').textContent = pts + ' point' + (pts === 1 ? '' : 's') + ' to spend';
  const rc = respecCost(), rb = $('treerespec');
  rb.textContent = 'Refund all · ' + rc + ' gold'; rb.disabled = S.tree.length <= 1 || S.gold < rc;
  if (!n) { $('treeinfo').innerHTML = '<div class="t" style="color:var(--dim)">Tap a node to inspect it. Drag to pan, pinch to zoom. You can only take nodes connected to ones you already own.</div>'; return; }
  const has = S.tree.includes(n.id);
  let h = '<div class="t"><b style="color:' + n.color + '">' + esc(nodeTitle(n)) + (n.type === 'key' ? ' · Keystone' : n.type === 'notable' ? ' · Notable' : '') + '</b>';
  for (const k in n.stats) h += '<span>' + statLine(k, n.stats[k]) + '</span>';
  if (n.type === 'start') h += '<span style="color:var(--dim)">Where every build begins.</span>';
  h += '</div>';
  if (has) h += '<span style="color:var(--gold);font-size:12px">Allocated</span>';
  else h += '<button class="btn pri" data-act="alloc"' + (canAllocate(n.id) ? '' : ' disabled') + '>Allocate</button>';
  $('treeinfo').innerHTML = h;
}
function drawTree() {
  const c = tv.cv; if (!c || !c.isConnected) return;
  const r = c.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  if (c.width !== Math.round(r.width * dpr) || c.height !== Math.round(r.height * dpr)) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); }
  const g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#0d0b0a'; g.fillRect(0, 0, c.width, c.height);
  g.setTransform(dpr * tv.s, 0, 0, dpr * tv.s, (r.width / 2 + tv.x) * dpr, (r.height / 2 + tv.y) * dpr);
  const own = new Set(S.tree);
  g.lineCap = 'round';
  for (const [a, b] of TREE.edges) {
    const A = TREE.nodes[a], B = TREE.nodes[b], both = own.has(a) && own.has(b), one = own.has(a) || own.has(b);
    g.strokeStyle = both ? '#e8c46a' : one ? '#7a6a4a' : '#332b22'; g.lineWidth = both ? 4 : 2.5;
    g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(B.x, B.y); g.stroke();
  }
  g.textAlign = 'center'; g.textBaseline = 'top';
  for (const id in TREE.nodes) {
    const n = TREE.nodes[id], has = own.has(id), avail = !has && n.adj.some(a => own.has(a));
    const R = n.type === 'key' ? 19 : n.type === 'notable' ? 14 : n.type === 'start' ? 12 : 9;
    g.beginPath();
    if (n.type === 'key') { for (let k = 0; k < 6; k++) g.lineTo(n.x + Math.cos(k * Math.PI / 3 + Math.PI / 6) * R, n.y + Math.sin(k * Math.PI / 3 + Math.PI / 6) * R); g.closePath(); }
    else g.arc(n.x, n.y, R, 0, Math.PI * 2);
    g.fillStyle = has ? n.color : '#1a1614'; g.fill();
    g.lineWidth = has ? 3 : avail ? 2.5 : 1.5; g.strokeStyle = has ? '#fff6d8' : n.color; g.globalAlpha = has || avail ? 1 : 0.38; g.stroke(); g.globalAlpha = 1;
    if (id === tv.sel) { g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.beginPath(); g.arc(n.x, n.y, R + 6, 0, Math.PI * 2); g.stroke(); }
    if (n.name && tv.s > 0.45) { g.font = '11px Georgia, serif'; g.fillStyle = has ? '#fff6d8' : '#a89c88'; g.fillText(n.name, n.x, n.y + R + 5); }
  }
  g.font = '15px Georgia, serif';
  BRANCHES.forEach(b => { const k = TREE.nodes[b.id + 'K'], l = Math.hypot(k.x, k.y); g.fillStyle = b.color; g.globalAlpha = 0.75; g.fillText(b.name.toUpperCase(), k.x / l * (l + 58), k.y / l * (l + 58) - 8); g.globalAlpha = 1; });
}

/* ---------- menu tab ---------- */
function renderMenu() {
  el.pbody.className = 'notree';
  travelSel = clamp(travelSel || S.zone, 1, S.maxZone);
  const zi = zoneInfo(travelSel), as = S.opts.autoSell || 0;
  const bonus = (zoneFind(zi.level) - 1) * 100, qty = (zoneQuantity(zi.level) - 1) * 100;
  let h = '<h3>Travel <small>deepest zone reached: ' + S.maxZone + '</small></h3>';
  h += '<div class="row"><button class="btn" data-act="zprev"' + (travelSel <= 1 ? ' disabled' : '') + '>◀</button><div style="flex:1;text-align:center"><b style="font-family:var(--serif);font-weight:400;color:var(--gold)">' + esc(zi.name) + '</b><br><span style="font-size:12px;color:var(--dim)">Monster level ' + zi.level + ' · ' + mobCount(zi.level) + ' monsters' + (travelSel === S.zone ? ' · you are here' : '') + '<br>Item rarity +' + Math.round(bonus) + '% · item quantity +' + Math.round(qty) + '%</span></div>' +
    '<button class="btn" data-act="znext"' + (travelSel >= S.maxZone ? ' disabled' : '') + '>▶</button></div>';
  h += '<div class="row" style="margin-top:8px;justify-content:center"><button class="btn pri" data-act="travel">' + (travelSel === S.zone ? 'Return to the zone entrance' : 'Travel') + '</button></div>';
  h += '<div class="note" style="margin-top:8px">New zones are unlocked by finding the teleport at the edge of a map. Deeper zones have more and tougher monsters and better loot.</div>';
  h += '<h3>Auto-sell on pickup</h3><div class="row">' + ['Off', 'Normal', 'Normal + Magic'].map((t, i) => '<button class="btn' + (as === i ? ' pri' : '') + '" data-act="autosell" data-v="' + i + '">' + t + '</button>').join('') + '</div>';
  h += '<h3>Record</h3><div class="stats"><div>Level<b>' + S.level + '</b></div><div>Monsters slain<b>' + fmt(S.stats.kills) + '</b></div><div>Deaths<b>' + S.stats.deaths + '</b></div><div>Bosses slain<b>' + (S.stats.bosses || 0) + '</b></div><div>' + SIGIL_NAME + 's<b>' + S.sigils + '</b></div><div>Gold<b>' + fmt(S.gold) + '</b></div></div>';
  h += '<h3>How to play</h3><div class="note">Drag anywhere to move. Skills fire by themselves whenever an enemy is in sight. Monsters stand still until they see you.<br><br>Every zone is a closed map — the minimap in the corner fills in as you explore. Somewhere on it are <b>chests</b>, a portal to the boss <b>Arena</b>, and at the edge a <b>teleport</b> to the next, harder zone. Killed monsters and opened chests return after 10 minutes, the boss after 20.<br><br>Power comes from <b>items</b> with random modifiers, <b>skill gems</b> linked to support gems, and the <b>passive tree</b> (one point per level).</div>';
  h += '<h3>' + esc(S.name) + ' <small>' + CLASSES[S.cls].name + '</small></h3><div class="row"><button class="btn" data-act="exit">Character select</button></div>';
  h += '<div style="margin-top:18px;font-size:11px;color:#5a5248">Cindermarch' + (window.Android && Android.version ? ' ' + esc(Android.version()) : '') + ' · saves automatically on this device</div>';
  el.pbody.innerHTML = h;
}

/* ---------- click handling ---------- */
const ACT = {
  item: d => showItem(d.kind, d.key),
  closeSheet: () => closeSheet(),
  equip: () => { equipItem(sheetCtx.it); closeSheet(); refreshTab(); },
  unequip: () => { if (!unequip(sheetCtx.key)) UI.toast('Bag is full', '#ff8a7a'); closeSheet(); refreshTab(); },
  sell: () => { sellItem(sheetCtx.it); save(); closeSheet(); refreshTab(); },
  sellN: () => { const n = sellBelow(0); UI.toast(n ? 'Sold ' + n + ' item' + (n > 1 ? 's' : '') : 'Nothing to sell'); refreshTab(); },
  sellM: () => { const n = sellBelow(1); UI.toast(n ? 'Sold ' + n + ' item' + (n > 1 ? 's' : '') : 'Nothing to sell'); refreshTab(); },
  sock: d => showSock(+d.slot, +d.sup),
  pick: d => { socketGem(sheetCtx.slot, sheetCtx.sup, d.id); closeSheet(); refreshTab(); },
  unsock: () => { unsocket(sheetCtx.slot, sheetCtx.sup); closeSheet(); refreshTab(); },
  gem: d => showGem(d.id),
  sellGem: () => { sellGem(sheetCtx.gem); closeSheet(); refreshTab(); },
  offer: d => showOffer(+d.i),
  buy: () => { if (buyGem(sheetCtx.offer)) { UI.toast('Gem bought', '#58d8c8'); } closeSheet(); refreshTab(); },
  alloc: () => { if (allocate(tv.sel)) { treeInfo(); drawTree(); } },
  respec: () => { if (respec()) { UI.toast('Passive points refunded'); treeInfo(); drawTree(); } },
  zprev: () => { travelSel--; refreshTab(); },
  znext: () => { travelSel++; refreshTab(); },
  travel: () => { computeStats(); if (travelSel === S.zone) resurrect(); else startZone(travelSel); save(); closePanel(); },
  autosell: d => { S.opts.autoSell = +d.v; save(); refreshTab(); },
  locked: d => UI.toast('This support socket unlocks at level ' + d.lv),
  refresh: () => { if (refreshShop()) UI.toast('The trader has new gems', '#58d8c8'); refreshTab(); },
  exit: () => { closeSheet(); el.panel.classList.add('hidden'); panelTab = null; exitToTitle(); showTitle(); }
};
function onAct(e) {
  const t = e.target.closest('[data-act]'); if (!t || t.disabled) return;
  const f = ACT[t.dataset.act]; if (f) f(t.dataset);
}
el.pbody.addEventListener('click', onAct);
el.sheet.addEventListener('click', onAct);
$('btns').addEventListener('click', e => { const b = e.target.closest('button'); if (b && G && !G.dead) openPanel(b.dataset.p); });
$('tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) showTab(b.dataset.p); });
$('pclose').addEventListener('click', closePanel);
$('act').addEventListener('click', e => { const b = e.target.closest('[data-do]'); if (b && G && !paused) { doAction(b.dataset.do); hudCache = {}; } });

/* ---------- title screen, character select and character generator ---------- */
function previewChar(cls) { return { cls, equip: { weapon: { slot: 'weapon', wtype: CLASSES[cls].wtype, ilvl: 1, rarity: 0 } } }; }
function showTitle() {
  paused = true; screen = 'title'; delArm = false;
  el.hud.classList.add('hidden');
  if (!SAVE.chars.length) { showGen(); return; }
  titleSel = clamp(titleSel, 0, SAVE.chars.length - 1);
  const c = SAVE.chars[titleSel], C = CLASSES[c.cls];
  mdlChar = c;
  el.overlay.className = 'title';
  el.overlay.innerHTML = '<h1>CINDERMARCH</h1><canvas id="mdl"></canvas>' +
    '<div id="chars">' + SAVE.chars.map((ch, i) => '<button class="chr' + (i === titleSel ? ' on' : '') + '" data-char="' + i + '"><i>' + CLASSES[ch.cls].icon + '</i><b>' + esc(ch.name) + '</b><span>Lv ' + ch.level + ' ' + CLASSES[ch.cls].name + '</span></button>').join('') + '</div>' +
    '<div id="tinfo"><b>' + esc(c.name) + '</b><span>Level ' + c.level + ' ' + C.name + '  ·  ' + esc(zoneInfo(c.zone).name) + '</span><small>Drag the figure to turn it</small></div>' +
    '<div class="tbtns"><button class="btn pri big" data-enter="1">Enter</button><button class="btn big" data-new="1"' + (SAVE.chars.length >= MAX_CHARS ? ' disabled' : '') + '>New character</button></div>' +
    '<button class="btn danger" id="tdel" data-del="1">Delete</button>';
}
function showGen() {
  paused = true; screen = 'gen';
  el.hud.classList.add('hidden');
  const C = CLASSES[genCls];
  mdlChar = previewChar(genCls);
  if (!genName) genName = pick(HERO_NAMES);
  el.overlay.className = 'title gen';
  el.overlay.innerHTML = '<h2>New character</h2><div class="classes">' +
    Object.keys(CLASSES).map(id => '<button class="cls' + (id === genCls ? ' on' : '') + '" data-cls="' + id + '"><i>' + CLASSES[id].icon + '</i><b>' + CLASSES[id].name + '</b><span>' + CLASSES[id].tag + '</span></button>').join('') + '</div>' +
    '<canvas id="mdl"></canvas>' +
    '<div class="cdesc"><span>' + C.desc + '</span><em>Starts with ' + SKILLS[C.skill].icon + ' ' + SKILLS[C.skill].name + '</em>' + Object.keys(C.stats).map(k => '<i>' + statLine(k, C.stats[k]) + '</i>').join('') + '</div>' +
    '<input id="cname" maxlength="14" autocomplete="off" spellcheck="false" placeholder="Name" value="' + esc(genName) + '">' +
    '<div class="tbtns">' + (SAVE.chars.length ? '<button class="btn big" data-back="1">Back</button>' : '') + '<button class="btn pri big" data-create="1">Create</button></div>';
}
function enterGame(i) {
  selectChar(i);
  travelSel = S.zone; invNew = gemsNew = false; hudCache = {};
  screen = 'game'; mdlChar = null;
  el.overlay.className = 'hidden'; el.overlay.innerHTML = '';
  el.hud.classList.remove('hidden');
  paused = false;
  UI.toast('Drag anywhere to move', '#ffe9a0');
}
el.overlay.addEventListener('input', e => { if (e.target.id === 'cname') genName = e.target.value; });
el.overlay.addEventListener('click', e => {
  const t = sel => e.target.closest(sel);
  let b;
  if (t('[data-res]')) { resurrect(); el.overlay.className = 'hidden'; paused = false; hudCache = {}; return; }
  if ((b = t('[data-char]'))) { titleSel = +b.dataset.char; showTitle(); return; }
  if (t('[data-enter]')) { enterGame(titleSel); return; }
  if ((b = t('[data-new]')) && !b.disabled) { genName = ''; showGen(); return; }
  if ((b = t('[data-del]'))) {
    if (!delArm) { delArm = true; b.textContent = 'Tap again to delete ' + SAVE.chars[titleSel].name; return; }
    deleteChar(titleSel); titleSel = 0; showTitle(); return;
  }
  if ((b = t('[data-cls]'))) { genCls = b.dataset.cls; showGen(); return; }
  if (t('[data-back]')) { showTitle(); return; }
  if (t('[data-create]')) {
    const name = (genName || '').trim().slice(0, 14) || pick(HERO_NAMES);
    const i = createChar(genCls, name); genName = ''; titleSel = i; save(); enterGame(i);
  }
});
// drag the 3D figure to turn it
el.overlay.addEventListener('pointerdown', e => { if (e.target.id === 'mdl') mdlDrag = { x: e.clientX, id: e.pointerId }; });
el.overlay.addEventListener('pointermove', e => { if (mdlDrag && e.pointerId === mdlDrag.id) { mdlAng += (e.clientX - mdlDrag.x) * 0.012; mdlDrag.x = e.clientX; } });
const mdlEnd = () => { mdlDrag = null; };
el.overlay.addEventListener('pointerup', mdlEnd); el.overlay.addEventListener('pointercancel', mdlEnd);

window.pauseForNative = () => { if (G && S && !G.dead && !paused) openPanel('menu'); };
window.onAndroidBack = () => {
  if (screen === 'gen' && SAVE.chars.length) { showTitle(); return true; }
  if (screen !== 'game') return false;
  if (!el.sheet.classList.contains('hidden')) { closeSheet(); return true; }
  if (!el.panel.classList.contains('hidden')) { closePanel(); return true; }
  if (G && S && !G.dead && !paused) { openPanel('menu'); return true; }
  return false;
};
document.addEventListener('visibilitychange', () => { if (document.hidden) { save(); input.x = input.y = 0; joyEnd(); } });
window.addEventListener('pagehide', save);
setInterval(() => { if (G && !paused) save(); }, 20000);
document.addEventListener('contextmenu', e => e.preventDefault());

let lastTs = 0;
function frame(ts) {
  const dt = Math.min(0.05, Math.max(0, (ts - lastTs) / 1000)); lastTs = ts;
  if (G && !paused && !G.dead) update(dt);
  render();
  if (G && S && screen === 'game') hudFrame();
  if (screen !== 'game' && mdlChar) {
    const c = $('mdl');
    if (!mdlDrag) mdlAng += dt * 0.5;
    if (c) Model.draw(c, mdlChar, mdlAng, screen === 'title' ? 0.74 : 1);
  }
  requestAnimationFrame(frame);
}
(function boot() {
  resize();
  loadSave();
  titleSel = SAVE.sel;
  showTitle();
  requestAnimationFrame(frame);
})();
