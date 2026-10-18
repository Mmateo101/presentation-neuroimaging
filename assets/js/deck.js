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
      ['images', 'imágenes', 'Todas las imágenes del dataset (' + fmt(D.n_images || 0) + '), no una muestra.'],
      ['subjects', 'personas en el dataset', 'Las ' + fmt(D.n_subjects || 0) + ' personas del dataset de Kaggle.'],
      ['oasis', 'personas en OASIS-1', 'Las ' + fmt((D.oasis1 || {}).subjects || 0) + ' personas de OASIS-1 (tabla clínica oficial). Las ' + fmt((D.oasis1 || {}).cdr_unrated || 0) + ' sin CDR cuentan como Non Demented.']];
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
      if (step >= 3) v.innerHTML = 'Split <b>por persona</b>: nadie está en los dos lados → <b style="color:var(--teal)">0% de fuga</b>.';
      else if (step >= 2) v.innerHTML = 'Split <b>al azar</b> (cada color = una persona): en OASIS, <b style="color:#B3263A">' + fmt((D.leak_random_split || 0) * 100, 1) + '%</b> de las imágenes de prueba tienen a su persona en entrenamiento.';
      else v.innerHTML = '';
    };
  })();

  /* ---------------- 13 bias field ---------------- */
  (function () {
    var B = D.bias;
    if (!B) return;
    set('cvC', B.cv_corrupt.toFixed(3)); set('cvF', B.cv_corrected.toFixed(3));
    $('#bsRow').style.top = (B.row / B.h * 100) + '%';
    var s = $('#bsProf'), W = 900, H = 250;
    function path(arr) {
      var mx = 1.6, d = '';
      arr.forEach(function (v, i) { d += (i ? 'L' : 'M') + (i / (arr.length - 1) * W).toFixed(1) + ' ' + (H - 20 - Math.min(v, mx) / mx * (H - 40)).toFixed(1); });
      return d;
    }
    svg('path', { d: path(B.profile_clean), stroke: '#5B6470', 'stroke-dasharray': '8 8' }, s);
    var ln = svg('path', { 'class': 'p-line', d: path(B.profile_corrupt) }, s);
    var lbl = svg('text', { x: 0, y: 18 }, s); lbl.textContent = 'brillo a lo largo de la línea amarilla · punteado = imagen limpia';
    var tm;
    SH.bias = function (sc, step) {
      var show = step >= 3 ? 'bsFixed' : step >= 1 ? 'bsCorrupt' : 'bsClean';
      ['bsClean', 'bsCorrupt', 'bsFixed'].forEach(function (id) { $('#' + id).style.opacity = id === show ? 1 : 0; });
      set('bsLbl', step >= 3 ? 'corregida con N4' : step >= 1 ? 'con campo de brillo' : 'imagen limpia');
      clearTimeout(tm);
      ln.style.d = 'path("' + path(B.profile_corrupt) + '")';
      if (step >= 4) tm = setTimeout(function () { ln.style.d = 'path("' + path(B.profile_corrected) + '")'; }, 900);
    };
    SH.bias.reset = function () { clearTimeout(tm); };
  })();

  /* ---------------- 14 skull stripping ---------------- */
  (function () {
    var K = D.skull || {};
    var imgs = $$('#skView img:not(.truth)'), steps = $$('#skSteps .stp'), truth = $('#skView .truth');
    SH.skull = function (sc, step) {
      var k = Math.min(step, 5);
      imgs.forEach(function (im, i) { im.classList.toggle('show', i === k); });
      steps.forEach(function (st, i) { st.classList.toggle('on', i === k); st.classList.toggle('done', i < k); });
      truth.style.opacity = step >= 6 ? 1 : 0;
      if (step >= 6) { countTo($('#skDice'), K.dice_2d, 3); countTo($('#skDice3'), K.dice_3d, 3); }
    };
  })();

  /* ---------------- 15 freesurfer: tissue volumes ---------------- */
  (function () {
    var S = D.seg || {}, wrap = $('#fsVols');
    var items = [['csf', 'Líquido cefalorraquídeo', '#A9CDE5'], ['gm', 'Materia gris', '#7D7ECA'], ['wm', 'Materia blanca', '#00706F']];
    var mx = Math.max(S.csf || 1, S.gm || 1, S.wm || 1);
    items.forEach(function (it) {
      wrap.insertAdjacentHTML('beforeend', '<div class="vr"><span>' + it[1] + '</span><em>' + fmt(S[it[0]] || 0, 0) + ' mL</em><div class="vb" data-w="' + ((S[it[0]] || 0) / mx * 100) + '" style="background:' + it[2] + '"></div></div>');
    });
    SH.freesurfer = function (sc, step) {
      $$('.vb', sc).forEach(function (b) { b.style.width = step >= 3 ? b.dataset.w + '%' : 0; });
    };
  })();

  /* ---------------- 16 entropía ---------------- */
  (function () {
    var E = D.entropy;
    if (!E) return;
    var s = $('#enCurve'), W = 1664, H = 220, c = E.curve, n = c.length, mx = Math.max.apply(null, c);
    var X = function (z) { return z / (n - 1) * W; }, Y = function (v) { return H - 30 - v / mx * (H - 50); };
    var d = '', da = '';
    c.forEach(function (v, z) { d += (z ? 'L' : 'M') + X(z).toFixed(1) + ' ' + Y(v).toFixed(1); });
    E.area.forEach(function (v, z) { da += (z ? 'L' : 'M') + X(z).toFixed(1) + ' ' + (H - 30 - v / Math.max.apply(null, E.area) * (H - 50)).toFixed(1); });
    svg('line', { x1: 0, x2: W, y1: H - 30, y2: H - 30, stroke: '#C9D3DC', 'stroke-width': 2 }, s);
    svg('path', { d: da, fill: 'none', stroke: '#7D7ECA', 'stroke-width': 3, 'stroke-dasharray': '6 6' }, s);
    svg('path', { d: d, fill: 'none', stroke: '#00706F', 'stroke-width': 5 }, s);
    var t1 = svg('text', { x: 0, y: H }, s); t1.textContent = 'base del cráneo';
    var t2 = svg('text', { x: W, y: H, 'text-anchor': 'end' }, s); t2.textContent = 'parte alta de la cabeza';
    var t3 = svg('text', { x: W - 10, y: 16, 'text-anchor': 'end' }, s); t3.textContent = '— entropía   - - área de cerebro';
    var cur = svg('line', { y1: 0, y2: H - 30, stroke: '#E0A22E', 'stroke-width': 4 }, s);
    var dot = svg('circle', { r: 10, fill: '#E0A22E' }, s);
    var sp = $('#entropia .sprite'), zs = E.sprite.z;
    TICK.entropia = function (t) {
      var f = pingpong(t, 9, zs.length), z = zs[f];
      setFrame(sp, f);
      cur.setAttribute('x1', X(z)); cur.setAttribute('x2', X(z));
      dot.setAttribute('cx', X(z)); dot.setAttribute('cy', Y(c[z]));
      set('enH', c[z].toFixed(2)); set('enZ', 'z ' + z);
    };
    var hw = $('#enHists'), names = { low: 'casi vacío', mid: 'nivel medio', high: 'máxima entropía' };
    ['low', 'mid', 'high'].forEach(function (k) {
      var h = E.examples[k], m2 = Math.max.apply(null, h.hist), bars = h.hist.map(function (v) { return '<i data-h="' + (v / m2 * 100) + '"></i>'; }).join('');
      hw.insertAdjacentHTML('beforeend', '<div class="hb"><img src="' + G + 'entropy_' + k + '.png" alt="Corte ' + h.z + '"><div class="bars">' + bars + '</div><p>' + names[k] + ' · z ' + h.z + ' · <span style="color:var(--teal)">H = ' + h.entropy.toFixed(2) + ' bits</span></p></div>');
    });
    SH.entropia = function (sc, step) { $$('.bars i', hw).forEach(function (b) { b.style.height = step >= 2 ? b.dataset.h + '%' : 0; }); };
  })();

  /* ---------------- 17 slice ranking ---------------- */
  (function () {
    var R = D.ranking;
    if (!R) return;
    var board = $('#rkBoard'), S = R.slices, n = S.slice.length, meta = D.scan_sprites[R.key], cells = [];
    var smin = Math.min.apply(null, S.score), smax = Math.max.apply(null, S.score);
    for (var i = 0; i < n; i++) {
      var c = document.createElement('div');
      c.className = 'cell';
      c.innerHTML = '<div class="sprite"></div><div class="sb"></div><span>' + S.slice[i] + '</span>';
      c.style.setProperty('--w', ((S.score[i] - smin) / (smax - smin) * 92 + 8) + '%');
      if (S.rank[i] <= R.top_k) c.classList.add('top-c');
      board.appendChild(c);
      var sp = $('.sprite', c);
      initSprite(sp, meta); setFrame(sp, S.slice[i] - meta.first_slice);
      cells.push({ el: c, i: i, rank: S.rank[i] });
    }
    function lay(order) {
      order.forEach(function (o, j) { o.el.style.left = (j % 11) * 151 + 'px'; o.el.style.top = Math.floor(j / 11) * 100 + 'px'; });
    }
    var notes = ['Los 61 cortes de un escaneo real de Kaggle, en orden anatómico.',
      'Cada corte recibe un <b>score</b>: promedio de entropía, área y nitidez (estandarizadas).',
      'Ordenados por score: los <b>' + R.top_k + ' mejores</b> quedan arriba.',
      'Solo esos <b>' + R.top_k + ' cortes</b> por escaneo entrarían a la CNN: menos ruido y menos redundancia.'];
    SH.ranking = function (sc, step) {
      lay(step >= 2 ? cells.slice().sort(function (a, b) { return a.rank - b.rank; }) : cells);
      cells.forEach(function (o) { o.el.classList.toggle('top', step >= 2 && o.el.classList.contains('top-c')); });
      $('#rkNote').innerHTML = notes[Math.min(step, 3)];
    };
  })();

  /* ---------------- 19 limitaciones ---------------- */
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

  /* ---------------- 21 fin: helix ---------------- */
  TICK.fin = function (t) {
    var A = '', B = '', x;
    for (x = 0; x <= 1200; x += 10) {
      var y = 60 * Math.sin(x / 300 * 2 * Math.PI + t * 1.2);
      A += (x ? 'L' : 'M') + x + ' ' + (100 + y).toFixed(1);
      B += (x ? 'L' : 'M') + x + ' ' + (100 - y).toFixed(1);
    }
    $('#finA').setAttribute('d', A); $('#finB').setAttribute('d', B);
  };

  /* cover: the helix strands are drawn in place instead of flying in */
  setTimeout(function () { $$('#helix path').forEach(function (p) { p.setAttribute('pathLength', 1); }); }, 0);

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
    if (e.target.closest('button')) return;
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
  window.DECK = { next: next, prev: prev, show: function (n) { go(n - 1, true); } };
})();
