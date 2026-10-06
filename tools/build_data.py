#!/usr/bin/env python3
"""
Genera data.json para Atalaya con datos reales de fin de día.

Fuentes (todas sin API key):
  - Precios OHLCV diarios ajustados por splits/dividendos: Yahoo Finance vía yfinance (fuente NO oficial).
  - Universo, sector e industria: lista del S&P 500 en Wikipedia (o tu propio CSV con --universe).
  - Perfiles opcionales (capitalización, P/E, EPS, crecimientos, dividend yield, próximos earnings): Yahoo vía yfinance, con caché.

Uso:
  pip install yfinance pandas lxml requests
  python tools/build_data.py --out site/data.json              # precios + universo
  python tools/build_data.py --out site/data.json --profiles   # además refresca perfiles (lento, ~10 min)
  python tools/build_data.py --index sp1500 --out site/data.json    # S&P 1500 (~1.500 acciones)
  python tools/build_data.py --universe mi_lista.csv --out site/data.json   # CSV: symbol,name,sector,industry
  python tools/build_data.py --limit 40 --out /tmp/data.json   # prueba rápida
"""
import argparse, datetime as dt, io, json, os, sys, time
from concurrent.futures import ThreadPoolExecutor
import pandas as pd

WIKI = {'sp500': 'https://en.wikipedia.org/wiki/List_of_S%26P_500_companies',
        'sp400': 'https://en.wikipedia.org/wiki/List_of_S%26P_400_companies',
        'sp600': 'https://en.wikipedia.org/wiki/List_of_S%26P_600_companies'}
INDEX_SETS = {'sp500': ['sp500'], 'sp1500': ['sp500', 'sp400', 'sp600']}
SECTOR_ES = {
    'Information Technology': 'Tecnología', 'Financials': 'Financiero', 'Energy': 'Energía', 'Health Care': 'Salud',
    'Industrials': 'Industriales', 'Consumer Discretionary': 'Consumo discrecional', 'Consumer Staples': 'Consumo básico',
    'Utilities': 'Servicios públicos', 'Materials': 'Materiales', 'Real Estate': 'Inmobiliario', 'Communication Services': 'Comunicaciones'}
SECTOR_ETF = {'XLK': 'Tecnología', 'XLF': 'Financiero', 'XLE': 'Energía', 'XLV': 'Salud', 'XLI': 'Industriales', 'XLY': 'Consumo discrecional',
              'XLP': 'Consumo básico', 'XLU': 'Servicios públicos', 'XLB': 'Materiales', 'XLRE': 'Inmobiliario', 'XLC': 'Comunicaciones'}
ETF_NAMES = {
    'SPY': 'SPDR S&P 500 ETF', 'QQQ': 'Invesco QQQ', 'IWM': 'iShares Russell 2000', 'DIA': 'SPDR Dow Jones ETF',
    'XLK': 'Technology Select Sector SPDR', 'XLF': 'Financial Select Sector SPDR', 'XLE': 'Energy Select Sector SPDR', 'XLV': 'Health Care Select Sector SPDR',
    'XLI': 'Industrial Select Sector SPDR', 'XLY': 'Consumer Discretionary Select Sector SPDR', 'XLP': 'Consumer Staples Select Sector SPDR',
    'XLU': 'Utilities Select Sector SPDR', 'XLB': 'Materials Select Sector SPDR', 'XLRE': 'Real Estate Select Sector SPDR', 'XLC': 'Communication Services Select Sector SPDR',
    'SMH': 'VanEck Semiconductor ETF', 'EWZ': 'iShares MSCI Brazil ETF', 'GLD': 'SPDR Gold Shares', 'TLT': 'iShares 20+ Year Treasury Bond ETF'}


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def _wiki_table(url):
    """Devuelve (symbol, name, sector, industry) desde una tabla de Wikipedia, tolerando nombres de columna distintos."""
    import requests
    r = requests.get(url, headers={'User-Agent': 'Mozilla/5.0 (atalaya personal screener)'}, timeout=30)
    r.raise_for_status()
    for t in pd.read_html(io.StringIO(r.text)):
        cols = {str(c).strip().lower(): c for c in t.columns}
        sym = next((cols[k] for k in cols if k in ('symbol', 'ticker', 'ticker symbol')), None)
        nam = next((cols[k] for k in cols if k in ('security', 'company', 'name')), None)
        sec = next((cols[k] for k in cols if 'gics' in k and 'sector' in k), None)
        sub = next((cols[k] for k in cols if 'gics' in k and 'sub' in k), None)
        if sym is not None and sec is not None and len(t) > 100:
            return pd.DataFrame({'symbol': t[sym].astype(str), 'name': t[nam] if nam is not None else t[sym],
                                 'sector': t[sec], 'industry': t[sub] if sub is not None else ''})
    raise RuntimeError('No se encontró la tabla de constituyentes en ' + url)


