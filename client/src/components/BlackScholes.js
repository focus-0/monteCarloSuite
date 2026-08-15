import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import ConfigBar from './ConfigBar';
import ResultsPanel from './ResultsPanel';
import HistoryTable from './HistoryTable';
import ConvergenceChart from './charts/ConvergenceChart';
import PricePathsChart from './charts/PricePathsChart';
import QuantAgentPanel from './QuantAgentPanel';
import DeltaHedgeSimulator from './DeltaHedgeSimulator';

import { API_BASE_URL } from '../apiConfig';

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
  const [symbol, setSymbol] = useState('AAPL');
  const [hedgeParams, setHedgeParams] = useState({
    numTrials: 5000,
    numSteps: 252,
    rebalanceFreq: 1,
    txCostPct: 0.001
  });
  const [hedgeResult, setHedgeResult] = useState(null);
  const [hedgeLoading, setHedgeLoading] = useState(false);
  const [hedgeError, setHedgeError] = useState(null);

  const [optionType, setOptionType] = useState('european');
  const [activeTab, setActiveTab] = useState('simulator');
  const [resultSubView, setResultSubView] = useState('results');

  const [cppResult, setCppResult] = useState(null);
  const [jsResult, setJsResult] = useState(null);
  const [greeksResult, setGreeksResult] = useState(null);
  const [pathsData, setPathsData] = useState(null);
  const [convergenceData, setConvergenceData] = useState([]);

  // MongoDB History State
  const [history, setHistory] = useState([]);
  const [dbStatus, setDbStatus] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showAgentHint, setShowAgentHint] = useState(false);
  const [showNavMenu, setShowNavMenu] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const navMenuRef = useRef(null);

  // Fetch MongoDB history and database status
  const fetchDbStatus = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/api/history/status`);
      setDbStatus(res.data);
    } catch {
      setDbStatus({ connected: false, status: 'disconnected' });
    }
  };

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/api/history`);
      if (Array.isArray(res.data)) {
        setHistory(res.data);
      }
    } catch (err) {
      console.warn('Failed to fetch history:', err.message);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    fetchDbStatus();
    fetchHistory();
  }, []);

  const handleSaveToHistory = async () => {
    if (!cppResult && !hedgeResult) return;
    setSaveStatus('saving');

    const isHedge = activeTab === 'delta-hedge';
    const payload = {
      simulationType: isHedge ? 'delta-hedge' : optionType,
      symbol: symbol || 'AAPL',
      name: `${symbol || 'AAPL'} ${isHedge ? 'Delta-Hedge' : optionType.toUpperCase()} ($${params.K})`,
      parameters: isHedge ? { ...params, ...hedgeParams } : params,
      result: isHedge ? hedgeResult?.summaryStatistics || {} : cppResult
    };

    try {
      await axios.post(`${API_BASE_URL}/api/history`, payload);
      setSaveStatus('saved');
      fetchHistory();
      fetchDbStatus();
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) {
      console.error('Failed to save to MongoDB:', err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(null), 4000);
    }
  };

  const handleDeleteHistory = async (id) => {
    try {
      await axios.delete(`${API_BASE_URL}/api/history/${id}`);
      setHistory((prev) => prev.filter((item) => (item._id || item.id) !== id));
      fetchDbStatus();
    } catch (err) {
      console.error('Failed to delete history item:', err);
    }
  };

  const handleParamChange = (name, value) => {
    const parsed =
      name === 'isCall'
        ? value === true || value === 'true'
        : name === 'numTrials'
          ? parseInt(value, 10)
          : value;
    setParams((prev) => ({ ...prev, [name]: parsed }));
  };

  const handleMarketDataLoaded = (marketData) => {
    if (marketData.symbol) {
      setSymbol(marketData.symbol);
    }
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
    setJsResult(null);

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
      const cppPromise = axios.post(`${API_BASE_URL}${cppEndpoint}`, {
        ...parsedParams,
        validateWithAnalytical: optionType === 'european'
      });
      const jsPromise = optionType === 'european'
        ? axios.post(`${API_BASE_URL}/api/black-scholes/js`, parsedParams)
        : Promise.resolve(null);

      const [cppRes, jsRes] = await Promise.all([cppPromise, jsPromise]);
      setCppResult(cppRes.data);
      setJsResult(jsRes?.data ?? null);

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
        } catch {
          // ignore step failure
        }
      }
      setConvergenceData(convData);
      setShowAgentHint(true);

    } catch (err) {
      console.error('Simulation error:', err);
      setError(err.response?.data?.error || err.message || 'Simulation execution failed');
    } finally {
      setLoading(false);
    }
  };

  const handleHedgeParamChange = (name, value) => {
    const parsed =
      name === 'numTrials' || name === 'rebalanceFreq' || name === 'numSteps'
        ? parseInt(value, 10)
        : name === 'txCostPct'
          ? parseFloat(value)
          : value;
    setHedgeParams((prev) => ({ ...prev, [name]: parsed }));
  };

  const handleRunHedge = async (e) => {
    if (e) e.preventDefault();
    setHedgeLoading(true);
    setHedgeError(null);

    const payload = {
      S0: parseFloat(params.S0),
      K: parseFloat(params.K),
      r: parseFloat(params.r),
      sigma: parseFloat(params.sigma),
      T: parseFloat(params.T),
      isCall: Boolean(params.isCall),
      numTrials: parseInt(hedgeParams.numTrials, 10),
      numSteps: parseInt(hedgeParams.numSteps, 10),
      rebalanceFreq: parseInt(hedgeParams.rebalanceFreq, 10),
      txCostPct: parseFloat(hedgeParams.txCostPct)
    };

    try {
      const res = await axios.post(`${API_BASE_URL}/api/simulation/delta-hedge`, payload);
      setHedgeResult(res.data);
    } catch (err) {
      setHedgeError(err.response?.data?.error || err.message || 'Simulation failed');
    } finally {
      setHedgeLoading(false);
    }
  };

  const handleSubViewChange = (view) => {
    setResultSubView(view);
    if (view === 'agent') setShowAgentHint(false);
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
      if (historyItem.symbol) {
        setSymbol(historyItem.symbol);
      }
      if (historyItem.simulationType) {
        const type = historyItem.simulationType.toLowerCase();
        if (type === 'delta-hedge') {
          setActiveTab('delta-hedge');
        } else {
          setOptionType(type === 'black-scholes' ? 'european' : type === 'asian' ? 'asian' : type);
          setActiveTab('simulator');
        }
      }
      setShowHistoryModal(false);
    }
  };

  const openHistoryModal = () => {
    setShowNavMenu(false);
    fetchHistory();
    fetchDbStatus();
    setShowHistoryModal(true);
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (navMenuRef.current && !navMenuRef.current.contains(e.target)) {
        setShowNavMenu(false);
      }
    };
    if (showNavMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showNavMenu]);

  return (
    <div className="monte-carlo-dashboard">
      <nav className="dashboard-nav">
        <div className="nav-brand">
          <h2>MonteCarloSuite</h2>
        </div>
        <div className="nav-right">
          {/* Live MongoDB Status Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginRight: '12px' }}>
            <span
              style={{
                fontSize: '0.78rem',
                color: dbStatus?.connected ? '#4ade80' : '#64748b',
                background: dbStatus?.connected ? 'rgba(34, 197, 94, 0.1)' : '#0f172a',
                border: `1px solid ${dbStatus?.connected ? '#16a34a' : '#1e293b'}`,
                padding: '3px 8px',
                borderRadius: '12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px'
              }}
              title={dbStatus?.connected ? `Connected to MongoDB (${dbStatus.dbName})` : 'MongoDB offline'}
            >
              <span style={{ fontSize: '0.6rem' }}>{dbStatus?.connected ? '●' : '○'}</span>
              MongoDB: {dbStatus?.connected ? 'Online' : 'Offline'}
            </span>
          </div>

          <div className="nav-tabs">
            <button
              className={`tab-btn ${activeTab === 'simulator' ? 'active' : ''}`}
              onClick={() => setActiveTab('simulator')}
            >
              Option Simulator
            </button>
            <button
              className={`tab-btn ${activeTab === 'delta-hedge' ? 'active' : ''}`}
              onClick={() => setActiveTab('delta-hedge')}
            >
              Delta-Hedge Simulator
            </button>
          </div>
          <div className="nav-menu-wrap" ref={navMenuRef}>
            <button
              className="nav-menu-btn"
              onClick={() => setShowNavMenu((prev) => !prev)}
              aria-label="More options"
              aria-expanded={showNavMenu}
            >
              ⋮
            </button>
            {showNavMenu && (
              <div className="nav-menu-dropdown">
                <button className="nav-menu-item" onClick={openHistoryModal}>
                  Simulation History ({history.length})
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {error && <div className="error-banner global-error">{error}</div>}

      <ConfigBar
        activeTab={activeTab}
        symbol={symbol}
        onSymbolChange={setSymbol}
        onMarketDataLoaded={handleMarketDataLoaded}
        params={params}
        onParamChange={handleParamChange}
        optionType={optionType}
        setOptionType={setOptionType}
        onRunSimulation={handleRunSimulation}
        simulationLoading={loading}
        hedgeParams={hedgeParams}
        onHedgeParamChange={handleHedgeParamChange}
        onRunHedge={handleRunHedge}
        hedgeLoading={hedgeLoading}
      />

      <div className="dashboard-content">
        {activeTab === 'simulator' && (
          <div className="single-col">
            <div className="subview-pills" style={{ display: 'flex', gap: '8px', marginBottom: '16px', background: '#050811', padding: '6px', borderRadius: '8px', border: '1px solid #1e293b', flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  className={`tab-btn ${resultSubView === 'results' ? 'active' : ''}`}
                  onClick={() => handleSubViewChange('results')}
                  style={{ fontSize: '0.85rem', padding: '6px 12px' }}
                >
                  Fair Value & Greeks
                </button>
                <button
                  className={`tab-btn ${resultSubView === 'paths' ? 'active' : ''}`}
                  onClick={() => handleSubViewChange('paths')}
                  style={{ fontSize: '0.85rem', padding: '6px 12px' }}
                >
                  Trajectories & Accuracy
                </button>
                <button
                  className={`tab-btn ${resultSubView === 'agent' ? 'active' : ''}`}
                  onClick={() => handleSubViewChange('agent')}
                  style={{ fontSize: '0.85rem', padding: '6px 12px', position: 'relative' }}
                >
                  AI Risk Analyst
                  {showAgentHint && resultSubView !== 'agent' && (
                    <span style={{ marginLeft: '6px', fontSize: '0.7rem', color: '#60a5fa', fontWeight: 600 }}>← try this</span>
                  )}
                </button>

                {/* Save to MongoDB action button */}
                {cppResult && (
                  <button
                    className="btn btn-xs"
                    onClick={handleSaveToHistory}
                    disabled={saveStatus === 'saving'}
                    style={{
                      marginLeft: 'auto',
                      background: saveStatus === 'saved' ? '#15803d' : '#1e293b',
                      border: `1px solid ${saveStatus === 'saved' ? '#22c55e' : '#334155'}`,
                      color: saveStatus === 'saved' ? '#ffffff' : '#38bdf8',
                      fontSize: '0.8rem',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    {saveStatus === 'saving'
                      ? 'Saving…'
                      : saveStatus === 'saved'
                        ? '✓ Saved to DB'
                        : saveStatus === 'error'
                          ? '⚠ Save Failed (DB offline)'
                          : '💾 Save Run to MongoDB'}
                  </button>
                )}
              </div>

              {resultSubView === 'results' && (
                cppResult ? (
                  <ResultsPanel
                    cppResult={cppResult}
                    jsResult={jsResult}
                    greeksResult={greeksResult}
                    optionType={optionType}
                  />
                ) : (
                  <div className="card placeholder-card">
                    <h3>Ready to Run Simulation</h3>
                    <p>Configure parameters in the bar above, then click <strong>Run Simulation</strong>.</p>
                  </div>
                )
              )}

              {resultSubView === 'paths' && (
                cppResult ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <PricePathsChart pathsData={pathsData} strikePrice={params.K} />
                    <ConvergenceChart convergenceData={convergenceData} />
                  </div>
                ) : (
                  <div className="card placeholder-card">
                    <h3>Run a Simulation First</h3>
                    <p>Price trajectories and convergence charts appear after you run a simulation.</p>
                  </div>
                )
              )}

              {resultSubView === 'agent' && (
                cppResult ? (
                  <QuantAgentPanel simulationParams={params} symbol={symbol} />
                ) : (
                  <div className="card placeholder-card">
                    <h3>Run a Simulation First</h3>
                    <p>The AI Risk Analyst needs simulation parameters from a completed run.</p>
                  </div>
                )
              )}

          </div>
        )}

        {activeTab === 'delta-hedge' && (
          <div className="single-col">
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
              {hedgeResult && (
                <button
                  className="btn btn-xs"
                  onClick={handleSaveToHistory}
                  disabled={saveStatus === 'saving'}
                  style={{
                    background: saveStatus === 'saved' ? '#15803d' : '#1e293b',
                    border: `1px solid ${saveStatus === 'saved' ? '#22c55e' : '#334155'}`,
                    color: saveStatus === 'saved' ? '#ffffff' : '#38bdf8',
                    fontSize: '0.8rem',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  {saveStatus === 'saving'
                    ? 'Saving…'
                    : saveStatus === 'saved'
                      ? '✓ Saved to DB'
                      : saveStatus === 'error'
                        ? '⚠ Save Failed (DB offline)'
                        : '💾 Save Hedge to MongoDB'}
                </button>
              )}
            </div>
            <DeltaHedgeSimulator result={hedgeResult} loading={hedgeLoading} error={hedgeError} />
          </div>
        )}
      </div>

      {showHistoryModal && (
        <div className="modal-overlay" onClick={() => setShowHistoryModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '800px' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: '#f8fafc' }}>Simulation History</h3>
              <button
                className="modal-close-btn"
                onClick={() => setShowHistoryModal(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <HistoryTable
              history={history}
              loading={historyLoading}
              onLoadSimulation={handleLoadSimulation}
              onDeleteSimulation={handleDeleteHistory}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default BlackScholes;
