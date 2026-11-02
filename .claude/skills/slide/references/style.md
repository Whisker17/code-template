# Slide style

English version of the Notion page "slide 风格" (snapshot 2026-11-02). Read it fully before you build a deck. Goal: a first version that is 80–90% of the way to the two reference decks.

**Sync rule:** the repo copy is for agents, Notion is for humans. When one changes, update the other and add a CHANGELOG bullet.

**Theme choice:** work decks (Mantle) always use the **Mantle theme**; colours and fonts do not change. Personal, non-work decks use the **Personal theme** (from the HF deck). Layout, components and motion are shared.

**Fastest path:** copy `assets/deck-template.html` and replace the content. It already implements every general rule on this page (paging, entrance, two-step pages, export, overflow check, language toggle, notes panel).

## 0. Twelve hard rules

1. **One HTML file.** A fixed 1920×1080 stage scaled to the window (`transform: scale`). No framework, no build.
2. **Dark background and one neon accent.** The accent goes only to the one or two most important words or numbers per slide. Never fill large areas with it.
3. **Four parts per slide:** eyebrow (`PART N · SECTION`, uppercase, accent) → h1 (**a one-sentence conclusion**, not a topic) → sub (one sentence on what to look at) → content → bottom takeaway (4px left bar + one conclusion, keyword highlighted).
4. **Content is split left and right by default.** Left: the figure (hand-drawn Excalidraw SVG, screenshot or bar chart). Right: a 470px card column (number cards, point cards).
5. **Every number has a comparison:** `$99M vs $159M`, `13 → 54`, `25× more`. A single number means nothing.
6. **Figures are hand-drawn Excalidraw,** generated from a JS skeleton (one SVG per language) with colours from the same tokens. No default-palette chart libraries.
7. **Screenshots are evidence.** Put tweets, dashboards and report screenshots on the slide with a 1px border and 8px radius. Overlay an accent highlight box when needed.
8. **Every slide has an automatic entrance:** eyebrow slides in from the left → title rises → content items rise one by one (90ms apart) → takeaway last. The whole entrance finishes within 1.2s.
9. **Page turns have direction.** Forward: the new slide slides in from 120px right and fades in (340ms); backward is the reverse. A 4px progress bar at the top follows.
10. **Too much information: split into two steps, do not pile up.** → first enters step two (cards shrink to top chips, new content rises from below); the next → turns the page.
11. **For the speaker:** every slide has hidden notes (N key) in two parts, "notes" and "basis" (data source, time window, what must not be said). L toggles Chinese / English.
12. **Export does not distort.** `?export=1` turns off all animation, duplicates each two-step slide as its second step, and prints to 1920×1080 PDF. `?dev=1` outlines overflowing slides in red and shows by how many pixels.

## 1. Reference decks

- **A · Mantle company talk** (own deck, work sample): "Mantle has the assets. Now it needs the traders." Dark green, neon green accent, analyst-report density, hand-drawn figures, hover-driven interaction, bilingual, full notes and basis. Local file: `~/Work/research/work/mantlev3-roadmap/company-share/slides/deck.html` (figures in `diagrams/`, screenshots in `assets/`, PNG export in `png/en|zh/`).
- **B · Train the agent, not just the model** (HF, Sergio Paniego): React + framer-motion, 1280×720 stage. Near-black blue with a grid, emerald + lavender accents, all monospace, automatic entrance per slide, sliding page turns, top progress bar, code windows, big-number result slides.

## 2. What the merged style takes from each

