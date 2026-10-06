"""Prueba build_payload con datos sintéticos (sin red): casos borde de datos reales."""
import sys, json, numpy as np, pandas as pd
sys.path.insert(0, 'tools'); import build_data as bd
rng = np.random.default_rng(1)
days = pd.bdate_range(end='2026-10-02', periods=1250)
def frame(idx, drift=0.0004, vol=0.015, p0=100):
    r = rng.normal(drift, vol, len(idx)); c = p0 * np.exp(np.cumsum(r)); o = c * (1 + rng.normal(0, .003, len(idx)))
    return pd.DataFrame({'Open': o, 'High': np.maximum(o, c) * 1.01, 'Low': np.minimum(o, c) * .99, 'Close': c, 'Volume': rng.integers(1e6, 5e7, len(idx)).astype(float)}, index=idx)
n = 90; syms = [f'S{i:03d}' for i in range(n)]
uni = pd.DataFrame({'symbol': syms, 'name': [f'Empresa {s}' for s in syms], 'sector': (list(bd.SECTOR_ES.values()) * 9)[:n], 'industry': 'Industria X'})
frames = {s: frame(days) for s in syms + list(bd.ETF_NAMES)}
frames['S001'] = frame(days[-300:])                         # historia corta -> descartar
frames['S002'] = frame(days[:-20])                          # sin cotización reciente -> descartar
f3 = frame(days); f3 = f3.drop(f3.index[[500, 501, 502]]); frames['S003'] = f3   # días faltantes -> ffill
f4 = frame(days[-700:]); frames['S004'] = f4                # 700 ruedas -> se incluye con rb=700
f5 = frame(days); f5.loc[f5.index[-5:], 'Volume'] = np.nan; frames['S005'] = f5   # volumen NaN
del frames['S006']                                          # sin datos
payload, dropped = bd.build_payload(frames, uni, 1100, 400, {'S010': {'mc': 3e11, 'pe': 20.5, 'eps': 5.1, 'rev': 8.0, 'epsg': 12.0, 'div': 1.1, 'ed': '2026-10-28'}})
d = dict(dropped); print('descartados:', d)
assert d['S001'].startswith('historia corta') and d['S002'] == 'sin cotización reciente' and d['S006'] == 'sin datos'
A = {a['s']: a for a in payload['assets']}
n_d = len(payload['dates']); assert n_d == 1100
assert all(len(a[k]) == n_d for a in A.values() for k in 'ohlcv')
assert A['S004']['rb'] == 700 and A['S003']['rb'] == 1100 and A['S005']['v'][-1] == 0
assert A['S010']['mc'] == 3e11 and A['S010']['ed'] == '2026-10-28' and A['S010']['f']['pe'] == 20.5
assert all(min(a['l'][i], a['o'][i], a['c'][i]) == a['l'][i] and max(a['h'][i], a['o'][i], a['c'][i]) == a['h'][i] for a in A.values() for i in range(0, n_d, 37))
assert A['XLK']['sec'] == 'Tecnología' and A['XLK']['ind'] == 'ETF sectorial' and A['SPY']['t'] == 'etf'
json.dump(payload, open('/tmp/data_test.json', 'w'), separators=(',', ':'))
print('OK', len(payload['assets']), 'activos;', round(len(json.dumps(payload, separators=(',', ':'))) / 1e6, 1), 'MB para', len(payload['assets']), 'activos')
