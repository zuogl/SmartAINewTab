# SmartAINewTab 隐私政策

生效日期：2026 年 8 月 8 日  
适用范围：SmartAINewTab Chrome 扩展、SmartAINewTab 同步 Worker 和官方网站。

SmartAINewTab 的单一用途是帮助用户搜索、整理、维护和备份自己的 Chrome 书签。
扩展默认本地运行；AI、网页元数据读取、书签体检、网络小组件、Google 登录和云备份
分别由用户动作或用户明确开启的设置触发。SmartAINewTab 不出售用户数据，不使用广告或
用户画像 SDK。

## 1. 处理的数据

### Chrome 书签和扩展内数据

扩展通过 `bookmarks` 权限读取 Chrome 书签的 ID、标题、URL、父目录和目录路径、
添加时间。为提供整理、搜索、体检和恢复功能，扩展还会生成或保存：

- 用户创建的分类、分组、排序、隐藏状态和布局；
- 手动标签、AI 标签、可选摘要、建议分类和建议分组；
- AI 任务、请求/响应摘要和任务进度；
- 书签体检状态、状态码、最终 URL、跳转链、错误摘要和删除前恢复快照；
- 搜索引擎、界面、背景、小组件、自动任务和 Provider 设置；
- 用户上传的背景图片和本地缓存的小组件数据；
- 用户配置的 Provider endpoint、模型和 API Key；
- 用户启用云功能后产生的 Google 登录会话、端到端加密密钥封装和同步版本。

这些数据默认保存在 `chrome.storage.local` 或扩展的 IndexedDB 中。扩展将
`chrome.storage.local` 限制为受信任扩展上下文，但它不是操作系统钥匙串；建议使用
独立、限额、可吊销的 Provider API Key。

### 页面 `head` 元数据和 favicon

在 AI 标签或 favicon 解析需要时，扩展可能读取书签页面最多 96 KB 的 HTML 开头，
只解析 `<head>` 中的最终 URL、标题、description、keywords、站点名、应用名、
Open Graph 标题/描述和图标地址；读取遇到 `<body>` 后停止，不保存页面正文。
内网、localhost、带用户名/密码的 URL 会被跳过。`head` 请求使用
`credentials: "omit"`、`no-referrer` 和手动跳转，不携带登录 Cookie。

对没有内置品牌图标的书签，扩展还会自动尝试同一站点自身声明的图标及常见
favicon 路径。图标请求限制为同源公开 HTTP(S) 地址，使用 `credentials: "omit"`、
`no-referrer`、手动跳转、30 秒超时和 256 KB 响应上限，不携带登录 Cookie，也不会
跨站跟随图标跳转。失败时会回退到 Chrome 的内部 favicon 服务。目标网站仍可能记录
该匿名请求的 IP、User-Agent 和时间；SmartAINewTab 不申请 `cookies` 权限，不能读取、
显示或保存 Cookie。

## 2. 哪些数据会发送到用户选择的 AI Provider

只有在用户配置并启用 Provider，主动使用 AI 搜索、AI 标签、AI 整理或自然语言命令，
或明确开启“新书签自动打标签”后，扩展才会直连用户选择的 OpenAI-compatible
endpoint。根据功能，请求可能包含：

- 用户输入的查询或整理命令；
- 候选书签 ID、标题、URL、域名、用户目录路径；
- 手动标签、AI 标签、摘要、当前分类/分组和可选分类计划；
- 上述页面 `head` 元数据，但不包含页面正文和 favicon 图片；
- 为约束模型输出所需的系统提示和结构化任务说明。

Provider API Key 会作为认证信息直接发送给该 Provider，但只保存在本机，不进入
SmartAINewTab 源码、导出备份、云备份或 Worker。Provider 对请求的保存、训练和保留
规则由用户选择的 Provider 自己的隐私政策和账户设置决定；SmartAINewTab 无法替用户
控制第三方 Provider 的保留期限。

## 3. Google 登录数据

用户点击“使用 Google 登录”后，SmartAINewTab 请求 Google 返回稳定账户标识
（`sub`）、已验证邮箱、显示名和头像 URL。用途仅限于：

- 创建并识别 SmartAINewTab 同步账户；
- 在扩展内显示当前登录账户；
- 把端到端加密备份及其版本关联到正确用户。

SmartAINewTab 不请求 Gmail、Google Drive、联系人或日历权限，不读取 Google 密码。
Google OAuth 页面可能使用用户现有的 Google Cookie 完成登录；扩展只接收一次性授权码，
Worker 验证 ID Token 后创建随机会话令牌。

## 4. 云备份、Cloudflare 和保留期限

云备份是可选功能。用户主动上传时，备份在浏览器中使用 AES-GCM 加密，恢复密码通过
PBKDF2-SHA-256 派生的密钥包装数据密钥。Worker 只收到密文、IV、密文 SHA-256 校验值和被包装的
密钥；恢复密码和未加密书签不会上传，服务端无法解密、找回或重置恢复密码。

Cloudflare 中的数据分布和保留规则如下：

