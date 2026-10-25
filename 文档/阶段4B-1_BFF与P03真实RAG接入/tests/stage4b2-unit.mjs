import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBffServer } from "../server/app.mjs";
import { loadConfig } from "../server/config.mjs";
import {
  buildRetrievalSubqueries,
  buildRetrievalQueries,
  isMultiObjectiveQuestion,
  mergeDiverseCandidates,
  ProviderError,
  selectRelevanceFirstCandidates
} from "../server/dify-adapter.mjs";
import { catalogDocumentForResource, loadCatalog } from "../server/catalog.mjs";
import {
  extractVisibleActionLines,
  normalizeProviderAnswer,
  normalizeRetrievalResources,
  selectDocumentDiverseResources,
  selectUniqueSegmentResources
} from "../server/normalize.mjs";
import {
  containsForbidden,
  summarizeEvaluationResults
} from "../server/evaluation-service.mjs";
import { evaluateBusinessSemantics } from "../server/semantic-evaluation.mjs";
import { evaluateRoutingCandidate } from "../server/model-routing.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const projectRoot = path.resolve(root, "..", "..");
const prototypeRoot = path.join(projectRoot, "文档", "阶段3B_高保真交互原型");
const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bff-4b2a-unit-"));
const config = {...loadConfig(prototypeRoot), runtimeRoot};
const catalog = loadCatalog(config.dataRoot);
const stageCopyDocument = catalogDocumentForResource(catalog, {
  document_id: "DIFY-NEW-DOCUMENT-ID",
  document_name: "01_售后FAQ__4B2A-CANDIDATE-v1.0.0.md"
});
assert.equal(stageCopyDocument?.doc_id, "DOC-FAQ-V1");

const subqueries = buildRetrievalSubqueries(
  "原始问题：AirPods 拆封了还能退吗？\n" +
  "改写问法：第三方平台买的三天内拆封，配件齐全但没有质量问题，可以退吗？；" +
  "Apple 官网买的耳机拆开试戴后还能不能用 14 天退货？"
);
assert.deepEqual(subqueries, [
  "AirPods 拆封了还能退吗？",
  "第三方平台买的三天内拆封，配件齐全但没有质量问题，可以退吗？",
  "Apple 官网买的耳机拆开试戴后还能不能用 14 天退货？"
]);
assert.equal(isMultiObjectiveQuestion("退货和保修应该分别怎么判断？"), true);
assert.equal(isMultiObjectiveQuestion("耳机还在保修期，维修要收费吗？"), false);
const singleRetrievalPlan = buildRetrievalQueries(
  "原始问题：左耳不充电且指示灯不亮。\n" +
  "改写问法：换线和换电源都不亮，要检查什么？；单耳不充电先怎么排查？"
);
assert.equal(singleRetrievalPlan.multiObjective, false);
assert.deepEqual(singleRetrievalPlan.retrievalQueries, ["左耳不充电且指示灯不亮。"]);
const multiRetrievalPlan = buildRetrievalQueries(
  "原始问题：第10天换货和维修分别怎么判断？\n" +
  "改写问法：先换货还是维修？；后续维修条件是什么？"
);
assert.equal(multiRetrievalPlan.multiObjective, true);
assert.equal(multiRetrievalPlan.retrievalQueries.length, 2);
assert.equal(multiRetrievalPlan.retrievalQueries[0], "第10天换货和维修分别怎么判断？");
assert.match(multiRetrievalPlan.retrievalQueries[1], /^第10天换货和维修分别怎么判断？\n意图补充：/);
const mergedCandidates = mergeDiverseCandidates([
  [
    {segment_id: "SEG-RETURN-1", document_id: "DOC-RETURN-V1"},
    {segment_id: "SEG-CHANNEL-1", document_id: "DOC-CHANNEL-V1"},
    {segment_id: "SEG-WARRANTY-1", document_id: "DOC-WARRANTY-V1"}
  ],
  [
    {segment_id: "SEG-RETURN-2", document_id: "DOC-RETURN-V1"},
    {segment_id: "SEG-CHANNEL-2", document_id: "DOC-CHANNEL-V1"},
    {segment_id: "SEG-FAQ-1", document_id: "DOC-FAQ-V1"}
  ]
], 3);
assert.deepEqual(
  mergedCandidates.selected.map(item => item.segment_id),
  ["SEG-RETURN-1", "SEG-CHANNEL-1", "SEG-WARRANTY-1"]
);
assert.equal(new Set(mergedCandidates.selected.map(item => item.document_id)).size, 3);
assert.equal(mergedCandidates.candidatePool.length, 6);
assert.equal(mergedCandidates.candidateDocumentCount, 4);
const substantiveMerge = mergeDiverseCandidates([[
  {
    segment_id: "TITLE-RETURN",
    document_id: "DOC-RETURN-V1",
    score: 0.99,
    position: 1,
    content: "AirPods 退货与退款判断"
  },
  {
    segment_id: "METADATA-RETURN",
    document_id: "DOC-RETURN-V1",
    score: 0.95,
    position: 2,
    content: "---\ndoc_id: DOC-RETURN-V1\ntitle: AirPods 退货与退款判断\n---"
  },
  {
    segment_id: "BODY-RETURN",
    document_id: "DOC-RETURN-V1",
    score: 0.70,
    position: 3,
    content: "远程交易通常适用收到商品七日内无理由退货，但必须核对渠道、签收时间和商品状态，不得只凭拆封给出确定结论。"
  },
  {
    segment_id: "BODY-WARRANTY",
    document_id: "DOC-WARRANTY-V1",
    score: 0.68,
    position: 4,
    content: "充电故障应核对购买日期和保障状态，通过官方检测判断是否属于保修范围，不能提前承诺免费维修。"
  }
]], 2);
assert.deepEqual(
  substantiveMerge.selected.map(item => item.segment_id),
  ["BODY-RETURN", "BODY-WARRANTY"]
);
const relevanceFirst = selectRelevanceFirstCandidates([[
  {
    segment_id: "TITLE-FAQ",
    document_id: "DOC-FAQ-V1",
    score: 0.74,
    position: 1,
    content: "AirPods Pro 3 售后 FAQ"
  },
  {
    segment_id: "POWER-FAQ",
    document_id: "DOC-FAQ-V1",
    score: 0.68,
    position: 2,
    content: "充电盒不充电时，可检查兼容线缆、电源、接口碎屑和耳机是否放到位；不得使用针或尖锐物清理接口。"
  },
  {
    segment_id: "IDENTITY-FAQ",
    document_id: "DOC-FAQ-V1",
    score: 0.66,
    position: 3,
    content: "回答售后问题前应核对型号、序列号、购买渠道和购买日期，无法对应时转保修身份核验。"
  },
  {
    segment_id: "WATER-SAFETY",
    document_id: "DOC-SAFETY-V1",
    score: 0.55,
    position: 4,
    content: "进液后立即停止佩戴和充电，并检查是否有液体、污物或堵塞，不得使用尖锐物清理接口。"
  }
]], 3);
assert.equal(relevanceFirst.selected[0].segment_id, "POWER-FAQ");
assert.equal(relevanceFirst.selected.some(item => item.segment_id === "WATER-SAFETY"), false);
assert.equal(relevanceFirst.selected.every(item => item.document_id === "DOC-FAQ-V1"), true);
assert.equal(new Set(relevanceFirst.selected.map(item => item.segment_id)).size, relevanceFirst.selected.length);

