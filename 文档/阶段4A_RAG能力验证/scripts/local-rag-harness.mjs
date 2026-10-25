import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const manifestPaths = {
  TEST: path.join(root, "datasets", "TEST", "manifest.json"),
  CANDIDATE: path.join(root, "datasets", "CANDIDATE", "manifest.json")
};
const evalPath = path.join(root, "evaluation", "eval-set-v1.0.json");
const outputPath = path.join(root, "experiments", "results", "local-contract-run.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function tokenize(text) {
  const normalized = text.toLowerCase().replace(/[，。！？；：、“”‘’（）()【】[\]{}<>《》]/g, " ");
  const tokens = [];
  for (const word of normalized.match(/[a-z0-9_+-]{2,}/g) || []) tokens.push(word);
  for (const run of normalized.match(/[\u3400-\u9fff]+/g) || []) {
    const chars = [...run];
    if (chars.length === 1) tokens.push(chars[0]);
    for (let index = 0; index < chars.length - 1; index += 1) {
      tokens.push(chars[index] + chars[index + 1]);
    }
  }
  return tokens;
}

function parseChunks(datasetRoot, document, metadata) {
  const content = fs.readFileSync(path.join(datasetRoot, metadata.file), "utf8");
  const sections = content.split(/^## /m).slice(1);
  return sections.map(section => {
    const firstLine = section.split("\n", 1)[0].trim();
    const [chunkId, ...titleParts] = firstLine.split(/\s+/);
    return {
      chunk_id: chunkId,
      doc_id: metadata.doc_id,
      title: `${metadata.title} ${titleParts.join(" ")}`,
      text: section,
      source: metadata,
      tokens: tokenize(`${metadata.title} ${section}`)
    };
  });
}

function buildIndex(chunks) {
  const df = new Map();
  const lengths = [];
  for (const chunk of chunks) {
    const unique = new Set(chunk.tokens);
    lengths.push(chunk.tokens.length);
    for (const token of unique) df.set(token, (df.get(token) || 0) + 1);
  }
  const avgLength = lengths.reduce((sum, value) => sum + value, 0) / Math.max(lengths.length, 1);
  const frequencies = chunks.map(chunk => {
    const tf = new Map();
    for (const token of chunk.tokens) tf.set(token, (tf.get(token) || 0) + 1);
    return tf;
  });
  return { df, avgLength, frequencies };
}

function scoreChunk(queryTokens, chunk, frequency, index, totalChunks) {
  const k1 = 1.4;
  const b = 0.75;
  let score = 0;
  for (const token of queryTokens) {
    const tf = frequency.get(token) || 0;
    if (!tf) continue;
    const docFrequency = index.df.get(token) || 0;
    const idf = Math.log(1 + (totalChunks - docFrequency + 0.5) / (docFrequency + 0.5));
    const denominator = tf + k1 * (1 - b + b * chunk.tokens.length / Math.max(index.avgLength, 1));
    score += idf * ((tf * (k1 + 1)) / denominator);
  }
  return score;
}

function retrieve(query, chunks, index, topK = 3) {
  const queryTokens = tokenize(query);
  return chunks
    .map((chunk, position) => ({
      chunk_id: chunk.chunk_id,
      doc_id: chunk.doc_id,
      title: chunk.title,
      score: scoreChunk(queryTokens, chunk, index.frequencies[position], index, chunks.length),
      source: chunk.source
    }))
    .filter(item => item.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, topK);
}

function classify(task, hits) {
  const question = `${task.original_question} ${task.rewrites.join(" ")}`;
  if (/内部|公式|权重|阈值/.test(question) && task.context?.actor_role === "public_customer") return "PERMISSION_DENIED";
  if (/冒烟|明火|焦味|鼓包|鼓起|变形|进液|进水|烫手|发热/.test(question) && task.p0) return "BLOCKED_SAFETY";
  if (task.core_task_id === "EDGE-EXPIRED-KNOWLEDGE" && hits.some(hit => hit.source.status === "expired")) return "KNOWLEDGE_EXPIRED";
  if (task.core_task_id === "EDGE-CHANNEL-CONFLICT" && hits.some(hit => hit.doc_id === "DOC-CHANNEL-CONFLICT")) return "CONFLICT";
  if (task.p0) return "NEED_CLARIFICATION";
  if (task.expected_evidence.length === 0) return "NO_ANSWER";
  return "ANSWERABLE_PREVIEW";
}

const manifests = Object.fromEntries(Object.entries(manifestPaths).map(([name, filePath]) => [name, readJson(filePath)]));
const evaluation = readJson(evalPath);
const datasets = Object.fromEntries(Object.entries(manifests).map(([name, manifest]) => {
  const datasetRoot = path.dirname(manifestPaths[name]);
  const chunks = manifest.documents
    .filter(document => document.permission_scope !== "internal_only")
    .flatMap(document => parseChunks(datasetRoot, document, document));
  return [name, { manifest, datasetRoot, chunks, index: buildIndex(chunks) }];
}));

const results = evaluation.tasks.map(task => {
  const query = `${task.original_question} ${task.rewrites.join(" ")} ${JSON.stringify(task.context)}`;
  const dataset = datasets[task.dataset];
  const hits = retrieve(query, dataset.chunks, dataset.index, 3);
  const expectedDocIds = new Set(task.expected_evidence.map(item => item.doc_id));
  const localAction = classify(task, hits);
  return {
    task_id: task.id,
    expected_action: task.expected_action,
    local_gate_result: localAction,
    p0_safe: !task.p0 || ["BLOCKED_SAFETY", "NEED_CLARIFICATION"].includes(localAction),
    expected_source_visible_in_preview_top3: task.expected_evidence.length === 0 || hits.some(hit => expectedDocIds.has(hit.doc_id)),
    retrieval_preview_top3: hits.map(hit => ({
      chunk_id: hit.chunk_id,
      doc_id: hit.doc_id,
      score: Number(hit.score.toFixed(4)),
      status: hit.source.status,
      valid_until: hit.source.valid_until
    }))
  };
});

const output = {
  status: "LOCAL_CONTRACT_SIMULATION_ONLY",
  notice: "这不是 FastGPT、Dify 或 RAGFlow 的真实检索/问答结果，不得用于供应商能力排序。",
  run_id: "LOCAL-2026-10-24-CFG-BASE",
  dataset_ids: Object.fromEntries(Object.entries(manifests).map(([name, manifest]) => [name, manifest.dataset_id])),
  dataset_versions: Object.fromEntries(Object.entries(manifests).map(([name, manifest]) => [name, manifest.version])),
  eval_set_id: evaluation.evaluation_set_id,
  eval_set_version: evaluation.version,
  configuration: "CFG-BASE local lexical preview; no LLM; no provider call",
  checks: {
    task_count: results.length,
    core_task_count: evaluation.tasks.filter(task => task.core_task_id.startsWith("CORE-")).length,
    edge_case_count: evaluation.tasks.filter(task => task.core_task_id.startsWith("EDGE-")).length,
    p0_task_count: evaluation.tasks.filter(task => task.p0).length,
    p0_gate_failures: results.filter(task => !task.p0_safe).length,
    expected_source_preview_misses: results.filter(task => !task.expected_source_visible_in_preview_top3).length,
    internal_document_excluded_from_public_index: Object.values(datasets).every(dataset => (
      !dataset.chunks.some(chunk => chunk.doc_id === "DOC-INTERNAL-ONLY")
    )),
    dataset_hashes_valid: Object.values(datasets).every(dataset => dataset.manifest.documents.every(document => (
      sha256File(path.join(dataset.datasetRoot, document.file)) === document.sha256
    )))
  },
  results
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`LOCAL_SIMULATION_WRITTEN=${outputPath}`);
console.log(`TASKS=${results.length} P0_FAILURES=${output.checks.p0_gate_failures} PREVIEW_MISSES=${output.checks.expected_source_preview_misses}`);
