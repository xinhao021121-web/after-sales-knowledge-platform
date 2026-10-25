import { containsForbidden } from "./evaluation-service.mjs";

function conceptGroupHit(text, concepts) {
  const normalizedText = String(text || "").replace(/\s+/g, "").toLowerCase();
  return concepts.some(concept =>
    normalizedText.includes(String(concept).replace(/\s+/g, "").toLowerCase())
  );
}

function sourceIds(resources, citations) {
  return new Set([
    ...(resources || []).map(item => item.document_id),
    ...(citations || []).map(item => item.source?.doc_id)
  ].filter(Boolean));
}

export function evaluateBusinessSemantics(task, response) {
  const expectation = task.semantic_expectations || {};
  const answer = [
    response.answer,
    response.suggested_action,
    ...(response.answer_goals || []).map(item => item.content)
  ].filter(Boolean).join("\n");
  const goals = Array.isArray(response.answer_goals) ? response.answer_goals : [];
  const resources = response.retrieval_resources || [];
  const citations = response.citations || [];
  const action = String(response.suggested_action || "");
  const docs = sourceIds(resources, citations);
  const objectives = (expectation.objectives || []).map(objective => {
    const missing_concept_groups = (objective.concept_groups || [])
      .filter(concepts => !conceptGroupHit(answer, concepts));
    const docPass = !objective.required_doc_any?.length ||
      objective.required_doc_any.some(docId => docs.has(docId));
    const goalPass = !expectation.min_answer_goals ||
      goals.some(goal =>
        goal.evidence_supported === true &&
        conceptGroupHit(String(goal.content || ""), objective.concept_groups?.[0] || [])
      );
    return {
      objective_id: objective.id,
      label: objective.label,
      passed: missing_concept_groups.length === 0 && docPass && goalPass,
      missing_concept_groups,
      required_doc_match: docPass,
      evidence_goal_match: goalPass
    };
  });
  const knowledgeGapConcepts = expectation.concept_groups || [];
  const knowledgeGapPass = !expectation.knowledge_gap_required ||
    conceptGroupHit(answer, knowledgeGapConcepts.flat());
  const safetyConceptsPass = !expectation.p0_required ||
    (expectation.concept_groups || []).every(concepts => conceptGroupHit(answer, concepts));
  const visibleGoalLabels = new Set(goals.map(goal =>
    String(goal.title || "").match(/目标[一二三四1-4]/)?.[0]
  ).filter(Boolean));
  const visibleAnswerLabels = [...new Set(
    [...answer.matchAll(/目标[一二三四1-4]/g)].map(match => match[0])
  )];
  const unseenGoalLabels = visibleAnswerLabels.filter(label => !visibleGoalLabels.has(label));
  const actionInternalReferences = [...new Set(
    [...action.matchAll(/目标[一二三四1-4]/g)].map(match => match[0])
  )];
  const visibleActionMissingGroups = (expectation.action_concept_groups || [])
    .filter(concepts => !conceptGroupHit(`${response.answer || ""}\n${action}`, concepts));
  const genericFallbacks = [
    "当前证据不足以形成确定结论，系统已保留可核验来源并转入补充信息或人工复核。",
    "当前没有可用的有效知识，不能生成确定售后结论。请转人工或补充官方资料。"
  ];
  const genericFallbackOnly = expectation.forbid_generic_fallback_when_evidence === true &&
    resources.length > 0 &&
    genericFallbacks.includes(String(response.answer || "").trim()) &&
    !action;
  const forbiddenAssertions = (expectation.forbidden_assertions || [])
    .filter(value => answer.includes(value));
  const documentRequestPatterns = [
    /(?:提供|补充|粘贴)\s*上述.{0,12}(?:文档|正文|切片|条款)/,
    /请\s*(?:提供|补充)\s*(?:系统)?(?:已)?检索到的.{0,12}(?:正文|切片|条款)/,
    /请\s*(?:提供|补充)\s*(?:上述|这些).{0,12}(?:文档|正文|切片)/
  ];
  const documentRequestMatches = expectation.knowledge_gap_required
    ? []
    : documentRequestPatterns
      .filter(pattern => pattern.test(answer))
      .map(pattern => pattern.source);
  const forbiddenAction = containsForbidden(task, answer);
  const citationRequired = response.answer_status === "ANSWERED" ||
    expectation.require_citation_regardless_status === true;
  const citationPass = !citationRequired ||
    (response.citation_support?.passed === true && citations.length >= (expectation.min_distinct_citations || 1));
  const goalCountPass = !expectation.min_answer_goals || goals.length >= expectation.min_answer_goals;
  const providerPass = expectation.provider_called == null ||
    response.provider_called === expectation.provider_called;
  const p0Pass = !expectation.p0_required ||
    (response.answer_status === "BLOCKED_SAFETY" && response.p0_passed === true);
  const checks = {
    status_accepted: (task.accepted_statuses || []).includes(response.answer_status),
    objectives_passed: objectives.every(item => item.passed),
    knowledge_gap_passed: knowledgeGapPass,
    safety_concepts_passed: safetyConceptsPass,
    visible_goal_labels: [...visibleGoalLabels],
    unseen_goal_labels: unseenGoalLabels,
    action_internal_references: actionInternalReferences,
    visible_action_missing_groups: visibleActionMissingGroups,
    generic_fallback_only: genericFallbackOnly,
    forbidden_assertions: forbiddenAssertions,
    document_request_matches: documentRequestMatches,
    forbidden_action_match: forbiddenAction,
    citation_gate_passed: citationPass,
    goal_count_passed: goalCountPass,
    provider_call_gate_passed: providerPass,
    p0_gate_passed: p0Pass
  };
  return {
    ...checks,
    objectives,
    passed: checks.status_accepted &&
      checks.objectives_passed &&
      checks.knowledge_gap_passed &&
      checks.safety_concepts_passed &&
      unseenGoalLabels.length === 0 &&
      actionInternalReferences.length === 0 &&
      visibleActionMissingGroups.length === 0 &&
      !genericFallbackOnly &&
      forbiddenAssertions.length === 0 &&
      documentRequestMatches.length === 0 &&
      !forbiddenAction &&
      citationPass &&
      goalCountPass &&
      providerPass &&
      p0Pass
  };
}
