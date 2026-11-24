# The 18 points — what to look at, how to prove it, traps

Accepted evidence: a saved capture (file path), a test (name), a real call (route + status + response excerpt) or a step on the screen described with the result seen. "From the code" is only a **complement**.

Project decisions come from `walkthrough.decisions` in `sdd.config.json`; domain rules from `walkthrough.domainRules`.

---

## 1. Happy path and stress run for real
- **Look at**: every step of the script and every stress (E#), done with the right role, in the running environment.
- **Prove**: result seen on the screen (exact text), or a real call when the case is about the contract.
- **Trap**: ✅ because the unit test passes; "⚪ from the code". A unit test proves the rule, not the screen.

## 2. Screen × route cross-check
- **Look at**: `inventory.mjs` lists every page and every route of the flow's controllers. For each route: which screen uses it (the matrix shows "Used by")? For each screen: was it opened?
- **Typical findings**: route without screen (missing tool), screen nobody walked, legacy unused route, redirect to the wrong place.

## 3. Second round
- **Look at**: after the fixes, redo protocol steps 3 to 6 on every screen, not only the fixed ones. A fix often breaks the neighbour.
- **Prove**: date of the second round in the matrix header and "no new finding" (or the new ones, fixed, and a third round).

## 4. Absences
- **Look at**, on each screen, for each thing a person creates: can they **read** it, **edit** it, **delete or cancel** it, **undo** (when it makes sense), go **back** and **leave** without losing what they did?
- **Also**: information the person needs and the screen lacks (history, next step, status).
- **Trap**: checking only what the script lists.

## 5. Path to the page
- **Look at**: where the person comes from (menu, profile, shortcuts, e-mail, notification). Does every shortcut lead to the right place? Any dead end?
- **Prove**: the click from the entry point, not the typed URL.

## 6. Floating notice only when needed
- **Look at**: every toast. If the screen already shows the result (the list updates, the page changes, the button changes), the notice goes. A field error stays next to the field; an action error, next to the button.
- **Stays**: what happens out of sight (real time), or when the person leaves the screen with no other signal.
- **Scan**: `scan-code.mjs` lists them; `walkthrough.selectors.toast` finds them on the screen.

## 7. Short text
- **Look at**: every sentence of the screen. No explaining the mechanism ("we store", "server", "token", "automatically", "for security reasons"), no advice, no repeating the title. Spelling and accents of the locale. Capital letter only at the start (when `decisions.sentenceCase`). Plural ("1 available").
- **Scan**: `scan-code.mjs` (missing accents, Title Case, mechanism words, long text) and `screen-probe.js` (visible text; plural nouns from `walkthrough.text.pluralNouns`).

## 8. Locale formats
- **Look at**: money with the locale formatter (never `toFixed`), "Free" instead of a zero price, dates and numbers in `project.locale`.
- **Money**: every value on the screen comes from the database or a server function, never from a typed field; total and fees itemized where a purchase appears. Check the domain rules documents.

## 9. States
- **Look at** and **provoke**: empty list; loading; load error with "Try again"; no permission (another role, foreign data); session expired in the middle of an action; network down; double click; two tabs.
- **How to provoke**: network — replace `fetch`/`XMLHttpRequest.prototype.send` with an error; session — sign out in another tab and act; double — two clicks in the same tick.

## 10. Clear errors
- **Look at**: the sentence the person reads on each failure; it comes from the catalog; never "Request failed with status code", another language, `undefined`. A load failure **never** becomes "no items".
- **Scan**: empty `catch`, `.catch(() => [])`, `console.*` instead of handling; `scan-accounts` raises `off-catalog`.

## 11. Phone (narrowest viewport)
- **Look at** the **capture**: horizontal scroll, cut text, button covered by a floating button, small target, block order, visible call to action.
- **Prove**: saved capture + `screen-probe.js` with no open item.
- **Design**: after looking at the capture, run `walkthrough.designSkill` (when configured) on the screen, even if nothing is broken (hierarchy, typography, rhythm, consistency with neighbouring screens). Record what it pointed out and what was done.

## 12. Wide desktop
- **Look at** the **capture**: hierarchy, alignment, repeated information (e.g. the same address twice), empty spaces, columns.
- **Design**: run the design skill too (see point 11): a whole layout does not exempt the design look.

## 13. Accessibility
- **Look at**: every field with a bound label, a name on icon-only buttons, no interactive element inside another (render one element), `role="alert"` on errors, visible focus, images with `alt`.

## 14. Security and data
Go through the whole list on every screen and route of the flow. What the screen does not use becomes "n.a." with the reason.

**Data that goes out**
- **Database id in a frontend route** (`decisions.dbIdsInUrl: "forbid"`): the address hands out data of the database. The route uses a public identifier (slug, short code) and the API translates it. It also applies to links built with `${x.id}`. With `"ignore"`, this item is 🚫 "project decision".
- A public response has no id, e-mail, document or phone of a person; foreign data answers a neutral 404.
- Personal data on the screen is whole only where the person needs it whole (documents and bank data masked in lists and notices).
- Private personal documents, with signed links that expire; no secret, token or password in a response, log or URL.

**Who may**
- The rule exists on the server (not only a hidden button) and is tested **with two accounts**: account A tries to read and change B's data by id (IDOR) and gets 404.
- Route ids are validated; a field the route does not know is refused or stripped.

**Input**
- Uploads validated by content and size; text from people escaped in HTML and e-mail.
- A route that **checks a password or code**, **receives a file** or **sends an e-mail** has its own attempt limit (a general limit does not stop password guessing).
- A sensitive action (change e-mail, change bank data, leave a role) asks for the password again or goes back to review; a repeated operation (double click, resend) does not duplicate the effect.

**Session and browser**
- Signed-in responses with `Cache-Control: no-store`; session cookie `HttpOnly`; token never in `localStorage`, `sessionStorage` or the URL.
- A return destination (`returnTo`, `next`, `redirect`) accepts only a path of the own site, through one single safe-redirect helper (refuses `//` and `/\`); never a loose `startsWith("/")`.
- External links with `rel="noopener noreferrer"`; raw HTML only with escaped content.
- Headers: `X-Frame-Options` (or CSP `frame-ancestors`), `X-Content-Type-Options`, `Referrer-Policy`; HSTS on the API; no `X-Powered-By`.

**Environment**
- API documentation (`backend.docsPath`) closed in production; seed credentials out of git.
- `commands.audit` in each repository: a high or critical issue in a package the flow uses becomes a finding.

- **Scans**: `scan-api.mjs` (data that goes out), `scan-security.mjs` (attempt limits, unvalidated ids, headers, cache, docs), `scan-code.mjs` (id in the route, open redirect, token in the browser), `scan-accounts.mjs` (foreign-2xx, parity).

## 15. Rule on the server, with a test
- **Look at**: every rule the screen applies also exists in the API, with a test. Errors in the catalog.
- **Domain rules**: when the flow touches a subject of `walkthrough.domainRules`, check the screen and the server against the document. Values (total, fee, refund) are computed on the server from stored data; the route does not accept a value from the client.

## 16. URLs
- **Look at**: path in `decisions.urlLanguage`; no personal data or person id in the bar; database id per `decisions.dbIdsInUrl`; old paths redirected.
- **When the route already uses an id** (and the decision is `forbid`): not a reason to skip. Record it as a finding with the list of routes; the change goes with the walkthrough of the flow that owns the screen.

## 17. Resolve in the walkthrough
- Fix on the spot everything that is not a full redesign. "Record for later" only with the owner's decision.

## 18. Before the PR
- Documents (script, findings, cross-check, matrix, tasks) up to date; captures of the screens that changed shown to the owner; PR only on the owner's request; no migration without authorization.
