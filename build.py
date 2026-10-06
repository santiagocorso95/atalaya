#!/usr/bin/env python3
"""Arma el HTML único de Atalaya.
  python build.py                          -> site/index.html (lee data.json de la misma carpeta al abrirse por http)
  python build.py --data site/data.json    -> HTML autocontenido con los datos incrustados (abre con doble clic)
"""
import argparse, json, os, re
ap = argparse.ArgumentParser()
ap.add_argument('--out', default='site/index.html'); ap.add_argument('--data'); a = ap.parse_args()
r = lambda f: open('src/' + f, encoding='utf-8').read()
js = ''.join(r(f) + '\n' for f in ['config.js', 'provider.js', 'engine.js', 'chart.js', 'ui.js'])
js = re.sub(r"if \(typeof module !== 'undefined'\) module\.exports = [^\n]*\n", '', js)
if a.data:
    blob = open(a.data, encoding='utf-8').read().replace('</', '<\\/')
    js = 'window.__ATALAYA_DATA__=' + blob + ';\n' + js
html = r('index.template.html').replace('/*CSS*/', r('style.css')).replace('/*JS*/', js.replace('</script>', '<\\/script>'))
os.makedirs(os.path.dirname(a.out) or '.', exist_ok=True)
open(a.out, 'w', encoding='utf-8').write(html)
open('/tmp/atalaya.js', 'w', encoding='utf-8').write(js)
print(a.out, len(html) // 1024, 'KB')
