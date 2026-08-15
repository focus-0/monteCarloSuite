import React from 'react';
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

const PricePathsChart = ({ pathsData, strikePrice }) => {
  if (!pathsData || !pathsData.paths || pathsData.paths.length === 0) return null;

  const paths = pathsData.paths;
  const numSteps = paths[0].length - 1 || pathsData.numSteps || 100;
  const labels = Array.from({ length: numSteps + 1 }, (_, i) => `t = ${(i / numSteps).toFixed(2)}`);

  // Calculate Mean Path across all trajectories
  const meanPath = new Array(numSteps + 1).fill(0);
  paths.forEach((path) => {
    path.forEach((val, stepIdx) => {
      meanPath[stepIdx] += val / paths.length;
    });
  });

  // Calculate dynamic zoomed Y-axis bounds (1st to 99th percentile to avoid outlier distortion)
  const allValues = [];
  paths.slice(0, 40).forEach((path) => {
    path.forEach((val) => allValues.push(val));
  });
  if (strikePrice) allValues.push(Number(strikePrice));

  allValues.sort((a, b) => a - b);
  const p1 = allValues[Math.floor(allValues.length * 0.01)] || allValues[0];
  const p99 = allValues[Math.floor(allValues.length * 0.99)] || allValues[allValues.length - 1];
  const padding = (p99 - p1) * 0.06 || 5;

  const yMin = Math.max(0, Math.floor(p1 - padding));
  const yMax = Math.ceil(p99 + padding);

  const colors = [
    '#38bdf8', '#818cf8', '#34d399', '#f472b6', '#fbbf24',
    '#60a5fa', '#a78bfa', '#4ade80', '#fb7185', '#38bdf8'
  ];

  // Map individual sample paths with translucent colors
  const datasets = paths.slice(0, 35).map((path, idx) => ({
    label: `Path ${idx + 1}`,
    data: path,
    borderColor: colors[idx % colors.length] + '55', // semi-transparent glow
    borderWidth: 1.2,
    pointRadius: 0,
    tension: 0.15
  }));

  // Add highlighted Mean Expected Path
  datasets.push({
    label: `Mean Expected Path ($${meanPath[numSteps].toFixed(2)})`,
    data: meanPath,
    borderColor: '#ffffff',
    borderWidth: 2.2,
    pointRadius: 0,
    tension: 0.15,
    order: 0
  });

  // Add Strike Price Reference Line
  if (strikePrice) {
    datasets.push({
      label: `Strike Price (K = $${strikePrice})`,
      data: Array(numSteps + 1).fill(strikePrice),
      borderColor: '#ef4444',
      borderWidth: 2,
      borderDash: [6, 4],
      pointRadius: 0,
      order: 1
    });
  }

  const data = { labels, datasets };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: {
          color: '#cbd5e1',
          font: { size: 11, family: 'Inter' },
          filter: (item) => item.text && (item.text.includes('Mean') || item.text.includes('Strike'))
        }
      },
      tooltip: {
        mode: 'nearest',
        intersect: false,
        backgroundColor: '#09090b',
        titleColor: '#60a5fa',
        bodyColor: '#ffffff',
        borderColor: '#27272a',
        borderWidth: 1,
        padding: 10,
        callbacks: {
          label: (context) => `${context.dataset.label}: $${Number(context.raw).toFixed(2)}`
        }
      }
    },
    scales: {
      y: {
        min: yMin,
        max: yMax,
        title: { display: true, text: 'Stock Price ($)', color: '#cbd5e1', font: { size: 12, weight: 600 } },
        ticks: {
          color: '#cbd5e1',
          callback: (value) => `$${value.toFixed(0)}`
        },
        grid: { color: 'rgba(255, 255, 255, 0.07)' }
      },
      x: {
        title: { display: true, text: 'Time to Maturity (0 to T)', color: '#cbd5e1', font: { size: 12, weight: 600 } },
        ticks: { color: '#cbd5e1', maxTicksLimit: 11 },
        grid: { color: 'rgba(255, 255, 255, 0.04)' }
      }
    }
  };

  return (
    <div className="card chart-card">
      <div className="card-header-row">
        <div>
          <h3 className="card-title" style={{ margin: 0 }}>Stochastic Stock Price Trajectories</h3>
          <span className="subtitle">
            Geometric Brownian Motion (GBM) diffusion paths with Antithetic Variates
          </span>
        </div>
        <span className="badge badge-info">{pathsData.paths.length} Simulated Paths</span>
      </div>
      <div className="chart-container" style={{ height: '420px', width: '100%', marginTop: '10px' }}>
        <Line data={data} options={options} />
      </div>
    </div>
  );
};

export default PricePathsChart;
