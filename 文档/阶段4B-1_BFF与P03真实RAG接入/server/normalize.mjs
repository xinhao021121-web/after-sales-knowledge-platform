import { catalogDocumentForResource, isExpired, isInternalOnly, publicSource } from "./catalog.mjs";
import { createCostRecord } from "./cost.mjs";
import { isMultiObjectiveQuestion } from "./objective-policy.mjs";

function cleanAnswer(value) {
  return String(value || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

function cleanDisplayText(value, {preserveNumbering = false} = {}) {
  return String(value || "")
    .replace(/\[citation:[^\]]+\]/g, "")
    .replaceAll("**", "")
    .replace(preserveNumbering ? /^[-*]\s+/ : /^(?:[-*]\s+|\d+\s*[.)、）]\s*)/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanActionDisplay(value) {
  return cleanDisplayText(value, {preserveNumbering: true})
    .replace(/\[(?:citation:)?(\d+|CHUNK-[A-Z0-9-]+|[0-9a-f-]{36})\]/gi, "")
    .replace(/[；;]?\s*依据\s*[：:].*$/i, "")
    .replace(/[（(]\s*[）)]/g, "")
    .replace(/[：:；;。\s]+$/g, "");
}

const ACTION_SIGNAL_PATTERN = /(?:放回|合盖|检查|观察|清洁|更换|重新配对|重置|检测|核验|联系|申请|停止|断电|隔离|转人工|转售后|维修|换新|换货)/;
const ACTION_CONCEPT_PATTERN = /(?:放回|合盖|检查|观察|清洁|更换|重新配对|忽略旧配对|重置|检测|核验|联系|申请|停止|断电|隔离|转人工|转售后|耳塞|网罩|声道|触点|线缆|电源|接口|碎屑)/g;

export function selectDocumentDiverseResources(resources, catalog, limit = 3) {
  const ranked = resources
    .map((resource, index) => ({
      resource,
      index,
      position: Number.isFinite(resource.position) ? resource.position : index + 1
    }))
    .sort((left, right) => left.position - right.position || left.index - right.index);
  const selected = [];
  const seenDocuments = new Set();
  const seenSegments = new Set();
  for (const {resource} of ranked) {
    const document = catalogDocumentForResource(catalog, resource);
    const documentId = document?.doc_id || resource.document_id || resource.document_name || null;
    const segmentId = resource.segment_id || null;
    if (!documentId || !segmentId) continue;
    if (seenDocuments.has(documentId) || seenSegments.has(segmentId)) continue;
    seenDocuments.add(documentId);
    seenSegments.add(segmentId);
    selected.push(resource);
    if (selected.length >= limit) break;
  }
  return selected;
}

export function selectUniqueSegmentResources(resources, limit = 3) {
  const selected = [];
  const seenSegments = new Set();
  for (const resource of resources) {
    const segmentId = resource.segment_id || null;
    if (!segmentId || seenSegments.has(segmentId)) continue;
    seenSegments.add(segmentId);
    selected.push(resource);
    if (selected.length >= limit) break;
  }
  return selected;
}

export function extractSupportedClaims(content) {
  const claims = [];
  for (const rawLine of String(content || "").split(/\r?\n/)) {
    const line = rawLine
      .replace(/^\s*#{1,6}\s*/, "")
      .replace(/^CHUNK-[A-Z0-9-]+\s*/i, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!line || /^来源\s*[：:]/.test(line) || /^\|?[-:| ]+\|?$/.test(line)) continue;
    for (const piece of line.split(/(?<=[。！？])/)) {
      const claim = cleanDisplayText(piece);
      if (claim.length < 12) continue;
      if (!/[。；：]/.test(claim) && claim.length < 28) continue;
      if (!/[。；]|不得|必须|应|需要|可以|不能|若|通常|以.*为准/.test(claim)) continue;
      if (!claims.includes(claim)) claims.push(claim.slice(0, 220));
      if (claims.length >= 3) return claims;
    }
  }
  return claims;
}

function normalizedBigrams(value) {
  const text = String(value || "").replace(/[\s，。！？；：、,.!?;:“”"'（）()【】[\]|*-]/g, "");
  const grams = new Set();
  for (let index = 0; index < text.length - 1; index++) grams.add(text.slice(index, index + 2));
  return grams;
}

function matchingClaimsForAnswer(claims, answer) {
  const answerGrams = normalizedBigrams(answer);
  if (!answerGrams.size) return [];
  return claims.filter(claim => {
    const claimGrams = normalizedBigrams(claim);
    if (!claimGrams.size) return false;
    let overlap = 0;
    for (const gram of claimGrams) if (answerGrams.has(gram)) overlap++;
    return overlap / claimGrams.size >= 0.34;
  }).slice(0, 3);
}

function claimCoverage(claim, answer) {
  const claimGrams = normalizedBigrams(claim);
  const answerGrams = normalizedBigrams(answer);
  if (!claimGrams.size) return 0;
  let overlap = 0;
  for (const gram of claimGrams) if (answerGrams.has(gram)) overlap++;
  return overlap / claimGrams.size;
}

function claimConceptsCovered(claim, answer) {
  const concepts = [...new Set(String(claim || "").match(ACTION_CONCEPT_PATTERN) || [])];
  return concepts.length > 0 && concepts.every(concept => answer.includes(concept));
}

function sectionLines(answer, headings) {
  const lines = answer.split(/\r?\n/);
  const cleanedLines = lines.map(line => line.replaceAll("**", "").trim());
  const start = cleanedLines.findIndex(line => headings.some(heading => line.includes(heading)));
  if (start < 0) return [];
  const values = [];
  const firstLine = cleanedLines[start];
  const startColon = firstLine.search(/[：:]/);
  if (startColon >= 0) {
    const inline = cleanDisplayText(firstLine.slice(startColon + 1));
    if (inline.length >= 4) values.push(inline);
  }
  for (const line of lines.slice(start + 1)) {
    const trimmed = line.trim();
    if (values.length && (/^【[^】]+】/.test(trimmed) || /^#{1,3}\s/.test(trimmed) || /^\*\*[^*]+\*\*\s*[：:]?\s*$/.test(trimmed))) break;
    const cleaned = line
      .replace(/\[citation:[^\]]+\]/g, "")
      .replace(/^\s*[-*\d.\s]+/, "")
      .replaceAll("**", "")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned.length >= 3 && !/^\|.*\|$/.test(cleaned) && !/^(业务条件|判断条件|适用条件|下一步动作)$/.test(cleaned)) {
      values.push(cleaned.replace(/[：:；;。\s]+$/g, ""));
    }
    if (values.length >= 4) break;
  }
  return [...new Set(values)];
}

function resolveMarker(marker, resources) {
  if (/^\d+$/.test(marker)) return resources[Number(marker) - 1] || null;
  return resources.find(resource => String(resource.content || "").includes(marker)) || null;
}

function citedMarkerValues(value) {
  return [
    ...String(value || "").matchAll(/\[(?:citation:)?(\d+|CHUNK-[A-Z0-9-]+|[0-9a-f]{8}-[0-9a-f-]{27})\]/gi)
  ].map(match => match[1]);
}

export function extractGoalSections(answer) {
  const lines = String(answer || "").split(/\r?\n/);
  const sections = [];
  let current = null;
  for (const rawLine of lines) {
    const line = rawLine.replaceAll("**", "").trim();
    const heading = line.match(/^#{0,6}\s*(?:业务)?目标\s*([一二三四1-4])\s*[：:]\s*(.+)$/);
    if (heading) {
      if (current) sections.push(current);
      current = {
        index: heading[1],
        title: `目标${heading[1]}：${cleanDisplayText(heading[2])}`,
        lines: []
      };
      continue;
    }
    if (!current) continue;
    if (/^#{1,6}\s*(?:仍需确认|信息缺口|引用依据|下一步动作)/.test(line)) {
      sections.push(current);
      current = null;
      continue;
    }
    const cleaned = cleanDisplayText(line);
    if (cleaned) current.lines.push(cleaned);
  }
  if (current) sections.push(current);
  return sections.map(section => {
    const content = section.lines.join(" ").slice(0, 700);
    return {
      index: section.index,
      title: section.title,
      content,
      text: `${section.title} ${content}`
    };
  }).filter(section => section.content.length >= 12);
}

export function extractVisibleActionLines(answer, goalSections = []) {
  const values = [];
  let collecting = false;
  for (const rawLine of String(answer || "").split(/\r?\n/)) {
    const line = rawLine.replaceAll("**", "").trim();
    if (!line) continue;
    const actionHeading = line.match(/^(?:下一步动作|下一步|应先检查|顺序执行|先执行)\s*[：:]\s*(.*)$/);
    if (actionHeading) {
      collecting = true;
      if (actionHeading[1]) values.push(actionHeading[1]);
      continue;
    }
    if (collecting && /^(?:#{1,6}\s*)?(?:判断|依据|业务条件|仍需确认|需补充|信息缺口)/.test(line)) {
      collecting = false;
      continue;
    }
    if (collecting) values.push(line);
  }
  if (!values.length) {
    for (const section of goalSections) {
      for (const clause of section.content.split(/[。；]/)) values.push(clause);
    }
  }
  const candidates = [...new Set(values.map(value => cleanActionDisplay(value)
    .replace(/^顺序执行\s*[：:]?\s*/, "")
    .replace(/^先执行\s*[：:]?\s*/, "")
    .replace(/^判断\s*[：:]?\s*/, "")
    .replace(/^依据\s*[：:]?.*$/, "")
    .replace(/\[(?:citation:)?(?:\d+|CHUNK-[A-Z0-9-]+|[0-9a-f-]{36})\]/gi, "")
    .trim()
  ))]
    .filter(value => value.length >= 8)
    .filter(value => ACTION_SIGNAL_PATTERN.test(value))
    .filter(value => !/(?:目标[一二三四1-4]|上述(?:步骤|顺序|排查|内容))/.test(value));
  const deduped = [];
  for (const candidate of candidates) {
    const candidateGrams = normalizedBigrams(candidate);
    const duplicateIndex = deduped.findIndex(existing => {
      if (existing.includes(candidate) || candidate.includes(existing)) return true;
      const existingGrams = normalizedBigrams(existing);
      let overlap = 0;
      for (const gram of candidateGrams) if (existingGrams.has(gram)) overlap++;
      return candidateGrams.size > 0 && overlap / candidateGrams.size >= 0.8;
    });
    if (duplicateIndex < 0) deduped.push(candidate);
    else if (candidate.length > deduped[duplicateIndex].length) deduped[duplicateIndex] = candidate;
    if (deduped.length >= 4) break;
  }
  return deduped;
}

function summarizeAnswer(answer, status, goalSections = [], options = {}) {
  const actionLines = options.actionLines || [];
  const actionSummary = actionLines.length ? `下一步：${actionLines.join("；")}。` : "";
  if (status === "ANSWERED") {
    if (options.showGoalSections && goalSections.length >= 2) {
      return goalSections
        .map(section => `${section.title}：${section.content}`)
        .join("\n");
    }
    const lines = answer
      .split(/\r?\n/)
      .map(line => cleanDisplayText(line))
      .filter(line => line && !/^(业务条件|适用条件|引用|来源|下一步动作|下一步|知识不足)/.test(line))
      .filter(line => !/^目标[一二三四1-4]\s*[：:]/.test(line))
      .filter(line => options.showGoalSections || !/目标[一二三四1-4]|上述(?:步骤|顺序|排查|内容)/.test(line));
    const judgmentLines = lines.filter(line => /^判断\s*[：:]/.test(line));
    const candidates = (judgmentLines.length ? judgmentLines : lines)
      .flatMap(line => line.split(/(?<=[。！？])/))
      .filter(line => line.length >= 18)
      .slice(0, 2);
    if (candidates.length) {
      return `${candidates.join(" ").slice(0, 320)}${actionSummary ? ` ${actionSummary}` : ""}`.trim();
    }
    if (actionLines.length) return actionSummary;
    return "已基于可追溯切片形成条件化建议，请核对结构化业务条件后执行下一步。";
  }
  if (status === "NEED_CLARIFICATION") {
    if (actionLines.length) {
      return `${actionSummary} 完成上述步骤后可继续判断。`;
    }
    return "当前证据不足以形成确定结论，系统已保留可核验来源并转入补充信息或人工复核。";
  }
  if (status === "NO_ANSWER") {
    return "当前没有可用的有效知识，不能生成确定售后结论。请转人工或补充官方资料。";
  }
  if (status === "CONFLICT") {
    return "两份渠道结论存在冲突，系统已保持 CONFLICT_HOLD，不强行合并为单一结论。";
  }
  if (status === "PERMISSION_DENIED") {
    return "当前请求涉及不可向该角色披露的内部知识，已阻止引用与回答。";
  }
  if (status === "KNOWLEDGE_EXPIRED") {
    return "检索到的知识版本已过期，不能作为现行售后依据。";
  }
  return "当前回答不可直接用于对客承诺。";
}

function joinActionItems(items) {
  const unique = [...new Set(items.map(cleanActionDisplay).filter(Boolean))]
    .slice(0, 4)
    .map(item => item.replace(/[：:；;。\s]+$/g, ""));
  return unique.length ? `${unique.join("；")}。` : null;
}

export function normalizeProviderAnswer({raw, request, catalog, providerRequestId, timingMs, model}) {
  let answer = cleanAnswer(raw.answer);
  const providerSignalsNoAnswer = /知识不足|无适用引用|知识库未收录|没有(?:相关|适用)?(?:信息|知识)|无法[^。！？]{0,18}确认|不能确认/.test(answer);
  const resources = Array.isArray(raw.metadata?.retriever_resources)
    ? raw.metadata.retriever_resources
    : [];
  const retrievalTrace = raw.metadata?.retrieval_trace || null;
  const displayedResources = retrievalTrace
    ? selectUniqueSegmentResources(resources, 3)
    : selectDocumentDiverseResources(resources, catalog, 3);
  const evaluated = displayedResources.map((resource, index) => {
    const document = catalogDocumentForResource(catalog, resource);
    return {
      resource,
      document,
      index: index + 1,
      expired: isExpired(document),
      internal: isInternalOnly(document)
    };
  });
  const blockedInternal = evaluated.filter(item => item.internal && !["legal", "admin"].includes(request.role));
  const expired = evaluated.filter(item => item.expired);
  const allowed = evaluated.filter(item => item.document && !item.expired && !blockedInternal.includes(item));
  const troubleshootingQuestion = !isMultiObjectiveQuestion(request.question) &&
    /(?:排查|检查|怎么|如何|处理|故障|不响|不充电|发热|连接)/.test(String(request.question || ""));
  const supplementalEntries = [];
  if (troubleshootingQuestion && !providerSignalsNoAnswer) {
    for (const item of allowed) {
      let addedForResource = 0;
      const claimLimit = item.index === 1 ? 3 : 2;
      for (const claim of extractSupportedClaims(item.resource.content)) {
        if (!ACTION_SIGNAL_PATTERN.test(claim)) continue;
        if (answer.includes(claim) || claimCoverage(claim, answer) >= 0.95 ||
            claimConceptsCovered(claim, answer)) continue;
        if (supplementalEntries.some(entry => entry.claim === claim)) continue;
        supplementalEntries.push({claim, position: item.index});
        addedForResource++;
        if (addedForResource >= claimLimit) break;
      }
      if (supplementalEntries.length >= 8) break;
    }
    if (supplementalEntries.length) {
      answer += `\n补充正文步骤：${supplementalEntries
        .map(entry => `${entry.claim.replace(/[。；;：:\s]+$/g, "")}[${entry.position}]`)
        .join("；")}`;
    }
  }
  if (/(?:维修|检测|换新|换货)/.test(answer) &&
      !/(?:不承诺免费维修或换新|不得承诺免费维修或换新)/.test(answer)) {
    answer += "\n不承诺免费维修或换新。";
  }
  const markers = citedMarkerValues(answer);
  const cited = markers.map(marker => {
    const resource = resolveMarker(marker, resources);
    return evaluated.find(item => item.resource === resource) || null;
  }).filter(Boolean);
  const allowedCited = cited.filter(item => allowed.includes(item));
  const claimMappedCitations = [...new Map(allowedCited.map(item => {
    const citationId = `EVD-${item.resource.segment_id}`;
    const supportedClaims = extractSupportedClaims(item.resource.content);
    return [citationId, {
      citation_id: citationId,
      source: publicSource(item.document, item.resource.segment_id),
      kb_id: item.document.kb_id,
      kb_version_id: item.document.version,
      chunk_id: item.resource.segment_id,
      segment_id: item.resource.segment_id,
      score: item.resource.score,
      supported_claims: supportedClaims,
      claim_support_status: supportedClaims.length ? "SUPPORTED" : "NO_CONCRETE_CLAIM",
      traceable: supportedClaims.length > 0
    }];
  })).values()].filter(citation => citation.supported_claims.length > 0)
    .map(citation => ({...citation, grounding_mode: "DIFY_MARKER"}));
  const fallbackClaimCitations = allowed.flatMap(item => {
    const supportedClaims = matchingClaimsForAnswer(extractSupportedClaims(item.resource.content), answer);
    if (!supportedClaims.length) return [];
    const citationId = `EVD-${item.resource.segment_id}`;
    return [{
      citation_id: citationId,
      source: publicSource(item.document, item.resource.segment_id),
      kb_id: item.document.kb_id,
      kb_version_id: item.document.version,
      chunk_id: item.resource.segment_id,
      segment_id: item.resource.segment_id,
      score: item.resource.score,
      supported_claims: supportedClaims,
      claim_support_status: "SUPPORTED",
      traceable: true,
      grounding_mode: "BFF_CLAIM_MATCH"
    }];
  });
  const supportedCitations = [...new Map(
    [...claimMappedCitations, ...fallbackClaimCitations].map(citation => [citation.citation_id, citation])
  ).values()];
  const unsupportedCitedCount = allowedCited.filter(item => extractSupportedClaims(item.resource.content).length === 0).length;
  const disallowedCitedCount = cited.filter(item => !allowed.includes(item)).length;
  const unresolvedMarkerCount = Math.max(0, markers.length - cited.length);
  const allMarkersClaimSupported = supportedCitations.length > 0;
  const conflict = /平台拒修/.test(answer) && /(?:Apple|官方)/.test(answer) && /换新|置换/.test(answer);
  const providerNeedsClarification = /信息不足|知识不足|需要补充|暂无法|需进一步核实|无法[^。！？]{0,40}(?:确认|判断|确定|结论)|不能[^。！？]{0,40}(?:确认|判断|确定|结论)/.test(answer);
  const explicitKnowledgeGap = /当前知识不足|知识库未收录|缺少[^。！？]{0,24}(?:正文|证据|业务条款)|没有(?:可用的?)?(?:正文|相关|适用)?(?:信息|知识|证据)|未检索到[^。！？]{0,24}(?:正文|证据)|无法(?:判断|确认)[^。！？]{0,24}(?:能否|是否|可退|维修)/.test(answer);
  const actionableEvidence = fallbackClaimCitations.length > 0 &&
    /先[^。！？]{0,80}(?:检查|确认|清洁|重置|配对|放回|核验|检测|提交)|(?:检查|清洁|重新配对|重置|转售后检测|申请退货|官方售后|保修入口|维修入口|提交检测)/.test(answer);
  const context = request.customer_context || {};
  const contextPermissionDenied = context.requested_scope === "internal_only" && !["legal", "admin"].includes(request.role);
  const contextExpired = /过期|失效/.test(String(context.knowledge_state || ""));
  const contextNoKnowledge = context.knowledge_present === false;
  const explicitMultiObjective = isMultiObjectiveQuestion(request.question);
  const goalSections = extractGoalSections(answer);
  const citedSegmentCount = new Set(allowedCited.map(item => item.resource.segment_id)).size;
  const goalsWithEvidence = goalSections.map(section => {
    const citedForGoal = citedMarkerValues(section.text)
      .map(marker => resolveMarker(marker, resources))
      .filter(resource => resource && allowed.some(item => item.resource === resource));
    if (citedForGoal.some(resource => extractSupportedClaims(resource.content).length > 0)) return true;
    return supportedCitations.some(citation =>
      matchingClaimsForAnswer(citation.supported_claims, section.text).length > 0
    );
  });
  const multiGoalRequirementActive = explicitMultiObjective && goalSections.length >= 2;
  const multiGoalEvidencePassed = !multiGoalRequirementActive ||
    (goalsWithEvidence.filter(Boolean).length >= 2 && citedSegmentCount >= 2);
  const hasGroundedMultiGoal = multiGoalRequirementActive && multiGoalEvidencePassed;

  let status = "ANSWERED";
  let finalAnswer = answer;
  let errorCode = null;
  if (contextPermissionDenied || (blockedInternal.length && allowed.length === 0)) {
    status = "PERMISSION_DENIED";
    finalAnswer = "当前请求涉及不可向该角色披露的内部知识，已阻止引用与回答。";
    errorCode = "FORBIDDEN_SCOPE";
  } else if (contextExpired || (expired.length && allowed.length === 0)) {
    status = "KNOWLEDGE_EXPIRED";
    finalAnswer = "检索到的知识版本已过期，不能作为现行售后依据。请先完成来源复核或转人工。";
    errorCode = "KNOWLEDGE_EXPIRED";
  } else if (contextNoKnowledge || allowed.length === 0) {
    status = "NO_ANSWER";
    finalAnswer = "当前没有可用的有效知识，不能生成确定结论。请转人工或补充官方资料。";
    errorCode = "NO_ANSWER";
  } else if (conflict || /渠道结论冲突|保留双方书面结论/.test(answer)) {
    status = "CONFLICT";
  } else if (markers.length === 0 && providerSignalsNoAnswer) {
    status = "NO_ANSWER";
    finalAnswer = answer || "当前没有可用的有效知识，不能生成确定结论。请转人工或补充官方资料。";
    errorCode = "NO_ANSWER";
  } else if (!hasGroundedMultiGoal &&
      (explicitKnowledgeGap || (providerNeedsClarification && !actionableEvidence))) {
    status = "NEED_CLARIFICATION";
  }

  let citations = supportedCitations;

  if (status === "ANSWERED" && !allMarkersClaimSupported) {
    status = "NEED_CLARIFICATION";
    errorCode = null;
  }
  if (status === "ANSWERED" && !multiGoalEvidencePassed) {
    status = "NEED_CLARIFICATION";
    errorCode = null;
  }
  if (status === "NO_ANSWER" && allMarkersClaimSupported && !contextNoKnowledge) {
    status = providerNeedsClarification ? "NEED_CLARIFICATION" : "ANSWERED";
    errorCode = null;
  }
  if (["PERMISSION_DENIED", "KNOWLEDGE_EXPIRED", "NO_ANSWER"].includes(status)) {
    citations = [];
  }

  const conditions = sectionLines(answer, ["业务条件", "适用条件", "判断条件"]);
  const actions = sectionLines(answer, ["下一步动作", "下一步", "应先检查"]);
  const visibleActionLines = [...new Set([
    ...extractVisibleActionLines(answer, goalSections),
    ...supplementalEntries.map(entry => entry.claim)
  ])];
  const summary = summarizeAnswer(answer, status, goalSections, {
    actionLines: visibleActionLines,
    showGoalSections: explicitMultiObjective
  });
  const suggestedAction = [...new Set(
    visibleActionLines.length ? visibleActionLines : (actions || [])
  )]
    .filter(item => !/(?:目标[一二三四1-4]|上述(?:步骤|顺序|排查|内容))/.test(item))
    .slice(0, 4);
  const riskLevel = status === "CONFLICT"
    ? "R2"
    : ["PERMISSION_DENIED", "KNOWLEDGE_EXPIRED"].includes(status)
      ? "R1"
      : ["NO_ANSWER", "NEED_CLARIFICATION"].includes(status)
        ? "R1"
        : "R0";

  const citationSupportPassed = allMarkersClaimSupported && multiGoalEvidencePassed;
  return {
    answer_status: status,
    ui_state: status === "CONFLICT" ? "CONFLICT_HOLD" : status,
    answer: summary,
    suggested_action: joinActionItems(suggestedAction) ||
      (status === "ANSWERED" ? "由有权限角色复核引用与承诺边界后确认。" : null),
    business_conditions: conditions.length
      ? conditions
      : [],
    citations,
    answer_goals: goalSections.map((section, index) => ({
      index: section.index,
      title: section.title,
      content: section.content,
      evidence_supported: goalsWithEvidence[index]
    })),
    risk: {
      level: riskLevel,
      p0_triggered: false,
      escalation_required: ["R2", "R3"].includes(riskLevel)
    },
    provider_request_id: providerRequestId,
    provider_trace_id: providerRequestId,
    provider_called: true,
    timing_ms: timingMs,
    error_code: errorCode,
    source_mode: "REAL_RAG",
    cost: createCostRecord({
      model,
      raw,
      timingMs,
      answerStatus: status,
      citationSupportPassed,
      providerCalled: true
    }),
    evidence_summary: {
      retrieved_count: resources.length,
      valid_count: allowed.length,
      expired_filtered: expired.length,
      permission_filtered: blockedInternal.length,
      citation_markers: markers.length,
      claim_supported_citations: citations.length,
      unsupported_citations: unsupportedCitedCount,
      disallowed_citations: disallowedCitedCount,
      unresolved_markers: unresolvedMarkerCount
    },
    citation_support: {
      required: true,
      passed: citationSupportPassed,
      supported_count: citations.length,
      multi_objective_passed: multiGoalEvidencePassed,
      unsupported_count: unsupportedCitedCount + disallowedCitedCount + unresolvedMarkerCount
    },
    retrieval_resources: displayedResources.map((resource, index) => ({
      position: index + 1,
      document_name: resource.document_name,
      document_id: catalogDocumentForResource(catalog, resource)?.doc_id || null,
      kb_version_id: catalogDocumentForResource(catalog, resource)?.version || null,
      segment_id: resource.segment_id,
      score: resource.score,
      claim_support_count: extractSupportedClaims(resource.content).length
    })),
    retrieval_diversity: {
      merge_strategy: retrievalTrace?.merge_strategy || "PROVIDER_ORDER_DOCUMENT_DEDUPE",
      requested_internal_top_k: retrievalTrace?.requested_internal_top_k ?? null,
      subquery_count: retrievalTrace?.subquery_count ?? 1,
      subqueries: retrievalTrace?.subqueries || [],
      internal_candidate_pool_size: retrievalTrace?.candidate_pool_size ?? resources.length,
      displayed_top_k: displayedResources.length,
      candidate_document_count: retrievalTrace?.candidate_document_count ?? new Set(resources.map(resource =>
        catalogDocumentForResource(catalog, resource)?.doc_id || resource.document_id
      ).filter(Boolean)).size,
      displayed_document_count: displayedResources.length,
      duplicate_segments_suppressed: resources.length - new Set(
        resources.map(resource => resource.segment_id).filter(Boolean)
      ).size
    }
  };
}

export function normalizeRetrievalResources({resources, request, catalog, retrievalTrace = null}) {
  const filters = {
    expired: 0,
    permission: 0,
    unmapped: 0
  };
  const hits = [];
  const eligible = [];
  for (const resource of resources) {
    const document = catalogDocumentForResource(catalog, resource);
    if (!document) {
      filters.unmapped++;
      continue;
    }
    if (isExpired(document)) {
      filters.expired++;
      continue;
    }
    if (isInternalOnly(document) && !["legal", "admin"].includes(request.role)) {
      filters.permission++;
      continue;
    }
    eligible.push(resource);
  }
  const selectedResources = retrievalTrace
    ? selectUniqueSegmentResources(eligible, 3)
    : selectDocumentDiverseResources(eligible, catalog, 3);
  for (const resource of selectedResources) {
    const document = catalogDocumentForResource(catalog, resource);
    const supportedClaims = extractSupportedClaims(resource.content);
    hits.push({
      kb_id: document.kb_id,
      kb_version_id: document.version,
      source: publicSource(document, resource.segment_id),
      chunk_id: resource.segment_id,
      segment_id: resource.segment_id,
      text: String(resource.content || ""),
      score: resource.score,
      metadata: {
        document_name: resource.document_name,
        dataset_name: resource.dataset_name,
        permission_scope: document.permission_scope
      },
      citation_id: supportedClaims.length ? `EVD-${resource.segment_id}` : null,
      supported_claims: supportedClaims,
      traceable: supportedClaims.length > 0
    });
  }
  return {
    hits,
    filters,
    status: hits.length ? "ANSWERED" : filters.permission ? "PERMISSION_DENIED" : filters.expired ? "KNOWLEDGE_EXPIRED" : "NO_ANSWER"
  };
}
