import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createBffServer} from "../../阶段4B-1_BFF与P03真实RAG接入/server/app.mjs";
import {loadConfig} from "../../阶段4B-1_BFF与P03真实RAG接入/server/config.mjs";
import {createDifyAdapter} from "../../阶段4B-1_BFF与P03真实RAG接入/server/dify-adapter.mjs";
import {containsForbidden} from "../../阶段4B-1_BFF与P03真实RAG接入/server/evaluation-service.mjs";
import {evaluateRoutingCandidate} from "../../阶段4B-1_BFF与P03真实RAG接入/server/model-routing.mjs";
import {evaluateBusinessSemantics} from "../../阶段4B-1_BFF与P03真实RAG接入/server/semantic-evaluation.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const stageRoot = path.resolve(here, "..");
const project1Root = path.resolve(stageRoot, "..", "..");
const prototypeRoot = path.join(project1Root, "文档", "阶段3B_高保真交互原型");
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
  if (value.startsWith("--")) pairs.push([value.slice(2), all[index + 1]]);
  return pairs;
}, []));
const group = String(args.group || "").toUpperCase();
const phase = String(args.phase || "final").toLowerCase();
const modelConfigPath = path.resolve(stageRoot, String(args["model-config"] || ""));
if (!["A", "B", "C"].includes(group) || !["flash", "final", "fallback"].includes(phase)) {
  throw new Error("Usage: node run-routing-group.mjs --group <A|B|C> --phase <flash|final|fallback> --model-config <json>");
}
if ((group === "C" && !["flash", "fallback"].includes(phase)) ||
    (group !== "C" && phase !== "final")) {
  throw new Error("A/B use --phase final; C uses --phase flash then --phase fallback");
}

const fixedSet = JSON.parse(fs.readFileSync(
  path.join(stageRoot, "baseline", "fixed-regression-used.json"),
  "utf8"
));
const snapshot = JSON.parse(fs.readFileSync(
  path.join(stageRoot, "evidence", "retrieval-snapshot.json"),
  "utf8"
));
const modelConfig = JSON.parse(fs.readFileSync(modelConfigPath, "utf8"));
const baseConfig = loadConfig(prototypeRoot, {RAG_REQUEST_TIMEOUT_MS: "120000", RAG_MAX_RETRIES: "0"});
const expectedModel = group === "A" || (group === "C" && phase === "fallback")
  ? "deepseek-v4-pro"
  : "deepseek-v4-flash";
if (modelConfig.after_model !== expectedModel) {
  throw new Error(`Model config mismatch: expected ${expectedModel}, got ${modelConfig.after_model}`);
}
if (modelConfig.prompt_sha256 !== "6f354ed76dbdc62ec9048eafee5713bcdfe0c2f6b1312ea6a85d64a21d2620a8") {
  throw new Error("The experiment Prompt changed");
}

const groupRoot = path.join(stageRoot, "runs", group);
fs.mkdirSync(groupRoot, {recursive: true});
const outputPath = phase === "flash"
  ? path.join(groupRoot, "flash-phase.json")
  : path.join(groupRoot, "results.json");
const existing = fs.existsSync(outputPath)
  ? JSON.parse(fs.readFileSync(outputPath, "utf8"))
  : null;
const resume = process.argv.includes("--resume");
if (existing && !resume && phase !== "fallback") {
  throw new Error(`${outputPath} already exists; use --resume to preserve responses`);
}
const runId = existing?.run_id || `ROUTING-4B2B-${group}-${crypto.randomUUID()}`;
const run = existing || {
  run_id: runId,
  group,
  phase,
  route_mode: group === "A"
    ? "A_PRO_ONLY"
    : group === "B"
      ? "B_FLASH_ONLY"
      : "C_FLASH_WITH_PRO_FALLBACK",
  started_at: new Date().toISOString(),
  model_config: modelConfig,
  task_count: 27,
  tasks: []
};
run.model_config = modelConfig;

