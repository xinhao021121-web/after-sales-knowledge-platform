import {execFileSync} from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const closureRoot = path.resolve(here, "..");
const docsRoot = path.dirname(closureRoot);
const project1Root = path.dirname(docsRoot);
const repositoryRoot = path.dirname(project1Root);
const r5Root = path.join(docsRoot, "阶段4B-2A-R5_单目标检索与质量收口");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function isTextFile(filePath) {
  return new Set([
    ".json", ".md", ".txt", ".mjs", ".js", ".ps1",
    ".html", ".css", ".yaml", ".yml", ".csv", ".svg"
  ]).has(path.extname(filePath).toLowerCase());
}

function contentHash(filePath) {
  const content = fs.readFileSync(filePath);
  const normalized = isTextFile(filePath)
    ? content.toString("utf8").replace(/\r\n/g, "\n")
    : content;
  return {
    sha256: crypto.createHash("sha256").update(normalized).digest("hex"),
    hash_mode: isTextFile(filePath) ? "text_lf" : "binary",
    bytes: content.length
  };
}

function listFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(target));
    else if (entry.isFile()) files.push(target);
  }
  return files.sort((left, right) => left.localeCompare(right));
}

const formalSetPath = path.join(
  docsRoot,
  "阶段4A_RAG能力验证",
  "evaluation",
  "eval-set-v1.0.json"
);
const regressionSetPath = path.join(r5Root, "regression", "retention-set-v5.0.json");
const holdoutSetPath = path.join(r5Root, "holdout", "retention-set-v5.0.json");
const formalSet = readJson(formalSetPath);
const regressionSet = readJson(regressionSetPath);
const holdoutSet = readJson(holdoutSetPath);

const tasks = [
  ...formalSet.tasks.map(task => ({
    suite: "FORMAL_17",
    source_set_id: formalSet.evaluation_set_id,
    used_for_tuning: false,
    task
  })),
  ...regressionSet.tasks.map(task => ({
    suite: "REGRESSION_8",
    source_set_id: regressionSet.evaluation_set_id,
    used_for_tuning: regressionSet.used_for_tuning,
    task
  })),
  ...holdoutSet.tasks.map(task => ({
    suite: "HOLDOUT_2",
    source_set_id: holdoutSet.evaluation_set_id,
    used_for_tuning: false,
    task
  }))
];
const taskIds = tasks.map(item => item.task.id);
if (tasks.length !== 27 || new Set(taskIds).size !== 27) {
  throw new Error(`Fixed regression set must contain 27 unique tasks; got ${tasks.length}/${new Set(taskIds).size}`);
}

const r5Commit = execFileSync(
  "git",
  ["-C", repositoryRoot, "rev-parse", "--short=7", "HEAD"],
  {encoding: "utf8"}
).trim();
const sourceFiles = [
  formalSetPath,
  regressionSetPath,
  holdoutSetPath
].map(filePath => ({
  path: path.relative(docsRoot, filePath).replaceAll("\\", "/"),
  ...contentHash(filePath)
}));

const fixedSet = {
  evaluation_set_id: "EVAL-RAG-4B2A-FIXED-FINAL-1.0.0",
  version: "1.0.0",
  frozen_at: "2026-10-25",
  frozen_from_commit: r5Commit,
  status: "FROZEN",
  purpose: "4B-2A 后续质量修复的唯一固定回归集合",
  policy: {
    task_count: 27,
    suites: {
      FORMAL_17: 17,
      REGRESSION_8: 8,
      HOLDOUT_2: 2
    },
    add_tasks_within_same_repair_round: false,
    preserve_first_run_results: true,
    production_gate_uses_same_set: true
  },
  source_files: sourceFiles,
  tasks
};
writeJson(
  path.join(closureRoot, "fixed-regression", "retention-set-frozen-final-1.0.0.json"),
  fixedSet
);

const formalRun = readJson(path.join(r5Root, "evidence", "p10-real-r5.json"));
const regressionRun = readJson(path.join(r5Root, "evidence", "regression-v5-real.json"));
const holdoutRun = readJson(path.join(r5Root, "evidence", "holdout-v5-first-run.json"));
const r5Quality = readJson(path.join(r5Root, "evidence", "quality-gate-r5.json"));
const h09 = holdoutRun.results.find(result => result.task_id === "RET-H09");
const h10 = holdoutRun.results.find(result => result.task_id === "RET-H10");

