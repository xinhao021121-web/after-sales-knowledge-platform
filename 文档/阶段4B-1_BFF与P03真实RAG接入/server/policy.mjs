import { safetyCitation } from "./catalog.mjs";
import { createCostRecord } from "./cost.mjs";

export const ALLOWED_ROLES = new Set([
  "frontline",
  "aftersales",
  "supervisor",
  "business",
  "knowledge",
  "evaluation",
  "legal",
  "admin",
  "public_customer"
]);

const P0_PATTERNS = [
  /冒烟|明火|火花|焦味|焦糊/,
  /鼓包|鼓起|电池膨胀|熔化|液体渗出|漏液/,
  /(?:进液|进水|掉进[^。！？]{0,6}水里|液体进入)[^。！？]{0,18}(?:充电|继续用|继续充)/,
  /(?:异常发烫|非常烫|烫手|明显烫伤|皮肤[^。！？]{0,8}(?:持续|灼痛|不适))/,
  /(?:连接异常|连不上|放回盒子|充电)[^。！？]{0,18}(?:发热|发烫)|(?:发热|发烫)[^。！？]{0,18}(?:连接|重置|充电)/,
  /接口(?:处)?(?:有)?异常[^。！？]{0,20}(?:充电|继续用)|(?:接口问题|充电口有问题)[^。！？]{0,20}(?:针|充电)/,
  /(?:烧痕|熔化)[^。！？]{0,12}(?:充电|继续用)/
];

const PRIVACY_PATTERNS = [
  {category: "MOBILE_PHONE", pattern: /(?<!\d)1[3-9]\d{9}(?!\d)/},
  {category: "EMAIL", pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i},
  {category: "AUTH_SECRET", pattern: /(?:验证码|动态码|短信码|一次性密码|登录密码|支付密码|口令|CVV|CVC)[^。！？\r\n]{0,12}\d{3,8}/i},
  {category: "PAYMENT_CREDENTIAL", pattern: /(?:\d[ -]?){15,19}/},
  {category: "ID_CARD", pattern: /(?<!\d)\d{17}[\dXx](?!\d)/},
  {category: "FULL_SERIAL_NUMBER", pattern: /(?:完整序列号|设备序列号|序列号|SN|serial(?:\s*number)?)\s*[：:=\s-]*[A-Z0-9-]{10,20}/i},
  {category: "FULL_SERIAL_NUMBER", pattern: /(?<![A-Za-z0-9-])(?=[A-Z0-9-]{12,20}(?![A-Za-z0-9-]))(?=[A-Z0-9-]*\d)[A-Z0-9-]{12,20}/},
  {category: "ADDRESS", pattern: /(?:家庭住址|收件地址|详细地址)\s*[：:]?\s*\S{6,}/}
];

export class ValidationError extends Error {
  constructor(code, message, status = 422, details = {}) {
    super(message);
    this.name = "ValidationError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function detectP0(question) {
  return P0_PATTERNS.some(pattern => pattern.test(question));
}

export function detectPrivacy(question) {
  return [...new Set(
    PRIVACY_PATTERNS
      .filter(entry => entry.pattern.test(question))
      .map(entry => entry.category)
  )];
}

function collectStringValues(value) {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  return Object.values(value).flatMap(collectStringValues);
}

export function findSensitiveField(value, prefix = "") {
  if (!value || typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value)) {
    const field = prefix ? `${prefix}.${key}` : key;
    if (/(?:api[_-]?key|secret|password|authorization|access[_-]?token|refresh[_-]?token)/i.test(key)) {
      return field;
    }
    const nested = findSensitiveField(child, field);
    if (nested) return nested;
  }
  return null;
}

