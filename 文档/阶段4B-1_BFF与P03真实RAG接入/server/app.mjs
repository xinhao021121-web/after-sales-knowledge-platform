import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { assertDatasetConfig, loadConfig } from "./config.mjs";
import { loadCatalog } from "./catalog.mjs";
import {
  clarificationResponse,
  detectP0,
  missingContextFields,
  p0Response,
  validateAnswerInput,
  ValidationError
} from "./policy.mjs";
import { createDifyAdapter, ProviderError } from "./dify-adapter.mjs";
import { normalizeProviderAnswer, normalizeRetrievalResources } from "./normalize.mjs";
import { createStore, stableHash } from "./store.mjs";
import { createCostRecord } from "./cost.mjs";
import { createDifyDatasetAdapter } from "./dify-dataset-adapter.mjs";
import { createIngestionService } from "./ingestion-service.mjs";
import { createEvaluationService } from "./evaluation-service.mjs";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8"
};

function json(response, status, body, extraHeaders = {}) {
  const payload = `${JSON.stringify(body)}\n`;
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...extraHeaders
  });
  response.end(payload);
}

function errorBody(requestId, error) {
  return {
    error_code: error.code || "VALIDATION_ERROR",
    message: error.message || "Request failed",
    retryable: Boolean(error.retryable),
    request_id: requestId,
    provider_request_id: error.providerRequestId || null,
    details: error.details || {}
  };
}

function originAllowed(origin, request, config) {
  if (!origin) return true;
  if (config.allowedOrigins.includes(origin)) return true;
  const host = String(request.headers.host || "");
  return origin === `http://${host}`;
}

function corsHeaders(request, config) {
  const origin = String(request.headers.origin || "");
  return origin && originAllowed(origin, request, config)
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type,Idempotency-Key,X-Demo-Role",
        "Access-Control-Max-Age": "600",
        "Vary": "Origin"
      }
    : {};
}

async function readJson(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > 64 * 1024) throw new ValidationError("VALIDATION_ERROR", "请求体超过 64KB", 413);
    chunks.push(chunk);
  }
  if (!chunks.length) throw new ValidationError("VALIDATION_ERROR", "请求体不能为空");
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ValidationError("VALIDATION_ERROR", "请求体必须是有效 JSON");
  }
}

function validateIdempotencyKey(value) {
  const key = String(value || "").trim();
  if (key.length < 16 || key.length > 128) {
    throw new ValidationError("VALIDATION_ERROR", "Idempotency-Key 长度必须为 16-128", 422);
  }
  return key;
}

function requireRole(request, allowedRoles) {
  const role = String(request.headers["x-demo-role"] || "");
  if (!allowedRoles.includes(role)) {
    throw new ValidationError("FORBIDDEN_ROLE", "Current role cannot perform this action", 403);
  }
  return role;
}

function idempotencyResult({request, response, store, key, fingerprint}) {
  const saved = store.getIdempotent(key);
  if (saved) {
    if (saved.fingerprint !== fingerprint) {
      throw new ValidationError("DUPLICATE_REQUEST", "同一 Idempotency-Key 被用于不同请求", 409);
    }
    json(response, 200, {...saved.response, idempotency_replayed: true});
    return true;
  }
  return false;
}

function baseRequestMeta(body, requestId) {
  return {
    request_id: requestId,
    asq_id: body?.asq_id || null,
    role: body?.role || null,
    tenant_id: body?.tenant_id || null,
    environment: body?.environment || null
  };
}

function auditResponse(store, body, responseBody, action, requestId, result = "SUCCESS") {
  return store.audit({
    ...baseRequestMeta(body, requestId),
    action,
    result,
    answer_status: responseBody.answer_status || null,
    risk_level: responseBody.risk?.level || null,
    provider_called: responseBody.provider_called,
    provider_request_id: responseBody.provider_request_id || null,
    timing_ms: responseBody.timing_ms || 0,
    error_code: responseBody.error_code || null,
    cost: responseBody.cost || null,
    question: body?.question || null
  });
}

