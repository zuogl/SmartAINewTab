# 开源与上架就绪状态

核对时间：2026 年 8 月 8 日（Asia/Shanghai）

## 本地代码：GO（已完成统一本地发布）

- 扩展 TypeScript 检查与全量测试通过；具体数量以最新 CI 输出为准。
- Worker 类型生成、类型检查与全量测试通过；具体数量以最新 CI 输出为准。
- 官网 lint 无错误；首页与 `/privacy`、`/terms`、`/support`、
  `/account-deletion` 构建和服务端渲染通过。
- 扩展、Worker、官网生产依赖 `npm audit --omit=dev` 均为 0 个已知漏洞。
- 权限已收敛为 5 个功能权限和运行时可选 HTTP(S) host 权限；无 `webRequest`、
  `cookies`、`history`、`tabs`、`scripting` 或 content script。
- 商店图标、5 张 1280×800 真实产品截图和 440×280 宣传图已经生成并目检。

## 生产云同步：NO-GO

公开仓库不记录维护者生产实例的用户数量、资源 ID、secret 状态或部署时间。当前只能确认
本地代码与测试路径完整，不能据此承诺其他用户已经可以稳定使用云同步。正式声明可用前
必须在私有运维记录中逐项完成：私有 `VAULTS` bucket、全部远端迁移、新 Worker 部署、
Google OAuth 正式配置、商店扩展 ID 允许列表，以及两个全新 Chrome 配置文件之间的
登录 → 上传 → 下载 → 解密恢复 → 冲突 → 云备份删除 → 账户删除验收。

上述 Cloudflare、Google OAuth 和商店后台操作均是外部生产变更，不在公开源码的本地
验证范围内；任何一步没有当次证据时，状态都保持 NO-GO。

## 本地素材：GO；线上背景库：待替换

扩展内 5 张权属不明的 WebP 已替换为本项目于 2026 年 8 月 8 日通过 OpenAI
ImageGen 生成的新素材，原文件移入项目外私有归档。生成提示词、源文件和发布文件哈希、
转换参数记录在 [BACKGROUND_ASSET_PROVENANCE.md](BACKGROUND_ASSET_PROVENANCE.md)。
新素材沿用原文件名与尺寸，因此不会改变现有内置背景 ID 或用户设置路径。

公开仓库不声明线上背景 bucket 的实时内容。上架前必须在私有发布记录中核对线上对象
哈希、Content-Type、attribution 和 license 与本仓库生成记录一致；缺少当次 API 和对象
证据时不得把线上背景库标记为 GO。

## 当前公开里程碑与仍需发布者决定

公开仓库 `zuogl/SmartAINewTab` 与官网 `https://smartainewtab.online` 已上线，Chrome Web
Store 版本已提交审核。提交不代表审核通过或公开可安装，实时状态仍以商店后台和公开详情页为准。

1. 是否启用并验证 GitHub Private vulnerability reporting 等真实可用的私密安全报告渠道。
2. 是否批准下一轮 Cloudflare 生产变更、公开背景 R2 替换及随后
   Google OAuth/跨设备验收。

完整操作顺序见 [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)。
