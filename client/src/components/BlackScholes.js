import React, { useState } from 'react';
import axios from 'axios';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import { Line } from 'react-chartjs-2';

// Register ChartJS components
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const BlackScholes = () => {
  // State for form inputs
  const [formData, setFormData] = useState({
    S0: 100,
    K: 100,
    r: 0.05,
    sigma: 0.2,
    T: 1,
    isCall: true,
    numTrials: 10000
  });

  // State for results
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("Missing required parameters");

  // Handle input changes
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await axios.post('/api/black-scholes', formData);
      setResult(response.data);
    } catch (err) {
      setError('Error calculating option price. Please check your inputs and try again.');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Chart data for visualization
  const chartData = result ? {
    labels: ['Option Price', 'Lower Bound', 'Upper Bound'],
    datasets: [{
      label: 'Option Price with 95% Confidence Interval',
      data: [result.optionPrice, result.confidence.lower, result.confidence.upper],
      backgroundColor: 'rgba(75, 192, 192, 0.2)',
      borderColor: 'rgba(75, 192, 192, 1)',
      borderWidth: 1
    }]
  } : { labels: [], datasets: [] };

  return (
    <div>
      <div className="navbar">
        <div className="navbar-title">Monte Carlo Simulation Suite</div>
        <div className="navbar-links">
          <a href="#" className="active">Black-Scholes</a>
        </div>
      </div>

      <div className="content">
        <h1>Black-Scholes Option Pricing</h1>
        <p>This simulation uses Monte Carlo methods to price European options using the Black-Scholes model.</p>
        
        <div className="two-column-layout">
          <div className="input-column">
            <div className="option-form">
              <div className="form-group">
                <label htmlFor="S0">Initial Stock Price (S₀)</label>
                <input
                  type="number"
                  id="S0"
                  name="S0"
                  value={formData.S0}
                  onChange={handleChange}
                  step="0.01"
                  min="0.01"
                  required
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="K">Strike Price (K)</label>
                <input
                  type="number"
                  id="K"
                  name="K"
                  value={formData.K}
                  onChange={handleChange}
                  step="0.01"
                  min="0.01"
                  required
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="r">Risk-Free Interest Rate (r)</label>
                <input
                  type="number"
                  id="r"
                  name="r"
                  value={formData.r}
                  onChange={handleChange}
                  step="0.001"
                  min="0"
                  max="1"
                  required
                />
                <div className="helper-text">Enter as a decimal (e.g., 0.05 for 5%)</div>
              </div>
              
              <div className="form-group">
                <label htmlFor="sigma">Volatility (σ)</label>
                <input
                  type="number"
                  id="sigma"
                  name="sigma"
                  value={formData.sigma}
                  onChange={handleChange}
                  step="0.01"
                  min="0.01"
                  max="2"
                  required
                />
                <div className="helper-text">Enter as a decimal (e.g., 0.2 for 20%)</div>
              </div>
              
              <div className="form-group">
                <label htmlFor="T">Time to Maturity (T) in years</label>
                <input
                  type="number"
                  id="T"
                  name="T"
                  value={formData.T}
                  onChange={handleChange}
                  step="0.01"
                  min="0.01"
                  required
                />
              </div>
              
              <div className="form-group checkbox-group">
                <label>
                  <input
                    type="checkbox"
                    name="isCall"
                    checked={formData.isCall}
                    onChange={handleChange}
                  />
                  Call Option (unchecked for Put Option)
                </label>
              </div>
              
              <div className="form-group">
                <label htmlFor="numTrials">Number of Trials</label>
                <input
                  type="number"
                  id="numTrials"
                  name="numTrials"
                  value={formData.numTrials}
                  onChange={handleChange}
                  step="1000"
                  min="1000"
                  max="100000"
                  required
                />
              </div>
              
              <button className="run-button" type="button" onClick={handleSubmit} disabled={loading}>
                {loading ? 'Calculating...' : 'Run Simulation'}
              </button>
            </div>
          </div>
          
          <div className="results-column">
            {error && (
              <div className="error-message">
                {error}
              </div>
            )}
            
            {result && (
              <div className="results">
                <h3>Results</h3>
                <p><strong>Option Type:</strong> {formData.isCall ? 'Call' : 'Put'}</p>
                <p><strong>Option Price:</strong> ${result.optionPrice.toFixed(4)}</p>
                <p><strong>95% Confidence Interval:</strong> ${result.confidence.lower.toFixed(4)} - ${result.confidence.upper.toFixed(4)}</p>
                
                <div className="chart-container">
                  <Line 
                    data={chartData} 
                    options={{
                      responsive: true,
                      plugins: {
                        title: { display: true, text: 'Option Price with Confidence Interval' }
                      }
                    }} 
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BlackScholes; 