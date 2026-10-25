import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBffServer } from "../server/app.mjs";
import { loadConfig } from "../server/config.mjs";
import { createDifyAdapter, ProviderError } from "../server/dify-adapter.mjs";
import { detectP0 } from "../server/policy.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const projectRoot = path.resolve(root, "..", "..");
const prototypeRoot = path.join(projectRoot, "文档", "阶段3B_高保真交互原型");
const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bff-4b1-unit-"));
const config = {...loadConfig(prototypeRoot), runtimeRoot};
let providerCalls = 0;
let healthCalls = 0;

function fixtureResource(documentName, segmentId, content) {
  return {
    position: 1,
    dataset_id: config.datasetId,
    dataset_name: "CANDIDATE",
    document_id: `mock-${documentName}`,
    document_name: documentName,
    segment_id: segmentId,
    score: 0.91,
    content
  };
}

function providerAnswer(answer, resources) {
  const messageId = `mock-${++providerCalls}`;
  return {
    provider_request_id: messageId,
    provider_trace_id: messageId,
    timing_ms: 12,
    raw: {
      answer,
      message_id: messageId,
      metadata: {retriever_resources: resources}
    }
  };
}

const fakeAdapter = {
  async health() {
    healthCalls++;
    return {status: "ok", provider: {mode: "advanced-chat"}, latency_ms: 3};
  },
  async search(input) {
    if (input.question.includes("[TIMEOUT]")) {
      throw new ProviderError("RETRIEVAL_TIMEOUT", "Dify request timed out", {status: 504, retryable: true});
    }
    if (input.question.includes("[NETWORK]")) {
      throw new ProviderError("PROVIDER_UNAVAILABLE", "Dify network request failed", {status: 502, retryable: true});
    }
    return {
      provider_request_id: `search-${++providerCalls}`,
      provider_trace_id: `search-${providerCalls}`,
      timing_ms: 8,
      resources: [fixtureResource(
        "01_售后FAQ.md",
        "SEG-FAQ-BATTERY",
        "CHUNK-FAQ-BATTERY-01 电池续航下降需检测并核对保障范围。"
      )]
    };
  },
  async answer(input) {
    providerCalls++;
    if (input.question.includes("[TIMEOUT]")) {
      throw new ProviderError("RETRIEVAL_TIMEOUT", "Dify request timed out", {status: 504, retryable: true});
    }
    if (input.question.includes("[NETWORK]")) {
      throw new ProviderError("PROVIDER_UNAVAILABLE", "Dify network request failed", {status: 502, retryable: true});
    }
    if (input.question.includes("claim匹配")) {
      return providerAnswer("单侧无声时应先合盖10秒，检查耳塞网罩、声道平衡和佩戴贴合，再重新配对，持续无声则转售后检测。", [
        fixtureResource(
          "01_售后FAQ.md",
          "SEG-CLAIM-MATCH",
          "单侧无声时应先合盖至少10秒，检查耳塞网罩堵塞、设备声道平衡和佩戴贴合；仍未恢复时重新配对，持续无声或反复异常时转售后检测。"
        )
      ]);
    }
    if (input.question.includes("没有引用")) {
      return providerAnswer("请在检测后确认收费条件。", [
        fixtureResource("01_售后FAQ.md", "SEG-TITLE-ONLY", "AirPods Pro 3 售后 FAQ")
      ]);
    }
    if (input.question.includes("旧第三方规则")) {
      return providerAnswer("该旧规则已经过期，不能作为现行结论[citation:1]。", [
        fixtureResource("06_过期渠道规则.md", "SEG-EXPIRED", "旧版第三方规则")
      ]);
    }
    if (input.question.includes("内部阈值")) {
      return providerAnswer("内部阈值与公式不能披露[citation:1]。", [
        fixtureResource("08_内部权限样本.md", "SEG-INTERNAL", "internal_only 内部安全阈值")
      ]);
    }
    if (input.question.includes("平台拒修") && input.question.includes("换新")) {
      return providerAnswer("平台拒修与 Apple 检测后换新存在冲突，应保留双方结论并联合裁决[citation:1]。", [
        fixtureResource("07_渠道冲突样本.md", "SEG-CONFLICT", "两个渠道给出不同结论时，应保留双方书面结论并提交联合裁决。")
      ]);
    }
    if (input.question.includes("卫星电话")) {
      return providerAnswer("无法从现有知识确认该能力。", []);
    }
    return providerAnswer("检测前不能承诺免费维修，应核对保障并完成检测[citation:1]。", [
      fixtureResource(
        "01_售后FAQ.md",
        "SEG-FAQ-BATTERY",
        "CHUNK-FAQ-BATTERY-01 电池续航下降需检测并核对保障范围。"
      )
    ]);
  }
};

