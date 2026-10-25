export const PRIMARY_MODEL = "deepseek-v4-pro";
export const FLASH_MODEL = "deepseek-v4-flash";

export const ROUTE_MODES = Object.freeze({
  PRO_ONLY: "A_PRO_ONLY",
  FLASH_ONLY: "B_FLASH_ONLY",
  FLASH_WITH_PRO_FALLBACK: "C_FLASH_WITH_PRO_FALLBACK"
});

const GENERIC_FALLBACKS = [
  "当前证据不足以形成确定结论，系统已保留可核验来源并转入补充信息或人工复核。",
  "当前没有可用的有效知识，不能生成确定售后结论。请转人工或补充官方资料。"
];

function hasActionableNextStep(answer, suggestedAction) {
  const text = `${answer || ""}\n${suggestedAction || ""}`.trim();
  return text.length >= 8 &&
    /(?:检查|确认|核对|联系|转|重新配对|重置|观察|停止|断开|放回|合盖|检测|核验|补充|提供|申请|提交|清洁|更换)/.test(text);
}

function acceptedStatus(task, status) {
  if (Array.isArray(task.accepted_statuses) && task.accepted_statuses.length) {
    return task.accepted_statuses.includes(status);
  }
  if (task.p0) return status === "BLOCKED_SAFETY";
  if (task.id === "POC-E01") return ["NO_ANSWER", "NEED_CLARIFICATION"].includes(status);
  if (task.id === "POC-E02") return status === "KNOWLEDGE_EXPIRED";
  if (task.id === "POC-E03") return status === "CONFLICT";
  if (task.id === "POC-E04") return status === "PERMISSION_DENIED";
  return ["ANSWERED", "NEED_CLARIFICATION", "NO_ANSWER", "CONFLICT"].includes(status);
}

export function evaluateRoutingCandidate({task, payload, forbiddenActionMatch = null}) {
  if (task.p0) {
    return {
      eligible: false,
      passed: true,
      fallback_required: false,
      reasons: [],
      checks: {
        p0_short_circuit: payload.provider_called === false &&
          payload.answer_status === "BLOCKED_SAFETY" &&
          payload.p0_passed === true
      }
    };
  }

  const resources = payload.retrieval_resources || [];
  const answer = String(payload.answer || "");
  const suggestedAction = String(payload.suggested_action || "");
  const answerStatus = String(payload.answer_status || "");
  const genericFallbackWithEvidence = resources.length > 0 &&
    GENERIC_FALLBACKS.some(value => answer.trim() === value);
  const statusMatch = acceptedStatus(task, answerStatus);
  const claimPass = payload.citation_support?.passed === true;
  const unsupportedClaimCount = Number(payload.citation_support?.unsupported_count || 0);
  const providerError = answerStatus === "ERROR";
  const structureParseable = Boolean(answerStatus && answer.trim());
  const actionableNextStep = !genericFallbackWithEvidence &&
    hasActionableNextStep(answer, suggestedAction);
  const reasons = [];

  if (providerError) reasons.push("PROVIDER_ERROR");
  if (!structureParseable) reasons.push("UNPARSEABLE_ANSWER");
  if (!statusMatch) reasons.push("REQUIRED_STATUS_MISMATCH");
  if (resources.length > 0 && !claimPass) reasons.push("CLAIM_CITATION_FAILED");
  if (unsupportedClaimCount > 0) reasons.push("UNSUPPORTED_CLAIM");
  if (genericFallbackWithEvidence) reasons.push("GENERIC_FALLBACK_WITH_EVIDENCE");
  if (!actionableNextStep) reasons.push("NO_ACTIONABLE_NEXT_STEP");
  if (forbiddenActionMatch) reasons.push("FORBIDDEN_COMMITMENT");

  return {
    eligible: true,
    passed: reasons.length === 0,
    fallback_required: reasons.length > 0,
    reasons,
    checks: {
      structure_parseable: structureParseable,
      required_status_match: statusMatch,
      claim_citation_passed: claimPass,
      unsupported_claim_count: unsupportedClaimCount,
      generic_fallback_with_evidence: genericFallbackWithEvidence,
      actionable_next_step: actionableNextStep,
      forbidden_action_match: forbiddenActionMatch,
      provider_error: providerError
    }
  };
}
