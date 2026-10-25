import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const projectRoot = path.resolve(root, "..", "..");
const r4Root = path.join(projectRoot, "文档", "阶段4B-2A-R4_单题回归修复");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function writeJson(relativePath, value) {
  fs.writeFileSync(
    path.join(root, relativePath),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8"
  );
}

function sha256(filePath, mode = "text") {
  const content = fs.readFileSync(filePath);
  const normalized = mode === "binary"
    ? content
    : content.toString("utf8").replace(/\r\n/g, "\n");
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

const frozenPairs = [
  ["evidence/p10-real-r4.json", "baseline/p10-real-r4.json"],
  ["evidence/regression-v4-real.json", "baseline/regression-v4-real-r4.json"],
  ["evidence/holdout-v4-first-run.json", "baseline/holdout-v4-first-run-r4.json"],
  ["evidence/holdout/RET-H07.json", "baseline/RET-H07-first-failure.json"],
  ["evidence/holdout/RET-H08.json", "baseline/RET-H08-r4.json"],
  ["evidence/formal-17/POC-R04.json", "baseline/POC-R04-r4.json"],
  ["evidence/dify-config-after-r4.json", "baseline/dify-config-r4-final.json"],
  ["evidence/candidate-inventory-after-r4.json", "baseline/candidate-inventory-after-r4.json"],
  ["screenshots/P10_R4_PASSED_320.png", "baseline/P10_R4_PASSED_320.png"],
  ["screenshots/P10_R4_PASSED_1440.png", "baseline/P10_R4_PASSED_1440.png"],
  ["configs/r4-system-prompt.txt", "baseline/r4-system-prompt.txt"],
  ["evidence/test-results.json", "baseline/test-results-r4.json"],
  ["evidence/quality-gate-r4.json", "baseline/quality-gate-r4.json"],
  ["regression/retention-set-v4.0.json", "baseline/regression-set-v4.0.json"],
  ["holdout/retention-set-v4.0.json", "baseline/holdout-set-v4.0.json"],
  ["regression/poc-r04-visible-v1.0.json", "baseline/poc-r04-visible-v1.0.json"]
];
const freezeFiles = {};
for (const [r4Relative, frozenRelative] of frozenPairs) {
  const r4Path = path.join(r4Root, r4Relative);
  const frozenPath = path.join(root, frozenRelative);
  const sourceHash = sha256(r4Path);
  const frozenHash = sha256(frozenPath);
  if (sourceHash !== frozenHash) {
    throw new Error(`R4 frozen evidence mismatch: ${frozenRelative}`);
  }
  const hashMode = path.extname(frozenRelative).toLowerCase() === ".png" ? "binary" : "text_lf";
  freezeFiles[frozenRelative] = {
    sha256: sha256(frozenPath, hashMode === "binary" ? "binary" : "text"),
    hash_mode: hashMode,
    source: `阶段4B-2A-R4_单题回归修复/${r4Relative}`
  };
}
writeJson("evidence/r4-freeze.json", {
  captured_at: new Date().toISOString(),
  r4_commit: "5ad5467",
  status: "FROZEN",
  files: freezeFiles
});

const r4Config = readJson("baseline/dify-config-r4-final.json");
const r5Config = readJson("evidence/dify-config-after-r5.json");
const localPrompt = fs.readFileSync(path.join(root, "configs/r5-system-prompt.txt"), "utf8").trim();
const localPromptSha = crypto.createHash("sha256").update(localPrompt).digest("hex");
if (r5Config.prompt_sha256 !== localPromptSha) {
  throw new Error("Local R5 prompt does not match the captured Dify prompt");
}
writeJson("evidence/dify-config-comparison-r5.json", {
  captured_at: new Date().toISOString(),
  before: {
    evidence: "baseline/dify-config-r4-final.json",
    version: r4Config.workflow_versions.find(item => item.version_number === 18)?.version_number,
    marked_name: r4Config.workflow_versions.find(item => item.version_number === 18)?.marked_name,
    model: r4Config.model.name,
    top_k: r4Config.knowledge_nodes[0].top_k,
    reranking_model: r4Config.knowledge_nodes[0].reranking_model,
    prompt_sha256: r4Config.prompt_sha256
  },
  after: {
    evidence: "evidence/dify-config-after-r5.json",
    version: r5Config.workflow_versions.find(item => item.version_number === 21)?.version_number,
    marked_name: r5Config.workflow_versions.find(item => item.version_number === 21)?.marked_name,
    model: r5Config.model.name,
    top_k: r5Config.knowledge_nodes[0].top_k,
    reranking_model: r5Config.knowledge_nodes[0].reranking_model,
    prompt_sha256: r5Config.prompt_sha256
  },
  changes: [
    "single-objective questions retrieve with the original question only",
    "rewrites supplement intent and cannot add facts treated as user-confirmed",
    "single-objective selection is relevance-first and may return several segments from one logical document",
    "document diversity is reserved for explicit multi-objective questions",
    "internal candidate pool remains 10 while the user-visible answer is evaluated on Top3"
  ],
  business_knowledge_published: false
});

const formal = readJson("evidence/p10-real-r5.json");
const formalR4 = readJson("baseline/p10-real-r4.json");
const regression = readJson("evidence/regression-v5-real.json");
const holdout = readJson("evidence/holdout-v5-first-run.json");
const pocSemantic = readJson("evidence/poc-r04-visible-semantic-r5.json");
const inventory = readJson("evidence/candidate-inventory-after-r5.json");
const h07Before = readJson("baseline/RET-H07-first-failure.json");
const h07After = readJson("evidence/probe-RET-H07-user-visible-final.json");
const h07Semantic = readJson("evidence/semantic-RET-H07-probe-RET-H07-user-visible-final.json");
const holdoutPath = path.join(root, "evidence/holdout-v5-first-run.json");
writeJson("evidence/r5-holdout-freeze.json", {
  captured_at: new Date().toISOString(),
  run_id: holdout.run_id,
  task_count: holdout.task_count,
  semantic_passed_count: holdout.semantic_passed_count,
  passed: holdout.passed,
  used_for_tuning: holdout.used_for_tuning,
  sha256: sha256(holdoutPath, "text"),
  hash_mode: "text_lf",
  note: "RET-H09 first-run failure is immutable and must not be rerun or overwritten."
});

writeJson("evidence/formal-r4-vs-r5.json", {
  captured_at: new Date().toISOString(),
  r4: {
    run_id: formalR4.run_id,
    status: formalR4.status,
    recall_at_3_core: formalR4.metrics.recall_at_3_core,
    source_hits_core: formalR4.metrics.correct_source_hits_core,
    covered_sources: `${formalR4.metrics.retrieval_covered_source_count}/${formalR4.metrics.retrieval_expected_source_count}`,
    model_effective_answers: formalR4.metrics.cost.model_effective_answer_count,
    provider_errors: formalR4.metrics.provider_errors
  },
  r5: {
    run_id: formal.run_id,
    status: formal.status,
    recall_at_3_core: formal.metrics.recall_at_3_core,
    source_hits_core: formal.metrics.correct_source_hits_core,
    covered_sources: `${formal.metrics.retrieval_covered_source_count}/${formal.metrics.retrieval_expected_source_count}`,
    model_effective_answers: formal.metrics.cost.model_effective_answer_count,
    provider_errors: formal.metrics.provider_errors
  },
  result: "Formal 17-task aggregate gates remain PASSED after relevance-first retrieval."
});

writeJson("evidence/ret-h07-top3-before-after.json", {
  captured_at: new Date().toISOString(),
  task_id: "RET-H07",
  original_question: h07Before.original_question,
  rewrites: [
    "左耳放回盒子没有充电提示，换线和换电源都不亮，要先检查哪些位置？",
    "AirPods Pro 3 单耳不充电，指示灯也不亮，第一步怎么处理？"
  ],
  before: {
    source: "baseline/RET-H07-first-failure.json",
    merge_strategy: h07Before.retrieval_diversity.merge_strategy,
    internal_candidate_pool_size: h07Before.retrieval_diversity.internal_candidate_pool_size,
    displayed_top_k: h07Before.retrieval_diversity.displayed_top_k,
    top3: h07Before.retrieval_resources.map(item => ({
      position: item.position,
      document_id: item.document_id,
      segment_id: item.segment_id,
      score: item.score
    })),
    answer_status: h07Before.answer_status,
    semantic_passed: h07Before.business_semantics.passed
  },
  after: {
    source: "evidence/probe-RET-H07-user-visible-final.json",
    provider_request_id: h07After.provider_request_id,
    retrieval_query: h07After.retrieval_trace.retrieval_queries[0],
    merge_strategy: h07After.retrieval_trace.merge_strategy,
    internal_candidate_pool_size: h07After.retrieval_trace.candidate_pool_size,
    displayed_top_k: h07After.retrieval_trace.displayed_top_k,
    top3: h07After.normalized.retrieval_resources.map(item => ({
      position: item.position,
      document_id: item.document_id,
      segment_id: item.segment_id,
      score: item.score
    })),
    answer_status: h07After.normalized.answer_status,
    semantic_passed: h07Semantic.passed,
    citation_gate_passed: h07After.normalized.citation_support.passed
  }
});

const h09 = holdout.results.find(result => result.task_id === "RET-H09");
const h10 = holdout.results.find(result => result.task_id === "RET-H10");
const h07Regression = regression.results.find(result => result.task_id === "RET-H07");
const h08Regression = regression.results.find(result => result.task_id === "RET-H08");
const qualityGate = {
  captured_at: new Date().toISOString(),
  status: "FAILED",
  formal: {
    run_id: formal.run_id,
    status: formal.status,
    source_mode: formal.source_mode,
    model: formal.model,
    dataset: formal.dataset,
    task_count: formal.results.length,
    metrics: formal.metrics
  },
  poc_r04: {
    run_id: pocSemantic.run_id,
    status: pocSemantic.status,
    semantic_passed: pocSemantic.passed,
    citation_support_passed: pocSemantic.citation_support_passed,
    hidden_goal_reference_count: pocSemantic.semantics.unseen_goal_labels.length +
      pocSemantic.semantics.action_internal_references.length
  },
  regression: {
    run_id: regression.run_id,
    task_count: regression.task_count,
    semantic_passed_count: regression.semantic_passed_count,
    passed: regression.passed,
    ret_h07_semantic_passed: h07Regression.business_semantics.passed,
    ret_h07_power_evidence_present: h07Regression.retrieval_resources.some(item =>
      item.segment_id === "157cc321-cf47-44a0-872c-e30d38e5e5ab"
    ),
    ret_h08_semantic_passed: h08Regression.business_semantics.passed,
    cost_status: regression.cost_status
  },
  holdout: {
    run_id: holdout.run_id,
    used_for_tuning: holdout.used_for_tuning,
    task_count: holdout.task_count,
    semantic_passed_count: holdout.semantic_passed_count,
    passed: holdout.passed,
    ret_h09: {
      answer_status: h09.answer_status,
      semantic_passed: h09.business_semantics.passed,
      provider_request_id: h09.provider_request_id,
      bff_request_id: h09.bff_request_id,
      missing_visible_action_groups: h09.business_semantics.visible_action_missing_groups
    },
    ret_h10: {
      answer_status: h10.answer_status,
      semantic_passed: h10.business_semantics.passed,
      provider_request_id: h10.provider_request_id,
      bff_request_id: h10.bff_request_id
    }
  },
  uniqueness: {
    active_document_count: inventory.active_document_count,
    logical_active_document_count: inventory.logical_active_document_count,
    duplicate_active_logical_documents: inventory.duplicate_active_logical_documents
  },
  threshold_unchanged: 0.9167,
  cost_status: "COST_UNKNOWN",
  release_performed: false,
  entered_4b2b: false,
  failure_reason: "RET-H09 首次保留样例语义失败，遗漏放回充电盒并合盖；按要求未重跑或调参。"
};
writeJson("evidence/quality-gate-r5.json", qualityGate);

console.log(JSON.stringify({
  status: qualityGate.status,
  formal: formal.status,
  regression: `${regression.semantic_passed_count}/${regression.task_count}`,
  holdout: `${holdout.semantic_passed_count}/${holdout.task_count}`,
  ret_h07_semantic: h07Semantic.passed,
  ret_h08_semantic: h08Regression.business_semantics.passed
}, null, 2));
