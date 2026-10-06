/* ============================================================
   CONFIG — todo lo ajustable vive acá (JSON puro, sin funciones).
   Las reglas de score son datos: {tipo, feature, pesos, umbrales}.
   Tipos: above (a>b), gt (a>b), scale (gradúa 0..1 entre lo y hi), bool.
   ============================================================ */
const DEFAULT_CONFIG = {
  benchmark: 'SPY',
  benchmarks: ['SPY', 'QQQ', 'IWM', 'DIA'],
  history: { days: 1100 },

  indicators: {
    sma: [10, 21, 50],
    ema: [200],
    weeklyEma: [10, 200],
    atr: 14,
    rsi: 14,
    rci: { period: 9, signalPeriod: 14 },   // período RCI: SUPUESTO configurable
    volAvg: 20,                              // promedio de volumen (ruedas previas)
    volAvgLong: 50,
    macd: { fast: 12, slow: 26, signal: 9 }
  },

  rs: {
    // RS rating = percentil del score ponderado de rendimiento relativo vs benchmark.
    // Lookbacks/pesos: SUPUESTO configurable (no es la fórmula de ninguna plataforma).
    lookbacks: [63, 126, 189, 252],
    weights: [0.4, 0.2, 0.2, 0.2],
    history: 130,
    weeklyWindow: 5,
    monthlyWindow: 21,
    avgPeriod: 50
  },

  rotation: { weeks: 16, ratioSma: 10, momSma: 4 },   // estilo RRG, parametrizado (no es JdK exacto)

  volume: { significantRel: 1.2, unusualRel: 1.5 },
  sessions: { n: 10 },

  vcp: {
    lookback: 120, minBaseDays: 10, swingPct: 3.5, skipRecent: 5,
    maxDistPct: 10, minPriorRunPct: 30, maxExtendedPct: 8,
    weights: { count: 0.30, decreasing: 0.25, volume: 0.15, proximity: 0.15, prior: 0.15 },
    labelHigh: 0.70, labelMid: 0.45
  },

  signals: {
    ema200Touch: { lookback: 10, tolerancePct: 1.5, requireUpSlope: false },
    cross: { lookback: 10, weeklyLookback: 4, ma: 'ema200' },
    weeklyTouch: { lookback: 4, tolerancePct: 3 },
    rciCross: { lookbackWeeks: 3 },
    macd: { lookback: 5, weeklyLookback: 2 }
  },

  score: {
    // Si Trend < umbral (%), Contracción y Setup se multiplican por el factor (SUPUESTO).
    gate: { trendMinPct: 40, factor: 0.5 },
    labels: { strong: 75, moderate: 50, weak: 30 },   // % del pilar para etiquetas de Contracción
    pillars: {
      trend: { max: 25, rules: [
        { id: 'pxEma200', label: 'Precio > EMA 200', type: 'above', a: 'close', b: 'ema200', w: 3 },
        { id: 'slope200', label: 'EMA 200 con pendiente positiva (20d, %)', type: 'scale', f: 'slope200', lo: 0, hi: 1.5, w: 2 },
        { id: 'slope50', label: 'SMA 50 con pendiente positiva (20d, %)', type: 'scale', f: 'slope50', lo: 0, hi: 4, w: 3 },
        { id: 'pxSma50', label: 'Precio > SMA 50', type: 'above', a: 'close', b: 'sma50', w: 3 },
        { id: 'm10_21', label: 'SMA 10 > SMA 21', type: 'gt', a: 'sma10', b: 'sma21', w: 2 },
        { id: 'm21_50', label: 'SMA 21 > SMA 50', type: 'gt', a: 'sma21', b: 'sma50', w: 3 },
        { id: 'wEma10', label: 'Precio > EMA 10 semanal', type: 'above', a: 'close', b: 'wema10', w: 2 },
        { id: 'wEma200', label: 'Precio > EMA 200 semanal', type: 'above', a: 'close', b: 'wema200', w: 2 },
        { id: 'hhhl', label: 'Máximos y mínimos ascendentes', type: 'bool', f: 'hhhl', w: 2 }
      ] },
      rs: { max: 25, rules: [
        { id: 'rating', label: 'RS rating (percentil)', type: 'scale', f: 'rsRating', lo: 50, hi: 95, w: 6 },
        { id: 'chg5', label: 'Cambio de RS 1 semana', type: 'scale', f: 'rsChange5', lo: 0, hi: 8, w: 3 },
        { id: 'chg21', label: 'Cambio de RS 1 mes', type: 'scale', f: 'rsChange21', lo: 0, hi: 15, w: 3 },
        { id: 'vsAvg', label: 'Línea RS sobre su media de 50d (%)', type: 'scale', f: 'rsVsAvg50', lo: 0, hi: 5, w: 3 },
        { id: 'nearHigh', label: 'Línea RS cerca de su máximo 52s (% debajo)', type: 'scale', f: 'rsFromHigh', lo: 10, hi: 0, w: 3 },
        { id: 'out20', label: 'Rinde más que el benchmark en 20d (pp)', type: 'scale', f: 'outperf20', lo: 0, hi: 10, w: 2 }
      ] },
      contraction: { max: 25, rules: [
        { id: 'atrFall', label: 'ATR actual vs hace 40d (ratio)', type: 'scale', f: 'atrRatio', lo: 1.0, hi: 0.7, w: 4 },
        { id: 'rangeFall', label: 'Rango promedio 10d vs 40d (ratio)', type: 'scale', f: 'rangeRatio', lo: 1.0, hi: 0.6, w: 4 },
        { id: 'volFall', label: 'Volumen 10d vs 50d (ratio)', type: 'scale', f: 'volRatio', lo: 1.0, hi: 0.65, w: 3 },
        { id: 'hvFall', label: 'Volatilidad histórica 10d vs 60d (ratio)', type: 'scale', f: 'hvRatio', lo: 1.0, hi: 0.6, w: 3 },
        { id: 'tight', label: 'Cierres ajustados 10d (rango %)', type: 'scale', f: 'tight10', lo: 8, hi: 3, w: 3 },
        { id: 'atrLow', label: 'ATR % del precio', type: 'scale', f: 'atrPct', lo: 6, hi: 2, w: 2 }
      ] },
      setup: { max: 25, rules: [
        { id: 'vcp', label: 'Confianza de patrón VCP/BCP', type: 'scale', f: 'vcpConfidence', lo: 0.3, hi: 0.85, w: 8 },
        { id: 'pivot', label: 'Cercanía al pivote (% debajo)', type: 'scale', f: 'distPivot', lo: 12, hi: 1, w: 5 },
        { id: 'prior', label: 'Subida previa a la base (%)', type: 'scale', f: 'priorRun', lo: 10, hi: 60, w: 3 },
        { id: 'brk', label: 'Ruptura reciente con volumen', type: 'bool', f: 'breakout', w: 3 },
        { id: 'pull', label: 'Pullback a SMA 21 en tendencia', type: 'bool', f: 'pullback', w: 2 },
        { id: 'bounce', label: 'Rebote en EMA 200', type: 'bool', f: 'ema200Bounce', w: 2 }
      ] }
    }
  },

  // penalty > 0 resta puntos del score; penalty 0 = solo informativa.
  warnings: [
    { id: 'sma50Slope', label: 'Pendiente bajista de SMA 50', type: 'lt', f: 'slope50', v: 0, penalty: 3 },
    { id: 'rciDiv', label: 'Divergencia bajista de RCI semanal', type: 'flag', f: 'rciDivergence', penalty: 2 },
    { id: 'volDecl', label: 'Volumen decreciente', type: 'lt', f: 'volRatio', v: 0.7, penalty: 0 },
    { id: 'extended', label: 'Extensión excesiva sobre SMA 50 (>20%)', type: 'gt', f: 'distSma50', v: 20, penalty: 3 },
    { id: 'highVol', label: 'Volatilidad excesiva (ATR > 5%)', type: 'gt', f: 'atrPct', v: 5, penalty: 2 },
    { id: 'lostSma50', label: 'Perdió la SMA 50', type: 'flag', f: 'belowSma50', penalty: 2 },
    { id: 'lostEma200', label: 'Perdió la EMA 200', type: 'flag', f: 'belowEma200', penalty: 4 }
  ],

  regime: {
    breadthBull: 60, breadthBear: 40, volLow: 14, volHigh: 22,
    bullAt: 0.4, bearAt: -0.4
  }
};

if (typeof module !== 'undefined') module.exports = { DEFAULT_CONFIG };