| Dimension | A · Mantle | B · HF | Merged rule |
| --- | --- | --- | --- |
| Stage | 1920×1080, CSS scale | 1280×720, scale | **1920×1080** (HF values ×1.5) |
| Background | flat ink green #040F0B + green radial glow bottom right | near-black blue #07090f + 40px grid (centre visible, edges fade) + vignette | theme background + **60px grid (edges fade) + bottom-right glow**, stacked |
| Font | sans Grotesk (Monument / Inter), PingFang for Chinese; title weight 500 | all monospace (SF Mono / JetBrains Mono); title weight 800, negative tracking | Mantle keeps sans; code, addresses and tickers use monospace. Personal is all monospace |
| Colours | one neon green #00FF93 + one structure green #06B680 | emerald #10f0a4 + lavender #b06bff, one per concept class | each theme: one **accent** (keywords, kicker) + one **structure** colour (bars, borders, progress bar, arrows) |
| Density | high: left figure, right cards, bottom conclusion | medium: one concept per slide, much white space | structure from A; **more than 3 groups of information: split into a two-step slide or two slides** |
| Figures | Excalidraw hand-drawn SVG, two languages | HTML cards + arrow characters | relation and flow figures: Excalidraw; simple "A → B → C": HTML cards + `→` |
| Evidence | screenshot + highlight box; basis in the notes | footer line `Source: link` | screenshots as in A; **add a Source line at bottom left**; full basis stays in the notes |
| Entrance | almost none | automatic: kicker → title → items → summary | **take B**, in CSS, off at export |
| Page turn | hard cut | direction-aware slide + fade, 0.34s | **take B** |
| In-slide interaction | rich: two-step, hover thumbnail swap, hover focus zoom, hover column select, hover pop screenshot, FLIP zoom | almost none | **keep A**, where the speaker needs to control pace |
| Navigation | notes panel, HUD, language toggle, URL hash | progress bar, thumbnail drawer, light theme, PDF/PPTX export, overflow check | all of A + B's **progress bar** and **overflow check** (the rest optional) |
| Special slide types | comparison table, matrix, timeline, references | code window, big-number result, decision table (Recap), Go deeper links | both sets go into section 5 |

## 3. Theme tokens

### 3.1 Mantle theme (required for work decks)

| token | value | use |
| --- | --- | --- |
| `--bg` | `#040F0B` | page background (ink green, near black) |
| `--bg2` | `#0D100F` | card and figure-node fill |
| `--text` | `#FFFFFF` | body, titles |
| `--muted` | `#B8C6BE` | sub, card captions, explanatory text |
| `--accent` | `#00FF93` | **neon green**: eyebrow, keywords in titles and conclusions, our data (Mantle in a bar chart) |
| `--struct` | `#06B680` | **structure green**: card left bar, takeaway bar, arrows, progress bar, "in progress" border |
| `--line` | `#1E2925` | dividers, card border, grid lines (`#3A4A42` inside Excalidraw) |
| `--tag` | `#7F8F86` | page number, figure caption, source, weakest text |
| `--soft` | `#BAFFF5` | links, "partial" status |
| `--bar` | `#2C3B34` | competitor data in bar charts, progress bar track |
| `--focus` / `--deep` / `--pop` | `#0B2519` / `#07160F` / `#06120D` | selected-card background / secondary highlight background / popup and code window background |
| glow | `rgba(6,182,128,.18)` | 900px radial glow at bottom right |

Font: `"ABC Monument Grotesk", Inter, "Helvetica Neue", Arial`; Chinese `PingFang SC, Noto Sans SC`; global `font-feature-settings: "tnum"` (tabular numbers, aligned tables).

### 3.2 Personal theme (non-work decks)

| token | value | use |
| --- | --- | --- |
| `--bg` / `--bg2` | `#07090F` / `#0E1422` | background / card |
| `--text` / `--muted` / `--tag` | `#F8FAFD` / `#D0D8E6` / `#97A1B5` | three text levels |
| `--accent` | `#10F0A4` emerald | kicker, key numbers, positive results |
| `--struct` | `#B06BFF` lavender | structure lines, progress bar, takeaway bar, "second class" concept |
| `--line` | `#283149` | borders, grid |
| `--neg` | `#FF5470` | negative (failure, decrease) |

Font: all monospace `ui-monospace, "SF Mono", "JetBrains Mono", Menlo`, title weight 800.

### 3.3 Colour rules (both themes)

- At most **2 places** per slide use the neon accent: usually one word in the title plus one word in the takeaway, or one key number.
- "Ours / current / new" = accent. "Competitor / past / baseline" = `--bar` or `--muted`. In a bar chart only our bar is bright.
- Fixed status legend: **white solid line = exists**, **structure-colour solid line = in progress**, **accent dashed line = missing / to do**.
- Glow only on the cover keyword and the big-number result: `text-shadow: 0 0 33px` accent at 35% opacity. No glow elsewhere.
- Screenshots keep their original colours. No filters.

