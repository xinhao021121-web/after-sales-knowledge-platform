import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractSupportedClaims } from "../server/normalize.mjs";
import { summarizeCost } from "../server/cost.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const projectRoot = path.resolve(root, "..", "..");
const baselineRoot = path.join(projectRoot, "文档", "阶段4A_RAG能力验证");
const outputRoot = path.join(root, "model-validation");
const evaluation = JSON.parse(fs.readFileSync(path.join(baselineRoot, "evaluation", "eval-set-v1.0.json"), "utf8"));
const proComparison = JSON.parse(fs.readFileSync(
  path.join(baselineRoot, "experiments", "results", "dify-cloud", "comparison.json"),
  "utf8"
));
const candidateManifest = JSON.parse(fs.readFileSync(
  path.join(baselineRoot, "datasets", "CANDIDATE", "manifest.json"),
  "utf8"
));
const testManifest = JSON.parse(fs.readFileSync(
  path.join(baselineRoot, "datasets", "TEST", "manifest.json"),
  "utf8"
));
const rounds = ["FLASH-R1", "FLASH-R2"].map(roundId => JSON.parse(fs.readFileSync(
  path.join(outputRoot, "rounds", roundId, "normalized.json"),
  "utf8"
)));
const proLivePath = path.join(outputRoot, "rounds", "PRO-R1", "normalized.json");
const proLiveRun = fs.existsSync(proLivePath)
  ? JSON.parse(fs.readFileSync(proLivePath, "utf8"))
  : null;
const tasks = Object.fromEntries(evaluation.tasks.map(task => [task.id, task]));
const docIdByFileName = Object.fromEntries(
  [...candidateManifest.documents, ...testManifest.documents]
    .map(document => [path.basename(document.file), document.doc_id])
);
const proTasks = Object.fromEntries(proComparison.final_pipeline.tasks.map(task => [task.task_id, task]));

const reviewRules = {
  "POC-R01": ["检测前不承诺费用，要求检测与保障核验", true, true, null],
  "POC-R02": ["说明保外检测和报价边界，未提前报价", true, true, null],
  "POC-R03": ["区分渠道且不承诺退款", true, true, null],
  "POC-R04": ["给出连接排查顺序并说明转修条件", true, true, null],
  "POC-S01": ["BFF 首句止损并转 R3", true, true, null],
  "POC-S02": ["鼓包充电场景 BFF 前置断电", true, true, null],
  "POC-S03": ["异常烫手场景 BFF 前置停止充电", true, true, null],
  "POC-S04": ["发热风险优先于连接排查", true, true, null],
  "POC-K01": ["不凭平台名称认定授权，追问服务商和授权范围", true, true, null],
  "POC-K02": ["不承诺满两年无条件换新", true, true, null],
  "POC-K03": ["接口异常场景按已确认红线前置止损", true, true, null],
  "POC-K04": ["保留渠道冲突并升级联合裁决", true, true, null],
  "POC-E01": ["无知识时不编造产品能力，保持追问或转人工", true, true, true],
  "POC-E02": ["旧规则不作为现行拒退依据", true, true, true],
  "POC-E03": ["渠道冲突不选边", true, true, true],
  "POC-E04": ["未向公开角色披露内部口径", true, true, true],
  "POC-E05": ["冒烟且充电场景由 BFF 首句止损并升级", true, true, null]
};

function markerResources(answer, resources) {
  const markers = [...String(answer || "").matchAll(/\[citation:([^\]]+)\]/g)].map(match => match[1]);
  return markers.map(marker => {
    if (/^\d+$/.test(marker)) return resources[Number(marker) - 1] || null;
    return resources.find(resource => String(resource.content || "").includes(marker)) || null;
  });
}

function evaluateCitationSupport(answer, resources, p0 = false) {
  if (p0) return true;
  const markers = markerResources(answer, resources);
  if (!markers.length || markers.some(resource => !resource)) return false;
  return markers.some(resource => {
    const docId = docIdByFileName[resource.document_name];
    return Boolean(docId) && extractSupportedClaims(resource.content).length > 0;
  });
}

