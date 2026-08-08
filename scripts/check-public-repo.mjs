#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const files = execFileSync(
  "git",
  ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);

const failures = [];
const blockedPrefixes = [
  ".output/",
  ".wrangler/",
  "artifacts/",
  "backups/",
  "coverage/",
  "exports/",
  "node_modules/",
  "qa/",
  "release/",
  "website/",
  "worker/.wrangler/",
  "worker/node_modules/",
];
const blockedFilePatterns = [
  /^\.env(?!\.example$)/,
  /^worker\/\.dev\.vars(?!\.example$)/,
  /^worker\/wrangler\.production\.jsonc$/,
  /\.(?:har|key|p12|pem|pfx|sqlite(?:-shm|-wal)?)$/i,
];
const personalHandle = ["zuogl", "448"].join("");
const productionDatabaseId = [
  "6d11df1d",
  "c826",
  "41be",
  "a6c7",
  "cfd1dc290881",
].join("-");
const textRules = [
  { label: "本机绝对用户路径", pattern: /\/Users\/[A-Za-z0-9._-]+\// },
  {
    label: "私钥正文",
    pattern: /-----BEGIN (?:EC |OPENSSH |RSA )?PRIVATE KEY-----/,
  },
  { label: "个人部署标识", pattern: new RegExp(personalHandle, "i") },
  { label: "个人邮箱", pattern: /[A-Z0-9._%+-]+@163\.com/i },
  {
    label: "维护者生产 D1 标识",
    pattern: new RegExp(productionDatabaseId, "i"),
  },
  { label: "Google API Key", pattern: /AIza[0-9A-Za-z_-]{30,}/ },
  { label: "GitHub Token", pattern: /gh[opsu]_[0-9A-Za-z]{30,}/ },
  { label: "常见明文 API Key", pattern: /\bsk-[0-9A-Za-z_-]{20,}/ },
];
const credentialAssignment =
  /(?:api[_-]?key|client[_-]?secret|access[_-]?token)\s*[:=]\s*["']([^"'<>$\s]{12,})["']/gi;
const obviousFixtureValue =
  /(?:example|fake|local|must-never|must-not|new-provider|old-provider|placeholder|replace|same-provider|test-only)/i;

for (const file of files) {
  if (
    blockedPrefixes.some((prefix) => file.startsWith(prefix)) ||
    blockedFilePatterns.some((pattern) => pattern.test(file))
  ) {
    failures.push(`${file}: 不应进入公开仓库`);
    continue;
  }
  const data = await readFile(file).catch(() => undefined);
  if (!data || data.includes(0)) continue;
  const text = data.toString("utf8");
  for (const rule of textRules) {
    if (rule.pattern.test(text)) failures.push(`${file}: ${rule.label}`);
  }
  for (const match of text.matchAll(credentialAssignment)) {
    if (!obviousFixtureValue.test(match[1] ?? "")) {
      failures.push(`${file}: 疑似明文凭据赋值`);
    }
  }
}

let gitEmail = "";
try {
  gitEmail = execFileSync("git", ["config", "--get", "user.email"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
} catch {
  // CI checkouts commonly have no commit identity configured.
}
if (gitEmail && !/@users\.noreply\.github\.com$/i.test(gitEmail)) {
  failures.push("Git user.email 不是 GitHub noreply 地址，首次提交会公开真实邮箱");
}

if (failures.length > 0) {
  console.error("公开仓库边界检查失败：");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`公开仓库边界检查通过：${files.length} 个候选文件，未发现已知敏感模式。`);
