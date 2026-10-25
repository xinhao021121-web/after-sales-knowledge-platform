import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "file:///C:/Users/%E6%9D%8E%E6%98%95%E6%98%8A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const updateScreenshots = process.argv.includes("--update-screenshots");
const screenshotDir = updateScreenshots
  ? path.join(root, "screenshots", "full")
  : path.join(root, "data", "runtime", "stage3b-e2e", "screenshots", "full");
fs.mkdirSync(screenshotDir, { recursive: true });

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png"
};

const server = http.createServer((request, response) => {
  const urlPath = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
  const relative = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const filePath = path.resolve(root, relative);
  if (!filePath.startsWith(root + path.sep) && filePath !== root) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, { "Content-Type": mime[path.extname(filePath)] || "application/octet-stream" });
    response.end(data);
  });
});

await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const browser = await chromium.launch({
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  headless: true
});

const errors = [];
const pageIds = Array.from({ length: 13 }, (_, index) => `P${String(index + 1).padStart(2, "0")}`);
const pageRoles = {
  P01: "frontline",
  P02: "frontline",
  P03: "frontline",
  P04: "legal",
  P05: "legal",
  P06: "knowledge",
  P07: "business",
  P08: "knowledge",
  P09: "knowledge",
  P10: "evaluation",
  P11: "supervisor",
  P12: "admin",
  P13: "admin"
};

async function settle(page) {
  await page.waitForTimeout(30);
}

async function newPage(width = 1440, height = 1000) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(`pageerror: ${error.message}`));
  page.on("console", message => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  await page.goto(`http://127.0.0.1:${port}/index.html#P01`, { waitUntil: "networkidle" });
  await page.locator("#page-title").waitFor();
  return { context, page };
}

async function chooseRole(page, role) {
  await page.selectOption("#role-switch", role);
  await settle(page);
}

async function choosePage(page, pageId) {
  await page.selectOption("#page-jump", pageId);
  await settle(page);
}

async function setViewMode(page, mode) {
  await page.selectOption("#view-mode", mode);
  await settle(page);
}

async function reset(page) {
  await page.locator("[data-action='reset']").click();
  await settle(page);
}

async function launchFlow(page, id) {
  await page.locator("[data-action='toggle-demos']").first().click();
  await settle(page);
  await page.locator(`[data-action='load-flow'][data-value='${id}']`).click();
  await settle(page);
}

async function readState(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("stage3b-full-prototype-v1")));
}

async function fillSourceRegistration(page, { titleVerified = true } = {}) {
  await page.fill("#source-registration-form input[name='title']", "售后来源登记测试");
  await page.fill("#source-registration-form input[name='locator']", "https://support.example.test/source-registration");
  await page.fill("#source-registration-form input[name='organization']", "模拟官方支持");
  await page.fill("#source-registration-form input[name='scope']", "AirPods 中国大陆售后服务");
  await page.fill("#source-registration-form input[name='validUntil']", "2027-06-30");
  await page.fill("#source-registration-form input[name='owner']", "沈知");
  await page.fill("#source-registration-form input[name='verifiedAt']", "2026-10-24");
  await page.locator("#source-registration-form input[name='accessible']").check();
  if (titleVerified) {
    await page.locator("#source-registration-form input[name='titleVerified']").check();
  } else {
    await page.locator("#source-registration-form input[name='titleVerified']").uncheck();
  }
}

const { context, page } = await newPage();
await page.locator("[data-action='reset']").click();
await settle(page);

// Page availability, all page states, focus and accessible controls.
for (const pageId of pageIds) {
  await chooseRole(page, pageRoles[pageId]);
  await choosePage(page, pageId);
  assert.match(await page.locator("#page-title").innerText(), new RegExp(pageId === "P01" ? "今日工作台" : "."));
  assert.equal(await page.evaluate(() => document.activeElement?.id), "page-title", `${pageId} did not receive focus`);
  const statusText = await page.locator(".page-heading .status-badge").first().innerText();
  assert.ok(statusText.length > 0, `${pageId} missing status`);
  assert.ok((await page.locator(".side-nav .nav-item").count()) > 0, `${pageId} missing role nav`);
  const duplicateIds = await page.evaluate(() => {
    const ids = [...document.querySelectorAll("[id]")].map(node => node.id);
    return ids.filter((id, index) => ids.indexOf(id) !== index);
  });
  assert.equal(duplicateIds.length, 0, `${pageId} has duplicate ids: ${duplicateIds.join(",")}`);
  const unnamedControls = await page.evaluate(() => [...document.querySelectorAll("button, select")]
    .filter(node => !(node.getAttribute("aria-label") || node.textContent.trim() || node.closest("label")?.textContent.trim()))
    .map(node => node.outerHTML.slice(0, 80)));
  assert.equal(unnamedControls.length, 0, `${pageId} has unnamed controls`);

  for (const mode of ["loading", "empty", "error", "no-permission"]) {
    await setViewMode(page, mode);
    assert.ok(await page.locator(".state-surface").isVisible(), `${pageId}/${mode} missing state surface`);
    if (mode === "loading") assert.equal(await page.locator(".state-surface").getAttribute("aria-busy"), "true");
    if (mode === "no-permission") assert.match(await page.locator("#page-title").innerText(), /无权限/);
  }
  await setViewMode(page, "default");
}

