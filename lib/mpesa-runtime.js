function getMpesaRuntime(env) {
  const environment = String(env.MPESA_ENV || '').trim().toLowerCase();
  if (!['sandbox', 'production'].includes(environment)) {
    throw new Error('MPESA_ENV must explicitly be sandbox or production.');
  }
  return {
    environment,
    baseUrl: environment === 'production'
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke',
  };
}

function describeMpesaRequest(runtime, operation, shortcode, callbackUrl) {
  const callback = new URL(callbackUrl);
  if (callback.protocol !== 'https:' || callback.username || callback.password) {
    throw new Error('M-Pesa callbacks must use HTTPS without embedded credentials.');
  }
  if (!/^\d+$/.test(String(shortcode || ''))) {
    throw new Error('M-Pesa shortcode must contain digits only.');
  }
  return {
    operation,
    environment: runtime.environment,
    apiHost: new URL(runtime.baseUrl).host,
    shortcode: String(shortcode),
    callbackHost: callback.host,
  };
}

module.exports = { getMpesaRuntime, describeMpesaRequest };
