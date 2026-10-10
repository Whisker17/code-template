# Writing: STE-80 and controlled Chinese (rules for research pages)

Section 6 of SKILL.md holds the rules for every page; `am lint` checks the parts a machine can check. This file adds what research pages need.

ASD-STE100 (Simplified Technical English) is a controlled language designed for aircraft maintenance manuals. Karpathy asks the LLM to write in it, or to "80% STE". This file defines that 80% for developer research writing. It is a working summary, not the official specification; the specification (with a dictionary of about 900 words) is free at <https://www.asd-ste100.org>.

## 1. Hard rules (always)

| # | Rule | Checked automatically |
|---|---|---|
| H1 | One sentence, one thing. Break the sentence at "and", "as well as", ", while" | sentence length |
| H2 | One word, one meaning; one meaning, one word. Once you pick a term, use it on the whole page; do not switch between worker / node / instance | — |
| H3 | Instructions use the active voice and the imperative: "Run `make test`." | English passive |
| H4 | Key information first. The first sentence of a paragraph gives the conclusion | — |
| H5 | The condition comes before the command: "If the build fails, delete `node_modules`." | — |
| H6 | One step does one thing (except actions that happen together) | step length |
| H7 | Noun clusters have at most 3 words. "GPU memory bandwidth bottleneck analysis" becomes "analyse the GPU memory bandwidth bottleneck" | chained `的` in Chinese |
| H8 | 3 or more parallel items go in a list | paragraph length |
| H9 | One topic per paragraph, at most 6 sentences (5 in Chinese) | paragraph length |
| H10 | Clear references: "this / its / that" is followed by a noun: write "this cache", not a bare "this" | — |
| H11 | Numbers instead of adjectives: "3.2× faster at p50", not "much faster" | cliché / empty-word lists |

## 2. Soft rules (the 80%: break them only for a reason)

| STE rule | STE-80 |
|---|---|
| Steps ≤ 20 words, descriptions ≤ 25 words | Same target. Chinese: steps ≤ 35 characters, descriptions ≤ 45 characters. At most 10% of sentences go over |
| Only dictionary words | Use common, concrete words; avoid the empty-word list |
| No -ing forms | Allowed in descriptions when clearest (caching, streaming) |
| Little passive in descriptions | Allowed when the actor is unknown or does not matter: "The file is written on exit." |
| No perfect tenses | Allowed for "results so far": "We have not reproduced F3." |
| No semicolons | Keep: split into two sentences |

## 3. The technical-name exemption (developer version)

STE allows **technical names** and **technical verbs** outside the dictionary. In developer documents they are:

- **Technical names**: code identifiers, APIs, CLI flags, file paths, product names, domain terms. Put identifiers in backticks; the lint skips them.
- **Technical verbs**: deploy, rebase, serialize, shard, cache, tokenize, quantize and so on.

Rule: a technical name or verb that is not in the reader baseline must have a glossary entry or a prereq card. Write its first use in the text as `[[term]]`.

## 4. Safety notices in developer terms

An STE safety notice gives the command first, then the risk. This table maps the STE categories to developer risks and callouts:

| Write | STE meaning | Developer meaning | Example |
|---|---|---|---|
| `callout err WARNING` | risk of injury or death | data loss, a security hole, wrong results in production | "Do not run this migration on the primary. It locks `orders` for about 40 minutes." |
| `callout warn CAUTION` | risk of damage to equipment | lost time, slower performance, unstable results, higher cost | "Pin the CUDA version. Other versions have different kernel timings." |
| `callout info` | a note, not an instruction | useful background | no instructions in a callout info |

## 5. Rewrite examples

Chinese, a description (before, then after):

```text
~~通过对调度策略进行相关优化，在一定程度上实现了显存利用率的提升，从而打通了长上下文场景下的性能瓶颈。~~

我们修改了调度策略：按块分配显存，不再按序列预留。显存利用率从 38% 升到 91%。因此，长上下文请求不再因显存不足被拒绝。
```

English, steps:

> ~~Before commencing the benchmark, you should ensure the GPU clocks have been locked, and also the warmup should be run.~~
>
> 1. Lock the GPU clocks: `nvidia-smi -lgc 1410`.
> 2. Run the warmup: `make warmup`.
> 3. Start the benchmark.

(Wrap a counter-example in `~~strikethrough~~`; the lint skips it.)

## 6. Self-check (before the render)

1. Read only the first sentence of each paragraph. Do those sentences alone tell the whole story? If not, move the key sentence to the start (H4).
2. List every technical word on the page. Is each one in the baseline, on a card, or in the glossary?
3. Find two names for the same thing (H2), for example "request / call / query".
4. Read every `takeaway=`: does it say something the figure itself does not say directly?
5. After the render, fix the longest sentences first. They are the easiest to misread.
