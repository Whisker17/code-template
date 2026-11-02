// Usage: node render.mjs path/to/pXX-name.mjs  ->  pXX-name.svg + pXX-name.zh.svg
// Needs Node >= 20, `npm i puppeteer-core` in the deck dir, CHROME_PATH (local Chrome), network for esm.sh.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const src = process.argv[2];
if (!src || !src.endsWith('.mjs')) { console.error('usage: node render.mjs <pXX-name.mjs>'); process.exit(2); }
if (!process.env.CHROME_PATH) { console.error('set CHROME_PATH to the local Chrome executable'); process.exit(2); }
const file = resolve(src), fileUrl = pathToFileURL(file).href, out = file.slice(0, -4);

const VER = '0.18.0';
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true });
try {
  const page = await browser.newPage();
  await page.setContent(`<script>window.EXCALIDRAW_ASSET_PATH="https://esm.sh/@excalidraw/excalidraw@${VER}/dist/prod/";</script>
<script type="module">
  import { convertToExcalidrawElements, exportToSvg } from "https://esm.sh/@excalidraw/excalidraw@${VER}?bundle";
  window.__x = { convertToExcalidrawElements, exportToSvg }; window.__ready = true;
</script>`);
  await page.waitForFunction('window.__ready === true', { timeout: 120000 });
  for (const lang of ['en', 'zh']) {
    globalThis.DECK_LANG = lang;
    const { skeleton, meta = {} } = await import(fileUrl + `?lang=${lang}&t=${Date.now()}`);
    const svg = await page.evaluate(async (skeleton, meta) => {
      const { convertToExcalidrawElements, exportToSvg } = window.__x;
      const elements = convertToExcalidrawElements(skeleton, { regenerateIds: false });
      return (await exportToSvg({ elements, files: {}, appState: { exportBackground: false, viewBackgroundColor: '#040F0B', exportPadding: meta.padding ?? 16 } })).outerHTML;
    }, skeleton, meta);
    const target = out + (lang === 'zh' ? '.zh' : '') + '.svg';
    writeFileSync(target, svg);
    console.log('wrote ' + target);
  }
} finally {
  await browser.close();
}
