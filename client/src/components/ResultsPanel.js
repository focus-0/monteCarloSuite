import React from 'react';

const ResultsPanel = ({ cppResult, jsResult, greeksResult, optionType }) => {
  if (!cppResult) return null;

  return (
    <div className="card results-panel-card">
      <div className="results-header">
        <div>
          <h3 className="card-title">Monte Carlo Results ({optionType.toUpperCase()})</h3>
          <span className="subtitle">High-Speed C++ Engine Output</span>
        </div>
        <span className="badge badge-success">Instant C++ Render</span>
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

      {cppResult.validation && (
        <div className="validation-box">
          <div className="validation-header">
            <span>Analytical Black-Scholes Formula Check:</span>
            <span className={cppResult.validation.isWithinConfidenceInterval ? 'status-pass' : 'status-warn'}>
              {cppResult.validation.isWithinConfidenceInterval ? '✓ MATCH (Pass)' : '⚠ Discrepancy'}
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
