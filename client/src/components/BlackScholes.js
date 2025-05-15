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
    numTrials: 10000
  });

  // State for results
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("Missing required parameters");
  
  // State for implementation status
  const [implementationStatus, setImplementationStatus] = useState({
    cpp_available: false,
    default_implementation: 'javascript'
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

  // Format date for display
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  return (
    <div>
      <div className="navbar">
        <div className="navbar-title">Monte Carlo Simulation Suite</div>
        <div className="navbar-links">
          <a 
            href="#" 
            className={activeTab === 'simulator' ? 'active' : ''} 
            onClick={() => setActiveTab('simulator')}
          >
            Black-Scholes
          </a>
          <a 
            href="#" 
            className={activeTab === 'history' ? 'active' : ''} 
            onClick={() => setActiveTab('history')}
          >
            History
          </a>
        </div>
        <div className="implementation-status">
          {implementationStatus.cpp_available ? 
            <span className="badge cpp-available">C++ Available</span> : 
            <span className="badge js-only">JavaScript Only</span>
          }
        </div>
      </div>

      <div className="content">
        {activeTab === 'simulator' ? (
          <>
            <h1>Black-Scholes Option Pricing</h1>
            <p>This simulation uses Monte Carlo methods to price European options using the Black-Scholes model.</p>
            
            <div className="simulation-metadata">
              <div className="form-group">
                <label htmlFor="name">Simulation Name</label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={simulationMeta.name}
                  onChange={handleMetaChange}
                  placeholder="Enter a name for this simulation"
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="description">Description</label>
                <textarea
                  id="description"
                  name="description"
                  value={simulationMeta.description}
                  onChange={handleMetaChange}
                  placeholder="Add a description for this simulation"
                  rows="2"
                ></textarea>
              </div>
              
              <div className="form-group">
                <label htmlFor="tags">Tags</label>
                <input
                  type="text"
                  id="tags"
                  name="tags"
                  value={simulationMeta.tags}
                  onChange={handleMetaChange}
                  placeholder="Add tags separated by commas (e.g., tech, finance, high-volatility)"
                />
              </div>
            </div>
            
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
                    <p><strong>Implementation:</strong> <span className={result.implementation === 'cpp' ? 'cpp-impl' : 'js-impl'}>
                      {result.implementation === 'cpp' ? 'C++ (Faster)' : 'JavaScript'}
                    </span></p>
                    
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
          </>
        ) : (
          <div className="history-section">
            <h1>Simulation History</h1>
            <p>View, reload, and manage your past simulations.</p>
            
            {isEditing && editingSimulation && (
              <div className="edit-simulation-modal">
                <h3>Edit Simulation</h3>
                <div className="form-group">
                  <label htmlFor="edit-name">Name</label>
                  <input
                    type="text"
                    id="edit-name"
                    name="name"
                    value={simulationMeta.name}
                    onChange={handleMetaChange}
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="edit-description">Description</label>
                  <textarea
                    id="edit-description"
                    name="description"
                    value={simulationMeta.description}
                    onChange={handleMetaChange}
                    rows="3"
                  ></textarea>
                </div>
                
                <div className="form-group">
                  <label htmlFor="edit-tags">Tags</label>
                  <input
                    type="text"
                    id="edit-tags"
                    name="tags"
                    value={simulationMeta.tags}
                    onChange={handleMetaChange}
                    placeholder="Separate tags with commas"
                  />
                </div>
                
                <div className="edit-buttons">
                  <button className="save-button" onClick={saveEditedSimulation}>Save</button>
                  <button className="cancel-button" onClick={cancelEditing}>Cancel</button>
                </div>
              </div>
            )}
            
            {historyLoading ? (
              <div className="loading">Loading history...</div>
            ) : history.length === 0 ? (
              <div className="no-history">No simulation history found. Run some simulations to see them here.</div>
            ) : (
              <div className="history-list">
                <table className="history-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Date</th>
                      <th>Option Type</th>
                      <th>Stock/Strike</th>
                      <th>Result</th>
                      <th>Tags</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((item) => (
                      <tr key={item._id}>
                        <td className="simulation-name">{item.name || 'Untitled'}</td>
                        <td>{formatDate(item.createdAt)}</td>
                        <td>{item.parameters.isCall ? 'Call' : 'Put'}</td>
                        <td>${parseFloat(item.parameters.S0).toFixed(2)} / ${parseFloat(item.parameters.K).toFixed(2)}</td>
                        <td>${parseFloat(item.result.optionPrice).toFixed(4)}</td>
                        <td>
                          <div className="tags-container">
                            {item.tags && item.tags.map((tag, index) => (
                              <span key={index} className="tag">{tag}</span>
                            ))}
                          </div>
                        </td>
                        <td className="action-buttons">
                          <button 
                            className="load-button" 
                            onClick={() => loadSimulation(item)}
                          >
                            Load
                          </button>
                          <button 
                            className="edit-button" 
                            onClick={() => startEditing(item)}
                          >
                            Edit
                          </button>
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
    </div>
  );
};

export default BlackScholes; 