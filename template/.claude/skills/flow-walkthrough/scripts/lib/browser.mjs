// Headless Chrome or Edge driven by the DevTools protocol, without dependencies and without a browser
// extension. Base of capture.mjs and scan-screens.mjs (Node 22+, global WebSocket).
//
//   const browser = await openBrowser();
//   await browser.session('http://localhost:3000', token, 'token');  // session cookie (signed-in screen)
//   await browser.width(390);                                       // < 768 px emulates a phone
//   await browser.go('http://localhost:3000/courses', 4000);
//   const title = await browser.evaluate('document.title');
//   await browser.screenshot('out.png', 3000);
//   await browser.close();
//
// The cookie goes by `url` (origin), not by `domain`: Chrome refuses a domain cookie for "localhost",
// and the signed-in screen silently fell back to the sign-in page.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const CANDIDATES = [
  process.env.SDD_BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/microsoft-edge',
].filter(Boolean);

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function openBrowser() {
  if (typeof WebSocket === 'undefined') throw new Error('Node 22+ is required (global WebSocket).');
  const executable = CANDIDATES.find((c) => fs.existsSync(c));
  if (!executable) throw new Error('Chrome or Edge not found. Set SDD_BROWSER to the browser executable.');

  const port = 9300 + Math.floor(Math.random() * 500);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'sdd-browser-'));
  const proc = spawn(
    executable,
    ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'],
    { stdio: 'ignore' },
  );

  let tab;
  for (let i = 0; i < 40 && !tab; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      tab = list.find((t) => t.type === 'page');
    } catch {
      // not up yet
    }
    if (!tab) await sleep(250);
  }
  if (!tab) {
    proc.kill();
    throw new Error('the browser did not respond');
  }

  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => ((ws.onopen = resolve), (ws.onerror = reject)));
  let seq = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (message) => {
    const data = JSON.parse(message.data);
    if (data.id && pending.has(data.id)) {
      pending.get(data.id)(data);
      pending.delete(data.id);
    } else if (data.method) for (const listener of listeners) listener(data.method, data.params);
  };
  const cdp = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++seq;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });

  await cdp('Page.enable');
  await cdp('Network.enable');
  await cdp('Runtime.enable');

  let currentWidth = 1280;
  const browser = {
    cdp,
    /** Receives every DevTools event (e.g. "Network.responseReceived", "Runtime.exceptionThrown"). Returns the unsubscribe. */
    listen(listener) {
      listeners.push(listener);
      return () => listeners.splice(listeners.indexOf(listener), 1);
    },
    async width(width, height = 900) {
      currentWidth = width;
      await cdp('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 });
    },
    async session(origin, token, cookieName = 'token') {
      await cdp('Network.clearBrowserCookies');
      if (token) await cdp('Network.setCookie', { name: cookieName, value: token, url: origin, path: '/' });
    },
    /** Items written to localStorage before the page loads (e.g. a draft). */
    async storage(items) {
      await cdp('Page.addScriptToEvaluateOnNewDocument', {
        source: `for (const [k, v] of Object.entries(${JSON.stringify(items)})) localStorage.setItem(k, v);`,
      });
    },
    async go(url, wait = 4000) {
      const loaded = new Promise((resolve) => {
        const stop = browser.listen((method) => {
          if (method === 'Page.loadEventFired') {
            stop();
            resolve();
          }
        });
        setTimeout(resolve, 20000);
      });
      await cdp('Page.navigate', { url });
      await loaded;
      await sleep(wait);
    },
    /** Evaluates in the page; awaits promises; returns the value (JSON) or throws the page error. */
    async evaluate(expression) {
      const r = await cdp('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.result?.exceptionDetails) {
        const d = r.result.exceptionDetails;
        throw new Error(d.exception?.description || d.text || 'error in the page');
      }
      return r.result?.result?.value;
    },
    /** Whole page up to `maxHeight`: scrolls down in steps (content revealed on scroll) and back to the top. */
    async screenshot(out, maxHeight = 3000) {
      await browser.evaluate(`(async () => {
        const step = Math.max(300, Math.floor(window.innerHeight * 0.8));
        for (let y = 0; y < document.documentElement.scrollHeight; y += step) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); }
        window.scrollTo(0, document.documentElement.scrollHeight); await new Promise(r => setTimeout(r, 400));
        window.scrollTo(0, 0);
      })()`);
      await sleep(500);
      const measured = await browser.evaluate('Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)');
      const height = Math.min(maxHeight, Math.max(900, Math.ceil(measured ?? 900)));
      await browser.width(currentWidth, height);
      await sleep(600);
      const image = await cdp('Page.captureScreenshot', { format: 'png' });
      fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
      fs.writeFileSync(out, Buffer.from(image.result.data, 'base64'));
      await browser.width(currentWidth, 900);
      return { width: currentWidth, height };
    },
    async close() {
      try {
        ws.close();
      } catch {
        // already closed
      }
      const exited = new Promise((resolve) => (proc.exitCode !== null ? resolve() : proc.once('exit', resolve)));
      proc.kill();
      await Promise.race([exited, sleep(5000)]);
      // Windows keeps the profile locked for a moment after the exit; a leftover temp folder is not a failure.
      try {
        fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
      } catch {
        console.error(`Could not remove the temporary browser profile: ${profile}`);
      }
    },
  };
  return browser;
}
