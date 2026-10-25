import fs from "node:fs";
import path from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const stageRoot = path.resolve(here, "..");
const projectRoot = path.resolve(stageRoot, "..", "..");
const portfolioPath = path.join(projectRoot, "作品集", "index.html");
const projectCasePath = path.join(projectRoot, "作品集", "项目案例.html");
const askneedCasePath = path.join(projectRoot, "作品集", "问需案例.html");
const otherPracticePath = path.join(projectRoot, "作品集", "其他实践.html");
const screenshotsRoot = path.join(stageRoot, "screenshots");
fs.mkdirSync(screenshotsRoot, {recursive: true});
const playwrightEntry = process.env.CODEX_PLAYWRIGHT_ENTRY || path.join(
  process.env.USERPROFILE,
  ".cache",
  "codex-runtimes",
  "codex-primary-runtime",
  "dependencies",
  "node",
  "node_modules",
  "playwright",
  "index.mjs"
);
const {chromium} = await import(pathToFileURL(playwrightEntry).href);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function localLinks(markdownPath) {
  const content = fs.readFileSync(markdownPath, "utf8");
  return [...content.matchAll(/\]\(([^)]+)\)/g)]
    .map(match => match[1].trim().replace(/^<|>$/g, ""))
    .filter(link => link && !/^(?:https?:|mailto:|#)/i.test(link));
}

function checkMarkdownLinks() {
  const files = [
    path.join(projectRoot, "README.md"),
    path.join(projectRoot, "文档", "项目状态.md"),
    ...[
      "README.md",
      "01_项目成果总览.md",
      "02_作品集案例.md",
      "03_关键决策与取舍.md",
      "04_指标口径与真实证据.md",
      "05_五分钟演示脚本.md",
      "06_面试问答与项目讲法.md",
      "07_交付索引与复现说明.md"
    ].map(name => path.join(stageRoot, name))
  ];
  const failures = [];
  for (const filePath of files) {
    assert(fs.existsSync(filePath), `Missing markdown file: ${filePath}`);
    for (const link of localLinks(filePath)) {
      const clean = decodeURIComponent(link.split("#")[0]);
      if (!clean) continue;
      const target = path.resolve(path.dirname(filePath), clean);
      if (!fs.existsSync(target)) {
        failures.push({
          source: path.relative(projectRoot, filePath),
          link,
          target: path.relative(projectRoot, target)
        });
      }
    }
  }
  assert(failures.length === 0, `Broken local Markdown links: ${JSON.stringify(failures, null, 2)}`);
  return files.length;
}

function checkHtmlLinks(filePath, {requireSimulation = true} = {}) {
  const html = fs.readFileSync(filePath, "utf8");
  const links = [...html.matchAll(/(?:href|src)="([^"]+)"/g)]
    .map(match => match[1])
    .filter(link => link && !link.startsWith("#") && !/^(?:https?:|mailto:|tel:)/i.test(link));
  const failures = [];
  for (const link of links) {
    const target = path.resolve(path.dirname(filePath), decodeURIComponent(link.split("#")[0]));
    if (!fs.existsSync(target)) failures.push(link);
  }
  assert(
    failures.length === 0,
    `Broken local HTML links in ${path.relative(projectRoot, filePath)}: ${failures.join(", ")}`
  );
  assert(!/<script\s+src=|<iframe|<video/i.test(html), "Portfolio must not load remote scripts or video");
  assert(!/面试|项目讲法/.test(html), "Public portfolio must not expose interview-preparation material");
  assert(
    !/href="[^"]+\.(?:md|json)(?:[#?][^"]*)?"/i.test(html),
    "Public portfolio must not expose internal Markdown or raw JSON documents"
  );
  if (requireSimulation) {
    assert(/模拟项目/.test(html) && /内部学习原型/.test(html), "Portfolio simulation label is missing");
  }
  assert(/@media\s+print/i.test(html), "Portfolio print stylesheet is missing");
  return links.length;
}

function checkLauncher() {
  const launcher = path.join(projectRoot, "打开作品集.cmd");
  assert(fs.existsSync(launcher), "Missing one-click launcher");
  const content = fs.readFileSync(launcher, "utf8");
  assert(content.includes("作品集\\index.html"), "Launcher does not open the personal portfolio");
  assert(content.includes("阶段3B_高保真交互原型\\index.html"), "Launcher does not open the prototype");
  assert(!content.includes("%USERPROFILE%") && !content.includes("C:\\Users\\"), "Launcher leaks a personal path");
}

async function checkPage(page, viewport, label, screenshotName, fullScreenshotName) {
  await page.setViewportSize(viewport);
  await page.emulateMedia({media: "screen"});
  await page.goto(pathToFileURL(portfolioPath).href, {waitUntil: "load"});
  await page.evaluate(() => document.fonts?.ready);
  await page.evaluate(() => {
    for (const image of document.images) image.loading = "eager";
  });
  await page.waitForFunction(() =>
    [...document.images].every(image => image.complete && image.naturalWidth > 0),
    {timeout: 10000}
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(850);
  const state = await page.evaluate(() => {
    const images = [...document.images].map(image => ({
      src: image.getAttribute("src"),
      complete: image.complete,
      naturalWidth: image.naturalWidth
    }));
    const overflow = [...document.querySelectorAll("body *")]
      .filter(element => !element.closest(".data-table-wrap"))
      .map(element => ({
        tag: element.tagName,
        className: typeof element.className === "string" ? element.className : "",
        rect: element.getBoundingClientRect()
      }))
      .filter(item => item.rect.width > 0 &&
        (item.rect.left < -1 || item.rect.right > window.innerWidth + 1))
      .slice(0, 10)
      .map(item => ({
        tag: item.tag,
        className: item.className,
        left: Math.round(item.rect.left),
        right: Math.round(item.rect.right)
      }));
    return {
      viewport_width: window.innerWidth,
      document_width: document.documentElement.scrollWidth,
      body_width: document.body.scrollWidth,
      images,
      overflow,
      simulation_label_visible: document.body.innerText.includes("模拟项目"),
      h1_count: document.querySelectorAll("h1").length,
      h1_text: document.querySelector("h1")?.innerText.trim() || "",
      missing_alt_count: [...document.images].filter(image => !image.hasAttribute("alt")).length,
      main_project_visible: document.body.innerText.includes("售后知识协作"),
      primary_landmarks: document.querySelectorAll("header, nav, main, footer").length,
      hero_metric_count: document.querySelectorAll(".metrics .metric").length,
      project_result_count: document.querySelectorAll(".result-band .result").length,
      visible_work_count: document.querySelectorAll(".work-list .work-row").length,
      work_link_count: document.querySelectorAll(".work-list a.work-row").length,
      external_work_link_count: document.querySelectorAll('.work-list a.work-row[href^="https://"]').length,
      local_work_link_count: document.querySelectorAll('.work-list a.work-row[href="问需案例.html"]').length,
      external_work_links_safe: [...document.querySelectorAll('.work-list a.work-row[href^="https://"]')].every(link =>
        link.target === "_blank" &&
        /^https:\/\//.test(link.href) &&
        link.rel.includes("noopener") &&
        link.rel.includes("noreferrer")
      ),
      work_cta_count: document.querySelectorAll(".work-list .work-cta").length,
      archive_count: document.querySelectorAll(".archive-grid .archive-item").length,
      archive_link_count: document.querySelectorAll('.archive-grid a.archive-item[href^="其他实践.html#"]').length,
      capabilities_background: getComputedStyle(document.querySelector(".capabilities")).backgroundColor,
      flagship_background: getComputedStyle(document.querySelector(".flagship")).backgroundColor,
      contact_background: getComputedStyle(document.querySelector(".closing")).backgroundColor
    };
  });
  assert(state.document_width <= state.viewport_width + 1, `${label} has horizontal page overflow`);
  assert(state.overflow.length === 0, `${label} has visible horizontal overflow: ${JSON.stringify(state.overflow)}`);
  assert(state.images.every(image => image.complete && image.naturalWidth > 0), `${label} has a missing image`);
  assert(state.simulation_label_visible, `${label} does not show the simulation boundary`);
  assert(state.h1_count === 1 && state.h1_text === "李昕昊", `${label} must have one primary page heading`);
  assert(state.missing_alt_count === 0, `${label} has images without alternative text`);
  assert(state.main_project_visible, `${label} does not identify the flagship project`);
  assert(state.primary_landmarks >= 4, `${label} is missing primary page landmarks`);
  assert(state.hero_metric_count === 3, `${label} must show one key proof per featured project`);
  assert(state.project_result_count === 3, `${label} must keep the flagship result band focused`);
  assert(state.visible_work_count === 2, `${label} must show two secondary projects`);
  assert(state.work_link_count === 2, `${label} secondary projects must be clickable`);
  assert(state.external_work_link_count === 1, `${label} must retain the live direct-helper demo`);
  assert(state.local_work_link_count === 1, `${label} must open the askneed case study`);
  assert(state.external_work_links_safe, `${label} secondary project links must open external sites safely`);
  assert(state.work_cta_count === 2, `${label} secondary projects must show visible CTA labels`);
  assert(state.archive_count === 2, `${label} must keep other practices in the archive`);
  assert(state.archive_link_count === 2, `${label} archived practices must be clickable`);
  assert(
    state.flagship_background === state.capabilities_background,
    `${label} flagship and method sections must share one light surface`
  );
  assert(
    state.contact_background !== state.flagship_background,
    `${label} contact section must retain the closing dark surface`
  );
  await page.screenshot({
    path: path.join(screenshotsRoot, screenshotName),
    fullPage: false
  });
  await page.screenshot({
    path: path.join(screenshotsRoot, fullScreenshotName),
    fullPage: true
  });
  return state;
}

async function checkCasePage(page, viewport, label, screenshotName, fullScreenshotName) {
  await page.setViewportSize(viewport);
  await page.emulateMedia({media: "screen"});
  await page.goto(pathToFileURL(projectCasePath).href, {waitUntil: "load"});
  await page.evaluate(() => document.fonts?.ready);
  await page.evaluate(() => {
    for (const image of document.images) image.loading = "eager";
  });
  await page.waitForFunction(() =>
    [...document.images].every(image => image.complete && image.naturalWidth > 0),
    {timeout: 10000}
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);

  const state = await page.evaluate(() => {
    const overflow = [...document.querySelectorAll("body *")]
      .filter(element => !element.closest(".table-wrap"))
      .map(element => ({
        tag: element.tagName,
        className: typeof element.className === "string" ? element.className : "",
        rect: element.getBoundingClientRect()
      }))
      .filter(item => item.rect.width > 0 &&
        (item.rect.left < -1 || item.rect.right > window.innerWidth + 1))
      .slice(0, 10)
      .map(item => ({
        tag: item.tag,
        className: item.className,
        left: Math.round(item.rect.left),
        right: Math.round(item.rect.right)
      }));
    return {
      viewport_width: window.innerWidth,
      document_width: document.documentElement.scrollWidth,
      overflow,
      image_count: document.images.length,
      missing_image_count: [...document.images]
        .filter(image => !image.complete || image.naturalWidth === 0).length,
      missing_alt_count: [...document.images].filter(image => !image.hasAttribute("alt")).length,
      simulation_label_visible: document.body.innerText.includes("模拟项目"),
      h1_count: document.querySelectorAll("h1").length,
      h1_text: document.querySelector("h1")?.innerText.trim() || "",
      section_count: document.querySelectorAll("main .section").length,
      figure_count: document.querySelectorAll("figure").length,
      result_count: document.querySelectorAll(".result-grid .result").length,
      prototype_link_count: document.querySelectorAll('a[href="https://xinhao-after-sales.pages.dev/"]').length,
      rail_display: getComputedStyle(document.querySelector(".rail")).display,
      mobile_toc_display: getComputedStyle(document.querySelector(".mobile-toc")).display
    };
  });

  assert(state.document_width <= state.viewport_width + 1, `${label} case page has horizontal overflow`);
  assert(state.overflow.length === 0, `${label} case page has visible horizontal overflow: ${JSON.stringify(state.overflow)}`);
  assert(state.missing_image_count === 0, `${label} case page has a missing image`);
  assert(state.missing_alt_count === 0, `${label} case page has images without alternative text`);
  assert(state.simulation_label_visible, `${label} case page does not show the simulation boundary`);
  assert(
    state.h1_count === 1 && state.h1_text === "让每一次售后建议，都能被验证。",
    `${label} case page must have one focused heading`
  );
  assert(state.section_count === 5, `${label} case page must use the five-part narrative`);
  assert(state.figure_count === 3, `${label} case page must focus on three evidence screenshots`);
  assert(state.result_count === 3, `${label} case page must keep the evidence summary focused`);
  assert(state.prototype_link_count === 2, `${label} case page must link to the live prototype`);
  assert(state.simulation_label_visible, `${label} case page must state project boundaries`);

  if (viewport.width > 1020) {
    assert(state.rail_display !== "none", `${label} case page must show desktop chapter navigation`);
    assert(state.mobile_toc_display === "none", `${label} case page must hide mobile navigation on desktop`);
  } else {
    assert(state.rail_display === "none", `${label} case page must hide the desktop rail on mobile`);
    assert(state.mobile_toc_display !== "none", `${label} case page must show mobile chapter navigation`);
  }

  await page.screenshot({
    path: path.join(screenshotsRoot, screenshotName),
    fullPage: false
  });
  await page.screenshot({
    path: path.join(screenshotsRoot, fullScreenshotName),
    fullPage: true
  });
  return state;
}

async function checkContentPage(
  page,
  {
    viewport,
    label,
    filePath,
    expectedHeading,
    screenshotName,
    fullScreenshotName,
    expectedSections = 0,
    expectedCases = 0
  }
) {
  await page.setViewportSize(viewport);
  await page.emulateMedia({media: "screen"});
  await page.goto(pathToFileURL(filePath).href, {waitUntil: "load"});
  await page.evaluate(() => document.fonts?.ready);
  await page.evaluate(() => {
    for (const image of document.images) image.loading = "eager";
  });
  await page.waitForFunction(() =>
    [...document.images].every(image => image.complete && image.naturalWidth > 0),
    {timeout: 10000}
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(350);

  const state = await page.evaluate(() => {
    const overflow = [...document.querySelectorAll("body *")]
      .filter(element => !element.closest(".table-wrap"))
      .map(element => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName,
          className: typeof element.className === "string" ? element.className : "",
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width)
        };
      })
      .filter(item => item.width > 0 &&
        (item.left < -1 || item.right > window.innerWidth + 1))
      .slice(0, 10);

    return {
      viewport_width: window.innerWidth,
      document_width: document.documentElement.scrollWidth,
      overflow,
      image_count: document.images.length,
      missing_image_count: [...document.images]
        .filter(image => !image.complete || image.naturalWidth === 0).length,
      missing_alt_count: [...document.images].filter(image => !image.hasAttribute("alt")).length,
      h1_count: document.querySelectorAll("h1").length,
      h1_text: document.querySelector("h1")?.innerText.trim() || "",
      section_count: document.querySelectorAll("main .section").length,
      case_count: document.querySelectorAll("main .case").length
    };
  });

  assert(state.document_width <= state.viewport_width + 1, `${label} content page has horizontal overflow`);
  assert(state.overflow.length === 0, `${label} content page has visible horizontal overflow: ${JSON.stringify(state.overflow)}`);
  assert(state.missing_image_count === 0, `${label} content page has a missing image`);
  assert(state.missing_alt_count === 0, `${label} content page has images without alternative text`);
  assert(state.h1_count === 1 && state.h1_text === expectedHeading, `${label} content page heading is incorrect`);
  assert(state.section_count === expectedSections, `${label} content page has an unexpected section count`);
  assert(state.case_count === expectedCases, `${label} content page has an unexpected case count`);

  await page.screenshot({
    path: path.join(screenshotsRoot, screenshotName),
    fullPage: false
  });
  await page.screenshot({
    path: path.join(screenshotsRoot, fullScreenshotName),
    fullPage: true
  });
  return state;
}

const markdownFileCount = checkMarkdownLinks();
const htmlLinkCount =
  checkHtmlLinks(portfolioPath) +
  checkHtmlLinks(projectCasePath) +
  checkHtmlLinks(askneedCasePath, {requireSimulation: false}) +
  checkHtmlLinks(otherPracticePath, {requireSimulation: false});
checkLauncher();

const browser = await chromium.launch({
  executablePath:
    process.env.CODEX_BROWSER_EXECUTABLE ||
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: true
});
const context = await browser.newContext({viewport: {width: 1440, height: 1100}});
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));
let results;
try {
  const desktop = await checkPage(
    page,
    {width: 1440, height: 1100},
    "desktop",
    "portfolio-desktop-1440.png",
    "portfolio-desktop-full.png"
  );
  const mobile = await checkPage(
    page,
    {width: 390, height: 844},
    "mobile",
    "portfolio-mobile-390.png",
    "portfolio-mobile-full.png"
  );
  const caseDesktop = await checkCasePage(
    page,
    {width: 1440, height: 1100},
    "desktop",
    "case-desktop-1440.png",
    "case-desktop-full.png"
  );
  const caseMobile = await checkCasePage(
    page,
    {width: 390, height: 844},
    "mobile",
    "case-mobile-390.png",
    "case-mobile-full.png"
  );
  const askneedDesktop = await checkContentPage(page, {
    viewport: {width: 1440, height: 1100},
    label: "desktop",
    filePath: askneedCasePath,
    expectedHeading: "把装修需求问全、问清、问定。",
    screenshotName: "askneed-desktop-1440.png",
    fullScreenshotName: "askneed-desktop-full.png",
    expectedSections: 5
  });
  const askneedMobile = await checkContentPage(page, {
    viewport: {width: 390, height: 844},
    label: "mobile",
    filePath: askneedCasePath,
    expectedHeading: "把装修需求问全、问清、问定。",
    screenshotName: "askneed-mobile-390.png",
    fullScreenshotName: "askneed-mobile-full.png",
    expectedSections: 5
  });
  const otherPracticeDesktop = await checkContentPage(page, {
    viewport: {width: 1440, height: 1100},
    label: "desktop",
    filePath: otherPracticePath,
    expectedHeading: "验证流程编排，也验证产品分析。",
    screenshotName: "other-practice-desktop-1440.png",
    fullScreenshotName: "other-practice-desktop-full.png",
    expectedCases: 2
  });
  const otherPracticeMobile = await checkContentPage(page, {
    viewport: {width: 390, height: 844},
    label: "mobile",
    filePath: otherPracticePath,
    expectedHeading: "验证流程编排，也验证产品分析。",
    screenshotName: "other-practice-mobile-390.png",
    fullScreenshotName: "other-practice-mobile-full.png",
    expectedCases: 2
  });
  await page.setViewportSize({width: 794, height: 1123});
  await page.emulateMedia({media: "print"});
  await page.goto(pathToFileURL(portfolioPath).href, {waitUntil: "load"});
  const printLayout = await page.evaluate(() => ({
    viewport_width: window.innerWidth,
    document_width: document.documentElement.scrollWidth,
    simulation_label_visible: document.body.innerText.includes("模拟项目")
  }));
  assert(printLayout.document_width <= printLayout.viewport_width + 1, "Print layout has horizontal overflow");
  assert(printLayout.simulation_label_visible, "Print layout hides the simulation boundary");
  const pdfPath = path.join(stageRoot, "evidence", "portfolio-print-preview.pdf");
  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    margin: {top: "12mm", right: "12mm", bottom: "12mm", left: "12mm"}
  });
  const pdf = fs.readFileSync(pdfPath);
  assert(pdf.subarray(0, 5).toString() === "%PDF-", "Print preview is not a valid PDF");
  results = {
    captured_at: new Date().toISOString(),
    status: "PASSED",
    markdown_file_count: markdownFileCount,
    html_local_link_count: htmlLinkCount,
    portfolio_entry: path.relative(projectRoot, portfolioPath),
    project_case: path.relative(projectRoot, projectCasePath),
    launcher_verified: true,
    desktop,
    mobile,
    case_desktop: caseDesktop,
    case_mobile: caseMobile,
    askneed_desktop: askneedDesktop,
    askneed_mobile: askneedMobile,
    other_practice_desktop: otherPracticeDesktop,
    other_practice_mobile: otherPracticeMobile,
    print: {
      ...printLayout,
      pdf_bytes: pdf.length
    },
    page_errors: pageErrors
  };
  assert(pageErrors.length === 0, `Portfolio JavaScript errors: ${pageErrors.join("; ")}`);
} finally {
  await context.close();
  await browser.close();
}

fs.writeFileSync(
  path.join(stageRoot, "evidence", "portfolio-browser-check.json"),
  `${JSON.stringify(results, null, 2)}\n`,
  "utf8"
);
console.log(JSON.stringify(results, null, 2));
