#!/usr/bin/env node

import puppeteer from "puppeteer-core";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "store-assets/screenshots");
const PROMO_SOURCE = path.join(ROOT, "store-assets/source/small-promo.svg");
const PROMO_OUT_DIR = path.join(ROOT, "store-assets/promotional");
const PROMO_OUTPUT = path.join(PROMO_OUT_DIR, "small-440x280.png");
const MARQUEE_SOURCE = path.join(ROOT, "store-assets/source/marquee.svg");
const MARQUEE_OUTPUT = path.join(PROMO_OUT_DIR, "marquee-1400x560.png");
const ICON_SOURCE = path.join(ROOT, "assets/brand/smart-ai-new-tab-app-icon.svg");
const EXTENSION_ICON_DIR = path.join(ROOT, "public/icon");
const STORE_ICON_DIR = path.join(ROOT, "store-assets/icons");
const ICON_SIZES = [16, 32, 48, 128];
const CHROME_PATH =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const STORE_SCREENSHOTS = [
  "01-home.png",
  "02-search.png",
  "03-command.png",
  "04-tags.png",
  "05-health.png",
];

await mkdir(OUT_DIR, { recursive: true });
await mkdir(PROMO_OUT_DIR, { recursive: true });
await mkdir(EXTENSION_ICON_DIR, { recursive: true });
await mkdir(STORE_ICON_DIR, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: CHROME_PATH,
  headless: true,
  args: ["--hide-scrollbars"],
});

try {
  const page = await browser.newPage();
  const iconSvg = await readFile(ICON_SOURCE, "utf8");
  for (const size of ICON_SIZES) {
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    await page.setContent(
      `<!doctype html><style>html,body{margin:0;width:${size}px;height:${size}px;overflow:hidden;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${iconSvg}`,
      { waitUntil: "load" },
    );
    const png = await page.screenshot({ type: "png", omitBackground: true });
    await Promise.all([
      writeFile(path.join(EXTENSION_ICON_DIR, `${size}.png`), png),
      writeFile(path.join(STORE_ICON_DIR, `icon-${size}.png`), png),
    ]);
    console.log(`✔ icon/${size}.png and store-assets/icons/icon-${size}.png`);
  }

  const promoSvg = await readFile(PROMO_SOURCE, "utf8");
  await page.setViewport({ width: 440, height: 280, deviceScaleFactor: 1 });
  await page.setContent(
    `<!doctype html><style>html,body{margin:0;width:440px;height:280px;overflow:hidden}</style>${promoSvg}`,
    { waitUntil: "load" },
  );
  await page.screenshot({ path: PROMO_OUTPUT });
  console.log("✔ promotional/small-440x280.png");

  const marqueeSvg = await readFile(MARQUEE_SOURCE, "utf8");
  await page.setViewport({ width: 1400, height: 560, deviceScaleFactor: 1 });
  await page.setContent(
    `<!doctype html><style>html,body{margin:0;width:1400px;height:560px;overflow:hidden}</style>${marqueeSvg}`,
    { waitUntil: "load" },
  );
  await page.screenshot({ path: MARQUEE_OUTPUT });
  console.log("✔ promotional/marquee-1400x560.png");

  for (const screenshot of STORE_SCREENSHOTS) {
    await access(path.join(OUT_DIR, screenshot));
    console.log(`✔ screenshots/${screenshot}`);
  }
  await page.close();
} finally {
  await browser.close();
}
