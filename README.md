# MonteCarloSuite — Multi-Threaded C++ Quantitative Engine & MFT AI Risk Backend

**MonteCarloSuite** is a high-performance quantitative finance suite designed for sub-millisecond option pricing, risk sensitivity computation ($\Delta, \Gamma, \nu, \Theta, \rho$), discrete delta-hedging simulation, and real-time Medium-Frequency Trading (MFT) risk orchestration.

The architecture combines a native **multi-threaded C++17 Monte Carlo engine** (capable of evaluating $100,000$ simulation paths in **$1.4\text{ ms}$** and $25.2\text{M}$ path-dependent steps in **$125\text{ ms}$**) with an **Express REST API**, a **JSON-RPC Model Context Protocol (MCP) server** for AI agent tool calling, a **Live Financial News RAG pipeline**, and an **MFT Market Replay & AI Agent Trading Arena**.

---

## 📐 1. System Architecture & Component Mapping

```
                               ┌───────────────────────────────────────────────────────────┐
                               │             Model Context Protocol (MCP) Server           │
                               │                   server/mcp_server.js                    │
                               │                (JSON-RPC 2.0 over stdio)                  │
                               └─────────────────────────────┬─────────────────────────────┘
                                                             │
                                                             ▼
┌──────────────────────────┐   HTTP REST API   ┌───────────────────────────────────────────┐
│     Client Dashboard     │ ────────────────> │             Node.js Express Server        │
│   (React 18 + Chart.js)  │                   │         server/server.js (Port 5001)      │
└──────────────────────────┘                   └──────┬─────────────────────────────┬──────┘
                                                      │                             │
                                  Child Process Exec  │                             │ Live Web RAG / Market Data
                                  stdout (JSON)       ▼                             ▼
                              ┌──────────────────────────────┐        ┌─────────────────────────────┐
                              │    Multi-Threaded C++ Core   │        │     Yahoo Finance Options   │
                              │    server/cpp/monte_carlo    │        │     & Google News RSS RAG   │
                              │   (Mode 0, 1, 2, 3, 4, 5)    │        │  (market_data / news.js)    │
                              └──────────────────────────────┘        └─────────────────────────────┘
```

---

## ⚡ 2. C++ Quantitative Core Specification (`server/cpp/src/monte_carlo.cpp`)

The core numerical calculations are implemented in C++17, compiled with maximum optimization flags (`-O3 -march=native -pthread`). The binary is stateless and communicates with the Node.js backend via CLI arguments and `stdout` JSON strings.

### 2.1 Compilation & Build System
* **Build File:** `server/cpp/CMakeLists.txt` / `server/cpp/build.sh`
* **Compiler Flags:** `g++ -O3 -march=native -pthread -std=c++17`
* **Output Binary:** `server/cpp/monte_carlo`

### 2.2 CLI Signature & Argument Mapping
```bash
./monte_carlo <S0> <K> <r> <sigma> <T> <isCall> <numTrials> <benchmark_mode> [threads] [numSteps/iterations] [rebalanceFreq] [txCostPct]
```

| Positional Arg | Type | Range | Description |
| :--- | :--- | :--- | :--- |
| `argv[1]` (`S0`) | `double` | $> 0.0$ | Initial spot price of the underlying asset |
| `argv[2]` (`K`) | `double` | $> 0.0$ | Option strike price |
| `argv[3]` (`r`) | `double` | Any | Annualized risk-free interest rate (e.g. `0.05` for 5%) |
| `argv[4]` (`sigma`) | `double` | $> 0.0$ | Annualized volatility $\sigma$ (e.g. `0.20` for 20%) |
| `argv[5]` (`T`) | `double` | $> 0.0$ | Time to maturity in years (e.g. `1.0` for 1 year) |
| `argv[6]` (`isCall`) | `int` | `0` or `1` | `1` = Call Option, `0` = Put Option |
| `argv[7]` (`numTrials`) | `int` | $> 0$ | Total number of Monte Carlo paths to simulate |
| `argv[8]` (`benchmark_mode`) | `int` | `0` to `5` | Engine execution mode selector |
| `argv[9]` (`threads`) | `int` | $\ge 0$ | Thread count (`0` = auto-detect hardware concurrency) |
| `argv[10]` (`numSteps`/`iterations`)| `int` | $> 0$ | Step count for Asian/Hedge modes, or benchmark iterations |
| `argv[11]` (`rebalanceFreq`) | `int` | $\ge 1$ | Rebalancing interval in steps (Mode 5 only, default `1`) |
| `argv[12]` (`txCostPct`) | `double` | $\ge 0.0$ | Transaction cost percentage (Mode 5 only, default `0.001` = 10 bps) |

