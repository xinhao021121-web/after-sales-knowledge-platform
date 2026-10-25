(function () {
  const direction = document.body.dataset.direction;
  const storageKey = "stage3b-preview-state-v1";
  const previewPages = ["P01", "P03", "P05", "P09"];

  const roles = {
    frontline: {
      label: "一线客服",
      defaultPage: "P01",
      nav: [["P01", "今日"], ["P03", "售后任务"], ["P05", "风险队列"], ["P09", "案例只读"]],
      canEditCtx: true,
      canSendAdv: true,
      canCloseR3: false
    },
    aftersales: {
      label: "售后专员",
      defaultPage: "P03",
      nav: [["P01", "今日"], ["P03", "售后任务"], ["P05", "风险队列"], ["P09", "案例只读"]],
      canEditCtx: true,
      canSendAdv: true,
      canCloseR3: false
    },
    supervisor: {
      label: "客服主管",
      defaultPage: "P05",
      nav: [["P01", "今日"], ["P03", "任务确认"], ["P05", "风险处置"], ["P09", "案例质量"], [null, "发布与回滚"]],
      canEditCtx: false,
      canSendAdv: true,
      canCloseR3: false
    },
    business: {
      label: "业务/渠道负责人",
      defaultPage: "P09",
      nav: [[null, "待审口径"], [null, "发布审批"], ["P09", "案例影响"], [null, "范围内审计"]],
      canEditCtx: false,
      canSendAdv: false,
      canCloseR3: false
    },
    knowledge: {
      label: "知识运营",
      defaultPage: "P09",
      nav: [["P01", "今日"], ["P03", "任务只读"], ["P05", "风险影响"], ["P09", "案例与链路"], [null, "知识来源"], [null, "评测中心"]],
      canEditCtx: false,
      canSendAdv: false,
      canCloseR3: false
    },
    evaluation: {
      label: "AI 评测人员",
      defaultPage: "P09",
      nav: [[null, "评测中心"], ["P09", "案例只读"], [null, "发布证据"]],
      canEditCtx: false,
      canSendAdv: false,
      canCloseR3: false
    },
    legal: {
      label: "法务/安全责任人",
      defaultPage: "P05",
      nav: [["P01", "今日"], ["P05", "R3 风险"], ["P09", "案例证据"], [null, "来源证据"], [null, "范围审计"]],
      canEditCtx: false,
      canSendAdv: false,
      canCloseR3: true
    },
    admin: {
      label: "系统管理员",
      defaultPage: "P01",
      nav: [["P01", "今日"], [null, "权限与职责"], [null, "审计与运行"], [null, "集成状态"]],
      canEditCtx: false,
      canSendAdv: false,
      canCloseR3: false
    }
  };

  function readState() {
    let persisted = {};
    try {
      persisted = JSON.parse(localStorage.getItem(storageKey) || "{}");
    } catch (_) {
      persisted = {};
    }
    if (!persisted.role || !roles[persisted.role]) persisted.role = "frontline";
    if (!persisted.pages) persisted.pages = {};
    if (!persisted.actions) persisted.actions = {};
    if (!persisted.actions.A) persisted.actions.A = {};
    if (!persisted.actions.B) persisted.actions.B = {};
    return persisted;
  }

  let state = readState();
  const hashPage = location.hash.replace("#", "");
  if (previewPages.includes(hashPage)) {
    state.pages[direction] = hashPage;
  }
  if (!previewPages.includes(state.pages[direction])) {
    state.pages[direction] = roles[state.role].defaultPage;
  }

  function saveState() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (_) {
      // The preview remains usable when localStorage is unavailable.
    }
  }

  function currentPage() {
    return previewPages.includes(state.pages[direction]) ? state.pages[direction] : "P01";
  }

  function announce(message) {
    const live = document.getElementById("live-status");
    if (live) live.textContent = message;
  }

  function setPage(page) {
    if (!previewPages.includes(page)) return;
    state.pages[direction] = page;
    saveState();
    history.replaceState(null, "", `#${page}`);
    render();
    document.getElementById("page-title")?.focus();
  }

  function navMarkup(role) {
    return roles[role].nav.map(([page, label]) => {
      if (page) {
        const active = currentPage() === page ? " is-active" : "";
        const current = currentPage() === page ? ' aria-current="page"' : "";
        return `<button class="nav-item${active}" type="button" data-route="${page}"${current}><span>${label}</span><small>${page}</small></button>`;
      }
      return `<button class="nav-item is-disabled" type="button" disabled><span>${label}</span><small>完整版</small></button>`;
    }).join("");
  }

  function shellMarkup() {
    const role = roles[state.role];
    return `
      <a class="skip-link" href="#page-title">跳到主内容</a>
      <header class="product-bar">
        <div class="brand-lockup">
          <span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span>
          <div>
            <strong>售后知识协作</strong>
            <span>模拟企业环境 · 非 Apple 项目</span>
          </div>
        </div>
        <div class="product-context">
          <span class="environment">演示环境</span>
          <button class="icon-button" type="button" aria-label="通知，3 项待处理">通知 <b>3</b></button>
          <div class="identity"><span>${role.label}</span><span class="avatar" aria-hidden="true">${role.label.slice(0, 1)}</span></div>
        </div>
      </header>
      <div class="preview-toolbar" role="region" aria-label="视觉方向预览控制">
        <div class="preview-label">
          <span>视觉方向 ${direction}</span>
          <small>仅用于方向评审，不是完整原型</small>
        </div>
        <div class="preview-tabs" aria-label="预览页面">
          ${previewPages.map(page => `<button type="button" data-preview-page="${page}" class="${currentPage() === page ? "is-active" : ""}">${page}</button>`).join("")}
        </div>
        <label class="role-switcher">以角色查看
          <select id="role-switch">
            ${Object.entries(roles).map(([key, value]) => `<option value="${key}" ${key === state.role ? "selected" : ""}>${value.label}</option>`).join("")}
          </select>
        </label>
        <button id="reset-preview" class="quiet-button" type="button">重置演示状态</button>
      </div>
      <div class="application-frame">
        <aside class="side-nav" aria-label="${role.label}的一级导航">
          <div class="nav-heading">
            <span class="eyebrow">当前工作面</span>
            <strong>${role.label}</strong>
          </div>
          <nav>${navMarkup(state.role)}</nav>
          <div class="nav-foot">
            <span>范围</span>
            <strong>中国大陆 · 模拟售后</strong>
          </div>
        </aside>
        <main id="page-root" class="page-root" tabindex="-1"></main>
      </div>
      <div id="live-status" class="sr-only" role="status" aria-live="polite"></div>
      <footer class="preview-footer">阶段 3B 视觉方向预览 · 状态保存在 localStorage · 页面内容为模拟数据</footer>
    `;
  }

  function pageHeader(title, subtitle, status, actions = "") {
    return `
      <header class="page-heading">
        <div>
          <p class="breadcrumb">售后知识协作 / ${title}</p>
          <h1 id="page-title" tabindex="-1">${title}</h1>
          <p class="page-summary">${subtitle}</p>
        </div>
        <div class="heading-actions">
          <span class="status-badge status-neutral">${status}</span>
          ${actions}
        </div>
      </header>
    `;
  }

  function pageHome(role) {
    return `
      ${pageHeader("今日工作台", `${roles[state.role].label}视图。先处理风险与阻塞，再进入普通售后。`, "2026-10-23 · 09:40")}
      <section class="priority-band" aria-labelledby="risk-heading">
        <div class="priority-copy">
          <span class="eyebrow">最高优先级</span>
          <h2 id="risk-heading">R3 风险：设备鼓包后仍在充电</h2>
          <p>ASQ-2026-1048 · 模拟客户 A · 已暂停普通售后建议</p>
        </div>
        <button class="primary-button" type="button" data-goto="P05">进入风险处置</button>
      </section>
      <div class="metric-grid">
        <article class="metric"><span>待补上下文</span><strong>06</strong><small>其中 2 项阻塞建议</small></article>
        <article class="metric"><span>R2 / R3</span><strong>03</strong><small>1 项等待安全确认</small></article>
        <article class="metric"><span>待发布</span><strong>02</strong><small>均已通过评测</small></article>
        <article class="metric"><span>问题案例</span><strong>05</strong><small>3 个修复链路进行中</small></article>
      </div>
      <div class="content-split">
        <section class="panel">
          <div class="panel-heading"><h2>优先处理</h2><button class="text-button" type="button" data-goto="P03">查看全部</button></div>
          <div class="task-list">
            <button class="task-row" type="button" data-goto="P05"><span class="task-token risk">R3</span><span><strong>充电盒异常发热</strong><small>ASQ-2026-1048 · 需要安全责任人</small></span><span class="row-time">2 分钟</span></button>
            <button class="task-row" type="button" data-goto="P03"><span class="task-token">ASQ</span><span><strong>电池续航明显下降</strong><small>ASQ-2026-1043 · 待补检测结果</small></span><span class="row-time">18 分钟</span></button>
            <button class="task-row" type="button" data-goto="P09"><span class="task-token">CASE</span><span><strong>渠道结论冲突</strong><small>CASE-2026-031 · 2/3 LINK 已处理</small></span><span class="row-time">1 小时</span></button>
          </div>
        </section>
        <aside class="panel insight-panel">
          <span class="eyebrow">今日判断</span>
          <h2>${role === "supervisor" ? "风险与发布优先" : role === "legal" ? "先停止危险动作" : "先补齐判断条件"}</h2>
          <p>${role === "supervisor" ? "R3 未关闭前，发布审批不进入可执行状态。" : role === "legal" ? "安全风险优先于保修和退换结论。" : "缺失字段和来源版本必须与建议同时出现。"}</p>
          <div class="inline-note"><strong>系统边界</strong><span>不自动退款、赔偿、保修或法律判断</span></div>
        </aside>
      </div>
    `;
  }

  function pageTask(role) {
    const canSend = roles[state.role].canSendAdv;
    const canEdit = roles[state.role].canEditCtx;
    const adviceSent = Boolean(state.actions[direction].adviceSent);
    return `
      ${pageHeader("售后协作任务", "ASQ-2026-1043 · 电池续航下降与服务判断", "ADVICE_PENDING", `<button class="quiet-button" type="button">转交任务</button>`)}
      <div class="task-context-strip">
        <div><span>客户</span><strong>模拟客户 B</strong></div>
        <div><span>产品</span><strong>AirPods Pro 3</strong></div>
        <div><span>渠道</span><strong>官方线上</strong></div>
        <div><span>CTX</span><strong>v3 · C2</strong></div>
        <div class="attention"><span>风险</span><strong>暂无 R2/R3</strong></div>
      </div>
      <div class="content-split task-layout">
        <div class="stack">
          <section class="panel">
            <div class="panel-heading"><h2>上下文与必需追问</h2><span class="status-badge status-neutral">1 项待补</span></div>
            <div class="field-grid">
              <div class="read-field"><span>购买日期</span><strong>2026-03-12</strong></div>
              <div class="read-field"><span>当前续航</span><strong>约 2.5 小时</strong></div>
              <div class="read-field attention"><span>电池检测</span><strong>未提供</strong></div>
              <div class="read-field"><span>保障状态</span><strong>需结合合同核实</strong></div>
            </div>
            <div class="inline-note"><strong>${canEdit ? "可补充" : "只读"}</strong><span>${canEdit ? "客服与售后可创建新 CTX 版本。" : "主管可查看上下文，但不能编辑；可发起售后修正请求。"}</span></div>
          </section>
          <section class="panel">
            <div class="panel-heading"><h2>证据与条件</h2><span class="status-badge status-neutral">EVD-02</span></div>
            <article class="evidence-card">
              <div><span class="source-label">官方服务资料 · SRC-014 v4</span><h3>电池续航下降需结合检测与保障范围</h3><p>适用：产品故障、保障有效、检测结果明确。例外：进液、跌落、非授权维修。</p></div>
              <span class="validity">有效至 2026-12-31</span>
            </article>
            <div class="condition-row"><span class="condition complete">已满足</span><span>购买凭证</span><span class="condition incomplete">未满足</span><span>电池检测结果</span></div>
          </section>
          <section class="panel advice-panel">
            <span class="eyebrow">待确认建议</span>
            <h2>可建议预约检测，不承诺免费维修</h2>
            <ol class="action-list"><li>说明续航异常可能存在多方面原因</li><li>邀请客户完成官方检测</li><li>根据检测和保障状态确认费用</li></ol>
            <div class="guard-note"><strong>承诺边界</strong><span>当前证据不足以承诺免费维修或换新。</span></div>
            <button id="send-advice" class="primary-button" type="button" ${canSend && !adviceSent ? "" : "disabled"}>${adviceSent ? "已发送，待客户反馈" : canSend ? "确认并发送建议" : "当前角色无发送权限"}</button>
            <div id="advice-feedback" class="inline-result success" ${adviceSent ? "" : "hidden"}><strong>建议已发送</strong><span>ADV-v2 已绑定 CTX-v3 与 EVD-02，状态更新为 ASQ_RESPONDED。</span></div>
          </section>
        </div>
        <aside class="stack">
          <section class="panel compact-panel"><span class="eyebrow">责任与状态</span><h2>${roles[state.role].label}</h2><p>${state.role === "supervisor" ? "可确认发送，CTX 只读。" : canSend ? "可编辑上下文并确认发送。" : "当前角色只读。"}</p></section>
          <section class="panel compact-panel"><span class="eyebrow">最近事件</span><div class="mini-timeline"><p><strong>09:32</strong> 客户补充续航数据</p><p><strong>09:34</strong> 证据匹配完成</p><p><strong>09:36</strong> ADV v2 生成</p></div></section>
          <section class="panel compact-panel"><span class="eyebrow">隐私</span><p>仅显示最少必要字段；序列号与联系方式默认脱敏。</p></section>
        </aside>
      </div>
    `;
  }

  function pageRisk(role) {
    const canClose = roles[state.role].canCloseR3;
    const stopSent = Boolean(state.actions[direction].riskStopSent);
    return `
      ${pageHeader("风险升级单", "ESC-2026-0217 · R3 · 充电盒鼓包且继续充电", "MITIGATING", `<button class="quiet-button" type="button">查看审计</button>`)}
      <section class="risk-banner">
        <div>
          <span class="risk-label">R3 立即止损</span>
          <h2>停止使用并断开充电，不要按压或拆机</h2>
          <p>已通知客户模拟人员 A；等待安全责任人确认处置。</p>
        </div>
        <button id="risk-stop" class="primary-button danger-outline" type="button" ${stopSent ? "disabled" : ""}>${stopSent ? "止损已发送" : "发送止损指令"}</button>
      </section>
      <div id="risk-feedback" class="inline-result risk-inline" ${stopSent ? "" : "hidden"}><strong>止损指令已发送</strong><span>风险仍为 R3，等待客户反馈与安全责任人处置，不会自动关闭。</span></div>
      <div class="risk-grid">
        <section class="panel">
          <div class="panel-heading"><h2>风险事实</h2><span class="status-badge status-risk">R3</span></div>
          <dl class="fact-list">
            <div><dt>商品状态</dt><dd>充电盒外壳鼓起</dd></div>
            <div><dt>当前动作</dt><dd>仍在有线充电</dd></div>
            <div><dt>伴随信号</dt><dd>轻微发热，无明火与人员伤害</dd></div>
            <div><dt>paused_from_state</dt><dd>ASQ_ASSESSING</dd></div>
            <div><dt>previous_esc_id</dt><dd>无</dd></div>
          </dl>
        </section>
        <section class="panel">
          <div class="panel-heading"><h2>升级路径</h2><span class="status-badge status-neutral">2 项待办</span></div>
          <ol class="timeline">
            <li class="done"><strong>09:38 风险候选</strong><span>普通建议已暂停</span></li>
            <li class="done"><strong>09:39 确认 R3</strong><span>安全规则命中</span></li>
            <li class="current"><strong>现在 · 止损与转交</strong><span>等待客户反馈和安全责任人</span></li>
            <li><strong>后续 · 监控与关闭</strong><span>${canClose ? "你可确认关闭并记录依据" : "需要法务/安全责任人确认关闭"}</span></li>
          </ol>
          <button class="quiet-button" type="button" ${canClose ? "" : "disabled"}>${canClose ? "进入关闭确认" : "关闭需安全责任人"}</button>
        </section>
      </div>
      <section class="panel">
        <div class="panel-heading"><h2>复发单独留痕</h2><span class="status-badge status-neutral">previous_esc_id</span></div>
        <p>若该风险关闭后再次出现，将创建新 ESC，并关联本单；不修改当前终态。</p>
      </section>
    `;
  }

  function pageCase(role) {
    return `
      ${pageHeader("案例与修复链路", "CASE-2026-031 · 渠道结论冲突与知识修复", "CASE_FIXING", `<button class="quiet-button" type="button">查看审计</button>`)}
      <div class="case-summary">
        <div><span>责任人</span><strong>模拟知识运营 A</strong></div>
        <div><span>关联知识条目</span><strong>3 个</strong></div>
        <div><span>活动 LINK</span><strong>1 条</strong></div>
        <div><span>关闭门禁</span><strong class="blocked-text">未满足</strong></div>
      </div>
      <div class="content-split case-layout">
        <section class="panel">
          <div class="panel-heading"><h2>CASE_LINK 轨道</h2><span class="status-badge status-neutral">0 / 1 / N 视图</span></div>
          <div class="link-track released">
            <div class="link-status">LINK_RELEASED</div>
            <div><strong>KB-104 v2 · 授权维修口径</strong><span>REL-104-1018 · 历史证据只读</span></div>
            <button class="text-button" type="button">查看</button>
          </div>
          <div class="link-track open">
            <div class="link-status">LINK_OPEN</div>
            <div><strong>KB-211 v1 · 渠道责任边界</strong><span>previous_link_id: CLINK-...-103</span></div>
            <button class="text-button" type="button" data-goto="P03">打开修复</button>
          </div>
          <div class="link-track failed">
            <div class="link-status">LINK_FAILED</div>
            <div><strong>KB-207 v3 · 退款例外条件</strong><span>EVAL-2026-0412 · 证据缺失</span></div>
            <button class="text-button" type="button">创建后继</button>
          </div>
          <div class="close-gate">
            <span class="gate-icon" aria-hidden="true">!</span>
            <div><strong>当前不可关闭 CASE</strong><p>仍有 1 条活动 LINK，且 KB-207 最新 LINK 为 FAILED。完成后继修复或明确弃置后再计算关闭。</p></div>
          </div>
        </section>
        <aside class="stack">
          <section class="panel compact-panel"><span class="eyebrow">聚合状态</span><h2>CASE_FIXING</h2><p>3 个知识条目中 1 个已发布，1 个修复中，1 个失败。</p></section>
          <section class="panel compact-panel"><span class="eyebrow">下一步</span><div class="next-action-list"><button type="button">继续 KB-211 回归</button><button type="button">处理 KB-207 失败</button><button type="button" disabled>关闭 CASE</button></div></section>
          <section class="panel compact-panel"><span class="eyebrow">批准边界</span><p>明确弃置需要主管和业务/渠道负责人独立批准。</p></section>
        </aside>
      </div>
    `;
  }

  function pageMarkup() {
    const page = currentPage();
    if (page === "P01") return pageHome(state.role);
    if (page === "P03") return pageTask(state.role);
    if (page === "P05") return pageRisk(state.role);
    return pageCase(state.role);
  }

  function render() {
    document.body.innerHTML = shellMarkup();
    document.getElementById("page-root").innerHTML = pageMarkup();
    document.getElementById("role-switch").addEventListener("change", event => {
      state.role = event.target.value;
      const candidate = roles[state.role].defaultPage;
      state.pages[direction] = previewPages.includes(candidate) ? candidate : "P01";
      saveState();
      history.replaceState(null, "", `#${state.pages[direction]}`);
      render();
    });
    document.getElementById("reset-preview").addEventListener("click", () => {
      state = { role: "frontline", pages: { A: "P01", B: "P01" }, actions: { A: {}, B: {} } };
      saveState();
      history.replaceState(null, "", "#P01");
      render();
    });
    document.querySelectorAll("[data-preview-page]").forEach(button => {
      button.addEventListener("click", () => setPage(button.dataset.previewPage));
    });
    document.querySelectorAll("[data-route]").forEach(button => {
      button.addEventListener("click", () => setPage(button.dataset.route));
    });
    document.querySelectorAll("[data-goto]").forEach(button => {
      button.addEventListener("click", () => setPage(button.dataset.goto));
    });
    const send = document.getElementById("send-advice");
    if (send) {
      send.addEventListener("click", () => {
        const feedback = document.getElementById("advice-feedback");
        feedback.hidden = false;
        feedback.className = "inline-result success";
        feedback.innerHTML = "<strong>建议已发送</strong><span>ADV-v2 已绑定 CTX-v3 与 EVD-02，状态更新为 ASQ_RESPONDED。</span>";
        send.disabled = true;
        send.textContent = "已发送，待客户反馈";
        state.actions[direction].adviceSent = true;
        saveState();
        announce("建议已发送，任务状态更新为已答复。");
      });
    }
    const stop = document.getElementById("risk-stop");
    if (stop) {
      stop.addEventListener("click", () => {
        const feedback = document.getElementById("risk-feedback");
        feedback.hidden = false;
        feedback.className = "inline-result risk-inline";
        feedback.innerHTML = "<strong>止损指令已发送</strong><span>风险仍为 R3，等待客户反馈与安全责任人处置，不会自动关闭。</span>";
        stop.disabled = true;
        stop.textContent = "止损已发送";
        state.actions[direction].riskStopSent = true;
        saveState();
        announce("止损指令已发送，风险仍保持 R3。");
      });
    }
  }

  window.addEventListener("hashchange", () => {
    const page = location.hash.replace("#", "");
    if (previewPages.includes(page)) {
      state.pages[direction] = page;
      saveState();
      render();
    }
  });

  render();
})();
