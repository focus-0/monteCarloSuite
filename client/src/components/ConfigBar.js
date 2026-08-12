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

const PRESET_KEYS = Object.keys(OFFLINE_PRESETS);

function ConfigField({ label, children }) {
  return (
    <div className="config-field">
      <label className="config-label">{label}</label>
      {children}
    </div>
  );
}

const ConfigBar = ({
  activeTab,
  symbol,
  onSymbolChange,
  onMarketDataLoaded,
  params,
  onParamChange,
  optionType,
  setOptionType,
  onRunSimulation,
  simulationLoading,
  hedgeParams,
  onHedgeParamChange,
  onRunHedge,
  hedgeLoading
}) => {
  const [tickerLoading, setTickerLoading] = useState(false);
  const [tickerError, setTickerError] = useState(null);

  const handleParamChange = (e) => {
    const { name, value, type, checked } = e.target;
    onParamChange(name, type === 'checkbox' ? checked : value);
  };

  const handleHedgeChange = (e) => {
    const { name, value, type, checked } = e.target;
    onHedgeParamChange(name, type === 'checkbox' ? checked : value);
  };

  const applyPreset = (presetKey) => {
    const preset = OFFLINE_PRESETS[presetKey];
    if (!preset) return;
    onSymbolChange(presetKey);
    setTickerError(null);
    if (onMarketDataLoaded) onMarketDataLoaded(preset);
  };

  const handleLoadQuote = async (e) => {
    e.preventDefault();
    const sym = symbol.trim().toUpperCase();
    if (!sym) return;

    if (OFFLINE_PRESETS[sym]) {
      applyPreset(sym);
      return;
    }

    setTickerLoading(true);
    setTickerError(null);
    try {
      const response = await axios.get(`${API_BASE_URL}/api/market/${sym}`);
      onSymbolChange(sym);
      if (onMarketDataLoaded) onMarketDataLoaded(response.data);
    } catch (err) {
      setTickerError(err.response?.data?.error || 'Quote fetch failed');
    } finally {
      setTickerLoading(false);
    }
  };

  const isSimulator = activeTab === 'simulator';

  return (
    <div className="config-bar">
      <form className="config-bar-form" onSubmit={isSimulator ? onRunSimulation : onRunHedge}>
        <div className="config-row config-row-ticker">
          <span className="config-row-label">Ticker</span>
          <div className="config-ticker-controls">
            {PRESET_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                className={`config-preset-btn${symbol === key ? ' active' : ''}`}
                onClick={() => applyPreset(key)}
              >
                {key}
              </button>
            ))}
            <input
              type="text"
              value={symbol}
              onChange={(e) => onSymbolChange(e.target.value.toUpperCase())}
              placeholder="Symbol"
              className="form-control config-input config-input-symbol"
              aria-label="Stock symbol"
            />
            <button
              type="button"
              className="btn btn-secondary config-load-btn"
              onClick={handleLoadQuote}
              disabled={tickerLoading}
            >
              {tickerLoading ? '…' : 'Load quote'}
            </button>
          </div>
          {tickerError && <span className="config-inline-error">{tickerError}</span>}
        </div>

        <div className="config-row config-row-params">
          {isSimulator ? (
            <>
              <ConfigField label="Style">
                <select
                  value={optionType}
                  onChange={(e) => setOptionType(e.target.value)}
                  className="form-control config-input"
                >
                  <option value="european">European</option>
                  <option value="asian">Asian</option>
                </select>
              </ConfigField>
              <ConfigField label="Type">
                <select
                  name="isCall"
                  value={params.isCall ? 'true' : 'false'}
                  onChange={handleParamChange}
                  className="form-control config-input"
                >
                  <option value="true">Call</option>
                  <option value="false">Put</option>
                </select>
              </ConfigField>
              <ConfigField label="S₀">
                <input type="number" name="S0" step="0.01" value={params.S0} onChange={handleParamChange} className="form-control config-input" required />
              </ConfigField>
              <ConfigField label="K">
                <input type="number" name="K" step="0.01" value={params.K} onChange={handleParamChange} className="form-control config-input" required />
              </ConfigField>
              <ConfigField label="σ">
                <input type="number" name="sigma" step="0.001" value={params.sigma} onChange={handleParamChange} className="form-control config-input" required />
              </ConfigField>
              <ConfigField label="r">
                <input type="number" name="r" step="0.001" value={params.r} onChange={handleParamChange} className="form-control config-input" required />
              </ConfigField>
              <ConfigField label="T (yr)">
                <input type="number" name="T" step="0.01" value={params.T} onChange={handleParamChange} className="form-control config-input" required />
              </ConfigField>
              <ConfigField label="Trials">
                <select name="numTrials" value={params.numTrials} onChange={handleParamChange} className="form-control config-input">
                  <option value={10000}>10,000</option>
                  <option value={100000}>100,000</option>
                  <option value={1000000}>1,000,000</option>
                  <option value={5000000}>5,000,000</option>
                </select>
              </ConfigField>
            </>
          ) : (
            <>
              <ConfigField label="S₀">
                <input type="number" name="S0" step="0.01" value={params.S0} onChange={handleParamChange} className="form-control config-input" required />
              </ConfigField>
              <ConfigField label="K">
                <input type="number" name="K" step="0.01" value={params.K} onChange={handleParamChange} className="form-control config-input" required />
              </ConfigField>
              <ConfigField label="σ">
                <input type="number" name="sigma" step="0.001" value={params.sigma} onChange={handleParamChange} className="form-control config-input" required />
              </ConfigField>
              <ConfigField label="r">
                <input type="number" name="r" step="0.001" value={params.r} onChange={handleParamChange} className="form-control config-input" required />
              </ConfigField>
              <ConfigField label="T (yr)">
                <input type="number" name="T" step="0.01" value={params.T} onChange={handleParamChange} className="form-control config-input" required />
              </ConfigField>
              <ConfigField label="Type">
                <select
                  name="isCall"
                  value={params.isCall ? 'true' : 'false'}
                  onChange={handleParamChange}
                  className="form-control config-input"
                >
                  <option value="true">Call</option>
                  <option value="false">Put</option>
                </select>
              </ConfigField>
              <ConfigField label="Paths">
                <select name="numTrials" value={hedgeParams.numTrials} onChange={handleHedgeChange} className="form-control config-input">
                  <option value={1000}>1,000</option>
                  <option value={5000}>5,000</option>
                  <option value={10000}>10,000</option>
                </select>
              </ConfigField>
              <ConfigField label="Rebalance">
                <select name="rebalanceFreq" value={hedgeParams.rebalanceFreq} onChange={handleHedgeChange} className="form-control config-input">
                  <option value={1}>Daily</option>
                  <option value={5}>Weekly</option>
                </select>
              </ConfigField>
              <ConfigField label="Tx cost (bps)">
                <select name="txCostPct" value={hedgeParams.txCostPct} onChange={handleHedgeChange} className="form-control config-input">
                  <option value={0.0}>0</option>
                  <option value={0.0005}>5</option>
                  <option value={0.001}>10</option>
                  <option value={0.0025}>25</option>
                </select>
              </ConfigField>
            </>
          )}
        </div>

        <div className="config-row config-row-actions">
          <button
            type="submit"
            className="btn btn-primary config-run-btn"
            disabled={isSimulator ? simulationLoading : hedgeLoading}
          >
            {isSimulator
              ? simulationLoading
                ? 'Running simulation…'
                : 'Run Monte Carlo Simulation'
              : hedgeLoading
                ? 'Running hedge…'
                : 'Run Delta-Hedging Simulation'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ConfigBar;
