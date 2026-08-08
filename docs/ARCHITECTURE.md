# 架构说明

## 运行入口

- `src/entrypoints/newtab`：WXT newtab override，使用真实 Chrome Runtime。
- `src/entrypoints/background.ts`：MV3 service worker，恢复并推进 AI 队列。
- `src/preview.tsx`：普通 Vite 预览，使用同一 App 和可交互示例数据。

## 数据分层

1. **Chrome bookmarks API**
   - 默认书签事实来源。
   - 新增、编辑、删除真实书签时才写入 API。
   - 拖拽排序不写回 Chrome 文件夹结构。
2. **Sidecar layout (`chrome.storage.local`)**
   - 保存大分类、分组、折叠状态、bookmark ID 顺序和界面设置。
   - 加载时与当前 bookmarks tree 对账：删除失效引用，追加新发现书签，
     保留用户已有顺序。
3. **IndexedDB / Dexie**
   - `metadata`：以 bookmark ID 为主键的手动标签、AI 标签、可选摘要及 AI
     一级分类和可选分组建议。
   - `jobs`：可恢复的 AI 任务、阶段、一级分类方案、全局分组结果、租约、错误和重试状态。
4. **Cloudflare D1 + R2（可选）**
   - D1 只保存 Google 账户映射、哈希会话令牌、OAuth 一次性状态、备份对象键、
     版本、校验值、大小和删除任务；端到端加密备份对象保存在私有 R2。
   - 不保存 Provider API Key、恢复密码或明文书签。
   - `vaults.revision` 提供乐观并发控制，避免旧客户端静默覆盖新备份。

## 完整备份与云恢复

1. 本地导出生成带格式标识和版本号的 JSON；包含 sidecar 布局、非敏感设置以及
   书签 ID、URL、手动/AI 标签和摘要。
2. 导入先校验结构与大小，再按当前 bookmark ID 优先、规范化 URL 兜底建立映射。
3. 恢复只写扩展自己的布局、设置和 IndexedDB 元数据，不调用 bookmarks
   create/remove/move。
4. 云备份在浏览器内生成随机 256-bit 数据密钥，以 AES-GCM 加密完整 JSON。
5. 用户恢复密码经 PBKDF2-SHA-256 派生包装密钥，再以 AES-GCM 包装数据密钥；
   Cloudflare 仅收到密文、IV、校验值和被包装的数据密钥。
6. 扩展卸载后，用户重新 Google 登录并输入恢复密码即可下载、解密和执行同一套
   本地恢复流程。

## Google 登录链路

1. 扩展通过 `chrome.identity.launchWebAuthFlow` 打开 Worker 登录入口。
2. 扩展生成随机 client state 与 PKCE verifier/challenge；Worker 校验回调允许列表，
   生成短期 Google state/nonce 并将哈希、challenge 和限流键写入 D1，随后跳转 Google。
3. Google 回调 Worker；Worker 用服务端 client secret 换取 ID token。
4. Worker校验 RS256 签名、issuer、audience、expiration、nonce、subject 与
   verified email。
5. Worker 生成一次性 exchange code，连同扩展原始 client state 回到
   `chromiumapp.org` 扩展回调；扩展先验证 state。
6. 扩展以 exchange code 和 PKCE verifier 换取 7 天随机会话令牌；D1 只保存令牌
   SHA-256 哈希。永久删除账户要求会话在最近 10 分钟内创建。

## 检索链路

1. 本地分词与意图别名扩展。
2. 对标题、URL、手动/AI 标签、分类/分组、可选摘要分别加权。
3. 无 Provider 时直接返回本地结果。
4. 有 Provider 时，仅把候选书签元数据发送给用户配置的
   OpenAI-compatible endpoint，让模型从候选 ID 中重排；模型不能发明 URL。
5. 置信度高时切换分类、展开分组、滚动并高亮前几个结果。
6. 置信度低时展示候选，由用户选择。
7. 搜索结果永不自动打开外部网址。

## 一级分类导航

- 正文只挂载 `activeCategoryId` 对应的一个一级分类，避免相邻分类内容同时出现在视口中。
- `.workspace-scroll-region` 是时间与搜索框下方唯一的主页滚动容器，底部为每日警句保留空间；
  因此书签滚动和跨分类切换不会移动时间及搜索框。
