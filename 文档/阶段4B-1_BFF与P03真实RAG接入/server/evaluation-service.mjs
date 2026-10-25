import crypto from "node:crypto";
import fs from "node:fs";
import { detectP0, p0Response } from "./policy.mjs";
import { normalizeProviderAnswer } from "./normalize.mjs";
import { stableHash } from "./store.mjs";

const RUN_FILE = "evaluation-runs.json";

function percentile(values, ratio) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1);
  return sorted[index];
}

function readRuns(store) {
  return store.readDocument(RUN_FILE, {runs: {}, idempotency: {}});
}

function saveRun(store, run) {
  run.updated_at = new Date().toISOString();
  const runs = readRuns(store);
  runs.runs[run.run_id] = run;
  runs.idempotency[run.idempotency_key] = run.run_id;
  store.writeDocument(RUN_FILE, runs);
}

function toPublicRun(run) {
  return {
    ...structuredClone(run),
    source_mode: run.source_mode || "REAL_DIFY"
  };
}

function acceptedStatus(task, status) {
  if (task.p0) return status === "BLOCKED_SAFETY";
  if (task.id === "POC-E01") return ["NO_ANSWER", "NEED_CLARIFICATION"].includes(status);
  if (task.id === "POC-E02") return status === "KNOWLEDGE_EXPIRED";
  if (task.id === "POC-E03") return status === "CONFLICT";
  if (task.id === "POC-E04") return status === "PERMISSION_DENIED";
  return ["ANSWERED", "NEED_CLARIFICATION", "NO_ANSWER", "CONFLICT"].includes(status);
}

function sourceCoverage(task, resources) {
  const expected = new Set(task.expected_evidence.map(item => item.doc_id));
  if (!expected.size) return null;
  const retrieved = new Set(resources.slice(0, 3).map(resource => resource.document_id).filter(Boolean));
  const hit = [...expected].filter(docId => retrieved.has(docId));
  return {
    source_hit: hit.length > 0,
    expected_source_count: expected.size,
    covered_source_count: hit.length,
    recall_at_3: hit.length / expected.size,
    covered_source_ids: hit
  };
}

export function containsForbidden(task, answer) {
  const text = String(answer || "");
  const negative = /(不得|不能|不可|不应|禁止|避免|不要|无法|不会|切勿|勿|不)[^。；\n]{0,12}$/;
  return task.forbidden_actions.find(action => {
    let offset = 0;
    while (true) {
      const index = text.indexOf(action, offset);
      if (index < 0) return false;
      const prefix = text.slice(Math.max(0, index - 16), index);
      if (!negative.test(prefix)) return true;
      offset = index + action.length;
    }
  }) || null;
}

function followupComplete(answer) {
  const text = String(answer || "");
  return /[？?]|请提供|请确认|需要核实|无法确认|先核对|请检查/.test(text);
}

function costTotals(results) {
  const providerResults = results.filter(result => result.provider_called);
  const modelAnswers = results.filter(result =>
    result.provider_called &&
    result.answer_status === "ANSWERED" &&
    result.citation_support_passed === true
  );
  const sourceHits = results.filter(result => result.source_hit === true);
  const latencies = providerResults.map(result => result.provider_latency_ms).filter(Number.isFinite);
  const promptValues = providerResults.map(result => result.prompt_tokens).filter(Number.isFinite);
  const completionValues = providerResults.map(result => result.completion_tokens).filter(Number.isFinite);
  const totalValues = providerResults.map(result => result.total_tokens).filter(Number.isFinite);
  const sum = values => values.length ? values.reduce((total, value) => total + value, 0) : null;
  const average = values => values.length ? sum(values) / values.length : null;
  return {
    cost_status: "COST_UNKNOWN",
    currency: null,
    model_request_count: providerResults.length,
    p0_short_circuit_count: results.length - providerResults.length,
    p0_short_circuit_model_cost: 0,
    all_effective_response_count: results.filter(result => result.answer_status !== "ERROR").length,
    model_effective_answer_count: modelAnswers.length,
    correct_source_hit_count: sourceHits.length,
    prompt_tokens_total: sum(promptValues),
    completion_tokens_total: sum(completionValues),
    total_tokens_total: sum(totalValues),
    prompt_tokens_average: average(promptValues),
    completion_tokens_average: average(completionValues),
    provider_latency_average_ms: average(latencies),
    provider_latency_p95_ms: percentile(latencies, 0.95),
    all_effective_response_cost: null,
    model_effective_answer_cost: null,
    correct_source_hit_cost: null,
    formula: {
      all_effective_response_cost: "全部模型费用 / 可验收响应数",
      model_effective_answer_cost: "模型费用 / claim门禁通过的ANSWERED数",
      correct_source_hit_cost: "模型费用 / 正确来源命中数"
    }
  };
}

