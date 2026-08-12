import React, { useState } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../apiConfig';

const OFFLINE_PRESETS = {
  AAPL: { symbol: 'AAPL', name: 'Apple Inc.', price: 224.30, volatility: 0.2350 },
  TSLA: { symbol: 'TSLA', name: 'Tesla Inc.', price: 218.50, volatility: 0.4820 },
  NVDA: { symbol: 'NVDA', name: 'NVIDIA Corp.', price: 128.20, volatility: 0.4210 },
  GOOGL: { symbol: 'GOOGL', name: 'Alphabet Inc.', price: 175.40, volatility: 0.2280 },
  MSFT: { symbol: 'MSFT', name: 'Microsoft Corp.', price: 415.60, volatility: 0.1980 }
};

const TickerLookup = ({ onMarketDataLoaded }) => {
  const [ticker, setTicker] = useState('AAPL');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(OFFLINE_PRESETS.AAPL);
  const [error, setError] = useState(null);

  const applyPreset = (presetKey) => {
    const preset = OFFLINE_PRESETS[presetKey];
    if (preset) {
      setTicker(presetKey);
      setData(preset);
      setError(null);
      if (onMarketDataLoaded) {
        onMarketDataLoaded(preset);
      }
    }
  };

  const handleFetch = async (e) => {
    e.preventDefault();
    const symbol = ticker.trim().toUpperCase();
    if (!symbol) return;

    // Check offline preset first
    if (OFFLINE_PRESETS[symbol]) {
      applyPreset(symbol);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await axios.get(`${API_BASE_URL}/api/market/${symbol}`);
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
        <h3 className="card-title">Stock Parameter Presets & Market Data</h3>
        <span className="badge badge-pulse">100% Offline Capable</span>
      </div>

      {/* Quick Offline Preset Buttons */}
      <div className="preset-chip-row" style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.8rem', color: '#94a3b8', alignSelf: 'center' }}>Presets:</span>
        {Object.keys(OFFLINE_PRESETS).map((symbol) => (
          <button
            key={symbol}
            type="button"
            className={`btn btn-sm ${ticker === symbol ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => applyPreset(symbol)}
            style={{ padding: '4px 10px', fontSize: '0.8rem' }}
          >
            {symbol}
          </button>
        ))}
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
            {loading ? 'Loading...' : 'Load Quote'}
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
            <span className="stat-label">Spot Price (S₀)</span>
            <span className="stat-value highlight">${data.price}</span>
          </div>
          <div className="data-stat">
            <span className="stat-label">Annualized Vol (σ)</span>
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
