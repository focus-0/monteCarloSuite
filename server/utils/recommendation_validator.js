const config = require('../config');

const { strongDelta, strongVega } = config.validation;

/**
 * Parse BUY | SELL | HOLD from LLM free-text (same precedence as routes.js).
 * @param {string} gemmaText
 * @returns {'BUY' | 'SELL' | 'HOLD'}
 */
function parseRecommendation(gemmaText) {
  if (!gemmaText || typeof gemmaText !== 'string') return 'HOLD';
  if (gemmaText.includes('BUY')) return 'BUY';
  if (gemmaText.includes('SELL')) return 'SELL';
  return 'HOLD';
}

/**
 * Validate LLM recommendation against C++ Greeks from a long-holder perspective.
 * @param {Object} params
 * @param {number} params.delta
 * @param {number} params.vega
 * @param {boolean} params.isCall
 * @param {string} [params.gemmaText] - parsed when recommendation omitted
 * @param {'BUY'|'SELL'|'HOLD'} [params.recommendation]
 * @returns {{ recommendation: string, consistencyCheck: { passed: boolean, flags: Array } }}
 */
function validateRecommendationConsistency({
  delta,
  vega,
  isCall,
  gemmaText,
  recommendation: explicitRec
}) {
  const recommendation = explicitRec || parseRecommendation(gemmaText);
  const flags = [];

  if (isCall) {
    if (delta > strongDelta && recommendation === 'SELL') {
      flags.push({
        type: 'delta_mismatch',
        severity: 'warning',
        message: `Inconsistent: positive delta (${delta}) suggests long upside exposure; SELL reduces that exposure — verify intent`,
        greek: 'delta',
        greekValue: delta,
        recommendation
      });
    } else if (delta < -strongDelta && recommendation === 'BUY') {
      flags.push({
        type: 'delta_mismatch',
        severity: 'warning',
        message: `Inconsistent: negative delta (${delta}) on call suggests short-delta exposure; BUY adds exposure — verify intent`,
        greek: 'delta',
        greekValue: delta,
        recommendation
      });
    }
  } else {
    if (delta < -strongDelta && recommendation === 'BUY') {
      flags.push({
        type: 'delta_mismatch',
        severity: 'warning',
        message: `Inconsistent: negative delta (${delta}) suggests strong downside exposure; BUY adds more put exposure — verify intent`,
        greek: 'delta',
        greekValue: delta,
        recommendation
      });
    } else if (delta > strongDelta && recommendation === 'SELL') {
      flags.push({
        type: 'delta_mismatch',
        severity: 'warning',
        message: `Inconsistent: positive delta (${delta}) on put is atypical; SELL may conflict with computed exposure — verify intent`,
        greek: 'delta',
        greekValue: delta,
        recommendation
      });
    }
  }

  const absVega = Math.abs(vega);
  if (absVega > strongVega && recommendation === 'SELL') {
    flags.push({
      type: 'vega_mismatch',
      severity: 'warning',
      message: `Inconsistent: high vega (${vega}) indicates significant vol sensitivity; SELL reduces long-vol exposure — verify intent`,
      greek: 'vega',
      greekValue: vega,
      recommendation
    });
  }

  return {
    recommendation,
    consistencyCheck: {
      passed: flags.length === 0,
      flags
    }
  };
}

module.exports = {
  parseRecommendation,
  validateRecommendationConsistency
};
