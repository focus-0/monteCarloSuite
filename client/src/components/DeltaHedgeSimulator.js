import React, { useState } from 'react';
import axios from 'axios';
import { Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const API_BASE_URL = (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
  ? '' 
  : (process.env.REACT_APP_API_URL || '');

const DeltaHedgeSimulator = ({ baseParams }) => {
  const [params, setParams] = useState({
    S0: baseParams?.S0 || 100,
    K: baseParams?.K || 100,
    r: baseParams?.r || 0.05,
    sigma: baseParams?.sigma || 0.2,
    T: baseParams?.T || 1,
    isCall: baseParams?.isCall !== undefined ? baseParams.isCall : true,
    numTrials: 5000,
    numSteps: 252,
    rebalanceFreq: 1,
    txCostPct: 0.001 // 10 bps
  });

  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setParams((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleRunSimulation = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError(null);

    const payload = {
      S0: parseFloat(params.S0),
      K: parseFloat(params.K),
      r: parseFloat(params.r),
      sigma: parseFloat(params.sigma),
      T: parseFloat(params.T),
      isCall: Boolean(params.isCall),
      numTrials: parseInt(params.numTrials),
      numSteps: parseInt(params.numSteps),
      rebalanceFreq: parseInt(params.rebalanceFreq),
      txCostPct: parseFloat(params.txCostPct)
    };

    try {
      const res = await axios.post(`${API_BASE_URL}/api/simulation/delta-hedge`, payload);
      setResult(res.data);
    } catch (err) {
      console.error('Delta Hedge Simulation Error:', err);
      setError(err.response?.data?.error || err.message || 'Simulation failed');
    } finally {
      setLoading(false);
    }
  };

  // Helper to build P&L histogram chart data
  const getHistogramChartData = () => {
    if (!result || !result.pnlDistribution || result.pnlDistribution.length === 0) return null;

    const data = result.pnlDistribution;
    const min = result.summaryStatistics.minPnL;
    const max = result.summaryStatistics.maxPnL;
    const binCount = 30;
    const binWidth = (max - min) / binCount || 0.1;

    const bins = new Array(binCount).fill(0);
    const labels = [];

    for (let i = 0; i < binCount; i++) {
      const binMin = min + i * binWidth;
      labels.push(`$${binMin.toFixed(2)}`);
    }

    data.forEach((val) => {
      let idx = Math.floor((val - min) / binWidth);
      if (idx >= binCount) idx = binCount - 1;
      if (idx < 0) idx = 0;
      bins[idx]++;
    });

    return {
      labels,
      datasets: [
        {
          label: 'Frequency (Number of Paths)',
          data: bins,
          backgroundColor: 'rgba(59, 130, 246, 0.75)',
          borderColor: '#3b82f6',
          borderWidth: 1,
          borderRadius: 4
        }
      ]
    };
  };

  // Helper to build Sample Paths Chart data
  const getSamplePathsChartData = () => {
    if (!result || !result.samplePaths || result.samplePaths.length === 0) return null;

    const labels = result.samplePaths[0].map((step) => `Day ${(step.t * 252).toFixed(0)}`);
    const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6'];

    const datasets = result.samplePaths.map((path, idx) => ({
      label: `Path ${idx + 1} (Hedge Error)`,
      data: path.map((step) => step.hedgeError),
      borderColor: colors[idx % colors.length],
      backgroundColor: 'transparent',
      borderWidth: 2,
      tension: 0.1,
      pointRadius: 0
    }));

    return { labels, datasets };
  };

  const histogramData = getHistogramChartData();
  const samplePathsData = getSamplePathsChartData();

  return (
    <div className="delta-hedge-simulator">
      <div className="card parameter-form-card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h3 className="card-title" style={{ margin: 0 }}>🛡️ Discrete Delta-Hedging Simulator</h3>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '4px 0 0 0' }}>
              Simulate daily delta-hedging with transaction costs over 10,000 Monte Carlo paths to analyze real-world P&L risk distributions.
            </p>
          </div>
        </div>

        <form onSubmit={handleRunSimulation}>
          <div className="form-group-row">
            <div className="form-group">
              <label>Stock Price (S₀)</label>
              <input
                type="number"
                name="S0"
                step="0.01"
                value={params.S0}
                onChange={handleChange}
                className="form-control"
                required
              />
            </div>
            <div className="form-group">
              <label>Strike Price (K)</label>
              <input
                type="number"
                name="K"
                step="0.01"
                value={params.K}
                onChange={handleChange}
                className="form-control"
                required
              />
            </div>
            <div className="form-group">
              <label>Volatility (σ)</label>
              <input
                type="number"
                name="sigma"
                step="0.001"
                value={params.sigma}
                onChange={handleChange}
                className="form-control"
                required
              />
            </div>
          </div>

          <div className="form-group-row">
            <div className="form-group">
              <label>Risk-Free Rate (r)</label>
              <input
                type="number"
                name="r"
                step="0.001"
                value={params.r}
                onChange={handleChange}
                className="form-control"
                required
              />
            </div>
            <div className="form-group">
              <label>Time to Expiry (T years)</label>
              <input
                type="number"
                name="T"
                step="0.01"
                value={params.T}
                onChange={handleChange}
                className="form-control"
                required
              />
            </div>
            <div className="form-group">
              <label>Option Style</label>
              <select
                name="isCall"
                value={params.isCall}
                onChange={handleChange}
                className="form-control"
              >
                <option value={true}>Call Option</option>
                <option value={false}>Put Option</option>
              </select>
            </div>
          </div>

          <div className="form-group-row">
            <div className="form-group">
              <label>Path Count (N)</label>
              <select
                name="numTrials"
                value={params.numTrials}
                onChange={handleChange}
                className="form-control"
              >
                <option value={1000}>1,000 Paths</option>
                <option value={5000}>5,000 Paths</option>
                <option value={10000}>10,000 Paths (Standard)</option>
              </select>
            </div>
            <div className="form-group">
              <label>Rebalance Frequency</label>
              <select
                name="rebalanceFreq"
                value={params.rebalanceFreq}
                onChange={handleChange}
                className="form-control"
              >
                <option value={1}>Daily Rebalance (1 step)</option>
                <option value={5}>Weekly Rebalance (5 steps)</option>
              </select>
            </div>
            <div className="form-group">
              <label>Transaction Fee (bps)</label>
              <select
                name="txCostPct"
                value={params.txCostPct}
                onChange={handleChange}
                className="form-control"
              >
                <option value={0.0}>0 bps (Zero Friction)</option>
                <option value={0.0005}>5 bps (0.05%)</option>
                <option value={0.001}>10 bps (0.10% Standard)</option>
                <option value={0.0025}>25 bps (0.25% High Friction)</option>
              </select>
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-submit" disabled={loading} style={{ width: '100%', marginTop: '1rem' }}>
            {loading ? '⚡ Simulating 10,000 Delta-Hedged Paths in C++...' : '▶ Run Delta-Hedging Simulation'}
          </button>
        </form>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {result && result.summaryStatistics && (
        <div className="results-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Summary Stat Cards */}
          <div className="grid-four-col" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
            <div className="card stat-card" style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '1rem', borderRadius: '8px' }}>
              <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Mean Hedge P&L</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: result.summaryStatistics.meanPnL >= 0 ? '#10b981' : '#ef4444', margin: '4px 0' }}>
                ${result.summaryStatistics.meanPnL?.toFixed(4)}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Frictional leakage & error</div>
            </div>

            <div className="card stat-card" style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '1rem', borderRadius: '8px' }}>
              <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Hedge Volatility (σ_pnl)</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f59e0b', margin: '4px 0' }}>
                ${result.summaryStatistics.stdDevPnL?.toFixed(4)}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Discrete gap risk variance</div>
            </div>

            <div className="card stat-card" style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '1rem', borderRadius: '8px' }}>
              <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>95% Value at Risk (VaR)</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ef4444', margin: '4px 0' }}>
                ${result.summaryStatistics.var95?.toFixed(4)}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>5th percentile worst outcome</div>
            </div>

            <div className="card stat-card" style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '1rem', borderRadius: '8px' }}>
              <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>95% Expected Shortfall</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ec4899', margin: '4px 0' }}>
                ${result.summaryStatistics.cvar95?.toFixed(4)}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>CVaR tail risk average</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', color: '#94a3b8', fontSize: '0.85rem' }}>
            <span>⚡ Executed {result.numPaths?.toLocaleString()} paths ({result.numSteps} steps) in <strong>{result.executionTimeMs?.toFixed(2)} ms</strong> in multithreaded C++</span>
            <span>• Average Tx Costs Paid: <strong>${result.summaryStatistics.avgTxCosts?.toFixed(4)}</strong></span>
          </div>

          {/* Histogram Chart */}
          {histogramData && (
            <div className="card chart-card" style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '1.5rem', borderRadius: '8px' }}>
              <h4 className="card-title">Hedge P&L Risk Distribution (10,000 Simulated Outcomes)</h4>
              <div className="chart-container" style={{ height: '320px' }}>
                <Bar
                  data={histogramData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                      x: { title: { display: true, text: 'Final Portfolio P&L at Expiry ($)', color: '#94a3b8' }, ticks: { color: '#94a3b8' }, grid: { display: false } },
                      y: { title: { display: true, text: 'Path Frequency', color: '#94a3b8' }, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255, 255, 255, 0.06)' } }
                    }
                  }}
                />
              </div>
            </div>
          )}

          {/* Sample Paths Chart */}
          {samplePathsData && (
            <div className="card chart-card" style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '1.5rem', borderRadius: '8px' }}>
              <h4 className="card-title">Sample Paths: Cumulative Hedging Tracking Error over Time</h4>
              <div className="chart-container" style={{ height: '320px' }}>
                <Line
                  data={samplePathsData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: true, labels: { color: '#94a3b8' } } },
                    scales: {
                      x: { title: { display: true, text: 'Trading Days', color: '#94a3b8' }, ticks: { color: '#94a3b8' }, grid: { display: false } },
                      y: { title: { display: true, text: 'Tracking Error ($)', color: '#94a3b8' }, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255, 255, 255, 0.06)' } }
                    }
                  }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DeltaHedgeSimulator;
