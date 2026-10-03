# 选图与画图：Excalidraw 草图 / UML 蓝图

Karpathy 的建议是："与其写文字，不如让 LLM 画一张图。"每个主要观点都配一张图，本文件决定画哪种图、怎么写。

## 目录

1. 草图 vs 蓝图
2. 问题 → 图
3. 每张图的规则
4. Excalidraw：spec、布局、模式、坑
5. UML（Mermaid）：各类图的写法与坑
6. 逃生口：PlantUML / 手写 SVG

## 1. 草图 vs 蓝图

| | **草图**（`excalidraw`） | **蓝图**（`uml`） |
|---|---|---|
| 用途 | 第一次接触时建立直觉和心智模型 | 精确的结构、协议、生命周期 |
| 读者在做什么 | 了解有哪些部分 | 照着实现、调试、评审 |
| 外观 | 手绘、宽松、彩色填充 | 规整、标准记号 |
| 允许简化 | 很多：可以合并部件、省略细节、用类比 | 很少：每个框和箭头都要真实存在。简化时在 `read=` 里写明"简化" |

默认顺序是**先草图，后蓝图**。例如：先画"有 / 无 cache"的草图，再画 prefill / decode 时序图。

没有 Chrome / Node 22+ 时（`! 未烘焙`），且页面必须离线可看，就退回零依赖的 `flow`（简单关系）和 `sequence`（时序）。

## 2. 问题 → 图

先写问题，再选行。

| 问题是关于…… | 用 |
|---|---|
| 哪些概念依赖哪些（学习顺序） | `excalidraw` 前置知识地图 |
| 有哪些部分，大致怎么连 | `excalidraw` 概念图 / 餐巾纸架构 |
| 两种设计或状态之间变了什么 | 两张 `excalidraw`，布局相同，只改差异 |
| 为什么慢、为什么大、浪费在哪 | `excalidraw` 成本图：红色 = 浪费，绿色 = 节省 |
| 调用穿过哪些层，时间花在哪层 | `excalidraw` 分层栈 |
| 谁在何时按什么顺序调用谁 | `uml` sequenceDiagram |
| 有哪些类型，彼此什么关系 | `uml` classDiagram |
| 对象经历哪些状态，由什么触发 | `uml` stateDiagram-v2 |
| 算法 / 工作流的步骤，带分支或并行 | `uml` flowchart（活动图） |
| 有哪些可部署部件，接口是什么 | `uml` flowchart + «component» 子图 |
| 有哪些数据实体，基数是多少 | `uml` erDiagram |
| 整个主题一眼看完 | 研究页的 `{sheet}` 总览面板 |
| 精确数字的比较 | 表格 / `limits` |
| 历史、谱系 | `timeline` |

没有一行合适时，这个想法可能只需要文字或表格。不是每段话都需要配图，但每个主要观点都需要。

## 3. 每张图的规则

1. **一张图回答一个问题**，写在 `q="…"`。用新人会问的语气写。
2. **`takeaway=`**：读者要记住的那一句。**`read=`**：读法，例如颜色、虚线、箭头的含义，或从哪里看起。需要时才写。
3. **规模**：草图 ≤ 约 12 个节点，时序图 ≤ 约 8 条生命线，类图 ≤ 约 8 个类。超出就按问题拆成多张图。
4. **全页颜色语义统一**（Excalidraw 填充色）：

   | 颜色 | 含义 |
   |---|---|
   | gray + dashed | 基线知识 / 外部系统 |
   | blue | 被讲解的对象 |
   | green | 主题 / 结论 / 推荐路径 |
   | red | 浪费 / 失败 / 问题 |
   | yellow | 假设 / 判断点 |
   | violet | 存储 / 状态 / 内存 |

5. **边上写动词或数据**："读取 K,V""token ids""maps to"。关系不显然时，不要只画一个光秃秃的箭头。
6. **用真名**：框里的名字用页面术语和真实标识符，和正文保持一致。
7. **正文引用图**（"Fig 3 显示……"），说明能从图里得出什么，不要复述图里有什么。

## 4. Excalidraw

### 4.1 spec 速查（完整语法：`am help excalidraw`）

```jsonc
{
  "grid": {"w": 340, "h": 150},            // col/row 的网格单元（默认 340×150）
  "defaults": {"w": 180, "h": 70, "fontSize": 18},
  "scale": 1,                               // 放大渲染宽度（最大 1100px）
  "nodes": [{"id": "sched", "label": "Scheduler", "col": 1, "row": 0,
             "shape": "rectangle|ellipse|diamond", "color": "blue", "fill": "solid|hachure|cross-hatch",
             "stroke": "solid|dashed|dotted", "strokeWidth": 2, "w": 180, "h": 70, "dx": 0, "dy": 0}],
  "edges": [{"from": "a", "to": "b", "label": "token ids", "dashed": true, "dotted": false,
             "arrow": "end|both|none", "head": "arrow|triangle|dot|bar|diamond", "strokeColor": "red",
             "via": [[70, 190]]}],          // 折点（绝对像素）
  "boxes": [{"label": "GPU host", "around": ["sched", "eng"], "pad": 30, "color": "gray"}],
  "texts": [{"x": 0, "y": 280, "text": "注释", "fontSize": 16, "color": "gray"}],
  "raw": []                                 // 原样传给 Excalidraw 的元素骨架（线条等）
}
```

