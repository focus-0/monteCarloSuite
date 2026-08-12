const { pickATMContract } = require('./options_chain');

/**
 * Build vol surface points from an options chain.
 * @returns {{ points: Array<{K,T,iv,type}>, spot, expiry }}
 */
function buildVolSurfaceFromChain(chain, spot) {
  if (!chain) return { points: [], spot: spot ?? null, expiry: null };

  const S = spot ?? chain.spot;
  const T = chain.T_years ?? 0.25;
  const points = [];

  for (const c of chain.calls || []) {
    if (c.impliedVolatility > 0) {
      points.push({ K: c.strike, T, iv: c.impliedVolatility, type: 'call' });
    }
  }
  for (const p of chain.puts || []) {
    if (p.impliedVolatility > 0) {
      points.push({ K: p.strike, T, iv: p.impliedVolatility, type: 'put' });
    }
  }

  return {
    points,
    spot: S,
    expiry: chain.expiry,
    T_years: T
  };
}

function getATMVol(surface) {
  if (!surface?.points?.length) return null;

  const S = surface.spot;
  if (S == null) {
    const calls = surface.points.filter((p) => p.type === 'call');
    return calls.length ? calls[Math.floor(calls.length / 2)].iv : surface.points[0].iv;
  }

  let best = null;
  let minDiff = Infinity;
  for (const p of surface.points) {
    const diff = Math.abs(p.K - S);
    if (diff < minDiff) {
      minDiff = diff;
      best = p.iv;
    }
  }
  return best;
}

/**
 * Simple nearest-neighbor vol lookup (MVP).
 */
function interpolateVol(surface, K, T) {
  if (!surface?.points?.length) return null;

  const targetT = T ?? surface.T_years ?? 0.25;
  let best = null;
  let minDist = Infinity;

  for (const p of surface.points) {
    const dK = Math.abs(p.K - K);
    const dT = Math.abs(p.T - targetT);
    const dist = dK + dT * S * 100; // weight strike distance higher
    if (dist < minDist) {
      minDist = dist;
      best = p.iv;
    }
  }
  return best;
}

function getATMVolFromChain(chain, spot) {
  const surface = buildVolSurfaceFromChain(chain, spot);
  const atmContract = pickATMContract(chain, spot ?? chain.spot, 'call');
  if (atmContract?.impliedVolatility) return atmContract.impliedVolatility;
  return getATMVol(surface);
}

module.exports = {
  buildVolSurfaceFromChain,
  interpolateVol,
  getATMVol,
  getATMVolFromChain
};