function serveStatic(request, response, config) {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);
  const pathname = decodeURIComponent(requestUrl.pathname);
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const firstSegment = relative.split("/")[0];
  if (
    relative.startsWith(".") ||
    ["server", "data", "tests", "screenshots", "output", "node_modules"].includes(firstSegment) ||
    /(?:^|\/)\.env(?:\.|$)/i.test(relative)
  ) {
    json(response, 404, {error_code: "DOCUMENT_NOT_FOUND", message: "Not found"});
    return;
  }
  const filePath = path.resolve(config.prototypeRoot, relative);
  if (!filePath.startsWith(`${config.prototypeRoot}${path.sep}`) && filePath !== config.prototypeRoot) {
    json(response, 403, {error_code: "FORBIDDEN_SCOPE", message: "Forbidden"});
    return;
  }
  if (!MIME[path.extname(filePath)]) {
    json(response, 404, {error_code: "DOCUMENT_NOT_FOUND", message: "Not found"});
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      json(response, 404, {error_code: "DOCUMENT_NOT_FOUND", message: "Not found"});
      return;
    }
    response.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath)],
      "Content-Length": data.length,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
    });
    response.end(data);
  });
}

function lazyDatasetAdapter(config) {
  let adapter = null;
  function getAdapter() {
    assertDatasetConfig(config);
    adapter ||= createDifyDatasetAdapter(config);
    return adapter;
  }
  return {
    async health() {
      try {
        return await getAdapter().health();
      } catch (error) {
        return {
          status: error.code === "DATASET_API_NOT_CONFIGURED" ? "not_configured" : "unavailable",
          error_code: error.code || "DATASET_PROVIDER_UNAVAILABLE"
        };
      }
    },
    createDocument(input) {
      return getAdapter().createDocument(input);
    },
    updateDocument(input) {
      return getAdapter().updateDocument(input);
    },
    getIndexingStatus(batchId) {
      return getAdapter().getIndexingStatus(batchId);
    },
    findDocumentByName(name) {
      return getAdapter().findDocumentByName(name);
    }
  };
}

