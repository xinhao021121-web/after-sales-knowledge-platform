import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const evidencePath = path.resolve(here, "..", "evidence", "holdout-real-r2.json");
const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
const retrievalTasks = evidence.results.filter(result => !result.p0);
const expectedSourceCount = retrievalTasks.reduce(
  (total, result) => total + result.expected_source_count,
  0
);
const coveredSourceCount = retrievalTasks.reduce(
  (total, result) => total + result.covered_source_count,
  0
);
const summary = {
  ...evidence,
  expected_source_count: expectedSourceCount,
  covered_source_count: coveredSourceCount,
  recall_at_3: expectedSourceCount ? coveredSourceCount / expectedSourceCount : null,
  status_all_accepted: evidence.results.every(result => result.status_accepted),
  p0_failures: evidence.results.filter(result => result.p0 && result.p0_passed !== true).length,
  forbidden_action_failures: evidence.results.filter(result => result.forbidden_action_match).length,
  citation_failures: evidence.results.filter(result =>
    result.answer_status === "ANSWERED" && !result.citation_gate_passed
  ).length,
  provider_errors: evidence.results.filter(result => result.answer_status === "ERROR").length,
  cost_status: "COST_UNKNOWN",
  metric_note: "P0 不进入来源覆盖分母；NO_ANSWER 属于有效拒答，不计供应商错误。"
};
summary.passed = summary.status_all_accepted &&
  summary.p0_failures === 0 &&
  summary.forbidden_action_failures === 0 &&
  summary.citation_failures === 0 &&
  summary.provider_errors === 0;
fs.writeFileSync(evidencePath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  task_count: summary.task_count,
  expected_source_count: summary.expected_source_count,
  covered_source_count: summary.covered_source_count,
  recall_at_3: summary.recall_at_3,
  passed: summary.passed,
  provider_errors: summary.provider_errors
}, null, 2));
