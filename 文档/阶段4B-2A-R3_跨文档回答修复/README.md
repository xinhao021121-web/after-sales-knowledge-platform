# 阶段4B-2A-R3 跨文档回答修复

状态：**通过，等待产品决策人验收**。未进入 4B-2B，未发布。

## 结果

| 指标 | 结果 |
|---|---:|
| 正式 17 条 | `PASSED` |
| 文档级 Recall@3 | 9/9 = 1.0000（门槛 0.9167） |
| 核心来源命中 | 7/7 |
| P0 最终失败 | 0 |
| 模型型 ANSWERED 且 Claim 通过 | 5 |
| Claim 引用失败 | 0 |
| 供应商未处理错误 | 0 |
| 同逻辑文档并存活动版本 | 0 |
| 同 segment 重复占 Top3 | 0 |
| 三条回归样例语义通过 | 3/3 |
| 三条新保留样例首次语义通过 | 3/3 |
| 成本 | `COST_UNKNOWN` |

正式运行：`EVAL-REAL-a6720d86-cd64-4f05-8809-dc4f7be2dd45`。

## 交付索引

- [R2 冻结基线](01_R2冻结基线.md)
- [RET-H01 根因诊断](02_RET-H01根因诊断.md)
- [跨文档回答修复说明](03_跨文档回答修复说明.md)
- [Dify 配置与 Prompt 调整](04_Dify配置与Prompt调整.md)
- [正式 17 条真实重跑](05_正式17条真实重跑证据.md)
- [三条回归样例结果](06_三条回归样例结果.md)
- [三条新保留样例首次结果](07_三条新保留样例首次结果.md)
- [业务语义验收记录](08_业务语义验收记录.md)
- [测试报告](09_测试报告.md)
- [决策日志](10_决策日志.md)

机器可读证据位于 `evidence/`；R2 首轮失败和冻结文件位于 `baseline/`；
逐题结果位于 `evidence/formal-17/`、`evidence/regression/` 和
`evidence/holdout/`。

## 复现入口

```powershell
node .\文档\阶段4B-1_BFF与P03真实RAG接入\scripts\run-r3-semantic-suite.mjs regression
node .\文档\阶段4B-1_BFF与P03真实RAG接入\scripts\run-r3-semantic-suite.mjs holdout
node .\文档\阶段4B-1_BFF与P03真实RAG接入\scripts\run-stage4b2-r3-p10-real.mjs
pwsh -NoProfile -File .\文档\阶段4B-1_BFF与P03真实RAG接入\tests\validate-stage4b2a-r3.ps1
```

API Key 仅保存在被 Git 忽略的本地 `.env.local`，未进入交付目录或 Git。
