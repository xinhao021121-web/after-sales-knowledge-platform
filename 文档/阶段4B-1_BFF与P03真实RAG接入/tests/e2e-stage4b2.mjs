import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "file:///C:/Users/%E6%9D%8E%E6%98%95%E6%98%8A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
import { createBffServer } from "../server/app.mjs";
import { loadConfig } from "../server/config.mjs";
import { ProviderError } from "../server/dify-adapter.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const projectRoot = path.resolve(root, "..", "..");
const prototypeRoot = path.join(projectRoot, "文档", "阶段3B_高保真交互原型");
const updateScreenshots = process.argv.includes("--update-screenshots");
const screenshotRoot = updateScreenshots
  ? path.join(projectRoot, "文档", "阶段4B-2A_P06真实入库与P10真实评测", "screenshots")
  : path.join(prototypeRoot, "data", "runtime", "stage4b2a-e2e", "screenshots");
const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bff-4b2a-e2e-"));
fs.mkdirSync(screenshotRoot, {recursive: true});

const config = {...loadConfig(prototypeRoot), runtimeRoot};
let providerCalls = 0;
const provider = {
  sourceMode: "TEST_ADAPTER",
  async health() {
    return {status: "ok", provider: {mode: "advanced-chat"}, latency_ms: 4};
  },
  async answer() {
    providerCalls += 1;
    return {
      provider_request_id: `e2e-provider-${providerCalls}`,
      provider_trace_id: `e2e-provider-${providerCalls}`,
      timing_ms: 25,
      raw: {
        answer: "请先核对商品、渠道、时间和检测状态；当前证据不足，不能承诺免费换新。[citation:1]",
        message_id: `e2e-provider-${providerCalls}`,
        metadata: {
          usage: {prompt_tokens: 130, completion_tokens: 55, total_tokens: 185},
          retriever_resources: [{
            position: 1,
            dataset_id: config.datasetId,
            dataset_name: "CANDIDATE",
            document_id: "DOC-FAQ-V1",
            document_name: "01_售后FAQ.md",
            segment_id: `e2e-segment-${providerCalls}`,
            score: 0.93,
            content: "售后判断前应核对商品型号、购买渠道、签收时间和检测状态，不能提前承诺免费换新。"
          }]
        }
      }
    };
  }
};

let pollCount = 0;
let createCount = 0;
const datasetAdapter = {
  sourceMode: "TEST_ADAPTER",
  async health() {
    return {status: "ok", dataset_id: config.datasetId, dataset_name: "CANDIDATE", document_count: 5, checked_at: new Date().toISOString()};
  },
  async createDocument() {
    createCount += 1;
    return {document: {id: "DIFY-DOC-E2E"}, batch: "DIFY-BATCH-E2E"};
  },
  async updateDocument() {
    return {document: {id: "DIFY-DOC-E2E"}, batch: "DIFY-BATCH-RETRY"};
  },
  async getIndexingStatus() {
    pollCount += 1;
    const status = pollCount === 1 ? "parsing" : pollCount === 2 ? "indexing" : "completed";
    return {
      data: [{
        id: "DIFY-DOC-E2E",
        indexing_status: status,
        completed_segments: status === "completed" ? 6 : 3,
        total_segments: 6,
        error: null
      }]
    };
  },
  async findDocumentByName() {
    return null;
  }
};

const app = createBffServer({prototypeRoot, config, adapter: provider, datasetAdapter});
await new Promise(resolve => app.server.listen(0, "127.0.0.1", resolve));
const baseUrl = `http://127.0.0.1:${app.server.address().port}`;
const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true
});
const context = await browser.newContext({viewport: {width: 1440, height: 1100}});
const page = await context.newPage();
const browserErrors = [];
page.on("pageerror", error => browserErrors.push(error.message));
page.on("console", message => {
  if (message.type() === "error") browserErrors.push(message.text());
});

