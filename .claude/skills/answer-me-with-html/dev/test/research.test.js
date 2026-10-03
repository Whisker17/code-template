// research fork 的测试：excalidraw / uml 组件、研究组件、术语链接、research 模板、研究 lint、CLI 烘焙开关、真实烘焙（有 Chrome 时）。
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
import { findChrome, bakeFile } from '../src/bake.js';

const ctx = (args = '') => ({ args, uid: () => 'u1', fig: () => 1, line: 10 });
const render = (name, text, args) => COMPONENTS.get(name).render(text, ctx(args));
const throwsMsg = (fn, re, line) => assert.throws(fn, (e) => e instanceof ComponentError && re.test(e.message) && (line === undefined || e.line === line));

// ── excalidraw ──
const SPEC = JSON.stringify({ nodes: [{ id: 'a', label: 'A', col: 0, row: 0 }, { id: 'b', label: 'B', col: 1, row: 0 }], edges: [{ from: 'a', to: 'b', label: 'call' }] }, null, 1);

test('excalidraw: 输出图外壳、问题、要点与 spec，标记为需烘焙', () => {
  const html = render('excalidraw', SPEC, 'q="谁调用谁？" takeaway="A 调 B" name=demo');
  assert.match(html, /<figure class="am-fig am-excal" id="fig-1" data-am-live="excalidraw" data-line="10" data-name="demo">/);
  assert.match(html, /Q: 谁调用谁？/);
  assert.match(html, /要点：<\/b>A 调 B/);
  assert.match(html, /<script type="application\/json" class="am-excal-spec">/);
  assert.ok(LIVE.has('excalidraw'));
});

test('excalidraw: spec 里的 </script> 被转义', () => {
  const spec = JSON.stringify({ nodes: [{ id: 'a', label: '</script><b>', col: 0, row: 0 }] });
  assert.doesNotMatch(render('excalidraw', spec), /<\/script><b>/);
});

test('excalidraw: JSON 错误报行号', () => {
  throwsMsg(() => parseSpec('{\n "nodes": [\n  {"id": "a",}\n ]\n}'), /不是合法 JSON/, 3);
});

test('excalidraw: 校验未知节点、重复 id、缺位置、重叠、标签间距', () => {
  const v = (o) => { const t = JSON.stringify(o, null, 1); return validateSpec(JSON.parse(t), t); };
  throwsMsg(() => v({ nodes: [{ id: 'a', col: 0 }], edges: [{ from: 'a', to: 'x' }] }), /不存在的节点 "x"/);
  throwsMsg(() => v({ nodes: [{ id: 'a', col: 0 }, { id: 'a', col: 1 }] }), /id 重复/);
  throwsMsg(() => v({ nodes: [{ id: 'a' }] }), /需要 col\/row/);
  throwsMsg(() => v({ nodes: [{ id: 'a', col: 0, row: 0 }, { id: 'b', col: 0, row: 0 }] }), /重叠/);
  throwsMsg(() => v({ grid: { w: 220 }, nodes: [{ id: 'a', col: 0, row: 0 }, { id: 'b', col: 1, row: 0 }], edges: [{ from: 'a', to: 'b', label: '一个很长很长的中文标签' }] }), /需要约 \d+px 间距/);
  assert.ok(v({ nodes: [{ id: 'a', col: 0, row: 0 }, { id: 'b', col: 0, row: 1 }], edges: [{ from: 'a', to: 'b', label: '竖直方向的长标签不受宽度限制' }] }));
  assert.ok(labelWidth('ab') < labelWidth('中文'));
});

// ── uml ──
test('uml: 识别图类型（跳过 frontmatter 与 %% 注释），别名 mermaid', () => {
  assert.deepEqual(umlType('---\nconfig:\n  look: handDrawn\n---\n%% c\nclassDiagram\n A <|-- B'), { type: 'classDiagram', line: 6 });
  assert.equal(resolveComponent('mermaid').name, 'uml');
  const html = render('uml', 'sequenceDiagram\n A->>B: <<hi>>', 'q="x"');
  assert.match(html, /data-am-live="uml"/);
  assert.match(html, /UML · sequence/);
  assert.match(html, /class="am-uml-src">"sequenceDiagram\\n A->>B: \\u003c\\u003chi>>"/);
});

test('uml: 未知类型与 C4 报错', () => {
  throwsMsg(() => render('uml', 'graphx TD\n A-->B'), /未知的 UML 图类型/, 1);
  throwsMsg(() => render('uml', '\nC4Context\n Person(a, "x")'), /C4/, 2);
});

