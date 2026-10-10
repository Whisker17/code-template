// Research fork — Excalidraw sketch: the model writes only a JSON spec of nodes and edges; the browser draws a hand-drawn SVG with
// @excalidraw/excalidraw, and am bake bakes the result into the page with the local Chrome (fonts embedded, works offline).
// This file only checks the spec and writes the placeholder.
import { ComponentError } from './error.js';
import { figureArgs, figureHtml, jsonScript } from './figure.js';
import { isCJK } from '../svg/text.js';

export const EX_GRID = { w: 340, h: 150 };
export const EX_NODE = { w: 180, h: 70 };
const SHAPES = new Set(['rectangle', 'ellipse', 'diamond']);

const lineOfIndex = (text, idx) => (idx < 0 ? 1 : text.slice(0, idx).split('\n').length);
// The line of "id": "x", so an error points at the node.
const lineOfId = (text, id) => lineOfIndex(text, text.search(new RegExp(`"id"\\s*:\\s*"${String(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`)));
const lineOfEdge = (text, e) => lineOfIndex(text, text.search(new RegExp(`"from"\\s*:\\s*"${String(e.from).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^}]*"to"\\s*:\\s*"${String(e.to).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`)));

export function parseSpec(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    const pos = Number(e.message.match(/position (\d+)/)?.[1] ?? -1);
    const line = Number(e.message.match(/line (\d+)/)?.[1] ?? 0) || lineOfIndex(text, pos);
    throw new ComponentError(`the excalidraw spec is not valid JSON: ${e.message.replace(/\s*\(line \d+ column \d+\)/, '')}`, line);
  }
}

// Where a node sits: x/y when given, otherwise the grid col/row (the same rule as the browser runtime).
export function placeNodes(spec) {
  const G = { ...EX_GRID, ...(spec.grid || {}) };
  const D = { ...EX_NODE, ...(spec.defaults || {}) };
  return (spec.nodes || []).map((n) => ({
    id: n.id,
    w: n.w ?? D.w,
    h: n.h ?? D.h,
    x: n.x ?? (n.col ?? 0) * G.w + (n.dx || 0),
    y: n.y ?? (n.row ?? 0) * G.h + (n.dy || 0),
  }));
}

export function labelWidth(label) {
  const s = String(label);
  const cjk = [...s].filter(isCJK).length;
  return cjk * 16 + ([...s].length - cjk) * 9 + 50;
}

export function validateSpec(spec, text) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new ComponentError('the excalidraw spec must be a JSON object', 1);
  const nodes = spec.nodes ?? [];
  if (!Array.isArray(nodes)) throw new ComponentError('nodes must be an array', lineOfIndex(text, text.indexOf('"nodes"')));
  if (!nodes.length && !(spec.raw || []).length) throw new ComponentError('excalidraw needs at least one node (nodes)', 1);
  const ids = new Set();
  for (const n of nodes) {
    if (!n || typeof n.id !== 'string' || !n.id) throw new ComponentError(`a node has no id: ${JSON.stringify(n)}`, lineOfIndex(text, text.indexOf(JSON.stringify(n?.label ?? ''))));
    if (ids.has(n.id)) throw new ComponentError(`duplicate node id "${n.id}"`, lineOfId(text, n.id));
    ids.add(n.id);
    if (n.x === undefined && n.col === undefined) throw new ComponentError(`node "${n.id}" needs col/row (grid) or x/y (pixels)`, lineOfId(text, n.id));
    if (n.shape && !SHAPES.has(n.shape)) throw new ComponentError(`node "${n.id}" has an invalid shape "${n.shape}". Choose one of: ${[...SHAPES].join(' | ')}`, lineOfId(text, n.id));
  }
  for (const e of spec.edges ?? []) {
    for (const end of ['from', 'to']) {
      if (!ids.has(e[end])) throw new ComponentError(`edge ${e.from} -> ${e.to} names a node that does not exist: "${e[end]}"`, lineOfEdge(text, e));
    }
  }
  for (const b of spec.boxes ?? []) {
    for (const id of b.around ?? []) {
      if (!ids.has(id)) throw new ComponentError(`box "${b.label ?? ''}" names a node in around that does not exist: "${id}"`, lineOfIndex(text, text.indexOf(`"${b.label ?? 'around'}"`)));
    }
  }
  const placed = placeNodes(spec);
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i];
      const b = placed[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
        throw new ComponentError(`nodes "${a.id}" and "${b.id}" overlap: change col/row, or make grid.w / grid.h larger`, lineOfId(text, b.id));
      }
    }
  }
  const pos = new Map(placed.map((p) => [p.id, p]));
  for (const e of spec.edges ?? []) {
    if (!e.label || e.via) continue;
    const a = pos.get(e.from);
    const b = pos.get(e.to);
    const gx = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w), 0);
    const gy = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h), 0);
    const gap = Math.hypot(gx, gy);
    // A horizontal edge must fit the width of its label; a vertical edge only the height of one line of text.
    const need = gx >= gy ? labelWidth(e.label) : 50;
    if (gap < need) {
      throw new ComponentError(`the label "${e.label}" of edge ${e.from} -> ${e.to} needs about ${need}px of space and has ${Math.round(gap)}px: make grid.w larger or the label shorter`, lineOfEdge(text, e));
    }
  }
  return spec;
}

