import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const contract = JSON.parse(fs.readFileSync(path.join(root, "contracts", "rag-adapter.openapi.json"), "utf8"));
const fixtures = JSON.parse(fs.readFileSync(path.join(root, "contracts", "fixtures", "normalized-response-examples.json"), "utf8"));

const requiredPaths = [
  "/health",
  "/datasets",
  "/datasets/{dataset_id}",
  "/documents",
  "/ingestions",
  "/ingestions/{job_id}",
  "/retrieval/search",
  "/answers",
  "/environments/{environment}/activate"
];
for (const requiredPath of requiredPaths) assert.ok(contract.paths[requiredPath], `missing API path ${requiredPath}`);
assert.ok(contract.components.schemas.RetrievalHit, "RetrievalHit schema missing");
assert.ok(contract.components.schemas.ErrorResponse, "ErrorResponse schema missing");
assert.deepEqual(contract.components.schemas.Environment.enum, ["test", "candidate", "production"]);
assert.ok(contract.components.parameters.IdempotencyKey, "Idempotency-Key missing");

const statuses = new Set(["ANSWERED", "NO_ANSWER", "NEED_CLARIFICATION", "BLOCKED_SAFETY", "CONFLICT", "PERMISSION_DENIED", "KNOWLEDGE_EXPIRED"]);
for (const response of fixtures.responses) {
  assert.ok(statuses.has(response.answer_status), `unknown answer status ${response.answer_status}`);
  assert.ok(response.request_id, "response request_id missing");
  assert.ok(response.risk, "risk block missing");
  assert.equal(typeof response.risk.p0_triggered, "boolean");
  for (const citation of response.citations) {
    assert.ok(citation.source.src_id && citation.source.doc_id && citation.source.version, "normalized citation source incomplete");
    assert.ok(citation.supported_claims.length > 0, "citation must support at least one claim");
  }
  if (response.answer_status === "BLOCKED_SAFETY") {
    assert.equal(response.risk.p0_triggered, true, "P0 fixture must mark p0_triggered");
    assert.match(response.answer, /停止|断开|远离/);
  }
}

assert.match(fixtures.fixture_notice, /SYNTHETIC.*NOT PROVIDER RESULTS/);
console.log(`PASSED: provider-independent contract with ${requiredPaths.length} endpoints and ${fixtures.responses.length} normalized response fixtures.`);
