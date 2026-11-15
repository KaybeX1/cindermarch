'use strict';
/* ===== map generation: bounded tile maps, built from a seed so a zone keeps its layout ===== */
const TILE = 40;
function seededRandom(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
// distance in steps from one tile to every reachable floor tile
function tileDistances(grid, W, H, sx, sy) {
  const d = new Int32Array(W * H).fill(-1), q = new Int32Array(W * H);
  let h = 0, t = 0;
  d[sy * W + sx] = 0; q[t++] = sy * W + sx;
  while (h < t) {
    const c = q[h++], x = c % W;
    for (const n of [x > 0 ? c - 1 : -1, x < W - 1 ? c + 1 : -1, c - W, c + W]) {
      if (n < 0 || n >= W * H || !grid[n] || d[n] >= 0) continue;
      d[n] = d[c] + 1; q[t++] = n;
    }
  }
  return d;
}
function genMap(seed, z) {
  const R = seededRandom(seed), W = mapTiles(z), H = W, grid = new Uint8Array(W * H);
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  const carve = (cx, cy, r) => {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) continue;
      if ((x + 0.5 - cx) * (x + 0.5 - cx) + (y + 0.5 - cy) * (y + 0.5 - cy) <= r * r) grid[y * W + x] = 1;
    }
  };
  // open areas
  const nodes = [], want = 9 + Math.min(7, Math.floor(z / 2));
  for (let tries = 0; nodes.length < want && tries < 800; tries++) {
    const n = { x: ri(8, W - 9), y: ri(8, H - 9), r: 3.2 + R() * 2.8 };
    if (nodes.every(o => Math.hypot(o.x - n.x, o.y - n.y) > 11)) nodes.push(n);
  }
  for (const n of nodes) {
    carve(n.x + 0.5, n.y + 0.5, n.r);
    for (let k = 0; k < 3; k++) carve(n.x + 0.5 + (R() - 0.5) * n.r * 1.7, n.y + 0.5 + (R() - 0.5) * n.r * 1.7, n.r * (0.55 + R() * 0.3));
  }
  // connect them: a spanning tree plus a few loops
  const edges = [], inTree = [0];
  while (inTree.length < nodes.length) {
    let best = null, bd = 1e9;
    for (const a of inTree) for (let b = 0; b < nodes.length; b++) {
      if (inTree.includes(b)) continue;
      const d = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y);
      if (d < bd) { bd = d; best = [a, b]; }
    }
    edges.push(best); inTree.push(best[1]);
  }
  for (let k = 0; k < 3; k++) {
    const a = ri(0, nodes.length - 1), b = ri(0, nodes.length - 1);
    if (a !== b && Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y) < 26 && !edges.some(e => (e[0] === a && e[1] === b) || (e[0] === b && e[1] === a))) edges.push([a, b]);
  }
  const corridor = (ax, ay, bx, by, wob) => {
    const len = Math.hypot(bx - ax, by - ay), steps = Math.ceil(len * 2), px = -(by - ay) / (len || 1), py = (bx - ax) / (len || 1);
    const amp = wob ? 1.5 + R() * 2.5 : 0, ph = R() * 6.28, fr = 1 + R() * 2, rad = 1.55 + R() * 0.5;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, o = Math.sin(t * Math.PI * fr + ph) * amp * Math.sin(t * Math.PI);
      carve(ax + (bx - ax) * t + px * o, ay + (by - ay) * t + py * o, rad);
    }
  };
  for (const [a, b] of edges) corridor(nodes[a].x + 0.5, nodes[a].y + 0.5, nodes[b].x + 0.5, nodes[b].y + 0.5, true);

  // start in the area furthest from the middle, exit in the area furthest away on foot
  let si = 0, sv = -1;
  nodes.forEach((n, i) => { const v = Math.abs(n.x - W / 2) + Math.abs(n.y - H / 2); if (v > sv) { sv = v; si = i; } });
  const start = nodes[si];
  let dist = tileDistances(grid, W, H, start.x, start.y);
  let ei = si === 0 ? 1 : 0;
  nodes.forEach((n, i) => { if (i !== si && dist[n.y * W + n.x] > dist[nodes[ei].y * W + nodes[ei].x]) ei = i; });
  // the exit sits right at the edge of the map, at the end of a passage leading out of that area
  const en = nodes[ei], gaps = [[en.x, 'L'], [W - 1 - en.x, 'R'], [en.y, 'U'], [H - 1 - en.y, 'D']].sort((a, b) => a[0] - b[0]);
  const side = gaps[0][1];
  const ex = side === 'L' ? 2 : side === 'R' ? W - 3 : en.x, ey = side === 'U' ? 2 : side === 'D' ? H - 3 : en.y;
  corridor(en.x + 0.5, en.y + 0.5, ex + 0.5, ey + 0.5, false);
  grid[ey * W + ex] = 1;
  dist = tileDistances(grid, W, H, start.x, start.y);
  // arena portal: an area far from both the start and the exit
  let ai = -1, av = -1;
  nodes.forEach((n, i) => {
    if (i === si || i === ei) return;
    const v = Math.min(dist[n.y * W + n.x], Math.hypot(n.x - ex, n.y - ey) * 1.5);
    if (v > av) { av = v; ai = i; }
  });
  const an = nodes[ai];
  // chests in the remaining areas
  const rest = nodes.map((n, i) => i).filter(i => i !== si && i !== ai);
  for (let i = rest.length - 1; i > 0; i--) { const j = ri(0, i), t = rest[i]; rest[i] = rest[j]; rest[j] = t; }
  const chests = [], nChests = Math.min(rest.length, 3 + ri(0, 2) + (z > 6 ? 1 : 0));
  for (let k = 0; k < nChests; k++) {
    const n = nodes[rest[k]], a = R() * 6.28, rr = n.r * 0.55;
    let cx = Math.round(n.x + Math.cos(a) * rr), cy = Math.round(n.y + Math.sin(a) * rr);
    if (!grid[cy * W + cx]) { cx = n.x; cy = n.y; }
    chests.push({ x: (cx + 0.5) * TILE, y: (cy + 0.5) * TILE, tier: R() < ornateChance(z) ? 'ornate' : 'wooden' });
  }
  // a fixed number of monsters, in packs, away from the entrance
  const floor = [];
  for (let i = 0; i < W * H; i++) if (grid[i] && dist[i] >= 9) floor.push(i);
  const mobs = [], total = mobCount(z);
  let pack = 0;
  for (let guard = 0; mobs.length < total && floor.length && guard < 2000; guard++) {
    const c = floor[Math.floor(R() * floor.length)], cx = c % W, cy = Math.floor(c / W);
    if (Math.hypot(cx - an.x, cy - an.y) < 3 || Math.hypot(cx - ex, cy - ey) < 3) continue;
    const r = R();
    let type = r < 0.48 ? 'ghoul' : r < 0.7 ? 'swarm' : r < 0.86 ? 'caster' : 'brute';
    if (z < 2 && (type === 'caster' || type === 'brute')) type = 'ghoul';
    const n = type === 'swarm' ? ri(4, 6) : type === 'brute' ? ri(1, 2) : ri(2, 4);
    const rr = R(), magic = rr < 0.14, rare = rr > 0.94 - Math.min(0.06, z * 0.004);
    for (let i = 0; i < n && mobs.length < total; i++) {
      let mx = (cx + 0.5 + (R() - 0.5) * 2.4) * TILE, my = (cy + 0.5 + (R() - 0.5) * 2.4) * TILE;
      if (!grid[Math.floor(my / TILE) * W + Math.floor(mx / TILE)]) { mx = (cx + 0.5) * TILE; my = (cy + 0.5) * TILE; }
      mobs.push({ type, x: mx, y: my, rar: rare && i === 0 ? 2 : magic ? 1 : 0, pack });
    }
    pack++;
  }
  const w = p => ({ x: (p.x + 0.5) * TILE, y: (p.y + 0.5) * TILE });
  return { W, H, grid, start: w(start), exit: w({ x: ex, y: ey }), arena: w(an), chests, mobs };
}
// the boss arena: one round room with a few pillars to hide behind
function genArena() {
  const W = 28, H = 28, grid = new Uint8Array(W * H), c = 14;
  for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++) if (Math.hypot(x + 0.5 - c, y + 0.5 - c) <= 10.5) grid[y * W + x] = 1;
  for (const [px, py] of [[-5, -5], [4, -5], [-5, 3], [4, 3]]) for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) grid[(c + py + y) * W + c + px + x] = 0;
  return { W, H, grid, start: { x: c * TILE, y: 21.5 * TILE }, exit: { x: c * TILE, y: 23.2 * TILE }, boss: { x: c * TILE, y: 11 * TILE } };
}
