#!/usr/bin/env node
// Script layer of points 5 to 14 and 16: opens every screen of the scenario in a headless browser,
// per account and per width (walkthrough.viewports), and dumps raw material: final URL, screen-probe
// result, console errors, 4xx/5xx network responses, the whole page text. It ADDS to the walkthrough
// and to the reviewed captures; it replaces neither. It does not open screen branches (dialog, error,
// empty state): that belongs to the reading pass.
//
// Usage: node scan-screens.mjs --flow R01 [--scenario <file>] [--password <pw>] [--captures <dir>] > <dir>/scan-screens-R01.md
//
// Alerts (codes): horizontal-scroll, small-target, covered, missing-accent, plural-with-1, title-case,
// garbage (undefined/NaN), repeated-text, toast, field-without-label, no-name, wrong-money, id-in-url,
// console-error, network-4xx/5xx, redirected(<url>), not-found (expected for a non-owner).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBrowser } from './lib/browser.mjs';
import { cell, loadProject, parseArgs, run, today, walkthroughDir } from './lib/context.mjs';
import { translator } from './lib/i18n.mjs';
import { loadScenario, replace, requireSetup, runSteps, signIn } from './lib/scenario.mjs';
import { textRules } from './lib/text-rules.mjs';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function probeOptions(project) {
  const rules = textRules(project.locale);
  return {
    minTouchTargetPx: project.walkthrough.minTouchTargetPx,
    missingAccents: Object.keys(rules.missingAccents),
    pluralNouns: project.walkthrough.text.pluralNouns,
    connectives: rules.connectives,
    sentenceCase: project.walkthrough.decisions.sentenceCase,
    wrongMoney: rules.wrongMoney,
    toastSelector: project.walkthrough.selectors.toast,
  };
}

function flagsOf(found, finalUrl, route, text, consoleErrors, network, project) {
  const flags = [];
  const has = (key) => found[key]?.length;
  if (found.horizontalScroll) flags.push('horizontal-scroll');
  if (has('smallTargets')) flags.push(`small-target(${found.smallTargets.length})`);
  if (has('covered')) flags.push('covered');
  if (has('missingAccents')) flags.push('missing-accent');
  if (has('pluralWithOne')) flags.push('plural-with-1');
  if (has('titleCase')) flags.push('title-case');
  if (has('garbage')) flags.push('garbage');
  if (has('repeatedText')) flags.push('repeated-text');
  if (has('toasts')) flags.push('toast');
  if (has('fieldsWithoutLabel')) flags.push('field-without-label');
  if (has('noName')) flags.push('no-name');
  if (has('wrongMoney')) flags.push('wrong-money');
  if (project.walkthrough.decisions.dbIdsInUrl !== 'ignore' && UUID.test(finalUrl)) flags.push('id-in-url');
  if (consoleErrors.length) flags.push('console-error');
  if (network.some((r) => r.startsWith('5'))) flags.push('network-5xx');
  else if (network.length) flags.push('network-4xx');
  if (finalUrl.split('?')[0] !== route.split('?')[0]) flags.push(`redirected(${finalUrl.split('?')[0]})`);
  if (text.toLowerCase().includes(project.walkthrough.notFoundText.toLowerCase())) flags.push('not-found');
  return flags;
}

