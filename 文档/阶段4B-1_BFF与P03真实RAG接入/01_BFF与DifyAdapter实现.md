# BFF 与 Dify Adapter 实现

## 1. 目录

完整 BFF 实现在 `server/`：

- `config.mjs`：读取服务端环境变量；
- `policy.mjs`：角色、输入、敏感字段和 P0 安全门禁；
- `dify-adapter.mjs`：Dify 健康检查、检索元数据和带引用问答；
- `normalize.mjs`：引用映射、权限/过期/冲突/无答案归一化；
- `store.mjs`：幂等持久化与脱敏审计；
- `app.mjs`：本地 HTTP 服务、CORS、API 与静态原型托管；
- `start.mjs`：服务启动入口。

阶段 3B 原型中的 `server/index.mjs` 是当前项目目录的启动入口，加载上述实现并托管现有 13 页原型。

## 2. 请求链

```text
浏览器 P03
  → localhost BFF /api/answers
  → 角色、租户、环境、输入、敏感字段校验
  → BFF P0 安全门禁
  → Dify Adapter /chat-messages
  → 引用与质量门禁
  → 归一化响应
  → P03 页面内结果
```

P0 命中时在第四步直接返回 `BLOCKED_SAFETY`，不进入 Dify Adapter。`/api/retrieval/search` 从 Dify Advanced Chat 的真实 `retriever_resources` 中提取检索元数据；当前 App API Key 无权调用独立 Dataset API，因此不声称该接口是纯检索 Provider 调用。

## 3. 固定配置

- Top K：3；
- 检索模式：`hybrid`；
- Rerank：启用；
- Citation：`required`；
- 模型：服务端 `RAG_GENERATION_MODEL`，当前为 `deepseek-v4-pro`；
- 环境：`candidate`。

模型名不写在 HTML、前端 JavaScript 或业务状态中。
