import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const baselineRoot = path.join(root, "baseline");
const regressionR4 = JSON.parse(fs.readFileSync(
  path.join(baselineRoot, "regression-set-v4.0.json"),
  "utf8"
));
const holdoutR4 = JSON.parse(fs.readFileSync(
  path.join(baselineRoot, "holdout-set-v4.0.json"),
  "utf8"
));
const tasks = [
  ...regressionR4.tasks,
  ...holdoutR4.tasks.map(task => ({...task, sample_type: "REGRESSION"}))
].map(task => {
  if (task.id !== "RET-H07") return task;
  return {
    ...task,
    semantic_expectations: {
      ...task.semantic_expectations,
      action_concept_groups: [
        ["充电盒", "耳机"],
        ["线缆", "电源", "适配器"],
        ["接口", "触点"],
        ["碎屑"],
        ["合盖", "等待"],
        ["重新配对", "重置"],
        ["售后", "检测", "维修"],
        ["不承诺免费维修或换新", "不得承诺免费维修或换新"]
      ]
    }
  };
});
const regression = {
  evaluation_set_id: "EVAL-RAG-R5-REGRESSION-5.0.0",
  version: "5.0.0",
  frozen_at: "2026-10-25",
  sample_type: "REGRESSION",
  used_for_tuning: true,
  includes: "R2 原三条 + R3 三条 + R4 的 RET-H07/H08",
  semantic_rules: {
    reject_unseen_internal_goal_labels: true,
    reject_internal_goal_reference_in_action: true,
    reject_generic_fallback_when_evidence_exists: true,
    original_question_is_authoritative: true
  },
  tasks
};
fs.writeFileSync(
  path.join(root, "regression", "retention-set-v5.0.json"),
  `${JSON.stringify(regression, null, 2)}\n`,
  "utf8"
);
console.log("PASSED: R5 eight-task regression set built.");
