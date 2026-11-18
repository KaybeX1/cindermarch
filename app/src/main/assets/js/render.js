'use strict';
/* ===== canvas renderer ===== */
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
let DPR = 1, SC = 1, vignette = null;
if (!CanvasRenderingContext2D.prototype.roundRect) CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h) { this.rect(x, y, w, h); };
const joy = { on: false, id: -1, ox: 0, oy: 0, x: 0, y: 0 };

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  DPR = Math.min(window.devicePixelRatio || 1, 2.5);
  cv.width = Math.round(w * DPR); cv.height = Math.round(h * DPR);
  SC = Math.min(w, h) / 420;
  VIEW.w = w / SC; VIEW.h = h / SC;
  vignette = document.createElement('canvas');
  vignette.width = Math.max(2, Math.round(w / 4)); vignette.height = Math.max(2, Math.round(h / 4));
  const g = vignette.getContext('2d');
  const gr = g.createRadialGradient(vignette.width / 2, vignette.height / 2, Math.min(vignette.width, vignette.height) * 0.3, vignette.width / 2, vignette.height / 2, Math.max(vignette.width, vignette.height) * 0.75);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.78)');
  g.fillStyle = gr; g.fillRect(0, 0, vignette.width, vignette.height);
}
window.addEventListener('resize', resize);

function hash2(x, y) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(Math.round(((n >> 16) & 255) * f), 0, 255), g = clamp(Math.round(((n >> 8) & 255) * f), 0, 255), b = clamp(Math.round((n & 255) * f), 0, 255);
  return 'rgb(' + r + ',' + g + ',' + b + ')';
}

