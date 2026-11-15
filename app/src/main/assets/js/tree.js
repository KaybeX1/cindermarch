'use strict';
/* Passive tree: six themed branches around a central start, joined by two rings. */
const BRANCHES = [
  { id: 'might', name: 'Might', color: '#d8604e',
    spine: [{ physPct: 8 }, { lifePct: 4 }, { attackPct: 8 }, { physPct: 8 }, { lifePct: 4 }, { attackPct: 10 }, { physPct: 10 }, { atkSpeed: 3 }, { attackPct: 10 }],
    side1: [{ physPct: 8 }, { n: 'Butchery', physPct: 18, attackPct: 12 }],
    side2: [{ lifePct: 4 }, { n: 'Warlord', attackPct: 16, lifePct: 8, leech: 0.4 }],
    key: { n: 'Bloodrage', moreAtk: 35, lifePct: -12 } },
  { id: 'bulwark', name: 'Bulwark', color: '#c9b37a',
    spine: [{ armourPct: 12 }, { lifePct: 5 }, { regenPct: 0.2 }, { armourPct: 12 }, { lifePct: 5 }, { resAll: 4 }, { armourPct: 15 }, { lifePct: 5 }, { resAll: 5 }],
    side1: [{ lifePct: 4 }, { n: 'Stoneblood', lifePct: 10, regenPct: 0.4 }],
    side2: [{ armourPct: 12 }, { n: 'Aegis', armourPct: 30, resAll: 8 }],
    key: { n: 'Mountain Heart', lifePct: 25, armourPct: 20, moveSpeed: -10 } },
  { id: 'pyre', name: 'Pyre', color: '#ff8440',
    spine: [{ firePct: 10 }, { spellPct: 6 }, { areaPct: 5 }, { firePct: 10 }, { lifePct: 3 }, { firePct: 12 }, { areaPct: 6 }, { spellPct: 8 }, { firePct: 12 }],
    side1: [{ firePct: 8 }, { n: 'Conflagration', firePct: 22, areaPct: 10 }],
    side2: [{ resFire: 10 }, { n: 'Ashwalker', firePct: 16, resFire: 15, lifePct: 5 }],
    key: { n: 'Inferno Heart', moreFire: 30, resCold: -20 } },
  { id: 'rime', name: 'Rime', color: '#7fc8ff',
    spine: [{ coldPct: 10 }, { lifePct: 4 }, { spellPct: 6 }, { coldPct: 10 }, { areaPct: 5 }, { coldPct: 12 }, { lifePct: 4 }, { spellPct: 8 }, { coldPct: 12 }],
    side1: [{ coldPct: 8 }, { n: 'Permafrost', coldPct: 22, chillBonus: 8 }],
    side2: [{ resCold: 10 }, { n: 'Winterborn', coldPct: 14, resCold: 15, lifePct: 6 }],
    key: { n: 'Deep Freeze', chillBonus: 25, coldPct: 20, moveSpeed: -5 } },
  { id: 'tempest', name: 'Tempest', color: '#f2e86a',
    spine: [{ lightPct: 10 }, { crit: 1 }, { spellPct: 6 }, { lightPct: 10 }, { critMulti: 10 }, { lightPct: 12 }, { crit: 1 }, { critMulti: 12 }, { lightPct: 12 }],
    side1: [{ crit: 1 }, { n: 'Stormsight', crit: 2.5, critMulti: 20 }],
    side2: [{ resLight: 10 }, { n: 'Conductor', lightPct: 20, resLight: 15, atkSpeed: 4 }],
    key: { n: 'Overcharge', critMulti: 50, crit: 3, lifePct: -10 } },
  { id: 'alacrity', name: 'Alacrity', color: '#7fe0a0',
    spine: [{ atkSpeed: 3 }, { moveSpeed: 3 }, { dodge: 2 }, { atkSpeed: 3 }, { dmgPct: 6 }, { moveSpeed: 4 }, { atkSpeed: 4 }, { dodge: 3 }, { dmgPct: 8 }],
    side1: [{ moveSpeed: 3 }, { n: 'Fleetfoot', moveSpeed: 8, dodge: 5 }],
    side2: [{ atkSpeed: 3 }, { n: 'Frenzy', atkSpeed: 8, dmgPct: 10 }],
    key: { n: 'Phantom', dodge: 15, moveSpeed: 10, armourPct: -30 } }
];
const TREE = (function () {
  const nodes = {}, edges = [];
  const STEP = 72;
  const add = (id, ang, r, type, def, color) => {
    const stats = Object.assign({}, def || {}); const name = stats.n; delete stats.n;
    nodes[id] = { id, x: Math.cos(ang) * r * STEP, y: Math.sin(ang) * r * STEP, type, name: name || null, stats, color, adj: [] };
    return id;
  };
  const link = (a, b) => { edges.push([a, b]); nodes[a].adj.push(b); nodes[b].adj.push(a); };
  add('start', 0, 0, 'start', {}, '#ffffff');
  const N = BRANCHES.length, deg = Math.PI / 180;
  BRANCHES.forEach((b, k) => {
    const th = -Math.PI / 2 + k * 2 * Math.PI / N;
    let prev = 'start';
    b.spine.forEach((s, i) => { const id = add(b.id + i, th, i + 1, 'small', s, b.color); link(prev, id); prev = id; });
    const kid = add(b.id + 'K', th, b.spine.length + 1.15, 'key', b.key, b.color); link(prev, kid);
    const a1 = add(b.id + 'a', th + 11 * deg, 3.6, 'small', b.side1[0], b.color); link(b.id + 2, a1);
    const a2 = add(b.id + 'A', th + 17 * deg, 4.3, 'notable', b.side1[1], b.color); link(a1, a2);
    const c1 = add(b.id + 'b', th - 9 * deg, 6.6, 'small', b.side2[0], b.color); link(b.id + 5, c1);
    const c2 = add(b.id + 'B', th - 13 * deg, 7.4, 'notable', b.side2[1], b.color); link(c1, c2);
  });
  BRANCHES.forEach((b, k) => {
    const nb = BRANCHES[(k + 1) % N];
    const th = -Math.PI / 2 + k * 2 * Math.PI / N;
    const r1a = add('ri' + k + 'a', th + 20 * deg, 2, 'small', { lifePct: 3 }, '#b8b8b8');
    const r1b = add('ri' + k + 'b', th + 40 * deg, 2, 'small', { dmgPct: 5 }, '#b8b8b8');
    link(b.id + 1, r1a); link(r1a, r1b); link(r1b, nb.id + 1);
    const r2a = add('ro' + k + 'a', th + 22 * deg, 5.2, 'small', { resAll: 4 }, '#b8b8b8');
    const r2b = add('ro' + k + 'b', th + 38 * deg, 5.2, 'small', { dmgPct: 6 }, '#b8b8b8');
    link(b.id + 4, r2a); link(r2a, r2b); link(r2b, nb.id + 4);
  });
  return { nodes, edges };
})();
