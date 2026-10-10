// Research fork tests: excalidraw / uml components, research components, term links, the research template, research lint,
// the CLI bake switch, splicing baked figures, and a real bake (with Chrome).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { COMPONENTS, ComponentError, resolveComponent, LIVE } from '../src/components/index.js';
import { validateSpec, parseSpec, labelWidth } from '../src/components/excalidraw.js';
import { umlType } from '../src/components/uml.js';
import { renderDoc, RenderError } from '../src/render.js';
import { parseDoc } from '../src/parse.js';
import { lintDoc } from '../src/lint/ste.js';
import { main } from '../src/cli.js';
import { findChrome, bakeFile, shotFile, spliceFigures } from '../src/bake.js';
import { pageCss } from '../src/themes/index.js';
import { readPage } from '../src/page.js';
import { researchLabels, researchLabelIds } from '../src/languages/research.js';
import { LANGUAGES } from '../src/languages/registry.js';

const ctx = (args = '') => ({ args, uid: () => 'u1', fig: () => 1, line: 10 });
const render = (name, text, args) => COMPONENTS.get(name).render(text, ctx(args));
const throwsMsg = (fn, re, line) => assert.throws(fn, (e) => e instanceof ComponentError && re.test(e.message) && (line === undefined || e.line === line));

// ── excalidraw ──
const SPEC = JSON.stringify({ nodes: [{ id: 'a', label: 'A', col: 0, row: 0 }, { id: 'b', label: 'B', col: 1, row: 0 }], edges: [{ from: 'a', to: 'b', label: 'call' }] }, null, 1);

test('excalidraw: writes the figure shell, question, takeaway and spec, marked for baking', () => {
  const html = render('excalidraw', SPEC, 'q="Who calls whom?" takeaway="A calls B" name=demo');
  assert.match(html, /<figure class="am-fig am-excal" id="fig-1" data-am-live="excalidraw" data-line="10" data-name="demo">/);
  assert.match(html, /<b>Fig 1<\/b><span>Q: Who calls whom\?/);
  assert.match(html, /Takeaway: <\/b>A calls B/);
  assert.match(html, /<script type="application\/json" class="am-excal-spec">/);
  assert.ok(LIVE.has('excalidraw'));
});

test('excalidraw: </script> in the spec is escaped', () => {
  const spec = JSON.stringify({ nodes: [{ id: 'a', label: '</script><b>', col: 0, row: 0 }] });
  assert.doesNotMatch(render('excalidraw', spec), /<\/script><b>/);
});

test('excalidraw: a JSON error names its line', () => {
  throwsMsg(() => parseSpec('{\n "nodes": [\n  {"id": "a",}\n ]\n}'), /not valid JSON/, 3);
});

test('excalidraw: checks unknown nodes, duplicate ids, missing positions, overlaps and label room', () => {
  const v = (o) => { const t = JSON.stringify(o, null, 1); return validateSpec(JSON.parse(t), t); };
  throwsMsg(() => v({ nodes: [{ id: 'a', col: 0 }], edges: [{ from: 'a', to: 'x' }] }), /does not exist: "x"/);
  throwsMsg(() => v({ nodes: [{ id: 'a', col: 0 }, { id: 'a', col: 1 }] }), /duplicate node id/);
  throwsMsg(() => v({ nodes: [{ id: 'a' }] }), /needs col\/row/);
  throwsMsg(() => v({ nodes: [{ id: 'a', col: 0, row: 0 }, { id: 'b', col: 0, row: 0 }] }), /overlap/);
  throwsMsg(() => v({ grid: { w: 220 }, nodes: [{ id: 'a', col: 0, row: 0 }, { id: 'b', col: 1, row: 0 }], edges: [{ from: 'a', to: 'b', label: '一个很长很长的中文标签' }] }), /needs about \d+px of space/);
  assert.ok(v({ nodes: [{ id: 'a', col: 0, row: 0 }, { id: 'b', col: 0, row: 1 }], edges: [{ from: 'a', to: 'b', label: '竖直方向的长标签不受宽度限制' }] }));
  assert.ok(labelWidth('ab') < labelWidth('中文'));
});

