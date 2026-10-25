import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "file:///C:/Users/%E6%9D%8E%E6%98%95%E6%98%8A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const deliveryRoot = path.resolve(here, "..");
const appId = "4da4b901-0f6e-4f35-b89e-8170d83bb7e0";
const profileRoot = process.env.DIFY_PROFILE_ROOT ||
  "C:\\Users\\李昕昊\\AppData\\Local\\Temp\\project1-dify-session-93c3dd7d16e648118f3b9a5381a2b841\\dify-edge-live";
const promptText = fs.readFileSync(
  path.join(deliveryRoot, "configs", "r2-system-prompt.txt"),
  "utf8"
).trim();

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
  const result = await page.evaluate(async ({targetAppId, nextPrompt}) => {
    const draftResponse = await fetch(`/console/api/apps/${targetAppId}/workflows/draft`);
    const draftText = await draftResponse.text();
    if (!draftResponse.ok) {
      return {stage: "GET_DRAFT", status: draftResponse.status, body: draftText.slice(0, 500)};
    }
    const draft = JSON.parse(draftText);
    const promptNode = (draft.graph?.nodes || []).find(node => node.data?.type === "llm");
    const knowledgeNodes = (draft.graph?.nodes || []).filter(node => node.data?.type === "knowledge-retrieval");
    if (!promptNode || knowledgeNodes.length === 0) {
      return {stage: "VALIDATE", status: 0, body: "Prompt or knowledge node missing"};
    }
    if (promptNode.data?.model?.name !== "deepseek-v4-pro") {
      return {stage: "VALIDATE", status: 0, body: `Unexpected model: ${promptNode.data?.model?.name}`};
    }
    const systemPrompt = promptNode.data.prompt_template.find(item => item.role === "system");
    if (!systemPrompt) {
      return {stage: "VALIDATE", status: 0, body: "System prompt missing"};
    }
    systemPrompt.text = nextPrompt;
    for (const node of knowledgeNodes) {
      if (!node.data.multiple_retrieval_config) {
        return {stage: "VALIDATE", status: 0, body: `Retrieval config missing: ${node.id}`};
      }
      node.data.multiple_retrieval_config.top_k = 10;
    }
    const payload = {
      graph: draft.graph,
      features: draft.features || {},
      hash: draft.hash
    };
    const updateResponse = await fetch(`/console/api/apps/${targetAppId}/workflows/draft`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(payload)
    });
    const updateText = await updateResponse.text();
    if (!updateResponse.ok) {
      return {stage: "PUT_DRAFT", status: updateResponse.status, body: updateText.slice(0, 800)};
    }
    const verifyResponse = await fetch(`/console/api/apps/${targetAppId}/workflows/draft`);
    const verifyText = await verifyResponse.text();
    const verified = verifyResponse.ok ? JSON.parse(verifyText) : null;
    const verifiedPrompt = verified?.graph?.nodes
      ?.find(node => node.data?.type === "llm")
      ?.data?.prompt_template?.find(item => item.role === "system")?.text;
    const verifiedTopK = verified?.graph?.nodes
      ?.filter(node => node.data?.type === "knowledge-retrieval")
      ?.map(node => node.data.multiple_retrieval_config?.top_k);
    return {
      stage: "VERIFIED",
      status: verifyResponse.status,
      update_status: updateResponse.status,
      prompt_sha256_matches: verifiedPrompt === nextPrompt,
      top_k: verifiedTopK,
      draft_body_keys: Object.keys(draft).sort()
    };
  }, {targetAppId: appId, nextPrompt: promptText});

  const screenshotPath = path.join(deliveryRoot, "screenshots", "DIFY_R2_DRAFT_1440.png");
  fs.mkdirSync(path.dirname(screenshotPath), {recursive: true});
  await page.screenshot({path: screenshotPath, fullPage: true});
  if (result.stage !== "VERIFIED" ||
      result.status !== 200 ||
      result.prompt_sha256_matches !== true ||
      result.top_k.some(value => value !== 10)) {
    throw new Error(`Dify draft update failed: ${JSON.stringify(result)}`);
  }
  fs.writeFileSync(
    path.join(deliveryRoot, "evidence", "dify-draft-update-result.json"),
    `${JSON.stringify({...result, screenshot: "screenshots/DIFY_R2_DRAFT_1440.png"}, null, 2)}\n`,
    "utf8"
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await context.close();
}
