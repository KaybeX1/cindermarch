'use strict';
/* ===== 3D character preview: a figure built from boxes, shaped and coloured by class and equipment ===== */
const Model = (function () {
  // [main, highlight] colours for leather, iron and dark plate gear
  const GEAR = [['#6b4a2e', '#8f6b45'], ['#7d838e', '#b4b9c2'], ['#343a48', '#5f6678']];
  const tint = it => GEAR[tierOf(it.ilvl)];
  const trim = it => it && it.rarity > 0 ? RARITY_COLOR[it.rarity] : null;

  function build(ch) {
    const C = CLASSES[ch.cls] || CLASSES.warden, e = ch.equip || {}, bw = C.build || 1, parts = [];
    const add = (p, s, c, rot) => parts.push({ p, s, c, rx: rot ? rot.rx : 0, rz: rot ? rot.rz : 0, o: rot ? rot.o : p });
    const skin = '#dcb894', cloth = C.color, body = e.body, boots = e.boots, gloves = e.gloves, helm = e.helmet;
    for (const sx of [-1, 1]) {
      add([sx * 0.16, 0.5, 0], [0.24, 0.64, 0.26], body ? shade(tint(body)[0], 0.7) : '#3a3028');
      add([sx * 0.16, 0.12, 0.04], [0.28, 0.24, 0.38], boots ? tint(boots)[0] : '#2a2018');
      if (trim(boots)) add([sx * 0.16, 0.26, 0.04], [0.3, 0.05, 0.4], trim(boots));
    }
    add([0, 1.15, 0], [0.62 * bw, 0.68, 0.34], body ? tint(body)[0] : cloth);
    add([0, 0.83, 0], [0.65 * bw, 0.1, 0.37], trim(body) || '#241a12');
    if (body) {
      add([0, 1.22, 0.175], [0.34 * bw, 0.36, 0.03], tint(body)[1]);
      if (tierOf(body.ilvl) >= 1) for (const sx of [-1, 1]) add([sx * 0.4 * bw, 1.47, 0], [0.3, 0.16, 0.4], tint(body)[1]);
    }
    add([0, 1.0, -0.2], [0.56 * bw, 0.95, 0.04], shade(cloth, 0.6));   // cloak
    add([0, 1.72, 0], [0.36, 0.38, 0.36], skin);
    add([-0.09, 1.76, 0.185], [0.05, 0.05, 0.012], '#1a1410');
    add([0.09, 1.76, 0.185], [0.05, 0.05, 0.012], '#1a1410');
    if (helm) {
      add([0, 1.88, -0.01], [0.43, 0.2, 0.43], tint(helm)[0]);
      add([0, 1.72, -0.13], [0.43, 0.3, 0.2], tint(helm)[0]);
      if (trim(helm)) add([0, 1.79, 0], [0.45, 0.045, 0.45], trim(helm));
      if (tierOf(helm.ilvl) >= 2) add([0, 2.03, -0.02], [0.06, 0.14, 0.34], trim(helm) || tint(helm)[1]);
    } else {
      add([0, 1.93, -0.02], [0.38, 0.08, 0.38], C.hair);
      add([0, 1.76, -0.17], [0.38, 0.3, 0.06], C.hair);
    }
    if (e.amulet) add([0, 1.4, 0.2], [0.09, 0.09, 0.03], RARITY_COLOR[e.amulet.rarity] === '#c8c8c8' ? '#c9b06a' : RARITY_COLOR[e.amulet.rarity]);
    // arms hang from the shoulders; the weapon arm is raised forward
    const ax = 0.31 * bw + 0.13, sh = 1.48;
    const arm = (sx, rx) => {
      const rot = { rx, rz: sx * 0.1, o: [sx * ax, sh, 0] };
      add([sx * ax, 1.2, 0], [0.2, 0.52, 0.22], body ? tint(body)[0] : cloth, rot);
      add([sx * ax, 0.84, 0], [0.22, 0.24, 0.24], gloves ? tint(gloves)[0] : skin, rot);
      if (trim(gloves)) add([sx * ax, 0.97, 0], [0.24, 0.05, 0.26], trim(gloves), rot);
      if (e['ring' + (sx < 0 ? 1 : 2)]) add([sx * ax, 0.76, 0.125], [0.07, 0.05, 0.02], '#f5d76a', rot);
      return rot;
    };
    arm(-1, 0.14);
    const rot = arm(1, -0.6), w = e.weapon;
    if (w) {   // the weapon points along the hand's forward axis
      const hx = ax, hy = 0.82, steel = ['#9a9488', '#c8ccd8', '#8f9ab8'][tierOf(w.ilvl)], glow = trim(w), wood = '#5a3d22';
      const wp = (z, s, c) => add([hx, hy, z], s, c, rot);
      if (w.wtype === 'sword') { wp(0, [0.06, 0.06, 0.22], wood); wp(0.14, [0.28, 0.07, 0.05], glow || '#c9b06a'); wp(0.6, [0.09, 0.03, 0.86], steel); }
      else if (w.wtype === 'axe') { wp(0.3, [0.06, 0.06, 0.95], wood); add([hx, hy + 0.15, 0.66], [0.04, 0.34, 0.3], steel, rot); if (glow) wp(0.48, [0.08, 0.08, 0.05], glow); }
      else if (w.wtype === 'mace') { wp(0.26, [0.07, 0.07, 0.8], wood); wp(0.74, [0.26, 0.26, 0.26], steel); if (glow) wp(0.58, [0.1, 0.1, 0.05], glow); }
      else if (w.wtype === 'wand') { wp(0.2, [0.05, 0.05, 0.5], wood); wp(0.5, [0.12, 0.12, 0.12], glow || '#ffd070'); }
      else { wp(0.3, [0.06, 0.06, 1.9], wood); wp(1.3, [0.2, 0.2, 0.2], glow || '#9fd8ff'); }
    }
    return parts;
  }

  const LIGHT = (() => { const l = Math.hypot(0.45, 0.8, 0.55); return [0.45 / l, 0.8 / l, 0.55 / l]; })();
  function draw(canvas, ch, ang, zoom) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h || !ch) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    const g = canvas.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const cy = Math.cos(ang), sy = Math.sin(ang), ct = Math.cos(0.2), st = Math.sin(0.2), D = 7, sc = Math.min(w / 2.2, h / 2.75) * (zoom || 1);
    // local part rotation (z then x), used for both points and directions
    const local = (v, P) => {
      let x = v[0], y = v[1], z = v[2];
      if (P.rz) { const c = Math.cos(P.rz), s = Math.sin(P.rz), nx = x * c - y * s; y = x * s + y * c; x = nx; }
      if (P.rx) { const c = Math.cos(P.rx), s = Math.sin(P.rx), ny = y * c - z * s; z = y * s + z * c; y = ny; }
      return [x, y, z];
    };
    const view = v => {   // turn around the vertical axis, then tilt toward the camera
      const x = v[0] * cy + v[2] * sy, z = -v[0] * sy + v[2] * cy, y = v[1];
      return [x, y * ct - z * st, y * st + z * ct];
    };
    const screen = v => { const k = D / (D - v[2]); return [w / 2 + v[0] * k * sc, h * 0.5 - v[1] * k * sc]; };
    // pedestal and shadow
    g.fillStyle = 'rgba(0,0,0,0.45)';
    const base = screen(view([0, -1.02, 0]));
    g.beginPath(); g.ellipse(base[0], base[1], sc * 0.62, sc * 0.2, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(224,128,58,0.5)'; g.lineWidth = 1.5;
    g.beginPath(); g.ellipse(base[0], base[1], sc * 0.8, sc * 0.26, 0, 0, Math.PI * 2); g.stroke();
    const faces = [];
    for (const P of build(ch)) {
      const hs = [P.s[0] / 2, P.s[1] / 2, P.s[2] / 2];
      const pt = (dx, dy, dz) => {
        const r = local([P.p[0] + dx - P.o[0], P.p[1] + dy - P.o[1], P.p[2] + dz - P.o[2]], P);
        return view([r[0] + P.o[0], r[1] + P.o[1] - 1.02, r[2] + P.o[2]]);
      };
      for (let a = 0; a < 3; a++) for (const sg of [-1, 1]) {
        const nl = [0, 0, 0]; nl[a] = sg;
        const n = view(local(nl, P));
        if (n[2] <= 0.02) continue;   // facing away
        const b = (a + 1) % 3, c = (a + 2) % 3, quad = [];
        let z = 0;
        for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const d = [0, 0, 0]; d[a] = sg * hs[a]; d[b] = u * hs[b]; d[c] = v * hs[c];
          const q = pt(d[0], d[1], d[2]); z += q[2]; quad.push(screen(q));
        }
        const nw = local(nl, P), nwx = nw[0] * cy + nw[2] * sy, nwz = -nw[0] * sy + nw[2] * cy;
        const lit = Math.max(0, nwx * LIGHT[0] + nw[1] * LIGHT[1] + nwz * LIGHT[2]);
        faces.push({ z: z / 4, quad, col: shade(P.c, 0.5 + 0.62 * lit) });
      }
    }
    faces.sort((a, b) => a.z - b.z);
    g.lineJoin = 'round'; g.lineWidth = 0.8; g.strokeStyle = 'rgba(0,0,0,0.4)';
    for (const f of faces) {
      g.fillStyle = f.col;
      g.beginPath(); g.moveTo(f.quad[0][0], f.quad[0][1]);
      for (let i = 1; i < 4; i++) g.lineTo(f.quad[i][0], f.quad[i][1]);
      g.closePath(); g.fill(); g.stroke();
    }
  }
  return { draw };
})();
