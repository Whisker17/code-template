// Component registry: fenced-block language name → component. Each component exports { name, summary, syntax, example, render(text, ctx) }, and optionally aliases.
import callout from './callout.js';
import kv from './kv.js';
import timeline from './timeline.js';
import annot from './annot.js';
import tree from './tree.js';
import limits from './limits.js';
import sequence from './sequence.js';
import flow from './flow.js';
import er from './er.js';
import ask from './ask.js';
// Research fork: browser-drawn diagrams and the research-page components.
import excalidraw from './excalidraw.js';
import uml from './uml.js';
import { prereq, finding, glossary } from './research.js';

export { ComponentError } from './error.js';

const ALL = [callout, kv, timeline, annot, tree, limits, excalidraw, uml, sequence, flow, er, ask, prereq, finding, glossary];

export const COMPONENTS = new Map(ALL.map((c) => [c.name, c]));
// Another fence language for a component (```mermaid is uml). parse.js maps an alias to the component name, so the rest of the code sees one name.
export const ALIASES = new Map(ALL.flatMap((c) => (c.aliases ?? []).map((a) => [a, c.name])));
export const resolveComponent = (lang) => COMPONENTS.get(ALIASES.get(lang) ?? lang);
export const RAW_LANGS = new Set(['html', 'svg']);

// Components the browser draws (am bake inlines the result as static SVG).
export const LIVE = new Set(['excalidraw', 'uml']);