const finalMetrics = {
  captured_at: new Date().toISOString(),
  frozen_from_commit: r5Commit,
  source_mode: "REAL_DIFY",
  model: "deepseek-v4-pro",
  dataset: "CANDIDATE",
  threshold: 0.9167,
  formal_17: {
    run_id: formalRun.run_id,
    status: formalRun.status,
    task_count: formalRun.results.length,
    recall_at_3: formalRun.metrics.recall_at_3_core,
    covered_source_count: formalRun.metrics.retrieval_covered_source_count,
    expected_source_count: formalRun.metrics.retrieval_expected_source_count,
    core_source_hits: formalRun.metrics.correct_source_hits_core,
    core_source_denominator: formalRun.metrics.correct_source_denominator,
    p0_failures: formalRun.metrics.p0_final_failures,
    citation_failures: formalRun.metrics.citation_failures,
    provider_errors: formalRun.metrics.provider_errors,
    model_effective_answered: formalRun.metrics.cost.model_effective_answer_count
  },
  regression_8: {
    run_id: regressionRun.run_id,
    status: regressionRun.passed ? "PASSED" : "FAILED",
    semantic_passed_count: regressionRun.semantic_passed_count,
    task_count: regressionRun.task_count,
    p0_failures: regressionRun.p0_failures,
    citation_failures: regressionRun.citation_failures,
    provider_errors: regressionRun.provider_errors
  },
  holdout_2: {
    run_id: holdoutRun.run_id,
    status: holdoutRun.passed ? "PASSED" : "FAILED",
    semantic_passed_count: holdoutRun.semantic_passed_count,
    task_count: holdoutRun.task_count,
    ret_h09: {
      answer_status: h09.answer_status,
      semantic_passed: h09.business_semantics.passed,
      missing_action_groups: h09.business_semantics.visible_action_missing_groups,
      provider_request_id: h09.provider_request_id,
      bff_request_id: h09.bff_request_id
    },
    ret_h10: {
      answer_status: h10.answer_status,
      semantic_passed: h10.business_semantics.passed,
      provider_request_id: h10.provider_request_id,
      bff_request_id: h10.bff_request_id
    }
  },
  cost_status: "COST_UNKNOWN"
};
writeJson(path.join(closureRoot, "evidence", "final-metrics.json"), finalMetrics);

const acceptanceGate = {
  captured_at: new Date().toISOString(),
  frozen_from_commit: r5Commit,
  acceptance_layers: {
    engineering_and_safety: {
      status: "PASSED",
      evidence: "R5 validation, unit, E2E, P0, claim, permission, expiry and provider-error gates"
    },
    product_quality: {
      status: "FAILED_KNOWN_DEFECT",
      reason: "RET-H09 first holdout semantic regression failed"
    }
  },
  gates: {
    formal_17: {status: "PASSED", run_id: formalRun.run_id},
    regression_8: {
      status: regressionRun.passed ? "PASSED" : "FAILED",
      passed: regressionRun.semantic_passed_count,
      total: regressionRun.task_count
    },
    holdout_2: {
      status: holdoutRun.passed ? "PASSED" : "FAILED",
      passed: holdoutRun.semantic_passed_count,
      total: holdoutRun.task_count,
      known_defect_task: "RET-H09"
    }
  },
  prototype_status: "CLOSED_AS_INTERNAL_LEARNING_PROTOTYPE_WITH_KNOWN_DEFECT",
  production_release: "FORBIDDEN",
  production_release_allowed: false,
  release_performed: false,
  entered_4b2b: false,
  upstream_quality_gate_status: r5Quality.status,
  threshold_unchanged: 0.9167,
  cost_status: "COST_UNKNOWN",
  evidence_root: "阶段4B-2A-R5_单目标检索与质量收口/evidence"
};
writeJson(path.join(closureRoot, "evidence", "acceptance-gate.json"), acceptanceGate);

const stageDirectories = [
  "阶段4B-2A_P06真实入库与P10真实评测",
  "阶段4B-2A-R1_质量回归诊断",
  "阶段4B-2A-R2_质量恢复",
  "阶段4B-2A-R3_跨文档回答修复",
  "阶段4B-2A-R4_单题回归修复",
  "阶段4B-2A-R5_单目标检索与质量收口"
];
const evidenceFiles = [];
for (const stageName of stageDirectories) {
  for (const filePath of listFiles(path.join(docsRoot, stageName))) {
    evidenceFiles.push({
      path: path.relative(docsRoot, filePath).replaceAll("\\", "/"),
      ...contentHash(filePath)
    });
  }
}
const evidenceManifest = {
  captured_at: new Date().toISOString(),
  frozen_from_commit: r5Commit,
  status: "FROZEN",
  stage_directories: stageDirectories,
  file_count: evidenceFiles.length,
  files: evidenceFiles
};
writeJson(
  path.join(closureRoot, "evidence", "r1-r5-evidence-manifest.json"),
  evidenceManifest
);

console.log(JSON.stringify({
  frozen_from_commit: r5Commit,
  fixed_regression_task_count: tasks.length,
  evidence_file_count: evidenceFiles.length,
  formal_17: formalRun.status,
  regression_8: `${regressionRun.semantic_passed_count}/${regressionRun.task_count}`,
  holdout_2: `${holdoutRun.semantic_passed_count}/${holdoutRun.task_count}`,
  production_release: acceptanceGate.production_release
}, null, 2));