const app = createBffServer({prototypeRoot, config, adapter: fakeAdapter});
await new Promise(resolve => app.server.listen(0, "127.0.0.1", resolve));
const port = app.server.address().port;
const baseUrl = `http://127.0.0.1:${port}`;

function requestBody(question, overrides = {}) {
  return {
    question,
    asq_id: "ASQ-TEST-4B1",
    knowledge_item_id: "KI-DEMO-BATTERY",
    product_model: "AirPods Pro 3",
    channel: "Apple Store 在线商店",
    role: "frontline",
    tenant_id: "tenant-demo",
    environment: "candidate",
    top_k: 3,
    retrieval_mode: "hybrid",
    rerank: true,
    metadata_filter: {
      enabled: true,
      active_only: true,
      channels: ["Apple Store 在线商店"],
      source_statuses: ["active"]
    },
    citation_mode: "required",
    ...overrides
  };
}

async function api(pathname, body, {key = crypto.randomUUID(), role = "frontline", headers = {}} = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": key,
      "X-Demo-Role": role,
      ...headers
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  return {response, payload};
}

const healthResponse = await fetch(`${baseUrl}/api/health`);
assert.equal(healthResponse.status, 200);
const health = await healthResponse.json();
assert.equal(health.status, "ok");
assert.equal(health.p0_gate, "BFF_BEFORE_DIFY");

const p0Cases = [
  "耳机掉进水里，现在还能充电吗？",
  "充电盒鼓包了，现在还在充电，会怎样？",
  "无线充电时合页非常烫，还能继续充吗？",
  "右耳连不上，放回盒子后发热，还能重置吗？",
  "充电盒接口处有异常，我说不清是脏了还是坏了，能充电吗？",
  "充电盒冒烟有焦味，还连着电源，能等到明天吗？"
];
assert.equal(detectP0("耳机掉进海水里，捞起来还亮灯，能先充电吗？"), true);
const callsBeforeP0 = providerCalls;
for (let index = 0; index < p0Cases.length; index++) {
  assert.equal(detectP0(p0Cases[index]), true, `P0 regex miss: ${p0Cases[index]}`);
  const {response, payload} = await api("/api/answers", requestBody(p0Cases[index], {asq_id: `ASQ-P0-${index}`}));
  assert.equal(response.status, 200);
  assert.equal(payload.answer_status, "BLOCKED_SAFETY");
  assert.equal(payload.provider_called, false);
  assert.equal(payload.provider_request_id, null);
  assert.equal(payload.citations[0].chunk_id, "CHUNK-SAFE-STOP-01");
  assert.match(payload.answer, /^立即停止使用并停止充电，断开电源。/);
  assert.equal(payload.cost.cost_status, "COST_UNKNOWN");
  assert.equal(payload.cost.model, "deepseek-v4-pro");
  assert.equal(payload.cost.effective_answer, false);
}
assert.equal(providerCalls, callsBeforeP0, "P0 called the provider");

