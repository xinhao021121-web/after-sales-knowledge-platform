# Pro / Flash 全量质量与成本对照

## 1. 实验边界

- 提供方：Dify Cloud；
- 应用：`Stage4A-RAG-CANDIDATE`，当前发布版本 `#12`；
- 数据集：CANDIDATE 1.0.0；
- 切片：700/100；
- 检索：混合检索、Top K=3、`qwen3-rerank`；
- Prompt：`DIFY-PROMPT-CLAIM-20261025`；
- 任务：阶段 4A 冻结的 17 条评测任务；
- Pro：`PRO-R1` 一轮真实回归；
- Flash：保留既有 `FLASH-R1`、`FLASH-R2` 两轮真实记录；
- 每轮：11 次真实 Dify 调用 + 6 条 BFF P0 前置门禁。

## 2. 质量对照

| 指标 | Pro R1 | Flash R1 | Flash R2 |
| --- | ---: | ---: | ---: |
| Recall@3 | 0.9306 | 0.7639 | 0.7639 |
| 正确来源 | 12/12 | 10/12 | 10/12 |
| Claim 引用 | 10/12 | 8/12 | 8/12 |
| 全部应引任务 Claim 引用 | 12/15 | 10/15 | 10/15 |
| 业务动作 | 17/17 | 17/17 | 17/17 |
| 必要追问 | 17/17 | 17/17 | 17/17 |
| 正确拒答 | 4/4 | 4/4 | 4/4 |
| P0 最终失败 | 0/6 | 0/6 | 0/6 |

Pro 的 Recall@3、来源命中和 claim 引用均不低于阶段 4A 的 claim 级重算基线。Flash 的 Recall@3 与来源命中明显低于 Pro，因此只作为 4B2 成本优化候选。

## 3. Token、耗时与成本

耗时仅统计 11 次真实生成调用，不含 6 次 P0 短路。

| 指标 | Pro R1 | Flash R1 | Flash R2 |
| --- | ---: | ---: | ---: |
| 平均输入 token | 504.4 | 未知 | 未知 |
| 平均输出 token | 2,063.5 | 未知 | 未知 |
| 单次请求估算成本 | COST_UNKNOWN | COST_UNKNOWN | COST_UNKNOWN |
| 每个有效回答成本 | COST_UNKNOWN | COST_UNKNOWN | COST_UNKNOWN |
| 每个正确来源命中成本 | COST_UNKNOWN | COST_UNKNOWN | COST_UNKNOWN |
| 平均耗时 | 29,900 ms | 17,586 ms | 17,378 ms |
| 中位数耗时 | 27,061 ms | 16,835 ms | 13,237 ms |
| P95 耗时 | 64,759 ms | 33,744 ms | 32,564 ms |
| 回退次数 | 0 | 0 | 0 |
| 人工升级次数 | 8 | 8 | 8 |

Flash 历史响应没有保存当时的 usage 对象，因此 token 与成本保持未知，不从当前日志反推。Pro 本轮保存了原始 usage。由于没有官方计费页面或合同确认的输入/输出单价，所有估算成本均为 `COST_UNKNOWN`，Dify 返回的 0 元不代表免费。

## 4. 决策

- 状态：`PRO_PRIMARY_VALIDATED_FLASH_COST_CANDIDATE`；
- Pro：阶段 4B1 唯一主生成模型；
- Flash：保留两轮真实记录，仅作为阶段 4B2 成本优化候选；
- P0：继续由 BFF 固定安全策略前置阻断；
- 本阶段不建设模型路由，回退次数为 0；
- 4B2 再评估“Flash 优先、Pro 回退”的路由方案。

## 5. 证据

- `comparison.json`：完整质量、token、耗时和成本状态；
- `model-status.json`：模型决策状态；
- `manual-review.json`：Pro 与两轮 Flash 的逐条复核；
- `timing-summary.csv`：平均、中位数、P95；
- `cost-summary.csv`：token、单次成本、有效回答成本、回退和人工升级；
- `rounds/PRO-R1/raw/`、`rounds/FLASH-R1/raw/`、`rounds/FLASH-R2/raw/`：逐任务真实响应。
