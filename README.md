# MonteCarloSuite — Quantitative AI Risk & Option Engine

A high-performance quantitative finance suite featuring a multithreaded C++ Monte Carlo engine, path-dependent Asian option pricing, finite-difference Greeks, live Yahoo Finance market data, an MCP (Model Context Protocol) Server, a local Ollama Gemma AI Risk Agent, and a pitch-black blue/white React dashboard.

---

## Key Features

- **High-Performance Portable C++ Engine**: Multithreaded execution computing 100,000 Monte Carlo paths in **~1.5ms** and 25.2 million Asian option daily steps in **~130ms** (**8.6x–15.3x faster than V8 JavaScript**). Uses portable `-O3` optimization flags to eliminate hardware instruction (`SIGILL`) crashes.
- **Asian Option Pricing**: Arithmetic average path simulation ($\bar{S} = \frac{1}{M}\sum S_t$) over 252 daily steps (proves Monte Carlo necessity with no closed-form formula).
- **Finite-Difference Greeks**: Central finite-difference calculations for Delta ($\Delta$), Gamma ($\Gamma$), Vega ($\nu$), Theta ($\Theta$), and Rho ($\rho$).
- **Model Context Protocol (MCP) Server**: Standard JSON-RPC stdio server (`server/mcp_server.js`) exposing quantitative tools directly to AI Agents.
- **Local Ollama Gemma AI Analyst**: 100% offline, privacy-first AI agent (`agent/local_quant_agent.py`) using Google Gemma (`gemma4:e2b-mlx`) on Apple Silicon GPU to analyze C++ math and generate plain-English trading risk advice.
- **Rich Markdown & GFM Table Rendering**: Integrated `react-markdown` and `remark-gfm` in the React UI to format Gemma's trade recommendations and comparisons into clean data tables and styled text.
- **Stock Parameter Presets & Market Data**: 1-click 100% offline stock presets (`AAPL`, `TSLA`, `NVDA`, `GOOGL`, `MSFT`) and live Yahoo Finance stock quote lookup ($S_0$) with 252-day annualized historical volatility ($\sigma$).
- **Pitch-Black & Blue/White Dashboard**: Clean `#000000` pitch black design system with blue (`#3b82f6` / `#60a5fa`) and white (`#ffffff`) typography, zero emojis, non-blocking C++ rendering, and 4 interactive charts (Performance, Convergence, GBM Price Paths, Sensitivity Sweeps).

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│ React Frontend Dashboard (Pitch Black #000000 & Blue/White Theme)        │
│ 8 Modular Components | React Markdown + GFM Tables | On-Demand Benchmarks │
└────────────────────────────────────┬─────────────────────────────────────┘
                                     │
                                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Express Server API & MCP Server                                          │
│ REST Routes: /api/black-scholes/cpp | /api/asian-option | /api/greeks | /api/agent/analyze
│ MCP Tools (stdio/JSON-RPC): price_european, price_asian, calculate_greeks
└─────────────────┬──────────────────────────────────────┬─────────────────┘
                  │                                      │
                  ▼                                      ▼
┌──────────────────────────────────┐   ┌──────────────────────────────────┐
│ C++ Monte Carlo Engine           │   │ Local Ollama Gemma Agent         │
│ • Asian Options (Path-dependent) │   │ • agent/local_quant_agent.py     │
│ • Finite-Diff Greeks (Δ,Γ,ν,Θ,ρ) │   │ • Connects Gemma (MLX) via MCP   │
│ • Portable -O3 Compilation       │   │ • Plain-English Risk Reasoning   │
└──────────────────────────────────┘   └──────────────────────────────────┘
```

---

## Live Performance Benchmarks

### 1. C++ vs JavaScript Latency (Asian Option — 25,200,000 Path Steps)

| Metric | JavaScript Engine (V8 Node.js) | C++ Multithreaded Engine | Speedup |
|---|---|---|---|
| **Execution Time** | **1,164.28 ms** *(1.16s)* | **135.12 ms** *(0.13s)* | **8.6x FASTER** |
| **European Option (100k paths)** | **22.50 ms** | **1.47 ms** | **15.3x FASTER** |
| **Simulated Steps** | 25,200,000 steps | 25,200,000 steps | Parallelized |

### 2. Local AI Agent Performance (Gemma 4B / Apple Silicon GPU)

| Metric | Measured Value |
|---|---|
| **Inference Generation Speed** | **43.8 tokens / second** |
| **Tool Calling Protocol** | Model Context Protocol (MCP stdio JSON-RPC) |
| **Total AI Risk Audit Latency** | **~1.5 seconds** (Full C++ Math + LLM Reasoning) |

---

## Tech Stack

* **Frontend**: React, Chart.js, `react-markdown`, `remark-gfm`, Vanilla CSS (#000000 Pitch Black & Blue/White Design System).
* **Backend Server**: Express.js, Node.js, `yahoo-finance2`.
* **Compute Engine**: Multithreaded C++17 (`std::thread`, OpenMP, POSIX threads, `-O3`).
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
* **Backend API**: `http://localhost:5001`

---

## Model Context Protocol (MCP) Server Tools

The MCP Server (`server/mcp_server.js`) exposes 4 standard JSON-RPC tools for AI agents:

1. `price_european_option`: Calculates European option price and 95% confidence intervals via multithreaded C++.
2. `price_asian_option`: Calculates arithmetic Asian option price over 252 daily steps.
3. `calculate_greeks`: Computes central finite-difference Greeks ($\Delta, \Gamma, \nu, \Theta, \rho$).
4. `run_benchmark`: Measures execution latency for C++ vs JS across $N$ iterations.

---

## License

MIT License. Free for academic, personal, and quantitative research use.
