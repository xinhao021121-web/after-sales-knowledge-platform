import { isMultiObjectiveQuestion } from "./objective-policy.mjs";

export class ProviderError extends Error {
  constructor(code, message, {status = 502, retryable = false, providerRequestId = null} = {}) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.providerRequestId = providerRequestId;
  }
}

function queryForDify(request, evidence = []) {
  const question = request.question.startsWith("原始问题：")
    ? request.question
    : `原始问题：${request.question}`;
  const customerContext = Object.keys(request.customer_context || {}).length
    ? request.customer_context
    : {
        product_model: request.product_model,
        channel: request.channel,
        role: request.role
      };
  const sections = [
    question,
    "“改写问法”只用于补充检索意图，不表示用户已确认其中新增的事实；未在原始问题或已知上下文中出现的事实不得当成已知。",
    `已知上下文：${JSON.stringify(customerContext)}`,
    "请给出条件、引用与下一步动作；知识不足时明确追问或拒答。"
  ];
  if (evidence.length) {
    sections.push(
      "以下为文档级去重后的 Top3 检索证据。请优先且仅依据这些正文切片形成业务结论；" +
      "引用依据必须保留对应的 segment_id 或 CHUNK 编号，不要引用其他背景上下文中的标题或元数据。",
      ...evidence.map((resource, index) =>
        `[${index + 1}] ${resource.document_name} | ${resource.segment_id}\n${resource.content}`
      )
    );
  }
  return sections.join("\n");
}

export function buildRetrievalSubqueries(question) {
  const values = String(question || "")
    .split(/\r?\n/)
    .flatMap(line => line
      .replace(/^原始问题\s*[：:]\s*/, "")
      .replace(/^改写问法\s*[：:]\s*/, "")
      .split(/(?<=[？?])\s*[；;]\s*|[；;](?=\s*(?:第三方|Apple|AirPods|京东|平台|官方))/)
    )
    .map(value => value.trim())
    .filter(value => value.length >= 6);
  return [...new Set(values)].slice(0, 3);
}

export { isMultiObjectiveQuestion };

export function buildRetrievalQueries(question) {
  const subqueries = buildRetrievalSubqueries(question);
  const originalQuery = subqueries[0] || String(question || "");
  const multiObjective = isMultiObjectiveQuestion(question);
  const intentSupplement = subqueries.slice(1).join("；");
  return {
    subqueries,
    originalQuery,
    multiObjective,
    retrievalQueries: multiObjective && intentSupplement
      ? [originalQuery, `${originalQuery}\n意图补充：${intentSupplement}`]
      : [originalQuery]
  };
}

function isSubstantiveRecord(record) {
  const content = String(record.content || "").trim();
  return !/^---(?:\r?\n|$)/.test(content) &&
    content.length >= 40 &&
    /(?:不得|不能|应|需|可以|若|如果|日内|检测|维修|退货|保修|步骤|核对|确认)/.test(content);
}

function mergeCandidatePool(resultSets) {
  const seenSegments = new Set();
  const candidatePool = [];
  for (const [setIndex, records] of resultSets.entries()) {
    for (const record of records) {
      const key = record.segment_id;
      if (!key || seenSegments.has(key)) continue;
      seenSegments.add(key);
      candidatePool.push({...record, result_set_index: setIndex});
    }
  }
  return candidatePool;
}

export function selectRelevanceFirstCandidates(resultSets, limit = 3) {
  const candidatePool = mergeCandidatePool(resultSets);
  const substantivePool = candidatePool.filter(isSubstantiveRecord);
  const ranked = (substantivePool.length ? substantivePool : candidatePool)
    .sort((left, right) =>
      Number(right.score || 0) - Number(left.score || 0) ||
      Number(left.position || 0) - Number(right.position || 0)
    );
  const topScore = Number(ranked[0]?.score || 0);
  const selected = ranked
    .filter(record => Number(record.score || 0) >= topScore - 0.12)
    .slice(0, limit);
  return {
    selected,
    candidatePool,
    candidateDocumentCount: new Set(candidatePool.map(item => item.document_id)).size
  };
}

