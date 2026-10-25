# Dify Cloud 真实实验结果

日期：2026-10-24

## 正式配置

| 目录 | 配置 | 响应数 |
|---|---|---:|
| `CFG-BASE/` | CANDIDATE，向量检索，Top3，无 Rerank | 17 |
| `CFG-HYBRID/` | CANDIDATE，混合检索 0.7/0.3，Top3，无模型 Rerank | 17 |
| `CFG-RERANK/` | CANDIDATE，混合检索，Top3，`qwen3-rerank` | 17 |
| `CFG-RERANK-TEST/` | TEST，混合检索，Top3，`qwen3-rerank`，专项边界 | 5 |

## 探索记录

`CFG-VECTOR-WEIGHTED-EXPLORATORY/` 和 `CFG-VECTOR-RERANK-EXPLORATORY/` 是在尚未切换知识库级混合检索时产生的记录，只用于说明实验定义修正，不作为正式对照结果。

## 文件

- 每个配置的 `raw/` 保存 Dify 原始 HTTP 响应和耗时；
- 每个配置的 `summary.json` 保存首次归一化结果；
- `comparison.json` 使用双数据集 manifest 重新计算正式指标，并应用 BFF 安全/冲突门禁；
- `evidence/dify-final-config.png` 是最终 CANDIDATE + 混合检索 + Rerank 配置证据。

API Key 不在任何结果文件中。
