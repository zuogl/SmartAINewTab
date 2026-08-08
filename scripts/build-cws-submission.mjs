#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  copyFile,
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT_DIR = path.join(ROOT, ".output/chrome-mv3");
const STORE_ASSETS = path.join(ROOT, "store-assets");
const ARTIFACT_ROOT = path.join(ROOT, "artifacts/chrome-web-store");
const packageDocument = JSON.parse(
  await readFile(path.join(ROOT, "package.json"), "utf8"),
);
const version = packageDocument.version;
const artifactDirectory = path.join(ARTIFACT_ROOT, version);
const zipName = `SmartAINewTab-${version}-chrome-web-store.zip`;
const zipPath = path.join(artifactDirectory, zipName);

assertSafeArtifactPath(artifactDirectory);
run("npm", ["run", "store-assets:generate"]);
run("npm", ["run", "build"], { removeLocalReleaseFlag: true });

const builtManifest = await readJson(path.join(OUTPUT_DIR, "manifest.json"));
if (builtManifest.version !== version) {
  throw new Error(
    `Production manifest version mismatch: expected ${version}, received ${builtManifest.version}`,
  );
}
if ("key" in builtManifest) {
  throw new Error("Production manifest must not contain the local development key");
}
await Promise.all([
  access(path.join(OUTPUT_DIR, "manifest.json")),
  access(path.join(OUTPUT_DIR, "newtab.html")),
  access(path.join(OUTPUT_DIR, "background.js")),
  access(path.join(OUTPUT_DIR, "icon/128.png")),
]);

await validateStoreAssets();
await rm(artifactDirectory, { recursive: true, force: true });
await mkdir(path.join(artifactDirectory, "assets/screenshots"), { recursive: true });
await mkdir(path.join(artifactDirectory, "assets/promotional"), { recursive: true });
await mkdir(path.join(artifactDirectory, "listing"), { recursive: true });

const extensionFiles = await walkFiles(OUTPUT_DIR);
run(
  "zip",
  ["-q", "-X", zipPath, ...extensionFiles],
  { cwd: OUTPUT_DIR },
);

const archivedManifestText = run(
  "unzip",
  ["-p", zipPath, "manifest.json"],
  { capture: true },
);
const archivedManifest = JSON.parse(archivedManifestText);
if (archivedManifest.version !== version || "key" in archivedManifest) {
  throw new Error("Archived manifest failed version or production-key verification");
}

await Promise.all([
  copyFile(
    path.join(STORE_ASSETS, "icons/icon-128.png"),
    path.join(artifactDirectory, "assets/icon-128.png"),
  ),
  ...["01-home.png", "02-search.png", "03-command.png", "04-tags.png", "05-health.png"].map(
    (name) =>
      copyFile(
        path.join(STORE_ASSETS, "screenshots", name),
        path.join(artifactDirectory, "assets/screenshots", name),
      ),
  ),
  ...["small-440x280.png", "marquee-1400x560.png"].map((name) =>
    copyFile(
      path.join(STORE_ASSETS, "promotional", name),
      path.join(artifactDirectory, "assets/promotional", name),
    ),
  ),
  cp(
    path.join(STORE_ASSETS, "listing"),
    path.join(artifactDirectory, "listing"),
    { recursive: true },
  ),
  copyFile(
    path.join(ROOT, "docs/CHROME_WEB_STORE.md"),
    path.join(artifactDirectory, "SUBMISSION_GUIDE.md"),
  ),
]);

const zipStats = await stat(zipPath);
const report = {
  product: "SmartAINewTab",
  version,
  uploadPackage: zipName,
  uploadPackageBytes: zipStats.size,
  manifestAtZipRoot: true,
  manifestContainsDevelopmentKey: false,
  storeAssets: {
    icon: "assets/icon-128.png",
    screenshots: 5,
    smallPromo: "assets/promotional/small-440x280.png",
    marqueePromo: "assets/promotional/marquee-1400x560.png",
  },
  unresolvedPublisherFields: [
    "official HTTPS domain and verified Search Console property",
    "developer contact email and working support channel",
    "trader or non-trader declaration",
    "distribution choice",
    "production OAuth and cross-device cloud acceptance if cloud backup is enabled",
  ],
};
await writeFile(
  path.join(artifactDirectory, "submission-report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);

const checksumFiles = (await walkFiles(artifactDirectory)).filter(
  (name) => name !== "SHA256SUMS",
);
const checksumLines = [];
for (const name of checksumFiles) {
  const digest = createHash("sha256")
    .update(await readFile(path.join(artifactDirectory, name)))
    .digest("hex");
  checksumLines.push(`${digest}  ${name}`);
}
await writeFile(
  path.join(artifactDirectory, "SHA256SUMS"),
  `${checksumLines.join("\n")}\n`,
  "utf8",
);

console.log(`Chrome Web Store submission package prepared: ${version}`);
console.log(artifactDirectory);
console.log(zipPath);

async function validateStoreAssets() {
  const expected = new Map([
    ["icons/icon-128.png", [128, 128, true]],
    ["screenshots/01-home.png", [1280, 800, false]],
    ["screenshots/02-search.png", [1280, 800, false]],
    ["screenshots/03-command.png", [1280, 800, false]],
    ["screenshots/04-tags.png", [1280, 800, false]],
    ["screenshots/05-health.png", [1280, 800, false]],
    ["promotional/small-440x280.png", [440, 280, false]],
    ["promotional/marquee-1400x560.png", [1400, 560, false]],
  ]);
  for (const [name, [width, height, requiresAlpha]] of expected) {
    const info = pngInfo(await readFile(path.join(STORE_ASSETS, name)));
    if (info.width !== width || info.height !== height) {
      throw new Error(
        `${name} has ${info.width}x${info.height}; expected ${width}x${height}`,
      );
    }
    if (requiresAlpha && ![4, 6].includes(info.colorType)) {
      throw new Error(`${name} must contain an alpha channel for transparent padding`);
    }
  }
}

function pngInfo(buffer) {
  const signature = buffer.subarray(0, 8).toString("hex");
  if (signature !== "89504e470d0a1a0a") throw new Error("Invalid PNG signature");
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    colorType: buffer.readUInt8(25),
  };
}

async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function walkFiles(directory, prefix = "") {
  const names = (await readdir(directory)).sort();
  const files = [];
  for (const name of names) {
    const absolute = path.join(directory, name);
    const relative = path.posix.join(prefix, name);
    const details = await stat(absolute);
    if (details.isDirectory()) files.push(...(await walkFiles(absolute, relative)));
    else if (details.isFile()) files.push(relative);
  }
  return files;
}

function assertSafeArtifactPath(directory) {
  const resolved = path.resolve(directory);
  if (
    !resolved.startsWith(`${ARTIFACT_ROOT}${path.sep}`) ||
    path.basename(resolved) !== version
  ) {
    throw new Error(`Refusing to replace unsafe artifact path: ${directory}`);
  }
}

function run(command, args, options = {}) {
  const environment = { ...process.env };
  if (options.removeLocalReleaseFlag) delete environment.SMARTAINEWTAB_LOCAL_RELEASE;
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    env: environment,
    encoding: options.capture ? "utf8" : undefined,
    stdio: options.capture ? ["ignore", "pipe", "inherit"] : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}`);
  }
  return options.capture ? result.stdout : "";
}