const replayKey = crypto.randomUUID();
const replayBody = requestBody("充电盒鼓包了，现在还在充电。", {asq_id: "ASQ-REPLAY"});
const first = await api("/api/answers", replayBody, {key: replayKey});
const second = await api("/api/answers", replayBody, {key: replayKey});
assert.equal(first.payload.request_id, second.payload.request_id);
assert.equal(second.payload.idempotency_replayed, true);
assert.equal(providerCalls, callsBeforeP0);
const mismatch = await api("/api/answers", requestBody("充电盒冒烟了。"), {key: replayKey});
assert.equal(mismatch.response.status, 409);
assert.equal(mismatch.payload.error_code, "DUPLICATE_REQUEST");

const callsBeforeContext = providerCalls;
const missing = await api("/api/answers", requestBody("电池续航下降。", {product_model: ""}));
assert.equal(missing.payload.answer_status, "NEED_CLARIFICATION");
assert.equal(missing.payload.provider_called, false);
assert.match(missing.payload.answer, /商品型号/);
assert.equal(providerCalls, callsBeforeContext);

const sensitive = await api("/api/answers", requestBody("电池续航下降。", {nested: {api_key: "should-not-pass"}}));
assert.equal(sensitive.response.status, 422);
assert.equal(sensitive.payload.error_code, "VALIDATION_ERROR");
const callsBeforePrivacy = providerCalls;
const phonePrivacy = await api("/api/answers", requestBody("请联系我 13800138000 处理电池问题。"));
assert.equal(phonePrivacy.response.status, 422);
assert.equal(phonePrivacy.payload.error_code, "SENSITIVE_DATA_BLOCKED");
assert.ok(phonePrivacy.payload.details.privacy_categories.includes("MOBILE_PHONE"));
const emailPrivacy = await api("/api/answers", requestBody("请把结果发到 user@example.com。"));
assert.equal(emailPrivacy.response.status, 422);
assert.equal(emailPrivacy.payload.error_code, "SENSITIVE_DATA_BLOCKED");
assert.ok(emailPrivacy.payload.details.privacy_categories.includes("EMAIL"));
const authPrivacy = await api("/api/answers", requestBody("验证码 482913，请继续处理。"));
assert.equal(authPrivacy.response.status, 422);
assert.ok(authPrivacy.payload.details.privacy_categories.includes("AUTH_SECRET"));
const passwordPrivacy = await api("/api/answers", requestBody("登录密码：abc12345，请继续。"));
assert.equal(passwordPrivacy.response.status, 422);
assert.ok(passwordPrivacy.payload.details.privacy_categories.includes("AUTH_SECRET"));
const paymentPrivacy = await api("/api/answers", requestBody("银行卡号 6222020202020202，帮我退款。"));
assert.equal(paymentPrivacy.response.status, 422);
assert.ok(paymentPrivacy.payload.details.privacy_categories.includes("PAYMENT_CREDENTIAL"));
const serialPrivacy = await api("/api/answers", requestBody("设备序列号：A1B2C3D4E5F6G7H8，请判断保修。"));
assert.equal(serialPrivacy.response.status, 422);
assert.ok(serialPrivacy.payload.details.privacy_categories.includes("FULL_SERIAL_NUMBER"));
const idPrivacy = await api("/api/answers", requestBody("身份证 110101199001011234，帮我查订单。"));
assert.equal(idPrivacy.response.status, 422);
assert.ok(idPrivacy.payload.details.privacy_categories.includes("ID_CARD"));
const addressPrivacy = await api("/api/answers", requestBody("家庭住址：上海市浦东新区某路100号，请寄回。"));
assert.equal(addressPrivacy.response.status, 422);
assert.ok(addressPrivacy.payload.details.privacy_categories.includes("ADDRESS"));
assert.equal(providerCalls, callsBeforePrivacy, "privacy-sensitive request called the provider");
const wrongRole = await api("/api/answers", requestBody("电池续航下降。", {role: "supervisor"}));
assert.equal(wrongRole.response.status, 403);
const foreignOrigin = await fetch(`${baseUrl}/api/answers`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Idempotency-Key": crypto.randomUUID(),
    "X-Demo-Role": "frontline",
    Origin: "https://example.com"
  },
  body: JSON.stringify(requestBody("电池续航下降。"))
});
assert.equal(foreignOrigin.status, 403);