// ── uml ──
test('uml: finds the diagram type (skipping a config block and %% comments); mermaid is an alias', () => {
  assert.deepEqual(umlType('---\nconfig:\n  look: handDrawn\n---\n%% c\nclassDiagram\n A <|-- B'), { type: 'classDiagram', line: 6 });
  assert.equal(resolveComponent('mermaid').name, 'uml');
  const html = render('uml', 'sequenceDiagram\n A->>B: <<hi>>', 'q="x"');
  assert.match(html, /data-am-live="uml"/);
  assert.match(html, /UML · sequence/);
  assert.match(html, /class="am-uml-src">"sequenceDiagram\\n A->>B: \\u003c\\u003chi>>"/);
});

test('uml: an unknown type and C4 are errors', () => {
  throwsMsg(() => render('uml', 'graphx TD\n A-->B'), /unknown UML diagram type/, 1);
  throwsMsg(() => render('uml', '\nC4Context\n Person(a, "x")'), /C4/, 2);
});

// ── prereq / finding / glossary ──
test('prereq: title, required fields, l1 tag, multi-line values and ~~~ code; Chinese keys are still accepted', () => {
  const html = render('prereq', '# Q / K / V\n是什么: 三个向量。\n为什么需要: 可以缓存。\n例子:\n~~~\nx = 1\n~~~\n误解: 误解：缓存输出。\n依赖: B-0', 'B-1 l1 8min');
  assert.match(html, /<article class="am-prereq" id="p-B-1">/);
  assert.match(html, /am-prereq-id--l1">B-1/);
  assert.match(html, /~8min/);
  assert.match(html, /<dt>Why it matters here<\/dt>/);
  assert.match(html, /<code>x = 1\n<\/code>/);
  assert.match(html, /am-prereq-mis/);
  assert.match(html, /Needs: B-0/);
  throwsMsg(() => render('prereq', '# X\nwhat: y', 'B-9'), /no "why:" line/);
  throwsMsg(() => render('prereq', 'what: y\nwhy: z', 'B-9'), /# concept name/);
  assert.match(render('prereq', '# X\nwhat: y\nwhy: z\nexample: w', 'B-2'), /<dt>Minimal example<\/dt>/);
});

test('finding: confidence, evidence-kind badges, missing kind is an error', () => {
  const html = render('finding', '# 论断\n结论: 快 3 倍。\n证据: [observed] 压测。[推断] 可能更快。\n影响: 换掉。', 'F2 高');
  assert.match(html, /<article class="am-finding" id="F2">/);
  assert.match(html, /am-conf--high/);
  assert.match(html, /am-kind--observed">observed/);
  assert.match(html, /am-kind--inferred">推断/);
  throwsMsg(() => render('finding', '# x\n证据: 我测过', 'F1 high'), /the evidence has no kind/, 2);
  throwsMsg(() => render('finding', '# x\n证据: [observed] y', 'F1 maybe'), /invalid confidence/);
  assert.match(render('finding', '# x\nevidence: [observed] y', 'F3 low'), /confidence: low[\s\S]*<dt>Evidence<\/dt>/);
});

test('glossary + [[term]]: links, aliases, hover definition, untouched in code, undefined term is an error', () => {
  const src = '---\ntitle: t\n---\n## A\n见 [[KV cache]]、[[键值缓存]] 和 [[缓存|KV cache]]，代码 `[[1,2]]` 不变。\n## B\n```glossary\nKV cache | 键值缓存 | 保存 K 和 V。 | 不是 HTTP 缓存\n```\n';
  const { html } = renderDoc(src);
  assert.equal((html.match(/class="am-term" href="#g-kv-cache"/g) || []).length, 3);
  assert.match(html, /data-tip="KV cache \(键值缓存\): 保存 K 和 V。"/);
  assert.match(html, /<dt id="g-kv-cache">KV cache<span class="am-gl-alias">键值缓存/);
  assert.match(html, /<code>\[\[1,2\]\]<\/code>/);
  assert.throws(() => renderDoc('## A\n[[没有]]\n'), (e) => e instanceof RenderError && e.line === 2 && /not defined in a glossary/.test(e.message));
});

// ── research template ──
const RESEARCH = `---
template: research
title: 研究页
cols: 2
---
导语。
## A 总览一 {sheet}
x
## B 总览二 {sheet}
y
## C 如何阅读 {depth=1}
z
## D 背景
w
## E 复现 {depth=3}
v
`;

test('research: overview sheet, body depths, contents and reading-path buttons in the page language', () => {
  const { html, live } = renderDoc(RESEARCH);
  assert.deepEqual(live, []);
  assert.match(html, /<section class="am-overview" data-depth="1" id="overview">/);
  assert.match(html, /id="panel-A" data-depth="1"/);
  assert.match(html, /id="panel-C" data-depth="1"/);
  assert.match(html, /id="panel-D" data-depth="2"/);
  assert.match(html, /id="panel-E" data-depth="3"/);
  assert.match(html, /<a href="#panel-E" data-depth="3">E · 复现<\/a>/);
  assert.equal((html.match(/data-am-path=/g) || []).length, 3);
  assert.match(html, /<span>阅读路径<\/span>/);
  assert.match(html, /<a href="#overview" data-depth="1">总览<\/a>/);
  assert.doesNotMatch(html, /am-diagram-runtime/, 'no diagram runtime without figures');
  assert.match(renderDoc(RESEARCH.replace('cols: 2', 'cols: 2\nlang: en')).html, /<span>Reading path<\/span>/);
});

test('render: a page with excalidraw / uml inlines the diagram runtime and returns live; ```mermaid counts as uml', () => {
  const { html, live } = renderDoc(`## A\n\`\`\`uml\nclassDiagram\n A <|-- B\n\`\`\`\n## B\n\`\`\`excalidraw\n${SPEC}\n\`\`\`\n`);
  assert.deepEqual(live.sort(), ['excalidraw', 'uml']);
  assert.match(html, /<script type="module" id="am-diagram-runtime">/);
  assert.match(html, /data-am-live="pending"/);
  assert.match(html, /id="fig-1"[\s\S]*id="fig-2"/);
  assert.match(html, /^<html [^>]*data-am-live="pending">/m);
  const mermaid = renderDoc('## A\n```mermaid\nclassDiagram\n A <|-- B\n```\n');
  assert.deepEqual(mermaid.live, ['uml']);
  assert.deepEqual(mermaid.stats.components, { uml: 1 });
});

test('lint research: warns about a missing q / prereq / finding / glossary / sheet', () => {
  const doc = parseDoc('---\ntemplate: research\n---\n## A\n```uml\nclassDiagram\n A <|-- B\n```\n');
  const rules = lintDoc(doc).filter((w) => w.rule === 'research').map((w) => w.message).join('\n');
  for (const s of ['has no q=', 'prereq', 'finding', 'glossary', '{sheet}']) assert.ok(rules.includes(s), s);
  assert.equal(lintDoc(parseDoc('## A\n```uml\nclassDiagram\n A <|-- B\n```\n')).filter((w) => w.rule === 'research').length, 0, 'other templates are not checked');
});

test('lint: prereq / finding fields are checked one by one; the added English / Chinese words are flagged', () => {
  const doc = parseDoc('## A\n```finding F1 high\n# x\n结论: 这在一定程度上改善了性能。\n证据: [observed] It is very robust.\n```\n');
  const ws = lintDoc(doc);
  assert.ok(ws.some((w) => w.rule === 'cliche' && /一定程度上/.test(w.message) && w.line === 4));
  assert.ok(ws.some((w) => /"very"/.test(w.message)));
  assert.ok(ws.some((w) => /"robust"/.test(w.message)));
  assert.ok(!ws.some((w) => w.rule === 'paragraph-length'));
});

// ── CLI ──
function sink() {
  let text = '';
  return { stream: new Writable({ write(c, _e, cb) { text += c; cb(); } }), get text() { return text; } };
}
async function run(args, { stdin = '', env = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'am-r-'));
  const out = sink();
  const err = sink();
  const code = await main(args, { stdout: out.stream, stderr: err.stream, stdin: Readable.from([stdin]), env: { AM_NO_OPEN: '1', AM_HOME: dir, ...env }, cwd: dir });
  return { code, out: out.text, err: err.text, dir };
}

test('cli render: AM_NO_BAKE skips baking and suggests am bake for later', async () => {
  const r = await run(['render', '-'], { stdin: `## A\n\`\`\`excalidraw\n${SPEC}\n\`\`\`\n`, env: { AM_NO_BAKE: '1' } });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /Not baked \(turned off\)/);
  rmSync(r.dir, { recursive: true, force: true });
});

test('cli: help takes an alias; list shows the research template and the new components', async () => {
  assert.match((await run(['help', 'mermaid'])).out, /^uml —/);
  const list = (await run(['list'])).out;
  for (const s of ['research', 'excalidraw', 'uml', 'prereq', 'finding', 'glossary']) assert.ok(list.includes(s), s);
  const bake = await run(['bake']);
  assert.equal(bake.code, 2);
});

// ── A real bake: needs Chrome, Node 22+ and the network (CDN). Runs only with AM_TEST_BAKE=1. ──
const canBake = process.env.AM_TEST_BAKE === '1' && findChrome() && typeof WebSocket !== 'undefined';
test('bake: excalidraw + uml bake into a single file with no dependencies', { skip: !canBake && 'runs with AM_TEST_BAKE=1 and a local Chrome' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'am-bake-'));
  try {
    const file = join(dir, 'p.html');
    const { html } = renderDoc(`## A\n\`\`\`uml q="x"\nsequenceDiagram\n  A->>B: hi\n\`\`\`\n## B\n\`\`\`excalidraw q="y"\n${SPEC}\n\`\`\`\n`);
    writeFileSync(file, html);
    const r = await bakeFile(file);
    assert.equal(r.state, 'ok', JSON.stringify(r.errors));
    assert.equal(r.baked, true);
    const out = readFileSync(file, 'utf8');
    assert.doesNotMatch(out, /am-diagram-runtime|esm\.sh|cdn\.jsdelivr/);
    assert.equal((out.match(/data-am-done="1"/g) || []).length, 2);
    assert.match(out, /class="am-excal-file"/);
    assert.match(out, /data-am="excal-dl"/);
    // Only the figures come from the browser: the page script's load-time changes are not frozen into the file.
    assert.equal((out.match(/<script>/g) || []).length, 1);
    assert.match(out, /<html [^>]*data-am-baked="[^"]+">/);
    assert.doesNotMatch(out, /<html[^>]*data-path=|<button[^>]*aria-pressed=|class="am-diagram-expand"/);
    assert.equal(readPage(out).source.includes('sequenceDiagram'), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── Phone layout (regression: the research desktop rules were more specific than the 760px one-column rule, leaving ~77px of body) ──
// [start, text] of each @media (max-width: 760px) block in css.
function mobileBlocks(css) {
  const out = [];
  const re = /@media \(max-width: 760px\) \{/g;
  let m;
  while ((m = re.exec(css))) {
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < css.length && depth; i++) depth += css[i] === '{' ? 1 : css[i] === '}' ? -1 : 0;
    out.push([m.index, css.slice(m.index, i)]);
  }
  return out;
}

test('css: the research one-column phone rule comes after the desktop rule, at the same specificity', () => {
  const css = pageCss();
  const desktop = css.indexOf('.am-research .am-doc-layout { grid-template-columns: 210px');
  assert.ok(desktop > 0, 'no research desktop layout rule');
  const override = mobileBlocks(css).find(([at, body]) => at > desktop && /\.am-research \.am-doc-layout \{ grid-template-columns: minmax\(0, 1fr\)/.test(body));
  assert.ok(override, 'no .am-research .am-doc-layout one-column rule in a 760px block after the desktop rule');
  assert.match(override[1], /\.am-research \{ padding: 56px 12px/, 'on a phone the research page leaves room for the toolbar and narrows its margins');
});

test('css: on a phone the toolbar is not fixed over the text', () => {
  const css = pageCss();
  assert.ok(mobileBlocks(css).some(([, body]) => /\.am-toolbar \{ position: absolute; \}/.test(body)));
});

test('layout: at 375px a research page body is nearly full width with no horizontal overflow', { skip: !canBake && 'runs with AM_TEST_BAKE=1 and a local Chrome' }, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'am-mobile-'));
  try {
    const file = join(dir, 'p.html');
    writeFileSync(file, renderDoc(`${RESEARCH}\n## F 长表格\n| a | b | c | d |\n|---|---|---|---|\n| 很长很长的单元格内容 | 很长很长的单元格内容 | 很长很长的单元格内容 | 很长很长的单元格内容 |\n`).html);
    const r = await shotFile(file, { outDir: join(dir, 'shots'), width: 375, only: ['body'] });
    const { docW, viewW, items } = r.layout;
    assert.ok(items.body[2] >= 330, `the body is only ${items.body[2]}px wide`);
    assert.ok(docW <= viewW + 1, `horizontal overflow: the page is ${docW}px in a ${viewW}px viewport`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── Splicing, patch and labels (no Chrome needed) ──
test('bake: spliceFigures replaces only the drawn figures, drops the runtime and marks the root as baked', () => {
  const { html } = renderDoc(`## A\n\`\`\`uml q="x"\nclassDiagram\n A <|-- B\n\`\`\`\n`);
  const drawn = '<figure class="am-fig am-uml" id="fig-1" data-am-live="uml" data-am-done="1"><div class="am-fig-canvas"><svg></svg></div></figure>';
  const out = spliceFigures(html, [['fig-1', drawn]], '2026-10-10T10:00');
  assert.ok(out.includes(drawn));
  assert.doesNotMatch(out, /id="am-diagram-runtime"|<div id="am-render-errors"|data-am-live="pending"|class="am-fig-pending"/);
  assert.match(out, /<html [^>]*data-am-baked="2026-10-10T10:00">/);
  assert.equal(readPage(out).source, readPage(html).source);
});

test('patch: a research page keeps its template', () => {
  assert.equal(readPage(renderDoc(RESEARCH).html).template, 'research');
});

test('labels: every language with page labels has research labels with the same keys as English', () => {
  const keysOf = (value, prefix = '') =>
    Object.entries(value).flatMap(([k, v]) => (v && typeof v === 'object' ? keysOf(v, `${prefix}${k}.`) : [`${prefix}${k}`])).sort();
  for (const { id } of LANGUAGES) {
    assert.ok(researchLabelIds().includes(id), `no research labels for ${id}`);
    assert.deepEqual(keysOf(researchLabels(id)), keysOf(researchLabels('en')), id);
  }
  assert.equal(researchLabels('fr'), researchLabels('en'));
});

test('update: a fork version compares its upstream base and never suggests npx skills update', async () => {
  const { updateHint } = await import('../src/update.js');
  const hint = updateHint({ latestVersion: '0.5.1' }, '0.5.0-research.1', '/p/.claude/skills/answer-me-with-html/scripts/am.mjs');
  assert.match(hint, /upstream Answer me with HTML 0\.5\.1/);
  assert.match(hint, /do not run npx skills update/);
  assert.equal(updateHint({ latestVersion: '0.5.0' }, '0.5.0-research.1', 'x'), null);
});

test('skill: SKILL.md keeps the always-on marker and documents the research fork additions', () => {
  const skill = readFileSync(new URL('../../SKILL.md', import.meta.url), 'utf8');
  for (const s of ['[answer-me-with-html always-on]', 'references/research.md', 'am shot', 'excalidraw', 'uml', 'prereq', 'finding', 'glossary']) {
    assert.ok(skill.includes(s), s);
  }
  assert.doesNotMatch(skill, /references\/video\.md/, 'the fork does not document am video');
});
