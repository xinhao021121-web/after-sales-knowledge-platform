# Dataset Key 配置与服务边界

## 1. 当前状态

`.env.local` 已在本机配置 Dataset Key，文件仍被 Git 忽略：

```text
RAG_DIFY_DATASET_BASE_URL=https://api.dify.ai/v1
RAG_DIFY_DATASET_API_KEY=<configured locally; not displayed>
```

执行当前验证前曾返回：

```text
DATASET_API_NOT_CONFIGURED
```

该阻断已定位为 Scoped Key 不能调用无 `dataset_id` 的列表接口。修正后
`/datasets/{dataset_id}` 健康检查返回 200，真实 P06 已完成。

## 2. 项目负责人在 Dify 页面的操作

依据 Dify 官方文档在 2026-10-25 核验：

1. 登录 Dify Cloud 测试空间；
2. 打开左侧 `Knowledge`；
3. 点击页面右上角 `Service API`；
4. 创建新的 Service API Key；
5. 如页面提供知识库范围选择，仅授权 CANDIDATE 测试知识库；
6. 先在 Dify 中撤销误暴露的旧测试 Key；
7. 在本机打开
   `D:\项目\学习\项目1\文档\阶段3B_高保真交互原型\.env.local`；
8. 只在本机文件中把 Key 填入 `RAG_DIFY_DATASET_API_KEY=` 后；
9. 保存文件并重启 BFF。

不要在聊天、Markdown、截图、Issue 或浏览器控制台中粘贴 Key。项目窗口不需要读取 Key 明文，只需读取“是否已配置”和长度。

仅授权单个知识库的 Scoped Key 不能调用不带 `dataset_id` 的
`/datasets` 列表接口，Dify 会返回 403。本项目的健康检查因此调用
`/datasets/{CANDIDATE_DATASET_ID}`，不要求放宽 Key 的权限范围。

## 3. 凭据职责分离

| 配置 | 用途 | 允许访问的接口 |
|---|---|---|
| `RAG_API_KEY` | Dify Advanced Chat App | `/chat-messages`、`/info` |
| `RAG_DIFY_DATASET_API_KEY` | Dify Knowledge Service API | `/datasets/*` |

两类 Key 不得互相替代。浏览器只调用同源 BFF；DOM、localStorage、前端 JavaScript 和日志均不包含 Key。

## 4. 验证

配置后执行：

```powershell
pwsh -NoProfile -File "文档\阶段4B-1_BFF与P03真实RAG接入\tests\validate-stage4b2a.ps1" -RequireReal -RefreshReal
```

脚本会：

- 检查 `.env.local` 是否被 Git 忽略；
- 检查 Key 是否进入 Git 跟踪文件；
- 检查 Dataset Key 与 App Key 不相同；
- 执行一次真实 CANDIDATE 文档上传和索引；
- 校验 P06 只有在 Dify `READY` 时才允许 `publishable=true`；
- 复用幂等键，避免重复创建文档。

## 5. 官方来源

- Dify API 入门（Knowledge → Service API）：
  https://docs.dify.ai/en/api-reference/guides/get-started
- Dify Create Document by File：
  https://docs.dify.ai/en/api-reference/documents/create-document-by-file
- Dify Get Document Indexing Status：
  https://docs.dify.ai/en/api-reference/documents/get-document-indexing-status
