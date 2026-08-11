# Chrome Web Store Dashboard fields

Submission status on 2026-08-08: submitted for Chrome Web Store review. Submission does not mean
approval or public availability. Re-check every field and the live distribution state in the
Developer Dashboard before describing the extension as published.

## Store listing

- Product name: `SmartAINewTab`
- Primary locale: `zh_CN`
- Additional locales: `en`, `zh_TW`, `ja`, `ko`
- Category: `Productivity`
- Mature content: `No`
- Homepage URL: `https://smartainewtab.online/`
- Support URL: `https://smartainewtab.online/support`
- Privacy policy URL: `https://smartainewtab.online/privacy`
- Official URL: select the verified Search Console property for the same HTTPS domain
- Global store icon: `icons/icon-128.png`
- Global screenshots, in order: `01-home.png`, `02-search.png`, `03-command.png`,
  `04-tags.png`, `05-health.png`
- Small promo tile: `promotional/small-440x280.png`
- Marquee promo tile: `promotional/marquee-1400x560.png` (optional)
- Localized copy: see `localized-copy.md`

The exact brand name has no exact-match Chrome Web Store result in the 2026-08-08 check. Do not
shorten it to `Smart New Tab`; that generic name is already used by multiple unrelated extensions.

## Single purpose

English copy for reviewer-facing fields:

> Help users search, organize, maintain, and back up their own Chrome bookmarks from the new tab page.

简体中文：

> 帮助用户在 Chrome 新标签页中搜索、整理、维护和备份自己的书签。

## Permission justifications

### `bookmarks`

> Reads the user's Chrome bookmark tree to display and search it. User-confirmed actions can create,
> edit, or delete bookmarks. Visual categories and ordering are otherwise stored separately so
> ordinary organization does not rearrange native folders.

### `storage`

> Stores local layout, tags, settings, job progress, optional provider configuration, and cloud
> session state across new tabs and browser restarts. Provider API keys are excluded from exports
> and cloud backups.

### `alarms`

> Wakes the Manifest V3 service worker for user-enabled background jobs such as resumable AI
> organization, background rotation, and scheduled bookmark health checks. Disabled jobs do not run.

### `favicon`

> Uses Chrome's internal favicon service to display icons for the user's bookmarks without reading
> browser cookies or browsing history.

### `identity`

> Starts Google OAuth only after the user chooses Sign in for optional encrypted cloud backup. It
> requests basic identity only and does not request Gmail, Drive, Contacts, or Calendar access.

### Optional host permissions: `https://*/*`, `http://*/*`

> Requested at runtime only for a user-started feature that needs network access: a chosen AI
> provider, public page-head metadata, public favicons, widgets, or bookmark link checks. Single-site
> features request a precise origin where possible; a full health scan requires a separate user
> confirmation for broader access. Local features keep working when access is declined.

## Remote code

- Select: `No, I am not using remote code.`
- Reviewer explanation if requested:

> All executable JavaScript ships inside the Manifest V3 package. Network responses from AI
> providers and public data sources are treated as data, validated, and never evaluated as code.

## Data use disclosures

Use conservative disclosure. Select every category that appears in the current Dashboard and
matches the product behavior:

- Personally identifiable information: Google account ID, verified email, display name, avatar URL
  when the user enables cloud sign-in;
- Authentication information: locally stored provider API key, cloud session token, OAuth state,
  and encrypted-key wrapping metadata;
- Website content: bookmark titles, URLs, folders, tags, and user-triggered public page-head metadata;
- Web history: bookmark URLs and link-health results, if the Dashboard classifies saved URLs here;
- User activity: bookmark organization actions and feature settings, if shown as a category;
- User-generated content: user-created tags, summaries, categories, groups, and layout, if shown.

Do not select financial/payment information, health information, precise location, or personal
communications unless the product changes before submission.

Certify only after comparing the live checkboxes with the published privacy policy:

- Data is not sold to third parties outside approved use cases;
- Data is not used or transferred for purposes unrelated to the extension's single purpose;
- Data is not used or transferred to determine creditworthiness or for lending;
- Google API data use complies with the Chrome Web Store User Data Policy and Limited Use rules.

## Distribution

- Current submission distribution: read it from the live Dashboard; the repository does not infer it.
- Public distribution: describe it as available only after the Dashboard confirms approval/publication
  and the public listing can be opened and installed.
- Regions: all regions, unless the publisher intentionally limits the initial beta.
- Publishing: use deferred publishing so approval does not make the item public automatically.

## Required publisher input

- Reconfirm Search Console ownership for `https://smartainewtab.online/` in the live Dashboard;
- Developer contact email entered in the Dashboard;
- Public or private support channel that can actually receive user requests;
- Trader/non-trader declaration and any address fields required for the publisher's jurisdiction;
- Final distribution choice: trusted testers, unlisted, or public.
