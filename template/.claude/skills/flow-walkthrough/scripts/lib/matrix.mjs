// Rules of a complete matrix: every cell done, with evidence or justification, and the date of the
// second walkthrough. Reads a matrix written in any built-in locale.
import { allLabels } from './i18n.mjs';

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const GONE = new RegExp(allLabels('matrix.gone').map(escape).join('|'));
const SECOND_ROUND_PENDING = new RegExp(`(${allLabels('matrix.secondRound').map(escape).join('|')}):\\s*⏳`);
const CODE_ONLY = /por código|pelo código|from the code|by code|⚪/i;
const REAL_EVIDENCE = /captura|tela|chamada|teste|capture|screen|call|test|\.png/i;

export function verifyMatrix(text) {
  const failures = [];
  let section = '(header)';
  const totals = { done: 0, cells: 0 };

  for (const line of text.split(/\r?\n/)) {
    const heading = /^## (.+)$/.exec(line);
    if (heading) {
      section = heading[1];
      if (GONE.test(section)) failures.push(`${section}: remove the section (the screen or route left the code) or explain it.`);
      continue;
    }
    const row = /^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*([^|]*?)\s*\|\s*$/.exec(line);
    if (!row) continue;
    const [, number, point, status, evidence] = row;
    totals.cells += 1;
    const s = status.trim();
    const e = evidence.trim();
    if (!s || s === '⏳' || s === '?') failures.push(`${section} · ${number}. ${point}: not done`);
    else if (/^(✅|🔧)/.test(s) && !e) failures.push(`${section} · ${number}. ${point}: ${s} without evidence`);
    else if (/^(n\.a\.|🚫|⚠️)/i.test(s) && e.length < 8) failures.push(`${section} · ${number}. ${point}: ${s} without justification`);
    else if (CODE_ONLY.test(`${s} ${e}`) && !REAL_EVIDENCE.test(e)) failures.push(`${section} · ${number}. ${point}: "from the code" is not evidence`);
    else totals.done += 1;
  }

  if (SECOND_ROUND_PENDING.test(text)) failures.push('Header: date of the second walkthrough not filled in.');
  return { failures, totals };
}
