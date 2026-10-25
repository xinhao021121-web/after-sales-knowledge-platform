import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../../阶段4B-1_BFF与P03真实RAG接入/server/config.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..", "..", "..");
const recoveryRoot = path.resolve(here, "..");
const config = loadConfig(path.join(projectRoot, "文档", "阶段3B_高保真交互原型"));
const taskSet = JSON.parse(fs.readFileSync(
  path.join(recoveryRoot, "baseline", "holdout-set-v4.0.json"),
  "utf8"
));
const task = taskSet.tasks.find(item => item.id === "RET-H07");
const response = await fetch(
  `${config.datasetBaseUrl}/datasets/${encodeURIComponent(config.datasetId)}/retrieve`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.datasetApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      query: `${task.original_question}\n购买或售后渠道：${task.context.channel || "Apple Store 在线商店"}`,
      retrieval_model: {
        search_method: "hybrid_search",
        reranking_enable: true,
        reranking_model: {provider: "langgenius/tongyi/tongyi", model: "qwen3-rerank"},
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
    }),
    signal: AbortSignal.timeout(config.requestTimeoutMs)
  }
);
const text = await response.text();
if (!response.ok) throw new Error(`Dataset retrieve failed: HTTP ${response.status} ${text.slice(0, 300)}`);
const body = JSON.parse(text);
const records = (body.records || []).map((record, index) => ({
  position: index + 1,
  score: record.score,
  document_id: record.segment?.document_id || record.segment?.document?.id || null,
  document_name: record.segment?.document?.name || null,
  segment_id: record.segment?.id || null,
  content: record.segment?.content || ""
}));
const outputPath = path.join(recoveryRoot, "evidence", "RET-H07-candidate-pool-before-fix.json");
fs.writeFileSync(outputPath, `${JSON.stringify({
  captured_at: new Date().toISOString(),
  source_mode: "REAL_DIFY_DATASET_RETRIEVE",
  query: task.original_question,
  requested_top_k: 10,
  actual_candidate_count: records.length,
  records
}, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  outputPath,
  candidates: records.length,
  powerSegmentPositions: records
    .filter(record => record.content.includes("CHUNK-FAQ-POWER-01"))
    .map(record => record.position)
}, null, 2));
