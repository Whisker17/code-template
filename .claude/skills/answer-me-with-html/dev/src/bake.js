// 用本机 Chrome / Chromium（DevTools 协议）打开页面，等图形运行时渲染完成：
//   bakeFile：把 excalidraw / uml 的渲染结果写回 HTML，并删除 CDN 运行时 → 零依赖单文件。
//   shotFile：按面板 / 图 / 总览截图，供人或模型逐张检查版面。
// 只依赖 Node 内置的 fetch 与 WebSocket（Node 22+）；没有 Chrome 或 WebSocket 时抛 BakeUnavailable。
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
  if (typeof WebSocket === 'undefined') throw new BakeUnavailable(`烘焙需要 Node 22+（内置 WebSocket），当前 ${process.version}`);
  const chrome = findChrome(env);
  if (!chrome) throw new BakeUnavailable('没有找到 Chrome / Chromium / Edge；设置环境变量 AM_CHROME=/path/to/chrome');
  const profile = mkdtempSync(join(tmpdir(), 'am-chrome-'));
  const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, `--window-size=${width},1000`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const cleanup = () => {
    try { proc.kill(); } catch { /* 已退出 */ }
    setTimeout(() => rmSync(profile, { recursive: true, force: true }), 300).unref();
  };
  try {
    const wsUrl = await new Promise((ok, ko) => {
      let buf = '';
      const timer = setTimeout(() => ko(new BakeUnavailable('Chrome 30 秒内没有启动')), 30000);
      proc.stderr.on('data', (d) => {
        buf += d;
        const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
        if (m) { clearTimeout(timer); ok(m[1]); }
      });
      proc.on('exit', () => { clearTimeout(timer); ko(new BakeUnavailable('Chrome 启动后立即退出')); });
      proc.on('error', (e) => { clearTimeout(timer); ko(new BakeUnavailable(`无法启动 Chrome：${e.message}`)); });
    });
    const port = new URL(wsUrl).port;
    let page;
    for (let i = 0; i < 50 && !page; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        page = list.find((t) => t.type === 'page');
      } catch { /* 还没就绪 */ }
      if (!page) await sleep(200);
    }
    if (!page) throw new BakeUnavailable('Chrome 没有提供可用的页面');
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((ok, ko) => { ws.onopen = ok; ws.onerror = () => ko(new BakeUnavailable('无法连接 Chrome DevTools')); });
    const cdp = new CDP(ws);
    return { cdp, close: () => { try { ws.close(); } catch { /* ignore */ } cleanup(); } };
  } catch (e) {
    cleanup();
    throw e;
  }
}

// 打开页面并等待图形运行时结束。返回渲染状态、错误、JS 异常。
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

// 烘焙：渲染完成后删掉 CDN 运行时和错误条，写回静态 HTML。有错误时不写回。
export async function bakeFile(file, { width = 1440, timeout = 120000, env = process.env } = {}) {
  const path = resolve(file);
  const { cdp, close } = await launch(width, env);
  try {
    const r = await open(cdp, pathToFileURL(path).href, width, timeout);
    if (r.state !== 'ok') return { ...r, baked: false };
    const html = await cdp.js(`(() => {
      document.getElementById('am-diagram-runtime')?.remove();
      document.getElementById('am-render-errors')?.remove();
      const root = document.documentElement;
      for (const k of ['amLive', 'amStage', 'amErrors', 'path']) delete root.dataset[k];
      root.dataset.amBaked = new Date().toISOString().slice(0, 16);
      document.querySelectorAll('[aria-pressed]').forEach((b) => b.removeAttribute('aria-pressed'));
      return '<!doctype html>\\n' + root.outerHTML + '\\n';
    })()`);
    writeFileSync(path, html);
    return { ...r, baked: true, figures: (html.match(/data-am-done="1"/g) || []).length };
  } finally {
    close();
  }
}

// 截图：full.png + 每个面板 / 图 / 总览各一张。?shot=1 让阅读路径显示全部深度。
// 默认写到系统临时目录（截图只用于检查，不该进仓库）。
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
      // 横向溢出：页面比视口宽说明有元素撑破了布局（移动端最常见的问题）。
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

// 页面是否还含未烘焙的图形运行时。
export function needsBake(file) {
  return readFileSync(file, 'utf8').includes('id="am-diagram-runtime"');
}
