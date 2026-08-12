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
        labels: { color: '#94a3b8', font: { family: 'Inter' } }
      },
      title: {
        display: true,
        text: 'Monte Carlo Price Error Narrowing Curve (Convergence Lab)',
        color: '#94a3b8',
        font: { size: 14, family: 'Inter' }
      }
    },
    scales: {
      y: {
        title: { display: true, text: 'Option Price ($)', color: '#94a3b8' },
        ticks: { color: '#94a3b8' },
        grid: { color: 'rgba(255, 255, 255, 0.06)' }
      },
      x: {
        title: { display: true, text: 'Number of Simulation Trials (N)', color: '#94a3b8' },
        ticks: { color: '#94a3b8' },
        grid: { color: 'rgba(255, 255, 255, 0.06)' }
      }
    }
  };

  return (
    <div className="card chart-card">
      <h3 className="card-title">Convergence Behavior</h3>
      <div className="chart-container">
        <Line data={data} options={options} />
      </div>
    </div>
  );
};

export default ConvergenceChart;