const faqContent = "单侧无声时，先把两只耳机放回充电盒并合盖至少 10 秒；检查耳塞或网罩是否堵塞、设备声道平衡和佩戴贴合。仍未恢复时，可在设备中忽略旧配对并重新配对。只有一侧持续无声音，或完成重置和清洁后仍反复异常，才转售后检测；不得直接把原因归为单耳佩戴，也不得承诺换新。";
const diversityResources = [
  {
    position: 1,
    document_name: "01_售后FAQ.md",
    document_id: "provider-faq",
    segment_id: "SEG-FAQ-1",
    score: 0.91,
    content: faqContent
  },
  {
    position: 2,
    document_name: "01_售后FAQ.md",
    document_id: "provider-faq",
    segment_id: "SEG-FAQ-2",
    score: 0.88,
    content: "AirPods Pro 3 售后 FAQ"
  },
  {
    position: 3,
    document_name: "03_退货规则.md",
    document_id: "provider-return",
    segment_id: "SEG-RETURN-1",
    score: 0.83,
    content: "Apple Store 在线商店符合条件时可在交付后 14 日内申请退货。"
  },
  {
    position: 4,
    document_name: "05_渠道差异说明.md",
    document_id: "provider-channel",
    segment_id: "SEG-CHANNEL-1",
    score: 0.79,
    content: "回答退货、保修或授权问题前，必须确认销售主体、订单、签收时间和实际售后入口。"
  },
  {
    position: 5,
    document_name: "03_退货规则.md",
    document_id: "provider-return",
    segment_id: "SEG-RETURN-1",
    score: 0.75,
    content: "重复切片不应再次进入 Top3。"
  }
];
const diverse = selectDocumentDiverseResources(diversityResources, catalog, 3);
assert.deepEqual(diverse.map(item => item.segment_id), ["SEG-FAQ-1", "SEG-RETURN-1", "SEG-CHANNEL-1"]);
assert.equal(new Set(diverse.map(item => catalogDocumentForResource(catalog, item)?.doc_id)).size, 3);
assert.equal(new Set(diverse.map(item => item.segment_id)).size, 3);
assert.equal(diverse.some(item => item.segment_id === "SEG-FAQ-2"), false);
assert.equal(diverse.some(item => item.segment_id === "SEG-RETURN-1" && item.position === 5), false);
const uniqueSegments = selectUniqueSegmentResources(diversityResources, 3);
assert.deepEqual(uniqueSegments.map(item => item.segment_id), ["SEG-FAQ-1", "SEG-FAQ-2", "SEG-RETURN-1"]);

