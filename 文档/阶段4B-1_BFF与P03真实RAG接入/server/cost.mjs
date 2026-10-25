function numericOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function createCostRecord({
  model,
  raw = null,
  timingMs = 0,
  answerStatus,
  citationSupportPassed = false,
  providerCalled = true
}) {
  const usage = raw?.metadata?.usage || {};
  const providerLatency = numericOrNull(usage.latency);
  return {
    provider: "Dify Cloud",
    model,
    prompt_tokens: numericOrNull(usage.prompt_tokens),
    completion_tokens: numericOrNull(usage.completion_tokens),
    total_tokens: numericOrNull(usage.total_tokens),
    provider_latency_ms: providerLatency === null ? timingMs : Math.round(providerLatency * 1000),
    estimated_input_cost: null,
    estimated_output_cost: null,
    estimated_total_cost: null,
    cost_status: "COST_UNKNOWN",
    answer_status: answerStatus,
    citation_support_passed: citationSupportPassed,
    effective_answer: providerCalled && answerStatus === "ANSWERED" && citationSupportPassed
  };
}

export function summarizeCost(records) {
  const modelRecords = records.filter(record => record?.provider === "Dify Cloud");
  const calls = modelRecords.filter(record => record.prompt_tokens !== null || record.total_tokens !== null);
  const effectiveAnswers = modelRecords.filter(record => record.effective_answer === true).length;
  const inputValues = modelRecords.map(record => record.prompt_tokens).filter(value => value !== null);
  const outputValues = modelRecords.map(record => record.completion_tokens).filter(value => value !== null);
  const costKnown = modelRecords.length > 0 && modelRecords.every(record => record.cost_status === "KNOWN");
  const totalEstimatedCost = costKnown
    ? modelRecords.reduce((sum, record) => sum + Number(record.estimated_total_cost || 0), 0)
    : null;
  return {
    call_count: calls.length,
    effective_answer_count: effectiveAnswers,
    average_prompt_tokens: inputValues.length
      ? Number((inputValues.reduce((sum, value) => sum + value, 0) / inputValues.length).toFixed(1))
      : null,
    average_completion_tokens: outputValues.length
      ? Number((outputValues.reduce((sum, value) => sum + value, 0) / outputValues.length).toFixed(1))
      : null,
    single_request_estimated_cost: null,
    effective_answer_estimated_cost: null,
    correct_source_hit_estimated_cost: null,
    fallback_count: 0,
    manual_escalation_count: records.filter(record => record?.manual_escalation === true).length,
    cost_status: costKnown ? "KNOWN" : "COST_UNKNOWN"
  };
}
