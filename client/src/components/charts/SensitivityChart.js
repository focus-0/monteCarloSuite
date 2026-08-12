import React, { useState } from 'react';
import { Line } from 'react-chartjs-2';
import axios from 'axios';

const SensitivityChart = ({ baseParams }) => {
  const [sweepParam, setSweepParam] = useState('sigma');
  const [loading, setLoading] = useState(false);
  const [sweepData, setSweepData] = useState(null);

  const runSweep = async () => {
    setLoading(true);
    try {
      const steps = 10;
      const minVal = sweepParam === 'sigma' ? 0.05 : sweepParam === 'S0' ? baseParams.S0 * 0.7 : baseParams.K * 0.7;
      const maxVal = sweepParam === 'sigma' ? 0.60 : sweepParam === 'S0' ? baseParams.S0 * 1.3 : baseParams.K * 1.3;
      const stepSize = (maxVal - minVal) / steps;

      const points = [];
      for (let i = 0; i <= steps; i++) {
        const val = minVal + i * stepSize;
        const testParams = {
          ...baseParams,
          [sweepParam]: val,
          numTrials: 50000
        };

        const res = await axios.post('/api/black-scholes/cpp', testParams);
        points.push({ val: Number(val.toFixed(2)), price: res.data.optionPrice });
      }

      setSweepData(points);
    } catch (err) {
      console.error('Sweep error:', err);
    } finally {
      setLoading(false);
    }
  };

  const chartData = sweepData ? {
    labels: sweepData.map(p => p.val),
    datasets: [{
      label: `Option Price vs ${sweepParam === 'sigma' ? 'Volatility (σ)' : sweepParam === 'S0' ? 'Spot Price (S₀)' : 'Strike (K)'}`,
      data: sweepData.map(p => p.price),
      borderColor: '#10b981',
      backgroundColor: 'rgba(16, 185, 129, 0.1)',
      borderWidth: 2,
      fill: true,
      tension: 0.2
    }]
  } : null;

  return (
    <div className="card chart-card">
      <div className="card-header-row">
        <h3 className="card-title">Sensitivity Analysis & Parameter Sweeps</h3>
        <div className="sweep-controls">
          <select
            value={sweepParam}
            onChange={(e) => setSweepParam(e.target.value)}
            className="form-control form-control-sm"
          >
            <option value="sigma">Sweep Volatility (σ)</option>
            <option value="S0">Sweep Stock Price (S₀)</option>
            <option value="K">Sweep Strike Price (K)</option>
          </select>
          <button onClick={runSweep} className="btn btn-sm btn-primary" disabled={loading}>
            {loading ? 'Running...' : 'Run Sweep'}
          </button>
        </div>
      </div>

      {sweepData ? (
        <div className="chart-container">
          <Line
            data={chartData}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                title: { display: true, text: `Option Price Sensitivity vs ${sweepParam}`, color: '#94a3b8' }
              },
              scales: {
                y: { title: { display: true, text: 'Price ($)', color: '#94a3b8' }, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.06)' } },
                x: { title: { display: true, text: sweepParam, color: '#94a3b8' }, ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.06)' } }
              }
            }}
          />
        </div>
      ) : (
        <div className="placeholder-box">
          Select a parameter and click <strong>Run Sweep</strong> to visualize sensitivity curves.
        </div>
      )}
    </div>
  );
};

export default SensitivityChart;
