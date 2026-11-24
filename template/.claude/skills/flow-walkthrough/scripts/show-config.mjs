#!/usr/bin/env node
// Shows what the walkthrough scripts resolved and where each value came from: sdd.config.json, the code
// (NestJS adapter), the environment's env file, or a default. No secret is printed.
// Usage: node show-config.mjs [--env <name>]
import { loadProject, parseArgs, run, walkthroughDir } from './lib/context.mjs';

function main() {
  const args = parseArgs();
  const project = loadProject(args);
  const show = (key, value) => {
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value ?? '—');
    console.log(`${key.padEnd(20)} ${text.padEnd(52)} ${project.sources[key] ?? 'sdd.config.json'}`);
  };
  console.log(`config               ${project.file}`);
  console.log(`environment          ${project.env.name ?? '—'} (${project.env.file ?? 'no env file'})`);
  console.log(`locale               ${project.locale}`);
  console.log(`walkthrough dir      ${walkthroughDir(project, args)}\n`);
  show('env.backendUrl', project.env.backendUrl);
  show('env.frontendUrl', project.env.frontendUrl);
  show('backend.prefix', project.backend.prefix);
  show('backend.healthPath', project.backend.healthPath);
  show('backend.docsPath', project.backend.docsPath);
  show('backend.errorShape', project.backend.errorShape);
  show('auth.loginPath', project.auth.loginPath);
  show('auth.loginBody', project.auth.loginBody);
  show('auth.tokenPath', project.auth.tokenPath);
  show('auth.cookieName', project.auth.cookieName);
  console.log(`\naccounts             ${Object.keys(project.accounts.roles).join(', ') || '—'}`);
  const password = process.env[project.accounts.passwordEnv] ? `$${project.accounts.passwordEnv}` : project.accounts.password ? 'accounts.password' : '--password (read it from accounts.source)';
  console.log(`password             ${password}`);
}

run(main);
