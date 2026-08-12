const monteCarloService = require('./monte_carlo_service');
const config = require('../config');
const { getMarketNews, normalizeNewsArticle } = require('./market_news');
const { toIsoUtc } = require('./time_format');
const { fetchIntradaySeries } = require('./intraday_provider');
const { getOptionsChain, pickATMContract } = require('./options_chain');
const { buildVolSurfaceFromChain, getATMVolFromChain, interpolateVol } = require('./vol_surface');
const { DEFAULT_LIMITS, validateTrade } = require('./risk_limits');

const DEFAULT_R = 0.05;
const DEFAULT_T_YEARS = 0.25;
const DEFAULT_IS_CALL = true;

async function createArenaState(params = {}) {
  const {
    symbol = config.defaultSymbol,
    capital = config.mft.defaultCapital,
    strategyMode = 'ai_agent',
    timeWindow = config.mft.defaultTimeWindow,
    txCostPct = 0.001,
    gemmaInterval = config.mft.defaultGemmaInterval,
    dataSource = config.mft.defaultDataSource,
    sessionDate = null,
    riskLimits = {}
  } = params;

  const fullMarketData = await fetchIntradaySeries(symbol, {
    dataSource,
    sessionDate,
    useLive: dataSource !== 'synthetic'
  });
  const targetWindow = Math.min(Math.max(10, parseInt(timeWindow, 10)), 390);
  const series = fullMarketData.series.slice(0, targetWindow);
  const spot = series[0]?.price ?? fullMarketData.basePrice;

  let chain = null;
  let volSurface = null;
  let K = fullMarketData.basePrice;
  let T_years = DEFAULT_T_YEARS;
  let atmIv = series[0]?.volatility ?? 0.25;

  try {
    chain = await getOptionsChain(symbol);
    volSurface = buildVolSurfaceFromChain(chain, spot);
    const atmContract = pickATMContract(chain, spot ?? chain.spot, 'call');
    if (atmContract?.strike) K = atmContract.strike;
    if (chain.T_years) T_years = chain.T_years;
    const chainIv = getATMVolFromChain(chain, spot);
    if (chainIv) atmIv = chainIv;
  } catch (_) {
    // keep defaults from intraday data
  }

  return {
    symbol,
    name: fullMarketData.name,
    capital: Number(capital),
    strategyMode,
    txCostPct,
    gemmaInterval: Math.max(1, parseInt(gemmaInterval, 10) || 5),
    dataSource,
    sessionDate,
    riskLimits: { ...DEFAULT_LIMITS, ...riskLimits },
    series,
    totalMinutes: series.length,
    K,
    r: DEFAULT_R,
    T_years,
    isCall: DEFAULT_IS_CALL,
    atmIv,
    optionsChain: chain,
    volSurface,
    lastChainRefreshIndex: 0,
    cash: Number(capital),
    sharesHeld: 0,
    optionContractsHeld: 0,
    initialOptionPrice: 0,
    currentDelta: 0.5,
    currentOptPrice: 0,
    lastGreeksUpdateIndex: -1,
    lastHedgeMinute: 0,
    tradeLog: [],
    navCurve: [],
    gemmaDecisions: [],
    peakNav: Number(capital),
    maxDrawdown: 0,
    totalTxCosts: 0,
    liveNews: [],
    liveNewsFetchedAt: null,
    sessionAnchorIso: fullMarketData.sessionAnchorIso,
    priceDataSource: fullMarketData.dataSource,
    startTimeMs: Date.now()
  };
}

async function refreshOptionsChain(state, tick) {
  try {
    const chain = await getOptionsChain(state.symbol);
    const spot = tick.price ?? chain.spot;
    state.optionsChain = chain;
    state.volSurface = buildVolSurfaceFromChain(chain, spot);
    if (chain.T_years) state.T_years = chain.T_years;
    const atmContract = pickATMContract(chain, spot, 'call');
    if (atmContract?.strike) state.K = atmContract.strike;
    const chainIv = getATMVolFromChain(chain, spot);
    if (chainIv) {
      state.atmIv = chainIv;
      if (state.series[state.lastGreeksUpdateIndex >= 0 ? state.lastGreeksUpdateIndex : 0]) {
        // surface IV available for greeks on next update
      }
    }
    return chain;
  } catch (_) {
    return null;
  }
}