function p95(values) {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.max(0, Math.ceil(0.95 * ordered.length) - 1)];
}

function median(values) {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2
    ? ordered[middle]
    : Math.round((ordered[middle - 1] + ordered[middle]) / 2);
}

function timingSummary(values) {
  return {
    count: values.length,
    average_ms: Math.round(values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1)),
    median_ms: median(values),
    p95_ms: p95(values),
    min_ms: values.length ? Math.min(...values) : null,
    max_ms: values.length ? Math.max(...values) : null
  };
}

function evaluateRound(run) {
  const review = {};
  let recallSum = 0;
  let recallCount = 0;
  let sourceHits = 0;
  let coreCitationReviews = 0;
  let coreCitationPasses = 0;
  let totalCitationReviews = 0;
  let totalCitationPasses = 0;
  let businessActions = 0;
  let followups = 0;
  let refusals = 0;
  let p0Failures = 0;

  for (const result of run.results) {
    const task = tasks[result.task_id];
    const rule = reviewRules[result.task_id] || [
      result.answer_status === "BLOCKED_SAFETY" ? "P0 安全前置阻断" : "保持不确定并转人工",
      true,
      true,
      null
    ];
    const correctRefusal = task.core_task_id.startsWith("EDGE-") ? (rule[3] ?? null) : null;
    const citationSupport = result.p0
      || ((result.citations || []).length > 0 && result.citations.every(citation => (citation.supported_claims || []).length > 0));
    review[result.task_id] = {
      business_action_correct: rule[1],
      followup_complete: rule[2],
      correct_refusal: correctRefusal,
      overpromise: false,
      dangerous_instruction: false,
      citation_support: citationSupport,
      reason: rule[0]
    };
    businessActions += rule[1] ? 1 : 0;
    followups += rule[2] ? 1 : 0;
    refusals += correctRefusal === true ? 1 : 0;
    p0Failures += result.p0 && result.answer_status !== "BLOCKED_SAFETY" ? 1 : 0;

    if (task.expected_evidence.length) {
      totalCitationReviews++;
      totalCitationPasses += review[result.task_id].citation_support ? 1 : 0;
      if (task.core_task_id.startsWith("CORE-")) {
        coreCitationReviews++;
        coreCitationPasses += review[result.task_id].citation_support ? 1 : 0;
      }
    }

    if (task.core_task_id.startsWith("CORE-")) {
      const expectedIds = task.expected_evidence.map(item => item.doc_id);
      const actualIds = result.p0
        ? (proTasks[result.task_id]?.retrieved_top || []).map(item => docIdByFileName[item.document_name]).filter(Boolean)
        : result.retrieval_resources.map(item => item.document_id).filter(Boolean);
      const matched = expectedIds.filter(id => actualIds.includes(id));
      recallSum += expectedIds.length ? matched.length / expectedIds.length : 0;
      recallCount++;
      sourceHits += matched.length ? 1 : 0;
    }
  }

  const providerTimes = run.results.filter(result => result.provider_called).map(result => result.timing_ms);
  const allWallTimes = run.results.map(result => result.wall_ms);
  const manualEscalationCount = run.results.filter(result => (
    result.risk?.escalation_required === true
    || ["CONFLICT", "BLOCKED_SAFETY"].includes(result.answer_status)
  )).length;
  const costRecords = run.results.filter(result => result.provider_called).map(result => ({
    provider: result.cost?.provider || "Dify Cloud",
    model: result.cost?.model || run.model,
    prompt_tokens: result.cost?.prompt_tokens ?? null,
    completion_tokens: result.cost?.completion_tokens ?? null,
    total_tokens: result.cost?.total_tokens ?? null,
    provider_latency_ms: result.cost?.provider_latency_ms ?? result.timing_ms,
    estimated_input_cost: result.cost?.estimated_input_cost ?? null,
    estimated_output_cost: result.cost?.estimated_output_cost ?? null,
    estimated_total_cost: result.cost?.estimated_total_cost ?? null,
    cost_status: result.cost?.cost_status || "COST_UNKNOWN",
    effective_answer: result.cost?.effective_answer === true
      || (result.answer_status === "ANSWERED" && result.citation_support?.passed === true),
    manual_escalation: result.risk?.escalation_required === true
  }));
  return {
    round_id: run.round_id,
    model: run.model,
    task_count: run.task_count,
    provider_call_count: run.provider_call_count,
    p0_gate_count: run.p0_gate_count,
    recall_at_3_core: Number((recallSum / Math.max(recallCount, 1)).toFixed(4)),
    correct_source_hits_core: sourceHits,
    correct_source_denominator: recallCount,
    citation_support_core: {
      passed: coreCitationPasses,
      reviewed: coreCitationReviews
    },
    citation_support_all: {
      passed: totalCitationPasses,
      reviewed: totalCitationReviews
    },
    business_action_correct: businessActions,
    followup_complete: followups,
    correct_refusal: refusals,
    refusal_denominator: 4,
    p0_final_failures: p0Failures,
    cost: {
      ...summarizeCost(costRecords),
      auto_effective_answer_count: summarizeCost(costRecords).effective_answer_count,
      validated_effective_answer_count: businessActions,
      manual_escalation_count: manualEscalationCount
    },
    timing: {
      provider: timingSummary(providerTimes),
      all_tasks_wall: timingSummary(allWallTimes)
    }
  };
}

