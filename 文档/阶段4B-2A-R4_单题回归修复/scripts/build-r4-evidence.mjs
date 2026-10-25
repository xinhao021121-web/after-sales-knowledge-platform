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

const r3 = readJson(path.join(baselineRoot, "p10-real-r3.json"));
const r3R04 = readJson(path.join(baselineRoot, "POC-R04-r3.json"));
const before = readJson(path.join(evidenceRoot, "POC-R04-before-fix.json"));
const formal = readJson(path.join(evidenceRoot, "p10-real-r4.json"));
const formalR04 = readJson(path.join(evidenceRoot, "formal-17", "POC-R04.json"));
const r04Semantic = readJson(path.join(evidenceRoot, "poc-r04-visible-semantic.json"));
const regression = readJson(path.join(evidenceRoot, "regression-v4-real.json"));
const holdout = readJson(path.join(evidenceRoot, "holdout-v4-first-run.json"));
const inventory = readJson(path.join(evidenceRoot, "candidate-inventory-after-r4.json"));
const config = readJson(path.join(evidenceRoot, "dify-config-after-r4.json"));

const freezeFiles = [
  "p10-real-r3.json",
  "regression-v2-real-r3.json",
  "holdout-v3-first-run-r3.json",
  "quality-gate-r3.json",
  "POC-R04-r3.json",
  "RET-H01-r3-fixed.json",
  "RET-H04-r3-first-run.json"
];
writeJson("r3-freeze.json", {
  captured_at: new Date().toISOString(),
  git_commit: "5cf855c8785a8b7a335f7376876a54bfc0222045",
  git_commit_short: "5cf855c",
  r3_run_id: r3.run_id,
  r3_status: r3.status,
  r3_metrics: r3.metrics,
  files: Object.fromEntries(freezeFiles.map(name => [
    `baseline/${name}`,
    sha256(path.join(baselineRoot, name))
  ]))
});

writeJson("poc-r04-diagnosis.json", {
  captured_at: new Date().toISOString(),
  r2_success: {
    evidence: "R2 evidence referenced by frozen R3 baseline",
    status: "ANSWERED",
    answer: "R2 简明结论 + FAQ 排查路径",
    citation_support_passed: true
  },
  r3_regression: {
    evidence: "baseline/POC-R04-r3.json",
    status: r3R04.answer_status,
    answer: r3R04.evidence.answer,
    suggested_action: r3R04.evidence.suggested_action,
    citation_support_passed: r3R04.citation_support_passed,
    answer_goals: r3R04.answer_goals,
    root_causes: [
      "single-target cause and troubleshooting questions were incorrectly split into two goals",
      "BFF applied the multi-goal distinct-citation requirement to a non-explicit compound question",
      "suggested action copied an internal “目标二” reference",
      "NEED summary replaced actionable content with a generic fallback"
    ]
  },
  diagnostic_before_fix: {
    evidence: "evidence/POC-R04-before-fix.json",
    status: before.normalized.answer_status,
    suggested_action: before.normalized.suggested_action,
    provider_request_id: before.provider_request_id,
    goals: before.normalized.answer_goals
  },
  final_user_visible: {
    evidence: "evidence/formal-17/POC-R04.json",
    status: formalR04.answer_status,
    answer: formalR04.evidence.answer,
    suggested_action: formalR04.evidence.suggested_action,
    citation_support_passed: formalR04.citation_support_passed,
    provider_request_id: formalR04.provider_request_id,
    bff_request_id: formalR04.bff_request_id,
    resources: formalR04.evidence.retrieved,
    hidden_goal_reference_count: [...`${formalR04.evidence.answer} ${formalR04.evidence.suggested_action}`
      .matchAll(/目标[一二三四1-4]/g)].length
  },
  semantic_acceptance: r04Semantic
});

writeJson("dify-config-comparison-r4.json", {
  captured_at: new Date().toISOString(),
  before: {
    evidence: "baseline/r3-system-prompt.txt",
    version: 16,
    model: "deepseek-v4-pro",
    top_k: 10
  },
  after: {
    evidence: "evidence/dify-config-after-r4.json",
    version: config.workflow_versions.find(item => item.version_number)?.version_number,
    model: config.model.name,
    top_k: config.knowledge_nodes[0].top_k,
    prompt_sha256: config.prompt_sha256
  },
  changes: [
    "same business problem cannot be split into cause and troubleshooting goals",
    "next-step actions must be self-contained and cannot reference goal labels",
    "repair and replacement journeys must explicitly state no free repair or replacement promise"
  ],
  business_knowledge_published: false
});

const originalThree = regression.results.filter(result =>
  ["RET-H01", "RET-H02", "RET-H03"].includes(result.task_id)
);
writeJson("formal-r3-vs-r4.json", {
  captured_at: new Date().toISOString(),
  r3: {
    run_id: r3.run_id,
    recall_at_3_core: r3.metrics.recall_at_3_core,
    source_hits_core: r3.metrics.correct_source_hits_core,
    answered: r3.metrics.cost.model_effective_answer_count,
    provider_errors: r3.metrics.provider_errors
  },
  r4: {
    run_id: formal.run_id,
    recall_at_3_core: formal.metrics.recall_at_3_core,
    source_hits_core: formal.metrics.correct_source_hits_core,
    answered: formal.metrics.cost.model_effective_answer_count,
    provider_errors: formal.metrics.provider_errors
  },
  result: "Formal aggregate gates remain PASSED; POC-R04 user-visible regression is repaired."
});

writeJson("original-three-regression-r4.json", {
  run_id: regression.run_id,
  tasks: originalThree,
  all_semantic_passed: originalThree.every(result => result.business_semantics.passed)
});

writeJson("quality-gate-r4.json", {
  captured_at: new Date().toISOString(),
  status: "FAILED",
  formal: {
    run_id: formal.run_id,
    status: formal.status,
    metrics: formal.metrics,
    passed: formal.status === "PASSED"
  },
  poc_r04: {
    status: formalR04.answer_status,
    semantic_passed: r04Semantic.passed,
    citation_support_passed: formalR04.citation_support_passed,
    hidden_goal_reference_count: [...`${formalR04.evidence.answer} ${formalR04.evidence.suggested_action}`
      .matchAll(/目标[一二三四1-4]/g)].length
  },
  regression: {
    run_id: regression.run_id,
    task_count: regression.task_count,
    semantic_passed_count: regression.semantic_passed_count,
    passed: regression.passed,
    expected_source_count: regression.expected_source_count,
    covered_source_count: regression.covered_source_count,
    recall_at_3: regression.recall_at_3
  },
  holdout: {
    run_id: holdout.run_id,
    used_for_tuning: holdout.used_for_tuning,
    task_count: holdout.task_count,
    semantic_passed_count: holdout.semantic_passed_count,
    passed: holdout.passed,
    failed_tasks: holdout.results
      .filter(result => !result.business_semantics.passed)
      .map(result => ({
        task_id: result.task_id,
        answer_status: result.answer_status,
        answer: result.answer,
        missing_visible_action_groups: result.business_semantics.visible_action_missing_groups
      }))
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
  failure_reason: "RET-H07 first holdout answer used product-identity checks instead of the expected power/connection troubleshooting and therefore failed business semantics."
});

console.log("PASSED: R4 evidence built with overall quality status FAILED as recorded.");
