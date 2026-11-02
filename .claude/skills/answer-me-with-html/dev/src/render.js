// Draft → single-file HTML. Pipeline: parse → STE lint → render panels (markdown / components / raw) → apply template → inline CSS and runtime.
// Research fork: fence aliases (```mermaid), [[term]] glossary links, numbered figures, and the diagram runtime for excalidraw / uml (baked later by am bake).

import { parseDoc, ParseError, applyOverrides, CHOICES } from './parse.js';
import { md, collectHtmlNotes, withTerms, withEvidence } from './markdown.js';
import { COMPONENTS, ALIASES, LIVE, RAW_LANGS, ComponentError } from './components/index.js';
import { parseGlossary } from './components/research.js';
import { researchLabels } from './languages/research.js';
import { TEMPLATES } from './templates/index.js';
import { pageCss } from './themes/index.js';
import { BUILTIN, AUTO, pickTheme, getTheme } from './themes/registry.js';
import { lintDoc } from './lint/ste.js';
import { esc } from './svg/text.js';
import { VERSION, RUNTIME_JS, RTL_JS, DELTA_JS, DIAGRAM_JS, UPDATE_JS, ARTICLE_JS } from './assets.js';
import { rootTag, rootCarrierAttrs, sourceTag } from './page.js';
import { resolveLanguage } from './language.js';
import { inlineImages, ImageError, IMAGE_EXAMPLE } from './images.js';
import { renderCode, CodeError } from './code.js';
import { isolateLtrRuns } from './bidi.js';
import { hasMath } from './math.js';


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
    super(`STE check failed (style: strict): ${warnings.length} warning${warnings.length === 1 ? '' : 's'}`);
    this.name = 'LintError';
    this.warnings = warnings;
  }
}

// themes: the theme set to pick from (the CLI passes the built-in themes plus the user's theme files).
// previousLanguage: the language the page had before (a patched page keeps it unless the draft declares one).
// baseDir: where relative image paths are read from; codeDir: where relative code paths are read from (the folder the agent works in).
// knownImages / knownCode: what the page already embeds, the fallback when a file is gone.
// update: { latest, current, command, highlights } from pageUpdate in src/update.js when a newer version is known; the page then has a new-version button.
// evidence (research fork): { id: { claim, evidence, type } } from a claim ledger; {ID} in the text then becomes an evidence chip.
export function renderDoc(source, overrides = {}, defaults = {}, { themes = BUILTIN, previousLanguage, baseDir, codeDir, knownImages, knownCode, update, evidence } = {}) {
  const choices = { theme: [...themes.choices('page'), ARTICLE] };
  const parsed = canonicalLangs(parseDoc(source, { defaults, choices }));
  const given = applyOverrides(parsed.meta, overrides, { ...CHOICES, ...choices });
  if (given.template === 'video') throw new ParseError('template: video is a video draft; render it with am video', 0);
  // Research fork: the article template always uses the article theme, and no other page can use it.
  const meta = given.template === ARTICLE ? { ...given, theme: ARTICLE } : given;
  const problem = meta.template === ARTICLE ? null : themes.problem(meta.theme, 'page');
  if (problem) throw new ParseError(problem, 0);
  // theme: auto becomes a real theme here, so the page, the summary and later patches name the theme that was used.
  const doc = { ...parsed, meta: meta.theme === AUTO ? { ...meta, theme: pickTheme({ scope: 'page', template: meta.template, visuals: hasVisuals(parsed) }) } : meta };

  const language = resolveLanguage({ declared: doc.meta.lang, previous: previousLanguage, text: source });
  const warnings = doc.meta.style === 'off' ? [] : lintDoc(doc, language);
  if (doc.meta.style === 'strict' && warnings.length) throw new LintError(warnings);

  const stats = { panels: doc.panels.length, components: {}, code: [], codeWarnings: [], componentWarnings: [], htmlWarnings: [], mathWarnings: [] };
  const ui = { ...language.ui, research: researchLabels(language.labelKey) };
  const ctx = { seq: 0, figs: 0, live: new Set(), stats, ui, dir: language.dir, images: { baseDir, known: knownImages }, code: { baseDir: codeDir, known: knownCode } };
  const loose = doc.intro.find((b) => b.type === 'fence' && COMPONENTS.get(b.lang)?.panelOnly);
  if (loose) throw new RenderError(`${loose.lang} belongs in a panel: put it under the ## heading of the panel the answer changes`, { line: loose.line, component: loose.lang, example: COMPONENTS.get(loose.lang).example });
  const glossary = collectGlossary(doc);
  const { value: { value: page, missing }, missing: missingEvidence, used: usedEvidence } = withEvidence(evidence, () => withTerms(glossary, () => {
    const introHtml = renderBlocks(doc.intro, ctx);
    const panels = doc.panels.map((p) => ({ ...p, html: renderBlocks(p.blocks, ctx) }));
    return TEMPLATES[doc.meta.template]({ meta: doc.meta, introHtml, panels, ui, language });
  }));
  if (missing.length) throw missingTerms(missing, source);
  if (missingEvidence.length) throw missingIds(missingEvidence, source);
  // A right-to-left page isolates each run of text with no right-to-left letter as left to right (src/bidi.js).
  const body = language.dir === 'rtl' ? isolateLtrRuns(page) : page;
  const live = [...ctx.live];
  const embedded = doc.meta.template === ARTICLE ? [getTheme(ARTICLE)] : themes.embedFor(doc.meta.theme, 'page');
  const html = shell({ meta: doc.meta, language, body, source, embedded, live, update, evidence: usedEvidence });
  return { html, warnings, stats, meta: doc.meta, language, live };
}