// Screenshot all pages at both required widths.
for (const width of [1440, 320]) {
  for (const pageId of pageIds) {
    const shotContext = await browser.newContext({
      viewport: { width, height: width === 320 ? 900 : 1000 },
      deviceScaleFactor: 1
    });
    const shotPage = await shotContext.newPage();
    shotPage.on("pageerror", error => errors.push(`${pageId}/${width}: ${error.message}`));
    await shotPage.goto(`http://127.0.0.1:${port}/index.html#${pageId}`, { waitUntil: "networkidle" });
    await chooseRole(shotPage, pageRoles[pageId]);
    await choosePage(shotPage, pageId);
    await setViewMode(shotPage, "default");
    const dimensions = await shotPage.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: window.innerWidth
    }));
    assert.ok(dimensions.width <= dimensions.viewport + 1, `${pageId}/${width} horizontal overflow: ${dimensions.width}`);
    await shotPage.evaluate(() => document.activeElement?.blur());
    await shotPage.screenshot({ path: path.join(screenshotDir, `${pageId}_${width}.png`), fullPage: true });
    await shotContext.close();
  }
}

let state;

// D01: create ASQ, complete CTX, see version difference.
await launchFlow(page, "D01");
assert.match(await page.locator("#page-title").innerText(), /咨询任务/);
await page.locator("[data-action='create-asq']").click();
await settle(page);
assert.match(await page.locator(".page-heading").innerText(), /待补上下文/);
state = await readState(page);
assert.equal(state.asq.status, "ASQ_CONTEXT_PENDING");
assert.equal(state.asq.contextCompleteness, "C2");
assert.ok(state.asq.missing.length > 0);
assert.equal(await page.locator("[data-action='send-advice']").count(), 0);
assert.match(await page.locator(".draft-lock").innerText(), /建议草案不可发送/);
await page.locator("[data-action='fill-ctex']").click();
await settle(page);
state = await readState(page);
assert.equal(state.asq.status, "ASQ_ASSESSING");
assert.equal(state.asq.contextCompleteness, "C3");
assert.equal(state.asq.missing, "");
assert.match(await page.locator("#action-feedback").innerText(), /CTX 升级到 v2/);
await page.locator("[data-action='generate-advice']").click();
await settle(page);
state = await readState(page);
assert.equal(state.asq.status, "ASQ_ADVICE_PENDING");
assert.equal(state.asq.adviceGenerated, true);

// D02: version difference from an existing v3 context.
await launchFlow(page, "D02");
assert.equal((await readState(page)).asq.contextCompleteness, "C2");
await page.locator("[data-action='fill-ctex']").click();
await settle(page);
assert.match(await page.locator("#action-feedback").innerText(), /CTX 升级到 v4/);
state = await readState(page);
assert.equal(state.asq.status, "ASQ_ASSESSING");
assert.equal(state.asq.contextCompleteness, "C3");
await page.locator("[data-action='generate-advice']").click();
await settle(page);
assert.equal((await readState(page)).asq.status, "ASQ_ADVICE_PENDING");

