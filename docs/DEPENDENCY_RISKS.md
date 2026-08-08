# 依赖风险记录

更新日期：2026 年 8 月 8 日

## 官网构建链：vinext / image-size

`website` 当前使用 `vinext@1.0.0-beta.5` 生成 Cloudflare Worker。其构建依赖固定使用
`image-size@2.0.2`；npm 已知该版本的 ICNS、JXL 和 HEIF 解析器存在拒绝服务问题，当前
没有非破坏性的已发布修复版本。

当前风险边界：

- `image-size` 不是 Chrome 扩展或同步 Worker 的依赖；
- 官网不接收用户上传，不从远端抓取图片，只构建仓库内受审查的 PNG/SVG；
- 所有页面图片使用 `next/image` 的 `unoptimized` 模式，Worker 已移除自定义图片处理
  逻辑；兼容路由只会 302 到本地静态源，不会把用户输入交给该解析器；
- CI 对三个可部署部分执行 `npm audit --omit=dev --audit-level=high`；完整开发依赖审计
  会继续显示这一条上游高危告警。

处置计划：持续跟踪 `vinext` 与 `image-size` 的修复版本；上游发布补丁后立即升级并运行
官网构建、服务端渲染和路由测试。若官网未来接收用户图片或远程图片，必须先移除此风险，
不能沿用当前例外。
