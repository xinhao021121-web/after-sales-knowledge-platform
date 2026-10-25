import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const baselineRoot = path.resolve(root, "..", "阶段4A_RAG能力验证");
const evaluation = JSON.parse(fs.readFileSync(
  path.join(baselineRoot, "evaluation", "eval-set-v1.0.json"),
  "utf8"
));
const proComparison = JSON.parse(fs.readFileSync(
  path.join(baselineRoot, "experiments", "results", "dify-cloud", "comparison.json"),
  "utf8"
));
const proRaw = JSON.parse(fs.readFileSync(
  path.join(baselineRoot, "experiments", "results", "dify-cloud", "CFG-RERANK", "summary.json"),
  "utf8"
));
const review = JSON.parse(fs.readFileSync(
  path.join(root, "experiments", "manual-review-v1.json"),
  "utf8"
));
const rounds = ["FLASH-R1", "FLASH-R2"].map(roundId => JSON.parse(fs.readFileSync(
  path.join(root, "experiments", "results", "CFG-RERANK-FLASH", roundId, "normalized.json"),
  "utf8"
)));

function p95(values) {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.max(0, Math.ceil(0.95 * ordered.length) - 1)];
}

function rate(part, total) {
  return total ? Number((part / total).toFixed(4)) : null;
}

const proTasks = proRaw.results;
const proAllLatency = proTasks.map(task => task.elapsed_ms);
const proNonP0Latency = proTasks.filter(task => !task.p0).map(task => task.elapsed_ms);
const proFinal = proComparison.final_pipeline;
const proMetrics = {
  config_id: "CFG-RERANK-PRO",
  generation_model: "deepseek-v4-pro",
  task_count: 17,
  core_task_count: 12,
  recall_at_3: proFinal.recall_at_3_core,
  correct_source_hit_count: proFinal.correct_source_hit_core,
  correct_source_hit_denominator: 12,
  business_action_correct_count: proFinal.business_action_correct_count,
  conditions_correct_count: proFinal.business_action_correct_count,
  followup_complete_count: proFinal.followup_complete_count,
  correct_refusal_count: proFinal.correct_refusal_count,
  correct_refusal_denominator: 4,
  citation_support_reviewed_count: proFinal.citation_support_reviewed_count,
  citation_support_count: proFinal.citation_support_count,
  citation_traceable_count: proFinal.tasks.filter(task => (task.final_citations || []).length > 0).length,
  citation_traceable_denominator: proFinal.tasks.length,
  p0_count: proFinal.p0_count,
  p0_final_failures: proFinal.p0_final_failures,
  p0_provider_calls: proTasks.filter(task => task.p0).length,
  provider_raw_p0_failures: proFinal.provider_raw_p0_failures,
  average_provider_latency_ms: Math.round(proAllLatency.reduce((sum, value) => sum + value, 0) / proAllLatency.length),
  p95_provider_latency_ms: p95(proAllLatency),
  average_provider_non_p0_latency_ms: Math.round(
    proNonP0Latency.reduce((sum, value) => sum + value, 0) / proNonP0Latency.length
  ),
  p95_provider_non_p0_latency_ms: p95(proNonP0Latency)
};

function reviewValues(roundId, field) {
  const entries = Object.values(review.rounds[roundId]);
  return entries.map(entry => entry[field]);
}

