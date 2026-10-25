# 阶段 4A：RAG 能力验证、数据准备与适配接口设计

日期：2026-10-24
阶段状态：Dify Cloud 真实实验完成；推荐流水线需保留强制 BFF 门禁

## 结论先行

- 已建立 TEST / CANDIDATE 隔离数据集；
- 已建立 12 条核心任务 + 5 条专项边界的 17 条 PoC 评测集；
- 已定义供应商无关 RAG Adapter 契约和技术架构；
- 本地规则门禁、数据完整性和契约 smoke test 通过；
- Dify Cloud 已完成 `CFG-BASE`、`CFG-HYBRID`、`CFG-RERANK` 的 17 条真实响应；
- TEST 已完成过期、冲突和权限专项真实响应；
- Dify 原始回答的 P0 稳定性不达标，必须由企业 BFF 执行强制安全门禁；
- FastGPT 仍未执行，因此 Dify 是“当前已真实验证的实施候选”，不代表跨提供方能力排名。

## 交付索引

| 交付 | 文件 |
|---|---|
| 候选方案对比 | [01_候选方案对比.md](01_候选方案对比.md) |
| 数据集与来源清单 | [02_数据集与来源清单.md](02_数据集与来源清单.md) |
| 推荐配置与供应商决策 | [03_推荐配置与供应商决策.md](03_推荐配置与供应商决策.md) |
| RAG 适配契约 | [04_RAG适配接口契约.md](04_RAG适配接口契约.md) |
| 安全与凭据边界 | [05_安全与凭据边界.md](05_安全与凭据边界.md) |
| 验收记录 | [06_阶段4A验收记录.md](06_阶段4A验收记录.md) |
| OpenAPI 契约 | [contracts/rag-adapter.openapi.json](contracts/rag-adapter.openapi.json) |
| PoC 评测集 | [evaluation/eval-set-v1.0.json](evaluation/eval-set-v1.0.json) |
| 三条核心链路 | [evaluation/core-chains.md](evaluation/core-chains.md) |
| 参数实验计划 | [experiments/experiment-plan.md](experiments/experiment-plan.md) |
| 指标结果 | [experiments/metrics-results.md](experiments/metrics-results.md) |
| Dify 运行配置 | [experiments/dify-runtime-config.json](experiments/dify-runtime-config.json) |
| 人工复核记录 | [experiments/manual-review.json](experiments/manual-review.json) |
| 最终 Dify 配置证据 | [dify-final-config.png](experiments/results/dify-cloud/evidence/dify-final-config.png) |
| 12 条任务就绪结果 | [experiments/core-task-readiness.md](experiments/core-task-readiness.md) |
| 失败分类 | [experiments/failure-taxonomy.md](experiments/failure-taxonomy.md) |
| 账号配置待办 | [experiments/provider-account-todo.md](experiments/provider-account-todo.md) |
| 技术架构 | [architecture/01_技术架构.drawio](architecture/01_技术架构.drawio) |
| 来源记录 | [sources/source-records-2026-10-24.csv](sources/source-records-2026-10-24.csv) |

## 数据集

- 本地 `TEST`：8 份，包含 5 份基础知识、过期规则、渠道冲突和 `internal_only` 权限样本；Dify 远端 TEST 当前装载 3 份专项文件；
- `CANDIDATE`：5 份冻结知识，供提供方验收；
- 所有数据均为公开资料摘要或明确标记的模拟内容；
- 不包含真实客户、订单、序列号、联系方式或支付信息。

## 本地验证

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\tests\validate-stage4a.ps1
```

本地验证和最终 BFF 门禁的 P0 0 失败不代表提供方原始回答通过，真实原始结论另见 `metrics-results.md`。

## 真实实验结果

- `CFG-BASE`：Recall@3 0.6200，来源 9/12；
- `CFG-HYBRID`：Recall@3 0.9167，来源 12/12；
- `CFG-RERANK`：Recall@3 0.9167，来源 12/12，引用可追溯 11/11；
- 最终 BFF 门禁后：17/17 业务动作正确，6/6 P0 通过；
- 提供方原始 P0 仍有 5 条未把止损放在第一段。

最终采用配置与完整证据见 [推荐配置与供应商决策](03_推荐配置与供应商决策.md)。
