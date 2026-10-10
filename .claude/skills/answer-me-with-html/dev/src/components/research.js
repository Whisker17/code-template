// Research fork — the three structure components of a research page: prereq (prerequisite card), finding (claim + kind of evidence +
// implication) and glossary. prereq and finding are written as "key: value" lines whose values are Markdown; a line that does not start
// with a key continues the key before it (so a value can span lines or hold a ~~~ code block). Keys are English; the Chinese key names
// of the first fork version are still accepted as input. The labels on the card follow the page language (src/languages/research.js).
import { md, mdInline, termSlug } from '../markdown.js';
import { esc } from '../svg/text.js';
import { researchLabels } from '../languages/research.js';
import { ComponentError, contentLines, fields } from './error.js';

const labels = (ctx) => ctx?.ui?.research ?? researchLabels('en');

// Parse a "# title" + "key: value" block. keys: { canonical key: [aliases…] }.
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
    const m = line.match(/^\s*([^:：\s][^:：]{0,15}?)\s*[:：]\s?(.*)$/); // lang-ok: the fullwidth colon is accepted input
    const key = m && alias.get(m[1].trim().toLowerCase());
    if (key) {
      cur = key;
      out.fields[key] = m[2];
      out.lines[key] = i + 1;
      return;
    }
    if (cur) out.fields[cur] += `\n${line}`;
    else if (t) throw new ComponentError(`${comp} cannot read "${t}"; expected "# title" or "key: value" (keys: ${Object.keys(keys).join(', ')})`, i + 1);
  });
  for (const k of Object.keys(out.fields)) out.fields[k] = out.fields[k].trim();
  return out;
}

const PREREQ_KEYS = {
  what: ['是什么', '定义'], // lang-ok: Chinese key names accepted as input
  why: ['为什么需要', '为什么', '为何需要'], // lang-ok: Chinese key names accepted as input
  example: ['例子', '最小例子', '示例'], // lang-ok: Chinese key names accepted as input
  misconception: ['误解', '常见误解'], // lang-ok: Chinese key names accepted as input
  deeper: ['深入', '延伸阅读', '深入阅读'], // lang-ok: Chinese key names accepted as input
  needs: ['依赖', '前置'], // lang-ok: Chinese key names accepted as input
};

