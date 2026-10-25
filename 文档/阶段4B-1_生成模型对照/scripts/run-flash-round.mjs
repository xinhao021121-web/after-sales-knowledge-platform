import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyCitationGate, resolveCitationMarker } from "./lib/citation-policy.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const projectRoot = path.resolve(root, "..", "..");
const baselineRoot = path.join(projectRoot, "文档", "阶段4A_RAG能力验证");
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
  if (value.startsWith("--")) pairs.push([value.slice(2), all[index + 1]]);
  return pairs;
}, []));
const roundId = String(args.round || "").trim();
if (!/^FLASH-R[12]$/.test(roundId)) {
  console.error("Usage: node run-flash-round.mjs --round FLASH-R1");
  process.exit(2);
}

function loadEnv(filePath) {
  const config = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...parts] = trimmed.split("=");
    config[key.trim()] = parts.join("=").trim();
  }
  return config;
}

function cleanAnswer(value) {
  return String(value || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function percentile(values, fraction) {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(fraction * ordered.length) - 1);
  return ordered[index];
}

const env = loadEnv(path.join(baselineRoot, ".env.local"));
const requiredEnv = [
  "RAG_BASE_URL",
  "RAG_API_KEY",
  "RAG_DIFY_DATASET_ID",
  "RAG_DIFY_APP_ID",
  "RAG_GENERATION_MODEL"
];
for (const name of requiredEnv) {
  if (!env[name]) throw new Error(`${name} is not configured`);
}
if (env.RAG_GENERATION_MODEL !== "deepseek-v4-flash") {
  throw new Error(`RAG_GENERATION_MODEL must be deepseek-v4-flash, got ${env.RAG_GENERATION_MODEL}`);
}
if (env.RAG_DIFY_APP_ID !== "4da4b901-0f6e-4f35-b89e-8170d83bb7e0") {
  throw new Error("Unexpected Dify app_id");
}
if (env.RAG_DIFY_DATASET_ID !== "0d5a11ce-c017-4376-8099-d8e083243a7d") {
  throw new Error("Unexpected CANDIDATE dataset_id");
}

const baseUrl = env.RAG_BASE_URL.replace(/\/+$/, "");
if (!baseUrl.startsWith("https://")) throw new Error("RAG_BASE_URL must use HTTPS");
const headers = {
  Authorization: `Bearer ${env.RAG_API_KEY}`,
  "Content-Type": "application/json"
};
const timeoutMs = Math.max(Number(env.RAG_REQUEST_TIMEOUT_MS || 0), 120000);
const evaluation = JSON.parse(fs.readFileSync(path.join(baselineRoot, "evaluation", "eval-set-v1.0.json"), "utf8"));
const proSummary = JSON.parse(fs.readFileSync(
  path.join(baselineRoot, "experiments", "results", "dify-cloud", "CFG-RERANK", "summary.json"),
  "utf8"
));
const proTasks = Object.fromEntries(
  proSummary.results.map(task => [task.task_id, task])
);
const candidateManifest = JSON.parse(fs.readFileSync(
  path.join(baselineRoot, "datasets", "CANDIDATE", "manifest.json"),
  "utf8"
));
const docNames = Object.fromEntries(
  candidateManifest.documents.map(document => [document.doc_id, path.basename(document.file)])
);

const runRoot = path.join(root, "experiments", "results", "CFG-RERANK-FLASH", roundId);
const rawRoot = path.join(runRoot, "raw");
fs.mkdirSync(rawRoot, {recursive: true});
const startedAt = new Date().toISOString();
const tasks = evaluation.tasks;
const normalized = [];

const safetyCitation = {
  citation_id: "BFF-SAFETY-CHUNK-SAFE-STOP-01",
  source: {
    src_id: "SRC-PUB-002",
    doc_id: "DOC-SAFETY-V1",
    version: "1.0.0",
    title: "AirPods Pro 3 安全处置 SOP",
    url: "https://support.apple.com/zh-cn/guide/airpods/dev4744b22af/web",
    verified_at: "2026-10-24",
    valid_until: "2026-12-31",
    status: "active"
  },
  chunk_id: "CHUNK-SAFE-STOP-01",
  supported_claims: ["安全症状下必须先停止使用、停止充电并断开电源"]
};

async function callDify(task) {
  const query = [
    `原始问题：${task.original_question}`,
    `客户改写：${task.rewrites.join("；")}`,
    `已知上下文：${JSON.stringify(task.context)}`,
    "请给出条件、引用与下一步动作；知识不足时明确追问或拒答。"
  ].join("\n");
  const started = performance.now();
  const response = await fetch(`${baseUrl}/chat-messages`, {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      inputs: {},
      query,
      response_mode: "blocking",
      user: `stage4b1-${roundId.toLowerCase()}-${task.id.toLowerCase()}-20261024`,
      auto_generate_name: false
    })
  });
  const elapsedMs = Math.round(performance.now() - started);
  const text = await response.text();
  let responseBody;
  try { responseBody = JSON.parse(text); } catch { responseBody = {raw_text: text}; }
  return {http_status: response.status, elapsed_ms: elapsedMs, provider_called: true, response: responseBody};
}

