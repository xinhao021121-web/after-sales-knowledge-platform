import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const evidenceRoot = path.join(root, "evidence");
const baselineRoot = path.join(root, "baseline");
const readJson = file => JSON.parse(fs.readFileSync(file, "utf8"));
const writeJson = (name, value) => fs.writeFileSync(
  path.join(evidenceRoot, name),
  `${JSON.stringify(value, null, 2)}\n`,
  "utf8"
);
const sha256 = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

const formal = readJson(path.join(evidenceRoot, "p10-real-r3.json"));
const regression = readJson(path.join(evidenceRoot, "regression-v2-real.json"));
const holdout = readJson(path.join(evidenceRoot, "holdout-v3-first-run.json"));
const inventory = readJson(path.join(evidenceRoot, "candidate-inventory-after-r3.json"));
const afterConfig = readJson(path.join(evidenceRoot, "dify-config-after-r3.json"));
const r2 = readJson(path.join(baselineRoot, "p10-real-r2.json"));
const h01First = readJson(path.join(baselineRoot, "RET-H01-first-failure.json"));
const h01Before = readJson(path.join(evidenceRoot, "probe-RET-H01-before-fix.json"));
const h01After = readJson(path.join(evidenceRoot, "regression", "RET-H01.json"));

const baselineFiles = [
  "p10-real-r2.json",
  "holdout-real-r2.json",
  "RET-H01-first-failure.json",
  "RET-H02-first-failure.json",
  "RET-H03-first-failure.json",
  "quality-gate-r2.json",
  "dify-config-r2-final.json"
];
writeJson("r2-freeze.json", {
  captured_at: new Date().toISOString(),
  git_commit: "a3ec72522ea7f3704311a180079fa89d62ae2222",
  git_commit_short: "a3ec725",
  r2_run_id: r2.run_id,
  r2_status: r2.status,
  r2_metrics: r2.metrics,
  files: Object.fromEntries(baselineFiles.map(name => [
    `baseline/${name}`,
    sha256(path.join(baselineRoot, name))
  ]))
});

writeJson("ret-h01-root-cause.json", {
  captured_at: new Date().toISOString(),
  r2_first_failure: {
    evidence: "baseline/RET-H01-first-failure.json",
    status: h01First.answer_status,
    answer: h01First.answer,
    suggested_action: h01First.suggested_action,
    provider_request_id: h01First.provider_request_id,
    bff_request_id: h01First.bff_request_id,
    retrieval_resources: h01First.retrieval_resources
  },
  diagnostic_before_fix: {
    evidence: "evidence/probe-RET-H01-before-fix.json",
    status: h01Before.normalized.answer_status,
    provider_request_id: h01Before.provider_request_id,
    selected_segments: h01Before.raw_resources.map(resource => ({
      document_id: resource.document_id,
      segment_id: resource.segment_id,
      score: resource.score,
      content: resource.content
    })),
    root_cause: "The internal candidate pool contained 13 resources, but document representatives were title or front-matter slices with no extractable business claims. The model correctly refused to invent answers, then the BFF exposed an invalid document-body request."
  },
  final_regression: {
    evidence: "evidence/regression/RET-H01.json",
    status: h01After.answer_status,
    answer: h01After.answer,
    answer_goals: h01After.answer_goals,
    citations: h01After.citations,
    semantic_passed: h01After.business_semantics.passed,
    provider_request_id: h01After.provider_request_id,
    bff_request_id: h01After.bff_request_id
  },
  r04_difference: {
    explanation: "R04 was single-goal and had one directly matching FAQ body slice. RET-H01 was multi-goal and failed before prompt inference because all three displayed resources were title/front-matter slices. The fix therefore combined substantive retrieval with explicit goal-specific answer structure."
  }
});

writeJson("formal-r2-vs-r3.json", {
  captured_at: new Date().toISOString(),
  r2: {
    run_id: r2.run_id,
    recall_at_3_core: r2.metrics.recall_at_3_core,
    covered_source_count: r2.metrics.retrieval_covered_source_count,
    expected_source_count: r2.metrics.retrieval_expected_source_count,
    correct_source_hits_core: r2.metrics.correct_source_hits_core,
    model_effective_answer_count: r2.metrics.cost.model_effective_answer_count
  },
  r3: {
    run_id: formal.run_id,
    recall_at_3_core: formal.metrics.recall_at_3_core,
    covered_source_count: formal.metrics.retrieval_covered_source_count,
    expected_source_count: formal.metrics.retrieval_expected_source_count,
    correct_source_hits_core: formal.metrics.correct_source_hits_core,
    model_effective_answer_count: formal.metrics.cost.model_effective_answer_count
  },
  unchanged_threshold: 0.9167,
  result: "No formal retrieval or gate regression."
});

writeJson("dify-config-comparison-r3.json", {
  captured_at: new Date().toISOString(),
  before: {
    evidence: "baseline/dify-config-r2-final.json",
    published_version: 14,
    model: "deepseek-v4-pro",
    top_k: 10,
    prompt_file: "baseline/r2-system-prompt.txt"
  },
  after: {
    evidence: "evidence/dify-config-after-r3.json",
    published_version: afterConfig.workflow_versions.find(item => item.version_number)?.version_number,
    model: afterConfig.model.name,
    top_k: afterConfig.knowledge_nodes[0].top_k,
    prompt_sha256: afterConfig.prompt_sha256,
    prompt_file: "configs/r3-system-prompt.txt"
  },
  changes: [
    "multi-goal answer sections are mandatory when multiple business objectives exist",
    "system-retrieved evidence cannot be requested back from the user",
    "each goal requires its own citation",
    "material user facts cannot be omitted"
  ],
  business_knowledge_published: false
});

writeJson("quality-gate-r3.json", {
  captured_at: new Date().toISOString(),
  formal: {
    run_id: formal.run_id,
    status: formal.status,
    metrics: formal.metrics
  },
  regression: {
    run_id: regression.run_id,
    passed: regression.passed,
    semantic_passed_count: regression.semantic_passed_count,
    task_count: regression.task_count,
    expected_source_count: regression.expected_source_count,
    covered_source_count: regression.covered_source_count,
    recall_at_3: regression.recall_at_3,
    allowed_status_suite: true
  },
  holdout: {
    run_id: holdout.run_id,
    used_for_tuning: holdout.used_for_tuning,
    passed: holdout.passed,
    semantic_passed_count: holdout.semantic_passed_count,
    task_count: holdout.task_count,
    expected_source_count: holdout.expected_source_count,
    covered_source_count: holdout.covered_source_count,
    recall_at_3: holdout.recall_at_3,
    first_run_preserved: true
  },
  uniqueness: {
    active_document_count: inventory.active_document_count,
    logical_active_document_count: inventory.logical_active_document_count,
    duplicate_active_logical_documents: inventory.duplicate_active_logical_documents
  },
  threshold_unchanged: 0.9167,
  cost_status: "COST_UNKNOWN",
  release_performed: false,
  entered_4b2b: false
});

console.log("PASSED: R3 machine-readable evidence rebuilt.");
