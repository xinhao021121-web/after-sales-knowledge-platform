import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBffServer } from "../server/app.mjs";
import { loadCatalog } from "../server/catalog.mjs";
import { loadConfig } from "../server/config.mjs";
import { evaluateBusinessSemantics } from "../server/semantic-evaluation.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const projectRoot = path.resolve(root, "..", "..");
const recoveryRoot = path.join(projectRoot, "文档", "阶段4B-2A-R5_单目标检索与质量收口");
const suite = process.argv[2] === "holdout" ? "holdout" : "regression";
const inputPath = suite === "holdout"
  ? path.join(recoveryRoot, "holdout", "retention-set-v5.0.json")
  : path.join(recoveryRoot, "regression", "retention-set-v5.0.json");
const outputName = suite === "holdout" ? "holdout-v5-first-run.json" : "regression-v5-real.json";
const taskSet = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const prototypeRoot = path.join(projectRoot, "文档", "阶段3B_高保真交互原型");
const config = loadConfig(prototypeRoot, {RAG_REQUEST_TIMEOUT_MS: "90000"});
const catalog = loadCatalog(config.dataRoot);
const app = createBffServer({prototypeRoot, config});
const runId = `${suite === "holdout" ? "HOLDOUT" : "REGRESSION"}-REAL-R5-${crypto.randomUUID()}`;

function coverage(task, resources) {
  const expected = new Set(task.expected_evidence.map(item => item.doc_id));
  const retrieved = new Set(resources.slice(0, 3).map(item => item.document_id).filter(Boolean));
  const covered = [...expected].filter(docId => retrieved.has(docId));
  return {
    recall_at_3: expected.size ? covered.length / expected.size : null,
    source_hit: expected.size ? covered.length > 0 : null,
    expected_source_count: expected.size,
    covered_source_count: covered.length,
    covered_source_ids: covered
  };
}

