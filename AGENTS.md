# SmartAINewTab 项目规则

## 每次改动后生成本地 Chrome 插件

- 只读分析不需要构建；只要本次任务实际修改了项目文件，完成前必须在项目根目录运行一次 `npm run release:local`。
- `npm run release:local` 是唯一的本地发布入口。不要手动复制 `.output/chrome-mv3`，也不要绕过版本递增直接覆盖发布目录。
- 每次运行发布命令都将补丁版本自动加一，例如 `0.1.0` 变为 `0.1.1`，并同步更新 `package.json`、`package-lock.json` 和扩展 `manifest.json`。
- 发布命令必须完成类型检查、测试和 Chrome MV3 构建，然后把经过验证的可加载扩展原子更新到：
  `release/SmartAINewTab-local-extension`
- 只有当发布目录中的 `manifest.json` 版本与 `package.json` 一致，并且 `newtab.html`、`background.js` 存在时，任务才能声明完成。
- 如果检查、构建或发布失败，不得声明完成；应保留上一个可加载版本并报告失败原因。
- 发布命令自动产生的版本文件变化和 `release/SmartAINewTab-local-extension` 构建产物属于本次发布结果，不需要再次运行发布命令，避免递归递增版本。
