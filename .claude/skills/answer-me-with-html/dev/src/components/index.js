// 组件注册表：围栏块语言名 → 组件。每个组件导出 { name, summary, syntax, example, render(text, ctx) }，可选 aliases。
import callout from './callout.js';
import kv from './kv.js';
import timeline from './timeline.js';
import annot from './annot.js';
import tree from './tree.js';
import limits from './limits.js';
import sequence from './sequence.js';
import flow from './flow.js';
import excalidraw from './excalidraw.js';
import uml from './uml.js';
import { prereq, finding, glossary } from './research.js';

export { ComponentError } from './error.js';

const ALL = [callout, kv, timeline, annot, tree, limits, excalidraw, uml, sequence, flow, prereq, finding, glossary];

// 需要浏览器渲染（am bake 烘焙）的组件。
export const LIVE = new Set(['excalidraw', 'uml']);

export const COMPONENTS = new Map(ALL.map((c) => [c.name, c]));
export const ALIASES = new Map(ALL.flatMap((c) => (c.aliases ?? []).map((a) => [a, c.name])));
export const resolveComponent = (lang) => COMPONENTS.get(ALIASES.get(lang) ?? lang);
export const RAW_LANGS = new Set(['html', 'svg']);
