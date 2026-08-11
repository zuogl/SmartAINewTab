# 参与贡献

感谢你帮助改进 SmartAINewTab。提交改动前，请先确认它仍服务于产品的单一用途：帮助用户
搜索、整理、维护和备份自己的 Chrome 书签。

## 本地准备

需要 Node.js 22 或更高版本。

```bash
npm ci
npm --prefix worker ci
npm --prefix website ci
```

常用验证：

```bash
npm run typecheck
npm run test:run
npm run build
npm run check:worker
npm --prefix website run lint
npm --prefix website test
```

仓库维护者在完成实际改动后还会运行 `npm run release:local`，生成经过完整检查的本地
可加载扩展并自动递增 `development-build.json` 的开发构建号。该过程不会改写
`package.json` 中的 Chrome Web Store 正式版本。外部贡献者不需要为提交 PR 而递增任何
版本或提交 `release/`、`.output/`、`dist/` 等构建产物。

## 提交原则

- 一个 PR 只解决一个清晰问题，说明用户影响、失败模式和验证证据。
- 不提交 API Key、OAuth secret、Token、Cookie、私人书签导出或真实用户数据。
- 网络能力必须按需请求最小权限，并在界面与隐私政策中保持一致披露。
- 不引入远程可执行代码；AI Provider 的输出只能作为数据解析和校验。
- 修改备份格式、D1 结构或 R2 对象规则时，必须提供向后兼容迁移和回滚说明。
- 新增图片、字体、图标或其他素材时，必须记录作者、来源、许可证和可再分发依据。
- UI 改动应提供去敏后的真实产品截图；不要提交临时 QA 截图和私人浏览器状态。

## Pull Request 清单

- [ ] 已添加或更新测试。
- [ ] 类型检查、测试和构建通过。
- [ ] 未扩大与功能无关的 Chrome 权限。
- [ ] 用户数据处理变化已同步更新 `docs/PRIVACY.md` 和官网 `/privacy`。
- [ ] 新依赖已检查维护状态、许可证和已知漏洞。
- [ ] 新素材已有明确来源与许可证记录。

安全漏洞请按 [SECURITY.md](SECURITY.md) 私下报告，不要先创建公开 Issue。