function getTickVolatility(state, tick) {
  if (state.volSurface?.points?.length) {
    const surfaceIv = interpolateVol(state.volSurface, state.K, state.T_years);
    if (surfaceIv) return surfaceIv;
  }
  return tick.volatility ?? state.atmIv ?? 0.25;
}

function logRiskRejection(state, tick, decision, rejectedReasons) {
  pushTrade(state, tick, {
    action: 'REJECTED',
    detail: `Risk engine blocked ${decision.action}: ${rejectedReasons.join('; ')}`,
    txFee: 0,
    reason: rejectedReasons.join('; '),
    agent: 'risk_engine',
    rejectedDecision: decision
  });
}

function applyDecisionWithRiskCheck(state, tick, decision, options = {}) {
  const { enforceRisk = true } = options;
  if (!enforceRisk || !decision || decision.action === 'HOLD') {
    if (decision && decision.action !== 'HOLD') applyGemmaDecision(state, tick, decision);
    return { applied: decision?.action !== 'HOLD', riskResult: null };
  }

  const portfolioState = {
    ...state,
    lastPrice: tick.price
  };
  const riskResult = validateTrade(portfolioState, decision, state.riskLimits, tick);

  if (!riskResult.allowed) {
    logRiskRejection(state, tick, decision, riskResult.rejectedReasons);
    return { applied: false, riskResult };
  }

  const finalDecision = riskResult.clippedDecision || decision;
  applyGemmaDecision(state, tick, finalDecision);
  return { applied: true, riskResult, clipped: Boolean(riskResult.clippedDecision) };
}

async function fetchInitialOptionPrice(state, tick) {
  try {
    const sigma = getTickVolatility(state, tick);
    const initRes = await monteCarloService.calculateOptionPrice({
      S0: tick.price,
      K: state.K,
      r: state.r,
      sigma,
      T: state.T_years,
      isCall: state.isCall,
      numTrials: 50000
    });
    state.initialOptionPrice = initRes.optionPrice || 10.0;
    state.currentOptPrice = state.initialOptionPrice;
  } catch (_) {
    state.initialOptionPrice = 10.0;
    state.currentOptPrice = 10.0;
  }
}

async function updateGreeks(state, tick, index, force = false) {
  const shouldUpdate = force
    || index % 15 === 0
    || tick.newsEvent
    || index === state.series.length - 1
    || index - state.lastGreeksUpdateIndex >= 15;

  if (!shouldUpdate) {
    return { delta: state.currentDelta, optionPrice: state.currentOptPrice };
  }

  try {
    const sigma = getTickVolatility(state, tick);
    const greeksRes = await monteCarloService.calculateGreeks({
      S0: tick.price,
      K: state.K,
      r: state.r,
      sigma,
      T: state.T_years,
      isCall: state.isCall,
      numTrials: 50000
    });
    if (greeksRes && greeksRes.greeks) {
      state.currentDelta = greeksRes.greeks.delta;
      state.currentOptPrice = greeksRes.optionPrice;
      state.lastGreeksUpdateIndex = index;
      return {
        delta: state.currentDelta,
        optionPrice: state.currentOptPrice,
        greeks: greeksRes.greeks
      };
    }
  } catch (_) {
    // keep previous values
  }

  return { delta: state.currentDelta, optionPrice: state.currentOptPrice };
}

function computeNav(state, tick) {
  const optionVal = state.optionContractsHeld * 100 * state.currentOptPrice;
  const shareVal = state.sharesHeld * tick.price;
  return state.cash + optionVal + shareVal;
}

function recordNavPoint(state, tick) {
  const nav = computeNav(state, tick);
  if (nav > state.peakNav) state.peakNav = nav;
  const dd = (state.peakNav - nav) / state.peakNav;
  if (dd > state.maxDrawdown) state.maxDrawdown = dd;

  state.navCurve.push({
    minute: tick.minute,
    time: tick.time,
    simulationTimeIso: tick.simulationTimeIso,
    price: tick.price,
    nav: Number(nav.toFixed(2))
  });

  return nav;
}

