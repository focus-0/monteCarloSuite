import React from 'react';

const ResultsPanel = ({ cppResult, jsResult, greeksResult, optionType }) => {
  if (!cppResult) return null;

  const cppTimeMs = cppResult.executionTimeMs;
  const jsTimeMs = jsResult?.executionTimeMs;
  const speedup = cppTimeMs && jsTimeMs && cppTimeMs > 0
    ? (jsTimeMs / cppTimeMs).toFixed(1)
    : null;
  const showSideBySide = jsResult && cppResult.implementation !== 'js';
  const showCppOnly = !showSideBySide && cppResult.implementation !== 'js' && cppTimeMs != null;
  const showJsFallback = cppResult.implementation === 'js';

  return (
    <div className="card results-panel-card">
      <div className="results-header">
        <div>
          <h3 className="card-title">Monte Carlo Results ({optionType.toUpperCase()})</h3>
          <span className="subtitle">
            Engine: <strong style={{ color: cppResult.implementation === 'js' ? '#f59e0b' : '#10b981' }}>
              {(cppResult.implementation || 'cpp').toUpperCase()}
            </strong>
            {cppResult.implementation === 'js' ? ' (C++ fallback)' : ' (native C++)'}
          </span>
        </div>
        <span className={`badge ${cppResult.implementation === 'js' ? 'badge-warning' : 'badge-success'}`}>
          {cppResult.implementation === 'js' ? 'JS Fallback' : 'C++ Engine'}
        </span>
      </div>

      <div className="price-display-box">
        <div className="main-price font-numeric">
          ${cppResult.optionPrice?.toFixed(4)}
        </div>
        <div className="price-label">Discounted Monte Carlo Fair Value</div>
        <div className="confidence-interval">
          95% Confidence Bounds: [{cppResult.confidence?.lower?.toFixed(4)}, {cppResult.confidence?.upper?.toFixed(4)}]
        </div>
      </div>

      {(showSideBySide || showCppOnly || showJsFallback) && (
        <div className="engine-benchmark-line">
          {showSideBySide ? (
            <>
              <span className="engine-benchmark-cpp">
                C++: <strong>${cppResult.optionPrice?.toFixed(4)}</strong>
                {cppTimeMs != null && <> @ <strong>{cppTimeMs.toFixed(2)} ms</strong></>}
              </span>
              <span className="engine-benchmark-sep">·</span>
              <span className="engine-benchmark-js">
                JS: <strong>${jsResult.optionPrice?.toFixed(4)}</strong>
                {jsTimeMs != null && <> @ <strong>{jsTimeMs.toFixed(2)} ms</strong></>}
              </span>
              {speedup && (
                <>
                  <span className="engine-benchmark-sep">·</span>
                  <span className="engine-benchmark-speedup">C++ {speedup}× faster</span>
                </>
              )}
            </>
          ) : showCppOnly ? (
            <span className="engine-benchmark-cpp">
              C++: <strong>${cppResult.optionPrice?.toFixed(4)}</strong>
              {cppTimeMs != null && <> @ <strong>{cppTimeMs.toFixed(2)} ms</strong></>}
            </span>
          ) : (
            <span className="engine-benchmark-js">
              JS engine: <strong>${cppResult.optionPrice?.toFixed(4)}</strong>
              {cppTimeMs != null && <> @ <strong>{cppTimeMs.toFixed(2)} ms</strong></>}
              <span className="engine-benchmark-note"> (C++ unavailable)</span>
            </span>
          )}
        </div>
      )}

      {cppResult.validation && (
        <div className="validation-box">
          <div className="validation-header">
            <span>Analytical Black-Scholes Formula Check:</span>
            <span className={cppResult.validation.isWithinConfidenceInterval ? 'status-pass' : 'status-warn'}>
              {cppResult.validation.isWithinConfidenceInterval ? 'MATCH (Pass)' : 'Discrepancy'}
            </span>
          </div>
          <div className="validation-details">
            <div>Analytical Price: <strong>${cppResult.validation.analyticalPrice?.toFixed(4)}</strong></div>
            <div>Relative Error: <strong>{(cppResult.validation.relativeError * 100)?.toFixed(3)}%</strong></div>
          </div>
        </div>
      )}

      {greeksResult && greeksResult.greeks && (
        <div className="greeks-section">
          <h4 className="section-subtitle">Finite-Difference Risk Sensitivities (Greeks)</h4>
          <div className="greeks-grid">
            <div className="greek-card">
              <span className="greek-symbol">Δ (Delta)</span>
              <span className="greek-value">{greeksResult.greeks.delta?.toFixed(4)}</span>
              <span className="greek-desc">Price vs Spot</span>
            </div>
            <div className="greek-card">
              <span className="greek-symbol">Γ (Gamma)</span>
              <span className="greek-value">{greeksResult.greeks.gamma?.toFixed(4)}</span>
              <span className="greek-desc">Delta vs Spot</span>
            </div>
            <div className="greek-card">
              <span className="greek-symbol">ν (Vega)</span>
              <span className="greek-value">{greeksResult.greeks.vega?.toFixed(4)}</span>
              <span className="greek-desc">Price vs 1% Vol</span>
            </div>
            <div className="greek-card">
              <span className="greek-symbol">Θ (Theta)</span>
              <span className="greek-value">{greeksResult.greeks.theta?.toFixed(4)}</span>
              <span className="greek-desc">Annual Decay</span>
            </div>
            <div className="greek-card">
              <span className="greek-symbol">ρ (Rho)</span>
              <span className="greek-value">{greeksResult.greeks.rho?.toFixed(4)}</span>
              <span className="greek-desc">Price vs Interest Rate</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResultsPanel;
