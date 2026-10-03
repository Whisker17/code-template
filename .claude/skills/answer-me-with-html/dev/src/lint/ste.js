// STE 受控写作检查（只约束稿件里的说明文字）。
// 规则：句长、段长、非推荐词、英文被动语态、中文虚动词 / "的"字连用 / 套话。全部为警告，严格度由 style 决定。
// 跳过：代码与行内代码、~~删除线~~（反例展示）、含 no 状态的表格行、标题、除 callout 外的组件。

import { EN_WORDS } from './wordlist.en.js';
import { ZH_LIGHT_VERBS, ZH_CLICHES } from './wordlist.zh.js';
import { isCJK } from '../svg/text.js';

const LIMITS = { zh: { procedural: 35, descriptive: 45 }, en: { procedural: 20, descriptive: 25 } };
const MAX_SENTENCES = 6;
const ABBR = /\b(e\.g|i\.e|etc|vs|cf|approx|Fig|No)\./gi;
const PASSIVE = /\b(?:am|is|are|was|were|be|been|being)\s+(?:\w+ly\s+)?(\w+ed|known|done|made|given|taken|seen|written|built|shown|sent|kept|held|found|set|put|run|begun|chosen|driven|broken)\b/i;
const EN_RE = Object.entries(EN_WORDS)
  .sort((a, b) => b[0].length - a[0].length)
  .map(([word, suggestion]) => ({ re: new RegExp(`\\b${word.replace(/ /g, '\\s+')}\\b`, 'gi'), word, suggestion }));

export function splitSentences(text) {
  const masked = text.replace(ABBR, (m) => m.replace(/\./g, '\u0000'));
  const parts = masked.match(/[^。！？；!?;]+?(?:[。！？；!?;]+|\.(?=\s|$)|$)|[^.]+?\.(?=\s|$)/g) ?? [];
  return parts.map((s) => s.replace(/\u0000/g, '.').trim()).filter(Boolean);
}

