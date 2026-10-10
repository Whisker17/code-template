// Research fork — the diagram runtime: inlined only when a page has excalidraw / uml figures that are not baked yet.
// It loads Mermaid and Excalidraw from a CDN, draws the figures, then sets data-am-live="ok|error" on <html> for am bake / am shot to wait on.
// am bake runs this script in the local Chrome, copies the drawn figures into the page file and drops this script: a single file with no dependencies.
const CDN = {
  mermaid: 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs',
  excalidraw: 'https://esm.sh/@excalidraw/excalidraw@0.18.0?bundle-deps',
};
const root = document.documentElement;
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const errors = [];
const fail = (fig, e) => {
  let msg = String(e && e.message ? e.message : e).split('\n').slice(0, 4).join(' ');
  // Mermaid reports the line inside the figure: turn it into the draft line (fence line + inner line), and cut the long Expecting list.
  const inner = Number(msg.match(/on line (\d+)/)?.[1] ?? 0);
  msg = msg.replace(/(Expecting .{0,90}).*$/, '$1…');
  errors.push({ fig: fig?.id || '', line: Number(fig?.dataset.line || 0) + inner, kind: fig?.dataset.amLive || '', message: msg });
};
const stage = (s) => { root.dataset.amStage = s; };
const canvasOf = (fig) => fig.querySelector('.am-fig-canvas');
const done = (fig) => { fig.dataset.amDone = '1'; };

// ── UML (Mermaid) ──────────────────────────────
async function renderUml(figs) {
  stage('uml:import');
  let mermaid;
  try {
    ({ default: mermaid } = await import(CDN.mermaid));
  } catch (e) {
    figs.forEach((f) => fail(f, `cannot load Mermaid (${e.message}): check the network and try again`));
    return;
  }
  const font = getComputedStyle(document.body).fontFamily;
  mermaid.initialize({
    startOnLoad: false, securityLevel: 'strict', theme: 'base', fontFamily: font,
    themeVariables: {
      fontFamily: font, fontSize: '14px', primaryColor: '#ffffff', primaryBorderColor: '#16181d', primaryTextColor: '#16181d',
      secondaryColor: '#e4ecf8', tertiaryColor: '#f3f5f8', lineColor: '#4b5260', noteBkgColor: '#fdf3e2',
      noteBorderColor: '#a8620a', actorBkg: '#ffffff', actorBorder: '#16181d', signalColor: '#16181d', labelBoxBkgColor: '#f3f5f8',
    },
    sequence: { mirrorActors: false, actorMargin: 60, messageMargin: 36 },
    flowchart: { curve: 'basis', padding: 12 },
  });
  let i = 0;
  for (const fig of figs) {
    stage(`uml:${fig.id}`);
    try {
      const src = JSON.parse(fig.querySelector('script.am-uml-src').textContent);
      // Each figure renders on its own with a unique id: mermaid.run reuses ids in a batch, which breaks the SVGs.
      const { svg } = await mermaid.render(`am-mmd-${Date.now().toString(36)}-${i++}`, src);
      canvasOf(fig).innerHTML = svg;
      done(fig);
    } catch (e) {
      fail(fig, e);
    }
  }
}

