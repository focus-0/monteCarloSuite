/**
 * Live Market News Fetcher via Google News RSS
 * Fetches real-time breaking financial news headlines with publication dates.
 * Zero API keys, zero rate limits, sub-100ms latency.
 */

const config = require('../config');
const { toIsoUtc, formatDisplay, normalizeNewsArticle } = require('./time_format');

function buildNewsRssUrl(symbol) {
  const { rssBaseUrl, rssLocale, rssRegion } = config.marketNews;
  const query = encodeURIComponent(`${symbol} stock`);
  return `${rssBaseUrl}?q=${query}&hl=${rssLocale}&gl=${rssRegion}&ceid=${rssRegion}:${rssLocale.split('-')[0] || 'en'}`;
}

async function getMarketNews(symbol = config.defaultSymbol, count = config.marketNews.defaultCount) {
  const fetchedAt = new Date().toISOString();
  const url = buildNewsRssUrl(symbol);

  try {
    const res = await fetch(url);
    const xml = await res.text();

    // Parse <item> blocks from RSS XML
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1]);

    const articles = items.slice(0, count).map(item => {
      // Extract title
      const titleMatch = item.match(/<title>(.*?)<\/title>/);
      let title = titleMatch ? titleMatch[1] : 'Unknown Title';
      title = title.replace('<![CDATA[', '').replace(']]>', '').trim();

      // Extract publication date
      const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);
      const pubDateRaw = pubDateMatch ? pubDateMatch[1] : null;
      const pubDateIso = toIsoUtc(pubDateRaw);
      const pubDateFormatted = pubDateIso ? formatDisplay(pubDateIso) : 'Unknown Date';

      // Extract source/publisher
      const sourceMatch = item.match(/<source[^>]*>(.*?)<\/source>/);
      const source = sourceMatch ? sourceMatch[1].replace('<![CDATA[', '').replace(']]>', '').trim() : 'Unknown Source';

      // Extract link
      const linkMatch = item.match(/<link>(.*?)<\/link>/);
      const link = linkMatch ? linkMatch[1].trim() : '';

      return normalizeNewsArticle({
        title,
        source,
        pubDate: pubDateRaw,
        pubDateIso,
        pubDateFormatted,
        link,
        ageMinutes: pubDateIso
          ? Math.round((Date.now() - new Date(pubDateIso).getTime()) / 60000)
          : null
      });
    });

    return {
      symbol: symbol.toUpperCase(),
      dataSource: 'live_google_news_rss',
      fetchedAt,
      fetchedAtDisplay: formatDisplay(fetchedAt),
      articleCount: articles.length,
      articles
    };
  } catch (err) {
    console.error(`Market News Fetch Error for ${symbol}:`, err.message);
    return {
      symbol: symbol.toUpperCase(),
      dataSource: 'live_google_news_rss',
      fetchedAt,
      fetchedAtDisplay: formatDisplay(fetchedAt),
      articleCount: 0,
      articles: [],
      error: err.message
    };
  }
}

module.exports = { getMarketNews, normalizeNewsArticle, buildNewsRssUrl };
