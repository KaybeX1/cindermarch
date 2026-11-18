'use strict';
/* ===== rooms: one screen per fight, door at the top, the player enters from the bottom =====
   tiles: 0 wall, 1 floor, 2 rock (blocks walking and shots), 3 pit (blocks walking only), 4 closed door */
const TILE = 40, ROOM_W = 11, ROOM_H = 19;
const DOOR_X = 5, START = { x: 5.5 * TILE, y: 16.5 * TILE };
function seededRandom(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
// steps from one tile to every floor tile that can be walked to
function tileDistances(grid, W, H, sx, sy) {
  const d = new Int32Array(W * H).fill(-1), q = new Int32Array(W * H);
  let h = 0, t = 0;
  d[sy * W + sx] = 0; q[t++] = sy * W + sx;
  while (h < t) {
    const c = q[h++], x = c % W;
    for (const n of [x > 0 ? c - 1 : -1, x < W - 1 ? c + 1 : -1, c - W, c + W]) {
      if (n < 0 || n >= W * H || grid[n] !== 1 || d[n] >= 0) continue;
      d[n] = d[c] + 1; q[t++] = n;
    }
  }
  return d;
}
const SHAPES = [[[0, 0]], [[0, 0], [1, 0]], [[0, 0], [0, 1]], [[0, 0], [1, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [2, 0]], [[0, 0], [0, 1], [0, 2]]];
function genRoom(seed, ch, r) {
  const R = seededRandom(seed), W = ROOM_W, H = ROOM_H, boss = isBossRoom(r);
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  let grid;
  for (let attempt = 0; attempt < 30; attempt++) {
    grid = new Uint8Array(W * H);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) grid[y * W + x] = 1;
    grid[DOOR_X] = 4;
    if (attempt < 29) {
      // obstacles, mirrored left to right so rooms look built rather than random
      const style = boss ? 'pillars' : ['rocks', 'pits', 'mixed', 'mixed'][Math.floor(R() * 4)];
      const n = boss ? ri(0, 2) : ri(3, 5);
      for (let k = 0; k < n; k++) {
        const tile = style === 'rocks' || style === 'pillars' ? 2 : style === 'pits' ? 3 : (R() < 0.5 ? 2 : 3);
        const sh = style === 'pillars' ? SHAPES[0] : SHAPES[Math.floor(R() * SHAPES.length)];
        const ox = ri(1, 4), oy = boss ? ri(4, 12) : ri(3, 13);
        for (const [dx, dy] of sh) {
          const x = ox + dx, y = oy + dy;
          if (x < 1 || x > 9 || y < 3 || y > 13) continue;
          grid[y * W + x] = tile; grid[y * W + (W - 1 - x)] = tile;
        }
      }
    }
    // everything must be reachable from the entrance, including the door
    const d = tileDistances(grid, W, H, Math.floor(START.x / TILE), Math.floor(START.y / TILE));
    let ok = d[1 * W + DOOR_X] >= 0;
    for (let i = 0; ok && i < W * H; i++) if (grid[i] === 1 && d[i] < 0) ok = false;
    if (ok) break;
  }
  const spawns = [];
  if (boss) spawns.push({ type: 'boss', x: 5.5 * TILE, y: 5.5 * TILE, final: r === CH_ROOMS, idx: r / 5 - 1 });
  else {
    const floor = [];
    for (let y = 2; y <= 12; y++) for (let x = 1; x < W - 1; x++) if (grid[y * W + x] === 1) floor.push([x, y]);
    let budget = 4 + r * 0.4 + ch * 1.5;
    const kinds = ['ghoul', 'ghoul', 'swarm'];
    if (ch > 1 || r >= 3) kinds.push('caster', 'caster');
    if (ch > 1 || r >= 6) kinds.push('brute');
    if (ch > 1 || r >= 8) kinds.push('totem');
    const COST = { ghoul: 1, swarm: 1.5, caster: 1.3, brute: 2, totem: 1.5 };
    for (let guard = 0; budget > 0.6 && guard < 60 && floor.length; guard++) {
      const type = kinds[Math.floor(R() * kinds.length)], [tx, ty] = floor[Math.floor(R() * floor.length)];
      const roll = R(), rar = roll < 0.03 + ch * 0.005 ? 2 : roll < 0.15 ? 1 : 0;
      budget -= COST[type] * [1, 1.8, 3][rar];
      const n = type === 'swarm' ? 3 : 1;
      for (let i = 0; i < n; i++) spawns.push({ type, rar: i === 0 ? rar : 0, x: (tx + 0.5) * TILE + (n > 1 ? (i - 1) * 9 : 0), y: (ty + 0.5) * TILE + (n > 1 ? (i % 2) * 8 : 0) });
    }
  }
  return { W, H, grid, spawns };
}
