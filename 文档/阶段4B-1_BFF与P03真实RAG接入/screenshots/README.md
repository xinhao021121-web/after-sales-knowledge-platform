# 截图

- `P03_REAL_RAG_1440.png`：P03 真实 Pro `ANSWERED`，ASQ 状态独立显示，正文型 claim 引用可追溯；
- `P03_REAL_RAG_320.png`：同一真实结果在 320px 下的布局；
- `P03_P0_SAFETY_1440.png`：P0 由 BFF 前置阻断，普通 ADV 不展示；
- `P03_P0_SAFETY_320.png`：P0 安全结果与确认止损动作的窄屏布局。

截图由 `tests/e2e-bff.mjs` 在真实 BFF/Dify 请求后生成。窄屏测试同时检查页面无横向溢出。

Dify 配置证据：

- `DIFY_CONFIG_PROMPT_PRO_V12.png`：Pro、正文证据 Prompt、CANDIDATE 和检索配置；
- `DIFY_VERSION_V12.png`：发布版本 `#12`；
- `DIFY_VERSION_HISTORY.png`：历史 Flash 配置仍保留。
