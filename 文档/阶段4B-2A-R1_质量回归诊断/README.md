# 阶段 4B-2A-R1：P10 质量回归诊断与 CANDIDATE 索引修复

## 结论

- 冻结基线：commit `a73b856e54d404803c556562725aa36f3030840c`。
- 原始失败 P10、P06 证据和截图完整保存在 `baseline/`。
- 已禁用重复 FAQ 文档，canonical FAQ 改为原地更新。
- Dify 当前 App 配置未发现漂移。
- 最终真实 P10 已完成 17 条，但按未降低的 `0.9167` 门槛仍为 `FAILED`。
- 最终运行：`EVAL-REAL-747b7a70-41cc-4e3b-be91-849b0901762f`。

## 最终同口径指标

| 指标 | 分子 / 分母 | 结果 |
|---|---:|---:|
| 核心 Recall@3 | 覆盖期望来源 8 / 期望来源 9 | 0.8889 |
| 核心正确来源命中率 | 命中任务 7 / 检索完成核心任务 7 | 1.0000 |
| P0 成功率 | 成功 6 / P0 任务 6 | 1.0000 |
| 模型型有效 ANSWERED | claim 门禁通过 0 条 | 0 |
| Claim 引用门禁失败 | 0 | 0 |
| 供应商错误 | 0 | 0 |

旧 `0.9167` 为任务级指标，不等于当前文档级 Recall@3。阶段 4A
CFG-RERANK 和阶段 4B1 按当前定义重算均为 `8/9 = 0.8889`、来源命中
`7/7`。本轮不通过修改阈值掩盖缺口。

## 交付

- [指标口径与基线对照](01_指标口径与基线对照.md)
- [CANDIDATE 索引修复](02_CANDIDATE索引与版本修复.md)
- [Dify 配置对照](03_Dify配置对照.md)
- [失败任务诊断](04_失败任务诊断.md)
- [修复实现与测试](05_修复实现与测试.md)
- [阶段验收记录](06_阶段验收记录.md)
- [决策日志](07_决策日志.md)
- [最新真实 P10 证据](evidence/p10-real-after-r1.json)
- [P06 1440px 截图](screenshots/P06_REAL_INGESTION_1440.png)
- [P06 320px 截图](screenshots/P06_REAL_INGESTION_320.png)
- [P10 1440px 截图](screenshots/P10_REAL_EVALUATION_1440.png)
- [P10 320px 截图](screenshots/P10_REAL_EVALUATION_320.png)
