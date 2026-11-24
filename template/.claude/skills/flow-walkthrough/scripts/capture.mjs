#!/usr/bin/env node
// Screen capture WITHOUT a browser extension: headless Chrome or Edge driven by the DevTools protocol
// (Node 22+, no dependency). Exact width (phone emulation below 768 px), waits for the page to settle
// and captures the whole page, up to maxHeight.
// Usage: node capture.mjs <url> <width> <out.png> [wait-ms=4000] [maxHeight=3000]
//   node capture.mjs http://localhost:3000/courses 390 walkthrough/captures-R01/courses-390.png
// Signed-in screens: set SDD_CAPTURE_TOKEN (session token of a test account); the cookie name comes
// from auth.cookieName in sdd.config.json (or SDD_CAPTURE_COOKIE). Screens that read localStorage:
// SDD_CAPTURE_STORAGE='{"key":"value"}'. A state that only exists after an action (open dialog,
// error): SDD_CAPTURE_JS is the body of an async function evaluated after the page settles.
import { openBrowser, sleep } from './lib/browser.mjs';
import { findConfig, loadProject } from './lib/context.mjs';

const [url, widthText = '390', out, waitText = '4000', maxHeightText = '3000'] = process.argv.slice(2);
if (!url || !out) {
  console.error('Usage: node capture.mjs <url> <width> <out.png> [wait-ms] [maxHeight]');
  process.exit(2);
}

const cookieName = process.env.SDD_CAPTURE_COOKIE ?? (findConfig() ? loadProject().auth.cookieName : 'token');
const browser = await openBrowser();
try {
  await browser.width(Number(widthText));
  if (process.env.SDD_CAPTURE_TOKEN) await browser.session(new URL(url).origin, process.env.SDD_CAPTURE_TOKEN, cookieName);
  if (process.env.SDD_CAPTURE_STORAGE) await browser.storage(JSON.parse(process.env.SDD_CAPTURE_STORAGE));
  await browser.go(url, Number(waitText));
  if (process.env.SDD_CAPTURE_JS) {
    const value = await browser.evaluate(`(async () => { ${process.env.SDD_CAPTURE_JS} })()`).catch((e) => `js failed: ${e.message}`);
    if (value !== undefined) console.log(`js: ${JSON.stringify(value)}`);
    await sleep(800);
  }
  const { width, height } = await browser.screenshot(out, Number(maxHeightText));
  console.log(`ok ${out} (${width}×${height})`);
} catch (error) {
  console.log(`failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
