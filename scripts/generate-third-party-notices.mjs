import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lock = JSON.parse(
  await readFile(path.join(projectRoot, "package-lock.json"), "utf8"),
);

const packages = new Map();
for (const [installPath, lockEntry] of Object.entries(lock.packages ?? {})) {
  if (!installPath.includes("node_modules/") || lockEntry.dev === true) continue;
  const packageDirectory = path.join(projectRoot, installPath);
  let metadata;
  try {
    metadata = JSON.parse(
      await readFile(path.join(packageDirectory, "package.json"), "utf8"),
    );
  } catch {
    continue;
  }
  const key = `${metadata.name}@${metadata.version}`;
  if (packages.has(key)) continue;

  const licenseFiles = (await readdir(packageDirectory, { withFileTypes: true }))
    .filter(
      (entry) =>
        entry.isFile() && /^(?:licen[cs]e|notice)(?:\.|$)/i.test(entry.name),
    )
    .map((entry) => entry.name)
    .sort();
  const licenseTexts = [];
  for (const fileName of licenseFiles) {
    licenseTexts.push({
      fileName,
      text: (await readFile(path.join(packageDirectory, fileName), "utf8")).trim(),
    });
  }
  const repository =
    typeof metadata.repository === "string"
      ? metadata.repository
      : metadata.repository?.url;
  packages.set(key, {
    name: metadata.name,
    version: metadata.version,
    license: metadata.license ?? "See package metadata",
    homepage: metadata.homepage ?? repository ?? "Not provided",
    licenseTexts,
  });
}

const lines = [
  "SmartAINewTab Third-Party Notices",
  "================================",
  "",
  "This file is generated from package-lock.json and installed production dependencies.",
  "Do not edit it manually; run `npm run notices:generate` after dependency changes.",
  "",
];
for (const item of [...packages.values()].sort((a, b) =>
  `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`),
)) {
  lines.push("--------------------------------------------------------------------------------");
  lines.push(`${item.name}@${item.version}`);
  lines.push(`Declared license: ${item.license}`);
  lines.push(`Project: ${item.homepage}`);
  if (item.licenseTexts.length === 0) {
    lines.push("No top-level license file was present in the installed package.");
  } else {
    for (const licenseFile of item.licenseTexts) {
      lines.push("");
      lines.push(`[${licenseFile.fileName}]`);
      lines.push(licenseFile.text);
    }
  }
  lines.push("");
}

const outputPath = path.join(projectRoot, "public", "THIRD_PARTY_NOTICES.txt");
const generated = `${lines.join("\n")}\n`;
if (process.argv.includes("--check")) {
  const current = await readFile(outputPath, "utf8").catch(() => "");
  if (current !== generated) {
    console.error("Third-party notices are stale; run `npm run notices:generate`.");
    process.exitCode = 1;
  } else {
    console.log(`Third-party notices are current (${packages.size} packages).`);
  }
} else {
  await writeFile(outputPath, generated, "utf8");
  console.log(`Generated notices for ${packages.size} production packages.`);
}
