// In-page probe of a screen (points 6 to 13). Load it once per page (paste it into the browser
// automation tool, or fetch it from serve-probe.mjs) and call:
//   await __sddProbe(options)                          → current window
//   await __sddProbeAtWidth('/route', 390, options)    → the route in a 390 px iframe (same origin)
//   await __sddShowAtWidth('/route', 390)              → shows the route at 390 px for a screenshot; __sddCloseShow()
// Returns a short summary (JSON). It does not replace the capture: it says where to look.
// options (all optional; scan-screens.mjs fills them from sdd.config.json):
//   minTouchTargetPx (40), missingAccents (words), pluralNouns (words), connectives (words),
//   sentenceCase (true), wrongMoney (regex source), toastSelector ('[data-sonner-toast]')
(() => {
  const INTERACTIVE = 'button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=switch], [role=checkbox], [role=combobox]';
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const words = (list) => (list && list.length ? new RegExp(`\\b(${list.map(escapeRe).join('|')})\\b`, 'gi') : null);

  function visible(el) {
    const r = el.getBoundingClientRect();
    const st = el.ownerDocument.defaultView.getComputedStyle(el);
    return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none' && Number(st.opacity) > 0.05;
  }
  function nameOf(el) {
    return (el.getAttribute('aria-label') || el.innerText || el.labels?.[0]?.innerText || el.closest('label')?.innerText || el.value || el.placeholder || el.title || el.tagName)
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 40);
  }

  function analyze(doc, options = {}) {
    const o = { minTouchTargetPx: 40, connectives: [], sentenceCase: true, toastSelector: '[data-sonner-toast]', ...options };
    const win = doc.defaultView;
    const root = doc.querySelector('main') || doc.body;
    const width = win.innerWidth;
    const r = { width, horizontalScroll: doc.documentElement.scrollWidth > width + 1 };

    // Off screen to the right (carousels with their own scroll are ignored).
    r.offScreen = [...root.querySelectorAll('*')]
      .filter((el) => {
        const b = el.getBoundingClientRect();
        if (!(b.width > 0 && b.right > width + 2)) return false;
        if (win.getComputedStyle(el).position === 'fixed') return false;
        return !el.closest('[class*="overflow-x"],[class*="snap-x"],[class*="overflow-hidden"],[class*="overflow-auto"]');
      })
      .slice(0, 6)
      .map((el) => `${el.tagName.toLowerCase()}: ${nameOf(el)}`);

    // Out of the count: what is hidden from screen readers (`aria-hidden`, e.g. the mirror <input> of a
    // custom switch or select) and what is clipped by a scrolling container (a tab out of view).
    const hidden = (el) => !!el.closest('[aria-hidden="true"]');
    const clipped = (el) => {
      const b = el.getBoundingClientRect();
      const cx = b.left + b.width / 2;
      for (let p = el.parentElement; p && p !== doc.body; p = p.parentElement) {
        if (win.getComputedStyle(p).overflowX === 'visible') continue;
        const pb = p.getBoundingClientRect();
        if (cx < pb.left || cx > pb.right) return true;
      }
      return false;
    };
    // A small control with a big label bound to it (label[for] or wrapping label) is a big enough target.
    const bigLabel = (el, min) => {
      const l = (el.id && doc.querySelector(`label[for="${CSS.escape(el.id)}"]`)) || el.closest('label');
      if (!l) return false;
      const lb = l.getBoundingClientRect();
      return lb.height >= min && lb.width >= min;
    };
    const who = (el) =>
      [el.tagName.toLowerCase(), el.id && `#${el.id}`, el.name && `name=${el.name}`, el.type && el.tagName === 'INPUT' && `type=${el.type}`,
        el.getAttribute('href') && `href=${el.getAttribute('href').slice(0, 40)}`, el.placeholder && `ph="${el.placeholder.slice(0, 20)}"`]
        .filter(Boolean)
        .join(' ');
    const interactive = [...doc.querySelectorAll(INTERACTIVE)].filter(visible).filter((el) => !hidden(el));

    // Touch (phone, < 768 px): minTouchTargetPx. With a mouse: 24 px. A link inside a paragraph is tolerated.
    const min = width < 768 ? o.minTouchTargetPx : 24;
    r.smallTargets = interactive
      .filter((el) => {
        const b = el.getBoundingClientRect();
        const inText = el.tagName === 'A' && el.closest('p, li') && b.height >= 18;
        return !inText && !bigLabel(el, min) && (b.height < min || b.width < min) && !(b.width > 200 && b.height >= min - 4);
      })
      .slice(0, 10)
      .map((el) => {
        const b = el.getBoundingClientRect();
        return `${nameOf(el)} (${Math.round(b.width)}×${Math.round(b.height)})`;
      });

    // Overlap: the centre of the control is covered by another element (e.g. a floating button).
    r.covered = interactive
      .filter((el) => {
        const b = el.getBoundingClientRect();
        const x = b.left + b.width / 2;
        const y = b.top + b.height / 2;
        if (x < 0 || y < 0 || x > width || y > win.innerHeight || clipped(el)) return false;
        const top = doc.elementFromPoint(x, y);
        return top && top !== el && !el.contains(top) && !top.contains(el);
      })
      .slice(0, 8)
      .map((el) => {
        const b = el.getBoundingClientRect();
        const top = doc.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        return `${nameOf(el)} ← covered by ${top.tagName.toLowerCase()} ${nameOf(top)}`;
      });

    r.noName = interactive.filter((el) => !nameOf(el) || nameOf(el) === el.tagName).slice(0, 8).map(who);
    r.fieldsWithoutLabel = [...root.querySelectorAll('input:not([type=hidden]):not([type=file]), select, textarea')]
      .filter(visible)
      .filter((el) => !hidden(el))
      .filter((el) => {
        if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return false;
        if (el.id && doc.querySelector(`label[for="${CSS.escape(el.id)}"]`)) return false;
        return !el.closest('label');
      })
      .slice(0, 8)
      .map(who);
    r.imagesWithoutAlt = [...root.querySelectorAll('img')].filter((i) => visible(i) && !i.hasAttribute('alt')).length;
    r.linkWithButton = [...root.querySelectorAll('a button, button a')].length;

    const text = root.innerText;
    if (o.wrongMoney) r.wrongMoney = [...new Set(text.match(new RegExp(o.wrongMoney, 'g')) || [])].slice(0, 5);
    // Count 1 with the noun in the plural ("1 orders"): the singular is not handled.
    if (o.pluralNouns?.length) {
      const re = new RegExp(`(?:^|[^\\d.,])1 (?:[a-zà-ú]+ )?(?:${o.pluralNouns.map(escapeRe).join('|')})\\b`, 'gi');
      r.pluralWithOne = [...new Set((text.match(re) || []).map((p) => p.trim()))].slice(0, 8);
    }
    const accents = words(o.missingAccents);
    if (accents) r.missingAccents = [...new Set((text.match(accents) || []).map((p) => p.toLowerCase()))].slice(0, 12);
    r.garbage = [...new Set(text.match(/\b(undefined|null|NaN|\[object Object\]|Invalid Date)\b/g) || [])];
    if (o.sentenceCase) {
      const connectives = new Set(o.connectives.map((c) => c.toLowerCase()));
      r.titleCase = [...root.querySelectorAll('h1,h2,h3,h4,button,label,th')]
        .filter(visible)
        .map((el) => el.innerText.trim())
        .filter((t) => {
          const rest = t.replace(/^[\d.]+\s+/, '').split(/\s+/).slice(1).filter((x) => x.length > 2 && !connectives.has(x.toLowerCase()));
          return rest.length >= 1 && rest.every((x) => /^[A-ZÀ-Ú][a-zà-ú]/.test(x));
        })
        .slice(0, 8);
    }

    // Repeated text blocks (≥ 25 characters), e.g. the same address twice.
    const seen = new Map();
    for (const el of root.querySelectorAll('p, span, h2, h3, li, dd, div')) {
      if (el.children.length) continue;
      const t = el.innerText?.trim();
      if (!t || t.length < 25 || !visible(el)) continue;
      seen.set(t, (seen.get(t) || 0) + 1);
    }
    r.repeatedText = [...seen].filter(([, n]) => n > 1).map(([t, n]) => `${n}× ${t.slice(0, 60)}`).slice(0, 6);
    r.toasts = o.toastSelector ? [...doc.querySelectorAll(o.toastSelector)].map((t) => t.innerText.trim().slice(0, 60)) : [];
    r.alertsOnScreen = [...root.querySelectorAll('[role=alert]')].filter(visible).map((e) => e.innerText.trim().slice(0, 80));

    // Drop empty lists so the answer stays short.
    for (const k of Object.keys(r)) if (Array.isArray(r[k]) && !r[k].length) delete r[k];
    if (r.imagesWithoutAlt === 0) delete r.imagesWithoutAlt;
    if (r.linkWithButton === 0) delete r.linkWithButton;
    return r;
  }

  window.__sddProbe = async (options) => analyze(document, options);
  window.__sddProbeAtWidth = async (url, width = 390, options = {}, height = 844, wait = 5000) => {
    const f = document.createElement('iframe');
    f.style.cssText = `position:fixed;left:0;top:0;width:${width}px;height:${height}px;border:0;z-index:2147483647;background:#fff`;
    f.src = url;
    document.body.appendChild(f);
    await new Promise((ok) => (f.onload = ok));
    await new Promise((ok) => setTimeout(ok, wait));
    try {
      return analyze(f.contentDocument, options);
    } finally {
      f.remove();
    }
  };
  // For a phone capture when the browser window does not shrink: shows the route in a `width` px
  // iframe, centred and scaled to fit. Take the screenshot, then call __sddCloseShow().
  // `scroll` moves the iframe content down (px) to capture the rest of the page.
  window.__sddShowAtWidth = async (url, width = 390, height = 844, wait = 5000, scroll = 0) => {
    window.__sddCloseShow?.();
    const backdrop = document.createElement('div');
    backdrop.id = '__sddShow';
    backdrop.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#0b0b0f;display:flex;align-items:center;justify-content:center;overflow:hidden';
    const scale = Math.min(1, (window.innerHeight - 8) / height, (window.innerWidth - 8) / width);
    const f = document.createElement('iframe');
    f.style.cssText = `width:${width}px;height:${height}px;border:0;background:#fff;transform:scale(${scale});transform-origin:center center;flex:none`;
    f.src = url;
    backdrop.appendChild(f);
    document.body.appendChild(backdrop);
    await new Promise((ok) => (f.onload = ok));
    await new Promise((ok) => setTimeout(ok, wait));
    if (scroll) f.contentWindow.scrollTo(0, scroll);
    await new Promise((ok) => setTimeout(ok, 400));
    return `showing ${url} at ${width}px (scale ${scale.toFixed(2)})`;
  };
  window.__sddCloseShow = () => document.getElementById('__sddShow')?.remove();
  return 'screen-probe ready: __sddProbe(options) | __sddProbeAtWidth(url, 390, options) | __sddShowAtWidth(url, 390) + screenshot + __sddCloseShow()';
})();