---

### 2.3 Execution Modes & Output JSON Contracts

#### Mode 0: European Option Single Run (`benchmark_mode = 0`)
Simulates terminal spot price $S_T = S_0 \exp\left((r - \frac{1}{2}\sigma^2)T + \sigma \sqrt{T} Z\right)$ for $N$ trials.
* **Output JSON:**
```json
{
  "optionType": "european",
  "executionTimeMs": 1.420,
  "optionPrice": 10.450123,
  "confidence": { "lower": 10.410000, "upper": 10.490000 },
  "threadsUsed": 8
}
```

#### Mode 1: Performance Benchmark (`benchmark_mode = 1`)
Executes `iterations` benchmark runs of multi-threaded European pricing to compute min, max, mean, and median latency.
* **Output JSON:**
```json
{
  "statistics": { "min": 1.200, "max": 2.500, "avg": 1.450, "median": 1.410 },
  "iterations": 5,
  "threadsUsed": 8,
  "runs": [ { "iteration": 1, "executionTime": 1.410, "optionPrice": 10.450123, "confidence": { "lower": 10.41, "upper": 10.49 } } ]
}
```

#### Mode 2: Arithmetic Asian Option (`benchmark_mode = 2`)
Path-dependent pricing simulating `numSteps` discrete sub-intervals ($\Delta t = T / \text{numSteps}$). Calculates payoff on arithmetic average spot price: $\bar{S} = \frac{1}{\text{numSteps} + 1} \sum_{k=0}^{\text{numSteps}} S_{t_k}$.
* **Output JSON:**
```json
{
  "optionType": "asian",
  "executionTimeMs": 125.430,
  "numSteps": 252,
  "optionPrice": 5.678901,
  "confidence": { "lower": 5.650000, "upper": 5.700000 },
  "threadsUsed": 8
}
```

#### Mode 3: Finite-Difference Greeks with Common Random Numbers (`benchmark_mode = 3`)
Computes Delta, Gamma, Vega, Theta, and Rho using Common Random Numbers (CRN) to eliminate sampling noise across bumped paths.
* **Output JSON:**
```json
{
  "executionTimeMs": 1.520,
  "optionPrice": 10.450123,
  "greeks": {
    "delta": 0.635123,
    "gamma": 0.018456,
    "vega": 38.123456,
    "theta": -6.789123,
    "rho": 25.456789
  },
  "threadsUsed": 8
}
```

#### Mode 4: Price Paths Generator (`benchmark_mode = 4`)
Generates 2D trajectory matrix for visualizer plots using fixed deterministic RNG seed `12345`.
* **Output JSON:**
```json
{
  "executionTimeMs": 2.345,
  "numPaths": 50,
  "numSteps": 100,
  "paths": [ [100.00, 100.23, 100.45, ...], [100.00, 99.87, 99.54, ...] ]
}
```

#### Mode 5: Discrete Delta-Hedging Simulator (`benchmark_mode = 5`)
Simulates 10,000 paths over 252 steps under discrete rebalancing and proportional transaction costs ($10\text{ bps}$).
* **Output JSON:**
```json
{
  "executionTimeMs": 132.540,
  "numPaths": 10000,
  "numSteps": 252,
  "rebalanceFreq": 1,
  "transactionCostPct": 0.001,
  "summaryStatistics": {
    "meanPnL": -0.6321,
    "stdDevPnL": 0.4812,
    "minPnL": -2.8450,
    "maxPnL": 1.1240,
    "var95": -1.4820,
    "cvar95": -1.8740,
    "avgTxCosts": 0.5520
  },
  "pnlDistribution": [ -2.8450, -2.8120, ..., 1.1240 ],
  "samplePaths": [
    [
      { "t": 0.0, "stock": 100.00, "delta": 0.6351, "shares": 0.6351, "cash": -53.15, "hedgeError": 0.0 },
      { "t": 0.00396, "stock": 100.45, "delta": 0.6420, "shares": 0.6420, "cash": -53.86, "hedgeError": -0.02 }
    ]
  ]
}
```

