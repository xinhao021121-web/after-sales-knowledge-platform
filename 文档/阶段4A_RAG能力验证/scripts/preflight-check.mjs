import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const failures = [];

const ignoredDirs = new Set(["node_modules", ".git", "output"]);
const textExtensions = new Set([".md", ".json", ".csv", ".js", ".mjs", ".yaml", ".yml", ".html", ".txt", ".ps1"]);
const secretPatterns = [
  {name: "OpenAI-style key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g},
  {name: "Bearer token", pattern: /Bearer\s+[A-Za-z0-9._-]{20,}/g},
  {name: "assigned API key", pattern: /\b(?:api[_-]?key|secret|token)\b\s*[:=]\s*["'][^"']{12,}["']/gi}
];
const piiPatterns = [
  {name: "mainland mobile", pattern: /(?<![0-9A-Za-z-])1[3-9]\d{9}(?![0-9A-Za-z-])/g},
  {name: "email", pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi}
];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    if (ignoredDirs.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    const relative = path.relative(root, fullPath);
    if (/^\.env(?:\.|$)/.test(entry.name) && entry.name !== ".env.example") {
      let ignored = false;
      try {
        execFileSync("git", ["check-ignore", "-q", fullPath], {cwd: root, stdio: "ignore"});
        ignored = true;
      } catch {}
      if (!ignored) failures.push(`${relative}: real environment file exists but is not Git-ignored`);
      continue;
    }
    if (!textExtensions.has(path.extname(entry.name))) continue;
    const content = fs.readFileSync(fullPath, "utf8");
    for (const check of [...secretPatterns, ...piiPatterns]) {
      if (check.pattern.test(content)) failures.push(`${relative}: possible ${check.name}`);
      check.pattern.lastIndex = 0;
    }
  }
}

walk(root);

const candidateManifest = JSON.parse(fs.readFileSync(path.join(root, "datasets", "CANDIDATE", "manifest.json"), "utf8"));
const testManifest = JSON.parse(fs.readFileSync(path.join(root, "datasets", "TEST", "manifest.json"), "utf8"));
if (candidateManifest.contains_real_customer_data !== false || testManifest.contains_real_customer_data !== false) {
  failures.push("dataset manifest must declare contains_real_customer_data=false");
}
if (!candidateManifest.documents.every(document => document.rag_allowed === true)) {
  failures.push("CANDIDATE contains a document not allowed in RAG");
}

const localConfigPath = path.join(root, ".env.local");
if (fs.existsSync(localConfigPath)) {
  const names = fs.readFileSync(localConfigPath, "utf8").split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("#") && line.includes("="))
    .map(line => line.split("=", 1)[0].trim());
  for (const requiredName of ["RAG_PROVIDER", "RAG_BASE_URL", "RAG_API_KEY", "RAG_DIFY_DATASET_ID", "RAG_DIFY_APP_ID"]) {
    if (!names.includes(requiredName)) failures.push(`.env.local missing variable name ${requiredName}`);
  }
}

if (failures.length) {
  console.error(`FAILED: ${failures.length} security preflight issue(s)`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("PASSED: no committed env file, secret-like token, phone number or email detected; dataset safety declarations valid.");
