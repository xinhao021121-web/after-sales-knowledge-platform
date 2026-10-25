import fs from "node:fs";
import path from "node:path";

function parseEnvFile(filePath) {
  const values = {};
  if (!fs.existsSync(filePath)) return values;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [name, ...parts] = trimmed.split("=");
    const raw = parts.join("=").trim();
    values[name.trim()] = raw.replace(/^(['"])(.*)\1$/, "$2");
  }
  return values;
}

export function loadConfig(prototypeRoot, overrides = {}) {
  const fileEnv = parseEnvFile(path.join(prototypeRoot, ".env.local"));
  const env = {...fileEnv, ...process.env, ...overrides};
  const port = Number(env.BFF_PORT || 8787);
  const timeoutMs = Number(env.RAG_REQUEST_TIMEOUT_MS || 45000);
  const maxRetries = Number(env.RAG_MAX_RETRIES || 1);
  const allowedOrigins = String(
    env.BFF_ALLOWED_ORIGINS || `http://127.0.0.1:${port},http://localhost:${port}`
  ).split(",").map(value => value.trim()).filter(Boolean);
  const projectRoot = path.dirname(path.dirname(prototypeRoot));

  return {
    prototypeRoot,
    projectRoot,
    dataRoot: path.join(prototypeRoot, "data"),
    runtimeRoot: path.join(prototypeRoot, "data", "runtime"),
    provider: String(env.RAG_PROVIDER || "dify").toLowerCase(),
    baseUrl: String(env.RAG_BASE_URL || "").replace(/\/+$/, ""),
    apiKey: String(env.RAG_API_KEY || ""),
    datasetBaseUrl: String(env.RAG_DIFY_DATASET_BASE_URL || env.RAG_BASE_URL || "").replace(/\/+$/, ""),
    datasetApiKey: String(env.RAG_DIFY_DATASET_API_KEY || ""),
    appId: String(env.RAG_DIFY_APP_ID || ""),
    datasetId: String(env.RAG_DIFY_DATASET_ID || ""),
    generationModel: String(env.RAG_GENERATION_MODEL || ""),
    evaluationSetPath: path.join(projectRoot, "文档", "阶段4A_RAG能力验证", "evaluation", "eval-set-v1.0.json"),
    candidateManifestPath: path.join(projectRoot, "文档", "阶段4A_RAG能力验证", "datasets", "CANDIDATE", "manifest.json"),
    candidateDatasetRoot: path.join(projectRoot, "文档", "阶段4A_RAG能力验证", "datasets", "CANDIDATE"),
    requestTimeoutMs: Math.max(1000, timeoutMs),
    maxRetries: Math.max(0, Math.min(2, maxRetries)),
    host: String(env.BFF_HOST || "127.0.0.1"),
    port,
    allowedOrigins,
    demoTenant: String(env.BFF_DEMO_TENANT || "tenant-demo"),
    environment: String(env.BFF_ENVIRONMENT || "candidate")
  };
}

export function assertRuntimeConfig(config) {
  const missing = [
    ["RAG_BASE_URL", config.baseUrl],
    ["RAG_API_KEY", config.apiKey],
    ["RAG_DIFY_APP_ID", config.appId],
    ["RAG_DIFY_DATASET_ID", config.datasetId],
    ["RAG_GENERATION_MODEL", config.generationModel]
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) throw new Error(`Missing server configuration: ${missing.join(", ")}`);
  if (!config.baseUrl.startsWith("https://")) throw new Error("RAG_BASE_URL must use HTTPS");
  if (!config.allowedOrigins.every(origin => /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(origin))) {
    throw new Error("BFF_ALLOWED_ORIGINS may only contain local HTTP origins");
  }
}

export function assertDatasetConfig(config) {
  const missing = [
    ["RAG_DIFY_DATASET_BASE_URL", config.datasetBaseUrl],
    ["RAG_DIFY_DATASET_API_KEY", config.datasetApiKey],
    ["RAG_DIFY_DATASET_ID", config.datasetId]
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) {
    const error = new Error(`Missing dataset configuration: ${missing.join(", ")}`);
    error.code = "DATASET_API_NOT_CONFIGURED";
    throw error;
  }
  if (!config.datasetBaseUrl.startsWith("https://")) {
    throw new Error("RAG_DIFY_DATASET_BASE_URL must use HTTPS");
  }
}
