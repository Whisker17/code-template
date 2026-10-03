// UML 蓝图（blueprint）：Mermaid 源码（sequence / class / state / activity / component / ER）。
// 浏览器端用 Mermaid 渲染，am bake 烘焙成静态 SVG。这里只做静态校验和占位输出。
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

// 找到第一行有效内容：跳过 --- frontmatter --- 和 %% 注释。
export function umlType(text) {
  const lines = String(text).split('\n');
  let i = 0;
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((l, k) => k > 0 && l.trim() === '---');
    if (end === -1) throw new ComponentError('uml 的 --- 配置块未闭合', 1);
    i = end + 1;
  }
  for (; i < lines.length; i++) {
    const t = lines[i].trim();
    if (!t || t.startsWith('%%')) continue;
    return { type: t.split(/\s+/)[0], line: i + 1 };
  }
  throw new ComponentError('uml 内容为空', 1);
}

export default {
  name: 'uml',
  aliases: ['mermaid'],
  summary: 'UML 蓝图（Mermaid：sequence / class / state / activity / component / ER），需 am bake 烘焙',
  syntax: `\`\`\`uml [q="这张图回答的问题"] [read="读法"] [takeaway="要点"]
sequenceDiagram            ← 第一行是图类型
  autonumber
  participant C as Client
  C->>S: request
  alt cache hit
    S-->>C: cached
  end
\`\`\`
- 类型：sequenceDiagram（谁在何时调用谁）、classDiagram（类型与关系）、stateDiagram-v2（生命周期）、
  flowchart（活动图：sm-circ 开始、fr-circ 结束、fork 分叉/汇合、{判断}）、flowchart + «component» 子图（组件 / 部署）、
  erDiagram（数据实体）。不要用 C4*（风格冲突）。
- 原样写 Mermaid：<<interface>>、<br/>、List~int~ 都不需要转义。
- 标签含 ( ) : # 时加引号：A["f(x): int"]；flowchart 不能用 end 当节点名。
- 想要手绘风：开头加 ---\\nconfig:\\n  look: handDrawn\\n---（sequence 不支持）。
- 详细写法见 references/diagrams.md。`,
  example: '```uml q="一次请求何时读写缓存？"\nsequenceDiagram\n  autonumber\n  participant C as Client\n  participant S as Server\n  C->>S: GET /item\n  alt cache hit\n    S-->>C: 200 (cached)\n  else miss\n    S-->>C: 200 (fresh)\n  end\n```',
  render(text, ctx) {
    const { type, line } = umlType(text);
    if (DISCOURAGED[type]) throw new ComponentError(`不要用 ${type}：C4 图渲染很大且风格冲突，改用 flowchart + «component» 子图`, line);
    if (!UML_KINDS[type]) {
      throw new ComponentError(`未知的 UML 图类型 "${type}"，第一行应为：${['sequenceDiagram', 'classDiagram', 'stateDiagram-v2', 'flowchart TD', 'erDiagram'].join(' | ')}`, line);
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