export function sentenceLength(sentence) {
  const cjk = [...sentence].filter(isCJK).filter((c) => !/[，。！？；：、（）「」『』“”‘’《》]/.test(c)).length;
  const words = sentence.match(/[A-Za-z0-9][\w'’-]*/g)?.length ?? 0;
  return cjk >= 4 || cjk > words ? { lang: 'zh', count: cjk + words } : { lang: 'en', count: words };
}

export function formatWarning(w) {
  return `L${w.line} [${w.rule}] ${w.message}${w.suggestion ? ` → ${w.suggestion}` : ''}`;
}

const PROSE_FENCES = new Set(['callout', 'prereq', 'finding']);
const FIG_FENCES = new Set(['excalidraw', 'uml', 'mermaid']);

export function lintDoc(doc) {
  const warnings = [];
  const blocks = [...doc.intro, ...doc.panels.flatMap((p) => p.blocks)];
  for (const b of blocks) {
    if (b.type === 'md') lintMarkdown(b.text, b.line, warnings);
    else if (b.lang === 'callout') lintMarkdown(b.text, b.line + 1, warnings);
    else if (PROSE_FENCES.has(b.lang)) lintFields(b.text, b.line + 1, warnings);
  }
  if (doc.meta.template === 'research') lintResearch(doc, blocks, warnings);
  return warnings;
}

// prereq / finding：每个 "键: 值" 字段单独作为一段检查（去掉键名，行号不变）。
const FIELD_KEY = /^\s*[^:：\s#~`][^:：]{0,15}?[:：]\s?/;
function lintFields(text, startLine, out) {
  let seg = null;
  const flush = () => { if (seg) lintMarkdown(seg.lines.join('\n'), seg.line, out); seg = null; };
  text.split('\n').forEach((raw, i) => {
    if (/^#\s/.test(raw.trim())) { flush(); return; }
    if (FIELD_KEY.test(raw)) { flush(); seg = { line: startLine + i, lines: [raw.replace(FIELD_KEY, '')] }; return; }
    if (seg) seg.lines.push(raw);
  });
  flush();
}

// 研究页的完整性检查（只警告）：每张图要有问题，要有前置知识、发现和术语表。
function lintResearch(doc, blocks, out) {
  const fences = blocks.filter((b) => b.type === 'fence');
  for (const b of fences) {
    if (FIG_FENCES.has(b.lang) && !/\bq=/.test(b.args)) {
      out.push({ line: b.line, rule: 'research', message: `${b.lang} 图缺少 q="这张图回答的问题"`, suggestion: '加 q=… 和 takeaway=…' });
    }
  }
  const has = (lang) => fences.some((b) => b.lang === lang);
  const first = doc.panels[0]?.line ?? 1;
  if (!has('prereq')) out.push({ line: first, rule: 'research', message: '没有前置知识卡片（prereq）', suggestion: '为读者基线之外的每个关键概念写一张卡片' });
  if (!has('finding')) out.push({ line: first, rule: 'research', message: '没有发现卡片（finding）', suggestion: '每个论断写成 finding，并标注证据类型' });
  if (!has('glossary')) out.push({ line: first, rule: 'research', message: '没有术语表（glossary）', suggestion: '加一个术语表面板，正文用 [[术语]] 引用' });
  if (!doc.panels.some((p) => p.attrs.sheet)) out.push({ line: first, rule: 'research', message: '没有总览面板（{sheet}）', suggestion: '给 4–6 个总览面板加 {sheet}，作为 5 分钟阅读路径' });
}

function clean(text) {
  return text
    .replace(/~~[^~]*~~/g, '')
    .replace(/`[^`]*`/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/[*_]{1,3}/g, '');
}

function lintMarkdown(text, startLine, out) {
  let para = null;
  const flush = () => {
    if (para && para.count > MAX_SENTENCES) {
      out.push({ line: para.line, rule: 'paragraph-length', message: `段落 ${para.count} 句（上限 ${MAX_SENTENCES}）` });
    }
    para = null;
  };
  let inHtml = false;
  text.split('\n').forEach((raw, i) => {
    const line = startLine + i;
    const t = raw.trim();
    if (/^<(div|svg|table|details|figure)/i.test(t)) inHtml = true;
    if (inHtml) {
      if (/<\/(div|svg|table|details|figure)>\s*$/i.test(t)) inHtml = false;
      return flush();
    }
    if (!t || /^#{1,6}\s/.test(t) || /^[-*_]{3,}$/.test(t)) return flush();
    if (t.startsWith('|')) {
      flush();
      if (/^\|?[\s:|-]+\|?$/.test(t)) return;
      const cells = t.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      if (cells.some((c) => /^(no|✗|✘)(\s|$)/.test(c))) return;
      cells.forEach((c) => checkUnit(clean(c.replace(/^(ok|warn|✓|✔|⚠)(\s|$)/, '')), line, 'descriptive', out));
      return;
    }
    const list = t.match(/^(?:([-*+])|(\d+)[.)])\s+(.*)$/);
    if (list) {
      flush();
      checkUnit(clean(list[3]), line, list[2] ? 'procedural' : 'descriptive', out);
      return;
    }
    const body = clean(t.replace(/^>\s*/, ''));
    const n = checkUnit(body, line, 'descriptive', out);
    if (!para) para = { line, count: 0 };
    para.count += n;
  });
  flush();
}

// 检查一段文字（列表项 / 单元格 / 段落中的一行），返回句子数。
function checkUnit(text, line, kind, out) {
  const sentences = splitSentences(text);
  for (const s of sentences) {
    const { lang, count } = sentenceLength(s);
    const limit = LIMITS[lang][kind];
    if (count > limit) {
      const unit = lang === 'zh' ? '字' : 'words';
      const preview = s.length > 24 ? `${s.slice(0, 24)}…` : s;
      out.push({ line, rule: 'sentence-length', message: `${kind === 'procedural' ? '步骤' : '句子'} ${count} ${unit}（上限 ${limit}）："${preview}"` });
    }
    if (lang === 'en' && PASSIVE.test(s)) {
      out.push({ line, rule: 'passive', message: `疑似被动语态："${s.match(PASSIVE)[0]}"`, suggestion: '改为主动语态' });
    }
  }
  const lexical = [
    ...EN_RE.flatMap(({ re, suggestion }) => [...text.matchAll(re)].map((m) => ({ index: m.index, rule: 'word', message: `不推荐 "${m[0]}"`, suggestion }))),
    ...ZH_LIGHT_VERBS.flatMap(({ re, label }) => [...text.matchAll(re)].map((m) => ({ index: m.index, rule: 'word', message: `虚动词 "${m[0]}"（${label}）`, suggestion: `直接用「${m[1]}」` }))),
  ];
  out.push(...lexical.sort((a, b) => a.index - b.index).map(({ index, ...w }) => ({ line, ...w })));
  for (const s of sentences) {
    if ((s.match(/的/g) ?? []).length >= 3) out.push({ line, rule: 'de-chain', message: `"的"字连用：${s}`, suggestion: '拆句或删去多余的"的"' });
  }
  for (const c of ZH_CLICHES) {
    if (text.includes(c)) out.push({ line, rule: 'cliche', message: `套话 "${c}"`, suggestion: '删除，或换成具体事实' });
  }
  return sentences.length;
}