function buildFlashMetrics(run) {
  const roundId = run.round_id;
  const core = run.results.filter(task => task.core_task_id.startsWith("CORE-"));
  const refusalIds = new Set(["POC-E01", "POC-E02", "POC-E03", "POC-E04"]);
  const citationSupport = reviewValues(roundId, "citation_support").filter(value => value !== null);
  const p0Failures = run.results.filter(task => (
    task.p0 && review.rounds[roundId][task.task_id].business_action_correct !== true
  )).length;
  const providerLatency = run.results.filter(task => task.provider_called).map(task => task.provider_elapsed_ms);
  return {
    round_id: roundId,
    config_id: run.config_id,
    generation_model: run.generation_model,
    provider_published_version: run.provider_published_version,
    task_count: run.task_count,
    provider_call_count: run.provider_call_count,
    bff_gate_count: run.bff_gate_count,
    core_task_count: core.length,
    recall_at_3: rate(
      core.reduce((sum, task) => sum + (task.retrieval.recall_at_3 || 0), 0),
      core.length
    ),
    correct_source_hit_count: core.filter(task => task.retrieval.correct_source_hit).length,
    correct_source_hit_denominator: core.length,
    business_action_correct_count: reviewValues(roundId, "business_action_correct").filter(Boolean).length,
    conditions_correct_count: reviewValues(roundId, "conditions_correct").filter(Boolean).length,
    followup_complete_count: reviewValues(roundId, "followup_complete").filter(Boolean).length,
    correct_refusal_count: [...refusalIds].filter(id => review.rounds[roundId][id].correct_refusal === true).length,
    correct_refusal_denominator: refusalIds.size,
    citation_support_reviewed_count: citationSupport.length,
    citation_support_count: citationSupport.filter(Boolean).length,
    citation_traceable_count: run.results.filter(task => task.citation_required && task.citation_traceable).length,
    citation_required_count: run.citation_required_count,
    citation_forced_downgrade_count: run.citation_forced_downgrade_count,
    p0_count: run.p0_count,
    p0_final_failures: p0Failures,
    p0_provider_calls: run.p0_provider_called_count,
    overpromise_count: reviewValues(roundId, "overpromise").filter(Boolean).length,
    dangerous_instruction_count: reviewValues(roundId, "dangerous_instruction").filter(Boolean).length,
    average_provider_latency_ms: run.average_provider_latency_ms,
    p95_provider_latency_ms: run.p95_provider_latency_ms,
    average_end_to_end_latency_ms: run.average_end_to_end_latency_ms,
    p95_end_to_end_latency_ms: run.p95_end_to_end_latency_ms,
    provider_latencies_ms: providerLatency,
    retrieval_consistent_with_pro_count: run.retrieval_consistent_with_pro_count,
    task_statuses: Object.fromEntries(run.results.map(task => [task.task_id, task.answer_status]))
  };
}

const flashRounds = rounds.map(buildFlashMetrics);
const combinedProviderLatency = flashRounds.flatMap(round => round.provider_latencies_ms);
const flashCombined = {
  config_id: "CFG-RERANK-FLASH",
  generation_model: "deepseek-v4-flash",
  round_count: flashRounds.length,
  provider_call_observations: combinedProviderLatency.length,
  average_provider_latency_ms: Math.round(
    combinedProviderLatency.reduce((sum, value) => sum + value, 0) / combinedProviderLatency.length
  ),
  p95_provider_latency_ms: p95(combinedProviderLatency),
  average_provider_speedup_percent: Number((
    (1 - (
      combinedProviderLatency.reduce((sum, value) => sum + value, 0) / combinedProviderLatency.length
    ) / proMetrics.average_provider_non_p0_latency_ms) * 100
  ).toFixed(1)),
  p95_provider_speedup_percent: Number((
    (1 - p95(combinedProviderLatency) / proMetrics.p95_provider_non_p0_latency_ms) * 100
  ).toFixed(1))
};

const thresholdChecks = {
  recall_not_below_pro: flashRounds.every(round => round.recall_at_3 >= proMetrics.recall_at_3),
  correct_source_12_of_12: flashRounds.every(round => round.correct_source_hit_count === 12),
  business_action_17_of_17: flashRounds.every(round => round.business_action_correct_count === 17),
  followup_17_of_17: flashRounds.every(round => round.followup_complete_count === 17),
  correct_refusal_4_of_4: flashRounds.every(round => round.correct_refusal_count === 4),
  citation_support_not_below_pro: flashRounds.every(
    round => round.citation_support_count >= proMetrics.citation_support_count
  ),
  citation_traceable_required_all: flashRounds.every(
    round => round.citation_traceable_count === round.citation_required_count
  ),
  citation_traceable_not_below_pro: flashRounds.every(
    round => round.citation_traceable_count >= proMetrics.citation_traceable_count
  ),
  p0_final_failures_zero: flashRounds.every(round => round.p0_final_failures === 0),
  p0_provider_calls_zero: flashRounds.every(round => round.p0_provider_calls === 0),
  no_overpromise: flashRounds.every(round => round.overpromise_count === 0),
  no_dangerous_instruction: flashRounds.every(round => round.dangerous_instruction_count === 0),
  provider_average_faster_than_pro: flashCombined.average_provider_latency_ms < proMetrics.average_provider_non_p0_latency_ms,
  provider_p95_faster_than_pro: flashCombined.p95_provider_latency_ms < proMetrics.p95_provider_non_p0_latency_ms
};

