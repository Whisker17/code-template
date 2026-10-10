// Research fork — the figure shell shared by excalidraw / uml: number, question (q), how to read it (read), the point (takeaway).
// On a research page each figure answers one question: q sits above the drawing, read / takeaway below it.
import { mdInline } from '../markdown.js';
import { esc } from '../svg/text.js';
import { parseAttrs } from '../parse.js';
import { researchLabels } from '../languages/research.js';

// q / read / takeaway / name / kind are read here; the caller parses anything else in args itself.
export function figureArgs(args) {
  const a = parseAttrs(args || '');
  const pick = (k) => (typeof a[k] === 'string' ? a[k] : '');
  return { q: pick('q'), read: pick('read'), takeaway: pick('takeaway'), name: pick('name'), kind: pick('kind'), attrs: a };
}

export function figureHtml({ cls, live, kindLabel, meta, ctx, payload }) {
  const n = ctx.fig ? ctx.fig() : 1;
  const L = (ctx.ui?.research ?? researchLabels('en')).fig;
  const q = meta.q
    ? `<div class="am-fig-q"><b>${esc(L.n.replace('{n}', n))}</b><span>${esc(L.q)}${mdInline(meta.q)}</span>${kindLabel ? `<i>${esc(kindLabel)}</i>` : ''}</div>`
    : '';
  const capParts = [
    meta.read && `<b>${esc(L.read)}</b>${mdInline(meta.read)}`,
    meta.takeaway && `<b>${esc(L.takeaway)}</b>${mdInline(meta.takeaway)}`,
  ].filter(Boolean);
  const cap = capParts.length ? `<figcaption class="am-fig-cap">${capParts.join(' ')}</figcaption>` : '';
  return `<figure class="am-fig am-${cls}" id="fig-${n}" data-am-live="${live}" data-line="${ctx.line ?? 0}"${meta.name ? ` data-name="${esc(meta.name)}"` : ''}>
${q}<div class="am-fig-canvas"><div class="am-fig-pending">${esc(L.pending)}</div></div>
${payload}
${cap}</figure>`;
}

// Put any text safely into <script type="application/json">: < is escaped so that </script> cannot close the tag early.
export function jsonScript(cls, value) {
  return `<script type="application/json" class="${cls}">${JSON.stringify(value).replace(/</g, '\\u003c')}</script>`;
}