export function summarizeEvaluationResults(results) {
  const core = results.filter(result => result.core_task_id?.startsWith("CORE-"));
  const p0 = results.filter(result => result.p0);
  const retrievalCompletedCore = core.filter(result =>
    !result.p0 &&
    result.provider_called &&
    result.answer_status !== "ERROR"
  );
  const providerErrorCore = core.filter(result => result.answer_status === "ERROR");
  const expectedSourceDenominator = retrievalCompletedCore.reduce(
    (total, result) => total + Number(result.expected_source_count || 0),
    0
  );
  const coveredSourceCount = retrievalCompletedCore.reduce(
    (total, result) => total + Number(result.covered_source_count || 0),
    0
  );
  const sourceHitTasks = retrievalCompletedCore.filter(result => result.source_hit === true).length;
  const statusCounts = {};
  for (const result of results) {
    statusCounts[result.answer_status] = (statusCounts[result.answer_status] || 0) + 1;
  }
  const cost = costTotals(results);
  const qualityWarnings = [];
  const recallAt3Core = expectedSourceDenominator
    ? Number((coveredSourceCount / expectedSourceDenominator).toFixed(4))
    : null;
  const sourceHitRateCore = retrievalCompletedCore.length
    ? Number((sourceHitTasks / retrievalCompletedCore.length).toFixed(4))
    : null;
  if (recallAt3Core != null && recallAt3Core < 0.9167) {
    qualityWarnings.push("CORE_RECALL_BELOW_STAGE4A_BASELINE");
  }
  if (sourceHitRateCore != null && sourceHitRateCore < 1) {
    qualityWarnings.push("CORE_SOURCE_HIT_RATE_BELOW_TARGET");
  }
  if (cost.model_effective_answer_count === 0) {
    qualityWarnings.push("NO_MODEL_EFFECTIVE_ANSWER");
  }
  return {
    task_count: results.length,
    core_task_count: core.length,
    p0_task_count: p0.length,
    provider_call_count: results.filter(result => result.provider_called).length,
    p0_gate_count: p0.length - p0.filter(result => result.provider_called).length,
    answer_status_counts: statusCounts,
    retrieval_completed_core_count: retrievalCompletedCore.length,
    retrieval_expected_source_count: expectedSourceDenominator,
    retrieval_covered_source_count: coveredSourceCount,
    recall_at_3_core: recallAt3Core,
    correct_source_hits_core: sourceHitTasks,
    correct_source_denominator: retrievalCompletedCore.length,
    source_hit_rate_core: sourceHitRateCore,
    provider_error_core_count: providerErrorCore.length,
    result_classification: {
      p0_short_circuit: p0.filter(result => result.provider_called === false).length,
      retrieval_completed: retrievalCompletedCore.length,
      provider_error: results.filter(result => result.answer_status === "ERROR").length,
      non_core_retrieval: results.filter(result =>
        !result.core_task_id?.startsWith("CORE-") &&
        !result.p0 &&
        result.provider_called
      ).length
    },
    p0_final_failures: p0.filter(result => result.p0_passed !== true).length,
    citation_failures: results.filter(result =>
      result.answer_status === "ANSWERED" && result.citation_support_passed !== true
    ).length,
    provider_errors: results.filter(result => result.answer_status === "ERROR").length,
    quality_gate_status: qualityWarnings.length ? "FAILED" : "PASSED",
    quality_warnings: qualityWarnings,
    quality_baseline: {
      recall_at_3_core: 0.9167,
      source_hit_rate_core: 1,
      model_effective_answer_count_min: 1
    },
    cost
  };
}

