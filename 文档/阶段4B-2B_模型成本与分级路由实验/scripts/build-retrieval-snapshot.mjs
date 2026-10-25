import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {loadConfig} from "../../阶段4B-1_BFF与P03真实RAG接入/server/config.mjs";
import {
  buildRetrievalQueries,
  mergeDiverseCandidates,
  selectRelevanceFirstCandidates
} from "../../阶段4B-1_BFF与P03真实RAG接入/server/dify-adapter.mjs";
import {detectP0} from "../../阶段4B-1_BFF与P03真实RAG接入/server/policy.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const stageRoot = path.resolve(here, "..");
const project1Root = path.resolve(stageRoot, "..", "..");
const prototypeRoot = path.join(project1Root, "文档", "阶段3B_高保真交互原型");
const config = loadConfig(prototypeRoot, {RAG_REQUEST_TIMEOUT_MS: "90000"});
const fixedSet = JSON.parse(fs.readFileSync(
  path.join(stageRoot, "baseline", "fixed-regression-used.json"),
  "utf8"
));
const tasks = fixedSet.tasks.map(item => ({...item.task, suite: item.suite}));
const outputPath = path.join(stageRoot, "evidence", "retrieval-snapshot.json");
const resume = process.argv.includes("--resume");
const existing = resume && fs.existsSync(outputPath)
  ? JSON.parse(fs.readFileSync(outputPath, "utf8"))
  : null;
if (fs.existsSync(outputPath) && !resume) {
  throw new Error("Retrieval snapshot already exists; use --resume to preserve completed tasks");
}
const snapshot = existing || {
  run_id: `RETRIEVAL-SNAPSHOT-4B2B-${crypto.randomUUID()}`,
  captured_at: new Date().toISOString(),
  source_mode: "REAL_DIFY_DATASET_RETRIEVE",
  dataset: "CANDIDATE",
  dataset_id: config.datasetId,
  model_independent: true,
  task_count: tasks.length,
  p0_short_circuit_count: tasks.filter(task => task.p0 || detectP0(task.original_question)).length,
  rate_limit_failures: [],
  tasks: []
};
snapshot.rate_limit_failures ||= [];
for (const task of snapshot.tasks || []) {
  const observedAttempts = [
    ...(task.previous_failure?.attempts || []),
    ...(task.attempts || [])
  ];
  for (const attempt of observedAttempts) {
    if (attempt.http_status !== 403) continue;
    const alreadyRecorded = snapshot.rate_limit_failures.some(item =>
      item.task_id === task.task_id &&
      item.attempted_at === attempt.attempted_at &&
      item.http_status === attempt.http_status
    );
    if (!alreadyRecorded) {
      snapshot.rate_limit_failures.push({
        task_id: task.task_id,
        captured_at: attempt.attempted_at || new Date().toISOString(),
        attempt: attempt.attempt || null,
        http_status: 403,
        message: attempt.message || "Dify Dataset Retrieve returned HTTP 403",
        action: "PRESERVED_AND_RETRIED_AFTER_WAIT"
      });
    }
  }
}
fs.mkdirSync(path.dirname(outputPath), {recursive: true});
fs.writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");

