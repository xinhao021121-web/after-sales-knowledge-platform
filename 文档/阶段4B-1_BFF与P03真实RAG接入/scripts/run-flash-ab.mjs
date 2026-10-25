import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBffServer } from "../server/app.mjs";
import { loadConfig } from "../server/config.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const projectRoot = path.resolve(root, "..", "..");
const baselineRoot = path.join(projectRoot, "文档", "阶段4A_RAG能力验证");
const prototypeRoot = path.join(projectRoot, "文档", "阶段3B_高保真交互原型");
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
  if (value.startsWith("--")) pairs.push([value.slice(2), all[index + 1]]);
  return pairs;
}, []));
const roundId = String(args.round || "").trim();
if (!/^(?:FLASH-R[12]|PRO-R1)$/.test(roundId)) {
  console.error("Usage: node scripts/run-flash-ab.mjs --round FLASH-R1|FLASH-R2|PRO-R1");
  process.exit(2);
}
const expectedModel = String(args.model || (roundId === "PRO-R1" ? "deepseek-v4-pro" : "deepseek-v4-flash"));
const providerVersion = Number(args["app-version"] || 0) || null;

const evaluation = JSON.parse(fs.readFileSync(path.join(baselineRoot, "evaluation", "eval-set-v1.0.json"), "utf8"));
const config = {
  ...loadConfig(prototypeRoot),
  runtimeRoot: fs.mkdtempSync(path.join(os.tmpdir(), `bff-${roundId.toLowerCase()}-`))
};
const app = createBffServer({prototypeRoot, config});
await new Promise(resolve => app.server.listen(0, "127.0.0.1", resolve));
const baseUrl = `http://127.0.0.1:${app.server.address().port}`;
const outputRoot = path.join(root, "model-validation", "rounds", roundId);
const rawRoot = path.join(outputRoot, "raw");
fs.mkdirSync(rawRoot, {recursive: true});

function inferChannel(task) {
  const contextChannel = String(task.context?.channel || "");
  if (contextChannel && !/需区分|未确认|未知/.test(contextChannel)) return contextChannel;
  if (/京东|第三方|平台/.test(task.original_question)) return "京东第三方平台";
  if (/卫星|产品/.test(task.original_question)) return "Apple Store 在线商店";
  return contextChannel || "Apple Store 在线商店";
}

function requestFor(task) {
  return {
    question: [
      `原始问题：${task.original_question}`,
      `客户改写：${task.rewrites.join("；")}`
    ].join("\n"),
    asq_id: `ASQ-4B1-${roundId}-${task.id}`,
    knowledge_item_id: `KI-${task.core_task_id}`,
    product_model: String(task.context?.product || "AirPods Pro 3"),
    channel: inferChannel(task),
    customer_context: task.context,
    role: "frontline",
    tenant_id: "tenant-demo",
    environment: "candidate",
    top_k: 3,
    retrieval_mode: "hybrid",
    rerank: true,
    metadata_filter: {
      enabled: true,
      active_only: true,
      channels: [inferChannel(task)],
      source_statuses: ["active"]
    },
    citation_mode: "required"
  };
}

const startedAt = new Date().toISOString();
const healthResponse = await fetch(`${baseUrl}/api/health`);
const health = await healthResponse.json();
if (health.status !== "ok" || health.generation_model !== expectedModel) {
  throw new Error(`Unexpected health state: ${JSON.stringify(health)}`);
}

const results = [];
for (const task of evaluation.tasks) {
  const request = requestFor(task);
  const started = performance.now();
  const response = await fetch(`${baseUrl}/api/answers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
      "X-Demo-Role": "frontline"
    },
    body: JSON.stringify(request)
  });
  const wallMs = Math.round(performance.now() - started);
  const payload = await response.json();
  const artifact = {
    round_id: roundId,
    task_id: task.id,
    core_task_id: task.core_task_id,
    dataset: "CANDIDATE",
    p0: task.p0,
    http_status: response.status,
    wall_ms: wallMs,
    request,
    response: payload
  };
  fs.writeFileSync(path.join(rawRoot, `${task.id}.json`), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  results.push({
    task_id: task.id,
    core_task_id: task.core_task_id,
    p0: task.p0,
    http_status: response.status,
    wall_ms: wallMs,
    provider_called: payload.provider_called,
    provider_request_id: payload.provider_request_id || null,
    answer_status: payload.answer_status,
    ui_state: payload.ui_state,
    answer: payload.answer,
    suggested_action: payload.suggested_action,
    business_conditions: payload.business_conditions || [],
    citations: payload.citations || [],
    citation_support: payload.citation_support || null,
    evidence_summary: payload.evidence_summary || null,
    retrieval_resources: payload.retrieval_resources || [],
    risk: payload.risk || null,
    cost: payload.cost || null,
    timing_ms: payload.timing_ms || 0,
    error_code: payload.error_code || null
  });
  console.log(`${roundId} ${task.id} HTTP=${response.status} status=${payload.answer_status} provider=${payload.provider_called} ${wallMs}ms`);
}

const providerTimes = results.filter(result => result.provider_called).map(result => result.timing_ms);
const normalized = {
  round_id: roundId,
  model: health.generation_model,
  model_requested: expectedModel,
  configuration_id: expectedModel === "deepseek-v4-pro" ? "CFG-RERANK-PRO" : "CFG-RERANK-FLASH",
  provider: health.provider,
  provider_published_version: providerVersion,
  prompt_version: "DIFY-PROMPT-CLAIM-20261025",
  dataset: "CANDIDATE",
  dataset_id: health.dataset_id,
  dataset_version: "1.0.0",
  started_at: startedAt,
  completed_at: new Date().toISOString(),
  task_count: results.length,
  provider_call_count: results.filter(result => result.provider_called).length,
  p0_gate_count: results.filter(result => !result.provider_called && result.answer_status === "BLOCKED_SAFETY").length,
  provider_times_ms: providerTimes,
  all_wall_times_ms: results.map(result => result.wall_ms),
  health,
  results
};
fs.writeFileSync(path.join(outputRoot, "normalized.json"), `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
await new Promise(resolve => app.server.close(resolve));
fs.rmSync(config.runtimeRoot, {recursive: true, force: true});
console.log(`WROTE=${path.join(outputRoot, "normalized.json")}`);
