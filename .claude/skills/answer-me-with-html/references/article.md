# Article pages (template: article)

An article page is a long-form report: one reading column, a contents list on wide screens, numbered sections, flat figures, and claims cited from a claim ledger. Use it to publish a finished piece of research (for example a research-hub report). Use the `research` template instead when the reader needs an overview sheet and 5 / 30-minute reading paths.

Write all text by [writing.md](writing.md). The components and figures are the same as on a research page: [research.md](research.md) §3–§5 for prerequisite cards, findings and the glossary, and [diagrams.md](diagrams.md) for figures.

## 1. What the template does

| Draft | Page |
|---|---|
| frontmatter `title` | the page title |
| frontmatter `subtitle` | the line under the title (the dek): one sentence that says what the page covers or concludes |
| any other frontmatter key (`date`, `audience`, `scope` …) | one small meta line under the dek |
| text before the first `##` | the lead, under the meta line |
| each `## title` | section N (numbered in order; the letter ID is only its anchor, `#panel-<ID>`) |
| each `### title` in the text of a section | sub-section N.M, listed in the contents |
| `{sheet}`, `depth=`, `span=` | ignored |

There is no toolbar: the page follows the system light / dark mode, and its theme is always `article` (`theme:` is ignored). Figures are drawn flat (no hand-drawn look) in the page palette. A click on a figure enlarges it.

## 2. Skeleton

````markdown
---
template: article
title: <the subject: what the report is about>
subtitle: <one sentence: the scope or the main conclusion>
date: <YYYY-MM-DD>
audience: <the reader>
---
<Lead: the conclusion in 2–3 sentences, with the key numbers {K1}. Link the findings: [F1](#F1).>

## A <Why this question>            ← the problem, why now, scope and non-goals
## B <Concepts to know first>        ← prereq cards, in ladder order
## C <How it works>                  ← a figure first, then the details; ### for sub-sections
## D <Findings>                      ← finding F1… in order of importance
## E <What it means>                 ← numbered actions; callout warn / err when the cost is high
## F <Open questions>
## G <Glossary>                      ← glossary
## H <Sources>                       ← numbered list; mark primary sources **PRIMARY**
````

Adapt the sections to the research ([research.md](research.md) §6 lists the kinds). Keep 6–12 sections. A section longer than about two screens gets `###` sub-sections.

## 3. Evidence chips

With a claim ledger (`am render --evidence ledger.json`, a JSON object `{ "K2": { "claim", "evidence", "type" } }`), write the ledger ID in braces right after the claim:

```markdown
Mainnet runs reth with preconf enabled {K2}. Two nodes agree {K4, K5}.
```

- The chip shows the ID as a small superscript; a hover, focus or tap shows the claim, its kind and its evidence. A `speculative` row gets a red dashed box: say in the sentence that it is a guess.
- An ID that the ledger does not have stops the render with the draft line.
- Braces inside code and inside `$…$` math stay as they are.
- Cite in finding fields too: `evidence: [observed] Node config {K2}.`
- Without `--evidence`, the braces stay text: render with the ledger.

## 4. Checklist

- [ ] The title names the subject; the subtitle and the lead give the conclusion and its magnitudes.
- [ ] Every claim on the page cites a ledger row; every number in the lead appears again in a section, with its chip.
- [ ] Every figure has `q=`, and a `takeaway=` when the point is not obvious.
- [ ] No walls of text: 5 or more paragraphs in a row become a figure, a table or a list.
- [ ] Phone (`am shot <page> --width 390`): the column is nearly full width; figures scroll inside their frame and their text is readable.
