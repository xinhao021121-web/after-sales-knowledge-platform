import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBffServer } from "../server/app.mjs";
import { catalogDocumentForResource, loadCatalog } from "../server/catalog.mjs";
import { loadConfig } from "../server/config.mjs";
import { containsForbidden } from "../server/evaluation-service.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const projectRoot = path.resolve(root, "..", "..");
const prototypeRoot = path.join(projectRoot, "文档", "阶段3B_高保真交互原型");
const recoveryRoot = path.join(projectRoot, "文档", "阶段4B-2A-R2_质量恢复");
const holdoutPath = path.join(recoveryRoot, "holdout", "retention-set-v1.0.json");
const evaluationSet = JSON.parse(fs.readFileSync(holdoutPath, "utf8"));
const config = loadConfig(prototypeRoot);
const catalog = loadCatalog(config.dataRoot);
const app = createBffServer({prototypeRoot, config});

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
const runId = `HOLDOUT-REAL-R2-${crypto.randomUUID()}`;
const results = [];

try {
  for (const task of evaluationSet.tasks) {
    const requestStartedAt = performance.now();
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
        catalogDocumentForResource(catalog, {document_name: item.document_name})?.doc_id ||
        null
    }));
    const source = coverage(task, resources);
    const forbidden = containsForbidden(task, `${payload.answer || ""} ${payload.suggested_action || ""}`);
    const statusAccepted = task.accepted_statuses.includes(payload.answer_status);
    const p0Passed = task.p0
      ? payload.answer_status === "BLOCKED_SAFETY" &&
        payload.provider_called === false &&
        payload.citations?.[0]?.chunk_id === "CHUNK-SAFE-STOP-01"
      : null;
    results.push({
      task_id: task.id,
      core_task_id: task.core_task_id,
      original_question: task.original_question,
      answer_status: payload.answer_status,
      accepted_statuses: task.accepted_statuses,
      status_accepted: statusAccepted,
      provider_called: payload.provider_called,
      retrieval_status: task.p0 ? "SKIPPED_P0" : resources.length ? "RETRIEVAL_COMPLETED" : "NO_RETRIEVAL_HITS",
      ...source,
      retrieval_diversity: payload.retrieval_diversity ||
        payload.evidence_summary?.retrieval_diversity ||
        null,
      retrieval_resources: resources,
      citations: payload.citations || [],
      citation_support: payload.citation_support || null,
      citation_gate_passed: payload.citation_support?.passed === true,
      business_action_status: forbidden ? "FORBIDDEN_ACTION" : statusAccepted ? "STATUS_MATCH" : "STATUS_MISMATCH",
      forbidden_action_match: forbidden,
      p0: task.p0,
      p0_passed: p0Passed,
      answer: payload.answer || "",
      suggested_action: payload.suggested_action || "",
      prompt_tokens: payload.cost?.prompt_tokens ?? null,
      completion_tokens: payload.cost?.completion_tokens ?? null,
      total_tokens: payload.cost?.total_tokens ?? null,
      provider_latency_ms: payload.cost?.provider_latency_ms ?? null,
      bff_latency_ms: Math.round(performance.now() - requestStartedAt),
      bff_request_id: payload.request_id || null,
      provider_request_id: payload.provider_request_id || null,
      error_code: payload.error_code || payload.error_code || null,
      cost_status: payload.cost?.cost_status || "COST_UNKNOWN"
    });
    console.log(`${task.id} ${payload.answer_status} ` +
      `sources=${source.covered_source_count}/${source.expected_source_count}`);
  }
  const retrievalTasks = results.filter(result => !result.p0);
  const expectedTotal = retrievalTasks.reduce((total, result) => total + result.expected_source_count, 0);
  const coveredTotal = retrievalTasks.reduce((total, result) => total + result.covered_source_count, 0);
  const summary = {
    run_id: runId,
    source_mode: "REAL_DIFY",
    model: config.generationModel,
    dataset: "CANDIDATE",
    used_for_tuning: false,
    task_count: results.length,
    expected_source_count: expectedTotal,
    covered_source_count: coveredTotal,
    recall_at_3: expectedTotal ? coveredTotal / expectedTotal : null,
    status_all_accepted: results.every(result => result.status_accepted),
    p0_failures: results.filter(result => result.p0 && result.p0_passed !== true).length,
    forbidden_action_failures: results.filter(result => result.forbidden_action_match).length,
    citation_failures: results.filter(result =>
      result.answer_status === "ANSWERED" && !result.citation_gate_passed
    ).length,
    provider_errors: results.filter(result => result.answer_status === "ERROR").length,
    cost_status: "COST_UNKNOWN",
    results
  };
  summary.passed = summary.status_all_accepted &&
    summary.p0_failures === 0 &&
    summary.forbidden_action_failures === 0 &&
    summary.citation_failures === 0 &&
    summary.provider_errors === 0;
  const evidenceRoot = path.join(recoveryRoot, "evidence", "holdout");
  fs.mkdirSync(evidenceRoot, {recursive: true});
  fs.writeFileSync(
    path.join(recoveryRoot, "evidence", "holdout-real-r2.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8"
  );
  for (const result of results) {
    fs.writeFileSync(
      path.join(evidenceRoot, `${result.task_id}.json`),
      `${JSON.stringify(result, null, 2)}\n`,
      "utf8"
    );
  }
  console.log(`RESULT: ${runId} passed=${summary.passed} recall=${summary.recall_at_3} ` +
    `p0_failures=${summary.p0_failures} provider_errors=${summary.provider_errors}`);
} finally {
  await new Promise(resolve => app.server.close(resolve));
}
