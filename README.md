# SmartAINewTab

SmartAINewTab 是一个基于 WXT、React、TypeScript 和 Manifest V3 的 Chrome
新标签页扩展。它以 Chrome 原生书签为默认数据源，用独立的 sidecar
布局保存首页分类、分组和排序，并提供本地优先的自然语言检索和可选的
OpenAI-compatible BYOK 能力。

## 当前能力

- 内置“跟随浏览器 / 简体中文 / 繁體中文 / 日本語 / 한국어 / English”语言设置，
  自动将中国大陆、港澳台、日本、韩国和其他地区分别映射到对应界面语言，保存后立即生效；
  不会翻译或改写用户的书签、标签以及 AI 返回内容。
- 覆盖 Chrome 新标签页，提供沉浸式摄影背景、磨砂搜索框、图标网格和右侧分类轨道。
- 时间与搜索框固定在首页上方，书签和可选小部件只在搜索框与每日警句之间的独立区域滚动。
  主界面一次只渲染当前选中的一级分类；滚动到该分类顶部或底部后继续滚动，会切换到相邻一级分类。
- 桌面书签网格使用与搜索框相同的内容宽度并优先展示 8 列。右侧分类轨道只显示图标，
  使用即时左侧浮签、高亮和 hover 反馈；可在通用偏好中改为仅当鼠标到达屏幕右缘时显示。
- “大分类 → 分组 → 图标”三级结构；分类、分组和图标均可拖拽排序。
- 新增、编辑、删除图标；新增、重命名、删除分类和分组；折叠/展开分组。
- 左键、组合键、中键与右键菜单支持当前页/新标签页打开。
- Google、百度、Bing、DuckDuckGo 网页搜索。
- 跨全部 Chrome 书签的本地检索；自然语言结果可自动切换分类、展开分组、
  滚动并高亮目标；低置信度时只展示候选，不自动打开网址。
- DeepSeek 默认 Provider / OpenAI-compatible BYOK；默认模型为
  `deepseek-v4-flash`，无 Key 时所有本地能力仍可用。
- 可选的新书签自动 AI 标签：后台捕获 Chrome 新增书签，读取网页 `head` 中的
  title/description/keywords/站点名称，不发送网页正文；提示词要求 6–10 个标签并保留网站品牌与专有名称。
- 首次全量 AI 整理采用两阶段：先根据整库概况从 20 个通用候选中规划实际需要的
  一级分类（通常 8–16 个，硬上限 24），再逐书签只生成标签、摘要和一级分类。
  全部书签成功后才按一级分类分别规划二级分组；任一书签失败都会等待用户重试，不会提前重建布局。
- 二级分组是可选结构：每个一级分类最多 3 个，只有明确且至少 3 个成员的稳定子主题
  才能建组，多数书签直接放在一级分类下。模型返回的跨分类或未知 ID 会被安全忽略，
  对应书签仍留在其原一级分类。后续新增书签只尝试匹配已有分组，匹配不足时
  留在一级分类下，不会为单个书签创建新组。整理前布局可一键恢复。
- 标签请求会保留用户创建的有效书签目录路径作为重要分类证据，同时剔除 Chrome
  默认根目录；旧构建已有完整 AI 结果时，不重复逐书签打标签，但仍会调用 Provider
  规划一级分类并执行一次全局分组。
- 持久 AI 标签队列：短批次、进度可见、可取消、可重试、闹钟续跑。
- 书签体检：常规扫描不携带 Cookie；401/403 与疑似登录跳转可经二次确认后
  使用当前登录态复检。跳转按安全永久、临时、同站路径和跨域风险分组，地址更新
  必须预览确认并保存一键撤销快照。
- 手动导入旧扩展导出的 JSON 标签；按 URL / 标题映射到 bookmark ID。
- 完整 JSON 导入/导出：备份并恢复分类、分组、排序、手动/AI 标签和非敏感设置；
  Provider API Key 永不进入备份。
- Google 账户登录与 Cloudflare 加密云备份：书签快照在浏览器端使用 AES-GCM
  加密，恢复密码通过 PBKDF2 包装数据密钥，私有 R2 只保存密文，D1 只保存元数据。
- 同一套界面支持 Chrome 扩展构建和普通浏览器视觉预览。

## 本地开发

```bash
npm install
npm run dev
```

默认预览地址为 `http://localhost:5173`。指定视觉验收端口：