function drawGround(camX, camY, vw, vh) {
  const zi = G.zi;
  ctx.fillStyle = zi.ground; ctx.fillRect(camX, camY, vw, vh);
  const C = 84, x0 = Math.floor(camX / C) - 1, y0 = Math.floor(camY / C) - 1, x1 = Math.floor((camX + vw) / C) + 1, y1 = Math.floor((camY + vh) / C) + 1;
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    const h = hash2(cx, cy), h2 = hash2(cx + 91, cy - 37), px = cx * C + h * C, py = cy * C + h2 * C;
    if (h < 0.55) {            // darker / lighter ground patches
      ctx.fillStyle = h2 < 0.5 ? zi.tint : 'rgba(0,0,0,0.22)';
      ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.ellipse(px, py, 26 + h2 * 34, 16 + h * 26, h * 3, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (h2 > 0.62) {           // pebbles
      ctx.fillStyle = shade(zi.tint, 1.35);
      ctx.beginPath(); ctx.arc(px + 20, py - 12, 2 + h * 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(px + 28, py - 6, 1.5 + h2 * 2, 0, Math.PI * 2); ctx.fill();
    }
    if (h > 0.9) {             // cracks
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(px - 18, py); ctx.lineTo(px - 4, py + 7); ctx.lineTo(px + 6, py + 3); ctx.lineTo(px + 20, py + 12); ctx.stroke();
    }
  }
}
// outer walls with a lit face where they meet the floor; everything outside the room is wall too
function drawWalls(camX, camY, vw, vh) {
  const W = G.W, H = G.H, g = G.grid, zi = G.zi;
  const x0 = Math.floor(camX / TILE), y0 = Math.floor(camY / TILE), x1 = Math.floor((camX + vw) / TILE), y1 = Math.floor((camY + vh) / TILE);
  const rock = shade(zi.ground, 0.38), face = shade(zi.tint, 1.25), edge = shade(zi.tint, 0.75);
  const fl = (x, y) => x >= 0 && y >= 0 && x < W && y < H && g[y * W + x] !== 0 && g[y * W + x] !== 4;
  ctx.fillStyle = rock;
  for (let y = y0; y <= y1; y++) {
    let run = -1;
    for (let x = x0; x <= x1 + 1; x++) {
      const wall = x <= x1 && !fl(x, y);
      if (wall && run < 0) run = x;
      if (!wall && run >= 0) { ctx.fillRect(run * TILE, y * TILE, (x - run) * TILE, TILE + 0.5); run = -1; }
    }
  }
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (fl(x, y)) continue;
    const px = x * TILE, py = y * TILE;
    if (fl(x, y + 1)) { ctx.fillStyle = face; ctx.fillRect(px, py + TILE - 13, TILE, 13); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(px, py + TILE, TILE, 7); }
    ctx.fillStyle = edge;
    if (fl(x, y - 1)) ctx.fillRect(px, py, TILE, 3);
    if (fl(x - 1, y)) ctx.fillRect(px, py, 3, TILE);
    if (fl(x + 1, y)) ctx.fillRect(px + TILE - 3, py, 3, TILE);
    if (hash2(x, y) > 0.8) { ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(px + 8, py + 9, 14, 9); }
  }
}
// rocks block walking and shots, pits only walking
function drawObstacles() {
  const W = G.W, H = G.H, g = G.grid, zi = G.zi;
  const at = (x, y) => x >= 0 && y >= 0 && x < W && y < H ? g[y * W + x] : 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const t = g[y * W + x], px = x * TILE, py = y * TILE;
    if (t === 3) {
      ctx.fillStyle = '#07090c'; ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = 'rgba(70,110,150,0.12)'; ctx.fillRect(px + 4, py + 10 + Math.sin(G.t * 1.5 + x) * 2, TILE - 8, 3);
      ctx.fillStyle = shade(zi.tint, 0.55);
      if (at(x, y - 1) !== 3) ctx.fillRect(px, py, TILE, 8);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      if (at(x - 1, y) !== 3) ctx.fillRect(px, py, 3, TILE);
      if (at(x + 1, y) !== 3) ctx.fillRect(px + TILE - 3, py, 3, TILE);
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (g[y * W + x] !== 2) continue;
    const px = x * TILE, py = y * TILE, h = hash2(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(px + 2, py + 8, TILE - 2, TILE);
    ctx.fillStyle = shade(zi.tint, 0.9); ctx.beginPath(); ctx.roundRect(px + 2, py + 2, TILE - 4, TILE - 4, 7); ctx.fill();
    ctx.fillStyle = shade(zi.tint, 1.45); ctx.beginPath(); ctx.roundRect(px + 4, py + 2, TILE - 8, TILE - 16, 6); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(px + 9 + h * 8, py + 7, 8, 4);
  }
}
function drawDoor() {
  const x = G.door * TILE, open = G.cleared;
  if (!open) {
    ctx.fillStyle = '#1a1410'; ctx.fillRect(x + 2, 0, TILE - 4, TILE);
    ctx.fillStyle = '#6a6a72';
    for (let i = 0; i < 4; i++) ctx.fillRect(x + 6 + i * 8.5, 2, 3, TILE - 4);
    ctx.fillRect(x + 4, 12, TILE - 8, 3); ctx.fillRect(x + 4, 26, TILE - 8, 3);
    return;
  }
  const pulse = 0.6 + Math.sin(G.t * 4) * 0.25;
  const gr = ctx.createLinearGradient(0, -10, 0, TILE);
  gr.addColorStop(0, 'rgba(159,230,255,' + pulse + ')'); gr.addColorStop(1, 'rgba(159,230,255,0)');
  ctx.fillStyle = gr; ctx.fillRect(x + 2, -10, TILE - 4, TILE + 10);
  if (!R.picks) {
    ctx.fillStyle = 'rgba(255,255,255,' + pulse + ')';
    const ay = TILE * 1.4 + Math.sin(G.t * 5) * 4;
    ctx.beginPath(); ctx.moveTo(x + TILE / 2, ay - 12); ctx.lineTo(x + TILE / 2 + 10, ay); ctx.lineTo(x + TILE / 2 - 10, ay); ctx.closePath(); ctx.fill();
  }
}

function drawMob(m) {
  const pl = G.player, ang = Math.atan2(pl.y - m.y, pl.x - m.x);
  const bob = Math.sin(m.wob) * 1.2, lx = m.lunge > 0 ? Math.cos(ang) * 6 : 0, ly = m.lunge > 0 ? Math.sin(ang) * 6 : 0;
  const x = m.x + lx, y = m.y + ly + bob, r = m.r;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath(); ctx.ellipse(m.x, m.y + r * 0.8, r * 0.95, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
  if (m.rar) {
    ctx.strokeStyle = m.boss ? '#ff6a4a' : m.rar === 2 ? '#f5e663' : '#8f8fff'; ctx.lineWidth = m.boss ? 3 : 2; ctx.globalAlpha = 0.55 + Math.sin(G.t * 5 + m.wob) * 0.2;
    ctx.beginPath(); ctx.arc(x, y, r + 4, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
  }
  let col = m.flash > 0 ? '#ffffff' : m.st === 'aim' && Math.sin(G.t * 40) > 0 ? '#ff6a4a' : m.chill > 0 ? '#7fb8d8' : m.color;
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.5;
  if (m.boss) {
    ctx.beginPath();
    for (let k = 0; k < 10; k++) { const a = k * Math.PI / 5, rr = k % 2 ? r * 0.85 : r * 1.12; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = shade(m.color, 0.6); ctx.beginPath(); ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2); ctx.fill();
  } else if (m.type === 'totem') {
    ctx.rotate(-ang + G.t * 0.6);
    ctx.beginPath();
    for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6, rr = k % 2 ? r * 0.7 : r * 1.15; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#c8e070'; ctx.beginPath(); ctx.arc(0, 0, r * 0.35 + Math.sin(G.t * 6) * 1.5, 0, Math.PI * 2); ctx.fill();
  } else if (m.type === 'swarm') {
    ctx.beginPath(); ctx.moveTo(r * 1.3, 0); ctx.lineTo(-r, r * 0.9); ctx.lineTo(-r * 0.5, 0); ctx.lineTo(-r, -r * 0.9); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (m.type === 'brute') {
    ctx.beginPath(); ctx.roundRect(-r, -r, r * 2, r * 2, r * 0.45); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#d8d0c0';
    ctx.beginPath(); ctx.moveTo(r * 0.5, -r * 0.9); ctx.lineTo(r * 1.35, -r * 1.05); ctx.lineTo(r * 0.9, -r * 0.5); ctx.fill();
    ctx.beginPath(); ctx.moveTo(r * 0.5, r * 0.9); ctx.lineTo(r * 1.35, r * 1.05); ctx.lineTo(r * 0.9, r * 0.5); ctx.fill();
  } else if (m.type === 'caster') {
    ctx.beginPath(); ctx.moveTo(r * 1.1, 0); ctx.lineTo(-r, r); ctx.lineTo(-r * 0.6, 0); ctx.lineTo(-r, -r); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8f6ff'; ctx.globalAlpha = 0.6 + Math.sin(G.t * 8 + m.wob) * 0.3;
    ctx.beginPath(); ctx.arc(r * 1.2, r * 0.7, 3, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  } else {
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = shade(m.color, 0.7);
    ctx.beginPath(); ctx.arc(r * 0.75, -r * 0.8, r * 0.35, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.75, r * 0.8, r * 0.35, 0, Math.PI * 2); ctx.fill();
  }
  if (m.flash <= 0) {       // eyes
    ctx.fillStyle = m.boss ? '#ffcf4a' : '#ff5a3a';
    const e = Math.max(1.4, r * 0.14);
    ctx.beginPath(); ctx.arc(r * 0.45, -r * 0.3, e, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 0.45, r * 0.3, e, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  if (m.burnT > 0) {
    ctx.fillStyle = '#ff9a3c'; ctx.globalAlpha = 0.8;
    for (let k = 0; k < 3; k++) { const a = G.t * 7 + k * 2.1 + m.wob; ctx.beginPath(); ctx.arc(x + Math.cos(a) * r * 0.6, y - r * 0.3 - Math.abs(Math.sin(a * 1.3)) * r, 2.2, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  if (!m.boss && (m.hp < m.maxHp || m.rar)) {
    const w = Math.max(20, r * 2.2), f = clamp(m.hp / m.maxHp, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x - w / 2, y - r - 9, w, 4);
    ctx.fillStyle = m.rar === 2 ? '#f5e663' : m.rar === 1 ? '#8f8fff' : '#d8402c'; ctx.fillRect(x - w / 2 + 0.5, y - r - 8.5, (w - 1) * f, 3);
  }
}

function drawPlayer() {
  const pl = G.player, x = pl.x, y = pl.y + Math.sin(pl.walk * 14) * 1.2;
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath(); ctx.ellipse(pl.x, pl.y + 9, 11, 5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.translate(x, y); ctx.rotate(pl.face);
  // weapon
  ctx.strokeStyle = '#d8d8e0'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(6, 8); ctx.lineTo(22, 5); ctx.stroke();
  // cloak + head
  ctx.fillStyle = pl.flash > 0 ? '#ffffff' : CLASSES[S.cls].color; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, PLAYER_R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = pl.flash > 0 ? '#ffffff' : '#e0c8a0';
  ctx.beginPath(); ctx.arc(2, 0, 5.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = CLASSES[S.cls].hair; ctx.beginPath(); ctx.arc(-1, 0, 5.5, Math.PI * 0.5, Math.PI * 1.5); ctx.fill();
  ctx.restore();
}

function drawFx(f) {
  const p = f.t / f.d;
  ctx.globalAlpha = 1 - p;
  switch (f.k) {
    case 'arc':
      ctx.strokeStyle = f.color; ctx.lineWidth = 10 * (1 - p) + 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.6 + 0.4 * p), f.a - 1.15, f.a + 1.15); ctx.stroke();
      break;
    case 'ring':
      if (f.fill) { ctx.fillStyle = f.color; ctx.globalAlpha = (1 - p) * 0.3; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.4 + 0.6 * p), 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1 - p; }
      ctx.strokeStyle = f.color; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.4 + 0.6 * p), 0, Math.PI * 2); ctx.stroke();
      break;
    case 'burst':
      ctx.fillStyle = f.color;
      for (let k = 0; k < 6; k++) { const a = k * 1.047 + f.x; ctx.beginPath(); ctx.arc(f.x + Math.cos(a) * f.r * p, f.y + Math.sin(a) * f.r * p, 3 * (1 - p) + 1, 0, Math.PI * 2); ctx.fill(); }
      break;
    case 'bolt':
      ctx.strokeStyle = f.color; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(f.pts[0].x, f.pts[0].y);
      for (let i = 1; i < f.pts.length; i++) {
        const a = f.pts[i - 1], b = f.pts[i];
        for (let s = 1; s <= 3; s++) { const q = s / 3, j = s < 3 ? 9 : 0; ctx.lineTo(a.x + (b.x - a.x) * q + (hash2(i * 7 + s, Math.floor(f.t * 60)) - 0.5) * j * 2, a.y + (b.y - a.y) * q + (hash2(s, i * 13 + Math.floor(f.t * 60)) - 0.5) * j * 2); }
      }
      ctx.stroke();
      break;
    case 'trail':
      ctx.strokeStyle = f.color; ctx.lineWidth = 6 * (1 - p) + 1; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(f.x2, f.y2); ctx.stroke();
      break;
    case 'line':
      ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.a);
      ctx.globalAlpha = 0.18 + 0.3 * p; ctx.fillStyle = f.color; ctx.fillRect(0, -f.w / 2, f.len, f.w);
      ctx.globalAlpha = 0.6; ctx.fillRect(0, -1, f.len * p, 2);
      ctx.restore();
      break;
    case 'warn':
      ctx.globalAlpha = 0.25 + p * 0.5;
      ctx.strokeStyle = f.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = f.color; ctx.globalAlpha = 0.18; ctx.beginPath(); ctx.arc(f.x, f.y, f.r * p, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1; ctx.fillStyle = '#ffb060';
      ctx.beginPath(); ctx.arc(f.x + (1 - p) * 90, f.y - (1 - p) * 320, 9, 0, Math.PI * 2); ctx.fill();
      break;
  }
  ctx.globalAlpha = 1;
}

function drawDrop(d) {
  const bounce = d.t < 0.3 ? Math.sin(d.t / 0.3 * Math.PI) * 10 : 0;
  if (d.gold) {
    ctx.fillStyle = '#f0b830'; ctx.strokeStyle = '#7a5410'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(d.x, d.y - bounce, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    return;
  }
  const name = d.gem ? SKILLS[d.gem.id].name : d.item.name, col = d.gem ? '#58d8c8' : RARITY_COLOR[d.item.rarity];
  ctx.font = (d.item && d.item.rarity === 0 ? '9px' : '600 10px') + ' system-ui, sans-serif';
  const w = ctx.measureText(name).width + 10, h = 15, x = d.x - w / 2, y = d.y - h / 2 - bounce;
  ctx.fillStyle = 'rgba(0,0,0,0.78)'; ctx.fillRect(x, y, w, h);
  if (d.gem || d.item.rarity > 0) { ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); }
  ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(name, d.x, y + h / 2 + 0.5);
}

function render() {
  const W = cv.width, H = cv.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (!G) { ctx.fillStyle = '#0d0b0a'; ctx.fillRect(0, 0, W, H); return; }
  const pl = G.player, roomW = G.W * TILE, roomH = G.H * TILE;
  const zoom = Math.min(1, VIEW.w / roomW), k = DPR * SC * zoom, vw = VIEW.w / zoom, vh = VIEW.h / zoom;
  // the room always fills the width; vertically the camera follows the player, leaving space for the HUD
  const top = 96 / zoom, bottom = 150 / zoom;
  let camY = roomH + top + bottom <= vh ? (roomH - vh) / 2 + (bottom - top) / 2 : clamp(pl.y - vh * 0.55, -top, roomH - vh + bottom);
  let camX = (roomW - vw) / 2;
  if (G.shake) { camX += rnd(-1, 1) * G.shake; camY += rnd(-1, 1) * G.shake; }
  ctx.setTransform(k, 0, 0, k, -camX * k, -camY * k);
  drawGround(camX, camY, vw, vh);
  drawObstacles();
  drawWalls(camX, camY, vw, vh);
  drawDoor();
  for (const d of G.drops) drawDrop(d);
  ctx.globalAlpha = 1;
  for (const m of G.mobs) if (!m.dead) { ctx.globalAlpha = Math.min(1, G.t / 0.8); drawMob(m); }
  ctx.globalAlpha = 1;
  for (const f of G.fx) if (f.k === 'warn') drawFx(f);
  drawPlayer();
  for (const info of P.skills) if (info && info.def.kind === 'orbit') {
    for (const b of orbitBlades(info)) {
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a + G.t * 14);
      ctx.fillStyle = '#d8dce8'; ctx.strokeStyle = '#5a6070'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-11, 0); ctx.lineTo(0, -3.5); ctx.lineTo(11, 0); ctx.lineTo(0, 3.5); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }
  for (const p of G.projs) {
    const a = Math.atan2(p.vy, p.vx);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(a);
    if (p.kind === 'wave') { ctx.strokeStyle = p.color; ctx.lineWidth = 4; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(-6, 0, p.r, -1.1, 1.1); ctx.stroke(); ctx.globalAlpha = 1; }
    else if (p.kind === 'lance') { ctx.fillStyle = p.color; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-12, -3.5); ctx.lineTo(-8, 0); ctx.lineTo(-12, 3.5); ctx.closePath(); ctx.fill(); }
    else {
      ctx.fillStyle = p.color; ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.ellipse(-8, 0, 12, 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff2c0'; ctx.beginPath(); ctx.arc(1, 0, p.r * 0.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }
  for (const p of G.eprojs) {
    ctx.fillStyle = p.color; ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 4, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
  }
  for (const f of G.fx) if (f.k !== 'warn') drawFx(f);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const t of G.texts) {
    ctx.globalAlpha = t.t > 0.5 ? 1 - (t.t - 0.5) / 0.3 : 1;
    ctx.font = (t.big ? '700 16px' : '600 12px') + ' system-ui, sans-serif';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.strokeText(t.txt, t.x, t.y);
    ctx.fillStyle = t.color; ctx.fillText(t.txt, t.x, t.y);
  }
  ctx.globalAlpha = 1;

  // screen-space overlays
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (vignette) ctx.drawImage(vignette, 0, 0, W, H);
  const lf = pl.life / P.maxLife;
  if (lf < 0.35) { ctx.fillStyle = 'rgba(160,10,10,' + ((0.35 - lf) * 0.9 * (0.7 + Math.sin(G.t * 6) * 0.3)).toFixed(3) + ')'; ctx.fillRect(0, 0, W, H); }
  if (joy.on) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(joy.ox, joy.oy, 48, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath(); ctx.arc(joy.ox + joy.x * 48, joy.oy + joy.y * 48, 20, 0, Math.PI * 2); ctx.fill();
  }
}

/* ===== movement input: floating joystick + keyboard ===== */
const keys = {};
function joyUpdate(e) {
  let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy; const l = Math.hypot(dx, dy);
  if (l > 48) { dx *= 48 / l; dy *= 48 / l; }
  joy.x = dx / 48; joy.y = dy / 48;
  const m = Math.hypot(joy.x, joy.y);
  if (m < 0.15) { input.x = 0; input.y = 0; } else { input.x = joy.x / m * Math.min(1, m * 1.25); input.y = joy.y / m * Math.min(1, m * 1.25); }
}
cv.addEventListener('pointerdown', e => {
  if (joy.on) return;
  joy.on = true; joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; joy.x = joy.y = 0;
  try { cv.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
  e.preventDefault();
});
cv.addEventListener('pointermove', e => { if (joy.on && e.pointerId === joy.id) { joyUpdate(e); e.preventDefault(); } });
function joyEnd(e) { if (!e || e.pointerId === joy.id) { joy.on = false; joy.id = -1; input.x = input.y = 0; } }
cv.addEventListener('pointerup', joyEnd); cv.addEventListener('pointercancel', joyEnd);
function keyInput() {
  if (joy.on) return;
  const x = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0), y = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
  input.x = x; input.y = y;
}
window.addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; keyInput(); });
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; keyInput(); });
