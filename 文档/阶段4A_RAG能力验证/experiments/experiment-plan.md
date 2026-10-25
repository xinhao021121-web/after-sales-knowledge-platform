# RAG 对照实验计划

日期：2026-10-24
状态：Dify Cloud 真实实验完成；FastGPT/RAGFlow 未执行

## 1. 固定变量

- 数据集：`DS-CANDIDATE-2026-10-24`，除非失败专项明确使用 TEST；
- 问题集：`EVAL-RAG-POC-1.0.0`；
- 知识文档版本：CANDIDATE `1.0.0`；
- 模型：同一提供方实验内保持同一模型和温度；
- 安全标准：P0 红线与阶段 2B/3B 一致；
- 输出结构：统一使用本项目 RAG Adapter 契约；
- 失败记录：保留原始响应、归一化响应、引用、时间、错误码和 request_id。

## 2. 单变量顺序

1. `CFG-BASE`：纯语义检索、Top3、无重排、无过滤、强制引用；
2. `CFG-HYBRID`：只把检索从纯语义切换为混合；
3. `CFG-RERANK`：只在混合检索之上开启 Rerank；
4. `CFG-CHUNK-350` 与 `CFG-CHUNK-1100`：分别与 700 字符配置比较，不同时调整其他变量；
5. `CFG-TOPK5`：只把 TopK 从 3 改为 5；
6. `CFG-METADATA`：只开启元数据过滤，检查过期、冲突和 internal_only 泄露；
7. `CFG-NO-CITATION`：只关闭引用，检查引用支持度和无依据回答风险。

## 3. 提供方执行条件

| 提供方 | 必需条件 | 当前状态 |
|---|---|---|
| FastGPT | 可访问 API Base URL、团队/数据集 ID、API Key、可用嵌入模型和对话/检索模型 | BLOCKED |
| Dify | 可访问 API Base URL、Knowledge Base 与 App API Key、可用嵌入模型和生成模型 | BLOCKED |
| RAGFlow | 可访问 API Base URL、API Key、可用的 Embedding 与 Reranker | 备用；不作为首批强制项 |

## 4. 每次实验最小记录

- `run_id`、`config_id`、`provider`、`provider_version`；
- 环境、dataset_id、文档 SHA256、eval-set version；
- 每个问题的原始响应、归一化结果、Top K 结果和引用；
- Recall@3、正确来源命中、引用支持、动作正确、追问完整、正确拒答；
- P0 失败数、响应时间、错误类型；
- 失败切片和人工复核结论。

## 5. 完成门槛

- 同一提供方至少完成 `CFG-BASE` 与一个单变量对照；
- 至少一个提供方完成真实检索与带引用问答；
- P0 安全失败为 0；
- 没有 API Key 或真实响应时，结果状态必须为 `NOT_RUN`，不得进入推荐排序。

## 6. 实际执行结果

Dify Cloud 已完成：

- `CFG-BASE`：17 条原始响应；
- `CFG-HYBRID`：17 条原始响应；
- `CFG-RERANK`：17 条原始响应；
- `CFG-RERANK-TEST`：5 条 TEST 专项响应；
- 应用最终恢复为 CANDIDATE + 混合检索 + `qwen3-rerank`。

详细结果见 `metrics-results.md`、`results/dify-cloud/comparison.json` 和 `manual-review.json`。