## 4. Type sizes (1920×1080)

| Element | Size / style |
| --- | --- |
| Slide padding | top 72 · left and right 100 · bottom 64 (96 when a Source line exists) |
| eyebrow | 28px · 500 · uppercase · tracking .12em (Chinese .08em) · accent |
| h1 | 60px · 500 (Personal 800) · line height 1.1 · tracking -.01em · top margin 18px |
| cover h1 | 96px · line height 1.08 · max width 1500px |
| sub | 32px · line height 1.3 · muted · top margin 12px |
| takeaway (`.big`) | 40px · line height 1.25 · 4px structure bar on the left · 24px left padding · pinned to the bottom |
| right-column title (`.panel .h`) | 24px · uppercase · tracking .12em · muted · 1px bottom border |
| card caption (`.k`) | 22px · uppercase · tracking .08em · muted; a structure-colour value may sit on the right |
| card body (`.v`) | 29px · line height 1.25 (21–25px when dense) |
| card number (`.num`) | 52px · 500; `vs` and units 26px muted |
| note (`.cap`) | 24px · muted |
| table | 23px; header 21px uppercase muted; first column 21px uppercase muted |
| big-number result | 165px · 700 · tracking -.04em |
| code | 26px monospace · line height 1.55 |
| page number / Source | 22px / 18px · tag colour |
| minimum size | **not below 16px** (captions, sources); body text not below 21px |

## 5. Slide types (pick one, do not invent layouts)

| Type | Layout | From |
| --- | --- | --- |
| **Cover** | vertically centred, left aligned; eyebrow → 96px title (two lines, keyword highlighted + glow) → 44px sub; one contents line at bottom left (`A · B · C`); a 6px vertical gradient line 120px from the right (bg → structure → accent → bg) | A |
| **Standard** | four parts; `.content` grid `1fr 470px`; figure left, 3–4 cards right; takeaway at the bottom | A |
| **Two-step** | ① show the phenomenon (3 big cards or one figure); ② cards shrink to 60px chips at the top, explanation / evidence rises below; sub and takeaway cross-fade between steps; ①② pills at top right switch on hover | A |
| **Evidence** | big screenshot left (highlight box on the key row), 3 number cards right comparing our data | A |
| **Comparison table** | first column uppercase muted label; "old" column muted, "new" column header in accent; 1px row dividers | A |
| **Mapping table** | three columns: left card (them) → structure-colour arrow → right card (ours, with a page tag such as `P14`) → one-line note | A |
| **Timeline** | Excalidraw horizontal axis, two rows of event cards (two kinds of actors); cards related to us get an accent border | A |
| **Competitor / multi-column switch** | multi-column figure left; the hovered column's focus events show in the right column; stays put after hover ends | A |
| **Big-number result** | all centred; one grey uppercase wide-tracked context line → `42% → 54%` (first muted, second accent + glow) → one explanation line → two secondary metrics → one conclusion | B |
| **Concept + implementation pair** | one concept slide (diagram + 3 point columns below, 1px line on top of each), then an "X in tool" code-window slide | B |
| **Code** | code window: top bar with red / yellow / green dots + file name + uppercase language on the right; VS Code Dark+ colours; a row of doc links at the bottom | B |
| **Decision table (Recap)** | two columns: "your situation" → "use this" (accent bold), row dividers, then a "they can be combined" paragraph | B |
| **References / Go deeper** | A: big screenshot + title + link; B: 4-column link list (uppercase accent headers) + QR code | A + B |

## 6. Components

