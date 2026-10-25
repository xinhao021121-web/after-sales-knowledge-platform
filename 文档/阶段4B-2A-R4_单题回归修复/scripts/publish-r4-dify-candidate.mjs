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
    const headers = csrfToken ? {"X-CSRF-Token": decodeURIComponent(csrfToken)} : {};
    const draftResponse = await fetch(`/console/api/apps/${targetAppId}/workflows/draft`);
    const draft = await draftResponse.json();
    const prompt = draft.graph?.nodes
      ?.find(node => node.data?.type === "llm")
      ?.data?.prompt_template?.find(item => item.role === "system")?.text;
    const topK = draft.graph?.nodes
      ?.filter(node => node.data?.type === "knowledge-retrieval")
      ?.map(node => node.data.multiple_retrieval_config?.top_k);
    if (!prompt?.includes("不得要求用户提供、粘贴或补充已检索文档") ||
        !prompt.includes("不得引用“目标一/目标二”")) {
      return {stage: "PREFLIGHT", status: 0, topK};
    }
    const publishResponse = await fetch(`/console/api/apps/${targetAppId}/workflows/publish`, {
      method: "POST",
      headers: {...headers, "Content-Type": "application/json"},
      body: JSON.stringify({
        marked_name: "R4-CANDIDATE-VISIBLE",
        marked_comment: "R4: single-target preservation and self-contained visible actions"
      })
    });
    const publishText = await publishResponse.text();
    const versionsResponse = await fetch(
      `/console/api/apps/${targetAppId}/workflows?page=1&limit=20`,
      {headers}
    );
    const versions = versionsResponse.ok ? await versionsResponse.json() : null;
    return {
      stage: publishResponse.ok ? "PUBLISHED" : "PUBLISH_FAILED",
      status: publishResponse.status,
      body: publishText,
      versions_status: versionsResponse.status,
      versions: (versions?.items || []).slice(0, 4).map(item => ({
        version_number: item.version_number,
        marked_name: item.marked_name,
        knowledge_top_k: (item.graph?.nodes || [])
          .filter(node => node.data?.type === "knowledge-retrieval")
          .map(node => node.data.multiple_retrieval_config?.top_k)
      }))
    };
  }, appId);
  await page.waitForTimeout(1500);
  await page.screenshot({
    path: path.join(deliveryRoot, "screenshots", "DIFY_R4_CANDIDATE_1440.png"),
    fullPage: true
  });
  fs.writeFileSync(
    path.join(deliveryRoot, "evidence", "dify-candidate-publish-r4.json"),
    `${JSON.stringify(result, null, 2)}\n`,
    "utf8"
  );
  if (result.stage !== "PUBLISHED") throw new Error(JSON.stringify(result));
  console.log(JSON.stringify(result, null, 2));
} finally {
  await context.close();
}
