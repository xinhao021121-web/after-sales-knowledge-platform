# RAG 适配接口契约

版本：1.0.0
契约文件：[rag-adapter.openapi.json](contracts/rag-adapter.openapi.json)

## 1. 边界

```text
浏览器 / 客服工作台
        ↓ 仅调用企业 BFF，携带用户会话
企业 BFF / RAG Adapter
        ↓ 使用服务端供应商密钥
FastGPT / Dify / RAGFlow
```

- 前端不得直接访问提供方 API，不得包含供应商 API Key；
- BFF 负责鉴权、业务域、环境、幂等、超时、重试、审计和结构归一化；
- 企业平台持有来源、知识版本、业务审核、发布版本、问题案例和审计；
- RAG 引擎只负责解析、切片、索引、检索和生成；
- 提供方字段不得进入前端契约或业务数据库。

## 2. 供应商无关能力

| 能力 | 接口 | 说明 |
|---|---|---|
| 健康检查 | `GET /health` | 返回 adapter、environment、provider 与状态 |
| 数据集创建 | `POST /datasets` | 测试、候选、生产环境隔离 |
| 数据集查询 | `GET /datasets/{dataset_id}` | 文档数、版本和处理摘要 |
| 文档上传 | `POST /documents` | 文件与服务端来源元数据一起登记 |
| 处理任务 | `POST /ingestions`、`GET /ingestions/{job_id}` | 解析、切片、索引入库异步执行 |
| 检索测试 | `POST /retrieval/search` | TopK、混合/语义、Rerank、元数据过滤 |
| 带引用问答 | `POST /answers` | 业务条件、动作、引用、风险和无答案结果 |
| 环境切换 | `POST /environments/{environment}/activate` | 显式绑定数据集与配置版本 |

## 3. 检索结果

每个命中必须包含：

- `kb_id`：企业知识条目 ID；
- `source.src_id`、`source.doc_id`、`source.version`；
- 标题、URL、核验日期和有效期；
- `chunk_id`、文本和 `citation_id`；
- 归一化 `score`；
- 状态、渠道、权限范围和来源类型等 `metadata`。

`score` 只用于同一配置下排序，不用于证明事实正确，也不能裁决来源冲突。

## 4. 回答状态

| `answer_status` | 含义 | 前端动作 |
|---|---|---|
| `ANSWERED` | 有足够有效证据且动作明确 | 展示条件、建议和引用 |
| `NEED_CLARIFICATION` | 缺少必要上下文 | 只问最少必要问题，不生成确定结论 |
| `NO_ANSWER` | 无相关知识或有效证据不足 | 拒答、转人工或标记知识缺口 |
| `BLOCKED_SAFETY` | P0 安全红线 | 先止损、升级，不进入普通售后 |
| `CONFLICT` | 证据或渠道结论冲突 | 保留双方证据并转裁决 |
| `PERMISSION_DENIED` | 角色无权访问切片 | 不泄露内容，记录拒绝审计 |
| `KNOWLEDGE_EXPIRED` | 命中过期/撤回来源 | 禁止引用为现行政策，转知识修复 |

## 5. 幂等、超时和重试

### 幂等

- 所有写请求要求 `Idempotency-Key`；
- 幂等作用域：租户 + 环境 + 业务域 + 操作 + 请求体哈希；
- 相同键和相同请求返回原结果；
- 相同键、不同请求返回 `DUPLICATE_REQUEST`；
- 文档上传以 `doc_id + version + sha256` 作为第二去重键。

### 建议初始超时

| 操作 | 建议值 | 处理 |
|---|---:|---|
| 健康检查 | 3 秒 | 返回 degraded，不使用缓存冒充健康 |
| 检索 | 8 秒 | 可重试一次，保留超时审计 |
| 问答 | 30 秒 | 超时返回 `RETRIEVAL_TIMEOUT`，不得返回未验证答案 |
| 文档处理 | 异步 | 轮询状态，不阻塞请求线程 |

以上是可配置初始建议，不是供应商锁定参数，后续根据真实响应时间调整。

### 重试

- `GET` 可对 `PROVIDER_UNAVAILABLE`、`RATE_LIMITED` 和网络错误重试；
- 写请求仅在服务端确认幂等后进行有限重试；
- 鉴权失败、权限失败、P0 阻断和输入错误不重试；
- 重试次数、退避和超时写入配置版本，不写死在业务对象中。

## 6. 环境切换

- `test`：调试和失败复现，可回写测试知识；
- `candidate`：冻结数据集，只允许评测与验收；
- `production`：只绑定经过审核和发布的版本。

切换环境必须创建新的 `binding_id`，记录操作人、配置版本、数据集版本和审计。禁止通过修改 URL 或前端本地状态切换后端环境。

## 7. BFF 归一化

BFF 必须：

1. 将供应商 dataset/knowledge/chunk 等字段映射到企业对象；
2. 注入企业 `src_id`、`kb_id`、来源版本和权限范围；
3. 校验来源有效期和发布绑定；
4. 执行 P0 前置门禁；
5. 将供应商错误映射为统一错误码；
6. 删除或脱敏供应商内部 prompt、模型参数和密钥；
7. 保存 `provider_request_id` 但不在前端展示供应商内部字段。

## 8. Dify Cloud 实际映射

本轮真实实验使用 Dify `advanced-chat` App API：

- `POST /chat-messages` 映射到本契约的 `POST /answers`；
- 原始响应中的 `answer` 映射为生成内容；
- `metadata.retriever_resources` 映射为归一化引用和来源快照；
- `task_id`、`message_id`、`conversation_id` 只作为 provider trace，不进入业务主键；
- Dify App Key 仅由服务端读取。

实测表明：Dify 原始回答不能稳定满足 P0 首段止损和冲突分流，因此 BFF 必须在适配层执行：

1. 安全信号识别和强制止损；
2. `CONFLICT` 状态归一化；
3. `internal_only` 权限阻断；
4. 引用来源与业务版本核对。