const snapshotByTask = new Map(
  snapshot.tasks.map(item => [item.task_id, item])
);
function defaultAcceptedStatuses(task) {
  if (task.p0) return ["BLOCKED_SAFETY"];
  if (task.id === "POC-E01") return ["NO_ANSWER", "NEED_CLARIFICATION"];
  if (task.id === "POC-E02") return ["KNOWLEDGE_EXPIRED"];
  if (task.id === "POC-E03") return ["CONFLICT"];
  if (task.id === "POC-E04") return ["PERMISSION_DENIED"];
  return ["ANSWERED", "NEED_CLARIFICATION", "NO_ANSWER", "CONFLICT"];
}

const tasks = fixedSet.tasks.map(item => ({
  ...item.task,
  suite: item.suite,
  accepted_statuses: item.task.accepted_statuses || defaultAcceptedStatuses(item.task)
}));
const flashPhase = group === "C" && phase === "fallback"
  ? JSON.parse(fs.readFileSync(path.join(groupRoot, "flash-phase.json"), "utf8"))
  : null;
const fallbackTaskIds = flashPhase
  ? new Set(flashPhase.tasks
      .filter(item => item.routing_decision?.fallback_required)
      .map(item => item.task_id))
  : null;

function buildRequest(task, asqId) {
  return {
    question: [
      task.original_question,
      ...(task.rewrites?.length ? [`改写问法：${task.rewrites.join("；")}`] : [])
    ].join("\n"),
    asq_id: asqId,
    knowledge_item_id: `KI-${task.core_task_id || task.id}`,
    product_model: String(task.context?.product || "AirPods Pro 3"),
    channel: String(task.context?.channel || "Apple Store 在线商店"),
    role: "frontline",
    tenant_id: "tenant-demo",
    environment: "candidate",
    top_k: 3,
    retrieval_mode: "hybrid",
    rerank: true,
    metadata_filter: {
      enabled: true,
      active_only: true,
      channels: task.context?.channel ? [task.context.channel] : [],
      source_statuses: ["active"]
    },
    citation_mode: "required",
    customer_context: task.context || {},
    question_summary: {
      original: task.original_question,
      rewrites: Array.isArray(task.rewrites) ? task.rewrites : []
    }
  };
}

async function executeRequest({task, attemptNumber = 1, retryRateLimit = true}) {
  const asqId = `ASQ-${runId}-${task.id}-${attemptNumber}`;
  const request = buildRequest(task, asqId);
  const requestKey = `${runId}-${phase}-${task.id}-${attemptNumber}`;
  const callLog = new Map();
  const instrumentedAdapter = {
    async answer(providerRequest) {
      const frozen = snapshotByTask.get(task.id);
      const result = await baseAdapter.answerWithEvidence(
        providerRequest,
        frozen.evidence,
        frozen.retrieval_trace
      );
      callLog.set(providerRequest.asq_id, result);
      return result;
    },
    search(providerRequest) {
      return baseAdapter.search(providerRequest);
    },
    health() {
      return baseAdapter.health();
    }
  };
  const experimentalConfig = {
    ...baseConfig,
    generationModel: expectedModel
  };
  const app = createBffServer({
    prototypeRoot,
    config: experimentalConfig,
    adapter: instrumentedAdapter
  });
  await new Promise(resolve => app.server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${app.server.address().port}`;
  const startedAt = new Date().toISOString();
  const started = performance.now();
  let response;
  let payload;
  try {
    response = await fetch(`${baseUrl}/api/answers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": requestKey,
        "X-Demo-Role": "frontline"
      },
      body: JSON.stringify(request)
    });
    payload = await response.json();
  } finally {
    await new Promise(resolve => app.server.close(resolve));
  }
  const captured = callLog.get(asqId) || null;
  const p0Passed = task.p0
    ? payload.answer_status === "BLOCKED_SAFETY" &&
      payload.provider_called === false &&
      payload.citations?.[0]?.chunk_id === "CHUNK-SAFE-STOP-01"
    : null;
  const answer = payload.answer || "";
  const suggested = payload.suggested_action || "";
  const forbiddenActionMatch = containsForbidden(task, `${answer} ${suggested}`);
  const routingDecision = evaluateRoutingCandidate({
    task,
    payload: {
      ...payload,
      p0_passed: p0Passed,
      retrieval_resources: payload.retrieval_resources || snapshotByTask.get(task.id)?.evidence || []
    },
    forbiddenActionMatch
  });
  return {
    attempt: attemptNumber,
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    http_status: response.status,
    model_requested: expectedModel,
    model_config_version: modelConfig.published_version,
    bff_request_id: payload.request_id || null,
    provider_request_id: payload.provider_request_id || captured?.provider_request_id || null,
    provider_called: payload.provider_called === true,
    provider_latency_ms: captured?.timing_ms ?? null,
    bff_latency_ms: Math.round(performance.now() - started),
    prompt_tokens: payload.cost?.prompt_tokens ?? null,
    completion_tokens: payload.cost?.completion_tokens ?? null,
    total_tokens: payload.cost?.total_tokens ?? null,
    cost_status: "COST_UNKNOWN",
    answer_status: payload.answer_status || "ERROR",
    p0: Boolean(task.p0),
    p0_passed: p0Passed,
    citation_support_passed: payload.citation_support?.passed === true,
    error_code: payload.error_code || null,
    error_message: payload.message || null,
    forbidden_action_match: forbiddenActionMatch,
    normalized: {
      answer,
      suggested_action: suggested,
      answer_goals: payload.answer_goals || [],
      retrieval_resources: payload.retrieval_resources || [],
      retrieval_diversity: payload.retrieval_diversity || null,
      citations: payload.citations || [],
      citation_support: payload.citation_support || null
    },
    routing_decision: routingDecision,
    provider_response: captured?.raw || null
  };
}

