# 安全政策

## 支持范围

公开发布后，只有 Chrome Web Store 当前版本和仓库默认分支会接收安全修复。开发者模式
构建、个人修改版以及已经停止支持的旧版本不在承诺范围内。

## 私下报告漏洞

请优先使用 GitHub 仓库的 **Security → Report a vulnerability** 私密通道。仓库尚未公开
或私密通道暂不可用时，请使用官网 `/support` 或 Chrome Web Store 详情页列出的开发者
支持渠道，并明确标注“Security”。不要在公开 Issue 中提交可利用细节。

报告建议包含：

- 受影响版本、浏览器和操作系统；
- 可复现步骤、实际结果和预期结果；
- 影响的数据或权限边界；
- 最小化、已去敏的 PoC；
- 你是否同意在修复公告中署名。

请勿发送真实 API Key、会话令牌、Cookie、Google 凭据、恢复密码或完整书签备份。维护者
会先确认收到报告，再验证影响、制定修复和协调披露时间。未经协调，请避免访问他人数据、
破坏服务或扩大测试范围。

## 设计边界

- 扩展不使用 content script、`scripting` 或远程可执行代码。
- HTTP(S) 网站访问是可选权限，只在用户启用对应功能时申请。
- 页面元数据、favicon、Provider 和云服务会拒绝字面量内网、本机、保留地址及常见本地域名；
  远程 Provider 与云服务强制 HTTPS，本机回环地址仅用于开发。Chrome Stable 没有可供
  扩展安全固定 DNS 解析结果的 API，因此主机名检查本身不应被视为抵御 DNS rebinding 的
  完整网络隔离边界；内网服务仍应自行启用认证并遵循浏览器 Local Network Access 限制。
- 云备份在浏览器端加密；恢复密码和 Provider API Key 不上传。
- Worker 使用精确 Origin/回调允许列表、双重 OAuth state、PKCE、短期交换码、哈希会话、
  私有 R2 和可重试删除任务。

公开部署前仍必须完成 [发布清单](docs/RELEASE_CHECKLIST.md) 中的真实账户和跨设备验收。
