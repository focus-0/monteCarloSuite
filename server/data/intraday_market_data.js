/**
 * Intraday Market Data Store for 390 Trading Minutes (9:30 AM - 4:00 PM)
 * Provides realistic minute-by-minute price series, volatility dynamics, and scheduled breaking news events.
 */

const BASE_ASSETS = {
  AAPL: { name: 'Apple Inc.', basePrice: 224.30, baseVol: 0.235, driftRate: 0.0002 },
  NVDA: { name: 'NVIDIA Corporation', basePrice: 128.20, baseVol: 0.421, driftRate: 0.0005 },
  TSLA: { name: 'Tesla Inc.', basePrice: 218.50, baseVol: 0.482, driftRate: -0.0003 },
  SPY:  { name: 'S&P 500 ETF Trust', basePrice: 545.10, baseVol: 0.142, driftRate: 0.0001 }
};

const NEWS_EVENTS = {
  120: { title: "Earnings Guidance Update Announced", volMultiplier: 1.25, priceShockPct: 0.015 },
  240: { title: "Federal Reserve Interest Rate Statement", volMultiplier: 1.40, priceShockPct: -0.012 },
  330: { title: "Institutional Power-Hour Volume Surge", volMultiplier: 1.15, priceShockPct: 0.008 }
};

function generateIntradaySeries(symbol = 'AAPL') {
  const asset = BASE_ASSETS[symbol.toUpperCase()] || BASE_ASSETS.AAPL;
  const series = [];
  let currentPrice = asset.basePrice;
  let currentVol = asset.baseVol;

  // Pseudo-random deterministic generator for consistent trading arena benchmarks
  let seed = 42 + symbol.charCodeAt(0);
  const pseudoRand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  for (let minute = 1; minute <= 390; minute++) {
    // Normal approximation via Box-Muller
    const u1 = pseudoRand() || 0.001;
    const u2 = pseudoRand() || 0.001;
    const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);

    const dt = 1.0 / (252 * 390); // 1 minute in years
    let shock = 0;
    let newsEvent = null;

    // Check scheduled news events
    if (NEWS_EVENTS[minute]) {
      newsEvent = NEWS_EVENTS[minute].title;
      currentVol *= NEWS_EVENTS[minute].volMultiplier;
      shock = currentPrice * NEWS_EVENTS[minute].priceShockPct;
    }

    const priceChange = currentPrice * (asset.driftRate * dt + currentVol * Math.sqrt(dt) * z) + shock;
    currentPrice = Math.max(1.0, currentPrice + priceChange);

    // Minor volatility mean-reversion
    currentVol = currentVol * 0.995 + asset.baseVol * 0.005;

    series.push({
      minute,
      time: formatTradingTime(minute),
      price: Number(currentPrice.toFixed(2)),
      volatility: Number(currentVol.toFixed(4)),
      newsEvent
    });
  }

  return {
    symbol: symbol.toUpperCase(),
    name: asset.name,
    basePrice: asset.basePrice,
    series
  };
}

function formatTradingTime(minute) {
  const totalMinutes = 9 * 60 + 30 + minute;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours > 12 ? hours - 12 : hours;
  return `${displayHours}:${mins < 10 ? '0' : ''}${mins} ${ampm}`;
}

module.exports = {
  generateIntradaySeries,
  BASE_ASSETS
};
