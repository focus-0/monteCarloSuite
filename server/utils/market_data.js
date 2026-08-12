const yahooFinance = require('yahoo-finance2').default;

const FALLBACK_TICKERS = {
  AAPL: { name: 'Apple Inc.', price: 224.30, volatility: 0.2350 },
  TSLA: { name: 'Tesla Inc.', price: 218.50, volatility: 0.4820 },
  NVDA: { name: 'NVIDIA Corporation', price: 128.20, volatility: 0.4210 },
  GOOGL: { name: 'Alphabet Inc.', price: 175.40, volatility: 0.2280 },
  MSFT: { name: 'Microsoft Corporation', price: 415.60, volatility: 0.1980 }
};

async function getMarketData(ticker) {
  const symbol = (ticker || 'AAPL').trim().toUpperCase();

  try {
    let quote = null;
    let history = null;

    try {
      quote = await yahooFinance.quote(symbol);
    } catch (qErr) {
      // Ignore quote error and fall through to fallback
    }

    if (quote && quote.regularMarketPrice) {
      const currentPrice = quote.regularMarketPrice;
      const shortName = quote.shortName || quote.longName || symbol;
      const currency = quote.currency || 'USD';

      const endDate = new Date();
      const startDate = new Date();
      startDate.setFullYear(endDate.getFullYear() - 1);

      try {
        history = await yahooFinance.historical(symbol, {
          period1: startDate,
          period2: endDate,
          interval: '1d'
        });
      } catch (hErr) {
        // Ignore history error
      }

      let calculatedVol = 0.25;
      if (history && history.length > 30) {
        const logReturns = [];
        for (let i = 1; i < history.length; i++) {
          const closeCurr = history[i].close;
          const closePrev = history[i - 1].close;
          if (closeCurr > 0 && closePrev > 0) {
            logReturns.push(Math.log(closeCurr / closePrev));
          }
        }
        if (logReturns.length > 0) {
          const meanReturn = logReturns.reduce((sum, r) => sum + r, 0) / logReturns.length;
          const variance = logReturns.reduce((sum, r) => sum + Math.pow(r - meanReturn, 2), 0) / (logReturns.length - 1);
          calculatedVol = Math.sqrt(variance) * Math.sqrt(252);
        }
      }

      // Try fetching ATM Implied Volatility from options chain
      let impliedVol = null;
      try {
        const optionChain = await yahooFinance.options(symbol);
        if (optionChain && optionChain.options && optionChain.options.length > 0) {
          const calls = optionChain.options[0].calls || [];
          if (calls.length > 0) {
            // Find ATM call option (strike closest to current price)
            let closestCall = calls[0];
            let minDiff = Math.abs(closestCall.strike - currentPrice);

            for (const call of calls) {
              const diff = Math.abs(call.strike - currentPrice);
              if (diff < minDiff && call.impliedVolatility > 0) {
                minDiff = diff;
                closestCall = call;
              }
            }

            if (closestCall && closestCall.impliedVolatility > 0) {
              impliedVol = closestCall.impliedVolatility;
            }
          }
        }
      } catch (optErr) {
        // Fallback to historical volatility if options chain is unavailable
      }

      const finalVol = impliedVol || calculatedVol;

      return {
        symbol,
        name: shortName,
        currency,
        price: Number(currentPrice.toFixed(2)),
        volatility: Number(finalVol.toFixed(4)),
        impliedVolatility: impliedVol ? Number(impliedVol.toFixed(4)) : null,
        historicalVolatility: Number(calculatedVol.toFixed(4)),
        volatilitySource: impliedVol ? 'implied' : 'historical',
        historicalDays: history ? history.length : 0
      };
    }
  } catch (err) {
    // Fall through to fallback
  }

  // Fallback data
  const fallback = FALLBACK_TICKERS[symbol] || {
    name: `${symbol} Security`,
    price: 100.00,
    volatility: 0.2500
  };

  return {
    symbol,
    name: fallback.name,
    currency: 'USD',
    price: fallback.price,
    volatility: fallback.volatility,
    impliedVolatility: fallback.volatility,
    historicalVolatility: fallback.volatility,
    volatilitySource: 'fallback',
    historicalDays: 252,
    isFallback: true
  };
}

module.exports = {
  getMarketData
};