const baseAdapter = createDifyAdapter({
  ...baseConfig,
  generationModel: expectedModel
});

async function executeWithRateLimitRecovery(options) {
  const attempts = [];
  const first = await executeRequest({...options, attemptNumber: 1});
  attempts.push(first);
  if (first.http_status === 429 && options.retryRateLimit) {
    await new Promise(resolve => setTimeout(resolve, 60000));
    attempts.push(await executeRequest({...options, attemptNumber: 2, retryRateLimit: false}));
  }
  return attempts;
}

function taskRiskType(task) {
  if (task.p0) return "P0_SAFETY";
  const id = task.core_task_id || "";
  if (/PERMISSION|权限/i.test(id)) return "PERMISSION";
  if (/EXPIRED/i.test(id)) return "EXPIRED_KNOWLEDGE";
  if (/CONFLICT/i.test(id)) return "CONFLICT";
  if (/KNOWLEDGE-GAP|NO-KNOWLEDGE/i.test(id)) return "KNOWLEDGE_GAP";
  if (/CROSS|WARRANTY/i.test(id)) return "CROSS_DOCUMENT_BUSINESS";
  if (/TROUBLESHOOTING/i.test(id)) return "TROUBLESHOOTING";
  return "BUSINESS_RULE";
}

async function executeTask(task, attempts, mode, previousFailures = []) {
  const firstSuccess = attempts.find(item => item.http_status === 200);
  const final = attempts.at(-1);
  const finalPayload = final.normalized;
  const semantics = evaluateBusinessSemantics(task, {
    answer: finalPayload.answer,
    suggested_action: finalPayload.suggested_action,
    answer_goals: finalPayload.answer_goals,
    retrieval_resources: finalPayload.retrieval_resources,
    citations: finalPayload.citations,
    citation_support: finalPayload.citation_support,
    answer_status: final.answer_status,
    provider_called: final.provider_called,
    p0_passed: final.p0_passed
  });
  return {
    task_id: task.id,
    core_task_id: task.core_task_id,
    suite: task.suite,
    risk_type: taskRiskType(task),
    route_mode: mode,
    first_model: final.provider_called ? final.model_requested : null,
    final_model: final.provider_called ? final.model_requested : null,
    fallback: false,
    fallback_reasons: final.routing_decision.reasons,
    fallback_attempted: false,
    fallback_recovered: null,
    flash_attempts: expectedModel === "deepseek-v4-flash" ? attempts : [],
    pro_attempts: expectedModel === "deepseek-v4-pro" ? attempts : [],
    final_attempt: final,
    first_successful_attempt: firstSuccess || null,
    answer_status: final.answer_status,
    citation_support_passed: final.citation_support_passed,
    p0: final.p0,
    p0_passed: final.p0_passed,
    provider_called: final.provider_called,
    provider_error: final.answer_status === "ERROR",
    routing_decision: final.routing_decision,
    business_semantics: semantics,
    known_defect: task.id === "RET-H09" && semantics.passed === false,
    previous_failures: previousFailures,
    human_confirmable: final.answer_status !== "ERROR" &&
      (!task.p0 || final.p0_passed === true) &&
      semantics.passed === true
  };
}

