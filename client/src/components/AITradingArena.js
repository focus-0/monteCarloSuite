import React, { useState } from 'react';
import axios from 'axios';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const API_BASE_URL = (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
  ? '' 
  : (process.env.REACT_APP_API_URL || '');

const AITradingArena = () => {
  const [params, setParams] = useState({
    symbol: 'AAPL',
    capital: 100000,
    strategyMode: 'ai_agent'
  });

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setParams((prev) => ({ ...prev, [name]: value }));
  };

  const handleRunArena = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await axios.post(`${API_BASE_URL}/api/mft/arena/run`, {
        symbol: params.symbol,
        capital: parseFloat(params.capital),
        strategyMode: params.strategyMode
      });
      setResult(res.data);
    } catch (err) {
      console.error('Arena Execution Error:', err);
      setError(err.response?.data?.error || err.message || 'Arena simulation failed');
    } finally {
      setLoading(false);
    }
  };

  const getNavChartData = () => {
    if (!result || !result.navCurve || result.navCurve.length === 0) return null;

    // Sample every 10th minute for smooth chart rendering
    const sampled = result.navCurve.filter((_, idx) => idx % 10 === 0 || idx === result.navCurve.length - 1);

    return {
      labels: sampled.map((pt) => pt.time),
      datasets: [
        {
          label: 'Portfolio Net Asset Value (NAV)',
          data: sampled.map((pt) => pt.nav),
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.2,
          pointRadius: 0
        },
        {
          label: 'Stock Price ($)',
          data: sampled.map((pt) => pt.price),
          borderColor: '#3b82f6',
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          borderDash: [4, 4],
          tension: 0.2,
          pointRadius: 0,
          yAxisID: 'y1'
        }
      ]
    };
  };

  const navData = getNavChartData();

  return (
    <div className="ai-trading-arena">
      <div className="card parameter-form-card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h3 className="card-title" style={{ margin: 0 }}>🏆 MFT Market Replay & AI Agent Trading Arena</h3>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '4px 0 0 0' }}>
              Simulate an entire 390-minute intraday trading session (9:30 AM - 4:00 PM) where an autonomous AI Agent trades & hedges in real-time.
            </p>
          </div>
        </div>

        <form onSubmit={handleRunArena}>
          <div className="form-group-row">
            <div className="form-group">
              <label>Select Asset</label>
              <select name="symbol" value={params.symbol} onChange={handleChange} className="form-control">
                <option value="AAPL">AAPL (Apple Inc.)</option>
                <option value="NVDA">NVDA (NVIDIA Corp.)</option>
                <option value="TSLA">TSLA (Tesla Inc.)</option>
                <option value="SPY">SPY (S&P 500 ETF)</option>
              </select>
            </div>
            <div className="form-group">
              <label>Starting Portfolio Capital ($)</label>
              <input
                type="number"
                name="capital"
                value={params.capital}
                onChange={handleChange}
                className="form-control"
                required
              />
            </div>
            <div className="form-group">
              <label>Trading Strategy Mode</label>
              <select name="strategyMode" value={params.strategyMode} onChange={handleChange} className="form-control">
                <option value="ai_agent">🤖 Autonomous AI Agent (Greeks + News Trigger)</option>
                <option value="delta_hedge">🛡️ Rules-Based Delta Hedge</option>
                <option value="buy_hold">📈 Unhedged Buy & Hold</option>
              </select>
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-submit" disabled={loading} style={{ width: '100%', marginTop: '1rem' }}>
            {loading ? '⚡ Simulating 390 Trading Minutes in Sub-2ms C++ Engine...' : '▶ Run 390-Minute AI Trading Arena'}
          </button>
        </form>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {result && result.summary && (
        <div className="arena-results" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Performance Summary Cards */}
          <div className="grid-four-col" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem' }}>
            <div className="card stat-card" style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '1rem', borderRadius: '8px' }}>
              <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Net Trading Profit</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: result.summary.netProfit >= 0 ? '#10b981' : '#ef4444', margin: '4px 0' }}>
                ${result.summary.netProfit?.toLocaleString()}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>ROI: {result.summary.roiPct}%</div>
            </div>

            <div className="card stat-card" style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '1rem', borderRadius: '8px' }}>
              <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Ending Portfolio NAV</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#3b82f6', margin: '4px 0' }}>
                ${result.summary.finalNav?.toLocaleString()}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Initial: ${result.summary.initialCapital?.toLocaleString()}</div>
            </div>

            <div className="card stat-card" style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '1rem', borderRadius: '8px' }}>
              <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Sharpe Ratio</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#f59e0b', margin: '4px 0' }}>
                {result.summary.sharpeRatio}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Risk-adjusted return</div>
            </div>

            <div className="card stat-card" style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '1rem', borderRadius: '8px' }}>
              <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Max Drawdown</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#ec4899', margin: '4px 0' }}>
                {result.summary.maxDrawdownPct}%
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Peak-to-trough risk</div>
            </div>

            <div className="card stat-card" style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '1rem', borderRadius: '8px' }}>
              <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Total Tx Fees</div>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#64748b', margin: '4px 0' }}>
                ${result.summary.totalTxCosts?.toLocaleString()}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>10 bps friction total</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', color: '#94a3b8', fontSize: '0.85rem' }}>
            <span>⚡ Simulated 390 trading minutes in <strong>{result.executionTimeMs} ms</strong></span>
            <span>• Total AI Trade Executions: <strong>{result.summary.totalTrades}</strong></span>
          </div>

          {/* Intraday NAV Growth Chart */}
          {navData && (
            <div className="card chart-card" style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '1.5rem', borderRadius: '8px' }}>
              <h4 className="card-title">Intraday Portfolio NAV Trajectory (9:30 AM - 4:00 PM)</h4>
              <div className="chart-container" style={{ height: '320px' }}>
                <Line
                  data={navData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: true, labels: { color: '#94a3b8' } } },
                    scales: {
                      x: { title: { display: true, text: 'Trading Time (390 Minutes)', color: '#94a3b8' }, ticks: { color: '#94a3b8' }, grid: { display: false } },
                      y: { title: { display: true, text: 'Portfolio NAV ($)', color: '#94a3b8' }, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255, 255, 255, 0.06)' } },
                      y1: { type: 'linear', display: true, position: 'right', title: { display: true, text: 'Stock Price ($)', color: '#94a3b8' }, ticks: { color: '#94a3b8' }, grid: { display: false } }
                    }
                  }}
                />
              </div>
            </div>
          )}

          {/* Trade Execution Audit Log Table */}
          {result.tradeLog && result.tradeLog.length > 0 && (
            <div className="card table-card" style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '1.5rem', borderRadius: '8px' }}>
              <h4 className="card-title" style={{ marginBottom: '1rem' }}>📜 AI Trade Execution Log (390 Trading Minutes)</h4>
              <table style={{ width: '100%', borderCollapse: 'collapse', color: '#94a3b8', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #1e293b', textAlign: 'left', color: '#f1f5f9' }}>
                    <th style={{ padding: '8px' }}>Time</th>
                    <th style={{ padding: '8px' }}>Action</th>
                    <th style={{ padding: '8px' }}>Execution Details</th>
                    <th style={{ padding: '8px' }}>Stock Price</th>
                    <th style={{ padding: '8px' }}>Delta (Δ)</th>
                    <th style={{ padding: '8px' }}>Tx Fee</th>
                    <th style={{ padding: '8px' }}>Strategy Rationale</th>
                  </tr>
                </thead>
                <tbody>
                  {result.tradeLog.map((t, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                      <td style={{ padding: '8px', color: '#f1f5f9', fontWeight: 600 }}>{t.time}</td>
                      <td style={{ padding: '8px' }}>
                        <span style={{
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          background: t.action.includes('BUY') ? 'rgba(16, 185, 129, 0.2)' : t.action.includes('SELL') ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                          color: t.action.includes('BUY') ? '#10b981' : t.action.includes('SELL') ? '#ef4444' : '#3b82f6'
                        }}>
                          {t.action}
                        </span>
                      </td>
                      <td style={{ padding: '8px', color: '#f1f5f9' }}>{t.detail}</td>
                      <td style={{ padding: '8px' }}>${t.stockPrice?.toFixed(2)}</td>
                      <td style={{ padding: '8px' }}>{t.delta}</td>
                      <td style={{ padding: '8px' }}>${t.txFee?.toFixed(2)}</td>
                      <td style={{ padding: '8px', fontSize: '0.8rem', fontStyle: 'italic', color: '#94a3b8' }}>{t.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AITradingArena;
