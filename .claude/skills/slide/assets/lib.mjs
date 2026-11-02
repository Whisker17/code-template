// Shared Excalidraw skeleton helpers (Mantle dark deck)
export const C = {
  text: '#FFFFFF', muted: '#B8C6BE', accent: '#00FF93', struct: '#06B680',
  soft: '#BAFFF5', line: '#3A4A42', fill: '#0D100F', tag: '#7F8F86', bar: '#2C3B34',
};
export const FONT = 2;   // Helvetica (CJK falls back to the system font)
export const tr = (en, zh) => (globalThis.DECK_LANG === 'zh' ? zh : en);
const base = { roughness: 1, fontFamily: FONT, strokeWidth: 2 };
let n = 0; const uid = p => `${p}-${++n}`;
export function rect(x, y, w, h, o = {}) {
  return { ...base, type: o.shape || 'rectangle', id: o.id || uid('r'), x, y, width: w, height: h,
    strokeColor: o.stroke || C.muted, backgroundColor: o.bg ?? C.fill, fillStyle: 'solid',
    strokeWidth: o.sw || 2, strokeStyle: o.dashed ? 'dashed' : 'solid', roundness: o.square ? null : { type: 3 },
    ...(o.label ? { label: { text: o.label, fontSize: o.size || 24, fontFamily: FONT, strokeColor: o.color || C.text } } : {}) };
}
export function text(x, y, t, o = {}) {
  return { ...base, type: 'text', id: o.id || uid('t'), x, y, text: t, fontSize: o.size || 24,
    strokeColor: o.color || C.muted, lineHeight: o.lh || 1.3, textAlign: o.align || 'left' };
}
// titled box: title (1+ lines) + optional sub, padded inside
export function box(x, y, w, h, title, sub, o = {}) {
  const ts = o.ts || 28, lines = title.split('\n').length, pad = o.pad ?? 22;
  const els = [rect(x, y, w, h, o), text(x + pad, y + 16, title, { size: ts, color: o.tc || C.text, lh: 1.2 })];
  if (sub) els.push(text(x + pad, y + 16 + ts * 1.2 * lines + (o.gap ?? 10), sub, { size: o.ss || 22, color: o.sc || C.muted }));
  return els;
}
export function arrow(pts, o = {}) {
  const [x0, y0] = pts[0];
  return { ...base, type: o.line ? 'line' : 'arrow', id: o.id || uid('a'), x: x0, y: y0,
    points: pts.map(([x, y]) => [x - x0, y - y0]), strokeColor: o.stroke || C.struct,
    strokeWidth: o.sw || 2.5, strokeStyle: o.dashed ? 'dashed' : 'solid',
    ...(o.line ? {} : { startArrowhead: o.both ? 'arrow' : null, endArrowhead: o.noHead ? null : 'arrow' }) };
}
export const line = (pts, o = {}) => arrow(pts, { line: true, stroke: C.line, sw: 2, ...o });
export const dot = (cx, cy, r = 7, color = C.struct) => rect(cx - r, cy - r, 2 * r, 2 * r, { shape: 'ellipse', stroke: color, bg: color, sw: 1 });
