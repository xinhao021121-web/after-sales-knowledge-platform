import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const baselineEnv = path.resolve(root, "..", "阶段4A_RAG能力验证", ".env.local");
const failures = [];

function readEnv(filePath) {
  const env = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [name, ...parts] = trimmed.split("=");
    env[name.trim()] = parts.join("=").trim();
  }
  return env;
}

if (!fs.existsSync(baselineEnv)) {
  failures.push("缺少被 Git 忽略的服务端配置文件");
} else {
  try {
    execFileSync("git", ["check-ignore", "-q", baselineEnv], {cwd: root, stdio: "ignore"});
  } catch {
    failures.push(".env.local 未被 Git 忽略");
  }
  const env = readEnv(baselineEnv);
  if (env.RAG_GENERATION_MODEL !== "deepseek-v4-flash") failures.push("RAG_GENERATION_MODEL 不是 deepseek-v4-flash");
  if (env.RAG_DIFY_DATASET_ID !== "0d5a11ce-c017-4376-8099-d8e083243a7d") failures.push("CANDIDATE dataset_id 不一致");
  if (env.RAG_DIFY_APP_ID !== "4da4b901-0f6e-4f35-b89e-8170d83bb7e0") failures.push("Dify app_id 不一致");
}

const tracked = execFileSync("git", ["ls-files", "文档/阶段4B-1_生成模型对照"], {
  cwd: path.resolve(root, "..", ".."),
  encoding: "utf8"
});
if (tracked.split(/\r?\n/).some(name => /(?:^|\/)\.env(?:\.|$)/.test(name) && !name.endsWith(".env.example"))) {
  failures.push("阶段目录包含被 Git 跟踪的真实环境文件");
}

const disallowed = [
  {name: "密钥样例", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/},
  {name: "Bearer 凭据", pattern: /Bearer\s+[A-Za-z0-9._-]{20,}/}
];
for (const entry of fs.readdirSync(root, {recursive: true, withFileTypes: true})) {
  if (!entry.isFile() || !/\.(?:md|json|mjs|ps1)$/.test(entry.name)) continue;
  const filePath = path.join(entry.parentPath, entry.name);
  const content = fs.readFileSync(filePath, "utf8");
  for (const check of disallowed) {
    if (check.pattern.test(content)) failures.push(`${path.relative(root, filePath)} 疑似包含${check.name}`);
  }
}

if (failures.length) {
  console.error(`FAILED: ${failures.length} preflight issue(s)`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("PASSED: model variable, fixed Dify resources, ignored credentials and secret scan.");
