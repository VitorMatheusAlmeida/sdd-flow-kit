# Walkthrough protocol — step by step, with commands

`<skill>` = `.claude/skills/flow-walkthrough` (or `~/.claude/skills/flow-walkthrough` when installed for the user). `<dir>` = the walkthrough folder (see SKILL.md); the scripts find it by themselves. Run from the project. Node 22+, no dependency.

## 0. Setup
- `sdd.config.json` has what this flow needs: `frontend`, `backend`, `auth`, the environment URLs, `accounts.roles` with **two accounts of the same role**, `testEmail`.
- The flow entry in `<dir>/flows.json` ([`files.md`](files.md)): `screens` (globs over `frontend.pages`, or the list when `router` is `manual`), `exclude`, `controllers` (files over `backend.root`), `routeFilter`, `publicRoutes` with `examples`.
- Bring frontend and backend up; check that they answer. Set the test password in the variable of `accounts.passwordEnv`, or in `accounts.password` when it is the public password of the seed.

## 1. Inventory → matrix
```
node <skill>/scripts/inventory.mjs --flow R01
```
Creates `<dir>/matrix-R01.md` (or updates it, keeping what was filled in and adding new screens or routes). Read the whole list: is a screen this flow uses missing? Adjust the globs and run again.

## 2. Code reading
For each screen of the matrix: open the whole file; list actions (buttons, links, forms), API calls, states (empty, loading, error), texts. For each route: who calls it, who may, what it returns.

## 3. Script on the screen
Do the happy path and every stress of the script, with the right role. Write down the result seen.

## 4. Absences and path
For each screen: the list of point 4 and point 5. Every absence becomes a fix (or an owner decision).

## 5. Scans
```
node <skill>/scripts/scan-code.mjs --flow R01 > <dir>/scan-code-R01.md
node <skill>/scripts/scan-api.mjs --flow R01 > <dir>/scan-api-R01.md
node <skill>/scripts/scan-security.mjs --flow R01 --token <test token> > <dir>/scan-security-R01.md
```
`scan-security` reads the flow controllers (password or file without attempt limit, unvalidated id parameter) and calls the running API and screens (headers, `no-store` with a session, docs route). Run `commands.audit` once per walkthrough in each repository.

On the screen (browser automation tool): load `scripts/screen-probe.js` once per page (paste it, or `node <skill>/scripts/serve-probe.mjs` and fetch it) and call:
```
await __sddProbe({ minTouchTargetPx: 40 })              // current window (wide)
await __sddProbeAtWidth('/route', 390, { minTouchTargetPx: 40 })   // same origin, 390 px iframe
```
Every item raised: fix it, or justify it in the matrix (false positive).

### 5b. Script layer (adds; replaces nothing above)
With the flow scenario (`<dir>/scenarios-R01.json`, see [`files.md`](files.md)):
```
node <skill>/scripts/scan-accounts.mjs --flow R01 > <dir>/scan-accounts-R01.md
node <skill>/scripts/scan-screens.mjs  --flow R01 --captures <dir>/captures-R01/auto > <dir>/scan-screens-R01.md
```
Run **before** reading each screen (floor) and again in the second round (regression). **Read** the report and the captures; decide every alert (fix or justify). A mechanical defect found by hand after that becomes a check (ratchet).

## 6. Captures
- Each viewport of `walkthrough.viewports` → navigate → screenshot saved to disk (top and scrolling to the end).
- **Look at every capture**: what is repeated, cut, covered, misaligned, without hierarchy?
- **Design**: with the captures at hand, run `walkthrough.designSkill` (when configured) on every screen — also when the layout is not broken. Record in the matrix what it pointed out and what was fixed.
- Keep the paths in the evidence column of points 11 and 12.
- Without the automation browser: `node <skill>/scripts/capture.mjs <url> <width> <out.png> [wait-ms] [maxHeight]`. Signed-in screen: `SDD_CAPTURE_TOKEN=<token of a test account>` before the command; the cookie name comes from `auth.cookieName`.
- If a capture fails (hidden tab), **stop and fix it** (bring the window forward, reload); do not replace it with a measurement.

## 7. Fixes
Every finding: fix + test (backend and/or frontend), error catalog up to date, `commands.typecheck`, `commands.lint` and `commands.test` green.

## 8. Second round
Steps 3 to 6 again on **every** screen. Write the date in the matrix header. New finding → fix → third round.

## 9. Closing
```
node <skill>/scripts/verify-matrix.mjs <dir>/matrix-R01.md
```
It must exit with no failure. Update the script (spec-kit `roteiros/`), findings, cross-check and tasks. Report to the owner: what changed, per screen, with the captures; limitations with the reason.

## 10. PR
Only when the owner asks. Local commits before that are free, following the project's commit rules.
