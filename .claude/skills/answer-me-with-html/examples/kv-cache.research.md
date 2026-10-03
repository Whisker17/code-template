---
template: research
title: KV cache：LLM 推理显存的主要占用
subtitle: KV cache 的显存随序列长度线性增长。在长上下文推理中，它比模型权重更早耗尽显存。
cols: 4
type: 技术调研 · 示例
audience: 后端开发，未接触过 LLM 推理
scope: 单 GPU 推理显存
evidence: 公式推导 + 公开模型配置
date: 2026-10-03 · v1
---
结论先行：Llama-2-7B 在 4k 上下文、batch 8 时，[[KV cache]] 需要 16 GiB，超过权重本身（[F1](#F1)）。[[GQA]] 和 [[PagedAttention]] 分别从“存多少”和“怎么分配”两头降低占用（[F2](#F2)、[F3](#F3)）。

## A KV cache 存什么 {sheet meta="per sequence"}
```tree list
`L1…L32` 每一层（layer） | 每层各存一份
`K` Key 向量 | 每个 token、每个 KV head 一个
`V` Value 向量 | 形状与 K 相同
`t1…tn` 所有已处理的 token | 每生成一个 token 追加一列
```

## B 每 token 显存公式 {sheet span=2 meta="annotated"}
```annot
# bytes per token | 单条序列
[2]{K 和 V 各一份} × [n_layers]{每层都存} × [n_kv_heads]{GQA 减少这一项} × [head_dim]{每个 head 的维度} × [bytes]{!fp16 = 2，int8 = 1}
> Llama-2-7B：2 × 32 × 32 × 128 × 2 = 512 KiB / token
```

## C 降低 KV 显存 {sheet meta="methods"}
| 方法 | 不改模型 |
|---|---|
| MQA / GQA | no 需要重训 |
| PagedAttention | ok |
| KV 量化 | ok |

## D 每 token 的 KV 显存 {sheet span=2 meta="fp16"}
| 模型 | 层数 | KV heads | KiB / token |
|---|---|---|---|
| Llama-2-13B | 40 | 40 | 800 |
| Llama-2-7B | 32 | 32 | 512 |
| Llama-3-8B | 32 | 8 | ok 128（GQA） |

## E 时间线 {sheet span=2 meta="papers"}
```timeline
2017 | Transformer | 引入 K/V
2019 | MQA | 所有 head 共享 K/V
2023 | GQA | 分组共享 K/V
*2023 | vLLM | 分页管理 KV
```

## F 结论 {sheet span=4}
```callout ok 先算 KV，再选 GPU
4k 上下文、batch 8 时，KV cache 需要 16 GiB，权重约 12.6 GiB。先查 D，再选 C 中的方法。
```

## G 如何阅读 {depth=1}
```callout info 默认你已知道（本文不解释）
- 矩阵乘法与向量点积
- GPU 有独立显存（HBM），容量有限
- LLM 输入是 token 序列，输出是下一个 token 的概率
```
不熟悉 attention 时，先读 [前置知识](#panel-I)，按地图顺序读卡片。只关心容量规划时，直接读 [F1](#F1)。

## H 背景动机 {depth=2}
**问题**：推理服务的并发数受 GPU 显存限制。权重占固定显存，剩余显存决定能同时服务多少条序列。

**为什么现在重要**：主流模型的上下文从 4k 增加到 128k。KV cache 与上下文长度成正比，所以单条序列的 KV cache 也增加 32 倍。

**范围**：单 GPU、decoder-only、fp16 推理。**非目标**：训练显存、多卡并行、量化对精度的影响。

**已有做法**：早期服务框架按最大长度为每条序列预留连续显存。vLLM 团队报告，这类系统浪费 60%–80% 的 KV 显存 [4]。

## I 前置知识 {depth=2}
```excalidraw q="理解 KV cache 需要哪些概念？按什么顺序学？" read="箭头表示先学 → 后学；灰色虚线框是默认已知。" takeaway="先读 B-0 和 B-1，它们是 KV cache 的直接前提。" name=prereq-map kind=前置知识地图
{"grid": {"w": 320, "h": 130}, "defaults": {"w": 200, "h": 64},
 "nodes": [
   {"id": "mm", "label": "矩阵乘法（已知）", "col": 0, "row": 0, "color": "gray", "stroke": "dashed"},
   {"id": "hbm", "label": "GPU 显存（已知）", "col": 0, "row": 2, "color": "gray", "stroke": "dashed"},
   {"id": "ar", "label": "B-0 自回归解码", "col": 1, "row": 0, "color": "blue"},
   {"id": "qkv", "label": "B-1 Q / K / V", "col": 1, "row": 1, "color": "blue"},
   {"id": "mem", "label": "B-2 memory-bound", "col": 1, "row": 2, "color": "blue"},
   {"id": "kv", "label": "KV cache", "col": 2, "row": 1, "color": "green", "strokeWidth": 3}
 ],
 "edges": [
   {"from": "mm", "to": "qkv"}, {"from": "ar", "to": "kv", "label": "为什么需要"},
   {"from": "qkv", "to": "kv", "label": "存什么"}, {"from": "hbm", "to": "mem"}, {"from": "mem", "to": "kv", "label": "代价"}
 ]}
```

```prereq B-0 l1 3min
# 自回归解码（autoregressive decoding）
是什么: 模型每次只生成 1 个 token。新 token 追加到输入末尾，然后模型再生成下一个。
为什么需要: 生成 n 个 token 需要 n 次前向计算。每次计算都要用到之前所有 token。
例子:
~~~
"我爱" → "北"
"我爱北" → "京"
~~~
误解: 误解：模型一次输出整句。事实：输出是逐 token 的循环。
深入: [1] Vaswani et al. 2017，第 3 节
```

```prereq B-1 l1 8min
# 注意力中的 Q / K / V
是什么: 每个 token 生成 Query、Key、Value 三个向量。当前 token 的 Q 与所有 K 做点积得到权重，再对所有 V 加权求和。
为什么需要: 旧 token 的 K 和 V 在后续步骤中不变，因此可以存起来重复使用。Q 只在当前步使用。
误解: 误解：KV cache 缓存的是输出 token。事实：它缓存每一层的 K、V 向量。
深入: [1] 第 3.2 节
依赖: B-0
```

```prereq B-2 3min
# memory-bound（受显存带宽限制）
是什么: 计算读写的数据多、运算少时，速度由显存带宽决定。
为什么需要: [[decode]] 步只处理 1 个 token，但要读取全部 KV cache，所以通常受带宽限制。
深入: [2] Shazeer 2019，第 2 节
```

## J 工作原理 {depth=2}
```excalidraw q="有 KV cache 时，每一步计算什么？" takeaway="用显存换算力：每步只算新 token 的 K、V。" kind=直觉
{"grid": {"w": 350, "h": 120}, "defaults": {"w": 210, "h": 64},
 "nodes": [
   {"id": "cache", "label": "KV cache t1…t(n-1)", "col": 0, "row": 0, "color": "green"},
   {"id": "new", "label": "新 token tn", "col": 0, "row": 1},
   {"id": "comp", "label": "只计算 1 个 K, V", "col": 1, "row": 1, "color": "blue"},
   {"id": "attn", "label": "attention", "col": 2, "row": 0, "w": 160}
 ],
 "edges": [{"from": "new", "to": "comp"}, {"from": "comp", "to": "cache", "label": "append", "dashed": true},
           {"from": "cache", "to": "attn", "label": "读取全部"}, {"from": "comp", "to": "attn"}],
 "texts": [{"x": 360, "y": 260, "text": "每步计算 ∝ 1，代价：显存 ∝ n", "color": "blue"}]}
```

```uml q="一次请求中，KV cache 何时写入、何时读取？" read="步骤 2–3 是 prefill，循环部分是 decode。" takeaway="decode 每步都读取全部 cache，所以它受显存带宽限制。"
sequenceDiagram
  autonumber
  participant U as Client
  participant E as Engine
  participant M as Model (32 layers)
  participant C as KV cache
  U->>E: prompt (n tokens)
  E->>M: prefill: n tokens, one pass
  M->>C: write K,V for n tokens
  M-->>E: token n+1
  loop each new token
    E->>M: decode: 1 token
    C-->>M: read K,V of all previous tokens
    M->>C: append K,V of this token
    M-->>E: next token
  end
  E-->>U: stream tokens
```

```uml q="PagedAttention 用哪些对象管理 KV 显存？" read="简化模型，不是 vLLM 源码。BlockTable 类似操作系统的页表。" takeaway="序列的 KV 不需要连续显存，按 16 token 一块按需分配。"
classDiagram
  direction LR
  class Sequence {
    +seq_id: int
    +tokens: list~int~
  }
  class BlockTable {
    +logical_to_physical: list~int~
    +append_token()
  }
  class PhysicalBlock {
    <<value>>
    +block_id: int
    +ref_count: int
  }
  class BlockAllocator {
    +allocate() PhysicalBlock
    +free(block)
  }
  Sequence "1" --> "1" BlockTable
  BlockTable "1" --> "*" PhysicalBlock : maps to
  BlockAllocator "1" o-- "*" PhysicalBlock : owns
```

## K 发现 {depth=2}
```finding F1 high
# KV cache 显存随序列长度线性增长，长上下文时超过权重
结论: Llama-2-7B 在 fp16 下每 token 需要 512 KiB。4k 上下文、batch 8 时共需 16 GiB。
证据: [observed] 公式由模型配置直接算出，见复现。[inferred] 权重约 12.6 GiB（6.7B 参数 × 2 字节）。
影响: 容量规划必须按“最大上下文 × 并发数”计算 KV 显存。
```

```finding F2 high
# GQA 按 KV head 数等比例减少 KV 显存
结论: Llama-3-8B 有 32 个 query heads 和 8 个 KV heads，所以 KV 显存是同结构 MHA 模型的 1/4。
证据: [observed] 配置 `num_key_value_heads = 8`。[observed] GQA 论文报告质量接近 MHA [3]。
影响: 选型时优先比较 KV heads 数，而不只是参数量。
```

```finding F3 medium
# PagedAttention 减少碎片浪费，不改模型
结论: 按块分配 KV 显存后，浪费降到 4% 以下。
证据: [observed] 数字来自 vLLM 团队的报告 [4]。[inferred] 我们的负载可能不同，本文没有复测。
影响: 复测之前，容量规划不要直接使用 4% 这个数字。
```

## L 局限与开放问题 {depth=2}
- 本文没有测量实际吞吐。显存够用不等于延迟达标。
- KV 量化（int8 / fp8）对输出质量的影响需要在我们的任务上评估。
- 开放问题：prefix caching 在我们的负载中能复用多少 prompt？

## M 复现 {depth=3}
下载模型的 `config.json`，然后运行：
```python
import json
cfg = json.load(open("config.json"))
layers = cfg["num_hidden_layers"]
kv_heads = cfg.get("num_key_value_heads", cfg["num_attention_heads"])
head_dim = cfg["hidden_size"] // cfg["num_attention_heads"]
print(2 * layers * kv_heads * head_dim * 2 / 1024, "KiB per token")  # fp16
```
预期输出（Llama-2-7B）：`512.0 KiB per token`。

## N 术语表 {depth=2}
```glossary
KV cache | 键值缓存 | 在显存中保存每层、每个已处理 token 的 K 和 V 向量，解码时重复使用。 | 不是 HTTP 缓存，也不是输出结果缓存
prefill | 预填充 | 一次前向计算处理整个 prompt，并写入全部 KV。
decode | 解码步 | 每次生成 1 个 token：读取全部 KV，再追加 1 个 token 的 KV。
GQA | grouped-query attention | 多个 query head 共享一组 K/V head，KV 显存按组数减少。 | MQA 是只有 1 组的特例
PagedAttention | 分页注意力 | 按固定大小的块分配 KV 显存，用块表映射逻辑位置。
```

## O 参考资料 {depth=2}
1. [Attention Is All You Need](https://arxiv.org/abs/1706.03762) — Vaswani et al., 2017。定义 Q/K/V。**PRIMARY**
2. [Fast Transformer Decoding: One Write-Head is All You Need](https://arxiv.org/abs/1911.02150) — Shazeer, 2019。提出 MQA。**PRIMARY**
3. [GQA](https://arxiv.org/abs/2305.13245) — Ainslie et al., 2023。**PRIMARY**
4. [vLLM blog](https://blog.vllm.ai/2023/06/20/vllm.html) — vLLM team, 2023。碎片浪费数据来源。
5. [Efficient Memory Management for LLM Serving with PagedAttention](https://arxiv.org/abs/2309.06180) — Kwon et al., 2023。**PRIMARY**
