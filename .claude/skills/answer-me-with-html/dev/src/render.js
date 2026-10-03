// 稿件 → 单文件 HTML。流程：parse → STE lint → 渲染面板（markdown / 组件 / raw）→ 套模板 → 内联 CSS 与运行时。

import { parseDoc, ParseError, CHOICES } from './parse.js';
import { md, withTerms } from './markdown.js';
import { resolveComponent, RAW_LANGS, LIVE, ComponentError } from './components/index.js';
import { parseGlossary } from './components/research.js';
import { TEMPLATES } from './templates/index.js';
import { pageCss } from './themes/index.js';
import { lintDoc } from './lint/ste.js';
import { esc, isCJK } from './svg/text.js';
import { VERSION, RUNTIME_JS, DIAGRAM_JS } from './assets.js';


export class RenderError extends Error {
  constructor(message, { line, component, example } = {}) {
    super(message);
    this.name = 'RenderError';
    this.line = line;
    this.component = component;
    this.example = example;
  }
}

export class LintError extends Error {
  constructor(warnings) {
    super(`STE 检查未通过（style: strict）：${warnings.length} 条`);
    this.name = 'LintError';
    this.warnings = warnings;
  }
}

const UI = {
  zh: {
    theme: { blueprint: '主题：图纸', shadcn: '主题：卡片' },
    mode: { auto: '明暗：跟随系统', light: '明暗：亮', dark: '明暗：暗' },
    copy: '复制源稿', done: '已复制 ✓',
    paths: ['阅读路径', '5 分钟 · 总览', '30 分钟 · + 背景与发现', '完整'],
  },
  en: {
    theme: { blueprint: 'Theme: Blueprint', shadcn: 'Theme: Cards' },
    mode: { auto: 'Mode: Auto', light: 'Mode: Light', dark: 'Mode: Dark' },
    copy: 'Copy source', done: 'Copied ✓',
    paths: ['Reading path', '5 min · overview', '30 min · + background + findings', 'Deep · everything'],
  },
};

export function detectLang(text) {
  let cjk = 0;
  let latin = 0;
  for (const ch of String(text)) {
    if (isCJK(ch)) cjk++;
    else if (/[a-z]/i.test(ch)) latin++;
  }
  return cjk * 3 >= latin ? 'zh' : 'en';
}

export function renderDoc(source, overrides = {}, defaults = {}) {
  const doc = parseDoc(source, { defaults });
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) continue;
    if (CHOICES[key] && !CHOICES[key].includes(String(value))) {
      throw new ParseError(`${key} 的值 "${value}" 无效，可选：${CHOICES[key].join(' | ')}`, 0);
    }
    doc.meta[key] = value;
  }

  const warnings = doc.meta.style === 'off' ? [] : lintDoc(doc);
  if (doc.meta.style === 'strict' && warnings.length) throw new LintError(warnings);

  const stats = { panels: doc.panels.length, components: {} };
  const ctx = { seq: 0, figs: 0, line: 0, stats, live: new Set() };
  const glossary = collectGlossary(doc);
  const lang = doc.meta.lang || detectLang(source);
  const { value: body, missing } = withTerms(glossary, () => {
    const introHtml = renderBlocks(doc.intro, ctx);
    const panels = doc.panels.map((p) => ({ ...p, html: renderBlocks(p.blocks, ctx) }));
    return TEMPLATES[doc.meta.template]({ meta: doc.meta, introHtml, panels, ui: UI[lang] ?? UI.zh });
  });
  if (missing.length) {
    const term = missing[0];
    const idx = String(source).split('\n').findIndex((l) => l.includes(`[[${term}`) || l.includes(`|${term}]]`));
    throw new RenderError(`术语 "${term}" 没有在 glossary 中定义${missing.length > 1 ? `（另有 ${missing.slice(1).join('、')}）` : ''}`, {
      line: idx + 1,
      component: 'glossary',
      example: `\`\`\`glossary\n${term} | 别名 | 一两句 STE 定义。 | 易混淆的概念\n\`\`\``,
    });
  }
  const live = [...ctx.live];
  const html = shell({ meta: doc.meta, lang, body, source, live });
  return { html, warnings, stats, meta: doc.meta, live };
}

