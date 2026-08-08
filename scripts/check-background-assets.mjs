import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const expectedAssets = new Map([
  [
    "alpine-milky-way.webp",
    "be0b7c9a461837ed188b2937601eeb1a15556943cd202ce7f6627355885930ef",
  ],
  [
    "copper-dunes.webp",
    "fe2b99bce155ef2e468c50200906a3286a808475e604b481e87c8fe4d8ff23eb",
  ],
  [
    "emerald-forest.webp",
    "26fd6890d6e6bfe2f40b8c8737c92431c042e3d28001496c328a78d0c544ddfa",
  ],
  [
    "sea-cliffs.webp",
    "9d0d3aba8952f84b3109bd5b959789bb09921fb2f91e6c1cf5aaeaee69cae4b1",
  ],
  [
    "snow-peaks.webp",
    "b07cf211dea5fe4639404c793ea1cedd98bc79790a9930572739283cd6cd9713",
  ],
]);

const failures = [];
for (const [fileName, expectedHash] of expectedAssets) {
  const filePath = path.join(
    projectRoot,
    "public",
    "assets",
    "backgrounds",
    fileName,
  );
  let contents;
  try {
    contents = await readFile(filePath);
  } catch (error) {
    failures.push(`${fileName}: ${error.message}`);
    continue;
  }
  const actualHash = createHash("sha256").update(contents).digest("hex");
  if (actualHash !== expectedHash) {
    failures.push(
      `${fileName}: expected ${expectedHash}, received ${actualHash}`,
    );
  }
}

if (failures.length > 0) {
  console.error("Background provenance check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  console.error(
    "Review the source and visual content before updating provenance hashes.",
  );
  process.exitCode = 1;
} else {
  console.log(`Background provenance verified (${expectedAssets.size} assets).`);
}