// D03: missing evidence, conflict and promise guard.
await launchFlow(page, "D03");
await page.locator("[data-action='simulate-missing']").click();
await settle(page);
assert.match(await page.locator("#action-feedback").innerText(), /证据不足/);
state = await readState(page);
assert.equal(state.asq.status, "ASQ_CONTEXT_PENDING");
assert.equal(state.asq.contextCompleteness, "C2");
assert.equal(await page.locator("[data-action='send-advice']").count(), 0);
await page.locator("[data-action='simulate-conflict']").click();
await settle(page);
assert.match(await page.locator("#action-feedback").innerText(), /证据冲突/);
assert.equal((await readState(page)).asq.status, "ASQ_ASSESSING");
await page.locator("[data-action='fill-ctex']").click();
await settle(page);
await page.locator("[data-action='generate-advice']").click();
await settle(page);
await page.locator("#promise-risk").check();
await settle(page);
await page.locator("[data-action='send-advice']").click();
await settle(page);
assert.match(await page.locator("#action-feedback").innerText(), /越权承诺/);
assert.equal((await readState(page)).asq.status, "ASQ_ADVICE_PENDING");

// D04: supervisor may send ADV, CTX stays read-only.
await launchFlow(page, "D04");
assert.equal(await page.locator("[data-action='fill-ctex']").count(), 0);
await page.locator("[data-action='send-advice']").click();
await settle(page);
assert.match(await page.locator("#action-feedback").innerText(), /建议已发送/);
assert.match(await page.locator(".page-heading").innerText(), /已答复/);
assert.equal((await readState(page)).asq.status, "ASQ_RESPONDED");

// D05: R3 stop, escalation, closure and recurrence.
await launchFlow(page, "D05");
await page.locator("[data-action='risk-stop']").click();
await settle(page);
assert.match(await page.locator("#action-feedback").innerText(), /风险仍保持 R3/);
await page.locator("[data-action='risk-escalate']").click();
await settle(page);
await page.locator("[data-action='risk-close']").click();
await settle(page);
assert.match(await page.locator(".page-heading").innerText(), /风险已关闭/);
await page.locator("[data-action='risk-recur']").click();
await settle(page);
assert.match(await page.locator("#action-feedback").innerText(), /previous_esc_id/);

// P06: registration, failed activation, successful activation and replacement version.
await launchFlow(page, "D06");
await page.locator("[data-action='toggle-source-form']").click();
await fillSourceRegistration(page, { titleVerified: false });
await page.locator("#source-registration-form button[type='submit']").click();
await settle(page);
state = await readState(page);
assert.equal(state.source.status, "SRC_REGISTERED");
await page.locator("[data-action='activate-source']").click();
await settle(page);
state = await readState(page);
assert.equal(state.source.status, "SRC_REVIEW_REQUIRED");
assert.match(await page.locator("#action-feedback").innerText(), /来源激活失败/);
await page.locator("[data-action='toggle-source-form']").click();
await fillSourceRegistration(page);
await page.locator("#source-registration-form button[type='submit']").click();
await settle(page);
await page.locator("[data-action='activate-source']").click();
await settle(page);
state = await readState(page);
assert.equal(state.source.status, "SRC_ACTIVE");
assert.ok(state.audits.some(audit => audit.action === "登记知识来源" && audit.result === "成功"));
assert.ok(state.audits.some(audit => audit.action === "来源激活校验" && audit.result === "拒绝"));
assert.ok(state.audits.some(audit => audit.action === "激活知识来源" && audit.result === "成功"));

// P07: business approval updates the review KB without overwriting the eval candidate.
await launchFlow(page, "D06");
await chooseRole(page, "business");
await choosePage(page, "P07");
await page.locator("[data-action='approve-kb']").click();
await settle(page);
state = await readState(page);
assert.equal(state.reviewKb.status, "KB_APPROVED_FOR_RELEASE");
assert.equal(state.kb.status, "KB_EVAL_PENDING");

// D06: source invalidation produces visible cross-object impact.
await launchFlow(page, "D06");
await page.locator("[data-action='invalidate-source']").click();
await settle(page);
assert.ok((await page.locator(".impact-list > div").count()) >= 6);
assert.match(await page.locator(".page-heading").innerText(), /已撤回/);
state = await readState(page);
assert.equal(state.reviewKb.status, "KB_SOURCE_BLOCKED");
assert.equal(state.kb.status, "KB_SOURCE_BLOCKED");
assert.ok(state.source.impact.some(item => item[0] === state.reviewKb.id));
assert.ok(state.source.impact.some(item => item[0] === state.kb.id));
assert.ok(state.source.impact.some(item => item[0] === state.rel.id));
assert.ok(await page.locator(".source-alternative").isVisible());
assert.match(await page.locator(".source-alternative").innerText(), /新版中国大陆服务范围说明/);
await page.locator("[data-action='create-source-version']").click();
await settle(page);
state = await readState(page);
assert.equal(state.source.status, "SRC_REGISTERED");
assert.equal(state.source.previousSourceId, "SRC-OFFICIAL-014-v4");
assert.match(state.source.id, /v5/);
await launchFlow(page, "D06");
await page.locator("[data-action='invalidate-source']").click();
await settle(page);
await chooseRole(page, "business");
await choosePage(page, "P07");
await page.locator("[data-action='approve-kb']").click();
await settle(page);
assert.match(await page.locator("#action-feedback").innerText(), /不能批准/);
assert.equal((await readState(page)).reviewKb.status, "KB_SOURCE_BLOCKED");

