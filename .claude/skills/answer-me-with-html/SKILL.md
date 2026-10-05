---
name: answer-me-with-html
description: 遇到复杂解释或研究结果输出时，把回答做成一页可视化 HTML：模型只写扩展 Markdown 内容稿，skill 自带的 CLI 负责模板、组件、Excalidraw 草图 / UML 蓝图烘焙、SVG 自动布局和 STE 受控写作检查，产出零依赖单文件页面。研究、调研、论文 / 代码库深挖、实验结果要“写成 explainer / 分享给团队 / 给新人 onboarding”时，用 research 模式（背景、前置知识卡片、发现、术语表、阅读路径）。当回答涉及以下任一情况时主动使用，不必等用户要求：≥3 个相互关联的概念；带分支或多参与者的流程 / 协议 / 架构；≥3 个维度的对比或取舍；层级结构；演进历史；用户说"讲讲原理 / 没看懂 / 画个图 / 解释一下这个代码库 / 用 HTML 讲 / 研究结果输出 / 写成 explainer / explain visually"。用户说 `/answer-me-with-html config` 或想改设置时也用本 skill。不要用于：短问答（<200 字能说清）、要立即复制执行的命令、纯代码修改、用户明确要求纯文本时。
---

# Answer me with HTML：用一页 HTML 回答复杂问题

你只写**内容稿**（扩展 Markdown）。排版、配色、暗黑模式、图形坐标、Excalidraw / UML 的渲染与烘焙全部由 `am` CLI 完成。**不要手写 HTML / CSS / SVG。**

方法来自 Karpathy 的"理解 LLM 输出"阶梯：受控写作（STE）→ 图 → HTML。本 skill 三级同时用上：文字过 STE 检查，结构交给图，页面负责排版和交互。来历与每条规则的出处见 [references/method.md](references/method.md)。

