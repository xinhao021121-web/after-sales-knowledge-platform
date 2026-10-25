import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..", "..", "..");
const recoveryRoot = path.resolve(here, "..");
const baselineRoot = path.join(recoveryRoot, "baseline");
const regressionV2 = JSON.parse(fs.readFileSync(
  path.join(baselineRoot, "regression-set-v2.0.json"),
  "utf8"
));
const holdoutV3 = JSON.parse(fs.readFileSync(
  path.join(baselineRoot, "holdout-set-v3.0.json"),
  "utf8"
));
const commonVisibility = {
  forbid_generic_fallback_when_evidence: true,
  action_concept_groups: []
};
const tasks = [...regressionV2.tasks, ...holdoutV3.tasks].map(task => {
  const visibility = {...commonVisibility};
  if (task.id === "RET-H01") {
    visibility.action_concept_groups = [
      ["退货"],
      ["保修", "维修"],
      ["检测", "核验"]
    ];
  }
  if (task.id === "RET-H04") {
    visibility.action_concept_groups = [
      ["换货"],
      ["维修"],
      ["检测", "核验"]
    ];
  }
  return {
    ...task,
    semantic_expectations: {
      ...task.semantic_expectations,
      ...visibility
    }
  };
});
const regression = {
  evaluation_set_id: "EVAL-RAG-R4-REGRESSION-4.0.0",
  version: "4.0.0",
  frozen_at: "2026-10-25",
  sample_type: "REGRESSION",
  used_for_tuning: true,
  includes: "R2 原三条回归 + R3 三条跨文档/知识不足/安全回归",
  semantic_rules: {
    ...regressionV2.semantic_rules,
    reject_unseen_internal_goal_labels: true,
    reject_internal_goal_reference_in_action: true,
    reject_generic_fallback_when_evidence_exists: true
  },
  tasks
};
fs.writeFileSync(
  path.join(recoveryRoot, "regression", "retention-set-v4.0.json"),
  `${JSON.stringify(regression, null, 2)}\n`,
  "utf8"
);

const evaluationSet = JSON.parse(fs.readFileSync(
  path.join(projectRoot, "文档", "阶段4A_RAG能力验证", "evaluation", "eval-set-v1.0.json"),
  "utf8"
));
const r04 = evaluationSet.tasks.find(task => task.id === "POC-R04");
const r04Spec = {
  evaluation_set_id: "EVAL-RAG-R4-POC-R04-VISIBLE-1.0.0",
  version: "1.0.0",
  sample_type: "REGRESSION",
  frozen_at: "2026-10-25",
  task: {
    ...r04,
    accepted_statuses: ["ANSWERED", "NEED_CLARIFICATION"],
    semantic_expectations: {
      require_citation_regardless_status: true,
      action_concept_groups: [
        ["放回充电盒", "合盖"],
        ["声道平衡"],
        ["耳塞", "网罩", "清洁"],
        ["重置", "重新配对"],
        ["转售后检测"],
        ["不得承诺免费维修或换新", "不承诺免费维修或换新"]
      ],
      forbid_generic_fallback_when_evidence: true
    },
    manual_review: [
      "用户可见回答是否包含放回盒盖、声道、清洁、重配、转检测",
      "建议动作是否不使用目标编号",
      "是否明确不承诺免费维修或换新",
      "引用是否通过"
    ]
  }
};
fs.writeFileSync(
  path.join(recoveryRoot, "regression", "poc-r04-visible-v1.0.json"),
  `${JSON.stringify(r04Spec, null, 2)}\n`,
  "utf8"
);
console.log("PASSED: R4 regression and R04 visibility specifications built.");