// D07: create, triage and 0/1/N links.
await launchFlow(page, "D07");
await page.locator("[data-action='create-case']").click();
await settle(page);
assert.match(await page.locator(".page-heading").innerText(), /待分诊/);
await page.locator("[data-action='triage-case']").click();
await settle(page);
assert.match(await page.locator(".page-heading").innerText(), /已分诊/);
await page.locator("[data-action='add-link'][data-value='1']").click();
await settle(page);
assert.equal(await page.locator(".link-row").count(), 1);
await page.locator("[data-action='add-link'][data-value='next']").click();
await settle(page);
assert.equal(await page.locator(".link-row").count(), 2);

// D08: partial links block CASE closure.
await launchFlow(page, "D08");
await page.locator("[data-action='attempt-close']").click();
await settle(page);
assert.match(await page.locator("#action-feedback").innerText(), /不能关闭/);
assert.notEqual((await readState(page)).caseItem.status, "CASE_CLOSED");

// D09: failed LINK gets a successor with previous_link_id.
await launchFlow(page, "D09");
const beforeSuccessorCount = await page.locator(".link-row").count();
await page.locator("[data-action='create-successor']").first().click();
await settle(page);
assert.equal(await page.locator(".link-row").count(), beforeSuccessorCount + 1);
assert.match(await page.locator(".link-table").innerText(), /previous_link_id/);

// D10: EVAL planned→running→result, plus rejected state jump and abort.
await launchFlow(page, "D10");
assert.equal((await readState(page)).eval.status, "EVAL_PLANNED");
assert.equal(await page.locator("[data-action='eval-pass']").count(), 0);
await page.evaluate(() => window.__stage3bTest.dispatch("eval-pass"));
await settle(page);
state = await readState(page);
assert.equal(state.eval.status, "EVAL_PLANNED");
assert.ok(state.audits.some(audit => audit.action === "非法状态转换" && audit.result === "拒绝"));
await page.locator("[data-action='eval-start']").click();
await settle(page);
state = await readState(page);
assert.equal(state.eval.status, "EVAL_RUNNING");
await page.locator("[data-action='eval-abort']").click();
await settle(page);
assert.equal((await readState(page)).eval.status, "EVAL_PLANNED");
await page.locator("[data-action='eval-start']").click();
await settle(page);
await page.locator("[data-action='eval-pass']").click();
await settle(page);
assert.match(await page.locator(".page-heading").innerText(), /评测通过/);
state = await readState(page);
assert.equal(state.eval.status, "EVAL_PASSED");
assert.equal(state.kb.status, "KB_APPROVED_FOR_RELEASE");
assert.equal(state.rel.status, "REL_PENDING_APPROVAL");
assert.match(state.rel.evalEvidence, /通过/);
assert.equal(state.caseItem.status, "CASE_VERIFIED_PENDING_RELEASE");
assert.ok(state.caseItem.links.some(link => link.status === "LINK_PENDING_RELEASE"));

await launchFlow(page, "D10");
await page.locator("[data-action='eval-start']").click();
await settle(page);
await page.locator("[data-action='eval-fail']").click();
await settle(page);
assert.match(await page.locator(".page-heading").innerText(), /评测失败/);
state = await readState(page);
assert.equal(state.eval.status, "EVAL_FAILED");
assert.equal(state.kb.status, "KB_EVAL_FAILED");
assert.equal(state.rel.status, "REL_REJECTED");
assert.equal(state.caseItem.status, "CASE_FIXING");
assert.ok(state.caseItem.links.some(link => link.status === "LINK_FAILED"));

await launchFlow(page, "D10");
await page.locator("[data-action='eval-start']").click();
await settle(page);
await page.locator("[data-action='eval-blocked']").click();
await settle(page);
assert.match(await page.locator(".page-heading").innerText(), /评测阻塞/);
state = await readState(page);
assert.equal(state.eval.status, "EVAL_BLOCKED");
assert.equal(state.rel.status, "REL_SUSPENDED");
assert.equal(state.caseItem.status, "CASE_FIXING");