稿件里写合法 JSON，不要带注释。渲染后图下方有 **↓ .excalidraw** 按钮，读者可以在 excalidraw.com 打开文件继续编辑，箭头绑定都会保留。

### 4.2 布局方法

1. **先排网格再写像素**：用 col / row 排节点。流水线从左到右，层级或学习顺序从上到下。
2. **给标签留空间**：水平方向带标签的边，需要约 标签字数 × 16 px（中文）/ 9 px（英文）+ 50 px 的间距。默认网格（340 宽、节点 180）留出 160 px。不够就加大 `grid.w`，或缩短标签。放不下时，渲染会报错。
3. **只强调一处**：只有 `q` 问到的节点或边用强调色，或加粗（`strokeWidth: 3`）。
4. **节点里写名字，不写句子**：1–4 个词，最多 2 行。注释放进 `texts` 或 `read=`。

### 4.3 模式

- **前置知识地图**（研究页 Background 必画）：节点标卡片编号（`B-1 …`），让地图和卡片互相指向。
- **有 / 无对比**：两张 spec 布局完全相同，只把差异涂成红色（浪费）或绿色（节省），放在相邻位置。
- **带边界的流水线**：`boxes` 加 `around` 把一组节点框成"GPU host""后端"等。
- **分层栈**：一列宽节点（`defaults.w: 520`、`grid.h: 72`），右侧用 `texts` 写"← 80% 时间在这里"（red）。
- **心智模型 / 类比**：已知事物（操作系统页表）放在新事物旁边，用 gray dashed 边连起对应部分。类比在哪里失效，写在 `read=` 里。

### 4.4 坑

| 现象 | 处理 |
|---|---|
| 渲染报"重叠" | 调整 col / row，或加大 grid |
| 渲染报"标签需要约 N px 间距" | 加大 `grid.w`，或缩短标签 |
| 箭头连在错误的一侧 | 加 `via` 折点，或挪动节点让中心对齐 |
| `via` 边的标签落在拐角 | 标签放在中间点。让中间点落在想放标签的位置，或改用 `texts` |
| 图很小 | 场景太宽：多用行、少用列，或设 `"scale": 1.2` |
| `raw` 里的线条长度变成 100 | 给线条写 `points`，不要写 `width: 0` |

## 5. UML（Mermaid）

在 `uml` 围栏里原样写 Mermaid。`<<interface>>`、`<br/>`、`List~int~` 都不用转义。蓝图默认是规整风格；简化模型想和草图风格一致时，可以在开头加：

```
---
config:
  look: handDrawn
---
```

sequence 图不支持手绘风。

**sequence**（开发研究里最有用的一种）：

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

- `autonumber`：让正文能写"第 4 步"。
- 箭头：`->>` 同步调用，`-->>` 返回，`-)` 异步。
- 控制流：`alt / else`、`opt`、`loop`、`par / and`、`critical`。用 `rect` 高亮 `q` 问到的部分。
- 规模：≤ 8 个参与者、约 20 条消息。超出就按阶段拆图。

**class**：关系符号 `<|--` 继承、`<|..` 实现、`*--` 组合、`o--` 聚合、`-->` 关联、`..>` 依赖。加多重性 `"1"` / `"*"` 和标签。只画问题需要的成员，删了真实成员就在 `read=` 里写"简化"。

**state**：

```
stateDiagram-v2
  [*] --> Waiting
  Waiting --> Running : scheduled
  Running --> Preempted : out of KV blocks
  Preempted --> Waiting : blocks freed
  Running --> [*] : eos
  note right of Preempted : KV swapped or recomputed
```

每条迁移都标触发条件。

**activity**（用 flowchart）：

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

泳道用 subgraph 表示，每个参与者一个。

**component / deployment**：

```
flowchart LR
  subgraph gpu["«node» GPU host"]
    sched["«component»<br/>Scheduler"]
    kv[("«datastore»<br/>KV cache")]
  end
  gw["«component»<br/>API Gateway"] -- "HTTP /v1/generate" --> sched
  sched <--> kv
```

边上写接口名（协议、端点、函数）。不要用 `C4*`，会报错。

**ER**：`||` 恰好一个、`|o` 零或一个、`}|` 一个或多个、`}o` 零或多个。

**常见坑：**

| 现象 | 处理 |
|---|---|
| 标签含 `()` `:` `"` `#` 时报错 | 给标签加引号：`A["call f(x): int"]` |
| flowchart 在名为 `end` 的节点处出错 | 换名字，或写成 `End` |
| 泛型消失 | 写 `List~int~` |
| 时序图文字被截断 | 消息太长：缩短，细节移到 `Note` 或 `read=` |
| 烘焙报 `Parse error on line N` | 报错行号已换算成稿件行号，直接改那一行 |

## 6. 逃生口

确实需要严格 UML 记号（部署图、用例图、时序约束）时，用 PlantUML 生成 SVG：
- 本地生成：`plantuml -tsvg x.puml`。
- 远程服务：会把源码发给第三方，涉及私有研究时先问用户。

生成后，把 SVG 放进 ```` ```svg ```` 围栏块。删掉 SVG 上固定的 width / height，保留 viewBox。