// 先收集全页术语表（含别名），正文渲染时 [[术语]] 才能解析成链接。
function collectGlossary(doc) {
  const map = new Map();
  for (const b of [...doc.intro, ...doc.panels.flatMap((p) => p.blocks)]) {
    if (b.type !== 'fence' || b.lang !== 'glossary') continue;
    let items;
    try {
      items = parseGlossary(b.text);
    } catch (err) {
      if (!(err instanceof ComponentError)) throw err;
      throw new RenderError(err.message, { line: b.line + (err.line || 0), component: 'glossary', example: resolveComponent('glossary').example });
    }
    for (const g of items) {
      const entry = { slug: g.slug, tip: `${g.term}${g.alias ? `（${g.alias}）` : ''}：${g.def.replace(/[`*_]/g, '')}` };
      map.set(g.term.toLowerCase(), entry);
      if (g.alias) map.set(g.alias.toLowerCase(), entry);
    }
  }
  return map;
}

function renderBlocks(blocks, ctx) {
  return blocks.map((b) => (b.type === 'md' ? `<div class="am-md">${md(b.text)}</div>` : renderFence(b, ctx))).join('\n');
}

function renderFence(block, ctx) {
  const { lang, args, text, line } = block;
  if (RAW_LANGS.has(lang)) return text;
  const comp = resolveComponent(lang);
  if (!comp) {
    return `<pre class="am-code"><code${lang ? ` data-lang="${esc(lang)}"` : ''}>${esc(text)}</code></pre>`;
  }
  ctx.stats.components[comp.name] = (ctx.stats.components[comp.name] ?? 0) + 1;
  if (LIVE.has(comp.name)) ctx.live.add(comp.name);
  ctx.line = line;
  try {
    return comp.render(text, { args, line, uid: () => `am${++ctx.seq}`, fig: () => ++ctx.figs });
  } catch (err) {
    if (!(err instanceof ComponentError)) throw err;
    throw new RenderError(err.message, {
      line: line + (err.line || 0),
      component: comp.name,
      example: comp.example,
    });
  }
}

function timestamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function shell({ meta, lang, body, source, live = [] }) {
  const ui = UI[lang] ?? UI.zh;
  return `<!doctype html>
<html lang="${lang === 'zh' ? 'zh-CN' : 'en'}" data-theme="${esc(meta.theme)}" data-mode="${esc(meta.mode)}"${live.length ? ' data-am-live="pending"' : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Answer me with HTML ${VERSION}">
<title>${esc(meta.title || 'Answer me with HTML')}</title>
<style>
${pageCss()}
</style>
</head>
<body>
<div class="am-toolbar">
<button class="am-btn" type="button" data-am="theme" data-labels="${esc(JSON.stringify(ui.theme))}">${esc(ui.theme[meta.theme])}</button>
<button class="am-btn" type="button" data-am="mode" data-labels="${esc(JSON.stringify(ui.mode))}">${esc(ui.mode[meta.mode])}</button>
<button class="am-btn" type="button" data-am="copy" data-done="${esc(ui.done)}">${esc(ui.copy)}</button>
</div>
${body}
<footer class="am-colophon">Generated by Answer me with HTML ${VERSION} · ${esc(timestamp())}</footer>
<textarea id="am-source" hidden readonly aria-hidden="true">${esc(source)}</textarea>
<script>
${RUNTIME_JS}</script>
${live.length ? `<div id="am-render-errors" hidden></div>\n<script type="module" id="am-diagram-runtime">\n${DIAGRAM_JS}</script>\n` : ''}</body>
</html>
`;
}