export const prereq = {
  name: 'prereq',
  summary: 'prerequisite card (research page Background): what it is / why it matters here / example / misconception / go deeper',
  syntax: `\`\`\`prereq B-1 [l1] [8min]
# Q / K / V in attention
what: Each token makes three vectors: a query, a key and a value.
why: The K and V of earlier tokens do not change, so they can be cached.
example: \`softmax(qKᵀ/√d)·V\` (may span lines; use ~~~ for a code block)
misconception: Myth: the cache holds output tokens. Fact: it holds the K and V of each layer.
deeper: [1] Vaswani 2017 §3.2
needs: B-0
\`\`\`
- Arguments: the card ID (the same as its node on the prerequisite map), l1 = must know first (dark tag), the expected reading time.
- what and why are required. Keys: what / why / example / misconception / deeper / needs.
- Several cards in one panel form a grid.`,
  example: '```prereq B-0 l1 3min\n# Autoregressive decoding\nwhat: The model makes one token at a time and appends it to its input.\nwhy: Making n tokens takes n forward passes.\n```',
  render(text, ctx) {
    const [id = '', ...flags] = ctx.args.split(/\s+/).filter(Boolean);
    if (!id) throw new ComponentError('prereq needs a card ID, for example ```prereq B-1 l1 8min', 0);
    const l1 = flags.includes('l1');
    const time = flags.find((f) => /\d/.test(f) && f !== 'l1');
    const p = parseFields(text, PREREQ_KEYS, 'prereq');
    if (!p.title) throw new ComponentError('the first line of a prereq is "# concept name"', 1);
    for (const k of ['what', 'why']) {
      if (!p.fields[k]) throw new ComponentError(`prereq ${id} has no "${k}:" line; it is required`, 1);
    }
    const L = labels(ctx).prereq;
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
  claim: ['结论', '论断', '主张'], // lang-ok: Chinese key names accepted as input
  evidence: ['证据'], // lang-ok: Chinese key names accepted as input
  implication: ['影响', '意义', '启示'], // lang-ok: Chinese key names accepted as input
};
const KINDS = {
  observed: 'observed', inferred: 'inferred', speculative: 'speculative',
  实测: 'observed', 观测: 'observed', 推断: 'inferred', 推测: 'speculative', // lang-ok: Chinese evidence kinds accepted as input
};
const CONF = { high: 'high', medium: 'medium', low: 'low', 高: 'high', 中: 'medium', 低: 'low' }; // lang-ok: Chinese confidence accepted as input
const KIND_RE = /\[(observed|inferred|speculative|实测|观测|推断|推测)\]/g; // lang-ok: Chinese evidence kinds accepted as input

export const finding = {
  name: 'finding',
  summary: 'finding card: claim + evidence (marked observed / inferred / speculative) + implication + confidence',
  syntax: `\`\`\`finding F1 high
# A one-sentence claim (a full sentence)
claim: The numbers and the conditions.
evidence: [observed] Computed from the config; see Reproduce. [inferred] The weights take about 12.6 GiB.
implication: Plan capacity as "longest context × concurrency".
\`\`\`
- Arguments: the ID (page anchor #F1; link it from the TL;DR as [F1](#F1)) and the confidence high | medium | low.
- Mark the kind of every piece of evidence: [observed] measured or read directly, [inferred] derived from observations,
  [speculative] an assumption not yet checked. Keys: claim / evidence / implication.`,
  example: '```finding F1 high\n# The cache hit rate sets the tail latency\nclaim: When the hit rate drops from 80% to 60%, p99 rises from 40 ms to 210 ms.\nevidence: [observed] Three load-test runs; see Reproduce.\nimplication: Grow the cache before adding instances.\n```',
  render(text, ctx) {
    const [id = '', confRaw = ''] = ctx.args.split(/\s+/).filter(Boolean);
    if (!id) throw new ComponentError('finding needs an ID, for example ```finding F1 high', 0);
    const conf = CONF[confRaw.toLowerCase()] ?? CONF[confRaw];
    if (!conf) throw new ComponentError(`finding ${id} has an invalid confidence "${confRaw}". Choose one of: high | medium | low`, 0);
    const p = parseFields(text, FINDING_KEYS, 'finding');
    if (!p.title) throw new ComponentError('the first line of a finding is "# one-sentence claim"', 1);
    if (!p.fields.evidence) throw new ComponentError(`finding ${id} has no "evidence:" line`, 1);
    if (!KIND_RE.test(p.fields.evidence)) {
      throw new ComponentError(`finding ${id}: the evidence has no kind; write [observed] / [inferred] / [speculative] before it`, p.lines.evidence);
    }
    KIND_RE.lastIndex = 0;
    const L = labels(ctx).finding;
    const badge = (s) => s.replace(KIND_RE, (_, k) => `<span class="am-kind am-kind--${KINDS[k]}">${esc(k)}</span>`);
    const rows = Object.keys(FINDING_KEYS).filter((k) => p.fields[k])
      .map((k) => `<dt>${esc(L[k])}</dt><dd>${badge(md(p.fields[k]))}</dd>`).join('');
    return `<article class="am-finding" id="${esc(id)}">
<header><span class="am-finding-id">${esc(id)}</span><h3>${mdInline(p.title)}</h3><span class="am-conf am-conf--${conf}">${esc(L.confidence)}: ${conf}</span></header>
<dl>${rows}</dl>
</article>`;
  },
};

// glossary: one term per line, term | alias | definition | often confused with (the last two are optional). The text links a term with
// [[term]], and the definition shows on hover.
export function parseGlossary(text) {
  return contentLines(text).map(({ text: t, line }) => {
    const [term, alias = '', def = '', not = ''] = fields(t);
    if (!term || !def) throw new ComponentError(`a glossary line is: term | alias | definition | often confused with (optional), not "${t}"`, line);
    return { term, alias, def, not, line, slug: termSlug(term) };
  });
}

export const glossary = {
  name: 'glossary',
  summary: 'glossary; the text links a term with [[term]], and the definition shows on hover',
  syntax: `\`\`\`glossary
KV cache | key-value cache | Keeps the K and V vectors of every layer in GPU memory and reuses them while decoding. | not an HTTP cache
GQA | grouped-query attention | Several query heads share one group of K/V heads.
\`\`\`
- Each line: term | alias | definition | often confused with (the alias may be empty; the last column may be left out). Keep reading order, not alphabetical.
- Anywhere in the text, [[KV cache]] or [[shown text|KV cache]] makes a term link; a term that is not defined is an error.
- [[…]] can name an alias too.`,
  example: '```glossary\nprefill | | One forward pass reads the whole prompt and writes all of its KV.\n```',
  render(text) {
    const items = parseGlossary(text);
    return `<dl class="am-glossary">${items.map((g) => `<dt id="${esc(g.slug)}">${esc(g.term)}${g.alias ? `<span class="am-gl-alias">${esc(g.alias)}</span>` : ''}</dt><dd>${mdInline(g.def)}${g.not ? `<span class="am-gl-not">${mdInline(g.not)}</span>` : ''}</dd>`).join('')}</dl>`;
  },
};
