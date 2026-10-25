import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDifyAdapter } from "../../阶段4B-1_BFF与P03真实RAG接入/server/dify-adapter.mjs";
import { loadCatalog } from "../../阶段4B-1_BFF与P03真实RAG接入/server/catalog.mjs";
import { loadConfig } from "../../阶段4B-1_BFF与P03真实RAG接入/server/config.mjs";
import { normalizeProviderAnswer } from "../../阶段4B-1_BFF与P03真实RAG接入/server/normalize.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..", "..", "..");
const prototypeRoot = path.join(projectRoot, "文档", "阶段3B_高保真交互原型");
const outputRoot = path.resolve(here, "..", "evidence");
const config = loadConfig(prototypeRoot);
const catalog = loadCatalog(config.dataRoot);
const evaluationSet = JSON.parse(fs.readFileSync(config.evaluationSetPath, "utf8"));
const taskIds = process.argv.slice(2);
if (!taskIds.length) throw new Error("Provide at least one task ID");

const adapter = createDifyAdapter(config);
const results = [];
for (const taskId of taskIds) {
  const task = evaluationSet.tasks.find(item => item.id === taskId);
  if (!task) throw new Error(`Unknown task: ${taskId}`);
  const request = {
    question: [
      task.original_question,
      `改写问法：${(task.rewrites || []).join("；")}`
    ].join("\n"),
    asq_id: `ASQ-R2-PROBE-${task.id}`,
    knowledge_item_id: `KI-${task.core_task_id}`,
    product_model: task.context?.product || "AirPods Pro 3",
    channel: task.context?.channel || "Apple Store 在线商店",
    role: "frontline",
    tenant_id: "tenant-demo",
    environment: "candidate",
    top_k: 3,
    retrieval_mode: "hybrid",
    rerank: true,
    citation_mode: "required",
    customer_context: task.context || {}
  };
  const providerResult = await adapter.answer(request);
  const normalized = normalizeProviderAnswer({
    raw: providerResult.raw,
    request,
    catalog,
    providerRequestId: providerResult.provider_request_id,
    timingMs: providerResult.timing_ms,
    model: config.generationModel
  });
  results.push({
    captured_at: new Date().toISOString(),
    task_id: task.id,
    original_question: task.original_question,
    request_question_hash: config.evaluationSetPath
      ? (await import("node:crypto")).createHash("sha256").update(request.question).digest("hex")
      : null,
    provider_request_id: providerResult.provider_request_id,
    provider_latency_ms: providerResult.timing_ms,
    raw_answer: providerResult.raw.answer,
    raw_metadata: {
      usage: providerResult.raw.metadata?.usage || null,
      retrieval_trace: providerResult.raw.metadata?.retrieval_trace || null,
      retriever_resources: (providerResult.raw.metadata?.retriever_resources || []).map(resource => ({
        position: resource.position,
        document_name: resource.document_name,
        document_id: resource.document_id,
        segment_id: resource.segment_id,
        score: resource.score,
        content: resource.content
      }))
    },
    normalized: {
      answer_status: normalized.answer_status,
      answer: normalized.answer,
      suggested_action: normalized.suggested_action,
      citation_support: normalized.citation_support,
      citations: normalized.citations,
      retrieval_resources: normalized.retrieval_resources,
      retrieval_diversity: normalized.retrieval_diversity
    }
  });
  console.log(`${task.id} ${normalized.answer_status} ${providerResult.provider_request_id}`);
}

fs.mkdirSync(outputRoot, {recursive: true});
const outputPath = path.join(outputRoot, `probe-${taskIds.join("-")}-${Date.now()}.json`);
fs.writeFileSync(outputPath, `${JSON.stringify({
  source_mode: "REAL_DIFY",
  model: config.generationModel,
  dataset: "CANDIDATE",
  tasks: results
}, null, 2)}\n`, "utf8");
console.log(outputPath);
