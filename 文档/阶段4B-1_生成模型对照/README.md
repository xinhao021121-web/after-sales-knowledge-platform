# 阶段 4B-1：生成模型对照

本阶段只验证 Dify Advanced Chat 的生成模型替换：在知识库、文档、700/100 切片、TopK=3、混合检索、`qwen3-rerank`、系统提示词和温度不变的前提下，对比 `deepseek-v4-pro` 与 `deepseek-v4-flash`。

结论：**CFG-RERANK-FLASH 通过当前 17 条评测门槛，作为阶段 4B-1 主候选生成模型。** 旧 `CFG-RERANK-PRO` 原始实验保持只读，未被覆盖。

## 关键产物

- [配置与证据边界](01_配置与证据边界.md)
- [两轮真实结果](02_两轮真实结果.md)
- [Pro 与 Flash 对照](03_Pro与Flash对照.md)
- [引用与 P0 复核](04_引用与P0复核.md)
- [决策记录](05_决策记录.md)
- [阶段验收记录](06_阶段4B1验收记录.md)
- [机器可读对照](experiments/comparison.json)
- [人工规则复核](experiments/manual-review-v1.json)

## 复现

```powershell
node .\scripts\build-input-lock.mjs
node .\scripts\preflight-check.mjs
node .\scripts\run-flash-round.mjs --round FLASH-R1
node .\scripts\run-flash-round.mjs --round FLASH-R2
node .\scripts\refresh-gated-artifacts.mjs
node .\scripts\enrich-normalized-retrieval.mjs
node .\scripts\build-comparison.mjs
powershell -ExecutionPolicy Bypass -File .\tests\validate-stage4b1.ps1
```

真实调用需要 `阶段4A_RAG能力验证/.env.local` 中的服务端配置。该文件被 Git 忽略，不得把密钥写入 HTML、JavaScript、日志或提交记录。
