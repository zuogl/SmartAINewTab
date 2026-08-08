#!/usr/bin/env node
/**
 * 截取 Chrome Web Store 产品截图（store-assets/screenshots/）。
 *
 * 用法：
 *   1. 先启动 preview dev server：npm run dev
 *      （注意：localhost 在本机可能解析到 IPv6 上其他服务，脚本固定连 127.0.0.1:5173）
 *   2. node scripts/capture-product-shots.mjs            # 截取全部
 *      node scripts/capture-product-shots.mjs home tags  # 只截取指定截图
 *
 * 可选环境变量：
 *   PREVIEW_URL   默认 http://127.0.0.1:5173
 *   CHROME_PATH   默认 /Applications/Google Chrome.app/Contents/MacOS/Google Chrome
 *   OUT_DIR       默认 store-assets/screenshots
 */
import puppeteer from "puppeteer-core";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PREVIEW_URL = process.env.PREVIEW_URL ?? "http://127.0.0.1:5173";
const CHROME_PATH =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const OUT_DIR =
  process.env.OUT_DIR ?? path.join(ROOT, "store-assets/screenshots");
const OUTPUT_FILE_NAMES = {
  home: "01-home.png",
  search: "02-search.png",
  command: "03-command.png",
  tags: "04-tags.png",
  health: "05-health.png",
  settings: "06-settings.png",
};

const VIEWPORT = { width: 1440, height: 1000, deviceScaleFactor: 2 };
const PREVIEW_ORIGIN = new URL(PREVIEW_URL).origin;
const EXPECTED_SEARCH_BOOKMARK_IDS = ["preview-ahrefs", "preview-semrush"];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitStable(page, extraMs = 1200) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images)
        .filter((img) => !img.complete)
        .map(
          (img) =>
            new Promise((resolve) => {
              img.addEventListener("load", resolve, { once: true });
              img.addEventListener("error", resolve, { once: true });
            }),
        ),
    );
  });
  await sleep(extraMs);
}

async function openHome(page, providerEndpoint) {
  const client = await page.createCDPSession();
  await client.send("Storage.clearDataForOrigin", {
    origin: PREVIEW_ORIGIN,
    storageTypes: "all",
  });
  await client.detach();

  // 截图统一关闭小部件面板（ preview 下「多平台热搜」等联网部件会显示 Failed to fetch，
  // 且面板会遮挡书签网格）。widgets.enabled 是产品真实支持的偏好，存于 localStorage。
  await page.evaluateOnNewDocument((previewProviderEndpoint) => {
    const key = "smart-new-tab:smartNewTab.settings.v1";
    localStorage.setItem(
      key,
      JSON.stringify({
        provider: {
          enabled: true,
          endpoint: previewProviderEndpoint,
          model: "preview-query-planner",
          apiKey: "test-only-key",
          batchSize: 10,
        },
        includeSummaries: true,
        widgets: {
          enabled: false,
          activeIds: ["weather", "calendar"],
          weatherLocationId: "shanghai",
          currencyBase: "CNY",
          currencyQuote: "USD",
        },
      }),
    );
  }, providerEndpoint);
  await page.goto(PREVIEW_URL, { waitUntil: "networkidle0", timeout: 60_000 });
  await page.waitForSelector(".bookmark-tile", { timeout: 30_000 });
  // 等 favicon 预加载进度条消失，避免遮挡画面
  await page
    .waitForSelector(".favicon-load-status", { hidden: true, timeout: 30_000 })
    .catch(() => {});
  await assertPreviewWorkspace(page);
  await waitStable(page, 2000);
}

async function assertPreviewWorkspace(page) {
  const bookmarkIds = await page.$$eval("[data-bookmark-id]", (elements) =>
    Array.from(new Set(elements.map((element) => element.dataset.bookmarkId))),
  );
  const unexpected = bookmarkIds.filter(
    (id) => typeof id !== "string" || !id.startsWith("preview-"),
  );
  if (bookmarkIds.length === 0 || unexpected.length > 0) {
    throw new Error(
      `截图数据不是固定 preview fixture：${unexpected.join(", ") || "没有书签"}`,
    );
  }
}

async function assertSearchFixture(page) {
  await page.waitForSelector('[data-search-bookmark-id="preview-semrush"]', {
    timeout: 10_000,
  });
  const actual = await page.$$eval("[data-search-bookmark-id]", (elements) =>
    Array.from(new Set(elements.map((element) => element.dataset.searchBookmarkId)))
      .filter(Boolean)
      .sort(),
  );
  if (JSON.stringify(actual) !== JSON.stringify(EXPECTED_SEARCH_BOOKMARK_IDS)) {
    throw new Error(
      `搜索截图结果与固定 fixture 不一致：${actual.join(", ") || "无结果"}`,
    );
  }
}

