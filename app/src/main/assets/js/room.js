'use strict';
/* ===== rooms: 11×19 tiles of 2 world units, door at the top, the player enters at the bottom.
   tiles: 0 wall, 1 floor, 2 obstacle (blocks walking and shots), 3 pit (blocks walking only), 4 door ===== */
const T = 2, RW = 11, RH = 19, DOOR_X = 5;
const START = { x: 5.5 * T, z: 16.5 * T };
function seeded(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function bfs(grid, W, H, sx, sy, passable) {
  const d = new Int16Array(W * H).fill(-1), q = new Int32Array(W * H); let h = 0, t = 0;
  if (sx < 0 || sy < 0 || sx >= W || sy >= H) return d;
  d[sy * W + sx] = 0; q[t++] = sy * W + sx;
  while (h < t) { const c = q[h++], x = c % W;
    for (const n of [x > 0 ? c - 1 : -1, x < W - 1 ? c + 1 : -1, c - W, c + W]) { if (n < 0 || n >= W * H || d[n] >= 0 || !passable(grid[n])) continue; d[n] = d[c] + 1; q[t++] = n; } }
  return d;
}
const SHAPES = [[[0, 0]], [[0, 0], [1, 0]], [[0, 0], [0, 1]], [[0, 0], [1, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [2, 0]], [[0, 0], [0, 1], [0, 2]]];
// kind: 'normal' | 'elite' | 'boss' | 'trader' | 'arena'
function genRoom(seed, kind) {
  const R = seeded(seed), W = RW, H = RH, ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  let grid;
  for (let attempt = 0; attempt < 30; attempt++) {
    grid = new Uint8Array(W * H);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) grid[y * W + x] = 1;
    for (let x = 1; x < W - 1; x++) grid[(H - 1) * W + x] = 1;          // open bottom edge (camera side)
    grid[DOOR_X] = 4;
    if (attempt < 29 && kind !== 'trader') {
      const style = kind === 'boss' || kind === 'arena' ? 'pillars' : ['rocks', 'pits', 'mixed', 'mixed'][Math.floor(R() * 4)];
      const n = kind === 'boss' || kind === 'arena' ? ri(1, 2) : ri(3, 5);
      for (let k = 0; k < n; k++) {
        const tile = style === 'rocks' || style === 'pillars' ? 2 : style === 'pits' ? 3 : (R() < 0.5 ? 2 : 3);
        const sh = style === 'pillars' ? SHAPES[0] : SHAPES[Math.floor(R() * SHAPES.length)];
        const ox = ri(1, 4), oy = kind === 'boss' || kind === 'arena' ? ri(4, 12) : ri(3, 13);
        for (const [dx, dy] of sh) { const x = ox + dx, y = oy + dy; if (x < 1 || x > 9 || y < 3 || y > 13) continue; grid[y * W + x] = tile; grid[y * W + (W - 1 - x)] = tile; }
      }
    }
    const d = bfs(grid, W, H, Math.floor(START.x / T), Math.floor(START.z / T), v => v === 1 || v === 4);
    let ok = d[1 * W + DOOR_X] >= 0;
    for (let i = 0; ok && i < W * H; i++) if (grid[i] === 1 && d[i] < 0) ok = false;
    if (ok) break;
  }
  return { W, H, grid, seed };
}
const tileAt = (room, x, z) => { const tx = Math.floor(x / T), tz = Math.floor(z / T); if (tx < 0 || tz < 0 || tx >= room.W) return 0; if (tz >= room.H) return 1; return room.grid[tz * room.W + tx]; };
const walkable = (room, x, z) => { const t = tileAt(room, x, z); return t === 1 || (t === 4 && room.open); };
const shotFree = (room, x, z) => { const t = tileAt(room, x, z); return t === 1 || t === 3 || t === 4; };
function canStand(room, x, z, r) { return walkable(room, x - r, z - r) && walkable(room, x + r, z - r) && walkable(room, x - r, z + r) && walkable(room, x + r, z + r) && z < RH * T - 0.3; }
function losClear(room, x0, z0, x1, z1) { const d = Math.hypot(x1 - x0, z1 - z0) || 1, n = Math.ceil(d / 0.25), px = -(z1 - z0) / d * 0.32, pz = (x1 - x0) / d * 0.32; for (let i = 1; i < n; i++) { const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t; if (!shotFree(room, x, z) || !shotFree(room, x + px, z + pz) || !shotFree(room, x - px, z - pz)) return false; } return true; }
function floorSpots(room, minZ, maxZ) { const out = []; for (let y = 1; y < room.H; y++) for (let x = 1; x < room.W - 1; x++) if (room.grid[y * room.W + x] === 1 && y * T >= minZ && y * T <= maxZ) out.push([(x + 0.5) * T, (y + 0.5) * T]); return out; }
function walkClear(room, x0, z0, x1, z1, r) { const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / 0.6); for (let i = 1; i < n; i++) { const t = i / n; if (!canStand(room, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, r)) return false; } return true; }
