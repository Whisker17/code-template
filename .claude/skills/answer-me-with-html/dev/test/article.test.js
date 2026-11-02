// Research fork tests: the article template (long-form report), its theme, {ID} evidence chips and the --evidence flag.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { renderDoc, RenderError } from '../src/render.js';
import { ParseError } from '../src/parse.js';
import { readPage } from '../src/page.js';
import { main } from '../src/cli.js';
import { numberSubheads } from '../src/templates/article.js';
import { loadMath } from '../src/math-load.js';

await loadMath('$x$');

const DRAFT = `---
template: article
title: Two paths
subtitle: The sequencer is where both paths meet.
audience: devs
lang: en
---
The page answers two questions {K1}.

## Paths

The real-time path is fast {K1, K2}. A guess {S1}.

### Block loop

Code stays code: \`{K9}\`, \`\` {K9} \`\`, math $x_{K9}$, a [link](https://example.com/{K9}) and <span title="{K9}">html</span>.

    indented {K9}

\`\`\`finding F1 high
# Preconf is on
claim: Both nodes run it.
evidence: [observed] Node config {K2}.
\`\`\`

## Terms

Text.
`;

const LEDGER = {
  K1: { claim: 'Two questions', evidence: 'draft §1', type: 'observed' },
  K2: { claim: 'Block time 2 s', evidence: 'rpc', type: 'inferred' },
  S1: { claim: 'It may change', evidence: 'guess', type: 'speculative' },
  K7: { claim: 'Unused', evidence: 'x', type: 'observed' },
};

const page = (draft = DRAFT, evidence = LEDGER) => renderDoc(draft, { style: 'off' }, {}, { evidence });

test('article: title block, contents and numbered sections in one reading column', () => {
  const { html, meta } = page();
  assert.equal(meta.template, 'article');
  assert.match(html, /<main class="am-article" data-am-labels="[^"]*">/);
  assert.match(html, /<nav class="am-toc"[^>]*><p class="am-toc-t">Contents<\/p><a href="#panel-A">1 Paths<\/a><a href="#panel-A-1" class="am-toc-sub">1\.1 Block loop<\/a><a href="#panel-B">2 Terms<\/a><\/nav>/);
  assert.match(html, /<section class="am-part" id="panel-A">\n<h2><span class="am-sn">1<\/span>Paths<\/h2>/);
  assert.match(html, /<h3 id="panel-A-1"><span class="am-sn">1\.1<\/span>Block loop<\/h3>/);
  assert.equal(html.match(/class="am-doc-body"/g).length, 1, 'one comment root');
  assert.doesNotMatch(html, /class="am-paths"/);
  assert.match(html, /<p class="am-sub">The sequencer is where both paths meet\.<\/p>/);
});

test('article: no toolbar; the colophon closes the reading column; readPage knows the template', () => {
  const { html } = page();
  assert.doesNotMatch(html, /class="am-toolbar"/);
  assert.match(html, /<footer class="am-art-foot"><p class="am-colophon">[\s\S]*?<\/footer>\n<\/div>\n<\/main>/);
  assert.doesNotMatch(html.split('<body>')[1].split('<footer class="am-art-foot">')[0], /am-colophon/);
  assert.equal(readPage(html).template, 'article');
});

test('article: always uses the article theme, and only that theme is embedded', () => {
  const { html, meta } = renderDoc(DRAFT.replace('template: article', 'template: article\ntheme: blueprint'), { style: 'off' }, {}, { evidence: LEDGER });
  assert.equal(meta.theme, 'article');
  assert.match(html, /data-theme="article"/);
  assert.match(html, /html\[data-theme="article"\]/);
  assert.doesNotMatch(html, /html\[data-theme="blueprint"\]/);
});

test('article theme: other templates cannot pick it and do not carry it', () => {
  const doc = DRAFT.replace('template: article', 'template: doc');
  assert.doesNotMatch(renderDoc(doc, { style: 'off' }).html, /data-theme="article"|html\[data-theme="article"\]/);
  assert.throws(() => renderDoc(doc.replace('template: doc', 'template: doc\ntheme: article'), { style: 'off' }), ParseError);
});

