import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {chromium} from "file:///C:/Users/%E6%9D%8E%E6%98%95%E6%98%8A/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const stageRoot = path.resolve(here, "..");
const appId = "4da4b901-0f6e-4f35-b89e-8170d83bb7e0";
const profileRoot = process.env.DIFY_PROFILE_ROOT ||
  "C:\\Users\\李昕昊\\AppData\\Local\\Temp\\project1-dify-session-93c3dd7d16e648118f3b9a5381a2b841\\dify-edge-live";
const localPrompt = fs.readFileSync(
  path.join(stageRoot, "configs", "r5-prompt-frozen.txt"),
  "utf8"
).trim();
const expectedPromptHash = crypto.createHash("sha256").update(localPrompt).digest("hex");
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
  if (value.startsWith("--")) pairs.push([value.slice(2), all[index + 1]]);
  return pairs;
}, []));
const captureOnly = args["capture-only"] === "true";
const model = String(args.model || "").trim();
const label = String(args.label || "").trim();
const output = String(args.output || "").trim();
if (!output || (!captureOnly && !["deepseek-v4-pro", "deepseek-v4-flash"].includes(model))) {
  throw new Error("Usage: node manage-dify-model.mjs --model <pro|flash> --label <name> --output <json>");
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableJson(value[key])]));
  }
  return value;
}

