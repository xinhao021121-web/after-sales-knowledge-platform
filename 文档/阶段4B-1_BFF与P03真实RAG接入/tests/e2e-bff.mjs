import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { chromium } from "file:///C:/Users/%E6%9D%8E%E6%98%95%E6%98%8A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
import { createBffServer } from "../server/app.mjs";
import { loadConfig } from "../server/config.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const projectRoot = path.resolve(root, "..", "..");
const prototypeRoot = path.join(projectRoot, "文档", "阶段3B_高保真交互原型");
const updateExamples = process.argv.includes("--update-examples");
const runtimeOutputRoot = path.join(prototypeRoot, "data", "runtime", "stage4b1-e2e");
const screenshotRoot = updateExamples
  ? path.join(root, "screenshots")
  : path.join(runtimeOutputRoot, "screenshots");
const exampleRoot = path.join(root, "examples");
const outputRoot = updateExamples ? exampleRoot : runtimeOutputRoot;
const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bff-4b1-e2e-"));
fs.mkdirSync(screenshotRoot, {recursive: true});
fs.mkdirSync(outputRoot, {recursive: true});

const config = {...loadConfig(prototypeRoot), runtimeRoot};
const app = createBffServer({prototypeRoot, config});
await new Promise(resolve => app.server.listen(0, "127.0.0.1", resolve));
const port = app.server.address().port;
const baseUrl = `http://127.0.0.1:${port}`;

function requestBody(question, overrides = {}) {
  return {
    question,
    asq_id: "ASQ-4B1-E2E",
    knowledge_item_id: "KI-DEMO-AFTERSALES",
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

async function post(pathname, body) {
  const started = performance.now();
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
      "X-Demo-Role": "frontline"
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  return {status: response.status, payload, wall_ms: Math.round(performance.now() - started)};
}

const healthResponse = await fetch(`${baseUrl}/api/health`);
assert.equal(healthResponse.status, 200);
const health = await healthResponse.json();
assert.equal(health.status, "ok");
assert.equal(health.provider.mode, "advanced-chat");
assert.equal(health.generation_model, "deepseek-v4-pro");
fs.writeFileSync(path.join(outputRoot, "health.json"), `${JSON.stringify(health, null, 2)}\n`, "utf8");

const retrievalRequest = requestBody("AirPods Pro 3 电池续航下降，保修期内维修要收费吗？", {
  asq_id: "ASQ-4B1-RETRIEVAL"
});
const retrieval = await post("/api/retrieval/search", retrievalRequest);
assert.equal(retrieval.status, 200);
assert.ok(retrieval.payload.hits.length >= 1, "real retrieval returned no hits");
assert.ok(retrieval.payload.hits.every(hit => hit.source?.doc_id && hit.segment_id && hit.kb_version_id));
fs.writeFileSync(path.join(outputRoot, "retrieval-search.json"), `${JSON.stringify({
  notice: "真实本地 BFF → Dify Cloud 检索请求样例；不包含密钥。",
  request: retrievalRequest,
  response: retrieval.payload,
  wall_ms: retrieval.wall_ms
}, null, 2)}\n`, "utf8");

const p0Questions = [
  ["POC-S01", "耳机掉进水里，现在还能充电吗？"],
  ["POC-S02", "充电盒鼓包了，现在还在充电，会怎样？"],
  ["POC-S03", "无线充电时合页非常烫，还能继续充吗？"],
  ["POC-S04", "右耳连不上，放回盒子后发热，还能重置吗？"],
  ["POC-K03", "充电盒接口处有异常，我说不清是脏了还是坏了，能充电吗？"],
  ["POC-E05", "充电盒冒烟有焦味，还连着电源，能等到明天吗？"]
];
const p0Results = [];
for (const [sampleId, question] of p0Questions) {
  const result = await post("/api/answers", requestBody(question, {asq_id: `ASQ-4B1-${sampleId}`}));
  assert.equal(result.status, 200);
  assert.equal(result.payload.answer_status, "BLOCKED_SAFETY");
  assert.equal(result.payload.provider_called, false);
  assert.equal(result.payload.provider_request_id, null);
  assert.equal(result.payload.citations[0].chunk_id, "CHUNK-SAFE-STOP-01");
  assert.match(result.payload.answer, /^立即停止使用并停止充电，断开电源。/);
  assert.equal(result.payload.cost.model, "deepseek-v4-pro");
  assert.equal(result.payload.cost.cost_status, "COST_UNKNOWN");
  assert.equal(result.payload.cost.effective_answer, false);
  p0Results.push({sample_id: sampleId, request: question, response: result.payload, wall_ms: result.wall_ms});
}
fs.writeFileSync(path.join(outputRoot, "p0-baseline-verification.json"), `${JSON.stringify({
  notice: "六条已确认P0基线的真实BFF门禁结果；provider_called=false。",
  checked_at: new Date().toISOString(),
  results: p0Results
}, null, 2)}\n`, "utf8");

const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true
});
const context = await browser.newContext({viewport: {width: 1440, height: 1100}, deviceScaleFactor: 1});
const page = await context.newPage();
const browserErrors = [];
page.on("pageerror", error => browserErrors.push(error.message));
page.on("console", message => {
  if (message.type() === "error" && !message.text().includes("status of 422")) browserErrors.push(message.text());
});

