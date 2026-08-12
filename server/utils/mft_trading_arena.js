const { generateIntradaySeries } = require('../data/intraday_market_data');
const monteCarloService = require('./monte_carlo_service');
const { getMarketNews } = require('./market_news');

/**
 * MFT Trading Arena Simulation Engine
 * Runs a 390-minute intraday trading day, evaluating C++ engine Greeks and executing trade strategies.
 */
async function runTradingArena(params = {}) {
  const {
    symbol = 'AAPL',
    capital = 100000,
    strategyMode = 'ai_agent', // 'ai_agent' | 'delta_hedge' | 'buy_hold'
    timeWindow = 30, // 30 mins fast window vs 390 mins full day
    txCostPct = 0.001 // 10 bps
  } = params;

  const startT = Date.now();
  const fullMarketData = generateIntradaySeries(symbol);
  const targetWindow = Math.min(Math.max(10, parseInt(timeWindow)), 390);
  const series = fullMarketData.series.slice(0, targetWindow);

  // Fetch live breaking news for this symbol (non-blocking, runs in parallel)
  const newsPromise = getMarketNews(symbol, 5);

  let cash = Number(capital);
  let sharesHeld = 0;
  let optionContractsHeld = 0;
  let initialOptionPrice = 0;

  const K = marketData.basePrice; // At-The-Money strike
  const r = 0.05;
  const T_years = 0.25; // 3-month option maturity
  const isCall = true;

  const tradeLog = [];
  const navCurve = [];
  let peakNav = capital;
  let maxDrawdown = 0;
  let winningTrades = 0;
  let totalClosedTrades = 0;
  let totalTxCosts = 0;

  // Calculate initial option price at Minute 1 via C++
  const firstTick = series[0];
  try {
    const initRes = await monteCarloService.calculateOptionPrice({
      S0: firstTick.price,
      K,
      r,
      sigma: firstTick.volatility,
      T: T_years,
      isCall,
      numTrials: 50000
    });
    initialOptionPrice = initRes.optionPrice || 10.0;
  } catch (err) {
    initialOptionPrice = 10.0;
  }

  // Minute-by-minute trading simulation loop
  let lastHedgeMinute = 0;

  for (let i = 0; i < series.length; i++) {
    const tick = series[i];
    const S = tick.price;
    const vol = tick.volatility;

    // Call sub-2ms C++ engine for current Greeks & option value every 15 minutes or on news events
    let currentDelta = 0.50;
    let currentOptPrice = initialOptionPrice;

    if (i % 15 === 0 || tick.newsEvent || i === series.length - 1) {
      try {
        const greeksRes = await monteCarloService.calculateGreeks({
          S0: S,
          K,
          r,
          sigma: vol,
          T: T_years,
          isCall,
          numTrials: 50000
        });
        if (greeksRes && greeksRes.greeks) {
          currentDelta = greeksRes.greeks.delta;
          currentOptPrice = greeksRes.optionPrice;
        }
      } catch (e) {
        currentDelta = 0.50;
      }
    }

    // Strategy decision logic
    if (strategyMode === 'ai_agent' || strategyMode === 'delta_hedge') {
      // Step 1: Open initial position at Minute 1
      if (i === 0) {
        const contractsToBuy = 10; // 1,000 shares equivalent
        const cost = contractsToBuy * 100 * currentOptPrice;
        const txFee = cost * txCostPct;
        cash -= (cost + txFee);
        optionContractsHeld = contractsToBuy;
        totalTxCosts += txFee;

        // Initial Delta Hedge
        const targetShares = Math.round(optionContractsHeld * 100 * currentDelta);
        const shareCost = targetShares * S;
        const shareFee = shareCost * txCostPct;
        cash -= (shareCost + shareFee);
        sharesHeld = targetShares;
        totalTxCosts += shareFee;
        lastHedgeMinute = tick.minute;

        tradeLog.push({
          minute: tick.minute,
          time: tick.time,
          action: 'OPEN_POSITION',
          detail: `Bought ${contractsToBuy} Call Contracts @ $${currentOptPrice.toFixed(2)} & Hedged ${targetShares} shares @ $${S.toFixed(2)}`,
          stockPrice: S,
          delta: Number(currentDelta.toFixed(4)),
          txFee: Number((txFee + shareFee).toFixed(2)),
          reason: 'Initial position entry & delta-neutral hedge setup.'
        });
      }
      // Step 2: Rebalance on news events or Delta drift > 0.08
      else if (tick.newsEvent || (i - lastHedgeMinute >= 30 && Math.abs(sharesHeld - Math.round(optionContractsHeld * 100 * currentDelta)) > 50)) {
        const targetShares = Math.round(optionContractsHeld * 100 * currentDelta);
        const dShares = targetShares - sharesHeld;

        if (Math.abs(dShares) > 10) {
          const tradeVal = Math.abs(dShares) * S;
          const fee = tradeVal * txCostPct;
          cash -= (dShares * S + fee);
          sharesHeld = targetShares;
          totalTxCosts += fee;
          lastHedgeMinute = tick.minute;

          tradeLog.push({
            minute: tick.minute,
            time: tick.time,
            action: dShares > 0 ? 'BUY_HEDGE' : 'SELL_HEDGE',
            detail: `${dShares > 0 ? 'Bought' : 'Sold'} ${Math.abs(dShares)} shares @ $${S.toFixed(2)}`,
            stockPrice: S,
            delta: Number(currentDelta.toFixed(4)),
            txFee: Number(fee.toFixed(2)),
            reason: tick.newsEvent ? `News Shock ("${tick.newsEvent}") trigger.` : `Delta drift threshold breached.`
          });
        }
      }
    } else if (strategyMode === 'buy_hold') {
      if (i === 0) {
        const buyShares = Math.floor(cash / S);
        const fee = buyShares * S * txCostPct;
        cash -= (buyShares * S + fee);
        sharesHeld = buyShares;
        totalTxCosts += fee;
        tradeLog.push({
          minute: tick.minute,
          time: tick.time,
          action: 'BUY_HOLD',
          detail: `Bought ${buyShares} shares @ $${S.toFixed(2)}`,
          stockPrice: S,
          delta: 1.0,
          txFee: Number(fee.toFixed(2)),
          reason: 'Unhedged long stock benchmark.'
        });
      }
    }

    // Liquidate position on final minute (Minute 390)
    if (i === series.length - 1) {
      if (optionContractsHeld > 0) {
        const optVal = optionContractsHeld * 100 * currentOptPrice;
        const optFee = optVal * txCostPct;
        cash += (optVal - optFee);
        totalTxCosts += optFee;
      }
      if (sharesHeld !== 0) {
        const shareVal = sharesHeld * S;
        const shareFee = Math.abs(shareVal) * txCostPct;
        cash += (shareVal - shareFee);
        totalTxCosts += shareFee;
      }
      tradeLog.push({
        minute: tick.minute,
        time: tick.time,
        action: 'CLOSE_ALL',
        detail: `Liquidated remaining positions at Market Close`,
        stockPrice: S,
        delta: Number(currentDelta.toFixed(4)),
        txFee: 0.0,
        reason: 'End of day trading session settlement.'
      });
    }

    // Calculate Portfolio NAV at this minute
    const currentOptionVal = optionContractsHeld * 100 * currentOptPrice;
    const currentShareVal = sharesHeld * S;
    const currentNav = cash + currentOptionVal + currentShareVal;

    if (currentNav > peakNav) peakNav = currentNav;
    const dd = (peakNav - currentNav) / peakNav;
    if (dd > maxDrawdown) maxDrawdown = dd;

    navCurve.push({
      minute: tick.minute,
      time: tick.time,
      price: S,
      nav: Number(currentNav.toFixed(2))
    });
  }

  const finalNav = navCurve[navCurve.length - 1].nav;
  const netProfit = finalNav - capital;
  const roiPct = (netProfit / capital) * 100;

  // Calculate Sharpe Ratio from minute returns
  const returns = [];
  for (let j = 1; j < navCurve.length; j++) {
    returns.push((navCurve[j].nav - navCurve[j - 1].nav) / navCurve[j - 1].nav);
  }
  const avgRet = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const stdRet = Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgRet, 2), 0) / returns.length) || 0.0001;
  const sharpeRatio = (avgRet / stdRet) * Math.sqrt(390);

  // Await live news results
  let liveNews = { articles: [] };
  try {
    liveNews = await newsPromise;
  } catch (e) {
    liveNews = { articles: [], error: e.message };
  }

  const execMs = Date.now() - startT;

  return {
    symbol,
    name: fullMarketData.name,
    capital,
    strategyMode,
    executionTimeMs: execMs,
    summary: {
      initialCapital: capital,
      finalNav: Number(finalNav.toFixed(2)),
      netProfit: Number(netProfit.toFixed(2)),
      roiPct: Number(roiPct.toFixed(2)),
      sharpeRatio: Number(sharpeRatio.toFixed(2)),
      maxDrawdownPct: Number((maxDrawdown * 100).toFixed(2)),
      totalTxCosts: Number(totalTxCosts.toFixed(2)),
      totalTrades: tradeLog.length
    },
    liveNews: liveNews.articles.map(a => ({
      title: a.title,
      source: a.source,
      pubDateFormatted: a.pubDateFormatted,
      ageMinutes: a.ageMinutes
    })),
    navCurve,
    tradeLog
  };
}

module.exports = {
  runTradingArena
};