const actionable = normalizeProviderAnswer({
  raw: {
    answer: "不能仅凭长期单耳佩戴判断已经损坏。先把两只耳机放回充电盒并合盖 10 秒，再检查网罩、声道平衡和佩戴贴合；仍未恢复时重新配对，持续无声再转售后检测。[citation:1]",
    metadata: {
      usage: {},
      retriever_resources: diversityResources
    }
  },
  request: {
    role: "frontline",
    customer_context: {symptom: "单侧无声"},
    question: "另一只不响怎么办？"
  },
  catalog,
  providerRequestId: "provider-r04-fixture",
  timingMs: 20,
  model: "deepseek-v4-pro"
});
assert.equal(actionable.answer_status, "ANSWERED");
assert.equal(actionable.citation_support.passed, true);
assert.equal(actionable.retrieval_diversity.internal_candidate_pool_size, 5);
assert.equal(actionable.retrieval_diversity.displayed_top_k, 3);
assert.equal(actionable.retrieval_resources.length, 3);
assert.equal(new Set(actionable.retrieval_resources.map(item => item.document_id)).size, 3);

const knowledgeGap = normalizeProviderAnswer({
  raw: {
    answer: "当前知识不足，缺少第三方平台退货正文证据，需要补充平台规则，暂不能判断是否可退。[citation:1]",
    metadata: {
      usage: {},
      retriever_resources: diversityResources.slice(2, 4)
    }
  },
  request: {
    role: "frontline",
    customer_context: {channel: "第三方平台"},
    question: "拆封三天能退吗？"
  },
  catalog,
  providerRequestId: "provider-knowledge-gap-fixture",
  timingMs: 20,
  model: "deepseek-v4-pro"
});
assert.equal(knowledgeGap.answer_status, "NEED_CLARIFICATION");
assert.equal(knowledgeGap.retrieval_diversity.displayed_top_k, 2);

const diverseSearch = normalizeRetrievalResources({
  resources: diversityResources,
  request: {role: "frontline"},
  catalog
});
assert.equal(diverseSearch.hits.length, 3);
assert.equal(new Set(diverseSearch.hits.map(item => item.source.doc_id)).size, 3);
assert.equal(new Set(diverseSearch.hits.map(item => item.segment_id)).size, 3);

const multiObjectiveResources = [
  {
    position: 1,
    document_name: "03_退货规则.md",
    document_id: "provider-return",
    segment_id: "SEG-RETURN-MULTI",
    score: 0.81,
    content: "Apple Store 在线商店符合条件时可在交付后 14 日内申请退货；已拆封是否影响条件需要以订单售后审核为准。"
  },
  {
    position: 2,
    document_name: "04_保修与维修流程.md",
    document_id: "provider-warranty",
    segment_id: "SEG-WARRANTY-MULTI",
    score: 0.78,
    content: "AirPods 出现充电故障时，应核对型号、购买凭证和保障状态，并通过官方检测判断是否属于保修范围；不得提前承诺免费维修。"
  }
];
const multiObjectiveAnswer = [
  "## 目标一：退货路径",
  "收货 3 天在 Apple Store 在线商店 14 日内退货申请窗口内，但已拆封是否影响条件需要订单售后审核。[1]",
  "下一步：在订单页提交退货申请并说明已拆封与充电不稳定。[1]",
  "## 目标二：保修检测路径",
  "充电故障应核对型号、购买凭证和保障状态，通过官方检测判断是否属于保修范围。[2]",
  "下一步：通过官方支持提交检测，不能提前承诺免费维修。[2]",
  "## 仍需确认",
  "确认订单页退货条件、保障状态和检测结果。"
].join("\n");
const multiObjective = normalizeProviderAnswer({
  raw: {
    answer: multiObjectiveAnswer,
    metadata: {
      usage: {},
      retriever_resources: multiObjectiveResources
    }
  },
  request: {
    role: "frontline",
    customer_context: {channel: "Apple Store 在线商店", fault: "充电不稳定"},
    question: "收货三天已拆封，充电不稳定，退货和保修分别怎么判断？"
  },
  catalog,
  providerRequestId: "provider-multi-objective-fixture",
  timingMs: 20,
  model: "deepseek-v4-pro"
});
assert.equal(multiObjective.answer_status, "ANSWERED");
assert.equal(multiObjective.answer_goals.length, 2);
assert.equal(multiObjective.answer_goals.every(item => item.evidence_supported), true);
assert.equal(multiObjective.citation_support.passed, true);
assert.equal(multiObjective.citation_support.multi_objective_passed, true);
assert.match(multiObjective.answer, /目标一/);
assert.match(multiObjective.answer, /目标二/);

