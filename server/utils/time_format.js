/**
 * Standard timestamp helpers — ISO 8601 UTC for machine fields, human-readable companions.
 */

function toIsoUtc(date) {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function formatDisplay(iso) {
  if (!iso) return 'Unknown';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return d.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'UTC',
    timeZoneName: 'short'
  });
}

/** US cash session open anchor for simulated replay (9:30 AM America/New_York → UTC ISO). */
function getSessionAnchorIso(sessionDateStr) {
  const dateStr = sessionDateStr || new Date().toISOString().slice(0, 10);
  // 9:30 AM ET ≈ 14:30 UTC (EST); sufficient for synthetic replay labeling
  return `${dateStr}T14:30:00.000Z`;
}

function buildSimulationTickTime(minute, sessionAnchorIso) {
  const anchor = new Date(sessionAnchorIso);
  const simTime = new Date(anchor.getTime() + minute * 60 * 1000);
  return {
    simulationTimeIso: simTime.toISOString(),
    simulationTimeDisplay: formatDisplay(simTime.toISOString())
  };
}

function normalizeNewsArticle(article) {
  const pubDateIso = article.pubDateIso || toIsoUtc(article.pubDate);
  return {
    title: article.title,
    source: article.source,
    link: article.link || '',
    pubDateIso,
    pubDateFormatted: article.pubDateFormatted || formatDisplay(pubDateIso),
    ageMinutes: article.ageMinutes ?? (pubDateIso
      ? Math.round((Date.now() - new Date(pubDateIso).getTime()) / 60000)
      : null)
  };
}

module.exports = {
  toIsoUtc,
  formatDisplay,
  getSessionAnchorIso,
  buildSimulationTickTime,
  normalizeNewsArticle
};
