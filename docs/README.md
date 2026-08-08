# SmartAINewTab 文档索引

文档分成两个层次，避免把最终用户指南和维护者发布流程混在一起。

## 用户文档

官网 `/docs` 提供简体中文、繁体中文、English、日本語和한국어五种语言的完整用户指南。
官网源码与结构化内容由独立的私有仓库维护，不属于本公开插件仓库。用户指南覆盖：

1. 安装与源码构建；
2. 首次使用；
3. 搜索、AI 整理、自然语言命令、书签体检和个性化；
4. AI Provider、BYOK 与 API Key 边界；
5. 本地备份、加密云备份、恢复密码、冲突和删除；
6. 隐私、安全与 Cookie 边界；
7. 故障排查；
8. 开源开发、测试、贡献和许可证。

用户行为说明必须以当前代码和测试为依据。Chrome Web Store、正式 OAuth、生产云存储或
跨设备恢复尚未完成真实验收时，文档只能说明状态和限制，不能写成已经普遍可用。

## 架构与维护者文档

- [架构说明](ARCHITECTURE.md)
- [隐私边界](PRIVACY.md)
- [Chrome Web Store 申报文案](CHROME_WEB_STORE.md)
- [公开发布清单](RELEASE_CHECKLIST.md)
- [当前就绪状态](READINESS_STATUS.md)
- [依赖风险](DEPENDENCY_RISKS.md)
- [素材与依赖归属](ATTRIBUTION.md)
- [背景素材来源](BACKGROUND_ASSET_PROVENANCE.md)

仓库级贡献、安全、更新和许可证信息分别位于根目录的 `CONTRIBUTING.md`、`SECURITY.md`、
`CHANGELOG.md`、`LICENSE` 和 `NOTICE`。

## 同步规则

- 用户可见行为、菜单名称和命令变化：在私有官网仓库同步更新对应页面及渲染测试。
- 数据处理、权限、Cookie、Provider 请求或保留期限变化：同时更新官网 `/privacy`、
  `docs/PRIVACY.md` 和相关用户文档。
- 架构、构建、Worker 或发布流程变化：更新本目录中的维护者文档及根 README。
- 不在文档、截图、示例或测试夹具中写入 API Key、Token、Cookie、恢复密码或私人书签。
