import React, { useState, useEffect, useRef } from 'react';
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

function ConsistencyCheckPanel({ consistencyCheck, validationWarning }) {
  if (!consistencyCheck) return null;

  const passed = consistencyCheck.passed;
  const flags = consistencyCheck.flags || [];

  if (passed) {
    return (
      <div
        style={{
          marginBottom: '16px',
          padding: '12px 14px',
          background: 'rgba(34, 197, 94, 0.1)',
          border: '1px solid #16a34a',
          borderRadius: '8px'
        }}
      >
        <div style={{ fontWeight: 700, color: '#4ade80', fontSize: '0.95rem' }}>
          ✓ Greeks consistency check passed
        </div>
        <p style={{ margin: '6px 0 0', color: '#86efac', fontSize: '0.85rem' }}>
          Recommendation aligns with computed delta and vega exposure.
        </p>
      </div>
    );
  }

  return (
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
        {validationWarning ? '⚠ Recommendation flagged — inconsistent with computed Greeks' : 'Greeks consistency warnings'}
      </div>
      {flags.length > 0 ? (
        <ul style={{ margin: 0, paddingLeft: '20px', color: '#fde68a', fontSize: '0.88rem', lineHeight: '1.5' }}>
          {flags.map((flag, idx) => (
            <li key={idx}>
              <span style={{ color: '#94a3b8', fontSize: '0.75rem', marginRight: '6px' }}>
                [{flag.greek || flag.type}]
              </span>
              {flag.message}
            </li>
          ))}
        </ul>
      ) : (
        <p style={{ margin: 0, color: '#fde68a', fontSize: '0.88rem' }}>Validation warning active.</p>
      )}
    </div>
  );
}

