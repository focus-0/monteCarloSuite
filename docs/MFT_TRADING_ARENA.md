# MFT Trading Arena — Backend API Reference

The **MFT Trading Arena** is a backend-only simulation layer for intraday option trading and delta-hedging replay. It supports instant batch replay for rules-based strategies and paced **Server-Sent Events (SSE)** sessions with Gemma (`gemma4:12b`) in the trading loop.

> **Product status:** The arena dashboard tab is hidden from the UI for now. All `/api/mft/arena/*` endpoints and supporting modules remain available for future integration and API clients.

**Related modules:**

| Module | Path | Role |
| :--- | :--- | :--- |
| Batch replay engine | `server/utils/mft_trading_arena.js` | Instant full-session replay, rules-based strategies |
| Live session manager | `server/utils/mft_arena_session.js` | Paced SSE sessions, Gemma tick loop |
| Gemma trading step | `server/utils/gemma_agent.js` → `runGemmaTradingStep` | Structured trade JSON per arena tick |
| Intraday bars | `server/utils/intraday_provider.js` | Yahoo / Polygon / synthetic 1-minute bars |
| Options chain | `server/utils/options_chain.js` | Nearest-expiry chain, ATM strike/IV picker |
| Risk limits | `server/utils/risk_limits.js` | Hard pre-trade risk gate |
| Timestamps | `server/utils/time_format.js` | Synthetic session clock vs wall-clock UTC |

Base URL: `http://localhost:5001` (override with `PORT`).

---

## 1. Batch Replay — `POST /api/mft/arena/run`

Instant full-session replay for **rules-based** strategies only:

- `delta_hedge` — periodic delta rebalancing
- `buy_hold` — unhedged long stock benchmark

**`ai_agent` is rejected (HTTP 400)** with a message to use `POST /api/mft/arena/session/start` and the SSE stream instead.

```json
{ "symbol": "AAPL", "capital": 100000, "strategyMode": "delta_hedge", "timeWindow": 30 }
```

Response includes `summary`, `navCurve`, `tradeLog`, `liveNews`.

---

## 2. Live Paced Sessions (SSE)

Required for `ai_agent` (Gemma in the trading loop).

| Method | Path | Description |
| :--- | :--- | :--- |
| `POST` | `/api/mft/arena/session/start` | Create session; returns `sessionId`, `streamUrl` |
| `GET` | `/api/mft/arena/session/:id/stream` | SSE event stream |
| `GET` | `/api/mft/arena/session/:id/status` | Poll session state |
| `POST` | `/api/mft/arena/session/:id/pause` | Pause tick loop |
| `POST` | `/api/mft/arena/session/:id/resume` | Resume tick loop |
| `POST` | `/api/mft/arena/session/:id/stop` | Stop session |

### 2.1 Start Request

```json
{
  "symbol": "AAPL",
  "capital": 100000,
  "strategyMode": "ai_agent",
  "timeWindow": 30,
  "tickIntervalMs": 2000,
  "gemmaInterval": 5,
  "dataSource": "yahoo",
  "sessionDate": "2026-08-12",
  "enforceRisk": true,
  "riskLimits": {
    "maxOptionContracts": 20,
    "maxNetDeltaShares": 500,
    "maxDrawdownPct": 0.10,
    "maxNotionalPct": 0.80,
    "maxHedgeSharesPerTrade": 200
  }
}
```

| Field | Description |
| :--- | :--- |
| `strategyMode` | `ai_agent`, `delta_hedge`, or `buy_hold` (live sessions support all three) |
| `timeWindow` | Simulation length in minutes |
| `tickIntervalMs` | Wall-clock delay between paced ticks |
| `gemmaInterval` | Consult Gemma every N ticks (when `strategyMode` is `ai_agent`) |
| `dataSource` | Intraday bar provider (see §3) |
| `sessionDate` | Anchor date for synthetic cash-session clock |
| `enforceRisk` | When `true`, reject trades that violate `riskLimits` |
| `riskLimits` | Optional overrides; defaults from `risk_limits.js` |

### 2.2 SSE Events

Events are sent as `event: <name>` with JSON `data:`:

| Event | When |
| :--- | :--- |
| `snapshot` | On stream connect — current session state, nav curve, trade log |
| `session_start` | Session loop begins |
| `tick` | Each paced simulation step |
| `news` | Initial Google News RSS fetch at session start |
| `paused` / `resumed` | Pause/resume controls |
| `stopped` | Manual stop or loop interrupted |
| `complete` | All ticks finished — includes summary |
| `error` | Unrecoverable failure |

Each `tick` payload includes:

