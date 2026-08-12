import React from 'react';

const ParameterForm = ({ params, onChange, onSubmit, loading, optionType, setOptionType }) => {
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    onChange(name, type === 'checkbox' ? checked : value);
  };

  return (
    <div className="card parameter-form-card">
      <h3 className="card-title">Option Parameters</h3>
      <form onSubmit={onSubmit}>
        <div className="form-group-row">
          <div className="form-group">
            <label htmlFor="optionType">Option Style</label>
            <select
              id="optionType"
              value={optionType}
              onChange={(e) => setOptionType(e.target.value)}
              className="form-control"
            >
              <option value="european">European (Standard)</option>
              <option value="asian">Asian (Path Average)</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="isCall">Option Type</label>
            <select
              id="isCall"
              name="isCall"
              value={params.isCall}
              onChange={handleChange}
              className="form-control"
            >
              <option value={true}>Call Option</option>
              <option value={false}>Put Option</option>
            </select>
          </div>
        </div>

        <div className="form-group-row">
          <div className="form-group">
            <label htmlFor="S0">Stock Price (S₀)</label>
            <input
              type="number"
              id="S0"
              name="S0"
              step="0.01"
              value={params.S0}
              onChange={handleChange}
              className="form-control"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="K">Strike Price (K)</label>
            <input
              type="number"
              id="K"
              name="K"
              step="0.01"
              value={params.K}
              onChange={handleChange}
              className="form-control"
              required
            />
          </div>
        </div>

        <div className="form-group-row">
          <div className="form-group">
            <label htmlFor="sigma">Volatility (σ)</label>
            <input
              type="number"
              id="sigma"
              name="sigma"
              step="0.001"
              value={params.sigma}
              onChange={handleChange}
              className="form-control"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="r">Risk-Free Rate (r)</label>
            <input
              type="number"
              id="r"
              name="r"
              step="0.001"
              value={params.r}
              onChange={handleChange}
              className="form-control"
              required
            />
          </div>
        </div>

        <div className="form-group-row">
          <div className="form-group">
            <label htmlFor="T">Time to Expiry (T years)</label>
            <input
              type="number"
              id="T"
              name="T"
              step="0.01"
              value={params.T}
              onChange={handleChange}
              className="form-control"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="numTrials">Trials Count (N)</label>
            <select
              id="numTrials"
              name="numTrials"
              value={params.numTrials}
              onChange={handleChange}
              className="form-control"
            >
              <option value={10000}>10,000 (Fast)</option>
              <option value={100000}>100,000 (Standard)</option>
              <option value={1000000}>1,000,000 (High Precision)</option>
              <option value={5000000}>5,000,000 (Stress Benchmark)</option>
            </select>
          </div>
        </div>

        <button type="submit" className="btn btn-primary btn-submit" disabled={loading}>
          {loading ? (
            <span className="spinner-container">
              <span className="spinner"></span> Running Simulation...
            </span>
          ) : (
            '⚡ Run Monte Carlo Simulation'
          )}
        </button>
      </form>
    </div>
  );
};

export default ParameterForm;