// ── Excalidraw ─────────────────────────────────
const EX = {
  bg: { blue: '#a5d8ff', green: '#b2f2bb', yellow: '#ffec99', red: '#ffc9c9', violet: '#d0bfff', gray: '#e9ecef', orange: '#ffd8a8', teal: '#96f2d7', white: '#ffffff', none: 'transparent' },
  stroke: { ink: '#1e1e1e', blue: '#1971c2', red: '#e03131', green: '#2f9e44', gray: '#868e96', violet: '#6741d9', orange: '#e8590c' },
};
// Snap an edge end to the shape outline (rectangle / ellipse / diamond).
function clip(n, tx, ty) {
  const cx = n.x + n.w / 2;
  const cy = n.y + n.h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (!dx && !dy) return [cx, cy];
  const hw = n.w / 2;
  const hh = n.h / 2;
  let t;
  if (n.shape === 'ellipse') t = 1 / Math.sqrt((dx / hw) ** 2 + (dy / hh) ** 2);
  else if (n.shape === 'diamond') t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
  else t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
  const gap = 6 / Math.hypot(dx, dy);
  return [cx + dx * (t + gap), cy + dy * (t + gap)];
}
function toSkeleton(spec) {
  const G = { w: 340, h: 150, ...(spec.grid || {}) };
  const D = { w: 180, h: 70, fontSize: 18, roughness: 1, strokeWidth: 2, fontFamily: 5, ...(spec.defaults || {}) };
  const nodes = new Map();
  const out = [];
  const common = (o) => ({
    roughness: o.roughness ?? D.roughness, strokeWidth: o.strokeWidth ?? D.strokeWidth,
    strokeColor: EX.stroke[o.strokeColor] || o.strokeColor || EX.stroke.ink, strokeStyle: o.stroke || 'solid',
  });
  for (const n of spec.nodes || []) {
    const w = n.w ?? D.w;
    const h = n.h ?? D.h;
    nodes.set(n.id, { ...n, w, h, shape: n.shape || 'rectangle', x: n.x ?? (n.col ?? 0) * G.w + (n.dx || 0), y: n.y ?? (n.row ?? 0) * G.h + (n.dy || 0) });
  }
  for (const b of spec.boxes || []) {
    let { x, y, w, h } = b;
    if (b.around) {
      const ns = b.around.map((id) => nodes.get(id)).filter(Boolean);
      const p = b.pad ?? 30;
      x = Math.min(...ns.map((n) => n.x)) - p;
      y = Math.min(...ns.map((n) => n.y)) - p - (b.label ? 22 : 0);
      w = Math.max(...ns.map((n) => n.x + n.w)) + p - x;
      h = Math.max(...ns.map((n) => n.y + n.h)) + p - y;
    }
    out.push({ type: 'rectangle', x, y, width: w, height: h, ...common({ stroke: 'dashed', strokeColor: 'gray', ...b }), backgroundColor: EX.bg[b.color] || b.color || 'transparent', fillStyle: b.fill || 'solid', opacity: b.opacity ?? 60, roundness: { type: 3 } });
    if (b.label) out.push({ type: 'text', x: x + 10, y: y + 6, text: b.label, fontSize: b.fontSize ?? 14, fontFamily: D.fontFamily, strokeColor: EX.stroke[b.labelColor] || b.labelColor || EX.stroke.gray });
  }
  for (const n of nodes.values()) {
    const el = { type: n.shape, id: n.id, x: n.x, y: n.y, width: n.w, height: n.h, ...common(n), backgroundColor: EX.bg[n.color ?? 'white'] || n.color, fillStyle: n.fill || 'solid' };
    if (n.shape === 'rectangle' && n.rounded !== false) el.roundness = { type: 3 };
    if (n.label) el.label = { text: n.label, fontSize: n.fontSize ?? D.fontSize, fontFamily: D.fontFamily, strokeColor: EX.stroke[n.textColor] || n.textColor || EX.stroke.ink };
    out.push(el);
  }
  for (const e of spec.edges || []) {
    const a = nodes.get(e.from);
    const b = nodes.get(e.to);
    const via = e.via || [];
    const first = via[0] || [b.x + b.w / 2, b.y + b.h / 2];
    const last = via[via.length - 1] || [a.x + a.w / 2, a.y + a.h / 2];
    const [sx, sy] = clip(a, ...first);
    const [ex, ey] = clip(b, ...last);
    const pts = [[sx, sy], ...via, [ex, ey]].map(([px, py]) => [px - sx, py - sy]);
    const el = {
      type: 'arrow', x: sx, y: sy, points: pts, width: Math.abs(ex - sx) || 1, height: Math.abs(ey - sy) || 1,
      ...common({ ...e, stroke: e.dashed ? 'dashed' : e.dotted ? 'dotted' : 'solid' }),
      start: { id: a.id }, end: { id: b.id },
      startArrowhead: e.arrow === 'both' ? (e.head || 'arrow') : null, endArrowhead: e.arrow === 'none' ? null : (e.head || 'arrow'),
    };
    if (e.label) el.label = { text: e.label, fontSize: e.fontSize ?? 15, fontFamily: D.fontFamily };
    out.push(el);
  }
  for (const t of spec.texts || []) out.push({ type: 'text', x: t.x, y: t.y, text: t.text, fontSize: t.fontSize ?? 16, fontFamily: D.fontFamily, strokeColor: EX.stroke[t.color] || t.color || EX.stroke.ink, textAlign: t.align || 'left' });
  for (const r of spec.raw || []) out.push(r);
  return out;
}
// Excalidraw measures text on a canvas; before the hand-drawn font loads it measures too narrow, so labels are cut and edge masks are too small.
// Export once first, register the fonts embedded in that SVG with the document, then convert for real.
async function warmFonts(X, specs) {
  const warm = [];
  for (const sp of specs) { try { warm.push(...X.convertToExcalidrawElements(toSkeleton(sp))); } catch { /* reported by the real render */ } }
  if (!warm.length) return;
  const svg = await X.exportToSvg({ elements: warm, appState: {}, files: {} });
  const css = [...svg.querySelectorAll('style')].map((s) => s.textContent).join('\n');
  for (const m of css.matchAll(/@font-face\s*{([^}]*)}/g)) {
    const fam = /font-family:\s*["']?([^"';]+)["']?/.exec(m[1])?.[1];
    const src = /src:\s*url\(([^)]+)\)/.exec(m[1])?.[1]?.replace(/^["']|["']$/g, '');
    if (!fam || !src) continue;
    try { const ff = new FontFace(fam, `url(${src})`); document.fonts.add(ff); await ff.load(); } catch { /* a font failure only affects text measuring */ }
  }
}
async function renderExcalidraw(figs) {
  stage('excalidraw:import');
  let X;
  try {
    X = await import(CDN.excalidraw);
  } catch (e) {
    figs.forEach((f) => fail(f, `cannot load Excalidraw (${e.message}): check the network and try again`));
    return;
  }
  const specs = figs.map((f) => JSON.parse(f.querySelector('script.am-excal-spec').textContent));
  stage('excalidraw:fonts');
  try { await warmFonts(X, specs); } catch { /* draw anyway */ }
  for (const [i, fig] of figs.entries()) {
    stage(`excalidraw:${fig.id}`);
    try {
      const spec = specs[i];
      const elements = X.convertToExcalidrawElements(toSkeleton(spec), { regenerateIds: false });
      const svg = await X.exportToSvg({ elements, appState: { exportBackground: false, viewBackgroundColor: '#ffffff', exportPadding: 16 }, files: {} });
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      svg.style.width = `${Math.min(svg.viewBox.baseVal.width * (spec.scale || 1), 1100)}px`;
      canvasOf(fig).replaceChildren(svg);
      const file = { type: 'excalidraw', version: 2, source: 'answer-me-with-html', elements, appState: { viewBackgroundColor: '#ffffff', gridSize: 20 }, files: {} };
      const store = Object.assign(document.createElement('script'), { type: 'application/json', className: 'am-excal-file' });
      store.textContent = JSON.stringify(file).replace(/</g, '\\u003c');
      const btn = Object.assign(document.createElement('button'), { type: 'button', className: 'am-btn am-fig-dl', textContent: '↓ .excalidraw' });
      btn.dataset.am = 'excal-dl';
      btn.title = 'excalidraw.com → Open';
      btn.addEventListener('click', () => {
        const url = URL.createObjectURL(new Blob([store.textContent], { type: 'application/json' }));
        Object.assign(document.createElement('a'), { href: url, download: `${fig.dataset.name || fig.id}.excalidraw` }).click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      });
      canvasOf(fig).after(store, btn);
      done(fig);
    } catch (e) {
      fail(fig, e);
    }
  }
}

// ── boot ───────────────────────────────────────
const pending = $$('figure[data-am-live]:not([data-am-done])');
const uml = pending.filter((f) => f.dataset.amLive === 'uml');
const excal = pending.filter((f) => f.dataset.amLive === 'excalidraw');
stage('render');
await Promise.all([uml.length && renderUml(uml), excal.length && renderExcalidraw(excal)]);
const banner = document.getElementById('am-render-errors');
if (banner) {
  banner.hidden = !errors.length;
  banner.textContent = errors.map((e) => `${e.fig} (L${e.line} ${e.kind}): ${e.message}`).join('\n');
}
root.dataset.amErrors = JSON.stringify(errors);
stage('done');
root.dataset.amLive = errors.length ? 'error' : 'ok';
