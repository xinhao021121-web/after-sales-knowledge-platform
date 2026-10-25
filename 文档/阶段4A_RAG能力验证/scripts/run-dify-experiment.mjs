import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
  if (value.startsWith("--")) pairs.push([value.slice(2), all[index + 1]]);
  return pairs;
}, []));

const configId = String(args["config-id"] || "").trim();
if (!/^CFG-[A-Z0-9-]+$/.test(configId)) {
  console.error("Usage: node run-dify-experiment.mjs --config-id CFG-BASE [--retrieval-mode semantic] [--rerank false] [--top-k 3]");
  process.exit(2);
}
const retrievalMode = String(args["retrieval-mode"] || "semantic");
const rerank = String(args.rerank || "false");
const topK = Number(args["top-k"] || 3);
const selectedTaskIds = String(args["task-ids"] || "").split(",").map(value => value.trim()).filter(Boolean);
const datasetId = String(args["dataset-id"] || "").trim();

function loadEnv(filePath) {
  const config = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...valueParts] = trimmed.split("=");
    config[key.trim()] = valueParts.join("=").trim();
  }
  return config;
}

function cleanAnswer(value) {
  return String(value || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function normalizeStatus(task, answer) {
  if (task.p0 && (/立即停止|停止使用|停止充电|断开电源/.test(answer))) return "BLOCKED_SAFETY";
  if (task.core_task_id === "EDGE-EXPIRED-KNOWLEDGE" && /过期|失效|旧规则|不得引用/.test(answer)) return "KNOWLEDGE_EXPIRED";
  if (task.core_task_id === "EDGE-CHANNEL-CONFLICT" && /冲突|双方|联合裁决/.test(answer)) return "CONFLICT";
  if (task.core_task_id === "EDGE-PERMISSION-MISMATCH" && /无权|权限|不能提供|内部/.test(answer)) return "PERMISSION_DENIED";
  if (task.expected_evidence.length === 0 && /无法|没有|不足|未提供|不能确认/.test(answer)) return "NO_ANSWER";
  if (/请问|需要您|请提供|补充|确认以下|哪一/.test(answer)) return "NEED_CLARIFICATION";
  return "ANSWERED";
}

const env = loadEnv(path.join(root, ".env.local"));
for (const key of ["RAG_BASE_URL", "RAG_API_KEY", "RAG_DIFY_DATASET_ID", "RAG_DIFY_APP_ID"]) {
  if (!env[key]) throw new Error(`${key} is not configured`);
}
const baseUrl = env.RAG_BASE_URL.replace(/\/+$/, "");
if (!baseUrl.startsWith("https://")) throw new Error("RAG_BASE_URL must use HTTPS");
const headers = {Authorization: `Bearer ${env.RAG_API_KEY}`, "Content-Type": "application/json"};
const evaluation = JSON.parse(fs.readFileSync(path.join(root, "evaluation", "eval-set-v1.0.json"), "utf8"));
const manifests = Object.fromEntries(["TEST", "CANDIDATE"].map(name => [
  name,
  JSON.parse(fs.readFileSync(path.join(root, "datasets", name, "manifest.json"), "utf8"))
]));
const manifest = manifests.CANDIDATE;
const docNamesByDataset = Object.fromEntries(Object.entries(manifests).map(([name, value]) => [
  name,
  Object.fromEntries(value.documents.map(document => [document.doc_id, path.basename(document.file)]))
]));
const runDir = path.join(root, "experiments", "results", "dify-cloud", configId);
const rawDir = path.join(runDir, "raw");
fs.mkdirSync(rawDir, {recursive: true});

async function getJson(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {...options, headers});
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = {raw_text: text}; }
  if (!response.ok) {
    const error = new Error(`Dify request failed: HTTP ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

const info = await getJson("/info");
const metadata = await getJson("/parameters");

const tasks = selectedTaskIds.length ? evaluation.tasks.filter(task => selectedTaskIds.includes(task.id)) : evaluation.tasks;
const results = [];
for (const task of tasks) {
  const query = [
    `原始问题：${task.original_question}`,
    `客户改写：${task.rewrites.join("；")}`,
    `已知上下文：${JSON.stringify(task.context)}`,
    "请给出条件、引用与下一步动作；知识不足时明确追问或拒答。"
  ].join("\n");
  const started = performance.now();
  try {
    const response = await fetch(`${baseUrl}/chat-messages`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        inputs: {},
        query,
        response_mode: "blocking",
        user: `stage4a-${configId.toLowerCase()}-${task.id.toLowerCase()}-20261024`,
        auto_generate_name: false
      })
    });
    const elapsedMs = Math.round(performance.now() - started);
    const text = await response.text();
    let raw;
    try { raw = JSON.parse(text); } catch { raw = {raw_text: text}; }
    fs.writeFileSync(path.join(rawDir, `${task.id}.json`), `${JSON.stringify({http_status: response.status, elapsed_ms: elapsedMs, response: raw}, null, 2)}\n`, "utf8");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const answer = cleanAnswer(raw.answer);
    const resources = Array.isArray(raw.metadata?.retriever_resources) ? raw.metadata.retriever_resources : [];
    const expectedDocNames = [...new Set(task.expected_evidence.map(item => docNamesByDataset[task.dataset]?.[item.doc_id]).filter(Boolean))];
    const topNames = resources.slice(0, topK).map(item => item.document_name);
    const matchedExpected = expectedDocNames.filter(name => topNames.includes(name));
    const citationIds = [...answer.matchAll(/\[citation:(\d+)\]/g)].map(match => Number(match[1]));
    const normalizedStatus = normalizeStatus(task, answer);
    results.push({
      task_id: task.id,
      core_task_id: task.core_task_id,
      http_status: response.status,
      elapsed_ms: elapsedMs,
      answer_status: normalizedStatus,
      answer,
      expected_doc_names: expectedDocNames,
      retrieved_top: resources.slice(0, topK).map(item => ({
        position: item.position,
        dataset_id: item.dataset_id,
        dataset_name: item.dataset_name,
        document_id: item.document_id,
        document_name: item.document_name,
        segment_id: item.segment_id,
        score: item.score,
        content: item.content
      })),
      recall_at_3: expectedDocNames.length ? Number((matchedExpected.length / expectedDocNames.length).toFixed(4)) : null,
      correct_source_hit: expectedDocNames.length ? matchedExpected.length > 0 : null,
      citation_ids: citationIds,
      citation_present: citationIds.length > 0,
      p0: task.p0,
      p0_rule_pass: task.p0 ? /立即停止|停止使用|停止充电|断开电源/.test(answer) : null,
      provider_metadata: {
        task_id: raw.task_id,
        message_id: raw.message_id,
        conversation_id: raw.conversation_id,
        usage: raw.metadata?.usage || null
      },
      error_code: null
    });
    console.log(`${configId} ${task.id} HTTP=${response.status} ${elapsedMs}ms sources=${matchedExpected.length}/${expectedDocNames.length} citations=${citationIds.length}`);
  } catch (error) {
    const elapsedMs = Math.round(performance.now() - started);
    results.push({
      task_id: task.id,
      core_task_id: task.core_task_id,
      http_status: error.status || 0,
      elapsed_ms: elapsedMs,
      answer_status: "PROVIDER_ERROR",
      answer: "",
      expected_doc_names: [],
      retrieved_top: [],
      recall_at_3: 0,
      correct_source_hit: false,
      citation_ids: [],
      citation_present: false,
      p0: task.p0,
      p0_rule_pass: task.p0 ? false : null,
      provider_metadata: null,
      error_code: error.status ? `HTTP_${error.status}` : "NETWORK_ERROR",
      error_message: error.message
    });
    console.error(`${configId} ${task.id} FAILED ${error.message}`);
  }
}

const summary = {
  provider: "Dify Cloud",
  app_id: env.RAG_DIFY_APP_ID,
  dataset_id: datasetId || env.RAG_DIFY_DATASET_ID,
  base_url: baseUrl,
  config_id: configId,
  configuration: {
    retrieval_mode: retrievalMode,
    top_k: topK,
    rerank,
    chunk_size: 700,
    overlap: 100,
    citation_mode: "required"
  },
  provider_info: {
    name: info.name,
    mode: info.mode
  },
  parameters_received: Object.keys(metadata).length,
  started_at: new Date().toISOString(),
  task_count: results.length,
  success_count: results.filter(result => result.http_status === 200).length,
  p0_count: results.filter(result => result.p0).length,
  p0_rule_failures: results.filter(result => result.p0 && result.p0_rule_pass !== true).length,
  citation_present_count: results.filter(result => result.citation_present).length,
  correct_source_hit_count: results.filter(result => result.correct_source_hit === true).length,
  average_recall_at_3: results.filter(result => result.recall_at_3 !== null).length
    ? Number((results.filter(result => result.recall_at_3 !== null).reduce((sum, result) => sum + result.recall_at_3, 0) / results.filter(result => result.recall_at_3 !== null).length).toFixed(4))
    : null,
  average_latency_ms: Math.round(results.reduce((sum, result) => sum + result.elapsed_ms, 0) / Math.max(results.length, 1)),
  manual_review_required: true,
  results
};

fs.writeFileSync(path.join(runDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(`WROTE ${path.join(runDir, "summary.json")}`);
