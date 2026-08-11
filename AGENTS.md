# SmartAINewTab 项目规则

## 每次改动后生成本地 Chrome 插件

- 只读分析不需要构建；只要本次任务实际修改了项目文件，完成前必须在项目根目录运行一次 `npm run release:local`。
- `npm run release:local` 是唯一的本地发布入口。不要手动复制 `.output/chrome-mv3`，也不要绕过版本递增直接覆盖发布目录。
- `package.json` 与 `package-lock.json` 中的三段版本号是 Chrome Web Store 正式版本，只在准备新的商店版本时显式递增；本地发布不得改写正式版本。
- 每次运行本地发布命令都会递增 `development-build.json` 的开发构建号。本地 manifest 使用四段数字版本 `<正式版本>.<开发构建号>`，并使用 `version_name` 显示 `<正式版本>-dev.<开发构建号>`。
- 发布命令必须完成类型检查、测试和 Chrome MV3 构建，然后把经过验证的可加载扩展原子更新到：
  `release/SmartAINewTab-local-extension`
- 日常本地包必须保留固定开发 ID `akbemgeeppcdocpjimlkbhfoambjigej`。只有当发布目录中的 manifest 正式版本前缀与 `package.json` 一致、开发构建号与 `development-build.json` 一致、`version_name` 正确，并且 `newtab.html`、`background.js` 存在时，任务才能声明完成。
- 如果检查、构建或发布失败，不得声明完成；应保留上一个可加载版本并报告失败原因。
- 发布命令自动产生的版本文件变化和 `release/SmartAINewTab-local-extension` 构建产物属于本次发布结果，不需要再次运行发布命令，避免递归递增版本。

## 生产身份与商店版本

- `npm run release:production-id` 只用于在独立 Chrome Profile 中进行生产 ID 验收，目标 ID 必须是 `hdajgpnnncgdddpjbdggaochnbgpfngl`，产物目录固定为 `release/SmartAINewTab-production-id-qa-extension`。它不能替代改动完成后的 `npm run release:local`。
- 生产 ID 验收必须使用 Chrome Web Store Dashboard 提供的公钥，并在构建前计算、核对 ID；不得根据 ID 猜测公钥，不得提交或读取私钥。生产 ID 包不得与商店版在同一 Chrome Profile 中混用。
- Chrome Web Store 上传包只能通过 `npm run cws:package` 生成。上传包使用 `package.json` 的三段正式版本，且不得包含本地 `key`、开发构建号或开发 `version_name`。

## 改动完成后的 Git 操作确认

- 每次项目改动和验证完成后，必须主动询问用户是否需要执行 Git 操作，包括 `git add`、`git commit` 和 `git push`。
- 未经用户明确同意，不得自行执行上述 Git 写操作；用户只授权其中部分操作时，只执行明确授权的部分。
- 执行前应根据用户要求确认暂存范围、提交信息和推送目标；如果用户未指定，应先提出建议并等待确认，不得擅自扩大范围。
