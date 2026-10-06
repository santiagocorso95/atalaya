#!/usr/bin/env node
/* Genera history.json: el top N por score de cada una de las últimas K ruedas.
   Uso: node tools/score_history.js site/data.json site/history.json [--days 20] [--top 50]  */
const fs = require('fs'), path = require('path');
const { DEFAULT_CONFIG } = require('../src/config.js'); const { HttpProvider } = require('../src/provider.js'); const { Engine } = require('../src/engine.js');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : d; };
const [inp, out] = process.argv.slice(2).filter(x => !x.startsWith('--') && isNaN(+x));
(async () => {
  const K = arg('--days', 20), N = arg('--top', 50);
  global.window = { __ATALAYA_DATA__: JSON.parse(fs.readFileSync(inp, 'utf8')) };
  const raw = await HttpProvider.load(DEFAULT_CONFIG); const t0 = Date.now();
  const days = Engine.historyTop(raw, DEFAULT_CONFIG, K, N);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ cfgKey: Engine.cfgKey(DEFAULT_CONFIG), topN: N, generated: new Date().toISOString().slice(0, 16) + ' UTC', days }));
  console.log(`history.json: ${K} ruedas × top ${N} (${((Date.now() - t0) / 1000).toFixed(1)} s) → ${out}`);
})().catch(e => { console.error(e); process.exit(1); });
