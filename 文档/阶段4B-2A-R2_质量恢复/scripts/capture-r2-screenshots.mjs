import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "file:///C:/Users/%E6%9D%8E%E6%98%95%E6%98%8A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";
import { createBffServer } from "../../阶段4B-1_BFF与P03真实RAG接入/server/app.mjs";
import { loadConfig } from "../../阶段4B-1_BFF与P03真实RAG接入/server/config.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..", "..", "..");
const recoveryRoot = path.resolve(here, "..");
const prototypeRoot = path.join(projectRoot, "文档", "阶段3B_高保真交互原型");
const p06 = JSON.parse(fs.readFileSync(
  path.join(recoveryRoot, "baseline", "p06-canonical-update-final-r1.json"),
  "utf8"
));
const p10 = JSON.parse(fs.readFileSync(
  path.join(recoveryRoot, "evidence", "p10-real-r2.json"),
  "utf8"
));
const screenshotRoot = path.join(recoveryRoot, "screenshots");
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

try {
  await page.goto(`${baseUrl}/index.html#P01`, {waitUntil: "networkidle"});
  await page.evaluate(() => window.__stage3bTest.dispatch("reset"));
  await page.evaluate(({p06Job, p10Run}) => {
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
      document_count: 5
    };
    state.realEvaluation.run = p10Run;
    state.realEvaluation.scope = "ALL_17";
    state.eval.id = p10Run.run_id;
    state.eval.status = "EVAL_PASSED";
    localStorage.setItem(storageKey, JSON.stringify(state));
    history.replaceState(null, "", "#P06");
  }, {p06Job: p06.ingestion, p10Run: p10});

  await page.reload({waitUntil: "networkidle"});
  await page.screenshot({
    path: path.join(screenshotRoot, "P06_R2_CANONICAL_1440.png"),
    fullPage: true
  });
  await page.setViewportSize({width: 320, height: 900});
  await page.screenshot({
    path: path.join(screenshotRoot, "P06_R2_CANONICAL_320.png"),
    fullPage: true
  });

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
  await page.screenshot({
    path: path.join(screenshotRoot, "P10_R2_PASSED_1440.png"),
    fullPage: true
  });
  await page.setViewportSize({width: 320, height: 900});
  await page.screenshot({
    path: path.join(screenshotRoot, "P10_R2_PASSED_320.png"),
    fullPage: true
  });
  console.log("PASSED: R2 screenshots captured.");
} finally {
  await context.close();
  await browser.close();
  await new Promise(resolve => app.server.close(resolve));
}
