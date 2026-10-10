// Research fork — open a page in the local Chrome / Chromium (DevTools protocol) and wait for the diagram runtime to finish:
//   bakeFile: write the drawn excalidraw / uml figures back into the HTML and drop the CDN runtime → a single file with no dependencies.
//   shotFile: screenshot each panel / figure / the overview, so a person or a model can check the layout one image at a time.
// Uses only Node's built-in fetch and WebSocket (Node 22+); without Chrome or WebSocket it throws BakeUnavailable.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';

export class BakeUnavailable extends Error {
  constructor(message) {
    super(message);
    this.name = 'BakeUnavailable';
  }
}

const CANDIDATES = {
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
  linux: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'],
  win32: ['C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'],
};

export function findChrome(env = process.env) {
  const explicit = env.AM_CHROME || env.CHROME;
  if (explicit) return existsSync(explicit) ? explicit : null;
  return (CANDIDATES[process.platform] ?? []).find((p) => existsSync(p)) ?? null;
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString());
      if (msg.id && this.pending.has(msg.id)) {
        const { ok, ko } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? ko(new Error(`${msg.error.message}`)) : ok(msg.result ?? {});
      } else if (msg.method) {
        this.events.push(msg);
      }
    });
  }

  call(method, params = {}) {
    const id = ++this.id;
    return new Promise((ok, ko) => {
      this.pending.set(id, { ok, ko });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async js(expression) {
    const r = await this.call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    return r.result?.value;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function launch(width, env) {
  if (typeof WebSocket === 'undefined') throw new BakeUnavailable(`baking needs Node 22+ (built-in WebSocket); this is ${process.version}`);
  const chrome = findChrome(env);
  if (!chrome) throw new BakeUnavailable('no Chrome / Chromium / Edge found; set AM_CHROME=/path/to/chrome');
  const profile = mkdtempSync(join(tmpdir(), 'am-chrome-'));
  const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--window-size=${width},1000`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const cleanup = () => {
    try { proc.kill(); } catch { /* already gone */ }
    setTimeout(() => rmSync(profile, { recursive: true, force: true }), 300).unref();
  };
  try {
    const wsUrl = await new Promise((ok, ko) => {
      let buf = '';
      const timer = setTimeout(() => ko(new BakeUnavailable('Chrome did not start within 30 seconds')), 30000);
      proc.stderr.on('data', (d) => {
        buf += d;
        const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
        if (m) { clearTimeout(timer); ok(m[1]); }
      });
      proc.on('exit', () => { clearTimeout(timer); ko(new BakeUnavailable('Chrome exited right after it started')); });
      proc.on('error', (e) => { clearTimeout(timer); ko(new BakeUnavailable(`cannot start Chrome: ${e.message}`)); });
    });
    const port = new URL(wsUrl).port;
    let page;
    for (let i = 0; i < 50 && !page; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        page = list.find((t) => t.type === 'page');
      } catch { /* not ready yet */ }
      if (!page) await sleep(200);
    }
    if (!page) throw new BakeUnavailable('Chrome offers no page to drive');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = () => ko(new BakeUnavailable('cannot connect to Chrome DevTools')); });
    const cdp = new CDP(ws);
    return { cdp, close: () => { try { ws.close(); } catch { /* ignore */ } cleanup(); } };
  } catch (e) {
    cleanup();
    throw e;
  }
}

// Open the page and wait for the diagram runtime to finish. Returns the drawing state, figure errors and JS exceptions.
async function open(cdp, url, width, timeout) {
  await cdp.call('Page.enable');
  await cdp.call('Runtime.enable');
  await cdp.call('Emulation.setDeviceMetricsOverride', { width, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cdp.call('Page.navigate', { url });
  const t0 = Date.now();
  let state = '';
  while (Date.now() - t0 < timeout) {
    state = await cdp.js(`location.protocol === 'file:' && document.readyState === 'complete' ? (document.documentElement.dataset.amLive || 'static') : ''`) ?? '';
    if (state && state !== 'pending') break;
    await sleep(250);
  }
  const stage = await cdp.js('document.documentElement.dataset.amStage || ""');
  const errors = JSON.parse((await cdp.js('document.documentElement.dataset.amErrors || "[]"')) || '[]');
  const exceptions = cdp.events
    .filter((e) => e.method === 'Runtime.exceptionThrown')
    .map((e) => e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text);
  return { state: state === 'pending' || !state ? 'timeout' : state, stage, errors, exceptions, ms: Date.now() - t0 };
}

// Bake: once every figure is drawn, copy each drawn <figure> into the page file, drop the CDN runtime and the error banner, and
// write the file back. Only the figures come from the browser: the rest of the file stays as render wrote it, so nothing the page
// script adds at load time (toolbar state, layout styles, diagram buttons) is frozen into the file. With figure errors nothing is written.
export async function bakeFile(file, { width = 1440, timeout = 120000, env = process.env } = {}) {
  const path = resolve(file);
  const { cdp, close } = await launch(width, env);
  try {
    const r = await open(cdp, pathToFileURL(path).href, width, timeout);
    if (r.state !== 'ok') return { ...r, baked: false };
    const figures = JSON.parse(await cdp.js(
      `JSON.stringify([...document.querySelectorAll('figure.am-fig[data-am-done="1"]')].map((f) => [f.id, f.outerHTML]))`,
    ));
    writeFileSync(path, spliceFigures(readFileSync(path, 'utf8'), figures));
    return { ...r, baked: true, figures: figures.length };
  } finally {
    close();
  }
}

// The page file with each placeholder <figure id="fig-N"> replaced by its drawn copy, the diagram runtime removed, and the root tag
// marked as baked. Figures do not nest and their payload escapes <, so a figure ends at the first </figure> after it.
export function spliceFigures(html, figures, when = new Date().toISOString().slice(0, 16)) {
  let out = html;
  for (const [id, drawn] of figures) {
    out = out.replace(new RegExp(`<figure class="am-fig[^"]*" id="${id}"[\\s\\S]*?</figure>`), () => drawn);
  }
  return out
    .replace(/<div id="am-render-errors" hidden><\/div>\n/, '')
    .replace(/<script type="module" id="am-diagram-runtime">[\s\S]*?<\/script>\n/, '')
    .replace(/(<html\b[^>]*?) data-am-live="pending"/, `$1 data-am-baked="${when}"`);
}

// Screenshots: full.png plus one image per panel / figure / the overview. ?shot=1 makes the reading path show every depth.
// They go to the system temp directory by default (they are for review and do not belong in a repository).
export async function shotFile(file, { outDir, only, width = 1440, timeout = 120000, maxCrop = 2400, env = process.env } = {}) {
  const path = resolve(file);
  const dir = resolve(outDir ?? join(tmpdir(), 'am-shots', basename(path, '.html')));
  mkdirSync(dir, { recursive: true });
  const { cdp, close } = await launch(width, env);
  try {
    const r = await open(cdp, `${pathToFileURL(path).href}?shot=1`, width, timeout);
    const layout = await cdp.js(`(() => {
      const box = (el) => { const b = el.getBoundingClientRect(); return [Math.round(b.left + scrollX), Math.round(b.top + scrollY), Math.round(b.width), Math.round(b.height)]; };
      const items = {};
      for (const el of document.querySelectorAll('.am-overview, .am-panel[id], figure.am-fig[id], .am-frame, .am-doc-body')) {
        const id = el.id || (el.classList.contains('am-frame') ? 'sheet' : el.classList.contains('am-doc-body') ? 'body' : '');
        if (id && !(id in items)) items[id] = box(el);
      }
      // Horizontal overflow: a page wider than the viewport means an element breaks the layout (the most common phone problem).
      return { docH: document.documentElement.scrollHeight, docW: document.documentElement.scrollWidth, viewW: innerWidth, items };
    })()`);
    const shoot = async (name, [x, y, w, h]) => {
      const res = await cdp.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x, y, width: w, height: h, scale: 1 } });
      writeFileSync(join(dir, `${name}.png`), Buffer.from(res.data, 'base64'));
      return `${name}.png`;
    };
    const made = [await shoot('full', [0, 0, width, Math.min(layout.docH, 16000)])];
    for (const [id, [x, y, w, h]] of Object.entries(layout.items)) {
      if (only && !only.includes(id)) continue;
      if (w < 4 || h < 4) continue;
      made.push(await shoot(id, [Math.max(0, x - 10), Math.max(0, y - 10), w + 20, Math.min(h + 20, maxCrop)]));
    }
    return { ...r, dir, shots: made, layout };
  } finally {
    close();
  }
}

// Whether the page still holds the diagram runtime (not baked yet).
export function needsBake(file) {
  return readFileSync(file, 'utf8').includes('id="am-diagram-runtime"');
}
