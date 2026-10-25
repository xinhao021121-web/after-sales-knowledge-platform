# 阶段 4B-2A：P06 真实知识入库与 P10 真实批量评测

## 当前状态

- P10 已完成一次真实 Dify Pro 17 条评测，执行结果完整；
- P10 最终状态为 `FAILED`：核心来源命中为 6/12，低于阶段 4A 基线；
- P0 为 6/6 BFF 前置短路，最终失败 0；
- 唯一一条模型型 `ANSWERED` 满足 claim 引用门禁；`POC-K04` 的供应商网络错误已保留；
- P06 已完成真实 CANDIDATE 文档上传与索引，Dify 返回 `READY`，29/29 切片完成；

## 入口

- 原型入口：`文档/阶段3B_高保真交互原型/index.html`
- BFF 启动：在 `文档/阶段4B-1_BFF与P03真实RAG接入` 执行 `npm start`
- P10真实证据：[evidence/p10-real-evaluation.json](evidence/p10-real-evaluation.json)
- P06真实证据：[evidence/p06-real-ingestion.json](evidence/p06-real-ingestion.json)
- API契约：`文档/阶段4B-1_BFF与P03真实RAG接入/contracts/bff-4b2a.openapi.json`
- 验证脚本：`文档/阶段4B-1_BFF与P03真实RAG接入/tests/validate-stage4b2a.ps1`

## 文档

- [Dataset Key 配置](01_DatasetKey配置与服务边界.md)
- [P06 真实入库设计](02_P06真实入库设计.md)
- [P10 真实评测报告](03_P10真实评测与成本.md)
- [测试报告](04_测试报告.md)
- [阶段验收记录](05_阶段4B2A验收记录.md)
- [决策日志](06_决策日志.md)

## 截图说明

截图使用已写入交付证据的真实 P06/P10 数据重新渲染，页面标识为 `REAL_DIFY`。截图验证布局、状态与交互；供应商返回细节仍以 evidence 下的原始 JSON 为准。