export function createEvaluationService({config, store, provider, catalog}) {
  const evaluationSet = JSON.parse(fs.readFileSync(config.evaluationSetPath, "utf8"));
  let running = false;

  function createRequest(task, run) {
    const questionSummary = {
      original: task.original_question,
      rewrites: Array.isArray(task.rewrites) ? task.rewrites : []
    };
    return {
      question: [
        task.original_question,
        ...(questionSummary.rewrites.length ? [`改写问法：${questionSummary.rewrites.join("；")}`] : [])
      ].join("\n"),
      asq_id: `ASQ-${run.run_id}-${task.id}`,
      knowledge_item_id: `KI-${task.core_task_id || task.id}`,
      product_model: String(task.context?.product || "AirPods Pro 3"),
      channel: String(task.context?.channel || "Apple Store 在线商店"),
      role: "frontline",
      tenant_id: "tenant-demo",
      environment: "candidate",
      top_k: 3,
      retrieval_mode: "hybrid",
      rerank: true,
      metadata_filter: {
        enabled: true,
        active_only: true,
        channels: task.context?.channel ? [task.context.channel] : [],
        source_statuses: ["active"]
      },
      citation_mode: "required",
      customer_context: task.context || {},
      question_summary: questionSummary
    };
  }

  async function runTask(task, run, attempts = []) {
    const request = createRequest(task, run);
    const bffRequestId = crypto.randomUUID();
    let response;
    if (task.p0 || detectP0(task.original_question)) {
      response = p0Response({
        catalog,
        request,
        requestId: `EVAL-${run.run_id}-${task.id}`,
        model: config.generationModel
      });
    } else {
      try {
        const providerResult = await provider.answer(request);
        attempts.push({
          attempt: attempts.length + 1,
          status: "SUCCESS",
          request_id: bffRequestId,
          provider_request_id: providerResult.provider_request_id || null,
          error_code: null
        });
        response = normalizeProviderAnswer({
          raw: providerResult.raw,
          request,
          catalog,
          providerRequestId: providerResult.provider_request_id,
          timingMs: providerResult.timing_ms,
          model: config.generationModel
        });
      } catch (error) {
        attempts.push({
          attempt: attempts.length + 1,
          status: "ERROR",
          request_id: bffRequestId,
          provider_request_id: error.providerRequestId || null,
          error_code: error.code || "PROVIDER_UNAVAILABLE",
          error_message: error.message || "Provider request failed"
        });
        throw error;
      }
    }
    const resources = response.retrieval_resources || [];
    const forbidden = containsForbidden(task, `${response.answer || ""} ${response.suggested_action || ""}`);
    const statusMatch = acceptedStatus(task, response.answer_status);
    const coverage = sourceCoverage(task, resources);
    const retrievalStatus = task.p0
      ? "SKIPPED_P0"
      : response.answer_status === "ERROR"
        ? "PROVIDER_ERROR"
        : resources.length
          ? "RETRIEVAL_COMPLETED"
          : "NO_RETRIEVAL_HITS";
    const p0Passed = task.p0
      ? response.answer_status === "BLOCKED_SAFETY" &&
        response.provider_called === false &&
        response.citations?.[0]?.chunk_id === "CHUNK-SAFE-STOP-01"
      : null;
    return {
      task_id: task.id,
      core_task_id: task.core_task_id,
      question_hash: stableHash(task.original_question),
      question_length: task.original_question.length,
      question_summary: request.question_summary,
      answer_status: response.answer_status,
      provider_called: response.provider_called === true,
      recall_at_3: coverage?.recall_at_3 ?? null,
      source_hit: coverage?.source_hit ?? null,
      expected_source_count: coverage?.expected_source_count ?? 0,
      covered_source_count: coverage?.covered_source_count ?? 0,
      covered_source_ids: coverage?.covered_source_ids ?? [],
      retrieval_diversity: response.retrieval_diversity || null,
      retrieval_status: retrievalStatus,
      retrieval_attempts: attempts,
      citation_support_passed: response.citation_support?.passed === true,
      citations: response.citations || [],
      answer_goals: response.answer_goals || [],
      business_action_status: forbidden ? "AUTO_CHECK_FORBIDDEN_ACTION" : statusMatch ? "AUTO_STATUS_MATCH" : "AUTO_STATUS_MISMATCH",
      business_action_correct: !forbidden && statusMatch,
      forbidden_action_match: forbidden,
      followup_complete: followupComplete(`${response.answer || ""} ${response.suggested_action || ""}`),
      refusal_correct: ["POC-E01", "POC-E02", "POC-E04"].includes(task.id)
        ? statusMatch
        : null,
      p0: Boolean(task.p0),
      p0_passed: p0Passed,
      prompt_tokens: response.cost?.prompt_tokens ?? null,
      completion_tokens: response.cost?.completion_tokens ?? null,
      total_tokens: response.cost?.total_tokens ?? null,
      provider_latency_ms: response.cost?.provider_latency_ms ?? response.timing_ms ?? null,
      cost_status: response.cost?.cost_status || "COST_UNKNOWN",
      estimated_total_cost: response.cost?.estimated_total_cost ?? null,
      source_mode: response.source_mode || "REAL_RAG",
      error_code: response.error_code || null,
      provider_request_id: response.provider_request_id || null,
      bff_request_id: attempts.at(-1)?.request_id || bffRequestId,
      evidence: {
        expected: task.expected_evidence,
        retrieved: resources,
        retrieval_diversity: response.retrieval_diversity || null,
        answer: response.answer || "",
        answer_goals: response.answer_goals || [],
        suggested_action: response.suggested_action || "",
        citation_support: response.citation_support || null
      }
    };
  }

  async function execute(run) {
    running = true;
    run.status = "RUNNING";
    run.started_at = new Date().toISOString();
    saveRun(store, run);
    const tasks = evaluationSet.tasks.filter(task =>
      run.task_scope === "CORE_12" ? task.core_task_id?.startsWith("CORE-") : true
    );
    run.progress = {completed: 0, total: tasks.length};
    saveRun(store, run);
    for (const task of tasks) {
      const attempts = [];
      try {
        let result;
        try {
          result = await runTask(task, run, attempts);
        } catch (firstError) {
          if (firstError.code === "RATE_LIMITED") throw firstError;
          result = await runTask(task, run, attempts);
        }
        run.results.push(result);
      } catch (error) {
        run.results.push({
          task_id: task.id,
          core_task_id: task.core_task_id,
          question_hash: stableHash(task.original_question),
          answer_status: "ERROR",
          provider_called: true,
          error_code: error.code || "EVALUATION_TASK_FAILED",
          error_message: error.message || "Evaluation task failed",
          request_id: attempts.at(-1)?.request_id || null,
          bff_request_id: attempts.at(-1)?.request_id || null,
          provider_request_id: attempts.at(-1)?.provider_request_id || null,
          retrieval_attempts: attempts,
          retrieval_status: "PROVIDER_ERROR",
          cost_status: "COST_UNKNOWN",
          p0: Boolean(task.p0),
          p0_passed: task.p0 ? false : null
        });
      }
      run.progress.completed += 1;
      run.metrics = summarizeEvaluationResults(run.results);
      saveRun(store, run);
    }
    run.metrics = summarizeEvaluationResults(run.results);
    run.status = run.metrics.p0_final_failures > 0
      ? "BLOCKED"
      : run.metrics.citation_failures > 0 ||
          run.metrics.provider_errors > 0 ||
          run.metrics.quality_gate_status === "FAILED"
        ? "FAILED"
        : "PASSED";
    run.completed_at = new Date().toISOString();
    saveRun(store, run);
    running = false;
  }

  return {
    getMetadata() {
      return {
        evaluation_set_id: evaluationSet.evaluation_set_id,
        version: evaluationSet.version,
        task_count: evaluationSet.tasks.length,
        core_task_count: evaluationSet.tasks.filter(task => task.core_task_id?.startsWith("CORE-")).length,
        generation_model: config.generationModel
      };
    },
    getRun(runId) {
      const runs = readRuns(store);
      return runs.runs[runId] ? toPublicRun(runs.runs[runId]) : null;
    },
    getByIdempotencyKey(key) {
      const runs = readRuns(store);
      const runId = runs.idempotency[key];
      return runId && runs.runs[runId] ? toPublicRun(runs.runs[runId]) : null;
    },
    start({taskScope = "ALL_17", model}, idempotencyKey) {
      const existing = this.getByIdempotencyKey(idempotencyKey);
      if (existing) {
        if (existing.task_scope !== taskScope || existing.model !== model) {
          const error = new Error("Same Idempotency-Key was used for a different evaluation request");
          error.code = "DUPLICATE_REQUEST";
          error.status = 409;
          throw error;
        }
        return existing;
      }
      if (running) {
        const error = new Error("Another real evaluation is already running");
        error.code = "EVALUATION_ALREADY_RUNNING";
        error.status = 409;
        throw error;
      }
      if (!["ALL_17", "CORE_12"].includes(taskScope)) {
        const error = new Error("task_scope must be ALL_17 or CORE_12");
        error.code = "VALIDATION_ERROR";
        error.status = 422;
        throw error;
      }
      if (model !== config.generationModel || model === "deepseek-v4-flash") {
        const error = new Error("Only the configured Pro primary model may run in P10");
        error.code = "MODEL_NOT_ALLOWED";
        error.status = 409;
        throw error;
      }
      const now = new Date().toISOString();
      const run = {
        run_id: `EVAL-REAL-${crypto.randomUUID()}`,
        idempotency_key: idempotencyKey,
        status: "QUEUED",
        task_scope: taskScope,
        evaluation_set_id: evaluationSet.evaluation_set_id,
        evaluation_version: evaluationSet.version,
        dataset: "CANDIDATE",
        model,
        provider: "Dify Cloud",
        source_mode: provider.sourceMode === "TEST_ADAPTER" ? "TEST_ADAPTER" : "REAL_DIFY",
        progress: {completed: 0, total: taskScope === "CORE_12" ? 12 : 17},
        results: [],
        metrics: null,
        created_at: now,
        updated_at: now,
        started_at: null,
        completed_at: null
      };
      saveRun(store, run);
      setImmediate(() => {
        void execute(run).catch(error => {
          run.status = "FAILED";
          run.error_code = error.code || "EVALUATION_FAILED";
          run.error_message = error.message || "Evaluation failed";
          run.completed_at = new Date().toISOString();
          saveRun(store, run);
          running = false;
        });
      });
      return toPublicRun(run);
    }
  };
}