const unsupportedMultiObjective = normalizeProviderAnswer({
  raw: {
    answer: multiObjectiveAnswer.replaceAll("。[2]", "。[1]"),
    metadata: {
      usage: {},
      retriever_resources: multiObjectiveResources
    }
  },
  request: {
    role: "frontline",
    customer_context: {channel: "Apple Store 在线商店", fault: "充电不稳定"},
    question: "收货三天已拆封，充电不稳定，退货和保修分别怎么判断？"
  },
  catalog,
  providerRequestId: "provider-multi-objective-unsupported",
  timingMs: 20,
  model: "deepseek-v4-pro"
});
assert.equal(unsupportedMultiObjective.answer_status, "NEED_CLARIFICATION");
assert.equal(unsupportedMultiObjective.citation_support.multi_objective_passed, false);
const singleTargetSplit = normalizeProviderAnswer({
  raw: {
    answer: [
      "## 目标一：判断是否因单耳佩戴损坏",
      "**判断**：不能直接把原因归为单耳佩戴。[1]",
      "**下一步**：先完成目标二的排查；如仍未恢复再判断。",
      "## 目标二：先检查什么",
      "**判断**：应按单侧无声排查。[1]",
      "**下一步**：把两只耳机放回充电盒并合盖至少 10 秒；检查耳塞网罩、声道平衡和佩戴贴合；再忽略旧配对重新配对；持续无声才转售后检测，不承诺免费维修或换新。",
      "**依据**：[1]"
    ].join("\n"),
    metadata: {
      usage: {},
      retriever_resources: [{
        position: 1,
        document_name: "01_售后FAQ.md",
        document_id: "provider-faq",
        segment_id: "SEG-SINGLE-TARGET",
        score: 0.9,
        content: faqContent
      }]
    }
  },
  request: {
    role: "frontline",
    customer_context: {symptom: "单侧无声", cleaning: "未检查", reset: "未尝试"},
    question: "AirPods Pro 长时间单耳佩戴后另一只不响怎么办？"
  },
  catalog,
  providerRequestId: "provider-single-target-split",
  timingMs: 20,
  model: "deepseek-v4-pro"
});
assert.equal(singleTargetSplit.answer_status, "ANSWERED");
assert.equal(singleTargetSplit.citation_support.passed, true);
assert.equal(singleTargetSplit.answer_goals.length, 2);
assert.doesNotMatch(singleTargetSplit.answer, /目标[一二三四1-4]/);
assert.doesNotMatch(singleTargetSplit.suggested_action, /目标[一二三四1-4]|上述步骤/);
assert.match(singleTargetSplit.answer, /放回充电盒/);
assert.match(singleTargetSplit.answer, /声道平衡/);
assert.match(singleTargetSplit.answer, /重新配对/);
assert.match(singleTargetSplit.answer, /转售后检测/);
assert.match(singleTargetSplit.answer, /不得承诺换新|不承诺.*换新/);
assert.equal((singleTargetSplit.answer.match(/下一步/g) || []).length, 1);
const routingTask = {
  id: "ROUTING-TEST",
  p0: false,
  accepted_statuses: ["ANSWERED"],
  forbidden_actions: ["承诺免费维修"]
};
const routingPass = evaluateRoutingCandidate({
  task: routingTask,
  payload: {
    answer: "先检查充电盒并将耳机放回盒内。",
    suggested_action: "检查充电盒、重新配对并观察结果。",
    answer_status: "ANSWERED",
    retrieval_resources: [{segment_id: "SEG-1"}],
    citation_support: {passed: true, unsupported_count: 0}
  }
});
assert.equal(routingPass.passed, true);
assert.equal(routingPass.fallback_required, false);
const routingClaimFailure = evaluateRoutingCandidate({
  task: routingTask,
  payload: {
    answer: "可以直接免费维修。",
    suggested_action: "联系售后免费维修。",
    answer_status: "ANSWERED",
    retrieval_resources: [{segment_id: "SEG-1"}],
    citation_support: {passed: false, unsupported_count: 1}
  },
  forbiddenActionMatch: "承诺免费维修"
});
assert.deepEqual(routingClaimFailure.reasons, [
  "CLAIM_CITATION_FAILED",
  "UNSUPPORTED_CLAIM",
  "FORBIDDEN_COMMITMENT"
]);
const routingGenericFallback = evaluateRoutingCandidate({
  task: routingTask,
  payload: {
    answer: "当前证据不足以形成确定结论，系统已保留可核验来源并转入补充信息或人工复核。",
    suggested_action: "",
    answer_status: "NEED_CLARIFICATION",
    retrieval_resources: [{segment_id: "SEG-1"}],
    citation_support: {passed: true, unsupported_count: 0}
  }
});
assert.equal(routingGenericFallback.fallback_required, true);
assert.equal(routingGenericFallback.checks.generic_fallback_with_evidence, true);
assert.equal(routingGenericFallback.checks.actionable_next_step, false);
const routingP0 = evaluateRoutingCandidate({
  task: {id: "P0-TEST", p0: true},
  payload: {
    answer: "立即停止充电。",
    suggested_action: "隔离设备并通知安全责任人。",
    answer_status: "BLOCKED_SAFETY",
    provider_called: false,
    p0_passed: true,
    retrieval_resources: []
  }
});
assert.equal(routingP0.eligible, false);
assert.equal(routingP0.passed, true);
assert.equal(routingP0.checks.p0_short_circuit, true);
const deduplicatedActions = extractVisibleActionLines([
  "**下一步**：检查线缆与电源，重新放置左耳并观察指示灯。",
  "**下一步**：检查线缆与电源，重新放置左耳并观察指示灯。"
].join("\n"));
assert.equal(deduplicatedActions.length, 1);
const multilineActions = extractVisibleActionLines([
  "**下一步**：1. 检查兼容线缆与电源。",
  "2. 检查接口与耳机触点，不要使用尖锐物。",
  "3. 重新放置耳机后仍无反应，转服务检测。",
  "**依据**：[1]"
].join("\n"));
assert.equal(multilineActions.length, 3);
assert.match(multilineActions.join(" "), /接口与耳机触点/);
assert.match(multilineActions.join(" "), /转服务检测/);
const supplementedTroubleshooting = normalizeProviderAnswer({
  raw: {
    answer: "判断：充电盒不充电时，应先检查兼容线缆、电源、接口碎屑和耳机是否放到位。[1]",
    metadata: {
      usage: {},
      retrieval_trace: {
        displayed_segment_ids: ["SEG-POWER", "SEG-IDENTIFY", "SEG-CONNECT"]
      },
      retriever_resources: [
        {
          position: 1,
          document_name: "01_售后FAQ.md",
          document_id: "provider-faq",
          segment_id: "SEG-POWER",
          score: 0.9,
          content: "充电盒不充电时，可检查兼容线缆、电源、接口碎屑和耳机是否放到位；不得使用针、镊子等尖锐物清理接口，也不得在潮湿状态充电。"
        },
        {
          position: 2,
          document_name: "01_售后FAQ.md",
          document_id: "provider-faq",
          segment_id: "SEG-IDENTIFY",
          score: 0.88,
          content: "回答售后问题前应核对型号、序列号、购买渠道和购买或签收日期，无法对应时转保修身份核验。"
        },
        {
          position: 3,
          document_name: "01_售后FAQ.md",
          document_id: "provider-faq",
          segment_id: "SEG-CONNECT",
          score: 0.8,
          content: faqContent
        }
      ]
    }
  },
  request: {
    role: "frontline",
    customer_context: {symptom: "左耳不充电且指示灯不亮"},
    question: "AirPods Pro 3 左耳放回充电盒后仍不充电，指示灯不亮，应该先怎么排查？"
  },
  catalog,
  providerRequestId: "provider-supplemented-troubleshooting",
  timingMs: 20,
  model: "deepseek-v4-pro"
});
assert.equal(supplementedTroubleshooting.answer_status, "ANSWERED");
assert.match(supplementedTroubleshooting.answer, /重新配对/);
assert.equal(supplementedTroubleshooting.citations.some(citation => citation.segment_id === "SEG-CONNECT"), true);