- `simulationTimeIso` / `simulationTimeDisplay` — synthetic replay clock via `time_format.js`
- `wallClockTime` — real UTC at tick emission
- Portfolio state (NAV, positions, Greeks)
- Optional `gemma` decision metadata
- `riskRejections` — trades blocked by the risk engine (when `enforceRisk` is enabled)

### 2.3 Gemma Tick Loop

When `strategyMode` is `ai_agent`, `mft_arena_session.js` invokes `runGemmaTradingStep(observation, history)` from `gemma_agent.js` on qualifying ticks.

**Trading actions:** `OPEN_POSITION`, `BUY_HEDGE`, `SELL_HEDGE`, `CLOSE_OPTIONS`, `CLOSE_ALL`, `HOLD`.

**Gemma consultation triggers** (`shouldConsultGemma`):

- First tick
- Last tick
- News events
- Every `gemmaInterval` ticks
- Delta drift $> 50$ shares when a position is open

> **Performance:** Each Ollama round-trip can take **several minutes** on local hardware with the 12B model. Arena ticks block while Gemma consults — plan `tickIntervalMs` and `gemmaInterval` accordingly.

---

## 3. Intraday Data Sources

The `dataSource` field selects the 1-minute bar provider (`server/utils/intraday_provider.js`):

| Value | Behavior |
| :--- | :--- |
| `yahoo` (default) | Yahoo Finance 1-minute chart bars; falls back to synthetic replay on error |
| `synthetic` | Deterministic simulated intraday series (`server/data/intraday_market_data.js`) |
| `polygon` | Polygon.io 1-min aggs when `POLYGON_API_KEY` is set; Yahoo/synthetic fallback |

Bars drive spot price progression during the simulation. On session start, the engine resolves the session anchor via `time_format.getSessionAnchorIso(sessionDate)` (synthetic US cash-session open, 9:30 AM ET → UTC).

---

## 4. Options Chain at Session Start

Arena sessions fetch the nearest-expiry options chain at start via `options_chain.js`:

- Real ATM strike, implied vol, and time-to-expiry
- Refreshed every 30 simulated minutes or on news events

For standalone chain queries (not arena-specific), use `GET /api/options-chain/:symbol` — documented in the main README under Market Data.

---

## 5. Risk Limits

When `enforceRisk: true`, every Gemma or rules-based trade is validated through `server/utils/risk_limits.js` before execution.

Default limit fields (overridable via `riskLimits` in the start payload):

| Limit | Purpose |
| :--- | :--- |
| `maxOptionContracts` | Cap on open option contracts |
| `maxNetDeltaShares` | Maximum absolute net delta exposure |
| `maxDrawdownPct` | Stop trading when drawdown exceeds threshold |
| `maxNotionalPct` | Cap portfolio notional as fraction of capital |
| `maxHedgeSharesPerTrade` | Maximum shares per hedge leg |

Rejected trades appear in `tradeLog` with `agent: "risk_engine"` and in SSE `tick` events under `riskRejections`.

---

## 6. Temporal Semantics

Arena ticks and news use different clocks; all machine fields are ISO 8601 UTC:

| Clock | Fields | Meaning |
| :--- | :--- | :--- |
| **Simulated** | `simulationTimeIso`, `simulationTimeDisplay` | Advances minute-by-minute from the synthetic cash-session anchor |
| **Wall-clock** | `wallClockTime`, news `fetchedAt` / `pubDateIso` | Real UTC at fetch or tick emission time |

These clocks are **not** assumed contemporaneous. The Gemma system prompt instructs the model to compare events using explicit ISO 8601 timestamps.

Relevant `time_format.js` exports:

| Export | Purpose |
| :--- | :--- |
| `getSessionAnchorIso(dateStr)` | Synthetic session open anchor |
| `buildSimulationTickTime(minute, anchor)` | Per-tick simulated clock |
| `toIsoUtc(date)` / `formatDisplay(iso)` | Normalization and display |

---

## 7. Prerequisites

| Dependency | Notes |
| :--- | :--- |
| Built C++ engine | Greeks used in portfolio state and risk checks |
| Ollama + `gemma4:12b` | Required for `ai_agent` sessions |
| `POLYGON_API_KEY` | Optional — enables Polygon intraday source |

Verify the server is running:

```bash
curl http://localhost:5001/api/health
```

Example — start a live session:

```bash
curl -X POST http://localhost:5001/api/mft/arena/session/start \
  -H "Content-Type: application/json" \
  -d '{"symbol":"AAPL","capital":100000,"strategyMode":"delta_hedge","timeWindow":30}'
```

Stream events:

```bash
curl -N http://localhost:5001/api/mft/arena/session/<sessionId>/stream
```