await new Promise(resolve => app.server.listen(0, "127.0.0.1", resolve));
const baseUrl = `http://127.0.0.1:${app.server.address().port}`;
const results = [];
try {
  for (const task of taskSet.tasks) {
    const startedAt = performance.now();
    const response = await fetch(`${baseUrl}/api/answers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": `${runId}-${task.id}`,
        "X-Demo-Role": "frontline"
      },
      body: JSON.stringify({
        question: [
          task.original_question,
          ...(task.rewrites?.length ? [`改写问法：${task.rewrites.join("；")}`] : [])
        ].join("\n"),
        asq_id: `ASQ-${runId}-${task.id}`,
        knowledge_item_id: `KI-${task.core_task_id}`,
        product_model: task.context?.product || "AirPods Pro 3",
        channel: task.context?.channel || "Apple Store 在线商店",
        role: "frontline",
        tenant_id: "tenant-demo",
        environment: "candidate",
        top_k: 3,
        retrieval_mode: "hybrid",
        rerank: true,
        metadata_filter: {enabled: true, active_only: true, source_statuses: ["active"]},
        citation_mode: "required",
        customer_context: task.context || {}
      })
    });
    const payload = await response.json();
    const resources = (payload.retrieval_resources || []).map(item => ({
      ...item,
      document_id: item.document_id ||
        catalog.byFileName.get(item.document_name)?.doc_id ||
        null
    }));
    payload.retrieval_resources = resources;
    payload.p0_passed = task.p0
      ? payload.answer_status === "BLOCKED_SAFETY" &&
        payload.provider_called === false &&
        payload.citations?.[0]?.chunk_id === "CHUNK-SAFE-STOP-01"
      : null;
    const source = coverage(task, resources);
    const semantics = evaluateBusinessSemantics(task, payload);
    const result = {
      task_id: task.id,
      core_task_id: task.core_task_id,
      sample_type: taskSet.sample_type,
      original_question: task.original_question,
      question_context: task.context,
      answer_status: payload.answer_status,
      provider_called: payload.provider_called,
      retrieval_status: task.p0 ? "SKIPPED_P0" : resources.length ? "RETRIEVAL_COMPLETED" : "NO_RETRIEVAL_HITS",
      ...source,
      retrieval_diversity: payload.retrieval_diversity || null,
      retrieval_resources: resources,
      answer: payload.answer || "",
      answer_goals: payload.answer_goals || [],
      suggested_action: payload.suggested_action || "",
      citations: payload.citations || [],
      citation_support: payload.citation_support || null,
      citation_gate_passed: payload.citation_support?.passed === true,
      forbidden_action_match: semantics.forbidden_action_match,
      business_semantics: semantics,
      p0: task.p0,
      p0_passed: payload.p0_passed,
      prompt_tokens: payload.cost?.prompt_tokens ?? null,
      completion_tokens: payload.cost?.completion_tokens ?? null,
      total_tokens: payload.cost?.total_tokens ?? null,
      provider_latency_ms: payload.cost?.provider_latency_ms ?? null,
      bff_latency_ms: Math.round(performance.now() - startedAt),
      bff_request_id: payload.request_id || null,
      provider_request_id: payload.provider_request_id || null,
      error_code: payload.error_code || null,
      cost_status: payload.cost?.cost_status || "COST_UNKNOWN"
    };
    results.push(result);
    console.log(`${task.id} ${payload.answer_status} semantic=${semantics.passed} ` +
      `sources=${source.covered_source_count}/${source.expected_source_count}`);
  }
  const retrievalResults = results.filter(result => !result.p0);
  const expectedSourceCount = retrievalResults.reduce((total, result) => total + result.expected_source_count, 0);
  const coveredSourceCount = retrievalResults.reduce((total, result) => total + result.covered_source_count, 0);
  const aggregate = {
    run_id: runId,
    suite,
    source_mode: "REAL_DIFY",
    model: config.generationModel,
    dataset: "CANDIDATE",
    evaluation_set_id: taskSet.evaluation_set_id,
    used_for_tuning: taskSet.used_for_tuning,
    task_count: results.length,
    expected_source_count: expectedSourceCount,
    covered_source_count: coveredSourceCount,
    recall_at_3: expectedSourceCount ? coveredSourceCount / expectedSourceCount : null,
    semantic_passed_count: results.filter(result => result.business_semantics.passed).length,
    status_all_accepted: results.every(result => result.business_semantics.status_accepted),
    p0_failures: results.filter(result => result.p0 && result.p0_passed !== true).length,
    citation_failures: results.filter(result =>
      result.answer_status === "ANSWERED" && !result.citation_gate_passed
    ).length,
    provider_errors: results.filter(result => result.answer_status === "ERROR").length,
    forbidden_action_failures: results.filter(result => result.forbidden_action_match).length,
    document_request_failures: results.filter(result =>
      result.business_semantics.document_request_matches.length > 0
    ).length,
    cost_status: "COST_UNKNOWN",
    results
  };
  aggregate.passed = aggregate.semantic_passed_count === aggregate.task_count &&
    aggregate.status_all_accepted &&
    aggregate.p0_failures === 0 &&
    aggregate.citation_failures === 0 &&
    aggregate.provider_errors === 0 &&
    aggregate.forbidden_action_failures === 0 &&
    aggregate.document_request_failures === 0;

  const evidenceRoot = path.join(recoveryRoot, "evidence", suite);
  fs.mkdirSync(evidenceRoot, {recursive: true});
  fs.writeFileSync(
    path.join(recoveryRoot, "evidence", outputName),
    `${JSON.stringify(aggregate, null, 2)}\n`,
    "utf8"
  );
  for (const result of results) {
    fs.writeFileSync(
      path.join(evidenceRoot, `${result.task_id}.json`),
      `${JSON.stringify(result, null, 2)}\n`,
      "utf8"
    );
  }
  fs.writeFileSync(
    path.join(recoveryRoot, "evidence", `${suite}-manual-review.json`),
    `${JSON.stringify({
      run_id: runId,
      review_status: "PENDING_PRODUCT_OWNER",
      reviewed_by: null,
      reviewed_at: null,
      tasks: taskSet.tasks.map(task => ({
        task_id: task.id,
        automatic_semantic_passed: results.find(result => result.task_id === task.id)?.business_semantics.passed,
        checklist: task.manual_review,
        product_owner_decision: null,
        notes: ""
      }))
    }, null, 2)}\n`,
    "utf8"
  );
  console.log(`RESULT: ${runId} passed=${aggregate.passed} semantic=${aggregate.semantic_passed_count}/${aggregate.task_count} ` +
    `sources=${coveredSourceCount}/${expectedSourceCount}`);
} finally {
  await new Promise(resolve => app.server.close(resolve));
}