function pushTrade(state, tick, entry) {
  state.tradeLog.push({
    minute: tick.minute,
    time: tick.time,
    stockPrice: tick.price,
    delta: Number(state.currentDelta.toFixed(4)),
    ...entry
  });
}

function openPosition(state, tick, contracts = 10, reason = 'Initial position entry.') {
  const cost = contracts * 100 * state.currentOptPrice;
  const txFee = cost * state.txCostPct;
  state.cash -= cost + txFee;
  state.optionContractsHeld = contracts;
  state.totalTxCosts += txFee;

  const targetShares = Math.round(state.optionContractsHeld * 100 * state.currentDelta);
  const shareCost = targetShares * tick.price;
  const shareFee = shareCost * state.txCostPct;
  state.cash -= shareCost + shareFee;
  state.sharesHeld = targetShares;
  state.totalTxCosts += shareFee;
  state.lastHedgeMinute = tick.minute;

  pushTrade(state, tick, {
    action: 'OPEN_POSITION',
    detail: `Bought ${contracts} Call Contracts @ $${state.currentOptPrice.toFixed(2)} & Hedged ${targetShares} shares @ $${tick.price.toFixed(2)}`,
    txFee: Number((txFee + shareFee).toFixed(2)),
    reason,
    agent: state.strategyMode === 'ai_agent' ? 'llm' : 'rules'
  });
}

function rebalanceHedge(state, tick, dShares, reason) {
  if (Math.abs(dShares) <= 0) return false;

  const tradeVal = Math.abs(dShares) * tick.price;
  const fee = tradeVal * state.txCostPct;
  state.cash -= dShares * tick.price + fee;
  state.sharesHeld += dShares;
  state.totalTxCosts += fee;
  state.lastHedgeMinute = tick.minute;

  pushTrade(state, tick, {
    action: dShares > 0 ? 'BUY_HEDGE' : 'SELL_HEDGE',
    detail: `${dShares > 0 ? 'Bought' : 'Sold'} ${Math.abs(dShares)} shares @ $${tick.price.toFixed(2)}`,
    txFee: Number(fee.toFixed(2)),
    reason,
    agent: state.strategyMode === 'ai_agent' ? 'llm' : 'rules'
  });

  return true;
}

function liquidateAll(state, tick, reason = 'End of day trading session settlement.') {
  if (state.optionContractsHeld > 0) {
    const optVal = state.optionContractsHeld * 100 * state.currentOptPrice;
    const optFee = optVal * state.txCostPct;
    state.cash += optVal - optFee;
    state.totalTxCosts += optFee;
    state.optionContractsHeld = 0;
  }
  if (state.sharesHeld !== 0) {
    const shareVal = state.sharesHeld * tick.price;
    const shareFee = Math.abs(shareVal) * state.txCostPct;
    state.cash += shareVal - shareFee;
    state.totalTxCosts += shareFee;
    state.sharesHeld = 0;
  }

  pushTrade(state, tick, {
    action: 'CLOSE_ALL',
    detail: 'Liquidated remaining positions at Market Close',
    txFee: 0.0,
    reason,
    agent: state.strategyMode === 'ai_agent' ? 'llm' : 'rules'
  });
}

function applyRulesDeltaHedgeStep(state, tick, index, options = {}) {
  const { enforceRisk = false } = options;
  if (index === 0) {
    if (enforceRisk) {
      applyDecisionWithRiskCheck(state, tick, {
        action: 'OPEN_POSITION',
        quantity: 10,
        reason: 'Initial position entry & delta-neutral hedge setup.'
      });
    } else {
      openPosition(state, tick, 10, 'Initial position entry & delta-neutral hedge setup.');
    }
    return;
  }

  const targetShares = Math.round(state.optionContractsHeld * 100 * state.currentDelta);
  const dShares = targetShares - state.sharesHeld;
  const drift = Math.abs(dShares);

  if (tick.newsEvent || (index - state.lastHedgeMinute >= 30 && drift > 50)) {
    if (drift > 10) {
      const reason = tick.newsEvent
        ? `News Shock ("${tick.newsEvent}") trigger.`
        : 'Delta drift threshold breached.';
      if (enforceRisk) {
        applyDecisionWithRiskCheck(state, tick, {
          action: dShares > 0 ? 'BUY_HEDGE' : 'SELL_HEDGE',
          quantity: Math.abs(dShares),
          reason
        });
      } else {
        rebalanceHedge(state, tick, dShares, reason);
      }
    }
  }
}

