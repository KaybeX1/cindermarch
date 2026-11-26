'use strict';
/* ===== menus, overlays, HUD and input ===== */
const UI = (function () {
  const $ = id => document.getElementById(id), ui = $('ui'), ovl = $('ovl');
  let screen = 'load', tab = 'play', sheet = null, ovlKind = null, paused = false, sel = { diff: 0, ch: 1, gemTab: 'skill', merge: [], bagSlot: 'all', twr: 0, wbt: 0 }, create = { g: 'm', el: 'phys', name: '' };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function toast(m) { const d = document.createElement('div'); d.innerHTML = m; $('toast').appendChild(d); setTimeout(() => d.remove(), 2600); }
  const gemIc = sk => `<span class="gem" style="background:${EL[SKILLS[sk].el].col}"></span>`;
  const pearl = c => `<span class="pearl" style="background:${STATGEM[c].col}"></span>`;
  const rarCol = r => RARITY[r].col;

  // ---------- top-level screens ----------
  function render() {
    if (screen === 'load') return;
    if (MODE !== 'menu') { ui.innerHTML = ''; return; }
    if (screen === 'chars') return renderChars();
    if (screen === 'create') return renderCreate();
    renderHub();
  }
  function renderChars() {
    let h = '<div class="title"><h1>CINDERMARCH</h1><div style="color:var(--dim);font-size:13px;margin:4px 0 14px">Archero × Path of Exile</div><div class="chars">';
    for (const c of S.chars) h += `<div class="list"><div class="it"><div class="ic" style="color:${EL[c.el].col}">${c.gender === 'f' ? '♀' : '♂'}</div><div class="grow"><b>${esc(c.name)}</b><small>Level ${c.lvl} · ${EL[computeStats(c).el].name}</small></div><button class="pri" data-a="pickchar" data-v="${c.id}">Hrát</button><button data-a="delchar" data-v="${c.id}">✕</button></div></div>`;
    h += `<button class="pri" style="width:100%;padding:13px" data-a="newchar">+ Nová postava</button></div><div style="margin-top:14px;font-size:11px;color:#5a5248">Cindermarch ${window.Android && Android.version ? esc(Android.version()) : ''}</div></div>`;
    ui.innerHTML = h;
  }
  function renderCreate() {
    const [wt, gem] = STARTER[create.el];
    let h = '<div class="title" style="justify-content:flex-end"><div class="chars"><div class="card"><h3>Nová postava</h3>';
    h += `<input type="text" id="cname" maxlength="16" placeholder="Jméno" value="${esc(create.name)}"><div class="tabs" style="margin-top:8px"><button data-a="cg" data-v="m" class="${create.g === 'm' ? 'on' : ''}">Kluk</button><button data-a="cg" data-v="f" class="${create.g === 'f' ? 'on' : ''}">Holka</button></div>`;
    h += '<div class="elsel">' + ELS.map(e => `<button data-a="cel" data-v="${e}" class="${create.el === e ? 'on' : ''}" style="color:${EL[e].col};${create.el === e ? 'border-color:' + EL[e].col : ''}">${EL[e].name}</button>`).join('') + '</div>';
    h += `<p>${EL[create.el].desc}</p><p>Start: <b>${WEAPONS[wt].name}</b> a gem ${gemIc(gem)}<b>${SKILLS[gem].name}</b> – ${SKILLS[gem].desc}</p><p style="font-size:11px">Element není role: styl změníš kdykoli jinou zbraní a gemy.</p>`;
    h += `<div class="row" style="margin-top:10px"><button data-a="back">Zpět</button><button class="pri grow" data-a="create">Vytvořit</button></div></div></div></div>`;
    ui.innerHTML = h;
  }
  function topBar() {
    tickTimers(); const need = xpToNext(CH.lvl);
    return `<div class="top"><div class="nm"><b>${esc(CH.name)} · Lv ${CH.lvl}</b><div class="xpb"><i style="width:${CH.lvl >= 100 ? 100 : Math.min(100, CH.xp / need * 100)}%"></i></div></div><span class="cur" style="color:var(--gold)">● ${fmt(CH.gold)}</span><span class="cur" style="color:var(--dia)">◆ ${fmt(CH.dia)}</span></div>`;
  }
  function renderHub() {
    const tabs = [['play', '⚔', 'Hrát'], ['gear', '🛡', 'Výbava'], ['gems', '◆', 'Gemy'], ['tree', '✷', 'Strom'], ['shop', '⚖', 'Obchod'], ['prof', '☰', 'Profil']];
    let body = '';
    if (tab === 'play') body = renderPlay(); else if (tab === 'gear') body = renderGear(); else if (tab === 'gems') body = renderGems(); else if (tab === 'shop') body = renderShop(); else if (tab === 'prof') body = renderProfile();
    ui.innerHTML = topBar() + (tab === 'tree' ? '<div class="treewrap" id="tw"><canvas id="treecv"></canvas><div class="treeinfo" id="ti"></div></div>' : `<div class="body${tab === 'gear' ? ' clear' : ''}">${body}</div>`) +
      '<div class="nav">' + tabs.map(([k, i, n]) => `<button data-a="tab" data-v="${k}" class="${tab === k ? 'on' : ''}"><b>${i}</b>${n}</button>`).join('') + '</div>' + (sheet ? sheetHtml() : '');
    if (tab === 'tree') TREEV.mount();
  }
  // ---------- play tab ----------
  function renderPlay() {
    let h = '';
    if (CH.session) h += `<div class="card"><h3>Rozehraný run</h3><p>Kapitola ${CH.session.ch} · místnost ${CH.session.room}/50</p><div class="row"><button class="pri grow" data-a="resume">Pokračovat</button><button data-a="dropsess">Vzdát</button></div></div>`;
    const d = sel.diff; h += '<div class="tabs">' + DIFFS.map((n, i) => `<button data-a="diff" data-v="${i}" class="${d === i ? 'on' : ''}">${n}</button>`).join('') + '</div>';
    for (let z = 0; z < 5; z++) {
      if (d > 0 && z < 2) continue; const Z = ZONES[z];
      h += `<div class="card"><h3>Zóna ${z + 1}: ${Z.name}</h3>`;
      const bossLine = B => `${B.name}: ` + B.res.map(e => `<span class="pill" style="background:#2a1d18;color:${EL[e].col}">odolný ${EL[e].name} −${zoneResPct(z)} %</span>`).join('') + `<span class="pill" style="background:#2a1d18;color:${EL[B.vuln].col}">slabý na ${EL[B.vuln].name} +${zoneResPct(z)} %</span>`;
      h += `<p style="font-size:12px">${bossLine(Z.mini)}<br>${bossLine(Z.boss)}</p><div class="chap">`;
      for (let k = 1; k <= 4; k++) { const ch = z * 4 + k, open = chapterOpen(ch, d), done = CH.prog.cleared[ch + ':' + d]; h += `<button data-a="ch" data-v="${ch}" class="${done ? 'done ' : ''}${sel.ch === ch ? 'sel' : ''}" ${open ? '' : 'disabled'}>${open ? ch : '🔒'}${done ? ' ✓' : ''}</button>`; }
      h += '</div></div>';
    }
    const ok = chapterOpen(sel.ch, d);
    h += `<button class="pri" style="width:100%;padding:14px;font-size:16px;margin-bottom:12px" data-a="start" ${ok && !CH.session ? '' : 'disabled'}>▶ Kapitola ${sel.ch} · ${DIFFS[d]}</button>`;
    // tower
    h += '<div class="card"><h3>🗼 Věž</h3>';
    if (!towerUnlocked()) h += `<p>Odemkne se na levelu ${TOWER.unlock}. Jediný zdroj stat gemů.</p>`;
    else { h += `<p>Energie <b style="color:var(--good)">${CH.energy}/${TOWER.maxEnergy}</b> · +1 za ${TOWER.regenMin} min</p><div class="tabs">` + DIFFS.map((n, i) => `<button data-a="twd" data-v="${i}" class="${sel.twr === i ? 'on' : ''}" ${towerDiffOpen(i) ? '' : 'disabled'}>${n}</button>`).join('') + '</div>';
      const f = CH.tower.floor[sel.twr] || 1; h += `<p>Patro ${f}/25 · vstup ${TOWER.cost[sel.twr]} energie${sel.twr === 2 ? ' · 1 HP' : ''}</p><button class="pri" style="width:100%" data-a="tower" ${CH.energy >= TOWER.cost[sel.twr] && towerDiffOpen(sel.twr) ? '' : 'disabled'}>Vstoupit na patro ${f}</button>`; }
    h += '</div>';
    // world boss
    const B = wbToday(); h += `<div class="card"><h3>☠ World boss: ${B.name}</h3><p>${B.day} · klíče <b style="color:var(--gold)">${CH.keys}</b></p>`;
    if (CH.lvl < WB_TIERS[0].level) h += `<p>Odemkne se na levelu ${WB_TIERS[0].level}.</p>`;
    else { h += '<div class="tabs">' + WB_TIERS.map((t, i) => `<button data-a="wbt" data-v="${i}" class="${sel.wbt === i ? 'on' : ''}" ${wbTierOpen(i) ? '' : 'disabled'}>${t.name}</button>`).join('') + '</div>';
      const frac = CH.wb.wbTier === sel.wbt ? CH.wb.dmg / wbBossHp(sel.wbt) : 0;
      h += `<p>Dnešní dmg: <b>${Math.floor(frac * 100)} %</b> · milníky ${WB_MILES.map((m, i) => `<span class="pill" style="background:${frac >= m ? '#3a5a2a' : '#2a1d18'}">${m * 100}%</span>`).join('')}</p><button class="pri" style="width:100%" data-a="wb" ${CH.keys > 0 && wbTierOpen(sel.wbt) ? '' : 'disabled'}>Bojovat (1 klíč)</button>`; }
    return h + '</div>';
  }
  // ---------- gear tab ----------
  function slotCard(s) {
    const it = equipped(s), unlocked = s === 'offhand' ? offhandUnlocked() : true;
    if (!unlocked) return `<div class="slot" style="opacity:.5"><div class="ic">🔒</div><b>${SLOT[s].name}</b><small>Dual Mastery</small></div>`;
    if (!it) return `<div class="slot" data-a="slot" data-v="${s}"><div class="ic" style="opacity:.4">${SLOT[s].icon}</div><b style="color:var(--dim)">${SLOT[s].name}</b><small>prázdné</small></div>`;
    const g = it.gem ? gemById(it.gem) : null, sockOk = slotUnlocked(s);
    const sock = g ? (g.sk ? gemIc(g.sk) + SKILLS[g.sk].name : pearl(g.col) + 'T' + g.tier) : (sockOk ? '<span style="color:var(--dim)">◇ socket</span>' : '🔒 ' + slotUnlockText(s));
    return `<div class="slot" data-a="slot" data-v="${s}" style="border-color:${rarCol(it.rar)}"><b style="color:${rarCol(it.rar)}">${itemName(it)}</b><small>Lv ${it.lvl} · ${statText(itemStat(it))}</small><small>${sock}</small></div>`;
  }
  function renderGear() {
    const st = computeStats();
    let h = '<div style="height:34vh"></div><div class="grid">' + SLOTS.map(slotCard).join('') + '</div>';
    h += `<div class="card" style="margin-top:10px"><div class="statl"><span>Dmg (${EL[st.el].name})</span><span>${fmt(st.dmg)}</span><span>Životy</span><span>${fmt(st.hp)}</span><span>Armour</span><span>${fmt(st.armour)}</span><span>Rychlost útoku</span><span>+${st.as.toFixed(1)} %</span><span>Krit</span><span>${st.crit.toFixed(1)} % ×${(st.critMulti / 100).toFixed(2)}</span></div></div>`;
    const bag = CH.items.filter(i => !isEquipped(i));
    h += `<div class="row" style="margin:4px 0 8px"><b class="grow">Batoh (${bag.length})</b><button data-a="sellnormal">Prodat Normal</button></div><div class="list">`;
    bag.sort((a, b) => b.rar - a.rar || b.lvl - a.lvl);
    for (const it of bag) h += `<div class="it" data-a="item" data-v="${it.id}"><div class="ic">${SLOT[it.slot].icon}</div><div class="grow"><b style="color:${rarCol(it.rar)}">${itemName(it)}</b><small>${RARITY[it.rar].name} · Lv ${it.lvl} · ${statText(itemStat(it))}</small></div><span style="color:var(--gold);font-size:12px">● ${sellValue(it)}</span></div>`;
    return h + '</div>';
  }
  function sheetHtml() {
    if (sheet.kind === 'item') { const it = itemById(sheet.id); if (!it) { sheet = null; return ''; }
      const eqd = isEquipped(it), c1 = upgradeCost(it.lvl, it.rar), g = it.gem ? gemById(it.gem) : null, slot = Object.keys(CH.equip).find(k => CH.equip[k] === it.id);
      let h = `<div class="sheet"><h3 style="color:${rarCol(it.rar)}">${itemName(it)}</h3><p style="color:var(--dim);margin:2px 0">${RARITY[it.rar].name} · ${SLOT[it.slot].name} · level ${it.lvl}/100</p><p><b>${statText(itemStat(it))}</b>${it.slot === 'weapon' ? ' · element ' + EL[WEAPONS[it.type].el].name + (WEAPONS[it.type].hands === 2 ? ' · obouruční' : '') : ''}</p>`;
      if (it.rar === 3) h += '<p style="color:var(--acc);font-size:12px">Unikát: speciální efekt přibude v další verzi.</p>';
      h += `<p style="font-size:12px;color:var(--dim)">Socket: ${g ? (g.sk ? gemIc(g.sk) + SKILLS[g.sk].name + ' (gem lv ' + gemLevelFromItem(it.lvl) + ')' : pearl(g.col) + STATGEM[g.col].name + ' T' + g.tier) : 'prázdný'} · ${SLOT[it.slot].socket === 'skill' || it.type === 'wand' ? 'skill gem' : 'stat gem'}</p>`;
      if (eqd && slot && !slotUnlocked(slot)) h += `<p style="font-size:12px;color:var(--bad)">Socket se odemkne: ${slotUnlockText(slot)}</p>`;
      h += '<div class="acts">';
      if (it.lvl < 100) h += `<button class="gold" data-a="up" data-v="1">Vylepšit ● ${fmt(c1)}</button><button class="gold" data-a="up" data-v="10">+10 lv</button>`;
      if (eqd) h += `<button data-a="sock">Vložit gem</button>${g ? '<button data-a="unsock">Vyjmout gem</button>' : ''}<button data-a="unequip">Sundat</button>`;
      else { const why = canEquip(it); h += `<button class="pri" data-a="equip" ${why ? 'disabled' : ''}>Nasadit${it.slot.startsWith('ring') ? ' (prsten 1)' : ''}</button>${it.slot.startsWith('ring') ? '<button class="pri" data-a="equip2">Nasadit (prsten 2)</button>' : ''}<button data-a="sell">Prodat ● ${sellValue(it)}</button>`; if (why) h += `<p style="width:100%;font-size:12px;color:var(--bad)">${why}</p>`; }
      return h + '<button data-a="close">Zavřít</button></div></div>'; }
    if (sheet.kind === 'sock') { const it = itemById(sheet.id); const skill = SLOT[it.slot].socket === 'skill' || it.type === 'wand'; const st = computeStats();
      let h = `<div class="sheet"><h3>Gem do: ${itemName(it)}</h3><div class="list">`;
      const list = skill ? CH.gems : CH.sgems; if (!list.length) h += '<p style="color:var(--dim)">Žádné gemy tohoto druhu.</p>';
      for (const g of list) { const used = CH.items.find(i => i.gem === g.id); if (skill) { const S0 = SKILLS[g.sk]; h += `<div class="it" data-a="putgem" data-v="${g.id}"><div class="ic">${gemIc(g.sk)}</div><div class="grow"><b style="color:${EL[S0.el].col}">${S0.name}</b><small>${S0.group} · ${S0.desc}${S0.el !== st.el ? ' · <span style="color:var(--bad)">nefunguje s touto zbraní</span>' : ''}${used ? ' · v ' + itemName(used) : ''}</small></div></div>`; }
        else h += `<div class="it" data-a="putgem" data-v="${g.id}"><div class="ic">${pearl(g.col)}</div><div class="grow"><b>${STATGEM[g.col].name} T${g.tier}</b><small>kvalita ${g.q} % · +${statGemValue(g, gemLevelFromItem(it.lvl)).toFixed(1)} % ${STATGEM[g.col].txt}${used ? ' · v ' + itemName(used) : ''}</small></div></div>`; }
      return h + '</div><div class="acts"><button data-a="close">Zavřít</button></div></div>'; }
    if (sheet.kind === 'gem') { const g = gemById(sheet.id), S0 = SKILLS[g.sk]; const sups = Object.values(SUPPORTS).filter(s => s.gems.includes(g.sk));
      return `<div class="sheet"><h3 style="color:${EL[S0.el].col}">${gemIc(g.sk)} ${S0.name}</h3><p style="color:var(--dim)">${EL[S0.el].name} · ${S0.group}${S0.ex ? ' · ze stromu' : ''}</p><p>${S0.desc}</p><p style="font-size:12px;color:var(--dim)">Supporty: ${sups.map(s => s.name).join(', ')}</p><div class="acts">${g.tree ? '' : '<button data-a="sellgem">Prodat ● 200</button>'}<button data-a="close">Zavřít</button></div></div>`; }
    return '';
  }
  // ---------- gems tab ----------
  function renderGems() {
    let h = `<div class="tabs"><button data-a="gt" data-v="skill" class="${sel.gemTab === 'skill' ? 'on' : ''}">Skill gemy (${CH.gems.length})</button><button data-a="gt" data-v="stat" class="${sel.gemTab === 'stat' ? 'on' : ''}">Stat gemy (${CH.sgems.length})</button></div>`;
    const st = computeStats();
    if (sel.gemTab === 'skill') {
      h += `<div class="card"><h3>Rotace</h3><p>Každá ${castInterval0(st).toFixed(2)} s jeden skill: zbraň → off-hand → zbroj → helma → rukavice → boty. Gemy jiného elementu než zbraň se přeskočí.</p></div><div class="list">`;
      const gs = CH.gems.slice().sort((a, b) => (SKILLS[a.sk].el === st.el ? 0 : 1) - (SKILLS[b.sk].el === st.el ? 0 : 1) || SKILLS[a.sk].el.localeCompare(SKILLS[b.sk].el));
      for (const g of gs) { const S0 = SKILLS[g.sk], used = CH.items.find(i => i.gem === g.id); h += `<div class="it" data-a="gem" data-v="${g.id}"><div class="ic">${gemIc(g.sk)}</div><div class="grow"><b style="color:${EL[S0.el].col}">${S0.name}</b><small>${S0.group} · ${S0.desc}</small></div>${used ? '<span class="tag">' + SLOT[used.slot].name + '</span>' : ''}${g.tree ? '<span class="tag">strom</span>' : ''}</div>`; }
      return h + '</div>';
    }
    if (CH.lvl < STAT_SOCKET_LEVEL) h += `<div class="card"><p>Stat gem sockety (prsteny, amulet, štít) se odemknou na levelu ${STAT_SOCKET_LEVEL}. Stat gemy padají ve Věži.</p></div>`;
    const cost = sel.merge.length === 3 ? mergeCost(Math.min(...sel.merge.map(id => gemById(id).tier))) : 0;
    h += `<div class="card"><h3>Slučování</h3><p>Vyber 3 stat gemy: vznikne gem o tier vyšší (podle nejnižšího), barvu určí většina.</p><button class="gold" style="width:100%" data-a="merge" ${sel.merge.length === 3 && CH.gold >= cost ? '' : 'disabled'}>Sloučit ${sel.merge.length}/3 ${cost ? '● ' + fmt(cost) : ''}</button></div><div class="list">`;
    for (const g of CH.sgems.slice().sort((a, b) => b.tier - a.tier)) { const on = sel.merge.includes(g.id), used = CH.items.find(i => i.gem === g.id); h += `<div class="it" data-a="msel" data-v="${g.id}" style="${on ? 'border-color:var(--gold)' : ''}"><div class="ic">${pearl(g.col)}</div><div class="grow"><b>${STATGEM[g.col].name} · Tier ${g.tier}</b><small>kvalita ${g.q} % · ${STATGEM[g.col].txt}${used ? ' · v ' + itemName(used) : ''}</small></div>${on ? '✓' : ''}</div>`; }
    return h + '</div>';
  }
  const castInterval0 = st => Math.max(0.35, 1 / (1 + st.as / 100) * (st.keys['Ice Fortress'] ? 1.2 : 1));
  // ---------- shop ----------
  function renderShop() {
    tickTimers(); let h = `<div class="card"><h3>Bedny gemů · ◆ ${SHOP.chest}</h3><p>Každá dá 1 skill gem svého elementu (jen odemčené skupiny podle zón).</p><div class="elsel">` + ELS.map(e => `<button data-a="chest" data-v="${e}" style="color:${EL[e].col}" ${CH.dia >= SHOP.chest ? '' : 'disabled'}>${EL[e].name}</button>`).join('') + '</div></div>';
    h += `<div class="card"><div class="row"><h3 class="grow">Denní nabídka</h3><button data-a="refresh" ${CH.dia >= SHOP.refresh ? '' : 'disabled'}>↻ ◆ ${SHOP.refresh}</button></div><div class="list">`;
    CH.shop.items.forEach((it, i) => h += `<div class="it"><div class="ic">${SLOT[it.slot].icon}</div><div class="grow"><b style="color:${rarCol(it.rar)}">${itemName(it)}</b><small>${RARITY[it.rar].name} · ${statText(itemStat(it))}</small></div><button class="gold" data-a="buy" data-v="item:${i}" ${it.sold || CH.gold < it.price ? 'disabled' : ''}>${it.sold ? 'Koupeno' : '● ' + fmt(it.price)}</button></div>`);
    CH.shop.gems.forEach((g, i) => h += `<div class="it"><div class="ic">${gemIc(g.sk)}</div><div class="grow"><b style="color:${EL[SKILLS[g.sk].el].col}">${SKILLS[g.sk].name}</b><small>${SKILLS[g.sk].desc}</small></div><button class="gold" data-a="buy" data-v="gem:${i}" ${g.sold || CH.gold < g.price ? 'disabled' : ''}>${g.sold ? 'Koupeno' : '● ' + fmt(g.price)}</button></div>`);
    return h + '</div></div>';
  }
  // ---------- profile ----------
  function renderProfile() {
    const st = computeStats(); let h = `<div class="card"><h3>${esc(CH.name)}</h3><p>Level ${CH.lvl} · XP ${fmt(CH.xp)}/${fmt(xpToNext(CH.lvl))} · dokončených runů ${CH.runsDone}</p><p>Energie ${CH.energy} · klíče ${CH.keys} · body stromu ${treeFree()} volné</p></div>`;
    h += '<div class="card"><h3>Sockety skill gemů</h3><div class="statl">' + ROTATION.map(s => `<span>${SLOT[s].name}</span><span>${slotUnlocked(s) ? (st.rot[s] ? gemIc(st.rot[s].id) + SKILLS[st.rot[s].id].name : '—') : '🔒 ' + slotUnlockText(s)}</span>`).join('') + '</div></div>';
    const auto = ['vypnuto', 'Normal', 'Normal + Magic'][S.set.autoSell || 0];
    h += `<div class="card"><h3>Nastavení</h3><div class="row"><span class="grow">Automatický prodej</span><button data-a="autosell">${auto}</button></div></div><button style="width:100%" data-a="chars">Změnit postavu</button>`;
    h += `<p style="text-align:center;font-size:11px;color:#5a5248;margin-top:14px">Cindermarch ${window.Android && Android.version ? esc(Android.version()) : ''} · modely KayKit (CC0)</p>`;
    return h;
  }

  // ---------- clicks ----------
  document.addEventListener('click', ev => {
    const el = ev.target.closest('[data-a]'); if (!el) return; const a = el.dataset.a, v = el.dataset.v;
    if (A[a]) { A[a](v, el); }
  });
  const A = {
    newchar() { screen = 'create'; create = { g: 'm', el: 'phys', name: '' }; render(); },
    pickchar(id) { selectChar(id); tickTimers(); screen = 'hub'; tab = 'play'; render(); },
    delchar(id) { if (confirm('Smazat postavu?')) { deleteChar(id); render(); } },
    back() { screen = 'chars'; render(); }, chars() { screen = 'chars'; sheet = null; render(); },
    cg(v) { create.name = $('cname').value; create.g = v; render(); }, cel(v) { create.name = $('cname').value; create.el = v; render(); },
    create() { const n = $('cname').value.trim(); newChar(n, create.g, create.el); tickTimers(); screen = 'hub'; tab = 'play'; render(); toast('Vítej, ' + esc(CH.name) + '!'); },
    tab(v) { tab = v; sheet = null; render(); },
    diff(v) { sel.diff = +v; if (!chapterOpen(sel.ch, sel.diff)) sel.ch = sel.diff ? 9 : 1; render(); }, ch(v) { sel.ch = +v; render(); },
    start() { startRun(sel.ch, sel.diff); enterGame(); }, resume() { if (resumeSession()) enterGame(); else render(); }, dropsess() { CH.session = null; save(); render(); },
    twd(v) { sel.twr = +v; render(); }, tower() { if (startTower(sel.twr, CH.tower.floor[sel.twr] || 1)) enterGame(); },
    wbt(v) { sel.wbt = +v; render(); }, wb() { if (startWB(sel.wbt)) enterGame(); },
    slot(s) { const it = equipped(s); if (it) { sheet = { kind: 'item', id: it.id }; render(); } else { sel.bagSlot = s; toast('Vyber předmět z batohu.'); } },
    item(id) { sheet = { kind: 'item', id }; render(); }, close() { sheet = null; render(); },
    up(n) { const it = itemById(sheet.id); const k = upgradeItem(it, +n); if (!k) toast('Nedostatek zlata.'); render(); },
    equip() { const it = itemById(sheet.id); const slot = it.slot.startsWith('ring') ? 'ring1' : it.slot; doEquip(it, slot); },
    equip2() { doEquip(itemById(sheet.id), 'ring2'); },
    unequip() { const slot = Object.keys(CH.equip).find(k => CH.equip[k] === sheet.id); unequip(slot); sheet = null; render(); },
    sell() { const it = itemById(sheet.id); sellItem(it); sheet = null; render(); },
    sellnormal() { let g = 0; for (const it of CH.items.slice()) if (it.rar === 0 && !isEquipped(it)) { g += sellValue(it); sellItem(it); } toast('Prodáno za ● ' + g); render(); },
    sock() { sheet = { kind: 'sock', id: sheet.id }; render(); }, unsock() { itemById(sheet.id).gem = null; save(); render(); },
    putgem(gid) { const it = itemById(sheet.id), g = gemById(gid); if (!socketOk(it, g)) return toast('Sem tento gem nepatří.'); socketGem(it, g); sheet = { kind: 'item', id: it.id }; render(); },
    gt(v) { sel.gemTab = v; render(); }, gem(id) { sheet = { kind: 'gem', id }; render(); },
    sellgem() { const g = gemById(sheet.id); for (const i of CH.items) if (i.gem === g.id) i.gem = null; CH.gems = CH.gems.filter(x => x !== g); CH.gold += 200; save(); sheet = null; render(); },
    msel(id) { const i = sel.merge.indexOf(id); if (i >= 0) sel.merge.splice(i, 1); else if (sel.merge.length < 3) sel.merge.push(id); render(); },
    merge() { const g = mergeGems(sel.merge.map(gemById)); sel.merge = []; if (g) toast('Vznikl ' + STATGEM[g.col].name + ' T' + g.tier); render(); },
    chest(el) { const g = buyChest(el); if (g) toast('Získáno: ' + gemIc(g.sk) + SKILLS[g.sk].name); render(); },
    buy(v) { const [k, i] = v.split(':'); if (buyShop(k, +i)) toast('Koupeno.'); render(); }, refresh() { refreshShop(); render(); },
    autosell() { S.set.autoSell = ((S.set.autoSell || 0) + 1) % 3; save(); render(); },
    // overlays
    pick(id) { takeSupport(id); closeOvl(); if (RS && RS.picks > 0) showPick(); },
    pickheal() { takeHealInstead(); closeOvl(); if (RS && RS.picks > 0) showPick(); },
    theal() { traderHeal(); closeOvl(); toast('Plně vyléčen.'); },
    tcorr(id) { const r = traderCorrupt(id); closeOvl(); toast({ fx: 'Corrupt: ' + SUPPORTS[id].name + ' získal corrupted efekt!', lvl: 'Corrupt: ' + SUPPORTS[id].name + ' +2 levely!', gone: 'Corrupt: ' + SUPPORTS[id].name + ' se zničil.' }[r]); },
    tclose() { closeOvl(); }, trader() { showTrader(); },
    resumeg() { closeOvl(); }, abandon() { closeOvl(); abandonSession(); },
    endok() { closeOvl(); screen = 'hub'; render(); },
    talloc(n) { if (allocNode(+n)) { TREEV.sel = +n; TREEV.draw(); TREEV.info(); } },
    tref(n) { if (refundNode(+n)) { TREEV.draw(); TREEV.info(); } else toast('Uzel nejde vrátit (strom by se rozpadl nebo chybí zlato).'); },
  };
  function doEquip(it, slot) { const why = canEquip(it); if (why) return toast(why); const old = equipped(slot); if (old) old.gem = null; CH.equip[slot] = it.id; if (slot === 'weapon') { const off = equipped('offhand'); if (off && canEquip(off)) delete CH.equip.offhand; } save(); sheet = null; render(); }

  // ---------- in-game overlays ----------
  function openOvl(kind, html) { ovlKind = kind; ovl.innerHTML = html; ovl.classList.remove('hidden'); }
  function closeOvl() { ovlKind = null; ovl.classList.add('hidden'); ovl.innerHTML = ''; }
  function showPick() {
    if (!RS || RS.picks <= 0) return; const ids = rollSupports(), st = computeStats(), rot = Object.values(st.rot).map(r => r.id);
    let h = `<h2>Stage ${RS.stage}</h2><div class="sub">Vyber support gem${RS.picks > 1 ? ' (zbývá ' + RS.picks + ')' : ''}</div><div class="picks">`;
    for (const id of ids) { const s = SUPPORTS[id], q = RS.sup[id], on = s.gems.filter(g => rot.includes(g)).map(g => SKILLS[g].name);
      h += `<button class="pk" data-a="pick" data-v="${id}"><b style="color:${EL[s.el].col}">${s.name}</b><span class="lv">${q ? 'Lv ' + q.lvl + ' → ' + (q.lvl + 1) : 'Nový'}</span><p>Za level: ${s.lvl}</p><div class="on">Platí na: ${on.join(', ')}</div></button>`; }
    if (!ids.length) h += '<button class="pk" data-a="pickheal"><b>Léčení</b><p>Žádný support už nejde vylepšit: vyléčí 30 % života.</p></button>';
    openOvl('pick', h + '</div>');
  }
  function showTrader() {
    const owned = Object.keys(RS.sup).filter(id => !RS.sup[id].gone && !RS.sup[id].corr);
    let h = '<h2>Obchodník</h2><div class="sub">Vyber jedno: léčení, nebo corrupt support gemu (60 % corrupted efekt, 25 % +2 levely, 15 % zničení)</div><div class="picks">';
    h += '<button class="pk" data-a="theal"><b style="color:var(--good)">Léčení</b><p>Doplní všechny životy.</p></button>';
    for (const id of owned) { const s = SUPPORTS[id]; h += `<button class="pk corr" data-a="tcorr" data-v="${id}"><b style="color:${EL[s.el].col}">Corrupt: ${s.name}</b><span class="lv">Lv ${RS.sup[id].lvl}</span><p>Corrupted efekt: ${s.corr}</p></button>`; }
    openOvl('trader', h + '</div><div class="ovbtns"><button data-a="tclose">Později</button></div>');
  }
  function showPause() {
    let h = '<h2>Pauza</h2><div class="sub">' + sessionTitle() + '</div><div class="picks" style="max-height:50vh">';
    for (const id in RS.sup) { const s = SUPPORTS[id], q = RS.sup[id]; h += `<div class="pk${q.corr ? ' corr' : ''}"><b style="color:${EL[s.el].col}">${s.name}</b><span class="lv">${q.gone ? 'zničen' : 'Lv ' + q.lvl}${q.fx ? ' ✦' : ''}</span><p>${s.lvl}${q.fx ? '<br>✦ ' + s.corr : ''}</p></div>`; }
    if (!Object.keys(RS.sup).length) h += '<p style="color:var(--dim);text-align:center">Zatím žádné supporty.</p>';
    openOvl('pause', h + `</div><div class="ovbtns"><button data-a="abandon">${RS.kind === 'run' ? 'Ukončit run' : 'Vzdát'}</button><button class="pri" data-a="resumeg">Pokračovat</button></div>`);
  }
  function sessionTitle() { if (!RS) return ''; if (RS.kind === 'run') return `Kapitola ${RS.ch} · ${DIFFS[RS.diff]} · místnost ${RS.room}/50`; if (RS.kind === 'tower') return `Věž ${DIFFS[RS.diff]} · patro ${RS.floor}`; return 'World boss · ' + WB_TIERS[RS.tier].name; }
  function showEnd(r) {
    leaveGame();
    let h = `<h2>${r.won ? (r.kind === 'run' ? 'Run dokončen!' : r.kind === 'tower' ? 'Patro zdoláno!' : 'Boss poražen!') : r.kind === 'wb' ? 'Konec pokusu' : 'Konec'}</h2><div class="sub">${r.extra || ''}</div><div class="card" style="width:100%;max-width:420px"><div class="statl">`;
    h += `<span>XP</span><span>+${fmt(r.xp)}</span><span>Zlato</span><span style="color:var(--gold)">+${fmt(r.gold)}</span><span>Diamanty</span><span style="color:var(--dia)">+${r.dia}</span><span>Předměty</span><span>${r.items.length}</span>`;
    if (r.sgems.length) h += `<span>Stat gemy</span><span>${r.sgems.map(g => pearl(g.col) + 'T' + g.tier).join(' ')}</span>`;
    if (r.wb) { h += `<span>Dmg tohoto pokusu</span><span>${fmt(r.wbDmg)}</span><span>Celkem dnes</span><span>${Math.floor(r.wb.frac * 100)} %</span>`; for (const g of r.wb.got) h += g.week ? `<span>Týdenní bonus</span><span>● ${fmt(g.g)} ◆ ${g.d}</span>` : `<span>Milník</span><span>● ${fmt(g.g)} ◆ ${g.d}${g.gem ? ' ' + gemIc(g.gem) : ''}${g.sg ? ' ' + pearl(g.sg.col) : ''}${g.item ? ' ' + RARITY[g.item.rar].name : ''}</span>`; }
    h += '</div>';
    if (r.items.length) h += '<div style="margin-top:8px;font-size:12px">' + r.items.map(it => `<span class="pill" style="background:#2a1d18;color:${rarCol(it.rar)}">${itemName(it)}${it.sold ? ' (prodáno)' : ''}</span>`).join('') + '</div>';
    for (const u of r.ups) h += `<p style="color:var(--gold);margin:6px 0 0">Level ${u.lvl}! ${({ gold: '● ' + fmt(u.r.n) + ' zlata', energy: '+' + u.r.n + ' energie', diamonds: '◆ ' + u.r.n, key: '+1 klíč na world bosse', gem: 'skill gem ' + (u.r.gem ? SKILLS[u.r.gem].name : '') })[u.r.kind]}</p>`;
    openOvl('end', h + '</div><div class="ovbtns"><button class="pri" data-a="endok">Pokračovat</button></div>');
  }
  function onStage() { if (ovlKind) return; showPick(); }

  // ---------- HUD ----------
  function enterGame() { sheet = null; ui.innerHTML = ''; $('hud').classList.remove('hidden'); }
  function leaveGame() { $('hud').classList.add('hidden'); $('hjoy').style.display = 'none'; joy = null; INPUT.x = INPUT.z = 0; }
  $('hpause').addEventListener('click', () => { if (RS && !ovlKind) showPause(); });
  function hud() {
    if (!G || !RS) return; const P = G.P, st = G.stats;
    $('hroom').textContent = RS.kind === 'run' ? `${RS.room}/50 · Kap. ${RS.ch}` : RS.kind === 'tower' ? `Věž ${RS.floor} · ${RS.bossUp ? 'boss' : Math.max(0, Math.ceil(TOWER.arena - RS.t)) + ' s'}` : `${Math.max(0, Math.ceil(WB_TIME - RS.t))} s`;
    $('hsn').textContent = 'Stage ' + RS.stage; $('hsbar').style.width = (RS.stage >= 15 ? 100 : RS.sxp / stageNeed(RS.stage) * 100) + '%';
    const res = { phys: `Zuřivost ${Math.floor(P.rage)}/${maxRage()}`, fire: `Žár ${Math.floor(P.heat)}/10`, cold: `Krystaly ${P.crystals}/${maxCrystals()}`, light: `Náboj ${Math.floor(P.charge)}/${maxCharge()}`, chaos: `Esence ${Math.floor(P.essence)}` }[st.el];
    $('hres').innerHTML = `<span style="color:${EL[st.el].col}">${res}</span>` + (P.cursed > 0 ? '<span style="color:#9f6">Kletba −30 %</span>' : '') + (G.trader ? '<span style="color:var(--gold);pointer-events:auto" data-a="trader">Obchodník ▸</span>' : '');
    const b = G.boss; if (b && !b.dead) { $('hboss').classList.remove('hidden'); $('hbname').textContent = b.name + (b.immune > 0 ? ' (imunní)' : ''); $('hbbar').style.width = (b.hp / b.max * 100) + '%';
      $('hbinfo').innerHTML = RS.kind === 'wb' ? `${Math.floor((CH.wb.dmg + (G.bossDmg || 0)) / wbBossHp(RS.tier) * 100)} % · ${fmt(G.bossDmg || 0)} dmg` : Object.entries(b.res || {}).map(([e, v]) => `<span style="color:${EL[e].col}">${EL[e].name} ${v > 0 ? '+' : ''}${v} %</span>`).join(' · '); }
    else $('hboss').classList.add('hidden');
    const slots = ROTATION; let h = '';
    for (const s of slots) { const r = st.rot[s]; if (!r && !(s !== 'offhand' && equipped(s))) continue; const next = P.lastSlot === s;
      h += `<div class="${r ? '' : 'lock'}${next ? ' on' : ''}" style="color:${r ? EL[SKILLS[r.id].el].col : '#777'}">${r ? SKILLS[r.id].name : '🔒'}${r && P.active[r.id] ? '<i style="width:' + Math.min(100, P.active[r.id] / RUN.rotDur() * 100) + '%"></i>' : ''}</div>`; }
    $('hrot').innerHTML = h;
  }
  // ---------- joystick ----------
  let joy = null;
  window.addEventListener('pointerdown', e => { if (MODE === 'menu' || ovlKind || e.target.closest('button,[data-a]')) return; joy = { id: e.pointerId, x: e.clientX, y: e.clientY }; const j = $('hjoy'); j.style.display = 'block'; j.style.left = e.clientX + 'px'; j.style.top = e.clientY + 'px'; j.firstChild.style.transform = ''; });
  window.addEventListener('pointermove', e => { if (!joy || e.pointerId !== joy.id) return; let dx = e.clientX - joy.x, dy = e.clientY - joy.y; const l = Math.hypot(dx, dy), m = 45; if (l > m) { dx *= m / l; dy *= m / l; } $('hjoy').firstChild.style.transform = `translate(${dx}px,${dy}px)`; INPUT.x = dx / m; INPUT.z = dy / m; });
  const up = e => { if (!joy || e.pointerId !== joy.id) return; joy = null; INPUT.x = INPUT.z = 0; $('hjoy').style.display = 'none'; };
  window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  const keys = {}; window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = 1; kb(); }); window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = 0; kb(); });
  function kb() { if (joy) return; INPUT.x = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0); INPUT.z = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0); }

  // ---------- main loop ----------
  let last = 0, hudT = 0;
  function loop(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts;
    try {
      if (MODE !== 'menu' && G) { gameStep(dt); if (G) { RENDER.frame(); hudT -= dt; if (hudT <= 0) { hudT = 0.1; hud(); } if (G.trader && !ovlKind && !G.traderShown) { G.traderShown = true; showTrader(); } } }
      else if (screen !== 'load') RENDER.menuFrame(dt, screen === 'hub' && tab === 'gear' ? CH : screen === 'hub' ? CH : null);
    } catch (err) { console.error(err); if (!window.__errShown) { window.__errShown = 1; toast('Chyba: ' + esc(err.message)); } }
    requestAnimationFrame(loop);
  }
  async function start() {
    load(); RENDER.init($('cv'), $('ov')); RENDER.resize(); window.addEventListener('resize', () => { RENDER.resize(); if (tab === 'tree' && screen === 'hub') TREEV.mount(); });
    ui.innerHTML = '<div class="load"><b>Cindermarch</b><div class="bar"><i id="lb"></i></div><small style="color:var(--dim)">Načítám modely…</small></div>';
    if (!RENDER.ok) { ui.innerHTML = '<div class="load"><b>Tvůj telefon nepodporuje WebGL.</b></div>'; return; }
    await G3.loadAll(p => { const b = $('lb'); if (b) b.style.width = (p * 100) + '%'; });
    screen = CH ? 'hub' : 'chars'; if (CH) tickTimers(); render(); requestAnimationFrame(loop);
  }
  return { start, render, showPick, showEnd, onStage, toast, paused: () => !!ovlKind && ovlKind !== 'end', get tab() { return tab; } };
})();