> 本目录是上游 [QingYunA/answer-me-with-html](https://github.com/QingYunA/answer-me-with-html) 的项目级 fork。新增了 `excalidraw` / `uml` 图、`research` 模板、`prereq` / `finding` / `glossary` 组件、`am bake` / `am shot`。源码在 `dev/`，改完运行 `cd dev && npm run build`。

## 0. 用户要改配置时

本次调用参数：`$ARGUMENTS`

参数以 `config` 开头时（如 `/answer-me-with-html config open off`），这一轮只处理配置，不出页面：

- `config`：运行 `am config` 显示当前配置，然后问用户想改哪一项。
- `config <键> <值>`：运行 `am config set <键> <值>`。
- `config reset [键]`：运行 `am config reset [键]`。

用户用自然语言提出时（"别再自动弹浏览器了""默认用卡片主题""不要烘焙"），同样换算成 `am config set`。可配置项：`open`、`always`、`theme`、`mode`、`style`、`bake`，运行 `am config` 可看全部说明。

## 1. 判断：要不要出页面、用哪种模式

满足任一条就出页面：
- 有 ≥3 个相互关联的概念，读者需要看到它们的关系。
- 有流程、协议、调用链、状态迁移（尤其带分支或多个参与者）。
- 有 ≥3 个维度的对比、方案取舍、"能 / 不能"清单。
- 有层级结构或时间演进。

不满足就用普通文字回答。拿不准时，问题越"要看图才懂"，越该出页面。

**选模式：**

| 情况 | 模式 | 怎么做 |
|---|---|---|
| 回答一个问题、讲清一个概念 | 解释页（`sheet` / `doc`） | 按本文第 2–5 节，一次渲染 |
| 研究 / 调研 / 实验 / 论文或代码库深挖的**结果输出与分享**，读者是要上手的开发者 | **研究页（`research`）** | **先读 [references/research.md](references/research.md)**，按其中的步骤做 |

### 高频模式

如果上下文里出现 `[answer-me-with-html always-on]` 提醒，门槛放低：

- 只要这一轮给出了结论、总结、方案、对比、评审或讲解，就附一页。
- 日常结论用 2～4 个面板的小页面：一个 callout 放结论，再配一张表或一张图。
- 渲染时加 `--no-open`；终端里照常先给文字结论，最后一行附页面路径。
- 闲聊、没有结论的一两句话、纯命令输出、用户要求纯文本时不出页面。

## 2. 工作流

CLI 打包在本 skill 目录里：`scripts/am.mjs`，单文件、无需安装依赖，只要有 Node.js 20+（烘焙图形需要 Node 22+ 和本机 Chrome）。下文的 `am` 都指：

```bash
node "${CLAUDE_SKILL_DIR}/scripts/am.mjs"
```

在 Claude Code 里，上面的路径会自动替换成本 skill 的目录。没有替换时（其他 Agent），用项目里的相对路径 `.claude/skills/answer-me-with-html/scripts/am.mjs`。

1. 先在心里列出 3～8 个面板。每个面板只回答一个子问题。
2. 按信息形状选组件（见第 4 节）。
3. 用 heredoc 一次性渲染（研究页把稿件存成 `.md` 文件再渲染，见 research.md）：

````bash
node "${CLAUDE_SKILL_DIR}/scripts/am.mjs" render - <<'AM_EOF'
---
title: 标题
---
## A 面板标题
```uml q="这张图回答什么问题？"
sequenceDiagram
  A->>B: 请求
```
AM_EOF
````

4. 读输出：
   - `✓ <路径>`：成功。是否自动打开浏览器由用户配置决定；加 `--no-open` 只影响这一次。
   - `✗ L<行号> [组件] …` + 正确示例：照示例改那一行，再渲染一次。
   - `烘焙 ✓ n 张图`：excalidraw / uml 已烘焙进页面，离线可看。
   - `✗ L<行号> [uml|excalidraw] fig-N: …`：图在浏览器里渲染失败（如 Mermaid 语法错），按行号改稿件再渲染。
   - `! 未烘焙：…`：缺 Chrome / Node 22+ 或网络。页面联网仍可看；告诉用户原因，或改用 `flow` / `sequence`。
   - `STE n 条警告`：按建议改写对应行，再渲染一次。最多重试 2 轮，仍有警告就保留页面并说明。
5. 页面含 excalidraw / uml 图时，运行 `am shot <页面.html>`（截图写到系统临时目录，路径会打印出来），**逐张查看**每个 `fig-N.png`：有没有重叠、截断、文字过小、空图。有问题就改稿件重渲染。页面要在手机上看时加 `--width 390`。
6. 在终端只回 2～3 行：一句核心结论 + 页面路径。不要把稿件或 HTML 贴回终端。

## 3. 稿件格式速查

```markdown
---
template: sheet     # sheet 图纸板（默认）| doc 线性讲解 | research 研究页（总览 + 正文 + 阅读路径）
theme: blueprint    # blueprint 图纸风（默认）| shadcn 卡片风
title: 标题
subtitle: 一句话说明     # 可选
cols: 3             # sheet / research 总览的列数，默认 3；面板用 span / rows 跨列跨行
source: RFC 9293    # 其他任意键显示在页头元信息行
---
导语：一两句核心结论（可选）。

## A 面板标题 {span=2 meta="右上角小字"}
普通 Markdown：段落、列表、表格、引用。
表格状态词：ok / no / warn（可带文字："ok 已批准"）→ ✓ / ✗ / ! 徽章。
正文里 [[术语]] 链接到 glossary 条目（悬停看定义）。

## B {bare}            ← bare：无标题栏（适合放 kv 标题栏块）
## C 总览面板 {sheet}   ← research：进入顶部图纸总览（5 分钟路径）
## D 正文面板 {depth=3} ← research：阅读深度 1=5 分钟 2=30 分钟（默认） 3=完整
```

- 面板字母 ID 可省略，自动分配。
- ```html / ```svg 围栏块原样嵌入，**只在组件确实表达不了时使用**。
- 完整说明：`am help format`；组件语法：`am help <组件名>`；组件列表：`am list`。

## 4. 按信息形状选组件

**画图的默认方式：Excalidraw 是"草图"，UML 是"蓝图"。** 读者第一次接触某个想法、需要直觉时用草图；读者要照着实现、调试、评审时用蓝图。同一个想法常常先草图后蓝图。选图细则、Excalidraw spec 写法、UML 写法与常见坑见 [references/diagrams.md](references/diagrams.md)。

| 信息形状 | 组件 | 最小写法 |
|---|---|---|
| 直觉、概念关系、前置知识地图、有 / 无对比、成本示意 | `excalidraw` | JSON：`{"nodes":[{"id":"a","label":"A","col":0,"row":0}],"edges":[{"from":"a","to":"b","label":"调用"}]}` |
| 谁在何时调用谁（时序）、类型与关系、生命周期、活动 / 算法、组件 / 部署、数据实体 | `uml`（别名 `mermaid`） | 原样 Mermaid：`sequenceDiagram` / `classDiagram` / `stateDiagram-v2` / `flowchart` / `erDiagram` |
| 谁连向谁、简单流程（**没有 Chrome 时的备选**） | `flow [LR]` | `A -> B: 标签`，`A --> C` 虚线，`{判断?}` `(开始)` `[(数据库)]`，`*重点`，`group 名: A, B` |
| 参与者之间按时间的消息（**没有 Chrome 时的备选**） | `sequence [num]` | `A -> B: 请求`，`B --> A: 响应`，`note A, B: 说明`，`== 阶段 ==` |
| 层级 / 目录 / 分类 | `tree [list]` | 缩进表达层级，`标签 \| 说明`，`` `编号` 标签 `` |
| 历史 / 阶段 | `timeline [v]` | `时间 \| 标题 \| 说明`，`*` 高亮 |
| 数值与上限 | `limits` | `标签 \| 13 / 20 \| 单位`，只写上限：`标签 \| max 20` |
| 逐词点评一句话 / 一个公式 | `annot` | `# 小标题 \| 右注`，`[片段]{注释}`，`[错词]{!红色注释}`，`> 底注` |
| 元信息 / 标题栏 | `kv [cols=2]` | `键: 值`，`* 宽格: 值` |
| 结论 / 警告 | `callout <info\|ok\|warn\|err> 标题` | 正文 Markdown |
| 前置知识卡片（研究页） | `prereq B-1 [l1] [8min]` | `# 概念` + `是什么:` `为什么需要:` `例子:` `误解:` `深入:` |
| 发现：论断 + 证据 + 影响（研究页） | `finding F1 high` | `# 论断` + `结论:` `证据: [observed] …` `影响:` |
| 术语表 | `glossary` | `术语 \| 别名 \| 定义 \| 易混淆` |
| 多维对比、能 / 不能清单 | Markdown 表格 | 状态列写 ok / no / warn |

`excalidraw` / `uml` 都接受 `q="这张图回答的问题" read="怎么读" takeaway="一句要点"`。研究页里每张图都要有 `q`。

选型原则：
- 先放结论。第一个面板或导语给出核心答案，后面的面板给证据。
- 一个面板一个问题；一张图一个问题。超过 8 个面板（研究页除外）就拆页或删减。
- 用 `span` 给信息最密的面板更多宽度；等宽句子（annot）至少给 span=2。
- 不编数据。没有真实数字就不用 limits；示意数据要在说明里写明"示意"。

## 5. STE 受控写作（稿件里的文字）

`am render` 会自动检查，默认只警告（`style: 80`）；`style: strict` 不达标不生成；`style: off` 关闭。

- 一句话只说一件事。
- 用主动语态。步骤用祈使句（"关闭阀门"，不写"阀门应被关闭"）。
- 一词一义。同一个东西全文用同一个叫法。术语首次出现写"中文（English）"，之后用 `[[术语]]` 链接。
- 句长上限：步骤（有序列表）英文 20 词 / 中文 35 字；描述英文 25 词 / 中文 45 字。
- 每段不超过 6 句。复杂内容用列表。
- 用数字代替形容词："快 3.2 倍（p50）"，不写"快很多"。
- 英文用常见短词：use 不用 utilize，start 不用 commence，before 不用 prior to。
- 中文不用虚动词（"进行优化"→"优化"），不连用三个以上"的"，不用套话（赋能、闭环、一定程度上……）。
- 故意展示的反例用 `~~删除线~~`，或放进状态为 `no` 的表格行，检查会跳过它们。

研究页的写作细则（技术名词豁免、WARNING / CAUTION 的开发语义、受控中文、改写示例）见 [references/writing.md](references/writing.md)。
