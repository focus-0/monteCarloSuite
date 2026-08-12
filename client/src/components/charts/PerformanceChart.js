import React, { useState } from 'react';
import axios from 'axios';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const API_BASE_URL = (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
  ? '' 
  : (process.env.REACT_APP_API_URL || '');

const PerformanceChart = ({ baseParams }) => {
  const [trials, setTrials] = useState(100000);
  const [cppTimeMs, setCppTimeMs] = useState(null);
  const [jsTimeMs, setJsTimeMs] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const runIndependentBenchmark = async () => {
    setLoading(true);
    setError(null);

    const testParams = {
      S0: baseParams?.S0 || 100,
      K: baseParams?.K || 100,
      r: baseParams?.r || 0.05,
      sigma: baseParams?.sigma || 0.2,
      T: baseParams?.T || 1,
      isCall: baseParams?.isCall !== undefined ? baseParams.isCall : true,
      numTrials: trials
    };

    try {
      const [cppRes, jsRes] = await Promise.all([
        axios.post(`${API_BASE_URL}/api/black-scholes/cpp`, testParams),
        axios.post(`${API_BASE_URL}/api/black-scholes/js`, testParams)
      ]);

      setCppTimeMs(cppRes.data.executionTimeMs);
      setJsTimeMs(jsRes.data.executionTimeMs);
    } catch (err) {
      console.error('Independent Benchmark Error:', err);
      setError('Benchmark execution failed');
    } finally {
      setLoading(false);
    }
  };

  const speedup = (cppTimeMs && jsTimeMs && cppTimeMs > 0) ? (jsTimeMs / cppTimeMs).toFixed(1) : null;

  const chartData = {
    labels: ['C++ Multithreaded Engine', 'Single-Threaded JavaScript Engine'],
    datasets: [
      {
        label: 'Execution Latency (ms)',
        data: [cppTimeMs || 0, jsTimeMs || 0],
        backgroundColor: ['rgba(16, 185, 129, 0.85)', 'rgba(239, 68, 68, 0.85)'],
        borderColor: ['#10b981', '#ef4444'],
        borderWidth: 1,
        borderRadius: 8
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: {
        display: true,
        text: `Side-by-Side Latency at N = ${trials.toLocaleString()} Trials`,
        color: '#94a3b8',
        font: { size: 14, family: 'Inter' }
      },
      tooltip: {
        callbacks: {
          label: (context) => ` ${context.raw.toFixed(2)} ms`
        }
      }
    },
    scales: {
      y: {
        title: { display: true, text: 'Time (milliseconds)', color: '#94a3b8' },
        ticks: { color: '#94a3b8' },
        grid: { color: 'rgba(255, 255, 255, 0.06)' }
      },
      x: {
        ticks: { color: '#f1f5f9', font: { family: 'Inter', weight: 'bold' } },
        grid: { display: false }
      }
    }
  };

  return (
    <div className="card chart-card">
      <div className="card-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <h3 className="card-title" style={{ margin: 0 }}>C++ vs JavaScript Benchmark Panel</h3>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '4px 0 0 0' }}>
            Run an independent side-by-side speed test comparing native C++ multithreading against V8 JavaScript.
          </p>
        </div>
        {speedup && <span className="badge badge-speedup">C++ is {speedup}x Faster</span>}
      </div>

      <div className="benchmark-controls" style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1.5rem', background: 'rgba(255, 255, 255, 0.03)', padding: '1rem', borderRadius: '8px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Trial Count (N)</label>
          <select
            value={trials}
            onChange={(e) => setTrials(Number(e.target.value))}
            className="form-control"
            style={{ width: '180px' }}
          >
            <option value={10000}>10,000 Trials</option>
            <option value={100000}>100,000 Trials</option>
            <option value={1000000}>1,000,000 Trials</option>
            <option value={5000000}>5,000,000 Trials</option>
          </select>
        </div>

        <button
          onClick={runIndependentBenchmark}
          className="btn btn-primary"
          disabled={loading}
          style={{ marginTop: 'auto', padding: '0.6rem 1.25rem', fontWeight: 600, cursor: 'pointer' }}
        >
          {loading ? '⚡ Running C++ vs JS Benchmark...' : '▶ Run C++ vs JS Benchmark'}
        </button>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: '1rem' }}>{error}</div>}

      {cppTimeMs !== null && jsTimeMs !== null ? (
        <>
          <div className="chart-container" style={{ height: '300px' }}>
            <Bar data={chartData} options={options} />
          </div>
          <div className="benchmark-stats" style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <div className="stat-pill success">
              C++ Execution: <strong>{cppTimeMs.toFixed(2)} ms</strong>
            </div>
            <div className="stat-pill danger">
              JS Execution: <strong>{jsTimeMs.toFixed(2)} ms</strong>
            </div>
            <div className="stat-pill highlight">
              Difference: <strong>{(jsTimeMs - cppTimeMs).toFixed(2)} ms saved</strong>
            </div>
          </div>
        </>
      ) : (
        <div className="placeholder-card" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
          <p>Click <strong>"Run C++ vs JS Benchmark"</strong> above to launch an independent side-by-side performance run.</p>
        </div>
      )}
    </div>
  );
};

export default PerformanceChart;
