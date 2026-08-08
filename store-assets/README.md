# Chrome Web Store 素材

- `icons/`：由 `assets/brand/smart-ai-new-tab-app-icon.svg` 确定性渲染的 16/32/48/128 PNG；
  同一组文件也会写入 `public/icon/` 供扩展清单使用。
- `screenshots/`：由官网 `public/product/` 中的真实产品截图居中裁切并缩放为 1280×800；
  使用 `npm run store-assets:generate` 确定性生成，不包含生成式 UI，也未添加夸大功能的文字。
- `promotional/small-440x280.png`：由 `source/small-promo.svg` 确定性渲染的小型宣传图；
- `promotional/marquee-1400x560.png`：由 `source/marquee.svg` 确定性渲染的可选大幅宣传图；
  两者都由 `npm run store-assets:generate` 更新，并使用不依赖语言的品牌视觉。

正式提交前再次检查截图中没有真实邮箱、API Key、Token、恢复密码或私人书签，并确认
当前商店素材规格仍与 Chrome 官方要求一致。商店最多使用前五张截图，不要再添加临时
QA 截图。

官网截图必须通过 `npm run screenshots:capture` 从临时浏览器配置生成。脚本在每张截图
前清空该 preview origin 的 Local Storage、IndexedDB、Cache Storage 和会话数据，并断言
所有书签及搜索结果都来自 `src/domain/seed.ts` 的 `preview-*` fixture；断言失败时不会产出
可用于商店的成功结果。