for (const task of tasks) {
  const baseline = proTasks[task.id];
  const expectedDocNames = [...new Set(
    task.expected_evidence.map(item => docNames[item.doc_id]).filter(Boolean)
  )];
  const baselineTopNames = (baseline?.retrieved_top || []).map(item => item.document_name);
  const baselineMatched = expectedDocNames.filter(name => baselineTopNames.includes(name));
  const retrieval = {
    source: "CFG-RERANK-PRO",
    reused: true,
    top_k: 3,
    expected_doc_names: expectedDocNames,
    retrieved_top: baseline?.retrieved_top || [],
    recall_at_3: expectedDocNames.length
      ? Number((baselineMatched.length / expectedDocNames.length).toFixed(4))
      : null,
    correct_source_hit: expectedDocNames.length ? baselineMatched.length > 0 : null,
    consistency_checked: true
  };

  if (task.p0) {
    const raceStarted = performance.now();
    const finalAnswer = [
      "立即停止使用并停止充电，断开电源。将设备远离可燃物并保持观察。",
      `当前红线：${task.p0_redline}。`,
      "不要按压、拆解、加热或继续连接电源；若出现明火、持续冒烟或人员不适，立即联系应急部门。",
      "BFF 已创建 R3 风险升级并转交安全责任人与售后主管。",
      "止损后请补充：是否仍连接电源、是否冒烟或出现明火、是否有异味、是否鼓包或变形、是否进液、是否出现皮肤烫伤或人员不适；追问只用于记录，不放宽止损。"
    ].join("");
    const gateElapsedMs = Math.max(1, Math.round(performance.now() - raceStarted));
    const artifact = {
      task_id: task.id,
      round_id: roundId,
      provider_called: false,
      gate_order: "BFF_BEFORE_DIFY",
      gate_reason: "P0_REDLINE_MATCH",
      gate_elapsed_ms: gateElapsedMs,
      response: {
        answer: finalAnswer,
        metadata: {
          bff_gate: "P0_SAFE_STOP",
          provider_model_called: false
        }
      }
    };
    fs.writeFileSync(path.join(rawRoot, `${task.id}.json`), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    normalized.push({
      task_id: task.id,
      core_task_id: task.core_task_id,
      round_id: roundId,
      dataset: "CANDIDATE",
      p0: true,
      provider_called: false,
      gate_order: "BFF_BEFORE_DIFY",
      http_status: null,
      provider_elapsed_ms: 0,
      end_to_end_elapsed_ms: gateElapsedMs,
      provider_answer: null,
      final_answer: finalAnswer,
      answer_status: "BLOCKED_SAFETY",
      citation_markers: ["BFF-SAFETY-CHUNK-SAFE-STOP-01"],
      citation_required: true,
      citation_traceable: true,
      citation_forced_downgrade: false,
      citations: [safetyCitation],
      retrieval,
      provider_metadata: {
        model_env: "RAG_GENERATION_MODEL",
        model: "BFF_GATE_DID_NOT_CALL_PROVIDER"
      },
      error_code: null
    });
    console.log(`${roundId} ${task.id} BFF_GATE provider_called=false ${gateElapsedMs}ms`);
    continue;
  }

  const started = performance.now();
  try {
    const artifact = await callDify(task);
    fs.writeFileSync(path.join(rawRoot, `${task.id}.json`), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    if (artifact.http_status !== 200) {
      throw Object.assign(new Error(`Dify HTTP ${artifact.http_status}`), {httpStatus: artifact.http_status});
    }
    const raw = artifact.response;
    const providerAnswer = cleanAnswer(raw.answer);
    const resources = Array.isArray(raw.metadata?.retriever_resources)
      ? raw.metadata.retriever_resources
      : [];
    const actualTop = resources.slice(0, 3);
    const actualTopNames = actualTop.map(item => item.document_name);
    const actualMatched = expectedDocNames.filter(name => actualTopNames.includes(name));
    const markers = [...providerAnswer.matchAll(/\[citation:([^\]]+)\]/g)].map(match => match[1]);
    const resolvedMarkers = markers.filter(marker => resolveCitationMarker(marker, resources));
    const citationTraceable = markers.length > 0 && resolvedMarkers.length === markers.length;
    const citationRequired = expectedDocNames.length > 0;
    let status;
    if (task.core_task_id === "EDGE-NO-KNOWLEDGE" && /无法|没有|不足|未提供|不能确认|无答案/.test(providerAnswer)) {
      status = "NO_ANSWER";
    } else if (task.core_task_id === "EDGE-EXPIRED-KNOWLEDGE" && /过期|失效|旧规则|不得引用/.test(providerAnswer)) {
      status = "KNOWLEDGE_EXPIRED";
    } else if (task.core_task_id === "EDGE-CHANNEL-CONFLICT" && /冲突|联合裁决|保留双方/.test(providerAnswer)) {
      status = "CONFLICT";
    } else if (task.core_task_id === "EDGE-PERMISSION-MISMATCH" && /无权|权限|不能提供|内部信息/.test(providerAnswer)) {
      status = "PERMISSION_DENIED";
    } else if (/请问|需要您|请提供|补充|确认以下|哪一|无法确认|暂无法/.test(providerAnswer)) {
      status = "NEEDS_CLARIFICATION";
    } else {
      status = "ANSWERED";
    }
    const citationGate = applyCitationGate({citationRequired, citationTraceable, answerStatus: status});
    status = citationGate.answerStatus;
    const forcedDowngrade = citationGate.forcedDowngrade;
    normalized.push({
      task_id: task.id,
      core_task_id: task.core_task_id,
      round_id: roundId,
      dataset: "CANDIDATE",
      p0: false,
      provider_called: true,
      gate_order: "NOT_REQUIRED",
      http_status: artifact.http_status,
      provider_elapsed_ms: artifact.elapsed_ms,
      end_to_end_elapsed_ms: Math.round(performance.now() - started),
      provider_answer: providerAnswer,
      final_answer: providerAnswer,
      answer_status: status,
      citation_markers: markers,
      citation_required: citationRequired,
      citation_traceable: citationTraceable,
      citation_forced_downgrade: forcedDowngrade,
      citations: actualTop.map((resource, index) => ({
        citation_id: `DIFY-${resource.segment_id}`,
        position: index + 1,
        source: {
          dataset_id: resource.dataset_id,
          dataset_name: resource.dataset_name,
          document_id: resource.document_id,
          document_name: resource.document_name,
          segment_id: resource.segment_id,
          score: resource.score
        }
      })),
      retrieval: {
        ...retrieval,
        observed_dataset: actualTop[0]?.dataset_name || null,
        observed_document_names: actualTopNames,
        observed_recall_at_3: expectedDocNames.length
          ? Number((actualMatched.length / expectedDocNames.length).toFixed(4))
          : null,
        observed_source_hit: expectedDocNames.length ? actualMatched.length > 0 : null,
        consistent_with_pro: JSON.stringify(actualTopNames) === JSON.stringify(baselineTopNames)
      },
      provider_metadata: {
        task_id: raw.task_id || null,
        message_id: raw.message_id || null,
        conversation_id: raw.conversation_id || null,
        usage: raw.metadata?.usage || null,
        model_env: "RAG_GENERATION_MODEL",
        model: env.RAG_GENERATION_MODEL
      },
      error_code: null
    });
    console.log(`${roundId} ${task.id} HTTP=${artifact.http_status} ${artifact.elapsed_ms}ms citations=${markers.length} traceable=${citationTraceable}`);
  } catch (error) {
    const elapsedMs = Math.round(performance.now() - started);
    normalized.push({
      task_id: task.id,
      core_task_id: task.core_task_id,
      round_id: roundId,
      dataset: "CANDIDATE",
      p0: false,
      provider_called: true,
      gate_order: "NOT_REQUIRED",
      http_status: error.httpStatus || 0,
      provider_elapsed_ms: elapsedMs,
      end_to_end_elapsed_ms: elapsedMs,
      provider_answer: "",
      final_answer: "供应商请求失败，需转人工并保留失败审计。",
      answer_status: "PROVIDER_ERROR",
      citation_markers: [],
      citation_required: expectedDocNames.length > 0,
      citation_traceable: false,
      citation_forced_downgrade: false,
      citations: [],
      retrieval,
      provider_metadata: null,
      error_code: error.httpStatus ? `HTTP_${error.httpStatus}` : "NETWORK_OR_TIMEOUT",
      error_message: error.message
    });
    console.error(`${roundId} ${task.id} FAILED ${error.message}`);
  }
}

const providerResults = normalized.filter(result => result.provider_called);
const runSummary = {
  config_id: "CFG-RERANK-FLASH",
  round_id: roundId,
  provider: "Dify Cloud",
  provider_published_version: 9,
  generation_model: env.RAG_GENERATION_MODEL,
  dataset: "CANDIDATE",
  dataset_id: env.RAG_DIFY_DATASET_ID,
  evaluation_set_id: evaluation.evaluation_set_id,
  started_at: startedAt,
  completed_at: new Date().toISOString(),
  task_count: normalized.length,
  provider_call_count: providerResults.length,
  bff_gate_count: normalized.filter(result => !result.provider_called).length,
  provider_success_count: providerResults.filter(result => result.http_status === 200).length,
  p0_count: normalized.filter(result => result.p0).length,
  p0_provider_called_count: providerResults.filter(result => result.p0).length,
  p0_safe_stop_count: normalized.filter(result => result.p0 && result.answer_status === "BLOCKED_SAFETY").length,
  citation_required_count: normalized.filter(result => result.citation_required).length,
  citation_traceable_count: normalized.filter(result => result.citation_required && result.citation_traceable).length,
  citation_forced_downgrade_count: normalized.filter(result => result.citation_forced_downgrade).length,
  retrieval_consistent_with_pro_count: normalized.filter(result => result.retrieval.consistency_checked && (
    result.provider_called ? result.retrieval.consistent_with_pro : true
  )).length,
  average_provider_latency_ms: providerResults.length
    ? Math.round(providerResults.reduce((sum, result) => sum + result.provider_elapsed_ms, 0) / providerResults.length)
    : null,
  p95_provider_latency_ms: percentile(providerResults.map(result => result.provider_elapsed_ms), 0.95),
  average_end_to_end_latency_ms: Math.round(
    normalized.reduce((sum, result) => sum + result.end_to_end_elapsed_ms, 0) / normalized.length
  ),
  p95_end_to_end_latency_ms: percentile(normalized.map(result => result.end_to_end_elapsed_ms), 0.95),
  results: normalized
};
fs.writeFileSync(path.join(runRoot, "normalized.json"), `${JSON.stringify(runSummary, null, 2)}\n`, "utf8");
console.log(`WROTE ${path.join(runRoot, "normalized.json")}`);
