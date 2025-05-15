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
  const [error, setError] = useState(null);
  
  // State for validation errors
  const [validationErrors, setValidationErrors] = useState({});
  
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

  // Validate form inputs
  const validateForm = () => {
    const errors = {};
    
    // Validate S0 (Stock Price)
    if (formData.S0 <= 0) {
      errors.S0 = 'Stock price must be positive';
    }
    
    // Validate K (Strike Price)
    if (formData.K <= 0) {
      errors.K = 'Strike price must be positive';
    }
    
    // Validate r (Interest Rate) - can be negative in real markets
    if (formData.r < -0.5 || formData.r > 1) {
      errors.r = 'Interest rate should typically be between -0.5 and 1 (or -50% to 100%)';
    }
    
    // Validate sigma (Volatility)
    if (formData.sigma <= 0) {
      errors.sigma = 'Volatility must be positive';
    } else if (formData.sigma > 1) {
      errors.sigma = 'Volatility is unusually high (>100%), please verify';
    }
    
    // Validate T (Time to Maturity)
    if (formData.T <= 0) {
      errors.T = 'Time to maturity must be positive';
    } else if (formData.T > 30) {
      errors.T = 'Time to maturity is unusually long (>30 years), please verify';
    }
    
    // Validate numTrials (Number of Monte Carlo Trials)
    if (formData.numTrials < 1000) {
      errors.numTrials = 'At least 1000 trials recommended for accuracy';
    } else if (formData.numTrials > 10000000) {
      errors.numTrials = 'Very large number of trials may cause performance issues';
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle input changes
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === 'checkbox' ? checked : value;
    
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : value
    });
    
    // Clear validation error for this field when it's changed
    if (validationErrors[name]) {
      setValidationErrors({
        ...validationErrors,
        [name]: null
      });
    }
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
    
    // Validate inputs before submission
    if (!validateForm()) {
      setError('Please correct the input errors before calculating');
      return;
    }
    
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
      if (err.response && err.response.data && err.response.data.error) {
        setError(`Error: ${err.response.data.error}`);
      } else {
        setError('Error calculating option price. Please check your inputs and try again.');
      }
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
      <span className="validation-success">PASS</span> : 
      <span className="validation-error">FAIL</span>;
  };

  // Format error percentage
  const formatErrorPercentage = (error) => {
    const errorPercentage = (error * 100).toFixed(4);
    let className = 'validation-success';
    
    if (error > 0.05) {
      className = 'validation-error';
    } else if (error > 0.01) {
      className = 'validation-warning';
    }
    
    return <span className={className}>{errorPercentage}%</span>;
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
        <div className="two-column-layout">
          <div className="input-column">
            <h2>Black-Scholes Option Calculator</h2>
            <p className="implementation-info">
              Using {implementationStatus.default_implementation.toUpperCase()} implementation
              {implementationStatus.analytical_available && " with analytical validation"}
            </p>
            
            <form onSubmit={handleSubmit}>
              <div className={`form-group ${validationErrors.S0 ? 'has-error' : ''}`}>
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
                {validationErrors.S0 && <div className="error-message">{validationErrors.S0}</div>}
              </div>
              
              <div className={`form-group ${validationErrors.K ? 'has-error' : ''}`}>
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
                {validationErrors.K && <div className="error-message">{validationErrors.K}</div>}
              </div>
              
              <div className={`form-group ${validationErrors.r ? 'has-error' : ''}`}>
                <label>Risk-free Rate (r):</label>
                <input
                  type="number"
                  name="r"
                  value={formData.r}
                  onChange={handleChange}
                  step="0.001"
                  required
                />
                {validationErrors.r && <div className="error-message">{validationErrors.r}</div>}
              </div>
              
              <div className={`form-group ${validationErrors.sigma ? 'has-error' : ''}`}>
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
                {validationErrors.sigma && <div className="error-message">{validationErrors.sigma}</div>}
              </div>
              
              <div className={`form-group ${validationErrors.T ? 'has-error' : ''}`}>
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
                {validationErrors.T && <div className="error-message">{validationErrors.T}</div>}
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
              
              <div className={`form-group ${validationErrors.numTrials ? 'has-error' : ''}`}>
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
                {validationErrors.numTrials && <div className="error-message">{validationErrors.numTrials}</div>}
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
              
              <button type="submit" className="run-button" disabled={loading}>
                {loading ? 'Running Simulation...' : 'Run Simulation'}
              </button>
            </form>
          </div>
          
          <div className="results-column">
            {error && <div className="error-message">{error}</div>}
            {result ? (
              <div className="results">
                <h3>Simulation Results</h3>
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
            ) : (
              <div className="no-results">
                <h3>Simulation Results</h3>
                <p>Enter parameters on the left and click "Run Simulation" to see results here.</p>
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
            <div className="loading-indicator">
              <div className="spinner"></div>
              <p>Loading history...</p>
            </div>
          ) : history.length === 0 ? (
            <p className="no-history">No simulations found.</p>
          ) : (
            <div className="history-table-container">
              <table className="history-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Date</th>
                    <th>Option Type</th>
                    <th>Stock/Strike</th>
                    <th>Parameters</th>
                    <th>Option Price</th>
                    <th>Validation</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Sort history to show latest first */}
                  {[...history].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map((item) => (
                    <tr key={item._id} className="history-row">
                      <td>
                        <div className="simulation-name">{item.name}</div>
                        {item.description && (
                          <div className="description-tooltip">
                            <span className="info-icon">ⓘ</span>
                            <div className="tooltip-content">{item.description}</div>
                          </div>
                        )}
                      </td>
                      <td>{formatDate(item.createdAt)}</td>
                      <td>{item.parameters.isCall ? 'Call' : 'Put'}</td>
                      <td>${item.parameters.S0} / ${item.parameters.K}</td>
                      <td>
                        <div className="parameter-cell">
                          <div>r: {item.parameters.r}</div>
                          <div>σ: {item.parameters.sigma}</div>
                          <div>T: {item.parameters.T}y</div>
                          <div>Trials: {item.parameters.numTrials.toLocaleString()}</div>
                        </div>
                      </td>
                      <td>${item.result.optionPrice.toFixed(4)}</td>
                      <td>
                        {item.result.validation ? (
                          <div className="validation-cell">
                            {item.result.validation.isWithinConfidenceInterval ? (
                              <span className="validation-success">PASS</span>
                            ) : (
                              <span className="validation-error">FAIL</span>
                            )}
                            <span> (Error: {formatErrorPercentage(item.result.validation.relativeError)})</span>
                          </div>
                        ) : (
                          <span>—</span>
                        )}
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button className="load-button" onClick={() => loadSimulation(item)}>Load</button>
                          <button className="edit-button" onClick={() => startEditing(item)}>Edit</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BlackScholes; 