// 研究页的三个结构组件：prereq（前置知识卡片）、finding（发现：论断 + 证据类型 + 影响）、glossary（术语表）。
// 写法统一为 "键: 值"，值是 Markdown；不以键开头的行续接到上一个键（可以写多行 / ~~~ 代码块）。
import { md, mdInline, termSlug } from '../markdown.js';
import { esc } from '../svg/text.js';
import { ComponentError, contentLines, fields } from './error.js';

// 解析 "# 标题" + "键: 值" 块。keys: { 规范键: [别名…] }。
export function parseFields(text, keys, comp) {
  const alias = new Map();
  for (const [k, names] of Object.entries(keys)) for (const n of [k, ...names]) alias.set(n.toLowerCase(), k);
  const out = { title: '', fields: {}, lines: {} };
  let cur = null;
  const raw = String(text).split('\n');
  raw.forEach((line, i) => {
    const t = line.trim();
    if (!cur && !out.title && /^#\s+/.test(t)) {
      out.title = t.replace(/^#\s+/, '');
      return;
    }
    const m = line.match(/^\s*([^:：\s][^:：]{0,15}?)\s*[:：]\s?(.*)$/);
    const key = m && alias.get(m[1].trim().toLowerCase());
    if (key) {
      cur = key;
      out.fields[key] = m[2];
      out.lines[key] = i + 1;
      return;
    }
    if (cur) out.fields[cur] += `\n${line}`;
    else if (t) throw new ComponentError(`${comp} 无法解析："${t}"。应为 "# 标题" 或 "键: 值"（可用键：${Object.values(keys).map((v, j) => `${Object.keys(keys)[j]}/${v[0]}`).join('、')}）`, i + 1);
  });
  for (const k of Object.keys(out.fields)) out.fields[k] = out.fields[k].trim();
  return out;
}

const PREREQ_KEYS = {
  what: ['是什么', '定义'],
  why: ['为什么需要', '为什么', '为何需要'],
  example: ['例子', '最小例子', '示例'],
  misconception: ['误解', '常见误解'],
  deeper: ['深入', '延伸阅读', '深入阅读'],
  needs: ['依赖', '前置'],
};
const PREREQ_LABEL = {
  zh: { what: '是什么', why: '为什么这里需要', example: '最小例子', misconception: '常见误解', deeper: '深入', needs: '依赖' },
  en: { what: 'What it is', why: 'Why it matters here', example: 'Minimal example', misconception: 'Common misconception', deeper: 'Go deeper', needs: 'Needs' },
};
const zhKeys = (text) => /^\s*(是什么|定义|为什么|为何|例子|最小例子|示例|误解|常见误解|深入|延伸阅读|依赖|前置)\s*[:：]/m.test(text);

export const prereq = {
  name: 'prereq',
  summary: '前置知识卡片（研究页 Background）：是什么 / 为什么这里需要 / 例子 / 误解 / 深入',
  syntax: `\`\`\`prereq B-1 [l1] [8min]
# 注意力中的 Q / K / V
是什么: 每个 token 生成 Query、Key、Value 三个向量。
为什么需要: 旧 token 的 K、V 不变，所以可以缓存。
例子: \`softmax(qKᵀ/√d)·V\`（可多行；代码块用 ~~~）
误解: 误解：缓存的是输出 token。事实：缓存的是每层的 K、V。
深入: [1] Vaswani 2017 §3.2
依赖: B-0
\`\`\`
- 参数：卡片编号（与前置知识地图节点一致）、l1 = 必须先懂（黑色标签）、预计阅读时间。
- "是什么" 和 "为什么需要" 必填。英文键：what / why / example / misconception / deeper / needs。
- 同一面板里的多张卡片自动排成网格。`,
  example: '```prereq B-0 l1 3min\n# 自回归解码\n是什么: 模型每次只生成 1 个 token，再把它接到输入末尾。\n为什么需要: 生成 n 个 token 需要 n 次前向计算。\n```',
  render(text, { args }) {
    const [id = '', ...flags] = args.split(/\s+/).filter(Boolean);
    if (!id) throw new ComponentError('prereq 需要卡片编号，例如 ```prereq B-1 l1 8min', 0);
    const l1 = flags.includes('l1');
    const time = flags.find((f) => /\d/.test(f) && f !== 'l1');
    const p = parseFields(text, PREREQ_KEYS, 'prereq');
    if (!p.title) throw new ComponentError('prereq 第一行写 "# 概念名"', 1);
    for (const k of ['what', 'why']) {
      if (!p.fields[k]) throw new ComponentError(`prereq ${id} 缺少 "${PREREQ_LABEL.zh[k]}"（${k}）——这是卡片的必填项`, 1);
    }
    const L = PREREQ_LABEL[zhKeys(text) ? 'zh' : 'en'];
    const rows = Object.keys(PREREQ_KEYS).filter((k) => p.fields[k] && k !== 'needs')
      .map((k) => `<dt>${esc(L[k])}</dt><dd${k === 'misconception' ? ' class="am-prereq-mis"' : ''}>${md(p.fields[k])}</dd>`).join('');
    const needs = p.fields.needs ? `<p class="am-prereq-needs">${esc(L.needs)}: ${mdInline(p.fields.needs)}</p>` : '';
    return `<article class="am-prereq" id="p-${esc(id)}">
<header><span class="am-prereq-id${l1 ? ' am-prereq-id--l1' : ''}">${esc(id)}</span><h3>${mdInline(p.title)}</h3>${time ? `<span class="am-prereq-time">~${esc(time.replace(/^~/, ''))}</span>` : ''}</header>
<dl>${rows}</dl>${needs}
</article>`;
  },
};

const FINDING_KEYS = {
  claim: ['结论', '论断', '主张'],
  evidence: ['证据'],
  implication: ['影响', '意义', '启示'],
};
const KINDS = {
  observed: 'observed', inferred: 'inferred', speculative: 'speculative',
  实测: 'observed', 观测: 'observed', 推断: 'inferred', 推测: 'speculative',
};
const CONF = { high: 'high', medium: 'medium', low: 'low', 高: 'high', 中: 'medium', 低: 'low' };
const KIND_RE = /\[(observed|inferred|speculative|实测|观测|推断|推测)\]/g;

export const finding = {
  name: 'finding',
  summary: '发现卡片：论断 + 证据（标注 observed / inferred / speculative）+ 影响 + 置信度',
  syntax: `\`\`\`finding F1 high
# 一句话论断（完整句子）
结论: 具体数字和条件。
证据: [observed] 由配置计算得出，见复现。[inferred] 权重约 12.6 GiB。
影响: 容量规划要按"最大上下文 × 并发"计算。
\`\`\`
- 参数：编号（页面锚点 #F1，可在 TL;DR 里写 [F1](#F1)）、置信度 high | medium | low（或 高/中/低）。
- 证据必须标注类型：[observed] 实测/直接读到，[inferred] 由观测推出，[speculative] 未验证的假设
  （中文可写 [实测] [推断] [推测]）。英文键：claim / evidence / implication。`,
  example: '```finding F1 high\n# 缓存命中率决定尾延迟\n结论: 命中率从 80% 降到 60% 时，p99 从 40 ms 升到 210 ms。\n证据: [observed] 压测 3 轮，见复现。\n影响: 先扩缓存，再扩实例。\n```',
  render(text, { args }) {
    const [id = '', confRaw = ''] = args.split(/\s+/).filter(Boolean);
    if (!id) throw new ComponentError('finding 需要编号，例如 ```finding F1 high', 0);
    const conf = CONF[confRaw.toLowerCase?.() ?? ''] ?? CONF[confRaw];
    if (!conf) throw new ComponentError(`finding ${id} 的置信度 "${confRaw}" 无效，可选：high | medium | low`, 0);
    const p = parseFields(text, FINDING_KEYS, 'finding');
    if (!p.title) throw new ComponentError('finding 第一行写 "# 一句话论断"', 1);
    if (!p.fields.evidence) throw new ComponentError(`finding ${id} 缺少 "证据"（evidence）`, 1);
    if (!KIND_RE.test(p.fields.evidence)) {
      throw new ComponentError(`finding ${id} 的证据没有标注类型：在证据前写 [observed] / [inferred] / [speculative]`, p.lines.evidence);
    }
    KIND_RE.lastIndex = 0;
    const zh = zhKeys(text) || /^\s*(结论|论断|证据|影响)\s*[:：]/m.test(text);
    const L = zh ? { claim: '论断', evidence: '证据', implication: '影响', conf: '置信度' } : { claim: 'Claim', evidence: 'Evidence', implication: 'Implication', conf: 'confidence' };
    const badge = (s) => s.replace(KIND_RE, (_, k) => `<span class="am-kind am-kind--${KINDS[k]}">${esc(k)}</span>`);
    const rows = Object.keys(FINDING_KEYS).filter((k) => p.fields[k])
      .map((k) => `<dt>${L[k]}</dt><dd>${badge(md(p.fields[k]))}</dd>`).join('');
    return `<article class="am-finding" id="${esc(id)}">
<header><span class="am-finding-id">${esc(id)}</span><h3>${mdInline(p.title)}</h3><span class="am-conf am-conf--${conf}">${L.conf}: ${conf}</span></header>
<dl>${rows}</dl>
</article>`;
  },
};

// glossary：每行 术语 | 别名 | 定义 | 易混淆（后两项可省略）。正文里用 [[术语]] 链接，悬停显示定义。
export function parseGlossary(text) {
  return contentLines(text).map(({ text: t, line }) => {
    const [term, alias = '', def = '', not = ''] = fields(t);
    if (!term || !def) throw new ComponentError(`glossary 行格式应为：术语 | 别名 | 定义 | 易混淆（可省略）——"${t}"`, line);
    return { term, alias, def, not, line, slug: termSlug(term) };
  });
}

export const glossary = {
  name: 'glossary',
  summary: '术语表；正文用 [[术语]] 引用，悬停显示定义',
  syntax: `\`\`\`glossary
KV cache | 键值缓存 | 在显存中保存每层的 K、V 向量，解码时重复使用。 | 不是 HTTP 缓存
GQA | grouped-query attention | 多个 query head 共享一组 K/V head。
\`\`\`
- 每行：术语 | 别名 | 定义 | 易混淆（别名可留空，易混淆可省略）。按阅读顺序排列，不按字母。
- 正文任何地方写 [[KV cache]] 或 [[显示文字|KV cache]] 生成术语链接；未定义的术语会报错。
- 别名也能被 [[…]] 引用。`,
  example: '```glossary\nprefill | 预填充 | 一次前向计算处理整个 prompt，并写入全部 KV。\n```',
  render(text) {
    const items = parseGlossary(text);
    return `<dl class="am-glossary">${items.map((g) => `<dt id="${esc(g.slug)}">${esc(g.term)}${g.alias ? `<span class="am-gl-alias">${esc(g.alias)}</span>` : ''}</dt><dd>${mdInline(g.def)}${g.not ? `<span class="am-gl-not">${mdInline(g.not)}</span>` : ''}</dd>`).join('')}</dl>`;
  },
};