---

### 2.4 Mathematical Formulations

#### 1. Black-Scholes Analytical Pricing (`bs_price` & `bs_delta`)
$$d_1 = \frac{\ln(S / K) + \left(r + \frac{1}{2}\sigma^2\right)\tau}{\sigma \sqrt{\tau}}, \quad d_2 = d_1 - \sigma \sqrt{\tau}$$

$$\text{Price}_{\text{Call}} = S \cdot N(d_1) - K e^{-r\tau} N(d_2), \quad \text{Price}_{\text{Put}} = K e^{-r\tau} N(-d_2) - S \cdot N(-d_1)$$

$$\Delta_{\text{Call}} = N(d_1), \quad \Delta_{\text{Put}} = N(d_1) - 1.0$$

Where $N(x) = \frac{1}{2} \text{erfc}\left(-\frac{x}{\sqrt{2}}\right)$.

#### 2. Common Random Numbers (CRN) Finite-Difference Schemes
To evaluate derivative sensitivities without finite-difference sampling noise, a single random normal draw $Z_i \sim \mathcal{N}(0,1)$ per path $i$ is reused across all bumped parameter evaluations:

* **Spot Bumps:** $h_S = 0.005 \times S_0$
* **Vol Bump:** $h_\sigma = 0.005$
* **Time Bump:** $h_T = \frac{1}{365}$
* **Rate Bump:** $h_r = 0.0005$

$$\Delta = \frac{P(S_0 + h_S) - P(S_0 - h_S)}{2 h_S}$$

$$\Gamma = \frac{P(S_0 + h_S) - 2 P(S_0) + P(S_0 - h_S)}{h_S^2}$$

$$\nu = \frac{P(\sigma + h_\sigma) - P(\sigma - h_\sigma)}{2 h_\sigma}, \quad \Theta = \frac{P(T - h_T) - P(T)}{h_T}, \quad \rho = \frac{P(r + h_r) - P(r - h_r)}{2 h_r}$$

#### 3. Discrete Delta-Hedging Accounting Equations
For each path $i$ and step $k = 0 \dots \text{numSteps}$:
1. **Initial Option Sale & Hedge ($k = 0$):**
   $$V_0 = \text{bs\_price}(S_0), \quad \Delta_0 = \text{bs\_delta}(S_0)$$
   $$C_0 = V_0 - \Delta_0 S_0 - |\Delta_0| S_0 \cdot \text{txCostPct}$$

2. **Step Accrual & Rebalancing ($k = 1 \dots \text{numSteps}-1$):**
   $$C_k = C_{k-1} e^{r \Delta t}$$
   $$\Delta_k = \text{bs\_delta}(S_k, \tau_k)$$
   $$\delta_{\text{shares}} = \Delta_k - \text{shares}_{k-1}$$
   $$C_k \leftarrow C_k - \left(\delta_{\text{shares}} S_k + |\delta_{\text{shares}}| S_k \cdot \text{txCostPct}\right)$$

3. **Terminal Liquidation ($k = \text{numSteps}$):**
   $$\text{Payoff} = \max(S_T - K, 0) \quad (\text{for Call})$$
   $$\text{PnL}_i = C_T + \text{shares}_T S_T - |\text{shares}_T| S_T \cdot \text{txCostPct} - \text{Payoff}$$

4. **Risk Metrics:**
   * **95% VaR:** $5^{\text{th}}$ percentile of sorted $\text{PnL}$ vector: $\text{VaR}_{95\%} = \text{PnL}_{(0.05 \cdot N)}$.
   * **95% CVaR:** Expected loss below 95% VaR threshold: $\text{CVaR}_{95\%} = \frac{1}{0.05 N} \sum_{j=1}^{0.05 N} \text{PnL}_{(j)}$.

---

