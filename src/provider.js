/* ============================================================
   DATA PROVIDER — contrato:
     provider.load(config) -> Promise<{ meta, assets[] }>
     asset = { symbol, name, type:'stock'|'etf', sector, industry, marketCap,
               dates[], o[], h[], l[], c[], v[], fundamentals?, earningsDate? }
   Para usar datos reales se reemplaza MockProvider por otro que cumpla
   el mismo contrato (ver README). Acá TODO es simulado.
   ============================================================ */
const UNIVERSE_RAW = [
  ['Tecnología', 'XLK', 'Tecnología (ETF sectorial)', 'AAPL:Apple:Electrónica de consumo,MSFT:Microsoft:Software,NVDA:NVIDIA:Semiconductores,AVGO:Broadcom:Semiconductores,ORCL:Oracle:Software,CRM:Salesforce:Software,AMD:Advanced Micro Devices:Semiconductores,ADBE:Adobe:Software'],
  ['Financiero', 'XLF', 'Financiero (ETF sectorial)', 'JPM:JPMorgan Chase:Bancos,BAC:Bank of America:Bancos,WFC:Wells Fargo:Bancos,GS:Goldman Sachs:Mercado de capitales,MS:Morgan Stanley:Mercado de capitales,BLK:BlackRock:Gestión de activos,V:Visa:Pagos,AXP:American Express:Crédito al consumo'],
  ['Energía', 'XLE', 'Energía (ETF sectorial)', 'XOM:Exxon Mobil:Petróleo integrado,CVX:Chevron:Petróleo integrado,COP:ConocoPhillips:Exploración y producción,SLB:SLB:Servicios petroleros,EOG:EOG Resources:Exploración y producción,MPC:Marathon Petroleum:Refinación,PSX:Phillips 66:Refinación,OXY:Occidental Petroleum:Exploración y producción'],
  ['Salud', 'XLV', 'Salud (ETF sectorial)', 'LLY:Eli Lilly:Farmacéuticas,UNH:UnitedHealth:Seguros de salud,JNJ:Johnson & Johnson:Farmacéuticas,ABBV:AbbVie:Biofarmacia,MRK:Merck:Farmacéuticas,TMO:Thermo Fisher:Instrumental científico,ABT:Abbott Laboratories:Dispositivos médicos,ISRG:Intuitive Surgical:Dispositivos médicos'],
  ['Industriales', 'XLI', 'Industriales (ETF sectorial)', 'CAT:Caterpillar:Maquinaria,GE:GE Aerospace:Aeroespacial y defensa,RTX:RTX:Aeroespacial y defensa,HON:Honeywell:Conglomerados,UNP:Union Pacific:Ferrocarriles,DE:Deere:Maquinaria,LMT:Lockheed Martin:Aeroespacial y defensa,ETN:Eaton:Equipo eléctrico'],
  ['Consumo discrecional', 'XLY', 'Consumo discrecional (ETF sectorial)', 'AMZN:Amazon:Comercio electrónico,TSLA:Tesla:Automotriz,HD:Home Depot:Mejoras del hogar,MCD:McDonald\'s:Restaurantes,NKE:Nike:Calzado y ropa,SBUX:Starbucks:Restaurantes,LOW:Lowe\'s:Mejoras del hogar,BKNG:Booking Holdings:Viajes'],
  ['Consumo básico', 'XLP', 'Consumo básico (ETF sectorial)', 'PG:Procter & Gamble:Productos del hogar,KO:Coca-Cola:Bebidas,PEP:PepsiCo:Bebidas,COST:Costco:Distribución minorista,WMT:Walmart:Distribución minorista,PM:Philip Morris:Tabaco,MDLZ:Mondelez:Alimentos,CL:Colgate-Palmolive:Productos del hogar'],
  ['Servicios públicos', 'XLU', 'Servicios públicos (ETF sectorial)', 'NEE:NextEra Energy:Electricidad regulada,DUK:Duke Energy:Electricidad regulada,SO:Southern Company:Electricidad regulada,CEG:Constellation Energy:Generación independiente,VST:Vistra:Generación independiente,AEP:American Electric Power:Electricidad regulada,D:Dominion Energy:Electricidad regulada,SRE:Sempra:Servicios diversificados'],
  ['Materiales', 'XLB', 'Materiales (ETF sectorial)', 'LIN:Linde:Químicos industriales,SHW:Sherwin-Williams:Químicos especiales,FCX:Freeport-McMoRan:Cobre,NEM:Newmont:Oro,APD:Air Products:Químicos industriales,ECL:Ecolab:Químicos especiales,NUE:Nucor:Acero,DOW:Dow:Químicos'],
  ['Inmobiliario', 'XLRE', 'Inmobiliario (ETF sectorial)', 'PLD:Prologis:REIT industrial,AMT:American Tower:REIT de torres,EQIX:Equinix:REIT de centros de datos,WELL:Welltower:REIT de salud,SPG:Simon Property:REIT comercial,PSA:Public Storage:REIT de almacenamiento,O:Realty Income:REIT comercial,CCI:Crown Castle:REIT de torres'],
  ['Comunicaciones', 'XLC', 'Comunicaciones (ETF sectorial)', 'GOOGL:Alphabet:Internet y publicidad,META:Meta Platforms:Internet y publicidad,NFLX:Netflix:Streaming,DIS:Walt Disney:Entretenimiento,TMUS:T-Mobile US:Telecomunicaciones,VZ:Verizon:Telecomunicaciones,T:AT&T:Telecomunicaciones,CMCSA:Comcast:Medios por cable']
];

