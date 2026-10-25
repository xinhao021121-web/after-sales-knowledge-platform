import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const evidenceRoot = path.join(root, "evidence");
const baselineRoot = path.join(root, "baseline");
const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (name, value) => {
  fs.writeFileSync(path.join(evidenceRoot, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
};
const probeFiles = fs.readdirSync(evidenceRoot).filter(name => name.startsWith("probe-"));
const latestProbe = taskId => {
  const files = probeFiles
    .filter(name => name.includes(taskId))
    .map(name => ({
      name,
      time: fs.statSync(path.join(evidenceRoot, name)).mtimeMs
    }))
    .sort((left, right) => right.time - left.time);
  if (!files.length) return null;
  const body = readJson(path.join(evidenceRoot, files[0].name));
  const task = body.tasks.find(item => item.task_id === taskId);
  return task ? {file: `evidence/${files[0].name}`, task} : null;
};

const r1 = readJson(path.join(baselineRoot, "p10-real-after-r1.json"));
const formal = readJson(path.join(evidenceRoot, "p10-real-r2.json"));
const holdout = readJson(path.join(evidenceRoot, "holdout-real-r2.json"));
const inventory = readJson(path.join(evidenceRoot, "candidate-inventory-after-r2.json"));
const rateFailure = readJson(path.join(baselineRoot, "p10-r2-rate-limit-failure.json"));
const beforeConfig = readJson(path.join(evidenceRoot, "dify-config-before-change.json"));
const afterConfig = readJson(path.join(evidenceRoot, "dify-config-after-r2.json"));
const initialR04 = readJson(path.join(
  evidenceRoot,
  "probe-POC-R02-POC-R03-POC-R04-1792919833139.json"
)).tasks.find(item => item.task_id === "POC-R04");
const fixedR04 = latestProbe("POC-R04");
const appOnlyR03 = readJson(path.join(
  evidenceRoot,
  "probe-POC-R03-1792920509480.json"
)).tasks[0];
const finalR03 = formal.results.find(item => item.task_id === "POC-R03");
const baselineR03 = r1.results.find(item => item.task_id === "POC-R03");
const finalCore = formal.results.filter(item => item.core_task_id?.startsWith("CORE-") && !item.p0);
const baselineCore = r1.results.filter(item => item.core_task_id?.startsWith("CORE-") && !item.p0);

writeJson("r03-retrieval-comparison.json", {
  captured_at: new Date().toISOString(),
  source_mode: "REAL_DIFY",
  baseline: {
    evidence: "baseline/p10-real-after-r1.json",
    request_id: baselineR03.bff_request_id,
    provider_request_id: baselineR03.provider_request_id,
    status: baselineR03.answer_status,
    top3: baselineR03.evidence.retrieved,
    covered_source_ids: baselineR03.covered_source_ids,
    recall_at_3: baselineR03.recall_at_3
  },
  app_only_candidate_pool_experiment: {
    evidence: "evidence/probe-POC-R03-1792920509480.json",
    request_id: appOnlyR03.provider_request_id,
    requested_config_top_k: 12,
    actual_chat_resource_count: appOnlyR03.raw_metadata.retriever_resources.length,
    top3: appOnlyR03.raw_metadata.retriever_resources,
    conclusion: "Dify Chat API retriever_resources remained capped at 3; rejected as a successful diversity fix."
  },
  final: {
    evidence: "evidence/formal-17/POC-R03.json",
    request_id: finalR03.bff_request_id,
    provider_request_id: finalR03.provider_request_id,
    status: finalR03.answer_status,
    internal_candidate_pool_size: finalR03.retrieval_diversity.internal_candidate_pool_size,
    requested_internal_top_k: finalR03.retrieval_diversity.requested_internal_top_k,
    displayed_top_k: finalR03.retrieval_diversity.displayed_top_k,
    top3: finalR03.evidence.retrieved,
    covered_source_ids: finalR03.covered_source_ids,
    recall_at_3: finalR03.recall_at_3,
    unique_segment_count: new Set(finalR03.evidence.retrieved.map(item => item.segment_id)).size
  }
});

writeJson("r04-answer-diagnosis.json", {
  captured_at: new Date().toISOString(),
  diagnosis: "The provider returned actionable steps with a supported FAQ citation; the old BFF clarity heuristic downgraded the whole answer because it contained a follow-up phrase.",
  r1_normalized: {
    evidence: "baseline/p10-real-after-r1.json",
    status: baselineR03 ? r1.results.find(item => item.task_id === "POC-R04").answer_status : null,
    citation_support_passed: r1.results.find(item => item.task_id === "POC-R04").citation_support_passed
  },
  before_fix: {
    evidence: "evidence/probe-POC-R02-POC-R03-POC-R04-1792919833139.json",
    provider_request_id: initialR04.provider_request_id,
    raw_answer: initialR04.raw_answer,
    normalized_status: initialR04.normalized.answer_status,
    normalized_citations: initialR04.normalized.citations
  },
  after_fix: {
    evidence: fixedR04?.file || null,
    provider_request_id: fixedR04?.task.provider_request_id || null,
    raw_answer: fixedR04?.task.raw_answer || null,
    normalized_status: fixedR04?.task.normalized.answer_status || null,
    citation_support: fixedR04?.task.normalized.citation_support || null
  },
  formal_result: formal.results.find(item => item.task_id === "POC-R04")
});

const afterVersion = afterConfig.workflow_versions.find(item => item.version_number === 14) || null;
writeJson("dify-config-comparison-r2.json", {
  captured_at: new Date().toISOString(),
  app_id: afterConfig.app_id,
  dataset: "CANDIDATE",
  before: {
    evidence: "evidence/dify-config-before-change.json",
    model: beforeConfig.prompt_nodes[0].model.name,
    temperature: beforeConfig.prompt_nodes[0].model.completion_params.temperature,
    top_k: beforeConfig.knowledge_nodes[0].multiple_retrieval_config.top_k,
    rerank_model: beforeConfig.knowledge_nodes[0].multiple_retrieval_config.reranking_model.model,
    prompt_sha256: beforeConfig.prompt_nodes[0].prompt_text_sha256,
    published_baseline_version: 12
  },
  after: {
    evidence: "evidence/dify-config-after-r2.json",
    model: afterConfig.prompt_nodes[0].model.name,
    temperature: afterConfig.prompt_nodes[0].model.completion_params.temperature,
    top_k: afterConfig.knowledge_nodes[0].multiple_retrieval_config.top_k,
    rerank_model: afterConfig.knowledge_nodes[0].multiple_retrieval_config.reranking_model.model,
    prompt_sha256: afterConfig.prompt_nodes[0].prompt_text_sha256,
    published_version: afterVersion?.version_number || null,
    marked_name: afterVersion?.marked_name || null
  },
  unchanged: [
    "generation model deepseek-v4-pro",
    "temperature 0.7",
    "hybrid weights 0.7/0.3",
    "qwen3-rerank",
    "CANDIDATE dataset binding"
  ],
  internal_candidate_pool: {
    requested_top_k: 10,
    actual_range_observed: [12, 14],
    final_user_visible_top_k: 3,
    note: "The internal candidate pool is not Recall@3; Recall@3 uses only the final three document-diverse resources."
  },
  business_knowledge_published: false
});

writeJson("retrieval-core-comparison.json", {
  captured_at: new Date().toISOString(),
  baseline: baselineCore.map(result => ({
    task_id: result.task_id,
    status: result.answer_status,
    covered_source_ids: result.covered_source_ids,
    covered_source_count: result.covered_source_count,
    expected_source_count: result.expected_source_count
  })),
  final: finalCore.map(result => ({
    task_id: result.task_id,
    status: result.answer_status,
    covered_source_ids: result.covered_source_ids,
    covered_source_count: result.covered_source_count,
    expected_source_count: result.expected_source_count,
    internal_candidate_pool_size: result.retrieval_diversity?.internal_candidate_pool_size ?? null,
    displayed_top_k: result.retrieval_diversity?.displayed_top_k ?? null
  })),
  conclusion: "R03 gained DOC-CHANNEL-V1; R01, R02, R04, K01, K02, K04 retained at least one expected logical source."
});

writeJson("quality-gate-r2.json", {
  captured_at: new Date().toISOString(),
  formal_run_id: formal.run_id,
  formal_status: formal.status,
  metrics: formal.metrics,
  holdout: {
    run_id: holdout.run_id,
    used_for_tuning: holdout.used_for_tuning,
    status_all_accepted: holdout.status_all_accepted,
    expected_source_count: holdout.expected_source_count,
    covered_source_count: holdout.covered_source_count,
    recall_at_3: holdout.recall_at_3,
    p0_failures: holdout.p0_failures,
    provider_errors: holdout.provider_errors,
    forbidden_action_failures: holdout.forbidden_action_failures,
    citation_failures: holdout.citation_failures,
    cost_status: holdout.cost_status
  },
  uniqueness: {
    active_document_count: inventory.active_document_count,
    logical_active_document_count: inventory.logical_active_document_count,
    duplicate_active_logical_documents: inventory.duplicate_active_logical_documents
  },
  retries: {
    initial_full_run_status: rateFailure.status,
    initial_provider_errors: rateFailure.metrics.provider_errors,
    initial_reason: "Dify subscription knowledge retrieval rate limit (HTTP 403).",
    final_provider_errors: formal.metrics.provider_errors
  },
  threshold_unchanged: 0.9167,
  cost_status: "COST_UNKNOWN",
  release_performed: false,
  entered_4b2b: false
});

console.log("PASSED: R2 machine-readable evidence rebuilt.");
