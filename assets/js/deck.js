/* Neuroimaging relaunch deck: scene engine (adapted from the GenoBit Biomarkers deck) + per-scene animations.
   Data comes from assets/generated/stats.js (window.OASIS), written by OASIS_EDA.ipynb. */
(function () {
  'use strict';
  var D = window.OASIS || {};
  var NS = 'http://www.w3.org/2000/svg';
  var G = 'assets/generated/';
  var SH = {}, TICK = {};
  var CLS = { nd: '#00706F', vmd: '#7D7ECA', md: '#3D358B', mod: '#1F1F1F' };
  var CLS_ES = { nd: 'Non Demented', vmd: 'Very mild Dementia', md: 'Mild Dementia', mod: 'Moderate Dementia' };
  var CDR = { nd: '0', vmd: '0.5', md: '1', mod: '2' };

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return [].slice.call((r || document).querySelectorAll(s)); }
  function fmt(n, d) { return Number(n).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function set(id, txt) { var e = document.getElementById(id); if (e) e.textContent = txt; }
  function svg(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function pingpong(t, fps, n) { var p = Math.floor(t * fps) % (2 * n - 2 || 1); return p < n ? p : 2 * n - 2 - p; }

  /* ---------------- sprites: one tall JPG, one frame visible at a time ---------------- */
  function spriteMeta(key) {
    var k = key.split('.');
    if (k[0] === 'plane') return D.plane_sprites && D.plane_sprites[k[1]];
    if (k[0] === 'raw') return D.raw_sweep;
    if (k[0] === 'scan') return D.scan_sprites && D.scan_sprites[k[1]];
    if (k[0] === 'entropy') return D.entropy && D.entropy.sprite;
  }
  function initSprite(el, meta) {
    if (!meta) return;
    el._m = meta;
    el.style.backgroundImage = 'url(' + G + meta.file + ')';
    el.style.backgroundSize = '100% ' + meta.frames * 100 + '%';
    setFrame(el, 0);
  }
  function setFrame(el, i) {
    if (!el._m) return;
    var n = el._m.frames;
    i = Math.max(0, Math.min(n - 1, Math.round(i)));
    if (el._f === i) return;
    el._f = i;
    el.style.backgroundPosition = '0 ' + (n > 1 ? i / (n - 1) * 100 : 0) + '%';
  }
  $$('[data-sprite]').forEach(function (el) { initSprite(el, spriteMeta(el.dataset.sprite)); });

  /* ---------------- 01 portada: the brain's lines gather into a DNA helix that becomes the logo ---------------- */
  (function () {
    var sc = $('#cover'), cv = $('#dnaCv'), g = cv.getContext('2d'), pts = null, groups = [], t0 = 0, running = false;
    /* final helix = the logo helix in stage coordinates (logoG: translate(960 440) scale(1.7) translate(-350 -225)) */
    var LOGO = { x0: 960 + 1.7 * (70 - 350), x1: 960 + 1.7 * (630 - 350), cy: 440 + 1.7 * (345 - 225), amp: 1.7 * 62, period: 1.7 * 280 };
    var LOOSE = { x0: 150, x1: 1770, cy: 540, amp: 300, period: 820 };
    var ez = function (u) { return u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; };
    var mix = function (a, b, u) { return a + (b - a) * u; };
    function hexRgb(h) { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }

    function sample() {
      var paths = $$('#brainG path'), lens = paths.map(function (p) { return p.getTotalLength(); });
      var total = lens.reduce(function (a, b) { return a + b; }, 0), stepL = total / 1500, out = [];
      paths.forEach(function (p, k) {
        var col = hexRgb(p.getAttribute('stroke') || '#2FD0C6');
        var gr = { col: col, pts: [] };
        for (var d = 0; d < lens[k]; d += stepL) { var q = p.getPointAtLength(d), o = { bx: q.x, by: q.y, col: col, gid: k % 7 }; out.push(o); gr.pts.push(o); }
        if (gr.pts.length > 1) groups.push(gr);
      });
      out.sort(function (a, b) { return a.bx - b.bx; });
      /* roles: strand A, strand B, rungs; each strand point keeps its left-to-right order */
      var seed = 3; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
      var A = [], B = [], R = [];
      out.forEach(function (o) { var r = rnd(); (r < .42 ? A : r < .84 ? B : R).push(o); });
      A.forEach(function (o, i) { o.role = 0; o.u = i / (A.length - 1); });
      B.forEach(function (o, i) { o.role = 1; o.u = i / (B.length - 1); });
      var rungX = []; for (var x = 84; x <= 616; x += 28) { var s = Math.sin((x - 70) / 280 * 2 * Math.PI); if (Math.abs(s) >= .4) rungX.push(x); }
      R.forEach(function (o, i) { o.role = 2; o.rung = (x = rungX[i % rungX.length], (x - 70) / 560); o.v = rnd() * 2 - 1; });
      out.forEach(function (o) { o.jx = (rnd() - .5) * 2; o.jy = (rnd() - .5) * 2; o.delay = rnd() * .5; });
      return out;
    }
    /* the brain drawn as lines (same points, in path order), drifting like a current */
    var LINE_T = 2.2;
    function wave(o, e) {
      var a = 34 * Math.min(1, e / 1.6);
      return [o.bx + a * Math.sin(o.by * .011 + e * 2.6 + o.gid), o.by + a * Math.cos(o.bx * .009 + e * 2.1 + o.gid * .7)];
    }
    function drawLines(e, alpha) {
      g.lineWidth = 4; g.lineCap = 'round'; g.lineJoin = 'round';
      groups.forEach(function (gr) {
        g.strokeStyle = 'rgba(' + gr.col.join(',') + ',' + alpha.toFixed(2) + ')';
        g.beginPath();
        gr.pts.forEach(function (o, i) { var p = wave(o, e); if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); });
        g.stroke();
      });
    }
    function target(o, H, ph, noise) {
      var u = o.role === 2 ? o.rung : o.u, x = mix(H.x0, H.x1, u), th = (x - H.x0) / H.period * 2 * Math.PI + ph, s = Math.sin(th), y;
      if (o.role === 0) y = H.cy + H.amp * s;
      else if (o.role === 1) y = H.cy - H.amp * s;
      else y = H.cy + H.amp * s * .82 * o.v;
      return [x + o.jx * noise, y + o.jy * noise];
    }
    var TEAL = [0, 112, 111], SKY = [169, 205, 229];
    function frame(e) {
      /* 0-2.4 s gather into a loose wide helix; 2.4-4.6 s it twists and tightens; 4.6-6.2 s it settles into the logo */
      g.clearRect(0, 0, 1920, 1080);
      var gather = Math.min(1, e / 2.4), settle = ez(Math.max(0, Math.min(1, (e - 4.6) / 1.6)));
      var H = {}; for (var k in LOGO) H[k] = mix(LOOSE[k], LOGO[k], settle);
      var spin = e < 4.6 ? e * 2.2 : mix(4.6 * 2.2, Math.ceil(4.6 * 2.2 / (2 * Math.PI)) * 2 * Math.PI, settle);
      var noise = 60 * (1 - ez(Math.max(0, Math.min(1, (e - 1.2) / 3.4))));
      var fade = 1 - Math.max(0, Math.min(1, (e - 6.0) / .7));
      if (fade <= 0) return false;
      for (var i = 0; i < pts.length; i++) {
        var o = pts[i], u = ez(Math.max(0, Math.min(1, (gather - o.delay * .6) / (1 - o.delay * .6))));
        var tg = target(o, H, spin, noise), x = mix(o.sx, tg[0], u), y = mix(o.sy, tg[1], u);
        var c = o.role === 1 ? SKY : TEAL, r = Math.round(mix(o.col[0], c[0], u)), gg = Math.round(mix(o.col[1], c[1], u)), b = Math.round(mix(o.col[2], c[2], u));
        g.fillStyle = 'rgba(' + r + ',' + gg + ',' + b + ',' + (fade * (o.role === 2 ? .8 : 1)).toFixed(2) + ')';
        var rad = mix(2.2, o.role === 2 ? 3.2 : 4.6, settle);
        g.beginPath(); g.arc(x, y, rad, 0, 6.2832); g.fill();
      }
      return true;
    }
    SH.cover = function (s, step) {
      if (step === 1 && !running) {
        pts = pts || sample(); t0 = 0; running = true;
      } else if (step === 0) {
        running = false; g.clearRect(0, 0, 1920, 1080); sc.classList.remove('dna-done', 'pins', 'word');
      }
    };
    SH.cover.reset = function () { running = false; g.clearRect(0, 0, 1920, 1080); sc.classList.remove('dna-done', 'pins', 'word'); };
    TICK.cover = function (t) {
      if (!running) return;
      if (!t0) t0 = t;
      var e = t - t0, alive = true;
      if (e < LINE_T) {
        g.clearRect(0, 0, 1920, 1080);
        drawLines(e, 1 - Math.max(0, (e - 1.5) / .7));
        if (e > 1.5) {          /* lines break into points */
          var a = (e - 1.5) / .7;
          pts.forEach(function (o) { var p = wave(o, e); g.fillStyle = 'rgba(' + o.col.join(',') + ',' + a.toFixed(2) + ')'; g.beginPath(); g.arc(p[0], p[1], 2.2, 0, 6.2832); g.fill(); });
        }
      } else {
        if (!pts[0].sx) pts.forEach(function (o) { var p = wave(o, LINE_T); o.sx = p[0]; o.sy = p[1]; });
        alive = frame(e - LINE_T);
      }
      var d = e - LINE_T;
      sc.classList.toggle('dna-done', d > 5.9);
      sc.classList.toggle('pins', d > 6.5);
      sc.classList.toggle('word', d > 7.4);
      if (!alive && d > 8) running = false;
    };
  })();

  /* ---------------- 03 genobit: the logo's DNA drawn in, then twisting ---------------- */
  (function () {
    var g = $('#lgHelix'), rungs = [], x;
    for (x = 84; x <= 616; x += 28) rungs.push(svg('line', { 'class': 'lg-r' }, g));
    var B = svg('path', { 'class': 'lg-h', stroke: '#A9CDE5', pathLength: 1 }, g);
    var A = svg('path', { 'class': 'lg-h', stroke: '#00706F', pathLength: 1 }, g);
    function draw(ph) {
      var a = '', b = '', t;
      for (x = 70; x <= 630; x += 7) {
        t = (x - 70) / 280 * 2 * Math.PI + ph;
        a += (x === 70 ? 'M' : 'L') + x + ' ' + (345 + 62 * Math.sin(t)).toFixed(1) + ' ';
        b += (x === 70 ? 'M' : 'L') + x + ' ' + (345 - 62 * Math.sin(t)).toFixed(1) + ' ';
      }
      A.setAttribute('d', a); B.setAttribute('d', b);
      rungs.forEach(function (l, i) {
        var xx = 84 + i * 28, sn = Math.sin((xx - 70) / 280 * 2 * Math.PI + ph);
        l.setAttribute('x1', xx); l.setAttribute('x2', xx);
        l.setAttribute('y1', (345 + 62 * sn * .82).toFixed(1)); l.setAttribute('y2', (345 - 62 * sn * .82).toFixed(1));
        l.style.strokeOpacity = Math.max(0, (Math.abs(sn) - .3) / .7).toFixed(2);
      });
    }
    draw(0);
    var t0 = 0;
    TICK.genobit = function (t) { if (!t0) t0 = t; draw(-(t - t0) * 1.1); };
    SH.genobit = function () { t0 = 0; };
  })();

  /* ---------------- 04 proyectos: orbit + spinning helix ---------------- */
  (function () {
    var orb = { run: false, t0: 0 }, gbA = $('#gbA'), gbB = $('#gbB'), gbR = $('#gbR'), rungs = [], k;
    for (k = 0; k < 9; k++) rungs.push(svg('line', {}, gbR));
    function helix(ph) {
      var A = '', B = '', x;
      for (x = -80; x <= 80; x += 5) {
        var y = 26 * Math.sin(x / 80 * 2 * Math.PI + ph);
        A += (x === -80 ? 'M' : 'L') + x + ' ' + (y - 14).toFixed(1);
        B += (x === -80 ? 'M' : 'L') + x + ' ' + (-y - 14).toFixed(1);
      }
      gbA.setAttribute('d', A); gbB.setAttribute('d', B);
      rungs.forEach(function (l, i) {
        var x = -64 + i * 16, y = 26 * Math.sin(x / 80 * 2 * Math.PI + ph);
        l.setAttribute('x1', x); l.setAttribute('x2', x);
        l.setAttribute('y1', (y * .8 - 14).toFixed(1)); l.setAttribute('y2', (-y * .8 - 14).toFixed(1));
        l.setAttribute('opacity', Math.min(1, Math.abs(y) / 14).toFixed(2));
      });
    }
    helix(0);
    TICK.proyectos = function (t, sc) {
      if (!orb.t0) orb.t0 = t;
      var tt = t - orb.t0, ps = $$('.planet', sc);
      ps.forEach(function (p, i) {
        var a = tt * 2 * Math.PI / 50 + i * Math.PI / 2 - .4, sn = Math.sin(a);
        p.style.left = (480 + 400 * Math.cos(a)).toFixed(1) + 'px';
        p.style.top = (430 + 290 * sn).toFixed(1) + 'px';
        p.style.zIndex = sn < 0 ? 5 : 15;
        $('.pin', p).style.transform = 'scale(' + (.8 + .2 * (sn + 1) / 2).toFixed(3) + ')';
      });
      helix(tt * 1.6);
    };
  })();

  /* ---------------- 05 imágenes del cerebro: scanner -> slices -> 3D volume -> pixels -> dataset ---------------- */
  (function () {
    var meta = D.plane_sprites && D.plane_sprites.axial, stack = $('#mriStack'), scan = $('#mriScan');
    var sls = [], N = 15, msgs = $$('#mri .ms');
    if (meta) {
      for (var i = 0; i < N; i++) {
        var s = document.createElement('div');
        s.className = 'sl sprite';
        s.style.setProperty('--z', ((i - (N - 1) / 2) * 22) + 'px');
        stack.appendChild(s); initSprite(s, meta);
        setFrame(s, Math.round(8 + i / (N - 1) * (meta.frames - 16)));
        sls.push(s);
      }
    }
    set('mriWH', (D.img_w || 496) + ' × ' + (D.img_h || 248));
    set('mriN', D.slices_per_scan || 61);
    var P = D.patch;
    if (P) {
      var box = $('#pxBox');
      box.style.left = (P.x / P.w * 100) + '%'; box.style.top = (P.y / P.h * 100) + '%';
      box.style.width = (P.size / P.w * 100) + '%'; box.style.height = (P.size / P.h * 100) + '%';
      $('#pxGrid').innerHTML = P.values.map(function (row, r) {
        return row.map(function (v, c) {
          return '<i style="background:rgb(' + v + ',' + v + ',' + v + ');color:' + (v > 120 ? '#1F1F1F' : '#fff') + ';--d:' + ((r * 8 + c) * 18) + 'ms">' + v + '</i>';
        }).join('');
      }).join('');
    }
    var t0 = 0, stepNow = 0;
    SH.mri = function (sc, step) {
      stepNow = step;
      msgs.forEach(function (m) { m.classList.toggle('on', +m.dataset.k === step); });
      if (step === 0) { t0 = 0; sls.forEach(function (s) { s.classList.remove('in'); }); }
      else sls.forEach(function (s) { s.classList.add('in'); });
    };
    SH.mri.reset = function () { t0 = 0; };
    TICK.mri = function (t) {
      if (stepNow !== 0) return;
      if (!t0) t0 = t;
      var T = 7, e = (t - t0) % (T + 2.5), p = Math.min(1, e / T);
      scan.setAttribute('transform', 'translate(0 ' + (430 - p * 400).toFixed(1) + ')');
      sls.forEach(function (s, i) { s.classList.toggle('in', p >= (i + .5) / N); });
    };
  })();

  /* ---------------- 06 demencia: real scans at the same brain level, one per CDR level ---------------- */
  (function () {
    var lv = [['nd', 'Sano', 'CDR 0'], ['vmd', 'Muy leve', 'CDR 0.5'], ['md', 'Leve', 'CDR 1'], ['mod', 'Moderada', 'CDR 2']];
    var wrap = $('#dmThumbs'), big = $('#dmImg'), th = [];
    lv.forEach(function (l, i) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'th';
      b.innerHTML = '<img src="' + G + 'dementia_' + l[0] + '.jpg" alt="' + l[1] + '"><span><b>' + l[1] + '</b>' + l[2] + '</span>';
      b.addEventListener('click', function () { if (window.DECK) DECK.setStep(i); });
      wrap.appendChild(b); th.push(b);
    });
    SH.demencia = function (sc, step) {
      var l = lv[Math.min(step, 3)];
      th.forEach(function (b, i) { b.classList.toggle('on', i === Math.min(step, 3)); });
      big.style.opacity = 0;
      setTimeout(function () { big.src = G + 'dementia_' + l[0] + '.jpg'; big.style.opacity = 1; }, 180);
      set('dmLbl', l[1] + ' · ' + l[2]);
    };
  })();

  /* ---------------- 07 metodología: four stages, last semester's models and metrics ---------------- */
  (function () {
    /* confusion matrices shown in last semester's GRES slides (rows = real CN/MCI/AD, columns = predicted) */
    var M = {
      'CNN': [[14, 31, 5], [27, 45, 15], [9, 20, 16]],
      'ResNet50': [[78, 141, 21], [69, 253, 27], [44, 117, 24]],
      'MobileNetV2': [[18, 40, 2], [16, 68, 3], [8, 33, 4]]};
    function acc(m) { var n = 0, d = 0; m.forEach(function (r, i) { r.forEach(function (v) { n += v; }); d += r[i]; }); return d / n; }
    set('mtN', fmt(D.n_images || 86437));
    $('#mtModels').innerHTML = Object.keys(M).map(function (k) {
      var a = acc(M[k]), n = M[k].reduce(function (s, r) { return s + r[0] + r[1] + r[2]; }, 0);
      return '<div class="mdl"><h4>' + k + '</h4><small>' + fmt(n) + ' imágenes de prueba</small><div class="acc">' + a.toFixed(2) + '</div><div class="bar" title="línea blanca = azar (0.33)"><i style="--a:' + a.toFixed(3) + '"></i><em></em></div></div>';
    }).join('');
    var R = M.ResNet50, lab = ['CN', 'MCI', 'AD'], mx = 253, h = '<span></span><span class="ttl2">predicho →</span>';
    h = '<span></span>' + lab.map(function (l) { return '<span>' + l + '</span>'; }).join('');
    R.forEach(function (r, i) {
      h += '<span>' + lab[i] + '</span>';
      r.forEach(function (v, j) {
        h += '<i style="--d:' + ((i * 3 + j) * 90) + 'ms;background:rgba(125,126,202,' + (.15 + .85 * v / mx).toFixed(2) + ')' + (i === j ? ';outline:3px solid #F2B84B;outline-offset:-3px' : '') + '">' + v + '</i>';
      });
    });
    $('#mtCm').innerHTML = '<span></span><span class="ttl2" style="grid-column:2/5">ResNet50 · columnas = predicho, filas = real</span>' + h;
    var predMCI = R.reduce(function (s, r) { return s + r[1]; }, 0) / R.reduce(function (s, r) { return s + r[0] + r[1] + r[2]; }, 0);
    $('#mtWarn').innerHTML = 'Casi todo → <b>MCI</b> (' + Math.round(predMCI * 100) + '%). Alzheimer acertado: ' + Math.round(R[2][2] / (R[2][0] + R[2][1] + R[2][2]) * 100) + '%.';
    var nodes = $$('#metodo .nd3'), panes = $$('#metodo .mp');
    nodes.forEach(function (b) { b.addEventListener('click', function () { if (window.DECK) DECK.setStep(+b.dataset.i); }); });
    SH.metodo = function (sc, step) {
      nodes.forEach(function (b, i) { b.classList.toggle('on', i === step); b.classList.toggle('done', i < step); });
      panes.forEach(function (p, i) { p.classList.toggle('on', i === step); });
    };
  })();

  /* ---------------- 06 oasis: three planes + Kaggle numbers ---------------- */
  set('oaImg', fmt(D.n_images || 86437));
  set('oaSub', fmt(D.n_subjects || 347));
  set('oaScan', fmt(D.n_scans || 1417));
  set('oaGb', (D.dataset_gb || 1.36) + ' GB');
  TICK.oasis = function (t, sc) {
    $$('.sprite', sc).forEach(function (el, i) { if (el._m) setFrame(el, pingpong(t + i * 1.3, 11, el._m.frames)); });
  };

  /* ---------------- 07 así viene el dataset: folders + one scan playing with its file name ---------------- */
  (function () {
    var C = D.classes || [], tree = $('#dsTree'), m = D.scan_sprites && D.scan_sprites.nd;
    var html = '<div class="root">Data/</div>';
    C.forEach(function (c) {
      html += '<div class="row"><i>└</i><b>' + c.label + '/</b><span>' + fmt(c.images) + ' JPG · ' + fmt(c.mb || 0) + ' MB</span></div>';
    });
    html += '<div class="tot">' + fmt(D.n_images || 0) + ' archivos · ' + (D.dataset_gb || 0) + ' GB · ' + fmt(D.n_subjects || 0) + ' personas · ' + fmt(D.n_scans || 0) + ' escaneos</div>';
    tree.innerHTML = html;
    set('dsN', D.slices_per_scan); set('dsRange', D.slice_min + '–' + D.slice_max);
    if (!m) return;
    var v = m.volume.match(/OAS1_(\d{4})_MR(\d)_mpr(\d)/), jpg = $('#cJpg'), name = $('#dsName');
    set('dsSub', v[1]); set('dsSes', 'MR' + v[2]); set('dsScan', 'mpr-' + v[3]);
    function seg(txt, col) { return '<span class="c" style="background:' + col + '">' + txt + '</span>'; }
    TICK.corte = function (t) {
      var f = pingpong(t, 8, m.frames), sl = m.first_slice + f;
      setFrame(jpg, f);
      name.innerHTML = seg('OAS1', '#6B7280') + '_' + seg(v[1], '#00706F') + '_' + seg('MR' + v[2], '#3D358B') + '_' + seg('mpr-' + v[3], '#7D7ECA') + '_' + seg(sl, '#C99A2E') + '.jpg';
      set('dsSl', sl);
    };
  })();

  /* ---------------- 08 clases: images vs people ---------------- */
  (function () {
    var C = D.classes || [], wrap = $('#clBars'), rows = [];
    C.forEach(function (c) {
      var r = document.createElement('div');
      r.className = 'row';
      r.innerHTML = '<div class="nm">' + c.label + '<small>CDR ' + c.cdr + '</small></div><div class="track"><div class="fill" style="background:' + CLS[c.key] + '"></div><span class="val">0</span></div>';
      wrap.appendChild(r);
      rows.push({ c: c, fill: $('.fill', r), val: $('.val', r) });
    });
    var ppl = $('#clPeople');
    var all = [];
    C.forEach(function (c) { for (var i = 0; i < c.subjects; i++) all.push(c.key); });
    all.forEach(function (k, i) {
      var e = document.createElement('i');
      var big = k === 'mod';
      e.style.cssText = 'background:' + CLS[k] + ';width:' + (big ? 26 : 13) + 'px;height:' + (big ? 26 : 13) + 'px;transition-delay:' + (i * 3) + 'ms' + (big ? ';box-shadow:0 0 0 4px #F2B84B' : '');
      ppl.appendChild(e);
    });
    var mod = C.filter(function (c) { return c.key === 'mod'; })[0];
    if (mod) set('clTwo', mod.subjects);
    var O = (D.oasis1 && D.oasis1.by_class) || {};
    var modes = [
      ['images', 'imágenes', 'Todo el dataset, no una muestra.'],
      ['subjects', 'personas en el dataset', ''],
      ['oasis', 'personas en OASIS-1', 'Tabla clínica oficial de OASIS-1.']];
    SH.clases = function (sc, step) {
      var md = modes[Math.max(0, Math.min(step, 3) - 1)];
      var val = function (c) { return md[0] === 'oasis' ? (O[c.key] || 0) : c[md[0]]; };
      var max = Math.max.apply(null, C.map(val));
      $('#clMode').innerHTML = 'contando <b>' + md[1] + '</b>';
      $('#clNote').textContent = step >= 1 ? md[2] : '';
      rows.forEach(function (r) {
        var w = step >= 1 ? val(r.c) / max * 82 : 0;
        r.fill.style.width = w + '%';
        r.val.style.left = w + '%';
        r.val.textContent = step >= 1 ? fmt(val(r.c)) : '';
      });
    };
  })();

  /* ---------------- 09 un escaneo por clase ---------------- */
  (function () {
    var q = $('#escQuad'), S = D.scan_sprites || {};
    ['nd', 'vmd', 'md', 'mod'].forEach(function (k) {
      if (!S[k]) return;
      var d = document.createElement('div');
      d.className = 'sc';
      d.innerHTML = '<div class="sprite" style="border-color:' + (k === 'mod' ? '#BFC9D6' : CLS[k]) + '"></div><h4>' + CLS_ES[k] + '<span>CDR ' + CDR[k] + ' · ' + S[k].volume + '</span></h4>';
      q.appendChild(d);
      initSprite($('.sprite', d), S[k]);
    });
    TICK.escaneos = function (t, sc) {
      var els = $$('.sprite', sc), f = 0;
      els.forEach(function (el) { f = pingpong(t, 8, el._m.frames); setFrame(el, f); });
      if (els.length) set('escN', els[0]._m.first_slice + f);
    };
  })();

  /* ---------------- 10 personas: age vs brain volume ---------------- */
  (function () {
    var P = D.scatter || [], s = $('#psPlot');
    var x0 = 90, x1 = 1120, y0 = 630, y1 = 20;
    var X = function (a) { return x0 + (a - 15) / (100 - 15) * (x1 - x0); };
    var Y = function (v) { return y0 - (v - .62) / (.9 - .62) * (y0 - y1); };
    svg('line', { x1: x0, x2: x1, y1: y0, y2: y0, stroke: '#C9D3DC', 'stroke-width': 2 }, s);
    [20, 40, 60, 80, 100].forEach(function (a) { var t = svg('text', { x: X(a), y: y0 + 40, 'text-anchor': 'middle', 'font-size': 24 }, s); t.textContent = a; });
    [.65, .7, .75, .8, .85, .9].forEach(function (v) {
      svg('line', { x1: x0, x2: x1, y1: Y(v), y2: Y(v), stroke: '#E3E8EC', 'stroke-width': 1 }, s);
      var t = svg('text', { x: x0 - 14, y: Y(v) + 8, 'text-anchor': 'end', 'font-size': 22 }, s); t.textContent = v.toFixed(2);
    });
    var tx = svg('text', { x: (x0 + x1) / 2, y: y0 + 84, 'text-anchor': 'middle', 'font-size': 26 }, s); tx.textContent = 'edad (años)';
    var ty = svg('text', { x: 0, y: 0, 'text-anchor': 'middle', 'font-size': 26, transform: 'translate(22 ' + (y0 + y1) / 2 + ') rotate(-90)' }, s); ty.textContent = 'volumen cerebral normalizado (nWBV)';
    P.forEach(function (p, i) {
      svg('circle', { 'class': 'pt ' + (p[3] ? 'unrated' : 'rated'), cx: X(p[0]).toFixed(1), cy: Y(p[1]).toFixed(1), r: 9, fill: CLS[p[2]] || '#999', style: 'transition-delay:' + (i * 4) + 'ms' }, s);
    });
    var leg = $('#psLeg');
    ['nd', 'vmd', 'md', 'mod'].forEach(function (k) { leg.insertAdjacentHTML('beforeend', '<span><i style="background:' + CLS[k] + '"></i>' + CLS_ES[k] + '</span>'); });
    set('psUn', D.nd_unrated + ' de ' + D.nd_total);
  })();

  /* ---------------- 11 fuga: near duplicates and leakage ---------------- */
  (function () {
    set('fgAdj', (D.adj_corr_median || 0).toFixed(2));
    set('fgRand', (D.rand_corr_median || 0).toFixed(2));
    var m = D.scan_sprites && D.scan_sprites.nd;
    if (m) { initSprite($('#fgA'), m); initSprite($('#fgB'), m); setFrame($('#fgA'), 30); setFrame($('#fgB'), 31); }
    var box = $('#fgSplit'), cols = ['#00706F', '#7D7ECA', '#3D358B', '#A9CDE5', '#E0A22E', '#1F1F1F'], dots = [], i, p;
    for (p = 0; p < 6; p++) for (i = 0; i < 8; i++) {
      var d = document.createElement('i');
      d.className = 'dot'; d.style.background = cols[p];
      box.appendChild(d); dots.push({ el: d, p: p });
    }
    var seed = 3; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    var randTest = dots.map(function () { return rnd() < .22; });
    function place(list, x0) {
      list.forEach(function (o, j) { o.el.style.left = (x0 + 30 + (j % 8) * 48) + 'px'; o.el.style.top = (30 + Math.floor(j / 8) * 52) + 'px'; });
    }
    SH.fuga = function (sc, step) {
      var testOf = step >= 3 ? dots.map(function (o) { return o.p === 5; }) : step >= 2 ? randTest : dots.map(function () { return false; });
      var tr = [], te = [];
      dots.forEach(function (o, j) { (testOf[j] ? te : tr).push(o); });
      place(tr, 0); place(te, 540);
      var inTrain = {}; tr.forEach(function (o) { inTrain[o.p] = 1; });
      dots.forEach(function (o, j) { o.el.classList.toggle('leak', step >= 2 && testOf[j] && !!inTrain[o.p]); });
      var v = $('#fgVerdict');
      if (step >= 3) v.innerHTML = 'Split <b>por persona</b>: <b style="color:var(--teal)">0% de fuga</b>';
      else if (step >= 2) v.innerHTML = 'Split <b>al azar</b>: <b style="color:#B3263A">' + fmt((D.leak_random_split || 0) * 100, 0) + '% de fuga</b>';
      else v.innerHTML = '';
    };
  })();

  /* ---------------- 11 cuántos datos sirven: from images to usable people ---------------- */
  (function () {
    var C = D.classes || [], by = {};
    C.forEach(function (c) { by[c.key] = c; });
    var un = D.nd_unrated || 0, wrap = $('#cqDots'), k = 0;
    ['nd', 'vmd', 'md', 'mod'].forEach(function (key) {
      var n = by[key] ? by[key].subjects : 0;
      for (var i = 0; i < n; i++) {
        var d = document.createElement('i');
        d.style.background = CLS[key];
        d.style.setProperty('--d', (k++ * 4) + 'ms');
        if (key === 'nd' && i < un) d.className = 'un';
        if (key === 'mod') d.className = 'mod';
        wrap.appendChild(d);
      }
    });
    var nd = by.nd ? by.nd.subjects - un : 0, vmd = by.vmd ? by.vmd.subjects : 0, md = by.md ? by.md.subjects : 0;
    var mod = by.mod ? by.mod.subjects : 0, ppl = D.n_subjects || 0, age = D.nd_unrated_age || [18, 57];
    $('#cqFinal').innerHTML = [['nd', nd, 'Non Demented (CDR 0)'], ['vmd', vmd, 'Very mild'], ['md', md, 'Mild']].map(function (r) {
      return '<div><b style="color:' + CLS[r[0]] + '">' + r[1] + '</b>' + r[2] + '</div>';
    }).join('');
    var states = [
      [fmt(D.n_images || 0), 'imágenes', 'Parece mucho…'],
      [fmt(ppl), 'personas', '~' + fmt(D.images_per_subject_median || 0) + ' imágenes casi iguales por persona'],
      [fmt(ppl - un), 'personas', '−' + un + ' sin evaluar (jóvenes)'],
      [fmt(ppl - un - mod), 'personas', '−' + mod + ' Moderate: no alcanza'],
      [fmt(ppl - un - mod), 'personas útiles', '3 clases']];
    SH.cuantos = function (sc, step) {
      var st = states[Math.min(step, 4)];
      set('cqNum', st[0]); set('cqUnit', st[1]); $('#cqTxt').innerHTML = st[2];
    };
  })();

  /* ---------------- 12 técnicas: one interactive slide, one tab per technique ---------------- */
  (function () {
    var sc = $('#tec'), tabs = $$('.tab', sc), panes = $$('.pane', sc), t0 = 0, cur = -1;
    tabs.forEach(function (b) { b.addEventListener('click', function () { if (window.DECK) DECK.setStep(+b.dataset.i); }); });
    SH.tec = function (s, step) {
      tabs.forEach(function (b, i) { b.classList.toggle('on', i === step); });
      panes.forEach(function (p, i) { p.classList.toggle('on', i === step); });
      if (step !== cur) { cur = step; t0 = 0; manual = false; fsManual = false; }
    };
    SH.tec.reset = function () { cur = -1; };

    /* bias: before/after slider; sweeps by itself until someone drags it */
    var cmp = $('#cmp'), manual = false;
    function setX(p) { cmp.style.setProperty('--x', (p * 100).toFixed(2) + '%'); }
    function fromEvent(e) { var r = cmp.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); }
    cmp.addEventListener('pointerdown', function (e) { manual = true; cmp.setPointerCapture(e.pointerId); setX(fromEvent(e)); });
    cmp.addEventListener('pointermove', function (e) { if (e.buttons) setX(fromEvent(e)); });

    /* skull: three phases on a loop */
    var sk = $('#skVw'), skPh = $$('#skPh li');
    function skPhase(p) {
      sk.className = 'vw' + (p ? ' p' + p : '');
      skPh.forEach(function (li, i) { li.classList.toggle('on', i === p); li.classList.toggle('done', i < p); });
    }

    /* freesurfer: cycles through tissues; clicking the legend takes control */
    var fs = $('#fsVw'), fsLeg = $$('#fsLeg button'), fsManual = false, order = ['all', 'csf', 'gm', 'wm'];
    function fsShow(k) { fs.className = 'vw ' + k; fsLeg.forEach(function (b) { b.classList.toggle('on', b.dataset.t === k); }); }
    fsLeg.forEach(function (b) { b.addEventListener('click', function () { fsManual = true; fsShow(b.dataset.t); }); });

    /* entropy: image + information meter + draggable curve */
    var E = D.entropy, enImg = $('#enImg'), enBar = $('#enBar'), cv = $('#enCurve'), enManual = null, enDraw = function () { };
    if (E) {
      var c = E.curve, n = c.length, W = 1032, H = 170, mx = Math.max.apply(null, c), zs = E.sprite.z;
      var X = function (z) { return z / (n - 1) * W; }, Y = function (v) { return H - 34 - v / mx * (H - 50); };
      var d = '';
      c.forEach(function (v, z) { d += (z ? 'L' : 'M') + X(z).toFixed(1) + ' ' + Y(v).toFixed(1); });
      svg('path', { d: d + 'L' + W + ' ' + (H - 34) + 'L0 ' + (H - 34) + 'Z', fill: '#7D7ECA33' }, cv);
      svg('path', { d: d, fill: 'none', stroke: '#7D7ECA', 'stroke-width': 4 }, cv);
      var a = svg('text', { x: 0, y: H - 4 }, cv); a.textContent = 'base de la cabeza';
      var b2 = svg('text', { x: W, y: H - 4, 'text-anchor': 'end' }, cv); b2.textContent = 'parte alta';
      var cur2 = svg('line', { y1: 0, y2: H - 34, stroke: '#F2B84B', 'stroke-width': 4 }, cv);
      var dot = svg('circle', { r: 11, fill: '#F2B84B' }, cv);
      enDraw = function (f) {
        var z = zs[f];
        setFrame(enImg, f);
        cur2.setAttribute('x1', X(z)); cur2.setAttribute('x2', X(z));
        dot.setAttribute('cx', X(z)); dot.setAttribute('cy', Y(c[z]));
        enBar.style.transform = 'scaleX(' + (c[z] / mx).toFixed(3) + ')';
      };
      var pick = function (e) {
        var r = cv.getBoundingClientRect(), z = (e.clientX - r.left) / r.width * (n - 1), best = 0;
        zs.forEach(function (zz, i) { if (Math.abs(zz - z) < Math.abs(zs[best] - z)) best = i; });
        enManual = best; enDraw(best);
      };
      cv.addEventListener('pointerdown', function (e) { cv.setPointerCapture(e.pointerId); pick(e); });
      cv.addEventListener('pointermove', function (e) { if (e.buttons) pick(e); });
    }

    /* ranking: 61 thumbnails -> scores -> sorted -> top 10 */
    var R = D.ranking, board = $('#rkBoard'), cells = [], rkPh = $$('#rkPh li');
    if (R) {
      var S = R.slices, meta = D.scan_sprites[R.key], smin = Math.min.apply(null, S.score), smax = Math.max.apply(null, S.score);
      for (var i = 0; i < S.slice.length; i++) {
        var el = document.createElement('div');
        el.className = 'cell' + (S.rank[i] <= R.top_k ? ' top' : '');
        el.innerHTML = '<div class="sprite"></div><div class="sb"></div>';
        el.style.setProperty('--w', ((S.score[i] - smin) / (smax - smin) * .9 + .1).toFixed(3));
        board.appendChild(el);
        var sp = $('.sprite', el); initSprite(sp, meta); setFrame(sp, S.slice[i] - meta.first_slice);
        cells.push({ el: el, rank: S.rank[i] });
      }
    }
    function lay(sorted) {
      (sorted ? cells.slice().sort(function (a, b) { return a.rank - b.rank; }) : cells).forEach(function (o, j) {
        o.el.style.left = (j % 9) * 100 + 'px'; o.el.style.top = Math.floor(j / 9) * 78 + 'px';
      });
    }
    lay(false);
    function rkPhase(p) {
      board.className = 'board' + (p >= 1 ? ' p1' : '') + (p >= 3 ? ' p3' : '');
      lay(p >= 2);
      rkPh.forEach(function (li, i) { li.classList.toggle('on', i === p); li.classList.toggle('done', i < p); });
    }

    var last = {};
    TICK.tec = function (t) {
      if (!t0) t0 = t;
      var e = t - t0, p;
      if (cur === 0 && !manual) setX(.5 + .32 * Math.sin(e * 1.1));
      if (cur === 1) { p = Math.floor((e % 9) / 3); if (last.sk !== p) { last.sk = p; skPhase(p); } }
      if (cur === 2 && !fsManual) { p = order[Math.floor(e / 2.4) % 4]; if (last.fs !== p) { last.fs = p; fsShow(p); } }
      if (cur === 3 && E && enManual === null) enDraw(pingpong(e, 7, E.sprite.z.length));
      if (cur === 4 && R) { p = Math.min(3, Math.floor((e % 12) / 2.6)); if (last.rk !== p) { last.rk = p; rkPhase(p); } }
      if (cur !== 3) enManual = null;
      if (cur !== last.cur) { last = { cur: cur }; }
    };
  })();

  /* ---------------- 15 posibles preguntas: loose word cloud ---------------- */
  (function () {
    var cloud = $('#qCloud'), items = $$('span', cloud), cols = ['#00706F', '#3D358B', '#7D7ECA', '#1F1F1F', '#4E8FB8'];
    var seed = 11; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    function layout() {
      var W = cloud.clientWidth, H = cloud.clientHeight, placed = [];
      items.forEach(function (el, i) {
        el.style.fontSize = Math.round(36 + rnd() * 26 - (el.textContent.length > 34 ? 4 : 0)) + 'px';
        el.style.color = cols[i % cols.length];
        el.style.setProperty('--t', (7 + rnd() * 6).toFixed(1) + 's');
        el.style.setProperty('--dx', ((rnd() - .5) * 26).toFixed(0) + 'px');
        el.style.setProperty('--dy', ((rnd() - .5) * 22).toFixed(0) + 'px');
        var w = el.offsetWidth, h = el.offsetHeight, a = rnd() * 6.28, r = 0, x, y, ok;
        for (var k = 0; k < 2000; k++) {
          x = W / 2 + r * 1.9 * Math.cos(a) - w / 2; y = H / 2 + r * Math.sin(a) - h / 2;
          ok = x >= 0 && y >= 0 && x + w <= W && y + h <= H && placed.every(function (p) {
            return x + w + 26 < p.x || p.x + p.w + 26 < x || y + h + 18 < p.y || p.y + p.h + 18 < y;
          });
          if (ok) break;
          a += .35; r += 1.2;
        }
        placed.push({ x: x, y: y, w: w, h: h });
        el.style.left = x + 'px'; el.style.top = y + 'px';
      });
    }
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(layout);
    items.forEach(function (el) {
      el.addEventListener('click', function () {
        var was = el.classList.contains('f');
        items.forEach(function (o) { o.classList.remove('f'); });
        cloud.classList.toggle('focus', !was);
        if (!was) el.classList.add('f');
      });
    });
    SH.preguntas = function (sc, step) {
      var k = 0;
      items.forEach(function (el) {
        var on = +el.dataset.w <= step;
        if (on && !el.classList.contains('in')) el.style.setProperty('--d', (k++ * .18) + 's');
        el.classList.toggle('in', on);
      });
    };
    SH.preguntas.reset = function () { cloud.classList.remove('focus'); items.forEach(function (o) { o.classList.remove('f', 'in'); }); };
  })();

  /* ---------------- 14 limitaciones ---------------- */
  (function () {
    var mod = (D.classes || []).filter(function (c) { return c.key === 'mod'; })[0];
    if (mod) set('lmMod', mod.subjects);
    if (D.imbalance_ratio) set('lmRatio', fmt(D.imbalance_ratio, 0));
    if (D.leak_random_split != null) set('lmLeak', fmt(D.leak_random_split * 100, 0) + '%');
    if (D.nd_unrated != null) set('lmUn', D.nd_unrated + ' de ' + D.nd_total);
    if (D.nd_unrated_age) set('lmAge', D.nd_unrated_age[0] + '–' + D.nd_unrated_age[1]);
    set('lmSl', D.slices_per_scan); set('lmRg', D.slice_min + '–' + D.slice_max);
    if (D.images_per_subject_median) set('lmIpp', fmt(D.images_per_subject_median));
  })();

  /* ---------------- 16 fin: helix ---------------- */
  TICK.fin = function (t) {
    var A = '', B = '', x;
    for (x = 0; x <= 1200; x += 10) {
      var y = 60 * Math.sin(x / 300 * 2 * Math.PI + t * 1.2);
      A += (x ? 'L' : 'M') + x + ' ' + (100 + y).toFixed(1);
      B += (x ? 'L' : 'M') + x + ' ' + (100 - y).toFixed(1);
    }
    $('#finA').setAttribute('d', A); $('#finB').setAttribute('d', B);
  };

  /* ================= engine ================= */
  var stage = $('#stage');
  var scenes = $$('.scene', stage);
  var cur = 0, step = 0, reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function countTo(el, to, dec) {
    if (to == null) return;
    function put(v) { el.textContent = fmt(v, dec); }
    if (reduce) { put(to); return; }
    var t0 = performance.now();
    (function f(t) { var p = Math.min(1, (t - t0) / 1300), e = 1 - Math.pow(1 - p, 3); put(to * e); if (p < 1) requestAnimationFrame(f); })(t0);
  }
  function maxStep(sc) { var m = 0; $$('[data-s]', sc).forEach(function (e) { m = Math.max(m, +e.getAttribute('data-s')); }); return m; }
  function onIn(e) {
    if (e.hasAttribute('data-count')) countTo(e, +e.getAttribute('data-count'), 0);
    $$('[data-count]', e).forEach(function (c) { countTo(c, +c.getAttribute('data-count'), 0); });
  }
  function clearScene(sc) {
    sc.removeAttribute('data-step');
    for (var q = 1; q <= 8; q++) sc.classList.remove('st' + q);
    if (SH[sc.id] && SH[sc.id].reset) SH[sc.id].reset(sc);
    $$('[data-s].in', sc).forEach(function (e) { e.classList.remove('in'); });
  }
  function render() {
    scenes.forEach(function (sc, i) { sc.classList.toggle('on', i === cur); });
    var sc = scenes[cur];
    sc.setAttribute('data-step', step);
    for (var q = 1; q <= 8; q++) sc.classList.toggle('st' + q, step >= q);
    if (SH[sc.id]) { try { SH[sc.id](sc, step); } catch (err) { console.error(err); } }
    $$('[data-s]', sc).forEach(function (e) {
      var on = +e.getAttribute('data-s') <= step;
      if (on && !e.classList.contains('in')) { e.classList.add('in'); onIn(e); }
      else if (!on && e.classList.contains('in')) e.classList.remove('in');
    });
    stage.classList.toggle('isdark', sc.classList.contains('dark'));
    set('pg', (cur + 1 < 10 ? '0' : '') + (cur + 1) + ' / ' + scenes.length);
    var total = 0, done = 0;
    scenes.forEach(function (s, i) { var m = maxStep(s) + 1; total += m; if (i < cur) done += m; else if (i === cur) done += step + 1; });
    $('#prog').style.width = (done / total * 100) + '%';
    $('#hint').style.opacity = (cur === 0 && step === 0) ? .9 : 0;
    try { history.replaceState(null, '', '#' + (cur + 1)); } catch (e) { }
  }
  function go(n, atEnd) {
    if (n < 0 || n >= scenes.length) return;
    var from = cur; cur = n;
    if (from !== n) {
      var old = scenes[from];
      old.classList.add('leaving');
      setTimeout(function () { old.classList.remove('leaving'); if (scenes[cur] !== old) clearScene(old); }, 1500);
    }
    clearScene(scenes[cur]);
    step = atEnd ? maxStep(scenes[cur]) : 0;
    setTimeout(render, 34);   /* one frame later, so the cleared scene restarts its transitions */
  }
  function next() { var m = maxStep(scenes[cur]); if (step < m) { step++; render(); } else go(cur + 1, false); }
  function prev() { if (step > 0) { step--; render(); } else if (cur > 0) go(cur - 1, true); }

  document.addEventListener('keydown', function (e) {
    if (['ArrowRight', ' ', 'Enter', 'PageDown', 'ArrowDown'].indexOf(e.key) >= 0) { e.preventDefault(); next(); }
    else if (['ArrowLeft', 'PageUp', 'ArrowUp'].indexOf(e.key) >= 0) { e.preventDefault(); prev(); }
    else if (e.key === 'Home') go(0, false);
    else if (e.key === 'End') go(scenes.length - 1, true);
    else if (e.key === 'f') toggleFs();
  });
  document.addEventListener('click', function (e) {
    if (e.target.closest('button, .noadv')) return;
    if (e.clientX < window.innerWidth * .28) prev(); else next();
  });
  var tx = null;
  document.addEventListener('touchstart', function (e) { tx = e.touches[0].clientX; }, { passive: true });
  document.addEventListener('touchend', function (e) {
    if (tx === null) return;
    var dx = e.changedTouches[0].clientX - tx; tx = null;
    if (Math.abs(dx) > 50) { if (dx < 0) next(); else prev(); }
  }, { passive: true });
  function toggleFs() {
    try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(function () { }); } catch (x) { }
  }
  $('#fs').addEventListener('click', function (e) { e.stopPropagation(); toggleFs(); });
  function fit() { var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080); stage.style.transform = 'translate(-50%,-50%) scale(' + s + ')'; }
  window.addEventListener('resize', fit); fit();

  (function loop(now) {
    var sc = scenes[cur];
    if (!reduce && TICK[sc.id]) { try { TICK[sc.id](now / 1000, sc); } catch (err) { console.error(err); } }
    requestAnimationFrame(loop);
  })(performance.now());

  var h = parseInt((location.hash || '').slice(1), 10);
  if (h >= 1 && h <= scenes.length) cur = h - 1;
  setTimeout(render, 50);
  window.addEventListener('hashchange', function () {
    var n = parseInt((location.hash || '').slice(1), 10) - 1;
    if (n >= 0 && n < scenes.length && n !== cur) go(n, false);
  });
  /* go to slide n (1-based) at its last step, e.g. DECK.show(7) from the console */
  window.DECK = { next: next, prev: prev, show: function (n) { go(n - 1, true); },
    setStep: function (n) { step = Math.max(0, Math.min(maxStep(scenes[cur]), n)); render(); } };
})();
