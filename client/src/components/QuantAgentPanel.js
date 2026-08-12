import React, { useState } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const QuantAgentPanel = ({ simulationParams }) => {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  const handleRunAgent = async () => {
    setLoading(true);
    setError(null);

    const params = simulationParams || {
      S0: 100,
      K: 100,
      r: 0.05,
      sigma: 0.20,
      T: 1.0,
      isCall: true,
      numTrials: 100000
    };

    try {
      const response = await axios.post('/api/agent/analyze', params);
      setReport(response.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Agent analysis execution failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card quant-agent-card" style={{ border: '1px solid #1e293b', background: '#050811' }}>
      <div className="card-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h3 className="card-title" style={{ margin: 0, color: '#60a5fa' }}>Local Gemma AI Risk Analyst</h3>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Offline MCP Agent (gemma4:e2b-mlx)</span>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleRunAgent}
          disabled={loading}
          style={{ background: '#3b82f6', border: 'none', fontWeight: 600, color: '#ffffff' }}
        >
          {loading ? 'Gemma Reasoning...' : 'Run AI Risk Audit'}
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {!report && !loading && (
        <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', border: '1px dashed #1e293b', borderRadius: '8px' }}>
          Click <strong>"Run AI Risk Audit"</strong> to trigger local Google Gemma model reasoning over live C++ Monte Carlo prices and Greeks via MCP.
        </div>
      )}

      {loading && (
        <div style={{ padding: '30px', textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 12px' }}></div>
          <p style={{ color: '#60a5fa', fontSize: '0.95rem' }}>Gemma AI Agent is executing tool calls on C++ Monte Carlo Engine over stdio JSON-RPC...</p>
        </div>
      )}

      {report && !loading && (
        <div className="agent-report-content" style={{ marginTop: '12px' }}>
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
                <div>Gemma Speed: <strong>{report.benchmarkStats.tokensPerSec} tokens/sec</strong></div>
                <div>Model: <code>{report.benchmarkStats.modelName}</code></div>
              </div>
            )}
          </div>

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

          <div>
            <h4 style={{ fontSize: '0.95rem', color: '#60a5fa', marginBottom: '8px' }}>3. Plain-English Agent Advice</h4>
            <div className="gemma-markdown-card" style={{ background: '#000000', border: '1px solid #1e293b', padding: '16px', borderRadius: '6px', color: '#ffffff', fontSize: '0.9rem', lineHeight: '1.6' }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{report.gemmaText}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuantAgentPanel;