async function clickButtonByText(page, scopeSelector, text) {
  const clicked = await page.evaluate(
    (scope, wanted) => {
      const root = scope ? document.querySelector(scope) : document;
      if (!root) return false;
      const button = Array.from(root.querySelectorAll("button")).find(
        (item) => item.textContent?.trim().includes(wanted),
      );
      if (!button) return false;
      button.click();
      return true;
    },
    scopeSelector,
    text,
  );
  if (!clicked) {
    throw new Error(`找不到按钮：${scopeSelector ?? "document"} 内含「${text}」`);
  }
}

/** 各截图的交互流程。page 已停在主页。 */
const SHOTS = {
  async home(page) {
    // 纯主页全景（时钟、搜索框、书签网格、分类轨道），无需交互
  },

  async search(page) {
    // 使用脚本内仅监听回环地址的固定 Provider，真实走产品查询规划与本地证据排序。
    await clickButtonByText(page, ".mode-switch", "Bookmarks");
    await page.click('.search-bar input[aria-label]');
    await page.type('.search-bar input[aria-label]', "域名分析", { delay: 60 });
    await page.keyboard.press("Enter");
    await assertSearchFixture(page);
    await waitStable(page, 600);
  },

  async tags(page) {
    // 书签在首屏小部件面板之下，先滚动到书签网格再右键
    const tile = await page.waitForSelector(
      '[data-bookmark-id="preview-google"]',
      { timeout: 15_000 },
    );
    await tile.evaluate((el) =>
      el.scrollIntoView({ behavior: "auto", block: "center" }),
    );
    await sleep(800);
    const box = await tile.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, {
      button: "right",
    });
    await page.waitForSelector(".context-menu", { timeout: 10_000 });
    await clickButtonByText(page, ".context-menu", "编辑");
    await page.waitForSelector(".modal-form", { timeout: 10_000 });
    await waitStable(page, 800);
  },

  async command(page) {
    await page.click('.search-bar input[aria-label]');
    await page.keyboard.press("/");
    await page.waitForSelector(".command-suggestions", { timeout: 10_000 });
    await waitStable(page, 800);
  },

  async health(page) {
    await page.click(".settings-button");
    await page.waitForSelector(".settings-navigation", { timeout: 10_000 });
    await clickButtonByText(page, ".settings-navigation", "书签体检");
    await sleep(1500);
    await waitStable(page, 800);
  },

  async settings(page) {
    await page.click(".settings-button");
    await page.waitForSelector(".settings-navigation", { timeout: 10_000 });
    await clickButtonByText(page, ".settings-navigation", "背景与外观");
    await sleep(1500);
    await waitStable(page, 800);
  },
};

async function startPreviewProvider() {
  const plan = JSON.stringify({
    searchMode: "topic",
    interpretation: "查找域名分析工具",
    exactTerms: ["域名分析"],
    equivalentTerms: [],
    relatedTerms: [],
    requiredConcepts: [],
    downrankTerms: [],
  });
  const server = createServer((request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    if (request.method === "OPTIONS") {
      response.writeHead(204).end();
      return;
    }
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(
      JSON.stringify({ choices: [{ message: { content: plan } }] }),
    );
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("无法启动本地截图 Provider");
  }
  return {
    endpoint: `http://127.0.0.1:${address.port}/v1`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}

async function main() {
  const names = process.argv.slice(2);
  const targets = names.length > 0 ? names : Object.keys(SHOTS);
  for (const name of targets) {
    if (!SHOTS[name]) {
      console.error(`未知截图：${name}（可选：${Object.keys(SHOTS).join(", ")}）`);
      process.exitCode = 1;
      continue;
    }
  }

  await mkdir(OUT_DIR, { recursive: true });
  const previewProvider = await startPreviewProvider();
  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ["--hide-scrollbars", "--force-device-scale-factor=2"],
    });
    for (const name of targets) {
      if (!SHOTS[name]) continue;
      const page = await browser.newPage();
      await page.setViewport(VIEWPORT);
      try {
        await openHome(page, previewProvider.endpoint);
        await SHOTS[name](page);
        const file = path.join(OUT_DIR, OUTPUT_FILE_NAMES[name]);
        await page.screenshot({ path: file });
        console.log(`✔ ${OUTPUT_FILE_NAMES[name]}`);
      } catch (error) {
        console.error(`✘ ${name}: ${error.message}`);
        process.exitCode = 1;
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser?.close();
    await previewProvider.close();
  }
}

await main();