### 2.5 Multi-Threading & Memory Architecture
* **Threading Model:** `std::thread` worker pool partitioned by trial count $N / \text{num\_threads}$.
* **PRNG:** Thread-local 64-bit Mersenne Twister (`std::mt19937_64`) seeded via `std::chrono::high_resolution_clock` + thread index offset.
* **SIMD & Memory Alignment:** Payoff vectors aligned to 64-byte boundaries (`ALIGN_DATA(64)`). Standard normal random draws generated in fixed stack-allocated batches (`RANDOM_BATCH_SIZE = 4096`).
* **Branchless Payoffs:** `calculate_payoff` implemented without conditional jumps: `std::max(0.0, isCall ? ST - K : K - ST)`.

---

## 🟢 3. Node.js Express Backend Architecture (`server/`)

### 3.1 Application Bootstrap & Security Stack (`server/server.js`)
* **Framework:** Express.js running on Port `5001` (configurable via `process.env.PORT`).
* **Security & Middleware Stack:**
  * `helmet()`: HTTP security headers.
  * `cors()`: Cross-Origin Resource Sharing.
  * `express-mongo-sanitize()`: Prevents MongoDB operator injection attacks.
  * `xss-clean()`: Sanitizes user input against cross-site scripting.
  * `express-rate-limit`: Rate limiting on `/api/` endpoints (100 requests per 15-min window).
  * `express.json({ limit: '10kb' })`: Body parser.

---

### 3.2 Complete REST API Contract Specification (`server/src/routes.js`)

#### 1. `POST /api/black-scholes/cpp`
Executes multi-threaded C++ European option pricing.
* **Request Body:**
  ```json
  { "S0": 100, "K": 100, "r": 0.05, "sigma": 0.20, "T": 1.0, "isCall": true, "numTrials": 100000 }
  ```
* **Response Body (200 OK):**
  ```json
  {
    "optionPrice": 10.450123,
    "executionTimeMs": 1.42,
    "confidence": { "lower": 10.41, "upper": 10.49 },
    "analyticalPrice": 10.450584,
    "errorPercentage": 0.0044,
    "threadsUsed": 8
  }
  ```

#### 2. `POST /api/greeks`
Computes option risk sensitivities via C++ CRN engine.
* **Request Body:** Same as European option payload.
* **Response Body (200 OK):**
  ```json
  {
    "executionTimeMs": 1.52,
    "optionPrice": 10.450123,
    "greeks": { "delta": 0.635123, "gamma": 0.018456, "vega": 38.123456, "theta": -6.789123, "rho": 25.456789 },
    "threadsUsed": 8
  }
  ```

#### 3. `POST /api/asian-option`
Prices path-dependent arithmetic Asian options.
* **Request Body:** Includes optional `"numSteps": 252`.
* **Response Body (200 OK):**
  ```json
  { "optionType": "asian", "executionTimeMs": 125.43, "numSteps": 252, "optionPrice": 5.678901, "confidence": { "lower": 5.65, "upper": 5.70 }, "threadsUsed": 8 }
  ```

#### 4. `POST /api/benchmark`
Executes side-by-side performance benchmark comparing C++ against Node.js V8 execution.
* **Response Body (200 OK):**
  ```json
  {
    "cpp": { "executionTimeMs": 1.42, "optionPrice": 10.450123 },
    "js": { "executionTimeMs": 24.15, "optionPrice": 10.449812 },
    "speedupMultiplier": 17.01
  }
  ```

#### 5. `POST /api/simulation/delta-hedge`
Runs 10,000-path discrete delta-hedging simulation.
* **Request Body:**
  ```json
  { "S0": 100, "K": 100, "r": 0.05, "sigma": 0.20, "T": 1.0, "isCall": true, "numTrials": 10000, "numSteps": 252, "rebalanceFreq": 1, "txCostPct": 0.001 }
  ```
* **Response Body (200 OK):** Mode 5 JSON contract (see Section 2.3).

#### 6. `POST /api/mft/arena/run`
Simulates a 30-minute Power Hour or 390-minute full trading session with autonomous AI trading orders and live web news RAG.
* **Request Body:**
  ```json
  { "symbol": "AAPL", "capital": 100000, "strategyMode": "ai_agent", "timeWindow": 30 }
  ```