function hashRetrievalConfig(nodes) {
  return crypto.createHash("sha256").update(JSON.stringify(stableJson(nodes))).digest("hex");
}

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
  const result = await page.evaluate(async ({targetAppId, nextModel, publishLabel, onlyCapture}) => {
    const csrfToken = document.cookie
      .split(";")
      .map(item => item.trim())
      .find(item => item.startsWith("__Host-csrf_token="))
      ?.slice("__Host-csrf_token=".length);
    const headers = csrfToken ? {"X-CSRF-Token": decodeURIComponent(csrfToken)} : {};
    const draftResponse = await fetch(`/console/api/apps/${targetAppId}/workflows/draft`);
    const draftText = await draftResponse.text();
    if (!draftResponse.ok) {
      return {stage: "GET_DRAFT", status: draftResponse.status, body: draftText.slice(0, 600)};
    }
    const draft = JSON.parse(draftText);
    const promptNode = (draft.graph?.nodes || []).find(node => node.data?.type === "llm");
    const knowledgeNodes = (draft.graph?.nodes || [])
      .filter(node => node.data?.type === "knowledge-retrieval")
      .map(node => ({
        id: node.id,
        dataset_ids: node.data?.dataset_ids || [],
        multiple_retrieval_config: node.data?.multiple_retrieval_config || null
      }));
    const systemPrompt = promptNode?.data?.prompt_template
      ?.find(item => item.role === "system")?.text || "";
    const beforeModel = promptNode?.data?.model?.name || null;
    if (!promptNode || !systemPrompt || knowledgeNodes.length === 0) {
      return {stage: "VALIDATE", status: 0, body: "LLM prompt or retrieval node missing", beforeModel};
    }
    if (onlyCapture) {
      const versionsResponse = await fetch(
        `/console/api/apps/${targetAppId}/workflows?page=1&limit=20`,
        {headers}
      );
      const versions = versionsResponse.ok ? await versionsResponse.json() : {items: []};
      return {
        stage: "CAPTURED",
        status: 200,
        before_model: beforeModel,
        after_model: beforeModel,
        prompt_text: systemPrompt,
        model: promptNode.data.model,
        knowledge_nodes: knowledgeNodes,
        versions_status: versionsResponse.status,
        versions: (versions.items || []).slice(0, 8).map(item => ({
          version_number: item.version_number,
          marked_name: item.marked_name,
          marked_comment: item.marked_comment,
          created_at: item.created_at,
          model_name: (item.graph?.nodes || [])
            .find(node => node.data?.type === "llm")?.data?.model?.name || null
        }))
      };
    }

    promptNode.data.model.name = nextModel;
    const updateResponse = await fetch(`/console/api/apps/${targetAppId}/workflows/draft`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({graph: draft.graph, features: draft.features || {}, hash: draft.hash})
    });
    const updateText = await updateResponse.text();
    if (!updateResponse.ok) {
      return {stage: "POST_DRAFT", status: updateResponse.status, body: updateText.slice(0, 800), beforeModel};
    }
    const verifiedResponse = await fetch(`/console/api/apps/${targetAppId}/workflows/draft`);
    const verified = await verifiedResponse.json();
    const verifiedPromptNode = verified.graph?.nodes?.find(node => node.data?.type === "llm");
    const verifiedModel = verifiedPromptNode?.data?.model?.name || null;
    const verifiedPrompt = verifiedPromptNode?.data?.prompt_template
      ?.find(item => item.role === "system")?.text || "";
    const verifiedKnowledge = (verified.graph?.nodes || [])
      .filter(node => node.data?.type === "knowledge-retrieval")
      .map(node => ({
        id: node.id,
        dataset_ids: node.data?.dataset_ids || [],
        multiple_retrieval_config: node.data?.multiple_retrieval_config || null
      }));
    if (verifiedModel !== nextModel) {
      return {
        stage: "VERIFY_MODEL",
        status: 0,
        body: `Expected ${nextModel}, got ${verifiedModel}`,
        beforeModel
      };
    }
    const publishResponse = await fetch(`/console/api/apps/${targetAppId}/workflows/publish`, {
      method: "POST",
      headers: {...headers, "Content-Type": "application/json"},
      body: JSON.stringify({
        marked_name: publishLabel,
        marked_comment: `4B-2B experimental model ${nextModel}; default remains Pro`
      })
    });
    const publishText = await publishResponse.text();
    if (!publishResponse.ok) {
      return {stage: "PUBLISH", status: publishResponse.status, body: publishText.slice(0, 800), beforeModel};
    }
    const versionsResponse = await fetch(
      `/console/api/apps/${targetAppId}/workflows?page=1&limit=20`,
      {headers}
    );
    const versions = versionsResponse.ok ? await versionsResponse.json() : {items: []};
    const matching = (versions.items || [])
      .filter(item => item.marked_name === publishLabel)
      .sort((left, right) => Number(right.version_number) - Number(left.version_number));
    return {
      stage: "PUBLISHED",
      status: publishResponse.status,
      before_model: beforeModel,
      after_model: verifiedModel,
      published_version: matching[0]?.version_number || null,
      prompt_text: verifiedPrompt,
      model: verifiedPromptNode?.data?.model || null,
      knowledge_nodes: verifiedKnowledge,
      versions_status: versionsResponse.status,
      versions: (versions.items || []).slice(0, 8).map(item => ({
        version_number: item.version_number,
        marked_name: item.marked_name,
        marked_comment: item.marked_comment,
        created_at: item.created_at,
        model_name: (item.graph?.nodes || [])
          .find(node => node.data?.type === "llm")?.data?.model?.name || null
      }))
    };
  }, {
    targetAppId: appId,
    nextModel: model,
    publishLabel: label,
    onlyCapture: captureOnly
  });

  const expectedStages = captureOnly ? ["CAPTURED"] : ["PUBLISHED"];
  if (!expectedStages.includes(result.stage)) {
    throw new Error(`Dify model operation failed: ${JSON.stringify(result)}`);
  }
  const promptHash = crypto.createHash("sha256").update(String(result.prompt_text || "").trim()).digest("hex");
  const retrievalHash = hashRetrievalConfig(result.knowledge_nodes || []);
  if (promptHash !== expectedPromptHash) {
    throw new Error(`Dify prompt changed during model experiment: ${promptHash}`);
  }
  const evidence = {
    captured_at: new Date().toISOString(),
    app_id: appId,
    capture_only: captureOnly,
    label,
    before_model: result.before_model,
    after_model: result.after_model,
    published_version: result.published_version || null,
    prompt_sha256: promptHash,
    model: result.model,
    knowledge_nodes: result.knowledge_nodes,
    knowledge_config_sha256: retrievalHash,
    versions_status: result.versions_status || null,
    workflow_versions: result.versions || [],
    default_primary_model: "deepseek-v4-pro",
    experiment_mode_only: !captureOnly
  };
  const outputPath = path.resolve(stageRoot, output);
  fs.mkdirSync(path.dirname(outputPath), {recursive: true});
  fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await context.close();
}
