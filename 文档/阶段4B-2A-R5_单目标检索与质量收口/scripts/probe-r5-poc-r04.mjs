import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDifyAdapter } from "../../阶段4B-1_BFF与P03真实RAG接入/server/dify-adapter.mjs";
import { loadCatalog } from "../../阶段4B-1_BFF与P03真实RAG接入/server/catalog.mjs";
import { loadConfig } from "../../阶段4B-1_BFF与P03真实RAG接入/server/config.mjs";
import { normalizeProviderAnswer } from "../../阶段4B-1_BFF与P03真实RAG接入/server/normalize.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..", "..", "..");
const recoveryRoot = path.resolve(here, "..");
const outputLabel = process.argv[2] || "POC-R04-before-fix";
const prototypeRoot = path.join(projectRoot, "文档", "阶段3B_高保真交互原型");
const config = loadConfig(prototypeRoot, {RAG_REQUEST_TIMEOUT_MS: "90000"});
const catalog = loadCatalog(config.dataRoot);
const evaluationSet = JSON.parse(fs.readFileSync(config.evaluationSetPath, "utf8"));
const task = evaluationSet.tasks.find(item => item.id === "POC-R04");
const request = {
  question: [
    task.original_question,
    `改写问法：${task.rewrites.join("；")}`
  ].join("\n"),
  asq_id: "ASQ-R4-PROBE-POC-R04",
  knowledge_item_id: "KI-CORE-R4",
  product_model: task.context.product,
  channel: task.context.channel || "Apple Store 在线商店",
  role: "frontline",
  tenant_id: "tenant-demo",
  environment: "candidate",
  top_k: 3,
  retrieval_mode: "hybrid",
  rerank: true,
  citation_mode: "required",
  customer_context: task.context
};
const adapter = createDifyAdapter(config);
const providerResult = await adapter.answer(request);
const normalized = normalizeProviderAnswer({
  raw: providerResult.raw,
  request,
  catalog,
  providerRequestId: providerResult.provider_request_id,
  timingMs: providerResult.timing_ms,
  model: config.generationModel
});
const output = {
  captured_at: new Date().toISOString(),
  task_id: task.id,
  source_mode: "REAL_DIFY",
  provider_request_id: providerResult.provider_request_id,
  provider_latency_ms: providerResult.timing_ms,
  raw_answer: providerResult.raw.answer,
  raw_resources: (providerResult.raw.metadata?.retriever_resources || []).map(resource => ({
    position: resource.position,
    document_name: resource.document_name,
    document_id: resource.document_id,
    segment_id: resource.segment_id,
    score: resource.score,
    content: resource.content
  })),
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
  path.join(recoveryRoot, "evidence", `${outputLabel}.json`),
  `${JSON.stringify(output, null, 2)}\n`,
  "utf8"
);
console.log(`${task.id} ${normalized.answer_status} ${providerResult.provider_request_id}`);