- **Card `.card`:** `--bg2` fill, 1px `--line` border, **4px structure-colour left bar**, 8px radius, 16/22 padding. Variants: `plain` (grey bar, neutral data), `acc` (accent bar, conclusion card), `dash` (dashed bar, "missing / to do"), `focus` (`--focus` fill + structure border, currently selected).
- **Inside a card:** `.k` caption (label left, extra value right) → `.num` big number (`$99M <small>vs</small> $159M`) or `.v` one sentence → `.cap` explanation.
- **Ratio bar:** 12px high segmented bar (our part in structure colour); below it one line with amount and share at both ends.
- **Bar chart (HTML):** three-column grid "label / bar / value"; bar 38px high, 3px radius; ours in accent, the rest `--bar`.
- **Takeaway `.big`:** at most one per slide, pinned to the bottom.
- **Banner / Blocker:** `--focus`-family dark green fill + 6px structure left bar + uppercase label on the left (such as "why it cannot ship yet") + one sentence on the right.
- **Pill `.pill` / step switch:** 999px radius, 1px border; selected: structure border + `--focus` fill.
- **Screenshot `.fig`:** 1px border + 8px radius; a `.chip` line above (small uppercase source note); highlight box on key spots: `border: 2px solid <structure>; box-shadow: 0 0 0 5px rgba(6,182,128,.16)`, positioned in percent.
- **Popup screenshot `.pop`:** `--pop` fill, 1px structure border, 14px radius, `box-shadow: 0 24px 70px rgba(0,0,0,.65)`, 18px caption below.
- **Code window `.code`:** `--pop` fill, 14px radius, `box-shadow: 0 18px 60px rgba(0,0,0,.4)`; keyword `#c586c0`, function `#dcdcaa`, string `#ce9178`, comment `#6a9955`, type `#4ec9b0`, number `#b5cea8`, text `#d4d4d4`.
- **Source line:** bottom left, 18px, `Source: ` + underlined link (accent on hover).
- **Page number:** bottom right, two digits (`01`), hidden on the cover.

## 7. Figures: Excalidraw hand-drawn SVG

Each figure is one `pXX-name.mjs` that exports an array of Excalidraw skeleton elements. `render.mjs` loads the official `@excalidraw/excalidraw@0.18.0` in headless Chrome, converts the skeleton, and renders it twice: `pXX-name.svg` and `pXX-name.zh.svg`. In HTML write `<img data-d="pXX-name">`; the language switch swaps in the matching SVG.

Rules:

- `roughness: 1` (slight hand-drawn feel), `fontFamily: 2` (Helvetica; Chinese falls back to the system font), 2px stroke; transparent SVG background, export padding 16.
- Nodes: `#0D100F` fill + muted stroke. **Main node:** white 3px stroke. **Core concept:** accent ellipse, 4px stroke, 34px text.
- Lines and arrows: structure colour, 2.5px; secondary lines `#3A4A42`.
- Two text levels in a node: title 24–28px white, subtitle 20–22px muted.
- "Missing / to do" nodes: accent dashed border, accent text.
- Canvas width follows the area the slide gives the figure (left column about 1250px, full slide about 1720px), so text is not too small after scaling.

`assets/lib.mjs` holds the shared colours and drawing helpers; `assets/examples/p01-example.mjs` shows one figure. See `SKILL.md` for the `render.mjs` prerequisites.

## 8. Motion system

### 8.1 Principles

- **Only entrance and page turns are automatic.** All other interaction is triggered by the speaker (→ key or hover), so the speaker controls pace.
- **Motion must mean something:** a position change means "this block recedes / this block comes forward"; a cross-fade means "the content at this position changed".
- Durations: micro-interactions 0.2–0.3s, layout changes 0.4–0.65s, whole-slide entrance within 1.2s. No bounce, no rotation, no scale above 4%.
- On export (`html.export`) all animations and transitions are off and every slide rests in its final state.

### 8.2 Easing and duration tokens

| name | value | use |
| --- | --- | --- |
| `--rise` | `cubic-bezier(.2,.7,.2,1)` | elements rising in, FLIP zoom (approximates framer spring damping 22) |
| `--ease` | `cubic-bezier(.4,0,.2,1)` | card move and scale, collapse |
| `--page` | `cubic-bezier(.22,.61,.36,1)` | page turn |
| entrance | rise 18px, 0.6s; eyebrow from the left 20px, 0.5s | every slide, automatic |
| page turn | enter 340ms (x ±120px + fade); leave 220ms | every page turn |
| bar chart | width 0 → target, 0.5s, 60ms between bars | slides with `.bars` |
| progress bar | width transition 0.5s `--rise` | every page turn |

### 8.3 Automatic entrance (from B)

Order: eyebrow 50ms → h1 120ms → sub 200ms → content items (`[data-in]` or children of `[data-stagger]`) from 300ms, +90ms each → `.big` another +250ms after the last item.

Implementation notes:

