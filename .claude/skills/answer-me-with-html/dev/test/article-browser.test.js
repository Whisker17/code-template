// Research fork — the article template's contents column in Chrome: sub-sections start folded, only the section being read is unfolded,
// the fold animates its height (none with reduced motion), folded links are out of the Tab order, the marked link stays inside a
// scrolling contents box, and without the page script every sub-section stays reachable.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { connect, devtoolsUrl, findChrome } from '../src/video/export.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CHROME = findChrome();
const SKIP = process.env.AM_E2E !== '1'
  ? 'set AM_E2E=1 to run the browser article tests'
  : !CHROME ? 'no Chrome found (set AM_CHROME)' : typeof WebSocket === 'undefined' ? 'needs Node 22 (built-in WebSocket)' : false;

const filler = (n) => Array.from({ length: n }, (_, i) => `Paragraph ${i + 1} of filler text that keeps the reader busy for a while, long enough to wrap.`).join('\n\n');
// `sections` sections, each with three sub-sections of filler text.
const draft = (sections) => `---
template: article
title: Folding contents
lang: en
---
Lead.

${Array.from({ length: sections }, (_, s) => `## Section ${s + 1}

${filler(3)}

${[1, 2, 3].map((k) => `### Part ${s + 1}.${k}\n\n${filler(4)}`).join('\n\n')}`).join('\n\n')}
`;

let tmp;
let chrome;
let cdp;
let session;
const send = (method, params) => cdp.send(method, params, session);
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(`page script error: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
  return r.result.value;
};
const render = (name, source) => {
  const md = join(tmp, `${name}.md`);
  const file = join(tmp, `${name}.html`);
  writeFileSync(md, source);
  execFileSync(process.execPath, [join(ROOT, 'bin/am.js'), 'render', md, '-o', file, '--no-open'], {
    env: { ...process.env, AM_NO_UPDATE_CHECK: '1', AM_HOME: join(tmp, 'home') }, stdio: 'pipe',
  });
  return file;
};
const load = async (file, { width = 1280, height = 800 } = {}) => {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  const loaded = cdp.once('Page.loadEventFired');
  await send('Page.navigate', { url: pathToFileURL(file).href });
  await loaded;
};
const settle = (ms = 500) => new Promise((r) => setTimeout(r, ms));

// State of the contents column: which groups are open, each sub-section box's height and visibility, the marked link.
const STATE = `(() => {
  const toc = document.querySelector('.am-toc');
  const groups = [...toc.querySelectorAll('.am-toc-g')];
  return {
    fold: toc.hasAttribute('data-fold'),
    open: groups.flatMap((g, i) => (g.classList.contains('is-open') ? [i + 1] : [])),
    boxes: groups.map((g) => { const b = g.querySelector('.am-toc-subs'); return { h: Math.round(b.getBoundingClientRect().height), vis: getComputedStyle(b).visibility }; }),
    on: toc.querySelector('a.is-on')?.textContent ?? null,
    errors: window.__errors,
  };
})()`;
const state = () => evaluate(STATE);
const scrollToId = (id) => evaluate(`document.getElementById(${JSON.stringify(id)}).scrollIntoView({ block: 'start', behavior: 'instant' }), scrollBy({ top: -40, behavior: 'instant' })`);

before(async () => {
  if (SKIP) return;
  tmp = mkdtempSync(join(tmpdir(), 'am-article-'));
  chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${join(tmp, 'profile')}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  cdp = await connect(await devtoolsUrl(chrome));
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  ({ sessionId: session } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }));
  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__errors = [];
      addEventListener('error', (e) => window.__errors.push(String(e.message)));
      addEventListener('unhandledrejection', (e) => window.__errors.push(String(e.reason)));`,
  });
});

after(async () => {
  cdp?.close();
  if (chrome && chrome.exitCode === null) {
    await new Promise((r) => {
      const timer = setTimeout(r, 3000);
      chrome.once('exit', () => { clearTimeout(timer); r(); });
      chrome.kill();
    });
  }
  try {
    if (tmp) rmSync(tmp, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 });
  } catch (e) {
    console.warn(`Could not remove ${tmp}: ${e.message}`);
  }
});