const semanticTask = {
  accepted_statuses: ["ANSWERED"],
  forbidden_actions: ["承诺一定可退", "承诺免费维修"],
  p0: false,
  semantic_expectations: {
    min_answer_goals: 2,
    min_distinct_citations: 2,
    objectives: [
      {
        id: "RETURN",
        concept_groups: [["退货"], ["14 日"], ["拆封"]],
        required_doc_any: ["DOC-RETURN-V1"]
      },
      {
        id: "WARRANTY",
        concept_groups: [["保修", "维修"], ["检测"], ["购买凭证"]],
        required_doc_any: ["DOC-WARRANTY-V1"]
      }
    ]
  }
};
const semanticPass = evaluateBusinessSemantics(semanticTask, multiObjective);
assert.equal(semanticPass.passed, true);
assert.equal(semanticPass.objectives.length, 2);
const documentRequestFailure = evaluateBusinessSemantics(semanticTask, {
  ...multiObjective,
  suggested_action: "请提供上述文档的正文切片后再判断。"
});
assert.equal(documentRequestFailure.passed, false);
assert.equal(documentRequestFailure.document_request_matches.length > 0, true);
const internalActionFailure = evaluateBusinessSemantics(semanticTask, {
  ...multiObjective,
  suggested_action: "先完成目标二的排查。"
});
assert.equal(internalActionFailure.passed, false);
assert.deepEqual(internalActionFailure.action_internal_references, ["目标二"]);
const visibleFallbackFailure = evaluateBusinessSemantics({
  ...semanticTask,
  semantic_expectations: {
    ...semanticTask.semantic_expectations,
    forbid_generic_fallback_when_evidence: true
  }
}, {
  ...multiObjective,
  answer: "当前证据不足以形成确定结论，系统已保留可核验来源并转入补充信息或人工复核。",
  suggested_action: null
});
assert.equal(visibleFallbackFailure.generic_fallback_only, true);