async function retrieveOnce(query) {
  const response = await fetch(
    `${config.datasetBaseUrl}/datasets/${encodeURIComponent(config.datasetId)}/retrieve`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.datasetApiKey}`,
        "Content-Type": "application/json"
      },
      signal: AbortSignal.timeout(config.requestTimeoutMs),
      body: JSON.stringify({
        query,
        retrieval_model: {
          search_method: "hybrid_search",
          reranking_enable: true,
          reranking_model: {
            provider: "langgenius/tongyi/tongyi",
            model: "qwen3-rerank"
          },
          top_k: 10,
          score_threshold_enabled: false,
          score_threshold: null,
          weights: {
            weight_type: "customized",
            vector_setting: {
              vector_weight: 0.7,
              embedding_provider_name: "langgenius/tongyi/tongyi",
              embedding_model_name: "text-embedding-v4"
            },
            keyword_setting: {keyword_weight: 0.3}
          }
        }
      })
    }
  );
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = {raw_text: text}; }
  return {http_status: response.status, body};
}

async function retrieveWithRateLimitWait(query) {
  const attempts = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await retrieveOnce(query);
      const message = String(result.body?.message || result.body?.code || result.body?.raw_text || "");
      attempts.push({
        attempt,
        attempted_at: new Date().toISOString(),
        http_status: result.http_status,
        error_code: result.http_status === 200 ? null : "RETRIEVAL_REQUEST_FAILED",
        message: message.slice(0, 300)
      });
      const rateLimited = result.http_status === 429 ||
        (result.http_status === 403 && /rate limit|频率|额度/i.test(message));
      if (rateLimited && attempt < 3) {
        snapshot.rate_limit_failures.push({
          captured_at: new Date().toISOString(),
          query,
          attempt,
          http_status: result.http_status,
          message: message.slice(0, 300),
          action: "WAIT_60_SECONDS_AND_RETRY"
        });
        await new Promise(resolve => setTimeout(resolve, 60000));
        continue;
      }
      if (result.http_status !== 200) {
        throw new Error(`Dataset retrieve failed: HTTP ${result.http_status}`);
      }
      return {body: result.body, attempts};
    } catch (error) {
      throw Object.assign(error, {attempts});
    }
  }
}

for (const task of tasks) {
  const previous = snapshot.tasks.find(item => item.task_id === task.id);
  if (previous && ["RETRIEVAL_COMPLETED", "SKIPPED_P0"].includes(previous.retrieval_status)) {
    console.log(`${task.id} PRESERVED ${previous.retrieval_status}`);
    continue;
  }
  const previousFailure = previous
    ? {
        retrieval_status: previous.retrieval_status,
        attempts: previous.attempts || [],
        error_code: previous.error_code || null,
        error_message: previous.error_message || null
      }
    : null;
  if (previous) {
    snapshot.tasks = snapshot.tasks.filter(item => item.task_id !== task.id);
  }
  if (task.p0 || detectP0(task.original_question)) {
    snapshot.tasks.push({
      task_id: task.id,
      suite: task.suite,
      retrieval_status: "SKIPPED_P0",
      provider_called: false,
      evidence: [],
      retrieval_trace: null,
        attempts: [],
        previous_failure: previousFailure
    });
  } else {
    try {
      const {
        subqueries,
        originalQuery,
        multiObjective,
        retrievalQueries
      } = buildRetrievalQueries([
        task.original_question,
        ...(task.rewrites?.length ? [`改写问法：${task.rewrites.join("；")}`] : [])
      ].join("\n"));
      const resultSets = [];
      const attempts = [];
      for (const retrievalQuery of retrievalQueries) {
        const query = [
          retrievalQuery,
          task.context?.channel ? `购买或售后渠道：${task.context.channel}` : null
        ].filter(Boolean).join("\n");
        const retrieved = await retrieveWithRateLimitWait(query);
        attempts.push(...retrieved.attempts);
        resultSets.push((retrieved.body.records || []).map((record, index) => ({
          position: index + 1,
          dataset_id: config.datasetId,
          dataset_name: "CANDIDATE",
          document_id: record.segment?.document_id || record.segment?.document?.id || null,
          document_name: record.segment?.document?.name || null,
          segment_id: record.segment?.id || null,
          score: record.score,
          content: String(record.segment?.content || "")
        })));
      }
      const merged = multiObjective
        ? mergeDiverseCandidates(
            resultSets,
            3,
            `${retrievalQueries.join("\n")}\n${task.original_question}`
          )
        : selectRelevanceFirstCandidates(resultSets, 3);
      snapshot.tasks.push({
        task_id: task.id,
        suite: task.suite,
        retrieval_status: "RETRIEVAL_COMPLETED",
        provider_called: false,
        evidence: merged.selected,
        retrieval_trace: {
          merge_strategy: multiObjective
            ? "MULTI_OBJECTIVE_DOCUMENT_DEDUPE"
            : "ORIGINAL_QUERY_RELEVANCE_FIRST",
          requested_internal_top_k: 10,
          subqueries,
          subquery_count: subqueries.length,
          original_query: originalQuery,
          multi_objective: multiObjective,
          retrieval_queries: retrievalQueries,
          candidate_pool_size: merged.candidatePool.length,
          candidate_document_count: merged.candidateDocumentCount,
          displayed_top_k: merged.selected.length,
          displayed_document_count: new Set(merged.selected.map(item => item.document_id)).size,
          displayed_segment_ids: merged.selected.map(item => item.segment_id),
          candidate_representatives: (merged.representatives || merged.selected).map(item => ({
            document_id: item.document_id,
            segment_id: item.segment_id,
            score: item.score,
            position: item.position
          }))
        },
        attempts,
        previous_failure: previousFailure
      });
    } catch (error) {
      snapshot.tasks.push({
        task_id: task.id,
        suite: task.suite,
        retrieval_status: "PROVIDER_ERROR",
        provider_called: false,
        evidence: [],
        retrieval_trace: null,
        attempts: error.attempts || [],
        error_code: error.name || "RETRIEVAL_FAILED",
        error_message: error.message
      });
      fs.writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
      throw error;
    }
  }
  fs.writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  console.log(`${task.id} ${snapshot.tasks.at(-1).retrieval_status}`);
}

const taskOrder = new Map(tasks.map((task, index) => [task.id, index]));
snapshot.tasks.sort((left, right) => taskOrder.get(left.task_id) - taskOrder.get(right.task_id));
snapshot.completed_at = new Date().toISOString();
snapshot.sha256_self_excluding_hash = crypto.createHash("sha256")
  .update(JSON.stringify(snapshot.tasks))
  .digest("hex");
fs.writeFileSync(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
console.log(`WROTE ${outputPath}`);
