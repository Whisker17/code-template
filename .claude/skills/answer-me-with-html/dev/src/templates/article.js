// Research fork — article: a long-form report page. A title block (title, dek, meta line, lead), a sticky contents column on wide
// screens, and one reading column of numbered sections: each ## panel is a section N, each ### heading in its text a sub-section N.M.
// There is no overview sheet and no reading-path filter ({sheet} and depth= are ignored); the contents list is the way around the page.
import { headHtml } from './panel.js';
import { esc } from '../svg/text.js';

// ### headings written in the text (rendered as <h3> by Markdown) get a number and an anchor. The <h3> inside components (finding,
// prereq) are card titles, not sections, so <article> blocks are left alone.
const CARD = /(<article\b[\s\S]*?<\/article>)/;

export function numberSubheads(html, n, id) {
  const subs = [];
  const body = html.split(CARD).map((part, i) => (i % 2 ? part : part.replace(/<h3>([\s\S]*?)<\/h3>/g, (_, inner) => {
    const no = `${n}.${subs.length + 1}`;
    const anchor = `panel-${id}-${subs.length + 1}`;
    subs.push({ no, anchor, text: inner.replace(/<[^>]+>/g, '') });
    return `<h3 id="${esc(anchor)}"><span class="am-sn">${no}</span>${inner}</h3>`;
  }))).join('');
  return { body, subs };
}

export function article({ meta, introHtml, panels, ui, language }) {
  const parts = panels.map((p, i) => ({ p, n: i + 1, ...numberSubheads(p.html, i + 1, p.id) }));
  const link = (href, text, cls = '') => `<a href="#${esc(href)}"${cls ? ` class="${cls}"` : ''}>${text}</a>`;
  const toc = `<nav class="am-toc" aria-label="${esc(ui?.toc ?? 'Contents')}"><p class="am-toc-t">${esc(ui?.toc ?? 'Contents')}</p>${parts
    .map(({ p, n, subs }) => link(`panel-${p.id}`, `${n} ${esc(p.title)}`) + subs.map((s) => link(s.anchor, `${s.no} ${esc(s.text)}`, 'am-toc-sub')).join(''))
    .join('')}</nav>`;
  const sections = parts.map(({ p, n, body }) => `<section class="am-part" id="panel-${esc(p.id)}">
<h2><span class="am-sn">${n}</span>${esc(p.title)}</h2>
${body}
</section>`).join('\n');
  const labels = esc(JSON.stringify(ui?.research?.article ?? {}));
  return `<main class="am-article" data-am-labels="${labels}">
${toc}<div class="am-doc-body">
${headHtml(meta, introHtml, language)}
${sections}
</div>
</main>`;
}
