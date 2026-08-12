const crypto = require('crypto');
const config = require('../config');
const { getMarketNews, normalizeNewsArticle } = require('./market_news');
const { runGemmaTradingStep } = require('./gemma_agent');
const {
  createArenaState,
  fetchInitialOptionPrice,
  updateGreeks,
  recordNavPoint,
  applyRulesDeltaHedgeStep,
  applyBuyHoldStep,
  applyDecisionWithRiskCheck,
  shouldConsultGemma,
  buildObservation,
  buildSummary,
  liquidateAll,
  refreshOptionsChain
} = require('./mft_trading_arena');

const sessions = new Map();
const SESSION_TTL_MS = 60 * 60 * 1000;

function generateSessionId() {
  return crypto.randomBytes(8).toString('hex');
}

class ArenaSession {
  constructor(params) {
    this.id = generateSessionId();
    this.params = {
      tickIntervalMs: config.mft.defaultTickIntervalMs,
      gemmaInterval: config.mft.defaultGemmaInterval,
      dataSource: config.mft.defaultDataSource,
      enforceRisk: true,
      ...params
    };
    this.state = null;
    this.initPromise = null;
    this.status = 'created';
    this.currentIndex = 0;
    this.subscribers = new Set();
    this.conversationHistory = [];
    this.loopPromise = null;
    this.pauseRequested = false;
    this.stopRequested = false;
    this.createdAt = Date.now();
  }

  async ensureInitialized() {
    if (this.state) return this.state;
    if (!this.initPromise) {
      this.initPromise = createArenaState(this.params).then((state) => {
        this.state = state;
        return state;
      });
    }
    return this.initPromise;
  }

  subscribe(res) {
    this.subscribers.add(res);
    res.on('close', () => this.subscribers.delete(res));
  }

  broadcast(eventType, data) {
    const payload = JSON.stringify({ type: eventType, ...data });
    for (const res of this.subscribers) {
      try {
        res.write(`event: ${eventType}\n`);
        res.write(`data: ${payload}\n\n`);
      } catch (_) {
        this.subscribers.delete(res);
      }
    }
  }

  getPublicState() {
    if (!this.state) {
      return {
        sessionId: this.id,
        status: this.status,
        currentIndex: this.currentIndex,
        symbol: this.params.symbol || config.defaultSymbol,
        strategyMode: this.params.strategyMode || 'ai_agent',
        tickIntervalMs: this.params.tickIntervalMs
      };
    }
    return {
      sessionId: this.id,
      status: this.status,
      currentIndex: this.currentIndex,
      totalMinutes: this.state.totalMinutes,
      symbol: this.state.symbol,
      name: this.state.name,
      strategyMode: this.state.strategyMode,
      capital: this.state.capital,
      sessionAnchorIso: this.state.sessionAnchorIso,
      priceDataSource: this.state.priceDataSource,
      dataSource: this.state.dataSource,
      tickIntervalMs: this.params.tickIntervalMs,
      strike: this.state.K,
      atmIv: this.state.atmIv,
      expiryT_years: this.state.T_years,
      riskLimits: this.state.riskLimits
    };
  }

  async start() {
    if (this.status === 'running') return;
    await this.ensureInitialized();
    this.status = 'running';
    this.stopRequested = false;
    this.pauseRequested = false;

    this.broadcast('session_start', {
      session: this.getPublicState(),
      optionsMeta: {
        strike: this.state.K,
        atmIv: this.state.atmIv,
        T_years: this.state.T_years,
        expiry: this.state.optionsChain?.expiry ?? null,
        dataSource: this.state.optionsChain?.dataSource ?? null
      },
      message: 'Trading session started'
    });

    try {
      await fetchInitialOptionPrice(this.state, this.state.series[0]);

      try {
        const liveNews = await getMarketNews(this.state.symbol, 5);
        this.state.liveNewsFetchedAt = liveNews.fetchedAt;
        this.state.liveNews = liveNews.articles.map(normalizeNewsArticle);
        this.broadcast('news', {
          liveNews: this.state.liveNews,
          fetchedAt: liveNews.fetchedAt,
          fetchedAtDisplay: liveNews.fetchedAtDisplay,
          dataSource: liveNews.dataSource
        });
      } catch (_) {
        this.state.liveNews = [];
        this.state.liveNewsFetchedAt = null;
      }

      this.loopPromise = this._runLoop();
      await this.loopPromise;
    } catch (err) {
      this.status = 'error';
      this.broadcast('error', { error: err.message });
      throw err;
    }
  }

  pause() {
    if (this.status === 'running') {
      this.pauseRequested = true;
      this.status = 'paused';
      this.broadcast('paused', { session: this.getPublicState() });
    }
  }

  resume() {
    if (this.status === 'paused') {
      this.pauseRequested = false;
      this.status = 'running';
      this.broadcast('resumed', { session: this.getPublicState() });
      if (!this.loopPromise) {
        this.loopPromise = this._runLoop();
      }
    }
  }

  stop() {
    this.stopRequested = true;
    this.pauseRequested = false;
    this.status = 'stopped';
    this.broadcast('stopped', { session: this.getPublicState() });
  }

