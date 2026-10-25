import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "../../阶段4B-1_BFF与P03真实RAG接入/server/catalog.mjs";
import { loadConfig } from "../../阶段4B-1_BFF与P03真实RAG接入/server/config.mjs";
import { normalizeProviderAnswer } from "../../阶段4B-1_BFF与P03真实RAG接入/server/normalize.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..", "..", "..");
const recoveryRoot = path.resolve(here, "..");
const inputName = process.argv[2];
const outputName = process.argv[3];
if (!inputName || !outputName) throw new Error("Usage: reprocess-r5-probe.mjs <input> <output>");
const source = JSON.parse(fs.readFileSync(path.join(recoveryRoot, "evidence", inputName), "utf8"));
const taskSet = JSON.parse(fs.readFileSync(
  path.join(recoveryRoot, "baseline", "holdout-set-v4.0.json"),
  "utf8"
));
const task = taskSet.tasks.find(item => item.id === source.task_id);
if (!task) throw new Error(`Unknown task: ${source.task_id}`);
const config = loadConfig(path.join(projectRoot, "文档", "阶段3B_高保真交互原型"));
const request = {
  question: [task.original_question, `改写问法：${task.rewrites.join("；")}`].join("\n"),
  asq_id: `ASQ-R5-PROBE-${task.id}`,
  knowledge_item_id: `KI-${task.core_task_id}`,
  product_model: task.context?.product || "AirPods Pro 3",
  channel: task.context?.channel || "Apple Store 在线商店",
  role: "frontline",
  customer_context: task.context || {}
};
const normalized = normalizeProviderAnswer({
  raw: {
    answer: source.raw_answer,
    metadata: {
      retriever_resources: source.raw_resources,
      retrieval_trace: source.retrieval_trace
    }
  },
  request,
  catalog: loadCatalog(config.dataRoot),
  providerRequestId: source.provider_request_id,
  timingMs: source.provider_latency_ms,
  model: config.generationModel
});
const output = {
  ...source,
  reprocessed_at: new Date().toISOString(),
  reprocess_source: `evidence/${inputName}`,
  normalized: {
    answer_status: normalized.answer_status,
    answer: normalized.answer,
    answer_goals: normalized.answer_goals,
    suggested_action: normalized.suggested_action,
    business_conditions: normalized.business_conditions,
    citations: normalized.citations,
    citation_support: normalized.citation_support,
    retrieval_resources: normalized.retrieval_resources,
    retrieval_diversity: normalized.retrieval_diversity
  }
};
fs.writeFileSync(
  path.join(recoveryRoot, "evidence", outputName),
  `${JSON.stringify(output, null, 2)}\n`,
  "utf8"
);
console.log(`${task.id} ${normalized.answer_status} ${outputName}`);