test('article contents: all folded at the top; the section being read unfolds, the previous one folds; folded links are out of the Tab order', { skip: SKIP }, async () => {
  await load(render('fold', draft(4)));
  await settle();
  let s = await state();
  assert.equal(s.fold, true, 'the page script turned folding on');
  assert.deepEqual(s.open, [], 'before the first section every group is folded');
  assert.ok(s.boxes.every((b) => b.h === 0 && b.vis === 'hidden'), JSON.stringify(s.boxes));
  // Tab from the contents title: only section links take focus, never a folded sub-section link
  const tabbed = await evaluate(`(() => {
    const subs = [...document.querySelectorAll('.am-toc-sub')];
    return subs.every((a) => { a.focus(); return document.activeElement !== a; });
  })()`);
  assert.equal(tabbed, true, 'folded sub-section links cannot take focus');

  await scrollToId('panel-B-2');
  await settle();
  s = await state();
  assert.deepEqual(s.open, [2], 'reading 2.2 unfolds section 2 only');
  assert.equal(s.on, '2.2 Part 2.2');
  assert.ok(s.boxes[1].h > 60 && s.boxes[1].vis === 'visible', JSON.stringify(s.boxes[1]));
  assert.ok([0, 2, 3].every((i) => s.boxes[i].h === 0 && s.boxes[i].vis === 'hidden'));
  assert.equal(await evaluate(`(() => { const a = document.querySelector('a[href="#panel-B-1"]'); a.focus(); return document.activeElement === a; })()`), true, 'open sub-section links take focus');

  await scrollToId('panel-C');
  await settle();
  s = await state();
  assert.deepEqual(s.open, [3], 'moving on to section 3 folds section 2 and unfolds section 3');
  assert.equal(s.boxes[1].h, 0);
  assert.ok(s.boxes[2].h > 60);
  assert.deepEqual(s.errors, []);
});

test('article contents: the fold animates its height; reduced motion turns the animation off', { skip: SKIP }, async () => {
  await load(render('motion', draft(3)));
  await settle();
  const transition = () => evaluate(`(() => { const c = getComputedStyle(document.querySelector('.am-toc-subs')); return { prop: c.transitionProperty, dur: c.transitionDuration }; })()`);
  const t = await transition();
  assert.match(t.prop, /grid-template-rows/);
  assert.ok(t.dur.split(',').some((d) => parseFloat(d) > 0.2), t.dur);
  // halfway through unfolding the box is between closed and open: the height animates, it does not jump
  await scrollToId('panel-B');
  await settle(140);
  const mid = (await state()).boxes[1].h;
  await settle(500);
  const full = (await state()).boxes[1].h;
  assert.ok(mid > 0 && mid < full, `mid ${mid} / full ${full}`);

  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  assert.ok((await transition()).dur.split(',').every((d) => parseFloat(d) === 0));
  await send('Emulation.setEmulatedMedia', { features: [] });
});

test('article contents: a long list scrolls to keep the marked link in view; without the page script nothing folds', { skip: SKIP }, async () => {
  const file = render('long', draft(14));
  await load(file, { width: 1280, height: 560 });
  await settle();
  // the end of the page: the short last sub-section never reaches the 25% line, it is marked because the page cannot scroll further
  await evaluate(`scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })`);
  await settle(900);
  const inView = await evaluate(`(() => {
    const toc = document.querySelector('.am-toc'); const a = toc.querySelector('a.is-on');
    const r = a.getBoundingClientRect(); const b = toc.getBoundingClientRect();
    window.__dbg = { st: toc.scrollTop, sh: toc.scrollHeight, ch: toc.clientHeight, r: [r.top, r.bottom], b: [b.top, b.bottom], y: scrollY };
    return { scrolls: toc.scrollHeight > toc.clientHeight, on: a.textContent, inside: r.top >= b.top - 1 && r.bottom <= b.bottom + 1 };
  })()`);
  assert.deepEqual(inView, { scrolls: true, on: '14.3 Part 14.3', inside: true }, JSON.stringify(await evaluate('window.__dbg')));

  await send('Emulation.setScriptExecutionDisabled', { value: true });
  await load(file);
  const s = await evaluate(`(() => { const toc = document.querySelector('.am-toc'); return { fold: toc.hasAttribute('data-fold'), shown: [...toc.querySelectorAll('.am-toc-subs')].every((b) => b.getBoundingClientRect().height > 0 && getComputedStyle(b).visibility === 'visible') }; })()`);
  await send('Emulation.setScriptExecutionDisabled', { value: false });
  assert.deepEqual(s, { fold: false, shown: true });
});
