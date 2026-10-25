# 真实 RAG 实验账号与配置待办

日期：2026-10-24
当前结论：没有真实 API 凭据，真实提供方实验不得声称完成。

## 方案 1：Dify 云端测试空间（推荐先办）

- [x] 创建单租户测试工作区，不启用生产多租户；
- [x] 导入 CANDIDATE 数据集；
- [x] 配置 Embedding 模型；
- [x] 配置生成模型；
- [x] 创建 Knowledge Base；
- [x] 创建用于检索与带引用问答的 App；
- [x] 提供 `RAG_BASE_URL`；
- [x] 在服务端配置 `RAG_API_KEY`；
- [x] 记录 Knowledge Base ID 和 App ID；
- [x] 确认不会把 Key 发给浏览器；
- [x] 运行 `scripts/preflight-check.mjs` 后再启动实验；
- [x] 补齐 TEST 知识库与过期/冲突/权限专项；
- [x] 完成真实 BASE、HYBRID、RERANK 实验。

## 方案 2：FastGPT 云端或自主部署

- [ ] 创建单租户团队/测试空间；
- [ ] 创建 TEST 与 CANDIDATE 知识库；
- [ ] 配置 Embedding、检索与生成模型；
- [ ] 确认混合检索和 Rerank 当前版本可用；
- [ ] 提供 OpenAPI Base URL；
- [ ] 在服务端配置 API Key；
- [ ] 记录团队 ID、知识库/数据集 ID；
- [ ] 验证 API 返回中可映射 doc/chunk/score/metadata；
- [ ] 不把供应商 Base URL 或 Key 写入前端。

## 方案 3：本地开源部署

- [ ] 安装并启用 Docker Engine + Compose；
- [ ] 若使用 WSL，完成发行版安装和资源分配；
- [ ] 至少准备可运行 FastGPT 或 Dify 的数据库与向量依赖；
- [ ] 配置本地模型或允许的远程模型凭据；
- [ ] 明确不将 `.env` 或数据卷提交到 Git。

## 凭据接收方式

只通过服务端环境变量或当前会话受控的密钥配置提供。不要把 Key 粘贴到 Markdown、HTML、JS、截图或普通聊天消息中。缺少凭据时，真实实验保持 `NOT_RUN`。
