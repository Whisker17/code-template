// 图的外壳：编号、问题（q）、读法（read）、要点（takeaway）。excalidraw / uml 共用。
// 研究页里每张图只回答一个问题：q 写在图上方，read / takeaway 写在图下方。
import { mdInline } from '../markdown.js';
import { esc, isCJK } from '../svg/text.js';
import { parseAttrs } from '../parse.js';

const hasCJK = (s) => [...String(s)].some(isCJK);

// args 里的 q / read / takeaway / name / kind 之外的内容交给调用方自己解析。
export function figureArgs(args) {
  const a = parseAttrs(args || '');
  const pick = (k) => (typeof a[k] === 'string' ? a[k] : '');
  return { q: pick('q'), read: pick('read'), takeaway: pick('takeaway'), name: pick('name'), kind: pick('kind'), attrs: a };
}

export function figureHtml({ cls, live, kindLabel, meta, ctx, payload }) {
  const n = ctx.fig ? ctx.fig() : 1;
  const zh = hasCJK(`${meta.q}${meta.read}${meta.takeaway}`);
  const q = meta.q
    ? `<div class="am-fig-q"><b>Fig ${n}</b><span>Q: ${mdInline(meta.q)}</span>${kindLabel ? `<i>${esc(kindLabel)}</i>` : ''}</div>`
    : '';
  const capParts = [
    meta.read && `<b>${zh ? '读法：' : 'Read: '}</b>${mdInline(meta.read)}`,
    meta.takeaway && `<b>${zh ? '要点：' : 'Takeaway: '}</b>${mdInline(meta.takeaway)}`,
  ].filter(Boolean);
  const cap = capParts.length ? `<figcaption class="am-fig-cap">${capParts.join(' ')}</figcaption>` : '';
  const pending = zh || !meta.q
    ? '图形渲染中…（离线查看前需运行 am bake）'
    : 'Rendering… (run am bake for an offline copy)';
  return `<figure class="am-fig am-${cls}" id="fig-${n}" data-am-live="${live}" data-line="${ctx.line ?? 0}"${meta.name ? ` data-name="${esc(meta.name)}"` : ''}>
${q}<div class="am-fig-canvas"><div class="am-fig-pending">${pending}</div></div>
${payload}
${cap}</figure>`;
}

// 把任意文本安全地放进 <script type="application/json">：转义 < 以防 </script> 提前闭合。
export function jsonScript(cls, value) {
  return `<script type="application/json" class="${cls}">${JSON.stringify(value).replace(/</g, '\\u003c')}</script>`;
}
