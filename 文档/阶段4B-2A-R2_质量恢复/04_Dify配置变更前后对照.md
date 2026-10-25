# Dify 配置变更前后对照

只操作 App `4da4b901-0f6e-4f35-b89e-8170d83bb7e0` 绑定的 CANDIDATE
Dataset `0d5a11ce-c017-4376-8099-d8e083243a7d`。没有接触已发布业务知识库，
没有新增测试答案文档。

| 配置项 | 变更前 #12 | 最终 #14 |
|---|---|---|
| 生成模型 | `deepseek-v4-pro` | `deepseek-v4-pro` |
| 温度 | 0.7 | 0.7 |
| Embedding | `text-embedding-v4` | `text-embedding-v4` |
| 混合检索 | 向量 0.7 / 关键词 0.3 | 同左 |
| Rerank | `qwen3-rerank` | 同左 |
| Dify Chat 节点 Top K | 3 | 10 |
| Prompt SHA-256 | `69f40a4c...3215` | `3e6e0a82...0ed` |
| 知识库 | CANDIDATE | CANDIDATE |

Prompt 新增了“已有可执行正文步骤时先给步骤，不能因个别状态未知而整条降级”
的约束。配置版本 `#13` 是 Q12 对照，`#14` 是最终 Q10。两次配置均保持 Pro，
但 Chat API 仍只回传 3 条 `retriever_resources`；因此实际多样性采用 BFF
真实 Dataset Retrieve 扩池，不把 Chat 节点 Top K 的配置值伪装成候选池证据。

## 变更边界

- Dify 应用配置版本：`#12 → #14`；
- 业务知识文档版本：不变；
- canonical 文档：不变；
- 活动 CANDIDATE 逻辑文档：5；
- 同一逻辑文档活动版本：各 1；
- 没有业务发布、没有进入 4B-2B；
- 所有 Dify API Key 只在被 Git 忽略的 `.env.local` 中。

证据：

- `evidence/dify-config-before-change.json`
- `evidence/dify-config-after-r2.json`
- `configs/r2-system-prompt.txt`
- `screenshots/DIFY_R2_FINAL_1440.png`
