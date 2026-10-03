// research：研究解释页。顶部是图纸式总览（带 sheet 属性的面板，5 分钟路径），
// 下面是单栏正文 + 目录；每个面板有阅读深度 depth=1|2|3，页头的阅读路径按钮按深度过滤。
import { panelHtml, headHtml } from './panel.js';
import { fillRows } from './sheet.js';
import { esc } from '../svg/text.js';

const ruler = (side, labels) =>
  `<div class="am-ruler am-ruler--${side}" aria-hidden="true">${labels.map((l) => `<span>${l}</span>`).join('')}</div>`;

export const depthOf = (p) => {
  if (p.attrs.sheet) return 1;
  const d = Number(p.attrs.depth);
  return d >= 1 && d <= 3 ? d : 2;
};

export function research({ meta, introHtml, panels, ui }) {
  const cols = Math.max(1, Math.min(Number(meta.cols) || 3, 12));
  const sheetPanels = panels.filter((p) => p.attrs.sheet);
  const bodyPanels = panels.filter((p) => !p.attrs.sheet);
  const spans = fillRows(sheetPanels, cols);
  const placed = sheetPanels.map((p, i) => ({ ...p, attrs: { ...p.attrs, span: spans[i] } }));
  const nums = Array.from({ length: 8 }, (_, i) => i + 1);
  const overview = placed.length
    ? `<section class="am-overview" data-depth="1" id="overview">
<div class="am-frame">
${ruler('top', nums)}${ruler('bottom', nums)}${ruler('left', ['A', 'B', 'C', 'D'])}${ruler('right', ['A', 'B', 'C', 'D'])}
<div class="am-grid" style="--cols: ${cols}">
${placed.map((p) => panelHtml(p, { cols, depth: 1 })).join('\n')}
</div>
</div>
</section>`
    : '';
  const [label, p5, p30, pDeep] = ui.paths;
  const paths = `<div class="am-paths" role="group" aria-label="${esc(label)}"><span>${esc(label)}</span>
<button class="am-btn" type="button" data-am-path="5">${esc(p5)}</button>
<button class="am-btn" type="button" data-am-path="30">${esc(p30)}</button>
<button class="am-btn" type="button" data-am-path="deep">${esc(pDeep)}</button>
</div>`;
  const toc = `<nav class="am-toc" aria-label="目录">${placed.length ? `<a href="#overview" data-depth="1">${esc(ui.paths[1].split('·')[1]?.trim() || 'Overview')}</a>` : ''}${bodyPanels.map((p) => `<a href="#panel-${esc(p.id)}" data-depth="${depthOf(p)}">${esc(p.id)} · ${esc(p.title)}</a>`).join('')}</nav>`;
  return `<main class="am-research">
${headHtml(meta, introHtml)}
${paths}
${overview}
<div class="am-doc-layout">
${toc}<div class="am-doc-body">
${bodyPanels.map((p) => panelHtml(p, { grid: false, depth: depthOf(p) })).join('\n')}
</div>
</div>
</main>`;
}