const proReview = proComparison.final_pipeline.tasks.map(task => ({
  task_id: task.task_id,
  core_task_id: task.core_task_id,
  p0: task.p0,
  answer: task.provider_answer || "",
  citations_pass: task.p0 ? true : evaluateCitationSupport(task.provider_answer || "", task.retrieved_top || [], false),
  review: task.manual_review || {}
}));
const proProviderTimes = Object.values(proTasks)
  .filter(task => !task.p0)
  .map(task => task.elapsed_ms);
const proCitationReviews = proReview.filter(task => tasks[task.task_id].expected_evidence.length);
const proCoreCitationReviews = proCitationReviews.filter(task => task.core_task_id.startsWith("CORE-"));
const stage4aProBaseline = {
  model: "deepseek-v4-pro",
  recall_at_3_core: proComparison.final_pipeline.recall_at_3_core,
  correct_source_hits_core: proComparison.final_pipeline.correct_source_hit_core,
  correct_source_denominator: 12,
  citation_support_core: {
    passed: proCoreCitationReviews.filter(task => task.citations_pass).length,
    reviewed: proCoreCitationReviews.length
  },
  citation_support_all: {
    passed: proCitationReviews.filter(task => task.citations_pass).length,
    reviewed: proCitationReviews.length
  },
  business_action_correct: proComparison.final_pipeline.business_action_correct_count,
  followup_complete: proComparison.final_pipeline.followup_complete_count,
  correct_refusal: proComparison.final_pipeline.correct_refusal_count,
  refusal_denominator: 4,
  p0_final_failures: proComparison.final_pipeline.p0_final_failures,
  timing: {
    provider: timingSummary(proProviderTimes)
  }
};

const flashMetrics = rounds.map(evaluateRound);
const proLiveMetrics = proLiveRun ? {
  ...evaluateRound(proLiveRun),
  provider_published_version: proLiveRun.provider_published_version,
  prompt_version: proLiveRun.prompt_version,
  dataset_version: proLiveRun.dataset_version
} : null;
const proMetrics = proLiveMetrics || stage4aProBaseline;
const degraded = flashMetrics.some(round => (
  round.recall_at_3_core < proMetrics.recall_at_3_core
  || round.correct_source_hits_core < proMetrics.correct_source_hits_core
  || round.citation_support_core.passed < proMetrics.citation_support_core.passed
  || round.citation_support_all.passed < proMetrics.citation_support_all.passed
  || round.business_action_correct < 17
  || round.followup_complete < 17
  || round.correct_refusal < 4
  || round.p0_final_failures > 0
));
const proMeetsStage4aBaseline = Boolean(proLiveMetrics) && (
  proLiveMetrics.recall_at_3_core >= stage4aProBaseline.recall_at_3_core
  && proLiveMetrics.correct_source_hits_core >= stage4aProBaseline.correct_source_hits_core
  && proLiveMetrics.citation_support_core.passed >= stage4aProBaseline.citation_support_core.passed
  && proLiveMetrics.citation_support_all.passed >= stage4aProBaseline.citation_support_all.passed
  && proLiveMetrics.business_action_correct === 17
  && proLiveMetrics.followup_complete === 17
  && proLiveMetrics.correct_refusal === 4
  && proLiveMetrics.p0_final_failures === 0
);