// D11: rejected REL returns LINK and CASE.
await launchFlow(page, "D11");
await page.locator("[data-action='rel-reject']").click();
await settle(page);
state = await readState(page);
assert.equal(state.rel.status, "REL_REJECTED");
assert.equal(state.caseItem.status, "CASE_FIXING");
assert.ok(state.caseItem.links.some(link => link.status === "LINK_FAILED"));

// D12: approved REL releases LINK and closes fully completed CASE.
await launchFlow(page, "D12");
assert.match(await page.locator(".status-track").innerText(), /KB-104-v3/);
assert.match(await page.locator(".status-track").innerText(), /EVAL-2026-0402/);
await page.locator("[data-action='rel-approve']").click();
await settle(page);
state = await readState(page);
assert.equal(state.rel.status, "REL_ACTIVE");
assert.equal(state.caseItem.status, "CASE_CLOSED");

// D13: suspend, rollback candidate, approval and successor LINK.
await launchFlow(page, "D13");
await page.locator("[data-action='rel-suspend']").click();
await settle(page);
assert.match(await page.locator(".page-heading").innerText(), /已停用/);
await page.locator("[data-action='rollback-create']").click();
await settle(page);
assert.match(await page.locator(".page-heading").innerText(), /待发布审批/);
await chooseRole(page, "supervisor");
await page.locator("[data-action='rollback-approve']").click();
await settle(page);
state = await readState(page);
assert.equal(state.rel.status, "REL_ACTIVE");
assert.equal(state.caseItem.status, "CASE_REOPENED");
assert.ok(state.caseItem.links.some(link => link.status === "LINK_OPEN"));

// D14: two independent approvals close a no-link CASE.
await launchFlow(page, "D14");
await page.locator("[data-action='no-fix-supervisor']").click();
await settle(page);
assert.match(await page.locator(".page-heading").innerText(), /修复中/);
await chooseRole(page, "business");
await page.locator("[data-action='no-fix-business']").click();
await settle(page);
assert.match(await page.locator(".page-heading").innerText(), /案例已关闭/);

// D15: unauthorized page shows a role-specific denial and no business content.
await launchFlow(page, "D15");
assert.match(await page.locator("#page-title").innerText(), /无法访问/);
assert.ok(!(await page.locator("body").innerText()).includes("模拟客户 B"));

// P12: member role change succeeds and forbidden separation actions are rejected.
await chooseRole(page, "admin");
await choosePage(page, "P12");
await page.selectOption("#member-role-form select[name='memberId']", "MBR-06");
await page.selectOption("#member-role-form select[name='targetRole']", "knowledge");
await page.locator("#member-role-form button[type='submit']").click();
await settle(page);
state = await readState(page);
assert.equal(state.members.find(member => member.id === "MBR-06").role, "knowledge");
assert.ok(state.audits.some(audit => audit.action === "变更成员角色" && audit.result === "成功"));
const roleBeforeOverreach = state.reviewKb.status;
await page.locator("[data-action='attempt-self-approval']").click();
await settle(page);
assert.match(await page.locator("#action-feedback").innerText(), /自审自批已拦截/);
await page.locator("[data-action='attempt-admin-release']").click();
await settle(page);
assert.match(await page.locator("#action-feedback").innerText(), /管理员发布已拦截/);
await page.locator("[data-action='attempt-r3-overreach']").click();
await settle(page);
assert.match(await page.locator("#action-feedback").innerText(), /R3 越权关闭已拦截/);
state = await readState(page);
assert.equal(state.reviewKb.status, roleBeforeOverreach);
assert.notEqual(state.rel.status, "REL_ACTIVE");
assert.notEqual(state.risk.status, "ESC_CLOSED");
assert.ok(state.audits.some(audit => audit.action === "自审自批拦截" && audit.result === "拒绝"));
assert.ok(state.audits.some(audit => audit.action === "管理员发布拦截" && audit.result === "拒绝"));
assert.ok(state.audits.some(audit => audit.action === "R3 越权关闭拦截" && audit.result === "拒绝"));