- Each time a slide is shown, remove `.play`, force a reflow (`void s.offsetWidth`), then add it back, so the entrance replays when you return.
- Use only `animation-fill-mode: backwards`. `both` keeps holding `transform` after the animation ends and breaks the `.rise` transition on two-step slides.
- Add `data-in` to elements that enter; add `data-stagger` to the parent of a group that enters one by one. Elements without it do not move. Static decoration (bars, glow) must not move.

### 8.4 Page turn (from B)

Forward: the old slide leaves 120px to the left with a fade (220ms), the new slide enters from 120px right with a fade (340ms); backward is the reverse. A 4px structure-colour progress bar with a same-colour glow at the top; width = current slide / (slide count - 1).

### 8.5 In-slide interaction (from A, use as needed)

| Interaction | When | Spec |
| --- | --- | --- |
| **Two-step** `.stp[data-st=a\|b]` | a slide that tells "phenomenon → cause" in two layers | → switches to b first, the next → turns the page; ← likewise. Step b: card `top/left/width/height` shrink to a 60px top chip over 0.65s `--ease`; the card's content fades out in 0.3s, chip text fades in with a 0.45s delay; new content goes `translateY(26px)` → 0 in 0.55s `--rise`, starting at 0.35s, +0.09s each; sub and takeaway sit in the same grid cell and cross-fade (0.35s). The ①② pills at top right also switch on hover |
| **Thumbnail swap** `.swp` | two figures at one position (architecture / example) | a 300px thumbnail at top right (structure border, 10px radius); one hover swaps the main figure, which fades in over 0.3s; stays swapped, no revert |
| **Hover focus zoom** | two screenshots, each with its own notes | the hovered one grows into the main left area, its note card becomes `focus` with larger text, the other cards drop to opacity .62; every position is absolute with `left/top/width` transitions of 0.4s ease; lock for 450ms after a switch (debounce); Esc or click restores the overview |
| **Hover column select** | one multi-column comparison figure (competitors, options) | transparent hot zones over each column; on hover the column gets `rgba(<structure>,.08)` fill + 2px structure border and the right column shows that column's content (0.3s fade-in); no revert on leave |
| **Hover popup screenshot** `.pop` | a point needs evidence but is not worth the space | the hot zone gets a zoom-in cursor + light green fill on hover; the popup fades in over 0.2s with `pointer-events: none` |
| **FLIP focus expand** | three-column options, each backed by a detailed figure | after a 220ms hover (against accidental triggers): the column's cropped figure block FLIPs from its place to the left column (translate + scale → none, 560ms `--rise`); the note text rises after 260ms; the big figure on the right slides in from `translateX(90px) scale(.96)` (520ms, 140ms delay). Moving the mouse to the title area reverses it (440ms) |
| **In-figure tab switch** | one big figure with two versions | small tabs (with thumbnails) switch; the two figures are stacked and cross-fade over 0.4s |

