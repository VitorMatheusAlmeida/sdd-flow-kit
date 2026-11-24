# Script layer — it adds to the walkthrough, never replaces it

The scripts give **full coverage and raw material**; the walkthrough (code reading, branches opened, captures looked at, the design skill) is what finds what nobody foresaw. A matrix made "green" by a script is not evidence: a cell closes only with what a person saw and decided.

## Why both layers

What each layer tends to catch, measured on real walkthroughs:

| Finding | Who caught it |
|---|---|
| A 404 with a different message for foreign and nonexistent (it revealed what exists) | **script** (`scan-accounts` parity), after the manual pass had marked ✅ |
| Fields without a bound label, icon-only button without a name, 28–32 px touch targets | **script** (`scan-screens`), after the manual pass had marked ✅ |
| Technical text on the screen, a success shown in red, text explaining a rule | **reading** the screen |
| A draft with no link in the list, two tab bars with the same names | **reading the capture** + the design skill |
| A double click creating two records, a validation that disappeared | **stress pass** on the screen |
| A field that should be filled from another source, a box out of tone | **the owner** looking at the screen |

A script alone finds about half; reading alone misses what is mechanical and repetitive. Together they find more than either.

## What the scripts do and do not do

- **Do:** every call × every account; every screen × every account × every viewport; foreign × nonexistent parity (status, code **and message**); touch targets on a phone; bound labels and accessible names; missing accents, Title Case, `undefined`; database id in the URL; console and network errors; overlap; horizontal scroll; whole-page capture per account.
- **Do not:** open a dialog, force an error, an empty state, two tabs, a double click; judge hierarchy, tone or what is missing; measure contrast. That belongs to the walkthrough.
- **Do not approve or fail.** They dump raw material and raise mechanical alerts. Every alert is decided in the matrix: fixed, or justified (false positive with the reason).

## Per flow

1. Write `<dir>/scenarios-<flow>.json` ([`files.md`](files.md)). It is the only new file per flow.
2. `scan-accounts.mjs --flow <id>` and `scan-screens.mjs --flow <id> --captures <dir>/captures-<id>/auto`, before reading each screen (floor) and again in the second round (regression).
3. Read the reports and the captures; decide each alert in the matrix.

## The ratchet

Every defect found **by hand** whose class is mechanical becomes a check, so the next flow already starts catching it:

- a project rule over the code → `walkthrough.codeRules` in `sdd.config.json` (`point`, `pattern`, `onlyIn`, `message`);
- a domain check over the API → a call (with `owners`, `parity`) in the flow scenario;
- a generic rule (valid for any project) → a change to this skill's scripts, through the kit repository.

## What the script layer must not become

- A substitute for the reviewed capture (points 11 and 12) or for the design skill.
- A reason to skip the stress and privacy passes.
- Automatic approval of a matrix cell.
