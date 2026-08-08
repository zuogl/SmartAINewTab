import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  cp,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const packagePath = path.join(projectRoot, "package.json");
const lockPath = path.join(projectRoot, "package-lock.json");
const outputDirectory = path.join(projectRoot, ".output", "chrome-mv3");
const releaseRoot = path.join(projectRoot, "release");
const targetDirectory = path.join(releaseRoot, "SmartAINewTab-local-extension");
const transactionId = `${Date.now()}-${process.pid}`;
const nextDirectory = path.join(
  releaseRoot,
  `.SmartAINewTab-local-extension.next-${transactionId}`,
);
const previousDirectory = path.join(
  releaseRoot,
  `.SmartAINewTab-local-extension.previous-${transactionId}`,
);
const expectedExtensionId = "akbemgeeppcdocpjimlkbhfoambjigej";

const originalPackageText = await readFile(packagePath, "utf8");
const originalLockText = await readFile(lockPath, "utf8");
const packageDocument = JSON.parse(originalPackageText);
const lockDocument = JSON.parse(originalLockText);
const previousVersion = packageDocument.version;
const nextVersion = incrementPatchVersion(previousVersion);
let versionFilesChanged = false;
let previousReleaseMoved = false;
let releaseUpdated = false;

try {
  packageDocument.version = nextVersion;
  lockDocument.version = nextVersion;
  if (lockDocument.packages?.[""]) {
    lockDocument.packages[""].version = nextVersion;
  }
  await Promise.all([
    writeJson(packagePath, packageDocument),
    writeJson(lockPath, lockDocument),
  ]);
  versionFilesChanged = true;

  await run("npm", ["run", "check"], {
    SMARTAINEWTAB_LOCAL_RELEASE: "1",
  });
  await verifyBuiltExtension(outputDirectory, nextVersion);

  await mkdir(releaseRoot, { recursive: true });
  await rm(nextDirectory, { recursive: true, force: true });
  await cp(outputDirectory, nextDirectory, { recursive: true });
  await verifyBuiltExtension(nextDirectory, nextVersion);

  await rm(previousDirectory, { recursive: true, force: true });
  if (await exists(targetDirectory)) {
    await rename(targetDirectory, previousDirectory);
    previousReleaseMoved = true;
  }

  try {
    await rename(nextDirectory, targetDirectory);
    releaseUpdated = true;
  } catch (error) {
    if (previousReleaseMoved && !(await exists(targetDirectory))) {
      await rename(previousDirectory, targetDirectory);
      previousReleaseMoved = false;
    }
    throw error;
  }

  if (previousReleaseMoved) {
    await rm(previousDirectory, { recursive: true, force: true });
    previousReleaseMoved = false;
  }

  console.log(`Local Chrome extension released: ${previousVersion} -> ${nextVersion}`);
  console.log(targetDirectory);
} catch (error) {
  if (versionFilesChanged && !releaseUpdated) {
    await Promise.all([
      writeFile(packagePath, originalPackageText, "utf8"),
      writeFile(lockPath, originalLockText, "utf8"),
    ]);
  }
  await rm(nextDirectory, { recursive: true, force: true });
  if (previousReleaseMoved && !(await exists(targetDirectory))) {
    await rename(previousDirectory, targetDirectory);
  }
  throw error;
}

function incrementPatchVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Unsupported package version: ${version}`);
  }
  const [, major, minor, patch] = match;
  return `${major}.${minor}.${Number(patch) + 1}`;
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function verifyBuiltExtension(directory, expectedVersion) {
  const resolvedDirectory = path.resolve(directory);
  if (!resolvedDirectory.startsWith(`${projectRoot}${path.sep}`)) {
    throw new Error(`Refusing to verify path outside project: ${directory}`);
  }

  const manifestPath = path.join(resolvedDirectory, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.version !== expectedVersion) {
    throw new Error(
      `Manifest version mismatch: expected ${expectedVersion}, received ${manifest.version}`,
    );
  }
  if (typeof manifest.key !== "string" || manifest.key.length === 0) {
    throw new Error(
      "Local release manifest is missing the fixed extension key",
    );
  }
  const actualExtensionId = extensionIdFromPublicKey(manifest.key);
  if (actualExtensionId !== expectedExtensionId) {
    throw new Error(
      `Local release extension ID mismatch: expected ${expectedExtensionId}, received ${actualExtensionId}`,
    );
  }
  await Promise.all([
    access(path.join(resolvedDirectory, "newtab.html")),
    access(path.join(resolvedDirectory, "background.js")),
  ]);
}

function extensionIdFromPublicKey(key) {
  const digest = createHash("sha256")
    .update(Buffer.from(key, "base64"))
    .digest()
    .subarray(0, 16);

  return [...digest]
    .flatMap((byte) => [byte >> 4, byte & 0x0f])
    .map((nibble) => String.fromCharCode("a".charCodeAt(0) + nibble))
    .join("");
}

async function run(command, args, extraEnvironment = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: {
        ...process.env,
        ...extraEnvironment,
      },
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} failed (${signal || `exit ${code}`})`,
        ),
      );
    });
  });
}
