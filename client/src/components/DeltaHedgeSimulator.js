import React from 'react';
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

const DeltaHedgeSimulator = ({
  result,
  loading,
  error,
  hedgeParams,
  onHedgeParamChange,
  onRunHedge,
  baseParams,
  saveStatus,
  onSaveToHistory
}) => {
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
          label: 'Frequency (Paths)',
          data: bins,
          backgroundColor: 'rgba(56, 189, 248, 0.65)',
          borderColor: '#38bdf8',
          borderWidth: 1,
          borderRadius: 4
        }
      ]
    };
  };

  const getSamplePathsChartData = () => {
    if (!result || !result.samplePaths || result.samplePaths.length === 0) return null;

    const labels = result.samplePaths[0].map((step) => `Day ${(step.t * 252).toFixed(0)}`);
    const colors = ['#4ade80', '#38bdf8', '#facc15', '#f43f5e', '#c084fc'];

    const datasets = result.samplePaths.map((path, idx) => ({
      label: `Path ${idx + 1}`,
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
      {/* Hedge Configuration Bar */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '18px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h3 className="card-title" style={{ margin: 0, color: '#60a5fa' }}>
              C++ Discrete Delta-Hedging Simulator
            </h3>
            <p style={{ color: '#cbd5e1', fontSize: '0.85rem', margin: '4px 0 0 0' }}>
              Simulate dynamic replication with discrete rebalancing and friction/slippage across Monte Carlo paths.
            </p>
          </div>

          {result && onSaveToHistory && (
            <button
              className="btn btn-xs"
              onClick={onSaveToHistory}
              disabled={saveStatus === 'saving'}
              style={{
                background: saveStatus === 'saved' ? '#15803d' : '#000000',
                border: `1px solid ${saveStatus === 'saved' ? '#22c55e' : '#3f3f46'}`,
                color: saveStatus === 'saved' ? '#ffffff' : '#38bdf8',
                fontSize: '0.82rem',
                padding: '6px 14px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              {saveStatus === 'saving'
                ? 'Saving…'
                : saveStatus === 'saved'
                  ? 'Saved to DB'
                  : saveStatus === 'error'
                    ? 'Save Failed (DB offline)'
                    : 'Save Hedge to MongoDB'}
            </button>
          )}
        </div>

        {/* Inline Parameter Controls */}
        <form
          onSubmit={onRunHedge}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            flexWrap: 'wrap',
            background: '#000000',
            padding: '14px 16px',
            borderRadius: '8px',
            border: '1px solid #27272a'
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '0.78rem', color: '#cbd5e1', fontWeight: 600 }}>Hedging Paths</label>
            <select
              value={hedgeParams?.numTrials || 5000}
              onChange={(e) => onHedgeParamChange && onHedgeParamChange('numTrials', e.target.value)}
              className="config-input"
              style={{ width: '120px' }}
            >
              <option value={1000}>1,000</option>
              <option value={5000}>5,000</option>
              <option value={10000}>10,000</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '0.78rem', color: '#cbd5e1', fontWeight: 600 }}>Rebalancing</label>
            <select
              value={hedgeParams?.rebalanceFreq || 1}
              onChange={(e) => onHedgeParamChange && onHedgeParamChange('rebalanceFreq', e.target.value)}
              className="config-input"
              style={{ width: '120px' }}
            >
              <option value={1}>Daily (dt = 1/252)</option>
              <option value={5}>Weekly (dt = 5/252)</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '0.78rem', color: '#cbd5e1', fontWeight: 600 }}>Tx Friction (bps)</label>
            <select
              value={hedgeParams?.txCostPct !== undefined ? hedgeParams.txCostPct : 0.001}
              onChange={(e) => onHedgeParamChange && onHedgeParamChange('txCostPct', e.target.value)}
              className="config-input"
              style={{ width: '120px' }}
            >
              <option value={0.0}>0 bps</option>
              <option value={0.0005}>5 bps</option>
              <option value={0.001}>10 bps</option>
              <option value={0.0025}>25 bps</option>
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '0.78rem', color: '#cbd5e1', fontWeight: 600 }}>Underlying Spot / Strike</label>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#f8fafc', padding: '6px 12px', background: '#000000', borderRadius: '6px', border: '1px solid #3f3f46' }}>
              S₀=${baseParams?.S0 || 100} / K=${baseParams?.K || 100} ({baseParams?.isCall ? 'Call' : 'Put'})
            </div>
          </div>

          <div style={{ marginLeft: 'auto', alignSelf: 'flex-end' }}>
            <button
              type="submit"
              className="btn btn-primary config-run-btn"
              disabled={loading}
              style={{ minWidth: '190px' }}
            >
              {loading ? 'Simulating in C++…' : 'Run C++ Delta Hedge'}
            </button>
          </div>
        </form>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {!result && !loading && (
        <div className="card placeholder-card">
          <h3>Ready to Simulate Delta Hedging</h3>
          <p>
            Configure hedging parameters above and click <strong>Run C++ Delta Hedge</strong> to analyze replication error, transaction costs, and P&L distribution.
          </p>
        </div>
      )}

      {loading && (
        <div className="card placeholder-card">
          <div className="spinner" style={{ margin: '0 auto 14px' }} />
          <p style={{ textAlign: 'center', color: '#38bdf8', fontSize: '1rem', fontWeight: 500 }}>
            Simulating multi-threaded delta-hedging paths with transaction cost slippage in native C++…
          </p>
        </div>
      )}

      {result && result.summaryStatistics && !loading && (
        <div className="results-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Summary Stat Cards */}
          <div className="grid-four-col" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            <div className="card" style={{ padding: '1.25rem', border: '1px solid #27272a' }}>
              <div style={{ color: '#cbd5e1', fontSize: '0.82rem', fontWeight: 600 }}>Mean Hedge P&L</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: result.summaryStatistics.meanPnL >= 0 ? '#4ade80' : '#f87171', margin: '4px 0' }}>
                ${result.summaryStatistics.meanPnL?.toFixed(4)}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Frictional leakage & drift</div>
            </div>

            <div className="card" style={{ padding: '1.25rem', border: '1px solid #27272a' }}>
              <div style={{ color: '#cbd5e1', fontSize: '0.82rem', fontWeight: 600 }}>Hedge Volatility (σ_pnl)</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#facc15', margin: '4px 0' }}>
                ${result.summaryStatistics.stdDevPnL?.toFixed(4)}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Discrete gap risk variance</div>
            </div>

            <div className="card" style={{ padding: '1.25rem', border: '1px solid #27272a' }}>
              <div style={{ color: '#cbd5e1', fontSize: '0.82rem', fontWeight: 600 }}>95% Value at Risk (VaR)</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f87171', margin: '4px 0' }}>
                ${result.summaryStatistics.var95?.toFixed(4)}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>5th percentile worst outcome</div>
            </div>

            <div className="card" style={{ padding: '1.25rem', border: '1px solid #27272a' }}>
              <div style={{ color: '#cbd5e1', fontSize: '0.82rem', fontWeight: 600 }}>95% Expected Shortfall</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#c084fc', margin: '4px 0' }}>
                ${result.summaryStatistics.cvar95?.toFixed(4)}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>CVaR tail risk average</div>
            </div>
          </div>

          {/* Engine throughput details */}
          <div style={{ display: 'flex', gap: '1.5rem', color: '#cbd5e1', fontSize: '0.9rem', background: '#09090b', padding: '12px 18px', borderRadius: '8px', border: '1px solid #27272a', flexWrap: 'wrap' }}>
            <span>Executed <strong>{result.numPaths?.toLocaleString()}</strong> paths ({result.numSteps} steps) in <strong style={{ color: '#4ade80' }}>{result.executionTimeMs?.toFixed(2)} ms</strong> (native multi-threaded C++)</span>
            <span>• Average Transaction Costs Paid: <strong style={{ color: '#ffffff' }}>${result.summaryStatistics.avgTxCosts?.toFixed(4)}</strong></span>
          </div>

          {/* Histogram Chart */}
          {histogramData && (
            <div className="card" style={{ padding: '1.5rem', border: '1px solid #27272a' }}>
              <h4 className="card-title" style={{ color: '#ffffff', marginBottom: '12px' }}>Hedge P&L Risk Distribution</h4>
              <div className="chart-container" style={{ height: '320px' }}>
                <Bar
                  data={histogramData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                      x: { title: { display: true, text: 'Final Portfolio P&L at Expiry ($)', color: '#cbd5e1' }, ticks: { color: '#cbd5e1' }, grid: { display: false } },
                      y: { title: { display: true, text: 'Path Frequency', color: '#cbd5e1' }, ticks: { color: '#cbd5e1' }, grid: { color: 'rgba(255, 255, 255, 0.08)' } }
                    }
                  }}
                />
              </div>
            </div>
          )}

          {/* Sample Paths Chart */}
          {samplePathsData && (
            <div className="card" style={{ padding: '1.5rem', border: '1px solid #27272a' }}>
              <h4 className="card-title" style={{ color: '#ffffff', marginBottom: '12px' }}>Sample Paths: Cumulative Hedging Tracking Error over Time</h4>
              <div className="chart-container" style={{ height: '320px' }}>
                <Line
                  data={samplePathsData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: true, labels: { color: '#cbd5e1' } } },
                    scales: {
                      x: { title: { display: true, text: 'Trading Days', color: '#cbd5e1' }, ticks: { color: '#cbd5e1' }, grid: { display: false } },
                      y: { title: { display: true, text: 'Tracking Error ($)', color: '#cbd5e1' }, ticks: { color: '#cbd5e1' }, grid: { color: 'rgba(255, 255, 255, 0.08)' } }
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