const QuantAgentPanel = ({ simulationParams, symbol = 'AAPL' }) => {
  const [loading, setLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [report, setReport] = useState(null);
  const [streamedAdvice, setStreamedAdvice] = useState('');
  const [error, setError] = useState(null);
  const [whatIfLabel, setWhatIfLabel] = useState(null);
  const [llmStatus, setLlmStatus] = useState(null);
  const abortControllerRef = useRef(null);

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

  const handleRunAgentStream = async (overrides = {}, label = null) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setIsStreaming(true);
    setError(null);
    setStreamedAdvice('');
    setWhatIfLabel(label);

    const params = buildParams(overrides);

    try {
      const response = await fetch(`${API_BASE_URL}/api/agent/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: abortControllerRef.current.signal
      });

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let currentReport = {
        recommendation: 'ANALYZING',
        recommendationColor: 'warning',
        impactAnalysis: [],
        comparison: null,
        marketNews: null,
        gemmaText: '',
        benchmarkStats: {}
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          try {
            const eventData = JSON.parse(trimmed.slice(6));

            if (eventData.type === 'init') {
              currentReport = {
                ...currentReport,
                comparison: eventData.comparison,
                greeks: eventData.greeks,
                marketNews: eventData.marketNews,
                benchmarkStats: {
                  ...currentReport.benchmarkStats,
                  ...eventData.benchmarkStats
                }
              };
              setReport({ ...currentReport });
            } else if (eventData.type === 'token') {
              setStreamedAdvice((prev) => {
                const next = prev + eventData.token;
                currentReport.gemmaText = next;
                return next;
              });
              setReport((prev) => ({
                ...(prev || currentReport),
                gemmaText: currentReport.gemmaText
              }));
            } else if (eventData.type === 'done') {
              currentReport = {
                ...currentReport,
                recommendation: eventData.recommendation,
                recommendationColor: eventData.recommendationColor,
                impactAnalysis: eventData.impactAnalysis || [],
                consistencyCheck: eventData.consistencyCheck,
                validationWarning: eventData.consistencyCheck ? !eventData.consistencyCheck.passed : false,
                gemmaText: eventData.finalText || currentReport.gemmaText,
                benchmarkStats: {
                  ...currentReport.benchmarkStats,
                  ...eventData.benchmarkStats
                }
              };
              setReport({ ...currentReport });
              setStreamedAdvice(currentReport.gemmaText);
            } else if (eventData.type === 'error') {
              throw new Error(eventData.error);
            }
          } catch (jsonErr) {
            // Ignore partial SSE chunk parsing
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.warn('Stream failed, falling back to standard endpoint:', err.message);
        // Fallback to standard non-streaming analyze endpoint
        try {
          const fallbackRes = await axios.post(`${API_BASE_URL}/api/agent/analyze`, params, { timeout: 0 });
          setReport(fallbackRes.data);
          setStreamedAdvice(fallbackRes.data.gemmaText || '');
        } catch (fbErr) {
          setError(fbErr.response?.data?.error || fbErr.message || 'Agent analysis execution failed');
        }
      }
    } finally {
      setLoading(false);
      setIsStreaming(false);
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
          onClick={() => handleRunAgentStream()}
          disabled={loading}
          style={{ background: '#3b82f6', border: 'none', fontWeight: 600, color: '#ffffff' }}
        >
          {loading ? (isStreaming ? '⚡ Streaming analysis…' : 'Running analysis…') : 'Run AI Risk Audit'}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {!report && !loading && (
        <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', border: '1px dashed #1e293b', borderRadius: '8px' }}>
          Click <strong>Run AI Risk Audit</strong> to stream real-time insights from {modelName ? ` ${modelName}` : 'the LLM'} reasoning over live C++ Monte Carlo prices, Greeks, and Google News headlines for the selected ticker.
        </div>
      )}

      {loading && !report?.comparison && (
        <div style={{ padding: '30px', textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 12px' }}></div>
          <p style={{ color: '#60a5fa', fontSize: '0.95rem', marginBottom: '6px' }}>
            Computing C++ pricing and connecting AI stream…
          </p>
          {whatIfLabel && (
            <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
              {whatIfLabel}
            </p>
          )}
        </div>
      )}

      {report && (
        <div className="agent-report-content" style={{ marginTop: '12px' }}>
          <ConsistencyCheckPanel
            consistencyCheck={report.consistencyCheck}
            validationWarning={report.validationWarning}
          />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', padding: '12px', background: '#000000', border: '1px solid #1e293b', borderRadius: '8px' }}>
            <div>
              <span style={{ fontSize: '0.85rem', color: '#94a3b8', display: 'block' }}>Agent Recommendation</span>
              <span className={`badge badge-${report.recommendationColor || 'warning'}`} style={{ fontSize: '1.1rem', padding: '4px 14px', fontWeight: 700 }}>
                {report.recommendation}
              </span>
            </div>
            {report.benchmarkStats && (
              <div style={{ textAlign: 'right', fontSize: '0.8rem', color: '#ffffff' }}>
                <div>C++ Engine: <strong>{report.benchmarkStats.cppTimeMs || '< 1'} ms</strong></div>
                {report.benchmarkStats.llmTimeSec != null && (
                  <div>LLM wall time: <strong>{report.benchmarkStats.llmTimeSec} s</strong></div>
                )}
                <div>Model: <code>{report.benchmarkStats.modelName || modelName || '—'}</code></div>
              </div>
            )}
          </div>

          {report.impactAnalysis && report.impactAnalysis.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ fontSize: '0.95rem', color: '#60a5fa', marginBottom: '8px' }}>1. Impact & Sensitivity Audit</h4>
              <ul style={{ paddingLeft: '20px', margin: 0, color: '#ffffff', fontSize: '0.9rem', lineHeight: '1.6' }}>
                {report.impactAnalysis.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
            </div>
          )}

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
                  {report.marketNews.fetchedAtDisplay || '—'}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <h4 style={{ fontSize: '0.95rem', color: '#60a5fa', margin: 0 }}>4. Plain-English Agent Advice</h4>
              {isStreaming && (
                <span style={{ fontSize: '0.75rem', color: '#38bdf8', animation: 'pulse 1.5s infinite' }}>
                  ● Streaming live tokens…
                </span>
              )}
            </div>
            <div className="gemma-markdown-card" style={{ background: '#000000', border: '1px solid #1e293b', padding: '16px', borderRadius: '6px', color: '#ffffff', fontSize: '0.9rem', lineHeight: '1.6', minHeight: '80px' }}>
              {streamedAdvice || report.gemmaText ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamedAdvice || report.gemmaText}</ReactMarkdown>
              ) : (
                <span style={{ color: '#94a3b8' }}>Generating reasoning…</span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', paddingTop: '8px', borderTop: '1px solid #1e293b' }}>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8', alignSelf: 'center' }}>What-if re-audit:</span>
            <button
              type="button"
              className="btn"
              disabled={loading}
              onClick={() => handleRunAgentStream({ sigma: buildParams().sigma * 0.9 }, 'Vol −10%')}
              style={{ fontSize: '0.8rem', padding: '4px 10px', background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0' }}
            >
              Vol −10%
            </button>
            <button
              type="button"
              className="btn"
              disabled={loading}
              onClick={() => handleRunAgentStream({ S0: buildParams().S0 * 0.95 }, 'Spot −5%')}
              style={{ fontSize: '0.8rem', padding: '4px 10px', background: '#1e293b', border: '1px solid #334155', color: '#e2e8f0' }}
            >
              Spot −5%
            </button>
            <button
              type="button"
              className="btn"
              disabled={loading}
              onClick={() => handleRunAgentStream({}, null)}
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