def load_universe(path=None, limit=None, index='sp500'):
    if path:
        df = pd.read_csv(path)
        for c in ('symbol', 'name', 'sector', 'industry'):
            if c not in df.columns:
                df[c] = df['symbol'] if c == 'name' else ''
    else:
        parts = []
        for key in INDEX_SETS[index]:
            try:
                parts.append(_wiki_table(WIKI[key]))
            except Exception as e:
                if key == 'sp500':
                    raise
                log(f'  aviso: no se pudo leer {key}: {e}')
        df = pd.concat(parts, ignore_index=True)
    df['symbol'] = df['symbol'].astype(str).str.strip().str.upper().str.replace('.', '-', regex=False)
    df['sector'] = df['sector'].map(lambda x: SECTOR_ES.get(x, x))
    df = df.drop_duplicates('symbol')
    if limit:
        df = df.head(limit)
    return df[['symbol', 'name', 'sector', 'industry']].reset_index(drop=True)


def download(symbols, period='5y', batch=80, retries=3):
    import yfinance as yf
    out = {}
    for i in range(0, len(symbols), batch):
        chunk = symbols[i:i + batch]
        df = None
        for att in range(retries):
            try:
                df = yf.download(chunk, period=period, interval='1d', auto_adjust=True, group_by='ticker', threads=True, progress=False)
                if df is not None and not df.empty:
                    break
            except Exception as e:  # red / límite de tasa
                log(f'  intento {att + 1} falló: {e}')
            time.sleep(5 * (att + 1))
        if df is None or df.empty:
            log(f'  lote {i // batch + 1}: sin datos')
            continue
        for s in chunk:
            try:
                d = df[s] if isinstance(df.columns, pd.MultiIndex) else df
                d = d[['Open', 'High', 'Low', 'Close', 'Volume']].dropna(subset=['Close'])
                if len(d):
                    out[s] = d
            except KeyError:
                pass
        log(f'  descargados {min(i + batch, len(symbols))}/{len(symbols)}')
        time.sleep(1)
    return out


def refresh_profiles(symbols, path, max_age_days=7, workers=6):
    import yfinance as yf
    cache = json.load(open(path, encoding='utf-8')) if os.path.exists(path) else {}
    today = dt.date.today()
    stale = lambda s: s not in cache or (today - dt.date.fromisoformat(cache[s].get('updated', '2000-01-01'))).days > max_age_days
    todo = [s for s in symbols if stale(s)]
    log(f'Perfiles a refrescar: {len(todo)} de {len(symbols)}')

    def one(s):
        try:
            t = yf.Ticker(s)
            info = t.info or {}
            g = lambda k: info.get(k) if isinstance(info.get(k), (int, float)) else None
            pct = lambda v: round(v * 100, 1) if v is not None else None
            ed = None
            try:
                cal = t.calendar
                v = cal.get('Earnings Date') if isinstance(cal, dict) else None
                v = [x for x in (v or []) if x >= today]
                ed = min(v).isoformat() if v else None
            except Exception:
                pass
            return s, {'mc': g('marketCap'), 'pe': g('trailingPE'), 'eps': g('trailingEps'), 'rev': pct(g('revenueGrowth')),
                       'epsg': pct(g('earningsGrowth')), 'div': pct(g('trailingAnnualDividendYield')), 'ed': ed, 'updated': today.isoformat()}
        except Exception as e:
            return s, None

    with ThreadPoolExecutor(workers) as ex:
        for k, (s, p) in enumerate(ex.map(one, todo), 1):
            if p:
                cache[s] = p
            if k % 50 == 0:
                log(f'  perfiles {k}/{len(todo)}')
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    json.dump(cache, open(path, 'w', encoding='utf-8'), separators=(',', ':'))
    return cache


def encode_v2(sym, name, typ, sec, ind, rb, o, h, l, c, v):
    """Formato compacto v2: precios en centavos enteros. c = deltas del cierre (el primero absoluto);
    o/h/l = diferencia contra el cierre del mismo día; v = miles de acciones."""
    ci = [int(round(float(x) * 100)) for x in c]
    oi = [int(round(float(x) * 100)) for x in o]; hi = [int(round(float(x) * 100)) for x in h]; li = [int(round(float(x) * 100)) for x in l]
    return {'s': sym, 'n': str(name), 't': typ, 'sec': sec, 'ind': ind, 'rb': int(rb),
            'c': [ci[0]] + [ci[i] - ci[i - 1] for i in range(1, len(ci))],
            'o': [oi[i] - ci[i] for i in range(len(ci))], 'h': [hi[i] - ci[i] for i in range(len(ci))], 'l': [li[i] - ci[i] for i in range(len(ci))],
            'v': [int(round(float(x) / 1000)) for x in v]}