export function createBffServer({
  prototypeRoot,
  configOverrides = {},
  adapter,
  datasetAdapter,
  config: suppliedConfig
} = {}) {
  const config = suppliedConfig || loadConfig(prototypeRoot, configOverrides);
  const catalog = loadCatalog(config.dataRoot);
  const store = createStore(config.runtimeRoot);
  const provider = adapter || createDifyAdapter(config);
  const datasetProvider = datasetAdapter || lazyDatasetAdapter(config);
  const ingestions = createIngestionService({
    config,
    store,
    adapter: datasetProvider
  });
  const evaluations = createEvaluationService({
    config,
    store,
    provider,
    catalog
  });

  const server = http.createServer(async (request, response) => {
    const requestId = crypto.randomUUID();
    const requestUrl = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);
    const cors = corsHeaders(request, config);
    let auditBody = null;
    if (request.headers.origin && !originAllowed(String(request.headers.origin), request, config)) {
      json(response, 403, {
        error_code: "FORBIDDEN_SCOPE",
        message: "Origin is not allowed",
        retryable: false,
        request_id: requestId,
        provider_request_id: null,
        details: {}
      });
      return;
    }
    if (request.method === "OPTIONS") {
      response.writeHead(204, cors);
      response.end();
      return;
    }

    try {
      if (request.method === "GET" && requestUrl.pathname === "/api/health") {
        const providerHealth = await provider.health();
        const datasetHealth = await datasetProvider.health();
        json(response, providerHealth.status === "ok" ? 200 : 503, {
          status: providerHealth.status,
          adapter_version: "4B2A-1.0.0",
          environment: config.environment,
          provider: {
            name: "Dify Cloud",
            version: providerHealth.provider.mode,
            mode: providerHealth.provider.mode
          },
          generation_model: config.generationModel,
          cost_status: "COST_UNKNOWN",
          dataset_id: config.datasetId,
          dataset_api: {
            status: datasetHealth.status,
            error_code: datasetHealth.error_code || null
          },
          p0_gate: "BFF_BEFORE_DIFY",
          provider_latency_ms: providerHealth.latency_ms,
          checked_at: new Date().toISOString()
        }, cors);
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/dataset/health") {
        requireRole(request, ["knowledge", "legal", "evaluation", "admin"]);
        const result = await datasetProvider.health();
        json(response, result.status === "ok" ? 200 : 503, result, cors);
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/candidate-documents") {
        requireRole(request, ["knowledge", "legal", "evaluation"]);
        json(response, 200, {
          dataset: "CANDIDATE",
          manifest_version: "1.0.0",
          documents: ingestions.listCandidateDocuments()
        }, cors);
        return;
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/ingestions") {
        const role = requireRole(request, ["knowledge", "legal"]);
        const key = validateIdempotencyKey(request.headers["idempotency-key"]);
        const body = await readJson(request);
        auditBody = body;
        const result = await ingestions.start({
          docId: String(body.doc_id || ""),
          srcId: String(body.src_id || ""),
          sourceVersion: String(body.source_version || "")
        }, key);
        store.audit({
          action: "创建真实入库任务",
          result: "ACCEPTED",
          role,
          doc_id: result.doc_id,
          ingestion_id: result.ingestion_id,
          provider_called: true
        });
        json(response, 202, result, cors);
        return;
      }

      const ingestionMatch = requestUrl.pathname.match(/^\/api\/ingestions\/([^/]+)$/);
      if (request.method === "GET" && ingestionMatch) {
        requireRole(request, ["knowledge", "legal", "evaluation", "supervisor"]);
        const result = await ingestions.poll(decodeURIComponent(ingestionMatch[1]));
        json(response, 200, result, cors);
        return;
      }

      const ingestionRetryMatch = requestUrl.pathname.match(/^\/api\/ingestions\/([^/]+)\/retry$/);
      if (request.method === "POST" && ingestionRetryMatch) {
        const role = requireRole(request, ["knowledge", "legal"]);
        const key = validateIdempotencyKey(request.headers["idempotency-key"]);
        const body = await readJson(request);
        auditBody = body;
        const responseKey = `ingestion-retry:${ingestionRetryMatch[1]}`;
        const fingerprint = stableHash({path: requestUrl.pathname, body});
        if (idempotencyResult({request, response, store, key: responseKey, fingerprint})) return;
        const result = await ingestions.retry(decodeURIComponent(ingestionRetryMatch[1]));
        store.remember(responseKey, fingerprint, result);
        store.audit({
          action: "重试真实入库任务",
          result: "ACCEPTED",
          role,
          ingestion_id: result.ingestion_id,
          provider_called: true
        });
        json(response, 202, result, cors);
        return;
      }

      if (request.method === "GET" && requestUrl.pathname === "/api/evaluations/meta") {
        requireRole(request, ["evaluation", "supervisor", "knowledge"]);
        json(response, 200, evaluations.getMetadata(), cors);
        return;
      }

      if (request.method === "POST" && requestUrl.pathname === "/api/evaluations") {
        const role = requireRole(request, ["evaluation"]);
        const key = validateIdempotencyKey(request.headers["idempotency-key"]);
        const body = await readJson(request);
        auditBody = body;
        const result = evaluations.start({
          taskScope: String(body.task_scope || "ALL_17"),
          model: String(body.model || config.generationModel)
        }, key);
        store.audit({
          action: "创建真实批量评测",
          result: "ACCEPTED",
          role,
          evaluation_id: result.run_id,
          provider_called: false
        });
        json(response, 202, result, cors);
        return;
      }

      const evaluationMatch = requestUrl.pathname.match(/^\/api\/evaluations\/([^/]+)$/);
      if (request.method === "GET" && evaluationMatch) {
        requireRole(request, ["evaluation", "supervisor", "knowledge"]);
        const result = evaluations.getRun(decodeURIComponent(evaluationMatch[1]));
        if (!result) {
          throw new ValidationError("EVALUATION_NOT_FOUND", "Evaluation run was not found", 404);
        }
        json(response, 200, result, cors);
        return;
      }

      if (!["/api/retrieval/search", "/api/answers"].includes(requestUrl.pathname)) {
        if (request.method === "GET") {
          serveStatic(request, response, config);
          return;
        }
        throw new ValidationError("DOCUMENT_NOT_FOUND", "API route not found", 404);
      }
      if (request.method !== "POST") throw new ValidationError("VALIDATION_ERROR", "Method not allowed", 405);

      const body = await readJson(request);
      auditBody = body;
      const key = validateIdempotencyKey(request.headers["idempotency-key"]);
      const normalizedInput = validateAnswerInput(body, request.headers, config);
      const fingerprint = stableHash({route: requestUrl.pathname, body});
      if (idempotencyResult({request, response, store, key, fingerprint})) {
        store.audit({
          ...baseRequestMeta(body, requestId),
          action: "幂等重放",
          result: "REPLAYED",
          provider_called: false,
          question: normalizedInput.question
        });
        return;
      }

      const missing = missingContextFields(normalizedInput);
      if (missing.length) {
        const result = clarificationResponse({request: normalizedInput, requestId, missing, model: config.generationModel});
        store.remember(key, fingerprint, result);
        result.audit_event_id = auditResponse(store, body, result, "上下文完整性检查", requestId, "NEED_CONTEXT");
        json(response, 200, result, cors);
        return;
      }

      if (detectP0(normalizedInput.question)) {
        const result = p0Response({catalog, request: normalizedInput, requestId, model: config.generationModel});
        store.remember(key, fingerprint, result);
        result.audit_event_id = auditResponse(store, body, result, "P0安全前置门禁", requestId, "BLOCKED");
        json(response, 200, result, cors);
        return;
      }

      if (requestUrl.pathname === "/api/retrieval/search") {
        const providerResult = await provider.search(normalizedInput);
        const normalized = normalizeRetrievalResources({
          resources: providerResult.resources,
          request: normalizedInput,
          catalog,
          retrievalTrace: providerResult.retrieval_trace || null
        });
        const result = {
          request_id: requestId,
          status: normalized.status,
          hits: normalized.hits,
          filters: normalized.filters,
          provider_request_id: providerResult.provider_request_id,
          provider_called: true,
          timing_ms: providerResult.timing_ms,
          error_code: normalized.status === "PERMISSION_DENIED"
            ? "FORBIDDEN_SCOPE"
            : normalized.status === "KNOWLEDGE_EXPIRED"
              ? "KNOWLEDGE_EXPIRED"
              : normalized.status === "NO_ANSWER"
                ? "NO_ANSWER"
                : null,
          source_mode: "REAL_RAG"
        };
        result.cost = createCostRecord({
          model: config.generationModel,
          raw: {metadata: {usage: providerResult.usage || {}}},
          timingMs: providerResult.timing_ms,
          answerStatus: normalized.status,
          citationSupportPassed: normalized.status === "ANSWERED",
          providerCalled: true
        });
        store.remember(key, fingerprint, result);
        result.audit_event_id = auditResponse(store, body, result, "真实知识检索", requestId);
        json(response, 200, result, cors);
        return;
      }

      const providerResult = await provider.answer(normalizedInput);
      const result = normalizeProviderAnswer({
        raw: providerResult.raw,
        request: normalizedInput,
        catalog,
        providerRequestId: providerResult.provider_request_id,
        timingMs: providerResult.timing_ms,
        model: config.generationModel
      });
      result.request_id = requestId;
      result.request_echo = {
        asq_id: normalizedInput.asq_id,
        knowledge_item_id: normalizedInput.knowledge_item_id
      };
      store.remember(key, fingerprint, result);
      result.audit_event_id = auditResponse(store, body, result, "真实RAG问答", requestId);
      json(response, 200, result, cors);
    } catch (error) {
      const isServiceError = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599;
      const status = error instanceof ValidationError || error instanceof ProviderError || isServiceError
        ? error.status
        : 500;
      const safeError = error instanceof ValidationError || error instanceof ProviderError || isServiceError
        ? error
        : new ValidationError("PROVIDER_UNAVAILABLE", "BFF internal error", 500);
      store.audit({
        ...baseRequestMeta(auditBody, requestId),
        action: "BFF请求",
        result: "ERROR",
        error_code: safeError.code,
        privacy_categories: safeError.details?.privacy_categories || [],
        redaction_applied: safeError.details?.redaction_applied === true,
        privacy_action: safeError.details?.privacy_action || null,
        question: auditBody?.question || null
      });
      json(response, status, errorBody(requestId, safeError), cors);
    }
  });

  return {server, config, catalog, store, provider};
}
