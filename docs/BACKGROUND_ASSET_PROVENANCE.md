# 背景素材生成记录

本记录用于证明 SmartAINewTab 随扩展分发的五张内置 WebP 是为本项目重新生成的素材，
并让后续维护者能够核对发布文件没有被旧素材替换。它不是对输出绝对唯一性或不侵权的
法律保证；正式发布者仍需完成最终人工目检。

## 生成与处理过程

- 生成日期：2026-08-08（Asia/Shanghai）
- 生成工具：Codex 内置 OpenAI ImageGen
- 输入图片：无
- 第三方视觉参考：无
- 原始输出：1672×941 PNG
- 发布转换：`cwebp 1.6.0 -q 88 <source.png> -o <asset.webp>`
- 通用限制：原创自然场景；不使用可识别真实地标；不含人物、文字、Logo、商标、
  水印、UI 或边框。

源 PNG 的可恢复副本保存在项目外私有归档
历史归档仍沿用改名前的目录 `SmartNewTab-private-archive-20260808/generated-backgrounds-20260808/source-png/`，不需要
随公开仓库或商店包分发。此前权属不明的旧 WebP 单独保存在
历史归档目录 `SmartNewTab-private-archive-20260808/uncleared-backgrounds/` 中的旧素材不得重新发布。

## 文件指纹

| 资产 | 源 PNG SHA-256 | 发布 WebP SHA-256 |
| --- | --- | --- |
| `alpine-milky-way` | `b211600b4035cb793ac88179b5cb59d0222f7fa07df2b6e15f92c5b04a2d18f8` | `be0b7c9a461837ed188b2937601eeb1a15556943cd202ce7f6627355885930ef` |
| `copper-dunes` | `30ff485d219fc754d585f0a97821c3a59c99f764bea4014d27c5381873c272a6` | `fe2b99bce155ef2e468c50200906a3286a808475e604b481e87c8fe4d8ff23eb` |
| `emerald-forest` | `a023f0cca523afa0a91637e8ee07e02eaccadbfcc6f8893219f08aa06b36b19f` | `26fd6890d6e6bfe2f40b8c8737c92431c042e3d28001496c328a78d0c544ddfa` |
| `sea-cliffs` | `54849da341a7cf9809db7fa92582043b1bdf2a009afd2d366dc9cc3e5cbc602f` | `9d0d3aba8952f84b3109bd5b959789bb09921fb2f91e6c1cf5aaeaee69cae4b1` |
| `snow-peaks` | `bed0dfd7aca2e56b0c17320560a72068ff6ac9ea6d721186ae0826c0742d3ce7` | `b07cf211dea5fe4639404c793ea1cedd98bc79790a9930572739283cd6cd9713` |

## 逐张提示词摘要

所有提示词都指定为 Chrome 新标签页全屏背景、宽幅 16:9 构图，并要求中心和下方中部
尽量简洁，以保证深色半透明书签界面的可读性。

### `alpine-milky-way.webp`

原创高山夜景与明亮银河；宽阔山谷、层叠山影、微弱月光薄雾和细致星空；深海军蓝、
灰岩色与冷银色；安静、专注，不出现可识别真实地标、建筑、人物或动物。

### `copper-dunes.webp`

原创铜色沙丘黄昏景观；风塑沙丘、细密天然沙纹、远处柔和层次和开阔天空；铜色、
焦橙、赭石与低饱和灰蓝；不出现人物、动物、植物、建筑或车辆。

### `emerald-forest.webp`

原创雨后翡翠色温带森林；古老苔藓树木、蕨类、隐约林间小径、薄雾和叶片水滴；
深翡翠、苔绿、低饱和青色与灰绿色；不出现人物、动物、建筑或标牌。

### `sea-cliffs.webp`

原创蓝调时刻海崖；崎岖海岸、安静海湾、柔和长曝光水面和隐入海雾的远方岬角；
板岩蓝、炭灰岩石、低饱和海绿与微弱琥珀色；不出现人物、动物、建筑、船或道路。

### `snow-peaks.webp`

原创黎明雪山全景；层叠雪峰、原始高山谷地、轻微风雪薄雾与开阔晨空；冷蓝灰、白色、
低饱和粉色与浅金色；不出现人物、动物、建筑或滑雪设施。

## 发布核验

发布前运行 `npm run backgrounds:check` 核对 SHA-256；该检查也已接入根目录
`npm run check` 与 GitHub Actions。若任一 WebP 指纹变化，必须重新检查生成来源、
视觉内容和转换步骤，并同步更新本记录与检查脚本；不能只更新哈希来让检查通过。
