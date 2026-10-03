// Markdown → HTML（GFM）。附加两项装饰：表格包一层可横向滚动容器；单元格里的状态词渲染为徽章。

import { Marked } from 'marked';

const marked = new Marked({ gfm: true });

const STATUS = {
  ok: { cls: 'ok', icon: '✓' },
  no: { cls: 'no', icon: '✗' },
  warn: { cls: 'warn', icon: '!' },
};
const STATUS_ALIAS = { '✓': 'ok', '✔': 'ok', '✗': 'no', '✘': 'no', '⚠': 'warn' };

export function statusHtml(word, label = '') {
  const kind = STATUS[STATUS_ALIAS[word] ?? word];
  if (!kind) return null;
  const text = label.trim();
  return `<span class="am-status am-status--${kind.cls}"><span class="am-status-icon" aria-hidden="true">${kind.icon}</span>${text}</span>`;
}

const CELL_STATUS = /<td([^>]*)>\s*(ok|no|warn|✓|✔|✗|✘|⚠)(?:\s+([^<]*?))?\s*<\/td>/g;

function decorate(html) {
  return html
    .replace(/<table>/g, '<div class="am-table-wrap"><table>')
    .replace(/<\/table>/g, '</table></div>')
    .replace(CELL_STATUS, (_, attrs, word, label = '') => `<td${attrs}>${statusHtml(word, label)}</td>`);
}

// 术语链接：[[术语]] 或 [[显示文字|术语]] → 指向 glossary 条目的链接，悬停显示定义。
// 渲染期间由 render.js 用 withTerms() 注入当前页面的术语表；未定义的术语记入 missing，渲染结束后统一报错。
const TERM = /\[\[([^\[\]|]+?)(?:\|([^\[\]]+?))?\]\]/g;
let terms = null;

export function termSlug(term) {
  return `g-${String(term).trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')}`;
}

export function withTerms(glossary, fn) {
  const prev = terms;
  terms = { map: glossary, missing: new Set() };
  try {
    const value = fn();
    return { value, missing: [...terms.missing] };
  } finally {
    terms = prev;
  }
}

const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function linkTerms(text) {
  if (!terms) return text;
  // 代码（围栏块与行内代码）里的 [[...]] 是代码本身，不当作术语。
  return String(text ?? '').split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/).map((part, i) => (i % 2 ? part : part.replace(TERM, (_, a, b) => {
    const shown = a.trim();
    const key = (b ?? a).trim();
    const entry = terms.map.get(key.toLowerCase());
    if (!entry) {
      terms.missing.add(key);
      return shown;
    }
    return `<a class="am-term" href="#${escAttr(entry.slug)}" data-tip="${escAttr(entry.tip)}">${escAttr(shown)}</a>`;
  }))).join('');
}

export function md(text) {
  return decorate(marked.parse(linkTerms(String(text ?? ''))));
}

export function mdInline(text) {
  return marked.parseInline(linkTerms(String(text ?? '')));
}
