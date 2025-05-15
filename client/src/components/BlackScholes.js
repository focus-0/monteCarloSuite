import React, { useState, useEffect } from 'react';
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
    numTrials: 10000,
    validateWithAnalytical: true
  });

  // State for results
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("Missing required parameters");
  
  // State for implementation status
  const [implementationStatus, setImplementationStatus] = useState({
    cpp_available: false,
    default_implementation: 'javascript',
    analytical_available: false
  });

  // State for active tab
  const [activeTab, setActiveTab] = useState('simulator');
  
  // State for history
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // State for simulation metadata
  const [simulationMeta, setSimulationMeta] = useState({
    name: '',
    description: '',
    tags: ''
  });

  // State for editing simulation
  const [editingSimulation, setEditingSimulation] = useState(null);
  const [isEditing, setIsEditing] = useState(false);

  // Check implementation status on component mount
  useEffect(() => {
    const checkImplementation = async () => {
      try {
        const response = await axios.get('/api/implementation-status');
        setImplementationStatus(response.data);
      } catch (err) {
        console.error('Error checking implementation status:', err);
      }
    };
    
    checkImplementation();
  }, []);

  // Fetch history when history tab is active
  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab]);

  // Fetch simulation history
  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const response = await axios.get('/api/history');
      setHistory(response.data);
    } catch (err) {
      console.error('Error fetching history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Handle input changes
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
  };

  // Handle metadata changes
  const handleMetaChange = (e) => {
    const { name, value } = e.target;
    setSimulationMeta({
      ...simulationMeta,
      [name]: value
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
      
      // Prepare tags as an array
      const tagsArray = simulationMeta.tags
        ? simulationMeta.tags.split(',').map(tag => tag.trim())
        : [];
      
      // Save to history
      await axios.post('/api/history', {
        simulationType: 'black-scholes',
        parameters: formData,
        result: response.data,
        name: simulationMeta.name || 'Black-Scholes Simulation',
        description: simulationMeta.description || '',
        tags: tagsArray
      });
    } catch (err) {
      setError('Error calculating option price. Please check your inputs and try again.');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load a simulation from history
  const loadSimulation = (simulation) => {
    setFormData(simulation.parameters);
    setResult(simulation.result);
    setSimulationMeta({
      name: simulation.name || '',
      description: simulation.description || '',
      tags: simulation.tags ? simulation.tags.join(', ') : ''
    });
    setActiveTab('simulator');
  };

  // Start editing a simulation
  const startEditing = (simulation) => {
    setEditingSimulation(simulation);
    setSimulationMeta({
      name: simulation.name || '',
      description: simulation.description || '',
      tags: simulation.tags ? simulation.tags.join(', ') : ''
    });
    setIsEditing(true);
  };

  // Save edited simulation
  const saveEditedSimulation = async () => {
    try {
      const tagsArray = simulationMeta.tags
        ? simulationMeta.tags.split(',').map(tag => tag.trim())
        : [];
      
      await axios.put(`/api/history/${editingSimulation._id}`, {
        name: simulationMeta.name,
        description: simulationMeta.description,
        tags: tagsArray
      });
      
      setIsEditing(false);
      setEditingSimulation(null);
      fetchHistory();
    } catch (err) {
      console.error('Error updating simulation:', err);
    }
  };

  // Cancel editing
  const cancelEditing = () => {
    setIsEditing(false);
    setEditingSimulation(null);
  };

  // Format validation status with color
  const formatValidationStatus = (isWithinConfidenceInterval) => {
    return isWithinConfidenceInterval ? 
      <span style={{ color: 'green' }}>PASS</span> : 
      <span style={{ color: 'red' }}>FAIL</span>;
  };

  // Format error percentage
  const formatErrorPercentage = (error) => {
    return (error * 100).toFixed(4) + '%';
  };

  // Chart data for visualization
  const chartData = result ? {
    labels: ['Option Price', 'Lower Bound', 'Upper Bound', ...(result.validation ? ['Analytical Price'] : [])],
    datasets: [{
      label: 'Option Price with 95% Confidence Interval',
      data: [
        result.optionPrice, 
        result.confidence.lower, 
        result.confidence.upper, 
        ...(result.validation ? [result.validation.analyticalPrice] : [])
      ],
      backgroundColor: 'rgba(75, 192, 192, 0.2)',
      borderColor: 'rgba(75, 192, 192, 1)',
      borderWidth: 1
    }]
  } : { labels: [], datasets: [] };

  // Format date for display
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  return (
    <div className="black-scholes-container">
      <div className="tabs">
        <button
          className={activeTab === 'simulator' ? 'active' : ''}
          onClick={() => setActiveTab('simulator')}
        >
          Option Calculator
        </button>
        <button
          className={activeTab === 'history' ? 'active' : ''}
          onClick={() => setActiveTab('history')}
        >
          Simulation History
        </button>
      </div>

      {activeTab === 'simulator' && (
        <div className="simulator-container">
          <div className="form-container">
            <h2>Black-Scholes Option Calculator</h2>
            <p className="implementation-info">
              Using {implementationStatus.default_implementation.toUpperCase()} implementation
              {implementationStatus.analytical_available && " with analytical validation"}
            </p>
            
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Stock Price (S<sub>0</sub>):</label>
                <input
                  type="number"
                  name="S0"
                  value={formData.S0}
                  onChange={handleChange}
                  step="0.01"
                  min="0.01"
                  required
                />
              </div>
              
              <div className="form-group">
                <label>Strike Price (K):</label>
                <input
                  type="number"
                  name="K"
                  value={formData.K}
                  onChange={handleChange}
                  step="0.01"
                  min="0.01"
                  required
                />
              </div>
              
              <div className="form-group">
                <label>Risk-free Rate (r):</label>
                <input
                  type="number"
                  name="r"
                  value={formData.r}
                  onChange={handleChange}
                  step="0.001"
                  required
                />
              </div>
              
              <div className="form-group">
                <label>Volatility (σ):</label>
                <input
                  type="number"
                  name="sigma"
                  value={formData.sigma}
                  onChange={handleChange}
                  step="0.01"
                  min="0.01"
                  required
                />
              </div>
              
              <div className="form-group">
                <label>Time to Maturity (T) in years:</label>
                <input
                  type="number"
                  name="T"
                  value={formData.T}
                  onChange={handleChange}
                  step="0.01"
                  min="0.01"
                  required
                />
              </div>
              
              <div className="form-group checkbox">
                <label>
                  <input
                    type="checkbox"
                    name="isCall"
                    checked={formData.isCall}
                    onChange={handleChange}
                  />
                  Call Option (unchecked for Put)
                </label>
              </div>
              
              <div className="form-group">
                <label>Number of Monte Carlo Trials:</label>
                <input
                  type="number"
                  name="numTrials"
                  value={formData.numTrials}
                  onChange={handleChange}
                  step="1000"
                  min="1000"
                  required
                />
              </div>
              
              <div className="form-group checkbox">
                <label>
                  <input
                    type="checkbox"
                    name="validateWithAnalytical"
                    checked={formData.validateWithAnalytical}
                    onChange={handleChange}
                  />
                  Validate with Analytical Solution
                </label>
              </div>
              
              <div className="form-group">
                <label>Simulation Name:</label>
                <input
                  type="text"
                  name="name"
                  value={simulationMeta.name}
                  onChange={handleMetaChange}
                  placeholder="My Black-Scholes Simulation"
                />
              </div>
              
              <div className="form-group">
                <label>Description:</label>
                <textarea
                  name="description"
                  value={simulationMeta.description}
                  onChange={handleMetaChange}
                  placeholder="Describe this simulation..."
                />
              </div>
              
              <div className="form-group">
                <label>Tags (comma-separated):</label>
                <input
                  type="text"
                  name="tags"
                  value={simulationMeta.tags}
                  onChange={handleMetaChange}
                  placeholder="options, call, finance"
                />
              </div>
              
              <button type="submit" disabled={loading}>
                {loading ? 'Calculating...' : 'Calculate Option Price'}
              </button>
            </form>
          </div>
          
          <div className="results-container">
            {error && <div className="error-message">{error}</div>}
            {result && (
              <div className="results">
                <h3>Results</h3>
                <div className="result-summary">
                  <p>
                    <strong>Option Price:</strong> ${result.optionPrice.toFixed(4)}
                  </p>
                  <p>
                    <strong>95% Confidence Interval:</strong>{' '}
                    ${result.confidence.lower.toFixed(4)} to ${result.confidence.upper.toFixed(4)}
                  </p>
                  <p>
                    <strong>Implementation:</strong> {result.implementation.toUpperCase()}
                  </p>
                  
                  {result.validation && (
                    <>
                      <h4>Model Validation</h4>
                      <p>
                        <strong>Analytical Price:</strong> ${result.validation.analyticalPrice.toFixed(4)}
                      </p>
                      <p>
                        <strong>Absolute Error:</strong> ${result.validation.absoluteError.toFixed(4)}
                      </p>
                      <p>
                        <strong>Relative Error:</strong> {formatErrorPercentage(result.validation.relativeError)}
                      </p>
                      <p>
                        <strong>Validation Status:</strong> {formatValidationStatus(result.validation.isWithinConfidenceInterval)}
                        {result.validation.isWithinConfidenceInterval ? 
                          ' (Analytical price is within Monte Carlo confidence interval)' : 
                          ' (Analytical price is outside Monte Carlo confidence interval)'}
                      </p>
                    </>
                  )}
                </div>
                
                <div className="chart-container">
                  <h4>Option Price Visualization</h4>
                  <Line
                    data={chartData}
                    options={{
                      responsive: true,
                      plugins: {
                        legend: {
                          position: 'top',
                        },
                        title: {
                          display: true,
                          text: 'Option Price with Confidence Interval',
                        },
                      },
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="history-container">
          <h2>Simulation History</h2>
          {isEditing && editingSimulation && (
            <div className="editing-form">
              <h3>Edit Simulation Details</h3>
              <div className="form-group">
                <label>Simulation Name:</label>
                <input
                  type="text"
                  name="name"
                  value={simulationMeta.name}
                  onChange={handleMetaChange}
                />
              </div>
              <div className="form-group">
                <label>Description:</label>
                <textarea
                  name="description"
                  value={simulationMeta.description}
                  onChange={handleMetaChange}
                />
              </div>
              <div className="form-group">
                <label>Tags (comma-separated):</label>
                <input
                  type="text"
                  name="tags"
                  value={simulationMeta.tags}
                  onChange={handleMetaChange}
                />
              </div>
              <div className="button-group">
                <button onClick={saveEditedSimulation}>Save</button>
                <button onClick={cancelEditing}>Cancel</button>
              </div>
            </div>
          )}
          
          {historyLoading ? (
            <p>Loading history...</p>
          ) : history.length === 0 ? (
            <p>No simulations found.</p>
          ) : (
            <div className="history-list">
              {history.map((item) => (
                <div className="history-item" key={item._id}>
                  <h3>{item.name}</h3>
                  <p className="timestamp">
                    Run on: {formatDate(item.createdAt)}
                  </p>
                  {item.description && (
                    <p className="description">{item.description}</p>
                  )}
                  <div className="parameters">
                    <p>
                      <strong>Stock Price:</strong> ${item.parameters.S0}
                    </p>
                    <p>
                      <strong>Strike Price:</strong> ${item.parameters.K}
                    </p>
                    <p>
                      <strong>Interest Rate:</strong> {item.parameters.r}
                    </p>
                    <p>
                      <strong>Volatility:</strong> {item.parameters.sigma}
                    </p>
                    <p>
                      <strong>Time to Maturity:</strong> {item.parameters.T} years
                    </p>
                    <p>
                      <strong>Option Type:</strong> {item.parameters.isCall ? 'Call' : 'Put'}
                    </p>
                    <p>
                      <strong>Monte Carlo Trials:</strong> {item.parameters.numTrials}
                    </p>
                  </div>
                  <div className="results-summary">
                    <p>
                      <strong>Option Price:</strong> ${item.result.optionPrice.toFixed(4)}
                    </p>
                    {item.result.validation && (
                      <p>
                        <strong>Validation:</strong> {item.result.validation.isWithinConfidenceInterval ? 'PASS' : 'FAIL'}
                        {' '}(Error: {formatErrorPercentage(item.result.validation.relativeError)})
                      </p>
                    )}
                  </div>
                  {item.tags && item.tags.length > 0 && (
                    <div className="tags">
                      {item.tags.map((tag, index) => (
                        <span key={index} className="tag">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="history-actions">
                    <button onClick={() => loadSimulation(item)}>Load</button>
                    <button onClick={() => startEditing(item)}>Edit</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BlackScholes; 