# Choosing and drawing figures: Excalidraw sketches / UML blueprints

Karpathy's advice: "Instead of writing, ask your LLM to create a diagram." Every main point gets a figure. This file decides which kind of figure to draw and how to write it.

## Contents

1. Sketch vs blueprint
2. Question → figure
3. Rules for every figure
4. Excalidraw: spec, layout, patterns, traps
5. UML (Mermaid): how to write each kind, and the traps
6. Escape hatch: PlantUML / hand-written SVG

## 1. Sketch vs blueprint

| | **Sketch** (`excalidraw`) | **Blueprint** (`uml`) |
|---|---|---|
| Use | Build intuition and a mental model on first contact | Exact structure, protocol, lifecycle |
| What the reader does | Learns which parts exist | Implements, debugs, reviews from it |
| Look | Hand-drawn, loose, colour fills | Regular, standard notation |
| Simplification allowed | A lot: merge parts, leave out details, use analogies | Very little: every box and arrow must exist. When you simplify, say "simplified" in `read=` |

The default order is **sketch first, blueprint after**. For example: first a sketch of "with / without cache", then a prefill / decode sequence diagram.

Without Chrome / Node 22+ (`! Not baked`), and when the page must work offline, fall back to the zero-dependency `flow` (simple relations), `er` (data models) and `sequence` (messages over time).

## 2. Question → figure

Write the question first, then pick the row.

| The question is about… | Use |
|---|---|
| Which concepts depend on which (learning order) | `excalidraw` prerequisite map |
| Which parts exist and roughly how they connect | `excalidraw` concept map / napkin architecture |
| What changes between two designs or states | two `excalidraw` figures with the same layout, changing only the difference |
| Why it is slow or big, where the waste is | `excalidraw` cost figure: red = waste, green = saving |
| Which layers a call passes and where the time goes | `excalidraw` layer stack |
| Who calls whom, when, in what order | `uml` sequenceDiagram |
| Which types exist and how they relate | `uml` classDiagram |
| Which states an object goes through, and what triggers them | `uml` stateDiagram-v2 |
| The steps of an algorithm / workflow, with branches or parallel work | `uml` flowchart (activity) |
| Which deployable parts exist and what their interfaces are | `uml` flowchart + «component» subgraphs |
| Which data entities exist and their cardinalities | `uml` erDiagram, or `er` when the figure shows a schema change |
| The whole subject at a glance | the research page's `{sheet}` overview panels |
| Comparing exact numbers | table / `limits` |
| History, lineage | `timeline` |

When no row fits, the idea may need only text or a table. Not every paragraph needs a figure, but every main point does.

## 3. Rules for every figure

1. **One figure answers one question**, written in `q="…"`, in the words a newcomer would use.
2. **`takeaway=`**: the one sentence the reader must remember. **`read=`**: how to read it, for example what colours, dashed lines or arrows mean, or where to start. Write it only when needed.
3. **Size**: a sketch ≤ about 12 nodes, a sequence diagram ≤ about 8 lifelines, a class diagram ≤ about 8 classes. Beyond that, split the figure by question.
4. **One colour meaning for the whole page** (Excalidraw fills):

   | Colour | Meaning |
   |---|---|
   | gray + dashed | baseline knowledge / external system |
   | blue | the thing explained |
   | green | the subject / the conclusion / the recommended path |
   | red | waste / failure / a problem |
   | yellow | an assumption / a decision point |
   | violet | storage / state / memory |

5. **Write a verb or the data on an edge**: "reads K,V", "token ids", "maps to". When the relation is not obvious, do not draw a bare arrow.
6. **Use real names**: names in boxes are the page's terms and real identifiers, the same as in the text.
7. **The text refers to the figure** ("Fig 3 shows…") and says what follows from it, not what is in it.

## 4. Excalidraw

### 4.1 Spec quick reference (full syntax: `am help excalidraw`)

```jsonc
{
  "grid": {"w": 340, "h": 150},            // the col/row grid cell (default 340×150)
  "defaults": {"w": 180, "h": 70, "fontSize": 18},
  "scale": 1,                               // scale up the rendered width (max 1100px)
  "nodes": [{"id": "sched", "label": "Scheduler", "col": 1, "row": 0,
             "shape": "rectangle|ellipse|diamond", "color": "blue", "fill": "solid|hachure|cross-hatch",
             "stroke": "solid|dashed|dotted", "strokeWidth": 2, "w": 180, "h": 70, "dx": 0, "dy": 0}],
  "edges": [{"from": "a", "to": "b", "label": "token ids", "dashed": true, "dotted": false,
             "arrow": "end|both|none", "head": "arrow|triangle|dot|bar|diamond", "strokeColor": "red",
             "via": [[70, 190]]}],          // bend points (absolute pixels)
  "boxes": [{"label": "GPU host", "around": ["sched", "eng"], "pad": 30, "color": "gray"}],
  "texts": [{"x": 0, "y": 280, "text": "note", "fontSize": 16, "color": "gray"}],
  "raw": []                                 // element skeletons passed to Excalidraw as they are (lines and so on)
}
```

Write valid JSON in the draft, without comments. After drawing, a **↓ .excalidraw** button under the figure saves a file the reader can open on excalidraw.com and keep editing; arrow bindings are kept.

### 4.2 Layout

