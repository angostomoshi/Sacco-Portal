const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'https://memberportal.metro-sacco.com',
      changeOrigin: true,
      secure: false,
      logLevel: 'debug',
      headers: {
        'Origin': 'https://memberportal.metro-sacco.com',
        'Referer': 'https://memberportal.metro-sacco.com/'
      },
      onProxyReq: (proxyReq, req, res) => {
        console.log(`[PROXY] Forwarding: ${req.method} ${req.url} -> https://memberportal.metro-sacco.com${req.url}`);
      },
      onError: (err, req, res) => {
        console.error('[PROXY ERROR]', err.message);
        res.status(500).json({ error: 'Proxy Error: ' + err.message });
      }
    })
  );
};