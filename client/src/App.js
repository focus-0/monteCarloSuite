import React, { useState } from 'react';
import BlackScholes from './components/BlackScholes';
import Benchmark from './components/Benchmark';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('simulator');

  return (
    <div className="App">
      <header className="App-header">
        <h1>Monte Carlo Option Pricing Suite</h1>
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