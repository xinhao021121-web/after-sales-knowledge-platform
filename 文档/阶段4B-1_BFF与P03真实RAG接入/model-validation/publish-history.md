# Dify 发布历史记录

## 当前主版本

- 版本：`#12`
- 模型：`deepseek-v4-pro`
- Prompt：`DIFY-PROMPT-CLAIM-20261025`
- 知识库：CANDIDATE
- 检索：混合检索、Top K=3、`qwen3-rerank`
- 切片：700/100
- 温度：保持原设置

## Flash 历史

- 版本历史仍保留 `#10 RERANK-FLASH` 配置，`#11` 为带 Prompt 占位符修正前的 Pro 版本；
- Flash 两轮实验记录中的原始版本标记为 `#9`，原始响应未改写；
- Flash 的 `FLASH-R1`、`FLASH-R2` 两轮原始响应与归一化结果完整保存在 `rounds/`；
- 未删除旧模型、旧 Prompt、旧应用版本或旧实验结果；
- Flash 当前仅作为阶段 4B2 成本优化候选。

## 说明

发布过程中曾产生 `#10` Flash 兼容版本，未覆盖任何原始实验记录。Pro 的正式回归只使用并发布为 `#12`。配置截图与版本历史截图位于阶段交付目录的 `screenshots/`。
