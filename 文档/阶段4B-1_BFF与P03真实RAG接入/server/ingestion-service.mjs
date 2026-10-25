import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ProviderError } from "./dify-adapter.mjs";
import { stableHash } from "./store.mjs";

const JOB_FILE = "ingestion-jobs.json";

function readManifest(config) {
  const manifest = JSON.parse(fs.readFileSync(config.candidateManifestPath, "utf8"));
  return {
    ...manifest,
    byDocId: new Map(manifest.documents.map(document => [document.doc_id, document]))
  };
}

function providerState(status) {
  const value = String(status || "").toLowerCase();
  if (["waiting", "queued", "pending"].includes(value)) return "QUEUED";
  if (value === "parsing") return "PARSING";
  if (["cleaning", "splitting"].includes(value)) return "CHUNKING";
  if (value === "indexing") return "INDEXING";
  if (["completed", "ready", "success"].includes(value)) return "READY";
  if (["error", "failed", "paused", "stopped"].includes(value)) return "FAILED";
  return "QUEUED";
}

function saveJob(store, job) {
  job.updated_at = new Date().toISOString();
  const jobs = store.readDocument(JOB_FILE, {jobs: {}, idempotency: {}});
  jobs.jobs[job.ingestion_id] = job;
  jobs.idempotency[job.idempotency_key] = job.ingestion_id;
  store.writeDocument(JOB_FILE, jobs);
}

function publicJob(job) {
  return {
    ingestion_id: job.ingestion_id,
    doc_id: job.doc_id,
    src_id: job.src_id,
    source_version: job.source_version,
    file_name: job.file_name,
    provider_file_name: job.provider_file_name,
    source_mode: job.source_mode,
    ingestion_mode: job.ingestion_mode,
    content_sha256: job.content_sha256,
    document_status: job.document_status,
    provider_status: job.provider_status,
    provider_batch_id: job.provider_batch_id,
    provider_document_id: job.provider_document_id,
    completed_segments: job.completed_segments,
    total_segments: job.total_segments,
    publishable: job.publishable === true,
    error_step: job.error_step || null,
    error_code: job.error_code || null,
    error_message: job.error_message || null,
    retryable: job.retryable === true,
    attempt: job.attempt,
    created_at: job.created_at,
    updated_at: job.updated_at
  };
}

