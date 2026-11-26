'use strict';
/* ===== 3D engine: KayKit models from the packed bundle (window.MODELS), skinning and clip playback,
   toon shading with ink outlines, baked static scenery and a sprite batch for glows, zones and telegraphs ===== */
const G3 = (function () {
  let gl, cv, P, U = {}, A = {}, FX, FU = {}, FA = {}, glowTex, ringTex, VP, EYE = [0, 0, 0], W = 1, H = 1;
  const ASSETS = {}, TEXS = {}, ANIMS = {};
  // ---------- math (column-major 4x4) ----------
  const m4 = {
    id: () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]),
    mul(a, b) { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { o[c*4+r] = a[r]*b[c*4] + a[4+r]*b[c*4+1] + a[8+r]*b[c*4+2] + a[12+r]*b[c*4+3]; } return o; },
    trs(t, q, s) { const x = q[0], y = q[1], z = q[2], w = q[3], x2 = x + x, y2 = y + y, z2 = z + z, xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
      return new Float32Array([(1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0, (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0, (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0, t[0], t[1], t[2], 1]); },
    persp(f, a, n, fa) { const t = 1 / Math.tan(f / 2); return new Float32Array([t / a,0,0,0, 0,t,0,0, 0,0,(fa + n) / (n - fa),-1, 0,0,2 * fa * n / (n - fa),0]); },
    look(e, c, u) { const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]], cr = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]], nz = a => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0]/l, a[1]/l, a[2]/l]; }, d = (a, b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
      const z = nz(sub(e, c)), x = nz(cr(u, z)), y = cr(z, x); return new Float32Array([x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0, -d(x,e),-d(y,e),-d(z,e),1]); },
  };
  const qy = a => [0, Math.sin(a / 2), 0, Math.cos(a / 2)];
  const place = (x, y, z, ry = 0, s = 1, sy) => m4.trs([x, y, z], qy(ry), [s, sy == null ? s : sy, s]);
  function slerpInto(o, a, ai, b, bi, t) {
    let d = a[ai]*b[bi] + a[ai+1]*b[bi+1] + a[ai+2]*b[bi+2] + a[ai+3]*b[bi+3], s = 1; if (d < 0) { d = -d; s = -1; }
    let k0, k1; if (d > 0.9995) { k0 = 1 - t; k1 = t; } else { const th = Math.acos(d), sn = Math.sin(th); k0 = Math.sin((1 - t) * th) / sn; k1 = Math.sin(t * th) / sn; }
    let l = 0; for (let i = 0; i < 4; i++) { o[i] = a[ai+i] * k0 + b[bi+i] * k1 * s; l += o[i] * o[i]; } l = Math.sqrt(l) || 1; for (let i = 0; i < 4; i++) o[i] /= l;
  }

  // ---------- shaders ----------
  const VS = `attribute vec3 p;attribute vec3 n;attribute vec2 uv;attribute vec4 jo;attribute vec4 we;
uniform mat4 m,vp;uniform mat4 J[26];uniform float skin,ow;varying vec3 vn,wp;varying vec2 vuv;
void main(){mat4 S=mat4(1.);if(skin>.5)S=J[int(jo.x)]*we.x+J[int(jo.y)]*we.y+J[int(jo.z)]*we.z+J[int(jo.w)]*we.w;
 vec4 w=m*(S*vec4(p,1.));vec3 nn=normalize(mat3(m)*(mat3(S)*n));w.xyz+=nn*ow;wp=w.xyz;vn=nn;vuv=uv;gl_Position=vp*w;}`;
  const FS = `precision mediump float;varying vec3 vn,wp;varying vec2 vuv;uniform sampler2D tex;
uniform vec3 col,cam,fogc,fogo,tint,flash;uniform float mode,alpha,fogd,useTex,emit;
void main(){if(mode>.5){gl_FragColor=vec4(col,alpha);return;}
 vec3 base=useTex>.5?texture2D(tex,vuv).rgb:col;base*=tint;
 vec3 n=normalize(vn);vec3 L=normalize(vec3(-.45,1.,.55));float d=dot(n,L);float band=d>.5?1.:d>.05?.8:.62;
 vec3 V=normalize(cam-wp);float rim=smoothstep(.5,.62,pow(1.-max(dot(n,V),0.),2.5))*.16;
 vec3 c=base*band+rim+base*emit+flash;
 float f=clamp(length(wp.xz-fogo.xz)*fogd,0.,.9);c=mix(c,fogc,f);gl_FragColor=vec4(c,alpha);}`;
  // sprite batch: billboards and flat ground quads, textured with a soft disc or ring
  const FXVS = `attribute vec3 p;attribute vec2 uv;attribute vec4 c;uniform mat4 vp;varying vec2 vuv;varying vec4 vc;void main(){vuv=uv;vc=c;gl_Position=vp*vec4(p,1.);}`;
  const FXFS = `precision mediump float;varying vec2 vuv;varying vec4 vc;uniform sampler2D tex;void main(){vec4 t=texture2D(tex,vuv);gl_FragColor=vec4(vc.rgb*t.rgb,vc.a*t.a);}`;

  function compile(vs, fs) {
    const pr = gl.createProgram();
    [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]].forEach(([t, s]) => { const S = gl.createShader(t); gl.shaderSource(S, s); gl.compileShader(S); if (!gl.getShaderParameter(S, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(S)); gl.attachShader(pr, S); });
    gl.linkProgram(pr); if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr)); return pr;
  }
  function canvasTex(draw) { const c = document.createElement('canvas'); c.width = c.height = 64; draw(c.getContext('2d')); return texFrom(c, true); }
  function init(canvas) {
    cv = canvas;
    gl = canvas.getContext('webgl', { antialias: true, alpha: false }) || canvas.getContext('experimental-webgl');
    if (!gl) return false;
    gl.getExtension('OES_element_index_uint');
    P = compile(VS, FS);
    ['m','vp','J','skin','ow','tex','col','cam','fogc','fogo','fogd','mode','alpha','useTex','emit','tint','flash'].forEach(k => U[k] = gl.getUniformLocation(P, k));
    ['p','n','uv','jo','we'].forEach(k => A[k] = gl.getAttribLocation(P, k));
    FX = compile(FXVS, FXFS); ['vp','tex'].forEach(k => FU[k] = gl.getUniformLocation(FX, k)); ['p','uv','c'].forEach(k => FA[k] = gl.getAttribLocation(FX, k));
    glowTex = canvasTex(g => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.75)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
    ringTex = canvasTex(g => { g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(32, 32, 30, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.arc(32, 32, 29, 0, 7); g.stroke(); });
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    fxBuf = gl.createBuffer(); fxIdx = gl.createBuffer();
    const idx = new Uint16Array(FXMAX * 6); for (let i = 0; i < FXMAX; i++) idx.set([i*4, i*4+1, i*4+2, i*4, i*4+2, i*4+3], i * 6);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, fxIdx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    return true;
  }
  function texFrom(img, clamp) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    const pot = v => (v & (v - 1)) === 0;
    if (!clamp && pot(img.width) && pot(img.height)) { gl.generateMipmap(gl.TEXTURE_2D); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); }
    else { gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); return t;
  }

  // ---------- bundle loading ----------
  function dec(s, T) { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return new T(u.buffer); }
  function glbuf(data, el) { const b = gl.createBuffer(), k = el ? gl.ELEMENT_ARRAY_BUFFER : gl.ARRAY_BUFFER; gl.bindBuffer(k, b); gl.bufferData(k, data, gl.STATIC_DRAW); return b; }
  async function loadAll(progress) {
    const M = window.MODELS; if (!M) throw new Error('model bundle missing');
    const names = Object.keys(M.tex); let done = 0;
    await Promise.all(names.map(n => new Promise((res) => { const im = new Image(); im.onload = () => { TEXS[n] = texFrom(im); res(); }; im.onerror = () => res(); im.src = M.tex[n]; })));
    for (const [k, md] of Object.entries(M.models)) {
      const meshes = md.meshes.map(me => ({ name: me.name, prims: me.prims.map(p => {
        const pos = dec(p.p, Float32Array), idx = p.i32 ? dec(p.i, Uint32Array) : dec(p.i, Uint16Array);
        return { raw: { pos, nor: dec(p.n, Float32Array), uv: p.uv ? dec(p.uv, Float32Array) : null, idx }, p: glbuf(pos), n: glbuf(dec(p.n, Float32Array)), uv: p.uv ? glbuf(dec(p.uv, Float32Array)) : null,
          jo: p.jo ? glbuf(new Float32Array(dec(p.jo, Uint8Array))) : null, we: p.we ? glbuf(dec(p.we, Float32Array)) : null,
          i: glbuf(idx, true), c: idx.length, it: p.i32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, tex: p.tex ? TEXS[p.tex] : null, texName: p.tex || null, col: p.col || [1, 1, 1] }; }) }));
      ASSETS[k] = { nodes: md.nodes, meshes, skins: md.skins.map(s => ({ joints: s.joints, ibm: dec(s.ibm, Float32Array) })), scene: md.scene };
      if (progress) progress(++done / Object.keys(M.models).length);
    }
    for (const [k, a] of Object.entries(M.anims)) ANIMS[k] = { dur: a.dur, ch: a.ch.map(c => ({ node: c.node, path: c.path, t: dec(c.t, Float32Array), v: dec(c.v, Float32Array) })) };
    delete window.MODELS;
  }

  // ---------- model instances ----------
  function instance(key) {
    const a = ASSETS[key]; if (!a) throw new Error('no model ' + key);
    const nodes = a.nodes.map(n => ({ name: n.name, ch: n.children || [], mesh: n.mesh, skin: n.skin, m0: n.matrix ? new Float32Array(n.matrix) : null,
      t: n.translation ? n.translation.slice() : [0, 0, 0], r: n.rotation ? n.rotation.slice() : [0, 0, 0, 1], s: n.scale ? n.scale.slice() : [1, 1, 1], w: null, hide: false }));
    const rest = nodes.map(n => ({ t: n.t.slice(), r: n.r.slice(), s: n.s.slice() })), by = {}; nodes.forEach((n, i) => by[n.name] = i);
    const inst = { key, a, nodes, rest, by, chCache: {} };
    return inst;
  }
  const tmpA = new Float32Array(4), tmpB = new Float32Array(4);
  function sampleInto(inst, clipName, time, loop, weight) {
    const clip = ANIMS[clipName]; if (!clip) return;
    let tt = loop ? (clip.dur > 0 ? time % clip.dur : 0) : Math.min(time, clip.dur);
    for (const c of clip.ch) {
      const ni = inst.by[c.node]; if (ni == null) continue; const n = inst.nodes[ni], k = c.path === 'r' ? 4 : 3, T = c.t;
      let i = 0, f = 0;
      if (T.length > 1) { let lo = 0, hi = T.length - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (T[mid] <= tt) lo = mid; else hi = mid; } i = lo; const span = T[i + 1] - T[i]; f = span > 0 ? Math.min(Math.max((tt - T[i]) / span, 0), 1) : 0; if (tt >= T[T.length - 1]) { i = T.length - 1; f = 0; } }
      const j = Math.min(i + 1, T.length - 1), V = c.v, dst = c.path === 't' ? n.t : c.path === 'r' ? n.r : n.s;
      if (k === 4) { slerpInto(tmpA, V, i * 4, V, j * 4, f); if (weight >= 1) { dst[0] = tmpA[0]; dst[1] = tmpA[1]; dst[2] = tmpA[2]; dst[3] = tmpA[3]; } else { for (let q = 0; q < 4; q++) tmpB[q] = dst[q]; slerpInto(dst, tmpB, 0, tmpA, 0, weight); } }
      else for (let q = 0; q < 3; q++) { const v = V[i * 3 + q] + (V[j * 3 + q] - V[i * 3 + q]) * f; dst[q] = weight >= 1 ? v : dst[q] + (v - dst[q]) * weight; }
    }
  }
  // pose = { clip, t, loop, prev, prevT, blend }  blend 0..1 crossfades from prev to clip
  function pose(inst, ps) {
    inst.nodes.forEach((n, i) => { const r = inst.rest[i]; n.t[0] = r.t[0]; n.t[1] = r.t[1]; n.t[2] = r.t[2]; n.r[0] = r.r[0]; n.r[1] = r.r[1]; n.r[2] = r.r[2]; n.r[3] = r.r[3]; n.s[0] = r.s[0]; n.s[1] = r.s[1]; n.s[2] = r.s[2]; });
    if (!ps) return;
    if (ps.prev && ps.blend < 1) { sampleInto(inst, ps.prev, ps.prevT, true, 1); sampleInto(inst, ps.clip, ps.t, ps.loop !== false, ps.blend); }
    else sampleInto(inst, ps.clip, ps.t, ps.loop !== false, 1);
  }
  function world(inst, root) {
    const walk = (i, pm) => { const n = inst.nodes[i]; const lm = n.m0 || m4.trs(n.t, n.r, n.s); n.w = m4.mul(pm, lm); for (const c of n.ch) walk(c, n.w); };
    for (const i of inst.a.scene) walk(i, root);
  }
  const nodeWorld = (inst, name) => { const i = inst.by[name]; return i == null ? null : inst.nodes[i].w; };
  function hideParts(inst, pred) { inst.nodes.forEach(n => { if (n.mesh != null) n.hide = !!pred(inst.a.meshes[n.mesh].name || n.name); }); }

  // ---------- drawing ----------
  const OUTC = [0.12, 0.08, 0.14];
  function bindPrim(pr) {
    const at = (k, b, sz) => { if (A[k] < 0) return; if (b) { gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.vertexAttribPointer(A[k], sz, gl.FLOAT, false, 0, 0); gl.enableVertexAttribArray(A[k]); } else { gl.disableVertexAttribArray(A[k]); gl.vertexAttrib4f(A[k], 0, 0, 0, 0); } };
    at('p', pr.p, 3); at('n', pr.n, 3); at('uv', pr.uv, 2); at('jo', pr.jo, 4); at('we', pr.we, 4); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, pr.i);
  }
  const JM = new Float32Array(26 * 16);
  function setMat(o = {}) { gl.uniform3fv(U.tint, o.tint || [1, 1, 1]); gl.uniform3fv(U.flash, o.flash || [0, 0, 0]); gl.uniform1f(U.emit, o.emit || 0); gl.uniform1f(U.alpha, o.alpha == null ? 1 : o.alpha); }
  function drawPrim(pr, o, outline) {
    bindPrim(pr);
    if (outline) { gl.enable(gl.CULL_FACE); gl.cullFace(gl.FRONT); gl.uniform1f(U.mode, 1); gl.uniform3fv(U.col, OUTC); gl.uniform1f(U.alpha, o.alpha == null ? 1 : o.alpha); gl.uniform1f(U.ow, o.ow || 0.03); gl.drawElements(gl.TRIANGLES, pr.c, pr.it, 0); }
    gl.disable(gl.CULL_FACE); gl.uniform1f(U.ow, 0); gl.uniform1f(U.mode, 0); gl.uniform1f(U.alpha, o.alpha == null ? 1 : o.alpha);
    if (pr.tex) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, pr.tex); gl.uniform1i(U.tex, 0); gl.uniform1f(U.useTex, 1); } else gl.uniform1f(U.useTex, 0);
    gl.uniform3fv(U.col, o.col || pr.col); gl.drawElements(gl.TRIANGLES, pr.c, pr.it, 0);
  }
  function draw(inst, root, o = {}) {
    gl.useProgram(P); world(inst, root); setMat(o);
    for (const n of inst.nodes) {
      if (n.mesh == null || n.hide) continue; const skinned = n.skin != null;
      if (skinned) { const sk = inst.a.skins[n.skin]; sk.joints.forEach((ji, k) => { if (k < 26) JM.set(m4.mul(inst.nodes[ji].w, sk.ibm.subarray(k * 16, k * 16 + 16)), k * 16); }); gl.uniformMatrix4fv(U.J, false, JM); }
      gl.uniform1f(U.skin, skinned ? 1 : 0); gl.uniformMatrix4fv(U.m, false, skinned ? IDM : n.w);
      for (const pr of inst.a.meshes[n.mesh].prims) drawPrim(pr, o, o.outline !== false);
    }
  }
  const IDM = m4.id();
  // ---------- static batches: many placed models merged into a few buffers ----------
  function batch(list) { // list of {key, m, tint, outline}
    const groups = {};
    for (const it of list) {
      const a = ASSETS[it.key]; if (!a) continue; const tmp = { a, nodes: a.nodes.map(n => ({ ch: n.children || [], mesh: n.mesh, m0: n.matrix ? new Float32Array(n.matrix) : null, t: n.translation || [0,0,0], r: n.rotation || [0,0,0,1], s: n.scale || [1,1,1] })) };
      const walk = (i, pm) => { const n = tmp.nodes[i]; const w = m4.mul(pm, n.m0 || m4.trs(n.t, n.r, n.s)); n.w = w; n.ch.forEach(c => walk(c, w)); };
      a.scene.forEach(i => walk(i, it.m));
      for (const n of tmp.nodes) { if (n.mesh == null) continue;
        for (const pr of a.meshes[n.mesh].prims) {
          const gk = (pr.texName || 'col' + pr.col.join(',')) + '|' + (it.outline ? 1 : 0) + '|' + (it.tint || [1,1,1]).join(',');
          const g = groups[gk] || (groups[gk] = { tex: pr.tex, col: pr.col, outline: it.outline, tint: it.tint, pos: [], nor: [], uv: [], idx: [], base: 0 });
          const R = pr.raw, w = n.w, vc = R.pos.length / 3;
          if (g.base + vc > 65000) { (groups[gk + '#' + g.pos.length] = Object.assign({}, g)); g.pos = []; g.nor = []; g.uv = []; g.idx = []; g.base = 0; }
          for (let v = 0; v < vc; v++) { const x = R.pos[v*3], y = R.pos[v*3+1], z = R.pos[v*3+2], nx = R.nor[v*3], ny = R.nor[v*3+1], nz = R.nor[v*3+2];
            g.pos.push(w[0]*x + w[4]*y + w[8]*z + w[12], w[1]*x + w[5]*y + w[9]*z + w[13], w[2]*x + w[6]*y + w[10]*z + w[14]);
            const a1 = w[0]*nx + w[4]*ny + w[8]*nz, b1 = w[1]*nx + w[5]*ny + w[9]*nz, c1 = w[2]*nx + w[6]*ny + w[10]*nz, l = Math.hypot(a1, b1, c1) || 1; g.nor.push(a1 / l, b1 / l, c1 / l);
            if (R.uv) g.uv.push(R.uv[v*2], R.uv[v*2+1]); else g.uv.push(0, 0); }
          for (let q = 0; q < R.idx.length; q++) g.idx.push(R.idx[q] + g.base); g.base += vc;
        } }
    }
    const out = [];
    for (const g of Object.values(groups)) { if (!g.idx.length) continue;
      out.push({ prim: { p: glbuf(new Float32Array(g.pos)), n: glbuf(new Float32Array(g.nor)), uv: glbuf(new Float32Array(g.uv)), jo: null, we: null, i: glbuf(new Uint16Array(g.idx), true), c: g.idx.length, it: gl.UNSIGNED_SHORT, tex: g.tex, col: g.col }, outline: g.outline, tint: g.tint }); }
    return out;
  }
  function drawBatch(b, o = {}) { gl.useProgram(P); gl.uniform1f(U.skin, 0); gl.uniformMatrix4fv(U.m, false, IDM);
    for (const s of b) { setMat({ tint: s.tint || o.tint, emit: o.emit }); drawPrim(s.prim, o, s.outline); } }
  function freeBatch(b) { if (!b) return; for (const s of b) { gl.deleteBuffer(s.prim.p); gl.deleteBuffer(s.prim.n); gl.deleteBuffer(s.prim.uv); gl.deleteBuffer(s.prim.i); } }

  // ---------- sprite batch ----------
  const FXMAX = 2000; let fxBuf, fxIdx; const fxData = new Float32Array(FXMAX * 4 * 9); let fxN = 0, fxList = [];
  let camRight = [1, 0, 0], camUp = [0, 1, 0];
  // kind: 'glow' (billboard, additive) | 'ground' (flat on floor, alpha) | 'ring' (flat ring, alpha) | 'gglow' (flat additive)
  function sprite(kind, x, y, z, sx, sz, col, a, rot) { fxList.push([kind, x, y, z, sx, sz == null ? sx : sz, col, a == null ? 1 : a, rot || 0]); }
  function flushFx() {
    if (!fxList.length) return;
    gl.useProgram(FX); gl.uniformMatrix4fv(FU.vp, false, VP); gl.depthMask(false); gl.disable(gl.CULL_FACE);
    const groups = { ground: [], ring: [], gglow: [], glow: [] }; for (const s of fxList) (groups[s[0]] || groups.glow).push(s);
    for (const kind of ['ground', 'ring', 'gglow', 'glow']) {
      const L = groups[kind]; if (!L.length) continue;
      if (kind === 'glow' || kind === 'gglow') gl.blendFunc(gl.SRC_ALPHA, gl.ONE); else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, kind === 'ring' ? ringTex : glowTex); gl.uniform1i(FU.tex, 0);
      for (let start = 0; start < L.length; start += FXMAX) {
        const part = L.slice(start, start + FXMAX); let o = 0;
        for (const s of part) {
          const [, x, y, z, sx, sz, c, a, rot] = s; let ax, ay, az, bx, by, bz;
          if (kind === 'glow') { ax = camRight[0] * sx; ay = camRight[1] * sx; az = camRight[2] * sx; bx = camUp[0] * sx; by = camUp[1] * sx; bz = camUp[2] * sx; }
          else { const cr = Math.cos(rot), sr = Math.sin(rot); ax = cr * sx; ay = 0; az = sr * sx; bx = -sr * sz; by = 0; bz = cr * sz; }
          const corners = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]];
          for (const [u, v, tu, tv] of corners) { fxData[o++] = x + ax * u + bx * v; fxData[o++] = y + ay * u + by * v; fxData[o++] = z + az * u + bz * v; fxData[o++] = tu; fxData[o++] = tv; fxData[o++] = c[0]; fxData[o++] = c[1]; fxData[o++] = c[2]; fxData[o++] = a; }
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, fxBuf); gl.bufferData(gl.ARRAY_BUFFER, fxData.subarray(0, o), gl.DYNAMIC_DRAW);
        const st = 36; gl.vertexAttribPointer(FA.p, 3, gl.FLOAT, false, st, 0); gl.enableVertexAttribArray(FA.p); gl.vertexAttribPointer(FA.uv, 2, gl.FLOAT, false, st, 12); gl.enableVertexAttribArray(FA.uv); gl.vertexAttribPointer(FA.c, 4, gl.FLOAT, false, st, 20); gl.enableVertexAttribArray(FA.c);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, fxIdx); gl.drawElements(gl.TRIANGLES, part.length * 6, gl.UNSIGNED_SHORT, 0);
        gl.disableVertexAttribArray(FA.c);
      }
    }
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(true); fxList = [];
    gl.useProgram(P);
  }

  // ---------- frame ----------
  function resize(w, h, dpr) { W = w; H = h; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  function begin(sky, eye, ctr, fov, fogCol, fogOrigin, fogD) {
    gl.viewport(0, 0, cv.width, cv.height); gl.clearColor(sky[0], sky[1], sky[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(P); EYE = eye;
    const view = m4.look(eye, ctr, [0, 1, 0]); VP = m4.mul(m4.persp(fov, cv.width / cv.height, 1, 220), view);
    camRight = [view[0], view[4], view[8]]; camUp = [view[1], view[5], view[9]];
    gl.uniformMatrix4fv(U.vp, false, VP); gl.uniform3fv(U.cam, eye); gl.uniform3fv(U.fogc, fogCol); gl.uniform3fv(U.fogo, fogOrigin); gl.uniform1f(U.fogd, fogD);
  }
  // world -> css pixel coordinates of the canvas
  function project(x, y, z) { const v = VP; const cx = v[0]*x + v[4]*y + v[8]*z + v[12], cy = v[1]*x + v[5]*y + v[9]*z + v[13], cw = v[3]*x + v[7]*y + v[11]*z + v[15];
    return [(cx / cw * 0.5 + 0.5) * W, (1 - (cy / cw * 0.5 + 0.5)) * H]; }
  // css pixel -> point on the floor plane y=0
  function unproject(px, py) { const inv = invert(VP); const nx = px / W * 2 - 1, ny = 1 - py / H * 2;
    const a = mulv(inv, [nx, ny, -1, 1]), b = mulv(inv, [nx, ny, 1, 1]); const p0 = [a[0]/a[3], a[1]/a[3], a[2]/a[3]], p1 = [b[0]/b[3], b[1]/b[3], b[2]/b[3]];
    const t = p0[1] / (p0[1] - p1[1]); return [p0[0] + (p1[0] - p0[0]) * t, p0[2] + (p1[2] - p0[2]) * t]; }
  const mulv = (m, v) => [0, 1, 2, 3].map(r => m[r]*v[0] + m[4+r]*v[1] + m[8+r]*v[2] + m[12+r]*v[3]);
  function invert(m) { const inv = new Float32Array(16);
    inv[0]=m[5]*m[10]*m[15]-m[5]*m[11]*m[14]-m[9]*m[6]*m[15]+m[9]*m[7]*m[14]+m[13]*m[6]*m[11]-m[13]*m[7]*m[10];inv[4]=-m[4]*m[10]*m[15]+m[4]*m[11]*m[14]+m[8]*m[6]*m[15]-m[8]*m[7]*m[14]-m[12]*m[6]*m[11]+m[12]*m[7]*m[10];inv[8]=m[4]*m[9]*m[15]-m[4]*m[11]*m[13]-m[8]*m[5]*m[15]+m[8]*m[7]*m[13]+m[12]*m[5]*m[11]-m[12]*m[7]*m[9];inv[12]=-m[4]*m[9]*m[14]+m[4]*m[10]*m[13]+m[8]*m[5]*m[14]-m[8]*m[6]*m[13]-m[12]*m[5]*m[10]+m[12]*m[6]*m[9];
    inv[1]=-m[1]*m[10]*m[15]+m[1]*m[11]*m[14]+m[9]*m[2]*m[15]-m[9]*m[3]*m[14]-m[13]*m[2]*m[11]+m[13]*m[3]*m[10];inv[5]=m[0]*m[10]*m[15]-m[0]*m[11]*m[14]-m[8]*m[2]*m[15]+m[8]*m[3]*m[14]+m[12]*m[2]*m[11]-m[12]*m[3]*m[10];inv[9]=-m[0]*m[9]*m[15]+m[0]*m[11]*m[13]+m[8]*m[1]*m[15]-m[8]*m[3]*m[13]-m[12]*m[1]*m[11]+m[12]*m[3]*m[9];inv[13]=m[0]*m[9]*m[14]-m[0]*m[10]*m[13]-m[8]*m[1]*m[14]+m[8]*m[2]*m[13]+m[12]*m[1]*m[10]-m[12]*m[2]*m[9];
    inv[2]=m[1]*m[6]*m[15]-m[1]*m[7]*m[14]-m[5]*m[2]*m[15]+m[5]*m[3]*m[14]+m[13]*m[2]*m[7]-m[13]*m[3]*m[6];inv[6]=-m[0]*m[6]*m[15]+m[0]*m[7]*m[14]+m[4]*m[2]*m[15]-m[4]*m[3]*m[14]-m[12]*m[2]*m[7]+m[12]*m[3]*m[6];inv[10]=m[0]*m[5]*m[15]-m[0]*m[7]*m[13]-m[4]*m[1]*m[15]+m[4]*m[3]*m[13]+m[12]*m[1]*m[7]-m[12]*m[3]*m[5];inv[14]=-m[0]*m[5]*m[14]+m[0]*m[6]*m[13]+m[4]*m[1]*m[14]-m[4]*m[2]*m[13]-m[12]*m[1]*m[6]+m[12]*m[2]*m[5];
    inv[3]=-m[1]*m[6]*m[11]+m[1]*m[7]*m[10]+m[5]*m[2]*m[11]-m[5]*m[3]*m[10]-m[9]*m[2]*m[7]+m[9]*m[3]*m[6];inv[7]=m[0]*m[6]*m[11]-m[0]*m[7]*m[10]-m[4]*m[2]*m[11]+m[4]*m[3]*m[10]+m[8]*m[2]*m[7]-m[8]*m[3]*m[6];inv[11]=-m[0]*m[5]*m[11]+m[0]*m[7]*m[9]+m[4]*m[1]*m[11]-m[4]*m[3]*m[9]-m[8]*m[1]*m[7]+m[8]*m[3]*m[5];inv[15]=m[0]*m[5]*m[10]-m[0]*m[6]*m[9]-m[4]*m[1]*m[10]+m[4]*m[2]*m[9]+m[8]*m[1]*m[6]-m[8]*m[2]*m[5];
    let det = m[0]*inv[0]+m[1]*inv[4]+m[2]*inv[8]+m[3]*inv[12]; det = det ? 1 / det : 0; for (let i = 0; i < 16; i++) inv[i] *= det; return inv; }

  return { init, loadAll, instance, pose, world, draw, nodeWorld, hideParts, batch, drawBatch, freeBatch, sprite, flushFx, begin, resize, project, unproject, place, m4, qy,
    clip: n => ANIMS[n], has: k => !!ASSETS[k], get gl() { return gl; } };
})();