await page.goto(`${baseUrl}/index.html#P02`, {waitUntil: "networkidle"});
await page.locator("[data-action='create-asq']").click();
await page.locator("#p03-source-mode").waitFor();
await page.selectOption("#p03-source-mode", "real");
await page.locator("#p03-real-rag-form").waitFor();
await page.fill("#p03-real-rag-form textarea[name='question']", "AirPods Pro 3 两只耳机已放回充电盒合盖10秒，也已完成清洁、声道平衡检查、佩戴贴合和重新配对，但仍只有一侧无声，应该转售后检测吗？");
await page.fill("#p03-real-rag-form input[name='productModel']", "AirPods Pro 3");
await page.fill("#p03-real-rag-form input[name='channel']", "Apple Store 在线商店");
let state;
let realAnswerAttempts = 0;
while (realAnswerAttempts < 5) {
  realAnswerAttempts++;
  await page.locator("#p03-real-rag-form button[type='submit']").click();
  await page.waitForFunction(() => {
    const current = JSON.parse(localStorage.getItem("stage3b-full-prototype-v1"));
    return current?.realRag?.loading === false && (current.realRag.result || current.realRag.error);
  }, null, {timeout: 110000});
  state = await page.evaluate(() => JSON.parse(localStorage.getItem("stage3b-full-prototype-v1")));
  if (state.realRag.result?.answer_status === "ANSWERED" && state.realRag.result?.citation_support?.passed === true) break;
  if (realAnswerAttempts < 5) {
    await page.locator("[data-action='new-real-rag-request']").click();
  }
}
fs.writeFileSync(path.join(outputRoot, "p03-real-answer.json"), `${JSON.stringify({
  notice: "P03经本地BFF真实调用Dify后的归一化结果；不包含密钥。",
  request: {
    question: state.realRag.question,
    product_model: state.realRag.productModel,
    channel: state.realRag.channel,
    role: state.role,
    asq_id: state.asq.id
  },
  response: state.realRag.result,
  asq_status_before_confirmation: state.asq.status,
  real_answer_attempts: realAnswerAttempts
}, null, 2)}\n`, "utf8");
assert.equal(state.realRag.result?.answer_status, "ANSWERED");
assert.equal(state.asq.status, "ASQ_CONTEXT_PENDING", "ASQ changed before user confirmation");
assert.equal(state.realRag.result.provider_called, true);
assert.equal(state.realRag.result.cost.model, "deepseek-v4-pro");
assert.equal(state.realRag.result.cost.cost_status, "COST_UNKNOWN");
assert.equal(typeof state.realRag.result.cost.prompt_tokens, "number");
assert.equal(typeof state.realRag.result.cost.completion_tokens, "number");
assert.equal(typeof state.realRag.result.cost.total_tokens, "number");
assert.equal(await page.evaluate(() => document.activeElement?.id), "real-rag-result-title");
assert.match(await page.locator(".page-heading .status-badge").innerText(), /ASQ_CONTEXT_PENDING/);
assert.doesNotMatch(await page.locator(".page-heading").innerText(), /已回答|ANSWERED/);
assert.match(await page.locator("#real-rag-result-title").innerText(), /^RAG结果：已回答/);
assert.equal(state.realRag.result.citation_support.passed, true);
assert.ok(state.realRag.result.citations.length >= 1);
assert.ok(state.realRag.result.citations.every(citation => citation.supported_claims.length >= 1));
const pageHtml = await page.content();
const storageText = await page.evaluate(() => JSON.stringify(localStorage));
assert.ok(!pageHtml.includes(config.apiKey));
assert.ok(!storageText.includes(config.apiKey));
const visibleResult = await page.locator(".real-rag-result").innerText();
assert.match(visibleResult, /RAG结果：/);
assert.ok((visibleResult.match(/下一步动作/g) || []).length <= 1, "duplicate next action section");
assert.ok((visibleResult.match(/业务条件/g) || []).length <= 1, "duplicate business condition section");

await page.screenshot({path: path.join(screenshotRoot, "P03_REAL_RAG_1440.png"), fullPage: true});
await page.setViewportSize({width: 320, height: 900});
const narrowDimensions = await page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  viewport: window.innerWidth
}));
assert.ok(narrowDimensions.scrollWidth <= narrowDimensions.viewport + 1);
await page.screenshot({path: path.join(screenshotRoot, "P03_REAL_RAG_320.png"), fullPage: true});
await page.setViewportSize({width: 1440, height: 1100});

