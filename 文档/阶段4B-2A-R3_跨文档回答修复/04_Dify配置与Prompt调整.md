# Dify 配置与 Prompt 调整

| 配置项 | R2 #14 | R3 #16 |
|---|---|---|
| 模型 | `deepseek-v4-pro` | `deepseek-v4-pro` |
| 温度 | 0.7 | 0.7 |
| Dify Chat Top K | 10 | 10 |
| Reranker | `qwen3-rerank` | `qwen3-rerank` |
| 混合权重 | 0.7 / 0.3 | 0.7 / 0.3 |
| Dataset | CANDIDATE | CANDIDATE |
| Prompt SHA-256 | R2 基线见文件 | `f01226ec961edf49519f270bf642cd867cb3daa80861f72196ae335025e3d093` |

R3 Prompt 新增约束：

- 多业务目标强制分节；
- 每节独立引用；
- 不要求用户提供系统已检索文档；
- 用户已给出的时间、渠道、已拆封和故障事实不得遗漏；
- 只对用户明确提出的独立目标分节。

证据：

- `configs/r3-system-prompt.txt`
- `evidence/dify-config-after-r3.json`
- `evidence/dify-config-comparison-r3.json`
- `evidence/dify-candidate-publish-r3.json`
- `screenshots/DIFY_R3_FINAL_1440.png`

本轮只同步 CANDIDATE 应用配置，没有发布业务知识库。