const MockProvider = (function () {
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function gauss(r) { let u = 0; while (!u) u = r(); const v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  function tradingDates(n) {
    const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - 1);
    const out = [];
    while (out.length < n) { const w = d.getUTCDay(); if (w !== 0 && w !== 6) out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() - 1); }
    return out.reverse();
  }
  function emaSimple(a, n) { const k = 2 / (n + 1); const out = new Array(a.length).fill(null); let e = 0; for (let i = 0; i < a.length; i++) { if (i < n - 1) { e += a[i]; } else if (i === n - 1) { e = (e + a[i]) / n; out[i] = e; } else { e = a[i] * k + e * (1 - k); out[i] = e; } } return out; }

  const ARCH = ['leader', 'leader', 'trend', 'trend', 'trend', 'base', 'base', 'bounce', 'recover', 'down', 'down', 'chop', 'chop'];

  function build(n, rng, arch, sigma, beta, secBeta, mkt, sec, recLen) {
    const baseLen = 78;
    const L = new Array(n); const vm = new Array(n); L[0] = 0;
    for (let i = 0; i < n; i++) {
      const j = n - 1 - i; let drift = 0, m = 1;
      if (arch === 'leader') { drift = j > 60 ? 0.0009 : 0.0002; m = j > 60 ? 1 : 0.45 + 0.55 * (j / 60); }
      else if (arch === 'trend') drift = 0.0006;
      else if (arch === 'base') { drift = j > baseLen ? 0.0010 : 0; m = j > baseLen ? 1 : 0.4 + 0.6 * (j / baseLen); }
      else if (arch === 'bounce') drift = 0.00045;
      else if (arch === 'recover') drift = j > recLen ? -0.0006 : 0.0030;
      else if (arch === 'down') drift = -0.0007;
      else if (arch === 'chop') { drift = 0; m = 1.1; }
      vm[i] = m;
      if (i > 0) L[i] = L[i - 1] + beta * mkt[i] + secBeta * sec[i] + drift + sigma * m * gauss(rng);
    }
    if (arch === 'base') {
      // contracciones decrecientes (≈10%, 5%, 3%) bajo el pivote
      const start = n - baseLen; const anchor = L[start];
      for (let i = start; i < n; i++) { const s = i - start; const dev = -0.15 * Math.exp(-s / 33) * (1 - Math.cos(2 * Math.PI * s / 24)) / 2; L[i] = anchor + (L[i] - anchor) * 0.15 + dev; }
    }
    if (arch === 'bounce') {
      const P = L.map(Math.exp); const e = emaSimple(P, 200); const e0 = e[n - 31];
      if (e0 && P[n - 31] > e0 * 1.04) {
        const s0 = L[n - 31], lo = Math.log(e0 * 1.004);
        for (let k = 1; k <= 30; k++) { const i = n - 31 + k; L[i] = k <= 22 ? s0 + (lo - s0) * (k / 22) + 0.003 * gauss(rng) : lo + 0.045 * ((k - 22) / 8) + 0.003 * gauss(rng); }
      }
    }
    return { L, vm };
  }

  function ohlcv(L, vm, sigma, target, baseVol, rng, spike) {
    const n = L.length; const sc = target / Math.exp(L[n - 1]);
    const c = L.map(x => +(Math.exp(x) * sc).toFixed(2));
    const o = [], h = [], l = [], v = [];
    for (let i = 0; i < n; i++) {
      const prev = i ? c[i - 1] : c[0];
      const op = +(prev * (1 + 0.15 * sigma * vm[i] * gauss(rng))).toFixed(2);
      const rg = sigma * vm[i] * (0.5 + Math.abs(gauss(rng)) * 0.5);
      const hi = Math.max(op, c[i]) * (1 + rg * 0.5 * rng()); const lo = Math.min(op, c[i]) * (1 - rg * 0.5 * rng());
      o.push(op); h.push(+hi.toFixed(2)); l.push(+lo.toFixed(2));
      const ret = i ? Math.abs(Math.log(c[i] / c[i - 1])) : 0;
      v.push(Math.round(baseVol * (0.55 + 0.45 * vm[i]) * Math.exp(0.28 * gauss(rng)) * (1 + 7 * ret)));
    }
    if (spike) { v[n - 1] = Math.round(v[n - 1] * spike); if (spike > 2.4) v[n - 2] = Math.round(v[n - 2] * 1.5); }
    return { o, h, l, c, v };
  }

  async function load(cfg) {
    const n = cfg.history.days; const dates = tradingDates(n);
    const rm = mulberry32(7);
    const mkt = new Array(n).fill(0), secs = {};
    for (let i = 1; i < n; i++) { const vol = 0.0075 + 0.0055 * Math.max(0, Math.sin(2 * Math.PI * i / 310 + 1)); mkt[i] = 0.0004 + 0.0011 * Math.sin(2 * Math.PI * i / 420) + vol * gauss(rm); }
    const assets = []; const bySector = {};
    const asOf = dates[n - 1]; const asOfD = new Date(asOf + 'T00:00:00Z');
    UNIVERSE_RAW.forEach(([sector, etf, , list]) => {
      const rs = mulberry32(hash(sector)); const P = 150 + rs() * 250, ph = rs() * 6.28; const sec = new Array(n).fill(0);
      for (let i = 1; i < n; i++) sec[i] = 0.0008 * Math.sin(2 * Math.PI * i / P + ph) + 0.0045 * gauss(rs);
      secs[sector] = sec; bySector[sector] = [];
      list.split(',').forEach(item => {
        const [sym, name, ind] = item.split(':'); const r = mulberry32(hash(sym));
        const arch = ARCH[Math.floor(r() * ARCH.length)]; const sigma = 0.009 + r() * 0.009; const beta = 0.8 + r() * 0.6;
        const g = build(n, r, arch, sigma, beta, 0.9, mkt, sec, 40 + Math.floor(r() * 100));
        const target = Math.exp(Math.log(25) + r() * Math.log(24));
        const spike = r() < 0.09 ? 1.6 + r() * 1.6 : 0;
        const s = ohlcv(g.L, g.vm, sigma, target, Math.pow(10, 5.9 + r() * 1.6), r, spike);
        const shares = (0.3 + r() * 7) * 1e9; const pe = 9 + r() * 38;
        const a = { symbol: sym, name, type: 'stock', sector, industry: ind, marketCap: Math.round(target * shares), dates, ...s,
          fundamentals: { pe: +pe.toFixed(1), eps: +(target / pe).toFixed(2), revGrowth: +(-5 + r() * 40).toFixed(1), epsGrowth: +(-10 + r() * 55).toFixed(1), divYield: +(r() < 0.3 ? 0 : r() * 4).toFixed(2) },
          earningsDate: new Date(asOfD.getTime() + (3 + Math.floor(r() * 68)) * 864e5).toISOString().slice(0, 10), archetype: arch };
        assets.push(a); bySector[sector].push(a);
      });
    });
    const logret = a => a.c.map((x, i) => i ? Math.log(x / a.c[i - 1]) : 0);
    const mean = (list, mult, noise, rg) => { const rr = list.map(logret); const out = new Array(n).fill(0); for (let i = 1; i < n; i++) { let s = 0; for (const x of rr) s += x[i]; out[i] = (s / rr.length) * mult + (noise ? noise * gauss(rg) : 0); } return out; };
    const mk = (sym, name, rets, seed, vol, sector) => {
      const r = mulberry32(hash(sym) + seed); const L = [0]; for (let i = 1; i < n; i++) L.push(L[i - 1] + rets[i]);
      const vm = rets.map((x, i) => 1); let sd = 0; for (let i = 1; i < n; i++) sd += rets[i] * rets[i]; sd = Math.sqrt(sd / n);
      const target = Math.exp(Math.log(35) + r() * Math.log(7));
      const spike = (sym === 'EWZ') ? 1.78 : 0;
      const s = ohlcv(L, vm, sd * 1.0, target, Math.pow(10, 6.8 + r() * 1.2), r, spike);
      assets.push({ symbol: sym, name, type: 'etf', sector: sector || 'ETF', industry: sector ? 'ETF sectorial' : 'ETF', marketCap: null, dates, ...s });
    };
    const stocks = assets.slice();
    const pick = secList => stocks.filter(a => secList.includes(a.sector));
    const rx = mulberry32(99);
    mk('SPY', 'SPDR S&P 500 ETF', mean(stocks, 1, 0), 1, 0, null);
    mk('QQQ', 'Invesco QQQ', mean(pick(['Tecnología', 'Comunicaciones', 'Consumo discrecional']), 1.1, 0.001, rx), 2, 0, null);
    mk('IWM', 'iShares Russell 2000', mean(stocks, 1.1, 0.004, rx), 3, 0, null);
    mk('DIA', 'SPDR Dow Jones ETF', mean(pick(['Industriales', 'Financiero', 'Salud', 'Consumo básico']), 0.95, 0.001, rx), 4, 0, null);
    UNIVERSE_RAW.forEach(([sector, etf, nm]) => mk(etf, nm, mean(bySector[sector], 1, 0), 5, 0, sector));
    mk('SMH', 'VanEck Semiconductor ETF', mean(stocks.filter(a => a.industry === 'Semiconductores'), 1.15, 0.002, rx), 6, 0, null);
    const ext = (sym, name, arch, sg, seed) => { const r = mulberry32(hash(sym) + seed); const rets = [0]; const g = build(n, r, arch, sg, 0.3, 0, mkt, mkt, 60); for (let i = 1; i < n; i++) rets.push(g.L[i] - g.L[i - 1]); mk(sym, name, rets, seed, 0, null); };
    ext('EWZ', 'iShares MSCI Brazil ETF', 'chop', 0.013, 11); ext('GLD', 'SPDR Gold Shares', 'trend', 0.007, 12); ext('TLT', 'iShares 20+ Year Treasury ETF', 'down', 0.007, 13);
    return { meta: { source: 'mock', simulated: true, asOf, label: 'Datos simulados' }, assets };
  }
  return { load };
})();