// Research fork: a fence alias (```mermaid) becomes its component name, so lint, theme choice and rendering see one name.
function canonicalLangs(doc) {
  const fix = (blocks) => blocks.map((b) => (b.type === 'fence' && ALIASES.has(b.lang) ? { ...b, lang: ALIASES.get(b.lang) } : b));
  return { ...doc, intro: fix(doc.intro), panels: doc.panels.map((p) => ({ ...p, blocks: fix(p.blocks) })) };
}

// Research fork: the whole page's glossary (terms and aliases), collected first so [[term]] links resolve anywhere in the text.
function collectGlossary(doc) {
  const map = new Map();
  for (const b of [...doc.intro, ...doc.panels.flatMap((p) => p.blocks)]) {
    if (b.type !== 'fence' || b.lang !== 'glossary') continue;
    let items;
    try {
      items = parseGlossary(b.text);
    } catch (err) {
      if (!(err instanceof ComponentError)) throw err;
      throw new RenderError(err.message, { line: b.line + (err.line || 0), component: 'glossary', example: COMPONENTS.get('glossary').example });
    }
    for (const g of items) {
      const entry = { slug: g.slug, tip: `${g.term}${g.alias ? ` (${g.alias})` : ''}: ${g.def.replace(/[`*_]/g, '')}` };
      map.set(g.term.toLowerCase(), entry);
      if (g.alias) map.set(g.alias.toLowerCase(), entry);
    }
  }
  return map;
}

const ARTICLE = 'article';

// Research fork: an {ID} that the claim ledger does not have. The line is the first draft line that names it.
function missingIds(missing, source) {
  const [id, ...more] = missing;
  const idx = String(source).split('\n').findIndex((l) => new RegExp(`[{,\\s]${id}[},\\s]`).test(l));
  return new RenderError(`evidence {${id}} is not in the claim ledger${more.length ? ` (also: ${more.join(', ')})` : ''}`, {
    line: idx + 1,
    component: 'evidence',
    example: 'Add a ledger row with this ID (# column), or cite an existing one: the claim holds {K2}.',
  });
}

function missingTerms(missing, source) {
  const [term, ...more] = missing;
  const idx = String(source).split('\n').findIndex((l) => l.includes(`[[${term}`) || l.includes(`|${term}]]`));
  return new RenderError(`term "${term}" is not defined in a glossary${more.length ? ` (also: ${more.join(', ')})` : ''}`, {
    line: idx + 1,
    component: 'glossary',
    example: `\`\`\`glossary\n${term} | alias | A one- or two-sentence STE definition. | what it is often confused with\n\`\`\``,
  });
}

// A diagram, another component or a raw html / svg block anywhere in the draft.
function hasVisuals({ intro, panels }) {
  return [...intro, ...panels.flatMap((p) => p.blocks)].some((b) => b.type === 'fence' && (COMPONENTS.has(b.lang) || RAW_LANGS.has(b.lang)));
}

