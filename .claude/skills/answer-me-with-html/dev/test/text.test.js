import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measure, wrap, esc, isCJK } from '../src/svg/text.js';

test('esc: 转义 HTML 特殊字符', () => {
  assert.equal(esc(`<a href="x">&'</a>`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  assert.equal(esc(undefined), '');
});

test('isCJK: 识别中日韩字符与全角标点', () => {
  assert.ok(isCJK('中'));
  assert.ok(isCJK('，'));
  assert.ok(!isCJK('a'));
});

test('measure: 中文字宽约等于字号，英文明显更窄', () => {
  assert.equal(measure('中文', 10), 20);
  const latin = measure('ab', 10);
  assert.ok(latin > 8 && latin < 14, `latin=${latin}`);
  assert.ok(measure('WWW', 10) > measure('iii', 10));
});

test('measure: 等宽模式下每个拉丁字符 0.6em', () => {
  assert.equal(measure('abcd', 10, { mono: true }), 24);
  assert.equal(measure('中', 10, { mono: true }), 10);
});

test('wrap: 英文按单词换行，不拆单词', () => {
  const lines = wrap('the quick brown fox jumps', 60, 10);
  assert.ok(lines.length > 1);
  assert.equal(lines.join(' '), 'the quick brown fox jumps');
  for (const l of lines) assert.ok(!l.startsWith(' ') && !l.endsWith(' '));
});

test('wrap: 中文按字换行，每行不超宽', () => {
  const lines = wrap('一二三四五六七八九十', 40, 10);
  assert.deepEqual(lines, ['一二三四', '五六七八', '九十']);
});

test('wrap: 超长单词独占一行，不丢字', () => {
  const lines = wrap('supercalifragilistic ok', 50, 10);
  assert.equal(lines[0], 'supercalifragilistic');
  assert.equal(lines[1], 'ok');
});

test('wrap: 空串返回单个空行', () => {
  assert.deepEqual(wrap('', 50, 10), ['']);
});
