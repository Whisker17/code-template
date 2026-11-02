# Research post: writing contract

Read this file before you write a research report (a long-form report for internal developers). Rendering is done by `template: article` ([article.md](article.md)). This file is the **writing contract**: skeleton, claim ledger, figures, style, checklist.

English version of the Notion page "Research post" §4–§9, plus the common rules of "内容输出模板" §2 that apply here (snapshot 2026-11-02).

**Sync rule:** the repo copy is for agents, Notion is for humans. When one changes, update the other and add a CHANGELOG bullet. When research-hub changes its writing rules, sync them back into this file.

**Out of scope:** the research-hub publishing pipeline (`rh render / check / publish`, Notion back-fill, the reviewed state). Other repos render with `am render --evidence`. Parts that belong to research-hub only are marked *(research-hub specific)* below.

Reader: internal developers with an engineering background who do not know the field or the external material. Go from shallow to deep, top down: first let them in, then take them deeper.

## 1. Report skeleton

| Position | What to write | Rule |
| --- | --- | --- |
| Title `title` | The topic | A noun phrase that says what the report covers |
| Subtitle `subtitle` | One conclusion | Not "This report introduces…" |
| Meta | `date`, `audience`, `scope` | `audience` comes from the brief's "reader" |
| Lead | The conclusion in 2–3 sentences, with key numbers and evidence `{K1}`, linking to the main findings | Every number in the lead appears again in the body |
| Why this question | The problem, why now, scope and non-goals | Non-goals = the brief's "not included" |
| Prerequisites | `prereq` cards in ladder order | Only concepts needed to read what follows |
| How it works | One figure first (system → flow), then detail; one example runs through the whole report | Split into `###` when longer than two screens |
| Findings | Findings F1…, ordered by importance | Each has an evidence kind and a `{number}` |
| Comparison / trade-offs (optional) | A table comparing options | At most 4–5 columns (phone) |
| What it means for us | Numbered action advice; costly ones in a warn / err callout | Factual premises also cite the ledger |
| Limits and open questions | Questions not answered, and why | `speculative` may appear only here or in a sentence that says "speculation" |
| Method and evidence | How you looked, and what the main basis is | For material-driven work, say the basis is material supplied by the owner |
| Glossary | `glossary`; use `[[term]]` for hover in the body | — |
| References | Numbered list; mark primary sources PRIMARY | List only what the body cites |

6–12 sections. Every research question in the brief must have an answer on the page: a finding, a section, or a line in "Limits and open questions" that says why it is not answered.

```markdown
---
template: article
title: <topic>
subtitle: <one-sentence conclusion>
date: <YYYY-MM-DD>
audience: <reader>
scope: <scope>
---
<Lead: conclusion and key numbers {K1}. Main findings: [F1](#F1).>

## A Why this question
## B Prerequisites
## C How it works
## D Findings
## E What it means for us
## F Limits and open questions
## G Method and evidence
## H Glossary
## I References
```

## 2. Claim ledger

- File `research/ledger.md`, one table: `# | claim | evidence | kind | page`. Kind is only `observed`, `inferred` or `speculative`.
- Every claim on the page (lead, numbers, findings, factual premises in "What it means for us") has one ledger row. Add the ledger row first, then write it on the page.
- In the body cite with `{K2}` or `{K2, K5}`; they render as hoverable evidence marks. Rendering fails when a number does not exist.
- A `speculative` row renders as a red dashed box, and the sentence must say it is speculation.
- When done, fill each claim's page position into the "page" column. Rows that nothing cites may stay; they are the research record.

## 3. Figures

- Draw relations, flows, lifecycles and architecture. Five or more paragraphs of text in a row become a figure, table or list.
- Use `excalidraw` for sketches and concept figures, `uml` (Mermaid) for exact sequence, state and class figures. On an article page both render in a flat style and open larger on click.
- Give every figure `q=` (the question the figure answers) and `takeaway=` when the point is not obvious.
- Layer figures: main flow on the upper layer, add-on parts on the lower layer; explanation goes on the right, not piled under the figure.
- Align images with the body text; they open larger on click and must not fill the screen.

## 4. Writing

- Follow [writing.md](writing.md) (STE rules): short sentences, one thing per sentence, active voice, consistent terms.
- Humanize: cut filler and stock phrases, keep technical detail (code, parameters, numbers, versions).
- Stay neutral. No personal opinion. *(research-hub specific)* No advice addressed to one company in the tweet card.
- Use LaTeX (`$…$`) for formulas; do not fake a formula in a code block.
- Readers mostly use phones: tables have at most 4–5 columns; break long code lines by hand.

## 5. Bilingual and tweet card *(research-hub specific)*

- The Chinese `explainer.md` is the main draft; the English `explainer.en.md` has the same meaning, is not word for word, and is reviewed by sol until PASS.
- The tweet card `card.yml`: background / status / Excalidraw figure / 2–3 findings / conclusion / tweet. English only, only `observed` / `inferred` claims, written as a neutral researcher, mention Mantle as little as possible. Reviewed by Astra until PASS.
- For a private report, the owner confirms what may go public before the tweet; the owner posts the tweet by hand.

## 6. Delivery checklist

- [ ] The title names the topic; the subtitle and lead give the conclusion and its size.
- [ ] Every claim on the page cites the ledger; the ledger's "page" column is filled; every `speculative` claim is marked.
- [ ] Every research question in the brief has an answer or a stated reason.
- [ ] The prerequisites are enough for the target reader to follow "How it works".
- [ ] The render has no `✗`, figures are baked; only STE warnings with a reason to stay remain.
- [ ] Phone check (390×844) passes: no horizontal overflow, body width ≥ 300px, font size ≥ 14px; every figure was seen at 1280 and 390 width.
- [ ] *(research-hub specific)* English version has sol PASS, tweet card has Astra PASS.
- [ ] *(research-hub specific)* After publishing, Notion is back-filled (report link, status "published").

## 7. Coverage of the ten common content rules

The ten rules come from the Notion page "内容输出模板" §2 (shared by research posts and slides).

| # | Rule | In a research post |
| --- | --- | --- |
| 1 | Conclusion first | Applies: subtitle and lead are conclusions; the first sentence of each section is a conclusion (section 1) |
| 2 | Onboarding before depth | Applies: the prerequisites section and the shallow-to-deep order (section 1) |
| 3 | Every fact traces to a source | Applies: claim ledger with `observed` / `inferred` / `speculative`; `speculative` only in "Limits and open questions" or a sentence that says so (section 2) |
| 4 | A figure beats words | Applies: Excalidraw / UML, layered, `q=` per figure (section 3) |
| 5 | Humanize, keep it technical | Applies: STE rules plus no filler, details kept (section 4) |
| 6 | Chinese and English | Applies *(research-hub specific)*: two editions with the same meaning, not word for word; tweet card in English only (section 5) |
| 7 | Work private, Mantle colours; personal colours for personal | Not in this file: visibility and colours are set at publishing by research-hub; the page template does not choose them |
| 8 | Cross-vendor review | Applies *(research-hub specific)*: sol and Astra reviews are gates in the checklist (sections 5 and 6); in other repos review the draft with a model from another vendor |
| 9 | Self-check before delivery | Applies: render check, phone and desktop screenshots (section 6) |
| 10 | Discussion phase edits only the draft | Applies: while discussing, change only the draft; do not run the full render / publish flow each time. The research-hub flow of section 3 in the Notion page is out of scope |
