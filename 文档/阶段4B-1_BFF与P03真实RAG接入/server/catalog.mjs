import fs from "node:fs";
import path from "node:path";

export function loadCatalog(dataRoot) {
  const catalog = JSON.parse(fs.readFileSync(path.join(dataRoot, "catalog.json"), "utf8"));
  const byFileName = new Map(catalog.documents.map(document => [document.file_name, document]));
  const byDocId = new Map(catalog.documents.map(document => [document.doc_id, document]));
  return {
    ...catalog,
    byFileName,
    byDocId
  };
}

export function catalogDocumentForResource(catalog, resource) {
  if (resource.document_id && catalog.byDocId.has(resource.document_id)) {
    return catalog.byDocId.get(resource.document_id);
  }
  const documentName = String(resource.document_name || "");
  const exact = catalog.byFileName.get(documentName);
  if (exact) return exact;
  const stageCopyName = documentName.replace(
    /__4B2A-CANDIDATE-v[^_]+(?=\.[^.]+$)/,
    ""
  );
  return stageCopyName !== documentName
    ? catalog.byFileName.get(stageCopyName) || null
    : null;
}

export function isExpired(document, now = new Date("2026-10-24T00:00:00+08:00")) {
  if (!document?.valid_until || !/^\d{4}-\d{2}-\d{2}$/.test(document.valid_until)) return false;
  return document.valid_until < now.toISOString().slice(0, 10);
}

export function isInternalOnly(document) {
  return document?.permission_scope === "internal_only";
}

export function publicSource(document, segmentId) {
  return {
    src_id: document.src_id,
    doc_id: document.doc_id,
    version: document.version,
    title: document.title,
    url: document.url || null,
    verified_at: document.verified_at,
    valid_until: document.valid_until,
    status: document.status,
    segment_id: segmentId
  };
}

export function safetyCitation(catalog) {
  const chunk = catalog.safety_chunk;
  return {
    citation_id: "BFF-SAFETY-CHUNK-SAFE-STOP-01",
    source: {
      src_id: chunk.src_id,
      doc_id: chunk.doc_id,
      version: chunk.version,
      title: chunk.title,
      url: chunk.url,
      verified_at: chunk.verified_at,
      valid_until: chunk.valid_until,
      status: chunk.status,
      segment_id: chunk.chunk_id
    },
    kb_id: chunk.kb_id,
    kb_version_id: chunk.version,
    chunk_id: chunk.chunk_id,
    segment_id: chunk.chunk_id,
    supported_claims: ["安全信号下必须先停止使用、停止充电、隔离危险并提示应急条件"],
    claim_support_status: "SUPPORTED",
    traceable: true
  };
}
