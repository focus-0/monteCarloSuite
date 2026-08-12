# MonteCarloSuite v2.0 — Quantitative AI Risk & Option Engine

A high-performance quantitative finance suite featuring a multithreaded C++ Monte Carlo engine, path-dependent Asian option pricing, finite-difference Greeks, live Yahoo Finance market data, an MCP (Model Context Protocol) Server, a local Ollama Gemma AI Risk Agent, and a dark glassmorphic React dashboard.

---

## Key Features

- ⚡ **High-Performance C++ Engine**: Multithreaded SIMD execution computing 100,000 Monte Carlo paths in **~1.5ms** and 25.2 million Asian option daily steps in **~135ms** (**8.6x–14.8x faster than V8 JavaScript**).
- 📈 **Asian Option Pricing**: Arithmetic average path simulation ($\bar{S} = \frac{1}{M}\sum S_t$) over 252 daily steps (proves Monte Carlo necessity with no closed-form formula).
- 🧮 **Finite-Difference Greeks**: Central finite-difference calculations for Delta ($\Delta$), Gamma ($\Gamma$), Vega ($\nu$), Theta ($\Theta$), and Rho ($\rho$).
- 🤖 **Model Context Protocol (MCP) Server**: Standard JSON-RPC stdio server (`server/mcp_server.js`) exposing quantitative tools directly to AI Agents.
- 🧠 **Local Ollama Gemma AI Analyst**: 100% offline, privacy-first AI agent (`agent/local_quant_agent.py`) using Google Gemma (`gemma4:e2b-mlx`) on Apple Silicon GPU to analyze C++ math and generate plain-English trading risk advice.
- 📊 **Yahoo Finance Market Integration**: Auto-fetches live stock quotes ($S_0$) and computes 252-day annualized historical volatility ($\sigma$) with graceful fallback data.
- 🎨 **Default Dark Glassmorphic Dashboard**: Modern `#0a0e17` dark design system with Inter font, glowing emerald/cyan accents, non-blocking C++ rendering, and 4 interactive charts (Performance, Convergence, GBM Price Paths, Sensitivity Sweeps).

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│ React Frontend Dashboard (Default Dark Theme #0a0e17)                    │
│ 8 Modular Components | Instant C++ Render | Performance Benchmarks       │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Express Server API & MCP Server                                          │
│ REST Routes: /api/black-scholes/cpp | /api/asian-option | /api/greeks | /api/market
│ MCP Tools (stdio/JSON-RPC): price_european, price_asian, calculate_greeks
└─────────────────┬──────────────────────────────────────┬─────────────────┘
                  │                                      │
                  ▼                                      ▼
┌──────────────────────────────────┐   ┌──────────────────────────────────┐
│ C++ Monte Carlo Engine           │   │ Local Ollama Gemma Agent         │
│ • Asian Options (Path-dependent) │   │ • agent/local_quant_agent.py     │
│ • Finite-Diff Greeks (Δ,Γ,ν,Θ,ρ) │   │ • Connects Gemma (MLX) via MCP   │
│ • Sample Path Trajectory Gen     │   │ • Plain-English Risk Reasoning   │
└──────────────────────────────────┘   └──────────────────────────────────┘
```

---

## Live Performance Benchmarks

### 1. C++ vs JavaScript Latency (Asian Option — 25,200,000 Path Steps)

| Metric | JavaScript Engine (V8 Node.js) | C++ Multithreaded Engine | Speedup |
|---|---|---|---|
| **Execution Time** | **1,164.28 ms** *(1.16s)* | **135.12 ms** *(0.13s)* | **⚡ 8.6x FASTER** |
| **European Option (100k paths)** | **22.50 ms** | **1.47 ms** | **⚡ 15.3x FASTER** |
| **Simulated Steps** | 25,200,000 steps | 25,200,000 steps | Parallelized |

### 2. Local AI Agent Performance (Gemma 4B / Apple Silicon GPU)

| Metric | Measured Value |
|---|---|
| **Inference Generation Speed** | **43.8 tokens / second** |
| **Tool Calling Protocol** | Model Context Protocol (MCP stdio JSON-RPC) |
| **Total AI Risk Audit Latency** | **~1.5 seconds** (Full C++ Math + LLM Reasoning) |

---

## Tech Stack

* **Frontend**: React, Chart.js, Vanilla CSS Glassmorphism (`#0a0e17` dark design system).
* **Backend Server**: Express.js, Node.js, `yahoo-finance2`.
* **Compute Engine**: Multithreaded C++17 (`std::thread`, OpenMP, SIMD vectorization, `-O3 -march=native`).
* **AI Agent & MCP**: Python 3, Ollama (`gemma4:e2b-mlx`), Stdio JSON-RPC.

---

## Setup & Installation

### Prerequisites
- Node.js (v18 or higher)
- C++17 Compiler (Clang / GCC / CMake)
- Python 3.9+ & Ollama (Optional, for local AI Agent)

### 1. Build C++ Monte Carlo Core
```bash
cd server/cpp
./build.sh
cd ../..
```

### 2. Install Dependencies
```bash
npm install
cd server && npm install
cd ../client && npm install
cd ..
```

### 3. Run Web Application
```bash
npm run dev
```
* **Frontend Dashboard**: `http://localhost:3000`
* **Express Backend Server**: `http://localhost:5001`

---

## Running the Local AI Agent & MCP Server

To run the privacy-first local AI Risk Analyst using your C++ engine over MCP:

```bash
# 1. Start Ollama with Gemma
ollama serve

# 2. Run Local Quant Agent
/usr/bin/python3 agent/local_quant_agent.py
```

### Run 1,000-Simulation Distribution Benchmark:
```bash
/usr/bin/python3 -u agent/benchmark_distribution.py
```

---

## API Documentation

### REST API Endpoints

* `POST /api/black-scholes/cpp` — Non-blocking C++ European option pricing.
* `POST /api/black-scholes/js` — Standalone JS benchmark option pricing.
* `POST /api/asian-option` — C++ path-dependent Asian option pricing (252 daily steps).
* `POST /api/greeks` — C++ central finite-difference Greeks ($\Delta, \Gamma, \nu, \Theta, \rho$).
* `POST /api/price-paths` — 50 Geometric Brownian Motion trajectory generator.
* `GET /api/market/:ticker` — Live Yahoo Finance market quote & 252-day historical volatility calculator.

### MCP Tools (Stdio JSON-RPC)

* `price_european_option`
* `price_asian_option`
* `calculate_greeks`
* `run_benchmark`

---

## License
MIT License. Created as an advanced quantitative AI systems project.