const metricFixture = summarizeEvaluationResults([
  {
    core_task_id: "CORE-S1",
    p0: true,
    provider_called: false,
    answer_status: "BLOCKED_SAFETY",
    p0_passed: true,
    source_hit: null,
    expected_source_count: 0,
    covered_source_count: 0
  },
  {
    core_task_id: "CORE-R1",
    p0: false,
    provider_called: true,
    answer_status: "ANSWERED",
    p0_passed: null,
    source_hit: true,
    expected_source_count: 2,
    covered_source_count: 1
  },
  {
    core_task_id: "CORE-R2",
    p0: false,
    provider_called: true,
    answer_status: "NO_ANSWER",
    p0_passed: null,
    source_hit: false,
    expected_source_count: 1,
    covered_source_count: 0
  },
  {
    core_task_id: "CORE-K4",
    p0: false,
    provider_called: true,
    answer_status: "ERROR",
    p0_passed: null,
    source_hit: null,
    expected_source_count: 2,
    covered_source_count: 0
  }
]);
assert.equal(metricFixture.retrieval_completed_core_count, 2);
assert.equal(metricFixture.retrieval_expected_source_count, 3);
assert.equal(metricFixture.retrieval_covered_source_count, 1);
assert.equal(metricFixture.recall_at_3_core, 0.3333);
assert.equal(metricFixture.correct_source_hits_core, 1);
assert.equal(metricFixture.correct_source_denominator, 2);
assert.equal(metricFixture.source_hit_rate_core, 0.5);
assert.equal(metricFixture.provider_error_core_count, 1);
assert.equal(metricFixture.p0_gate_count, 1);

const forbiddenTask = {forbidden_actions: ["承诺免费维修", "承诺免费换新"]};
assert.equal(containsForbidden(forbiddenTask, "不得承诺免费维修，也不能承诺免费换新。"), null);
assert.equal(containsForbidden(forbiddenTask, "请勿承诺免费维修。"), null);
assert.equal(containsForbidden(forbiddenTask, "可以承诺免费换新。"), "承诺免费换新");
assert.equal(containsForbidden(forbiddenTask, "不得承诺免费维修；但可承诺免费换新。"), "承诺免费换新");
assert.equal(
  containsForbidden({forbidden_actions: ["强行合并为单一结论"]}, "不得强行合并为单一结论。"),
  null
);
assert.equal(
  containsForbidden({forbidden_actions: ["强行合并为单一结论"]}, "不强行合并为单一结论。"),
  null
);

let providerCalls = 0;
let k04FailuresRemaining = 1;
const provider = {
  sourceMode: "TEST_ADAPTER",
  async health() {
    return {status: "ok", provider: {mode: "advanced-chat"}, latency_ms: 3};
  },
  async answer(input) {
    providerCalls += 1;
    if (input.question.includes("京东售后说拒修") && k04FailuresRemaining > 0) {
      k04FailuresRemaining -= 1;
      throw new ProviderError("PROVIDER_UNAVAILABLE", "Mock transient provider failure", {
        status: 502,
        retryable: true
      });
    }
    return {
      provider_request_id: `provider-${providerCalls}`,
      provider_trace_id: `provider-${providerCalls}`,
      timing_ms: 20 + providerCalls,
      raw: {
        answer: "请先核对商品、渠道、时间和检测状态，再按证据判断；当前不能承诺免费换新。[citation:1]",
        message_id: `provider-${providerCalls}`,
        metadata: {
          usage: {prompt_tokens: 120, completion_tokens: 60, total_tokens: 180},
          retriever_resources: [{
            position: 1,
            dataset_id: config.datasetId,
            dataset_name: "CANDIDATE",
            document_id: "DOC-FAQ-V1",
            document_name: "01_售后FAQ.md",
            segment_id: `segment-${providerCalls}`,
            score: 0.91,
            content: "售后判断前应核对商品型号、购买渠道、购买或签收时间和检测状态，不能提前承诺免费换新。"
          }]
        }
      }
    };
  },
  async search() {
    throw new Error("not used");
  }
};