export function renderBlocks(blocks, ctx) {
  return blocks.map((b) => {
    const { result, notes } = collectHtmlNotes(() => (b.type === 'md' ? `<div class="am-md">${md(b.text)}</div>` : renderFence(b, ctx)), { math: !ctx.video });
    noteHtml(b, notes.filter((n) => !n.math), ctx);
    noteMath(b, notes.filter((n) => n.math), ctx);
    return embedImages(b, result, ctx);
  }).join('\n');
}

// The raw-HTML notes of one block, each with the draft line of its tag. The nth note about the same tag points at its nth place in the block.
function noteHtml(block, notes, ctx) {
  if (!notes.length || !ctx.stats.htmlWarnings) return;
  const lines = block.text.split('\n');
  const first = block.type === 'md' ? block.line : block.line + 1;
  const used = new Map();
  for (const { at, message } of notes) {
    const tag = at.split('\n')[0];
    const places = lines.flatMap((l, i) => Array(l.split(tag).length - 1).fill(i));
    const n = used.get(tag) ?? 0;
    used.set(tag, n + 1);
    ctx.stats.htmlWarnings.push({ line: first + (places[Math.min(n, places.length - 1)] ?? 0), message });
  }
}

// The math notes of one block, each with the draft line of its formula. The nth note about the same formula points at its nth place in the block.
function noteMath(block, notes, ctx) {
  if (!notes.length || !ctx.stats.mathWarnings) return;
  const first = block.type === 'md' ? block.line : block.line + 1;
  const next = new Map();
  for (const { at, message } of notes) {
    const index = block.text.indexOf(at, next.get(at) ?? 0);
    next.set(at, index + 1);
    ctx.stats.mathWarnings.push({ line: first + (index < 0 ? 0 : block.text.slice(0, index).split('\n').length - 1), message });
  }
}

// Components that read their text as Markdown. Only there is ![a](b) an image the author meant; in raw html and in diagram text it is literal.
const MARKDOWN_FENCES = new Set(['callout', 'kv', 'tree', 'timeline']);

// Local images in a block's html become data URIs; a missing or oversize file is reported at the line that names it.
function embedImages(block, html, ctx) {
  try {
    return inlineImages(html, { ...ctx.images, checkText: block.type === 'md' || MARKDOWN_FENCES.has(block.lang) });
  } catch (err) {
    if (!(err instanceof ImageError)) throw err;
    // The draft may write the path as decoded (a b.png) or percent-encoded (a%20b.png).
    const idx = block.text.split('\n').findIndex((l) => l.includes(err.ref) || l.includes(encodeURI(err.ref)));
    const first = block.type === 'md' ? block.line : block.line + 1;
    throw new RenderError(err.message, { line: first + Math.max(idx, 0), component: 'image', example: IMAGE_EXAMPLE });
  }
}

function renderFence(block, ctx) {
  const { lang, args, text, line } = block;
  if (RAW_LANGS.has(lang)) return text;
  const comp = COMPONENTS.get(lang);
  if (!comp) return codeBlock(block, ctx);
  if (comp.pageOnly && ctx.video) throw new RenderError(`${lang} works on a page only; a video cannot take answers`, { line, component: lang, example: comp.example });
  ctx.stats.components[lang] = (ctx.stats.components[lang] ?? 0) + 1;
  if (LIVE.has(lang)) ctx.live?.add(lang);
  try {
    const warn = ({ line: at = 0, message }) => ctx.stats.componentWarnings?.push({ line: line + at, component: lang, message });
    // line and fig are for research-fork figures: the draft line maps browser errors back to the draft, fig numbers the figures.
    return comp.render(text, { args, line, uid: () => `am${++ctx.seq}`, fig: () => (ctx.figs = (ctx.figs ?? 0) + 1), ui: ctx.ui, dir: ctx.dir ?? 'ltr', video: ctx.video, warn });
  } catch (err) {
    if (!(err instanceof ComponentError)) throw err;
    throw new RenderError(err.message, {
      line: line + (err.line || 0),
      component: lang,
      example: comp.example,
    });
  }
}

// A fence that is not a component is code. In a video the block has no copy button.
function codeBlock(block, ctx) {
  try {
    const { html, file, warnings } = renderCode(block, { ...ctx.code, ui: ctx.ui, copy: !ctx.video });
    if (file && ctx.stats.code) ctx.stats.code.push(file);
    if (ctx.stats.codeWarnings) ctx.stats.codeWarnings.push(...warnings.map((w) => ({ line: block.line, ...w })));
    return html;
  } catch (err) {
    if (!(err instanceof CodeError)) throw err;
    throw new RenderError(err.message, { line: block.line + err.line, component: 'code', example: err.example });
  }
}

