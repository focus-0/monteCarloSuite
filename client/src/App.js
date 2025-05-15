import React, { useState, useContext } from 'react';
import BlackScholes from './components/BlackScholes';
import Benchmark from './components/Benchmark';
import { ThemeContext } from './ThemeContext';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('simulator');
  const { darkMode, toggleDarkMode } = useContext(ThemeContext);

  return (
    <div className={`App ${darkMode ? 'dark-mode' : ''}`}>
      <header className="App-header">
        <div className="header-content">
          <h1>Monte Carlo Option Pricing Suite</h1>
          <button 
            className="theme-toggle" 
            onClick={toggleDarkMode}
            aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {darkMode ? '☀️' : '🌙'}
          </button>
        </div>
        <div className="tabs">
          <button 
            className={activeTab === 'simulator' ? 'active' : ''} 
            onClick={() => setActiveTab('simulator')}
          >
            Option Simulator
          </button>
          <button 
            className={activeTab === 'benchmark' ? 'active' : ''} 
            onClick={() => setActiveTab('benchmark')}
          >
            Performance Benchmark
          </button>
        </div>
      </header>

      <main>
        {activeTab === 'simulator' && <BlackScholes />}
        {activeTab === 'benchmark' && <Benchmark />}
      </main>
    </div>
  );
}

export default App; 