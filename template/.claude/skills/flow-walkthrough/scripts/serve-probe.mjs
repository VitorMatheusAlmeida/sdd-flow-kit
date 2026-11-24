#!/usr/bin/env node
// Serves screen-probe.js (with CORS) at http://localhost:4998/screen-probe.js, so a page driven by a
// browser automation tool can load it without pasting the file:
//   node serve-probe.mjs          (keep it running during the walkthrough; stop it at the end)
//   // in the page:
//   (0, eval)(await (await fetch('http://localhost:4998/screen-probe.js')).text())
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const folder = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.SDD_PROBE_PORT ?? 4998);

http
  .createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    const target = path.join(folder, path.basename(new URL(req.url, 'http://x').pathname));
    if (!/\.js$/.test(target) || !fs.existsSync(target)) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    res.end(fs.readFileSync(target));
  })
  .listen(port, () => console.log(`screen-probe.js at http://localhost:${port}/screen-probe.js`));