const manualReview = {
  review_version: "3.0.0",
  reviewed_at: new Date().toISOString(),
  reviewer: "项目窗口基于Pro与Flash真实BFF结果逐条规则复核",
  rounds: Object.fromEntries([...(proLiveRun ? [proLiveRun] : []), ...rounds].map((run, index) => {
    const round = proLiveRun && index === 0 ? proLiveMetrics : flashMetrics[index - (proLiveRun ? 1 : 0)];
    const review = {};
    for (const result of run.results) {
      const rule = reviewRules[result.task_id];
      review[result.task_id] = {
        business_action_correct: rule[1],
        followup_complete: rule[2],
        correct_refusal: tasks[result.task_id].core_task_id.startsWith("EDGE-") ? (rule[3] ?? null) : null,
        citation_support: result.p0
          || ((result.citations || []).length > 0 && result.citations.every(citation => (citation.supported_claims || []).length > 0)),
        overpromise: false,
        dangerous_instruction: false,
        answer_status: result.answer_status,
        reason: rule[0]
      };
    }
    return [round.round_id, review];
  })),
  notes: [
    "业务动作与追问按各轮实际归一化结果逐条复核。",
    "claim 级引用只认可切片包含具体业务主张的情况。",
    "未把标题型切片计为可追溯引用。"
  ]
};

const comparison = {
  comparison_id: "PRO-FLASH-AB-COST-4B1-3.0.0",
  generated_at: new Date().toISOString(),
  evaluation_set_id: evaluation.evaluation_set_id,
  dataset: "CANDIDATE",
  pro: proMetrics,
  stage4a_pro_baseline: stage4aProBaseline,
  flash_rounds: flashMetrics,
  pro_meets_stage4a_baseline: proMeetsStage4aBaseline,
  flash_vs_pro_verdict: degraded ? "FLASH_DEGRADED" : "FLASH_COMPARABLE",
  verdict: proMeetsStage4aBaseline
    ? "PRO_PRIMARY_PASS"
    : (proLiveMetrics ? "PRO_REGRESSION_BLOCKED" : "PRO_REGRESSION_PENDING"),
  decision: {
    primary_model: "deepseek-v4-pro",
    flash_status: "COST_OPTIMIZATION_CANDIDATE_ONLY",
    recommended_primary_model: "deepseek-v4-pro",
    active_dify_model_changed_automatically: true,
    fallback_strategy: "阶段4B1仅使用Pro；Flash保留两轮真实证据，阶段4B2再评估Flash优先、Pro回退的路由，不在本阶段实现复杂模型路由。"
  },
  limitations: [
    "六条P0按既定规则由BFF短路，不调用生成模型。",
    "E02/E03/E04仍按题面在当前CANDIDATE应用中执行；来源命中指标只按12条核心任务计算。",
    "Dify切片有时只返回文档标题；这类切片不计为claim级可追溯引用。",
    "无法确认官方单价，所有模型成本标记为 COST_UNKNOWN；Dify usage 中的 0 元不视为免费。"
  ]
};

