const DEFAULT_LIMITS = {
  maxOptionContracts: 20,
  maxNetDeltaShares: 500,
  maxDrawdownPct: 0.10,
  maxNotionalPct: 0.80,
  maxHedgeSharesPerTrade: 200
};

function computeNav(portfolioState, tick = {}) {
  const price = tick.price ?? portfolioState.lastPrice ?? 100;
  const optPrice = portfolioState.currentOptPrice ?? 0;
  const optionVal = (portfolioState.optionContractsHeld || 0) * 100 * optPrice;
  const shareVal = (portfolioState.sharesHeld || 0) * price;
  return (portfolioState.cash || 0) + optionVal + shareVal;
}

function computeNetDeltaShares(portfolioState) {
  const optionDeltaShares = (portfolioState.optionContractsHeld || 0)
    * 100
    * (portfolioState.currentDelta ?? 0.5);
  return (portfolioState.sharesHeld || 0) + optionDeltaShares;
}

function computeNotionalPct(portfolioState, tick = {}) {
  const capital = portfolioState.capital || 1;
  const price = tick.price ?? portfolioState.lastPrice ?? 100;
  const optPrice = portfolioState.currentOptPrice ?? 0;
  const optionNotional = Math.abs(portfolioState.optionContractsHeld || 0) * 100 * optPrice;
  const stockNotional = Math.abs(portfolioState.sharesHeld || 0) * price;
  return (optionNotional + stockNotional) / capital;
}

function projectPostTrade(portfolioState, decision, tick = {}) {
  const projected = {
    optionContractsHeld: portfolioState.optionContractsHeld || 0,
    sharesHeld: portfolioState.sharesHeld || 0
  };
  const qty = decision.quantity || 0;
  const delta = portfolioState.currentDelta ?? 0.5;

  switch (decision.action) {
    case 'OPEN_POSITION':
      if (projected.optionContractsHeld === 0) {
        projected.optionContractsHeld = qty || 10;
        projected.sharesHeld = Math.round(projected.optionContractsHeld * 100 * delta);
      }
      break;
    case 'BUY_HEDGE': {
      const shares = qty || Math.round(projected.optionContractsHeld * 100 * delta) - projected.sharesHeld;
      projected.sharesHeld += Math.max(0, shares);
      break;
    }
    case 'SELL_HEDGE': {
      const shares = qty || projected.sharesHeld - Math.round(projected.optionContractsHeld * 100 * delta);
      projected.sharesHeld -= Math.max(0, shares);
      break;
    }
    case 'CLOSE_OPTIONS':
      projected.optionContractsHeld = 0;
      break;
    case 'CLOSE_ALL':
      projected.optionContractsHeld = 0;
      projected.sharesHeld = 0;
      break;
    default:
      break;
  }

  return projected;
}

function hedgeShareDelta(portfolioState, decision) {
  const qty = decision.quantity || 0;
  const delta = portfolioState.currentDelta ?? 0.5;

  switch (decision.action) {
    case 'OPEN_POSITION':
      return Math.abs(Math.round((qty || 10) * 100 * delta));
    case 'BUY_HEDGE':
      return Math.abs(qty || Math.round((portfolioState.optionContractsHeld || 0) * 100 * delta) - (portfolioState.sharesHeld || 0));
    case 'SELL_HEDGE':
      return Math.abs(qty || (portfolioState.sharesHeld || 0) - Math.round((portfolioState.optionContractsHeld || 0) * 100 * delta));
    default:
      return 0;
  }
}

/**
 * Validate a proposed trade against hard risk limits.
 * @returns {{ allowed: boolean, rejectedReasons: string[], clippedDecision?: object }}
 */
