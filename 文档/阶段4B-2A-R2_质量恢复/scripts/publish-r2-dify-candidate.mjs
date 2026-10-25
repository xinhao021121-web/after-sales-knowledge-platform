import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "file:///C:/Users/%E6%9D%8E%E6%98%95%E6%98%8A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const deliveryRoot = path.resolve(here, "..");
const appId = "4da4b901-0f6e-4f35-b89e-8170d83bb7e0";
const profileRoot = process.env.DIFY_PROFILE_ROOT ||
  "C:\\Users\\李昕昊\\AppData\\Local\\Temp\\project1-dify-session-93c3dd7d16e648118f3b9a5381a2b841\\dify-edge-live";

const context = await chromium.launchPersistentContext(profileRoot, {
  executablePath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  headless: true,
  viewport: {width: 1600, height: 1100}
});
const page = context.pages()[0] || await context.newPage();
try {
  await page.goto(`https://cloud.dify.ai/app/${appId}/workflow`, {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });
  await page.waitForTimeout(7000);
  const result = await page.evaluate(async targetAppId => {
    const csrfToken = document.cookie
      .split(";")
      .map(item => item.trim())
      .find(item => item.startsWith("__Host-csrf_token="))
      ?.slice("__Host-csrf_token=".length);
    const draftResponse = await fetch(`/console/api/apps/${targetAppId}/workflows/draft`);
    const draft = await draftResponse.json();
    const topK = (draft.graph?.nodes || [])
      .filter(node => node.data?.type === "knowledge-retrieval")
      .map(node => node.data.multiple_retrieval_config?.top_k);
    const model = (draft.graph?.nodes || [])
      .find(node => node.data?.type === "llm")?.data?.model?.name;
    if (!draftResponse.ok || topK.some(value => value !== 10) || model !== "deepseek-v4-pro") {
      return {stage: "PREFLIGHT", status: draftResponse.status, topK, model};
    }
    const response = await fetch(`/console/api/apps/${targetAppId}/workflows/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(csrfToken ? {"X-CSRF-Token": decodeURIComponent(csrfToken)} : {})
      },
      body: JSON.stringify({
        marked_name: "R2-CANDIDATE-Q10",
        marked_comment: "R2: document-diverse retrieval candidate and actionable-answer prompt"
      })
    });
    const text = await response.text();
    let body = null;
    try { body = JSON.parse(text); } catch {}
    const versionsResponse = await fetch(
      `/console/api/apps/${targetAppId}/workflows?page=1&limit=20`
    );
    const versionsText = await versionsResponse.text();
    let versions = null;
    try { versions = JSON.parse(versionsText); } catch {}
    return {
      stage: response.ok ? "PUBLISHED" : "PUBLISH_FAILED",
      status: response.status,
      body,
      versions_status: versionsResponse.status,
      latest_versions: (versions?.items || []).slice(0, 4).map(item => ({
        id: item.id,
        version: item.version,
        version_number: item.version_number,
        marked_name: item.marked_name,
        marked_comment: item.marked_comment
      }))
    };
  }, appId);
  await page.waitForTimeout(2000);
  await page.screenshot({
    path: path.join(deliveryRoot, "screenshots", "DIFY_R2_CANDIDATE_VERSION_1440.png"),
    fullPage: true
  });
  fs.writeFileSync(
    path.join(deliveryRoot, "evidence", "dify-candidate-publish-result.json"),
    `${JSON.stringify(result, null, 2)}\n`,
    "utf8"
  );
  if (result.stage !== "PUBLISHED") throw new Error(JSON.stringify(result));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await context.close();
}