- 桌面书签区与搜索框共用 `workspace-frame` 宽度并使用 8 列紧凑网格，小屏按断点降列。
- 右侧分类轨道只显示图标；选中状态通过图标高亮表示，名称由自绘浮签在图标左侧即时显示，
  无障碍标签保留完整名称和右键管理提示。
- `screenDisplay.alwaysShowCategoryRail` 默认为 `true`；关闭时分类栏只在鼠标进入屏幕右缘热区后显示，
  无 hover 的设备强制保持可见，避免失去导航入口。
- 当前分类到达底部后继续向下滚动会挂载下一个分类并对齐顶部；到达顶部后继续向上滚动会
  挂载上一个分类并对齐底部。首尾分类不循环。
- 搜索命中、右侧分类点击和书签拖拽仍通过 `activeCategoryId` 切换正文，不需要同时挂载全部分类。

默认 Provider 为 DeepSeek 的 OpenAI-compatible API，默认模型为
`deepseek-v4-flash`；endpoint 和模型仍可在设置中更改。

## AI 任务生命周期

- UI 创建持久 job，然后通知 background worker。
- 用户明确开启“新书签自动打标签”后，background 监听
  `chrome.bookmarks.onCreated`；只为新增的网址书签创建单条增量任务，文件夹事件会被忽略。
- 自动任务会按 bookmark ID 检查已有元数据和历史任务，避免重复入队。
- worker 一次处理一个书签并设置短租约；空闲终止不会丢任务。
- worker 会尝试读取书签网页 `head` 中的 title、description、keywords 和站点名称，
  不发送网页正文；内网、本机和非 HTTP(S) 地址会跳过。
- 首次全量任务依次经过 `planning → tagging → grouping → rebuilding`：先根据整库标题、
  域名和用户目录从通用候选中规划实际一级分类（通常 8–16 个、硬上限 24），再逐条只保存
  标签、摘要和一级分类。Chrome 默认根目录会从模型输入中剔除，用户自建目录保留为高优先级证据。
- 只有当全量任务的每个书签都成功后，才按已经锁定的一级分类分别提交给模型规划可选二级分组。
  任一失败项都会进入 `waiting-retry`，用户重试成功前不会执行全局分组或重建 sidecar。
- 每个一级分类最多 3 个二级分组，分组至少 3 个成员且默认不创建；未进入分组的书签直接保存在
  一级分类的 `bookmarkIds`。每个分类的模型输出只允许引用该分类的书签 ID；未知、重复、跨分类和
  不足 3 个有效成员的分组会被安全丢弃，对应书签保留在原一级分类，再写入元数据并重建布局。
- 已建立 AI 结构后的新增书签只生成标签和一级分类，再让模型从对应一级分类的现有组 ID 中选择；
  没有强匹配时留在一级分类下，绝不为单个新增书签创建二级分组。
- 首次重建前保存旧 sidecar 布局；AI 整理永不调用 `bookmarks.move`。
- `chrome.alarms` 每分钟重新检查队列，启动/安装时也会恢复。
- 单条失败最多自动尝试四次，之后进入可手动重试状态。
- 取消会把 job 标记为 `cancelled`；进行中的请求返回后会再次检查状态，
  已取消任务不会写入标签或覆盖取消状态。
- 进程内互斥避免 alarm 与消息同时重复领取同一任务。

## 安全边界

- React 默认转义文本，不使用未转义 `innerHTML`。
- URL 在保存前解析校验。页面元数据、favicon、Provider 与云服务拒绝内网、本机、
  保留地址和带用户名/密码的 URL；远程 Provider 与云服务强制 HTTPS（本机调试除外）。
- 无 content script、无 `scripting`；HTTP(S) 网站读取能力声明为可选域名权限，
  仅在用户启用相关联网功能时申请。网页 `head` 元数据使用匿名请求，Provider
  与云服务只申请各自的精确域名。
- API Key 不内置、不写入源码、不使用同步存储。
- 云同步使用精确 CORS/回调允许列表、双重 OAuth state、PKCE、一次性交换码、哈希
  会话和 D1 prepared statements。请求正文会在解析前按字节限流，备份密文写入
  私有 R2，D1 只保存元数据。
- 删除云备份或账户时先持久化删除任务，再移除活动元数据；后台任务重试 R2 删除，
  删除完成前拒绝新的备份写入。
- 生产 Google client secret 只通过 Wrangler secret / Cloudflare secret 配置，
  不写入仓库。
