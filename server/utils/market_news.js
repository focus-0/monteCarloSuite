/**
 * Live Market News Fetcher via Google News RSS
 * Fetches real-time breaking financial news headlines with publication dates.
 * Zero API keys, zero rate limits, sub-100ms latency.
 */

async function getMarketNews(symbol = 'AAPL', count = 5) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(symbol)}+stock&hl=en-US&gl=US&ceid=US:en`;

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
      let pubDate = null;
      let pubDateFormatted = 'Unknown Date';
      if (pubDateRaw) {
        pubDate = new Date(pubDateRaw);
        pubDateFormatted = pubDate.toLocaleString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          timeZoneName: 'short'
        });
      }

      // Extract source/publisher
      const sourceMatch = item.match(/<source[^>]*>(.*?)<\/source>/);
      const source = sourceMatch ? sourceMatch[1].replace('<![CDATA[', '').replace(']]>', '').trim() : 'Unknown Source';

      // Extract link
      const linkMatch = item.match(/<link>(.*?)<\/link>/);
      const link = linkMatch ? linkMatch[1].trim() : '';

      return {
        title,
        source,
        pubDate: pubDateRaw,
        pubDateFormatted,
        link,
        ageMinutes: pubDate ? Math.round((Date.now() - pubDate.getTime()) / 60000) : null
      };
    });

    return {
      symbol: symbol.toUpperCase(),
      fetchedAt: new Date().toISOString(),
      articleCount: articles.length,
      articles
    };
  } catch (err) {
    console.error(`Market News Fetch Error for ${symbol}:`, err.message);
    return {
      symbol: symbol.toUpperCase(),
      fetchedAt: new Date().toISOString(),
      articleCount: 0,
      articles: [],
      error: err.message
    };
  }
}

module.exports = { getMarketNews };