await page.goto(`${baseUrl}/index.html#P06`, {waitUntil: "networkidle"});
await page.selectOption("#role-switch", "knowledge");
await page.selectOption("#page-jump", "P06");
await page.waitForURL(/#P06/);
await page.locator("[data-action='check-dataset-health']").click();
await page.getByText(/Dataset API 可用/).waitFor();

await page.locator("[data-action='toggle-source-form']").click();
await page.fill("#source-registration-form input[name='title']", "CANDIDATE 售后 FAQ v1.0.0");
await page.fill("#source-registration-form input[name='locator']", "docs/01_售后FAQ.md");
await page.fill("#source-registration-form input[name='organization']", "模拟企业知识运营");
await page.fill("#source-registration-form input[name='scope']", "中国大陆公开售后支持");
await page.fill("#source-registration-form input[name='validUntil']", "2026-12-31");
await page.fill("#source-registration-form input[name='owner']", "沈知");
await page.fill("#source-registration-form input[name='verifiedAt']", "2026-10-25");
await page.locator("#source-registration-form input[name='accessible']").check();
await page.locator("#source-registration-form input[name='titleVerified']").check();
await page.locator("#source-registration-form button[type='submit']").click();
await page.locator("#dataset-ingestion-form").waitFor();
await page.selectOption("#dataset-ingestion-form select[name='docId']", "DOC-FAQ-V1");
await page.locator("#dataset-ingestion-form button[type='submit']").click();
await page.waitForFunction(() => {
  const state = JSON.parse(localStorage.getItem("stage3b-full-prototype-v1"));
  return state?.dataset?.job?.provider_status === "READY";
}, null, {timeout: 20000});
let state = await page.evaluate(() => JSON.parse(localStorage.getItem("stage3b-full-prototype-v1")));
assert.equal(state.dataset.job.document_status, "DOCUMENT_READY");
assert.equal(state.dataset.job.publishable, true);
assert.equal(state.dataset.job.source_mode, "TEST_ADAPTER");
assert.equal(createCount, 1);
assert.ok(pollCount >= 3);
assert.match(await page.locator(".real-ingestion-panel").innerText(), /已就绪/);
assert.match(await page.locator(".real-ingestion-panel").innerText(), /已满足索引条件/);

await page.screenshot({path: path.join(screenshotRoot, "P06_REAL_INGESTION_1440.png"), fullPage: true});
await page.setViewportSize({width: 320, height: 900});
assert.ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= 321);
await page.screenshot({path: path.join(screenshotRoot, "P06_REAL_INGESTION_320.png"), fullPage: true});
await page.setViewportSize({width: 1440, height: 1100});
await page.reload({waitUntil: "networkidle"});
state = await page.evaluate(() => JSON.parse(localStorage.getItem("stage3b-full-prototype-v1")));
assert.equal(state.dataset.job.provider_status, "READY");
assert.equal(state.page, "P06");

await page.selectOption("#role-switch", "evaluation");
await page.selectOption("#page-jump", "P10");
await page.waitForURL(/#P10/);
await page.locator("#real-evaluation-form").waitFor();
await page.selectOption("#real-evaluation-form select[name='taskScope']", "ALL_17");
const providerCallsBefore = providerCalls;
await page.locator("#real-evaluation-form button[type='submit']").click();
await page.waitForFunction(() => {
  const current = JSON.parse(localStorage.getItem("stage3b-full-prototype-v1"));
  return current?.realEvaluation?.run?.status === "FAILED";
}, null, {timeout: 30000});
state = await page.evaluate(() => JSON.parse(localStorage.getItem("stage3b-full-prototype-v1")));
assert.equal(state.realEvaluation.run.results.length, 17);
assert.equal(state.realEvaluation.run.metrics.p0_final_failures, 0);
assert.equal(state.realEvaluation.run.metrics.provider_call_count, 11);
assert.equal(providerCalls - providerCallsBefore, 11);
assert.equal(state.realEvaluation.run.metrics.cost.cost_status, "COST_UNKNOWN");
assert.equal(state.realEvaluation.run.source_mode, "TEST_ADAPTER");
assert.equal(state.eval.status, "EVAL_FAILED");
assert.match(await page.locator(".real-evaluation-panel").innerText(), /17 \/ 17/);
assert.match(await page.locator(".real-evaluation-panel").innerText(), /COST_UNKNOWN/);
assert.match(await page.locator(".real-evaluation-panel").innerText(), /期望来源/);
assert.match(await page.locator(".real-evaluation-panel").innerText(), /检索核心任务/);

await page.screenshot({path: path.join(screenshotRoot, "P10_REAL_EVALUATION_1440.png"), fullPage: true});
await page.setViewportSize({width: 320, height: 900});
assert.ok((await page.evaluate(() => document.documentElement.scrollWidth)) <= 321);
await page.screenshot({path: path.join(screenshotRoot, "P10_REAL_EVALUATION_320.png"), fullPage: true});
await page.setViewportSize({width: 1440, height: 1100});

const html = await page.content();
const storage = await page.evaluate(() => JSON.stringify(localStorage));
assert.ok(!html.includes(config.apiKey));
assert.ok(!storage.includes(config.apiKey));
assert.equal(browserErrors.length, 0, browserErrors.join(" | "));

await context.close();
await browser.close();
await new Promise(resolve => app.server.close(resolve));
fs.rmSync(runtimeRoot, {recursive: true, force: true});
console.log("PASSED: P06 real ingestion UI, refresh recovery, P10 real 17-task evaluation, P0 short circuit, cost unknown and 320px layout.");