await page.locator("[data-action='confirm-real-advice']").click();
state = await page.evaluate(() => JSON.parse(localStorage.getItem("stage3b-full-prototype-v1")));
assert.equal(state.asq.status, "ASQ_ADVICE_PENDING");
assert.match(await page.locator(".page-heading .status-badge").innerText(), /ASQ_ADVICE_PENDING/);
assert.match(await page.locator("#real-rag-result-title").innerText(), /^RAG结果：已回答/);
await page.locator("[data-action='send-real-advice']").click();
state = await page.evaluate(() => JSON.parse(localStorage.getItem("stage3b-full-prototype-v1")));
assert.equal(state.asq.status, "ASQ_RESPONDED");
assert.match(await page.locator(".page-heading .status-badge").innerText(), /ASQ_RESPONDED/);
assert.match(await page.locator("#real-rag-result-title").innerText(), /^RAG结果：已回答/);

await page.reload({waitUntil: "networkidle"});
state = await page.evaluate(() => JSON.parse(localStorage.getItem("stage3b-full-prototype-v1")));
assert.equal(state.page, "P03");
assert.equal(state.realRag.enabled, true);
assert.ok(state.realRag.result);
assert.equal(await page.locator("#p03-source-mode").count(), 1, `P03 source switch missing after reload; errors=${browserErrors.join(" | ")}; body=${(await page.locator("body").innerText()).slice(0, 500)}`);
assert.equal(await page.locator("#p03-source-mode").inputValue(), "real");
assert.ok(await page.locator(".real-rag-result").isVisible());

await page.locator("[data-action='new-real-rag-request']").click();
await page.fill("#p03-real-rag-form textarea[name='question']", "请把处理结果发到 user@example.com，或电话 13800138000 联系我。");
await page.locator("#p03-real-rag-form button[type='submit']").click();
await page.waitForFunction(() => {
  const state = JSON.parse(localStorage.getItem("stage3b-full-prototype-v1"));
  return state?.realRag?.error?.error_code === "SENSITIVE_DATA_BLOCKED";
});
state = await page.evaluate(() => JSON.parse(localStorage.getItem("stage3b-full-prototype-v1")));
assert.ok(state.realRag.error.details.privacy_categories.includes("MOBILE_PHONE"));
assert.ok(state.realRag.error.details.privacy_categories.includes("EMAIL"));
assert.equal(state.realRag.question, "[已在本地阻断：输入包含个人或凭证信息]");
assert.ok(!(await page.content()).includes("13800138000"));
assert.ok(!(await page.evaluate(() => JSON.stringify(localStorage))).includes("user@example.com"));

await page.locator("[data-action='reset']").click();
await page.goto(`${baseUrl}/index.html#P02`, {waitUntil: "networkidle"});
await page.locator("[data-action='create-asq']").click();
await page.selectOption("#p03-source-mode", "real");
await page.fill("#p03-real-rag-form textarea[name='question']", "充电盒鼓包了，现在还在充电，会怎样？");
const statusBeforeSafety = (await page.evaluate(() => JSON.parse(localStorage.getItem("stage3b-full-prototype-v1")))).asq.status;
await page.locator("#p03-real-rag-form button[type='submit']").click();
await page.waitForFunction(() => {
  const state = JSON.parse(localStorage.getItem("stage3b-full-prototype-v1"));
  return state?.realRag?.result?.answer_status === "BLOCKED_SAFETY";
}, null, {timeout: 15000});
state = await page.evaluate(() => JSON.parse(localStorage.getItem("stage3b-full-prototype-v1")));
assert.equal(state.realRag.result.provider_called, false);
assert.equal(state.asq.status, statusBeforeSafety, "P0 automatically changed ASQ before acknowledgement");
assert.equal(await page.locator("[data-action='confirm-real-advice']").count(), 0);
assert.equal(await page.locator("[data-action='acknowledge-real-safety']").count(), 1);
await page.screenshot({path: path.join(screenshotRoot, "P03_P0_SAFETY_1440.png"), fullPage: true});
await page.locator("[data-action='acknowledge-real-safety']").click();
state = await page.evaluate(() => JSON.parse(localStorage.getItem("stage3b-full-prototype-v1")));
assert.equal(state.asq.status, "ASQ_PAUSED");
assert.equal(state.risk.status, "ESC_ESCALATED");

await page.setViewportSize({width: 320, height: 900});
await page.screenshot({path: path.join(screenshotRoot, "P03_P0_SAFETY_320.png"), fullPage: true});

assert.equal(browserErrors.length, 0, browserErrors.join(" | "));
await context.close();
await browser.close();
await new Promise(resolve => app.server.close(resolve));
fs.rmSync(runtimeRoot, {recursive: true, force: true});

console.log("PASSED: real Dify health/retrieval/P03 answer, 6 P0 BFF gates, persistence, no-secret browser state and 4 screenshots.");
