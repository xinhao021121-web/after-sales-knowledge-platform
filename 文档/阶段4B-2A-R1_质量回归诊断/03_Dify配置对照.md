# Dify 配置对照

读取方式：Dify Console 当前 draft API，只读；浏览器登录信息未写入项目。

| 配置项 | 阶段4A CFG-RERANK | 阶段4B1 Pro #12 | 当前 App |
|---|---|---|---|
| App | `4da4b901-0f6e-4f35-b89e-8170d83bb7e0` | 同左 | 同左 |
| 生成模型 | `deepseek-v4-pro` | `deepseek-v4-pro` | `deepseek-v4-pro` |
| Embedding | `text-embedding-v4` | `text-embedding-v4` | `text-embedding-v4` |
| 检索 | 混合 0.7/0.3 | 混合 0.7/0.3 | 混合 0.7/0.3 |
| Top K | 3 | 3 | 3 |
| Rerank | `qwen3-rerank` | `qwen3-rerank` | `qwen3-rerank` |
| 温度 | 0.7 | 0.7 | 0.7 |
| CANDIDATE dataset | `0d5a11ce-...a7d` | 同左 | 同左 |
| Prompt | Claim 正文证据规则 | v2 | 语义一致 |

当前 draft 中 `retrieval_mode=multiple` 是 Dify 对混合检索加自定义权重
的底层表示；权重仍为向量 0.7、关键词 0.3，因此不等于配置漂移。

当前 Prompt 的原文占位符为 `{{#context#}}`。阶段 4B1 保存的
`dify-system-prompt-v2-effective.txt` 是 UI 渲染后的“上下文”占位形式。
去除空白并统一占位符后，两份 Prompt 语义一致。

本轮没有修改 Dify 模型、Prompt、TopK、Rerank、权重或知识库绑定。

证据：

- [当前只读配置](baseline/dify-current-config.json)
- [当前 Prompt 原文](baseline/dify-current-prompt.txt)
- [当前配置截图](baseline/dify-current-config.png)
- [机器可读配置对照](evidence/dify-config-comparison.json)
