import puppeteer from "puppeteer-core";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const url = process.argv[2] ?? "http://localhost:3000";
const out = process.argv[3] ?? "/tmp/site.png";
const width = Number(process.argv[4] ?? 1440);
const height = Number(process.argv[5] ?? 1000);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--hide-scrollbars", "--force-device-scale-factor=1"],
});
const page = await browser.newPage();
await page.setViewport({ width, height, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });

// 逐屏滚动到底，触发所有 IntersectionObserver 显现动画，再回到顶部
await page.evaluate(async () => {
  const step = window.innerHeight * 0.8;
  for (let y = 0; y < document.body.scrollHeight; y += step) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 220));
  }
  window.scrollTo(0, 0);
});
await new Promise((r) => setTimeout(r, 1200));

await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log("saved", out);
