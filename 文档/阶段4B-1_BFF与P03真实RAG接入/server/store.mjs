import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

function atomicWrite(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

export function stableHash(value) {
  function normalize(input) {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === "object") {
      return Object.fromEntries(Object.keys(input).sort().map(key => [key, normalize(input[key])]));
    }
    return input;
  }
  return crypto.createHash("sha256").update(JSON.stringify(normalize(value))).digest("hex");
}

export function createStore(runtimeRoot) {
  fs.mkdirSync(runtimeRoot, {recursive: true});
  const idempotencyPath = path.join(runtimeRoot, "idempotency.json");
  const auditPath = path.join(runtimeRoot, "audit.ndjson");
  let entries = {};
  if (fs.existsSync(idempotencyPath)) {
    try { entries = JSON.parse(fs.readFileSync(idempotencyPath, "utf8")); } catch { entries = {}; }
  }

  function saveEntries() {
    atomicWrite(idempotencyPath, entries);
  }

  function readDocument(name, fallback) {
    const filePath = path.join(runtimeRoot, name);
    if (!fs.existsSync(filePath)) return structuredClone(fallback);
    try {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch {
      return structuredClone(fallback);
    }
  }

  function writeDocument(name, value) {
    atomicWrite(path.join(runtimeRoot, name), value);
  }

  return {
    getIdempotent(key) {
      return entries[key] || null;
    },
    remember(key, fingerprint, response) {
      entries[key] = {
        fingerprint,
        response,
        stored_at: new Date().toISOString()
      };
      saveEntries();
    },
    audit(event) {
      const safeEvent = {
        event_id: crypto.randomUUID(),
        at: new Date().toISOString(),
        action: event.action,
        request_id: event.request_id,
        asq_id: event.asq_id || null,
        role: event.role || null,
        tenant_id: event.tenant_id || null,
        environment: event.environment || null,
        result: event.result,
        answer_status: event.answer_status || null,
        risk_level: event.risk_level || null,
        provider_called: Boolean(event.provider_called),
        provider_request_id: event.provider_request_id || null,
        timing_ms: Number(event.timing_ms || 0),
        error_code: event.error_code || null,
        provider: event.cost?.provider || null,
        model: event.cost?.model || null,
        prompt_tokens: event.cost?.prompt_tokens ?? null,
        completion_tokens: event.cost?.completion_tokens ?? null,
        total_tokens: event.cost?.total_tokens ?? null,
        provider_latency_ms: event.cost?.provider_latency_ms ?? null,
        estimated_input_cost: event.cost?.estimated_input_cost ?? null,
        estimated_output_cost: event.cost?.estimated_output_cost ?? null,
        estimated_total_cost: event.cost?.estimated_total_cost ?? null,
        cost_status: event.cost?.cost_status || "COST_UNKNOWN",
        effective_answer: event.cost?.effective_answer === true,
        privacy_categories: Array.isArray(event.privacy_categories) ? event.privacy_categories : [],
        redaction_applied: Boolean(event.redaction_applied),
        privacy_action: event.privacy_action || null,
        question_hash: event.question ? stableHash(event.question) : null,
        question_length: event.question ? event.question.length : 0
      };
      fs.appendFileSync(auditPath, `${JSON.stringify(safeEvent)}\n`, "utf8");
      return safeEvent.event_id;
    },
    readDocument,
    writeDocument
  };
}