function validateTrade(portfolioState, proposedDecision, limits = {}, tick = {}) {
  const cfg = { ...DEFAULT_LIMITS, ...limits };
  const rejectedReasons = [];
  const action = proposedDecision?.action || 'HOLD';

  if (action === 'HOLD') {
    return { allowed: true, rejectedReasons: [] };
  }

  const nav = computeNav(portfolioState, tick);
  const peakNav = portfolioState.peakNav || portfolioState.capital || nav;
  const drawdown = peakNav > 0 ? (peakNav - nav) / peakNav : 0;

  if (drawdown > cfg.maxDrawdownPct) {
    rejectedReasons.push(
      `Max drawdown breached: ${(drawdown * 100).toFixed(1)}% > ${(cfg.maxDrawdownPct * 100).toFixed(0)}% limit`
    );
  }

  const projected = projectPostTrade(portfolioState, proposedDecision, tick);
  const projectedState = { ...portfolioState, ...projected };
  const netDelta = computeNetDeltaShares(projectedState);

  if (Math.abs(netDelta) > cfg.maxNetDeltaShares) {
    rejectedReasons.push(
      `Net delta exposure ${Math.round(netDelta)} shares exceeds max ${cfg.maxNetDeltaShares}`
    );
  }

  if (projected.optionContractsHeld > cfg.maxOptionContracts) {
    rejectedReasons.push(
      `Option contracts ${projected.optionContractsHeld} exceeds max ${cfg.maxOptionContracts}`
    );
  }

  const notionalPct = computeNotionalPct(projectedState, tick);
  if (notionalPct > cfg.maxNotionalPct) {
    rejectedReasons.push(
      `Notional ${(notionalPct * 100).toFixed(1)}% of capital exceeds max ${(cfg.maxNotionalPct * 100).toFixed(0)}%`
    );
  }

  const hedgeShares = hedgeShareDelta(portfolioState, proposedDecision);
  let clippedDecision = null;

  if (hedgeShares > cfg.maxHedgeSharesPerTrade
    && (action === 'BUY_HEDGE' || action === 'SELL_HEDGE' || action === 'OPEN_POSITION')) {
    if (action === 'OPEN_POSITION') {
      const maxContracts = Math.floor(cfg.maxHedgeSharesPerTrade / (100 * (portfolioState.currentDelta || 0.5)));
      if (maxContracts < 1) {
        rejectedReasons.push(
          `Hedge size ${hedgeShares} shares exceeds max ${cfg.maxHedgeSharesPerTrade} per trade`
        );
      } else if ((proposedDecision.quantity || 10) > maxContracts) {
        clippedDecision = {
          ...proposedDecision,
          quantity: Math.min(proposedDecision.quantity || 10, maxContracts),
          reason: `${proposedDecision.reason || ''} [risk: clipped contracts to ${maxContracts}]`.trim()
        };
      }
    } else {
      clippedDecision = {
        ...proposedDecision,
        quantity: cfg.maxHedgeSharesPerTrade,
        reason: `${proposedDecision.reason || ''} [risk: clipped hedge to ${cfg.maxHedgeSharesPerTrade} shares]`.trim()
      };
    }
  }

  if (clippedDecision) {
    const reprojected = projectPostTrade(portfolioState, clippedDecision, tick);
    const reclipped = { ...portfolioState, ...reprojected };
    const reclippedNotional = computeNotionalPct(reclipped, tick);
    const reclippedDelta = computeNetDeltaShares(reclipped);

    const stillBad = reclipped.optionContractsHeld > cfg.maxOptionContracts
      || Math.abs(reclippedDelta) > cfg.maxNetDeltaShares
      || reclippedNotional > cfg.maxNotionalPct
      || drawdown > cfg.maxDrawdownPct;

    if (!stillBad) {
      return { allowed: true, rejectedReasons: [], clippedDecision };
    }
  }

  return {
    allowed: rejectedReasons.length === 0,
    rejectedReasons,
    clippedDecision: rejectedReasons.length === 0 ? clippedDecision : undefined
  };
}

module.exports = {
  DEFAULT_LIMITS,
  validateTrade,
  computeNav,
  computeNetDeltaShares,
  computeNotionalPct
};
