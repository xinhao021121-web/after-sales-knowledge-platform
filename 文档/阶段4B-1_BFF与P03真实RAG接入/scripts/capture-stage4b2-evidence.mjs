import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "file:///C:/Users/%E6%9D%8E%E6%98%95%E6%98%8A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
import { createBffServer } from "../server/app.mjs";
import { loadConfig } from "../server/config.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const projectRoot = path.resolve(root, "..", "..");
const prototypeRoot = path.join(projectRoot, "文档", "阶段3B_高保真交互原型");
const r1Mode = process.argv.includes("--r1");
const deliveryRoot = path.join(
  projectRoot,
  "文档",
  r1Mode ? "阶段4B-2A-R1_质量回归诊断" : "阶段4B-2A_P06真实入库与P10真实评测"
);
const updateScreenshots = process.argv.includes("--update-screenshots");
const screenshotRoot = updateScreenshots
  ? path.join(deliveryRoot, "screenshots")
  : path.join(prototypeRoot, "data", "runtime", "stage4b2a-evidence-screenshots");
const p06 = JSON.parse(fs.readFileSync(
  path.join(deliveryRoot, "evidence", r1Mode ? "p06-canonical-update-final.json" : "p06-real-ingestion.json"),
  "utf8"
));
const p10 = JSON.parse(fs.readFileSync(
  path.join(deliveryRoot, "evidence", r1Mode ? "p10-real-after-r1.json" : "p10-real-evaluation.json"),
  "utf8"
));
fs.mkdirSync(screenshotRoot, {recursive: true});

const config = loadConfig(prototypeRoot);
const app = createBffServer({prototypeRoot, config});
await new Promise(resolve => app.server.listen(0, "127.0.0.1", resolve));
const baseUrl = `http://127.0.0.1:${app.server.address().port}`;
const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true
});
const context = await browser.newContext({viewport: {width: 1440, height: 1100}});
const page = await context.newPage();

await page.goto(`${baseUrl}/index.html#P01`, {waitUntil: "networkidle"});
await page.evaluate(() => window.__stage3bTest.dispatch("reset"));
await page.evaluate(({p06Job, p06HealthAfter, p10Run}) => {
  const storageKey = "stage3b-full-prototype-v1";
  const state = JSON.parse(localStorage.getItem(storageKey));
  state.role = "knowledge";
  state.page = "P06";
  state.source = {
    ...state.source,
    id: "SRC-PUB-001",
    title: "AirPods Pro 3 售后 FAQ",
    locator: "docs/01_售后FAQ.md",
    organization: "项目模拟企业知识运营",
    scope: "中国大陆公开售后与产品支持咨询",
    validUntil: "2026-12-31",
    owner: "知识运营",
    verifiedAt: "2026-10-24",
    accessible: true,
    titleVerified: true,
    status: "SRC_ACTIVE"
  };
  state.dataset.job = p06Job;
  state.dataset.health = {
    status: "ok",
    dataset_name: "CANDIDATE",
    document_count: p06HealthAfter?.document_count ?? 6
  };
  state.realEvaluation.run = p10Run;
  state.realEvaluation.scope = "ALL_17";
  state.eval.id = p10Run.run_id;
  state.eval.status = "EVAL_FAILED";
  localStorage.setItem(storageKey, JSON.stringify(state));
  history.replaceState(null, "", "#P06");
}, {p06Job: p06.ingestion, p06HealthAfter: p06.dataset_health_after, p10Run: p10});

await page.reload({waitUntil: "networkidle"});
await page.screenshot({path: path.join(screenshotRoot, "P06_REAL_INGESTION_1440.png"), fullPage: true});
await page.setViewportSize({width: 320, height: 900});
await page.screenshot({path: path.join(screenshotRoot, "P06_REAL_INGESTION_320.png"), fullPage: true});
await page.setViewportSize({width: 1440, height: 1100});
await page.evaluate(() => {
  const storageKey = "stage3b-full-prototype-v1";
  const state = JSON.parse(localStorage.getItem(storageKey));
  state.role = "evaluation";
  state.page = "P10";
  localStorage.setItem(storageKey, JSON.stringify(state));
  history.replaceState(null, "", "#P10");
});
await page.reload({waitUntil: "networkidle"});
await page.screenshot({path: path.join(screenshotRoot, "P10_REAL_EVALUATION_1440.png"), fullPage: true});
await page.setViewportSize({width: 320, height: 900});
await page.screenshot({path: path.join(screenshotRoot, "P10_REAL_EVALUATION_320.png"), fullPage: true});

await context.close();
await browser.close();
await new Promise(resolve => app.server.close(resolve));
console.log(`PASSED: evidence screenshots written to ${screenshotRoot}`);