await (async () => {
  for (const task of tasks) {
    if (fallbackTaskIds && !fallbackTaskIds.has(task.id)) continue;
    const existingTask = run.tasks.find(item => item.task_id === task.id);
    if (existingTask && existingTask.answer_status !== "ERROR") continue;
    const previousFailures = existingTask
      ? [{
          run_id: run.run_id,
          task_id: task.id,
          attempts: existingTask.pro_attempts?.length
            ? existingTask.pro_attempts
            : existingTask.flash_attempts || [existingTask.final_attempt],
          final_attempt: existingTask.final_attempt,
          routing_decision: existingTask.routing_decision,
          preserved_at: new Date().toISOString()
        }]
      : [];
    if (existingTask) {
      run.tasks = run.tasks.filter(item => item.task_id !== task.id);
    }
    if (task.p0) {
      const attempts = await executeWithRateLimitRecovery({
        task,
        retryRateLimit: false
      });
      const result = await executeTask(task, attempts, run.route_mode, previousFailures);
      result.first_model = null;
      result.final_model = null;
      result.flash_attempts = [];
      result.pro_attempts = [];
      result.final_attempt = {
        ...result.final_attempt,
        model_requested: null
      };
      run.tasks.push(result);
    } else {
      const attempts = await executeWithRateLimitRecovery({
        task,
        retryRateLimit: phase !== "fallback"
      });
      const result = await executeTask(task, attempts, run.route_mode, previousFailures);
      run.tasks.push(result);
    }
    fs.writeFileSync(outputPath, `${JSON.stringify(run, null, 2)}\n`, "utf8");
    const result = run.tasks.at(-1);
    console.log(`${group}${phase === "flash" ? "-FLASH" : ""} ${task.id} ` +
      `${result.answer_status} gate=${result.routing_decision.passed} ` +
      `tokens=${result.final_attempt.total_tokens ?? "n/a"}`);
  }
  if (phase === "fallback") {
    run.completed_at = new Date().toISOString();
    const flashByTask = new Map(flashPhase.tasks.map(item => [item.task_id, item]));
    run.tasks = tasks.map(task => {
      const flashResult = flashByTask.get(task.id);
      if (!flashResult || !flashResult.routing_decision?.fallback_required) {
        return flashResult;
      }
      const proResult = run.tasks.find(item => item.task_id === task.id);
      if (!proResult) return flashResult;
      return {
        ...proResult,
        route_mode: "C_FLASH_WITH_PRO_FALLBACK",
        first_model: flashResult.final_model,
        final_model: proResult.final_model,
        fallback: true,
        fallback_attempted: true,
        fallback_reasons: flashResult.routing_decision.reasons,
        fallback_recovered: proResult.routing_decision.passed,
        flash_attempts: flashResult.flash_attempts,
        flash_attempt: flashResult.final_attempt,
        pro_attempt: proResult.final_attempt,
        final_attempt: proResult.final_attempt,
        business_semantics: proResult.business_semantics,
        human_confirmable: proResult.human_confirmable
      };
    });
    run.fallback_task_ids = [...fallbackTaskIds];
  }
  run.completed_at = new Date().toISOString();
  run.tasks.sort((left, right) => tasks.findIndex(item => item.id === left.task_id) -
    tasks.findIndex(item => item.id === right.task_id));
  fs.writeFileSync(outputPath, `${JSON.stringify(run, null, 2)}\n`, "utf8");
  console.log(`WROTE ${outputPath}`);
})();
