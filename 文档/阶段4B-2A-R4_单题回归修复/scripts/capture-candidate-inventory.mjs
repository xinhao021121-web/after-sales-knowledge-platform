import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../../阶段4B-1_BFF与P03真实RAG接入/server/config.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..", "..", "..");
const config = loadConfig(path.join(projectRoot, "文档", "阶段3B_高保真交互原型"));
const manifest = JSON.parse(fs.readFileSync(config.candidateManifestPath, "utf8"));
const manifestByFile = new Map(manifest.documents.map(item => [path.basename(item.file), item]));
const response = await fetch(
  `${config.datasetBaseUrl}/datasets/${encodeURIComponent(config.datasetId)}/documents?page=1&limit=100`,
  {
    headers: {Authorization: `Bearer ${config.datasetApiKey}`},
    signal: AbortSignal.timeout(config.requestTimeoutMs)
  }
);
const text = await response.text();
if (!response.ok) throw new Error(`Dataset inventory failed: HTTP ${response.status} ${text.slice(0, 300)}`);
const body = JSON.parse(text);
const documents = (body.data || []).map(document => {
  const item = manifestByFile.get(document.name);
  return {
    document_id: document.id,
    document_name: document.name,
    logical_doc_id: item?.doc_id || null,
    canonical_file_name: item ? path.basename(item.file) : null,
    manifest_sha256: item?.sha256 || null,
    indexing_status: document.indexing_status,
    enabled: document.enabled === true,
    archived: document.archived === true,
    word_count: document.word_count ?? null,
    segment_count: document.segment_count ?? null
  };
});
const active = documents.filter(item => item.enabled && !item.archived && item.logical_doc_id);
const activeByDoc = new Map();
for (const document of active) {
  const values = activeByDoc.get(document.logical_doc_id) || [];
  values.push(document.document_name);
  activeByDoc.set(document.logical_doc_id, values);
}
const duplicates = [...activeByDoc.entries()]
  .filter(([, names]) => names.length > 1)
  .map(([docId, names]) => ({doc_id: docId, document_names: names}));
const inventory = {
  captured_at: new Date().toISOString(),
  source_mode: "REAL_DIFY_DATASET_API",
  dataset_id: config.datasetId,
  dataset_name: "CANDIDATE",
  active_document_count: active.length,
  logical_active_document_count: activeByDoc.size,
  duplicate_active_logical_documents: duplicates,
  documents
};
const outputPath = path.resolve(here, "..", "evidence", "candidate-inventory-after-r4.json");
fs.writeFileSync(outputPath, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
if (active.length !== 5 || activeByDoc.size !== 5 || duplicates.length > 0) {
  throw new Error(`Candidate inventory violates uniqueness: active=${active.length} logical=${activeByDoc.size}`);
}
console.log(JSON.stringify({
  outputPath,
  active_document_count: active.length,
  logical_active_document_count: activeByDoc.size,
  duplicate_active_logical_documents: duplicates.length
}, null, 2));