test('evidence: {ID} becomes a chip of its kind, in text and in component fields; code and math stay text', () => {
  const { html } = page();
  assert.match(html, /questions <sup class="am-ev am-ev--observed" data-ev="K1" tabindex="0">K1<\/sup>/);
  assert.match(html, /<sup class="am-ev am-ev--observed" data-ev="K1" tabindex="0">K1<\/sup><sup class="am-ev am-ev--inferred" data-ev="K2" tabindex="0">K2<\/sup>/);
  assert.match(html, /am-ev--speculative" data-ev="S1"/);
  assert.match(html, /Node config <sup class="am-ev am-ev--inferred" data-ev="K2"/);
  assert.match(html, /<code>\{K9\}<\/code>/);
  assert.match(html, /href="https:\/\/example\.com\/%7BK9%7D"/);
  assert.match(html, /title="\{K9\}"/);
  assert.match(html, /<pre><code>indented \{K9\}/);
  assert.doesNotMatch(html, /data-ev="K9"/);
});

test('evidence: the page carries only the rows it cites', () => {
  const data = JSON.parse(page().html.match(/<script type="application\/json" id="am-evidence">(.*?)<\/script>/)[1]);
  assert.deepEqual(Object.keys(data).sort(), ['K1', 'K2', 'S1']);
});

test('evidence: an ID the ledger lacks is a render error at the line that cites it (not at a code example)', () => {
  const draft = DRAFT.replace('The page answers', 'Write \`{Q404}\` to cite. The page answers').replace('A guess {S1}.', 'A guess {S1}.\n\nMissing {Q404}.');
  assert.throws(() => page(draft), (e) => e instanceof RenderError && /\{Q404\} is not in the claim ledger/.test(e.message) && e.line === draft.split('\n').findIndex((l) => l.startsWith('Missing {Q404}')) + 1);
});

test('evidence: without a ledger the braces stay text', () => {
  const { html } = page(DRAFT, null);
  assert.match(html, /questions \{K1\}/);
  assert.doesNotMatch(html, /<script type="application\/json" id="am-evidence">/);
});

test('numberSubheads: card titles inside <article> are not sections', () => {
  const { body, subs } = numberSubheads('<div class="am-md"><h3>A</h3></div><article class="am-finding"><h3>card</h3></article><h3>B</h3>', 4, 'X');
  assert.deepEqual(subs.map((s) => s.no), ['4.1', '4.2']);
  assert.match(body, /<article class="am-finding"><h3>card<\/h3><\/article>/);
});

test('cli: render --evidence reads the ledger file; a bad file is a clear error', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'am-article-'));
  try {
    writeFileSync(join(dir, 'd.md'), DRAFT);
    writeFileSync(join(dir, 'ev.json'), JSON.stringify(LEDGER));
    writeFileSync(join(dir, 'bad.json'), JSON.stringify({ K1: { claim: 'x', evidence: 'y', type: 'maybe' } }));
    const sink = () => { let s = ''; return Object.assign(new Writable({ write(c, _, cb) { s += c; cb(); } }), { text: () => s }); };
    const io = (out, err) => ({ cwd: dir, stdout: out, stderr: err, env: { AM_NO_OPEN: '1', AM_NO_BAKE: '1', AM_HOME: join(dir, 'home') } });
    let out = sink(); let err = sink();
    assert.equal(await main(['render', 'd.md', '-o', 'd.html', '--evidence', 'ev.json'], io(out, err)), 0, err.text());
    assert.match(readFileSync(join(dir, 'd.html'), 'utf8'), /data-ev="K2"/);
    out = sink(); err = sink();
    assert.notEqual(await main(['render', 'd.md', '-o', 'e.html', '--evidence', 'bad.json'], io(out, err)), 0);
    assert.match(err.text(), /--evidence: row "K1" needs/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('cli: patch keeps the evidence the page carries; a new ID needs --evidence again', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'am-article-'));
  try {
    writeFileSync(join(dir, 'd.md'), DRAFT);
    writeFileSync(join(dir, 'ev.json'), JSON.stringify(LEDGER));
    const sink = () => { let s = ''; return Object.assign(new Writable({ write(c, _, cb) { s += c; cb(); } }), { text: () => s }); };
    const run = async (args, stdin = '') => {
      const out = sink(); const err = sink();
      const code = await main(args, { cwd: dir, stdout: out, stderr: err, stdin: Readable.from([stdin]), env: { AM_NO_OPEN: '1', AM_NO_BAKE: '1', AM_HOME: join(dir, 'home') } });
      return { code, err: err.text() };
    };
    assert.equal((await run(['render', 'd.md', '-o', 'd.html', '--evidence', 'ev.json'])).code, 0);
    let r = await run(['patch', join(dir, 'd.html'), '-', '--panel', 'Terms'], 'New text.\n');
    assert.equal(r.code, 0, r.err);
    const html = readFileSync(join(dir, 'd.html'), 'utf8');
    assert.match(html, /data-ev="K2"/);
    assert.match(html, /New text\./);
    r = await run(['patch', join(dir, 'd.html'), '-', '--panel', 'Terms'], 'Cites {K7}.\n');
    assert.notEqual(r.code, 0);
    assert.match(r.err, /\{K7\} is not in the claim ledger/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