function applyBuyHoldStep(state, tick, index) {
  if (index !== 0) return;

  const buyShares = Math.floor(state.cash / tick.price);
  const fee = buyShares * tick.price * state.txCostPct;
  state.cash -= buyShares * tick.price + fee;
  state.sharesHeld = buyShares;
  state.totalTxCosts += fee;

  pushTrade(state, tick, {
    action: 'BUY_HOLD',
    detail: `Bought ${buyShares} shares @ $${tick.price.toFixed(2)}`,
    txFee: Number(fee.toFixed(2)),
    reason: 'Unhedged long stock benchmark.',
    agent: 'rules'
  });
}

function applyGemmaDecision(state, tick, decision) {
  const { action, quantity, reason } = decision;
  const qty = quantity || 0;

  switch (action) {
    case 'OPEN_POSITION':
      if (state.optionContractsHeld === 0) {
        openPosition(state, tick, qty || 10, reason);
      }
      break;
    case 'BUY_HEDGE': {
      const shares = qty || Math.round(state.optionContractsHeld * 100 * state.currentDelta) - state.sharesHeld;
      if (shares > 0) rebalanceHedge(state, tick, shares, reason);
      break;
    }
    case 'SELL_HEDGE': {
      const shares = qty || state.sharesHeld - Math.round(state.optionContractsHeld * 100 * state.currentDelta);
      if (shares > 0) rebalanceHedge(state, tick, -shares, reason);
      break;
    }
    case 'CLOSE_OPTIONS':
      if (state.optionContractsHeld > 0) {
        const optVal = state.optionContractsHeld * 100 * state.currentOptPrice;
        const optFee = optVal * state.txCostPct;
        state.cash += optVal - optFee;
        state.totalTxCosts += optFee;
        pushTrade(state, tick, {
          action: 'CLOSE_OPTIONS',
          detail: `Closed ${state.optionContractsHeld} option contracts @ $${state.currentOptPrice.toFixed(2)}`,
          txFee: Number(optFee.toFixed(2)),
          reason,
          agent: 'llm'
        });
        state.optionContractsHeld = 0;
      }
      break;
    case 'CLOSE_ALL':
      liquidateAll(state, tick, reason);
      break;
    case 'HOLD':
    default:
      break;
  }
}

function shouldConsultGemma(state, tick, index) {
  const isFirst = index === 0;
  const isLast = index === state.series.length - 1;
  const isNews = Boolean(tick.newsEvent);
  const isInterval = index % state.gemmaInterval === 0;
  const hasPosition = state.optionContractsHeld > 0;
  const targetShares = Math.round(state.optionContractsHeld * 100 * state.currentDelta);
  const deltaDrift = Math.abs(state.sharesHeld - targetShares);

  return isFirst || isLast || isNews || isInterval || (hasPosition && deltaDrift > 50);
}

function buildObservation(state, tick, index, greeks) {
  const nav = computeNav(state, tick);
  const wallClockTime = toIsoUtc(new Date());

  return {
    symbol: state.symbol,
    minute: tick.minute,
    time: tick.time,
    simulationTime: {
      iso: tick.simulationTimeIso,
      display: tick.simulationTimeDisplay,
      sessionAnchorIso: state.sessionAnchorIso,
      dataSource: state.priceDataSource
    },
    wallClockTime: {
      iso: wallClockTime,
      display: new Date(wallClockTime).toUTCString()
    },
    temporalNote: 'Price/volatility ticks are SIMULATED replay timestamps. Live news headlines are fetched at wallClockTime and may be from a different calendar date — compare using explicit ISO timestamps only.',
    stockPrice: tick.price,
    volatility: tick.volatility,
    newsEvent: tick.newsEvent
      ? { title: tick.newsEvent, simulationTimeIso: tick.simulationTimeIso, dataSource: 'simulated_scheduled_event' }
      : null,
    strike: state.K,
    portfolio: {
      cash: Number(state.cash.toFixed(2)),
      sharesHeld: state.sharesHeld,
      optionContractsHeld: state.optionContractsHeld,
      nav: Number(nav.toFixed(2)),
      initialCapital: state.capital
    },
    greeks: greeks || { delta: state.currentDelta, optionPrice: state.currentOptPrice },
    liveNews: {
      fetchedAt: state.liveNewsFetchedAt,
      dataSource: 'live_google_news_rss',
      articles: state.liveNews.slice(0, 5)
    },
    isFinalMinute: index === state.series.length - 1,
    tickIndex: index,
    totalTicks: state.series.length
  };
}

