import React, { useState } from 'react';
import axios from 'axios';

const TickerLookup = ({ onMarketDataLoaded }) => {
  const [ticker, setTicker] = useState('AAPL');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const handleFetch = async (e) => {
    e.preventDefault();
    if (!ticker.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const response = await axios.get(`/api/market/${ticker.trim()}`);
      setData(response.data);
      if (onMarketDataLoaded) {
        onMarketDataLoaded(response.data);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch market data');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card ticker-lookup-card">
      <div className="card-header-row">
        <h3 className="card-title">Live Market Ticker Lookup</h3>
        <span className="badge badge-pulse">Yahoo Finance Realized Vol</span>
      </div>

      <form onSubmit={handleFetch} className="ticker-form">
        <div className="ticker-input-group">
          <input
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="e.g. AAPL, TSLA, NVDA"
            className="form-control ticker-input"
          />
          <button type="submit" className="btn btn-secondary" disabled={loading}>
            {loading ? 'Fetching...' : '🔍 Fetch Quote'}
          </button>
        </div>
      </form>

      {error && <div className="error-banner">{error}</div>}

      {data && (
        <div className="market-data-grid">
          <div className="data-stat">
            <span className="stat-label">Asset</span>
            <span className="stat-value">{data.name} ({data.symbol})</span>
          </div>
          <div className="data-stat">
            <span className="stat-label">Current Price (S₀)</span>
            <span className="stat-value highlight">${data.price}</span>
          </div>
          <div className="data-stat">
            <span className="stat-label">252-Day Realized Vol (σ)</span>
            <span className="stat-value accent">{(data.volatility * 100).toFixed(2)}%</span>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={() => onMarketDataLoaded(data)}
          >
            Auto-fill Parameters
          </button>
        </div>
      )}
    </div>
  );
};

export default TickerLookup;