1. **Grid first, pixels later**: place nodes with col / row. A pipeline runs left to right; levels or learning order run top to bottom.
2. **Leave room for labels**: a horizontal edge with a label needs about label characters × 16 px (CJK) / 9 px (Latin) + 50 px. The default grid (340 wide, nodes 180) leaves 160 px. If that is not enough, make `grid.w` larger or the label shorter. When a label does not fit, the render reports it.
3. **Emphasise one place only**: only the node or edge `q` asks about gets the accent colour, or a thicker line (`strokeWidth: 3`).
4. **Names in nodes, not sentences**: 1–4 words, at most 2 lines. Notes go into `texts` or `read=`.

### 4.3 Patterns

- **Prerequisite map** (required in a research page's Background): label nodes with the card IDs (`B-1 …`), so the map and the cards point at each other.
- **With / without**: two specs with exactly the same layout; colour only the difference red (waste) or green (saving), and place them next to each other.
- **Pipeline with boundaries**: `boxes` with `around` frame a group of nodes as "GPU host", "Backend" and so on.
- **Layer stack**: one column of wide nodes (`defaults.w: 520`, `grid.h: 72`), with `texts` on the right such as "← 80% of the time is here" (red).
- **Mental model / analogy**: put the known thing (an OS page table) next to the new one, and join the matching parts with gray dashed edges. Say in `read=` where the analogy breaks.

### 4.4 Traps

| Symptom | Fix |
|---|---|
| The render reports "overlap" | change col / row, or make the grid larger |
| The render reports "needs about N px of space" | make `grid.w` larger, or the label shorter |
| An arrow joins the wrong side | add a `via` bend point, or move a node so the centres line up |
| The label of a `via` edge lands on a corner | the label sits at the middle point: move the middle point to where the label should go, or use `texts` |
| The figure is small | the scene is too wide: use more rows and fewer columns, or set `"scale": 1.2` |
| A line in `raw` becomes 100 long | give the line `points`, not `width: 0` |

## 5. UML (Mermaid)

Write Mermaid as it is inside a `uml` fence. `<<interface>>`, `<br/>` and `List~int~` need no escaping. Blueprints are regular by default; to match the sketch style for a simplified model, start with:

```
---
config:
  look: handDrawn
---
```

Sequence diagrams do not support the hand-drawn look.

**sequence** (the most useful kind in developer research):

```
sequenceDiagram
  autonumber
  participant C as Client
  participant S as Scheduler
  C->>S: enqueue(req)
  activate S
  alt KV blocks free
    S->>E: add_request(req)
  else no free blocks
    S-->>C: 429 retry-after
  end
  deactivate S
  Note over S,E: one scheduler step ≈ 1 decode step
  rect rgb(234, 241, 251)
    E->>E: decode loop
  end
```

- `autonumber`: lets the text say "step 4".
- Arrows: `->>` synchronous call, `-->>` return, `-)` asynchronous.
- Control flow: `alt / else`, `opt`, `loop`, `par / and`, `critical`. Use `rect` to highlight the part `q` asks about.
- Size: ≤ 8 participants, about 20 messages. Beyond that, split by phase.

**class**: relations `<|--` inheritance, `<|..` realization, `*--` composition, `o--` aggregation, `-->` association, `..>` dependency. Add multiplicities `"1"` / `"*"` and labels. Draw only the members the question needs; when you drop real members, say "simplified" in `read=`.

**state**:

```
stateDiagram-v2
  [*] --> Waiting
  Waiting --> Running : scheduled
  Running --> Preempted : out of KV blocks
  Preempted --> Waiting : blocks freed
  Running --> [*] : eos
  note right of Preempted : KV swapped or recomputed
```

Label every transition with its trigger.

**activity** (with flowchart):

```
flowchart TD
  start@{ shape: sm-circ, label: "start" } --> load[Load batch]
  load --> f1@{ shape: fork, label: "fork" }
  f1 --> a[Tokenize]
  f1 --> b[Fetch features]
  a --> j1@{ shape: fork, label: "join" }
  b --> j1
  j1 --> ok{valid?}
  ok -- "[yes]" --> train[Train step]
  ok -- "[no]" --> stop@{ shape: fr-circ, label: "end" }
```

Swimlanes are subgraphs, one per actor.

**component / deployment**:

```
flowchart LR
  subgraph gpu["«node» GPU host"]
    sched["«component»<br/>Scheduler"]
    kv[("«datastore»<br/>KV cache")]
  end
  gw["«component»<br/>API Gateway"] -- "HTTP /v1/generate" --> sched
  sched <--> kv
```

Write the interface name on an edge (protocol, endpoint, function). Do not use `C4*`; it is an error.

**ER**: `||` exactly one, `|o` zero or one, `}|` one or more, `}o` zero or more.

**Common traps:**

| Symptom | Fix |
|---|---|
| An error on a label with `()` `:` `"` `#` | quote the label: `A["call f(x): int"]` |
| A flowchart breaks at a node named `end` | rename it, or write `End` |
| Generics disappear | write `List~int~` |
| Sequence text is cut off | the message is too long: shorten it and move details to a `Note` or `read=` |
| Baking reports `Parse error on line N` | the line is already mapped to the draft line: fix that line |

## 6. Escape hatch

When you really need strict UML notation (deployment, use case, timing constraints), make an SVG with PlantUML:
- Locally: `plantuml -tsvg x.puml`.
- A remote server sends the source to a third party: ask the user first when the research is private.

Then put the SVG in an ```` ```svg ```` fence. Remove the fixed width / height on the SVG and keep the viewBox.
