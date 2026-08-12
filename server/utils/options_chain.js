const { yahooFinance } = require('./yahoo_finance');

function normalizeContract(raw, type) {
  return {
    type,
    strike: raw.strike,
    bid: raw.bid ?? null,
    ask: raw.ask ?? null,
    lastPrice: raw.lastPrice ?? raw.last ?? null,
    impliedVolatility: raw.impliedVolatility > 0 ? raw.impliedVolatility : null,
    inTheMoney: raw.inTheMoney ?? null
  };
}

/**
 * Fetch nearest-expiry options chain for a symbol via Yahoo Finance.
 */
async function getOptionsChain(symbol) {
  const sym = (symbol || 'AAPL').trim().toUpperCase();

  try {
    const chain = await yahooFinance.options(sym);
    if (!chain?.options?.length) {
      return { symbol: sym, error: 'No options data available', expiry: null, calls: [], puts: [], spot: null };
    }

    const nearest = chain.options[0];
    const expiryDate = nearest.expirationDate || chain.expirationDates?.[0] || null;
    const expiryIso = expiryDate instanceof Date
      ? expiryDate.toISOString()
      : expiryDate
        ? new Date(expiryDate).toISOString()
        : null;

    const calls = (nearest.calls || []).map((c) => normalizeContract(c, 'call'));
    const puts = (nearest.puts || []).map((p) => normalizeContract(p, 'put'));

    let spot = chain.quote?.regularMarketPrice ?? null;
    if (!spot) {
      try {
        const quote = await yahooFinance.quote(sym);
        spot = quote?.regularMarketPrice ?? null;
      } catch (_) {
        // ignore
      }
    }

    const now = Date.now();
    const expiryMs = expiryIso ? new Date(expiryIso).getTime() : now + 90 * 86400000;
    const T_years = Math.max(1 / 365, (expiryMs - now) / (365.25 * 86400000));

    return {
      symbol: sym,
      expiry: expiryIso,
      T_years: Number(T_years.toFixed(6)),
      spot: spot ? Number(spot.toFixed(2)) : null,
      calls,
      puts,
      dataSource: 'yahoo_finance'
    };
  } catch (err) {
    return {
      symbol: sym,
      error: err.message,
      expiry: null,
      calls: [],
      puts: [],
      spot: null,
      dataSource: 'yahoo_finance'
    };
  }
}

function pickATMContract(chain, spot, type = 'call') {
  const contracts = type === 'put' ? chain.puts : chain.calls;
  if (!contracts?.length || spot == null) return null;

  let best = null;
  let minDiff = Infinity;
  for (const c of contracts) {
    const diff = Math.abs(c.strike - spot);
    if (diff < minDiff) {
      minDiff = diff;
      best = c;
    }
  }
  return best;
}

/**
 * Pick contract closest to target delta (uses moneyness proxy when delta unavailable).
 */
function pickByDelta(chain, spot, targetDelta = 0.5, type = 'call') {
  const contracts = type === 'put' ? chain.puts : chain.calls;
  if (!contracts?.length || spot == null) return pickATMContract(chain, spot, type);

  // Yahoo chain may not expose delta — use strike distance as proxy for |delta|
  const atm = pickATMContract(chain, spot, type);
  if (!atm) return null;

  // For MVP: return ATM when target is ~0.5, otherwise pick OTM by strike offset
  if (Math.abs(targetDelta - 0.5) < 0.05) return atm;

  const otm = contracts.filter((c) =>
    type === 'call' ? c.strike > spot : c.strike < spot
  );
  if (!otm.length) return atm;

  const idx = Math.min(
    otm.length - 1,
    Math.floor(Math.abs(targetDelta - 0.5) * otm.length * 2)
  );
  return otm[idx];
}

module.exports = {
  getOptionsChain,
  pickATMContract,
  pickByDelta
};
