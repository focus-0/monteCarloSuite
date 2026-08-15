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

const PROMPT_PRESETS = [
  'What happens if volatility crushes by 30% post-earnings?',
  'Analyze Delta and Gamma pin risk approaching expiration',
  'Evaluate downside tail risk and hedge recommendations',
  'How does today\'s news catalyst impact our position?'
];

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
          Greeks consistency check passed
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
        {validationWarning ? 'Recommendation flagged — inconsistent with computed Greeks' : 'Greeks consistency warnings'}
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
  const [customPrompt, setCustomPrompt] = useState('');
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
      symbol: String(overrides.symbol ?? symbol).trim().toUpperCase() || 'AAPL',
      customPrompt: overrides.customPrompt !== undefined ? overrides.customPrompt : customPrompt
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
      let streamedTextAccum = '';
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
              const token = eventData.token || '';
              streamedTextAccum += token;
              currentReport.gemmaText = streamedTextAccum;
              setStreamedAdvice(streamedTextAccum);
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
    <div className="card quant-agent-card" style={{ border: '1px solid #18181b', background: '#000000' }}>
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
          {loading ? (isStreaming ? 'Streaming analysis…' : 'Running analysis…') : 'Run AI Risk Audit'}
        </button>
      </div>

      {/* Interactive Prompt Input & Presets */}
      <div style={{ marginBottom: '16px', background: '#000000', border: '1px solid #27272a', padding: '14px', borderRadius: '8px' }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleRunAgentStream();
          }}
          style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}
        >
          <input
            type="text"
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder={`Ask Copilot about ${symbol} risk, catalysts, IV crush, or hedging scenarios...`}
            style={{
              flex: 1,
              padding: '10px 14px',
              background: '#0d0d11',
              border: '1px solid #3f3f46',
              borderRadius: '6px',
              color: '#ffffff',
              fontSize: '0.9rem'
            }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              background: '#2563eb',
              border: '1px solid #3b82f6',
              color: '#ffffff',
              padding: '8px 18px',
              borderRadius: '6px',
              fontSize: '0.88rem',
              cursor: 'pointer',
              fontWeight: 700
            }}
          >
            Ask
          </button>
        </form>

        {/* Quick Presets */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {PROMPT_PRESETS.map((preset, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setCustomPrompt(preset);
                handleRunAgentStream({ customPrompt: preset });
              }}
              style={{
                background: '#0d0d11',
                border: '1px solid #27272a',
                color: '#cbd5e1',
                padding: '5px 10px',
                borderRadius: '6px',
                fontSize: '0.78rem',
                cursor: 'pointer',
                fontWeight: 500
              }}
            >
              {preset}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {!report && !loading && (
        <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', border: '1px dashed #18181b', borderRadius: '8px' }}>
          Type a custom question above or click <strong>Run AI Risk Audit</strong> to stream real-time insights from {modelName ? ` ${modelName}` : 'the LLM'} reasoning over live C++ Monte Carlo prices, Greeks, and Google News headlines for the selected ticker.
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

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', padding: '14px', background: '#000000', border: '1px solid #27272a', borderRadius: '8px' }}>
            <div>
              <span style={{ fontSize: '0.85rem', color: '#cbd5e1', fontWeight: 600, display: 'block' }}>Agent Recommendation</span>
              <span className={`badge badge-${report.recommendationColor || 'warning'}`} style={{ fontSize: '1.1rem', padding: '4px 14px', fontWeight: 700 }}>
                {report.recommendation}
              </span>
            </div>
            {report.benchmarkStats && (
              <div style={{ textAlign: 'right', fontSize: '0.82rem', color: '#ffffff' }}>
                <div>C++ Engine: <strong style={{ color: '#4ade80' }}>{report.benchmarkStats.cppTimeMs || '< 1'} ms</strong></div>
                {report.benchmarkStats.llmTimeSec != null && (
                  <div>LLM wall time: <strong style={{ color: '#facc15' }}>{report.benchmarkStats.llmTimeSec} s</strong></div>
                )}
                <div>Model: <code style={{ color: '#38bdf8' }}>{report.benchmarkStats.modelName || modelName || '—'}</code></div>
              </div>
            )}
          </div>

          {report.impactAnalysis && report.impactAnalysis.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ fontSize: '1rem', color: '#60a5fa', marginBottom: '8px', fontWeight: 700 }}>1. Impact & Sensitivity Audit</h4>
              <ul style={{ paddingLeft: '20px', margin: 0, color: '#f8fafc', fontSize: '0.92rem', lineHeight: '1.6' }}>
                {report.impactAnalysis.map((item, idx) => (
                  <li key={idx} style={{ marginBottom: '4px' }}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {report.comparison && (
            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ fontSize: '1rem', color: '#60a5fa', marginBottom: '8px', fontWeight: 700 }}>2. European vs Asian Path Discount</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', background: '#000000', border: '1px solid #27272a', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                <div>
                  <span style={{ fontSize: '0.78rem', color: '#cbd5e1', fontWeight: 600, display: 'block' }}>European Call</span>
                  <strong style={{ color: '#ffffff', fontSize: '1.1rem' }}>${report.comparison.europeanPrice}</strong>
                </div>
                <div>
                  <span style={{ fontSize: '0.78rem', color: '#cbd5e1', fontWeight: 600, display: 'block' }}>Asian Call (Path Avg)</span>
                  <strong style={{ color: '#60a5fa', fontSize: '1.1rem' }}>${report.comparison.asianPrice}</strong>
                </div>
                <div>
                  <span style={{ fontSize: '0.78rem', color: '#cbd5e1', fontWeight: 600, display: 'block' }}>Path Discount</span>
                  <strong style={{ color: '#38bdf8', fontSize: '1.1rem' }}>{report.comparison.discountPct}</strong>
                </div>
              </div>
            </div>
          )}

          {report.marketNews && (
            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ fontSize: '1rem', color: '#60a5fa', marginBottom: '8px', fontWeight: 700 }}>3. Live Market News</h4>
              <div style={{ background: '#000000', border: '1px solid #27272a', borderRadius: '8px', padding: '14px' }}>
                <div style={{ color: '#cbd5e1', fontSize: '0.85rem', marginBottom: '10px' }}>
                  {report.marketNews.symbol} · {report.marketNews.dataSource || 'news'} · fetched{' '}
                  {report.marketNews.fetchedAtDisplay || '—'}
                </div>
                {report.marketNews.articles?.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: '20px', color: '#f8fafc', fontSize: '0.9rem', lineHeight: '1.6' }}>
                    {report.marketNews.articles.map((article, idx) => (
                      <li key={idx} style={{ marginBottom: '8px' }}>
                        <strong style={{ color: '#ffffff' }}>{article.title}</strong>
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
              <h4 style={{ fontSize: '1rem', color: '#60a5fa', margin: 0, fontWeight: 700 }}>4. Plain-English Agent Advice</h4>
              {isStreaming && (
                <span style={{ fontSize: '0.78rem', color: '#38bdf8', animation: 'pulse 1.5s infinite', fontWeight: 600 }}>
                  Streaming live tokens…
                </span>
              )}
            </div>
            <div className="gemma-markdown-card" style={{ background: '#000000', border: '1px solid #27272a', padding: '18px', borderRadius: '8px', color: '#ffffff', fontSize: '0.92rem', lineHeight: '1.65', minHeight: '80px' }}>
              {streamedAdvice || report.gemmaText ? (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamedAdvice || report.gemmaText}</ReactMarkdown>
              ) : (
                <span style={{ color: '#94a3b8' }}>Generating reasoning…</span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', paddingTop: '10px', borderTop: '1px solid #27272a' }}>
            <span style={{ fontSize: '0.85rem', color: '#cbd5e1', alignSelf: 'center', fontWeight: 600 }}>What-if re-audit:</span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={loading}
              onClick={() => handleRunAgentStream({ sigma: buildParams().sigma * 0.9 }, 'Vol −10%')}
            >
              Vol −10%
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={loading}
              onClick={() => handleRunAgentStream({ S0: buildParams().S0 * 0.95 }, 'Spot −5%')}
            >
              Spot −5%
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={loading}
              onClick={() => handleRunAgentStream({}, null)}
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