// ── prereq / finding / glossary ──
test('prereq: 标题、必填项、l1 标签、多行值与 ~~~ 代码', () => {
  const html = render('prereq', '# Q / K / V\n是什么: 三个向量。\n为什么需要: 可以缓存。\n例子:\n~~~\nx = 1\n~~~\n误解: 误解：缓存输出。\n依赖: B-0', 'B-1 l1 8min');
  assert.match(html, /<article class="am-prereq" id="p-B-1">/);
  assert.match(html, /am-prereq-id--l1">B-1/);
  assert.match(html, /~8min/);
  assert.match(html, /<dt>为什么这里需要<\/dt>/);
  assert.match(html, /<code>x = 1\n<\/code>/);
  assert.match(html, /am-prereq-mis/);
  assert.match(html, /依赖: B-0/);
  throwsMsg(() => render('prereq', '# X\n是什么: y', 'B-9'), /缺少 "为什么这里需要"/);
  throwsMsg(() => render('prereq', '是什么: y\n为什么: z', 'B-9'), /# 概念名/);
});

test('finding: 置信度、证据类型徽章、缺类型报错', () => {
  const html = render('finding', '# 论断\n结论: 快 3 倍。\n证据: [observed] 压测。[推断] 可能更快。\n影响: 换掉。', 'F2 高');
  assert.match(html, /<article class="am-finding" id="F2">/);
  assert.match(html, /am-conf--high/);
  assert.match(html, /am-kind--observed">observed/);
  assert.match(html, /am-kind--inferred">推断/);
  throwsMsg(() => render('finding', '# x\n证据: 我测过', 'F1 high'), /没有标注类型/, 2);
  throwsMsg(() => render('finding', '# x\n证据: [observed] y', 'F1 maybe'), /置信度/);
});

test('glossary + [[术语]]：链接、别名、悬停定义、代码里不替换、未定义报错', () => {
  const src = '---\ntitle: t\n---\n## A\n见 [[KV cache]]、[[键值缓存]] 和 [[缓存|KV cache]]，代码 `[[1,2]]` 不变。\n## B\n```glossary\nKV cache | 键值缓存 | 保存 K 和 V。 | 不是 HTTP 缓存\n```\n';
  const { html } = renderDoc(src);
  assert.equal((html.match(/class="am-term" href="#g-kv-cache"/g) || []).length, 3);
  assert.match(html, /data-tip="KV cache（键值缓存）：保存 K 和 V。"/);
  assert.match(html, /<dt id="g-kv-cache">KV cache<span class="am-gl-alias">键值缓存/);
  assert.match(html, /<code>\[\[1,2\]\]<\/code>/);
  assert.throws(() => renderDoc('## A\n[[没有]]\n'), (e) => e instanceof RenderError && e.line === 2 && /没有在 glossary/.test(e.message));
});

// ── research 模板 ──
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

test('research: 总览图纸、正文深度、目录、阅读路径按钮', () => {
  const { html, live } = renderDoc(RESEARCH);
  assert.deepEqual(live, []);
  assert.match(html, /<section class="am-overview" data-depth="1" id="overview">/);
  assert.match(html, /id="panel-A" data-depth="1"/);
  assert.match(html, /id="panel-C" data-depth="1"/);
  assert.match(html, /id="panel-D" data-depth="2"/);
  assert.match(html, /id="panel-E" data-depth="3"/);
  assert.match(html, /<a href="#panel-E" data-depth="3">E · 复现<\/a>/);
  assert.equal((html.match(/data-am-path=/g) || []).length, 3);
  assert.doesNotMatch(html, /am-diagram-runtime/, '无图时不内联图形运行时');
});

test('render: 含 excalidraw / uml 时内联图形运行时并返回 live', () => {
  const { html, live } = renderDoc(`## A\n\`\`\`uml\nclassDiagram\n A <|-- B\n\`\`\`\n## B\n\`\`\`excalidraw\n${SPEC}\n\`\`\`\n`);
  assert.deepEqual(live.sort(), ['excalidraw', 'uml']);
  assert.match(html, /<script type="module" id="am-diagram-runtime">/);
  assert.match(html, /data-am-live="pending"/);
  assert.match(html, /id="fig-1"[\s\S]*id="fig-2"/);
});

test('lint research: 缺少 q / prereq / finding / glossary / sheet 时警告', () => {
  const doc = parseDoc('---\ntemplate: research\n---\n## A\n```uml\nclassDiagram\n A <|-- B\n```\n');
  const rules = lintDoc(doc).filter((w) => w.rule === 'research').map((w) => w.message).join('\n');
  for (const s of ['缺少 q=', 'prereq', 'finding', 'glossary', '{sheet}']) assert.ok(rules.includes(s), s);
  assert.equal(lintDoc(parseDoc('## A\n```uml\nclassDiagram\n A <|-- B\n```\n')).filter((w) => w.rule === 'research').length, 0, '非 research 模板不检查');
});

test('lint: prereq / finding 的字段逐段检查；新增的英文 / 中文词表生效', () => {
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

test('cli render: AM_NO_BAKE 时不烘焙，提示稍后 am bake', async () => {
  const r = await run(['render', '-'], { stdin: `## A\n\`\`\`excalidraw\n${SPEC}\n\`\`\`\n`, env: { AM_NO_BAKE: '1' } });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /未烘焙（已关闭）/);
  rmSync(r.dir, { recursive: true, force: true });
});

test('cli: help 支持别名，list 列出 research 模板与新组件', async () => {
  assert.match((await run(['help', 'mermaid'])).out, /^uml —/);
  const list = (await run(['list'])).out;
  for (const s of ['research', 'excalidraw', 'uml', 'prereq', 'finding', 'glossary']) assert.ok(list.includes(s), s);
  const bake = await run(['bake']);
  assert.equal(bake.code, 2);
});

// ── 真实烘焙：需要 Chrome、Node 22+ 与网络（CDN）。设置 AM_TEST_BAKE=1 才运行。 ──
const canBake = process.env.AM_TEST_BAKE === '1' && findChrome() && typeof WebSocket !== 'undefined';
test('bake: excalidraw + uml 烘焙成零依赖单文件', { skip: !canBake && '设置 AM_TEST_BAKE=1 且本机有 Chrome 时运行' }, async () => {
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
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
