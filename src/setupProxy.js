const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://192.168.4.6:3023',
      changeOrigin: true,
      secure: false,
      logLevel: 'debug',
      onProxyReq: (proxyReq, req, res) => {
        console.log(`[PROXY] Forwarding: ${req.method} ${req.url} -> http://192.168.4.6:3023${req.url}`);
      },
      onError: (err, req, res) => {
        console.error('[PROXY ERROR]', err.message);
        res.status(500).json({ error: 'Proxy Error: ' + err.message });
      }
    })
  );
};
