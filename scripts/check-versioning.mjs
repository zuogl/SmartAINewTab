import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageDocument = await readJson(path.join(projectRoot, "package.json"));
const lockDocument = await readJson(path.join(projectRoot, "package-lock.json"));
const developmentDocument = await readJson(
  path.join(projectRoot, "development-build.json"),
);

assertChromeProductionVersion(packageDocument.version, "package.json version");
if (lockDocument.version !== packageDocument.version) {
  throw new Error(
    `package-lock.json version mismatch: expected ${packageDocument.version}, received ${lockDocument.version}`,
  );
}
if (lockDocument.packages?.[""]?.version !== packageDocument.version) {
  throw new Error(
    `package-lock.json root package version mismatch: expected ${packageDocument.version}, received ${lockDocument.packages?.[""]?.version}`,
  );
}

assertChromeProductionVersion(
  developmentDocument.baseVersion,
  "development-build.json baseVersion",
);
if (
  !Number.isInteger(developmentDocument.build) ||
  developmentDocument.build < 0 ||
  developmentDocument.build > 65_535
) {
  throw new Error(
    `development-build.json build must be an integer from 0 to 65535; received ${developmentDocument.build}`,
  );
}
if (
  developmentDocument.baseVersion === packageDocument.version &&
  developmentDocument.build === 65_535
) {
  throw new Error(
    "Development build counter is exhausted for the current production version; bump package.json version first",
  );
}

const nextBuild =
  developmentDocument.baseVersion === packageDocument.version
    ? developmentDocument.build + 1
    : 1;
console.log(
  `Versioning verified: production ${packageDocument.version}; next local build ${packageDocument.version}.${nextBuild}`,
);

function assertChromeProductionVersion(version, label) {
  const parts = typeof version === "string" ? version.split(".") : [];
  if (
    parts.length !== 3 ||
    parts.some(
      (part) =>
        !/^(0|[1-9]\d*)$/.test(part) ||
        Number(part) < 0 ||
        Number(part) > 65_535,
    )
  ) {
    throw new Error(
      `${label} must contain exactly three integers from 0 to 65535; received ${version}`,
    );
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}