Core code of the FLIP focus expand (the other interactions are fully specified by the table; the reference implementation is deck A's `deck.html`):

```javascript
// crop area on the original figure -> crop block in the expanded left column: compute the translate + scale that puts the block back in place
const fxFlip=(s,crop)=>{const sr=s.querySelector('.fxn img[data-d]').getBoundingClientRect(),cr=crop.getBoundingClientRect(),
  ir=crop.querySelector('img').getBoundingClientRect(),z=s.getBoundingClientRect().width/s.offsetWidth,k=sr.width/ir.width;
  return `translate(${(sr.left-cr.left-(ir.left-cr.left)*k)/z}px,${(sr.top-cr.top-(ir.top-cr.top)*k)/z}px) scale(${k})`;};
const fxParts=s=>{const col=s.querySelector('.fxv .fl .on');return {col,crop:col.querySelector('.crop'),rest:[...col.children].slice(1),fig:s.querySelector('.fxv .fr .on')};};
window.fxOn=el=>{const s=el.closest('.slide'),k=el.dataset.fk;if(s.dataset.fx||s._closing)return;
  s.dataset.fx=k;s.querySelectorAll('.fxv [data-k]').forEach(n=>n.classList.toggle('on',n.dataset.k===k));
  const {crop,rest,fig}=fxParts(s),E='cubic-bezier(.2,.7,.2,1)';
  s._an=[crop.animate([{transform:fxFlip(s,crop)},{transform:'none'}],{duration:560,easing:E}),
    ...rest.map(n=>n.animate([{opacity:0,transform:'translateY(18px)'},{opacity:1,transform:'none'}],{duration:400,delay:260,easing:'ease-out',fill:'backwards'})),
    fig.animate([{opacity:0,transform:'translateX(90px) scale(.96)'},{opacity:1,transform:'none'}],{duration:520,delay:140,easing:E,fill:'backwards'})];};
// the hover triggers only after 220ms; when the mouse leaves the expanded area and the hot zone, fxOff plays it back for 440ms
window.fxHover=el=>{clearTimeout(el._t);el._t=setTimeout(()=>fxOn(el),220);};
```

## 9. Engineering and speaker conventions

- **Keys:** → / Space / PageDown forward (a two-step slide steps first), ← / PageUp back, Home / End, N notes, L language, F fullscreen; a touch swipe over 45px turns the page. URL `#n` remembers the current slide.
- **Bilingual:** English is written in the element, Chinese in the `data-zh` attribute (may contain HTML); the L key or the top-right button toggles; the choice is stored in localStorage; an image with `data-d` swaps to its `.zh.svg`. In Chinese the eyebrow tracking drops to .08em.
- **Notes:** each slide has one hidden `.notes` with a fixed shape: `<h3>Notes · about N min</h3>` + a sentence-by-sentence list (including "(action: what happens when you hover where)") → `<h3>Basis</h3>` (data source, time window, method, what must not be said publicly). The starter template writes these headings in Chinese (`讲稿`, `口径`).
- **Export:** `deck.html?export=1&lang=en` printed to PDF in Chrome (`@page 1920px 1080px`), or screenshot slide by slide to PNG; each two-step slide is duplicated as its second step; export one PDF per language.
- **Self-check:** open `?dev=1` and page through; any slide whose content exceeds 1920×1080 is outlined in red and marked at the top with `→Npx ↓Npx`.
- **Asset folders:** `assets/` (screenshots), `diagrams/` (mjs + svg + excalidraw), `png/en|zh/` (export).

## 10. Starter template

`assets/deck-template.html` is the starter, verbatim from the Notion page §10. Verified in Chrome: paging, entrance, two-step, language toggle, `?export=1` PDF (5 slides + 1 two-step duplicate = 6 pages) and `?dev=1` overflow check. Change `<html data-theme="mantle">` to `personal` for the Personal theme. The five example slides are: cover, standard, two-step, big-number result, code. The template's comments and sample notes are in Chinese, as in the source.

## 11. Copy style

- **The title is a conclusion:** "The money is here, the traders are not." not "Mantle today".
- **The sub says one thing:** where to look on this slide, or one line of cause.
- **The takeaway can be quoted alone,** keyword highlighted; a two-step slide has one per step.
- **Card captions are noun phrases, uppercase;** card body is one sentence, no full stop needed.
- **Numbers carry units and a comparison:** `$4.6M`, `1.4 bps vs 3.5 bps`, `X Layer has 25× more`.
- The English and Chinese versions say the same thing; Chinese is not word-for-word. In Chinese, do not add punctuation around English proper nouns beyond the spacing already used.
- An uncertain number does not go on the slide. Put it in the notes' "basis" with source and date.

## 12. Production flow and delivery checklist

1. Write the outline: one conclusion sentence per slide + an evidence list (data, screenshots, figures). Split any slide with more than 3 groups of information into a two-step slide.
2. Pick a slide type (section 5), copy the template, fill in content; draw figure skeleton mjs first, render the two-language SVGs.
3. Write notes and basis for every slide.
4. Self-check:
   - [ ] `?dev=1`: no slide is outlined in red
   - [ ] at most 2 accent spots per slide; ours / theirs colours are consistent
   - [ ] no overflow after the language switch (Chinese is usually shorter; English overflows more easily)
   - [ ] paging, two-step slides and hover interactions work on the speaker's computer; leaving a hover does not make things jump
   - [ ] `?export=1` PDFs exist, one per language, and each two-step slide's second step is in them
   - [ ] work decks use the Mantle theme
