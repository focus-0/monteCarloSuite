import React, { useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../apiConfig';
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

const DeltaHedgeSimulator = ({ result, loading, error }) => {
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
      <div className="card" style={{ marginBottom: '1.5rem', padding: '16px 20px' }}>
        <h3 className="card-title" style={{ margin: 0 }}>Discrete Delta-Hedging Simulator</h3>
        <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '6px 0 0 0' }}>
          Daily delta-hedging with transaction costs over Monte Carlo paths — configure parameters in the bar above and run.
        </p>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {!result && !loading && (
        <div className="card placeholder-card">
          <h3>Ready to Run Delta-Hedge Simulation</h3>
          <p>Set parameters in the config bar above and click <strong>Run Hedge</strong>.</p>
        </div>
      )}

      {loading && (
        <div className="card placeholder-card">
          <div className="spinner" style={{ margin: '0 auto 12px' }} />
          <p style={{ textAlign: 'center', color: '#60a5fa' }}>Simulating delta-hedged paths in C++…</p>
        </div>
      )}

      {result && result.summaryStatistics && !loading && (
        <div className="results-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
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
            <span>Executed {result.numPaths?.toLocaleString()} paths ({result.numSteps} steps) in <strong>{result.executionTimeMs?.toFixed(2)} ms</strong> in multithreaded C++</span>
            <span>• Average Tx Costs Paid: <strong>${result.summaryStatistics.avgTxCosts?.toFixed(4)}</strong></span>
          </div>

          {histogramData && (
            <div className="card chart-card" style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '1.5rem', borderRadius: '8px' }}>
              <h4 className="card-title">Hedge P&L Risk Distribution</h4>
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
