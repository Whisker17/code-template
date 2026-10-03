# answer-me-with-html（research fork）开发说明

本目录是 skill 的源码。skill 运行时只需要上一级的 `SKILL.md`、`references/` 和 `scripts/am.mjs`（打包产物）。

- 上游：<https://github.com/QingYunA/answer-me-with-html>，fork 自 v0.2.2（MIT，见 `LICENSE`）。
- 上游的插件、市场、always-on hook、bench、demo 没有带过来。项目级安装用不到它们。

## 构建与测试

```bash
cd .claude/skills/answer-me-with-html/dev
npm install                 # esbuild + marked + dagre，只在开发时需要
npm test                    # 单元测试；真实烘焙测试需要：AM_TEST_BAKE=1 npm test
npm run build               # 改了 src/ 之后执行，重新生成 ../scripts/am.mjs（要提交）
```

`node_modules/` 已被忽略。`../scripts/am.mjs` 是提交到仓库里的打包产物：改了 `src/` 却没有 build，bundle 测试会失败（版本号检查）。

## 相对上游的改动

| 文件 | 改动 |
|---|---|
| `src/components/excalidraw.js` | 新组件：Excalidraw JSON spec。静态校验节点 id、重叠和标签间距，错误带行号 |
| `src/components/uml.js` | 新组件：Mermaid 源码（别名 `mermaid`），校验图类型，禁用 C4 |
| `src/components/figure.js` | 图外壳：编号、`q` / `read` / `takeaway` |
| `src/components/research.js` | 新组件：`prereq`、`finding`、`glossary` |
| `src/markdown.js` | `[[术语]]` 链接（代码里不替换），未定义时报错 |
| `src/templates/research.js` | 新模板：`{sheet}` 总览、正文、目录，按 `depth=1/2/3` 区分阅读路径 |
| `src/runtime/diagrams.js` | 浏览器端图形运行时：从 CDN 加载 Mermaid / Excalidraw；只在页面含图且尚未烘焙时内联 |
| `src/runtime/page.js` | 阅读路径按钮；烘焙后的 `.excalidraw` 下载按钮 |
| `src/bake.js` | Node 内置 WebSocket 驱动本机 Chrome（DevTools 协议），负责 `bakeFile` / `shotFile` |
| `src/cli.js` | render 后自动烘焙；新增 `am bake`、`am shot`、`--no-bake`、`--only`；help 支持别名 |
| `src/config.js` | 新配置键 `bake`（on / off）；环境变量 `AM_NO_BAKE=1` 也可以跳过烘焙 |
| `src/lint/*` | 研究页完整性检查；prereq / finding 逐字段检查；扩充中英文空话词表 |
| `src/themes/base.css` | 新组件与 research 模板的样式；暗色模式下烘焙的 SVG 整体反相 |
| `test/research.test.js` | 新增测试。删除了 `always-hook.test.js`（插件没有带过来） |

## 烘焙为什么要用 Chrome

Mermaid 和 Excalidraw 都需要真实的 DOM 和字体度量，Node 里画不出来。所以分三步：

1. render 生成的页面带一段 CDN 运行时，页面联网就能看。
2. `am bake` 在 headless Chrome 里等运行时把 `data-am-live` 设为 `ok`。
3. 取出渲染后的 DOM，删掉运行时，写回文件。烘焙后的页面不引用任何外部资源；Excalidraw 字体以 base64 内嵌。

Excalidraw 的一个坑：手绘字体加载前，canvas 量出的文字宽度偏窄，标签会被截断，连线遮罩也会偏小。`diagrams.js` 的处理是先导出一次，把 SVG 里内嵌的字体注册到 `document.fonts`，然后再正式转换。

## 和上游同步

```bash
git clone --depth 1 https://github.com/QingYunA/answer-me-with-html /tmp/am-upstream
diff -ru /tmp/am-upstream/src src     # 逐个合并上游改动，保留上表里的改动
```
