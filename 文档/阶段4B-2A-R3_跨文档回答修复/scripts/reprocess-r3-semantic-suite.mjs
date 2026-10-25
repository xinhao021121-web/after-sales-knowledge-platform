import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateBusinessSemantics } from "../../阶段4B-1_BFF与P03真实RAG接入/server/semantic-evaluation.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const recoveryRoot = path.resolve(here, "..");
const suite = process.argv[2] === "holdout" ? "holdout" : "regression";
const inputPath = suite === "holdout"
  ? path.join(recoveryRoot, "holdout", "retention-set-v3.0.json")
  : path.join(recoveryRoot, "regression", "retention-set-v2.0.json");
const evidenceName = suite === "holdout" ? "holdout-v3-first-run.json" : "regression-v2-real.json";
const taskSet = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const aggregatePath = path.join(recoveryRoot, "evidence", evidenceName);
const aggregate = JSON.parse(fs.readFileSync(aggregatePath, "utf8"));

for (const result of aggregate.results) {
  const task = taskSet.tasks.find(item => item.id === result.task_id);
  if (!task) throw new Error(`Unknown task in aggregate: ${result.task_id}`);
  result.p0 = Boolean(task.p0);
  result.p0_passed = task.p0
    ? result.answer_status === "BLOCKED_SAFETY" &&
      result.provider_called === false &&
      result.citations?.[0]?.chunk_id === "CHUNK-SAFE-STOP-01"
    : null;
  const response = {
    answer: result.answer,
    suggested_action: result.suggested_action,
    answer_goals: result.answer_goals,
    retrieval_resources: result.retrieval_resources,
    citations: result.citations,
    citation_support: result.citation_support,
    answer_status: result.answer_status,
    provider_called: result.provider_called,
    p0_passed: result.p0_passed
  };
  result.business_semantics = evaluateBusinessSemantics(task, response);
  result.forbidden_action_match = result.business_semantics.forbidden_action_match;
}

aggregate.semantic_evaluator_version = "R3-1.0.1";
aggregate.reprocessed_at = new Date().toISOString();
aggregate.semantic_passed_count = aggregate.results.filter(result => result.business_semantics.passed).length;
aggregate.status_all_accepted = aggregate.results.every(result => result.business_semantics.status_accepted);
aggregate.p0_failures = aggregate.results.filter(result => result.p0 && result.p0_passed !== true).length;
aggregate.citation_failures = aggregate.results.filter(result =>
  result.answer_status === "ANSWERED" && !result.citation_gate_passed
).length;
aggregate.provider_errors = aggregate.results.filter(result => result.answer_status === "ERROR").length;
aggregate.forbidden_action_failures = aggregate.results.filter(result => result.forbidden_action_match).length;
aggregate.document_request_failures = aggregate.results.filter(result =>
  result.business_semantics.document_request_matches.length > 0
).length;
aggregate.passed = aggregate.semantic_passed_count === aggregate.task_count &&
  aggregate.status_all_accepted &&
  aggregate.p0_failures === 0 &&
  aggregate.citation_failures === 0 &&
  aggregate.provider_errors === 0 &&
  aggregate.forbidden_action_failures === 0 &&
  aggregate.document_request_failures === 0;

fs.writeFileSync(aggregatePath, `${JSON.stringify(aggregate, null, 2)}\n`, "utf8");
const evidenceRoot = path.join(recoveryRoot, "evidence", suite);
for (const result of aggregate.results) {
  fs.writeFileSync(
    path.join(evidenceRoot, `${result.task_id}.json`),
    `${JSON.stringify(result, null, 2)}\n`,
    "utf8"
  );
}
fs.writeFileSync(
  path.join(recoveryRoot, "evidence", `${suite}-manual-review.json`),
  `${JSON.stringify({
    run_id: aggregate.run_id,
    review_status: "PENDING_PRODUCT_OWNER",
    reviewed_by: null,
    reviewed_at: null,
    tasks: taskSet.tasks.map(task => ({
      task_id: task.id,
      automatic_semantic_passed: aggregate.results.find(result => result.task_id === task.id)?.business_semantics.passed,
      checklist: task.manual_review,
      product_owner_decision: null,
      notes: ""
    }))
  }, null, 2)}\n`,
  "utf8"
);
console.log(JSON.stringify({
  suite,
  run_id: aggregate.run_id,
  semantic_passed_count: aggregate.semantic_passed_count,
  task_count: aggregate.task_count,
  passed: aggregate.passed
}, null, 2));
