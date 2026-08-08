# Chrome Web Store 提交材料

更新日期：2026 年 8 月 8 日。正式提交前必须把下列 `<official-domain>` 和支持渠道替换为
真实公开地址，并再次对照当时的 Chrome Web Store Dashboard 字段。

可直接复制到 Dashboard 的五语文案、字段说明和审核备注分别位于：

- [`store-assets/listing/localized-copy.md`](../store-assets/listing/localized-copy.md)
- [`store-assets/listing/dashboard-fields.md`](../store-assets/listing/dashboard-fields.md)
- [`store-assets/listing/reviewer-notes.md`](../store-assets/listing/reviewer-notes.md)

## 基本信息

- 名称：`SmartAINewTab`
- 语言：简体中文、繁體中文、日本語、한국어、English（扩展内可跟随浏览器或手动选择）
- 类别：生产力工具
- 单一用途：`把 Chrome 新标签页变成一个本地优先的书签搜索、整理、维护和加密备份工作台。`
- 简短说明：`本地优先的 Chrome 书签工作台：快速搜索、可逆整理、链接体检与可选加密云备份。`

## 详细说明

SmartAINewTab 将 Chrome 新标签页变成书签工作台。它以 Chrome 原生书签为事实来源，
在扩展自己的空间保存分类、分组、排序和标签，因此日常拖拽不会改乱原生目录。

核心能力包括：

- 跨全部书签的本地搜索和自然语言候选；
- 可拖拽、可撤销的分类、分组和布局；
- 可选 BYOK AI 标签与整理，API Key 只保存在本机；
- 重复、失效和跳转书签体检，批量修改前先预览；
- 完整 JSON 导入导出；
- 可选 Google 登录与浏览器端 AES-GCM 加密云备份，服务端只保存密文。

不用 AI、不登录账户也能使用新标签页、书签显示、拖拽、本地搜索和本地备份。网站访问
权限不会在安装时强制授予；只有用户启动对应联网功能时，Chrome 才按需询问精确域名或
用户选择的更广范围。

界面语言可在“设置 → 通用”中选择跟随浏览器、简体中文、繁體中文、日本語、한국어或 English，保存后立即生效。
跟随浏览器时，中国大陆使用简体中文，港澳台使用繁體中文，日本使用日本語，韩国使用한국어，其他国家和地区使用 English。
语言偏好仅控制产品界面，不会翻译、上传或改写用户的书签标题、标签及其他内容。

## 权限说明

| 权限 | 用户可见功能 | 为什么需要 |
| --- | --- | --- |
| `bookmarks` | 显示、搜索、新增、编辑、删除和体检用户书签 | Chrome 书签是产品单一用途的事实来源；删除和 URL 更新必须由用户确认 |
| `storage` | 保存布局、标签、设置、任务进度、Provider Key 和云会话 | 让本地状态跨新标签页和浏览器重启保留；敏感值不使用 Chrome Sync |
| `alarms` | 恢复用户启用的 AI 队列、轮播与定期书签体检 | MV3 service worker 会休眠，需要低频定时唤醒；未启用任务时不联网 |
| `favicon` | 从 Chrome 内部 favicon 服务显示书签图标 | 避免为每个书签长期请求目标网站；不读取 Cookie |
| `identity` | 用户主动发起 Google 登录时打开 OAuth 流程 | 只请求基本身份，不请求 Gmail、Drive、联系人或日历 |
| 可选 `https://*/*` / `http://*/*` | Provider、页面 head、favicon、小组件和书签体检 | 运行时按功能申请；单站功能优先请求精确 Origin，完整体检才请求用户确认的更广范围 |

扩展不申请 `cookies`、`history`、`tabs`、`scripting`、`webRequest` 或 content script 权限。

## Privacy practices 建议申报

为避免少披露，建议在 Dashboard 中勾选：

- Personally identifiable information：Google 邮箱、显示名、头像、稳定账户 ID；
- Authentication information：本地 Provider API Key、云会话令牌和 OAuth 临时状态；
- Website content：书签标题、URL、目录、标签以及用户触发读取的页面 head 元数据；
- User activity / Web history：书签 URL、书签体检结果和用户对书签的整理动作；
- User-generated content：用户创建的标签、摘要、分类、分组和布局。

不处理金融与支付信息、健康信息、精确位置、个人通信。用途仅为应用功能、账户管理、
安全和用户主动请求的 AI/同步；不用于广告、信用评估或数据销售。

Limited Use 声明：

> The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.

远程代码：`No`。扩展包内包含全部可执行 JavaScript；AI Provider 返回内容只作为数据，
经过结构校验后使用，不会作为代码执行。

## 公开链接

- Privacy policy：`https://<official-domain>/privacy`
- Terms：`https://<official-domain>/terms`
- Support：`https://<official-domain>/support`
- Account deletion：`https://<official-domain>/account-deletion`

## 素材规格

- 扩展/商店图标：16×16、32×32、48×48、128×128 PNG；128×128 商店图标中的方形
  主体为约 96×96，四周各保留 16px 透明区；
- 商店截图：1280×800 或 640×400，至少 1 张、最多 5 张，必须为真实产品界面；
- 小型宣传图：440×280 PNG/JPEG；
- 可选 marquee：1400×560 PNG/JPEG。

截图不得包含真实邮箱、API Key、Token、恢复密码或私人书签；同时不得把未完成的云同步
写成已经向所有用户开放。

生产上传 ZIP 必须把 `manifest.json` 放在压缩包根目录，不得包含本地开发版本使用的固定
`key` 字段。使用 `npm run cws:package` 生成并核验，不要直接上传
`release/SmartAINewTab-local-extension`。

## 审核备注建议

1. 安装后打开新标签页即可测试本地能力，无需账户或 API Key。
2. 在设置中可看到每项网站权限为何需要；拒绝授权不会破坏本地功能。
3. Google 登录只用于可选端到端加密备份，不访问 Gmail 或 Google Drive。
4. “设置 → 账户与云同步”提供删除云备份和永久删除账户；永久删除要求最近重新登录。
5. Provider Key 由用户自行提供，只存本机，绝不进入导出或云备份。