export function createIngestionService({config, store, adapter}) {
  let manifest;

  function getManifest() {
    manifest ||= readManifest(config);
    return manifest;
  }

  function getJob(ingestionId) {
    const jobs = store.readDocument(JOB_FILE, {jobs: {}, idempotency: {}});
    return jobs.jobs[ingestionId] || null;
  }

  function getByIdempotencyKey(key) {
    const jobs = store.readDocument(JOB_FILE, {jobs: {}, idempotency: {}});
    const ingestionId = jobs.idempotency[key];
    return ingestionId ? jobs.jobs[ingestionId] || null : null;
  }

  function documentFile(document) {
    const relative = String(document.file || "").replaceAll("\\", "/");
    if (relative.includes("..") || !relative.startsWith("docs/")) {
      throw new ProviderError("DOCUMENT_SCOPE_VIOLATION", "Document path is outside the CANDIDATE dataset", {
        status: 403,
        retryable: false
      });
    }
    const filePath = path.resolve(config.candidateDatasetRoot, relative);
    const root = path.resolve(config.candidateDatasetRoot);
    if (!filePath.startsWith(`${root}${path.sep}`)) {
      throw new ProviderError("DOCUMENT_SCOPE_VIOLATION", "Document path is outside the CANDIDATE dataset", {
        status: 403,
        retryable: false
      });
    }
    const bytes = fs.readFileSync(filePath);
    const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    if (sha256 !== document.sha256) {
      throw new ProviderError("CANDIDATE_INTEGRITY_FAILED", "CANDIDATE document hash does not match the frozen manifest", {
        status: 409,
        retryable: false
      });
    }
    return {bytes, sha256, path: filePath};
  }

  async function dispatch(job, document, {retry = false} = {}) {
    const file = documentFile(document);
    try {
      const providerResult = retry && job.provider_document_id
        ? await adapter.updateDocument({
            documentId: job.provider_document_id,
            fileName: job.provider_file_name,
            bytes: file.bytes
          })
        : await adapter.createDocument({
            fileName: job.provider_file_name,
            bytes: file.bytes
          });
      job.provider_document_id = providerResult.document?.id || job.provider_document_id || null;
      job.provider_batch_id = providerResult.batch || job.provider_batch_id || null;
      job.provider_status = "QUEUED";
      job.document_status = "DOCUMENT_INDEXING";
      job.error_step = null;
      job.error_code = null;
      job.error_message = null;
      job.retryable = false;
      job.publishable = false;
      saveJob(store, job);
      return job;
    } catch (error) {
      job.document_status = "DOCUMENT_FAILED";
      job.provider_status = "FAILED";
      job.error_step = retry ? "UPDATE_DOCUMENT" : "CREATE_DOCUMENT";
      job.error_code = error.code || "DATASET_UPLOAD_FAILED";
      job.error_message = error.message || "Document upload failed";
      job.retryable = true;
      job.publishable = false;
      saveJob(store, job);
      error.details = {...(error.details || {}), ingestion_id: job.ingestion_id};
      throw error;
    }
  }

  return {
    listCandidateDocuments() {
      return getManifest().documents.map(document => ({
        doc_id: document.doc_id,
        title: document.title,
        file: document.file,
        version: document.version,
        src_ids: document.src_ids,
        owner_role: document.owner_role,
        sha256: document.sha256
      }));
    },
    async start({docId, srcId, sourceVersion}, idempotencyKey) {
      const existing = getByIdempotencyKey(idempotencyKey);
      const requestFingerprint = stableHash({docId, srcId, sourceVersion});
      if (existing) {
        if (existing.request_fingerprint !== requestFingerprint) {
          throw new ProviderError("DUPLICATE_REQUEST", "Same Idempotency-Key was used for a different ingestion request", {
            status: 409,
            retryable: false
          });
        }
        return publicJob(existing);
      }
      const document = getManifest().byDocId.get(docId);
      if (!document) {
        throw new ProviderError("DOCUMENT_NOT_IN_CANDIDATE", "Document is not in the frozen CANDIDATE manifest", {
          status: 422,
          retryable: false
        });
      }
      if (!document.src_ids.includes(srcId)) {
        throw new ProviderError("SOURCE_DOCUMENT_MISMATCH", "Source does not belong to this document", {
          status: 422,
          retryable: false
        });
      }
      if (sourceVersion !== document.version) {
        throw new ProviderError("SOURCE_VERSION_MISMATCH", "Source version does not match the frozen document", {
          status: 409,
          retryable: false
        });
      }
      const manifestFileName = document.file.split("/").at(-1);
      const extension = path.extname(manifestFileName);
      const stem = path.basename(manifestFileName, extension);
      const existingDocument = await adapter.findDocumentByName(manifestFileName);
      const now = new Date().toISOString();
      const job = {
        ingestion_id: `ING-${crypto.randomUUID()}`,
        idempotency_key: idempotencyKey,
        request_fingerprint: requestFingerprint,
        doc_id: document.doc_id,
        src_id: srcId,
        source_version: sourceVersion,
        file_name: manifestFileName,
        provider_file_name: existingDocument?.name || `${stem}__4B2A-CANDIDATE-v${document.version}${extension}`,
        source_mode: adapter.sourceMode === "TEST_ADAPTER" ? "TEST_ADAPTER" : "REAL_DIFY",
        ingestion_mode: existingDocument ? "UPDATE_EXISTING" : "CREATE_NEW",
        content_sha256: document.sha256,
        document_status: "DOCUMENT_UPLOADING",
        provider_status: "QUEUED",
        provider_batch_id: null,
        provider_document_id: existingDocument?.id || null,
        completed_segments: 0,
        total_segments: 0,
        publishable: false,
        error_step: null,
        error_code: null,
        error_message: null,
        retryable: false,
        attempt: 1,
        created_at: now,
        updated_at: now
      };
      saveJob(store, job);
      await dispatch(job, document, {retry: Boolean(existingDocument)});
      return publicJob(job);
    },
    async poll(ingestionId) {
      const job = getJob(ingestionId);
      if (!job) {
        throw new ProviderError("INGESTION_NOT_FOUND", "Ingestion job was not found", {
          status: 404,
          retryable: false
        });
      }
      if (!job.provider_batch_id) {
        throw new ProviderError("INGESTION_BATCH_MISSING", "Ingestion job has no provider batch", {
          status: 409,
          retryable: false
        });
      }
      try {
        const result = await adapter.getIndexingStatus(job.provider_batch_id);
        const rows = Array.isArray(result.data) ? result.data : [];
        const row = rows.find(item => item.id === job.provider_document_id) || rows[0] || {};
        job.provider_status = providerState(row.indexing_status);
        job.completed_segments = Number(row.completed_segments || 0);
        job.total_segments = Number(row.total_segments || 0);
        job.provider_document_id = row.id || job.provider_document_id;
        job.document_status = job.provider_status === "READY"
          ? "DOCUMENT_READY"
          : job.provider_status === "FAILED"
            ? "DOCUMENT_FAILED"
            : "DOCUMENT_INDEXING";
        job.publishable = job.provider_status === "READY";
        job.retryable = job.provider_status === "FAILED";
        job.error_step = job.provider_status === "FAILED" ? "PROVIDER_INDEXING" : null;
        job.error_code = job.provider_status === "FAILED" ? "INDEXING_FAILED" : null;
        job.error_message = row.error || null;
        saveJob(store, job);
        return publicJob(job);
      } catch (error) {
        job.document_status = "DOCUMENT_FAILED";
        job.error_step = "POLL_INDEXING_STATUS";
        job.error_code = error.code || "INDEXING_STATUS_FAILED";
        job.error_message = error.message || "Indexing status query failed";
        job.retryable = true;
        job.publishable = false;
        saveJob(store, job);
        error.details = {...(error.details || {}), ingestion_id: job.ingestion_id};
        throw error;
      }
    },
    async retry(ingestionId) {
      const job = getJob(ingestionId);
      if (!job) {
        throw new ProviderError("INGESTION_NOT_FOUND", "Ingestion job was not found", {
          status: 404,
          retryable: false
        });
      }
      if (!job.retryable || job.document_status !== "DOCUMENT_FAILED") {
        throw new ProviderError("INGESTION_NOT_RETRYABLE", "Only a failed ingestion can be retried", {
          status: 409,
          retryable: false
        });
      }
      const document = getManifest().byDocId.get(job.doc_id);
      if (!document) {
        throw new ProviderError("DOCUMENT_NOT_IN_CANDIDATE", "Document is no longer in the CANDIDATE manifest", {
          status: 422,
          retryable: false
        });
      }
      job.attempt += 1;
      job.document_status = "DOCUMENT_RETRYING";
      job.provider_status = "QUEUED";
      job.error_step = null;
      job.error_code = null;
      job.error_message = null;
      job.publishable = false;
      saveJob(store, job);
      await dispatch(job, document, {retry: true});
      return publicJob(job);
    }
  };
}
