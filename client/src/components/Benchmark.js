import React, { useState } from 'react';
import axios from 'axios';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend } from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';

// Register ChartJS components
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend);

const Benchmark = () => {
  // State for form inputs
  const [formData, setFormData] = useState({
    S0: 100,
    K: 100,
    r: 0.05,
    sigma: 0.2,
    T: 1,
    isCall: true,
    numTrials: 1000000
  });

  // State for benchmark results
  const [benchmarkResults, setBenchmarkResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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
      const response = await axios.post('/api/benchmark', formData);
      setBenchmarkResults(response.data);
    } catch (err) {
      setError('Error running benchmark. Please check your inputs and try again.');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Prepare chart data for thread comparison
  const getThreadComparisonData = () => {
    if (!benchmarkResults || !benchmarkResults.cpp) return null;

    const threadCounts = Object.keys(benchmarkResults.cpp)
      .filter(threads => !benchmarkResults.cpp[threads].error)
      .sort((a, b) => parseInt(a) - parseInt(b));
    
    const executionTimes = threadCounts.map(threads => benchmarkResults.cpp[threads].statistics.avg);
    
    // Create a flat line for JavaScript execution time
    const jsExecutionTime = benchmarkResults.javascript.statistics.avg;
    const jsExecutionTimes = Array(threadCounts.length).fill(jsExecutionTime);

    return {
      labels: threadCounts,
      datasets: [
        {
          label: 'C++ Execution Time (ms)',
          data: executionTimes,
          backgroundColor: 'rgba(54, 162, 235, 0.5)',
          borderColor: 'rgba(54, 162, 235, 1)',
          borderWidth: 1
        },
        {
          label: 'JavaScript Execution Time (ms)',
          data: jsExecutionTimes,
          backgroundColor: 'rgba(255, 206, 86, 0.5)',
          borderColor: 'rgba(255, 206, 86, 1)',
          borderWidth: 1,
          borderDash: [5, 5]
        }
      ]
    };
  };

  // Prepare chart data for implementation comparison
  const getImplementationComparisonData = () => {
    if (!benchmarkResults || !benchmarkResults.javascript) return null;

    // Find the best C++ performance
    let bestCppTime = Infinity;
    let bestThreads = 0;
    
    if (benchmarkResults.cpp) {
      Object.entries(benchmarkResults.cpp).forEach(([threads, data]) => {
        if (!data.error && data.statistics && data.statistics.avg < bestCppTime) {
          bestCppTime = data.statistics.avg;
          bestThreads = threads;
        }
      });
    }

    return {
      labels: ['JavaScript', `C++ (${bestThreads} threads)`],
      datasets: [
        {
          label: 'Execution Time (ms)',
          data: [
            benchmarkResults.javascript.statistics.avg,
            bestCppTime === Infinity ? 0 : bestCppTime
          ],
          backgroundColor: [
            'rgba(255, 206, 86, 0.5)',
            'rgba(54, 162, 235, 0.5)'
          ],
          borderColor: [
            'rgba(255, 206, 86, 1)',
            'rgba(54, 162, 235, 1)'
          ],
          borderWidth: 1
        }
      ]
    };
  };

  // Chart options
  const lineOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: 'Performance by Thread Count'
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Execution Time (ms)'
        }
      },
      x: {
        title: {
          display: true,
          text: 'Thread Count'
        }
      }
    }
  };

  const barOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: 'JavaScript vs Best C++ Performance'
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Execution Time (ms)'
        }
      }
    }
  };

  const threadComparisonData = getThreadComparisonData();
  const implementationComparisonData = getImplementationComparisonData();

  // Find best C++ performance for summary
  const getBestCppPerformance = () => {
    if (!benchmarkResults || !benchmarkResults.cpp) return null;
    
    let bestTime = Infinity;
    let bestThreads = 0;
    
    Object.entries(benchmarkResults.cpp).forEach(([threads, data]) => {
      if (!data.error && data.statistics && data.statistics.avg < bestTime) {
        bestTime = data.statistics.avg;
        bestThreads = threads;
      }
    });
    
    return {
      time: bestTime,
      threads: bestThreads
    };
  };

  const bestCpp = benchmarkResults ? getBestCppPerformance() : null;

  return (
    <div className="benchmark-container">
      <h2>Performance Benchmarking</h2>
      <p>Compare execution times across different thread counts and between C++ and JavaScript implementations.</p>
      
      <div className="form-container">
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="S0">Initial Stock Price (S0):</label>
            <input
              type="number"
              id="S0"
              name="S0"
              value={formData.S0}
              onChange={handleChange}
              step="0.01"
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="K">Strike Price (K):</label>
            <input
              type="number"
              id="K"
              name="K"
              value={formData.K}
              onChange={handleChange}
              step="0.01"
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="r">Risk-free Rate (r):</label>
            <input
              type="number"
              id="r"
              name="r"
              value={formData.r}
              onChange={handleChange}
              step="0.001"
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="sigma">Volatility (σ):</label>
            <input
              type="number"
              id="sigma"
              name="sigma"
              value={formData.sigma}
              onChange={handleChange}
              step="0.01"
              min="0.01"
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="T">Time to Maturity (T) in years:</label>
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
            <label htmlFor="numTrials">Number of Monte Carlo Trials:</label>
            <input
              type="number"
              id="numTrials"
              name="numTrials"
              value={formData.numTrials}
              onChange={handleChange}
              min="1000"
              step="1000"
              required
            />
          </div>
          
          <button type="submit" disabled={loading}>
            {loading ? 'Running Benchmark...' : 'Run Benchmark'}
          </button>
        </form>
      </div>
      
      {error && <div className="error-message">{error}</div>}
      
      {loading && (
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Running benchmark across 1-16 threads. This may take a while...</p>
        </div>
      )}
      
      {benchmarkResults && (
        <div className="results-container">
          <h3>Benchmark Results</h3>
          
          <div className="result-summary">
            <p>JavaScript execution time: <strong>{benchmarkResults.javascript.statistics.avg.toFixed(2)} ms</strong> (min: {benchmarkResults.javascript.statistics.min.toFixed(2)} ms, max: {benchmarkResults.javascript.statistics.max.toFixed(2)} ms)</p>
            
            {bestCpp && bestCpp.time !== Infinity && (
              <>
                <p>Best C++ execution time: <strong>{bestCpp.time.toFixed(2)} ms</strong> with {bestCpp.threads} threads</p>
                <p>Performance ratio: JavaScript is <strong>{(benchmarkResults.javascript.statistics.avg / bestCpp.time).toFixed(2)}x</strong> slower than best C++ implementation</p>
              </>
            )}
          </div>
          
          <div className="charts-container">
            {threadComparisonData && (
              <div className="chart">
                <h4>Performance by Thread Count</h4>
                <Line data={threadComparisonData} options={lineOptions} />
              </div>
            )}
            
            {implementationComparisonData && (
              <div className="chart">
                <h4>JavaScript vs Best C++ Performance</h4>
                <Bar data={implementationComparisonData} options={barOptions} />
              </div>
            )}
          </div>
          
          <div className="detailed-results">
            <h4>Detailed Results</h4>
            <table>
              <thead>
                <tr>
                  <th>Implementation</th>
                  <th>Threads</th>
                  <th>Avg Time (ms)</th>
                  <th>Min Time (ms)</th>
                  <th>Max Time (ms)</th>
                  <th>Option Price</th>
                  <th>JS/C++ Ratio</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>JavaScript</td>
                  <td>N/A</td>
                  <td>{benchmarkResults.javascript.statistics.avg.toFixed(2)}</td>
                  <td>{benchmarkResults.javascript.statistics.min.toFixed(2)}</td>
                  <td>{benchmarkResults.javascript.statistics.max.toFixed(2)}</td>
                  <td>{benchmarkResults.javascript.runs[0].optionPrice.toFixed(6)}</td>
                  <td>1.00x</td>
                </tr>
                
                {benchmarkResults.cpp && Object.entries(benchmarkResults.cpp)
                  .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
                  .map(([threads, data]) => (
                    <tr key={threads}>
                      <td>C++</td>
                      <td>{threads}</td>
                      <td>{data.error ? 'Error' : data.statistics.avg.toFixed(2)}</td>
                      <td>{data.error ? 'Error' : data.statistics.min.toFixed(2)}</td>
                      <td>{data.error ? 'Error' : data.statistics.max.toFixed(2)}</td>
                      <td>{data.error ? 'N/A' : data.runs[0].optionPrice.toFixed(6)}</td>
                      <td>
                        {data.error ? 'N/A' : 
                          (benchmarkResults.javascript.statistics.avg / data.statistics.avg).toFixed(2) + 'x'}
                      </td>
                    </tr>
                  ))
                }
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Benchmark; 