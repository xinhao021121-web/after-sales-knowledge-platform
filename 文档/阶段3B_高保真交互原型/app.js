(function () {
  const STORAGE_KEY = "stage3b-full-prototype-v1";

  const STATUS = {
    ASQ_NEW: ["新建", "ASQ_NEW"],
    ASQ_CONTEXT_PENDING: ["待补上下文", "ASQ_CONTEXT_PENDING"],
    ASQ_ASSESSING: ["判断中", "ASQ_ASSESSING"],
    ASQ_ADVICE_PENDING: ["建议待确认", "ASQ_ADVICE_PENDING"],
    ASQ_HANDOFF_PENDING: ["转交待接收", "ASQ_HANDOFF_PENDING"],
    ASQ_RESPONDED: ["已答复", "ASQ_RESPONDED"],
    ASQ_RESOLVED: ["已解决", "ASQ_RESOLVED"],
    ASQ_PAUSED: ["风险暂停", "ASQ_PAUSED"],
    ASQ_CLOSED: ["已关闭", "ASQ_CLOSED"],
    ASQ_CANCELLED: ["已取消", "ASQ_CANCELLED"],
    ESC_CANDIDATE: ["风险候选", "ESC_CANDIDATE"],
    ESC_CONFIRMED: ["已确认风险", "ESC_CONFIRMED"],
    ESC_MITIGATING: ["止损中", "ESC_MITIGATING"],
    ESC_ESCALATED: ["已升级", "ESC_ESCALATED"],
    ESC_MONITORING: ["观察中", "ESC_MONITORING"],
    ESC_CLOSED: ["风险已关闭", "ESC_CLOSED"],
    ESC_DISMISSED: ["风险已排除", "ESC_DISMISSED"],
    SRC_REGISTERED: ["已登记", "SRC_REGISTERED"],
    SRC_ACTIVE: ["有效", "SRC_ACTIVE"],
    SRC_REVIEW_REQUIRED: ["待复核", "SRC_REVIEW_REQUIRED"],
    SRC_EXPIRED: ["已过期", "SRC_EXPIRED"],
    SRC_SUPERSEDED: ["已替代", "SRC_SUPERSEDED"],
    SRC_WITHDRAWN: ["已撤回", "SRC_WITHDRAWN"],
    SRC_UNAVAILABLE: ["不可访问", "SRC_UNAVAILABLE"],
    KB_DRAFT: ["草稿", "KB_DRAFT"],
    KB_BUSINESS_REVIEW: ["业务审核中", "KB_BUSINESS_REVIEW"],
    KB_EVAL_PENDING: ["待评测", "KB_EVAL_PENDING"],
    KB_EVAL_FAILED: ["评测失败", "KB_EVAL_FAILED"],
    KB_SOURCE_BLOCKED: ["来源阻断", "KB_SOURCE_BLOCKED"],
    KB_APPROVED_FOR_RELEASE: ["可发布", "KB_APPROVED_FOR_RELEASE"],
    KB_REJECTED: ["业务拒绝", "KB_REJECTED"],
    KB_WITHDRAWN: ["知识已撤回", "KB_WITHDRAWN"],
    CASE_OPEN: ["待分诊", "CASE_OPEN"],
    CASE_TRIAGED: ["已分诊", "CASE_TRIAGED"],
    CASE_EVIDENCE_READY: ["证据齐全", "CASE_EVIDENCE_READY"],
    CASE_FIXING: ["修复中", "CASE_FIXING"],
    CASE_REGRESSION_PENDING: ["待回归", "CASE_REGRESSION_PENDING"],
    CASE_VERIFIED_PENDING_RELEASE: ["验证通过待发布", "CASE_VERIFIED_PENDING_RELEASE"],
    CASE_CLOSED: ["案例已关闭", "CASE_CLOSED"],
    CASE_REOPENED: ["案例已重开", "CASE_REOPENED"],
    CASE_DEFERRED: ["案例已延期", "CASE_DEFERRED"],
    LINK_OPEN: ["修复候选已建立", "LINK_OPEN"],
    LINK_PENDING_RELEASE: ["待发布", "LINK_PENDING_RELEASE"],
    LINK_RELEASED: ["已发布", "LINK_RELEASED"],
    LINK_ABANDONED: ["已明确弃置", "LINK_ABANDONED"],
    LINK_FAILED: ["修复失败", "LINK_FAILED"],
    EVAL_PLANNED: ["待评测", "EVAL_PLANNED"],
    EVAL_RUNNING: ["评测中", "EVAL_RUNNING"],
    EVAL_PASSED: ["评测通过", "EVAL_PASSED"],
    EVAL_FAILED: ["评测失败", "EVAL_FAILED"],
    EVAL_BLOCKED: ["评测阻塞", "EVAL_BLOCKED"],
    REL_PENDING_APPROVAL: ["待发布审批", "REL_PENDING_APPROVAL"],
    REL_ACTIVE: ["已生效", "REL_ACTIVE"],
    REL_REJECTED: ["已拒绝", "REL_REJECTED"],
    REL_SUPERSEDED: ["已替代", "REL_SUPERSEDED"],
    REL_SUSPENDED: ["已停用", "REL_SUSPENDED"],
    REL_ROLLED_BACK: ["已回滚", "REL_ROLLED_BACK"],
    WORKBENCH_READY: ["工作台就绪", "WORKBENCH_READY"],
    ASQ_QUEUE: ["任务队列可用", "ASQ_QUEUE"],
    ESC_QUEUE: ["风险队列可用", "ESC_QUEUE"],
    PERMISSION_POLICY_ACTIVE: ["权限策略有效", "PERMISSION_POLICY_ACTIVE"],
    AUDIT_READY: ["审计可用", "AUDIT_READY"],
    ANSWERED: ["已回答", "ANSWERED"],
    NO_ANSWER: ["无可用答案", "NO_ANSWER"],
    NEED_CLARIFICATION: ["需要补充", "NEED_CLARIFICATION"],
    BLOCKED_SAFETY: ["安全止损", "BLOCKED_SAFETY"],
    KNOWLEDGE_EXPIRED: ["知识已过期", "KNOWLEDGE_EXPIRED"],
    CONFLICT_HOLD: ["冲突待裁决", "CONFLICT_HOLD"],
    REAL_RAG: ["真实 RAG", "REAL_RAG"],
    REAL_RAG_ERROR: ["真实服务失败", "REAL_RAG_ERROR"],
    PERMISSION_DENIED: ["无权限", "PERMISSION_DENIED"],
    LOADING: ["加载中", "LOADING"],
    EMPTY: ["无数据", "EMPTY"]
  };

  const ROLES = {
    frontline: {
      label: "一线客服",
      user: "林然",
      defaultPage: "P01",
      nav: ["P01", "P02", "P03", "P04", "P05", "P08", "P09"]
    },
    aftersales: {
      label: "售后专员",
      user: "周衡",
      defaultPage: "P03",
      nav: ["P01", "P02", "P03", "P04", "P05", "P08", "P09"]
    },
    supervisor: {
      label: "客服主管",
      user: "徐宁",
      defaultPage: "P01",
      nav: ["P01", "P02", "P03", "P04", "P05", "P08", "P09", "P11", "P13"]
    },
    business: {
      label: "业务/渠道负责人",
      user: "陈岚",
      defaultPage: "P07",
      nav: ["P01", "P07", "P09", "P11", "P13"]
    },
    knowledge: {
      label: "知识运营",
      user: "沈知",
      defaultPage: "P01",
      nav: ["P01", "P06", "P07", "P08", "P09", "P10", "P11"]
    },
    evaluation: {
      label: "AI 评测人员",
      user: "顾言",
      defaultPage: "P10",
      nav: ["P01", "P08", "P09", "P10", "P11"]
    },
    legal: {
      label: "法务/安全责任人",
      user: "唐律",
      defaultPage: "P04",
      nav: ["P01", "P04", "P05", "P06", "P09", "P13"]
    },
    admin: {
      label: "系统管理员",
      user: "运维账户",
      defaultPage: "P12",
      nav: ["P01", "P12", "P13"]
    }
  };

  const PAGES = {
    P01: { label: "今日", title: "今日工作台", frs: ["FR-030"], empty: "当前角色没有待办", error: "待办数据暂时不可用" },
    P02: { label: "咨询任务", title: "咨询任务队列", frs: ["FR-001"], empty: "当前筛选没有咨询任务", error: "咨询任务加载失败" },
    P03: { label: "售后任务", title: "售后协作任务", frs: ["FR-001","FR-002","FR-003","FR-004","FR-005","FR-006","FR-007","FR-008","FR-009","FR-010","FR-029"], empty: "尚未选择咨询任务", error: "任务上下文加载失败" },
    P04: { label: "风险队列", title: "风险队列", frs: ["FR-011"], empty: "当前没有风险待办", error: "风险队列暂时不可用" },
    P05: { label: "风险升级单", title: "风险升级单", frs: ["FR-012","FR-013","FR-014"], empty: "尚未创建风险升级单", error: "风险单加载失败" },
    P06: { label: "知识来源", title: "知识来源台账", frs: ["FR-015","FR-016"], empty: "尚未登记知识来源", error: "来源台账加载失败" },
    P07: { label: "知识与审核", title: "知识与业务审核", frs: ["FR-017","FR-018"], empty: "当前没有待审知识版本", error: "知识版本加载失败" },
    P08: { label: "问题案例", title: "问题案例队列", frs: ["FR-022"], empty: "当前没有问题案例", error: "案例队列加载失败" },
    P09: { label: "案例与链路", title: "案例与修复链路", frs: ["FR-014","FR-022","FR-023","FR-024","FR-025"], empty: "当前没有案例修复链路", error: "案例链路加载失败" },
    P10: { label: "评测中心", title: "评测中心", frs: ["FR-019"], empty: "尚未选择评测候选", error: "评测服务暂时不可用" },
    P11: { label: "发布与回滚", title: "发布与回滚", frs: ["FR-020","FR-021"], empty: "当前没有待发布版本", error: "发布信息加载失败" },
    P12: { label: "权限与职责", title: "权限与职责", frs: ["FR-026","FR-027"], empty: "当前范围未配置自定义权限", error: "权限矩阵加载失败" },
    P13: { label: "审计与运行", title: "审计与运行监控", frs: ["FR-028","FR-030"], empty: "当前查询范围没有审计记录", error: "审计或运行数据不可用" }
  };

  const PAGE_ACCESS = {
    P01: Object.keys(ROLES),
    P02: ["frontline","aftersales","supervisor"],
    P03: ["frontline","aftersales","supervisor"],
    P04: ["frontline","supervisor","legal"],
    P05: ["frontline","aftersales","supervisor","legal"],
    P06: ["knowledge","business","legal"],
    P07: ["knowledge","business","supervisor"],
    P08: ["frontline","aftersales","supervisor","knowledge","evaluation"],
    P09: ["frontline","aftersales","supervisor","business","knowledge","evaluation","legal"],
    P10: ["evaluation","knowledge","supervisor"],
    P11: ["supervisor","knowledge","business","legal"],
    P12: ["admin","supervisor","business","legal"],
    P13: ["supervisor","legal","admin"]
  };

  const FLOWS = [
    { id: "D01", title: "新建 ASQ 与上下文任务", role: "frontline", page: "P02", hint: "创建后确认 ASQ_CONTEXT_PENDING；补齐 CTX 后先进入 ASSESSING，再生成建议。" },
    { id: "D02", title: "补齐 CTX 并展示版本差异", role: "frontline", page: "P03", hint: "补齐缺失字段，查看 C2→C3、CTX v3→v4 与状态变化。" },
    { id: "D03", title: "证据不足、冲突与承诺拦截", role: "frontline", page: "P03", hint: "依次点击三种异常演示；每种都必须留下页面内状态。" },
    { id: "D04", title: "ADV 确认发送", role: "supervisor", page: "P03", hint: "主管可确认发送，但上下文仍为只读。" },
    { id: "D05", title: "R3 止损、升级、关闭与复发", role: "legal", page: "P05", hint: "先发送止损，再升级和关闭；关闭后可创建新 ESC 并关联旧单。" },
    { id: "D06", title: "SRC 失效影响闭环", role: "knowledge", page: "P06", hint: "触发来源撤回，查看 KB/EVAL/REL/LINK/CASE 影响清单。" },
    { id: "D07", title: "CASE 创建、分诊和 0/1/N LINK", role: "knowledge", page: "P08", hint: "创建案例、分诊，再到 P09 创建修复轨道。" },
    { id: "D08", title: "部分 LINK 完成时禁止关闭", role: "knowledge", page: "P09", hint: "点击“尝试关闭 CASE”，查看活动 LINK 与关闭门禁。" },
    { id: "D09", title: "LINK_FAILED 创建后继", role: "knowledge", page: "P09", hint: "对失败轨道创建后继 LINK，观察 previous_link_id。" },
    { id: "D10", title: "EVAL 通过、失败和阻塞", role: "evaluation", page: "P10", hint: "先开始评测，再生成结果；每次结果必须检查 EVAL、LINK、CASE 与 REL。" },
    { id: "D11", title: "REL 拒绝回退", role: "supervisor", page: "P11", hint: "拒绝待审批 REL，观察 LINK_FAILED 与 CASE_FIXING。" },
    { id: "D12", title: "REL 发布、LINK 释放与 CASE 关闭", role: "supervisor", page: "P11", hint: "点击“激活发布”；全部轨道完成时 CASE 聚合关闭。" },
    { id: "D13", title: "REL 停用、回滚和后继 LINK", role: "knowledge", page: "P11", hint: "停用当前发布，创建回滚候选，再由主管激活。" },
    { id: "D14", title: "无 LINK CASE 双角色审批", role: "supervisor", page: "P09", hint: "主管审批后切换业务负责人审批；两人都确认后才关闭。" },
    { id: "D15", title: "角色切换与权限拒绝", role: "business", page: "P03", hint: "业务角色直接访问 P03，应显示无权限，不展示客户业务内容。" }
  ];

  function createInitialState() {
    return {
      version: 1,
      role: "frontline",
      page: "P01",
      viewMode: "default",
      demoOpen: false,
      mode: "review",
      activeFlow: null,
      feedback: null,
      realRag: {
        enabled: false,
        loading: false,
        question: "AirPods Pro 3 买了 8 个月，电池续航明显下降，保修期内维修要收费吗？",
        productModel: "AirPods Pro 3",
        channel: "Apple Store 在线商店",
        result: null,
        error: null,
        lastIdempotencyKey: null
      },
      asq: {
        id: "ASQ-2026-1043",
        status: "ASQ_ADVICE_PENDING",
        ctxVersion: 3,
        contextCompleteness: "C3",
        missing: "",
        evidenceMode: "normal",
        promiseRisk: false,
        sent: false,
        adviceGenerated: true
      },
      risk: {
        id: "ESC-2026-0217",
        status: "ESC_MITIGATING",
        stopSent: false,
        previousEscId: null
      },
      riskHistory: [],
      source: {
        id: "SRC-OFFICIAL-014-v4",
        title: "中国大陆 AirPods 服务范围说明",
        locator: "https://support.example.test/airpods-service-cn",
        status: "SRC_ACTIVE",
        organization: "模拟官方支持",
        scope: "AirPods 中国大陆服务",
        validUntil: "2026-12-31",
        owner: "沈知",
        verifiedAt: "2026-10-20",
        accessible: true,
        titleVerified: true,
        formOpen: false,
        impact: [],
        alternative: null,
        previousSourceId: null
      },
      dataset: {
        documents: [
          {doc_id: "DOC-FAQ-V1", title: "AirPods Pro 3 售后 FAQ", file: "docs/01_售后FAQ.md", version: "1.0.0", src_ids: ["SRC-PUB-001"]},
          {doc_id: "DOC-SAFETY-V1", title: "AirPods Pro 3 安全处置 SOP", file: "docs/02_安全SOP.md", version: "1.0.0", src_ids: ["SRC-PUB-002"]},
          {doc_id: "DOC-RETURN-V1", title: "AirPods 退货与退款判断", file: "docs/03_退货规则.md", version: "1.0.0", src_ids: ["SRC-PUB-003"]},
          {doc_id: "DOC-WARRANTY-V1", title: "AirPods Pro 3 保修与维修流程", file: "docs/04_保修与维修流程.md", version: "1.0.0", src_ids: ["SRC-PUB-006"]},
          {doc_id: "DOC-CHANNEL-V1", title: "售后渠道差异与责任边界", file: "docs/05_渠道差异说明.md", version: "1.0.0", src_ids: ["SRC-PUB-003"]}
        ],
        health: null,
        selectedDocId: "DOC-FAQ-V1",
        loading: false,
        polling: false,
        job: null,
        error: null
      },
      realEvaluation: {
        scope: "ALL_17",
        metadata: null,
        run: null,
        loading: false,
        polling: false,
        error: null
      },
      reviewKb: {
        id: "KB-118-v1",
        status: "KB_BUSINESS_REVIEW"
      },
      kb: {
        id: "KB-211-v2",
        status: "KB_EVAL_PENDING"
      },
      eval: {
        id: "EVAL-2026-0418",
        status: "EVAL_PLANNED"
      },
      rel: {
        id: "REL-104-20261023-01",
        status: "REL_PENDING_APPROVAL",
        previousId: null,
        kbVersionId: "KB-104-v3",
        evalEvidence: "EVAL-2026-0402 · 通过"
      },
      activeCaseId: "main",
      caseItem: {
        id: "CASE-2026-031",
        status: "CASE_FIXING",
        links: [
          { id: "CLINK-031-104", knowledgeItemId: "KI-104", kbVersionId: "KB-104-v2", status: "LINK_RELEASED", previousLinkId: null, relId: "REL-104-1018" },
          { id: "CLINK-031-211", knowledgeItemId: "KI-211", kbVersionId: "KB-211-v1", status: "LINK_OPEN", previousLinkId: "CLINK-031-103", relId: null },
          { id: "CLINK-031-207", knowledgeItemId: "KI-207", kbVersionId: "KB-207-v3", status: "LINK_FAILED", previousLinkId: "CLINK-031-201", relId: null }
        ]
      },
      noLinkCase: {
        id: "CASE-2026-038",
        status: "CASE_FIXING",
        links: [],
        supervisorApproved: false,
        businessApproved: false
      },
      members: [
        { id: "MBR-01", name: "林然", role: "frontline", scope: "售后一线 · 华东组", active: true },
        { id: "MBR-02", name: "周衡", role: "aftersales", scope: "售后专员 · 电池线", active: true },
        { id: "MBR-03", name: "徐宁", role: "supervisor", scope: "客服主管 · 售后", active: true },
        { id: "MBR-04", name: "陈岚", role: "business", scope: "业务/渠道 · 官方线上", active: true },
        { id: "MBR-05", name: "沈知", role: "knowledge", scope: "知识运营 · 售后知识", active: true },
        { id: "MBR-06", name: "顾言", role: "evaluation", scope: "AI 评测 · 售后任务集", active: true },
        { id: "MBR-07", name: "唐律", role: "legal", scope: "法务/安全 · R2/R3", active: true },
        { id: "MBR-08", name: "运维账户", role: "admin", scope: "系统配置与审计", active: true }
      ],
      audits: [
        { id: "AUD-001", action: "创建 ASQ", object: "ASQ-2026-1043", role: "一线客服", result: "成功" },
        { id: "AUD-002", action: "创建风险单", object: "ESC-2026-0217", role: "一线客服", result: "成功" },
        { id: "AUD-003", action: "知识评测", object: "EVAL-2026-0418", role: "AI 评测人员", result: "待执行" }
      ]
    };
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved && saved.version === 1) {
        const initial = createInitialState();
        return {
          ...initial,
          ...saved,
          mode: saved.mode === "show" ? "show" : "review",
          realRag: { ...initial.realRag, ...(saved.realRag || {}) },
          asq: { ...initial.asq, ...(saved.asq || {}) },
          source: { ...initial.source, ...(saved.source || {}) },
          dataset: { ...initial.dataset, ...(saved.dataset || {}) },
          realEvaluation: { ...initial.realEvaluation, ...(saved.realEvaluation || {}) },
          reviewKb: { ...initial.reviewKb, ...(saved.reviewKb || {}) },
          kb: { ...initial.kb, ...(saved.kb || {}) },
          eval: { ...initial.eval, ...(saved.eval || {}) },
          rel: { ...initial.rel, ...(saved.rel || {}) },
          members: Array.isArray(saved.members) ? saved.members : initial.members
        };
      }
    } catch (_) {}
    return createInitialState();
  }

  let state = loadState();
  let focusTarget = "page-title";

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatRealAnswer(value) {
    return escapeHtml(value)
      .replace(/\[citation:[^\]]+\]/g, "")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replaceAll("\n", "<br>");
  }

  function statusMarkup(code) {
    const pair = STATUS[code] || [code, code];
    return `<span class="status-badge status-neutral"><strong>${escapeHtml(pair[0])}</strong><small>${escapeHtml(pair[1])}</small></span>`;
  }

  function riskMarkup(label, code) {
    return `<span class="status-badge status-risk"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(code)}</small></span>`;
  }

  function canAccess(role, page) {
    return PAGE_ACCESS[page]?.includes(role);
  }

  function addAudit(action, object, result = "成功") {
    const role = ROLES[state.role].label;
    state.audits.unshift({
      id: `AUD-${String(state.audits.length + 1).padStart(3, "0")}`,
      action,
      object,
      role,
      result
    });
  }

  function feedback(type, title, detail, page = state.page) {
    state.feedback = { type, title, detail, page };
  }

  function notify(action, title, detail, page = state.page) {
    feedback("info", title, detail, page);
    addAudit(action, PAGES[page].title);
    focusTarget = "action-feedback";
    render();
  }

  function authorized(action, page = state.page) {
    const role = state.role;
    const permissionMap = {
      createAsq: ["frontline","aftersales","supervisor"],
      editContext: ["frontline","aftersales"],
      sendAdvice: ["frontline","aftersales","supervisor"],
      stopRisk: ["frontline","aftersales","supervisor","legal"],
      escalateRisk: ["supervisor","legal"],
      closeRisk: ["legal"],
      invalidateSource: ["knowledge","legal"],
      registerSource: ["knowledge","legal"],
      activateSource: ["knowledge","legal"],
      createSourceVersion: ["knowledge","legal"],
      triageCase: ["knowledge","supervisor"],
      closeCase: ["knowledge","supervisor"],
      createLink: ["knowledge"],
      evalRun: ["evaluation"],
      releaseApprove: ["supervisor"],
      releaseReject: ["supervisor"],
      releaseSuspend: ["supervisor","knowledge"],
      rollbackCreate: ["knowledge"],
      rollbackApprove: ["supervisor"],
      noFixSupervisor: ["supervisor"],
      noFixBusiness: ["business"],
      changeMemberRole: ["admin"]
    };
    if (!permissionMap[action]?.includes(role)) {
      feedback("blocked", "权限不足，操作未执行", `${ROLES[role].label}没有“${action}”权限。系统已保留拒绝审计。`, page);
      addAudit("权限拒绝", `${PAGES[page].title} / ${action}`, "拒绝");
      focusTarget = "action-feedback";
      render();
      return false;
    }
    return true;
  }

  function rejectTransition(title, detail, object = state.page) {
    feedback("blocked", title, detail);
    addAudit("非法状态转换", object, "拒绝");
    focusTarget = "action-feedback";
    save();
    render();
  }

  function sourceChecksMet(source) {
    return Boolean(
      source.accessible
      && source.titleVerified
      && source.title?.trim()
      && source.locator?.trim()
      && source.organization?.trim()
      && source.scope?.trim()
      && source.validUntil
      && source.owner?.trim()
      && source.verifiedAt
    );
  }

  function sourceCheckRows(source) {
    return [
      ["可访问", source.accessible, source.accessible ? "通过" : "未确认"],
      ["标题核验", source.titleVerified, source.titleVerified ? "通过" : "未确认"],
      ["范围明确", Boolean(source.scope?.trim()), source.scope || "缺失"],
      ["有效期明确", Boolean(source.validUntil), source.validUntil || "缺失"],
      ["责任人明确", Boolean(source.owner?.trim()), source.owner || "缺失"]
    ];
  }

  function setPage(page) {
    state.page = page;
    state.feedback = null;
    state.demoOpen = false;
    history.replaceState(null, "", `#${page}`);
    focusTarget = "page-title";
    save();
    render();
  }

  function setFeedbackOnly(type, title, detail) {
    feedback(type, title, detail);
    focusTarget = "action-feedback";
    save();
    render();
  }

  function pageHeader(code, extraActions = "") {
    const page = PAGES[state.page];
    return `
      <header class="page-heading">
        <div>
          <p class="breadcrumb">售后知识协作 / ${page.label}</p>
          <h1 id="page-title" tabindex="-1">${page.title}</h1>
          <div class="fr-line">关联需求：${page.frs.map(fr => `<span>${fr}</span>`).join("")}</div>
        </div>
        <div class="heading-actions">
          ${statusMarkup(code)}
          ${extraActions}
        </div>
      </header>
    `;
  }

  function feedbackMarkup() {
    if (!state.feedback || state.feedback.page !== state.page) return "";
    const kind = state.feedback.type === "success" ? "success" : state.feedback.type === "blocked" ? "risk-inline" : "";
    return `<section id="action-feedback" class="inline-result ${kind}" tabindex="-1"><strong>${escapeHtml(state.feedback.title)}</strong><span>${escapeHtml(state.feedback.detail)}</span></section>`;
  }

  function riskPriorityStrip(title, detail, page, actionLabel) {
    return `
      <section class="risk-priority" aria-label="风险优先条">
        <div><span class="risk-kicker">风险优先</span><h2>${escapeHtml(title)}</h2><p>${escapeHtml(detail)}</p></div>
        <button class="primary-button" type="button" data-go="${page}">${escapeHtml(actionLabel)}</button>
      </section>
    `;
  }

  function statusTrack(items) {
    return `<div class="status-track" aria-label="证据与状态轨道">${items.map((item, index) => `<div class="track-step ${index < items.length - 1 ? "has-next" : ""}"><span>${String(index + 1).padStart(2, "0")}</span><strong>${escapeHtml(item[0])}</strong><small>${escapeHtml(item[1])}</small></div>`).join("")}</div>`;
  }

  function button(label, action, value = "", kind = "secondary") {
    return `<button type="button" class="action-${kind}" data-action="${action}" data-value="${value}">${escapeHtml(label)}</button>`;
  }

  function renderHome() {
    const role = ROLES[state.role];
    return `
      ${pageHeader("WORKBENCH_READY")}
      ${riskPriorityStrip("R3 风险：设备鼓包后仍在充电", "ESC-2026-0217 · 普通售后建议已暂停 · 需要安全责任人确认", "P05", "进入风险处置")}
      ${statusTrack([["上下文待补", "C1 · ASQ-2026-1043"],["风险待处置", "R3 · ESC-2026-0217"],["案例链路进行中", "3 LINK · 1 活动"],["待发布", "REL-104-2026"]])}
      <section class="summary-strip">
        <div><span>我的待办</span><strong>${role.label === "系统管理员" ? "0" : "8"}</strong><small>按活动角色计算</small></div>
        <div><span>风险阻断</span><strong>2</strong><small>R3 优先</small></div>
        <div><span>待补上下文</span><strong>3</strong><small>不生成确定结论</small></div>
        <div><span>知识闭环</span><strong>4</strong><small>CASE / EVAL / REL</small></div>
      </section>
      <div class="content-grid">
        <section class="surface">
          <div class="section-heading"><div><span class="eyebrow">优先队列</span><h2>先处理不可逆风险</h2></div><button class="text-button" data-go="P02">查看咨询任务</button></div>
          <div class="list-lines">
            <button type="button" class="record-line" data-go="P05"><span class="code-token risk">R3</span><span><strong>充电盒鼓包并继续充电</strong><small>ESC-2026-0217 · 等待止损与安全升级</small></span><span class="record-end">2 分钟</span></button>
            <button type="button" class="record-line" data-go="P03"><span class="code-token">ASQ</span><span><strong>电池续航明显下降</strong><small>ASQ-2026-1043 · 上下文 C3 · 建议待确认</small></span><span class="record-end">18 分钟</span></button>
            <button type="button" class="record-line" data-go="P09"><span class="code-token">CASE</span><span><strong>渠道结论冲突</strong><small>CASE-2026-031 · 部分 LINK 已完成</small></span><span class="record-end">1 小时</span></button>
          </div>
        </section>
        <aside class="surface context-surface">
          <span class="eyebrow">当前角色边界</span>
          <h2>${role.label}</h2>
          <p>${state.role === "supervisor" ? "可建单、转交并确认发送 ADV；CTX 只读。" : state.role === "legal" ? "R3 优先；关闭需要完整止损与升级证据。" : state.role === "admin" ? "仅处理权限、审计和系统运行，不读取业务详情。" : "导航和动作由活动角色决定。"}</p>
          <div class="rule"><span>风险</span><strong>优先于普通售后</strong></div>
          <div class="rule"><span>成功</span><strong>必须与对象状态一致</strong></div>
        </aside>
      </div>
      ${feedbackMarkup()}
    `;
  }

  function renderTaskQueue() {
    return `
      ${pageHeader("ASQ_QUEUE", button("新建咨询", "create-asq", "", "primary"))}
      ${feedbackMarkup()}
      <section class="filter-line" aria-label="咨询任务筛选">
        <label>关键词 <input type="search" placeholder="ASQ ID / 客户诉求"></label>
        <label>状态 <select><option>全部</option><option>待补上下文</option><option>建议待确认</option></select></label>
        <button class="quiet-button" type="button" data-action="apply-filter">筛选</button>
      </section>
      <section class="surface table-surface">
        <div class="section-heading"><div><span class="eyebrow">任务队列</span><h2>我的与待分派</h2></div><span class="muted-text">8 条 · 按风险与等待时长排序</span></div>
        <table>
          <thead><tr><th>任务</th><th>诉求</th><th>状态</th><th>下一步</th></tr></thead>
          <tbody>
            <tr><td><strong>${state.asq.id}</strong><small>模拟客户 A</small></td><td>电池续航明显下降</td><td>${statusMarkup(state.asq.status)}</td><td><button class="text-button" data-go="P03">打开任务</button></td></tr>
            <tr><td><strong>ASQ-2026-1048</strong><small>模拟客户 C</small></td><td>充电盒翘起并继续充电</td><td>${riskMarkup("风险暂停", "ASQ_PAUSED")}</td><td><button class="text-button" data-go="P05">进入风险单</button></td></tr>
            <tr><td><strong>ASQ-2026-1052</strong><small>模拟客户 D</small></td><td>已拆封退货</td><td>${statusMarkup("ASQ_CONTEXT_PENDING")}</td><td><button class="text-button" data-go="P03">补齐上下文</button></td></tr>
          </tbody>
        </table>
      </section>
    `;
  }

  function p03SourceSwitch(mode) {
    return `
      <section class="p03-source-switch" aria-label="P03数据来源">
        <div><span class="eyebrow">P03 数据来源</span><strong>${mode === "real" ? "真实 RAG 评测模式" : "模拟演示模式"}</strong><p>${mode === "real" ? "请求经本地 BFF 安全门禁后调用 Dify；结果会单独标识，不与模拟数据混用。" : "保留阶段3B模拟数据与15条演示流程，不调用外部供应商。"}</p></div>
        <label>来源<select id="p03-source-mode"><option value="simulation" ${mode === "simulation" ? "selected" : ""}>模拟演示</option><option value="real" ${mode === "real" ? "selected" : ""}>真实 RAG</option></select></label>
      </section>
    `;
  }

  function renderRealRagTaskDetail() {
    const real = state.realRag;
    const result = real.result;
    const uiStatus = result?.ui_state || result?.answer_status || "REAL_RAG";
    const statusCode = uiStatus === "CONFLICT_HOLD" ? "CONFLICT_HOLD" : uiStatus;
    const status = statusCode === "BLOCKED_SAFETY"
      ? riskMarkup(...(STATUS[statusCode] || [statusCode, statusCode]))
      : statusMarkup(statusCode);
    const citations = result?.citations || [];
    const conditions = result?.business_conditions || [];
    const providerMeta = result
      ? `<div class="real-provider-meta review-only"><span>BFF request_id</span><code>${escapeHtml(result.request_id || "—")}</code><span>Dify provider_request_id</span><code>${escapeHtml(result.provider_request_id || "—")}</code><span>模型</span><code>${escapeHtml(result.cost?.model || "—")}</code><span>Token</span><code>${Number(result.cost?.prompt_tokens || 0)} / ${Number(result.cost?.completion_tokens || 0)}</code><span>成本状态</span><code>${escapeHtml(result.cost?.cost_status || "COST_UNKNOWN")}</code><span>provider_called</span><code>${result.provider_called === true}</code><span>耗时</span><code>${Number(result.timing_ms || 0)} ms</code></div>`
      : "";
    let confirmation = "";
    if (result?.answer_status === "ANSWERED") {
      confirmation = result.confirmed
        ? `<div class="real-confirmation"><strong>建议已由当前角色确认采用</strong><span>ASQ 已进入 ASQ_ADVICE_PENDING。</span>${button("确认并发送建议", "send-real-advice", "", "primary")}</div>`
        : `<div class="real-confirmation"><strong>等待人工确认</strong><span>系统没有自动更新 ASQ 状态。请先核对证据、条件和承诺边界。</span>${button("确认采用建议", "confirm-real-advice", "", "primary")}</div>`;
    } else if (result?.answer_status === "BLOCKED_SAFETY") {
      confirmation = `<div class="real-confirmation safety-confirmation"><strong>安全门禁已阻断普通 ADV</strong><span>请先执行止损；确认后再将 ASQ 标记为安全暂停。</span>${button("确认已执行止损", "acknowledge-real-safety", "", "danger")}</div>`;
    } else if (result?.ui_state === "CONFLICT_HOLD") {
      confirmation = `<div class="real-confirmation conflict-confirmation"><strong>冲突保持中</strong><span>不得强行合并结论。请提交渠道负责人和主管联合裁决。</span>${button("提交联合裁决", "escalate-real-conflict", "", "primary")}</div>`;
    }
    const resultMarkup = real.loading
      ? `<section class="real-rag-result" aria-busy="true" aria-live="polite"><span class="eyebrow">真实请求进行中</span><h2 id="real-rag-result-title" tabindex="-1">正在检查安全、上下文字段并调用 BFF</h2><div class="skeleton wide"></div><div class="skeleton"></div><p>当前不展示模拟 ADV；如果请求超时，只会显示明确错误，不返回未验证内容。</p></section>`
      : real.error
        ? `<section class="real-rag-result real-rag-error" role="alert"><span class="eyebrow">真实请求失败</span><h2 id="real-rag-result-title" tabindex="-1">${escapeHtml(real.error.message || "RAG 请求失败")}</h2><p>错误码：<code>${escapeHtml(real.error.error_code || "UNKNOWN")}</code>。系统未使用模拟缓存替代真实结果。</p>${Array.isArray(real.error.details?.privacy_categories) && real.error.details.privacy_categories.length ? `<p>已阻断类别：${real.error.details.privacy_categories.map(escapeHtml).join("、")}。输入内容已在页面中移除，Dify 未被调用。</p>` : ""}<div class="button-row">${button("重新填写", "new-real-rag-request", "", "primary")}</div></section>`
        : result
          ? `<section class="real-rag-result" aria-live="polite">
              <div class="section-heading"><div><span class="eyebrow">RAG 结果</span><h2 id="real-rag-result-title" tabindex="-1">RAG结果：${escapeHtml(STATUS[statusCode]?.[0] || result.answer_status)}</h2></div>${status}</div>
              ${result.answer_status === "BLOCKED_SAFETY" ? riskPriorityStrip("P0 已由 BFF 前置阻断", "Dify 普通问答未被调用；先止损和隔离，再进入售后。", "P05", "查看风险框架") : ""}
              <div class="real-answer">${formatRealAnswer(result.answer || "")}</div>
              ${conditions.length ? `<div class="real-result-block"><span class="eyebrow">业务条件</span><ul>${conditions.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>` : ""}
              ${result.suggested_action ? `<div class="real-result-block"><span class="eyebrow">下一步动作</span><p>${escapeHtml(result.suggested_action)}</p></div>` : ""}
              <div class="real-result-block"><div class="section-heading"><div><span class="eyebrow">EVD</span><h2>可追溯引用</h2></div><span class="small-code">${citations.length} 条</span></div>
                ${citations.length ? citations.map(citation => `<article class="real-citation"><div><strong>${escapeHtml(citation.source?.title || "未知来源")}</strong><span>${escapeHtml(citation.source?.doc_id || "—")} · KB ${escapeHtml(citation.kb_version_id || citation.source?.version || "—")}</span></div><code>${escapeHtml(citation.segment_id || citation.chunk_id || "—")}</code></article>`).join("") : `<div class="draft-lock"><strong>没有可展示引用</strong><span>回答不会被视为确定业务结论。</span></div>`}
              </div>
              ${confirmation}
              ${providerMeta}
            </section>`
          : `<section class="real-rag-result"><span class="eyebrow">真实 RAG</span><h2 id="real-rag-result-title" tabindex="-1">等待提交真实问题</h2><p>模拟 ADV 和证据不会出现在这里。真实结果会保存在 localStorage，并在刷新后恢复。</p></section>`;
    return `
      ${pageHeader(state.asq.status, button("转交任务", "handoff-task", "", "quiet"))}
      ${feedbackMarkup()}
      ${p03SourceSwitch("real")}
      <section class="real-rag-panel">
        <div class="real-rag-boundary"><span>真实请求</span><strong>本地 BFF → Dify Adapter → Dify Cloud</strong><small>P0 在 Dify 前执行 · 非生产 SLA · 仅公开模拟知识</small></div>
        <form id="p03-real-rag-form" class="real-rag-form" aria-label="真实 RAG 售后问题">
          <label class="wide-field">客户问题<textarea name="question" rows="5" maxlength="2000" required>${escapeHtml(real.question)}</textarea></label>
          <label>商品型号<input name="productModel" value="${escapeHtml(real.productModel)}" required></label>
          <label>购买或售后渠道<input name="channel" value="${escapeHtml(real.channel)}" required></label>
          <div class="real-fixed-config"><span>TopK 3</span><span>混合检索</span><span>Rerank</span><span>引用必需</span></div>
          <div class="button-row"><button class="primary-button" type="submit" ${real.loading ? "disabled" : ""}>${real.loading ? "正在调用真实 RAG…" : "发送真实 RAG 请求"}</button><button class="quiet-button" type="button" data-action="new-real-rag-request">清空结果</button></div>
          ${location.protocol === "file:" ? `<p class="inline-warning">当前通过 file:// 打开，真实模式不可用。请使用 BFF 地址访问。</p>` : ""}
        </form>
      </section>
      ${resultMarkup}
    `;
  }

  function renderTaskDetail() {
    if (state.realRag?.enabled) return renderRealRagTaskDetail();
    const canSend = ["frontline","aftersales","supervisor"].includes(state.role);
    const canEdit = ["frontline","aftersales"].includes(state.role);
    const contextReady = state.asq.contextCompleteness === "C3" && !state.asq.missing;
    const adviceReady = state.asq.status === "ASQ_ADVICE_PENDING" && state.asq.adviceGenerated && contextReady && state.asq.evidenceMode === "normal";
    const canGenerateAdvice = canEdit && state.asq.status === "ASQ_ASSESSING" && contextReady && state.asq.evidenceMode === "normal";
    const evidenceMessage = state.asq.evidenceMode === "missing"
      ? `<div class="inline-result risk-inline"><strong>证据不足</strong><span>缺少电池检测结果，生成追问但不给出确定结论。</span></div>`
      : state.asq.evidenceMode === "conflict"
        ? `<div class="inline-result risk-inline"><strong>证据冲突</strong><span>官方服务说明与渠道答复不一致，已暂停承诺并转渠道负责人。</span></div>`
        : "";
    const nextStep = state.asq.sent
      ? "记录客户反馈"
      : state.asq.status === "ASQ_CONTEXT_PENDING"
        ? "补齐缺失字段"
        : state.asq.status === "ASQ_ASSESSING"
          ? canEdit ? "生成处理建议" : "等待建议生成"
          : state.asq.status === "ASQ_ADVICE_PENDING"
            ? canSend ? "人工确认并发送" : "等待有权角色确认"
            : "查看状态与责任";
    const adviceContent = state.asq.sent
      ? `<p>建议已发送，等待客户反馈。</p><div class="button-row"><span class="muted-text">后续动作：记录客户反馈或关闭咨询任务。</span></div>`
      : state.asq.status === "ASQ_CONTEXT_PENDING"
        ? `<div class="draft-lock"><strong>建议草案不可发送</strong><span>上下文完整度为 ${state.asq.contextCompleteness}，缺失：${state.asq.missing || "必需字段"}。</span></div>`
        : state.asq.evidenceMode === "conflict"
          ? `<div class="draft-lock"><strong>建议草案不可发送</strong><span>证据冲突尚未由渠道负责人裁决。</span></div>`
          : state.asq.status === "ASQ_ASSESSING"
            ? `<p>上下文已齐全，当前正在判断适用条件。先生成建议，再由有权角色确认发送。</p><div class="button-row">${canGenerateAdvice ? button("生成处理建议", "generate-advice", "", "primary") : `<span class="muted-text">当前角色只读；建议生成由一线客服或售后专员执行。</span>`}</div>`
            : `<p>建议客户预约检测，不承诺免费维修。最终费用需结合检测结果和保障范围。</p>
              <div class="guard-line"><strong>承诺边界</strong><span>不得承诺免费维修、换新或赔偿。</span></div>
              <label class="check-line review-only"><input type="checkbox" id="promise-risk" ${state.asq.promiseRisk ? "checked" : ""}> 演示：插入“保证免费换新”越权文案</label>
              <div class="button-row">${canSend && adviceReady ? button("确认并发送建议", "send-advice", "", "primary") : `<span class="muted-text">当前角色只读，或建议尚未满足发送条件。</span>`}</div>`;
    return `
      ${pageHeader(state.asq.status, button("转交任务", "handoff-task", "", "quiet"))}
      ${feedbackMarkup()}
      ${p03SourceSwitch("simulation")}
      <section class="object-header">
        <div><span>${state.asq.id}</span><strong>电池续航下降与服务判断</strong></div>
        <div><span>客户</span><strong>模拟客户 B</strong></div>
        <div><span>上下文</span><strong>CTX v${state.asq.ctxVersion} · ${state.asq.contextCompleteness}</strong></div>
        <div><span>风险</span><strong>未命中 R2/R3</strong></div>
      </section>
      ${statusTrack([["原诉求", "续航约 2.5 小时"],["上下文", `${state.asq.contextCompleteness} · CTX v${state.asq.ctxVersion}`],["建议", adviceReady ? "待人工确认" : "尚未可发送"],["下一步", nextStep]])}
      <div class="content-grid task-detail-grid">
        <div class="stack">
          <section class="surface sectioned">
            <div class="section-heading"><div><span class="eyebrow">CTX</span><h2>上下文与必需追问</h2></div><span class="small-code">上下文完整度 · ${state.asq.contextCompleteness}</span></div>
            <div class="field-grid">
              <div class="read-field"><span>购买日期</span><strong>2026-03-12</strong></div>
              <div class="read-field"><span>当前续航</span><strong>约 2.5 小时</strong></div>
              <div class="read-field attention"><span>电池检测</span><strong>${state.asq.missing || "已补齐"}</strong></div>
              <div class="read-field"><span>保障状态</span><strong>需结合合同核实</strong></div>
            </div>
            <p class="muted-text">${canEdit ? "可创建新的 CTX 版本；历史快照不会被覆盖。" : "主管 CTX 只读，可确认和发送符合权限的 ADV，也可发起售后修正请求。"}</p>
            <div class="button-row">${canEdit ? button(state.asq.missing ? "补齐检测结果" : "创建新 CTX 版本", "fill-ctex", "", "primary") + button("记录追问", "ask-missing", "", "quiet") : `<span class="muted-text">CTX 仅可读；如需修正，请发起售后修正请求。</span>`}</div>
          </section>
          <section class="surface sectioned">
            <div class="section-heading"><div><span class="eyebrow">EVD</span><h2>证据与适用条件</h2></div><span class="small-code">EVD-02 · SRC-014 v4</span></div>
            ${evidenceMessage || `<div class="evidence-line"><span class="status-dot"></span><div><strong>电池续航下降需结合检测与保障范围</strong><small>适用：故障、保障有效、检测结果明确；例外：进液、跌落、非授权维修。</small></div><span>有效至 2026-12-31</span></div>`}
            <div class="button-row">${button("模拟证据不足", "simulate-missing", "", "quiet")}${button("模拟证据冲突", "simulate-conflict", "", "quiet")}</div>
          </section>
          <section class="surface sectioned advice-section">
            <div class="section-heading"><div><span class="eyebrow">ADV</span><h2>处理建议</h2></div><span class="small-code">ADV_DRAFT</span></div>
            ${adviceContent}
          </section>
        </div>
        <aside class="stack">
          <section class="surface context-surface"><span class="eyebrow">当前责任</span><h2>${ROLES[state.role].label}</h2><p>${canSend ? "可确认并发送建议。" : "当前角色只能查看，不能发送。"}</p></section>
          <section class="surface context-surface"><span class="eyebrow">最近事件</span><div class="mini-timeline"><p><strong>09:32</strong> 客户补充续航</p><p><strong>09:34</strong> 证据匹配完成</p><p><strong>09:36</strong> ADV v2 生成</p></div></section>
        </aside>
      </div>
    `;
  }

  function renderRiskQueue() {
    return `
      ${pageHeader("ESC_QUEUE")}
      ${riskPriorityStrip("1 个 R3 待止损", "风险优先于普通售后队列；关闭必须由安全/法务确认。", "P05", "进入风险单")}
      <section class="surface table-surface">
        <div class="section-heading"><div><span class="eyebrow">风险队列</span><h2>R2 / R3 待办</h2></div><span class="muted-text">按风险等级与等待时间排序</span></div>
        <table>
          <thead><tr><th>风险单</th><th>信号</th><th>状态</th><th>下一步</th></tr></thead>
          <tbody><tr><td>${state.risk.id}</td><td>充电盒鼓包且继续充电</td><td>${riskMarkup(...STATUS[state.risk.status])}</td><td><button class="text-button" data-go="P05">处理</button></td></tr></tbody>
        </table>
      </section>
      ${feedbackMarkup()}
    `;
  }

  function renderRiskDetail() {
    const canClose = state.role === "legal";
    const canEscalate = ["supervisor","legal"].includes(state.role);
    return `
      ${pageHeader(state.risk.status, button("查看审计", "go-audit", "", "quiet"))}
      ${feedbackMarkup()}
      <section class="risk-priority">
        <div><span class="risk-kicker">R3 立即止损</span><h2>停止使用并断开充电，不要按压或拆机</h2><p>${state.risk.stopSent ? "止损指令已发送；风险仍保持 R3。" : "尚未发送止损指令。"}</p></div>
        <button class="primary-button" type="button" data-action="risk-stop">${state.risk.stopSent ? "止损已发送" : "发送止损指令"}</button>
      </section>
      ${statusTrack([["风险候选", "09:38"],["确认 R3", "09:39"],["止损", state.risk.stopSent ? "已发送" : "待发送"],["升级", state.risk.status === "ESC_ESCALATED" ? "已升级" : "待处理"]])}
      <div class="risk-grid">
        <section class="surface sectioned">
          <div class="section-heading"><div><span class="eyebrow">风险事实</span><h2>证据与暂停前状态</h2></div>${riskMarkup("R3 安全风险","R3")}</div>
          <dl class="fact-list"><div><dt>商品状态</dt><dd>充电盒外壳鼓起</dd></div><div><dt>当前动作</dt><dd>仍连接充电器</dd></div><div><dt>伴随信号</dt><dd>轻微发热，无明火与人员伤害</dd></div><div><dt>paused_from_state</dt><dd>ASQ_ASSESSING</dd></div><div><dt>previous_esc_id</dt><dd>${state.risk.previousEscId || "无"}</dd></div></dl>
        </section>
        <section class="surface sectioned">
          <div class="section-heading"><div><span class="eyebrow">升级路径</span><h2>安全责任链</h2></div>${statusMarkup(state.risk.status)}</div>
          <div class="button-row">${canEscalate ? button("升级安全责任人", "risk-escalate", "", "primary") : ""}${canClose ? button("关闭风险单", "risk-close", "", "quiet") : ""}</div>
          <div class="rule"><span>关闭权限</span><strong>${canClose ? "当前角色可确认 R3" : "仅法务/安全责任人可确认"}</strong></div>
          <div class="rule"><span>复发规则</span><strong>关闭后创建新 ESC，旧单不变</strong></div>
          <div class="button-row">${button("演示风险复发", "risk-recur", "", "quiet")}</div>
        </section>
      </div>
    `;
  }

  function renderSourceForm() {
    const source = state.source;
    return `
      <form id="source-registration-form" class="source-form" aria-label="登记或复核知识来源">
        <div class="section-heading"><div><span class="eyebrow">登记与核验</span><h2>来源信息</h2></div><span class="small-code">SRC_REGISTERED</span></div>
        <div class="form-grid">
          <label class="form-field">标题<input name="title" required value="${escapeHtml(source.title || "")}" placeholder="例如：中国大陆服务范围说明"></label>
          <label class="form-field">URL / 文件<input name="locator" required value="${escapeHtml(source.locator || "")}" placeholder="公开链接或文件引用"></label>
          <label class="form-field">发布组织<input name="organization" required value="${escapeHtml(source.organization || "")}"></label>
          <label class="form-field">适用范围<input name="scope" required value="${escapeHtml(source.scope || "")}"></label>
          <label class="form-field">有效期至<input type="date" name="validUntil" required value="${escapeHtml(source.validUntil || "")}"></label>
          <label class="form-field">责任人<input name="owner" required value="${escapeHtml(source.owner || "")}"></label>
          <label class="form-field">核验日期<input type="date" name="verifiedAt" required value="${escapeHtml(source.verifiedAt || "")}"></label>
        </div>
        <div class="form-checks">
          <label class="check-line"><input type="checkbox" name="accessible" ${source.accessible ? "checked" : ""}> 已确认可访问</label>
          <label class="check-line"><input type="checkbox" name="titleVerified" ${source.titleVerified ? "checked" : ""}> 已核验标题与发布组织一致</label>
        </div>
        <div class="button-row"><button class="primary-button" type="submit">${source.status === "SRC_REGISTERED" || source.status === "SRC_REVIEW_REQUIRED" ? "保存并重新登记" : "登记来源"}</button><button class="quiet-button" type="button" data-action="toggle-source-form">取消</button></div>
      </form>
    `;
  }

  function technicalStatus(label, code, tone = "status-neutral") {
    return `<span class="status-badge ${tone}"><strong>${escapeHtml(label)}</strong><small>${escapeHtml(code)}</small></span>`;
  }

  function ingestionStatusLabel(code) {
    return {
      DOCUMENT_UPLOADING: ["上传中", "status-pending"],
      DOCUMENT_INDEXING: ["索引中", "status-pending"],
      DOCUMENT_RETRYING: ["重试中", "status-pending"],
      DOCUMENT_READY: ["已就绪", "status-success"],
      DOCUMENT_FAILED: ["失败", "status-risk"]
    }[code] || [code || "未开始", "status-neutral"];
  }

  function renderDatasetIngestionPanel() {
    const dataset = state.dataset;
    const canIngest = ["knowledge","legal"].includes(state.role);
    const job = dataset.job;
    const [documentLabel, documentTone] = job ? ingestionStatusLabel(job.document_status) : ["未创建任务", "status-neutral"];
    const healthText = dataset.health
      ? dataset.health.status === "ok"
        ? `Dataset API 可用 · ${dataset.health.dataset_name || "CANDIDATE"} · ${dataset.health.document_count ?? "—"} 份文档`
        : `Dataset API ${dataset.health.status === "not_configured" ? "待配置" : "不可用"}`
      : "Dataset API 状态尚未检查";
    const errorMarkup = dataset.error
      ? `<div class="inline-alert" role="alert"><strong>${escapeHtml(dataset.error.error_code || "INGESTION_FAILED")}</strong><span>${escapeHtml(dataset.error.message || "入库失败")}</span></div>`
      : job?.error_code
        ? `<div class="inline-alert" role="alert"><strong>${escapeHtml(job.error_step || "INGESTION_FAILED")}</strong><span>${escapeHtml(job.error_message || job.error_code)}</span></div>`
        : "";
    const jobMarkup = job ? `
      <div class="object-lines">
        <div><span>入库任务</span><strong>${escapeHtml(job.ingestion_id)}</strong></div>
        <div><span>数据来源</span><strong>${job.source_mode === "REAL_DIFY" ? "真实 Dify" : "测试适配器"} · ${escapeHtml(job.source_mode || "UNKNOWN")}</strong></div>
        <div><span>文档状态</span><strong>${documentLabel} · ${escapeHtml(job.document_status)}</strong></div>
        <div><span>Dify任务</span><strong>${escapeHtml(job.provider_status)}</strong></div>
        <div><span>切片进度</span><strong>${job.completed_segments ?? 0} / ${job.total_segments ?? 0}</strong></div>
        <div><span>可发布</span><strong class="${job.publishable ? "" : "blocked-text"}">${job.publishable ? "已满足索引条件" : "未满足"}</strong></div>
      </div>
    ` : `<p class="muted-text">尚未上传文档。登记来源不会等同于索引完成。</p>`;
    return `
      <section class="surface sectioned real-ingestion-panel" aria-labelledby="dataset-ingestion-title">
        <div class="section-heading">
          <div><span class="eyebrow">真实入库</span><h2 id="dataset-ingestion-title">CANDIDATE 文档索引</h2></div>
          ${technicalStatus(dataset.loading || dataset.polling ? "处理中" : documentLabel, job?.provider_status || "DOCUMENT_NOT_CREATED", documentTone)}
        </div>
        <p>${escapeHtml(healthText)}。文件来自冻结的 CANDIDATE manifest，BFF 会校验文件哈希后再调用 Dify Dataset API。</p>
        ${canIngest ? `
          <form id="dataset-ingestion-form" class="compact-form" aria-label="上传 CANDIDATE 文档并建立真实索引">
            <label class="form-field">CANDIDATE 文档
              <select name="docId" ${dataset.loading ? "disabled" : ""}>
                ${dataset.documents.map(document => `<option value="${escapeHtml(document.doc_id)}" ${document.doc_id === dataset.selectedDocId ? "selected" : ""}>${escapeHtml(document.title)} · v${escapeHtml(document.version)}</option>`).join("")}
              </select>
            </label>
            <button class="primary-button" type="submit" ${dataset.loading ? "disabled" : ""}>${dataset.loading ? "正在上传…" : "上传并建立真实索引"}</button>
          </form>
        ` : `<p class="muted-text">当前角色只读；知识运营或法务/安全责任人可发起入库。</p>`}
        ${errorMarkup}
        ${jobMarkup}
        <div class="button-row">
          ${button("检查 Dataset API", "check-dataset-health", "", "quiet")}
          ${job?.retryable && canIngest ? button(dataset.loading ? "正在重试…" : "重试失败任务", "retry-ingestion", "", "quiet") : ""}
          ${job && !["DOCUMENT_READY","DOCUMENT_FAILED"].includes(job.document_status) ? button("刷新索引状态", "refresh-ingestion", "", "quiet") : ""}
        </div>
      </section>
    `;
  }

  function evaluationRunLabel(status) {
    return {
      QUEUED: ["排队中", "status-pending"],
      RUNNING: ["评测中", "status-pending"],
      PASSED: ["评测通过", "status-success"],
      FAILED: ["评测失败", "status-risk"],
      BLOCKED: ["评测阻塞", "status-risk"],
      COMPLETED_WITH_ERRORS: ["部分失败", "status-risk"]
    }[status] || [status || "未开始", "status-neutral"];
  }

  function renderRealEvaluationPanel() {
    const evaluation = state.realEvaluation;
    const run = evaluation.run;
    const canRun = state.role === "evaluation";
    const [runLabel, runTone] = evaluationRunLabel(run?.status);
    const metrics = run?.metrics;
    const cost = metrics?.cost;
    const taskRows = (run?.results || []).map(result => `
      <tr>
        <td><strong>${escapeHtml(result.task_id)}</strong><small>${escapeHtml(result.core_task_id || "")}</small></td>
        <td>${technicalStatus(result.answer_status, result.answer_status, ["ANSWERED","BLOCKED_SAFETY"].includes(result.answer_status) ? "status-success" : "status-neutral")}</td>
        <td>${result.source_hit === true ? "命中" : result.source_hit === false ? "未命中" : "不适用"}</td>
        <td>${result.citation_support_passed ? "通过" : result.answer_status === "ANSWERED" ? "失败" : "不适用"}</td>
        <td>${result.business_action_status || "—"}</td>
        <td>${result.provider_called ? `${result.prompt_tokens ?? "未知"} / ${result.completion_tokens ?? "未知"}` : "BFF短路"}</td>
        <td>${result.provider_latency_ms == null ? "—" : `${result.provider_latency_ms} ms`}</td>
      </tr>
    `).join("");
    return `
      <section class="surface sectioned real-evaluation-panel" aria-labelledby="real-evaluation-title">
        <div class="section-heading">
          <div><span class="eyebrow">真实批量评测</span><h2 id="real-evaluation-title">冻结任务集 · Pro 主模型</h2></div>
          ${technicalStatus(evaluation.loading || evaluation.polling ? "评测运行中" : runLabel, run?.status || "NOT_STARTED", runTone)}
        </div>
        <p>默认运行 17 条 PoC 任务，其中 12 条为核心任务。P0 由 BFF 先行短路；模型单价未知时只比较 token、延迟和质量。</p>
        <p class="muted-text">数据来源：${run?.source_mode === "REAL_DIFY" ? "真实 Dify" : "测试适配器"} · ${escapeHtml(run?.source_mode || "尚未创建运行")}</p>
        ${canRun ? `
          <form id="real-evaluation-form" class="compact-form" aria-label="创建真实批量评测">
            <label class="form-field">任务范围
              <select name="taskScope">
                <option value="ALL_17" ${evaluation.scope === "ALL_17" ? "selected" : ""}>17 条 PoC（含 12 条核心）</option>
                <option value="CORE_12" ${evaluation.scope === "CORE_12" ? "selected" : ""}>12 条核心任务</option>
              </select>
            </label>
            <button class="primary-button" type="submit" ${evaluation.loading || evaluation.polling ? "disabled" : ""}>${evaluation.loading || evaluation.polling ? "评测运行中…" : "创建真实评测运行"}</button>
          </form>
        ` : `<p class="muted-text">当前角色只读；只有 AI 评测人员可以创建真实评测。</p>`}
        ${evaluation.error ? `<div class="inline-alert" role="alert"><strong>${escapeHtml(evaluation.error.error_code || "EVALUATION_FAILED")}</strong><span>${escapeHtml(evaluation.error.message || "评测失败")}</span></div>` : ""}
        ${run ? `
          <div class="summary-strip evaluation-summary">
            <div><span>进度</span><strong>${run.progress?.completed ?? 0} / ${run.progress?.total ?? 0}</strong><small>${escapeHtml(run.run_id)}</small></div>
            <div><span>Recall@3</span><strong>${metrics?.recall_at_3_core ?? "—"}</strong><small>${metrics?.retrieval_covered_source_count ?? "—"} / ${metrics?.retrieval_expected_source_count ?? "—"} 期望来源</small></div>
            <div><span>来源命中率</span><strong>${metrics?.source_hit_rate_core ?? "—"}</strong><small>${metrics?.correct_source_hits_core ?? "—"} / ${metrics?.correct_source_denominator ?? "—"} 检索核心任务</small></div>
            <div><span>P0成功率</span><strong>${metrics ? `${metrics.p0_task_count - metrics.p0_final_failures} / ${metrics.p0_task_count}` : "—"}</strong><small>${metrics?.p0_final_failures ?? "—"} 条最终失败</small></div>
            <div><span>成本</span><strong>${cost?.cost_status || "COST_UNKNOWN"}</strong><small>不显示未知金额</small></div>
          </div>
          <p class="muted-text">Recall@3 只统计实际完成检索的非 P0 核心任务；P0 短路和供应商错误不混入召回分母，但分别统计成功率与错误数。</p>
          ${cost ? `<div class="object-lines evaluation-cost-lines"><div><span>模型调用</span><strong>${cost.model_request_count}</strong></div><div><span>P0短路</span><strong>${cost.p0_short_circuit_count} · 模型成本 0</strong></div><div><span>Token</span><strong>输入 ${cost.prompt_tokens_total ?? "未知"} / 输出 ${cost.completion_tokens_total ?? "未知"}</strong></div><div><span>平均 / P95</span><strong>${cost.provider_latency_average_ms == null ? "—" : `${Math.round(cost.provider_latency_average_ms)} / ${Math.round(cost.provider_latency_p95_ms)} ms`}</strong></div></div>` : ""}
          <div class="table-scroll"><table class="evaluation-results-table"><thead><tr><th>任务</th><th>回答状态</th><th>来源</th><th>Claim引用</th><th>动作检查</th><th>Token 输入/输出</th><th>延迟</th></tr></thead><tbody>${taskRows || `<tr><td colspan="7">等待首条结果…</td></tr>`}</tbody></table></div>
        ` : `<p class="muted-text">创建运行后会显示逐任务证据、真实 token、延迟、P0结果和失败原因；刷新页面将继续轮询。</p>`}
      </section>
    `;
  }

  function renderSource() {
    const canEdit = ["knowledge","legal"].includes(state.role);
    const canInvalidate = canEdit && state.source.status === "SRC_ACTIVE";
    const canActivate = canEdit && ["SRC_REGISTERED","SRC_REVIEW_REQUIRED"].includes(state.source.status);
    const impacted = state.source.impact.length
      ? `<div class="impact-list">${state.source.impact.map(item => `<div><strong>${escapeHtml(item[0])}</strong><span>${escapeHtml(item[1])}</span></div>`).join("")}</div>`
      : `<p class="muted-text">未发现影响增量。来源处于有效状态。</p>`;
    const checks = sourceCheckRows(state.source).map(([label, passed, value]) => `<div><span>${label}</span><strong class="${passed ? "" : "blocked-text"}">${escapeHtml(value)}</strong></div>`).join("");
    const alternative = state.source.alternative
      ? `<section class="source-alternative"><div><span class="eyebrow">替代来源</span><strong>${escapeHtml(state.source.alternative.title)}</strong><p>${escapeHtml(state.source.alternative.organization)} · ${escapeHtml(state.source.alternative.scope)}</p></div><div class="button-row">${canEdit ? button("创建新来源版本", "create-source-version", "", "primary") : ""}</div></section>`
      : "";
    return `
      ${pageHeader(state.source.status, button("查看影响审计", "go-audit", "", "quiet"))}
      ${feedbackMarkup()}
      <section class="object-header">
        <div><span>来源</span><strong>${state.source.id}</strong></div>
        <div><span>发布组织</span><strong>${escapeHtml(state.source.organization)}</strong></div>
        <div><span>范围</span><strong>${escapeHtml(state.source.scope)}</strong></div>
        <div><span>责任人</span><strong>${escapeHtml(state.source.owner)}</strong></div>
      </section>
      ${renderDatasetIngestionPanel()}
      ${state.source.formOpen ? renderSourceForm() : ""}
      <div class="content-grid">
        <section class="surface sectioned">
          <div class="section-heading"><div><span class="eyebrow">核验</span><h2>SRC_ACTIVE 五项条件</h2></div><span class="small-code">${sourceChecksMet(state.source) ? "5 / 5 READY" : "ACTION REQUIRED"}</span></div>
          <div class="checklist">${checks}</div>
          <div class="object-lines"><div><span>标题</span><strong>${escapeHtml(state.source.title)}</strong></div><div><span>URL / 文件</span><strong>${escapeHtml(state.source.locator)}</strong></div><div><span>核验日期</span><strong>${escapeHtml(state.source.verifiedAt)}</strong></div></div>
          <div class="button-row">${canEdit ? button(state.source.formOpen ? "收起来源表单" : state.source.status === "SRC_ACTIVE" ? "登记新来源" : "编辑并复核", "toggle-source-form", "", "quiet") : ""}${canActivate ? button("尝试激活来源", "activate-source", "", "primary") : ""}${canInvalidate ? button("模拟来源撤回", "invalidate-source", "", "danger") : ""}${button("查看来源审计", "go-audit", "", "quiet")}</div>
        </section>
        <aside class="surface sectioned">
          <div class="section-heading"><div><span class="eyebrow">影响传播</span><h2>联动对象</h2></div><span class="muted-text">不自动改写历史</span></div>
          ${alternative}
          ${impacted}
          <div class="button-row">${button("跳到评测中心", "nav-page", "P10", "quiet")}${button("查看案例链路", "nav-page", "P09", "quiet")}</div>
        </aside>
      </div>
    `;
  }

  function renderKnowledgeReview() {
    const canApprove = state.role === "business";
    const reviewKb = state.reviewKb;
    return `
      ${pageHeader(reviewKb.status)}
      ${feedbackMarkup()}
      <section class="object-header">
        <div><span>知识条目</span><strong>KI-118 · 渠道退货例外</strong></div>
        <div><span>版本</span><strong>${reviewKb.id}</strong></div>
        <div><span>来源</span><strong>${state.source.id}</strong></div>
        <div><span>适用渠道</span><strong>官方线上 / 官方直营</strong></div>
      </section>
      ${statusTrack([["来源核验", state.source.status],["业务口径", reviewKb.status === "KB_BUSINESS_REVIEW" ? "待批准" : STATUS[reviewKb.status]?.[0] || reviewKb.status],["评测资格", state.source.status === "SRC_ACTIVE" ? "可进入评测" : "来源阻断"],["发布", state.source.status === "SRC_ACTIVE" ? "需重新核验" : "禁止新发布"]])}
      <div class="content-grid">
        <section class="surface sectioned">
          <div class="section-heading"><div><span class="eyebrow">内容</span><h2>适用条件与例外</h2></div>${statusMarkup(reviewKb.status)}</div>
          <div class="key-value-list"><div><span>事实</span><p>续航下降需结合检测、保障和服务范围。</p></div><div><span>适用条件</span><p>故障、保障有效、检测完成。</p></div><div><span>例外</span><p>进液、跌落、非授权维修需重新核验。</p></div><div><span>来源引用</span><p>${state.source.id}</p></div></div>
          <div class="button-row">${canApprove ? button("批准业务口径", "approve-kb", "", "primary") : `<span class="muted-text">当前角色不可代替业务/渠道负责人批准。</span>`}${button("查看评测资格", "nav-page", "P10", "quiet")}</div>
        </section>
        <aside class="surface sectioned">
          <div class="section-heading"><div><span class="eyebrow">职责分离</span><h2>提交人与批准人</h2></div><span class="small-code">SEPARATED</span></div>
          <div class="rule"><span>提交人</span><strong>沈知 · 知识运营</strong></div>
          <div class="rule"><span>批准人</span><strong>陈岚 · 业务/渠道</strong></div>
          <p class="muted-text">当前角色不可替代业务批准；提交后同一 KB 版本冻结。</p>
        </aside>
      </div>
    `;
  }

  function renderCaseQueue() {
    const canCreateCase = ["frontline","aftersales","supervisor","knowledge","evaluation"].includes(state.role);
    return `
      ${pageHeader(state.caseItem.status, canCreateCase ? button("创建问题案例", "create-case", "", "primary") : "")}
      ${feedbackMarkup()}
      <section class="surface table-surface">
        <div class="section-heading"><div><span class="eyebrow">案例队列</span><h2>待分诊与修复中</h2></div><span class="muted-text">按风险和阻塞排序</span></div>
        <table>
          <thead><tr><th>案例</th><th>来源</th><th>状态</th><th>LINK</th><th>下一步</th></tr></thead>
          <tbody>
            <tr><td><strong>${state.caseItem.id}</strong><small>渠道结论冲突</small></td><td>ASQ-2026-1027</td><td>${statusMarkup(state.caseItem.status)}</td><td>${state.caseItem.links.length} 条</td><td><button class="text-button" data-action="select-case" data-value="main">打开修复</button></td></tr>
            <tr><td><strong>${state.noLinkCase.id}</strong><small>流程说明问题</small></td><td>ESC-2026-0215</td><td>${statusMarkup(state.noLinkCase.status)}</td><td>${state.noLinkCase.links.length} 条</td><td><button class="text-button" data-action="select-case" data-value="noLink">处理关闭</button></td></tr>
          </tbody>
        </table>
      </section>
    `;
  }

  function latestByKnowledgeItem(links) {
    const map = new Map();
    for (const link of links) {
      const previous = map.get(link.knowledgeItemId);
      if (!previous || link.id > previous.id) map.set(link.knowledgeItemId, link);
    }
    return [...map.values()];
  }

  function getActiveCase() {
    return state.activeCaseId === "noLink" ? state.noLinkCase : state.caseItem;
  }

  function caseGate(links) {
    const active = links.filter(link => ["LINK_OPEN","LINK_PENDING_RELEASE"].includes(link.status));
    const latest = latestByKnowledgeItem(links);
    const failed = latest.filter(link => link.status === "LINK_FAILED");
    const complete = latest.length > 0 && latest.every(link => ["LINK_RELEASED","LINK_ABANDONED"].includes(link.status));
    return { active, failed, latest, complete: active.length === 0 && failed.length === 0 && complete };
  }

  function aggregateCaseStatus(caseItem) {
    const gate = caseGate(caseItem.links);
    if (gate.complete) return "CASE_CLOSED";
    if (gate.failed.length === 0 && gate.active.some(link => link.status === "LINK_PENDING_RELEASE") && gate.active.every(link => link.status === "LINK_PENDING_RELEASE")) return "CASE_VERIFIED_PENDING_RELEASE";
    return "CASE_FIXING";
  }

  function renderCaseDetail() {
    const activeCase = getActiveCase();
    const gate = caseGate(activeCase.links || []);
    const canTriage = ["knowledge","supervisor"].includes(state.role);
    const canCreateLink = state.role === "knowledge";
    const canCloseCase = ["knowledge","supervisor"].includes(state.role);
    const links = (activeCase.links || []).map(link => `
      <div class="link-row">
        <div>${statusMarkup(link.status)}</div>
        <div><strong>${link.knowledgeItemId} · ${link.kbVersionId}</strong><span>${link.id}${link.previousLinkId ? ` · previous_link_id: ${link.previousLinkId}` : ""}${link.relId ? ` · ${link.relId}` : ""}</span></div>
        <div>${link.status === "LINK_FAILED" ? button("创建后继", "create-successor", link.id, "quiet") : link.status === "LINK_OPEN" ? button("发起评测", "nav-page", "P10", "quiet") : `<span class="muted-text">只读历史</span>`}</div>
      </div>
    `).join("");
    const noLinkApprovals = `${state.noLinkCase.supervisorApproved ? "主管已批准" : "主管待批准"} / ${state.noLinkCase.businessApproved ? "业务已批准" : "业务待批准"}`;
    return `
      ${pageHeader(activeCase.status, canCloseCase ? button("尝试关闭 CASE", "attempt-close", "active", "quiet") : "")}
      ${feedbackMarkup()}
      <section class="object-header">
        <div><span>案例</span><strong>${activeCase.id}</strong></div>
        <div><span>知识条目</span><strong>${gate.latest.length} 个</strong></div>
        <div><span>活动 LINK</span><strong>${gate.active.length} 条</strong></div>
        <div><span>关闭门禁</span><strong class="${gate.complete ? "" : "blocked-text"}">${gate.complete ? "已满足" : "未满足"}</strong></div>
      </section>
      ${statusTrack([["根因", "渠道结论冲突"],["证据", "双方材料已保留"],["LINK", `${gate.latest.length} 个知识条目`],["关闭门禁", gate.complete ? "满足" : "阻止"]])}
      <div class="case-switcher" role="group" aria-label="切换案例">
        <button type="button" data-action="select-case" data-value="main" class="${state.activeCaseId === "main" ? "is-active" : ""}">主案例 · ${state.caseItem.links.length} LINK</button>
        <button type="button" data-action="select-case" data-value="noLink" class="${state.activeCaseId === "noLink" ? "is-active" : ""}">无 LINK 案例 · ${state.noLinkCase.links.length} LINK</button>
      </div>
      <div class="content-grid case-detail-grid">
        <section class="surface sectioned">
          <div class="section-heading"><div><span class="eyebrow">CASE_LINK</span><h2>修复轨道</h2></div><span class="small-code">0 / 1 / N</span></div>
          <div class="button-row">${canTriage ? button("分诊案例", "triage-case", "", "quiet") : ""}${canCreateLink ? button("添加第 1 条 LINK", "add-link", "1", "quiet") + button("添加后续 LINK", "add-link", "next", "quiet") : ""}${!canTriage && !canCreateLink ? `<span class="muted-text">当前角色只读；修复与关闭动作由知识运营或主管执行。</span>` : ""}</div>
          <div class="link-table">${links || `<p class="muted-text">当前 0 条 LINK。</p>`}</div>
          <div class="close-gate"><span class="gate-icon">!</span><div><strong>${gate.complete ? "关闭门禁已满足" : "当前不可关闭"}</strong><p>${gate.active.length ? `仍有 ${gate.active.length} 条活动 LINK。` : gate.failed.length ? `最新 LINK 为 FAILED：${gate.failed.map(link => link.knowledgeItemId).join("、")}。` : gate.complete ? "所有知识条目的最新 LINK 已发布或明确弃置。" : "尚无可用闭环证据。"}</p></div></div>
        </section>
        <aside class="stack">
          <section class="surface sectioned"><div class="section-heading"><div><span class="eyebrow">无 LINK CASE</span><h2>无需知识修复</h2></div>${statusMarkup(state.noLinkCase.status)}</div><p>${state.noLinkCase.id} · ${noLinkApprovals}</p><div class="button-row">${state.role === "supervisor" ? button("主管批准", "no-fix-supervisor", "", "quiet") : ""}${state.role === "business" ? button("业务批准", "no-fix-business", "", "quiet") : ""}</div></section>
          <section class="surface sectioned"><div class="section-heading"><div><span class="eyebrow">下一步</span><h2>按聚合结果处理</h2></div></div><p>${gate.complete ? "可关闭 CASE。" : gate.failed.length ? "创建失败 LINK 的后继修复。" : gate.active.length ? "完成或明确弃置活动 LINK。" : "先创建修复轨道。"}</p></section>
        </aside>
      </div>
    `;
  }

  function renderEvaluation() {
    const canEvaluate = state.role === "evaluation";
    const links = state.caseItem.links.map(link => `<div class="rule"><span>${link.knowledgeItemId} · ${link.kbVersionId}</span>${statusMarkup(link.status)}</div>`).join("");
    const nextStep = state.eval.status === "EVAL_PLANNED"
      ? "开始评测"
      : state.eval.status === "EVAL_RUNNING"
        ? "生成结果或中止"
        : state.eval.status === "EVAL_PASSED"
          ? "进入发布审批"
          : state.eval.status === "EVAL_FAILED"
            ? "修复 KB 与后继 LINK"
            : "处理来源或样本阻塞";
    const controls = !canEvaluate
      ? `<span class="muted-text">当前角色只读；评测执行只能由 AI 评测人员完成。</span>`
      : state.eval.status === "EVAL_PLANNED"
        ? button("开始评测", "eval-start", "", "primary")
        : state.eval.status === "EVAL_RUNNING"
          ? button("生成通过结果", "eval-pass", "", "primary") + button("生成失败结果", "eval-fail", "", "quiet") + button("生成阻塞结果", "eval-blocked", "", "quiet")
          : `<span class="muted-text">本次评测已形成结果；如需再次验证，应由新评测任务进入 EVAL_PLANNED。</span>`;
    return `
      ${pageHeader(state.eval.status)}
      ${feedbackMarkup()}
      <section class="object-header">
        <div><span>评测任务</span><strong>${state.eval.id}</strong></div>
        <div><span>候选</span><strong>${state.kb.id}</strong></div>
        <div><span>样本</span><strong>12 条人工确认核心任务</strong></div>
        <div><span>关联 CASE</span><strong>${state.caseItem.id}</strong></div>
      </section>
      ${statusTrack([["样本冻结", "v1.1"],["运行", state.eval.status === "EVAL_RUNNING" ? "执行中" : state.eval.status === "EVAL_PLANNED" ? "尚未开始" : "已结束"],["结果", STATUS[state.eval.status]?.[0] || state.eval.status],["下一步", nextStep]])}
      <div class="content-grid">
        <section class="surface sectioned">
          <div class="section-heading"><div><span class="eyebrow">判定</span><h2>执行结果</h2></div>${statusMarkup(state.eval.status)}</div>
          <p>评测只验证动作、证据和风险，不代替业务口径批准。结果必须从 EVAL_RUNNING 产生；中止只能从运行态回到 EVAL_PLANNED。</p>
          <div class="transition-line" aria-label="评测状态顺序"><span>待评测</span><i aria-hidden="true">→</i><span>评测中</span><i aria-hidden="true">→</i><span>通过 / 失败 / 阻塞</span></div>
          <div class="button-row">${controls}</div>
          <div class="button-row">${canEvaluate && state.eval.status === "EVAL_RUNNING" ? button("中止并回 EVAL_PLANNED", "eval-abort", "", "quiet") : ""}</div>
        </section>
        <aside class="surface sectioned"><div class="section-heading"><div><span class="eyebrow">关联 LINK</span><h2>结果落点</h2></div></div>${links}</aside>
      </div>
      ${renderRealEvaluationPanel()}
    `;
  }

  function renderRelease() {
    const canApproveRelease = state.role === "supervisor";
    const canSuspend = ["supervisor","knowledge"].includes(state.role);
    const canCreateRollback = state.role === "knowledge";
    const canApproveRollback = state.role === "supervisor";
    const pendingLinks = state.caseItem.links.filter(link => link.status === "LINK_PENDING_RELEASE").length;
    const gate = caseGate(state.caseItem.links);
    const isPending = state.rel.status === "REL_PENDING_APPROVAL";
    const isActive = state.rel.status === "REL_ACTIVE";
    const isSuspended = state.rel.status === "REL_SUSPENDED";
    const isRollbackCandidate = isPending && Boolean(state.rel.previousId);
    return `
      ${pageHeader(state.rel.status)}
      ${feedbackMarkup()}
      <section class="object-header">
        <div><span>发布版本</span><strong>${state.rel.id}</strong></div>
        <div><span>知识条目</span><strong>KI-104 · ${state.rel.kbVersionId}</strong></div>
        <div><span>作用域</span><strong>正式演示域 · 单知识条目</strong></div>
        <div><span>唯一 ACTIVE</span><strong>当前 1 个</strong></div>
      </section>
      ${statusTrack([["知识版本", state.rel.kbVersionId],["评测证据", state.rel.evalEvidence],["待发布 LINK", `${pendingLinks} 条`],["CASE 聚合", gate.complete ? "可关闭" : "未完成"]])}
      <div class="content-grid">
        <section class="surface sectioned">
          <div class="section-heading"><div><span class="eyebrow">发布控制</span><h2>审批与回滚</h2></div>${statusMarkup(state.rel.status)}</div>
          <p>历史 REL 不可变。停用后通过新回滚候选恢复，不复用旧 REL。</p>
          <div class="button-row">${canApproveRelease && isPending && !state.rel.previousId ? button("批准并激活", "rel-approve", "", "primary") + button("拒绝发布", "rel-reject", "", "quiet") : ""}${canSuspend && isActive ? button("停用当前 REL", "rel-suspend", "", "quiet") : ""}</div>
          <div class="button-row">${canCreateRollback && isSuspended ? button("创建回滚候选", "rollback-create", "", "quiet") : ""}${canApproveRollback && isRollbackCandidate ? button("激活回滚候选", "rollback-approve", "", "quiet") : ""}</div>
          <div class="rule"><span>CASE 聚合</span><strong>${gate.active.length} 活动 · ${gate.failed.length} 最新失败</strong></div>
        </section>
        <aside class="surface sectioned"><div class="section-heading"><div><span class="eyebrow">影响范围</span><h2>单知识条目发布</h2></div></div><p>只替换 KI-104 的 ACTIVE 版本；其他知识条目保持在线。</p><div class="rule"><span>回滚目标</span><strong>${state.rel.previousId || "REL-104-1018"}</strong></div><div class="rule"><span>历史版本</span><strong>只读</strong></div></aside>
      </div>
    `;
  }

  function renderPermissions() {
    const rows = Object.entries(ROLES).map(([key, role]) => `<tr><td>${role.label}</td><td>${role.nav.map(page => PAGES[page].label).join("、")}</td><td>${state.role === key ? "当前角色" : "按需切换"}</td></tr>`).join("");
    const members = state.members.map(member => `<tr><td><strong>${escapeHtml(member.name)}</strong><small>${member.id}</small></td><td>${escapeHtml(ROLES[member.role]?.label || member.role)}<small>${escapeHtml(member.role)}</small></td><td>${escapeHtml(member.scope)}</td><td><span class="status-badge ${member.active ? "status-neutral" : "status-risk"}"><strong>${member.active ? "启用" : "停用"}</strong><small>${member.active ? "ACTIVE" : "INACTIVE"}</small></span></td></tr>`).join("");
    const canChangeRole = state.role === "admin";
    return `
      ${pageHeader("PERMISSION_POLICY_ACTIVE")}
      ${feedbackMarkup()}
      <section class="summary-strip permission-summary">
        <div><span>成员</span><strong>${state.members.length}</strong><small>模拟企业成员</small></div>
        <div><span>活动角色</span><strong>${new Set(state.members.map(member => member.role)).size}</strong><small>职责分离</small></div>
        <div><span>待处理申请</span><strong>1</strong><small>角色范围变更</small></div>
        <div><span>越权拦截</span><strong>持续</strong><small>服务端模拟</small></div>
      </section>
      <section class="surface table-surface">
        <div class="section-heading"><div><span class="eyebrow">角色矩阵</span><h2>导航与职责分离</h2></div><span class="muted-text">服务端模拟再次校验</span></div>
        <table><thead><tr><th>角色</th><th>可访问工作面</th><th>当前状态</th></tr></thead><tbody>${rows}</tbody></table>
      </section>
      <section class="surface table-surface">
        <div class="section-heading"><div><span class="eyebrow">成员与活动角色</span><h2>成员目录</h2></div><span class="muted-text">系统管理员可处理技术角色变更</span></div>
        <table><thead><tr><th>成员</th><th>活动角色</th><th>责任范围</th><th>账号状态</th></tr></thead><tbody>${members}</tbody></table>
      </section>
      <div class="content-grid">
        <section class="surface sectioned">
          <div class="section-heading"><div><span class="eyebrow">权限变更</span><h2>角色范围申请</h2></div><span class="small-code">PENDING_REVIEW</span></div>
          ${canChangeRole ? `
            <form id="member-role-form" class="compact-form" aria-label="变更成员活动角色">
              <label class="form-field">成员<select name="memberId">${state.members.map(member => `<option value="${member.id}">${escapeHtml(member.name)} · ${escapeHtml(ROLES[member.role]?.label || member.role)}</option>`).join("")}</select></label>
              <label class="form-field">目标角色<select name="targetRole">${Object.entries(ROLES).map(([key, role]) => `<option value="${key}">${role.label}</option>`).join("")}</select></label>
              <button class="primary-button" type="submit">提交权限变更</button>
            </form>
            <p class="muted-text">变更只调整技术角色绑定；管理员不能代替业务审批、R3 关闭或发布。</p>
          ` : `<p class="muted-text">当前角色可查看成员与活动范围；角色变更只能由系统管理员提交。</p>`}
        </section>
        <aside class="surface sectioned review-only">
          <div class="section-heading"><div><span class="eyebrow">拦截自检</span><h2>越权动作验证</h2></div><span class="small-code">SERVER_MOCK</span></div>
          <div class="button-row">${button("尝试自审自批", "attempt-self-approval", "", "quiet")}${button("尝试管理员发布", "attempt-admin-release", "", "quiet")}${button("尝试关闭 R3", "attempt-r3-overreach", "", "quiet")}</div>
          <p class="muted-text">这些入口仅用于评审权限拒绝；展示模式不显示。</p>
        </aside>
      </div>
      <section class="surface sectioned"><div class="section-heading"><div><span class="eyebrow">不可绕过</span><h2>职责分离规则</h2></div></div><div class="rule"><span>知识批准</span><strong>提交人不能自批</strong></div><div class="rule"><span>R3 关闭</span><strong>仅安全/法务责任人</strong></div><div class="rule"><span>发布</span><strong>主管批准，知识运营执行，管理员不可发布</strong></div></section>
    `;
  }

  function renderAudit() {
    return `
      ${pageHeader("AUDIT_READY")}
      ${feedbackMarkup()}
      <section class="surface table-surface">
        <div class="section-heading"><div><span class="eyebrow">审计与运行</span><h2>最近关键事件</h2></div><span class="muted-text">只读 · 不可修改历史</span></div>
        <table><thead><tr><th>时间/编号</th><th>动作</th><th>对象</th><th>角色</th><th>结果</th></tr></thead><tbody>${state.audits.slice(0,12).map((audit, index) => `<tr><td>${audit.id}</td><td>${escapeHtml(audit.action)}</td><td>${escapeHtml(audit.object)}</td><td>${escapeHtml(audit.role)}</td><td>${escapeHtml(audit.result)}</td></tr>`).join("")}</tbody></table>
      </section>
      <section class="surface sectioned"><div class="section-heading"><div><span class="eyebrow">运行状态</span><h2>数据完整性</h2></div><span class="status-badge status-neutral"><strong>可用</strong><small>RUNNING</small></span></div><div class="rule"><span>审计写入</span><strong>正常</strong></div><div class="rule review-only"><span>检索服务</span><strong>模拟服务 · 不接真实 RAG</strong></div></section>
    `;
  }

  function renderPageBody() {
    switch (state.page) {
      case "P01": return renderHome();
      case "P02": return renderTaskQueue();
      case "P03": return renderTaskDetail();
      case "P04": return renderRiskQueue();
      case "P05": return renderRiskDetail();
      case "P06": return renderSource();
      case "P07": return renderKnowledgeReview();
      case "P08": return renderCaseQueue();
      case "P09": return renderCaseDetail();
      case "P10": return renderEvaluation();
      case "P11": return renderRelease();
      case "P12": return renderPermissions();
      case "P13": return renderAudit();
      default: return "";
    }
  }

  function renderMockState() {
    if (!canAccess(state.role, state.page)) {
      return `
        <header class="page-heading"><div><p class="breadcrumb">${PAGES[state.page].label}</p><h1 id="page-title" tabindex="-1">无法访问此页面</h1></div>${statusMarkup("PERMISSION_DENIED")}</header>
        <section class="state-surface"><span class="state-glyph">!</span><h2>${ROLES[state.role].label}没有此工作面权限</h2><p>服务端模拟已拒绝请求，页面不展示客户、知识或发布内容。</p>${button("返回我的首页","nav-page",ROLES[state.role].defaultPage,"primary")}</section>
      `;
    }
    if (state.viewMode === "no-permission") {
      return `<header class="page-heading"><div><p class="breadcrumb">${PAGES[state.page].label}</p><h1 id="page-title" tabindex="-1">无权限反馈</h1></div>${statusMarkup("PERMISSION_DENIED")}</header><section class="state-surface"><span class="state-glyph">!</span><h2>当前角色无操作权限</h2><p>只显示最小访问说明，不展示业务内容。</p>${button("恢复默认状态","view-default","","primary")}</section>`;
    }
    if (state.viewMode === "loading") {
      return `<header class="page-heading"><div><p class="breadcrumb">${PAGES[state.page].label}</p><h1 id="page-title" tabindex="-1">${PAGES[state.page].title}</h1></div>${statusMarkup("LOADING")}</header><section class="state-surface" aria-busy="true"><div class="skeleton wide"></div><div class="skeleton"></div><div class="skeleton short"></div><p>正在加载对象和权限信息。</p></section>`;
    }
    if (state.viewMode === "empty") {
      return `<header class="page-heading"><div><p class="breadcrumb">${PAGES[state.page].label}</p><h1 id="page-title" tabindex="-1">${PAGES[state.page].title}</h1></div>${statusMarkup("EMPTY")}</header><section class="state-surface"><span class="state-glyph">○</span><h2>${PAGES[state.page].empty}</h2><p>这是空态，不是故障；可返回合法入口或创建新的模拟对象。</p>${button("恢复默认状态","view-default","","primary")}</section>`;
    }
    if (state.viewMode === "error") {
      return `<header class="page-heading"><div><p class="breadcrumb">${PAGES[state.page].label}</p><h1 id="page-title" tabindex="-1">${PAGES[state.page].title}</h1></div>${riskMarkup("服务异常","ERROR")}</header><section class="state-surface"><span class="state-glyph risk">!</span><h2>${PAGES[state.page].error}</h2><p>未使用缓存结果冒充成功。请恢复默认状态后重试，或转交系统管理员。</p>${button("恢复默认状态","view-default","","primary")}</section>`;
    }
    return renderPageBody();
  }

  function shellMarkup() {
    const role = ROLES[state.role];
    const nav = role.nav.map(page => {
      const current = state.page === page;
      return `<button class="nav-item${current ? " is-active" : ""}" type="button" data-go="${page}" ${current ? 'aria-current="page"' : ""}><span>${PAGES[page].label}</span><small>${page}</small></button>`;
    }).join("");
    return `
      <a class="skip-link" href="#page-title">跳到主内容</a>
      <header class="product-bar">
        <div class="brand-lockup"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span><div><strong>澄明服务科技</strong><span>售后知识协作 · 模拟组织</span></div></div>
        <div class="product-context"><span class="environment">模拟环境</span><button class="icon-button" type="button" aria-label="通知，3 项待处理">通知 <b>3</b></button><div class="identity"><span>${role.user} · ${role.label}</span><span class="avatar" aria-hidden="true">${role.user.slice(0, 1)}</span></div></div>
      </header>
      <div class="mode-bar">
        <span class="mode-label">${state.mode === "show" ? "展示模式" : "评审模式"}</span>
        <label class="toolbar-field">模式<select id="mode-switch"><option value="show" ${state.mode === "show" ? "selected" : ""}>展示模式</option><option value="review" ${state.mode === "review" ? "selected" : ""}>评审模式</option></select></label>
      </div>
      <div class="preview-toolbar review-only">
        <div class="preview-label"><span>方向 A · 深色控制台</span><small>模拟企业演示环境 · 非 Apple 项目</small></div>
        <label class="toolbar-field">页面<select id="page-jump">${Object.entries(PAGES).map(([id,page]) => `<option value="${id}" ${state.page === id ? "selected" : ""}>${id} ${page.title}</option>`).join("")}</select></label>
        <label class="toolbar-field">角色<select id="role-switch">${Object.entries(ROLES).map(([id,role]) => `<option value="${id}" ${state.role === id ? "selected" : ""}>${role.label}</option>`).join("")}</select></label>
        <label class="toolbar-field">页面状态<select id="view-mode"><option value="default" ${state.viewMode === "default" ? "selected" : ""}>默认</option><option value="loading" ${state.viewMode === "loading" ? "selected" : ""}>加载</option><option value="empty" ${state.viewMode === "empty" ? "selected" : ""}>空态</option><option value="error" ${state.viewMode === "error" ? "selected" : ""}>异常</option><option value="no-permission" ${state.viewMode === "no-permission" ? "selected" : ""}>无权限</option></select></label>
        <button class="quiet-button" type="button" data-action="toggle-demos">演示脚本 ${FLOWS.length}</button>
        <button class="quiet-button" type="button" data-action="reset">重置演示</button>
      </div>
      <div class="application-frame">
        <aside class="side-nav" aria-label="${role.label}的一级导航"><div class="nav-heading"><span class="eyebrow">当前工作面</span><strong>${role.label}</strong></div><nav>${nav}</nav><div class="nav-foot"><span>范围</span><strong>中国大陆 · 模拟售后</strong></div></aside>
        <main class="page-root">
          <div class="demo-banner review-only ${state.activeFlow ? "" : "is-hidden"}">${state.activeFlow ? `<strong>演示 ${state.activeFlow.id} · ${state.activeFlow.title}</strong><span>${state.activeFlow.hint}</span>` : ""}</div>
          ${renderMockState()}
        </main>
      </div>
      <div id="live-status" class="sr-only" role="status" aria-live="polite">${state.feedback ? escapeHtml(state.feedback.title) : ""}</div>
      ${state.demoOpen && state.mode === "review" ? renderDemoDrawer() : ""}
      <footer class="preview-footer review-only">阶段 3B 高保真交互原型 · 状态保存在 localStorage · P03 可选本地 BFF 真实 RAG 评测</footer>
    `;
  }

  function renderDemoDrawer() {
    return `<aside class="demo-drawer" aria-label="演示脚本"><div class="drawer-head"><div><span class="eyebrow">演示脚本</span><h2>15 条闭环</h2></div><button class="quiet-button" type="button" data-action="toggle-demos">关闭</button></div><div class="drawer-list">${FLOWS.map(flow => `<button type="button" class="drawer-item" data-action="load-flow" data-value="${flow.id}"><span>${flow.id}</span><strong>${flow.title}</strong><small>${flow.role} · ${flow.page}</small></button>`).join("")}</div></aside>`;
  }

  function render() {
    document.body.dataset.mode = state.mode;
    document.body.innerHTML = shellMarkup();
    if (focusTarget) {
      const element = document.getElementById(focusTarget);
      if (element) element.focus();
      focusTarget = "page-title";
    }
  }

  function resetPrototype() {
    state = createInitialState();
    history.replaceState(null, "", "#P01");
    focusTarget = "page-title";
    save();
    render();
  }

  function loadFlow(id) {
    const flow = FLOWS.find(item => item.id === id);
    if (!flow) return;
    state = createInitialState();
    state.activeFlow = flow;
    state.role = flow.role;
    state.page = flow.page;
    state.demoOpen = false;
    if (flow.id === "D02") {
      state.asq = {
        ...state.asq,
        status: "ASQ_CONTEXT_PENDING",
        ctxVersion: 3,
        contextCompleteness: "C2",
        missing: "电池检测结果",
        evidenceMode: "missing",
        adviceGenerated: false,
        sent: false,
        promiseRisk: false
      };
    }
    if (flow.id === "D04") {
      state.asq = {
        ...state.asq,
        status: "ASQ_ADVICE_PENDING",
        contextCompleteness: "C3",
        missing: "",
        evidenceMode: "normal",
        adviceGenerated: true,
        sent: false,
        promiseRisk: false
      };
    }
    if (flow.id === "D10") {
      state.caseItem.links = [
        { id: "CLINK-031-211", knowledgeItemId: "KI-211", kbVersionId: "KB-211-v1", status: "LINK_OPEN", previousLinkId: "CLINK-031-103", relId: null }
      ];
      state.caseItem.status = "CASE_FIXING";
    }
    if (flow.id === "D09") {
      state.caseItem.links[1].status = "LINK_FAILED";
    }
    if (flow.id === "D07") {
      state.noLinkCase = { id: "CASE-2026-044", status: "CASE_OPEN", links: [], supervisorApproved: false, businessApproved: false };
      state.activeCaseId = "noLink";
    }
    if (["D11","D12"].includes(flow.id)) {
      state.caseItem.links = [
        { id: "CLINK-031-104", knowledgeItemId: "KI-104", kbVersionId: "KB-104-v2", status: "LINK_RELEASED", previousLinkId: null, relId: "REL-104-1018" },
        { id: "CLINK-031-211", knowledgeItemId: "KI-211", kbVersionId: "KB-211-v1", status: "LINK_PENDING_RELEASE", previousLinkId: "CLINK-031-103", relId: state.rel.id }
      ];
      state.eval.status = "EVAL_PASSED";
      state.caseItem.status = "CASE_VERIFIED_PENDING_RELEASE";
    }
    if (flow.id === "D13") {
      state.rel.status = "REL_ACTIVE";
    }
    if (flow.id === "D14") {
      state.noLinkCase.status = "CASE_FIXING";
      state.noLinkCase.links = [];
      state.activeCaseId = "noLink";
    }
    history.replaceState(null, "", `#${state.page}`);
    focusTarget = "page-title";
    save();
    render();
  }

  function closeCaseFromLink() {
    const gate = caseGate(state.caseItem.links);
    if (!gate.complete) {
      feedback("blocked", "CASE 不能关闭", `仍有 ${gate.active.length} 条活动 LINK 或 ${gate.failed.length} 个最新失败轨道。`);
      return;
    }
    state.caseItem.status = "CASE_CLOSED";
    notify("关闭 CASE", "CASE 已关闭", "所有知识条目的最新 LINK 均已完成或明确弃置。");
  }

  function addAuditAndPersist(action, object, result, title, detail) {
    addAudit(action, object, result);
    feedback(result === "拒绝" ? "blocked" : "success", title, detail);
    focusTarget = "action-feedback";
    save();
    render();
  }

  async function submitRealRag(form) {
    const data = new FormData(form);
    const idempotencyKey = globalThis.crypto?.randomUUID?.() || `p03-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    state.realRag = {
      ...state.realRag,
      enabled: true,
      loading: true,
      question: String(data.get("question") || "").trim(),
      productModel: String(data.get("productModel") || "").trim(),
      channel: String(data.get("channel") || "").trim(),
      result: null,
      error: null,
      lastIdempotencyKey: idempotencyKey
    };
    state.page = "P03";
    history.replaceState(null, "", "#P03");
    save();
    render();
    if (location.protocol === "file:") {
      state.realRag.loading = false;
      state.realRag.error = {
        error_code: "BFF_NOT_REACHABLE",
        message: "真实 RAG 只能通过本地 BFF 启动后的地址使用。"
      };
      save();
      render();
      return;
    }
    try {
      const response = await fetch("/api/answers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
          "X-Demo-Role": state.role
        },
        body: JSON.stringify({
          question: state.realRag.question,
          asq_id: state.asq.id,
          knowledge_item_id: "KI-DEMO-AFTERSALES",
          product_model: state.realRag.productModel,
          channel: state.realRag.channel,
          role: state.role,
          tenant_id: "tenant-demo",
          environment: "candidate",
          top_k: 3,
          retrieval_mode: "hybrid",
          rerank: true,
          metadata_filter: {
            enabled: true,
            active_only: true,
            channels: [state.realRag.channel],
            source_statuses: ["active"]
          },
          citation_mode: "required"
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw Object.assign(new Error(payload.message || `BFF HTTP ${response.status}`), {payload});
      }
      state.realRag.result = payload;
      addAudit("真实RAG问答", state.asq.id, "成功");
      focusTarget = "real-rag-result-title";
    } catch (error) {
      state.realRag.error = error.payload || {
        error_code: error.name === "AbortError" ? "RETRIEVAL_TIMEOUT" : "BFF_UNAVAILABLE",
        message: error.message || "无法连接本地 BFF"
      };
      if (state.realRag.error.error_code === "SENSITIVE_DATA_BLOCKED") {
        state.realRag.question = "[已在本地阻断：输入包含个人或凭证信息]";
      }
      addAudit("真实RAG问答", state.asq.id, "拒绝");
      focusTarget = "real-rag-result-title";
    } finally {
      state.realRag.loading = false;
      save();
      render();
    }
  }

  let ingestionPollTimer = null;
  let evaluationPollTimer = null;

  function scheduleIngestionPoll() {
    if (ingestionPollTimer) clearTimeout(ingestionPollTimer);
    const job = state.dataset.job;
    if (!job || ["DOCUMENT_READY","DOCUMENT_FAILED"].includes(job.document_status)) return;
    ingestionPollTimer = setTimeout(() => {
      ingestionPollTimer = null;
      void pollIngestion(job.ingestion_id);
    }, 1800);
  }

  async function pollIngestion(ingestionId) {
    if (state.dataset.polling) return;
    state.dataset.polling = true;
    state.dataset.error = null;
    save();
    render();
    try {
      const response = await fetch(`/api/ingestions/${encodeURIComponent(ingestionId)}`, {
        headers: {"X-Demo-Role": state.role}
      });
      const payload = await response.json();
      if (!response.ok) {
        throw Object.assign(new Error(payload.message || `BFF HTTP ${response.status}`), {payload});
      }
      state.dataset.job = payload;
      addAudit("刷新真实索引状态", payload.doc_id, "成功");
    } catch (error) {
      state.dataset.error = error.payload || {
        error_code: "INGESTION_STATUS_UNAVAILABLE",
        message: error.message || "无法刷新索引状态"
      };
      addAudit("刷新真实索引状态", state.dataset.job?.doc_id || "INGESTION", "失败");
    } finally {
      state.dataset.polling = false;
      save();
      render();
      scheduleIngestionPoll();
    }
  }

  async function startDatasetIngestion(form) {
    if (!authorized("registerSource", "P06")) return;
    const data = new FormData(form);
    const docId = String(data.get("docId") || "");
    const document = state.dataset.documents.find(item => item.doc_id === docId);
    if (!document) {
      state.dataset.error = {error_code: "DOCUMENT_NOT_IN_CANDIDATE", message: "所选文档不在冻结的 CANDIDATE 清单中。"};
      save();
      render();
      return;
    }
    const idempotencyKey = globalThis.crypto?.randomUUID?.() || `ingest-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    state.dataset = {
      ...state.dataset,
      selectedDocId: docId,
      loading: true,
      error: null
    };
    save();
    render();
    try {
      const response = await fetch("/api/ingestions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
          "X-Demo-Role": state.role
        },
        body: JSON.stringify({
          doc_id: document.doc_id,
          src_id: document.src_ids[0],
          source_version: document.version
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw Object.assign(new Error(payload.message || `BFF HTTP ${response.status}`), {payload});
      }
      state.dataset.job = payload;
      addAudit("创建真实入库任务", payload.doc_id, "成功");
      feedback("success", "文档已提交索引", `${payload.doc_id} 已建立真实 Dify 任务；索引完成前不可发布。`);
      focusTarget = "dataset-ingestion-title";
    } catch (error) {
      state.dataset.error = error.payload || {
        error_code: "INGESTION_UNAVAILABLE",
        message: error.message || "无法连接本地 BFF"
      };
      addAudit("创建真实入库任务", document.doc_id, "失败");
      focusTarget = "dataset-ingestion-title";
    } finally {
      state.dataset.loading = false;
      save();
      render();
      scheduleIngestionPoll();
    }
  }

  async function checkDatasetHealth() {
    if (!["knowledge","legal","evaluation","admin"].includes(state.role)) {
      return setFeedbackOnly("blocked", "无法检查 Dataset API", "当前角色无权读取知识库服务状态。");
    }
    state.dataset.loading = true;
    state.dataset.error = null;
    save();
    render();
    try {
      const response = await fetch("/api/dataset/health", {
        headers: {"X-Demo-Role": state.role}
      });
      const payload = await response.json();
      state.dataset.health = payload;
      if (!response.ok) {
        state.dataset.error = {
          error_code: payload.error_code || "DATASET_API_UNAVAILABLE",
          message: payload.message || "Dataset API 不可用"
        };
      }
      addAudit("检查 Dataset API", "DATASET-CANDIDATE", response.ok ? "成功" : "失败");
    } catch (error) {
      state.dataset.health = {status: "unavailable", error_code: "DATASET_API_UNAVAILABLE"};
      state.dataset.error = {
        error_code: "DATASET_API_UNAVAILABLE",
        message: error.message || "无法连接本地 BFF"
      };
      addAudit("检查 Dataset API", "DATASET-CANDIDATE", "失败");
    } finally {
      state.dataset.loading = false;
      save();
      render();
    }
  }

  async function retryIngestion() {
    if (!authorized("registerSource", "P06") || !state.dataset.job?.retryable) return;
    const idempotencyKey = globalThis.crypto?.randomUUID?.() || `retry-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    state.dataset.loading = true;
    state.dataset.error = null;
    save();
    render();
    try {
      const response = await fetch(`/api/ingestions/${encodeURIComponent(state.dataset.job.ingestion_id)}/retry`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
          "X-Demo-Role": state.role
        },
        body: JSON.stringify({reason: "retry failed indexing"})
      });
      const payload = await response.json();
      if (!response.ok) {
        throw Object.assign(new Error(payload.message || `BFF HTTP ${response.status}`), {payload});
      }
      state.dataset.job = payload;
      addAudit("重试真实入库任务", payload.doc_id, "成功");
      feedback("success", "失败任务已重试", "更新原 Dify 文档并重新进入索引，不创建重复文档。");
    } catch (error) {
      state.dataset.error = error.payload || {
        error_code: "INGESTION_RETRY_FAILED",
        message: error.message || "重试失败"
      };
      addAudit("重试真实入库任务", state.dataset.job?.doc_id || "INGESTION", "失败");
    } finally {
      state.dataset.loading = false;
      save();
      render();
      scheduleIngestionPoll();
    }
  }

  function applyEvaluationOutcome(run) {
    state.eval.id = run.run_id;
    if (["QUEUED","RUNNING"].includes(run.status)) {
      state.eval.status = "EVAL_RUNNING";
      return;
    }
    if (run.status === "PASSED") {
      state.eval.status = "EVAL_PASSED";
      state.kb.status = "KB_APPROVED_FOR_RELEASE";
      state.rel = {
        ...state.rel,
        id: `REL-${run.run_id.slice(-8)}`,
        status: "REL_PENDING_APPROVAL",
        previousId: null,
        kbVersionId: state.kb.id,
        evalEvidence: `${run.run_id} · 通过`
      };
      state.caseItem.links = state.caseItem.links.map(link =>
        link.status === "LINK_OPEN" ? {...link, status: "LINK_PENDING_RELEASE", relId: state.rel.id} : link
      );
      state.caseItem.status = aggregateCaseStatus(state.caseItem);
      return;
    }
    state.eval.status = run.status === "FAILED" ? "EVAL_FAILED" : "EVAL_BLOCKED";
    state.kb.status = run.status === "FAILED" ? "KB_EVAL_FAILED" : "KB_SOURCE_BLOCKED";
    state.rel.status = run.status === "FAILED" ? "REL_REJECTED" : "REL_SUSPENDED";
    state.caseItem.links = state.caseItem.links.map(link =>
      ["LINK_OPEN","LINK_PENDING_RELEASE"].includes(link.status) ? {...link, status: "LINK_FAILED"} : link
    );
    state.caseItem.status = "CASE_FIXING";
  }

  function scheduleEvaluationPoll() {
    if (evaluationPollTimer) clearTimeout(evaluationPollTimer);
    const run = state.realEvaluation.run;
    if (!run || !["QUEUED","RUNNING"].includes(run.status)) return;
    evaluationPollTimer = setTimeout(() => {
      evaluationPollTimer = null;
      void pollEvaluation(run.run_id);
    }, 1800);
  }

  async function pollEvaluation(runId) {
    if (state.realEvaluation.polling) return;
    state.realEvaluation.polling = true;
    state.realEvaluation.error = null;
    save();
    render();
    try {
      const response = await fetch(`/api/evaluations/${encodeURIComponent(runId)}`, {
        headers: {"X-Demo-Role": state.role}
      });
      const payload = await response.json();
      if (!response.ok) {
        throw Object.assign(new Error(payload.message || `BFF HTTP ${response.status}`), {payload});
      }
      state.realEvaluation.run = payload;
      applyEvaluationOutcome(payload);
      addAudit("刷新真实批量评测", runId, "成功");
      if (!["QUEUED","RUNNING"].includes(payload.status)) {
        feedback(
          payload.status === "PASSED" ? "success" : "blocked",
          payload.status === "PASSED" ? "真实评测已通过" : "真实评测未通过",
          `已完成 ${payload.results.length} 条任务；P0失败 ${payload.metrics?.p0_final_failures ?? "—"}，成本 ${payload.metrics?.cost?.cost_status || "COST_UNKNOWN"}。`
        );
      }
      focusTarget = "real-evaluation-title";
    } catch (error) {
      state.realEvaluation.error = error.payload || {
        error_code: "EVALUATION_STATUS_UNAVAILABLE",
        message: error.message || "无法刷新评测进度"
      };
      addAudit("刷新真实批量评测", runId, "失败");
    } finally {
      state.realEvaluation.polling = false;
      save();
      render();
      scheduleEvaluationPoll();
    }
  }

  async function startRealEvaluation(form) {
    if (!authorized("evalRun", "P10")) return;
    const data = new FormData(form);
    const taskScope = String(data.get("taskScope") || "ALL_17");
    const idempotencyKey = globalThis.crypto?.randomUUID?.() || `evaluation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    state.realEvaluation = {
      ...state.realEvaluation,
      scope: taskScope,
      loading: true,
      error: null,
      run: null
    };
    state.eval.status = "EVAL_RUNNING";
    save();
    render();
    try {
      const response = await fetch("/api/evaluations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
          "X-Demo-Role": state.role
        },
        body: JSON.stringify({task_scope: taskScope, model: "deepseek-v4-pro"})
      });
      const payload = await response.json();
      if (!response.ok) {
        throw Object.assign(new Error(payload.message || `BFF HTTP ${response.status}`), {payload});
      }
      state.realEvaluation.run = payload;
      state.eval.id = payload.run_id;
      addAudit("创建真实批量评测", payload.run_id, "成功");
      feedback("info", "真实评测已创建", `${payload.task_scope} 已进入排队；P0 将由 BFF 在模型调用前处理。`);
      focusTarget = "real-evaluation-title";
    } catch (error) {
      state.realEvaluation.error = error.payload || {
        error_code: "EVALUATION_UNAVAILABLE",
        message: error.message || "无法连接评测服务"
      };
      state.eval.status = "EVAL_BLOCKED";
      addAudit("创建真实批量评测", state.eval.id, "失败");
    } finally {
      state.realEvaluation.loading = false;
      save();
      render();
      scheduleEvaluationPoll();
    }
  }

  function handleAction(action, value = "") {
    switch (action) {
      case "toggle-demos":
        state.demoOpen = !state.demoOpen;
        save();
        render();
        return;
      case "load-flow":
        loadFlow(value);
        return;
      case "reset":
        resetPrototype();
        return;
      case "nav-page":
        setPage(value || "P01");
        return;
      case "view-default":
        state.viewMode = "default";
        save();
        render();
        return;
      case "apply-filter":
        setFeedbackOnly("info", "筛选已应用", "当前仅显示与活动角色和范围匹配的模拟数据。");
        return;
      case "new-real-rag-request":
        state.realRag.result = null;
        state.realRag.error = null;
        state.realRag.loading = false;
        state.feedback = null;
        focusTarget = "real-rag-result-title";
        save();
        render();
        return;
      case "confirm-real-advice":
        if (state.realRag.result?.answer_status !== "ANSWERED") return setFeedbackOnly("blocked", "当前结果不能确认", "只有带引用的真实 RAG 回答可以进入建议确认。");
        if (state.realRag.result.confirmed) return setFeedbackOnly("info", "建议已经确认", "当前对象没有重复状态变化。");
        state.realRag.result.confirmed = true;
        state.asq.status = "ASQ_ADVICE_PENDING";
        state.asq.adviceGenerated = true;
        state.asq.sent = false;
        addAuditAndPersist("确认真实RAG建议", state.asq.id, "成功", "真实 RAG 建议已确认", "人工确认后才进入 ASQ_ADVICE_PENDING；Dify 结果没有自动改写 ASQ。");
        return;
      case "send-real-advice":
        if (!state.realRag.result?.confirmed) return setFeedbackOnly("blocked", "建议尚未确认", "先核对引用与承诺边界并确认采用建议。");
        state.asq.status = "ASQ_RESPONDED";
        state.asq.sent = true;
        addAuditAndPersist("发送真实RAG建议", state.asq.id, "成功", "建议已发送", "真实 RAG 建议由当前角色确认发送；请求与引用保留在本次演示状态中。");
        return;
      case "acknowledge-real-safety":
        if (state.realRag.result?.answer_status !== "BLOCKED_SAFETY") return setFeedbackOnly("blocked", "当前不是P0结果", "安全确认只适用于 BFF 前置门禁返回的 BLOCKED_SAFETY。");
        state.asq.status = "ASQ_PAUSED";
        state.risk.stopSent = true;
        state.risk.status = "ESC_ESCALATED";
        addAuditAndPersist("确认执行P0止损", state.asq.id, "成功", "ASQ 已安全暂停", "止损已确认，普通 ADV 保持隐藏；风险仍保持 R3 并转安全责任人。");
        return;
      case "escalate-real-conflict":
        if (state.realRag.result?.ui_state !== "CONFLICT_HOLD") return setFeedbackOnly("blocked", "当前不是冲突结果", "只有冲突保持场景可以提交联合裁决。");
        state.asq.status = "ASQ_ASSESSING";
        addAuditAndPersist("提交渠道冲突裁决", state.asq.id, "成功", "冲突已提交联合裁决", "两份结论均被保留，未强行合并为单一业务结论。");
        return;
      case "create-asq":
        if (!authorized("createAsq", "P02")) return;
        state.asq = { id: "ASQ-2026-1060", status: "ASQ_CONTEXT_PENDING", ctxVersion: 1, contextCompleteness: "C2", missing: "型号与购买凭证", evidenceMode: "missing", promiseRisk: false, sent: false, adviceGenerated: false };
        state.page = "P03";
        addAuditAndPersist("创建 ASQ", state.asq.id, "成功", "咨询任务已创建", "ASQ-2026-1060 进入待补上下文，下一步补齐型号与购买凭证。");
        return;
      case "fill-ctex":
        if (!authorized("editContext", "P03")) return;
        if (state.asq.status === "ASQ_RESPONDED") return rejectTransition("当前任务不再接受 CTX 更新", "已发送建议的任务应通过售后修正请求创建新版本。", state.asq.id);
        state.asq.ctxVersion += 1;
        const oldMissing = state.asq.missing;
        state.asq.missing = "";
        state.asq.contextCompleteness = "C3";
        state.asq.evidenceMode = "normal";
        state.asq.status = "ASQ_ASSESSING";
        state.asq.adviceGenerated = false;
        addAuditAndPersist("创建 CTX 版本", `CTX-${state.asq.id}-v${state.asq.ctxVersion}`, "成功", "上下文已补齐", `上下文完整度 C2→C3，CTX 升级到 v${state.asq.ctxVersion}；期间补齐：${oldMissing || "检测结果"}。下一步生成建议。`);
        return;
      case "ask-missing":
        if (!authorized("editContext", "P03")) return;
        state.asq.evidenceMode = "missing";
        state.asq.status = "ASQ_CONTEXT_PENDING";
        state.asq.contextCompleteness = "C2";
        state.asq.missing = "电池检测结果";
        state.asq.adviceGenerated = false;
        addAuditAndPersist("记录追问", state.asq.id, "成功", "已生成追问", "需向客户确认电池检测结果；当前不生成确定售后结论。");
        return;
      case "simulate-missing":
        if (!authorized("editContext", "P03")) return;
        state.asq.evidenceMode = "missing";
        state.asq.status = "ASQ_CONTEXT_PENDING";
        state.asq.contextCompleteness = "C2";
        state.asq.missing = "电池检测结果";
        state.asq.adviceGenerated = false;
        addAuditAndPersist("证据不足", state.asq.id, "成功", "证据不足", "缺少电池检测，已切换为追问和补证路径。");
        return;
      case "simulate-conflict":
        if (!authorized("editContext", "P03")) return;
        state.asq.evidenceMode = "conflict";
        state.asq.status = "ASQ_ASSESSING";
        state.asq.contextCompleteness = "C3";
        state.asq.missing = "";
        state.asq.adviceGenerated = false;
        addAuditAndPersist("标记冲突", state.asq.id, "成功", "证据冲突", "官方说明与渠道回复不一致，暂停承诺并转渠道负责人。");
        return;
      case "generate-advice":
        if (!authorized("editContext", "P03")) return;
        if (state.asq.status !== "ASQ_ASSESSING" || state.asq.contextCompleteness !== "C3" || state.asq.evidenceMode !== "normal") {
          const detail = state.asq.status === "ASQ_CONTEXT_PENDING" ? "上下文尚未补齐，不能生成可发送建议。" : "证据冲突尚未解决，不能生成可发送建议。";
          return rejectTransition("建议暂不可生成", detail, state.asq.id);
        }
        state.asq.adviceGenerated = true;
        state.asq.status = "ASQ_ADVICE_PENDING";
        addAuditAndPersist("生成 ADV", "ADV-2026-1043-v2", "成功", "处理建议已生成", "ASQ 进入 ASQ_ADVICE_PENDING；建议仍需有权角色人工确认。");
        return;
      case "send-advice":
        if (!authorized("sendAdvice", "P03")) return;
        if (state.asq.sent) return setFeedbackOnly("info", "建议已经发送", "当前对象没有新的状态变化，请继续记录客户反馈。");
        if (state.asq.contextCompleteness !== "C3" || state.asq.missing) return setFeedbackOnly("blocked", "发送被阻断：上下文未完成", `当前为 ${state.asq.contextCompleteness}，先补齐${state.asq.missing || "必需字段"}。`);
        if (state.asq.status === "ASQ_ASSESSING" || !state.asq.adviceGenerated) return setFeedbackOnly("blocked", "发送被阻断：建议尚未生成", "先完成条件判断并生成处理建议。");
        if (state.asq.status !== "ASQ_ADVICE_PENDING") return rejectTransition("当前状态不可发送建议", "只有 ASQ_ADVICE_PENDING 允许人工确认并发送。", state.asq.id);
        if (state.asq.evidenceMode === "conflict") return setFeedbackOnly("blocked", "发送被阻断：证据冲突", "冲突证据需要渠道负责人裁决。");
        if (state.asq.promiseRisk) return setFeedbackOnly("blocked", "发送被阻断：越权承诺", "“保证免费换新”不在当前授权范围。");
        state.asq.status = "ASQ_RESPONDED";
        state.asq.sent = true;
        addAuditAndPersist("确认并发送 ADV", "ADV-2026-1043-v2", "成功", "建议已发送", `ADV-v2 已绑定 CTX-v${state.asq.ctxVersion} 与 EVD-02，ASQ 状态更新为“已答复”。`);
        return;
      case "risk-stop":
        if (!authorized("stopRisk", "P05")) return;
        if (state.risk.stopSent) return setFeedbackOnly("info", "止损已经发送", "风险仍保持 R3，请等待安全责任人处置。");
        state.risk.stopSent = true;
        state.risk.status = "ESC_MITIGATING";
        addAuditAndPersist("发送止损", state.risk.id, "成功", "止损指令已发送", "风险仍保持 R3；等待客户反馈与安全责任人处置。");
        return;
      case "risk-escalate":
        if (!authorized("escalateRisk", "P05")) return;
        if (!state.risk.stopSent) return setFeedbackOnly("blocked", "升级前需要先止损", "先发送停止使用和充电指令。");
        state.risk.status = "ESC_ESCALATED";
        addAuditAndPersist("升级 R3", state.risk.id, "成功", "风险已升级", "已转安全/法务责任人，普通售后建议仍暂停。");
        return;
      case "risk-close":
        if (!authorized("closeRisk", "P05")) return;
        if (!state.risk.stopSent || state.risk.status !== "ESC_ESCALATED") return setFeedbackOnly("blocked", "关闭证据不足", "需先完成止损与安全升级。");
        state.risk.status = "ESC_CLOSED";
        addAuditAndPersist("关闭 R3", state.risk.id, "成功", "风险已关闭", "安全责任人已确认关闭依据；ASQ 可在重新校验后恢复。");
        return;
      case "risk-recur":
        if (!["ESC_CLOSED","ESC_DISMISSED"].includes(state.risk.status)) return setFeedbackOnly("blocked", "当前风险尚未关闭", "只有已关闭或已排除风险可以演示复发新单。");
        state.riskHistory.push({ ...state.risk });
        state.risk = { id: `ESC-2026-031${state.riskHistory.length}`, status: "ESC_CANDIDATE", stopSent: false, previousEscId: state.risk.id };
        addAuditAndPersist("新建复发 ESC", state.risk.id, "成功", "已创建新风险单", `新 ESC 通过 previous_esc_id 关联 ${state.risk.previousEscId}，旧单保持终态。`);
        return;
      case "invalidate-source":
        if (!authorized("invalidateSource", "P06")) return;
        if (state.source.status !== "SRC_ACTIVE") return rejectTransition("当前来源不能撤回", "只有有效来源可以登记撤回。", state.source.id);
        const withdrawnSourceId = state.source.id;
        state.source.status = "SRC_WITHDRAWN";
        state.reviewKb.status = "KB_SOURCE_BLOCKED";
        state.kb.status = "KB_SOURCE_BLOCKED";
        state.eval.status = "EVAL_BLOCKED";
        state.rel.status = "REL_SUSPENDED";
        state.caseItem.links = state.caseItem.links.map(link => ["LINK_OPEN","LINK_PENDING_RELEASE"].includes(link.status) ? {...link, status:"LINK_FAILED"} : link);
        state.caseItem.status = state.caseItem.status === "CASE_CLOSED" ? "CASE_REOPENED" : "CASE_FIXING";
        state.source.impact = [
          [state.source.id, "来源已撤回"],
          [state.reviewKb.id, "业务审核被来源阻断"],
          [state.kb.id, "评测候选被来源阻断"],
          [state.eval.id, "评测阻塞"],
          [state.rel.id, "发布候选已停用"],
          [state.caseItem.id, "案例回到修复"],
          ...state.caseItem.links.filter(link => link.status === "LINK_FAILED").map(link => [link.id, "活动 LINK 已阻断"])
        ];
        state.source.alternative = {
          id: "SRC-OFFICIAL-014-v5",
          title: "新版中国大陆服务范围说明",
          locator: "https://support.example.test/airpods-service-cn-v5",
          organization: "模拟官方支持",
          scope: "AirPods 中国大陆服务",
          validUntil: "2027-06-30",
          owner: "沈知",
          verifiedAt: "2026-10-24"
        };
        state.source.previousSourceId = withdrawnSourceId;
        state.source.formOpen = false;
        addAuditAndPersist("来源失效传播", state.source.id, "成功", "来源已失效并完成对象阻断", "KB、EVAL、REL、LINK、CASE 的受影响对象已显示在 P06；历史对象未被改写。");
        return;
      case "refresh-ingestion":
        if (!["knowledge","legal"].includes(state.role) || !state.dataset.job) {
          return setFeedbackOnly("blocked", "无法刷新入库状态", "当前角色无权限或尚无入库任务。");
        }
        void pollIngestion(state.dataset.job.ingestion_id);
        return;
      case "check-dataset-health":
        void checkDatasetHealth();
        return;
      case "retry-ingestion":
        void retryIngestion();
        return;
      case "toggle-source-form":
        if (!authorized("registerSource", "P06")) return;
        state.source.formOpen = !state.source.formOpen;
        state.feedback = null;
        save();
        render();
        return;
      case "activate-source":
        if (!authorized("activateSource", "P06")) return;
        if (!["SRC_REGISTERED","SRC_REVIEW_REQUIRED"].includes(state.source.status)) {
          return rejectTransition("当前来源不能激活", "只有已登记或待复核来源可以执行核验激活。", state.source.id);
        }
        if (!sourceChecksMet(state.source)) {
          state.source.status = "SRC_REVIEW_REQUIRED";
          feedback("blocked", "来源激活失败", "可访问、标题核验、范围、有效期和责任人必须全部满足。");
          addAudit("来源激活校验", state.source.id, "拒绝");
          focusTarget = "action-feedback";
          save();
          render();
          return;
        }
        if (state.dataset.job && state.dataset.job.doc_id && state.dataset.job.publishable !== true) {
          state.source.status = "SRC_REVIEW_REQUIRED";
          feedback("blocked", "来源激活失败", "真实文档尚未完成索引，不能标记为可发布来源。");
          addAudit("来源激活校验", state.source.id, "拒绝");
          focusTarget = "action-feedback";
          save();
          render();
          return;
        }
        state.source.status = "SRC_ACTIVE";
        addAuditAndPersist("激活知识来源", state.source.id, "成功", "来源已激活", "五项必要条件全部满足；可重新进入知识审核与评测。");
        return;
      case "create-source-version":
        if (!authorized("createSourceVersion", "P06")) return;
        if (!state.source.alternative || state.source.status === "SRC_ACTIVE") return rejectTransition("没有可用的替代来源", "先确认原来源失效且存在替代候选。", state.source.id);
        state.source = {
          ...state.source,
          ...state.source.alternative,
          id: state.source.alternative.id,
          status: "SRC_REGISTERED",
          accessible: false,
          titleVerified: false,
          formOpen: true,
          impact: [],
          alternative: null,
          previousSourceId: state.source.previousSourceId || state.source.id
        };
        addAuditAndPersist("创建来源新版本", state.source.id, "成功", "替代来源版本已创建", `新版本关联 previous_source_id=${state.source.previousSourceId}，登记后仍需逐项核验。`);
        return;
      case "create-case":
        if (!["frontline","aftersales","supervisor","knowledge","evaluation"].includes(state.role)) {
          return setFeedbackOnly("blocked", "创建案例被拒绝", "当前角色不能创建问题案例。");
        }
        state.noLinkCase = { id: "CASE-2026-044", status: "CASE_OPEN", links: [], supervisorApproved: false, businessApproved: false };
        state.activeCaseId = "noLink";
        state.page = "P09";
        addAuditAndPersist("创建 CASE", state.noLinkCase.id, "成功", "问题案例已创建", "CASE-2026-044 当前 0 条 LINK，下一步分诊。");
        return;
      case "triage-case":
        if (!authorized("triageCase", "P09")) return;
        getActiveCase().status = "CASE_TRIAGED";
        addAuditAndPersist("分诊 CASE", getActiveCase().id, "成功", "案例已分诊", "可以创建知识修复 LINK，或进入无需知识修复审批。");
        return;
      case "add-link":
        if (!authorized("createLink", "P09")) return;
        const activeCase = getActiveCase();
        if (!Array.isArray(activeCase.links)) activeCase.links = [];
        const count = activeCase.links.length;
        activeCase.links.push({ id: `CLINK-${activeCase.id.slice(-3)}-${301 + count}`, knowledgeItemId: `KI-${301 + count}`, kbVersionId: `KB-${301 + count}-v1`, status: "LINK_OPEN", previousLinkId: null, relId: null });
        activeCase.status = "CASE_FIXING";
        addAuditAndPersist("创建 CASE_LINK", activeCase.links.at(-1).id, "成功", "修复链路已创建", `当前 CASE 有 ${activeCase.links.length} 条 LINK；不同知识条目可并行修复。`);
        return;
      case "attempt-close":
        if (!authorized("closeCase", "P09")) return;
        const activeCaseToClose = getActiveCase();
        if (!(activeCaseToClose.links || []).length) {
          return setFeedbackOnly("blocked", "不能直接关闭", "该 CASE 为 0 LINK，必须由主管和业务/渠道负责人独立批准“无需知识修复”。");
        }
        const gate = caseGate(activeCaseToClose.links);
        if (!gate.complete) return setFeedbackOnly("blocked", "CASE 不能关闭", `仍有 ${gate.active.length} 条活动 LINK，结存 ${gate.failed.length} 个最新失败轨道；请完成或明确弃置。`);
        activeCaseToClose.status = "CASE_CLOSED";
        addAuditAndPersist("关闭 CASE", activeCaseToClose.id, "成功", "CASE 已关闭", "全部知识条目的最新 LINK 已完成或明确弃置。");
        return;
      case "create-successor":
        if (!authorized("createLink", "P09")) return;
        const activeCaseForSuccessor = getActiveCase();
        const failed = (activeCaseForSuccessor.links || []).find(link => link.id === value);
        if (!failed) return setFeedbackOnly("blocked", "后继创建失败", "失败的 LINK 已不可写；请刷新后重试。");
        const successor = { id: `${failed.id}-R${activeCaseForSuccessor.links.length}`, knowledgeItemId: failed.knowledgeItemId, kbVersionId: "KB-207-v4", status: "LINK_OPEN", previousLinkId: failed.id, relId: null };
        activeCaseForSuccessor.links.push(successor);
        activeCaseForSuccessor.status = "CASE_FIXING";
        addAuditAndPersist("创建后继 LINK", successor.id, "成功", "后继修复已创建", `previous_link_id=${failed.id}；原失败证据保持只读。`);
        return;
      case "select-case":
        state.activeCaseId = value === "noLink" ? "noLink" : "main";
        state.feedback = null;
        focusTarget = "page-title";
        save();
        render();
        return;
      case "eval-start":
        if (!authorized("evalRun", "P10")) return;
        if (state.eval.status !== "EVAL_PLANNED") return rejectTransition("评测不能重复开始", "只有 EVAL_PLANNED 可以进入 EVAL_RUNNING。", state.eval.id);
        if (state.source.status !== "SRC_ACTIVE" || state.kb.status === "KB_SOURCE_BLOCKED") return setFeedbackOnly("blocked", "评测仍被阻断", "来源尚未恢复，不能生成通过结论或发布候选。");
        state.eval.status = "EVAL_RUNNING";
        addAuditAndPersist("开始 EVAL", state.eval.id, "成功", "评测已开始", "EVAL_PLANNED→EVAL_RUNNING；结果生成前不得跳到通过、失败或阻塞。");
        return;
      case "eval-pass":
        if (!authorized("evalRun", "P10")) return;
        if (state.eval.status !== "EVAL_RUNNING") return rejectTransition("非法评测跳跃", "EVAL 只能从 EVAL_RUNNING 生成通过结果。", state.eval.id);
        if (state.source.status !== "SRC_ACTIVE" || state.kb.status === "KB_SOURCE_BLOCKED") return setFeedbackOnly("blocked", "评测仍被阻断", "来源尚未恢复，不能生成通过结论或发布候选。");
        state.eval.status = "EVAL_PASSED";
        state.kb.status = "KB_APPROVED_FOR_RELEASE";
        state.rel = {
          ...state.rel,
          id: "REL-211-20261024-01",
          status: "REL_PENDING_APPROVAL",
          previousId: null,
          kbVersionId: state.kb.id,
          evalEvidence: `${state.eval.id} · 通过`
        };
        state.caseItem.links = state.caseItem.links.map(link => link.status === "LINK_OPEN" ? {...link, status:"LINK_PENDING_RELEASE", relId:state.rel.id} : link);
        state.caseItem.status = aggregateCaseStatus(state.caseItem);
        addAuditAndPersist("执行 EVAL", state.eval.id, "成功", "评测通过", `EVAL_PASSED；${state.rel.id} 进入待审批，匹配 LINK 待发布，CASE=${state.caseItem.status}。`);
        return;
      case "eval-fail":
        if (!authorized("evalRun", "P10")) return;
        if (state.eval.status !== "EVAL_RUNNING") return rejectTransition("非法评测跳跃", "EVAL 只能从 EVAL_RUNNING 生成失败结果。", state.eval.id);
        if (state.source.status !== "SRC_ACTIVE" || state.kb.status === "KB_SOURCE_BLOCKED") return setFeedbackOnly("blocked", "评测仍被阻断", "来源尚未恢复，评测不能继续执行。");
        state.eval.status = "EVAL_FAILED";
        state.kb.status = "KB_EVAL_FAILED";
        state.rel.status = "REL_REJECTED";
        state.caseItem.links = state.caseItem.links.map(link => ["LINK_OPEN","LINK_PENDING_RELEASE"].includes(link.status) ? {...link, status:"LINK_FAILED"} : link);
        state.caseItem.status = "CASE_FIXING";
        addAuditAndPersist("执行 EVAL", state.eval.id, "成功", "评测失败", `EVAL_FAILED；KB 只读、REL_REJECTED、LINK_FAILED，CASE=${state.caseItem.status}。`);
        return;
      case "eval-blocked":
        if (!authorized("evalRun", "P10")) return;
        if (state.eval.status !== "EVAL_RUNNING") return rejectTransition("非法评测跳跃", "EVAL 只能从 EVAL_RUNNING 生成阻塞结果。", state.eval.id);
        state.eval.status = "EVAL_BLOCKED";
        state.rel.status = "REL_SUSPENDED";
        state.caseItem.status = "CASE_FIXING";
        addAuditAndPersist("执行 EVAL", state.eval.id, "成功", "评测阻塞", `EVAL_BLOCKED；REL_SUSPENDED，CASE=${state.caseItem.status}，不得发布。`);
        return;
      case "eval-abort":
        if (!authorized("evalRun", "P10")) return;
        if (state.eval.status !== "EVAL_RUNNING") return rejectTransition("当前不能中止评测", "只有 EVAL_RUNNING 可以中止并回到 EVAL_PLANNED。", state.eval.id);
        state.eval.status = "EVAL_PLANNED";
        addAuditAndPersist("中止 EVAL", state.eval.id, "成功", "评测已中止", "EVAL 返回 EVAL_PLANNED，未引入虚拟暂停状态。");
        return;
      case "rel-approve":
        if (!authorized("releaseApprove", "P11")) return;
        if (state.rel.status !== "REL_PENDING_APPROVAL" || state.rel.previousId) return setFeedbackOnly("blocked", "当前 REL 不能直接激活", "只有待审批的新建候选可以激活；回滚候选必须从覆盖入口完成。");
        if (state.source.status !== "SRC_ACTIVE") return setFeedbackOnly("blocked", "发布仍被来源阻断", "来源失效时不得激活新版本。");
        state.rel.status = "REL_ACTIVE";
        state.caseItem.links = state.caseItem.links.map(link => link.relId === state.rel.id && link.status === "LINK_PENDING_RELEASE" ? {...link, status:"LINK_RELEASED"} : link);
        state.caseItem.status = aggregateCaseStatus(state.caseItem);
        addAuditAndPersist("激活 REL", state.rel.id, "成功", "发布已生效", `REL_ACTIVE；匹配 LINK 已释放；CASE 聚合为 ${STATUS[state.caseItem.status][0]}。`);
        return;
      case "rel-reject":
        if (!authorized("releaseReject", "P11")) return;
        if (state.rel.status !== "REL_PENDING_APPROVAL" || state.rel.previousId) return setFeedbackOnly("blocked", "当前 REL 不能拒绝", "只有待审批的新建候选可以拒绝。");
        state.rel.status = "REL_REJECTED";
        state.caseItem.links = state.caseItem.links.map(link => link.relId === state.rel.id && link.status === "LINK_PENDING_RELEASE" ? {...link, status:"LINK_FAILED"} : link);
        state.caseItem.status = "CASE_FIXING";
        addAuditAndPersist("拒绝 REL", state.rel.id, "成功", "发布已拒绝", "待发布 LINK 转为失败，CASE 回到修复；没有残留待发布状态。");
        return;
      case "rel-suspend":
        if (!authorized("releaseSuspend", "P11")) return;
        if (state.rel.status !== "REL_ACTIVE") return setFeedbackOnly("blocked", "当前 REL 不能停用", "只有已生效版本可以停用。");
        state.rel.status = "REL_SUSPENDED";
        addAuditAndPersist("停用 REL", state.rel.id, "成功", "发布已停用", "立即停止新引用；回滚必须创建新候选。");
        return;
      case "rollback-create":
        if (!authorized("rollbackCreate", "P11")) return;
        if (state.rel.status !== "REL_SUSPENDED") return setFeedbackOnly("blocked", "无法创建回滚候选", "请先停用当前 REL。");
        state.rel = {
          id: "REL-104-20261023-02",
          status: "REL_PENDING_APPROVAL",
          previousId: state.rel.id,
          kbVersionId: state.rel.kbVersionId,
          evalEvidence: state.rel.evalEvidence
        };
        addAuditAndPersist("创建回滚候选", state.rel.id, "成功", "回滚候选已创建", `新候选复制 ${state.rel.previousId} 的历史内容，仍需重新审批。`);
        return;
      case "rollback-approve":
        if (!authorized("rollbackApprove", "P11")) return;
        if (!state.rel.previousId || state.rel.status !== "REL_PENDING_APPROVAL") return setFeedbackOnly("blocked", "没有可激活的回滚候选", "先由知识运营创建新的回滚候选，并保持待审批状态。");
        if (state.source.status !== "SRC_ACTIVE") return setFeedbackOnly("blocked", "发布仍被来源阻断", "来源失效时不得激活回滚候选。");
        state.rel.status = "REL_ACTIVE";
        state.caseItem.status = "CASE_REOPENED";
        state.caseItem.links.push({ id: `CLINK-031-ROLLBACK-${state.caseItem.links.length}`, knowledgeItemId: "KI-104", kbVersionId: "KB-104-v1", status: "LINK_OPEN", previousLinkId: state.caseItem.links[0]?.id || null, relId: null });
        addAuditAndPersist("激活回滚候选", state.rel.id, "成功", "回滚已生效", "历史 LINK 保持只读；已创建后继 LINK，CASE 重新打开。");
        return;
      case "no-fix-supervisor":
        if (!authorized("noFixSupervisor", "P09")) return;
        state.noLinkCase.supervisorApproved = true;
        if (state.noLinkCase.businessApproved) state.noLinkCase.status = "CASE_CLOSED";
        addAuditAndPersist("无 LINK 关闭主管批准", state.noLinkCase.id, "成功", "主管批准已记录", state.noLinkCase.businessApproved ? "主管与业务批准齐全，CASE 可关闭。" : "等待业务/渠道负责人独立批准。");
        return;
      case "no-fix-business":
        if (!authorized("noFixBusiness", "P09")) return;
        state.noLinkCase.businessApproved = true;
        if (state.noLinkCase.supervisorApproved) state.noLinkCase.status = "CASE_CLOSED";
        addAuditAndPersist("无 LINK 关闭业务批准", state.noLinkCase.id, "成功", "业务批准已记录", state.noLinkCase.supervisorApproved ? "主管与业务批准齐全，CASE 可关闭。" : "等待主管独立批准。");
        return;
      case "handoff-task":
        if (!["frontline","aftersales","supervisor"].includes(state.role)) return setFeedbackOnly("blocked", "无转交权限", "当前角色不能转交咨询任务。");
        state.asq.status = "ASQ_HANDOFF_PENDING";
        addAuditAndPersist("转交咨询任务", state.asq.id, "成功", "任务已转交", "等待售后专员接收。");
        return;
      case "approve-kb":
        if (state.role !== "business") return setFeedbackOnly("blocked", "业务批准失败", "只有业务/渠道负责人可以批准政策口径。");
        if (state.reviewKb.status !== "KB_BUSINESS_REVIEW") return setFeedbackOnly("blocked", "当前知识版本不能批准", "只有业务审核中的版本可以批准；来源阻断或已冻结版本不得回写。");
        state.reviewKb.status = "KB_APPROVED_FOR_RELEASE";
        addAuditAndPersist("批准知识口径", state.reviewKb.id, "成功", "业务口径已批准", "该知识版本内容已冻结，并进入评测资格阶段。");
        return;
      case "attempt-self-approval":
        feedback("blocked", "自审自批已拦截", "提交人不能批准自己提交的业务口径，对象状态未变化。");
        addAudit("自审自批拦截", state.reviewKb.id, "拒绝");
        focusTarget = "action-feedback";
        save();
        render();
        return;
      case "attempt-admin-release":
        feedback("blocked", "管理员发布已拦截", "系统管理员只能处理技术角色与运行配置，不能批准或激活发布。");
        addAudit("管理员发布拦截", state.rel.id, "拒绝");
        focusTarget = "action-feedback";
        save();
        render();
        return;
      case "attempt-r3-overreach":
        feedback("blocked", "R3 越权关闭已拦截", "只有法务/安全责任人可以关闭 R3；风险单保持原状态。");
        addAudit("R3 越权关闭拦截", state.risk.id, "拒绝");
        focusTarget = "action-feedback";
        save();
        render();
        return;
      case "go-audit":
        setPage("P13");
        return;
      default:
        setFeedbackOnly("info", "演示操作未绑定", `动作 ${action} 尚未绑定，请使用演示脚本。`);
    }
  }

  document.addEventListener("click", event => {
    const go = event.target.closest("[data-go]");
    if (go) {
      setPage(go.dataset.go);
      return;
    }
    const action = event.target.closest("[data-action]");
    if (!action) return;
    if (action.dataset.action === "send-advice") return;
    handleAction(action.dataset.action, action.dataset.value || "");
  });

  document.addEventListener("submit", event => {
    if (event.target.id === "p03-real-rag-form") {
      event.preventDefault();
      void submitRealRag(event.target);
      return;
    }
    if (event.target.id === "dataset-ingestion-form") {
      event.preventDefault();
      void startDatasetIngestion(event.target);
      return;
    }
    if (event.target.id === "real-evaluation-form") {
      event.preventDefault();
      void startRealEvaluation(event.target);
      return;
    }
    if (event.target.id === "source-registration-form") {
      event.preventDefault();
      if (!authorized("registerSource", "P06")) return;
      const data = new FormData(event.target);
      state.source = {
        ...state.source,
        title: String(data.get("title") || "").trim(),
        locator: String(data.get("locator") || "").trim(),
        organization: String(data.get("organization") || "").trim(),
        scope: String(data.get("scope") || "").trim(),
        validUntil: String(data.get("validUntil") || ""),
        owner: String(data.get("owner") || "").trim(),
        verifiedAt: String(data.get("verifiedAt") || ""),
        accessible: data.get("accessible") === "on",
        titleVerified: data.get("titleVerified") === "on",
        status: "SRC_REGISTERED",
        formOpen: false
      };
      addAuditAndPersist("登记知识来源", state.source.id, "成功", "来源已登记", "来源信息已保存为 SRC_REGISTERED；五项条件满足后才能尝试激活。");
      return;
    }
    if (event.target.id === "member-role-form") {
      event.preventDefault();
      if (!authorized("changeMemberRole", "P12")) return;
      const data = new FormData(event.target);
      const member = state.members.find(item => item.id === data.get("memberId"));
      const targetRole = String(data.get("targetRole") || "");
      if (!member || !ROLES[targetRole]) return rejectTransition("角色变更失败", "成员或目标角色不存在。", "PERMISSION_REQUEST");
      if (member.name === ROLES.admin.user) return rejectTransition("不能修改当前管理员角色", "当前登录管理员不能给自己降级或提权，需由其他管理员复核。", member.id);
      const previousRole = member.role;
      member.role = targetRole;
      member.scope = `${ROLES[targetRole].label} · 由管理员配置`;
      addAuditAndPersist("变更成员角色", member.id, "成功", "权限变更已生效", `${member.name} 的活动角色由 ${ROLES[previousRole].label} 变更为 ${ROLES[targetRole].label}；已写入审计。`);
    }
  });

  document.addEventListener("change", event => {
    if (event.target.id === "role-switch") {
      state.role = event.target.value;
      state.viewMode = "default";
      const defaultPage = ROLES[state.role].defaultPage;
      if (!canAccess(state.role, state.page)) state.page = defaultPage;
      focusTarget = "page-title";
      save();
      render();
    } else if (event.target.id === "page-jump") {
      setPage(event.target.value);
    } else if (event.target.id === "view-mode") {
      state.viewMode = event.target.value;
      focusTarget = "page-title";
      save();
      render();
    } else if (event.target.id === "mode-switch") {
      state.mode = event.target.value === "show" ? "show" : "review";
      state.demoOpen = false;
      state.viewMode = "default";
      focusTarget = "page-title";
      save();
      render();
    } else if (event.target.id === "promise-risk") {
      state.asq.promiseRisk = event.target.checked;
      feedback("info", "演示文案已更新", state.asq.promiseRisk ? "建议包含越权承诺，下一次发送会被阻断。" : "越权承诺已移除。", "P03");
      focusTarget = "action-feedback";
      save();
      render();
    } else if (event.target.id === "p03-source-mode") {
      state.realRag.enabled = event.target.value === "real";
      state.feedback = null;
      focusTarget = state.realRag.enabled ? "real-rag-result-title" : "page-title";
      save();
      render();
    }
  });

  document.addEventListener("change", event => {
    if (event.target.id === "role-switch") return;
  });

  window.addEventListener("hashchange", () => {
    const page = location.hash.replace("#", "");
    if (PAGES[page] && page !== state.page) {
      state.page = page;
      state.feedback = null;
      focusTarget = "page-title";
      save();
      render();
    }
  });

  // The main task page uses a delegated handler because the preview shell rerenders.
  document.addEventListener("click", event => {
    const send = event.target.closest("[data-action='send-advice']");
    if (send) handleAction("send-advice");
  });

  window.__stage3bTest = {
    dispatch(action, value = "") {
      handleAction(action, value);
    },
    readState() {
      return JSON.parse(localStorage.getItem(STORAGE_KEY));
    }
  };

  const initialHash = location.hash.replace("#", "");
  if (PAGES[initialHash]) state.page = initialHash;
  if (!canAccess(state.role, state.page)) state.page = ROLES[state.role].defaultPage;
  render();
  if (state.dataset.job && !["DOCUMENT_READY","DOCUMENT_FAILED"].includes(state.dataset.job.document_status)) {
    scheduleIngestionPoll();
  }
  if (state.realEvaluation.run && ["QUEUED","RUNNING"].includes(state.realEvaluation.run.status)) {
    scheduleEvaluationPoll();
  }
})();
