// Excalidraw 草图（sketch）：模型只写节点 / 边的 JSON spec，浏览器端用 @excalidraw/excalidraw 生成手绘风 SVG，
// am bake 用本机 Chrome 把结果烘焙进页面（字体内嵌，离线可看）。这里只做静态校验和占位输出。
import { ComponentError } from './error.js';
import { figureArgs, figureHtml, jsonScript } from './figure.js';
import { isCJK } from '../svg/text.js';

export const EX_GRID = { w: 340, h: 150 };
export const EX_NODE = { w: 180, h: 70 };
const SHAPES = new Set(['rectangle', 'ellipse', 'diamond']);

const lineOfIndex = (text, idx) => (idx < 0 ? 1 : text.slice(0, idx).split('\n').length);
// 定位 "id": "x" 所在行，让错误提示指向具体节点。
const lineOfId = (text, id) => lineOfIndex(text, text.search(new RegExp(`"id"\\s*:\\s*"${String(id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`)));
const lineOfEdge = (text, e) => lineOfIndex(text, text.search(new RegExp(`"from"\\s*:\\s*"${String(e.from).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^}]*"to"\\s*:\\s*"${String(e.to).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`)));

export function parseSpec(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    const pos = Number(e.message.match(/position (\d+)/)?.[1] ?? -1);
    const line = Number(e.message.match(/line (\d+)/)?.[1] ?? 0) || lineOfIndex(text, pos);
    throw new ComponentError(`excalidraw spec 不是合法 JSON：${e.message.replace(/\s*\(line \d+ column \d+\)/, '')}`, line);
  }
}

// 节点的实际位置：x/y 优先，否则按网格 col/row（与浏览器端 runtime 的算法一致）。
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
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new ComponentError('excalidraw spec 必须是一个 JSON 对象', 1);
  const nodes = spec.nodes ?? [];
  if (!Array.isArray(nodes)) throw new ComponentError('nodes 必须是数组', lineOfIndex(text, text.indexOf('"nodes"')));
  if (!nodes.length && !(spec.raw || []).length) throw new ComponentError('excalidraw 至少需要一个节点（nodes）', 1);
  const ids = new Set();
  for (const n of nodes) {
    if (!n || typeof n.id !== 'string' || !n.id) throw new ComponentError(`节点缺少 id：${JSON.stringify(n)}`, lineOfIndex(text, text.indexOf(JSON.stringify(n?.label ?? ''))));
    if (ids.has(n.id)) throw new ComponentError(`节点 id 重复："${n.id}"`, lineOfId(text, n.id));
    ids.add(n.id);
    if (n.x === undefined && n.col === undefined) throw new ComponentError(`节点 "${n.id}" 需要 col/row（网格）或 x/y（像素）`, lineOfId(text, n.id));
    if (n.shape && !SHAPES.has(n.shape)) throw new ComponentError(`节点 "${n.id}" 的 shape "${n.shape}" 无效，可选：${[...SHAPES].join(' | ')}`, lineOfId(text, n.id));
  }
  for (const e of spec.edges ?? []) {
    for (const end of ['from', 'to']) {
      if (!ids.has(e[end])) throw new ComponentError(`边 ${e.from} -> ${e.to} 引用了不存在的节点 "${e[end]}"`, lineOfEdge(text, e));
    }
  }
  for (const b of spec.boxes ?? []) {
    for (const id of b.around ?? []) {
      if (!ids.has(id)) throw new ComponentError(`分组框 "${b.label ?? ''}" 的 around 引用了不存在的节点 "${id}"`, lineOfIndex(text, text.indexOf(`"${b.label ?? 'around'}"`)));
    }
  }
  const placed = placeNodes(spec);
  for (let i = 0; i < placed.length; i++) {
    for (let j = i + 1; j < placed.length; j++) {
      const a = placed[i];
      const b = placed[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
        throw new ComponentError(`节点 "${a.id}" 与 "${b.id}" 重叠：调整 col/row，或加大 grid.w / grid.h`, lineOfId(text, b.id));
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
    // 水平方向的边要容纳标签宽度；竖直方向只需容纳一行文字的高度。
    const need = gx >= gy ? labelWidth(e.label) : 50;
    if (gap < need) {
      throw new ComponentError(`边 ${e.from} -> ${e.to} 的标签 "${e.label}" 需要约 ${need}px 间距，实际 ${Math.round(gap)}px：加大 grid.w 或缩短标签`, lineOfEdge(text, e));
    }
  }
  return spec;
}

export default {
  name: 'excalidraw',
  summary: 'Excalidraw 手绘草图（直觉 / 概念图 / 前置知识地图），需 am bake 烘焙',
  syntax: `\`\`\`excalidraw [q="这张图回答的问题"] [read="读法"] [takeaway="要点"] [name=文件名] [kind=标签]
{
  "grid": {"w": 340, "h": 150},                 ← 可选：网格单元（默认 340×150）
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
  "texts": [{"x": 0, "y": 200, "text": "注释", "color": "gray"}]
}
\`\`\`
- 节点：col/row 网格定位或 x/y 像素；shape rectangle | ellipse | diamond；
  color blue green yellow red violet gray orange teal white none 或 #hex；fill solid | hachure | cross-hatch；
  stroke solid | dashed | dotted；strokeWidth；fontSize；dx/dy 微调。
- 边：label、dashed、dotted、arrow end | both | none、head arrow | triangle | dot | bar | diamond、
  strokeColor、via [[x,y]] 折点。端点自动贴到形状边缘。
- 颜色语义（全页统一）：灰虚线=已知/外部，蓝=讲解对象，绿=主题/结论，红=浪费/问题，黄=假设/判断，紫=存储/状态。
- 带标签的边需要足够间距（约 标签字数×16px+50），校验不过会报错。≤12 个节点。
- 渲染后图下方有 "↓ .excalidraw" 按钮，可在 excalidraw.com 继续编辑。`,
  example: '```excalidraw q="请求怎么到达数据库？" takeaway="网关只做转发"\n{"nodes": [\n  {"id": "u", "label": "用户", "col": 0, "row": 0},\n  {"id": "g", "label": "网关", "col": 1, "row": 0, "color": "blue"},\n  {"id": "d", "label": "数据库", "col": 2, "row": 0, "shape": "ellipse", "color": "violet"}\n],\n "edges": [{"from": "u", "to": "g", "label": "HTTPS"}, {"from": "g", "to": "d"}]}\n```',
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
