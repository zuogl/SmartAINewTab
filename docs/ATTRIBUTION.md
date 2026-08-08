# 参考与归属

SmartAINewTab 的实现代码为新写代码，没有整体复制参考项目。

设计与交互调研参考：

- SimpTab：背景优先、工具按需出现的极简方向。
- WeTab：新标签页的信息架构、书签网格与侧栏组织。
- Mue（BSD-3-Clause）：搜索引擎和快捷入口的产品思路。
- WeTab（MIT）：WXT / React / TypeScript 扩展结构的可行性参考。
- Bonjourr、Anori、nightTab：只作视觉和架构研究；未复制 GPL / AGPL 代码。

正式 UI 图标使用 MIT 许可的 Phosphor Icons 与 `@icons-pack/react-simple-icons`。
Inter 字体通过 Fontsource 打包，字体按 SIL Open Font License 1.1 分发。官网 Provider
标志仅用于说明兼容性，各名称与商标归对应权利人所有，不表示其赞助或认可本项目。

`public/assets/misty-mountains.png` 已确认由 OpenAI ImageGen 为本项目生成。
`public/assets/backgrounds/` 中的五张 WebP 也已在 2026 年 8 月 8 日重新生成，
没有使用输入图片或第三方视觉参考。逐张提示词、源 PNG 与发布 WebP 的 SHA-256、
转换参数和人工检查边界见 [BACKGROUND_ASSET_PROVENANCE.md](BACKGROUND_ASSET_PROVENANCE.md)。
SmartAINewTab 的几何字标先使用 OpenAI ImageGen 做无输入图的构图探索，再在本仓库
重新绘制为确定性 SVG；正式源文件位于 `assets/brand/smart-ai-new-tab-app-icon.svg` 与
`assets/brand/smart-ai-new-tab-mark.svg`。商店宣传图是本仓库内新写的 SVG，源文件位于
`store-assets/source/small-promo.svg`。
随扩展分发的第三方 JavaScript、图标和字体许可证汇总在
`public/THIRD_PARTY_NOTICES.txt`，依赖更新后使用 `npm run notices:generate` 重新生成。

被替换的旧 WebP 没有权属证据，已移出公开工作区并保存在项目外私有归档中；它们不得
重新复制到公开仓库、Chrome Web Store 包或公开 R2 图库。新生成素材仍应在最终发布前
由发布者目检，避免把生成记录误解成对绝对唯一性或不侵权的法律保证。
