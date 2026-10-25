# 阶段 4B-1：BFF、Dify Adapter 与 P03 真实 RAG

本阶段把真实 Dify 问答经本地 BFF 接入 P03，同时保留阶段 3B 的全部模拟数据和 15 条演示流程。浏览器只访问 `127.0.0.1` BFF，Dify API Key 只存在于 Git 忽略的服务端 `.env.local`。

当前状态：Dify 已发布版本 `#12`，主生成模型为 `deepseek-v4-pro`。Flash 两轮真实实验完整保留，阶段 4B2 再评估成本优化路由。

## 启动

```powershell
cd D:\项目\学习\项目1\文档\阶段3B_高保真交互原型
node .\server\index.mjs
```

打开：`http://127.0.0.1:8787/index.html#P03`

健康检查：`http://127.0.0.1:8787/api/health`

## 核心边界

- P0 在 BFF 内先于任何 Dify 调用执行，`provider_called=false`；
- 安全回答固定引用 `CHUNK-SAFE-STOP-01`；
- `ANSWERED` 必须有可映射到 `doc_id + segment_id + KB 版本` 的引用；
- 过期、internal-only 和渠道冲突在归一化层拦截；
- 浏览器、DOM、localStorage 和 Git 不包含 API Key；
- `/api/retrieval/search` 使用 Dify Advanced Chat 返回的真实 `retriever_resources`，不是离线伪造数据；
- 当前延迟只作为原型观测，不宣称为生产 SLA。

## 交付索引

- [BFF 与 Adapter 实现](01_BFF与DifyAdapter实现.md)
- [安全边界与 P0 门禁](02_安全边界与P0门禁.md)
- [接口契约](03_接口契约更新.md)
- [P03 接入说明](04_P03真实RAG接入说明.md)
- [持久化与凭据](05_数据持久化与凭据.md)
- [错误与超时](06_错误与超时处理.md)
- [真实请求样例](07_真实请求样例.md)
- [测试报告](08_测试报告.md)
- [阶段验收记录](09_阶段4B1验收记录.md)
- [复审修正记录](10_复审修正记录.md)
- [Pro / Flash 质量与成本对照](model-validation/README.md)
- [模型验证状态](model-validation/model-status.json)
- [Dify 发布历史](model-validation/publish-history.md)
- [OpenAPI 契约](contracts/bff-p03.openapi.json)

## 测试

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\tests\validate-stage4b1.ps1
```

完整验证会执行服务端单元/API 测试、真实 Dify 健康检查、真实检索、P03 真实问答、6 条 P0 门禁、1440/320 截图，以及阶段 3B 的 13 页和 15 条模拟流程回归。

模型回归与对照命令：

```powershell
node .\scripts\run-flash-ab.mjs --round FLASH-R1
node .\scripts\run-flash-ab.mjs --round FLASH-R2
node .\scripts\run-flash-ab.mjs --round PRO-R1 --model deepseek-v4-pro --app-version 11
node .\scripts\build-flash-ab-comparison.mjs
```
