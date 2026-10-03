# 方法来源

## Karpathy 的帖子

来源：Andrej Karpathy，X，2026-10-02 — <https://x.com/karpathy/status/2105819303471976479>

帖子的开头是："We'll be spending a lot more time trying to understand the outputs of language models." 随后给出一个输出格式阶梯，每一级都比上一级"even better"：

| 阶梯 | Karpathy 的说法 | 本 skill 的做法 |
|---|---|---|
| 写作 | 让 LLM 按 ASD-STE100 写（航空维修文档的受控语言），或写到"80% 的 STE" | 每次 render 都做 STE 检查（上游实现），中英文都覆盖；研究页细则见 [writing.md](writing.md) |
| 图 | "Instead of writing, ask your LLM to create a diagram." | 上游的 flow / sequence / tree / timeline 等组件；本 fork 加了 Excalidraw 草图和 UML 蓝图，见 [diagrams.md](diagrams.md) |
| 网页 | 让 LLM 输出 "in HTML"，得到好看、可交互的页面 | 零依赖单文件页面，带主题、暗色、复制源稿；research 模板加了阅读路径和术语悬停 |
| 视频 | 3b1b 风格的讲解视频 | 不做 |

帖子的结论有两点：
- 工作会"上升到监督与理解"。所以研究页要让人能**检查**结论：发现卡片标注证据类型，并附复现。
- 智能和代码都已经很充裕，可以放心要"大而定制、用完即弃的软件产物"。所以每一页都为一次研究量身定做。

## 帖子配图：工程图纸式总览

配图用一张图纸讲完整个 ASD-STE100。上游的 `sheet` 模板和 `blueprint` 主题就是照它做的：
- 带 1–8 / A–D 坐标刻度的外框
- 带字母编号的面板（黑色字母标签 + 标题 + 右上角等宽小字）
- 每个面板只用一种形式：树、逐词标注、✓/✗ 状态表、限值条、时间线、标题栏
- 近乎单色，只有蓝色和红色两种强调色

research 模板把这张图纸作为页面顶部的 5 分钟总览（`{sheet}` 面板）。

## 上游做法与本 fork

**上游**：[QingYunA/answer-me-with-html](https://github.com/QingYunA/answer-me-with-html)。核心思路是模型只写内容稿，CLI 负责版式和画图。手写 HTML 时，模型要逐行输出 CSS 和 SVG 坐标，大约 7000 个输出 token；改成写稿后，大约只要 900 个。

**本 fork 在上游基础上增加：**
1. `excalidraw` / `uml` 组件。浏览器端渲染后，由 `am bake` 用本机 Chrome 烘焙回零依赖单文件；`am shot` 按图截图，方便逐张检查。
2. `research` 模板：图纸总览、正文、目录、阅读路径。
3. `prereq` / `finding` / `glossary` 组件，以及 `[[术语]]` 悬停链接。
4. 研究页完整性 lint 和扩充的空话词表。
5. 研究页的工作方法（[research.md](research.md)）：论断台账、读者基线、前置知识阶梯、Context 与 Background 分离、证据类型、看截图检查。