async function main() {
  const args = parseArgs();
  const project = loadProject(args);
  const t = translator(project.locale);
  const scenario = loadScenario(project, walkthroughDir(project, args), args);
  if (!scenario.web) throw new Error('No frontendUrl in the environment of sdd.config.json (or pass --site).');
  const tokens = await signIn(project, scenario, args);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const probe = fs.readFileSync(path.join(here, 'screen-probe.js'), 'utf8');
  const options = JSON.stringify(probeOptions(project));
  const widths = scenario.widths ?? project.walkthrough.viewports;

  const { vars, failures: setupFailures } = await runSteps(project, scenario, tokens, scenario.setup);
  await requireSetup(project, scenario, tokens, vars, setupFailures, args);
  const browser = await openBrowser();
  const blocks = [];
  const alerts = [];

  try {
    for (const screen of scenario.screens ?? []) {
      const route = replace(screen.route, vars);
      for (const account of screen.as ?? ['anonymous']) {
        for (const width of widths) {
          await browser.session(scenario.web, tokens[account], project.auth.cookieName);
          await browser.width(width);
          const consoleErrors = [];
          const network = [];
          const stop = browser.listen((method, p) => {
            if (method === 'Runtime.exceptionThrown') consoleErrors.push(p.exceptionDetails?.exception?.description?.split('\n')[0] ?? p.exceptionDetails?.text);
            if (method === 'Runtime.consoleAPICalled' && p.type === 'error') consoleErrors.push(p.args?.map((a) => a.value ?? a.description).join(' ').slice(0, 160));
            if (method === 'Network.responseReceived' && p.response.status >= 400 && p.type !== 'Image' && p.type !== 'Font') {
              network.push(`${p.response.status} ${new URL(p.response.url).pathname}`);
            }
          });
          await browser.go(scenario.web + route, screen.wait ?? 4500);
          let found = {};
          let text = '';
          let finalUrl = route;
          try {
            await browser.evaluate(probe);
            found = await browser.evaluate(`window.__sddProbe(${options})`);
            text = await browser.evaluate("(document.querySelector('main') || document.body).innerText");
            finalUrl = await browser.evaluate('location.pathname + location.search');
          } catch (error) {
            found = { probeError: error.message };
          }
          stop();

          const flags = flagsOf(found, finalUrl, route, text, consoleErrors, network, project);
          for (const f of flags) alerts.push(`${route} · ${account} · ${width}px: ${f}`);
          if (typeof args.captures === 'string') {
            const name = `${route.replace(/[^\w]+/g, '_').replace(/^_|_$/g, '') || 'root'}-${account}-${width}.png`;
            await browser.screenshot(path.join(args.captures, name), screen.maxHeight ?? 3000);
          }
          blocks.push({ route, account, width, flags, found, consoleErrors, network, text, finalUrl });
        }
      }
    }
  } finally {
    await browser.close();
  }
  const { failures: cleanupFailures } = await runSteps(project, scenario, tokens, scenario.cleanup, vars);

  console.log(`# ${t('scr.title', { name: scenario.name ?? scenario.file })}\n`);
  console.log(`${t('scr.meta', { web: scenario.web, widths: widths.join(', '), n: (scenario.screens ?? []).length, date: today() })}\n`);
  console.log(`${t('scr.raw')}\n`);
  if (setupFailures.length) console.log(`${t('report.setupFailed')} ${setupFailures.join(' · ')}\n`);
  console.log(`## ${t('report.alerts')} (${alerts.length})\n`);
  console.log(alerts.length ? alerts.map((a) => `- ${a}`).join('\n') : t('report.noAlerts'));
  console.log(`\n## ${t('scr.screens')}\n`);
  for (const b of blocks) {
    console.log(`### ${b.route} · ${b.account} · ${b.width} px\n`);
    console.log(`${t('scr.finalUrl')}: \`${b.finalUrl}\` · ${t('scr.alerts')}: ${b.flags.join(' ') || '—'}\n`);
    if (b.consoleErrors.length) console.log(`${t('scr.console')}: ${b.consoleErrors.map(cell).join(' · ')}\n`);
    if (b.network.length) console.log(`${t('scr.network')}: ${[...new Set(b.network)].join(' · ')}\n`);
    console.log(`\`\`\`json\n${JSON.stringify(b.found, null, 1)}\n\`\`\`\n`);
    console.log(`${t('scr.pageText')}:\n\n\`\`\`\n${b.text.slice(0, 3000)}\n\`\`\`\n`);
  }
  if (cleanupFailures.length) console.log(`${t('report.cleanupFailed')} ${cleanupFailures.join(' · ')}`);
}

run(main);
