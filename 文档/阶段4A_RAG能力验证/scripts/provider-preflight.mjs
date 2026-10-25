import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const local = {};
const localPath = path.join(root, ".env.local");
if (fs.existsSync(localPath)) {
  for (const line of fs.readFileSync(localPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...parts] = trimmed.split("=");
    local[key.trim()] = parts.join("=").trim();
  }
}
const valueOf = name => process.env[name] || local[name];

const providers = {
  fastgpt: ["RAG_BASE_URL", "RAG_API_KEY", "RAG_FASTGPT_TEAM_ID"],
  dify: ["RAG_BASE_URL", "RAG_API_KEY", "RAG_DIFY_DATASET_ID", "RAG_DIFY_APP_ID"],
  ragflow: ["RAG_BASE_URL", "RAG_API_KEY", "RAG_RAGFLOW_DATASET_ID"]
};
const selected = String(valueOf("RAG_PROVIDER") || "").toLowerCase();
const candidates = selected ? [selected] : Object.keys(providers);

for (const provider of candidates) {
  if (!providers[provider]) {
    console.error(`FAILED: unknown RAG_PROVIDER=${provider}`);
    process.exitCode = 1;
    continue;
  }
  const missing = providers[provider].filter(name => !valueOf(name));
  if (missing.length) {
    console.log(`${provider}: NOT_READY missing=${missing.join(",")}`);
  } else {
    console.log(`${provider}: CONFIGURED (values intentionally not printed)`);
  }
}

if (!Object.keys(providers).some(provider => providers[provider].every(name => valueOf(name)))) {
  process.exitCode = 1;
}
