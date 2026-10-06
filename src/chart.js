/* ============================================================
   CHART — velas + volumen + medias + subpanel, zoom (rueda / botones) y arrastre.
   Sin dependencias externas. Recibe datos ya calculados por el engine.
   ============================================================ */
function StockChart(canvas, readout) {
  const ctx = canvas.getContext('2d');
  let D = null, V = { start: 0, count: 100 }, hover = -1, drag = null;
  const PAD_L = 8, PAD_R = 58;

  function css(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function fmt(x) { return x >= 1000 ? x.toFixed(0) : x.toFixed(2); }

  function setData(d, keepView) {
    D = d; const n = d.bars.length;
    if (!keepView) { V.count = Math.min(n, d.defaultCount); V.start = n - V.count; }
    clampView(); draw();
  }
  function clampView() { const n = D.bars.length; V.count = Math.max(20, Math.min(n, Math.round(V.count))); V.start = Math.max(0, Math.min(n - V.count, V.start)); }
  function zoom(f, anchor) { const a = anchor == null ? 0.5 : anchor; const c0 = V.count; V.count = c0 * f; clampView(); V.start += (c0 - V.count) * a; clampView(); draw(); }
  function reset() { const n = D.bars.length; V.count = Math.min(n, D.defaultCount); V.start = n - V.count; draw(); }

  function layout() {
    const W = canvas.clientWidth; const priceH = 290, volH = 62, subH = 108;
    const L = { W, priceTop: 6, priceH, volTop: 6 + priceH + 6, volH, subTop: 6 + priceH + 6 + volH + 16, subH };
    L.axisTop = L.subTop + subH; L.H = L.axisTop + 22; L.plotW = W - PAD_L - PAD_R; return L;
  }
  function draw() {
    if (!D) return; const L = layout(); const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(L.W * dpr); canvas.height = Math.round(L.H * dpr); canvas.style.height = L.H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, L.W, L.H);
    const grid = css('--chart-grid'), txt = css('--chart-text'), up = css('--c-up'), dn = css('--c-down');
    const s = V.start, e = Math.min(D.bars.length, Math.ceil(V.start + V.count)), bw = L.plotW / V.count;
    const X = i => PAD_L + (i - V.start + 0.5) * bw;
    ctx.font = '11px ' + getComputedStyle(document.body).fontFamily; ctx.textBaseline = 'middle';
    // rango de precio
    let lo = Infinity, hi = -Infinity, vmax = 0;
    for (let i = s; i < e; i++) { const b = D.bars[i]; if (b.l < lo) lo = b.l; if (b.h > hi) hi = b.h; if (b.v > vmax) vmax = b.v; }
    const pad = (hi - lo) * 0.06 || 1; lo -= pad; hi += pad;
    const PY = p => L.priceTop + (hi - p) / (hi - lo) * L.priceH;
    // grilla de precio
    ctx.strokeStyle = grid; ctx.fillStyle = txt; ctx.lineWidth = 1; ctx.textAlign = 'left';
    for (let k = 0; k <= 5; k++) { const p = lo + (hi - lo) * k / 5, y = PY(p); ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(L.W - PAD_R, y); ctx.stroke(); ctx.fillText(fmt(p), L.W - PAD_R + 6, y); }
    // líneas horizontales (pivote, soporte…)
    (D.hlines || []).forEach(h => {
      if (h.y < lo || h.y > hi) return; const y = PY(h.y); ctx.strokeStyle = h.color; ctx.setLineDash(h.dash || [5, 4]); ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(L.W - PAD_R, y); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = h.color; ctx.textAlign = 'left'; ctx.fillText(h.label, PAD_L + 4, y - 7);
    });
    // velas
    for (let i = s; i < e; i++) {
      const b = D.bars[i], x = X(i), col = b.c >= b.o ? up : dn, w = Math.max(1, bw * 0.68);
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, PY(b.h)); ctx.lineTo(x, PY(b.l)); ctx.stroke();
      const y1 = PY(Math.max(b.o, b.c)), y2 = PY(Math.min(b.o, b.c)); ctx.fillRect(x - w / 2, y1, w, Math.max(1, y2 - y1));
    }
    // medias
    (D.overlays || []).forEach(o => { ctx.strokeStyle = o.color; ctx.lineWidth = o.width || 1.4; ctx.beginPath(); let st = false;
      for (let i = s; i < e; i++) { const v = o.data[i]; if (v === null || v === undefined) { st = false; continue; } const x = X(i), y = PY(v); if (!st) { ctx.moveTo(x, y); st = true; } else ctx.lineTo(x, y); } ctx.stroke(); ctx.lineWidth = 1; });
    // marcas de contracción
    (D.marks || []).forEach(m => { if (m.i < s || m.i >= e) return; const x = X(m.i), y = PY(m.p); ctx.fillStyle = m.color; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 6.3); ctx.fill();
      if (m.text) { ctx.textAlign = 'center'; ctx.fillText(m.text, x, y + (m.below ? 13 : -11)); } });
    // volumen
    ctx.textAlign = 'left'; ctx.fillStyle = txt; ctx.fillText('Vol', PAD_L + 2, L.volTop + 6);
    for (let i = s; i < e; i++) { const b = D.bars[i], h = vmax ? b.v / vmax * L.volH : 0; ctx.globalAlpha = 0.55; ctx.fillStyle = b.c >= b.o ? up : dn; ctx.fillRect(X(i) - Math.max(1, bw * 0.68) / 2, L.volTop + L.volH - h, Math.max(1, bw * 0.68), h); ctx.globalAlpha = 1; }
    if (D.volAvg) { ctx.strokeStyle = css('--ma10'); ctx.beginPath(); let st = false; for (let i = s; i < e; i++) { const v = D.volAvg[i]; if (v == null) { st = false; continue; } const x = X(i), y = L.volTop + L.volH - v / vmax * L.volH; if (!st) { ctx.moveTo(x, y); st = true; } else ctx.lineTo(x, y); } ctx.stroke(); }
    // subpanel
    drawSub(L, s, e, X, grid, txt, up, dn);
    // eje X
    ctx.fillStyle = txt; ctx.textAlign = 'center';
    for (let k = 0; k <= 4; k++) { const i = Math.min(e - 1, Math.round(s + (e - 1 - s) * k / 4)); ctx.fillText(D.bars[i].d.slice(2), Math.max(30, Math.min(L.W - PAD_R - 20, X(i))), L.axisTop + 12); }
    // cruz
    if (hover >= s && hover < e) { const x = X(hover); ctx.strokeStyle = txt; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(x, L.priceTop); ctx.lineTo(x, L.subTop + L.subH); ctx.stroke(); ctx.setLineDash([]); }
    updateReadout();
  }
  function drawSub(L, s, e, X, grid, txt, up, dn) {
    const S = D.sub; if (!S) return; const top = L.subTop, h = L.subH;
    let lo = Infinity, hi = -Infinity; const all = [...(S.lines || []).map(l => l.data), ...(S.hist ? [S.hist] : [])];
    all.forEach(a => { for (let i = s; i < e; i++) { const v = a[i]; if (v != null) { if (v < lo) lo = v; if (v > hi) hi = v; } } });
    (S.levels || []).forEach(v => { if (v < lo) lo = v; if (v > hi) hi = v; });
    if (!isFinite(lo)) return; if (S.hist) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); } const pad = (hi - lo) * 0.08 || 1; lo -= pad; hi += pad;
    const Y = v => top + (hi - v) / (hi - lo) * h;
    ctx.strokeStyle = grid; ctx.strokeRect(PAD_L, top, L.plotW, h); ctx.fillStyle = txt; ctx.textAlign = 'left';
    ctx.fillText(S.name, PAD_L + 4, top + 9);
    ctx.fillText(fmt(hi - pad), L.W - PAD_R + 6, top + 8); ctx.fillText(fmt(lo + pad), L.W - PAD_R + 6, top + h - 8);
    (S.levels || []).forEach(v => { ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(PAD_L, Y(v)); ctx.lineTo(L.W - PAD_R, Y(v)); ctx.stroke(); ctx.setLineDash([]); });
    if (S.hist) { const bw = L.plotW / V.count; for (let i = s; i < e; i++) { const v = S.hist[i]; if (v == null) continue; ctx.fillStyle = v >= 0 ? up : dn; ctx.globalAlpha = .6; const y0 = Y(0), y1 = Y(v); ctx.fillRect(X(i) - bw * .3, Math.min(y0, y1), bw * .6, Math.abs(y1 - y0)); ctx.globalAlpha = 1; } }
    (S.lines || []).forEach(l => { ctx.strokeStyle = l.color; ctx.lineWidth = 1.5; ctx.beginPath(); let st = false; for (let i = s; i < e; i++) { const v = l.data[i]; if (v == null) { st = false; continue; } const x = X(i), y = Y(v); if (!st) { ctx.moveTo(x, y); st = true; } else ctx.lineTo(x, y); } ctx.stroke(); ctx.lineWidth = 1; });
  }
  function updateReadout() {
    if (!readout || !D) return; const i = hover >= 0 ? hover : D.bars.length - 1; const b = D.bars[i]; if (!b) return;
    let t = `<b>${b.d}</b> &nbsp; A ${fmt(b.o)} &nbsp; M ${fmt(b.h)} &nbsp; m ${fmt(b.l)} &nbsp; C <b>${fmt(b.c)}</b> &nbsp; Vol ${(b.v / 1e6).toFixed(2)}M`;
    (D.overlays || []).forEach(o => { const v = o.data[i]; if (v != null) t += ` &nbsp; <span style="color:${o.color}">${o.name} ${fmt(v)}</span>`; });
    readout.innerHTML = t;
  }
  function idxAt(ev) { const r = canvas.getBoundingClientRect(); const x = ev.clientX - r.left; return Math.floor(V.start + (x - PAD_L) / (layout().plotW / V.count)); }
  canvas.addEventListener('pointermove', ev => {
    if (drag) { const bw = layout().plotW / V.count; V.start = drag.s0 - (ev.clientX - drag.x0) / bw; clampView(); draw(); return; }
    const i = idxAt(ev); hover = (i >= 0 && i < D.bars.length) ? i : -1; draw();
  });
  canvas.addEventListener('pointerdown', ev => { drag = { x0: ev.clientX, s0: V.start }; canvas.setPointerCapture(ev.pointerId); });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('pointerleave', () => { if (!drag) { hover = -1; draw(); } });
  canvas.addEventListener('wheel', ev => { ev.preventDefault(); const r = canvas.getBoundingClientRect(); const a = (ev.clientX - r.left - PAD_L) / layout().plotW; zoom(ev.deltaY > 0 ? 1.15 : 1 / 1.15, Math.max(0, Math.min(1, a))); }, { passive: false });
  return { setData, zoom, reset, draw, view: V };
}