function buildSummary(state) {
  const finalNav = state.navCurve.length > 0
    ? state.navCurve[state.navCurve.length - 1].nav
    : state.capital;
  const netProfit = finalNav - state.capital;
  const roiPct = (netProfit / state.capital) * 100;

  const returns = [];
  for (let j = 1; j < state.navCurve.length; j++) {
    returns.push((state.navCurve[j].nav - state.navCurve[j - 1].nav) / state.navCurve[j - 1].nav);
  }
  const avgRet = returns.length ? returns.reduce((s, r) => s + r, 0) / returns.length : 0;
  const stdRet = returns.length
    ? Math.sqrt(returns.reduce((s, r) => s + Math.pow(r - avgRet, 2), 0) / returns.length) || 0.0001
    : 0.0001;
  const sharpeRatio = (avgRet / stdRet) * Math.sqrt(state.totalMinutes);

  return {
    initialCapital: state.capital,
    finalNav: Number(finalNav.toFixed(2)),
    netProfit: Number(netProfit.toFixed(2)),
    roiPct: Number(roiPct.toFixed(2)),
    sharpeRatio: Number(sharpeRatio.toFixed(2)),
    maxDrawdownPct: Number((state.maxDrawdown * 100).toFixed(2)),
    totalTxCosts: Number(state.totalTxCosts.toFixed(2)),
    totalTrades: state.tradeLog.length,
    gemmaDecisions: state.gemmaDecisions.length
  };
}

/**
 * Batch replay (instant) — used for rules-based delta_hedge and buy_hold benchmarks.
 */
async function runTradingArena(params = {}) {
  const state = await createArenaState(params);
  const newsPromise = getMarketNews(state.symbol, 5);

  await fetchInitialOptionPrice(state, state.series[0]);

  for (let i = 0; i < state.series.length; i++) {
    const tick = state.series[i];
    await updateGreeks(state, tick, i);

    if (state.strategyMode === 'delta_hedge') {
      applyRulesDeltaHedgeStep(state, tick, i, { enforceRisk: Boolean(params.enforceRisk) });
    } else if (state.strategyMode === 'buy_hold') {
      applyBuyHoldStep(state, tick, i);
    }

    if (i === state.series.length - 1 && state.strategyMode !== 'buy_hold') {
      liquidateAll(state, tick);
    }

    recordNavPoint(state, tick);
  }

  try {
    const liveNews = await newsPromise;
    state.liveNewsFetchedAt = liveNews.fetchedAt;
    state.liveNews = liveNews.articles.map(normalizeNewsArticle);
  } catch (_) {
    state.liveNews = [];
    state.liveNewsFetchedAt = toIsoUtc(new Date());
  }

  return {
    symbol: state.symbol,
    name: state.name,
    capital: state.capital,
    strategyMode: state.strategyMode,
    executionTimeMs: Date.now() - state.startTimeMs,
    summary: buildSummary(state),
    liveNews: state.liveNews,
    navCurve: state.navCurve,
    tradeLog: state.tradeLog
  };
}

module.exports = {
  runTradingArena,
  createArenaState,
  fetchInitialOptionPrice,
  updateGreeks,
  computeNav,
  recordNavPoint,
  applyRulesDeltaHedgeStep,
  applyBuyHoldStep,
  applyGemmaDecision,
  applyDecisionWithRiskCheck,
  shouldConsultGemma,
  buildObservation,
  buildSummary,
  liquidateAll,
  refreshOptionsChain,
  getTickVolatility,
  DEFAULT_LIMITS
};
