const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function setupProxy(app) {
  const target = process.env.REACT_APP_PROXY_TARGET;
  if (!target) {
    console.warn(
      '[setupProxy] REACT_APP_PROXY_TARGET is not set — /api requests will not be proxied. ' +
        'Copy client/.env.example to client/.env for local dev.'
    );
    return;
  }

  app.use(
    '/api',
    createProxyMiddleware({
      target,
      changeOrigin: true,
      // Allow long-running /api/agent/analyze (local 12B can take many minutes)
      proxyTimeout: 0,
      timeout: 0
    })
  );
};
