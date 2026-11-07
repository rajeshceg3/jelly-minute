/* jelly - a soft minute.
   A verlet soft-body blob to poke, stretch and fling.
   Stateless by design: nothing is saved, nothing to win. */
(function () {
  'use strict';

  var canvas = document.getElementById('scene');
  var ctx = canvas.getContext('2d');
  var hintEl = document.getElementById('hint');
  var soundBtn = document.getElementById('soundToggle');

  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var W = 0, H = 0, DPR = 1;
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    floorY = H - Math.max(84, H * 0.12);
  }
  var floorY = 0;
  window.addEventListener('resize', resize);
  resize();

  // ---------- soft body ----------
  var N = 26;
  var R0 = Math.max(46, Math.min(74, Math.min(W, H) * 0.16));
  var pts = [];
  var rest = [];
  var cx0 = W / 2, cy0 = floorY - R0 - 8;
  for (var i = 0; i < N; i++) {
    var a = (i / N) * Math.PI * 2 - Math.PI / 2;
    var rx = Math.cos(a) * R0, ry = Math.sin(a) * R0;
    rest.push({ x: rx, y: ry });
    pts.push({ x: cx0 + rx, y: cy0 + ry, px: cx0 + rx, py: cy0 + ry });
  }
  var restLen = 2 * R0 * Math.sin(Math.PI / N);

  var GRAV = 0.22, DAMP = 0.985, SHAPE_K = 0.085, ITER = 3;

  function step() {
    var i, p;
    for (i = 0; i < N; i++) {
      p = pts[i];
      var vx = (p.x - p.px) * DAMP, vy = (p.y - p.py) * DAMP;
      p.px = p.x; p.py = p.y;
      p.x += vx; p.y += vy + GRAV;
    }
    for (var it = 0; it < ITER; it++) {
      // shape matching toward rotated rest pose
      var mx = 0, my = 0;
      for (i = 0; i < N; i++) { mx += pts[i].x; my += pts[i].y; }
      mx /= N; my /= N;
      var sxx = 0, sxy = 0, syx = 0, syy = 0;
      for (i = 0; i < N; i++) {
        var qx = pts[i].x - mx, qy = pts[i].y - my;
        sxx += qx * rest[i].x; sxy += qx * rest[i].y;
        syx += qy * rest[i].x; syy += qy * rest[i].y;
      }
      var ang = Math.atan2(syx - sxy, sxx + syy);
      var ca = Math.cos(ang), sa = Math.sin(ang);
      for (i = 0; i < N; i++) {
        var tx = mx + rest[i].x * ca - rest[i].y * sa;
        var ty = my + rest[i].x * sa + rest[i].y * ca;
        pts[i].x += (tx - pts[i].x) * SHAPE_K;
        pts[i].y += (ty - pts[i].y) * SHAPE_K;
      }
      // ring springs
      for (i = 0; i < N; i++) {
        var a2 = pts[i], b2 = pts[(i + 1) % N];
        var dx = b2.x - a2.x, dy = b2.y - a2.y;
        var d = Math.sqrt(dx * dx + dy * dy) || 0.0001;
        var diff = (d - restLen) / d * 0.5 * 0.42;
        a2.x += dx * diff; a2.y += dy * diff;
        b2.x -= dx * diff; b2.y -= dy * diff;
      }
      // pointer grab
      if (grab.idx >= 0 && grab.active) {
        var g = pts[grab.idx];
        g.x += (grab.x - g.x) * 0.55;
        g.y += (grab.y - g.y) * 0.55;
      }
      // collisions
      for (i = 0; i < N; i++) {
        p = pts[i];
        if (p.y > floorY) {
          var impact = p.y - p.py;
          if (impact > 3.2) onImpact(impact, p.x);
          p.y = floorY;
          p.x += (p.px - p.x) * 0.24; // friction
        }
        if (p.x < 6) p.x = 6;
        if (p.x > W - 6) p.x = W - 6;
        if (p.y < 6) p.y = 6;
      }
    }
  }

  // ---------- pointer ----------
  var grab = { idx: -1, active: false, x: 0, y: 0 };
  var interacted = false;
  function ptr(e) {
    var t = e.touches && e.touches.length ? e.touches[0] : e;
    return { x: t.clientX, y: t.clientY };
  }
  function down(e) {
    var m = ptr(e);
    var best = -1, bd = 1e9;
    for (var i = 0; i < N; i++) {
      var dx = pts[i].x - m.x, dy = pts[i].y - m.y;
      var d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    if (bd < (R0 * 2.6) * (R0 * 2.6)) {
      grab.idx = best; grab.active = true; grab.x = m.x; grab.y = m.y;
      if (!interacted) { interacted = true; hideHint(); }
    }
  }
  function move(e) {
    if (!grab.active) return;
    var m = ptr(e);
    grab.x = m.x; grab.y = m.y;
    if (e.cancelable) e.preventDefault();
  }
  function up() { grab.active = false; grab.idx = -1; }
  canvas.addEventListener('mousedown', down);
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
  canvas.addEventListener('touchstart', down, { passive: true });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', up);
  canvas.addEventListener('touchcancel', up);

  // pre-settle so the first painted frame is already seated (also covers rAF-starved environments)
  for (var settle = 0; settle < 90; settle++) step();

  // ---------- hints ----------
  function showHint(text, holdMs) {
    hintEl.textContent = text;
    hintEl.classList.add('show');
    clearTimeout(showHint.t);
    if (holdMs) showHint.t = setTimeout(hideHint, holdMs);
  }
  function hideHint() { hintEl.classList.remove('show'); }
  setTimeout(function () { if (!interacted) showHint('poke it · stretch it · fling it'); }, 700);

  // ---------- audio ----------
  var AC = null, master = null, soundOn = false;
  // one graph builder feeds both the live context and the offline render probe
  function buildGraph(ctx2) {
    var g2 = {};
    g2.master = ctx2.createGain(); g2.master.gain.value = 0;
    var comp = ctx2.createDynamicsCompressor();
    comp.threshold.value = -9; comp.knee.value = 6; comp.ratio.value = 12;
    comp.attack.value = 0.003; comp.release.value = 0.25;
    g2.master.connect(comp); comp.connect(ctx2.destination);
    // quiet warm pad, always running, inside the master
    var pad = ctx2.createGain(); pad.gain.value = 0.016; pad.connect(g2.master);
    [[130.81, 1], [196.0, 0.55], [261.63, 0.3]].forEach(function (f) {
      var o = ctx2.createOscillator(); o.type = 'sine'; o.frequency.value = f[0];
      var og = ctx2.createGain(); og.gain.value = f[1] * 0.5;
      o.connect(og); og.connect(pad); o.start();
    });
    return g2;
  }
  function bloopAt(ctx2, dest, t, strength) {
    var v = Math.min(0.42, 0.05 + strength * 0.3);
    var o = ctx2.createOscillator(); o.type = 'sine';
    var f0 = 200 + Math.random() * 60;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(58 + Math.random() * 14, t + 0.16);
    var g = ctx2.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.26);
    // soft splat
    var nb = ctx2.createBuffer(1, 600, ctx2.sampleRate);
    var dd = nb.getChannelData(0);
    for (var i = 0; i < dd.length; i++) dd[i] = (Math.random() * 2 - 1) * (1 - i / dd.length);
    var ns = ctx2.createBufferSource(); ns.buffer = nb;
    var bp = ctx2.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = 900;
    var ng = ctx2.createGain(); ng.gain.value = v * 0.35;
    ns.connect(bp); bp.connect(ng); ng.connect(dest); ns.start(t);
  }
  function initAudio() {
    if (AC) return;
    var Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    AC = new Ctor();
    master = buildGraph(AC).master;
  }
  var lastSfx = 0;
  function onImpact(impact, x) {
    if (!AC || !soundOn) return;
    var t = AC.currentTime;
    if (t - lastSfx < 0.09) return;
    lastSfx = t;
    bloopAt(AC, master, t, Math.min(1, impact / 14));
  }
  // offline render of the real mix, for verification: 16-bit mono WAV base64
  window.__jellyRender = function (kind, seconds) {
    var sr = 22050;
    var o = new OfflineAudioContext(1, Math.ceil(seconds * sr), sr);
    var g2 = buildGraph(o);
    g2.master.gain.value = 0.8;
    if (kind === 'poke') {
      bloopAt(o, g2.master, 0.15, 0.85);
      bloopAt(o, g2.master, 0.9, 0.4);
    } else {
      // worst case: many strong overlapping impacts
      for (var k = 0; k < 6; k++) bloopAt(o, g2.master, 0.1 + k * 0.1, 1.0);
    }
    return o.startRendering().then(function (buf) {
      var pcm = buf.getChannelData(0), n = pcm.length;
      var out = new DataView(new ArrayBuffer(44 + n * 2));
      function ws(off, str) { for (var i = 0; i < str.length; i++) out.setUint8(off + i, str.charCodeAt(i)); }
      ws(0, 'RIFF'); out.setUint32(4, 36 + n * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ');
      out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
      out.setUint32(24, sr, true); out.setUint32(28, sr * 2, true); out.setUint16(32, 2, true);
      out.setUint16(34, 16, true); ws(36, 'data'); out.setUint32(40, n * 2, true);
      for (var i = 0; i < n; i++) {
        var v2 = Math.max(-1, Math.min(1, pcm[i]));
        out.setInt16(44 + i * 2, v2 < 0 ? v2 * 32768 : v2 * 32767, true);
      }
      var bytes = new Uint8Array(out.buffer), bin = '';
      for (var j = 0; j < bytes.length; j += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(j, j + 8192));
      return btoa(bin);
    });
  };
  function setSound(on) {
    soundOn = on;
    soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    soundBtn.setAttribute('aria-label', on ? 'Turn sound off' : 'Turn sound on');
    soundBtn.classList.remove('attn');
    if (on) {
      initAudio();
      if (AC && AC.state === 'suspended') AC.resume();
      if (master) master.gain.setTargetAtTime(0.8, AC.currentTime, 0.4);
    } else if (master && AC) {
      master.gain.setTargetAtTime(0, AC.currentTime, 0.15);
    }
  }
  soundBtn.addEventListener('click', function () { setSound(!soundOn); });
  soundBtn.classList.add('attn');
  soundBtn.setAttribute('aria-pressed', 'false');

  // ---------- face ----------
  var blinkT = 2.5, blink = 0;

  // ---------- render ----------
  var motes = [];
  for (var mi = 0; mi < 14; mi++) {
    motes.push({ x: Math.random(), y: Math.random(), r: 1 + Math.random() * 2.4, s: 0.00016 + Math.random() * 0.0004, o: 0.05 + Math.random() * 0.08 });
  }
  var breath = 0;

  function draw(ts) {
    // sky
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#fdeee4');
    g.addColorStop(0.55, '#fdf3ec');
    g.addColorStop(1, '#fce4d8');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // sun glow
    var sg = ctx.createRadialGradient(W * 0.78, H * 0.16, 10, W * 0.78, H * 0.16, Math.max(W, H) * 0.5);
    sg.addColorStop(0, 'rgba(255, 214, 170, 0.5)');
    sg.addColorStop(1, 'rgba(255, 214, 170, 0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, W, H);
    // dust motes
    if (!reducedMotion) {
      ctx.fillStyle = 'rgba(190, 130, 110, 1)';
      for (var i = 0; i < motes.length; i++) {
        var m = motes[i];
        m.y -= m.s; if (m.y < -0.05) m.y = 1.05;
        ctx.globalAlpha = m.o;
        ctx.beginPath(); ctx.arc(m.x * W, m.y * H, m.r, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // floor
    ctx.fillStyle = '#f6d9c8';
    ctx.fillRect(0, floorY, W, H - floorY);
    ctx.fillStyle = 'rgba(190, 120, 100, 0.18)';
    ctx.fillRect(0, floorY, W, 2);

    // blob measurements
    var mx = 0, my = 0;
    for (i = 0; i < N; i++) { mx += pts[i].x; my += pts[i].y; }
    mx /= N; my /= N;
    var minY = 1e9, maxY = -1e9, minX = 1e9, maxX = -1e9;
    for (i = 0; i < N; i++) {
      if (pts[i].y < minY) minY = pts[i].y;
      if (pts[i].y > maxY) maxY = pts[i].y;
      if (pts[i].x < minX) minX = pts[i].x;
      if (pts[i].x > maxX) maxX = pts[i].x;
    }
    var squashX = (maxX - minX) / (2 * R0), squashY = (maxY - minY) / (2 * R0);
    if (!reducedMotion) breath = Math.sin(ts / 900) * 0.012;

    // shadow
    var air = Math.max(0, Math.min(1, (floorY - maxY) / (R0 * 3)));
    ctx.fillStyle = 'rgba(150, 90, 80, ' + (0.22 * (1 - air * 0.75)) + ')';
    ctx.beginPath();
    ctx.ellipse(mx, floorY + 10, R0 * squashX * (1 - air * 0.25), R0 * 0.16 * (1 - air * 0.4), 0, 0, 7);
    ctx.fill();

    // blob body: smooth closed curve through points
    ctx.beginPath();
    var p0 = pts[0], pn = pts[N - 1];
    ctx.moveTo((p0.x + pn.x) / 2, (p0.y + pn.y) / 2);
    for (i = 0; i < N; i++) {
      var p = pts[i], q = pts[(i + 1) % N];
      ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
    }
    ctx.closePath();
    var bg = ctx.createRadialGradient(mx - R0 * 0.35, my - R0 * 0.45, R0 * 0.2, mx, my, R0 * 1.5);
    bg.addColorStop(0, '#ff9db4');
    bg.addColorStop(0.55, '#f2728f');
    bg.addColorStop(1, '#d94f72');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(160, 50, 75, 0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // gloss
    ctx.save();
    ctx.clip();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath();
    ctx.ellipse(mx - R0 * 0.34, my - R0 * 0.48, R0 * 0.2 * squashX, R0 * 0.1 * squashY, -0.5, 0, 7);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.beginPath();
    ctx.ellipse(mx + R0 * 0.2, my - R0 * 0.2, R0 * 0.45, R0 * 0.3, -0.3, 0, 7);
    ctx.fill();
    ctx.restore();

    // face (stable frame: center + slight tilt from shape rotation)
    var tilt = Math.max(-0.35, Math.min(0.35, (pts[0].y - pts[N / 2].y) / (2 * R0)));
    var fy = squashY + breath, fx = squashX;
    var eyeDX = R0 * 0.34 * Math.max(0.6, fx), eyeDY = R0 * 0.12 * fy;
    var ex1 = mx - eyeDX + tilt * 10, ex2 = mx + eyeDX + tilt * 10;
    var ey = my - R0 * 0.1 * fy;
    // blink
    if (!reducedMotion) {
      blinkT -= 1 / 60;
      if (blinkT < 0) { blink = 1; blinkT = 2 + Math.random() * 3.4; }
      if (blink > 0) blink = Math.max(0, blink - 0.12);
    }
    var eyeH = Math.max(0.12, 1 - blink) * R0 * 0.09 * fy;
    ctx.fillStyle = '#5c2e3d';
    ctx.beginPath(); ctx.ellipse(ex1, ey, R0 * 0.075 * fx, eyeH, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(ex2, ey, R0 * 0.075 * fx, eyeH, 0, 0, 7); ctx.fill();
    if (eyeH > R0 * 0.03) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath(); ctx.arc(ex1 + R0 * 0.02, ey - eyeH * 0.3, R0 * 0.02, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(ex2 + R0 * 0.02, ey - eyeH * 0.3, R0 * 0.02, 0, 7); ctx.fill();
    }
    // smile
    ctx.strokeStyle = '#5c2e3d';
    ctx.lineWidth = R0 * 0.045;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(mx + tilt * 12, my + eyeDY + R0 * 0.06 * fy, R0 * 0.22 * Math.max(0.5, fx), 0.25, Math.PI - 0.25);
    ctx.stroke();
    // blush
    ctx.fillStyle = 'rgba(220, 70, 95, 0.25)';
    ctx.beginPath(); ctx.ellipse(ex1 - R0 * 0.12, ey + R0 * 0.22 * fy, R0 * 0.1 * fx, R0 * 0.06 * fy, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(ex2 + R0 * 0.12, ey + R0 * 0.22 * fy, R0 * 0.1 * fx, R0 * 0.06 * fy, 0, 0, 7); ctx.fill();
  }

  // verification probe: blob bounds + interaction state, no PII
  window.__jellyProbe = function () {
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, mx = 0, my = 0;
    for (var i = 0; i < N; i++) {
      mx += pts[i].x; my += pts[i].y;
      if (pts[i].x < minX) minX = pts[i].x;
      if (pts[i].x > maxX) maxX = pts[i].x;
      if (pts[i].y < minY) minY = pts[i].y;
      if (pts[i].y > maxY) maxY = pts[i].y;
    }
    return { cx: mx / N, cy: my / N, w: maxX - minX, h: maxY - minY, grabbed: grab.active, interacted: interacted };
  };

  function frame(ts) {
    step();
    draw(ts || 0);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