export function mergeDiverseCandidates(resultSets, limit = 3, query = "") {
  const candidatePool = mergeCandidatePool(resultSets);
  const byDocument = new Map();
  for (const record of candidatePool) {
    if (!record.document_id) continue;
    const values = byDocument.get(record.document_id) || [];
    values.push(record);
    byDocument.set(record.document_id, values);
  }
  const normalizedBigrams = value => {
    const text = String(value || "")
      .toLowerCase()
      .replace(/[\s，。！？；：、,.!?;:“”"'（）()【】[\]|*\-]/g, "");
    const grams = new Set();
    for (let index = 0; index < text.length - 1; index++) {
      grams.add(text.slice(index, index + 2));
    }
    return grams;
  };
  const queryGrams = normalizedBigrams(query);
  const lexicalCoverage = record => {
    if (!queryGrams.size) return 0;
    const recordGrams = normalizedBigrams(record.content);
    let matches = 0;
    for (const gram of queryGrams) if (recordGrams.has(gram)) matches++;
    return matches / queryGrams.size;
  };
  const rankingScore = record => Number(record.score || 0);
  const substantiveByDocument = new Map(
    [...byDocument.entries()].map(([documentId, records]) => {
      const values = records.filter(isSubstantiveRecord);
      return [documentId, values.length ? values : records];
    })
  );
  const documentGrams = new Map(
    [...substantiveByDocument.entries()].map(([documentId, records]) => {
      const grams = new Set();
      for (const record of records) {
        for (const gram of normalizedBigrams(record.content)) grams.add(gram);
      }
      return [documentId, grams];
    })
  );
  const documentFrequency = new Map();
  for (const gram of queryGrams) {
    let count = 0;
    for (const grams of documentGrams.values()) if (grams.has(gram)) count++;
    documentFrequency.set(gram, count);
  }
  const totalQueryWeight = [...queryGrams].reduce((total, gram) => {
    return total + Math.log((documentGrams.size + 1) / ((documentFrequency.get(gram) || 0) + 1)) + 1;
  }, 0);
  const documentCoverage = documentId => {
    if (!totalQueryWeight) return 0;
    const grams = documentGrams.get(documentId) || new Set();
    const matchedWeight = [...queryGrams].reduce((total, gram) => {
      if (!grams.has(gram)) return total;
      return total + Math.log((documentGrams.size + 1) / ((documentFrequency.get(gram) || 0) + 1)) + 1;
    }, 0);
    return matchedWeight / totalQueryWeight;
  };
  const representatives = [...byDocument.entries()].map(([documentId, records]) => {
    const record = [...records].sort((left, right) => {
      const substanceDifference = Number(isSubstantiveRecord(right)) - Number(isSubstantiveRecord(left));
      if (substanceDifference) return substanceDifference;
      const scoreDifference = rankingScore(right) - rankingScore(left);
      if (scoreDifference) return scoreDifference;
      return Number(left.position || 0) - Number(right.position || 0);
    })[0];
    return {
      ...record,
      lexical_coverage: lexicalCoverage(record),
      document_coverage: documentCoverage(documentId),
      ranking_score: rankingScore(record)
    };
  }).sort((left, right) => {
    const substanceDifference = Number(isSubstantiveRecord(right)) - Number(isSubstantiveRecord(left));
    if (substanceDifference) return substanceDifference;
    const coverageDifference = Number(right.document_coverage || 0) - Number(left.document_coverage || 0);
    if (coverageDifference) return coverageDifference;
    const scoreDifference = rankingScore(right) - rankingScore(left);
    if (scoreDifference) return scoreDifference;
    return Number(left.position || 0) - Number(right.position || 0);
  });
  const selected = [];
  const seenDocuments = new Set();
  if (resultSets.length > 1) {
    const documentQueues = resultSets.map((records, setIndex) => {
      const documents = new Set(
        candidatePool
          .filter(record => record.result_set_index === setIndex)
          .map(record => record.document_id)
          .filter(Boolean)
      );
      return representatives
        .filter(record => documents.has(record.document_id))
        .map(record => record.document_id);
    });
    for (let round = 0; round < limit && selected.length < limit; round++) {
      for (const documentQueue of documentQueues) {
        let documentId = documentQueue.shift();
        while (documentId && seenDocuments.has(documentId)) documentId = documentQueue.shift();
        if (!documentId) continue;
        const representative = representatives.find(record => record.document_id === documentId);
        if (!representative) continue;
        seenDocuments.add(documentId);
        selected.push(representative);
        if (selected.length >= limit) break;
      }
    }
  }
  for (const representative of representatives) {
    if (selected.length >= limit) break;
    if (seenDocuments.has(representative.document_id)) continue;
    seenDocuments.add(representative.document_id);
    selected.push(representative);
  }
  return {
    selected,
    representatives,
    candidatePool,
    candidateDocumentCount: new Set(candidatePool.map(item => item.document_id)).size
  };
}

export function createDifyAdapter(config, {fetchImpl = fetch} = {}) {
  if (!config.apiKey || !config.baseUrl || !config.appId || !config.datasetId) {
    throw new Error("Dify server configuration is incomplete");
  }
  const headers = {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json"
  };

  async function once(url, options) {
    const response = await fetchImpl(url, options);
    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch { body = {raw_text: text}; }
    if (!response.ok) {
      const rateLimited = response.status === 429 ||
        /rate limit|请求频率|频率限制/i.test(String(body.message || body.raw_text || ""));
      const code = rateLimited
        ? "RATE_LIMITED"
        : response.status >= 500
          ? "PROVIDER_UNAVAILABLE"
          : "PROVIDER_REQUEST_REJECTED";
      const normalizedStatus = rateLimited
        ? 429
        : response.status >= 500
          ? 502
          : 403;
      throw new ProviderError(code, `Dify HTTP ${response.status}${body.message ? `: ${body.message}` : ""}`, {
        status: normalizedStatus,
        retryable: !rateLimited && response.status >= 500,
        providerRequestId: body.message_id || null
      });
    }
    return body;
  }

  async function request(
    pathname,
    options,
    timeoutMs = config.requestTimeoutMs,
    baseUrl = config.baseUrl
  ) {
    let lastError;
    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        return await once(`${baseUrl}${pathname}`, {
          ...options,
          signal: AbortSignal.timeout(timeoutMs)
        });
      } catch (error) {
        if (error?.name === "TimeoutError" || error?.name === "AbortError") {
          lastError = new ProviderError("RETRIEVAL_TIMEOUT", "Dify request timed out", {
            status: 504,
            retryable: true
          });
        } else if (error instanceof ProviderError) {
          lastError = error;
        } else {
          lastError = new ProviderError(
            "PROVIDER_UNAVAILABLE",
            `Dify network request failed: ${error?.message || "unknown network error"}`,
            {
              status: 502,
              retryable: true
            }
          );
        }
        if (!lastError.retryable || attempt >= config.maxRetries) break;
      }
    }
    throw lastError;
  }

  async function health() {
    const started = performance.now();
    try {
      const info = await request("/info", {
        method: "GET",
        headers: {Authorization: headers.Authorization}
      }, Math.min(config.requestTimeoutMs, 10000));
      return {
        status: "ok",
        provider: {
          name: "Dify Cloud",
          mode: info.mode || "unknown",
          info_name: info.name || "Dify"
        },
        latency_ms: Math.round(performance.now() - started)
      };
    } catch (error) {
      return {
        status: "unavailable",
        provider: {name: "Dify Cloud", mode: "unknown", info_name: "Dify"},
        latency_ms: Math.round(performance.now() - started),
        error_code: error.code || "PROVIDER_UNAVAILABLE"
      };
    }
  }

  async function callChat(requestInput, preparedEvidence = null) {
    const started = performance.now();
    let evidence = preparedEvidence?.evidence || [];
    let retrievalTrace = preparedEvidence?.retrieval_trace || null;
    if (!preparedEvidence && config.datasetApiKey && config.datasetBaseUrl && config.datasetId) {
      const {
        subqueries,
        originalQuery,
        multiObjective,
        retrievalQueries
      } = buildRetrievalQueries(requestInput.question);
      const resultSets = [];
      for (const retrievalQuery of retrievalQueries) {
        const query = [
          retrievalQuery,
          requestInput.channel ? `购买或售后渠道：${requestInput.channel}` : null
        ].filter(Boolean).join("\n");
        const body = await request(
          `/datasets/${encodeURIComponent(config.datasetId)}/retrieve`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${config.datasetApiKey}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              query,
              retrieval_model: {
                search_method: "hybrid_search",
                reranking_enable: true,
                reranking_model: {
                  provider: "langgenius/tongyi/tongyi",
                  model: "qwen3-rerank"
                },
                top_k: 10,
                score_threshold_enabled: false,
                score_threshold: null,
                weights: {
                  weight_type: "customized",
                  vector_setting: {
                    vector_weight: 0.7,
                    embedding_provider_name: "langgenius/tongyi/tongyi",
                    embedding_model_name: "text-embedding-v4"
                  },
                  keyword_setting: {keyword_weight: 0.3}
                }
              }
            })
          },
          config.requestTimeoutMs,
          config.datasetBaseUrl
        );
        resultSets.push((body.records || []).map((record, index) => ({
          position: index + 1,
          dataset_id: config.datasetId,
          dataset_name: "CANDIDATE",
          document_id: record.segment?.document_id || record.segment?.document?.id || null,
          document_name: record.segment?.document?.name || null,
          segment_id: record.segment?.id || null,
          score: record.score,
          content: String(record.segment?.content || "")
        })));
      }
      const merged = multiObjective
        ? mergeDiverseCandidates(
            resultSets,
            3,
            `${retrievalQueries.join("\n")}\n${requestInput.question}`
          )
        : selectRelevanceFirstCandidates(resultSets, 3);
      evidence = merged.selected;
      retrievalTrace = {
        merge_strategy: multiObjective
          ? "MULTI_OBJECTIVE_DOCUMENT_DEDUPE"
          : "ORIGINAL_QUERY_RELEVANCE_FIRST",
        requested_internal_top_k: 10,
        subqueries,
        subquery_count: subqueries.length,
        original_query: originalQuery,
        multi_objective: multiObjective,
        retrieval_queries: retrievalQueries,
        candidate_pool_size: merged.candidatePool.length,
        candidate_document_count: merged.candidateDocumentCount,
        displayed_top_k: evidence.length,
        displayed_document_count: new Set(evidence.map(item => item.document_id)).size,
        displayed_segment_ids: evidence.map(item => item.segment_id),
        candidate_representatives: (merged.representatives || merged.selected).map(item => ({
          document_id: item.document_id,
          segment_id: item.segment_id,
          score: item.score,
          position: item.position
        }))
      };
    }
    const raw = await request("/chat-messages", {
      method: "POST",
      headers,
      body: JSON.stringify({
        inputs: {},
        query: queryForDify(requestInput, evidence),
        response_mode: "blocking",
        user: `p03-${requestInput.tenant_id}-${requestInput.role}-${requestInput.asq_id || "anonymous"}`,
        auto_generate_name: false
      })
    });
    if (evidence.length) {
      raw.metadata ||= {};
      raw.metadata.retriever_resources = evidence;
      raw.metadata.retrieval_trace = retrievalTrace;
    }
    return {
      raw,
      timing_ms: Math.round(performance.now() - started)
    };
  }

  return {
    providerName: "Dify Cloud",
    sourceMode: "REAL_DIFY",
    health,
    async search(requestInput) {
      const {raw, timing_ms} = await callChat(requestInput);
      return {
        provider_request_id: raw.message_id || null,
        provider_trace_id: raw.message_id || null,
        resources: Array.isArray(raw.metadata?.retriever_resources) ? raw.metadata.retriever_resources : [],
        retrieval_trace: raw.metadata?.retrieval_trace || null,
        usage: raw.metadata?.usage || null,
        timing_ms
      };
    },
    async answer(requestInput) {
      const {raw, timing_ms} = await callChat(requestInput);
      return {
        raw,
        provider_request_id: raw.message_id || null,
        provider_trace_id: raw.message_id || null,
        timing_ms
      };
    },
    async answerWithEvidence(requestInput, evidence, retrievalTrace) {
      const {raw, timing_ms} = await callChat(requestInput, {
        evidence,
        retrieval_trace: retrievalTrace
      });
      return {
        raw,
        provider_request_id: raw.message_id || null,
        provider_trace_id: raw.message_id || null,
        timing_ms
      };
    }
  };
}
