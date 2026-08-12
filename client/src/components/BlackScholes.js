import React, { useState } from 'react';
import axios from 'axios';
import ParameterForm from './ParameterForm';
import TickerLookup from './TickerLookup';
import ResultsPanel from './ResultsPanel';
import HistoryTable from './HistoryTable';
import PerformanceChart from './charts/PerformanceChart';
import ConvergenceChart from './charts/ConvergenceChart';
import PricePathsChart from './charts/PricePathsChart';
import SensitivityChart from './charts/SensitivityChart';
import QuantAgentPanel from './QuantAgentPanel';
import DeltaHedgeSimulator from './DeltaHedgeSimulator';

const API_BASE_URL = (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
  ? '' 
  : (process.env.REACT_APP_API_URL || '');

const BlackScholes = () => {
  const [params, setParams] = useState({
    S0: 100,
    K: 100,
    r: 0.05,
    sigma: 0.2,
    T: 1,
    isCall: true,
    numTrials: 100000
  });

  const [optionType, setOptionType] = useState('european');
  const [activeTab, setActiveTab] = useState('simulator');
  const [resultSubView, setResultSubView] = useState('results');

  const [cppResult, setCppResult] = useState(null);
  const [greeksResult, setGreeksResult] = useState(null);
  const [pathsData, setPathsData] = useState(null);
  const [convergenceData, setConvergenceData] = useState([]);
  const [history] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleParamChange = (name, value) => {
    setParams((prev) => ({ ...prev, [name]: value }));
  };

  const handleMarketDataLoaded = (marketData) => {
    setParams((prev) => ({
      ...prev,
      S0: marketData.price,
      sigma: marketData.volatility
    }));
  };

  const handleRunSimulation = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError(null);

    const parsedParams = {
      ...params,
      S0: parseFloat(params.S0),
      K: parseFloat(params.K),
      r: parseFloat(params.r),
      sigma: parseFloat(params.sigma),
      T: parseFloat(params.T),
      numTrials: parseInt(params.numTrials),
      isCall: Boolean(params.isCall)
    };

    try {
      const cppEndpoint = optionType === 'asian' ? '/api/asian-option' : '/api/black-scholes/cpp';
      const cppRes = await axios.post(`${API_BASE_URL}${cppEndpoint}`, {
        ...parsedParams,
        validateWithAnalytical: optionType === 'european'
      });
      setCppResult(cppRes.data);

      axios.post(`${API_BASE_URL}/api/greeks`, parsedParams)
        .then(res => setGreeksResult(res.data))
        .catch(err => console.error('Greeks fetch failed:', err));

      axios.post(`${API_BASE_URL}/api/price-paths`, { S0: parsedParams.S0, r: parsedParams.r, sigma: parsedParams.sigma, T: parsedParams.T })
        .then(res => setPathsData(res.data))
        .catch(err => console.error('Paths fetch failed:', err));

      const trialSteps = [1000, 5000, 10000, 50000, 100000];
      const convData = [];
      for (const t of trialSteps) {
        try {
          const res = await axios.post(`${API_BASE_URL}/api/black-scholes/cpp`, { ...parsedParams, numTrials: t });
          convData.push({ trials: t, price: res.data.optionPrice, confidence: res.data.confidence });
        } catch (convErr) {
          // ignore step failure
        }
      }
      setConvergenceData(convData);

    } catch (err) {
      console.error('Simulation error:', err);
      setError(err.response?.data?.error || err.message || 'Simulation execution failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadSimulation = (historyItem) => {
    if (historyItem.parameters) {
      setParams({
        S0: historyItem.parameters.S0 || 100,
        K: historyItem.parameters.K || 100,
        r: historyItem.parameters.r || 0.05,
        sigma: historyItem.parameters.sigma || 0.2,
        T: historyItem.parameters.T || 1,
        isCall: historyItem.parameters.isCall !== undefined ? historyItem.parameters.isCall : true,
        numTrials: historyItem.parameters.numTrials || 100000
      });
      if (historyItem.simulationType) {
        setOptionType(historyItem.simulationType.toLowerCase());
      }
      setActiveTab('simulator');
    }
  };

  return (
    <div className="monte-carlo-dashboard">
      <nav className="dashboard-nav">
        <div className="nav-brand">
          <h2>MonteCarloSuite</h2>
        </div>
        <div className="nav-tabs">
          <button
            className={`tab-btn ${activeTab === 'simulator' ? 'active' : ''}`}
            onClick={() => setActiveTab('simulator')}
          >
            📊 Option Simulator
          </button>
          <button
            className={`tab-btn ${activeTab === 'delta-hedge' ? 'active' : ''}`}
            onClick={() => setActiveTab('delta-hedge')}
          >
            🛡️ Delta-Hedge Simulator
          </button>
          <button
            className={`tab-btn ${activeTab === 'benchmark' ? 'active' : ''}`}
            onClick={() => setActiveTab('benchmark')}
          >
            ⚡ Speed Benchmark
          </button>
          <button
            className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            📜 History
          </button>
        </div>
      </nav>

      {error && <div className="error-banner global-error">{error}</div>}

      <div className="dashboard-content">
        {activeTab === 'simulator' && (
          <div className="grid-two-col">
            <div className="col-left">
              <TickerLookup onMarketDataLoaded={handleMarketDataLoaded} />
              <ParameterForm
                params={params}
                onChange={handleParamChange}
                onSubmit={handleRunSimulation}
                loading={loading}
                optionType={optionType}
                setOptionType={setOptionType}
              />
            </div>
            <div className="col-right">
              {cppResult ? (
                <>
                  <div className="subview-pills" style={{ display: 'flex', gap: '8px', marginBottom: '16px', background: '#050811', padding: '6px', borderRadius: '8px', border: '1px solid #1e293b' }}>
                    <button
                      className={`tab-btn ${resultSubView === 'results' ? 'active' : ''}`}
                      onClick={() => setResultSubView('results')}
                      style={{ fontSize: '0.85rem', padding: '6px 12px' }}
                    >
                      📊 Fair Value & Greeks
                    </button>
                    <button
                      className={`tab-btn ${resultSubView === 'paths' ? 'active' : ''}`}
                      onClick={() => setResultSubView('paths')}
                      style={{ fontSize: '0.85rem', padding: '6px 12px' }}
                    >
                      📈 Trajectories & Accuracy
                    </button>
                    <button
                      className={`tab-btn ${resultSubView === 'agent' ? 'active' : ''}`}
                      onClick={() => setResultSubView('agent')}
                      style={{ fontSize: '0.85rem', padding: '6px 12px' }}
                    >
                      🤖 AI Risk Analyst
                    </button>
                    <button
                      className={`tab-btn ${resultSubView === 'sensitivity' ? 'active' : ''}`}
                      onClick={() => setResultSubView('sensitivity')}
                      style={{ fontSize: '0.85rem', padding: '6px 12px' }}
                    >
                      📉 Sensitivity Surface
                    </button>
                  </div>

                  {resultSubView === 'results' && (
                    <ResultsPanel
                      cppResult={cppResult}
                      greeksResult={greeksResult}
                      optionType={optionType}
                    />
                  )}

                  {resultSubView === 'paths' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <PricePathsChart pathsData={pathsData} strikePrice={params.K} />
                      <ConvergenceChart convergenceData={convergenceData} />
                    </div>
                  )}

                  {resultSubView === 'agent' && (
                    <QuantAgentPanel simulationParams={params} />
                  )}

                  {resultSubView === 'sensitivity' && (
                    <SensitivityChart baseParams={params} />
                  )}
                </>
              ) : (
                <div className="card placeholder-card">
                  <h3>Ready to Run Simulation</h3>
                  <p>Configure option parameters on the left or select a stock preset to auto-fill volatility.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'delta-hedge' && (
          <div className="single-col">
            <DeltaHedgeSimulator baseParams={params} />
          </div>
        )}

        {activeTab === 'benchmark' && (
          <div className="single-col">
            <PerformanceChart baseParams={params} />
          </div>
        )}

        {activeTab === 'history' && (
          <div className="single-col">
            <HistoryTable history={history} onLoadSimulation={handleLoadSimulation} />
          </div>
        )}
      </div>
    </div>
  );
};

export default BlackScholes;