import { ProviderError } from "./dify-adapter.mjs";

function datasetError(status) {
  if (status === 401 || status === 403) {
    return new ProviderError("DATASET_AUTH_FAILED", "Dify Dataset API authentication failed", {
      status: 502,
      retryable: false
    });
  }
  if (status === 404) {
    return new ProviderError("DATASET_NOT_FOUND", "Dify dataset or document was not found", {
      status: 404,
      retryable: false
    });
  }
  if (status === 429) {
    return new ProviderError("DATASET_RATE_LIMITED", "Dify Dataset API rate limit reached", {
      status: 429,
      retryable: true
    });
  }
  return new ProviderError("DATASET_PROVIDER_UNAVAILABLE", `Dify Dataset API HTTP ${status}`, {
    status: 502,
    retryable: status >= 500
  });
}

export function createDifyDatasetAdapter(config, {fetchImpl = fetch} = {}) {
  if (!config.datasetBaseUrl || !config.datasetApiKey || !config.datasetId) {
    throw new ProviderError("DATASET_API_NOT_CONFIGURED", "Dify Dataset API is not configured", {
      status: 503,
      retryable: false
    });
  }
  const authorization = `Bearer ${config.datasetApiKey}`;

  async function request(pathname, options = {}, timeoutMs = config.requestTimeoutMs) {
    let lastError;
    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        const response = await fetchImpl(`${config.datasetBaseUrl}${pathname}`, {
          ...options,
          headers: {
            Authorization: authorization,
            ...(options.body instanceof FormData ? {} : {"Content-Type": "application/json"}),
            ...(options.headers || {})
          },
          signal: AbortSignal.timeout(timeoutMs)
        });
        const text = await response.text();
        let body;
        try { body = JSON.parse(text); } catch { body = {raw_text: text}; }
        if (!response.ok) throw datasetError(response.status);
        return body;
      } catch (error) {
        if (error?.name === "TimeoutError" || error?.name === "AbortError") {
          lastError = new ProviderError("DATASET_TIMEOUT", "Dify Dataset API timed out", {
            status: 504,
            retryable: true
          });
        } else if (error instanceof ProviderError) {
          lastError = error;
        } else {
          lastError = new ProviderError("DATASET_PROVIDER_UNAVAILABLE", "Dify Dataset API network request failed", {
            status: 502,
            retryable: true
          });
        }
        if (!lastError.retryable || attempt >= config.maxRetries) break;
      }
    }
    throw lastError;
  }

  function processRule() {
    return {
      mode: "custom",
      rules: {
        pre_processing_rules: [
          {id: "remove_extra_spaces", enabled: true},
          {id: "remove_urls_emails", enabled: false}
        ],
        segmentation: {
          separator: "\n\n",
          max_tokens: 700,
          chunk_overlap: 100
        }
      }
    };
  }

  function fileForm({fileName, bytes, indexingTechnique = "high_quality"}) {
    const form = new FormData();
    form.append("data", JSON.stringify({
      indexing_technique: indexingTechnique,
      doc_form: "text_model",
      doc_language: "Chinese",
      process_rule: processRule()
    }));
    form.append("file", new Blob([bytes], {type: "text/markdown"}), fileName);
    return form;
  }

  return {
    providerName: "Dify Dataset API",
    sourceMode: "REAL_DIFY",
    async health() {
      const body = await request(
        `/datasets/${encodeURIComponent(config.datasetId)}`,
        {method: "GET"},
        10000
      );
      return {
        status: "ok",
        dataset_id: body.id || config.datasetId,
        dataset_name: body.name || "CANDIDATE",
        document_count: Number(body.document_count ?? 0),
        checked_at: new Date().toISOString()
      };
    },
    async createDocument({fileName, bytes}) {
      return request(`/datasets/${encodeURIComponent(config.datasetId)}/document/create-by-file`, {
        method: "POST",
        body: fileForm({fileName, bytes})
      });
    },
    async updateDocument({documentId, fileName, bytes}) {
      return request(
        `/datasets/${encodeURIComponent(config.datasetId)}/documents/${encodeURIComponent(documentId)}/update-by-file`,
        {
          method: "POST",
          body: fileForm({fileName, bytes})
        }
      );
    },
    async getIndexingStatus(batchId) {
      return request(
        `/datasets/${encodeURIComponent(config.datasetId)}/documents/${encodeURIComponent(batchId)}/indexing-status`,
        {method: "GET"}
      );
    },
    async findDocumentByName(name) {
      const query = new URLSearchParams({page: "1", limit: "20", keyword: name});
      const body = await request(`/datasets/${encodeURIComponent(config.datasetId)}/documents?${query}`, {
        method: "GET"
      });
      return (Array.isArray(body.data) ? body.data : []).find(document => document.name === name) || null;
    }
  };
}