| 数据 | 位置 | 保留期限 |
| --- | --- | --- |
| Google 稳定 ID、邮箱、显示名、头像 URL、创建/更新时间 | D1 | 保留到用户删除云端账户 |
| 会话令牌的 SHA-256 哈希 | D1 | 登录后 7 天到期；到期后由 10 分钟维护任务删除 |
| OAuth state/交换码哈希、nonce、回调地址、扩展生成的随机 state、PKCE challenge | D1 | 10 分钟到期；随后由 10 分钟维护任务删除 |
| 为限制 OAuth 滥用而由 Cloudflare 连接 IP 派生的单向 SHA-256 键 | D1 | 仅随对应 OAuth 流程保存，10 分钟到期；不保存原始 IP |
| 备份 objectKey、revision、密文 SHA-256 checksum、size、updatedAt、userId | D1 | 保留到用户删除云备份、覆盖迁移或删除账户 |
| 当前端到端加密备份对象 | 独立私有 R2 `VAULTS` bucket 的 `vaults/` 命名空间 | 保留到用户替换/删除备份或删除账户；删除意图先持久化，失败时每 10 分钟重试，且删除期间禁止新写入 |
| Worker 错误日志 | Cloudflare Workers Logs | 不记录请求正文、书签内容、邮箱、Token 或恢复密码；按 Cloudflare 套餐保留 3 或 7 天，最长不超过 7 天 |

Worker 已关闭 Cloudflare invocation logs，只写入失败请求的方法、路径和错误类别等结构化
诊断信息。Cloudflare 仍会为传输、安全和平台运行处理 IP 地址、User-Agent 和基础请求
元数据；这些数据不写入 SmartAINewTab 的 D1 或 R2 业务表。

D1 的 Time Travel 灾难恢复副本按 Cloudflare 套餐最多保留 7 天（Free）或 30 天
（Paid）。用户删除后，数据会立即从活动业务表和私有 R2 bucket 移除，但已删除的 D1
元数据可能在不可由扩展访问的灾难恢复副本中最多残留 30 天，并在保留期结束后淘汰。

## 5. Cookie 使用边界和书签体检

- SmartAINewTab 扩展和官网不设置广告、分析或用户画像 Cookie。
- 页面 `head`、网络小组件和普通/自动书签体检使用 `credentials: "omit"`。
- favicon 请求与页面 `head` 请求相同，均明确使用 `credentials: "omit"`，不会携带登录 Cookie。
- Google 登录页使用 Google 自己的登录 Cookie；SmartAINewTab 不读取该 Cookie。
- 只有当 401/403 或疑似登录跳转被归类为“访问受限”后，用户主动点击“带 Cookie
  复检全部”、查看网址清单并再次确认，扩展才会在该次 GET 复检中使用
  `credentials: "include"`。浏览器按 Cookie/SameSite 规则决定实际发送内容，目标
  网站可能记录该已登录请求；扩展只保存状态码、最终 URL、跳转链和错误摘要，不保存
  响应正文或 Cookie。

## 6. 数据共享和第三方处理者

SmartAINewTab 仅在提供用户选择的功能所必需时向以下接收方传输数据：

- 用户选择的 AI Provider：接收第 2 节列出的 AI 请求数据和 API Key；
- Google：处理用户主动发起的 OAuth 登录；
- Cloudflare：托管 Worker、D1、R2、错误日志和官网；
- 书签目标网站：接收 favicon、页面 `head` 或体检请求；
- 小组件数据源：接收对应公开 API 请求，例如用户选择的天气城市或汇率参数。

SmartAINewTab 不向广告平台、数据经纪商或信息转售商出售或转移用户数据，不使用用户数据
做个性化广告、信用评估或与单一用途无关的分析。除用户对具体数据的明确支持授权、
安全调查、法律要求或合规的匿名聚合内部运营外，不允许人工读取用户数据。

## 7. 导出、删除和账户删除

- **导出**：扩展“设置 → 备份与恢复 → 导出完整备份”生成本地 JSON。导出包含布局、
  设置、书签标题/URL、标签、摘要和分类信息，但不包含 Provider API Key、Google
  会话令牌、明文恢复密码或云端数据密钥。
- **删除云备份**：扩展“设置 → 账户与云同步 → 删除云端备份”，二次确认后删除 R2
  密文及 D1 备份元数据；删除意图会先写入 D1，若 R2 暂时失败则由 10 分钟维护任务
  重试，期间不允许上传新备份。本机书签、设置和 Google 登录保持不变。
- **删除账户**：同一页面点击“删除云端账户”，二次确认后调用 `DELETE /v1/account`，
  删除 Google 账户资料、会话、OAuth 记录、备份元数据和 R2 密文，并清除本机会话。
  为防止长期会话被滥用，永久删除要求最近 10 分钟内完成 Google 登录；若 R2 暂时
  不可用，服务端保留不可撤销的删除任务直到后台清理完成。
- **删除本地数据**：卸载扩展或在 Chrome 中清除扩展数据。删除云端账户不会自动删除
  Chrome 原生书签或用户已经导出的本地文件。

官网还提供 `/account-deletion` 自助说明和 `/support` 支持说明。若会话已过期，可用
同一 Google 账户重新登录后执行删除。

## 8. Chrome Web Store Limited Use

SmartAINewTab 对 Chrome 和 Google API 数据的使用限于提供或改进公开说明的单一用途，
并遵守 Chrome Web Store User Data Policy 的 Limited Use 要求。

> The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.

## 9. 变更与支持

如果数据处理方式发生实质变化，SmartAINewTab 会在收集前于扩展界面和本政策中显著说明，
并在需要时重新取得同意。政策更新会修改本页生效日期。使用帮助、隐私问题和账户删除
说明见官网 `/support` 与 `/account-deletion`。
