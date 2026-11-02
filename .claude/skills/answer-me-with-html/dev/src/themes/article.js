// Research fork — article: the theme of the article template, and only of it (scope 'article': it is not listed for other pages and
// never embedded in them). Warm paper in light mode, a dark slate in dark mode; auto follows the system. Sans text everywhere.
import { SANS, MONO } from './fonts.js';

export default {
  name: 'article',
  summary: 'Article, for long research reports (the article template only)',
  label: { zh: '文章', 'zh-Hant': '文章', en: 'Article', ja: '記事', he: 'מאמר' }, // lang-ok: viewer-facing theme labels
  scope: ['article'],
  tokens: {
    common: { '--font-sans': SANS, '--font-mono': MONO, '--radius': '10px', '--shadow': 'none', '--bw': '1px', '--head-font': 'var(--font-sans)' },
    light: {
      '--bg': '#f7f5f0', '--paper': '#fffdf9', '--ink': '#1c2230', '--ink-2': '#3a4254', '--ink-3': '#6b7385',
      '--line': '#d3ccbd', '--line-2': '#e4dfd3', '--fill': '#f1efe9',
      '--accent': '#2d5be3', '--accent-bg': '#eaf0ff',
      '--ok': '#1d8a5a', '--ok-bg': '#e6f5ee', '--err': '#c43d2b', '--err-bg': '#fdecea',
      '--warn': '#b4730f', '--warn-bg': '#fdf3e1', '--head-bg': '#1c2230', '--head-fg': '#fffdf9',
      '--violet': '#6a4cc2', '--violet-bg': '#f0ebfc',
    },
    dark: {
      '--bg': '#13161c', '--paper': '#1a1e26', '--ink': '#e8eaf0', '--ink-2': '#c9cdd8', '--ink-3': '#8e96a8',
      '--line': '#3a4150', '--line-2': '#2b313d', '--fill': '#232833',
      '--accent': '#7c9cff', '--accent-bg': '#1d2747',
      '--ok': '#4fc28d', '--ok-bg': '#173327', '--err': '#ff7a66', '--err-bg': '#3a1d1a',
      '--warn': '#f0b44c', '--warn-bg': '#352a15', '--head-bg': '#e8eaf0', '--head-fg': '#13161c',
      '--violet': '#a991ff', '--violet-bg': '#2a2245',
    },
  },
  // The layout of the article template; every selector starts with &, the theme's root (themes/index.js), so other pages never carry it.
  css: `& body { font-size: 17px; line-height: 1.78; text-rendering: optimizeLegibility; }
& .am-article { display: grid; grid-template-columns: minmax(0, 1fr); max-width: 1180px; margin: 0 auto; padding: 0 20px; }
& .am-article .am-toc { display: none; }
@media (min-width: 1180px) {
  & .am-article { grid-template-columns: 220px minmax(0, 1fr); gap: 56px; }
  & .am-article .am-toc { display: block; position: sticky; top: 28px; align-self: start; max-height: calc(100vh - 56px); overflow: auto; padding-top: 40px; font-size: 13.5px; line-height: 1.5; }
}
& .am-article .am-toc-t { margin: 0 0 10px; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: var(--ink-3); }
& .am-article .am-toc a { color: var(--ink-3); padding: 5px 0 5px 12px; border-inline-start: 2px solid var(--line-2); }
& .am-article .am-toc a.am-toc-sub { padding-inline-start: 24px; font-size: 12.5px; }
& .am-article .am-toc a.is-on { color: var(--ink); border-inline-start-color: var(--accent); font-weight: 600; }
& .am-article > .am-doc-body { min-width: 0; width: 100%; max-width: 760px; margin: 0 auto; padding-bottom: 120px; }
/* Long paths and URLs wrap inside the column instead of widening the page on a phone. */
& .am-article :not(pre) > code, & .am-article a { overflow-wrap: anywhere; }
/* title block */
& .am-article .am-head { margin: 0; padding: 64px 0 8px; }
& .am-article .am-head h1 { font-size: 36px; line-height: 1.22; letter-spacing: -.01em; font-weight: 760; margin: 0 0 12px; }
& .am-article .am-sub { margin: 0 0 18px; font-size: 19px; line-height: 1.7; color: var(--ink-2); }
& .am-article .am-head-meta { margin: 0; padding: 10px 0; gap: 2px 20px; font-size: 13.5px; color: var(--ink-3); border-top: 1px solid var(--line-2); border-bottom: 1px solid var(--line-2); }
& .am-article .am-head-meta b { font-family: var(--font-sans); font-weight: 600; color: var(--ink-2); }
& .am-article .am-intro { max-width: none; margin-top: 22px; font-size: 18px; line-height: 1.75; }
/* sections */
& .am-article .am-part { scroll-margin-top: 24px; }
& .am-article .am-part > h2 { margin: 48px 0 0; padding-top: 14px; border-top: 2px solid var(--ink); font-size: 28px; line-height: 1.3; font-weight: 740; letter-spacing: -.005em; }
& .am-article .am-sn { font: 700 15px var(--font-mono); color: var(--ink-3); margin-inline-end: 12px; vertical-align: 2px; }
& .am-article .am-part > * + * { margin-top: 14px; }
& .am-article .am-md p { margin: 12px 0; }
& .am-article .am-md li + li { margin-top: 6px; }
& .am-article .am-md h3 { margin: 44px 0 8px; padding-top: 14px; border-top: 1px solid var(--line-2); font-size: 21px; line-height: 1.4; font-weight: 700; scroll-margin-top: 24px; }
& .am-article .am-md h4 { margin: 26px 0 6px; font-size: 16px; }
& .am-article .am-md blockquote { border-inline-start-color: var(--line); font-size: 17px; }
& .am-article .am-md :not(pre) > code { font-size: .86em; overflow-wrap: anywhere; }
& .am-article .am-md table { font-size: 15px; }
& .am-article .am-md th { font: 600 12.5px/1.4 var(--font-sans); color: var(--ink-3); padding: 8px 10px; border-bottom: 1px solid var(--line); }
& .am-article .am-md td { padding: 9px 10px; }
& .am-article .am-md tbody tr:nth-child(even) td { background: none; }
& .am-article .am-code { font-size: 13.5px; border-radius: 8px; }
/* callouts and cards */
& .am-article .am-callout { border-radius: var(--radius); padding: 14px 18px; font-size: 15.5px; }
& .am-article .am-finding, & .am-article .am-prereq { border-color: var(--line-2); border-radius: 12px; }
& .am-article .am-finding + .am-finding { margin-top: 18px; }
& .am-article .am-finding > header, & .am-article .am-prereq > header { padding: 14px 20px; gap: 12px; }
& .am-article .am-finding > header h3 { font-size: 18px; line-height: 1.45; }
& .am-article .am-prereq > header h3 { font-size: 17px; }
& .am-article .am-finding-id { border-radius: 6px; }
& .am-article .am-finding dl { grid-template-columns: 84px minmax(0, 1fr); padding: 12px 20px 14px; font-size: 15.5px; }
& .am-article .am-prereq dl { padding: 10px 20px 14px; font-size: 15.5px; }
& .am-article .am-finding dt, & .am-article .am-prereq dt { font: 600 12px var(--font-sans); letter-spacing: .04em; }
& .am-article .am-prereq + .am-prereq { margin-top: 16px; }
& .am-article .am-glossary { grid-template-columns: minmax(120px, 170px) minmax(0, 1fr); font-size: 15px; border-top-color: var(--line-2); }
/* figures */
& .am-article .am-fig { margin: 28px 0; padding: 18px 18px 14px; border-radius: 12px; }
& .am-article .am-fig-q { padding: 0 0 10px; border: 0; font: 13px/1.5 var(--font-sans); color: var(--ink-3); }
& .am-article .am-fig-q span { font-size: 13px; color: var(--ink-3); }
& .am-article .am-fig-q i { display: none; }
& .am-article .am-fig-canvas { padding: 0; }
& .am-article .am-fig-canvas svg[data-zoom] { cursor: zoom-in; }
& .am-article .am-fig-cap { margin-top: 10px; padding: 10px 0 0; border-top: 1px dashed var(--line-2); font-size: 14px; }
& .am-article .am-fig-dl { display: none; }
/* evidence chips */
& .am-ev { font: 500 10.5px/1 var(--font-mono); color: var(--ink-3); padding: 0 1px; margin: 0 1px; border-radius: 3px; cursor: help; white-space: nowrap; }
& .am-ev:hover, & .am-ev:focus-visible { color: var(--accent); outline: none; }
& .am-ev--speculative { color: var(--err); border: 1px dashed var(--err); padding: 0 2px; }
& .am-ev-tip { position: fixed; z-index: 2147483200; max-width: 420px; padding: 10px 12px; border-radius: 8px; background: var(--head-bg); color: var(--head-fg);
  font: 13px/1.55 var(--font-sans); box-shadow: 0 8px 24px rgba(0, 0, 0, .25); }
& .am-ev-tip[hidden] { display: none; }
& .am-ev-tip-h { font: 600 11px var(--font-mono); opacity: .75; margin-bottom: 4px; }
& .am-ev-tip-e { margin-top: 6px; font-size: 12px; opacity: .75; word-break: break-all; }
/* figure zoom */
& .am-zoom { position: fixed; inset: 0; z-index: 2147483100; display: flex; align-items: center; justify-content: center; padding: 52px 16px 16px; background: rgba(0, 0, 0, .72); cursor: zoom-out; }
& .am-zoom[hidden] { display: none; }
& .am-zoom-box { max-width: 100%; max-height: 100%; overflow: auto; padding: 16px; border-radius: 12px; background: var(--paper); cursor: default; -webkit-overflow-scrolling: touch; }
& .am-zoom-box svg { display: block; width: max(720px, calc(100vw - 64px)); max-width: 1600px; height: auto; }
& .am-zoom-x { position: fixed; top: 10px; inset-inline-end: 14px; width: 36px; height: 36px; border: 0; border-radius: 99px; background: rgba(255, 255, 255, .16); color: #fff; font: 22px/36px var(--font-sans); cursor: pointer; }
& .am-art-foot { margin-top: 60px; padding-top: 16px; border-top: 1px solid var(--line-2); }
& .am-art-foot .am-colophon { margin: 0; }
@media (max-width: 760px) {
  & body { font-size: 16px; }
  & .am-article { padding: 0 16px; }
  & .am-article .am-head { padding: 40px 0 8px; }
  & .am-article .am-head h1 { font-size: 28px; }
  & .am-article .am-sub { font-size: 17px; }
  & .am-article .am-intro { font-size: 16.5px; }
  & .am-article .am-part > h2 { font-size: 23px; }
  & .am-article .am-md h3 { font-size: 19px; }
  & .am-article .am-finding dl { grid-template-columns: minmax(0, 1fr); padding: 10px 16px 12px; font-size: 15px; }
  & .am-article .am-finding > header, & .am-article .am-prereq > header { padding: 12px 16px; }
  & .am-article .am-fig { padding: 14px 12px 12px; }
  & .am-article .am-glossary { grid-template-columns: minmax(0, 1fr); }
}
@media print { & .am-article .am-toc, & .am-ev-tip, & .am-zoom { display: none !important; } }`,
};