export function validateAnswerInput(body, headers, config) {
  const role = String(headers["x-demo-role"] || "").trim();
  if (!ALLOWED_ROLES.has(role)) throw new ValidationError("UNAUTHORIZED", "缺少或无效的模拟角色头", 401);
  if (body.role !== role) throw new ValidationError("FORBIDDEN_SCOPE", "角色头与请求角色不一致", 403);
  if (body.tenant_id !== config.demoTenant) throw new ValidationError("FORBIDDEN_SCOPE", "租户范围不匹配", 403);
  if (!["test", "candidate"].includes(body.environment) || body.environment !== config.environment) {
    throw new ValidationError("FORBIDDEN_SCOPE", "当前环境不允许访问该 RAG 配置", 403);
  }
  const {customer_context: rawContext, ...requestFields} = body;
  const customerContext = rawContext && typeof rawContext === "object" && !Array.isArray(rawContext)
    ? rawContext
    : {};
  const sensitive = findSensitiveField(requestFields);
  if (sensitive) throw new ValidationError("VALIDATION_ERROR", `请求包含禁止的敏感字段：${sensitive}`);

  const question = String(body.question || "").trim();
  if (!question) throw new ValidationError("VALIDATION_ERROR", "question 不能为空");
  if (question.length > 2000) throw new ValidationError("VALIDATION_ERROR", "question 超过 2000 字符");
  const privacyCategories = detectPrivacy([question, ...collectStringValues(customerContext)].join("\n"));
  if (privacyCategories.length) {
    throw new ValidationError("SENSITIVE_DATA_BLOCKED", "检测到个人信息或敏感凭证，已在调用 Dify 前阻断", 422, {
      privacy_categories: privacyCategories,
      redaction_applied: true,
      privacy_action: "BLOCKED_BEFORE_PROVIDER",
      provider_called: false
    });
  }
  if (body.top_k !== 3) throw new ValidationError("VALIDATION_ERROR", "当前仅允许 top_k=3");
  if (body.retrieval_mode !== "hybrid") throw new ValidationError("VALIDATION_ERROR", "当前仅允许 hybrid 检索");
  if (body.rerank !== true) throw new ValidationError("VALIDATION_ERROR", "当前仅允许 rerank=true");
  if (body.citation_mode !== "required") throw new ValidationError("VALIDATION_ERROR", "当前仅允许 citation_mode=required");

  return {
    question,
    asq_id: String(body.asq_id || "").trim(),
    knowledge_item_id: String(body.knowledge_item_id || "KI-DEMO-AFTERSALES"),
    product_model: String(body.product_model || "").trim(),
    channel: String(body.channel || "").trim(),
    role,
    tenant_id: body.tenant_id,
    environment: body.environment,
    top_k: 3,
    retrieval_mode: "hybrid",
    rerank: true,
    metadata_filter: {
      enabled: body.metadata_filter?.enabled !== false,
      active_only: body.metadata_filter?.active_only !== false,
      channels: Array.isArray(body.metadata_filter?.channels) ? body.metadata_filter.channels.map(String) : [],
      source_statuses: Array.isArray(body.metadata_filter?.source_statuses)
        ? body.metadata_filter.source_statuses.map(String)
        : ["active"]
    },
    customer_context: customerContext,
    citation_mode: "required"
  };
}

export function missingContextFields(input) {
  const missing = [];
  if (!input.product_model) missing.push("商品型号");
  if (!input.channel) missing.push("购买或售后渠道");
  return missing;
}

export function p0Response({catalog, request, requestId, model, forceTriggered = false}) {
  const citation = safetyCitation(catalog);
  return {
    request_id: requestId,
    answer_status: "BLOCKED_SAFETY",
    ui_state: "BLOCKED_SAFETY",
    answer: "立即停止使用并停止充电，断开电源。将设备远离纸张、织物和其他可燃物并保持观察。若出现明火、持续冒烟、爆裂声或人员不适，先撤离并联系当地应急部门。",
    suggested_action: "停止使用和充电、隔离设备、记录风险信号，并转安全责任人与售后主管；未经安全确认不得继续普通售后判断。",
    business_conditions: [
      "安全信号优先于保修、退款和维修判断",
      "不得按压、拆解、加热、穿刺或继续充电",
      "出现明火、持续冒烟或人员不适时联系应急部门"
    ],
    citations: [citation],
    risk: {
      level: "R3",
      p0_triggered: true,
      escalation_required: true,
      trigger: forceTriggered ? "CONFIRMED_P0_BASELINE" : "BFF_SIGNAL_MATCH"
    },
    provider_request_id: null,
    provider_trace_id: null,
    provider_called: false,
    timing_ms: 0,
    error_code: null,
    source_mode: "BFF_SAFETY_GATE",
    cost: createCostRecord({
      model,
      timingMs: 0,
      answerStatus: "BLOCKED_SAFETY",
      citationSupportPassed: true,
      providerCalled: false
    }),
    request_echo: {
      asq_id: request.asq_id,
      knowledge_item_id: request.knowledge_item_id
    }
  };
}

export function clarificationResponse({request, requestId, missing, model}) {
  return {
    request_id: requestId,
    answer_status: "NEED_CLARIFICATION",
    ui_state: "NEED_CLARIFICATION",
    answer: `请先补充：${missing.join("、")}。当前不会生成确定售后结论。`,
    suggested_action: "补齐商品型号和购买/售后渠道后重新提问。",
    business_conditions: ["上下文完整度 C2", `缺失字段：${missing.join("、")}`],
    citations: [],
    risk: {level: "R1", p0_triggered: false, escalation_required: false},
    provider_request_id: null,
    provider_trace_id: null,
    provider_called: false,
    timing_ms: 0,
    error_code: null,
    source_mode: "BFF_CONTEXT_GATE",
    cost: createCostRecord({
      model,
      timingMs: 0,
      answerStatus: "NEED_CLARIFICATION",
      citationSupportPassed: false,
      providerCalled: false
    }),
    request_echo: {
      asq_id: request.asq_id,
      knowledge_item_id: request.knowledge_item_id
    }
  };
}