* **Response Body (200 OK):**
  ```json
  {
    "symbol": "AAPL",
    "name": "Apple Inc.",
    "capital": 100000,
    "strategyMode": "ai_agent",
    "executionTimeMs": 98,
    "summary": {
      "initialCapital": 100000,
      "finalNav": 234097.90,
      "netProfit": 134097.90,
      "roiPct": 134.10,
      "sharpeRatio": 0.99,
      "maxDrawdownPct": 10.01,
      "totalTxCosts": 458.90,
      "totalTrades": 12
    },
    "liveNews": [
      { "title": "Jefferies Downgrades Apple...", "source": "Barchart.com", "pubDateFormatted": "Wed, Aug 12, 2026", "ageMinutes": 869 }
    ],
    "navCurve": [ { "minute": 1, "time": "9:31 AM", "price": 224.30, "nav": 100000.00 }, ... ],
    "tradeLog": [
      { "minute": 1, "time": "9:31 AM", "action": "OPEN_POSITION", "detail": "Bought 10 Call Contracts...", "stockPrice": 224.30, "delta": 0.6304, "txFee": 45.20, "reason": "Initial position entry." }
    ]
  }
  ```

#### 7. `GET /api/market-data/:symbol`
Fetches spot price, ATM implied volatility from live options chain, and 252-day trailing historical volatility.
* **Response Body (200 OK):**
  ```json
  {
    "symbol": "AAPL",
    "name": "Apple Inc.",
    "price": 224.30,
    "impliedVolatility": 0.2350,
    "historicalVolatility": 0.2180,
    "volatilitySource": "option_chain_atm",
    "isFallback": false
  }
  ```

#### 8. `GET /api/market-news/:symbol`
Fetches live breaking market headlines via Google News RSS parser with publication timestamps.
* **Response Body (200 OK):**
  ```json
  {
    "symbol": "AAPL",
    "fetchedAt": "2026-08-12T09:54:24.515Z",
    "articleCount": 5,
    "articles": [
      {
        "title": "After Earnings, Is Apple Stock a Buy, a Sell, or Fairly Valued?",
        "source": "Morningstar",
        "pubDate": "Mon, 10 Aug 2026 09:14:40 GMT",
        "pubDateFormatted": "Mon, Aug 10, 2026, 02:44 PM GMT+5:30",
        "link": "https://news.google.com/rss/...",
        "ageMinutes": 2920
      }
    ]
  }
  ```

---

### 3.3 Backend Utility & Service Modules (`server/utils/`)

#### 1. `monte_carlo_cpp.js` (C++ Process Spawner)
Wraps child process invocation using Node `child_process.execFile`:
```javascript
const binaryPath = path.join(__dirname, '../cpp/monte_carlo');
execFile(binaryPath, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => { ... });
```
Maps JavaScript parameters to positional array: `[S0, K, r, sigma, T, isCall ? 1 : 0, numTrials, mode, threads, numSteps, rebalanceFreq, txCostPct]`.

#### 2. `market_data.js` (Options Chain Volatility Lookup)
Uses `yahoo-finance2` to query option expiration dates for ticker `symbol`. Selects the nearest expiration date, fetches the call option chain, locates the contract whose strike price is closest to current spot price $S_0$ (At-The-Money), and extracts its `impliedVolatility`. Falls back to trailing 252-day historical volatility if option chain is unavailable.

#### 3. `market_news.js` (Google News RSS Parser)
Queries `https://news.google.com/rss/search?q=${symbol}+stock`. Parses `<item>` RSS elements via regular expressions to extract `title`, `source`, `pubDate`, `link`, and calculates `ageMinutes = Math.round((Date.now() - pubDate.getTime()) / 60000)`. Zero API keys required.

#### 4. `mft_trading_arena.js` (Trading Day Replay Engine)
Simulates a 30-minute or 390-minute trading session on intraday tick data (`server/data/intraday_market_data.js`). Evaluates option prices and CRN Greeks via C++ engine on every tick/news shock, executes trade orders with 10 bps transaction costs, tracks portfolio cash balance, calculates minute-by-minute NAV, and evaluates risk-adjusted metrics (ROI %, Sharpe ratio, Max Drawdown %).

---

