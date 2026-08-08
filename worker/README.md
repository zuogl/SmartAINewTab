# SmartAINewTab Sync Worker

Cloudflare Workers + D1 + R2 后端，负责 Google OAuth、随机会话、客户端加密
备份的版本化存储，以及公开背景图库的目录和图片分发。Worker 不参与 AI 标签生成，
也不接收任何 AI Provider API Key。加密备份对象保存在独立私有 R2 bucket 的
`vaults/` 命名空间；D1 只保存对象键、版本、校验值、大小、更新时间和用户关联等元数据。

## 本地验证

```bash
npm install
cp .dev.vars.example .dev.vars
# 在 .dev.vars 填写本地测试用的 Google OAuth 凭据
npm run typegen
npm run db:migrate:local
npm run check
npm run dev
```

`.dev.vars` 已被根目录 `.gitignore` 排除；不得提交真实 client secret。

仓库中的 `wrangler.jsonc` 是可公开的示例配置，不对应维护者的生产账户。首次配置时复制为
`wrangler.production.jsonc`，填写真实 D1 ID、Worker URL 和扩展允许列表；该文件已被 Git
忽略。生产 dry-run 和部署必须分别使用 `npm run deploy:production:dry-run` 与
`npm run deploy:production`，避免把个人部署信息提交到公开仓库。

## 生产配置清单

以下操作会修改 Cloudflare / Google 外部账户，应在明确确认后执行：

1. `npx wrangler login` 登录目标 Cloudflare 账户。
2. 创建 D1：`npx wrangler d1 create smart-new-tab-sync`，并把返回的
   `database_id` 写入本机 `wrangler.production.jsonc` 的 `DB` binding。
3. 创建两个 R2 bucket：
   - `npx wrangler r2 bucket create smart-new-tab-backgrounds` 对应 `BACKGROUNDS`；
   - `npx wrangler r2 bucket create smart-new-tab-vaults` 对应 `VAULTS`。
   `smart-new-tab-vaults` 必须保持私有，不得启用 `r2.dev` 或自定义公开域名。
4. 首次部署 Worker，取得固定的 HTTPS URL。
5. 在 Google Cloud 创建 OAuth 2.0 **Web application** 客户端，把
   `https://<worker-host>/v1/auth/google/callback` 加入 Authorized redirect
   URIs；测试阶段把需要登录的 Google 账户加入 Test users。
6. 通过 `npx wrangler secret put GOOGLE_CLIENT_ID` 和
   `npx wrangler secret put GOOGLE_CLIENT_SECRET` 保存凭据。
7. 把本机 `wrangler.production.jsonc` 中以下变量替换为正式值：
   - `PUBLIC_BASE_URL`：Worker HTTPS 根地址；
   - `ALLOWED_EXTENSION_ORIGINS`：`chrome-extension://<extension-id>`；
   - `ALLOWED_EXTENSION_REDIRECT_URIS`：
     `https://<extension-id>.chromiumapp.org/google`。
8. `npx wrangler d1 migrations apply smart-new-tab-sync --remote`。必须先应用兼容迁移，
   再部署读取 `object_key` / `object_size` 的新版 Worker。
9. 将 [生成记录](../docs/BACKGROUND_ASSET_PROVENANCE.md) 中审核过的 WebP 放到
   `public/original/<id>.webp`；文件名只使用小写字母、数字和连字符。通过
   `npx wrangler r2 object put` 上传并设置 `image/webp` 与长期缓存，随后核对线上
   对象哈希、`attribution` 和 `license`，不得继续返回旧文件或旧的“原创”元数据。
10. `npm run deploy:production:dry-run` 复核后再执行 `npm run deploy:production`。
11. 在扩展设置中填写 Worker URL，按提示授予该精确域名权限并登录。

开发者模式下可从 `chrome://extensions` 读取扩展 ID；Chrome Web Store
发布后使用商店分配的稳定 ID，并同步更新 Worker 允许列表。

SmartAINewTab 的 Chrome 开发构建通过 `wxt.config.ts` 中的公开 Manifest key
固定为扩展 ID `akbemgeeppcdocpjimlkbhfoambjigej`。使用 `npm run build:dev`
生成可加载的 `.output/chrome-mv3-dev`；普通 `npm run build` 是不携带开发 key
的生产构建，不能用它替代本地 OAuth 调试版本。Worker 当前同时保留旧开发 ID，
便于迁移期间继续访问。

## API

机器可读合同见 [`openapi.json`](openapi.json)。

- `GET /health`
- `GET /v1/backgrounds`
- `GET /v1/backgrounds/:id`
- `GET /v1/auth/google/start?redirect_uri=...&client_state=...&code_challenge=...`
- `GET /v1/auth/google/callback`
- `POST /v1/auth/google/exchange`
- `GET /v1/me`
- `POST /v1/logout`
- `GET /v1/vault`
- `PUT /v1/vault`
- `DELETE /v1/vault`
- `DELETE /v1/account`

背景图库是无需登录的只读公共接口，并返回开放 CORS 与缓存头。除背景图库和 OAuth
导航入口外，`/v1/*` 要求精确允许的 Origin；账户与备份接口还要求
`Authorization: Bearer <session-token>`。`PUT /v1/vault` 必须提供
`expectedRevision`，旧版本会得到 HTTP 409，避免静默覆盖。

## 备份存储与旧数据迁移

- 新备份写入 `vaults/<user-id>/<revision>-<random>.json`，不会被公开背景接口列出。
- D1 的 `vaults` 行不再写入密文；旧列暂时保留为空字符串，以便对已部署数据库做
  无损、可回滚的过渡迁移。
- `0002_vault_r2.sql` 新增 R2 元数据列。旧 D1 密文在用户读取时会异步迁移，定时任务
  每 10 分钟还会迁移一小批长期未访问记录。
- 替换备份后会删除旧 R2 对象；暂时失败的删除进入 D1 清理队列，并由同一定时任务
  重试。删除云备份或账户时会先写入 `vault_deletion_jobs`，再移除活动 D1 元数据；
  删除任务未完成前拒绝新的备份写入。定时任务会按用户前缀反复列举并删除 R2 对象，
  直到确认命名空间为空后才清除删除任务。
- 迁移完成并经过生产核验前不要删除旧密文字段；后续可用单独迁移重建精简表。

## 安全与保留边界

- OAuth 使用 Google state/nonce、扩展生成的 client state 和 PKCE。Worker 只保存
  Cloudflare 连接 IP 派生的 SHA-256 限流键，不保存原始 IP；OAuth 流程 10 分钟到期。
- 会话默认 7 天到期；永久删除账户要求最近 10 分钟内重新登录。
- 交换请求正文上限为 4 KB；云备份请求在 JSON 解析前按字节限制为 8.5 MB。
- 远程云地址必须使用 HTTPS；允许列表、secret、私有 R2 与迁移状态都必须在生产
  验收中逐项核对，不能只以本地测试通过作为“云同步可用”的结论。
