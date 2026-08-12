import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { API_BASE_URL } from '../apiConfig';

const DEFAULT_PARAMS = {
  S0: 100,
  K: 100,
  r: 0.05,
  sigma: 0.20,
  T: 1.0,
  isCall: true,
  numTrials: 100000
};

function ExecutedToolCallsPanel({ toolCalls }) {
  if (!toolCalls || toolCalls.length === 0) {
    return (
      <div style={{ marginBottom: '16px', padding: '10px 12px', background: '#000000', border: '1px solid #1e293b', borderRadius: '6px', fontSize: '0.85rem', color: '#94a3b8' }}>
        No tool calls — the agent answered from the C++ prompt alone.
      </div>
    );
  }

  return (
    <div style={{ marginBottom: '16px' }}>
      <h4 style={{ fontSize: '0.95rem', color: '#60a5fa', marginBottom: '8px' }}>
        Tool Calls ({toolCalls.length})
      </h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {toolCalls.map((tc, idx) => (
          <div key={idx} style={{ background: '#000000', border: '1px solid #1e293b', borderRadius: '6px', padding: '10px 12px', fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <code style={{ color: '#60a5fa' }}>{tc.toolName}</code>
              {tc.executionTimeMs != null && (
                <span style={{ color: '#94a3b8' }}>{tc.executionTimeMs} ms</span>
              )}
            </div>

            {tc.toolName === 'get_market_news' && (
              <>
                <div style={{ color: '#94a3b8', marginBottom: '6px' }}>
                  {tc.symbol} · {tc.dataSource || 'news'} · fetched {tc.fetchedAtDisplay || tc.fetchedAt || '—'}
                </div>
                <ul style={{ margin: 0, paddingLeft: '18px', color: '#ffffff', lineHeight: '1.5' }}>
                  {(tc.articles || []).slice(0, 5).map((article, i) => (
                    <li key={i}>
                      <strong>{article.title}</strong>
                      <span style={{ color: '#94a3b8' }}> — {article.source}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {tc.toolName === 'calculate_greeks' && tc.greeks && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', textAlign: 'center', color: '#ffffff' }}>
                <div><span style={{ color: '#94a3b8', fontSize: '0.75rem', display: 'block' }}>Δ</span>{tc.greeks.delta?.toFixed(3)}</div>
                <div><span style={{ color: '#94a3b8', fontSize: '0.75rem', display: 'block' }}>Γ</span>{tc.greeks.gamma?.toFixed(4)}</div>
                <div><span style={{ color: '#94a3b8', fontSize: '0.75rem', display: 'block' }}>ν</span>{tc.greeks.vega?.toFixed(2)}</div>
                <div><span style={{ color: '#94a3b8', fontSize: '0.75rem', display: 'block' }}>Θ</span>{tc.greeks.theta?.toFixed(2)}</div>
                <div><span style={{ color: '#94a3b8', fontSize: '0.75rem', display: 'block' }}>ρ</span>{tc.greeks.rho?.toFixed(3)}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const QuantAgentPanel = ({ simulationParams, symbol = 'AAPL' }) => {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [whatIfLabel, setWhatIfLabel] = useState(null);
  const [llmStatus, setLlmStatus] = useState(null);

  useEffect(() => {
    axios.get(`${API_BASE_URL}/api/implementation-status`)
      .then((res) => setLlmStatus(res.data))
      .catch(() => setLlmStatus(null));
  }, []);

  const buildParams = (overrides = {}) => {
    const base = simulationParams || DEFAULT_PARAMS;
    return {
      S0: parseFloat(overrides.S0 ?? base.S0),
      K: parseFloat(overrides.K ?? base.K),
      r: parseFloat(overrides.r ?? base.r),
      sigma: parseFloat(overrides.sigma ?? base.sigma),
      T: parseFloat(overrides.T ?? base.T),
      isCall: overrides.isCall !== undefined ? Boolean(overrides.isCall) : Boolean(base.isCall),
      numTrials: parseInt(overrides.numTrials ?? base.numTrials, 10),
      symbol: String(overrides.symbol ?? symbol).trim().toUpperCase() || 'AAPL'
    };
  };

  const handleRunAgent = async (overrides = {}, label = null) => {
    setLoading(true);
    setError(null);
    setWhatIfLabel(label);

    const params = buildParams(overrides);

    try {
      const response = await axios.post(`${API_BASE_URL}/api/agent/analyze`, params, {
        timeout: 0
      });
      setReport(response.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Agent analysis execution failed');
    } finally {
      setLoading(false);
    }
  };

  const modelName =
    report?.benchmarkStats?.modelName ||
    llmStatus?.llm_model ||
    null;
  const statusSubtitle =
    llmStatus?.llm_provider && llmStatus?.llm_model
      ? `${llmStatus.llm_provider} · ${llmStatus.llm_model}`
      : null;

  return (
    <div className="card quant-agent-card" style={{ border: '1px solid #1e293b', background: '#050811' }}>
      <div className="card-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h3 className="card-title" style={{ margin: 0, color: '#60a5fa' }}>AI Risk Analyst</h3>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
            {statusSubtitle ? (
              <code>{statusSubtitle}</code>
            ) : (
              'LLM · model loading…'
            )}
          </span>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => handleRunAgent()}
          disabled={loading}
          style={{ background: '#3b82f6', border: 'none', fontWeight: 600, color: '#ffffff' }}
        >
          {loading ? (llmStatus?.llm_model ? `${llmStatus.llm_model} reasoning…` : 'Running analysis…') : 'Run AI Risk Audit'}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {!report && !loading && (
        <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', border: '1px dashed #1e293b', borderRadius: '8px' }}>
          Click <strong>Run AI Risk Audit</strong> to have the configured LLM{modelName ? ` (${modelName})` : ''} reason over live C++ Monte Carlo prices, Greeks, and Google News headlines for the selected ticker. The agent may additionally invoke <code>get_market_news</code> and <code>calculate_greeks</code> via tools.
        </div>
      )}

      {loading && (
        <div style={{ padding: '30px', textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 12px' }}></div>
          <p style={{ color: '#60a5fa', fontSize: '0.95rem', marginBottom: '6px' }}>
            Running C++ pricing, live news, then LLM analysis…
          </p>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
            The agent may call news/Greeks tools. Groq is fast; local Ollama can take 1–3 minutes on a 12B model.
            {whatIfLabel ? ` (${whatIfLabel})` : ''}
          </p>
        </div>
      )}

      {report && !loading && (
        <div className="agent-report-content" style={{ marginTop: '12px' }}>
          {report.validationWarning && report.consistencyCheck?.flags?.length > 0 && (
            <div
              role="alert"
              style={{
                marginBottom: '16px',
                padding: '12px 14px',
                background: 'rgba(234, 179, 8, 0.12)',
                border: '1px solid #ca8a04',
                borderRadius: '8px'
              }}
            >
              <div style={{ fontWeight: 700, color: '#facc15', marginBottom: '8px', fontSize: '0.95rem' }}>
                Recommendation flagged — inconsistent with computed Greeks
              </div>
              <ul style={{ margin: 0, paddingLeft: '20px', color: '#fde68a', fontSize: '0.88rem', lineHeight: '1.5' }}>
                {report.consistencyCheck.flags.map((flag, idx) => (
                  <li key={idx}>{flag.message}</li>
                ))}
              </ul>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', padding: '12px', background: '#000000', border: '1px solid #1e293b', borderRadius: '8px' }}>
            <div>
              <span style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'block' }}>Agent Recommendation</span>
              <span className={`badge badge-${report.recommendationColor || 'warning'}`} style={{ fontSize: '1.1rem', padding: '4px 14px', fontWeight: 700 }}>
                {report.recommendation}
              </span>
            </div>
            {report.benchmarkStats && (
              <div style={{ textAlign: 'right', fontSize: '0.8rem', color: '#ffffff' }}>
                <div>C++ Engine: <strong>{report.benchmarkStats.cppTimeMs} ms</strong></div>
                {report.benchmarkStats.llmTimeSec != null && (
                  <div>LLM wall time: <strong>{report.benchmarkStats.llmTimeSec} s</strong></div>
                )}
                <div>LLM speed: <strong>{report.benchmarkStats.tokensPerSec != null ? `${report.benchmarkStats.tokensPerSec} tok/s` : '—'}</strong></div>
                <div>Model: <code>{report.benchmarkStats.modelName || modelName || '—'}</code></div>
              </div>
            )}
          </div>

          <ExecutedToolCallsPanel toolCalls={report.executedToolCalls} />

          <div style={{ marginBottom: '16px' }}>
            <h4 style={{ fontSize: '0.95rem', color: '#60a5fa', marginBottom: '8px' }}>1. Impact & Sensitivity Audit</h4>
            <ul style={{ paddingLeft: '20px', margin: 0, color: '#ffffff', fontSize: '0.9rem', lineHeight: '1.6' }}>
              {report.impactAnalysis.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>

          {report.comparison && (
            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ fontSize: '0.95rem', color: '#60a5fa', marginBottom: '8px' }}>2. European vs Asian Path Discount</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', background: '#000000', border: '1px solid #1e293b', padding: '10px', borderRadius: '6px', textAlign: 'center' }}>
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>European Call</span>
                  <strong style={{ color: '#ffffff' }}>${report.comparison.europeanPrice}</strong>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>Asian Call (Path Avg)</span>
                  <strong style={{ color: '#60a5fa' }}>${report.comparison.asianPrice}</strong>
                </div>
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>Path Discount</span>
                  <strong style={{ color: '#3b82f6' }}>{report.comparison.discountPct}</strong>
                </div>
              </div>
            </div>
          )}

          {report.marketNews && (
            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ fontSize: '0.95rem', color: '#60a5fa', marginBottom: '8px' }}>3. Live Market News</h4>
              <div style={{ background: '#000000', border: '1px solid #1e293b', borderRadius: '6px', padding: '12px 14px' }}>
                <div style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '10px' }}>
                  {report.marketNews.symbol} · {report.marketNews.dataSource || 'news'} · fetched{' '}
                  {report.marketNews.fetchedAtDisplay || report.marketNews.fetchedAt || '—'}
                </div>
                {report.marketNews.articles?.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: '20px', color: '#ffffff', fontSize: '0.9rem', lineHeight: '1.6' }}>
                    {report.marketNews.articles.map((article, idx) => (
                      <li key={idx} style={{ marginBottom: '8px' }}>
                        <strong>{article.title}</strong>
                        <span style={{ color: '#94a3b8' }}>
                          {' '}— {article.source}
                          {article.pubDateFormatted ? ` · ${article.pubDateFormatted}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.9rem' }}>No recent headlines available.</p>
                )}
              </div>
            </div>
          )}

          <div style={{ marginBottom: '16px' }}>
            <h4 style={{ fontSize: '0.95rem', color: '#60a5fa', marginBottom: '8px' }}>4. Plain-English Agent Advice</h4>
            <div className="gemma-markdown-card" style={{ background: '#000000', border: '1px solid #1e293b', padding: '16px', borderRadius: '6px', color: '#ffffff', fontSize: '0.9rem', lineHeight: '1.6' }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.gemmaText}</ReactMarkdown>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '8px', borderTop: '1px solid #1e293b' }}>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8', alignSelf: 'center' }}>What-if re-audit:</span>
            <button
              type="button"
              className="btn"
              disabled={loading}
              onClick={() => handleRunAgent({ sigma: buildParams().sigma * 0.9 }, 'Vol −10%')}
              style={{ fontSize: '0.8rem', padding: '4px 10px', background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0' }}
            >
              Vol −10%
            </button>
            <button
              type="button"
              className="btn"
              disabled={loading}
              onClick={() => handleRunAgent({ S0: buildParams().S0 * 0.95 }, 'Spot −5%')}
              style={{ fontSize: '0.8rem', padding: '4px 10px', background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0' }}
            >
              Spot −5%
            </button>
            <button
              type="button"
              className="btn"
              disabled={loading}
              onClick={() => handleRunAgent({}, null)}
              style={{ fontSize: '0.8rem', padding: '4px 10px', background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0' }}
            >
              Reset to current params
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuantAgentPanel;
