import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "file:///C:/Users/%E6%9D%8E%E6%98%95%E6%98%8A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const previewDir = path.join(root, "previews");
const outputDir = path.join(root, "screenshots");
fs.mkdirSync(outputDir, { recursive: true });

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8"
};

const server = http.createServer((request, response) => {
  const urlPath = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
  const relative = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const filePath = path.resolve(previewDir, relative);
  if (!filePath.startsWith(previewDir + path.sep) && filePath !== previewDir) {
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
const pages = ["P01", "P03", "P05", "P09"];
const directions = ["a", "b"];

for (const direction of directions) {
  for (const pageId of pages) {
    for (const width of [1440, 320]) {
      const context = await browser.newContext({
        viewport: { width, height: width === 320 ? 900 : 1100 },
        deviceScaleFactor: 1
      });
      const page = await context.newPage();
      page.on("pageerror", error => errors.push(`${direction}/${pageId}/${width}: ${error.message}`));
      page.on("console", message => {
        if (message.type() === "error") errors.push(`${direction}/${pageId}/${width}: ${message.text()}`);
      });
      await page.goto(`http://127.0.0.1:${port}/direction-${direction}.html#${pageId}`, { waitUntil: "networkidle" });
      await page.locator("#page-title").waitFor();
      const dimensions = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        viewport: window.innerWidth
      }));
      if (dimensions.width > dimensions.viewport + 1) {
        errors.push(`${direction}/${pageId}/${width}: horizontal overflow ${dimensions.width} > ${dimensions.viewport}`);
      }
      await page.screenshot({
        path: path.join(outputDir, `direction-${direction}_${pageId}_${width}.png`),
        fullPage: true
      });
      await context.close();
    }
  }
}

async function interactiveCheck(direction) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/direction-${direction}.html#P01`, { waitUntil: "networkidle" });
  const roleKeys = ["frontline", "aftersales", "supervisor", "business", "knowledge", "evaluation", "legal", "admin"];
  const navVariants = new Set();
  for (const roleKey of roleKeys) {
    await page.selectOption("#role-switch", roleKey);
    await page.waitForTimeout(20);
    navVariants.add(await page.locator(".side-nav nav").innerText());
  }
  if (navVariants.size < 5) {
    errors.push(`${direction}: role navigation variants are not sufficiently distinct`);
  }
  await page.selectOption("#role-switch", "frontline");
  await page.locator(".skip-link").focus();
  await page.keyboard.press("Enter");
  const focusedAfterSkip = await page.evaluate(() => document.activeElement?.id);
  if (focusedAfterSkip !== "page-title") {
    errors.push(`${direction}: skip link did not move focus to the page title`);
  }
  await page.selectOption("#role-switch", "supervisor");
  await page.waitForTimeout(50);
  const supervisorNav = await page.locator(".side-nav").innerText();
  if (!supervisorNav.includes("任务确认") || !supervisorNav.includes("风险处置")) {
    errors.push(`${direction}: role-specific nav did not update for supervisor`);
  }
  await page.locator("[data-preview-page='P03']").click();
  if (!(await page.locator("#send-advice").isEnabled())) {
    errors.push(`${direction}: supervisor should be able to confirm/send ADV`);
  }
  if ((await page.locator(".read-field").first().getAttribute("contenteditable")) === "true") {
    errors.push(`${direction}: supervisor CTX should be read-only`);
  }
  await page.locator("#send-advice").click();
  await page.reload({ waitUntil: "networkidle" });
  if (!(await page.locator("#advice-feedback").isVisible()) || !(await page.locator("#send-advice").isDisabled())) {
    errors.push(`${direction}: advice-sent state did not persist`);
  }
  await page.locator("[data-preview-page='P05']").click();
  await page.locator("#risk-stop").click();
  if (!(await page.locator("#risk-feedback").isVisible())) {
    errors.push(`${direction}: risk stop did not render inline state`);
  }
  await page.reload({ waitUntil: "networkidle" });
  if (!(await page.locator("#risk-feedback").isVisible()) || !(await page.locator("#risk-stop").isDisabled())) {
    errors.push(`${direction}: risk-stop state did not persist`);
  }
  await page.locator("[data-preview-page='P09']").click();
  await page.reload({ waitUntil: "networkidle" });
  if (!(await page.locator(".link-track").count() >= 3)) {
    errors.push(`${direction}: localStorage did not restore the case view`);
  }
  await context.close();
}

await interactiveCheck("a");
await interactiveCheck("b");

for (const direction of directions) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const fileUrl = `${pathToFileURL(path.join(previewDir, `direction-${direction}.html`)).href}#P01`;
  await page.goto(fileUrl, { waitUntil: "load" });
  if (!(await page.locator("#page-title").isVisible())) {
    errors.push(`${direction}: direct file open failed`);
  }
  if (!(await page.locator(".side-nav").isVisible())) {
    errors.push(`${direction}: role navigation missing in direct file open`);
  }
  await page.selectOption("#role-switch", "supervisor");
  await page.locator("[data-preview-page='P03']").click();
  await page.locator("#send-advice").click();
  await page.reload({ waitUntil: "load" });
  if (!(await page.locator("#advice-feedback").isVisible())) {
    errors.push(`${direction}: localStorage did not restore from direct file open`);
  }
  await context.close();
}
await browser.close();
await new Promise(resolve => server.close(resolve));

if (errors.length) {
  console.error(`FAILED: ${errors.length} preview issue(s)`);
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log("PASSED: 16 screenshots captured at 1440/320; role, inline feedback, deep link and localStorage checks passed.");
