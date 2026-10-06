/* ============================================================
   UI — solo presentación. Lee el modelo del Engine; no calcula fórmulas.
   ============================================================ */
(async function () {
  const $ = s => document.querySelector(s);
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } }
  };
  let CFG = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  const saved = store.get('atalaya.config'); if (saved && saved.score && saved.indicators) CFG = saved;
  let RAW = null, M = null;
  const S = { view: 'market', prev: 'ranking', tables: {}, sig: 'ema200', rsWin: 'week', detail: null, rot: { sel: null, weeks: 16, frame: 16, playing: false, timer: null },
    filters: {}, watch: store.get('atalaya.watch') || {}, chart: null };
  const F0 = { q: '', sector: '', industry: '', minScore: '', pxMin: '', pxMax: '', capMin: '', ema200: '', sma50: '', minRS: '', minRSchg: '', minRelVol: '', setup: '', contraction: '', tf: 'all', warn: '' };
  S.filters = { ...F0 };

  /* ---------- formato ---------- */
  const nz = x => x !== null && x !== undefined && !isNaN(x);
  const nf = (x, d = 2) => nz(x) ? x.toLocaleString('es', { minimumFractionDigits: d, maximumFractionDigits: d }) : '–';
  const pc = (x, d = 2) => nz(x) ? `<span class="${x > 0.005 ? 'up' : x < -0.005 ? 'down' : 'mut'}">${x > 0 ? '+' : ''}${nf(x, d)}%</span>` : '–';
  const pp = (x, d = 1) => nz(x) ? `<span class="${x > 0.05 ? 'up' : x < -0.05 ? 'down' : 'mut'}">${x > 0 ? '+' : ''}${nf(x, d)}</span>` : '–';
  const vol = x => !nz(x) ? '–' : x >= 1e9 ? nf(x / 1e9, 2) + ' B' : x >= 1e6 ? nf(x / 1e6, 2) + ' M' : nf(x / 1e3, 0) + ' K';
  const cap = x => !nz(x) ? '–' : x >= 1e12 ? nf(x / 1e12, 2) + ' T' : nf(x / 1e9, 1) + ' MM';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const PCOL = { trend: 'var(--p-trend)', rs: 'var(--p-rs)', contraction: 'var(--p-con)', setup: 'var(--p-set)' };
  const PNAME = { trend: 'Tendencia', rs: 'Fuerza relativa', contraction: 'Contracción', setup: 'Setup' };
  function rib(a) {
    const P = M.cfg.score.pillars; const t = Object.keys(PNAME).map(k => `${PNAME[k]} ${nf(a.score.pillars[k], 1)}/${P[k].max}`).join(' · ');
    return `<span class="rib" title="${t}">` + Object.keys(PNAME).map(k => `<i style="--f:${Math.min(100, a.score.pillars[k] / P[k].max * 100)}%;--c:${PCOL[k]}"></i>`).join('') + '</span>';
  }
  const setupChip = a => a.vcp.label === 'Sin setup' ? '<span class="mut">–</span>' : `<span class="chip ${a.vcp.label === 'Posible VCP' ? 'up' : 'warn'}" title="Confianza ${(a.vcp.confidence * 100).toFixed(0)}% · ${a.vcp.status}">${a.vcp.label} ${(a.vcp.confidence * 100).toFixed(0)}%</span>`;
  const conChip = a => `<span class="chip ${a.score.contraction === 'Fuerte' ? 'up' : a.score.contraction === 'Moderada' ? 'warn' : ''}">${a.score.contraction}</span>`;
  const dirChip = d => d === 'up' ? '<span class="chip up">Alcista</span>' : '<span class="chip down">Bajista</span>';
  const warnCell = a => a.warn.length ? `<span class="warnc" title="${esc(a.warn.map(w => w.label).join('\n'))}">⚠ ${a.warn.length}${a.penalty ? ' (−' + a.penalty + ')' : ''}</span>` : '<span class="mut">–</span>';
  const ago = n => n === 0 ? 'hoy' : n === 1 ? 'hace 1' : 'hace ' + n;

  /* ---------- filtros ---------- */
  function filtered(list) {
    const f = S.filters, num = x => x === '' ? null : +x;
    const q = f.q.trim().toLowerCase(), ms = num(f.minScore), p0 = num(f.pxMin), p1 = num(f.pxMax), mc = num(f.capMin), mr = num(f.minRS), mg = num(f.minRSchg), mv = num(f.minRelVol);
    return list.filter(a => {
      const x = a.f;
      if (q && !(a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q))) return false;
      if (f.sector && a.sector !== f.sector) return false; if (f.industry && a.industry !== f.industry) return false;
      if (ms !== null && a.net < ms) return false; if (p0 !== null && x.close < p0) return false; if (p1 !== null && x.close > p1) return false;
      if (mc !== null && !(a.marketCap && a.marketCap >= mc * 1e9)) return false;
      if (f.ema200 === 'above' && !(x.close > x.ema200)) return false; if (f.ema200 === 'below' && !(x.close < x.ema200)) return false;
      if (f.sma50 === 'above' && !(x.close > x.sma50)) return false; if (f.sma50 === 'below' && !(x.close < x.sma50)) return false;
      if (mr !== null && x.rsRating < mr) return false; if (mg !== null && x.rsChange5 < mg) return false; if (mv !== null && x.relVol < mv) return false;
      if (f.setup === 'vcp' && a.vcp.label !== 'Posible VCP') return false; if (f.setup === 'any' && a.vcp.label === 'Sin setup') return false;
      if (f.setup === 'breakout' && !x.breakout) return false; if (f.setup === 'pullback' && !x.pullback) return false;
      if (f.contraction && a.score.contraction !== f.contraction) return false;
      if (f.warn === 'none' && a.warn.length) return false; if (f.warn === 'any' && !a.warn.length) return false;
      return true;
    });
  }
  const activeCount = () => Object.keys(F0).filter(k => k !== 'tf' && S.filters[k] !== F0[k]).length + (S.filters.tf !== 'all' ? 1 : 0);
  function renderFilters() {
    const f = S.filters, opt = (v, t, cur) => `<option value="${v}"${cur === v ? ' selected' : ''}>${t}</option>`;
    const inp = (k, lab, ph, w) => `<label>${lab}<input data-f="${k}" value="${esc(f[k])}" placeholder="${ph || ''}" inputmode="decimal"></label>`;
    const sel = (k, lab, opts) => `<label>${lab}<select data-f="${k}">${opts.map(o => opt(o[0], o[1], f[k])).join('')}</select></label>`;
    $('#filters').innerHTML = `<details class="fbar"${S.fopen ? ' open' : ''}><summary>Filtros ${activeCount() ? `<span class="badge">${activeCount()}</span>` : ''} <span class="note">se aplican a Ranking, Señales, Fuerza relativa y Sesiones</span></summary>
    <div class="fgrid">
      <label>Ticker o nombre<input data-f="q" value="${esc(f.q)}" placeholder="p. ej. NVDA"></label>
      ${sel('sector', 'Sector', [['', 'Todos'], ...M.sectors.map(s => [s, s])])}
      ${sel('industry', 'Industria', [['', 'Todas'], ...M.industries.map(s => [s, s])])}
      ${inp('minScore', 'Score mínimo', '0–100')}${inp('pxMin', 'Precio desde')}${inp('pxMax', 'Precio hasta')}${inp('capMin', 'Cap. mín. (miles de M)', 'p. ej. 50')}
      ${sel('ema200', 'Vs EMA 200', [['', 'Todas'], ['above', 'Por encima'], ['below', 'Por debajo']])}
      ${sel('sma50', 'Vs SMA 50', [['', 'Todas'], ['above', 'Por encima'], ['below', 'Por debajo']])}
      ${inp('minRS', 'RS rating mín.', '0–100')}${inp('minRSchg', 'Cambio RS 1s mín.', 'p. ej. 3')}${inp('minRelVol', 'Vol. relativo mín.', 'p. ej. 1.5')}
      ${sel('setup', 'Setup', [['', 'Todos'], ['any', 'Cualquier setup'], ['vcp', 'Posible VCP'], ['breakout', 'Ruptura reciente'], ['pullback', 'Pullback']])}
      ${sel('contraction', 'Contracción', [['', 'Todas'], ['Fuerte', 'Fuerte'], ['Moderada', 'Moderada'], ['Débil', 'Débil'], ['Ninguna', 'Ninguna']])}
      ${sel('tf', 'Timeframe (señales)', [['all', 'Diario y semanal'], ['D', 'Solo diario'], ['W', 'Solo semanal']])}
      ${sel('warn', 'Warnings', [['', 'Todas'], ['none', 'Sin warnings'], ['any', 'Con warnings']])}
      <label>&nbsp;<button class="ghost" data-act="clearF">Limpiar filtros</button></label>
    </div></details>`;
  }

  /* ---------- tablas genéricas ---------- */
  function table(id, cols, rows, o = {}) {
    const st = S.tables[id] || (S.tables[id] = { key: o.sort || cols[0].k, dir: o.dir || -1, page: 0 });
    const col = cols.find(c => c.k === st.key) || cols[0];
    const sorted = rows.slice().sort((a, b) => { const x = col.v(a), y = col.v(b); if (!nz(x) && !nz(y)) return 0; if (!nz(x)) return 1; if (!nz(y)) return -1; return (typeof x === 'string' ? x.localeCompare(y) : x - y) * st.dir; });
    const ps = o.page || 25, pages = Math.max(1, Math.ceil(sorted.length / ps)); st.page = Math.min(st.page, pages - 1);
    const slice = o.nopage ? sorted : sorted.slice(st.page * ps, st.page * ps + ps);
    if (!rows.length) return `<div class="empty">${o.empty || 'Ningún activo cumple las condiciones con los filtros actuales.'}</div>`;
    return `<div class="tw"><table><thead><tr>${cols.map(c => `<th class="${c.n ? 'n' : ''}${c.k === st.key ? ' on' : ''}" data-sort="${id}|${c.k}">${c.t}${c.k === st.key ? (st.dir < 0 ? ' ↓' : ' ↑') : ''}</th>`).join('')}</tr></thead>
    <tbody>${slice.map(r => `<tr data-sym="${r.symbol || (r.a && r.a.symbol) || ''}">${cols.map(c => `<td class="${c.n ? 'n' : ''} ${c.cls || ''}">${c.f(r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    ${!o.nopage && pages > 1 ? `<div class="pager"><span>${sorted.length} resultados · página ${st.page + 1} de ${pages}</span><button data-pg="${id}|-1"${st.page === 0 ? ' disabled' : ''}>Anterior</button><button data-pg="${id}|1"${st.page >= pages - 1 ? ' disabled' : ''}>Siguiente</button></div>` : `<div class="pager"><span>${sorted.length} resultados</span></div>`}`;
  }
  const C = {
    sym: { k: 'symbol', t: 'Ticker', cls: 'sym', f: a => a.symbol, v: a => a.symbol },
    nm: { k: 'name', t: 'Nombre', cls: 'nm', f: a => esc(a.name), v: a => a.name },
    sec: { k: 'sector', t: 'Sector', cls: 'nm', f: a => esc(a.sector), v: a => a.sector },
    px: { k: 'px', t: 'Precio', n: 1, f: a => nf(a.f.close), v: a => a.f.close },
    chg: { k: 'chg', t: 'Día', n: 1, f: a => pc(a.f.dayChg), v: a => a.f.dayChg },
    vol: { k: 'vol', t: 'Volumen', n: 1, f: a => vol(a.f.volume), v: a => a.f.volume },
    rv: { k: 'rv', t: 'Vol. rel.', n: 1, f: a => nf(a.f.relVol) + 'x', v: a => a.f.relVol },
    score: { k: 'score', t: 'Score', n: 1, f: a => `<span class="score">${nf(a.net, 0)}</span> ${rib(a)}`, v: a => a.net },
    rs: { k: 'rs', t: 'RS', n: 1, f: a => nf(a.f.rsRating, 0), v: a => a.f.rsRating },
    warn: { k: 'warn', t: 'Warnings', f: warnCell, v: a => a.warn.length }
  };

  /* ---------- vistas ---------- */
  function vMarket() {
    const b = M.cfg.benchmarks.map(s => M.map[s]).filter(Boolean);
    const snap = b.map(a => `<div class="card snap" data-sym="${a.symbol}" style="cursor:pointer"><div class="sym">${a.symbol} <span class="note">${esc(a.name)}</span></div><div class="px">${nf(a.f.close)}</div><div class="chg"><span>1d ${pc(a.f.dayChg)}</span><span>1s ${pc(a.f.ret5)}</span><span>1m ${pc(a.f.ret21)}</span></div></div>`).join('');
    const R = M.regime, cls = R.label === 'Alcista' ? 'up' : R.label === 'Bajista' ? 'down' : 'warnc';
    const fac = R.factors.map(x => `<li><span class="dot ${x.state === null ? '' : x.state > 0 ? 'p' : x.state < 0 ? 'n' : 'z'}"></span><span><b>${x.name}</b><br><span class="note">${x.text}</span></span></li>`).join('');
    const st = M.stocks, top = (arr, n = 8) => arr.slice(0, n);
    const mini = (id, cols, rows, sort, dir) => table(id, cols, rows, { nopage: true, sort, dir });
    const gain = top(st.slice().sort((a, b) => b.f.dayChg - a.f.dayChg)), lose = top(st.slice().sort((a, b) => a.f.dayChg - b.f.dayChg));
    const ob = top(st.slice().sort((a, b) => b.f.rsi - a.f.rsi)), os = top(st.slice().sort((a, b) => a.f.rsi - b.f.rsi));
    const gl = [C.sym, C.nm, C.px, C.chg, C.vol, C.rv];
    const rsiC = [C.sym, { k: 'rsi', t: 'RSI 14', n: 1, f: a => nf(a.f.rsi, 1), v: a => a.f.rsi }, { k: 'rci', t: 'RCI sem.', n: 1, f: a => nf(a.f.rciW, 0), v: a => a.f.rciW }, C.chg];
    const asOf = new Date(M.meta.asOf + 'T00:00:00Z');
    const earn = top(st.filter(a => a.earningsDate && a.earningsDate >= M.meta.asOf).sort((a, b) => a.earningsDate.localeCompare(b.earningsDate)), 8);
    const earnC = [C.sym, C.nm, { k: 'ed', t: 'Fecha', f: a => a.earningsDate, v: a => a.earningsDate }, { k: 'dl', t: 'Días', n: 1, f: a => Math.round((new Date(a.earningsDate + 'T00:00:00Z') - asOf) / 864e5), v: a => a.earningsDate }];
    const uv = M.assets.slice().sort((a, b) => b.f.relVol - a.f.relVol).slice(0, 12);
    const uvC = [C.sym, { k: 'cv', t: 'Vol. actual', n: 1, f: a => vol(a.f.volume), v: a => a.f.volume }, { k: 'av', t: 'Prom. 20d', n: 1, f: a => vol(a.f.avgVol20), v: a => a.f.avgVol20 }, { k: 'rv', t: 'Relativo', n: 1, f: a => nf(a.f.relVol) + 'x', v: a => a.f.relVol }, { k: 'pt', t: 'vs prom.', n: 1, f: a => pc(a.f.volPct, 0), v: a => a.f.volPct }];
    return `<div class="card regime"><div><h3>Régimen de mercado</h3><div class="verdict ${cls}">${R.label}</div><p class="note">Resumen de ${R.factors.filter(x => x.state !== null).length} factores sobre el universo cargado. Es contexto, no una predicción.</p></div><ul>${fac}</ul></div>
    <div class="grid g4" style="margin-top:12px">${snap}</div>
    <div class="grid g2" style="margin-top:12px">
      <div class="card"><h2>Mayores subas del día</h2>${mini('gain', gl, gain, 'chg', -1)}</div><div class="card"><h2>Mayores bajas del día</h2>${mini('lose', gl, lose, 'chg', 1)}</div>
      <div class="card"><h2>Sobrecomprados (RSI más alto)</h2>${mini('ob', rsiC, ob, 'rsi', -1)}</div><div class="card"><h2>Sobrevendidos (RSI más bajo)</h2>${mini('os', rsiC, os, 'rsi', 1)}</div>
      <div class="card"><h2>Volumen inusual</h2>${mini('uv', uvC, uv, 'rv', -1)}<p class="note">Relativo = volumen de hoy ÷ promedio de las 20 ruedas previas. Incluye ETFs.</p></div>
      <div class="card"><h2>Próximos earnings</h2>${mini('earn', earnC, earn, 'ed', 1)}<p class="note">${M.meta.simulated ? 'Fechas simuladas.' : earn.length ? 'Fuente: Yahoo Finance (perfiles).' : 'Sin fechas: corré build_data.py con --profiles.'}</p></div>
    </div>`;
  }

  function vRanking() {
    const rows = filtered(M.assets); const P = M.cfg.score.pillars;
    const pil = k => ({ k: 'p_' + k, t: PNAME[k].slice(0, 4) + '.', n: 1, f: a => `<span style="color:${PCOL[k]}">${nf(a.score.pillars[k], 0)}</span>`, v: a => a.score.pillars[k] });
    const cols = [C.sym, C.nm, C.sec, C.px, C.chg, C.score, pil('trend'), pil('rs'), pil('contraction'), pil('setup'), { k: 'setup', t: 'Setup', f: setupChip, v: a => a.vcp.confidence }, { k: 'con', t: 'Contracción', f: conChip, v: a => a.score.pillars.contraction }, C.rs, C.rv, C.warn];
    return `<div class="card" style="margin-bottom:12px"><h2>Ranking por score</h2><p class="note">Un score alto significa que el activo cumple muchas de las condiciones que el sistema considera interesantes. No es una señal de compra: los patrones pueden fallar, el contexto de mercado importa y el gráfico debe revisarse a mano. Score = suma de cuatro pilares (máx. 25 c/u) menos penalidades de warnings. Pasá el cursor sobre la cinta para ver cada pilar.</p></div>${table('rank', cols, rows, { sort: 'score' })}`;
  }

  function vSignals() {
    const tf = S.filters.tf; const tabs = [['ema200', 'EMA 200 diaria', 'D'], ['cross', 'Cruce 200 diario', 'D'], ['w200', 'EMA 200 semanal', 'W'], ['rci', 'RCI semanal', 'W'], ['macd', 'MACD', 'DW']].filter(t => tf === 'all' || t[2].includes(tf));
    if (!tabs.find(t => t[0] === S.sig)) S.sig = tabs[0][0];
    const all = filtered(M.assets); let body = '';
    const base = [C.sym, C.nm];
    if (S.sig === 'ema200') {
      const rows = all.filter(a => a.sig.ema200Bounce);
      body = table('s_ema', [...base, { k: 'd', t: 'Contacto', f: a => a.sig.ema200Bounce.date, v: a => a.sig.ema200Bounce.date }, { k: 'ag', t: 'Hace (ruedas)', n: 1, f: a => ago(a.sig.ema200Bounce.ago), v: a => -a.sig.ema200Bounce.ago }, { k: 'ds', t: 'Dist. actual', n: 1, f: a => pc(a.sig.ema200Bounce.dist), v: a => a.sig.ema200Bounce.dist }, { k: 'rs', t: 'Δ RS desde contacto', n: 1, f: a => pp(a.sig.ema200Bounce.rsSince), v: a => a.sig.ema200Bounce.rsSince }, { k: 'rl', t: 'Línea RS desde contacto', n: 1, f: a => pc(a.sig.ema200Bounce.rsLineSince), v: a => a.sig.ema200Bounce.rsLineSince }, { k: 'vc', t: 'Vol. contacto', n: 1, f: a => vol(a.sig.ema200Bounce.vol), v: a => a.sig.ema200Bounce.vol }, { k: 'rv', t: 'Vol. rel. contacto', n: 1, f: a => nf(a.sig.ema200Bounce.relVol) + 'x', v: a => a.sig.ema200Bounce.relVol }, C.score], rows, { sort: 'ag', empty: 'No hay rebotes sobre la EMA 200 en la ventana configurada.' });
    } else if (S.sig === 'cross') {
      const rows = all.filter(a => a.sig.cross200);
      body = table('s_cross', [...base, { k: 'dir', t: 'Cruce', f: a => dirChip(a.sig.cross200.dir), v: a => a.sig.cross200.dir }, { k: 'd', t: 'Fecha', f: a => a.sig.cross200.date, v: a => a.sig.cross200.date }, { k: 'ag', t: 'Hace (ruedas)', n: 1, f: a => ago(a.sig.cross200.ago), v: a => -a.sig.cross200.ago }, { k: 'ds', t: 'Dist. actual', n: 1, f: a => pc(a.sig.cross200.dist), v: a => a.sig.cross200.dist }, C.score], rows, { sort: 'ag', empty: 'No hay cruces recientes de la media de 200.' });
    } else if (S.sig === 'w200') {
      const rows = []; all.forEach(a => { if (a.sig.weekly200) rows.push({ a, symbol: a.symbol, t: 'Rebote', s: a.sig.weekly200 }); if (a.sig.weeklyCross) rows.push({ a, symbol: a.symbol, t: a.sig.weeklyCross.dir === 'up' ? 'Cruce alcista' : 'Cruce bajista', s: a.sig.weeklyCross }); });
      body = table('s_w', [{ k: 'symbol', t: 'Ticker', cls: 'sym', f: r => r.a.symbol, v: r => r.a.symbol }, { k: 'nm', t: 'Nombre', cls: 'nm', f: r => esc(r.a.name), v: r => r.a.name }, { k: 't', t: 'Señal', f: r => `<span class="chip ${r.t === 'Cruce bajista' ? 'down' : 'up'}">${r.t}</span>`, v: r => r.t }, { k: 'd', t: 'Semana', f: r => r.s.date, v: r => r.s.date }, { k: 'ag', t: 'Hace (semanas)', n: 1, f: r => ago(r.s.ago), v: r => -r.s.ago }, { k: 'ds', t: 'Dist. EMA 200 sem.', n: 1, f: r => pc(r.s.dist), v: r => r.s.dist }, { k: 'sc', t: 'Score', n: 1, f: r => nf(r.a.net, 0), v: r => r.a.net }], rows, { sort: 'ag', empty: 'No hay señales sobre la EMA 200 semanal. Requiere ≥200 semanas de historia.' });
    } else if (S.sig === 'rci') {
      const rows = all.filter(a => a.sig.rci.cross);
      body = `<p class="note">RCI semanal (período ${M.cfg.indicators.rci.period}) y su media de ${M.cfg.indicators.rci.signalPeriod} períodos. Se listan los cruces de las últimas ${M.cfg.signals.rciCross.lookbackWeeks} semanas.</p>` + table('s_rci', [...base, { k: 'dir', t: 'Cruce', f: a => dirChip(a.sig.rci.cross.dir), v: a => a.sig.rci.cross.dir }, { k: 'd', t: 'Semana', f: a => a.sig.rci.cross.date, v: a => a.sig.rci.cross.date }, { k: 'ag', t: 'Hace (sem.)', n: 1, f: a => ago(a.sig.rci.cross.ago), v: a => -a.sig.rci.cross.ago }, { k: 'rc', t: 'RCI', n: 1, f: a => nf(a.sig.rci.value, 0), v: a => a.sig.rci.value }, { k: 'rm', t: 'Media RCI', n: 1, f: a => nf(a.sig.rci.signal, 1), v: a => a.sig.rci.signal }, C.score], rows, { sort: 'ag', empty: 'No hay cruces de RCI en la ventana.' });
    } else {
      const rows = []; all.forEach(a => { if (tf !== 'W' && a.sig.macdD) rows.push({ a, symbol: a.symbol, tf: 'Diario', s: a.sig.macdD }); if (tf !== 'D' && a.sig.macdW) rows.push({ a, symbol: a.symbol, tf: 'Semanal', s: a.sig.macdW }); });
      body = table('s_macd', [{ k: 'symbol', t: 'Ticker', cls: 'sym', f: r => r.a.symbol, v: r => r.a.symbol }, { k: 'nm', t: 'Nombre', cls: 'nm', f: r => esc(r.a.name), v: r => r.a.name }, { k: 'tf', t: 'Timeframe', f: r => r.tf, v: r => r.tf }, { k: 'dir', t: 'Cruce MACD', f: r => dirChip(r.s.dir), v: r => r.s.dir }, { k: 'd', t: 'Fecha', f: r => r.s.date, v: r => r.s.date }, { k: 'ag', t: 'Hace', n: 1, f: r => ago(r.s.ago), v: r => -r.s.ago }, { k: 'sc', t: 'Score', n: 1, f: r => nf(r.a.net, 0), v: r => r.a.net }], rows, { sort: 'ag', empty: 'No hay cruces de MACD recientes.' });
    }
    return `<div class="pills">${tabs.map(t => `<button data-sig="${t[0]}" class="${S.sig === t[0] ? 'on' : ''}">${t[1]}</button>`).join('')}</div><p class="note" style="margin-top:0">Las señales son alertas para revisar el gráfico, no recomendaciones.</p>${body}`;
  }

  function vRS() {
    const rows = filtered(M.stocks); const w = S.rsWin === 'week';
    const cols = [C.sym, C.nm, C.sec, { k: 'rs', t: 'RS actual', n: 1, f: a => nf(a.f.rsRating, 0), v: a => a.f.rsRating }, { k: 'w', t: 'Cambio semanal', n: 1, f: a => pp(a.f.rsChange5), v: a => a.f.rsChange5 }, { k: 'm', t: 'Cambio mensual', n: 1, f: a => pp(a.f.rsChange21), v: a => a.f.rsChange21 }, { k: 'v', t: 'RS vs prom. 50d', n: 1, f: a => pc(a.f.rsVsAvg50), v: a => a.f.rsVsAvg50 }, { k: 'st', t: 'Estado (20 ruedas)', f: a => `<span class="chip ${a.f.rsState.startsWith('Sube más') ? 'up' : a.f.rsState.startsWith('Pierde') ? 'down' : ''}">${a.f.rsState}</span>`, v: a => a.f.rsState }, C.score];
    const key = w ? 'w' : 'm'; if (S.tables.rs && S.tables.rs._win !== S.rsWin) { S.tables.rs.key = key; S.tables.rs.dir = -1; S.tables.rs.page = 0; } if (!S.tables.rs) S.tables.rs = { key, dir: -1, page: 0 }; S.tables.rs._win = S.rsWin;
    return `<div class="card" style="margin-bottom:12px"><h2>Ranking de fuerza relativa</h2><p class="note">RS actual = percentil (0–100) del rendimiento ponderado contra ${M.cfg.benchmark} dentro del universo. Los cambios son en puntos de percentil. Ordená por cualquier columna.</p>
    <div class="pills" style="margin:8px 0 0"><button data-rsw="week" class="${w ? 'on' : ''}">Ordenar por cambio semanal</button><button data-rsw="month" class="${!w ? 'on' : ''}">Ordenar por cambio mensual</button></div></div>${table('rs', cols, rows, { sort: key })}`;
  }

  function vSessions() {
    const rows = filtered(M.assets); const N = M.cfg.sessions.n;
    const cols = [C.sym, C.nm, { k: 'p', t: 'Sesiones +', n: 1, f: a => a.sess.pos, v: a => a.sess.pos }, { k: 'n', t: 'Sesiones −', n: 1, f: a => a.sess.neg, v: a => a.sess.neg }, { k: 'pv', t: 'Positivas con volumen', n: 1, f: a => a.sess.posVol, v: a => a.sess.posVol }, { k: 'nv', t: 'Negativas con volumen', n: 1, f: a => a.sess.negVol, v: a => a.sess.negVol }, { k: 'rv', t: 'Vol. rel. prom.', n: 1, f: a => nf(a.sess.avgRel) + 'x', v: a => a.sess.avgRel }, { k: 'sc', t: 'Score sesiones', n: 1, f: a => pp(a.sess.score, 0), v: a => a.sess.score }];
    return `<div class="card" style="margin-bottom:12px"><h2>Sesiones y volumen · últimas ${N} ruedas</h2><p class="note">Volumen significativo = al menos ${nf(M.cfg.volume.significantRel, 1)}x el promedio de 20 ruedas previas. Score sesiones = positivas con volumen − negativas con volumen (regla simple, configurable).</p></div>${table('sess', cols, rows, { sort: 'sc' })}`;
  }

  /* ---------- rotación ---------- */
  function vRotation() {
    const R = S.rot; const etfs = M.rotation;
    const chips = etfs.map(r => `<button data-etf="${r.symbol}" class="${R.sel === r.symbol ? 'on' : ''}">${r.symbol}</button>`).join('');
    let comp = '';
    if (R.sel) {
      const e = etfs.find(r => r.symbol === R.sel); const rows = M.stocks.filter(a => a.sector === e.sector);
      comp = `<div class="card" style="margin-top:12px"><h2>Acciones del sector ${esc(e.sector)} (${R.sel}) por fuerza relativa</h2>${table('rotcomp', [C.sym, C.nm, { k: 'rs', t: 'RS actual', n: 1, f: a => nf(a.f.rsRating, 0), v: a => a.f.rsRating }, { k: 'w', t: 'Cambio sem.', n: 1, f: a => pp(a.f.rsChange5), v: a => a.f.rsChange5 }, { k: 'm', t: 'Cambio mens.', n: 1, f: a => pp(a.f.rsChange21), v: a => a.f.rsChange21 }, C.score, C.warn], rows, { sort: 'rs', nopage: true })}</div>`;
    }
    const q = { Leading: 'up', Improving: 'chip', Weakening: 'warn', Lagging: 'down' };
    const lead = table('lead', [{ k: 'sec', t: 'Sector', f: r => esc(r.sector), v: r => r.sector }, { k: 'q', t: 'Cuadrante del ETF', f: r => `<span class="chip ${q[r.quad] === 'chip' ? '' : q[r.quad]}">${r.etf} · ${r.quad}</span>`, v: r => r.quad }, { k: 'l', t: 'Líder por RS', cls: 'sym', f: r => r.leader.symbol, v: r => r.leader.symbol }, { k: 'rs', t: 'RS', n: 1, f: r => nf(r.leader.f.rsRating, 0), v: r => r.leader.f.rsRating }, { k: 'w', t: 'Cambio semanal', n: 1, f: r => pp(r.leader.f.rsChange5), v: r => r.leader.f.rsChange5 }, { k: 'pos', t: 'Posición', n: 1, f: r => '1 de ' + r.count, v: r => r.count }].map(c => c), M.sectorLeaders.map(r => ({ ...r, symbol: r.leader.symbol })), { sort: 'rs', nopage: true });
    return `<div class="card"><div class="ctl"><button data-act="play" class="${R.playing ? 'on' : ''}">${R.playing ? 'Pausa' : 'Reproducir'}</button>
      <select data-rotw>${[4, 8, 12, 16].map(w => `<option value="${w}"${R.weeks === w ? ' selected' : ''}>Últimas ${w} semanas</option>`).join('')}</select>
      <input type="range" id="rotframe" min="1" max="${R.weeks}" value="${R.frame}" aria-label="Semana" style="flex:1;min-width:120px">
      <span class="note" id="rotdate"></span></div>
      <div class="pills" style="margin:0 0 8px">${chips}<button data-etf="" class="${!R.sel ? 'on' : ''}">Todos</button></div>
      <div class="chartbox" id="rotbox"><div id="rotsvg"></div><div class="tip" id="rottip" style="display:none"></div></div>
      <p class="note">Eje X: fuerza relativa vs ${M.cfg.benchmark} (100 = en línea con su media de ${M.cfg.rotation.ratioSma} semanas). Eje Y: momentum de esa fuerza relativa. Un ETF que baja en el gráfico no necesariamente bajó de precio: puede estar rindiendo peor que el benchmark. Cálculo estilo RRG parametrizado, no el JdK original. Al elegir un ETF se filtra el resto del panel por su sector.</p></div>
      ${comp}<div class="card" style="margin-top:12px"><h2>Líderes por sector</h2>${lead}</div>`;
  }
  function drawRot() {
    const R = S.rot, box = $('#rotsvg'); if (!box) return; const W = 760, H = 460, m = { l: 44, r: 16, t: 14, b: 34 };
    const etfs = M.rotation.map(e => ({ ...e, pts: e.pts.slice(-R.weeks) }));
    let mx = 0, my = 0; etfs.forEach(e => e.pts.forEach(p => { mx = Math.max(mx, Math.abs(p.x - 100)); my = Math.max(my, Math.abs(p.y - 100)); }));
    mx = Math.max(mx * 1.15, 1); my = Math.max(my * 1.15, 0.5);
    const X = v => m.l + (v - (100 - mx)) / (2 * mx) * (W - m.l - m.r), Y = v => m.t + ((100 + my) - v) / (2 * my) * (H - m.t - m.b);
    const cx = X(100), cy = Y(100); const fr = Math.min(R.frame, R.weeks);
    let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Gráfico de rotación relativa de sectores">
      <rect x="${cx}" y="${m.t}" width="${W - m.r - cx}" height="${cy - m.t}" fill="var(--upbg)"/><rect x="${cx}" y="${cy}" width="${W - m.r - cx}" height="${H - m.b - cy}" fill="var(--warnbg)"/>
      <rect x="${m.l}" y="${cy}" width="${cx - m.l}" height="${H - m.b - cy}" fill="var(--downbg)"/><rect x="${m.l}" y="${m.t}" width="${cx - m.l}" height="${cy - m.t}" fill="var(--chip)"/>
      <g fill="var(--muted)" font-size="13" font-weight="600"><text x="${W - m.r - 8}" y="${m.t + 18}" text-anchor="end">Leading</text><text x="${W - m.r - 8}" y="${H - m.b - 8}" text-anchor="end">Weakening</text><text x="${m.l + 8}" y="${H - m.b - 8}">Lagging</text><text x="${m.l + 8}" y="${m.t + 18}">Improving</text></g>
      <line x1="${cx}" y1="${m.t}" x2="${cx}" y2="${H - m.b}" stroke="var(--muted)"/><line x1="${m.l}" y1="${cy}" x2="${W - m.r}" y2="${cy}" stroke="var(--muted)"/>
      <text x="${(W + m.l) / 2}" y="${H - 8}" text-anchor="middle" fill="var(--muted)" font-size="12">Fuerza relativa →</text><text transform="translate(12 ${H / 2}) rotate(-90)" text-anchor="middle" fill="var(--muted)" font-size="12">Momentum de la RS →</text>`;
    const hue = i => `hsl(${(i * 31) % 360} 55% 42%)`;
    etfs.forEach((e, i) => {
      const dim = R.sel && R.sel !== e.symbol; const pts = e.pts.slice(0, fr); if (!pts.length) return; const col = dim ? 'var(--muted)' : hue(i); const op = dim ? 0.25 : 1;
      s += `<g opacity="${op}">`;
      for (let k = 1; k < pts.length; k++) s += `<line x1="${X(pts[k - 1].x)}" y1="${Y(pts[k - 1].y)}" x2="${X(pts[k].x)}" y2="${Y(pts[k].y)}" stroke="${col}" stroke-width="2" opacity="${0.25 + 0.75 * k / pts.length}"/>`;
      pts.forEach((p, k) => { if (k < pts.length - 1) s += `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="2.2" fill="${col}" opacity="${0.3 + 0.7 * k / pts.length}"/>`; });
      const p = pts[pts.length - 1]; const q = Engine.quadOf(p.x, p.y);
      s += `<circle class="pt" data-etf="${e.symbol}" data-tip="${e.symbol} · ${esc(e.sector)}|${q}|RS ${nf(p.x, 1)} · Mom. ${nf(p.y, 1)}|${p.d}" cx="${X(p.x)}" cy="${Y(p.y)}" r="7" fill="${col}" stroke="var(--surface)" stroke-width="2" style="cursor:pointer"/><text x="${X(p.x) + 10}" y="${Y(p.y) + 4}" font-size="12" font-weight="700" fill="${col}" pointer-events="none">${e.symbol}</text></g>`;
    });
    box.innerHTML = s + '</svg>';
    const d = etfs[0] && etfs[0].pts[Math.min(fr, etfs[0].pts.length) - 1]; const ds = $('#rotdate'); if (ds && d) ds.textContent = 'Semana del ' + d.d;
    const sl = $('#rotframe'); if (sl) sl.value = fr;
  }
  function stopPlay() { clearInterval(S.rot.timer); S.rot.playing = false; }
  function startPlay() {
    const R = S.rot; if (R.frame >= R.weeks) R.frame = 1; R.playing = true; clearInterval(R.timer);
    R.timer = setInterval(() => { if (R.frame >= R.weeks) { stopPlay(); const b = document.querySelector('[data-act="play"]'); if (b) { b.textContent = 'Reproducir'; b.classList.remove('on'); } return; } R.frame++; drawRot(); }, 520);
  }

  /* ---------- detalle ---------- */
  function vDetail() {
    const a = M.map[S.detail.sym]; if (!a) return '<div class="empty">Ticker no encontrado.</div>'; const f = a.f, P = M.cfg.score.pillars, inW = !!S.watch[a.symbol];
    const pil = k => `<div class="pl"><div style="display:flex;justify-content:space-between"><b>${PNAME[k]}</b><span>${nf(a.score.pillars[k], 1)}/${P[k].max}</span></div><div class="bar2"><i style="width:${a.score.pillars[k] / P[k].max * 100}%;background:${PCOL[k]}"></i></div></div>`;
    const kv = (k, v) => `<div><span>${k}</span><span>${v}</span></div>`;
    const flags = [[a.vcp.label !== 'Sin setup', 'VCP/BCP: ' + a.vcp.label + ' (' + (a.vcp.confidence * 100).toFixed(0) + '%, ' + { forming: 'en formación', breakout: 'sobre el pivote', extended: 'extendido', none: '' }[a.vcp.status] + ')'], [a.vcp.contractions.length >= 1, 'Base con ' + a.vcp.contractions.length + ' contracción(es)'], [f.breakout, 'Ruptura reciente con volumen'], [f.pullback, 'Pullback a SMA 21'], [a.sig.ema200Bounce, 'Rebote en EMA 200 (' + (a.sig.ema200Bounce ? a.sig.ema200Bounce.date : '') + ')'], [a.sig.cross200, 'Cruce de 200: ' + (a.sig.cross200 ? (a.sig.cross200.dir === 'up' ? 'alcista ' : 'bajista ') + a.sig.cross200.date : '')]].filter(x => x[0]);
    const fu = a.fundamentals, det = Object.keys(PNAME).map(k => `<h3 style="margin-top:10px">${PNAME[k]}</h3><table><tbody>${a.score.detail[k].map(r => `<tr style="cursor:default"><td>${esc(r.label)}</td><td class="n">${nf(r.v * 100, 0)}%</td><td class="n">${nf(r.pts, 1)} pts</td></tr>`).join('')}</tbody></table>`).join('');
    return `<button class="ghost" data-act="back">← Volver</button>
    <div class="card" style="margin-top:10px"><div class="dh"><span class="t">${a.symbol}</span><span class="p">${nf(f.close)}</span><span>${pc(f.dayChg)}</span><button class="star ${inW ? 'on' : ''}" data-act="star" aria-label="Watchlist" title="${inW ? 'Quitar de la watchlist' : 'Agregar a la watchlist'}">${inW ? '★' : '☆'}</button></div>
      <div class="note">${esc(a.name)} · ${esc(a.sector)} · ${esc(a.industry)} · Cap. ${cap(a.marketCap)}${a.type === 'stock' && M.meta.simulated ? ' (simulada)' : ''}</div></div>
    <div class="grid g2" style="margin-top:12px"><div class="card"><div style="display:flex;gap:16px;align-items:baseline"><span class="big">${nf(a.net, 0)}</span><span class="note">Score${a.penalty ? ' · base ' + nf(a.score.base, 0) + ' − ' + a.penalty + ' por warnings' : ''}</span></div>
      <p class="note" style="margin:6px 0 0">Este activo cumple ${nf(a.net, 0)} de 100 puntos de las condiciones configuradas. No es una recomendación.${a.score.gated ? ' Contracción y Setup se reducen porque la tendencia es débil.' : ''}</p><div class="pillars">${['trend', 'rs', 'contraction', 'setup'].map(pil).join('')}</div>
      <details class="rules"><summary>Ver reglas que sumaron</summary>${det}</details></div>
      <div class="card"><h2>Warnings</h2>${a.warn.length ? `<div class="warnlist">${a.warn.map(w => `<div class="wi">⚠ ${esc(w.label)}${w.penalty ? ` <span class="note">(−${w.penalty} pts)</span>` : ' <span class="note">(informativa)</span>'}</div>`).join('')}</div>` : '<p class="note">Sin warnings activas.</p>'}
        <h2 style="margin-top:14px">Setups detectados</h2>${flags.length ? `<div class="warnlist">${flags.map(x => `<div class="chip">${esc(x[1])}</div>`).join('')}</div>` : '<p class="note">No se detectó ningún setup.</p>'}
        ${a.vcp.pivot ? `<p class="note">Pivote ${nf(a.vcp.pivot)} · soporte de la base ${nf(a.vcp.baseLow)} · contracciones: ${a.vcp.contractions.map(c => nf(c.depth, 1) + '%').join(' → ') || '–'}</p>` : ''}</div></div>
    <div class="card" style="margin-top:12px"><div class="ctl"><button data-tf="D" class="${S.detail.tf === 'D' ? 'on' : ''}">Diario</button><button data-tf="W" class="${S.detail.tf === 'W' ? 'on' : ''}">Semanal</button><span style="width:8px"></span>
      <select data-sub>${[['RS', 'Fuerza relativa'], ['RSI', 'RSI 14'], ['RCI', 'RCI + media'], ['MACD', 'MACD']].map(o => `<option value="${o[0]}"${S.detail.sub === o[0] ? ' selected' : ''}>${o[1]}</option>`).join('')}</select>
      <button data-act="zin">＋</button><button data-act="zout">－</button><button data-act="zreset">Restablecer</button></div>
      <div class="readout" id="readout"></div><div class="chartbox"><canvas id="chart"></canvas></div><div class="legend" id="legend"></div>
      <p class="note">Rueda para hacer zoom, arrastrá para desplazar. El gráfico sirve para validar a ojo lo que el sistema marca: confirmá el patrón antes de seguirlo.</p></div>
    <div class="grid g2" style="margin-top:12px"><div class="card"><h2>Datos técnicos</h2><div class="kv">${kv('SMA 10', nf(f.sma10))}${kv('SMA 21', nf(f.sma21))}${kv('SMA 50', nf(f.sma50))}${kv('EMA 200', nf(f.ema200))}${kv('EMA 10 semanal', nf(f.wema10))}${kv('EMA 200 semanal', nz(f.wema200) ? nf(f.wema200) : 'sin historia')}${kv('Dist. a EMA 200', pc(f.distEma200))}${kv('Dist. a SMA 50', pc(f.distSma50))}${kv('Pendiente SMA 50 (20d)', pc(f.slope50))}${kv('Pendiente EMA 200 (20d)', pc(f.slope200))}${kv('RSI 14', nf(f.rsi, 1))}${kv('RCI semanal', nf(f.rciW, 0))}${kv('ATR 14', nf(f.atr) + ' (' + nf(f.atrPct, 1) + '%)')}${kv('Volatilidad hist. 10d', nf(f.hv10 * Math.sqrt(252) * 100, 1) + '%')}${kv('Volumen relativo', nf(f.relVol) + 'x')}${kv('Máx. 52s', nf(f.high52) + ' (' + nf(-f.distHigh52, 1) + '%)')}</div></div>
      <div class="card"><h2>Fuerza relativa vs ${M.cfg.benchmark}</h2><div class="kv">${kv('RS actual', nf(f.rsRating, 0))}${kv('Cambio semanal', pp(f.rsChange5))}${kv('Cambio mensual', pp(f.rsChange21))}${kv('Línea RS vs prom. 50d', pc(f.rsVsAvg50))}${kv('Línea RS vs máx. 52s', pc(-f.rsFromHigh))}${kv('Estado (20 ruedas)', f.rsState)}</div>
        ${fu ? `<h2 style="margin-top:14px">Fundamentales ${M.meta.simulated ? '<span class="chip warn">simulados</span>' : ''}</h2><div class="kv">${kv('P/E', nf(fu.pe, 1))}${kv('EPS', nf(fu.eps))}${kv('Crec. ingresos', pc(fu.revGrowth, 1))}${kv('Crec. ganancias', pc(fu.epsGrowth, 1))}${kv('Dividend yield', nf(fu.divYield) + '%')}${kv('Próx. earnings', a.earningsDate || '–')}</div>` : ''}</div></div>
    <p class="disc">Una señal no garantiza rendimiento, un patrón puede fallar y el contexto de mercado importa. Revisá el gráfico manualmente y gestioná el riesgo. Esta herramienta no ejecuta operaciones ni recomienda comprar o vender.</p>`;
  }
  function mountChart() {
    const cv = $('#chart'); if (!cv) return; const a = M.map[S.detail.sym], D = S.detail.tf === 'D'; const sub = S.detail.sub;
    const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    const I = M.cfg.indicators; let bars, ov, volAvg, sd, defaultCount;
    if (D) {
      bars = a.dates.map((d, i) => ({ d, o: a.o[i], h: a.h[i], l: a.l[i], c: a.c[i], v: a.v[i] }));
      ov = I.sma.map((p, k) => ({ name: 'SMA ' + p, color: [css('--ma10'), css('--ma21'), css('--ma50')][k] || '#888', data: a.ind['sma' + p] })).concat(I.ema.map(p => ({ name: 'EMA ' + p, color: css('--ma200'), width: 2, data: a.ind['ema' + p] })));
      volAvg = Engine.sma(a.v, M.cfg.indicators.volAvg); defaultCount = 160;
    } else {
      bars = a.w.d.map((d, i) => ({ d, o: a.w.o[i], h: a.w.h[i], l: a.w.l[i], c: a.w.c[i], v: a.w.v[i] }));
      ov = I.weeklyEma.map((p, k) => ({ name: 'EMA ' + p + ' sem.', color: k ? css('--ma200') : css('--ma21'), width: k ? 2 : 1.4, data: a.wind['ema' + p] })); volAvg = Engine.sma(a.w.v, 10); defaultCount = 104;
    }
    const cl = D ? a.c : a.w.c, bw = D ? M.bench.c : M.bench.w.c; const rsl = cl.map((x, i) => x / bw[i]);
    if (sub === 'RS') sd = { name: 'Fuerza relativa vs ' + M.cfg.benchmark, lines: [{ data: rsl, color: css('--p-rs') }, { data: Engine.sma(rsl, D ? 50 : 10), color: css('--muted') }] };
    else if (sub === 'RSI') sd = { name: 'RSI ' + I.rsi, lines: [{ data: Engine.rsi(cl, I.rsi), color: css('--p-trend') }], levels: [30, 70] };
    else if (sub === 'RCI') { const r = D ? a.wind && Engine.rci(cl, I.rci.period) : a.wind.rci; const sg = Engine.sma(r.map(x => nz(x) ? x : 0), I.rci.signalPeriod).map((x, i) => i < I.rci.period + I.rci.signalPeriod - 2 ? null : x); sd = { name: 'RCI ' + I.rci.period + ' y media ' + I.rci.signalPeriod, lines: [{ data: r, color: css('--p-trend') }, { data: sg, color: css('--p-con') }], levels: [-80, 0, 80] }; }
    else { const m = D ? a.ind.macd : a.wind.macd; sd = { name: 'MACD ' + I.macd.fast + '/' + I.macd.slow + '/' + I.macd.signal, lines: [{ data: m.line, color: css('--p-trend') }, { data: m.sig, color: css('--p-con') }], hist: m.hist }; }
    const hl = []; const marks = [];
    if (a.vcp.pivot) { hl.push({ y: a.vcp.pivot, color: css('--p-set'), label: 'Pivote ' + nf(a.vcp.pivot) }); hl.push({ y: a.vcp.baseLow, color: css('--p-con'), label: 'Soporte de la base ' + nf(a.vcp.baseLow), dash: [2, 4] }); }
    if (D) a.vcp.contractions.forEach(c => { marks.push({ i: c.from, p: a.h[c.from], color: css('--p-set') }); marks.push({ i: c.to, p: a.l[c.to], color: css('--p-set'), text: '−' + nf(c.depth, 1) + '%', below: true }); });
    if (!S.chart) S.chart = StockChart(cv, $('#readout')); else { /* canvas nuevo en cada render */ S.chart = StockChart(cv, $('#readout')); }
    S.chart.setData({ bars, overlays: ov, volAvg, sub: sd, hlines: hl, marks, defaultCount });
    $('#legend').innerHTML = ov.map(o => `<span><i style="background:${o.color}"></i>${o.name}</span>`).join('') + `<span><i style="background:var(--p-set)"></i>Pivote / contracciones</span><span><i style="background:var(--ma10)"></i>Volumen medio</span>`;
  }

  /* ---------- watchlist y herramientas ---------- */
  function vWatch() {
    const keys = Object.keys(S.watch).filter(k => M.map[k]);
    const rows = keys.map(k => ({ symbol: k, a: M.map[k], w: S.watch[k] }));
    const cols = [{ k: 'symbol', t: 'Ticker', cls: 'sym', f: r => r.symbol, v: r => r.symbol }, { k: 'nm', t: 'Nombre', cls: 'nm', f: r => esc(r.a.name), v: r => r.a.name }, { k: 'dt', t: 'Agregado', f: r => r.w.date, v: r => r.w.date }, { k: 's0', t: 'Score al agregar', n: 1, f: r => nf(r.w.score, 0), v: r => r.w.score }, { k: 's1', t: 'Score hoy', n: 1, f: r => nf(r.a.net, 0), v: r => r.a.net }, { k: 'ds', t: 'Cambio', n: 1, f: r => pp(r.a.net - r.w.score, 0), v: r => r.a.net - r.w.score }, { k: 'rs', t: 'Cambio RS 1s', n: 1, f: r => pp(r.a.f.rsChange5), v: r => r.a.f.rsChange5 }, { k: 'al', t: 'Alertas', f: r => alertsFor(r.a), v: r => alertsFor(r.a).length }, { k: 'nt', t: 'Notas', f: r => `<input data-note="${r.symbol}" value="${esc(r.w.note || '')}" placeholder="Agregar nota" style="width:200px;height:28px;border:1px solid var(--line);border-radius:6px;padding:0 6px;background:var(--surface2)">`, v: r => r.w.note || '' }, { k: 'x', t: '', f: r => `<button class="ghost" style="height:28px" data-unwatch="${r.symbol}">Quitar</button>`, v: r => 0 }];
    return `<div class="card" style="margin-bottom:12px"><h2>Watchlist personal</h2><p class="note">Se guarda en este navegador (sin login). Agregá tickers con la estrella ☆ desde la ficha. Las alertas son visuales y se evalúan con los datos cargados.</p></div>${rows.length ? table('watch', cols, rows, { sort: 'ds', nopage: true }) : '<div class="empty">Todavía no hay tickers. Abrí una ficha y tocá la estrella para seguirlo.</div>'}`;
  }
  function alertsFor(a) {
    const t = []; const f = a.f;
    if (a.net >= 70) t.push('Score alto'); if (f.rsChange5 >= 5) t.push('RS subió'); if (a.sig.cross200 && a.sig.cross200.dir === 'up') t.push('Cruzó EMA 200'); if (f.breakout) t.push('Breakout'); if (f.relVol >= M.cfg.volume.unusualRel) t.push('Volumen inusual'); if (a.vcp.label === 'Posible VCP') t.push('Posible VCP'); if (a.sig.macdD && a.sig.macdD.dir === 'up') t.push('MACD alcista'); if (a.sig.rci.cross && a.sig.rci.cross.dir === 'up') t.push('RCI alcista');
    return t.map(x => `<span class="chip warn">${x}</span>`).join(' ');
  }
  function vTools() {
    return `<div class="grid g2"><div class="card"><h2>Calculadora de CEDEAR</h2><p class="note">Precio teórico local = precio del activo extranjero × tipo de cambio CCL ÷ ratio. Los ratios cambian por activo: cargalo vos.</p>
      <div class="row"><label>Precio del activo (USD)<input id="cd_p" inputmode="decimal" placeholder="p. ej. 150"></label><label>Ratio (CEDEARs por acción)<input id="cd_r" inputmode="decimal" placeholder="p. ej. 10"></label><label>CCL (ARS por USD)<input id="cd_c" inputmode="decimal" placeholder="p. ej. 1200"></label></div>
      <p style="font-size:20px;font-weight:700" id="cd_out">–</p></div>
      <div class="card"><h2>Reglas que quedan por definir</h2><ul class="note" style="padding-left:18px;margin:0;display:grid;gap:5px"><li>Fórmula exacta del score de la plataforma original: no se conoce; se usan reglas propias editables.</li><li>RS rating: percentil de rendimiento ponderado (63/126/189/252 ruedas, 40/20/20/20%).</li><li>Período del RCI (9) y de su media (14): supuestos.</li><li>Detección VCP: zigzag de ${M.cfg.vcp.swingPct}% sobre cierres, contracciones decrecientes, volumen y cercanía al pivote.</li><li>Rotación: estilo RRG, no JdK exacto.</li><li>Penalidades de warnings y la compuerta de tendencia: valores iniciales a calibrar.</li><li>Put/call ratio y sentimiento: sin fuente de datos conectada.</li></ul></div></div>
      <div class="card" style="margin-top:12px"><h2>Configuración</h2><p class="note">Pesos, umbrales, medias, warnings y señales. Al aplicar se recalculan indicadores y scores con los datos ya cargados (sin volver a pedirlos al proveedor).</p>
      <textarea class="cfg" id="cfgtxt" spellcheck="false">${esc(JSON.stringify(CFG, null, 2))}</textarea><div class="row" style="margin-top:8px"><button class="btn" data-act="applyCfg">Aplicar y recalcular</button><button class="ghost" data-act="resetCfg">Restaurar valores por defecto</button><span class="note" id="cfgmsg"></span></div></div>`;
  }

  /* ---------- render / navegación ---------- */
  const TABS = [['market', 'Mercado'], ['ranking', 'Ranking'], ['signals', 'Señales'], ['rotation', 'Rotación'], ['rs', 'Fuerza relativa'], ['sessions', 'Sesiones y volumen'], ['watch', 'Watchlist'], ['tools', 'Herramientas']];
  const VIEWS = { market: vMarket, ranking: vRanking, signals: vSignals, rotation: vRotation, rs: vRS, sessions: vSessions, watch: vWatch, tools: vTools, detail: vDetail };
  function render() {
    $('#tabs').innerHTML = TABS.map(t => `<button data-view="${t[0]}" class="${S.view === t[0] ? 'on' : ''}">${t[1]}</button>`).join('');
    $('#filters').style.display = ['ranking', 'signals', 'rs', 'sessions', 'rotation'].includes(S.view) ? '' : 'none';
    $('#main').innerHTML = VIEWS[S.view]();
    if (S.view === 'detail') mountChart(); if (S.view === 'rotation') drawRot(); if (S.view !== 'rotation') stopPlay();
  }
  function go(view, sym) { if (view === 'detail') { if (S.view !== 'detail') S.prev = S.view; S.detail = { sym, tf: S.filters.tf === 'W' ? 'W' : 'D', sub: 'RS' }; } S.view = view; render(); window.scrollTo(0, 0); }

  document.addEventListener('click', e => {
    const t = e.target, c = s => t.closest(s);
    let x;
    if ((x = c('[data-view]'))) return go(x.dataset.view);
    if ((x = c('.sugg [data-s]'))) { $('#sugg').innerHTML = ''; $('#q').value = ''; return go('detail', x.dataset.s); }
    if ((x = c('th[data-sort]'))) { const [id, k] = x.dataset.sort.split('|'); const st = S.tables[id]; if (st.key === k) st.dir *= -1; else { st.key = k; st.dir = -1; } st.page = 0; const y = window.scrollY; render(); window.scrollTo(0, y); return; }
    if ((x = c('[data-pg]'))) { const [id, d] = x.dataset.pg.split('|'); S.tables[id].page += +d; render(); return; }
    if ((x = c('[data-sig]'))) { S.sig = x.dataset.sig; return render(); }
    if ((x = c('[data-rsw]'))) { S.rsWin = x.dataset.rsw; return render(); }
    if ((x = c('[data-tf]'))) { S.detail.tf = x.dataset.tf; return render(); }
    if ((x = c('[data-unwatch]'))) { delete S.watch[x.dataset.unwatch]; store.set('atalaya.watch', S.watch); return render(); }
    if ((x = c('[data-etf]'))) {
      const v = x.dataset.etf; S.rot.sel = v || null; const e = v && M.rotation.find(r => r.symbol === v); S.filters.sector = e ? e.sector : ''; S.fopen = false; renderFilters(); render(); return;
    }
    if ((x = c('tr[data-sym]')) && x.dataset.sym) return go('detail', x.dataset.sym);
    if ((x = c('.snap[data-sym]'))) return go('detail', x.dataset.sym);
    if ((x = c('[data-act]'))) {
      const a = x.dataset.act;
      if (a === 'clearF') { S.filters = { ...F0 }; S.rot.sel = null; S.fopen = true; renderFilters(); render(); }
      else if (a === 'back') go(S.prev || 'ranking');
      else if (a === 'star') { const s = S.detail.sym; if (S.watch[s]) delete S.watch[s]; else S.watch[s] = { date: M.meta.asOf, score: M.map[s].net, note: '' }; store.set('atalaya.watch', S.watch); render(); }
      else if (a === 'zin') S.chart.zoom(1 / 1.4); else if (a === 'zout') S.chart.zoom(1.4); else if (a === 'zreset') S.chart.reset();
      else if (a === 'play') { if (S.rot.playing) stopPlay(); else startPlay(); x.textContent = S.rot.playing ? 'Pausa' : 'Reproducir'; x.classList.toggle('on', S.rot.playing); }
      else if (a === 'applyCfg') { try { const j = JSON.parse($('#cfgtxt').value); if (!j.score || !j.indicators || !j.warnings) throw new Error('Faltan secciones (score, indicators, warnings).'); CFG = j; store.set('atalaya.config', CFG); rebuild(); $('#cfgmsg').textContent = 'Recalculado en ' + M.buildMs + ' ms.'; } catch (err) { $('#cfgmsg').textContent = 'Error: ' + err.message; } }
      else if (a === 'resetCfg') { CFG = JSON.parse(JSON.stringify(DEFAULT_CONFIG)); store.set('atalaya.config', null); rebuild(); }
      else if (a === 'theme') { const r = document.documentElement; const dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; r.dataset.theme = dark ? 'light' : 'dark'; if (S.view === 'detail') render(); }
    }
  });
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.f !== undefined) { S.filters[t.dataset.f] = t.value; S.fopen = true; for (const k in S.tables) S.tables[k].page = 0; render(); if (t.tagName === 'SELECT') renderFilters(); else { const b = document.querySelector('.fbar summary'); if (b) b.innerHTML = b.innerHTML.replace(/<span class="badge">.*?<\/span>/, '').replace('Filtros ', 'Filtros ' + (activeCount() ? '<span class="badge">' + activeCount() + '</span>' : '')); } return; }
    if (t.id === 'rotframe') { S.rot.frame = +t.value; stopPlay(); drawRot(); const b = document.querySelector('[data-act="play"]'); if (b) { b.textContent = 'Reproducir'; b.classList.remove('on'); } return; }
    if (t.dataset.note) { if (S.watch[t.dataset.note]) { S.watch[t.dataset.note].note = t.value; store.set('atalaya.watch', S.watch); } return; }
    if (['cd_p', 'cd_r', 'cd_c'].includes(t.id)) { const p = +$('#cd_p').value.replace(',', '.'), r = +$('#cd_r').value.replace(',', '.'), c = +$('#cd_c').value.replace(',', '.'); $('#cd_out').innerHTML = p > 0 && r > 0 && c > 0 ? 'ARS ' + nf(p * c / r) : '–'; }
  });
  document.addEventListener('change', e => { const t = e.target; if (t.dataset.rotw !== undefined) { S.rot.weeks = +t.value; S.rot.frame = S.rot.weeks; stopPlay(); render(); } if (t.dataset.sub !== undefined) { S.detail.sub = t.value; render(); } });
  document.addEventListener('mouseover', e => { const p = e.target.closest && e.target.closest('.pt'); const tip = $('#rottip'); if (!tip) return; if (!p) { tip.style.display = 'none'; return; } const [a, b, c, d] = p.dataset.tip.split('|'); tip.innerHTML = `<b>${a}</b><br>${b}<br>${c}<br><span class="mut">${d}</span>`; tip.style.display = 'block'; });
  document.addEventListener('mousemove', e => { const tip = $('#rottip'), box = $('#rotbox'); if (!tip || tip.style.display === 'none' || !box) return; const r = box.getBoundingClientRect(); tip.style.left = Math.min(r.width - 170, e.clientX - r.left + 14) + 'px'; tip.style.top = (e.clientY - r.top + 14) + 'px'; });

  /* ---------- búsqueda global ---------- */
  let sIdx = -1;
  function suggest() {
    const q = $('#q').value.trim().toLowerCase(); const box = $('#sugg'); if (!q) { box.innerHTML = ''; return; }
    const hits = M.assets.filter(a => a.symbol.toLowerCase().startsWith(q)).concat(M.assets.filter(a => !a.symbol.toLowerCase().startsWith(q) && (a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)))).slice(0, 8);
    sIdx = hits.length ? 0 : -1;
    box.innerHTML = hits.length ? `<div class="sugg">${hits.map((a, i) => `<button data-s="${a.symbol}" class="${i === 0 ? 'on' : ''}"><b>${a.symbol}</b><span>${esc(a.name)} · score ${nf(a.net, 0)}</span></button>`).join('')}</div>` : `<div class="sugg"><div class="empty">Sin resultados para “${esc(q)}”</div></div>`;
  }
  $('#q').addEventListener('input', suggest);
  $('#q').addEventListener('keydown', e => {
    const items = [...document.querySelectorAll('.sugg [data-s]')]; if (e.key === 'Escape') { $('#sugg').innerHTML = ''; $('#q').blur(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!items.length) return; sIdx = (sIdx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; items.forEach((b, i) => b.classList.toggle('on', i === sIdx)); }
    if (e.key === 'Enter' && items[sIdx]) { const s = items[sIdx].dataset.s; $('#sugg').innerHTML = ''; $('#q').value = ''; go('detail', s); }
  });
  document.addEventListener('keydown', e => { if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') { e.preventDefault(); $('#q').focus(); } });
  document.addEventListener('click', e => { if (!e.target.closest('.search')) $('#sugg').innerHTML = ''; });

  window.addEventListener('resize', () => { if (S.chart && S.view === 'detail') S.chart.draw(); });
  function rebuild() { M = Engine.build(RAW, CFG); S.tables = {}; renderFilters(); render(); }
  /* ---------- arranque ---------- */
  $('#main').innerHTML = '<div class="empty">Cargando y calculando indicadores…</div>';
  await new Promise(r => setTimeout(r, 30));
  let note = '';
  try { RAW = await HttpProvider.load(CFG); }
  catch (err) { RAW = await MockProvider.load(CFG); note = err.message; }
  M = Engine.build(RAW, CFG);
  const sim = M.meta.simulated, tag = $('#asof');
  tag.textContent = (sim ? 'Datos simulados' : 'Datos reales') + ' · al ' + M.meta.asOf + ' · ' + M.assets.length + ' activos' + (M.meta.rejected ? ' (' + M.meta.rejected + ' descartados)' : '') + ' · cálculo ' + M.buildMs + ' ms';
  tag.classList.toggle('real', !sim); tag.title = sim ? 'No se encontró data.json (' + note + '). Se muestran datos de prueba.' : 'Generado: ' + (M.meta.generated || 's/d');
  $('#foot').textContent = sim ? 'Los datos de esta versión son simulados para probar la interfaz y el motor de cálculo; no representan precios reales.' : 'Datos de fin de día de Yahoo Finance (fuente no oficial): pueden tener errores o retrasos. Verificá en tu plataforma antes de decidir.';
  renderFilters(); render();
  window.__M = M;
})();
