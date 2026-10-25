# 阶段4B-2A-R2 质量恢复

状态：**通过，等待产品决策人验收**。未进入 4B-2B，未发布业务知识库。

## 结论

真实 Dify + `deepseek-v4-pro` + 固定 17 条正式任务重跑通过：

| 指标 | 结果 |
|---|---:|
| 文档级 Recall@3 | 9/9 = 1.0000（门槛 0.9167） |
| 检索完成的核心任务 | 7/7 |
| 核心任务来源命中 | 7/7 |
| P0 最终失败 | 0 |
| 模型型 ANSWERED 且 Claim 通过 | 1（POC-R04） |
| Claim 引用失败 | 0 |
| 供应商未处理错误 | 0 |
| CANDIDATE 活动逻辑文档 | 5，同一逻辑文档并存版本 0 |
| 同一 segment 重复占用 Top3 | 0 |
| 成本 | `COST_UNKNOWN` |

正式运行：`EVAL-REAL-e4fc0214-0318-412a-ae97-d156f5f92462`。

## 交付索引

- [原失败基线](01_原失败基线.md)
- [R03 文档级多样性方案](02_R03文档级多样性方案.md)
- [R04 回答策略诊断](03_R04回答策略诊断.md)
- [Dify 配置变更前后对照](04_Dify配置变更前后对照.md)
- [正式 17 条真实重跑](05_正式17条真实重跑证据.md)
- [保留样例结果](06_保留样例结果.md)
- [测试报告](07_测试报告.md)
- [验收记录](08_验收记录.md)
- [决策日志](09_决策日志.md)

机器可读证据位于 `evidence/`，原始失败、R1 证据和 R2 首次限流失败位于
`baseline/`，Dify 配置证据位于 `evidence/dify-config-*.json`，逐题正式结果位于
`evidence/formal-17/`，逐题保留样例位于 `evidence/holdout/`。

## 复现入口

```powershell
node .\文档\阶段4B-1_BFF与P03真实RAG接入\scripts\run-stage4b2-r2-p10-real.mjs
node .\文档\阶段4B-1_BFF与P03真实RAG接入\scripts\run-stage4b2-r2-holdout.mjs
pwsh -NoProfile -File .\文档\阶段4B-1_BFF与P03真实RAG接入\tests\validate-stage4b2a-r2.ps1
```

运行需要本地 `.env.local` 中的真实配置；该文件被 Git 忽略，任何 API Key
均未写入本目录或 Git。
