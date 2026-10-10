// Research fork — research: research explainer page. At the top, a drawing-sheet overview (the panels marked {sheet}: the
// 5-minute path); below it, a one-column body with contents. Each panel has a reading depth depth=1|2|3, and the reading-path
// buttons in the header filter on it.
import { panelHtml, headHtml } from './panel.js';
import { fillRows, minSpan } from './sheet.js';
import { esc } from '../svg/text.js';
import { researchLabels } from '../languages/research.js';

const ruler = (side, labels) =>
  `<div class="am-ruler am-ruler--${side}" aria-hidden="true">${labels.map((l) => `<span>${l}</span>`).join('')}</div>`;

export const depthOf = (p) => {
  if (p.attrs.sheet) return 1;
  const d = Number(p.attrs.depth);
  return d >= 1 && d <= 3 ? d : 2;
};

export function research({ meta, introHtml, panels, ui, language }) {
  const L = ui?.research ?? researchLabels('en');
  const cols = Math.max(1, Math.min(Number(meta.cols) || 3, 12));
  const sheetPanels = panels.filter((p) => p.attrs.sheet);
  const bodyPanels = panels.filter((p) => !p.attrs.sheet);
  // The overview is sized like the sheet template: wide tables and diagrams get the columns they need, rows are filled.
  const sized = sheetPanels.map((p) => (p.attrs.span === undefined && minSpan(p) > 1
    ? { ...p, attrs: { ...p.attrs, span: Math.min(minSpan(p), cols) } }
    : p));
  const spans = fillRows(sized, cols);
  const placed = sized.map((p, i) => ({ ...p, attrs: { ...p.attrs, span: spans[i] } }));
  const nums = Array.from({ length: 8 }, (_, i) => i + 1);
  const letters = ['A', 'B', 'C', 'D'];
  const overview = placed.length
    ? `<section class="am-overview" data-depth="1" id="overview">
<div class="am-frame">
${ruler('top', nums)}${ruler('bottom', nums)}${ruler('left', letters)}${ruler('right', letters)}
<div class="am-grid" style="--cols: ${cols}">
${placed.map((p, i) => panelHtml(p, { cols, depth: 1, hints: { span: sheetPanels[i].attrs.span } })).join('\n')}
</div>
</div>
</section>`
    : '';
  const { label, short, medium, deep } = L.paths;
  const paths = `<div class="am-paths" role="group" aria-label="${esc(label)}"><span>${esc(label)}</span>
<button class="am-btn" type="button" data-am-path="5">${esc(short)}</button>
<button class="am-btn" type="button" data-am-path="30">${esc(medium)}</button>
<button class="am-btn" type="button" data-am-path="deep">${esc(deep)}</button>
</div>`;
  const toc = `<nav class="am-toc" aria-label="${esc(ui?.toc ?? 'Contents')}">${placed.length ? `<a href="#overview" data-depth="1">${esc(L.overview)}</a>` : ''}${bodyPanels.map((p) => `<a href="#panel-${esc(p.id)}" data-depth="${depthOf(p)}">${esc(p.id)} · ${esc(p.title)}</a>`).join('')}</nav>`;
  return `<main class="am-research">
${headHtml(meta, introHtml, language)}
${paths}
${overview}
<div class="am-doc-layout">
${toc}<div class="am-doc-body">
${bodyPanels.map((p) => panelHtml(p, { grid: false, depth: depthOf(p) })).join('\n')}
</div>
</div>
</main>`;
}
