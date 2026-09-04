const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const memberNo = process.env.WALKTHROUGH_MEMBER || 'MS041';
const password = process.env.WALKTHROUGH_PASSWORD;
const baseUrl = process.env.WALKTHROUGH_BASE_URL || 'http://localhost:3000';
const edgePath = process.env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const outDir = path.resolve(process.cwd(), 'docs', 'app-walkthrough', 'screenshots');
const debugPort = Number(process.env.WALKTHROUGH_DEBUG_PORT || 9223);

if (!password) {
  console.error('WALKTHROUGH_PASSWORD is required.');
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function waitForDevTools() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const targets = await getJson(`http://127.0.0.1:${debugPort}/json/list`);
      const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
      if (page) return page;
    } catch {
      await sleep(500);
    }
  }
  throw new Error('Browser DevTools did not start.');
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result || {});
        return;
      }
      const handlers = this.listeners.get(message.method) || [];
      handlers.forEach((handler) => handler(message.params || {}));
    });
  }

  open() {
    return new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  once(method) {
    return new Promise((resolve) => {
      const handler = (params) => {
        const handlers = this.listeners.get(method) || [];
        this.listeners.set(method, handlers.filter((item) => item !== handler));
        resolve(params);
      };
      const handlers = this.listeners.get(method) || [];
      handlers.push(handler);
      this.listeners.set(method, handlers);
    });
  }

  close() {
    this.ws.close();
  }
}

async function evaluate(page, expression) {
  const result = await page.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Evaluation failed');
  return result.result?.value;
}

async function navigate(page, url) {
  const load = page.once('Page.loadEventFired');
  await page.send('Page.navigate', { url });
  await Promise.race([load, sleep(6000)]).catch(() => {});
  await sleep(3000);
}

async function capture(page, fileName) {
  await sleep(1000);
  const metrics = await page.send('Page.getLayoutMetrics');
  const width = Math.max(1366, Math.ceil(metrics.contentSize?.width || 1366));
  const height = Math.min(2600, Math.max(900, Math.ceil(metrics.contentSize?.height || 900)));
  await page.send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await sleep(300);
  const screenshot = await page.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    fromSurface: true,
  });
  fs.writeFileSync(path.join(outDir, fileName), Buffer.from(screenshot.data, 'base64'));
  console.log(`Captured ${fileName}`);
}

async function login(page) {
  await navigate(page, `${baseUrl}/login`);
  await capture(page, '01-login.png');
  await evaluate(page, `
    (() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      const setValue = (input, value) => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      setValue(inputs[0], ${JSON.stringify(memberNo)});
      setValue(inputs[1], ${JSON.stringify(password)});
      document.querySelector('form').requestSubmit();
    })();
  `);

  for (let i = 0; i < 45; i += 1) {
    const loggedIn = await evaluate(page, `localStorage.getItem('isAuthenticated') === 'true'`);
    if (loggedIn) {
      await sleep(3500);
      return;
    }
    await sleep(1000);
  }
  throw new Error('Login did not complete.');
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sacco-walkthrough-'));
  const browser = spawn(edgePath, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    '--window-size=1440,1000',
    `${baseUrl}/login`,
  ], { stdio: 'ignore' });

  try {
    const version = await waitForDevTools();
    const page = new CdpClient(version.webSocketDebuggerUrl);
    await page.open();
    await page.send('Page.enable');
    await page.send('Runtime.enable');

    await login(page);

    const screens = [
      ['02-dashboard.png', '/', 'Dashboard'],
      ['03-member-profile.png', '/profile', 'Member Profile'],
      ['04-deposit-mpesa.png', '/deposit', 'Deposit via M-Pesa'],
      ['05-savings-statement.png', '/share-statement', 'Savings Statement'],
      ['06-withdrawable-statement.png', '/withdrawable', 'Withdrawable Statement'],
      ['07-loan-statement.png', '/loan-statement', 'Loan Statement'],
      ['08-apply-loan.png', '/apply-loan', 'Instant Loan Application'],
      ['09-dividends.png', '/dividends', 'Dividends'],
      ['10-guarantors.png', '/guarantors', 'Guarantors'],
      ['11-share-capital.png', '/share-capital', 'Share Capital'],
    ];

    for (const [fileName, route] of screens) {
      await navigate(page, `${baseUrl}${route}`);
      await capture(page, fileName);
    }

    await navigate(page, `${baseUrl}/create-account`);
    await capture(page, '12-create-account.png');
    await navigate(page, `${baseUrl}/change-password`);
    await capture(page, '13-change-password.png');

    page.close();
  } finally {
    browser.kill();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