// Show mode removes review chrome and technical FR/simulation information.
await page.selectOption("#mode-switch", "show");
await settle(page);
assert.equal(await page.locator("body").getAttribute("data-mode"), "show");
assert.equal(await page.locator(".fr-line").isVisible(), false);
assert.equal(await page.locator(".preview-toolbar").isVisible(), false);
assert.equal(await page.locator(".review-only").first().isVisible(), false);
assert.match(await page.locator(".product-context").innerText(), /模拟环境/);
assert.ok(!(await page.locator("body").innerText()).includes("生产演练"));
assert.ok(!(await page.locator("body").innerText()).includes("非 Apple 项目"));
assert.ok(!(await page.locator("body").innerText()).includes("查看演示脚本"));
await page.selectOption("#mode-switch", "review");
await settle(page);
assert.equal(await page.locator("body").getAttribute("data-mode"), "review");
assert.equal(await page.locator(".fr-line").isVisible(), true);
assert.equal(await page.locator(".preview-toolbar").isVisible(), true);

// Keyboard skip link and focus after navigation.
await reset(page);
await page.locator(".skip-link").focus();
await page.keyboard.press("Enter");
assert.equal(await page.evaluate(() => document.activeElement?.id), "page-title");
await choosePage(page, "P02");
assert.equal(await page.evaluate(() => document.activeElement?.id), "page-title");

// Refresh restores role, page and key action state.
await launchFlow(page, "D04");
await page.locator("[data-action='send-advice']").click();
await settle(page);
await page.reload({ waitUntil: "networkidle" });
assert.match(await page.locator("#action-feedback").innerText(), /建议已发送/);
assert.equal(await page.locator("#role-switch").inputValue(), "supervisor");
assert.equal(await page.locator("#page-jump").inputValue(), "P03");

// Core controls can be operated with the keyboard.
const keyboardContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const keyboardPage = await keyboardContext.newPage();
await keyboardPage.goto(`http://127.0.0.1:${port}/index.html#P01`, { waitUntil: "networkidle" });
await keyboardPage.locator("#role-switch").focus();
await keyboardPage.keyboard.press("ArrowDown");
await settle(keyboardPage);
assert.notEqual(await keyboardPage.locator("#role-switch").inputValue(), "frontline");
await keyboardPage.locator(".side-nav [data-go='P02']").focus();
await keyboardPage.keyboard.press("Enter");
await settle(keyboardPage);
assert.match(await keyboardPage.locator("#page-title").innerText(), /咨询任务/);
await launchFlow(keyboardPage, "D04");
await keyboardPage.locator("[data-action='send-advice']").focus();
await keyboardPage.keyboard.press("Enter");
await settle(keyboardPage);
assert.match(await keyboardPage.locator("#action-feedback").innerText(), /建议已发送/);
await launchFlow(keyboardPage, "D05");
await keyboardPage.locator("[data-action='risk-stop']").focus();
await keyboardPage.keyboard.press("Enter");
await settle(keyboardPage);
assert.match(await keyboardPage.locator("#action-feedback").innerText(), /风险仍保持 R3/);
await launchFlow(keyboardPage, "D08");
await keyboardPage.locator("[data-action='attempt-close']").focus();
await keyboardPage.keyboard.press("Enter");
await settle(keyboardPage);
assert.match(await keyboardPage.locator("#action-feedback").innerText(), /不能关闭/);
await launchFlow(keyboardPage, "D11");
await keyboardPage.locator("[data-action='rel-reject']").focus();
await keyboardPage.keyboard.press("Enter");
await settle(keyboardPage);
assert.match(await keyboardPage.locator(".page-heading").innerText(), /已拒绝/);
await launchFlow(keyboardPage, "D12");
await keyboardPage.locator("[data-action='rel-approve']").focus();
await keyboardPage.keyboard.press("Enter");
await settle(keyboardPage);
assert.match(await keyboardPage.locator(".page-heading").innerText(), /已生效/);
await keyboardContext.close();

// Direct file entry remains usable.
const fileContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const filePage = await fileContext.newPage();
await filePage.goto(`${pathToFileURL(path.join(root, "index.html")).href}#P01`, { waitUntil: "load" });
await filePage.locator("#page-title").waitFor();
assert.match(await filePage.locator("#page-title").innerText(), /今日工作台/);
await fileContext.close();

await context.close();
await browser.close();
await new Promise(resolve => server.close(resolve));

if (errors.length) {
  console.error(`FAILED: browser errors: ${errors.join(" | ")}`);
  process.exit(1);
}

console.log("PASSED: 13 pages, 5 page states, 15 flows, ASQ/EVAL/SRC/permission state integrity, modes, keyboard and 26 screenshots.");
