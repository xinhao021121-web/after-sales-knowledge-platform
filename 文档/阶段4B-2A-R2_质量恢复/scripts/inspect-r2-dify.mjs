import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { chromium } from "file:///C:/Users/%E6%9D%8E%E6%98%95%E6%98%8A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const deliveryRoot = path.resolve(here, "..");
const outputName = process.argv[2] || "dify-config-current-r2.json";
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
    const response = await fetch(`/console/api/apps/${targetAppId}/workflows/draft`);
    const text = await response.text();
    if (!response.ok) return {status: response.status, error: text.slice(0, 300)};
    const body = JSON.parse(text);
    const csrfToken = document.cookie
      .split(";")
      .map(item => item.trim())
      .find(item => item.startsWith("__Host-csrf_token="))
      ?.slice("__Host-csrf_token=".length);
    const versionResponse = await fetch(
      `/console/api/apps/${targetAppId}/workflows?page=1&limit=20`,
      {headers: csrfToken ? {"X-CSRF-Token": decodeURIComponent(csrfToken)} : {}}
    );
    const versionBody = versionResponse.ok ? await versionResponse.json() : null;
    return {
      status: response.status,
      body_keys: Object.keys(body).sort(),
      graph: body.graph,
      features: body.features,
      environment_variables: body.environment_variables || [],
      conversation_variables: body.conversation_variables || [],
      versions_status: versionResponse.status,
      workflow_versions: (versionBody?.items || []).slice(0, 6).map(item => ({
        id: item.id,
        version: item.version,
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
  if (result.status !== 200) throw new Error(`Dify draft HTTP ${result.status}: ${result.error}`);

  const graphNodes = result.graph?.nodes || [];
  const promptNode = graphNodes.find(node => node.data?.type === "llm");
  const knowledgeNodes = graphNodes.filter(node => node.data?.type === "knowledge-retrieval");
  const promptText = promptNode?.data?.prompt_template?.find(item => item.role === "system")?.text || "";
  const evidence = {
    captured_at: new Date().toISOString(),
    app_id: appId,
    source: "Dify Console draft API (read-only)",
    draft_http_status: result.status,
    draft_body_keys: result.body_keys,
    prompt_nodes: promptNode ? [{
      id: promptNode.id,
      title: promptNode.data.title,
      prompt_template_sha256: crypto.createHash("sha256")
        .update(JSON.stringify(promptNode.data.prompt_template))
        .digest("hex"),
      prompt_text_sha256: crypto.createHash("sha256").update(promptText).digest("hex"),
      model: promptNode.data.model,
      prompt_text: promptText
    }] : [],
    knowledge_nodes: knowledgeNodes.map(node => ({
      id: node.id,
      title: node.data.title,
      dataset_ids: node.data.dataset_ids || [],
      retrieval_mode: node.data.retrieval_mode,
      multiple_retrieval_config: node.data.multiple_retrieval_config,
      top_k: node.data.top_k ?? null
    })),
    features: result.features,
    environment_variables: result.environment_variables.map(item => ({
      name: item.name,
      value_type: item.value_type
    })),
    conversation_variables: result.conversation_variables.map(item => ({
      name: item.name,
      value_type: item.value_type
    })),
    versions_http_status: result.versions_status,
    workflow_versions: result.workflow_versions
  };
  const outputPath = path.join(deliveryRoot, "evidence", outputName);
  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  const screenshotPath = path.join(deliveryRoot, "screenshots", "DIFY_R2_FINAL_1440.png");
  await page.screenshot({path: screenshotPath, fullPage: true});
  console.log(JSON.stringify({
    outputPath,
    screenshotPath,
    promptModel: promptNode?.data?.model?.name,
    topK: knowledgeNodes.map(node => node.data?.multiple_retrieval_config?.top_k),
    promptSha256: evidence.prompt_nodes[0]?.prompt_text_sha256,
    latestPublishedVersion: result.workflow_versions.find(item => item.version_number)?.version_number
  }, null, 2));
} finally {
  await context.close();
}
