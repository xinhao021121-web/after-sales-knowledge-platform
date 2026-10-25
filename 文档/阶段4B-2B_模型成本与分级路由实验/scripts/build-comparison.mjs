import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {evaluateBusinessSemantics} from "../../阶段4B-1_BFF与P03真实RAG接入/server/semantic-evaluation.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const stageRoot = path.resolve(here, "..");
const fixedSet = JSON.parse(fs.readFileSync(
  path.join(stageRoot, "baseline", "fixed-regression-used.json"),
  "utf8"
));
const pricing = JSON.parse(fs.readFileSync(
  path.join(stageRoot, "evidence", "pricing-2026-10-25.json"),
  "utf8"
));
const retrievalSnapshot = JSON.parse(fs.readFileSync(
  path.join(stageRoot, "evidence", "retrieval-snapshot.json"),
  "utf8"
));
const snapshotByTask = new Map(
  retrievalSnapshot.tasks.map(item => [item.task_id, item])
);
const groupRuns = Object.fromEntries(["A", "B", "C"].map(group => [
  group,
  JSON.parse(fs.readFileSync(path.join(stageRoot, "runs", group, "results.json"), "utf8"))
]));

function writeJson(relativePath, value) {
  const target = path.join(stageRoot, relativePath);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function assignedStatuses(task) {
  if (task.accepted_statuses?.length) return task.accepted_statuses;
  if (task.p0) return ["BLOCKED_SAFETY"];
  if (task.id === "POC-E01") return ["NO_ANSWER", "NEED_CLARIFICATION"];
  if (task.id === "POC-E02") return ["KNOWLEDGE_EXPIRED"];
  if (task.id === "POC-E03") return ["CONFLICT"];
  if (task.id === "POC-E04") return ["PERMISSION_DENIED"];
  return ["ANSWERED", "NEED_CLARIFICATION", "NO_ANSWER", "CONFLICT"];
}

const tasks = fixedSet.tasks.map(item => ({
  ...item.task,
  suite: item.suite,
  accepted_statuses: assignedStatuses(item.task)
}));
const taskById = new Map(tasks.map(task => [task.id, task]));
const genericFallbacks = new Set([
  "当前证据不足以形成确定结论，系统已保留可核验来源并转入补充信息或人工复核。",
  "当前没有可用的有效知识，不能生成确定售后结论。请转人工或补充官方资料。"
]);

function normalizedPayload(attempt) {
  return {
    answer: attempt.normalized.answer,
    suggested_action: attempt.normalized.suggested_action,
    answer_goals: attempt.normalized.answer_goals,
    retrieval_resources: attempt.normalized.retrieval_resources,
    citations: attempt.normalized.citations,
    citation_support: attempt.normalized.citation_support,
    answer_status: attempt.answer_status,
    provider_called: attempt.provider_called,
    p0_passed: attempt.p0_passed
  };
}

function normalizeTaskResult(task, result) {
  const finalAttempt = result.final_attempt;
  const payload = normalizedPayload(finalAttempt);
  if (task.p0) {
    payload.p0_passed = payload.answer_status === "BLOCKED_SAFETY" &&
      payload.provider_called === false &&
      finalAttempt.normalized.citations?.[0]?.chunk_id === "CHUNK-SAFE-STOP-01";
  }
  const semantics = evaluateBusinessSemantics(task, payload);
  const resources = payload.retrieval_resources || [];
  const expectedDocs = [...new Set((task.expected_evidence || []).map(item => item.doc_id))];
  const retrievedDocs = new Set(resources.slice(0, 3).map(item => item.document_id).filter(Boolean));
  const coveredDocs = expectedDocs.filter(docId => retrievedDocs.has(docId));
  const genericFallback = resources.length > 0 &&
    genericFallbacks.has(String(payload.answer || "").trim());
  const allAttempts = [
    ...(result.pro_attempts || []),
    ...(result.flash_attempts || []),
    ...(result.pro_attempt ? [result.pro_attempt] : [])
  ];
  const uniqueAttempts = [...new Map(allAttempts.map(item =>
    [`${item.model_requested}:${item.attempt}:${item.bff_request_id}`, item]
  )).values()];
  const flashGatePassed = result.flash_attempt?.routing_decision?.passed ??
    (result.first_model === "deepseek-v4-flash"
      ? finalAttempt.routing_decision?.passed
      : null);
  const snapshotSegmentIds = (snapshotByTask.get(task.id)?.evidence || [])
    .map(item => item.segment_id);
  const finalSegmentIds = resources.slice(0, 3).map(item => item.segment_id);
  const retrievalMatchesSnapshot = task.p0 ||
    JSON.stringify(snapshotSegmentIds) === JSON.stringify(finalSegmentIds);
  return {
    task_id: task.id,
    suite: task.suite,
    risk_type: result.risk_type,
    route_mode: result.route_mode,
    answer_status: payload.answer_status,
    status_accepted: task.accepted_statuses.includes(payload.answer_status),
    p0: task.p0,
    p0_passed: payload.p0_passed,
    provider_called: finalAttempt.provider_called,
    provider_error: payload.answer_status === "ERROR",
    citation_support_passed: payload.citation_support?.passed === true,
    forbidden_action_match: finalAttempt.forbidden_action_match,
    generic_fallback: genericFallback,
    expected_source_count: expectedDocs.length,
    covered_source_count: coveredDocs.length,
    covered_source_ids: coveredDocs,
    source_hit: expectedDocs.length ? coveredDocs.length > 0 : null,
    recall_at_3: expectedDocs.length ? coveredDocs.length / expectedDocs.length : null,
    semantic_passed: semantics.passed,
    business_semantics: semantics,
    first_model: result.first_model,
    final_model: result.final_model,
    fallback: result.fallback === true,
    fallback_reasons: result.fallback_reasons || [],
    fallback_recovered: result.fallback_recovered,
    initial_flash_gate_passed: flashGatePassed,
    known_defect: task.id === "RET-H09" && semantics.passed === false,
    human_confirmable: payload.answer_status !== "ERROR" &&
      (!task.p0 || finalAttempt.p0_passed === true) &&
      semantics.passed === true,
    prior_provider_failures: (result.previous_failures || []).length,
    attempts: uniqueAttempts,
    flash_attempt: result.flash_attempt || null,
    pro_attempt: result.pro_attempt || null,
    final_attempt: finalAttempt,
    retrieval_segment_ids: finalSegmentIds,
    retrieval_matches_snapshot: retrievalMatchesSnapshot
  };
}

function rateFor(model, kind, peak) {
  const price = pricing.models[model];
  if (kind === "input") {
    return peak ? price.input_cache_miss_peak_cny : price.input_cache_miss_off_peak_cny;
  }
  return peak ? price.output_peak_cny : price.output_off_peak_cny;
}

function isPeak(startedAt) {
  const date = new Date(startedAt);
  const shanghai = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const day = shanghai.getUTCDay();
  if (day === 0 || day === 6) return false;
  const hour = shanghai.getUTCHours();
  return (hour >= 9 && hour < 12) || (hour >= 14 && hour < 18);
}

function calculateAttemptCost(attempt) {
  if (!attempt?.model_requested || !Number.isFinite(attempt.prompt_tokens)) return 0;
  const peak = isPeak(attempt.started_at);
  const inputRate = rateFor(attempt.model_requested, "input", peak);
  const outputRate = rateFor(attempt.model_requested, "output", peak);
  return {
    peak,
    input_rate_cny_per_1m: inputRate,
    output_rate_cny_per_1m: outputRate,
    total_cny: attempt.prompt_tokens / 1_000_000 * inputRate +
      (attempt.completion_tokens || 0) / 1_000_000 * outputRate
  };
}

function percentile(values, ratio) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function summarize(group, results) {
  const nonP0 = results.filter(item => !item.p0);
  const attempts = results.flatMap(item => item.attempts);
  const promptTokens = attempts.reduce((sum, item) => sum + Number(item.prompt_tokens || 0), 0);
  const completionTokens = attempts.reduce((sum, item) => sum + Number(item.completion_tokens || 0), 0);
  const totalTokens = attempts.reduce((sum, item) => sum + Number(item.total_tokens || 0), 0);
  const latencies = attempts.map(item => Number(item.provider_latency_ms)).filter(Number.isFinite);
  const expectedSourceCount = results.reduce((sum, item) => sum + item.expected_source_count, 0);
  const coveredSourceCount = results.reduce((sum, item) => sum + item.covered_source_count, 0);
  const sourceHitCount = results.filter(item => item.source_hit === true).length;
  const effectiveAnswered = results.filter(item =>
    item.answer_status === "ANSWERED" &&
    item.citation_support_passed === true
  ).length;
  const costs = attempts.map(calculateAttemptCost);
  const totalCostCny = costs.reduce((sum, item) => sum + item.total_cny, 0);
  const fallbackCount = results.filter(item => item.fallback).length;
  const recoveryCount = results.filter(item => item.fallback && item.fallback_recovered).length;
  const flashInitial = group === "A" ? null : results.filter(item => !item.p0);
  const summarizeSuite = suite => {
    const values = results.filter(item => item.suite === suite);
    const suiteExpected = values.reduce((sum, item) => sum + item.expected_source_count, 0);
    const suiteCovered = values.reduce((sum, item) => sum + item.covered_source_count, 0);
    return {
      task_count: values.length,
      status_match_count: values.filter(item => item.status_accepted).length,
      semantic_passed_count: values.filter(item => item.semantic_passed).length,
      semantic_failed_task_ids: values.filter(item => !item.semantic_passed).map(item => item.task_id),
      effective_answered_count: values.filter(item =>
        item.answer_status === "ANSWERED" && item.citation_support_passed
      ).length,
      source_hit_count: values.filter(item => item.source_hit === true).length,
      expected_source_count: suiteExpected,
      covered_source_count: suiteCovered,
      recall_at_3: suiteExpected ? suiteCovered / suiteExpected : null,
      p0_failures: values.filter(item => item.p0 && item.p0_passed !== true).length,
      citation_failures: values.filter(item =>
        item.answer_status === "ANSWERED" && !item.citation_support_passed
      ).length,
      provider_errors: values.filter(item => item.provider_error).length
    };
  };
  const formalCore = results.filter(item =>
    item.suite === "FORMAL_17" &&
    !item.p0 &&
    taskById.get(item.task_id)?.core_task_id?.startsWith("CORE-")
  );
  const formalCoreExpected = formalCore.reduce((sum, item) => sum + item.expected_source_count, 0);
  const formalCoreCovered = formalCore.reduce((sum, item) => sum + item.covered_source_count, 0);
  return {
    group,
    run_id: groupRuns[group].run_id,
    route_mode: groupRuns[group].route_mode,
    model_config_version: groupRuns[group].model_config.published_version,
    task_count: results.length,
    p0_task_count: results.filter(item => item.p0).length,
    p0_model_calls: results.filter(item => item.p0 && item.provider_called).length,
    p0_failures: results.filter(item => item.p0 && item.p0_passed !== true).length,
    status_match_count: results.filter(item => item.status_accepted).length,
    semantic_passed_count: results.filter(item => item.semantic_passed).length,
    semantic_failed_task_ids: results.filter(item => !item.semantic_passed).map(item => item.task_id),
    effective_answered_count: effectiveAnswered,
    citation_failures: results.filter(item =>
      item.answer_status === "ANSWERED" && !item.citation_support_passed
    ).length,
    provider_errors: results.filter(item => item.provider_error).length,
    preserved_provider_failures: results.reduce((sum, item) => sum + item.prior_provider_failures, 0),
    forbidden_action_failures: results.filter(item => item.forbidden_action_match).length,
    generic_fallback_count: nonP0.filter(item => item.generic_fallback).length,
    generic_fallback_ratio: nonP0.length
      ? nonP0.filter(item => item.generic_fallback).length / nonP0.length
      : null,
    source_hit_count: sourceHitCount,
    expected_source_count: expectedSourceCount,
    covered_source_count: coveredSourceCount,
    recall_at_3: expectedSourceCount ? coveredSourceCount / expectedSourceCount : null,
    human_confirmable_count: results.filter(item => item.human_confirmable).length,
    known_defect_task_ids: results.filter(item => item.known_defect).map(item => item.task_id),
    flash_initial_success_count: flashInitial
      ? flashInitial.filter(item => item.initial_flash_gate_passed === true).length
      : null,
    flash_initial_success_rate: flashInitial
      ? flashInitial.filter(item => item.initial_flash_gate_passed === true).length / flashInitial.length
      : null,
    fallback_count: fallbackCount,
    fallback_rate: group === "C" && nonP0.length ? fallbackCount / nonP0.length : 0,
    recovery_count: recoveryCount,
    recovery_rate: fallbackCount ? recoveryCount / fallbackCount : null,
    fallback_reason_distribution: Object.fromEntries(
      [...new Set(results.flatMap(item => item.fallback_reasons))]
        .map(reason => [reason, results.filter(item => item.fallback_reasons.includes(reason)).length])
    ),
    model_call_count: attempts.length,
    prompt_tokens_total: promptTokens,
    completion_tokens_total: completionTokens,
    total_tokens_total: totalTokens,
    tokens_per_effective_answer: effectiveAnswered ? totalTokens / effectiveAnswered : null,
    tokens_per_source_hit: sourceHitCount ? totalTokens / sourceHitCount : null,
    provider_latency_average_ms: latencies.length
      ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length
      : null,
    provider_latency_p95_ms: percentile(latencies, 0.95),
    official_model_list_cost_cny: totalCostCny,
    official_model_list_cost_per_model_request_cny: attempts.length
      ? totalCostCny / attempts.length
      : null,
    official_model_list_cost_per_effective_answer_cny: effectiveAnswered
      ? totalCostCny / effectiveAnswered
      : null,
    official_model_list_cost_per_source_hit_cny: sourceHitCount
      ? totalCostCny / sourceHitCount
      : null,
    dify_billed_cost_cny: null,
    dify_billing_cost_status: "COST_UNKNOWN",
    priced_calls_off_peak: costs.filter(item => item.peak === false).length,
    priced_calls_peak: costs.filter(item => item.peak === true).length,
    retrieval_snapshot_consistent_count: results.filter(item =>
      item.retrieval_matches_snapshot
    ).length,
    retrieval_snapshot_consistent: results.every(item => item.retrieval_matches_snapshot),
    suites: {
      FORMAL_17: summarizeSuite("FORMAL_17"),
      REGRESSION_8: summarizeSuite("REGRESSION_8"),
      HOLDOUT_2: summarizeSuite("HOLDOUT_2")
    },
    formal_17_core: {
      task_count: formalCore.length,
      source_hit_count: formalCore.filter(item => item.source_hit === true).length,
      expected_source_count: formalCoreExpected,
      covered_source_count: formalCoreCovered,
      recall_at_3: formalCoreExpected ? formalCoreCovered / formalCoreExpected : null
    }
  };
}

const normalized = {};
for (const group of ["A", "B", "C"]) {
  normalized[group] = tasks.map(task => {
    const result = groupRuns[group].tasks.find(item => item.task_id === task.id);
    if (!result) throw new Error(`${group} missing ${task.id}`);
    return normalizeTaskResult(task, result);
  });
  writeJson(`evidence/group-${group}-normalized.json`, {
    run_id: groupRuns[group].run_id,
    group,
    route_mode: groupRuns[group].route_mode,
    tasks: normalized[group]
  });
}

const summaries = Object.fromEntries(
  ["A", "B", "C"].map(group => [group, summarize(group, normalized[group])])
);
for (const group of ["A", "B", "C"]) {
  writeJson(`evidence/group-${group}-summary.json`, summaries[group]);
}

const perTask = tasks.map(task => {
  const a = normalized.A.find(item => item.task_id === task.id);
  const b = normalized.B.find(item => item.task_id === task.id);
  const c = normalized.C.find(item => item.task_id === task.id);
  return {
    task_id: task.id,
    suite: task.suite,
    risk_type: a.risk_type,
    p0: task.p0,
    A: {
      status: a.answer_status,
      semantic_passed: a.semantic_passed,
      tokens: a.attempts.reduce((sum, item) => sum + Number(item.total_tokens || 0), 0),
      latency_ms: a.attempts.reduce((sum, item) => sum + Number(item.provider_latency_ms || 0), 0)
    },
    B: {
      status: b.answer_status,
      semantic_passed: b.semantic_passed,
      tokens: b.attempts.reduce((sum, item) => sum + Number(item.total_tokens || 0), 0),
      latency_ms: b.attempts.reduce((sum, item) => sum + Number(item.provider_latency_ms || 0), 0)
    },
    C: {
      status: c.answer_status,
      semantic_passed: c.semantic_passed,
      fallback: c.fallback,
      final_model: c.final_model,
      tokens: c.attempts.reduce((sum, item) => sum + Number(item.total_tokens || 0), 0),
      latency_ms: c.attempts.reduce((sum, item) => sum + Number(item.provider_latency_ms || 0), 0)
    },
    status_matches_A: b.answer_status === a.answer_status && c.answer_status === a.answer_status,
    known_defect: task.id === "RET-H09"
  };
});
writeJson("evidence/per-task-comparison.json", perTask);

function newSemanticFailures(group) {
  return normalized[group]
    .filter(item => item.task_id !== "RET-H09" &&
      normalized.A.find(base => base.task_id === item.task_id)?.semantic_passed === true &&
      item.semantic_passed === false)
    .map(item => item.task_id);
}

const fallbackProCost = normalized.C
  .filter(item => item.fallback)
  .flatMap(item => item.pro_attempt ? [item.pro_attempt] : [])
  .map(calculateAttemptCost)
  .reduce((sum, item) => sum + item.total_cny, 0);
const avgProCostPerNonP0 = summaries.A.official_model_list_cost_cny /
  normalized.A.filter(item => !item.p0).length;
const avgFlashCostPerNonP0 = summaries.B.official_model_list_cost_cny /
  normalized.B.filter(item => !item.p0).length;
const avgFallbackProCost = summaries.C.fallback_count
  ? fallbackProCost / summaries.C.fallback_count
  : null;
const estimatedBreakEvenFallbackRate = avgFallbackProCost
  ? (avgProCostPerNonP0 - avgFlashCostPerNonP0) / avgFallbackProCost
  : null;

const comparison = {
  comparison_id: "4B2B-MODEL-ROUTING-COMPARISON-1.0.0",
  captured_at: new Date().toISOString(),
  input_lock: "baseline/fixed-regression-used.json",
  retrieval_snapshot: "evidence/retrieval-snapshot.json",
  task_count: tasks.length,
  suites: {
    FORMAL_17: tasks.filter(task => task.suite === "FORMAL_17").length,
    REGRESSION_8: tasks.filter(task => task.suite === "REGRESSION_8").length,
    HOLDOUT_2: tasks.filter(task => task.suite === "HOLDOUT_2").length
  },
  groups: summaries,
  baseline_relative: {
    B_status_match_count: normalized.B.filter(item =>
      item.answer_status === normalized.A.find(base => base.task_id === item.task_id)?.answer_status
    ).length,
    C_status_match_count: normalized.C.filter(item =>
      item.answer_status === normalized.A.find(base => base.task_id === item.task_id)?.answer_status
    ).length,
    B_new_semantic_failures_excluding_known_defect: newSemanticFailures("B"),
    C_new_semantic_failures_excluding_known_defect: newSemanticFailures("C")
  },
  hard_gates: {
    all_p0_model_calls_zero: Object.values(summaries).every(item => item.p0_model_calls === 0),
    all_p0_failures_zero: Object.values(summaries).every(item => item.p0_failures === 0),
    all_final_provider_errors_zero: Object.values(summaries).every(item => item.provider_errors === 0),
    all_claim_failures_zero: Object.values(summaries).every(item => item.citation_failures === 0),
    all_forbidden_action_failures_zero: Object.values(summaries).every(item =>
      item.forbidden_action_failures === 0
    )
  },
  cost: {
    official_price_source: "evidence/pricing-2026-10-25.json",
    currency: "CNY",
    official_model_list_estimates: {
      A: summaries.A.official_model_list_cost_cny,
      B: summaries.B.official_model_list_cost_cny,
      C: summaries.C.official_model_list_cost_cny
    },
    dify_billed_cost_cny: null,
    dify_billing_cost_status: "COST_UNKNOWN",
    input_cache_assumption: "All prompt tokens priced as cache-miss because per-call cache-hit usage was unavailable.",
    average_pro_cost_per_non_p0: avgProCostPerNonP0,
    average_flash_cost_per_non_p0: avgFlashCostPerNonP0,
    average_pro_fallback_cost: avgFallbackProCost,
    estimated_break_even_fallback_rate: estimatedBreakEvenFallbackRate,
    observed_fallback_rate: summaries.C.fallback_rate,
    note: "Official DeepSeek list prices are available; Dify invoice/contract charges remain unknown."
  },
  known_defect: {
    task_id: "RET-H09",
    status: "KNOWN_4B2A_DEFECT",
    A_semantic_passed: normalized.A.find(item => item.task_id === "RET-H09").semantic_passed,
    B_semantic_passed: normalized.B.find(item => item.task_id === "RET-H09").semantic_passed,
    C_semantic_passed: normalized.C.find(item => item.task_id === "RET-H09").semantic_passed,
    excluded_from_routing_regression: true
  }
};
writeJson("evidence/comparison.json", comparison);
writeJson("evidence/cost-analysis.json", comparison.cost);

const auditPath = path.join(
  stageRoot,
  "..",
  "阶段3B_高保真交互原型",
  "data",
  "runtime",
  "audit.ndjson"
);
const auditRows = fs.existsSync(auditPath)
  ? fs.readFileSync(auditPath, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .flatMap(line => {
        try { return [JSON.parse(line)]; } catch { return []; }
      })
      .filter(row => /^ASQ-ROUTING-4B2B-/.test(String(row.asq_id || "")))
  : [];
const requestFailureHistory = {
  captured_at: new Date().toISOString(),
  source: "阶段3B_高保真交互原型/data/runtime/audit.ndjson",
  errors: auditRows
    .filter(row => row.result === "ERROR")
    .map(row => ({
      at: row.at,
      request_id: row.request_id,
      asq_id: row.asq_id,
      provider_request_id: row.provider_request_id || null,
      error_code: row.error_code || null,
      provider_called: row.provider_called === true
    })),
  note: "Provider failures are retained as infrastructure records and are not treated as model-quality results."
};
writeJson("evidence/provider-failure-history.json", requestFailureHistory);

console.log(JSON.stringify({
  A: {
    semantic: `${summaries.A.semantic_passed_count}/27`,
    tokens: summaries.A.total_tokens_total,
    latency: summaries.A.provider_latency_average_ms
  },
  B: {
    semantic: `${summaries.B.semantic_passed_count}/27`,
    tokens: summaries.B.total_tokens_total,
    latency: summaries.B.provider_latency_average_ms
  },
  C: {
    semantic: `${summaries.C.semantic_passed_count}/27`,
    fallbacks: summaries.C.fallback_count,
    recovery_rate: summaries.C.recovery_rate,
    tokens: summaries.C.total_tokens_total,
    latency: summaries.C.provider_latency_average_ms
  },
  new_semantic_failures: comparison.baseline_relative
}, null, 2));