// order: 'ymd' (2026-10-07 22:44) or 'dmy' (7.10.2026 22:44, the way Hebrew readers write a date).
export function timestamp(d = new Date(), order = 'ymd') {
  const p = (n) => String(n).padStart(2, '0');
  const time = `${p(d.getHours())}:${p(d.getMinutes())}`;
  if (order === 'dmy') return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()} ${time}`;
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${time}`;
}

// The line at the top of the page, above the title. On a right-to-left page the product name with its version, the time and the star link are each
// isolated, so the Latin name, the version and the date do not merge into one left-to-right run. The star link is English in
// every language, like the product name.
function colophon(language) {
  const repo = 'https://github.com/QingYunA/answer-me-with-html';
  const link = `<a href="${repo}" target="_blank" rel="noopener">Answer me with HTML</a>`;
  const star = `<a href="${repo}" target="_blank" rel="noopener">★ Star on GitHub</a>`;
  const label = esc(language.ui.generated ?? 'Generated by');
  const time = esc(timestamp(new Date(), language.dateOrder));
  if (language.dir === 'rtl') return `<p class="am-colophon">${label} <bdi>${link} ${VERSION}</bdi> · <bdi>${time}</bdi> · <bdi>${star}</bdi></p>`;
  return `<p class="am-colophon">${label} ${link} ${VERSION} · ${time} · ${star}</p>`;
}

// The colophon opens the page header. It goes in after src/bidi.js has run over the body, since it isolates its own runs. The
// template's header is the first one in the body: the intro and the panels come after it.
// Research fork: an article page keeps its title block clean; the colophon closes the reading column instead.
const withColophon = (body, language) => (body.startsWith('<main class="am-article"')
  ? body.replace(/<\/div>\n<\/main>$/, () => `<footer class="am-art-foot">${colophon(language)}</footer>\n</div>\n</main>`)
  : body.replace('<header class="am-head">', (head) => `${head}${colophon(language)}`));

// The new-version button and its popover (a native popover, so it opens, closes on Esc and on a click outside with no script). The
// button starts hidden; src/runtime/update.js shows it where the browser has popovers. withoutUpdateNotice takes both out again.
function updateNotice(ui, update, labelKey) {
  if (!update) return { button: '', popover: '' };
  const t = ui.update;
  // The highlights in the page language, else in English (the labels fall back the same way). `code` spans become <code>.
  const lines = update.highlights?.[labelKey] ?? update.highlights?.en;
  const notes = lines
    ? `<p class="am-update-label">${esc(t.whatsNew)}</p>\n<ul class="am-update-notes">${lines.map((l) => `<li>${esc(l).replace(/`([^`]+)`/g, '<code>$1</code>')}</li>`).join('')}</ul>\n`
    : '';
  const plain = t.button.replace('{version}', update.latest);
  const fill = (s) => esc(s).replace('{version}', `<bdi>${esc(update.latest)}</bdi>`).replace('{current}', `<bdi>${esc(update.current)}</bdi>`);
  // The command is code and reads left to right; the line for the agent is a sentence in the page language.
  const row = (text, code) => `<div class="am-update-row">${code ? `<code dir="ltr">${esc(text)}</code>` : `<span>${esc(text)}</span>`}<button class="am-btn" type="button" data-am="copy-text" data-text="${esc(text)}" data-done="${esc(ui.done)}">${esc(ui.copyCode)}</button></div>`;
  return {
    button: `<button class="am-btn am-btn--update" type="button" data-am="update" popovertarget="am-update" aria-label="${esc(plain)}" hidden>● <span class="am-update-text">${fill(t.button)}</span></button>\n`,
    popover: `<div class="am-update" id="am-update" popover>