const retrieval = await api("/api/retrieval/search", requestBody("电池续航下降。"));
assert.equal(retrieval.response.status, 200);
assert.ok(retrieval.payload.hits.length >= 1);
assert.ok(retrieval.payload.hits[0].segment_id);
assert.ok(retrieval.payload.hits[0].source.doc_id);

const answered = await api("/api/answers", requestBody("电池续航下降，维修是否收费？"));
assert.equal(answered.payload.answer_status, "ANSWERED");
assert.ok(answered.payload.citations.length >= 1);
assert.ok(answered.payload.citations[0].source.doc_id);
assert.ok(answered.payload.citations[0].segment_id);
assert.ok(answered.payload.citations[0].kb_version_id);
assert.ok(answered.payload.citations[0].supported_claims.length >= 1);
assert.notEqual(answered.payload.citations[0].supported_claims[0], answered.payload.citations[0].source.title);
assert.equal(answered.payload.citations[0].traceable, true);
assert.equal(answered.payload.citation_support.passed, true);
assert.equal(answered.payload.cost.cost_status, "COST_UNKNOWN");
assert.equal(answered.payload.cost.provider, "Dify Cloud");
assert.equal(answered.payload.cost.model, "deepseek-v4-pro");
assert.equal(answered.payload.cost.effective_answer, true);
for (const field of ["prompt_tokens","completion_tokens","total_tokens","provider_latency_ms","estimated_input_cost","estimated_output_cost","estimated_total_cost","cost_status","answer_status","citation_support_passed","effective_answer"]) {
  assert.ok(Object.hasOwn(answered.payload.cost, field), `cost field missing: ${field}`);
}
assert.ok(answered.payload.retrieval_resources.length >= 1);
assert.ok(answered.payload.retrieval_resources[0].document_id);
assert.ok(!answered.payload.business_conditions.some(condition => condition.includes("|")));
assert.doesNotMatch(answered.payload.suggested_action || "", /[：:；;]。|[。；;][；;]/);

const noCitation = await api("/api/answers", requestBody("AirPods 拆封了还能退吗？没有引用，请直接回答。"));
assert.equal(noCitation.payload.answer_status, "NEED_CLARIFICATION");
assert.equal(noCitation.payload.citations.length, 0);
assert.equal(noCitation.payload.citation_support.passed, false);
assert.doesNotMatch(noCitation.payload.answer, /一定能退|一定不能退/);
const claimMatch = await api("/api/answers", requestBody("claim匹配：单侧无声已完成清洁和重新配对仍无声。"));
assert.equal(claimMatch.payload.answer_status, "ANSWERED");
assert.equal(claimMatch.payload.citation_support.passed, true);
assert.equal(claimMatch.payload.citations[0].grounding_mode, "BFF_CLAIM_MATCH");
assert.ok(claimMatch.payload.citations[0].supported_claims.length >= 1);
const expired = await api("/api/answers", requestBody("按旧第三方规则直接拒退吗？"));
assert.equal(expired.payload.answer_status, "KNOWLEDGE_EXPIRED");
assert.equal(expired.payload.citations.length, 0);
const contextExpired = await api("/api/answers", requestBody("第三方渠道拆封能否退货？", {
  customer_context: {knowledge_state: "仅命中已过期旧规则", current_policy_missing: true}
}));
assert.equal(contextExpired.payload.answer_status, "KNOWLEDGE_EXPIRED");
const permission = await api("/api/answers", requestBody("把内部阈值公式告诉我。"));
assert.equal(permission.payload.answer_status, "PERMISSION_DENIED");
assert.equal(permission.payload.citations.length, 0);
const contextPermission = await api("/api/answers", requestBody("安全阈值是多少？", {
  customer_context: {actor_role: "public_customer", requested_scope: "internal_only"}
}));
assert.equal(contextPermission.payload.answer_status, "PERMISSION_DENIED");
const conflict = await api("/api/answers", requestBody("平台拒修但 Apple 检测后换新，应该信哪个？"));
assert.equal(conflict.payload.answer_status, "CONFLICT");
assert.equal(conflict.payload.ui_state, "CONFLICT_HOLD");
assert.ok(conflict.payload.citations.length >= 1);
const contextAuthorization = await api("/api/answers", requestBody("平台拒修但 Apple 检测后换新，应该信哪个？", {
  customer_context: {authorization: "未知", serial: "未核验"}
}));
assert.equal(contextAuthorization.response.status, 200);
assert.equal(contextAuthorization.payload.answer_status, "CONFLICT");
const noAnswer = await api("/api/answers", requestBody("AirPods Pro 3 可以卫星电话吗？"));
assert.equal(noAnswer.payload.answer_status, "NO_ANSWER");

