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
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const ConvergenceChart = ({ convergenceData }) => {
  if (!convergenceData || convergenceData.length === 0) return null;

  const labels = convergenceData.map((d) => d.trials.toLocaleString());
  const prices = convergenceData.map((d) => d.price);
  const upperBounds = convergenceData.map((d) => d.confidence?.upper || d.price + 0.1);
  const lowerBounds = convergenceData.map((d) => d.confidence?.lower || d.price - 0.1);

  const data = {
    labels,
    datasets: [
      {
        label: 'Upper 95% Confidence Bound',
        data: upperBounds,
        borderColor: 'transparent',
        backgroundColor: 'rgba(59, 130, 246, 0.15)',
        fill: '+1',
        pointRadius: 0
      },
      {
        label: 'Lower 95% Confidence Bound',
        data: lowerBounds,
        borderColor: 'transparent',
        backgroundColor: 'transparent',
        pointRadius: 0
      },
      {
        label: 'Monte Carlo Estimate Price ($)',
        data: prices,
        borderColor: '#3b82f6',
        backgroundColor: '#3b82f6',
        borderWidth: 2,
        tension: 0.2,
        pointRadius: 4,
        pointHoverRadius: 6
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: { color: '#cbd5e1', font: { family: 'Inter', size: 12, weight: 600 } }
      },
      title: {
        display: false
      },
      tooltip: {
        backgroundColor: '#09090b',
        titleColor: '#60a5fa',
        bodyColor: '#ffffff',
        borderColor: '#27272a',
        borderWidth: 1,
        padding: 10
      }
    },
    scales: {
      y: {
        title: { display: true, text: 'Option Price ($)', color: '#cbd5e1', font: { size: 12, weight: 600 } },
        ticks: { color: '#cbd5e1' },
        grid: { color: 'rgba(255, 255, 255, 0.07)' }
      },
      x: {
        title: { display: true, text: 'Number of Simulation Trials (N)', color: '#cbd5e1', font: { size: 12, weight: 600 } },
        ticks: { color: '#cbd5e1' },
        grid: { color: 'rgba(255, 255, 255, 0.04)' }
      }
    }
  };

  return (
    <div className="card chart-card">
      <div className="card-header-row">
        <div>
          <h3 className="card-title" style={{ margin: 0 }}>Monte Carlo Convergence & Error Bounds</h3>
          <span className="subtitle">
            Demonstrates O(1/√N) standard error decay towards true analytical expectation
          </span>
        </div>
      </div>
      <div className="chart-container" style={{ height: '380px', width: '100%', marginTop: '10px' }}>
        <Line data={data} options={options} />
      </div>
    </div>
  );
};

export default ConvergenceChart;