const datasetState = new Map();
const existingDocuments = new Map();
let createCalls = 0;
let updateCalls = 0;
let pollCalls = 0;
const datasetAdapter = {
  sourceMode: "TEST_ADAPTER",
  async health() {
    return {status: "ok", dataset_id: config.datasetId, dataset_name: "CANDIDATE", document_count: 5};
  },
  async createDocument({fileName}) {
    createCalls += 1;
    if (fileName.includes("03_退货规则")) {
      throw new ProviderError("DATASET_AUTH_FAILED", "Dataset API authentication failed", {
        status: 502,
        retryable: false
      });
    }
    const failing = fileName.includes("02_安全SOP");
    const documentId = `DOC-PROVIDER-${createCalls}`;
    const batchId = failing ? `BATCH-FAIL-${createCalls}` : `BATCH-OK-${createCalls}`;
    datasetState.set(batchId, {file: fileName, failures: failing, polls: 0});
    if (fileName.includes("01_售后FAQ")) {
      existingDocuments.set("01_售后FAQ.md", {id: documentId, name: "01_售后FAQ.md"});
    }
    return {document: {id: documentId}, batch: batchId};
  },
  async updateDocument({documentId, fileName}) {
    updateCalls += 1;
    const batchId = `BATCH-RETRY-${updateCalls}`;
    datasetState.set(batchId, {file: fileName, failures: false, polls: 0});
    return {document: {id: documentId}, batch: batchId};
  },
  async getIndexingStatus(batchId) {
    pollCalls += 1;
    const state = datasetState.get(batchId);
    if (!state) throw new ProviderError("DATASET_NOT_FOUND", "Batch not found", {status: 404});
    state.polls += 1;
    if (state.failures) {
      return {data: [{id: `DOC-${batchId}`, indexing_status: "error", error: "embedding failed"}]};
    }
    const status = state.polls === 1 ? "parsing" : state.polls === 2 ? "indexing" : "completed";
    return {
      data: [{
        id: `DOC-${batchId}`,
        indexing_status: status,
        completed_segments: status === "completed" ? 5 : 2,
        total_segments: 5,
        error: null
      }]
    };
  },
  async findDocumentByName(name) {
    return existingDocuments.get(name) || null;
  }
};

const app = createBffServer({prototypeRoot, config, adapter: provider, datasetAdapter});
await new Promise(resolve => app.server.listen(0, "127.0.0.1", resolve));
const baseUrl = `http://127.0.0.1:${app.server.address().port}`;

async function request(pathname, {method = "GET", role = "knowledge", body, key} = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(body ? {"Content-Type": "application/json"} : {}),
      "X-Demo-Role": role,
      ...(key ? {"Idempotency-Key": key} : {})
    },
    ...(body ? {body: JSON.stringify(body)} : {})
  });
  const payload = await response.json();
  return {status: response.status, payload};
}

const docs = await request("/api/candidate-documents");
assert.equal(docs.status, 200);
assert.equal(docs.payload.documents.length, 5);

const noRole = await request("/api/ingestions", {
  method: "POST",
  role: "supervisor",
  body: {doc_id: "DOC-FAQ-V1", src_id: "SRC-PUB-001", source_version: "1.0.0"},
  key: crypto.randomUUID()
});
assert.equal(noRole.status, 403);
assert.equal(noRole.payload.error_code, "FORBIDDEN_ROLE");

const ingestionKey = crypto.randomUUID();
const uploaded = await request("/api/ingestions", {
  method: "POST",
  body: {doc_id: "DOC-FAQ-V1", src_id: "SRC-PUB-001", source_version: "1.0.0"},
  key: ingestionKey
});
assert.equal(uploaded.status, 202);
assert.equal(uploaded.payload.document_status, "DOCUMENT_INDEXING");
assert.equal(uploaded.payload.publishable, false);
assert.equal(uploaded.payload.source_mode, "TEST_ADAPTER");
assert.equal(createCalls, 1);

const replayed = await request("/api/ingestions", {
  method: "POST",
  body: {doc_id: "DOC-FAQ-V1", src_id: "SRC-PUB-001", source_version: "1.0.0"},
  key: ingestionKey
});
assert.equal(replayed.payload.ingestion_id, uploaded.payload.ingestion_id);
assert.equal(createCalls, 1, "idempotent request created a duplicate document");

const ingestionId = uploaded.payload.ingestion_id;
const parsed = await request(`/api/ingestions/${ingestionId}`);
assert.equal(parsed.payload.provider_status, "PARSING");
assert.equal(parsed.payload.publishable, false);
const indexed = await request(`/api/ingestions/${ingestionId}`);
assert.equal(indexed.payload.provider_status, "INDEXING");
assert.equal(indexed.payload.publishable, false);
const ready = await request(`/api/ingestions/${ingestionId}`);
assert.equal(ready.payload.provider_status, "READY");
assert.equal(ready.payload.document_status, "DOCUMENT_READY");
assert.equal(ready.payload.publishable, true);