  async _runLoop() {
    while (this.currentIndex < this.state.series.length && !this.stopRequested) {
      if (this.pauseRequested) {
        await sleep(250);
        continue;
      }

      const tickResult = await this.processTick(this.currentIndex);
      this.broadcast('tick', tickResult);

      if (this.currentIndex >= this.state.series.length - 1) {
        break;
      }

      this.currentIndex += 1;
      await sleep(this.params.tickIntervalMs);
    }

    if (this.stopRequested) {
      this.status = 'stopped';
      this.broadcast('stopped', {
        session: this.getPublicState(),
        summary: buildSummary(this.state),
        navCurve: this.state.navCurve,
        tradeLog: this.state.tradeLog
      });
    } else if (!this.stopRequested && this.currentIndex >= this.state.series.length - 1) {
      this.status = 'completed';
      const summary = buildSummary(this.state);
      this.broadcast('complete', {
        session: this.getPublicState(),
        summary,
        liveNews: this.state.liveNews,
        navCurve: this.state.navCurve,
        tradeLog: this.state.tradeLog,
        gemmaDecisions: this.state.gemmaDecisions,
        executionTimeMs: Date.now() - this.state.startTimeMs
      });
    }

    this.loopPromise = null;
  }

  async processTick(index) {
    const tick = this.state.series[index];

    if (index > 0 && (index % 30 === 0 || tick.newsEvent)) {
      await refreshOptionsChain(this.state, tick);
      this.state.lastChainRefreshIndex = index;
    }

    const greeksResult = await updateGreeks(this.state, tick, index);
    const isLast = index === this.state.series.length - 1;
    let gemmaResult = null;
    let riskResult = null;
    const enforceRisk = this.params.enforceRisk !== false;

    if (this.state.strategyMode === 'ai_agent') {
      if (shouldConsultGemma(this.state, tick, index)) {
        const observation = buildObservation(this.state, tick, index, {
          ...greeksResult.greeks,
          delta: greeksResult.delta,
          optionPrice: greeksResult.optionPrice
        });

        gemmaResult = await runGemmaTradingStep(observation, this.conversationHistory);

        if (gemmaResult.conversationAppend?.length) {
          this.conversationHistory.push(...gemmaResult.conversationAppend.slice(-4));
          if (this.conversationHistory.length > 20) {
            this.conversationHistory = this.conversationHistory.slice(-20);
          }
        }

        this.state.gemmaDecisions.push({
          minute: tick.minute,
          time: tick.time,
          decision: gemmaResult.decision,
          latencyMs: gemmaResult.latencyMs,
          status: gemmaResult.status,
          executedToolCalls: gemmaResult.executedToolCalls
        });

        const applyResult = applyDecisionWithRiskCheck(
          this.state,
          tick,
          gemmaResult.decision,
          { enforceRisk }
        );
        riskResult = applyResult.riskResult;

        if (index === 0 && this.state.optionContractsHeld === 0) {
          const fallbackResult = applyDecisionWithRiskCheck(this.state, tick, {
            action: 'OPEN_POSITION',
            quantity: 10,
            reason: 'Fallback — LLM did not open initial position.'
          }, { enforceRisk });
          if (fallbackResult.riskResult) riskResult = fallbackResult.riskResult;
        }

        if (isLast && this.state.optionContractsHeld > 0) {
          liquidateAll(this.state, tick, 'Market close — final liquidation.');
        }
      } else if (index === 0 && this.state.optionContractsHeld === 0) {
        const openResult = applyDecisionWithRiskCheck(this.state, tick, {
          action: 'OPEN_POSITION',
          quantity: 10,
          reason: 'Session open — establishing delta-neutral position.'
        }, { enforceRisk });
        riskResult = openResult.riskResult;
      }
    } else if (this.state.strategyMode === 'delta_hedge') {
      applyRulesDeltaHedgeStep(this.state, tick, index, { enforceRisk });
      if (isLast) liquidateAll(this.state, tick);
    } else if (this.state.strategyMode === 'buy_hold') {
      applyBuyHoldStep(this.state, tick, index);
    }

    const nav = recordNavPoint(this.state, tick);
    const recentTrades = this.state.tradeLog.filter((t) => t.minute === tick.minute);
    const riskRejections = recentTrades.filter((t) => t.action === 'REJECTED');

    return {
      index,
      minute: tick.minute,
      time: tick.time,
      simulationTimeIso: tick.simulationTimeIso,
      simulationTimeDisplay: tick.simulationTimeDisplay,
      wallClockTime: new Date().toISOString(),
      price: tick.price,
      volatility: tick.volatility,
      strike: this.state.K,
      atmIv: this.state.atmIv,
      newsEvent: tick.newsEvent || null,
      nav: Number(nav.toFixed(2)),
      delta: Number(this.state.currentDelta.toFixed(4)),
      optionPrice: Number(this.state.currentOptPrice.toFixed(2)),
      portfolio: {
        cash: Number(this.state.cash.toFixed(2)),
        sharesHeld: this.state.sharesHeld,
        optionContractsHeld: this.state.optionContractsHeld
      },
      gemma: gemmaResult
        ? {
            action: gemmaResult.decision.action,
            reason: gemmaResult.decision.reason,
            confidence: gemmaResult.decision.confidence,
            latencyMs: gemmaResult.latencyMs,
            status: gemmaResult.status,
            rawResponse: gemmaResult.rawResponse?.slice(0, 500)
          }
        : null,
      risk: riskResult
        ? {
            allowed: riskResult.allowed,
            rejectedReasons: riskResult.rejectedReasons,
            clipped: Boolean(riskResult.clippedDecision)
          }
        : null,
      riskRejections: riskRejections.map((t) => ({
        action: t.action,
        detail: t.detail,
        reason: t.reason,
        rejectedDecision: t.rejectedDecision
      })),
      recentTrades
    };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createSession(params) {
  cleanupStaleSessions();
  const session = new ArenaSession(params);
  sessions.set(session.id, session);
  return session;
}

function getSession(id) {
  return sessions.get(id) || null;
}

function cleanupStaleSessions() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL_MS && session.status !== 'running') {
      sessions.delete(id);
    }
  }
}

module.exports = {
  createSession,
  getSession,
  ArenaSession
};
