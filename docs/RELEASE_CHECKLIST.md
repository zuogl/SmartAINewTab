# 公开发布清单

本文把“本地代码已准备好”和“真实线上服务已验收”分开。任何一项线上检查未完成，都
不能把云同步或商店版本描述为已经可供所有用户使用。

## 1. 开源仓库

- [x] 使用 Apache-2.0，并添加根目录 `LICENSE` 与 `NOTICE`。
- [x] 用本项目生成素材替换五张权属不明的 WebP，并记录提示词、源/发布哈希与转换参数。
- [x] 确认公开仓库为 `zuogl/SmartAINewTab`，普通问题使用 GitHub Issues。
- [x] 运行 secret、私人导出、截图、缓存和大文件扫描。
- [x] 运行扩展、Worker、官网完整 CI。
- [x] 根仓库已经公开；后续发布继续执行 secret、隐私数据和构建产物边界检查。
- [ ] 开启 GitHub Private vulnerability reporting 和 Dependabot alerts。

## 2. Cloudflare 与 Google OAuth

- [ ] 确认 `VAULTS` R2 bucket 为私有，未启用 `r2.dev` 或公开自定义域名。
- [ ] 远端依次应用 `0001_initial.sql`、`0002_vault_r2.sql`、`0003_security_hardening.sql`。
- [ ] 将 Worker secret 和变量绑定到正式 Google OAuth Web client。
- [ ] 用商店稳定扩展 ID 更新 Origin 与 redirect URI 精确允许列表。
- [ ] 部署 Worker 后验证日志未包含正文、邮箱、Token、密钥或恢复密码。
- [ ] 验证大于 2 MB 的加密备份写入 R2，D1 行仅含元数据。
- [ ] 用两个真实 Chrome 配置文件完成登录、上传、跨设备恢复、版本冲突、删除备份、
      删除账户和 R2 删除重试验收。
- [ ] Google OAuth consent screen 从 Testing 切换到适合公众使用的发布状态。

## 3. 官网与公开政策

- [x] 绑定正式 HTTPS 域名并发布 `/privacy`、`/terms`、`/support`、
      `/account-deletion`。
- [ ] 在正式域名逐页检查状态码、移动端、链接、metadata 和无障碍。
- [ ] 支持页面提供真实可用的私密联系渠道。
- [ ] 隐私政策 URL 与 Chrome Web Store Dashboard 中填写的 URL 完全一致。

## 4. Chrome Web Store

- [x] 正式版本与开发构建号已拆分；本地发布不再改写 Chrome Web Store 三段版本。
- [x] 日常开发 ID 与生产 ID 验收入口、目录和校验相互隔离。
- [x] 生成不含开发 `key` 的生产 zip，并核对版本高于已发布版本。
- [x] manifest 中只有 `bookmarks`、`storage`、`alarms`、`favicon`、`identity`，网站
      访问只出现在 `optional_host_permissions`。
- [x] 准备至少 1 张、最多 5 张 1280×800 实际产品截图，及 440×280 小型宣传图。
- [x] 准备 128×128 商店图标，并核对 16/32/48/128 扩展图标清晰度。
- [x] 使用 [商店申报文案](CHROME_WEB_STORE.md) 准备单一用途、权限、数据类型、
      Limited Use、远程代码、支持和隐私字段。
- [ ] 使用全新 Chrome 配置文件安装上传包，走完首次权限、无 Key 本地功能、按需授权、
      拒绝授权、撤销授权、Google 登录和账户删除流程。
- [x] 已向 Chrome Web Store 提交审核。
- [ ] 跟踪审核、发行范围和公开上架状态；确认公开详情页可安装前不得宣称已上架。
