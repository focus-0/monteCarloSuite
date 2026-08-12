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

  const steps = pathsData.numSteps || 100;
  const labels = Array.from({ length: steps + 1 }, (_, i) => `Step ${i}`);

  const colors = [
    '#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#84cc16'
  ];

  const datasets = pathsData.paths.slice(0, 35).map((path, idx) => ({
    label: `Path ${idx + 1}`,
    data: path,
    borderColor: colors[idx % colors.length] + '80', // semi-transparent
    borderWidth: 1.2,
    pointRadius: 0,
    tension: 0.1
  }));

  if (strikePrice) {
    datasets.push({
      label: `Strike (K = $${strikePrice})`,
      data: Array(steps + 1).fill(strikePrice),
      borderColor: '#ef4444',
      borderWidth: 2,
      borderDash: [6, 6],
      pointRadius: 0
    });
  }

  const data = { labels, datasets };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: {
        display: true,
        text: `Simulated Stock Price Trajectories (50 Sample Geometric Brownian Motion Paths)`,
        color: '#94a3b8',
        font: { size: 14, family: 'Inter' }
      }
    },
    scales: {
      y: {
        title: { display: true, text: 'Stock Price ($)', color: '#94a3b8' },
        ticks: { color: '#94a3b8' },
        grid: { color: 'rgba(255, 255, 255, 0.06)' }
      },
      x: {
        title: { display: true, text: 'Time Step (0 to T)', color: '#94a3b8' },
        ticks: { color: '#94a3b8', maxTicksLimit: 10 },
        grid: { display: false }
      }
    }
  };

  return (
    <div className="card chart-card">
      <div className="card-header-row">
        <h3 className="card-title">Stock Price Trajectories</h3>
        <span className="badge badge-info">{pathsData.paths.length} Sample Paths</span>
      </div>
      <div className="chart-container">
        <Line data={data} options={options} />
      </div>
    </div>
  );
};

export default PricePathsChart;
