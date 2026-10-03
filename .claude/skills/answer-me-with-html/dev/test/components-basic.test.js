import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMPONENTS, ComponentError } from '../src/components/index.js';

const ctx = (args = '') => ({ args, uid: (() => { let n = 0; return () => `u${++n}`; })() });
const render = (name, text, args) => COMPONENTS.get(name).render(text, ctx(args));
const throwsAt = (fn, line) =>
  assert.throws(fn, (e) => e instanceof ComponentError && e.line === line);

test('每个组件都提供 name / summary / syntax / example，且 example 能成功渲染', () => {
  assert.ok(COMPONENTS.size >= 4);
  for (const [name, c] of COMPONENTS) {
    for (const key of ['summary', 'syntax', 'example']) assert.ok(c[key], `${name}.${key}`);
    const m = c.example.match(/^```(\S+)\s*(.*)\n([\s\S]*?)\n```$/);
    assert.ok(m, `${name}.example 必须是一个完整围栏块`);
    assert.equal(m[1], name);
    assert.ok(c.render(m[3], ctx(m[2])).length > 0);
  }
});

// ── callout ──
test('callout: 类型 + 标题 + markdown 正文', () => {
  const html = render('callout', '先 **关闭** 阀门。', 'warn 注意');
  assert.match(html, /am-callout am-callout--warn/);
  assert.match(html, /am-callout-title">注意/);
  assert.match(html, /<strong>关闭<\/strong>/);
});

test('callout: 首参数不是类型时整体作为标题，类型默认 info', () => {
  const html = render('callout', '正文', '核心结论');
  assert.match(html, /am-callout--info/);
  assert.match(html, /核心结论/);
});

test('callout: 标题与正文都为空时报错', () => {
  throwsAt(() => render('callout', '  ', ''), 1);
});

// ── kv ──
test('kv: 键值对、首个冒号切分、全角冒号、* 宽格、cols 参数', () => {
  const html = render('kv', '* Title: STE: overview\nOwner：ASD\nSheet: 1 of 1', 'cols=3');
  assert.match(html, /--kv-cols: 3/);
  assert.match(html, /am-kv-cell--wide"><dt>Title<\/dt><dd>STE: overview<\/dd>/);
  assert.match(html, /<dt>Owner<\/dt><dd>ASD<\/dd>/);
});

test('kv: 缺少冒号的行报告相对行号', () => {
  throwsAt(() => render('kv', 'a: 1\n\n没有冒号'), 3);
});

// ── timeline ──
test('timeline: 默认横向；* 标记高亮；第三列为说明', () => {
  const html = render('timeline', '1979 | 启动 | AECMA 开始研究\n*Now | 免费下载');
  assert.match(html, /am-timeline--h" style="--n: 2"/);
  assert.match(html, /am-tl-item--hi/);
  assert.match(html, /am-tl-when">Now/);
  assert.match(html, /am-tl-text">AECMA 开始研究/);
});

test('timeline: 超过 6 项或参数 v 时纵向', () => {
  const many = Array.from({ length: 7 }, (_, i) => `${2000 + i} | 事件${i}`).join('\n');
  assert.match(render('timeline', many), /am-timeline--v/);
  assert.match(render('timeline', 'a | b', 'v'), /am-timeline--v/);
});

test('timeline: 缺少 | 报错', () => {
  throwsAt(() => render('timeline', 'a | b\n只有一列'), 2);
});

// ── annot ──
test('annot: [文本]{注释} 渲染为下划线段落 + 注释，! 前缀为错误样式', () => {
  const html = render('annot', '# 1 程序性句子 | 13 words\nMake sure [the pump]{Technical name} is [on]{!Not "activated"}.\n> 说明');
  assert.match(html, /am-annot-head"><span>1 程序性句子<\/span><span class="am-annot-meta">13 words/);
  assert.match(html, /<span class="am-seg"><span class="am-seg-t">the pump<\/span><span class="am-seg-n" style="--row: 0">Technical name<\/span><\/span>/);
  assert.match(html, /am-seg am-seg--err/);
  assert.match(html, /am-annot-caption">说明/);
});

test('annot: 相互重叠的注释自动错行', () => {
  const html = render('annot', '[a]{a long annotation text here} [b]{another long one}');
  assert.match(html, /--row: 1/);
  assert.match(html, /--rows: 2/);
});

test('annot: 转义正文中的 HTML', () => {
  const html = render('annot', 'if [a < b]{比较} then');
  assert.match(html, /a &lt; b/);
});

test('annot: 未闭合的标注报错', () => {
  throwsAt(() => render('annot', 'ok line\nbad [seg]{note'), 2);
});

test('annot: 只有 {!} 无注释文字的句子允许换行', () => {
  const html = render('annot', 'It is [imperative]{!} that you [ensure]{!} it.');
  assert.match(html, /am-annot-line am-annot-line--wrap" style="--rows: 0"/);
});
