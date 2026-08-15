const config = require('../config');

const { strongDelta, strongVega } = config.validation;

const VALID_RECOMMENDATIONS = ['BUY', 'SELL', 'HOLD'];

/**
 * Parse BUY | SELL | HOLD from LLM free-text (regex fallback).
 * @param {string} text
 * @returns {'BUY' | 'SELL' | 'HOLD'}
 */
function parseRecommendation(text) {
  if (!text || typeof text !== 'string') return 'HOLD';
  const upper = text.toUpperCase();
  if (/\bBUY\b/.test(upper)) return 'BUY';
  if (/\bSELL\b/.test(upper)) return 'SELL';
  return 'HOLD';
}

/**
 * Parse structured JSON response from LLM; falls back to regex on free-text.
 * @param {string} llmText
 * @returns {{ recommendation: 'BUY'|'SELL'|'HOLD', reasoning: string }}
 */
function parseStructuredResponse(llmText) {
  if (!llmText || typeof llmText !== 'string') {
    return { recommendation: 'HOLD', reasoning: '' };
  }

  let jsonStr = llmText.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(jsonStr);
    const rawRec = String(parsed.recommendation || '').toUpperCase();
    const recommendation = VALID_RECOMMENDATIONS.includes(rawRec)
      ? rawRec
      : parseRecommendation(parsed.reasoning || llmText);
    return {
      recommendation,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : llmText
    };
  } catch {
    return {
      recommendation: parseRecommendation(llmText),
      reasoning: llmText
    };
  }
}

/**
 * Scale vega threshold by option price (reference $100 ATM baseline).
 * @param {number} optionPrice
 * @returns {number}
 */
function scaledVegaThreshold(optionPrice) {
  const refPrice = 100;
  const price = Math.max(optionPrice || refPrice, 0.01);
  return strongVega * (price / refPrice);
}

/**
 * Validate LLM recommendation against C++ Greeks from a long-holder perspective.
 * @param {Object} params
 * @param {number} params.delta
 * @param {number} params.vega
 * @param {boolean} params.isCall
 * @param {number} [params.optionPrice] - scales vega threshold
 * @param {string} [params.gemmaText] - parsed when recommendation omitted
 * @param {'BUY'|'SELL'|'HOLD'} [params.recommendation]
 * @returns {{ recommendation: string, reasoning: string, consistencyCheck: { passed: boolean, flags: Array } }}
 */
function validateRecommendationConsistency({
  delta,
  vega,
  isCall,
  optionPrice,
  gemmaText,
  recommendation: explicitRec
}) {
  const parsed = explicitRec
    ? { recommendation: explicitRec, reasoning: gemmaText || '' }
    : parseStructuredResponse(gemmaText);
  const recommendation = parsed.recommendation;
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
  const vegaThreshold = scaledVegaThreshold(optionPrice);
  if (absVega > vegaThreshold && recommendation === 'SELL') {
    flags.push({
      type: 'vega_mismatch',
      severity: 'warning',
      message: `Inconsistent: high vega (${vega}, threshold ${vegaThreshold.toFixed(2)} for $${(optionPrice || 100).toFixed(2)} option) indicates significant vol sensitivity; SELL reduces long-vol exposure — verify intent`,
      greek: 'vega',
      greekValue: vega,
      recommendation
    });
  }

  return {
    recommendation,
    reasoning: parsed.reasoning,
    consistencyCheck: {
      passed: flags.length === 0,
      flags
    }
  };
}

module.exports = {
  parseRecommendation,
  parseStructuredResponse,
  scaledVegaThreshold,
  validateRecommendationConsistency
};