<p class="am-update-title">${fill(t.button)}</p>
<p>${fill(t.current)}</p>
${notes}<p class="am-update-label">${esc(t.run)}</p>
${row(update.command, true)}
<p class="am-update-label">${esc(t.agent)}</p>
${row(t.agentText, false)}
<a href="https://github.com/QingYunA/answer-me-with-html/releases" target="_blank" rel="noopener">${esc(t.notes)}</a>
</div>
`,
  };
}

// The page without its new-version button and popover, for a reader on another device (src/serve.js): the notice is for the person
// who made the page. Both come before the body, so the first match is the one updateNotice wrote.
export function withoutUpdateNotice(html) {
  return html
    .replace(/<button class="am-btn am-btn--update"[^]*?<\/button>\n/, '')
    .replace(/<div class="am-update" id="am-update" popover>[^]*?\n<\/div>\n/, '');
}

// A diagram with change markers carries a count row; only then the page needs the delta styles and script.
export const hasDelta = (html) => html.includes('class="am-delta-bar"');

function lightboxShell(ui, hasDiagrams) {
  if (!hasDiagrams) return '';
  return `<div class="am-lightbox" hidden aria-modal="true" role="dialog" aria-label="${esc(ui.diagram)}" data-expand="${esc(ui.expand)}">
<div class="am-lightbox-backdrop"></div>
<div class="am-lightbox-header">
<div class="am-lightbox-title">
<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
<span class="am-lightbox-title-text"></span>
</div>
<div class="am-lightbox-actions">
<button class="am-lightbox-close" data-action="close" title="${esc(ui.close)}" aria-label="${esc(ui.close)}">✕</button>
</div>
</div>
<div class="am-lightbox-stage">
<div class="am-lightbox-canvas am-diagram"></div>
</div>
</div>
`;
}

// Research fork: the evidence an article page cites, for the hover box of each chip (only the IDs the page uses).
const evidenceScript = (used) => (used && Object.keys(used).length
  ? `<script type="application/json" id="am-evidence">${JSON.stringify(used).replace(/</g, '\\u003c')}</script>\n`
  : '');

function shell({ meta, language, body, source, embedded, live = [], update, evidence }) {
  const { ui, labelKey } = language;
  const notice = updateNotice(ui, update, labelKey);
  const pick = (name, label, values, current) => `<label class="am-pick">${esc(label)}<select data-am="${name}">${values
    .map(([value, text]) => `<option value="${esc(value)}"${value === current ? ' selected' : ''}>${esc(text)}</option>`).join('')}</select></label>`;
  const root = { lang: language.htmlLang, dir: language.dir, theme: meta.theme, mode: meta.mode, style: meta.style };
  // Research fork: data-am-live="pending" tells am bake / am shot to wait for the diagram runtime.
  const rootHtml = live.length ? rootTag(root).replace(/>$/, ' data-am-live="pending">') : rootTag(root);
  return `<!doctype html>
${rootHtml}
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Answer me with HTML ${VERSION}">
<title>${esc(meta.title || 'Answer me with HTML')}</title>
<style>
${pageCss(embedded, { diff: body.includes('class="am-codeblock am-codeblock--diff"'), delta: hasDelta(body), rtl: language.dir === 'rtl', math: hasMath(body), update: Boolean(update) })}
</style>
</head>
<body>
${meta.template === ARTICLE ? '' : `<div class="am-toolbar"${rootCarrierAttrs(root)}>
${notice.button}${pick('theme', ui.theme, embedded.map((t) => [t.name, t.label[labelKey]]), meta.theme)}
${pick('mode', ui.modeLabel, Object.entries(ui.mode), meta.mode)}
<button class="am-btn am-btn--reply" type="button" data-am="reply" data-ui="${esc(JSON.stringify({ ...ui.reply, done: ui.done, remarks: ui.remark.section, kinds: ui.remark.kinds }))}">${esc(ui.reply.button)}</button>
<button class="am-btn am-btn--remark" type="button" data-am="remark" data-ui="${esc(JSON.stringify(ui.remark))}">${esc(ui.remark.button)}</button>
<button class="am-btn" type="button" data-am="copy" data-done="${esc(ui.done)}">${esc(ui.copy)}</button>
</div>
`}${notice.popover}${withColophon(body, language)}
${lightboxShell(ui, body.includes('class="am-diagram'))}${evidenceScript(evidence)}${sourceTag(source)}
<script>
${RUNTIME_JS}${language.dir === 'rtl' ? RTL_JS : ''}${hasDelta(body) ? DELTA_JS : ''}${update ? UPDATE_JS : ''}${meta.template === ARTICLE ? ARTICLE_JS : ''}</script>
${live.length ? `<div id="am-render-errors" hidden></div>\n<script type="module" id="am-diagram-runtime">\n${DIAGRAM_JS}</script>\n` : ''}</body>
</html>
`;
}