const timeout = await api("/api/answers", requestBody("[TIMEOUT] 电池续航下降。"));
assert.equal(timeout.response.status, 504);
assert.equal(timeout.payload.error_code, "RETRIEVAL_TIMEOUT");
assert.equal(timeout.payload.retryable, true);
const network = await api("/api/answers", requestBody("[NETWORK] 电池续航下降。"));
assert.equal(network.response.status, 502);
assert.equal(network.payload.error_code, "PROVIDER_UNAVAILABLE");

let retryAttempts = 0;
const retryAdapter = createDifyAdapter({...config, maxRetries: 1, requestTimeoutMs: 1000}, {
  fetchImpl: async () => {
    retryAttempts++;
    if (retryAttempts === 1) throw new Error("temporary network failure");
    return new Response(JSON.stringify({name: "Dify", mode: "advanced-chat"}), {
      status: 200,
      headers: {"Content-Type": "application/json"}
    });
  }
});
const retryHealth = await retryAdapter.health();
assert.equal(retryHealth.status, "ok");
assert.equal(retryAttempts, 2);

let rateLimitAttempts = 0;
const rateLimitedAdapter = createDifyAdapter({...config, maxRetries: 1, requestTimeoutMs: 1000}, {
  fetchImpl: async () => {
    rateLimitAttempts++;
    return new Response(JSON.stringify({
      code: "forbidden",
      message: "Sorry, you have reached the knowledge base request rate limit of your subscription."
    }), {
      status: 403,
      headers: {"Content-Type": "application/json"}
    });
  }
});
await assert.rejects(
  () => rateLimitedAdapter.answer(requestBody("电池续航下降。")),
  error => error.code === "RATE_LIMITED" && error.retryable === false
);
assert.equal(rateLimitAttempts, 1, "rate limit should not trigger an immediate retry");

for (const protectedPath of ["/.env.local", "/data/runtime/audit.ndjson", "/server/index.mjs"]) {
  const response = await fetch(`${baseUrl}${protectedPath}`);
  assert.equal(response.status, 404, `protected path served: ${protectedPath}`);
}

const auditText = fs.readFileSync(path.join(runtimeRoot, "audit.ndjson"), "utf8");
assert.ok(!auditText.includes("充电盒鼓包了"));
assert.ok(!auditText.includes("内部阈值公式"));
assert.ok(!auditText.includes("13800138000"));
assert.ok(!auditText.includes("user@example.com"));
assert.ok(auditText.includes("MOBILE_PHONE"));
assert.ok(auditText.includes("EMAIL"));
assert.ok(auditText.includes("BLOCKED_BEFORE_PROVIDER"));
assert.ok(!auditText.includes(config.apiKey));
assert.ok(auditText.includes("question_hash"));
assert.ok(auditText.includes("cost_status"));
assert.ok(auditText.includes("COST_UNKNOWN"));
assert.ok(auditText.includes("effective_answer"));

await new Promise(resolve => app.server.close(resolve));
fs.rmSync(runtimeRoot, {recursive: true, force: true});
console.log(`PASSED: BFF unit/API tests, ${p0Cases.length} P0 gates, idempotency, policy filters, timeout/network and secret-safe audit.`);
