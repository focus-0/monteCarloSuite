const { yahooFinance } = require('./yahoo_finance');
const config = require('../config');
const { generateIntradaySeries } = require('../data/intraday_market_data');
const { getSessionAnchorIso, buildSimulationTickTime, toIsoUtc } = require('./time_format');

function formatTradingTimeFromDate(d) {
  const hours = d.getUTCHours();
  const mins = d.getUTCMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
  return `${displayHours}:${mins < 10 ? '0' : ''}${mins} ${ampm}`;
}

function computeRollingVol(prices, window = config.intraday.rollingVolWindow) {
  if (prices.length < 2) return config.intraday.defaultVol;
  const start = Math.max(1, prices.length - window);
  const returns = [];
  for (let i = start; i < prices.length; i++) {
    if (prices[i - 1] > 0 && prices[i] > 0) {
      returns.push(Math.log(prices[i] / prices[i - 1]));
    }
  }
  if (!returns.length) return config.intraday.defaultVol;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / Math.max(1, returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252 * 390);
}

async function fetchFromYahoo(symbol, { sessionDate, maxBars = config.intraday.maxBars } = {}) {
  const sym = symbol.toUpperCase();
  let period1;
  let period2;

  if (sessionDate) {
    const dateStr = sessionDate.slice(0, 10);
    period1 = new Date(`${dateStr}T14:30:00.000Z`);
    period2 = new Date(`${dateStr}T21:00:00.000Z`);
  } else {
    period2 = new Date();
    period1 = new Date(period2.getTime() - 86400000);
  }

  const chartResult = await yahooFinance.chart(sym, {
    period1,
    period2,
    interval: '1m'
  });

  const quotes = (chartResult?.quotes || []).filter((q) => q.close > 0);
  if (!quotes.length) throw new Error('No intraday bars from Yahoo');

  const sessionAnchorIso = sessionDate
    ? getSessionAnchorIso(sessionDate.slice(0, 10))
    : toIsoUtc(quotes[0].date) || getSessionAnchorIso();

  const sliced = quotes.slice(-maxBars);
  const priceHistory = [];
  const series = sliced.map((q, idx) => {
    priceHistory.push(q.close);
    const vol = computeRollingVol(priceHistory);
    const d = q.date instanceof Date ? q.date : new Date(q.date);
    const minute = idx + 1;
    const { simulationTimeIso, simulationTimeDisplay } = buildSimulationTickTime(minute, sessionAnchorIso);

    return {
      minute,
      time: formatTradingTimeFromDate(d),
      price: Number(q.close.toFixed(2)),
      volume: q.volume ?? null,
      simulationTimeIso,
      simulationTimeDisplay,
      volatility: Number(vol.toFixed(4)),
      newsEvent: null
    };
  });

  return {
    symbol: sym,
    name: chartResult.meta?.longName || chartResult.meta?.shortName || sym,
    basePrice: series[0]?.price ?? quotes[0].close,
    sessionAnchorIso,
    dataSource: 'yahoo_intraday',
    series
  };
}

async function fetchFromPolygon(symbol, { sessionDate, maxBars = config.intraday.maxBars } = {}) {
  const apiKey = config.polygon.apiKey;
  if (!apiKey) throw new Error('POLYGON_API_KEY not set');

  const sym = symbol.toUpperCase();
  const dateStr = (sessionDate || new Date().toISOString()).slice(0, 10);
  const { apiBaseUrl, intradayLimit } = config.polygon;
  const url = `${apiBaseUrl}/v2/aggs/ticker/${sym}/range/1/minute/${dateStr}/${dateStr}?adjusted=true&sort=asc&limit=${intradayLimit}&apiKey=${apiKey}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Polygon API error: ${res.status}`);
  const data = await res.json();
  const results = data.results || [];
  if (!results.length) throw new Error('No intraday bars from Polygon');

  const sessionAnchorIso = getSessionAnchorIso(dateStr);
  const sliced = results.slice(-maxBars);
  const priceHistory = [];
  const series = sliced.map((bar, idx) => {
    priceHistory.push(bar.c);
    const vol = computeRollingVol(priceHistory);
    const d = new Date(bar.t);
    const minute = idx + 1;
    const { simulationTimeIso, simulationTimeDisplay } = buildSimulationTickTime(minute, sessionAnchorIso);

    return {
      minute,
      time: formatTradingTimeFromDate(d),
      price: Number(bar.c.toFixed(2)),
      volume: bar.v ?? null,
      simulationTimeIso,
      simulationTimeDisplay,
      volatility: Number(vol.toFixed(4)),
      newsEvent: null
    };
  });

  return {
    symbol: sym,
    name: sym,
    basePrice: series[0]?.price ?? results[0].c,
    sessionAnchorIso,
    dataSource: 'polygon_intraday',
    series
  };
}

/**
 * Fetch intraday price series — Yahoo primary, Polygon optional, synthetic fallback.
 */
async function fetchIntradaySeries(symbol, options = {}) {
  const {
    sessionDate = null,
    useLive = true,
    maxBars = config.intraday.maxBars,
    dataSource = config.intraday.defaultDataSource
  } = options;

  const sym = (symbol || config.defaultSymbol).trim().toUpperCase();
  const fetchOpts = { sessionDate, maxBars };

  if (dataSource === 'synthetic') {
    return generateIntradaySeries(sym, sessionDate?.slice(0, 10) || null);
  }

  if (dataSource === 'polygon' && config.polygon.apiKey) {
    try {
      return await fetchFromPolygon(sym, fetchOpts);
    } catch (err) {
      console.warn(`[intraday] Polygon fallback for ${sym}:`, err.message);
    }
  }

  if ((dataSource === 'yahoo' || dataSource === 'polygon') && useLive) {
    try {
      return await fetchFromYahoo(sym, fetchOpts);
    } catch (err) {
      console.warn(`[intraday] Yahoo fallback for ${sym}:`, err.message);
    }
  }

  return generateIntradaySeries(sym, sessionDate?.slice(0, 10) || null);
}

module.exports = {
  fetchIntradaySeries,
  computeRollingVol
};