// ---------- skill tree view ----------
const TREEV = (function () {
  let cv, g, W, H, dpr, sc = 26, ox = 0, oy = 0, drag = null, pinch = null; const N = TREE_DATA.nodes;
  const AREA_COL = { core: '#d9cbb3', physical: '#c9ccd4', fire: '#ff7a30', cold: '#7cd0ff', lightning: '#ffe14a', chaos: '#b46cff' };
  const col = a => { if (a.includes('+')) { const [x, y] = a.split('+'); return AREA_COL[x]; } return AREA_COL[a] || '#ccc'; };
  function mount() {
    const wrap = document.getElementById('tw'); cv = document.getElementById('treecv'); if (!wrap || !cv) return; dpr = Math.min(2, window.devicePixelRatio || 1);
    W = wrap.clientWidth; H = wrap.clientHeight; cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px'; g = cv.getContext('2d');
    if (!ox && !oy) { ox = W / 2; oy = H / 2 - 40; }
    cv.onpointerdown = e => { cv.setPointerCapture(e.pointerId); drag = drag || {}; drag[e.pointerId] = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY }; if (Object.keys(drag).length === 2) { const [a, b] = Object.values(drag); pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), sc }; } };
    cv.onpointermove = e => { if (!drag || !drag[e.pointerId]) return; const p = drag[e.pointerId]; if (pinch && Object.keys(drag).length === 2) { p.x = e.clientX; p.y = e.clientY; const [a, b] = Object.values(drag); sc = clamp(pinch.sc * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, 8, 70); } else { ox += e.clientX - p.x; oy += e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; } draw(); };
    cv.onpointerup = e => { if (!drag || !drag[e.pointerId]) return; const p = drag[e.pointerId]; const moved = Math.hypot(e.clientX - p.sx, e.clientY - p.sy); delete drag[e.pointerId]; if (!Object.keys(drag).length) { drag = null; pinch = null; }
      if (moved < 8) { const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top; let best = -1, bd = 22; N.forEach((n, i) => { const d = Math.hypot(ox + n[1] * sc - mx, oy + n[2] * sc - my); if (d < bd) { bd = d; best = i; } }); if (best >= 0) { api.sel = best; draw(); info(); } } };
    cv.onwheel = e => { sc = clamp(sc * (e.deltaY < 0 ? 1.1 : 0.9), 8, 70); draw(); };
    draw(); info();
  }
  function draw() {
    if (!g) return; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = '#0d0907'; g.fillRect(0, 0, W, H);
    const on = new Set(CH.tree); g.lineWidth = 2;
    for (const [a, b] of TREE_DATA.edges) { const A = N[a], B = N[b]; const both = on.has(a) && on.has(b); g.strokeStyle = both ? '#d9a54a' : (on.has(a) || on.has(b)) ? '#6a5236' : '#2e241c'; g.beginPath(); g.moveTo(ox + A[1] * sc, oy + A[2] * sc); g.lineTo(ox + B[1] * sc, oy + B[2] * sc); g.stroke(); }
    N.forEach((n, i) => { const x = ox + n[1] * sc, y = oy + n[2] * sc; if (x < -20 || y < -20 || x > W + 20 || y > H + 20) return; const role = n[4], r = (role === 'small' ? 4 : role === 'notable' ? 7 : role === 'start' ? 8 : 9) * Math.max(0.7, sc / 26);
      const can = canAlloc(i); g.fillStyle = on.has(i) ? col(n[3]) : can ? '#5a4a3a' : '#2a211b'; g.strokeStyle = i === api.sel ? '#fff' : on.has(i) ? '#fff6' : can ? col(n[3]) : '#000';
      g.lineWidth = i === api.sel ? 3 : role === 'small' ? 1 : 2; g.beginPath();
      if (role === 'keystone') { for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; g.lineTo(x + Math.cos(a) * r * 1.3, y + Math.sin(a) * r * 1.3); } g.closePath(); }
      else if (role === 'gem') { g.moveTo(x, y - r * 1.2); g.lineTo(x + r, y); g.lineTo(x, y + r * 1.2); g.lineTo(x - r, y); g.closePath(); }
      else if (role === 'offhand') g.rect(x - r, y - r, r * 2, r * 2); else g.arc(x, y, r, 0, 7);
      g.fill(); g.stroke(); });
    g.fillStyle = '#efe4d4'; g.font = '800 13px system-ui'; g.textAlign = 'left'; g.fillText(`Body: ${treeFree()} volné / ${treePoints()}`, 10, 20);
  }
  function info() {
    const el = document.getElementById('ti'); if (!el) return; const i = api.sel; if (i == null) { el.innerHTML = 'Klepni na uzel. Táhni pro posun, dvěma prsty přiblížení.'; return; }
    const n = N[i], role = n[4]; let t = '';
    if (role === 'keystone') t = `<b style="color:var(--acc)">${n[6]}</b> (keystone)<br>${KEYSTONES[n[6]] || ''}`;
    else if (role === 'gem') { const id = gemIdByName(n[6]); t = `<b style="color:var(--acc)">${n[6]}</b> (exkluzivní skill gem)<br>${id ? SKILLS[id].desc : ''}`; }
    else if (role === 'offhand') t = '<b>Dual Mastery</b><br>Odemkne off-hand: druhou hůlku nebo štít.';
    else if (role === 'start') t = '<b>Origin</b><br>Začátek stromu.';
    else t = `<b>${n[6] || 'Uzel'}</b><br>` + Object.entries(n[7]).map(([k, v]) => `+${v}${TREE_STAT[k] || ' ' + k}`).join('<br>');
    const has = CH.tree.includes(i);
    t += `<div class="row" style="margin-top:8px">${has ? (i ? `<button data-a="tref" data-v="${i}">Vrátit ● ${refundCost()}</button>` : '') : `<button class="pri" data-a="talloc" data-v="${i}" ${canAlloc(i) ? '' : 'disabled'}>Přidělit bod</button>`}${CH.lvl < 5 ? '<span style="color:var(--dim);font-size:12px">Strom se otevře na levelu 5.</span>' : ''}</div>`;
    el.innerHTML = t;
  }
  const api = { mount, draw, info, sel: null }; return api;
})();
window.addEventListener('load', () => UI.start());