## 🤖 4. Model Context Protocol (MCP) Server (`server/mcp_server.js`)

The backend exposes an **MCP Server** implementing the JSON-RPC 2.0 protocol over `stdio` to allow autonomous AI Agents (e.g. Anthropic Claude Desktop, Antigravity, Ollama agents) to directly invoke quantitative tools.

### 4.1 MCP Tool Registry Specification

| Tool Name | Input Schema Required Fields | Backend Handler |
| :--- | :--- | :--- |
| `price_european_option` | `S0, K, r, sigma, T, isCall, numTrials` | `monte_carlo_service.calculateOptionPrice` |
| `price_asian_option` | `S0, K, r, sigma, T, isCall, numTrials` | `monte_carlo_service.calculateAsianOptionPrice` |
| `calculate_greeks` | `S0, K, r, sigma, T, isCall, numTrials` | `monte_carlo_service.calculateGreeks` |
| `simulate_delta_hedging` | `S0, K, r, sigma, T, isCall` | `monte_carlo_service.simulateDeltaHedging` |
| `run_benchmark` | `S0, K, r, sigma, T, isCall, numTrials` | Evaluates C++ vs JS latency |

### 4.2 Stdio JSON-RPC Protocol Sample
```json
// Request from AI Agent (stdin):
{ "jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": { "name": "calculate_greeks", "arguments": { "S0": 100, "K": 100, "r": 0.05, "sigma": 0.20, "T": 1.0, "isCall": true, "numTrials": 100000 } } }

// Response from MCP Server (stdout):
{ "jsonrpc": "2.0", "id": 1, "result": { "content": [ { "type": "text", "text": "{\n  \"executionTimeMs\": 1.52,\n  \"greeks\": {\n    \"delta\": 0.635123,\n    \"gamma\": 0.018456,\n    \"vega\": 38.123456,\n    \"theta\": -6.789123,\n    \"rho\": 25.456789\n  }\n}" } ] } }
```

---

## 🗄️ 5. Database Schema Specification (`server/models/SimulationHistory.js`)

Simulation runs are persisted to MongoDB when database connectivity is enabled.

```javascript
const simulationHistorySchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now, index: true },
  optionType: { type: String, enum: ['european', 'asian', 'delta_hedge'], required: true },
  symbol: { type: String, uppercase: true },
  parameters: {
    S0: Number, K: Number, r: Number, sigma: Number, T: Number,
    isCall: Boolean, numTrials: Number, numSteps: Number
  },
  results: {
    optionPrice: Number,
    confidenceLower: Number,
    confidenceUpper: Number,
    executionTimeMs: Number,
    greeks: { delta: Number, gamma: Number, vega: Number, theta: Number, rho: Number },
    summaryStatistics: { meanPnL: Number, stdDevPnL: Number, var95: Number, cvar95: Number }
  }
});
```

---

## 🛠️ 6. AI Agent Step-by-Step Blueprint for Exact Replication

To replicate this backend system from scratch:

1. **Build Environment & Prerequisites:**
   * Install GCC/Clang with C++17 support (`g++ >= 9.0` or `clang++ >= 11.0`), CMake $\ge 3.14$, Node.js $\ge 18.0$, and MongoDB (optional).

2. **C++ Native Engine Compilation:**
   * Place `monte_carlo.cpp` in `server/cpp/src/`.
   * Compile binary:
     ```bash
     cd server/cpp && mkdir -p build && cd build
     cmake -DCMAKE_BUILD_TYPE=Release .. && make -j$(nproc)
     ```
   * Verify executable CLI mode 3: `./monte_carlo 100 100 0.05 0.20 1.0 1 100000 3 0`

3. **Node.js Backend Dependencies:**
   * Install server packages:
     ```bash
     cd server && npm install express cors helmet express-mongo-sanitize express-rate-limit express-validator xss-clean yahoo-finance2 mongoose
     ```

4. **Start Server:**
   ```bash
   node server/server.js
   ```
   Backend listens on port `5001`. Verify API health via `curl http://localhost:5001/api/health`.

5. **Start MCP Server for AI Agents:**
   ```bash
   node server/mcp_server.js
   ```
   Pass stdio JSON-RPC requests to interact with quantitative engine tools autonomously.
