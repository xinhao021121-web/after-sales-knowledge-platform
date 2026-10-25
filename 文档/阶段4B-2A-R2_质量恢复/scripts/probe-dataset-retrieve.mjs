import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../../阶段4B-1_BFF与P03真实RAG接入/server/config.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..", "..", "..");
const config = loadConfig(path.join(projectRoot, "文档", "阶段3B_高保真交互原型"));
const query = process.argv.slice(2).join(" ") || "Apple 官网和第三方平台购买的 AirPods 拆封后能退吗？";
const startedAt = performance.now();
const response = await fetch(
  `${config.datasetBaseUrl}/datasets/${encodeURIComponent(config.datasetId)}/retrieve`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.datasetApiKey}`,
      "Content-Type": "application/json"
    },
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
          keyword_setting: {
            keyword_weight: 0.3
          }
        }
      }
    }),
    signal: AbortSignal.timeout(config.requestTimeoutMs)
  }
);
const text = await response.text();
let body;
try { body = JSON.parse(text); } catch { body = {raw_text: text}; }
if (!response.ok) throw new Error(`Dataset retrieve failed: HTTP ${response.status} ${text.slice(0, 500)}`);
const records = (body.records || []).map((record, index) => ({
  position: index + 1,
  score: record.score,
  document_id: record.segment?.document_id || null,
  document_name: record.segment?.document?.name || null,
  segment_id: record.segment?.id || null,
  content: record.segment?.content || ""
}));
const output = {
  captured_at: new Date().toISOString(),
  source_mode: "REAL_DIFY_DATASET_RETRIEVE",
  dataset: "CANDIDATE",
  query,
  latency_ms: Math.round(performance.now() - startedAt),
  internal_candidate_pool_size: records.length,
  records
};
const outputPath = path.join(
  here,
  "..",
  "evidence",
  `dataset-retrieve-${Date.now()}.json`
);
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  outputPath,
  pool: records.length,
  documents: [...new Set(records.map(item => item.document_name))]
}, null, 2));