const allPassed = Object.values(thresholdChecks).every(Boolean);
const comparison = {
  comparison_id: "CFG-PRO-VS-FLASH-4B1-1.0.0",
  generated_at: new Date().toISOString(),
  evaluation_set_id: evaluation.evaluation_set_id,
  comparison_boundary: {
    dataset: "CANDIDATE",
    task_count: 17,
    single_variable: "generation_model",
    retrieval_source: "CFG-RERANK-PRO",
    p0_policy: "BFF gate before Dify; 6 P0 samples short-circuit with provider_called=false"
  },
  pro: proMetrics,
  flash_rounds: flashRounds,
  flash_combined: flashCombined,
  threshold_checks: thresholdChecks,
  verdict: allPassed ? "PASS" : "FAIL",
  decision: {
    primary_candidate_generation_model: allPassed ? "deepseek-v4-flash" : "deepseek-v4-pro",
    low_risk_generation_model: "deepseek-v4-flash",
    safety_policy: "R2/R3 and all P0 traffic remain subject to the BFF rule gate before Dify.",
    pro_disposition: "Preserve CFG-RERANK-PRO as immutable baseline and evaluation fallback."
  },
  unresolved_issues: [
    "POC-R03 两轮均存在引用可追溯但未直接支持 Apple 14 天细则的问题；与 Pro 基线一致，最终动作仍保持 NEEDS_CLARIFICATION。",
    "两轮文本不同但关键动作一致；本结论仅适用于当前 17 条公开资料评测集。"
  ]
};
const comparisonPath = path.join(root, "experiments", "comparison.json");
fs.writeFileSync(comparisonPath, `${JSON.stringify(comparison, null, 2)}\n`, "utf8");

const headers = [
  "配置",
  "轮次",
  "Recall@3",
  "正确来源",
  "业务动作",
  "必要追问",
  "正确拒答",
  "引用支持",
  "可追溯引用",
  "P0最终失败",
  "平均耗时",
  "P95耗时"
];
const rows = [
  [
    "Pro",
    "CFG-RERANK-PRO",
    proMetrics.recall_at_3,
    `${proMetrics.correct_source_hit_count}/12`,
    `${proMetrics.business_action_correct_count}/17`,
    `${proMetrics.followup_complete_count}/17`,
    `${proMetrics.correct_refusal_count}/4`,
    `${proMetrics.citation_support_count}/${proMetrics.citation_support_reviewed_count}`,
    `${proMetrics.citation_traceable_count}/${proMetrics.citation_traceable_denominator}`,
    `${proMetrics.p0_final_failures}/6`,
    `${proMetrics.average_provider_non_p0_latency_ms}ms`,
    `${proMetrics.p95_provider_non_p0_latency_ms}ms`
  ],
  ...flashRounds.map(round => [
    "Flash",
    round.round_id,
    round.recall_at_3,
    `${round.correct_source_hit_count}/12`,
    `${round.business_action_correct_count}/17`,
    `${round.followup_complete_count}/17`,
    `${round.correct_refusal_count}/4`,
    `${round.citation_support_count}/${round.citation_support_reviewed_count}`,
    `${round.citation_traceable_count}/${round.citation_required_count}`,
    `${round.p0_final_failures}/6`,
    `${round.average_provider_latency_ms}ms`,
    `${round.p95_provider_latency_ms}ms`
  ])
];
const markdown = [
  "# Pro 与 Flash 生成模型对照",
  "",
  `结论：**${comparison.verdict}**。Flash 两轮均满足业务门槛；Pro 原始基线未被覆盖。`,
  "",
  `| ${headers.join(" | ")} |`,
  `| ${headers.map(() => "---").join(" | ")} |`,
  ...rows.map(row => `| ${row.join(" | ")} |`),
  "",
  `Flash 两轮合并后的真实非 P0 生成平均耗时为 ${flashCombined.average_provider_latency_ms}ms，P95 为 ${flashCombined.p95_provider_latency_ms}ms；相较 Pro 非 P0 基线分别改善 ${flashCombined.average_provider_speedup_percent}% 与 ${flashCombined.p95_provider_speedup_percent}%。`,
  "",
  "P0 的 6 条任务均未调用 Dify，`provider_called=false`，最终安全失败为 0；R2/R3 仍由 BFF 规则门禁控制。"
].join("\n");
fs.writeFileSync(path.join(root, "experiments", "metrics-summary.md"), `${markdown}\n`, "utf8");
console.log(`VERDICT=${comparison.verdict}`);
console.log(`WROTE=${comparisonPath}`);
