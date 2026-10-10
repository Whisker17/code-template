// Research fork — UML blueprint: Mermaid source (sequence / class / state / activity / component / ER).
// The browser draws it with Mermaid and am bake bakes it into static SVG. This file only checks the source and writes the placeholder.
import { ComponentError } from './error.js';
import { figureArgs, figureHtml, jsonScript } from './figure.js';

export const UML_KINDS = {
  sequenceDiagram: 'sequence', classDiagram: 'class', 'classDiagram-v2': 'class', stateDiagram: 'state',
  'stateDiagram-v2': 'state', flowchart: 'activity', graph: 'activity', erDiagram: 'ER',
  requirementDiagram: 'requirement', 'block-beta': 'block', 'architecture-beta': 'architecture',
  timeline: 'timeline', gantt: 'gantt', mindmap: 'mindmap', journey: 'journey', gitGraph: 'git',
  quadrantChart: 'quadrant', 'xychart-beta': 'xy', 'packet-beta': 'packet', 'sankey-beta': 'sankey', pie: 'pie', kanban: 'kanban',
};
const DISCOURAGED = { C4Context: 'C4', C4Container: 'C4', C4Component: 'C4', C4Dynamic: 'C4', C4Deployment: 'C4' };

// The first line with content: skips a --- config block --- and %% comments.
export function umlType(text) {
  const lines = String(text).split('\n');
  let i = 0;
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((l, k) => k > 0 && l.trim() === '---');
    if (end === -1) throw new ComponentError('the uml --- config block is not closed', 1);
    i = end + 1;
  }
  for (; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t || t.startsWith('%%')) continue;
    return { type: t.split(/\s+/)[0], line: i + 1 };
  }
  throw new ComponentError('the uml block is empty', 1);
}

export default {
  name: 'uml',
  aliases: ['mermaid'],
  summary: 'UML blueprint (Mermaid: sequence / class / state / activity / component / ER); baked by am bake',
  syntax: `\`\`\`uml [q="the question this figure answers"] [read="how to read it"] [takeaway="the point"]
sequenceDiagram            ← the first line is the diagram type
  autonumber
  participant C as Client
  C->>S: request
  alt cache hit
    S-->>C: cached
  end
\`\`\`
- Types: sequenceDiagram (who calls whom, when), classDiagram (types and relations), stateDiagram-v2 (lifecycle),
  flowchart (activity: sm-circ start, fr-circ end, fork for fork / join, {decision}), flowchart + «component» subgraphs (component / deployment),
  erDiagram (data entities). Do not use C4* (its style clashes).
- Write Mermaid as it is: <<interface>>, <br/> and List~int~ need no escaping.
- Quote a label with ( ) : #: A["f(x): int"]; a flowchart cannot use end as a node name.
- For a hand-drawn look, start with ---\\nconfig:\\n  look: handDrawn\\n--- (not for sequence).
- Details: references/diagrams.md.`,
  example: '```uml q="When does a request read or write the cache?"\nsequenceDiagram\n  autonumber\n  participant C as Client\n  participant S as Server\n  C->>S: GET /item\n  alt cache hit\n    S-->>C: 200 (cached)\n  else miss\n    S-->>C: 200 (fresh)\n  end\n```',
  render(text, ctx) {
    const { type, line } = umlType(text);
    if (DISCOURAGED[type]) throw new ComponentError(`do not use ${type}: C4 diagrams render very large and clash in style; use flowchart + «component» subgraphs`, line);
    if (!UML_KINDS[type]) {
      throw new ComponentError(`unknown UML diagram type "${type}"; the first line should be one of: ${['sequenceDiagram', 'classDiagram', 'stateDiagram-v2', 'flowchart TD', 'erDiagram'].join(' | ')}`, line);
    }
    const meta = figureArgs(ctx.args);
    return figureHtml({
      cls: 'uml',
      live: 'uml',
      kindLabel: `UML · ${meta.kind || UML_KINDS[type]}`,
      meta,
      ctx,
      payload: jsonScript('am-uml-src', text),
    });
  },
};
