/* ============================================================
   ENGINE — normalización → indicadores → RS → patrones → señales →
   scoring → vistas. Sin DOM. Todo parametrizado por CONFIG.
   ============================================================ */
const Engine = (function () {
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const last = a => a[a.length - 1];
  const at = (a, k) => a[a.length - 1 - k];
  const nz = x => x !== null && x !== undefined && !isNaN(x);

  /* ---------- indicadores base ---------- */
  function sma(a, n) { const o = new Array(a.length).fill(null); let s = 0; for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= n) s -= a[i - n]; if (i >= n - 1) o[i] = s / n; } return o; }
  function ema(a, n) {
    const o = new Array(a.length).fill(null); let st = a.findIndex(nz); if (st < 0) return o; const k = 2 / (n + 1); let e = 0;
    for (let i = st; i < a.length; i++) { const j = i - st; if (j < n - 1) e += a[i]; else if (j === n - 1) { e = (e + a[i]) / n; o[i] = e; } else { e = a[i] * k + e * (1 - k); o[i] = e; } }
    return o;
  }
  function atr(h, l, c, n) {
    const o = new Array(c.length).fill(null); const tr = c.map((x, i) => i ? Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])) : h[i] - l[i]);
    let s = 0; for (let i = 0; i < c.length; i++) { if (i < n) { s += tr[i]; if (i === n - 1) o[i] = s / n; } else o[i] = (o[i - 1] * (n - 1) + tr[i]) / n; } return o;
  }
  function rsi(c, n) {
    const o = new Array(c.length).fill(null); let g = 0, l = 0;
    for (let i = 1; i < c.length; i++) {
      const d = c[i] - c[i - 1]; const up = Math.max(d, 0), dn = Math.max(-d, 0);
      if (i <= n) { g += up; l += dn; if (i === n) { g /= n; l /= n; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } }
      else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); }
    } return o;
  }
  // RCI (Rank Correlation Index): correlación de rangos precio/tiempo en ventana n, escala -100..100
  function rci(c, n) {
    const o = new Array(c.length).fill(null); const den = n * (n * n - 1);
    for (let i = n - 1; i < c.length; i++) {
      const idx = []; for (let j = 0; j < n; j++) idx.push(j);
      const w = c.slice(i - n + 1, i + 1); const order = idx.slice().sort((a, b) => w[b] - w[a]); // mayor precio = rango 1
      const pr = new Array(n); order.forEach((pos, r) => { pr[pos] = r + 1; });
      let d2 = 0; for (let j = 0; j < n; j++) { const tr = n - j; const d = tr - pr[j]; d2 += d * d; }
      o[i] = (1 - 6 * d2 / den) * 100;
    } return o;
  }
  function macd(c, f, s, sg) {
    const ef = ema(c, f), es = ema(c, s); const line = c.map((_, i) => nz(ef[i]) && nz(es[i]) ? ef[i] - es[i] : null);
    const sig = ema(line, sg); return { line, sig, hist: line.map((x, i) => nz(x) && nz(sig[i]) ? x - sig[i] : null) };
  }
  function stdev(a) { const m = a.reduce((s, x) => s + x, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / a.length); }
  const avg = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);

  /* ---------- semanal ---------- */
  const _wk = new Map();
  function weekKey(iso) { let r = _wk.get(iso); if (r) return r; const d = new Date(iso + 'T00:00:00Z'); const dow = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dow); r = d.toISOString().slice(0, 10); _wk.set(iso, r); return r; }
  function toWeekly(a) {
    const w = { d: [], o: [], h: [], l: [], c: [], v: [], di: [] }; let key = null;
    for (let i = 0; i < a.dates.length; i++) {
      const k = weekKey(a.dates[i]);
      if (k !== key) { key = k; w.d.push(k); w.o.push(a.o[i]); w.h.push(a.h[i]); w.l.push(a.l[i]); w.c.push(a.c[i]); w.v.push(a.v[i]); w.di.push(i); }
      else { const j = w.d.length - 1; w.h[j] = Math.max(w.h[j], a.h[i]); w.l[j] = Math.min(w.l[j], a.l[i]); w.c[j] = a.c[i]; w.v[j] += a.v[i]; }
    } return w;
  }

  /* ---------- 1. normalización ---------- */
  function normalize(raw) {
    const base = raw.assets.find(a => a.symbol === 'SPY') || raw.assets[0]; const n = base.dates.length;
    const ok = a => ['o', 'h', 'l', 'c', 'v'].every(k => a[k] && a[k].length === n) && a.c.every(x => isFinite(x) && x > 0) && a.h.every(x => isFinite(x) && x > 0) && a.l.every(x => isFinite(x) && x > 0) && a.v.every(x => isFinite(x) && x >= 0);
    const assets = raw.assets.filter(ok).map(a => ({ ...a, realBars: a.realBars || n }));
    return { meta: { ...raw.meta, rejected: raw.assets.length - assets.length }, assets, n, dates: base.dates };
  }

  /* ---------- 2. indicadores por activo ---------- */
  function computeIndicators(a, cfg) {
    const I = cfg.indicators; a.ind = {};
    I.sma.forEach(p => { a.ind['sma' + p] = sma(a.c, p); });
    I.ema.forEach(p => { a.ind['ema' + p] = ema(a.c, p); });
    a.ind.atr = atr(a.h, a.l, a.c, I.atr); a.ind.rsi = rsi(a.c, I.rsi);
    a.ind.macd = macd(a.c, I.macd.fast, I.macd.slow, I.macd.signal);
    a.w = toWeekly(a); a.wind = {};
    I.weeklyEma.forEach(p => { a.wind['ema' + p] = ema(a.w.c, p); });
    const minW = Math.max(...I.weeklyEma) * 5 + 20; if (a.realBars < minW) { const k = 'ema' + Math.max(...I.weeklyEma); a.wind[k] = a.wind[k].map(() => null); }
    a.wind.rci = rci(a.w.c, I.rci.period); a.wind.rciSig = sma(a.wind.rci.map(x => nz(x) ? x : 0), I.rci.signalPeriod).map((x, i) => i < I.rci.period - 1 + I.rci.signalPeriod - 1 ? null : x);
    a.wind.macd = macd(a.w.c, I.macd.fast, I.macd.slow, I.macd.signal);
  }

  /* ---------- 3. fuerza relativa ---------- */
  function computeRS(assets, bench, cfg) {
    const R = cfg.rs, n = bench.c.length, H = R.history;
    const stocks = assets.filter(a => a.type === 'stock');
    const sc = (a, t) => { let s = 0; for (let k = 0; k < R.lookbacks.length; k++) { const lb = R.lookbacks[k]; if (t - lb < 0) return null; s += R.weights[k] * ((a.c[t] / a.c[t - lb] - 1) - (bench.c[t] / bench.c[t - lb] - 1)); } return s; };
    assets.forEach(a => { a.rsHist = []; a.rsLine = a.c.map((x, i) => x / bench.c[i]); });
    for (let t = n - H; t < n; t++) {
      const arr = stocks.map(a => sc(a, t)).filter(nz).sort((x, y) => x - y);
      assets.forEach(a => {
        const s = sc(a, t); if (s === null) { a.rsHist.push(null); return; }
        let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < s) lo = m + 1; else hi = m; }
        a.rsHist.push(100 * lo / Math.max(1, arr.length - 1));
      });
    }
    assets.forEach(a => { a.rsHist = a.rsHist.map(x => nz(x) ? clamp(x, 0, 100) : null); });
  }

  /* ---------- 4. patrón VCP/BCP (aproximación configurable) ---------- */
  function detectVCP(a, cfg, relVolNow) {
    const V = cfg.vcp, n = a.c.length, c = a.c, h = a.h, l = a.l;
    const none = { status: 'none', confidence: 0, contractions: [], pivot: null, baseLow: null, priorRun: 0, pivotIdx: null, label: 'Sin setup' };
    const from = Math.max(0, n - V.lookback), to = n - 1 - V.skipRecent;
    if (to - from < 30) return none;
    let ih = from; for (let i = from; i <= to; i++) if (h[i] >= h[ih]) ih = i;
    const pivot = h[ih];
    if (n - 1 - ih < V.minBaseDays) return none;
    // contracciones por zigzag sobre cierres
    const thr = V.swingPct / 100; const con = [];
    let hiI = ih, hiV = c[ih], loI = ih, loV = c[ih], dec = false;
    for (let i = ih + 1; i < n; i++) {
      if (!dec) { if (c[i] > hiV) { hiV = c[i]; hiI = i; loV = c[i]; loI = i; } else if (c[i] < hiV * (1 - thr)) { dec = true; loV = c[i]; loI = i; } }
      else { if (c[i] < loV) { loV = c[i]; loI = i; } else if (c[i] > loV * (1 + thr)) { con.push({ from: hiI, to: loI, depth: (hiV - loV) / hiV * 100 }); dec = false; hiV = c[i]; hiI = i; loV = c[i]; loI = i; } }
    }
    if (dec) con.push({ from: hiI, to: loI, depth: (hiV - loV) / hiV * 100, open: true });
    const nC = con.length; const W = V.weights;
    const sCount = nC === 0 ? 0 : nC === 1 ? 0.35 : nC === 2 ? 0.8 : 1;
    let dcr = 0; if (nC >= 2) { let ok = 0; for (let i = 1; i < nC; i++) if (con[i].depth <= con[i - 1].depth * 0.95) ok++; dcr = ok / (nC - 1); }
    const vr = avg(a.v.slice(-50)) > 0 ? avg(a.v.slice(-10)) / avg(a.v.slice(-50)) : 1; const sVol = clamp((1 - vr) / 0.35, 0, 1);
    const price = c[n - 1]; const dist = (pivot - price) / pivot * 100; const sProx = dist < 0 ? clamp(1 + dist / 10, 0, 1) : clamp(1 - dist / V.maxDistPct, 0, 1);
    const p0 = Math.max(0, ih - 120); const priorRun = (c[ih] / c[p0] - 1) * 100; const sPrior = clamp((priorRun - 10) / (V.minPriorRunPct + 10), 0, 1);
    let conf = W.count * sCount + W.decreasing * dcr + W.volume * sVol + W.proximity * sProx + W.prior * sPrior;
    const s50 = last(a.ind.sma50), e200 = last(a.ind.ema200);
    if ((nz(s50) && price < s50) || (nz(e200) && price < e200)) conf *= 0.5;
    const ext = (price / pivot - 1) * 100; let status = 'forming';
    if (price > pivot && ext <= V.maxExtendedPct) status = 'breakout'; else if (ext > V.maxExtendedPct) { status = 'extended'; conf *= 0.5; }
    const baseLow = Math.min(...l.slice(ih));
    const label = conf >= V.labelHigh ? 'Posible VCP' : conf >= V.labelMid ? 'Setup potencial' : 'Sin setup';
    return { status, confidence: clamp(conf, 0, 1), contractions: con, pivot, baseLow, priorRun, pivotIdx: ih, label, components: { count: sCount, decreasing: dcr, volume: sVol, proximity: sProx, prior: sPrior } };
  }

  /* ---------- 5. features ---------- */
  function relVolAt(a, i, n) { const s = a.v.slice(Math.max(0, i - n), i); const m = s.length ? avg(s) : 0; return m > 0 ? a.v[i] / m : 1; }
  function computeFeatures(a, bench, cfg) {
    const n = a.c.length, c = a.c, ind = a.ind, f = {};
    f.close = last(c); f.prevClose = at(c, 1); f.dayChg = (f.close / f.prevClose - 1) * 100;
    cfg.indicators.sma.forEach(p => { f['sma' + p] = last(ind['sma' + p]); });
    f.ema200 = last(ind.ema200); f.wema10 = last(a.wind.ema10); f.wema200 = last(a.wind.ema200);
    if (!nz(f.wema200)) f.wema200 = null;
    const pctSlope = (arr, k) => { const x = at(arr, k), y = last(arr); return nz(x) && nz(y) ? (y / x - 1) * 100 : null; };
    f.slope50 = pctSlope(ind.sma50, 20); f.slope200 = pctSlope(ind.ema200, 20);
    f.distEma200 = nz(f.ema200) ? (f.close / f.ema200 - 1) * 100 : null; f.distSma50 = (f.close / f.sma50 - 1) * 100;
    f.belowSma50 = f.close < f.sma50; f.belowEma200 = nz(f.ema200) && f.close < f.ema200;
    const hh1 = Math.max(...a.h.slice(-40)), hh0 = Math.max(...a.h.slice(-80, -40)), ll1 = Math.min(...a.l.slice(-40)), ll0 = Math.min(...a.l.slice(-80, -40));
    f.hhhl = hh1 > hh0 && ll1 > ll0;
    f.atr = last(ind.atr); f.atrPct = f.atr / f.close * 100; f.atrRatio = f.atr / at(ind.atr, 40);
    const rg = i => (a.h[i] - a.l[i]) / a.c[i]; const rr = [];
    for (let i = n - 40; i < n; i++) rr.push(rg(i)); f.rangeRatio = avg(rr.slice(-10)) / avg(rr);
    f.volRatio = avg(a.v.slice(-50)) > 0 ? avg(a.v.slice(-10)) / avg(a.v.slice(-50)) : 1;
    const rets = c.map((x, i) => i ? Math.log(x / c[i - 1]) : 0); f.hv10 = stdev(rets.slice(-10)); f.hv60 = stdev(rets.slice(-60)); f.hvRatio = f.hv60 > 0 ? f.hv10 / f.hv60 : 1;
    const t10 = c.slice(-10); f.tight10 = (Math.max(...t10) - Math.min(...t10)) / f.close * 100;
    f.rsi = last(ind.rsi); f.rciW = last(a.wind.rci); f.rciSig = last(a.wind.rciSig);
    f.volume = last(a.v); f.avgVol20 = avg(a.v.slice(-21, -1)) || 1; f.relVol = f.volume / f.avgVol20; f.volPct = (f.relVol - 1) * 100;
    // RS
    const R = cfg.rs, H = a.rsHist; f.rsRating = last(H);
    f.rsChange5 = nz(at(H, R.weeklyWindow)) ? f.rsRating - at(H, R.weeklyWindow) : 0; f.rsChange21 = nz(at(H, R.monthlyWindow)) ? f.rsRating - at(H, R.monthlyWindow) : 0;
    const rl = a.rsLine, rav = sma(rl, R.avgPeriod); f.rsLine = last(rl); f.rsVsAvg50 = (last(rl) / last(rav) - 1) * 100;
    f.rsFromHigh = (1 - last(rl) / Math.max(...rl.slice(-252))) * 100;
    const r20 = (c[n - 1] / c[n - 21] - 1) * 100, b20 = (bench.c[n - 1] / bench.c[n - 21] - 1) * 100; f.ret20 = r20; f.outperf20 = r20 - b20;
    f.rsState = r20 > 0 ? (r20 > b20 ? 'Sube más que el mercado' : 'Sube, pero rinde menos') : (r20 > b20 ? 'Baja menos que el mercado' : 'Pierde fuerza vs mercado');
    f.ret5 = (c[n - 1] / c[n - 6] - 1) * 100; f.ret21 = r20;
    // 52s
    f.high52 = Math.max(...a.h.slice(-252)); f.low52 = Math.min(...a.l.slice(-252)); f.distHigh52 = (1 - f.close / f.high52) * 100;
    // VCP / setups
    const vcp = detectVCP(a, cfg, f.relVol); a.vcp = vcp; f.vcpConfidence = vcp.confidence; f.priorRun = vcp.priorRun;
    f.distPivot = vcp.pivot ? (vcp.pivot - f.close) / vcp.pivot * 100 : 40;
    const prior60 = Math.max(...a.h.slice(-63, -3)); let brk = false;
    for (let k = 0; k < 3; k++) { const i = n - 1 - k; if (a.c[i] > prior60 && relVolAt(a, i, 20) >= cfg.volume.unusualRel * 0.87) brk = true; }
    f.breakout = brk; f.pullback = Math.abs(f.close / f.sma21 - 1) < 0.03 && f.close > f.sma50 && f.sma21 > f.sma50 && f.slope50 > 0;
    f.rciDivergence = rciDivergence(a);
    return f;
  }
  function rciDivergence(a) {
    const c = a.w.c, r = a.wind.rci, n = c.length, pk = [];
    for (let i = Math.max(2, n - 32); i < n - 2; i++) if (c[i] >= c[i - 1] && c[i] >= c[i - 2] && c[i] >= c[i + 1] && c[i] >= c[i + 2] && nz(r[i])) pk.push(i);
    if (pk.length < 2) return false; const p = pk[pk.length - 1], q = pk[pk.length - 2];
    return c[p] > c[q] && r[p] < r[q] - 5;
  }

  /* ---------- 6. señales ---------- */
  function crossInfo(c, ma, look) {
    const n = c.length; for (let k = 0; k < look; k++) { const i = n - 1 - k; if (i < 1 || !nz(ma[i]) || !nz(ma[i - 1])) break;
      if (c[i - 1] <= ma[i - 1] && c[i] > ma[i]) return { dir: 'up', idx: i, ago: k }; if (c[i - 1] >= ma[i - 1] && c[i] < ma[i]) return { dir: 'down', idx: i, ago: k }; } return null;
  }
  function seriesCross(x, y, look) {
    const n = x.length; for (let k = 0; k < look; k++) { const i = n - 1 - k; if (i < 1 || !nz(x[i]) || !nz(y[i]) || !nz(x[i - 1]) || !nz(y[i - 1])) break;
      if (x[i - 1] <= y[i - 1] && x[i] > y[i]) return { dir: 'up', idx: i, ago: k }; if (x[i - 1] >= y[i - 1] && x[i] < y[i]) return { dir: 'down', idx: i, ago: k }; } return null;
  }
  function computeSignals(a, f, cfg) {
    const S = cfg.signals, n = a.c.length, sig = {};
    // EMA200 diaria: rebote
    const T = S.ema200Touch, e = a.ind.ema200; sig.ema200Bounce = null;
    if (nz(f.ema200) && f.close > f.ema200 && (!T.requireUpSlope || f.slope200 > 0)) {
      for (let k = 0; k < T.lookback; k++) { const i = n - 1 - k; if (!nz(e[i])) break; const tol = T.tolerancePct / 100;
        if (a.l[i] <= e[i] * (1 + tol) && a.l[i] >= e[i] * (1 - tol) && a.c[i] >= e[i] * 0.995) {
          const rsIdx = a.rsHist.length - 1 - k; const rsSince = rsIdx >= 0 && nz(a.rsHist[rsIdx]) ? last(a.rsHist) - a.rsHist[rsIdx] : null;
          sig.ema200Bounce = { date: a.dates[i], ago: k, dist: f.distEma200, rsSince, rsLineSince: (last(a.rsLine) / a.rsLine[i] - 1) * 100, vol: a.v[i], relVol: relVolAt(a, i, 20) }; break; } }
    }
    f.ema200Bounce = !!sig.ema200Bounce;
    // Cruce 200 diario
    const maArr = a.ind[S.cross.ma] || e; const cr = crossInfo(a.c, maArr, S.cross.lookback);
    sig.cross200 = cr ? { dir: cr.dir, date: a.dates[cr.idx], ago: cr.ago, dist: f.distEma200 } : null;
    // Semanal
    const wc = a.w.c, we = a.wind.ema200, wn = wc.length; sig.weekly200 = null; sig.weeklyCross = null;
    if (nz(last(we))) {
      const W = S.weeklyTouch;
      for (let k = 0; k < W.lookback; k++) { const i = wn - 1 - k; if (!nz(we[i])) break; const tol = W.tolerancePct / 100;
        if (a.w.l[i] <= we[i] * (1 + tol) && a.w.l[i] >= we[i] * (1 - tol) && wc[wn - 1] > last(we)) { sig.weekly200 = { date: a.w.d[i], ago: k, dist: (wc[wn - 1] / last(we) - 1) * 100, vol: a.w.v[i] }; break; } }
      const wcr = crossInfo(wc, we, S.cross.weeklyLookback); if (wcr) sig.weeklyCross = { dir: wcr.dir, date: a.w.d[wcr.idx], ago: wcr.ago, dist: (wc[wn - 1] / last(we) - 1) * 100 };
    }
    // RCI semanal
    const rc = seriesCross(a.wind.rci, a.wind.rciSig, S.rciCross.lookbackWeeks);
    sig.rci = { value: f.rciW, signal: f.rciSig, cross: rc ? { dir: rc.dir, date: a.w.d[rc.idx], ago: rc.ago } : null };
    // MACD
    const md = seriesCross(a.ind.macd.line, a.ind.macd.sig, S.macd.lookback), mw = seriesCross(a.wind.macd.line, a.wind.macd.sig, S.macd.weeklyLookback);
    sig.macdD = md ? { dir: md.dir, date: a.dates[md.idx], ago: md.ago } : null; sig.macdW = mw ? { dir: mw.dir, date: a.w.d[mw.idx], ago: mw.ago } : null;
    return sig;
  }

  /* ---------- 7. scoring configurable ---------- */
  function evalRule(r, f) {
    let v;
    if (r.type === 'above' || r.type === 'gt') { const x = f[r.a], y = f[r.b]; if (!nz(x) || !nz(y)) return null; v = x > y ? 1 : 0; }
    else if (r.type === 'bool') v = f[r.f] ? 1 : 0;
    else { const x = f[r.f]; if (!nz(x)) return null; v = clamp((x - r.lo) / (r.hi - r.lo), 0, 1); }
    return v;   // null = sin dato: la regla no cuenta (ni suma ni resta) y su peso se excluye
  }
  function computeScore(f, cfg) {
    const P = cfg.score.pillars, out = { pillars: {}, detail: {} };
    for (const key of ['trend', 'rs', 'contraction', 'setup']) {
      const p = P[key]; let sw = 0, sv = 0; const det = [];
      p.rules.forEach(r => { const v = evalRule(r, f); if (v !== null) { sw += r.w; sv += r.w * v; } det.push({ id: r.id, label: r.label, w: r.w, v, pts: 0 }); });
      det.forEach(d => { d.pts = sw && d.v !== null ? p.max * d.w * d.v / sw : 0; });
      out.pillars[key] = sw ? p.max * sv / sw : 0; out.detail[key] = det;
    }
    const g = cfg.score.gate; out.gated = false;
    if (out.pillars.trend / P.trend.max * 100 < g.trendMinPct) { out.pillars.contraction *= g.factor; out.pillars.setup *= g.factor; out.gated = true; }
    out.base = out.pillars.trend + out.pillars.rs + out.pillars.contraction + out.pillars.setup;
    const cpct = out.pillars.contraction / P.contraction.max * 100, L = cfg.score.labels;
    out.contraction = out.gated && cpct < L.weak ? 'Ninguna' : cpct >= L.strong ? 'Fuerte' : cpct >= L.moderate ? 'Moderada' : cpct >= L.weak ? 'Débil' : 'Ninguna';
    return out;
  }
  function computeWarnings(f, cfg) {
    const w = []; cfg.warnings.forEach(d => {
      const x = f[d.f]; let on = false;
      if (d.type === 'flag') on = !!x; else if (d.type === 'gt') on = nz(x) && x > d.v; else if (d.type === 'lt') on = nz(x) && x < d.v;
      if (on) w.push({ id: d.id, label: d.label, penalty: d.penalty });
    }); return w;
  }

  /* ---------- 8. vistas agregadas ---------- */
  function rotationData(model, cfg) {
    const R = cfg.rotation, bench = model.bench, out = [];
    model.sectorEtfs.forEach(e => {
      const rsw = e.w.c.map((x, i) => x / bench.w.c[i]); const rs = sma(rsw, R.ratioSma);
      const X = rsw.map((x, i) => nz(rs[i]) ? 100 * x / rs[i] : null); const ms = sma(X.map(x => nz(x) ? x : 0), R.momSma);
      const first = X.findIndex(nz) + R.momSma - 1;
      const Y = X.map((x, i) => nz(x) && i >= first ? 100 * x / ms[i] : null);
      const pts = []; for (let i = e.w.c.length - R.weeks; i < e.w.c.length; i++) if (i >= 0 && nz(X[i]) && nz(Y[i])) pts.push({ x: X[i], y: Y[i], d: e.w.d[i] });
      const p = last(pts); const q = p.x >= 100 ? (p.y >= 100 ? 'Leading' : 'Weakening') : (p.y >= 100 ? 'Improving' : 'Lagging');
      out.push({ symbol: e.symbol, sector: e.sector, pts, quad: q, x: p.x, y: p.y });
    }); return out;
  }
  function quadOf(x, y) { return x >= 100 ? (y >= 100 ? 'Leading' : 'Weakening') : (y >= 100 ? 'Improving' : 'Lagging'); }

  function regimeData(model, cfg) {
    const R = cfg.regime, spy = model.bench, qqq = model.map.QQQ, F = [];
    const st = (name, val, text) => F.push({ name, state: val, text });
    const f = spy.f; st('S&P 500 vs EMA 200', f.close > f.ema200 ? 1 : -1, f.close > f.ema200 ? 'Cotiza sobre su EMA 200' : 'Cotiza bajo su EMA 200');
    st('Pendiente de la SMA 50 del S&P 500', f.slope50 > 0 ? 1 : -1, 'Variación de la SMA 50 en 20 ruedas: ' + f.slope50.toFixed(2) + '%');
    if (qqq) { const q = qqq.f; st('Nasdaq 100 vs EMA 200', q.close > q.ema200 ? 1 : -1, q.close > q.ema200 ? 'Cotiza sobre su EMA 200' : 'Cotiza bajo su EMA 200'); }
    const stk = model.stocks; const b50 = 100 * stk.filter(a => a.f.close > a.f.sma50).length / stk.length, b200 = 100 * stk.filter(a => nz(a.f.ema200) && a.f.close > a.f.ema200).length / stk.length;
    const bs = x => x >= R.breadthBull ? 1 : x <= R.breadthBear ? -1 : 0;
    st('Amplitud: % sobre SMA 50', bs(b50), b50.toFixed(0) + '% de las acciones del universo'); st('Amplitud: % sobre EMA 200', bs(b200), b200.toFixed(0) + '% de las acciones del universo');
    st('Momentum del S&P 500 (20 ruedas)', f.ret20 > 0 ? 1 : -1, 'Retorno 20 ruedas: ' + f.ret20.toFixed(2) + '%');
    const rv = stdev(spy.c.slice(-21).map((x, i, a) => i ? Math.log(x / a[i - 1]) : 0).slice(1)) * Math.sqrt(252) * 100;
    st('Volatilidad realizada del S&P 500 (proxy; no hay VIX)', rv < R.volLow ? 1 : rv > R.volHigh ? -1 : 0, 'Anualizada 20 ruedas: ' + rv.toFixed(1) + '%');
    F.push({ name: 'Sentimiento / put-call ratio', state: null, text: 'Sin datos: requiere una fuente que no está conectada' });
    const av = F.filter(x => x.state !== null); const sc = av.reduce((s, x) => s + x.state, 0) / av.length;
    return { label: sc >= R.bullAt ? 'Alcista' : sc <= R.bearAt ? 'Bajista' : 'Neutral', score: sc, factors: F, breadth50: b50, breadth200: b200 };
  }

  function sessionsData(a, cfg) {
    const N = cfg.sessions.n, n = a.c.length, S = cfg.volume.significantRel; let pos = 0, neg = 0, pv = 0, nv = 0, rvs = [];
    for (let i = n - N; i < n; i++) { const up = a.c[i] > a.c[i - 1]; const rv = relVolAt(a, i, 20); rvs.push(rv); if (up) { pos++; if (rv >= S) pv++; } else { neg++; if (rv >= S) nv++; } }
    return { pos, neg, posVol: pv, negVol: nv, avgRel: avg(rvs), score: pv - nv };
  }

  /* ---------- pipeline ---------- */
  function build(raw, cfg) {
    const t0 = Date.now(); const norm = normalize(raw);
    const model = { cfg, meta: norm.meta, dates: norm.dates, assets: norm.assets, map: {} };
    model.assets.forEach(a => { model.map[a.symbol] = a; });
    model.bench = model.map[cfg.benchmark]; if (!model.bench) throw new Error('Benchmark no encontrado: ' + cfg.benchmark);
    computeRS(model.assets, model.bench, cfg);              // solo usa cierres
    model.assets.forEach(a => {
      computeIndicators(a, cfg);
      a.f = computeFeatures(a, model.bench, cfg); a.sig = computeSignals(a, a.f, cfg);
      a.score = computeScore(a.f, cfg); a.warn = computeWarnings(a.f, cfg);
      a.penalty = a.warn.reduce((s, x) => s + x.penalty, 0); a.net = Math.max(0, a.score.base - a.penalty);
      a.sess = sessionsData(a, cfg);
      if (a.type === 'stock') { a.ind = null; a.wind = null; a.w = null; }   // memoria: se recalculan al abrir la ficha (hydrate)
    });
    model.stocks = model.assets.filter(a => a.type === 'stock');
    model.sectorEtfs = model.assets.filter(a => a.type === 'etf' && a.industry === 'ETF sectorial');
    model.sectors = [...new Set(model.stocks.map(a => a.sector))];
    model.industries = [...new Set(model.stocks.map(a => a.industry))].sort();
    model.regime = regimeData(model, cfg); model.rotation = rotationData(model, cfg);
    model.sectorLeaders = model.sectors.map(s => {
      const m = model.stocks.filter(a => a.sector === s).sort((x, y) => y.f.rsRating - x.f.rsRating); const etf = model.sectorEtfs.find(e => e.sector === s);
      const rot = model.rotation.find(r => r.sector === s); return { sector: s, leader: m[0], count: m.length, etf: etf && etf.symbol, quad: rot && rot.quad };
    });
    model.sectorStats = model.sectors.map(sec => {
      const st = model.stocks.filter(a => a.sector === sec), n = st.length, mean = (arr, f) => arr.length ? arr.reduce((x, a) => x + f(a), 0) / arr.length : 0;
      const byNet = st.slice().sort((x, y) => y.net - x.net), rs = st.map(a => a.f.rsRating).sort((x, y) => x - y);
      const etf = model.sectorEtfs.find(e => e.sector === sec), rot = model.rotation.find(r => r.sector === sec);
      return { sector: sec, n, etf: etf && etf.symbol, quad: rot && rot.quad,
        avgScore: mean(st, a => a.net), top5: mean(byNet.slice(0, 5), a => a.net), medRS: rs[Math.floor(rs.length / 2)] || 0, avgRSchg: mean(st, a => a.f.rsChange5),
        pct50: 100 * st.filter(a => a.f.close > a.f.sma50).length / (n || 1), pct200: 100 * st.filter(a => nz(a.f.ema200) && a.f.close > a.f.ema200).length / (n || 1),
        vcp: st.filter(a => a.vcp.label === 'Posible VCP').length, brk: st.filter(a => a.f.breakout).length, leader: byNet[0] };
    });
    model.buildMs = Date.now() - t0; return model;
  }

  // Clave estable de la configuración (para saber si un historial guardado corresponde a la config actual)
  function cfgKey(cfg) { const t = JSON.stringify(cfg); let h = 5381; for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return String(h >>> 0); }

  // Recalcula el ranking como se habría visto en cada una de las últimas K ruedas (usa solo datos hasta ese día)
  // y devuelve, por día, las N acciones con mayor score neto.
  function historyTop(raw, cfg, K, N) {
    const n = raw.assets.find(a => a.symbol === cfg.benchmark).c.length, out = [];
    for (let k = K - 1; k >= 0; k--) {
      const cut = n - k;
      const r = { meta: raw.meta, assets: raw.assets.map(a => ({ ...a, dates: a.dates.slice(0, cut), o: a.o.slice(0, cut), h: a.h.slice(0, cut), l: a.l.slice(0, cut), c: a.c.slice(0, cut), v: a.v.slice(0, cut), realBars: Math.max(1, (a.realBars || n) - k) })) };
      const m = build(r, cfg);
      const top = m.stocks.slice().sort((x, y) => y.net - x.net || y.f.rsRating - x.f.rsRating).slice(0, N).map(a => [a.symbol, Math.round(a.net * 10) / 10]);
      out.push({ date: m.dates[m.dates.length - 1], top });
    }
    return out;
  }

  function hydrate(a, cfg) { if (!a.ind) computeIndicators(a, cfg); return a; }

  return { build, hydrate, cfgKey, historyTop, sma, ema, rci, macd, rsi, atr, quadOf, relVolAt, toWeekly };
})();

if (typeof module !== 'undefined') module.exports = { Engine };
