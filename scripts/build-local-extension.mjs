import { spawn } from "node:child_process";
import { createHash, createPublicKey } from "node:crypto";
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
const developmentBuildPath = path.join(projectRoot, "development-build.json");
const productionPublicKeyPath = path.join(
  projectRoot,
  "config",
  "production-extension-public-key.txt",
);
const outputDirectory = path.join(projectRoot, ".output", "chrome-mv3");
const releaseRoot = path.join(projectRoot, "release");
const identity = parseIdentity(process.argv.slice(2));
const identityConfig = await resolveIdentityConfig(identity);
const targetName =
  identity === "production"
    ? "SmartAINewTab-production-id-qa-extension"
    : "SmartAINewTab-local-extension";
const targetDirectory = path.join(releaseRoot, targetName);
const transactionId = `${Date.now()}-${process.pid}`;
const nextDirectory = path.join(
  releaseRoot,
  `.${targetName}.next-${transactionId}`,
);
const previousDirectory = path.join(
  releaseRoot,
  `.${targetName}.previous-${transactionId}`,
);

const packageDocument = JSON.parse(await readFile(packagePath, "utf8"));
const originalDevelopmentBuildText = await readFile(developmentBuildPath, "utf8");
const developmentBuildDocument = JSON.parse(originalDevelopmentBuildText);
const productionVersion = packageDocument.version;
assertProductionVersion(productionVersion);
assertDevelopmentBuild(developmentBuildDocument);
const nextBuild =
  developmentBuildDocument.baseVersion === productionVersion
    ? developmentBuildDocument.build + 1
    : 1;
if (nextBuild > 65_535) {
  throw new Error(
    "Development build counter is exhausted for the current production version; bump package.json version first",
  );
}
const nextVersion = `${productionVersion}.${nextBuild}`;
const nextVersionName =
  identity === "production"
    ? `${productionVersion}-prod-id-qa.${nextBuild}`
    : `${productionVersion}-dev.${nextBuild}`;
let developmentBuildChanged = false;
let previousReleaseMoved = false;
let releaseUpdated = false;

try {
  await writeJson(developmentBuildPath, {
    baseVersion: productionVersion,
    build: nextBuild,
  });
  developmentBuildChanged = true;

  await run("npm", ["run", "check"], {
    environment: {
      SMARTAINEWTAB_LOCAL_RELEASE: "1",
      SMARTAINEWTAB_LOCAL_VERSION: nextVersion,
      SMARTAINEWTAB_LOCAL_VERSION_NAME: nextVersionName,
      ...(identityConfig.publicKey
        ? { SMARTAINEWTAB_LOCAL_EXTENSION_KEY: identityConfig.publicKey }
        : {}),
    },
    removeEnvironment:
      identity === "development"
        ? ["SMARTAINEWTAB_LOCAL_EXTENSION_KEY"]
        : [],
  });
  await verifyBuiltExtension(
    outputDirectory,
    nextVersion,
    nextVersionName,
    identityConfig.expectedExtensionId,
  );

  await mkdir(releaseRoot, { recursive: true });
  await rm(nextDirectory, { recursive: true, force: true });
  await cp(outputDirectory, nextDirectory, { recursive: true });
  await verifyBuiltExtension(
    nextDirectory,
    nextVersion,
    nextVersionName,
    identityConfig.expectedExtensionId,
  );

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

  console.log(
    `${identityConfig.label} released: production ${productionVersion}; local ${nextVersionName}`,
  );
  console.log(`Extension ID: ${identityConfig.expectedExtensionId}`);
  console.log(targetDirectory);
} catch (error) {
  if (developmentBuildChanged && !releaseUpdated) {
    await writeFile(
      developmentBuildPath,
      originalDevelopmentBuildText,
      "utf8",
    );
  }
  await rm(nextDirectory, { recursive: true, force: true });
  if (previousReleaseMoved && !(await exists(targetDirectory))) {
    await rename(previousDirectory, targetDirectory);
  }
  throw error;
}

function parseIdentity(args) {
  if (args.length === 0) return "development";
  if (args.length === 1 && args[0] === "--identity=production") {
    return "production";
  }
  throw new Error(
    `Unsupported arguments: ${args.join(" ")}. Expected no arguments or --identity=production`,
  );
}

async function resolveIdentityConfig(selectedIdentity) {
  if (selectedIdentity === "development") {
    return {
      label: "Local development Chrome extension",
      expectedExtensionId: "akbemgeeppcdocpjimlkbhfoambjigej",
      publicKey: undefined,
    };
  }

  const configuredKey =
    process.env.SMARTAINEWTAB_PRODUCTION_PUBLIC_KEY ??
    (await readOptionalFile(productionPublicKeyPath));
  if (!configuredKey) {
    throw new Error(
      `Production public key is required. Set SMARTAINEWTAB_PRODUCTION_PUBLIC_KEY or create ${productionPublicKeyPath} from Chrome Web Store Developer Dashboard > Package > View public key`,
    );
  }
  const publicKey = normalizePublicKey(configuredKey);
  const expectedExtensionId = "hdajgpnnncgdddpjbdggaochnbgpfngl";
  const actualExtensionId = extensionIdFromPublicKey(publicKey);
  if (actualExtensionId !== expectedExtensionId) {
    throw new Error(
      `Production public key mismatch: expected ${expectedExtensionId}, received ${actualExtensionId}`,
    );
  }
  return {
    label: "Production-ID QA Chrome extension",
    expectedExtensionId,
    publicKey,
  };
}

function assertProductionVersion(version) {
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
      `Production version must contain exactly three integers from 0 to 65535; received ${version}`,
    );
  }
}

function assertDevelopmentBuild(document) {
  assertProductionVersion(document.baseVersion);
  if (
    !Number.isInteger(document.build) ||
    document.build < 0 ||
    document.build > 65_535
  ) {
    throw new Error(
      `Development build must be an integer from 0 to 65535; received ${document.build}`,
    );
  }
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

async function verifyBuiltExtension(
  directory,
  expectedVersion,
  expectedVersionName,
  expectedExtensionId,
) {
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
  if (manifest.version_name !== expectedVersionName) {
    throw new Error(
      `Manifest version name mismatch: expected ${expectedVersionName}, received ${manifest.version_name}`,
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

function normalizePublicKey(value) {
  const normalized = value
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "");
  if (!normalized || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new Error("Extension public key must be a base64-encoded SPKI public key");
  }
  const der = Buffer.from(normalized, "base64");
  createPublicKey({ key: der, format: "der", type: "spki" });
  return der.toString("base64");
}

function extensionIdFromPublicKey(key) {
  const normalizedKey = normalizePublicKey(key);
  const digest = createHash("sha256")
    .update(Buffer.from(normalizedKey, "base64"))
    .digest()
    .subarray(0, 16);

  return [...digest]
    .flatMap((byte) => [byte >> 4, byte & 0x0f])
    .map((nibble) => String.fromCharCode("a".charCodeAt(0) + nibble))
    .join("");
}

async function readOptionalFile(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return undefined;
    throw error;
  }
}

async function run(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const environment = {
      ...process.env,
      ...options.environment,
    };
    for (const name of options.removeEnvironment ?? []) delete environment[name];
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: environment,
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