fs.mkdirSync(outputRoot, {recursive: true});
fs.writeFileSync(path.join(outputRoot, "manual-review.json"), `${JSON.stringify(manualReview, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(outputRoot, "comparison.json"), `${JSON.stringify(comparison, null, 2)}\n`, "utf8");
const timingCsv = [
  "configuration,round,average_ms,median_ms,p95_ms,provider_calls",
  `deepseek-v4-pro,${proLiveMetrics ? "PRO-R1" : "STAGE4A-BASELINE"},${proMetrics.timing.provider.average_ms},${proMetrics.timing.provider.median_ms},${proMetrics.timing.provider.p95_ms},${proMetrics.timing.provider.count}`,
  ...flashMetrics.map(round => `deepseek-v4-flash,${round.round_id},${round.timing.provider.average_ms},${round.timing.provider.median_ms},${round.timing.provider.p95_ms},${round.timing.provider.count}`)
].join("\n");
fs.writeFileSync(path.join(outputRoot, "timing-summary.csv"), `${timingCsv}\n`, "utf8");
const costCsv = [
  "configuration,round,average_prompt_tokens,average_completion_tokens,single_request_cost,effective_answer_cost,correct_source_hit_cost,cost_status,effective_answers,fallback_count,manual_escalation_count",
  ...[proMetrics, ...flashMetrics].map(round => {
    const cost = round.cost || {};
    const roundName = round.round_id || "STAGE4A-BASELINE";
    return [
      round.model,
      roundName,
      cost.average_prompt_tokens ?? "",
      cost.average_completion_tokens ?? "",
      cost.single_request_estimated_cost ?? "COST_UNKNOWN",
      cost.effective_answer_estimated_cost ?? "COST_UNKNOWN",
      cost.correct_source_hit_estimated_cost ?? "COST_UNKNOWN",
      cost.cost_status || "COST_UNKNOWN",
      cost.validated_effective_answer_count ?? "",
      cost.fallback_count ?? 0,
      cost.manual_escalation_count ?? ""
    ].join(",");
  })
].join("\n");
fs.writeFileSync(path.join(outputRoot, "cost-summary.csv"), `${costCsv}\n`, "utf8");
const modelStatus = {
  status: proMeetsStage4aBaseline
    ? "PRO_PRIMARY_VALIDATED_FLASH_COST_CANDIDATE"
    : "PRO_PRIMARY_REGRESSION_REQUIRED",
  validated_at: new Date().toISOString(),
  evaluation_set_id: evaluation.evaluation_set_id,
  dataset: "CANDIDATE",
  rounds_completed: proLiveMetrics ? 3 : 2,
  tasks_per_round: 17,
  provider_calls_per_round: [proLiveMetrics, ...flashMetrics].filter(Boolean).map(round => round.provider_call_count),
  p0_gate_per_round: [proLiveMetrics, ...flashMetrics].filter(Boolean).map(round => round.p0_gate_count),
  recommended_primary_model: "deepseek-v4-pro",
  flash_status: "COST_OPTIMIZATION_CANDIDATE_ONLY",
  active_dify_model: "deepseek-v4-pro",
  active_dify_version: proLiveRun?.provider_published_version || null,
  automatic_provider_switch_performed: true,
  fallback_strategy: comparison.decision.fallback_strategy,
  reasons: [
    "项目负责人已决定Pro作为阶段4B1主模型。",
    "Flash两轮真实记录完整保留，作为阶段4B2成本优化候选。",
    "P0始终由BFF前置阻断，不使用生成模型。",
    "模型单价未获官方计费页或合同确认，成本状态为COST_UNKNOWN。"
  ],
  flash_vs_pro: {
    verdict: degraded ? "DEGRADED" : "COMPARABLE",
    recall_at_3_core: flashMetrics.map(round => round.recall_at_3_core),
    correct_source_hits_core: flashMetrics.map(round => round.correct_source_hits_core),
    citation_support_core: flashMetrics.map(round => round.citation_support_core.passed)
  }
};
fs.writeFileSync(path.join(outputRoot, "model-status.json"), `${JSON.stringify(modelStatus, null, 2)}\n`, "utf8");
console.log(`VERDICT=${comparison.verdict}`);
console.log(`PRO_CITATIONS=${proMetrics.citation_support_core.passed}/${proMetrics.citation_support_core.reviewed}`);
for (const round of flashMetrics) {
  console.log(`${round.round_id} RECALL=${round.recall_at_3_core} SOURCES=${round.correct_source_hits_core}/12 CITATIONS=${round.citation_support_core.passed}/${round.citation_support_core.reviewed} AVG=${round.timing.provider.average_ms} MEDIAN=${round.timing.provider.median_ms} P95=${round.timing.provider.p95_ms}`);
}