```bash
npm run dev -- --host 0.0.0.0 --port 4173 --strictPort
```

## 构建 Chrome 扩展

```bash
npm run check
```

构建产物位于 `.output/chrome-mv3`。在 `chrome://extensions` 开启开发者模式，
选择“加载已解压的扩展程序”，指向该目录即可。

项目改动完成后使用统一的本地发布命令：

```bash
npm run release:local
```

该命令会自动递增补丁版本，执行类型检查、测试和 Chrome MV3 构建，并把可加载的
扩展原子更新到 `release/SmartAINewTab-local-extension`。如果检查或构建失败，版本文件
会回滚，现有可加载版本不会被覆盖。

## Cloudflare 后端（本地）

后端位于 `worker/`，使用 Cloudflare Workers + D1 + 私有 R2。它提供 Google OAuth
回调、会话和单用户加密仓版本控制；不保存 Provider API Key，也无法解密备份。

```bash
cd worker
npm install
cp .dev.vars.example .dev.vars
# 仅在本机 .dev.vars 填写 Google OAuth 测试凭据；该文件已被忽略
npm run db:migrate:local
npm run dev
```

另一个终端可以检查：

```bash
curl http://localhost:8787/health
```

生产部署前还必须完成 Cloudflare 登录、创建/绑定 D1、填写正式 Worker
URL、扩展 ID 允许列表，以及在 Google Cloud 建立 Web application OAuth
客户端。具体步骤见 [Worker 部署说明](worker/README.md)。当前仓库不包含任何
Cloudflare 或 Google 私密凭据。

仓库中的云功能代码和本地测试通过，不等于其他用户已经可以使用生产云同步。正式开放前
还要应用远端迁移、确认私有 R2、发布 Google OAuth consent screen，并完成两个独立
Chrome 配置文件之间的上传/恢复/删除验收。进度以[公开发布清单](docs/RELEASE_CHECKLIST.md)
为准。

## 参与和发布

- 官网用户文档由独立的私有官网仓库维护并单独发布；本公开仓库不包含官网源码
- 仓库文档索引：[docs/README.md](docs/README.md)
- 贡献说明：[CONTRIBUTING.md](CONTRIBUTING.md)
- 安全政策：[SECURITY.md](SECURITY.md)
- 更新记录：[CHANGELOG.md](CHANGELOG.md)
- Chrome Web Store 申报文案：[docs/CHROME_WEB_STORE.md](docs/CHROME_WEB_STORE.md)
- 完整公开发布清单：[docs/RELEASE_CHECKLIST.md](docs/RELEASE_CHECKLIST.md)
- 当前就绪状态：[docs/READINESS_STATUS.md](docs/READINESS_STATUS.md)

项目源码采用 [Apache License 2.0](LICENSE)；第三方依赖、字体、图标和素材仍分别遵循
其原始许可证，详见 [NOTICE](NOTICE)、[第三方许可证汇总](public/THIRD_PARTY_NOTICES.txt)
和[归属说明](docs/ATTRIBUTION.md)。Apache-2.0 不授予项目名称、图标或其他商标权利。

## 数据与迁移原则

- Chrome bookmarks API 是书签事实来源。
- 首页结构和个性排序保存在 `chrome.storage.local` 的可逆 sidecar 中；
  拖拽不会重排原生书签文件夹。
- AI 标签、摘要、一级分类、可选分组建议和任务阶段保存在扩展自己的 IndexedDB 中，主键是
  bookmark ID。
- 完整导入恢复只写 sidecar、设置和扩展元数据；不会创建、删除或移动 Chrome
  原生书签。原书签 ID 变化时使用规范化 URL 兜底匹配。
- 扩展更新或“重新加载”会保留本地标签；卸载扩展通常会清除本地扩展存储，
  可通过导出的完整备份或加密云备份恢复。
- 旧项目不会被自动扫描。迁移必须由用户在设置中手动选择导出的 JSON；
  不读取或复制旧项目内的私人 `bookmarks.json`。

## 常用命令

```bash
npm run typecheck
npm run test:run
npm run build
npm run zip
npm run check:worker
npm run check:all
```

架构、隐私和资源归属见：

- [架构说明](docs/ARCHITECTURE.md)
- [隐私边界](docs/PRIVACY.md)
- [参考与归属](docs/ATTRIBUTION.md)
- [依赖风险记录](docs/DEPENDENCY_RISKS.md)
