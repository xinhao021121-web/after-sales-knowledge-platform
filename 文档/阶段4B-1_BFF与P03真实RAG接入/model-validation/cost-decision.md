# 模型、质量与成本决策

日期：2026-10-25

## 决策

- Pro：阶段 4B1 唯一主生成模型，已发布为 Dify `#12`；
- Flash：保留为阶段 4B2 成本优化候选，不作为当前唯一主模型；
- P0：继续由 BFF 固定安全策略前置阻断，不依赖生成模型；
- 阶段 4B1 不建设模型路由，回退次数固定为 0；
- 阶段 4B2 再评审“Flash 优先、Pro 回退”的路由方案。

## 质量依据

| 指标 | Pro R1 | Flash R1 | Flash R2 |
| --- | ---: | ---: | ---: |
| Recall@3 | 0.9306 | 0.7639 | 0.7639 |
| 正确来源 | 12/12 | 10/12 | 10/12 |
| Claim 引用 | 10/12 | 8/12 | 8/12 |

Pro 的 Recall、来源和 claim 引用均不低于阶段 4A claim 级重算基线。Flash 两轮完整记录保留在 `model-validation/rounds/`。

## 成本状态

当前没有 Dify 官方计费页或合同确认的 DeepSeek-v4-pro / Flash 输入输出单价，因此：

- `cost_status=COST_UNKNOWN`；
- `estimated_input_cost=null`；
- `estimated_output_cost=null`；
- `estimated_total_cost=null`；
- 不以 Dify usage 返回的 `0` 元作为真实免费依据；
- 仅比较真实 token、延迟与质量，不宣称 Flash 更便宜。

## 成本指标定义

- 单次请求估算成本：总费用 / 模型请求数；
- 每个有效回答成本：总费用 / 可验收有效回答数；
- 每个正确来源命中成本：总费用 / 正确来源命中数；
- 有效回答：`answer_status=ANSWERED` 且 claim 级引用门禁通过；
- 回退次数：本阶段无模型路由，固定为 0；
- 人工升级次数：P0 风险升级与渠道冲突裁决次数。
