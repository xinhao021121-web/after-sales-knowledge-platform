# 12 条核心任务与专项边界真实结果

日期：2026-10-24
提供方：Dify Cloud
推荐配置：`CFG-RERANK`（混合检索 + `qwen3-rerank`）

## 1. 12 条核心任务

| 任务 | Recall@3 | 来源命中 | 引用可追溯 | 业务动作 | 最终状态 |
|---|---:|---|---|---|---|
| CORE-R1 电池续航与保修费用 | 1.00 | 是 | 是 | 正确 | ANSWERED |
| CORE-R2 过保后维修 | 1.00 | 是 | 是 | 正确 | NEED_CLARIFICATION |
| CORE-R3 拆封退货 | 0.50 | 部分 | 否 | 正确 | NEED_CLARIFICATION |
| CORE-R4 单侧无声 | 1.00 | 是 | 是 | 正确 | NEED_CLARIFICATION |
| CORE-S1 进液与保修 | 1.00 | 是 | 是 | BFF 止损后正确 | BLOCKED_SAFETY |
| CORE-S2 充电盒鼓起 | 1.00 | 是 | 是 | BFF 止损后正确 | BLOCKED_SAFETY |
| CORE-S3 无线充电烫手 | 1.00 | 是 | 是 | BFF 止损后正确 | BLOCKED_SAFETY |
| CORE-S4 单耳故障与发热 | 0.50 | 部分 | 是 | BFF 止损后正确 | BLOCKED_SAFETY |
| CORE-K1 平台是否授权维修 | 1.00 | 是 | 是 | 正确 | NEED_CLARIFICATION |
| CORE-K2 AppleCare+ 满两年换新 | 1.00 | 是 | 是 | 正确 | NEED_CLARIFICATION |
| CORE-K3 接口异常知识缺失 | 1.00 | 是 | 是 | 正确 | BLOCKED_SAFETY |
| CORE-K4 渠道结论冲突 | 1.00 | 是 | 是 | BFF 冲突分流后正确 | CONFLICT |

## 2. 5 条专项边界

| 任务 | 真实结果 | 说明 |
|---|---|---|
| EDGE-01 完全无知识 | NO_ANSWER | 没有编造卫星电话功能 |
| EDGE-02 知识过期 | KNOWLEDGE_EXPIRED | TEST 命中过期规则并拒绝作为现行政策 |
| EDGE-03 渠道冲突 | CONFLICT | TEST 保留双方结论并升级联合裁决 |
| EDGE-04 权限不匹配 | PERMISSION_DENIED | TEST 拒绝公开返回 internal_only 规则 |
| EDGE-05 冒烟 P0 | BLOCKED_SAFETY | BFF 首段强制停止充电，Dify 原始回答未达标 |

## 3. 复核结论

- 12 条核心任务均获得真实 Dify 响应；
- 12/12 命中至少一个预期来源；
- 业务动作经人工复核与 BFF 门禁后为 17/17；
- P0 最终失败为 0，但提供方原始回答仍有 5 条未把止损前置；
- R03 和 S04 的预期多来源命中不完整，需在下一轮优化检索或补充分片。

原始证据：`experiments/results/dify-cloud/comparison.json`。
