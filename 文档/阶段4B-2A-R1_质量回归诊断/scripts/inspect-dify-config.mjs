import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { chromium } from "file:///C:/Users/%E6%9D%8E%E6%98%95%E6%98%8A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const deliveryRoot = path.resolve(here, "..");
const profileRoot = "C:\\Users\\李昕昊\\AppData\\Local\\Temp\\project1-dify-session-93c3dd7d16e648118f3b9a5381a2b841\\dify-edge-live";
const appId = "4da4b901-0f6e-4f35-b89e-8170d83bb7e0";
const outputPath = path.join(deliveryRoot, "baseline", "dify-current-config.json");
const screenshotPath = path.join(deliveryRoot, "baseline", "dify-current-config.png");

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
    const appResponse = await fetch(`/console/api/apps/${targetAppId}`);
    const text = await response.text();
    const appText = await appResponse.text();
    let appBody = null;
    try { appBody = JSON.parse(appText); } catch {}
    if (!response.ok) return {status: response.status, error: text.slice(0, 300)};
    const body = JSON.parse(text);
    return {
      status: response.status,
      app_status: appResponse.status,
      app_meta: appBody ? {
        name: appBody.name,
        mode: appBody.mode,
        updated_at: appBody.updated_at,
        workflow_keys: appBody.workflow && typeof appBody.workflow === "object"
          ? Object.keys(appBody.workflow).sort()
          : [],
        workflow_version: appBody.workflow?.version || null,
        workflow_updated_at: appBody.workflow?.updated_at || null
      } : null,
      resource_urls: performance.getEntriesByType("resource")
        .map(entry => entry.name)
        .filter(url => url.includes(`/console/api/apps/${targetAppId}/workflows`)),
      graph: {
        nodes: (body.graph?.nodes || []).map(node => ({
          id: node.id,
          type: node.data?.type,
          title: node.data?.title,
          model: node.data?.model || null,
          prompt_template: node.data?.prompt_template || null,
          prompt_text: node.data?.prompt_template?.text || "",
          prompt_config: node.data?.prompt_config || null,
          context: node.data?.context || null,
          dataset_ids: node.data?.dataset_ids || null,
          retrieval_mode: node.data?.retrieval_mode || null,
          multiple_retrieval_config: node.data?.multiple_retrieval_config || null,
          reranking_enable: node.data?.reranking_enable ?? null,
          reranking_mode: node.data?.reranking_mode || null,
          reranking_model: node.data?.reranking_model || null,
          top_k: node.data?.top_k ?? null,
          score_threshold: node.data?.score_threshold ?? null
        }))
      },
      environment_variables: (body.environment_variables || []).map(item => ({
        name: item.name,
        value_type: item.value_type
      }))
    };
  }, appId);
  const pageText = await page.locator("body").innerText();
  const versionMatches = [...pageText.matchAll(/#\s*(\d+)/g)].map(match => Number(match[1]));
  const promptNodes = result.graph?.nodes?.filter(node => node.prompt_template) || [];
  const promptText = promptNodes[0]?.prompt_text || "";
  const promptPath = path.join(deliveryRoot, "baseline", "dify-current-prompt.txt");
  const evidence = {
    captured_at: new Date().toISOString(),
    app_id: appId,
    source: "Dify Console draft API (read-only)",
    draft_http_status: result.status,
    visible_published_version: versionMatches.length ? Math.max(...versionMatches) : null,
    prompt_nodes: promptNodes.map(node => ({
      title: node.title,
      prompt_template_sha256: crypto.createHash("sha256").update(JSON.stringify(node.prompt_template)).digest("hex"),
      prompt_text_sha256: crypto.createHash("sha256").update(node.prompt_text || "").digest("hex"),
      prompt_text_file: "dify-current-prompt.txt",
      model: node.model,
      prompt_config: node.prompt_config
    })),
    knowledge_nodes: (result.graph?.nodes || []).filter(node =>
      node.dataset_ids || node.retrieval_mode || node.multiple_retrieval_config
    ),
    graph_nodes: result.graph?.nodes || [],
    app_meta: result.app_meta,
    app_http_status: result.app_status,
    workflow_resource_urls: result.resource_urls,
    safe_page_top_version_candidates: [...new Set(versionMatches)].sort((a, b) => b - a)
  };
  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  fs.writeFileSync(promptPath, `${promptText}\n`, "utf8");
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  await page.screenshot({path: screenshotPath, fullPage: true});
  console.log(JSON.stringify({
    status: result.status,
    visibleVersion: evidence.visible_published_version,
    promptNodes: evidence.prompt_nodes.length,
    knowledgeNodes: evidence.knowledge_nodes.length,
    outputPath,
    screenshotPath
  }, null, 2));
} finally {
  await context.close();
}