const updatedExisting = await request("/api/ingestions", {
  method: "POST",
  body: {doc_id: "DOC-FAQ-V1", src_id: "SRC-PUB-001", source_version: "1.0.0"},
  key: crypto.randomUUID()
});
assert.equal(updatedExisting.status, 202);
assert.equal(updatedExisting.payload.ingestion_mode, "UPDATE_EXISTING");
assert.equal(updateCalls, 1);
assert.equal(createCalls, 1, "updating the canonical document created a duplicate");

const authFailed = await request("/api/ingestions", {
  method: "POST",
  body: {doc_id: "DOC-RETURN-V1", src_id: "SRC-PUB-003", source_version: "1.0.0"},
  key: crypto.randomUUID()
});
assert.equal(authFailed.status, 502);
assert.equal(authFailed.payload.error_code, "DATASET_AUTH_FAILED");
assert.ok(authFailed.payload.details.ingestion_id);

const retryStart = await request("/api/ingestions", {
  method: "POST",
  body: {doc_id: "DOC-SAFETY-V1", src_id: "SRC-PUB-002", source_version: "1.0.0"},
  key: crypto.randomUUID()
});
assert.equal(retryStart.status, 202);
const failed = await request(`/api/ingestions/${retryStart.payload.ingestion_id}`);
assert.equal(failed.payload.provider_status, "FAILED");
assert.equal(failed.payload.publishable, false);
assert.equal(failed.payload.retryable, true);

const retryKey = crypto.randomUUID();
const retry = await request(`/api/ingestions/${retryStart.payload.ingestion_id}/retry`, {
  method: "POST",
  body: {reason: "retry indexing"},
  key: retryKey
});
assert.equal(retry.status, 202);
assert.equal(updateCalls, 2, "retry should update the existing provider document");
assert.equal(createCalls, 3, "retry must not create another document");
const retryReplay = await request(`/api/ingestions/${retryStart.payload.ingestion_id}/retry`, {
  method: "POST",
  body: {reason: "retry indexing"},
  key: retryKey
});
assert.equal(retryReplay.payload.idempotency_replayed, true);
assert.equal(updateCalls, 2);

const evaluationMeta = await request("/api/evaluations/meta", {role: "evaluation"});
assert.equal(evaluationMeta.status, 200);
assert.equal(evaluationMeta.payload.task_count, 17);
assert.equal(evaluationMeta.payload.core_task_count, 12);

const callsBeforeEvaluation = providerCalls;
const evaluationStart = await request("/api/evaluations", {
  method: "POST",
  role: "evaluation",
  body: {task_scope: "ALL_17", model: "deepseek-v4-pro"},
  key: crypto.randomUUID()
});
assert.equal(evaluationStart.status, 202);
let run;
for (let attempt = 0; attempt < 100; attempt++) {
  const response = await request(`/api/evaluations/${evaluationStart.payload.run_id}`, {role: "evaluation"});
  run = response.payload;
  if (["PASSED", "FAILED", "BLOCKED", "COMPLETED_WITH_ERRORS"].includes(run.status)) break;
  await new Promise(resolve => setTimeout(resolve, 20));
}
assert.equal(run.status, "FAILED");
assert.equal(run.results.length, 17);
assert.equal(run.metrics.provider_call_count, 11);
assert.equal(run.metrics.p0_gate_count, 6);
assert.equal(run.metrics.p0_final_failures, 0);
assert.equal(run.metrics.quality_gate_status, "FAILED");
assert.ok(run.metrics.quality_warnings.length >= 1);
assert.equal(run.source_mode, "TEST_ADAPTER");
assert.equal(providerCalls - callsBeforeEvaluation, 12, "controlled retry count mismatch");
const k04Result = run.results.find(result => result.task_id === "POC-K04");
assert.equal(k04Result.retrieval_attempts.length, 2);
assert.equal(k04Result.retrieval_attempts[0].status, "ERROR");
assert.equal(k04Result.retrieval_attempts[1].status, "SUCCESS");
assert.notEqual(k04Result.retrieval_attempts[0].request_id, k04Result.retrieval_attempts[1].request_id);
assert.equal(run.metrics.cost.cost_status, "COST_UNKNOWN");
assert.equal(run.metrics.cost.p0_short_circuit_model_cost, 0);
assert.equal(run.metrics.cost.all_effective_response_cost, null);
assert.ok(run.results.every(result => result.question_hash));
assert.ok(run.results.some(result => result.p0 && result.provider_called === false));

const persisted = await request(`/api/evaluations/${evaluationStart.payload.run_id}`, {role: "evaluation"});
assert.equal(persisted.payload.results.length, 17);
assert.equal(persisted.payload.status, "FAILED");

await new Promise(resolve => app.server.close(resolve));
fs.rmSync(runtimeRoot, {recursive: true, force: true});
console.log("PASSED: Stage 4B-2A dataset ingestion, retry idempotency, real-evaluation orchestration, cost separation and P0 short circuit.");