export default {
  name: 'excalidraw',
  summary: 'Excalidraw hand-drawn sketch (intuition / concept map / prerequisite map); baked by am bake',
  syntax: `\`\`\`excalidraw [q="the question this figure answers"] [read="how to read it"] [takeaway="the point"] [name=file-name] [kind=label]
{
  "grid": {"w": 340, "h": 150},                 ← optional: the grid cell (default 340×150)
  "defaults": {"w": 180, "h": 70, "fontSize": 18},
  "nodes": [
    {"id": "a", "label": "Client", "col": 0, "row": 0},
    {"id": "b", "label": "Server\\n(8 workers)", "col": 1, "row": 0, "color": "blue"},
    {"id": "db", "label": "KV store", "col": 1, "row": 1, "shape": "ellipse", "color": "violet"}
  ],
  "edges": [
    {"from": "a", "to": "b", "label": "HTTP"},
    {"from": "b", "to": "db", "dashed": true, "arrow": "both"}
  ],
  "boxes": [{"label": "GPU host", "around": ["b", "db"]}],
  "texts": [{"x": 0, "y": 200, "text": "note", "color": "gray"}]
}
\`\`\`
- Nodes: place with col/row on the grid or x/y in pixels; shape rectangle | ellipse | diamond;
  color blue green yellow red violet gray orange teal white none or #hex; fill solid | hachure | cross-hatch;
  stroke solid | dashed | dotted; strokeWidth; fontSize; dx/dy to nudge.
- Edges: label, dashed, dotted, arrow end | both | none, head arrow | triangle | dot | bar | diamond,
  strokeColor, via [[x,y]] bend points. The ends snap to the shape outlines.
- Colour meaning (the same on the whole page): gray dashed = known / external, blue = the thing explained, green = the subject / the
  conclusion, red = waste / a problem, yellow = an assumption / a decision, violet = storage / state.
- A labelled edge needs room (about label characters × 16px + 50 for CJK, × 9px + 50 for Latin); the check fails otherwise. 12 nodes at most.
- After drawing, a "↓ .excalidraw" button under the figure saves a file to edit further on excalidraw.com.`,
  example: '```excalidraw q="How does a request reach the database?" takeaway="The gateway only forwards"\n{"nodes": [\n  {"id": "u", "label": "User", "col": 0, "row": 0},\n  {"id": "g", "label": "Gateway", "col": 1, "row": 0, "color": "blue"},\n  {"id": "d", "label": "Database", "col": 2, "row": 0, "shape": "ellipse", "color": "violet"}\n],\n "edges": [{"from": "u", "to": "g", "label": "HTTPS"}, {"from": "g", "to": "d"}]}\n```',
  render(text, ctx) {
    const spec = validateSpec(parseSpec(text), text);
    const meta = figureArgs(ctx.args);
    return figureHtml({
      cls: 'excal',
      live: 'excalidraw',
      kindLabel: `Excalidraw${meta.kind ? ` · ${meta.kind}` : ''}`,
      meta,
      ctx,
      payload: jsonScript('am-excal-spec', spec),
    });
  },
};
