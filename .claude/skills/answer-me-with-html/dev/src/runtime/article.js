// Research fork — the article template's page script: the contents list follows the reading position, an evidence chip shows its
// ledger row on hover / focus / tap, and a click on a drawn figure opens it at the width of the window.
(() => {
  // Labels in the page language, written by the template (src/languages/research.js).
  let L = {};
  try { L = JSON.parse(document.querySelector('main.am-article')?.dataset.amLabels || '{}'); } catch { /* English below */ }
  const label = (k, en) => L[k] || en;

  // ── contents: mark the section being read ──
  const links = [...document.querySelectorAll('.am-article .am-toc a')];
  const byId = new Map(links.map((a) => [decodeURIComponent(a.getAttribute('href').slice(1)), a]));
  if (byId.size && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        links.forEach((a) => a.classList.remove('is-on'));
        byId.get(e.target.id)?.classList.add('is-on');
      }
    }, { rootMargin: '-15% 0px -75% 0px' });
    byId.forEach((_, id) => { const el = document.getElementById(id); if (el) io.observe(el); });
  }

  // ── evidence chips ──
  const data = document.getElementById('am-evidence');
  const ledger = data ? JSON.parse(data.textContent) : {};
  const tip = Object.assign(document.createElement('div'), { className: 'am-ev-tip', hidden: true });
  tip.setAttribute('role', 'tooltip');
  document.body.append(tip);
  const text = (s) => document.createTextNode(String(s ?? ''));
  const show = (chip) => {
    const row = ledger[chip.dataset.ev];
    if (!row) return;
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
    tip.style.top = `${r.bottom + 8}px`;
    if (r.bottom + 8 + tip.offsetHeight > innerHeight - 8) tip.style.top = `${Math.max(8, r.top - tip.offsetHeight - 8)}px`;
  };
  const hide = () => { tip.hidden = true; };
  for (const chip of document.querySelectorAll('.am-ev[data-ev]')) {
    chip.addEventListener('mouseenter', () => show(chip));
    chip.addEventListener('mouseleave', hide);
    chip.addEventListener('focus', () => show(chip));
    chip.addEventListener('blur', hide);
    chip.addEventListener('click', (e) => { e.stopPropagation(); if (tip.hidden) show(chip); else hide(); });
  }
  document.addEventListener('click', hide);
  addEventListener('scroll', hide, { passive: true });

  // ── figure zoom ──
  const figs = [...document.querySelectorAll('.am-article .am-fig-canvas > svg')];
  if (!figs.length) return;
  const zoom = Object.assign(document.createElement('div'), { className: 'am-zoom', hidden: true });
  zoom.setAttribute('role', 'dialog');
  zoom.setAttribute('aria-modal', 'true');
  zoom.setAttribute('aria-label', label('zoom', 'Enlarged figure'));
  const box = Object.assign(document.createElement('div'), { className: 'am-zoom-box' });
  const close = Object.assign(document.createElement('button'), { type: 'button', className: 'am-zoom-x', textContent: '×' });
  close.setAttribute('aria-label', label('close', 'Close'));
  zoom.append(box, close);
  document.body.append(zoom);
  let back = null;
  const open = (svg) => {
    back = document.activeElement;
    const copy = svg.cloneNode(true);
    copy.removeAttribute('tabindex');
    copy.removeAttribute('role');
    copy.removeAttribute('style');
    box.replaceChildren(copy);
    zoom.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    close.focus({ preventScroll: true });
  };
  const shut = () => {
    if (zoom.hidden) return;
    zoom.hidden = true;
    box.replaceChildren();
    document.documentElement.style.overflow = '';
    back?.focus?.({ preventScroll: true });
  };
  for (const svg of figs) {
    svg.dataset.zoom = '';
    svg.setAttribute('tabindex', '0');
    svg.setAttribute('role', 'button');
    svg.setAttribute('aria-label', label('enlarge', 'Enlarge this figure'));
    svg.addEventListener('click', () => open(svg));
    svg.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(svg); } });
  }
  close.addEventListener('click', shut);
  zoom.addEventListener('click', (e) => { if (e.target === zoom) shut(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !zoom.hidden) { e.preventDefault(); e.stopPropagation(); shut(); } }, true);
})();
