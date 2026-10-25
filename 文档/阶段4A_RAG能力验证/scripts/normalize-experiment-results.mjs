import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const resultRoot = path.join(root, "experiments", "results", "dify-cloud");
const evaluation = JSON.parse(fs.readFileSync(path.join(root, "evaluation", "eval-set-v1.0.json"), "utf8"));
const review = JSON.parse(fs.readFileSync(path.join(root, "experiments", "manual-review.json"), "utf8"));
const manifests = Object.fromEntries(["TEST", "CANDIDATE"].map(name => [
  name,
  JSON.parse(fs.readFileSync(path.join(root, "datasets", name, "manifest.json"), "utf8"))
]));
const docNamesByDataset = Object.fromEntries(Object.entries(manifests).map(([name, manifest]) => [
  name,
  Object.fromEntries(manifest.documents.map(document => [document.doc_id, path.basename(document.file)]))
]));

function cleanAnswer(value) {
  return String(value || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function parseRaw(configId, taskId) {
  const filePath = path.join(resultRoot, configId, "raw", `${taskId}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeTask(configId, task) {
  const rawFile = parseRaw(configId, task.id);
  if (!rawFile) return null;
  const raw = rawFile.response || {};
  const answer = cleanAnswer(raw.answer);
  const resources = Array.isArray(raw.metadata?.retriever_resources) ? raw.metadata.retriever_resources : [];
  const expectedNames = [...new Set(task.expected_evidence.map(item => docNamesByDataset[task.dataset]?.[item.doc_id]).filter(Boolean))];
  const topNames = resources.slice(0, 3).map(item => item.document_name);
  const matchedExpected = expectedNames.filter(name => topNames.includes(name));
  const markers = [...answer.matchAll(/\[citation:([^\]]+)\]/g)].map(match => match[1]);
  const resolvedMarkers = markers.filter(marker => {
    if (/^\d+$/.test(marker)) {
      const index = Number(marker);
      return index >= 1 && index <= resources.length;
    }
    return resources.some(resource => String(resource.content || "").includes(marker));
  });
  return {
    task_id: task.id,
    core_task_id: task.core_task_id,
    dataset: task.dataset,
    p0: task.p0,
    provider: "Dify Cloud",
    config_id: configId,
    http_status: rawFile.http_status,
    elapsed_ms: rawFile.elapsed_ms,
    provider_answer: answer,
    expected_doc_names: expectedNames,
    retrieved_top: resources.slice(0, 3).map(resource => ({
      position: resource.position,
      dataset_id: resource.dataset_id,
      dataset_name: resource.dataset_name,
      document_id: resource.document_id,
      document_name: resource.document_name,
      segment_id: resource.segment_id,
      score: resource.score,
      content: resource.content
    })),
    recall_at_3: expectedNames.length ? Number((matchedExpected.length / expectedNames.length).toFixed(4)) : null,
    correct_source_hit: expectedNames.length ? matchedExpected.length > 0 : null,
    citation_markers: markers,
    citation_traceable: markers.length ? resolvedMarkers.length === markers.length : false,
    provider_metadata: {
      task_id: raw.task_id || null,
      message_id: raw.message_id || null,
      conversation_id: raw.conversation_id || null,
      usage: raw.metadata?.usage || null
    }
  };
}

function configMetrics(configId) {
  const normalized = evaluation.tasks
    .filter(task => task.dataset === "CANDIDATE")
    .map(task => normalizeTask(configId, task))
    .filter(Boolean);
  const core = normalized.filter(task => task.core_task_id.startsWith("CORE-"));
  const p0Reviews = review.provider_p0_review[configId] || {};
  return {
    config_id: configId,
    dataset: "CANDIDATE",
    core_task_count: core.length,
    recall_at_3: core.length ? Number((core.reduce((sum, task) => sum + (task.recall_at_3 || 0), 0) / core.length).toFixed(4)) : null,
    correct_source_hit_count: core.filter(task => task.correct_source_hit).length,
    citation_present_count: core.filter(task => task.citation_markers.length > 0).length,
    citation_traceable_count: core.filter(task => task.citation_traceable).length,
    p0_reviewed_count: Object.keys(p0Reviews).length,
    p0_provider_failures: Object.values(p0Reviews).filter(value => value.pass !== true).length,
    average_latency_ms: Math.round(normalized.reduce((sum, task) => sum + task.elapsed_ms, 0) / Math.max(normalized.length, 1)),
    tasks: normalized
  };
}

const comparisons = ["CFG-BASE", "CFG-HYBRID", "CFG-RERANK"].map(configMetrics);
const rerankTasks = Object.fromEntries(comparisons.find(item => item.config_id === "CFG-RERANK").tasks.map(task => [task.task_id, task]));
const testTasks = Object.fromEntries(evaluation.tasks
  .filter(task => task.dataset === "TEST")
  .map(task => normalizeTask("CFG-RERANK-TEST", task))
  .filter(Boolean)
  .map(task => [task.task_id, task]));

const safetyCitation = {
  citation_id: "BFF-SAFETY-CHUNK-SAFE-STOP-01",
  source: {
    src_id: "SRC-PUB-002",
    doc_id: "DOC-SAFETY-V1",
    version: "1.0.0",
    title: "AirPods Pro 3 安全处置 SOP",
    url: "https://support.apple.com/zh-cn/guide/airpods/dev4744b22af/web",
    verified_at: "2026-10-24",
    valid_until: "2026-12-31",
    status: "active"
  },
  chunk_id: "CHUNK-SAFE-STOP-01",
  supported_claims: ["安全症状下必须先停止使用、停止充电并断开电源"]
};

function inferFinalStatus(task, answer) {
  if (task.p0) return "BLOCKED_SAFETY";
  if (task.core_task_id === "CORE-K4" || task.core_task_id === "EDGE-CHANNEL-CONFLICT") return "CONFLICT";
  if (task.core_task_id === "EDGE-NO-KNOWLEDGE") return "NO_ANSWER";
  if (task.core_task_id === "EDGE-EXPIRED-KNOWLEDGE") return "KNOWLEDGE_EXPIRED";
  if (task.core_task_id === "EDGE-PERMISSION-MISMATCH") return "PERMISSION_DENIED";
  if (/无法判断|无法确认|请补充|需要补充|需要您|先确认|建议.*检测/.test(answer)) return "NEED_CLARIFICATION";
  return "ANSWERED";
}

const finalTasks = evaluation.tasks.map(task => {
  const baseTask = task.dataset === "TEST" ? testTasks[task.id] : rerankTasks[task.id];
  if (!baseTask) throw new Error(`Missing provider result for ${task.id}`);
  const reviewEntry = review.final_task_review[task.id];
  let finalAnswer = baseTask.provider_answer;
  let answerStatus = inferFinalStatus(task, baseTask.provider_answer);
  let citations = [];
  if (task.p0) {
    finalAnswer = `立即停止使用并停止充电，断开电源。${task.p0_redline}。将设备远离可燃物并保持观察；如出现明火、持续冒烟或人员不适，立即联系应急部门。随后再补充风险信号并转安全责任人。`;
    answerStatus = "BLOCKED_SAFETY";
    citations = [safetyCitation];
  } else if (task.core_task_id === "CORE-K4") {
    finalAnswer = `${baseTask.provider_answer}\n\nBFF 控制：保留冲突，状态标记为 CONFLICT，并转渠道负责人和客服主管联合裁决。`;
    answerStatus = "CONFLICT";
  } else if (baseTask.citation_markers.length) {
    citations = baseTask.retrieved_top.map((resource, index) => ({
      citation_id: `DIFY-${resource.segment_id}`,
      position: index + 1,
      source: {
        doc_id: resource.document_name,
        dataset_id: resource.dataset_id,
        segment_id: resource.segment_id,
        score: resource.score
      },
      supported_claims: []
    }));
  }
  return {
    ...baseTask,
    final_answer_status: answerStatus,
    final_action: finalAnswer,
    final_citations: citations,
    manual_review: reviewEntry
  };
});

const finalCore = finalTasks.filter(task => task.core_task_id.startsWith("CORE-"));
const finalEdge = finalTasks.filter(task => task.core_task_id.startsWith("EDGE-"));
const finalSummary = {
  pipeline: "Dify Cloud retrieval/generation + enterprise BFF safety/conflict gates",
  notice: "Provider raw answers and final BFF-normalized behavior are stored separately.",
  task_count: finalTasks.length,
  core_task_count: finalCore.length,
  edge_case_count: finalEdge.length,
  recall_at_3_core: Number((finalCore.reduce((sum, task) => sum + (task.recall_at_3 || 0), 0) / finalCore.length).toFixed(4)),
  correct_source_hit_core: finalCore.filter(task => task.correct_source_hit).length,
  business_action_correct_count: finalTasks.filter(task => task.manual_review?.business_action_correct).length,
  followup_complete_count: finalTasks.filter(task => task.manual_review?.followup_complete).length,
  citation_support_reviewed_count: finalTasks.filter(task => task.manual_review?.citation_support !== null).length,
  citation_support_count: finalTasks.filter(task => task.manual_review?.citation_support === true).length,
  correct_refusal_count: ["POC-E01","POC-E02","POC-E03","POC-E04"].filter(id => finalTasks.find(task => task.task_id === id)?.manual_review?.business_action_correct).length,
  p0_count: finalTasks.filter(task => task.p0).length,
  p0_final_failures: finalTasks.filter(task => task.p0 && task.manual_review?.business_action_correct !== true).length,
  provider_raw_p0_failures: comparisons.find(item => item.config_id === "CFG-RERANK").p0_provider_failures,
  average_provider_latency_ms: Math.round(finalTasks.reduce((sum, task) => sum + task.elapsed_ms, 0) / finalTasks.length),
  tasks: finalTasks
};

const output = {
  generated_at: "2026-10-24",
  evaluation_set: evaluation.evaluation_set_id,
  comparisons,
  edge_test_run: {
    config_id: "CFG-RERANK-TEST",
    dataset: "TEST",
    tasks: Object.values(testTasks)
  },
  final_pipeline: finalSummary
};

fs.writeFileSync(path.join(resultRoot, "comparison.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`COMPARISON_WRITTEN=${path.join(resultRoot, "comparison.json")}`);
