import React, { useState } from 'react';
import BlackScholes from './components/BlackScholes';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('simulator');

  return (
    <div className="App">
      <header className="App-header">
        <div className="header-content">
          <h1>Monte Carlo Option Pricing Suite</h1>
        </div>

      </header>

      <main>
        {activeTab === 'simulator' && <BlackScholes />}
      </main>
    </div>
  );
}

export default App;