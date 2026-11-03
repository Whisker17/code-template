// Research fork — the article template's page script: the contents list follows the reading position, an evidence chip shows its
// ledger row (hover, keyboard focus or tap), and a click on a drawn figure opens it at the width of the window in a modal dialog.
(() => {
  // Labels in the page language, written by the template (src/languages/research.js).
  const main = document.querySelector('main.am-article');
  if (!main) return;
  let L = {};
  try { L = JSON.parse(main.dataset.amLabels || '{}'); } catch { /* English below */ }
  const label = (k, en) => L[k] || en;

  // ── contents: mark the section being read; only its sub-sections are unfolded (all folded before the first section) ──
  const toc = main.querySelector('.am-toc');
  const links = [...main.querySelectorAll('.am-toc a')];
  const byId = new Map(links.map((a) => [decodeURIComponent(a.getAttribute('href').slice(1)), a]));
  if (toc && byId.size) {
    toc.dataset.fold = '';
    let follow = 0;
    // Keep the marked link inside the contents box once the fold has settled (the box scrolls only when it is taller than the window).
    const keepInView = (a) => {
      clearTimeout(follow);
      follow = setTimeout(() => {
        if (toc.scrollHeight <= toc.clientHeight) return;
        const r = a.getBoundingClientRect();
        const box = toc.getBoundingClientRect();
        if (r.top < box.top + 40 || r.bottom > box.bottom - 24) toc.scrollTo({ top: toc.scrollTop + r.top - box.top - box.height / 3, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      }, 420); // after the .34 s fold, so the box has its final height
    };
    // The section or sub-section being read = the last one (in page order) that starts above a line at 25% of the window; at the end of
    // the page, where a short last section can never reach that line, the last one that starts inside the window. Measured once per frame
    // while scrolling, so a jump (a contents link, an #anchor) lands on the right entry too.
    const targets = [...byId.keys()].map((id) => document.getElementById(id)).filter(Boolean);
    let current = null;
    const mark = () => {
      const end = scrollY + innerHeight >= document.documentElement.scrollHeight - 2;
      const line = end ? innerHeight : innerHeight * 0.25;
      let hit = null;
      for (const el of targets) if (el.getBoundingClientRect().top <= line) hit = el;
      const a = hit ? byId.get(hit.id) : null;
      if (a === current) return;
      current = a;
      links.forEach((x) => x.classList.toggle('is-on', x === a));
      const group = a?.closest('.am-toc-g');
      toc.querySelectorAll('.am-toc-g').forEach((g) => g.classList.toggle('is-open', g === group));
      if (a) keepInView(a);
    };
    let frame = 0;
    const later = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; mark(); }); };
    addEventListener('scroll', later, { passive: true });
    addEventListener('resize', later);
    mark();
  }

  // ── evidence chips: one shared tooltip, described-by the chip it belongs to ──
  const data = document.getElementById('am-evidence');
  const ledger = data ? JSON.parse(data.textContent) : {};
  const tip = Object.assign(document.createElement('div'), { id: 'am-ev-tip', className: 'am-ev-tip', hidden: true });
  tip.setAttribute('role', 'tooltip');
  document.body.append(tip);
  let owner = null;
  let leaving = 0;
  const text = (s) => document.createTextNode(String(s ?? ''));
  const show = (chip) => {
    clearTimeout(leaving);
    const row = ledger[chip.dataset.ev];
    if (!row) return;
    if (owner && owner !== chip) owner.removeAttribute('aria-describedby');
    owner = chip;
    chip.setAttribute('aria-describedby', tip.id);
    const head = Object.assign(document.createElement('div'), { className: 'am-ev-tip-h' });
    head.append(text(`${chip.dataset.ev} · ${row.type}`));
    const ev = Object.assign(document.createElement('div'), { className: 'am-ev-tip-e' });
    ev.append(text(`${label('evidence', 'Evidence: ')}${row.evidence}`));
    tip.replaceChildren(head, text(row.claim), ev);
    tip.hidden = false;
    const r = chip.getBoundingClientRect();
    const w = Math.min(420, innerWidth - 24);
    tip.style.maxWidth = `${w}px`;
    tip.style.left = `${Math.min(Math.max(12, r.left), innerWidth - w - 12)}px`;
    tip.style.top = `${r.bottom + 6}px`;
    if (r.bottom + 6 + tip.offsetHeight > innerHeight - 8) tip.style.top = `${Math.max(8, r.top - tip.offsetHeight - 6)}px`;
  };
  const hide = () => {
    clearTimeout(leaving);
    tip.hidden = true;
    owner?.removeAttribute('aria-describedby');
    owner = null;
  };
  // Leaving the chip waits a moment, so the pointer can move onto the tooltip (to read or copy the evidence).
  const later = () => { clearTimeout(leaving); leaving = setTimeout(hide, 250); };
  const chipOf = (t) => (t instanceof Element ? t.closest('.am-ev[data-ev]') : null);
  document.addEventListener('mouseover', (e) => { const c = chipOf(e.target); if (c) show(c); else if (e.target instanceof Node && tip.contains(e.target)) clearTimeout(leaving); });
  document.addEventListener('mouseout', (e) => { if (chipOf(e.target) || (e.target instanceof Node && tip.contains(e.target))) later(); });
  document.addEventListener('focusin', (e) => { const c = chipOf(e.target); if (c) show(c); });
  document.addEventListener('focusout', (e) => { if (chipOf(e.target)) later(); });
  // A tap opens the chip it lands on (never toggles it shut); a tap anywhere else closes the tooltip.
  document.addEventListener('click', (e) => { const c = chipOf(e.target); if (c) show(c); else if (!(e.target instanceof Node && tip.contains(e.target))) hide(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !tip.hidden) hide(); });
  addEventListener('scroll', hide, { passive: true });

  // ── figure zoom: a native modal dialog (focus stays inside, Esc closes, focus returns) ──
  const zoom = Object.assign(document.createElement('dialog'), { className: 'am-zoom' });
  zoom.setAttribute('aria-label', label('zoom', 'Enlarged figure'));
  const box = Object.assign(document.createElement('div'), { className: 'am-zoom-box' });
  const close = Object.assign(document.createElement('button'), { type: 'button', className: 'am-zoom-x', textContent: '×' });
  close.setAttribute('aria-label', label('close', 'Close'));
  zoom.append(box, close);
  document.body.append(zoom);
  let back = null;
  const open = (svg) => {
    if (typeof zoom.showModal !== 'function') return;
    back = svg;
    const copy = svg.cloneNode(true);
    for (const a of ['tabindex', 'role', 'aria-label', 'style', 'data-zoom']) copy.removeAttribute(a);
    box.replaceChildren(copy);
    zoom.showModal();
    document.documentElement.style.overflow = 'hidden';
    close.focus({ preventScroll: true });
  };
  zoom.addEventListener('close', () => {
    box.replaceChildren();
    document.documentElement.style.overflow = '';
    back?.focus?.({ preventScroll: true });
  });
  close.addEventListener('click', () => zoom.close());
  zoom.addEventListener('click', (e) => { if (e.target === zoom) zoom.close(); });
  // Figures drawn after load (a page that is not baked yet) get the same treatment once the diagram runtime finishes.
  const SVG = '.am-fig-canvas > svg';
  const prepare = () => {
    for (const svg of main.querySelectorAll(`${SVG}:not([data-zoom])`)) {
      svg.dataset.zoom = '';
      svg.setAttribute('tabindex', '0');
      svg.setAttribute('role', 'button');
      svg.setAttribute('aria-label', label('enlarge', 'Enlarge this figure'));
    }
  };
  prepare();
  new MutationObserver(prepare).observe(document.documentElement, { attributes: true, attributeFilter: ['data-am-live'] });
  main.addEventListener('click', (e) => { const svg = e.target instanceof Element ? e.target.closest(SVG) : null; if (svg && 'zoom' in svg.dataset) open(svg); });
  main.addEventListener('keydown', (e) => {
    const svg = e.target instanceof Element && e.target.matches(`${SVG}[data-zoom]`) ? e.target : null;
    if (svg && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(svg); }
  });
})();