/* ============================================================
   HttpProvider — lee data.json generado por tools/build_data.py
   (o window.__ATALAYA_DATA__ si se incrustó en el HTML).
   Formato compacto: {meta, dates[], assets:[{s,n,t,sec,ind,mc,rb,o,h,l,c,v,f,ed}]}
   ============================================================ */
const HttpProvider = (function () {
  async function load(cfg) {
    let d = (typeof window !== 'undefined') && window.__ATALAYA_DATA__;
    if (!d) {
      const r = await fetch('data.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error('data.json no disponible (' + r.status + ')');
      d = await r.json();
    }
    if (!d || !d.dates || !d.assets) throw new Error('data.json con formato inválido');
    const assets = d.assets.map(x => ({ symbol: x.s, name: x.n, type: x.t, sector: x.sec, industry: x.ind, marketCap: x.mc || null,
      dates: d.dates, o: x.o, h: x.h, l: x.l, c: x.c, v: x.v, realBars: x.rb || d.dates.length, fundamentals: x.f || null, earningsDate: x.ed || null }));
    return { meta: { source: d.meta.source || 'real', simulated: false, asOf: d.dates[d.dates.length - 1], generated: d.meta.generated, label: d.meta.label || 'Datos reales', dropped: d.meta.dropped || 0 }, assets };
  }
  return { load };
})();

if (typeof module !== 'undefined') module.exports = { MockProvider, HttpProvider, UNIVERSE_RAW };