def build_payload(frames, uni, days, min_bars, profiles):
    if 'SPY' not in frames:
        raise SystemExit('No se pudo descargar SPY (benchmark). Abortando.')
    base = frames['SPY'].index.unique().sort_values()[-days:]
    meta = [(r.symbol, r.name, 'stock', r.sector, r.industry) for r in uni.itertuples()]
    for s, n in ETF_NAMES.items():
        sec = SECTOR_ETF.get(s)
        meta.append((s, n, 'etf', sec or 'ETF', 'ETF sectorial' if sec else 'ETF'))
    assets, dropped = [], []
    for sym, name, typ, sec, ind in meta:
        d = frames.get(sym)
        if d is None:
            dropped.append((sym, 'sin datos')); continue
        d = d[~d.index.duplicated(keep='last')]
        r = d.reindex(base)
        valid = r['Close'].notna()
        if not valid.any() or r['Close'].last_valid_index() < base[-5]:
            dropped.append((sym, 'sin cotización reciente')); continue
        first = r['Close'].first_valid_index()
        rb = len(base) - base.get_loc(first)
        if rb < min_bars:
            dropped.append((sym, f'historia corta ({rb})')); continue
        px = r[['Open', 'High', 'Low', 'Close']].ffill(limit=5).bfill()
        if px.isna().any().any():
            dropped.append((sym, 'huecos largos')); continue
        v = r['Volume'].fillna(0)
        o, c = px['Open'], px['Close']
        h = pd.concat([px['High'], o, c], axis=1).max(axis=1)
        l = pd.concat([px['Low'], o, c], axis=1).min(axis=1)
        if (c <= 0).any() or (h <= 0).any() or (l <= 0).any():
            dropped.append((sym, 'precios inválidos')); continue
        a = encode_v2(sym, name, typ, sec, ind, rb, o, h, l, c, v)
        p = profiles.get(sym) if typ == 'stock' else None
        if p:
            a['mc'] = p.get('mc'); a['ed'] = p.get('ed')
            if p.get('pe') or p.get('eps'):
                a['f'] = {'pe': p.get('pe'), 'eps': p.get('eps'), 'revGrowth': p.get('rev'), 'epsGrowth': p.get('epsg'), 'divYield': p.get('div')}
        assets.append(a)
    if not any(a['s'] == 'SPY' for a in assets):
        raise SystemExit('SPY quedó fuera de los datos.')
    payload = {'meta': {'format': 2, 'source': 'Yahoo Finance (yfinance)', 'label': 'Datos reales de fin de día',
                        'generated': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%d %H:%M UTC'), 'dropped': len(dropped)},
               'dates': [d.strftime('%Y-%m-%d') for d in base], 'assets': assets}
    return payload, dropped


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--out', default='site/data.json')
    ap.add_argument('--days', type=int, default=1100, help='ruedas a conservar (1100 cubre EMA 200 semanal)')
    ap.add_argument('--min-bars', type=int, default=400, help='historia mínima para incluir un activo')
    ap.add_argument('--index', choices=list(INDEX_SETS), default='sp500', help='sp500 (~500 acciones) o sp1500 (S&P 500 + 400 + 600, ~1.500)')
    ap.add_argument('--universe', help='CSV propio: symbol,name,sector,industry')
    ap.add_argument('--limit', type=int, help='solo los primeros N del universo (pruebas)')
    ap.add_argument('--profiles', action='store_true', help='refresca perfiles (capitalización, fundamentales, earnings)')
    ap.add_argument('--profiles-cache', default='data/profiles.json')
    a = ap.parse_args()

    uni = load_universe(a.universe, a.limit, a.index)
    symbols = list(dict.fromkeys(list(uni.symbol) + list(ETF_NAMES)))
    log(f'Universo: {len(uni)} acciones + {len(ETF_NAMES)} ETFs')
    frames = download(symbols)
    profiles = {}
    if a.profiles:
        profiles = refresh_profiles(list(uni.symbol), a.profiles_cache)
    elif os.path.exists(a.profiles_cache):
        profiles = json.load(open(a.profiles_cache, encoding='utf-8'))
    payload, dropped = build_payload(frames, uni, a.days, a.min_bars, profiles)
    os.makedirs(os.path.dirname(a.out) or '.', exist_ok=True)
    with open(a.out, 'w', encoding='utf-8') as f:
        json.dump(payload, f, separators=(',', ':'))
    log(f'OK: {len(payload["assets"])} activos, {len(payload["dates"])} ruedas, último día {payload["dates"][-1]} → {a.out} ({os.path.getsize(a.out) // 1024} KB)')
    if dropped:
        log('Descartados:', ', '.join(f'{s} ({m})' for s, m in dropped[:40]) + (' …' if len(dropped) > 40 else ''))


if __name__ == '__main__':
    main()
