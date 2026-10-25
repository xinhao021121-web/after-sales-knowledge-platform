import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
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
    const versionsResponse = await fetch(
      `/console/api/apps/${targetAppId}/workflows?page=1&limit=20`,
      {headers}
    );
    const versions = versionsResponse.ok ? await versionsResponse.json() : null;
    const promptNode = draft.graph?.nodes?.find(node => node.data?.type === "llm");
    const promptText = promptNode?.data?.prompt_template?.find(item => item.role === "system")?.text || "";
    return {
      captured_at: new Date().toISOString(),
      app_id: targetAppId,
      source: "Dify Console draft and version APIs (read-only)",
      model: promptNode?.data?.model,
      prompt_text: promptText,
      knowledge_nodes: (draft.graph?.nodes || [])
        .filter(node => node.data?.type === "knowledge-retrieval")
        .map(node => ({
          id: node.id,
          dataset_ids: node.data.dataset_ids || [],
          top_k: node.data.multiple_retrieval_config?.top_k,
          reranking_model: node.data.multiple_retrieval_config?.reranking_model,
          weights: node.data.multiple_retrieval_config?.weights
        })),
      versions_http_status: versionsResponse.status,
      workflow_versions: (versions?.items || []).slice(0, 6).map(item => ({
        version_number: item.version_number,
        marked_name: item.marked_name,
        marked_comment: item.marked_comment,
        created_at: item.created_at,
        knowledge_top_k: (item.graph?.nodes || [])
          .filter(node => node.data?.type === "knowledge-retrieval")
          .map(node => node.data.multiple_retrieval_config?.top_k)
      }))
    };
  }, appId);
  result.prompt_sha256 = crypto.createHash("sha256").update(result.prompt_text).digest("hex");
  fs.writeFileSync(
    path.join(deliveryRoot, "evidence", "dify-config-after-r4.json"),
    `${JSON.stringify(result, null, 2)}\n`,
    "utf8"
  );
  await page.screenshot({
    path: path.join(deliveryRoot, "screenshots", "DIFY_R4_FINAL_1440.png"),
    fullPage: true
  });
  console.log(JSON.stringify({
    model: result.model?.name,
    topK: result.knowledge_nodes.map(node => node.top_k),
    promptSha256: result.prompt_sha256,
    latestPublishedVersion: result.workflow_versions.find(item => item.version_number)?.version_number
  }, null, 2));
} finally {
  await context.close();
}
