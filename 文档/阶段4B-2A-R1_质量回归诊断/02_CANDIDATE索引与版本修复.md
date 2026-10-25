# CANDIDATE 索引与版本修复

## 1. 修复前

当前 CANDIDATE 有 6 个 Dify 文档。FAQ 逻辑文档 `DOC-FAQ-V1` 同时存在：

| 文档 ID | 文件名 | 可检索 | 切片数 |
|---|---|---:|---:|
| `1a7df480-448a-4985-ac0a-37d7bd962e04` | `01_售后FAQ.md` | 是 | 12 |
| `25fe0126-502a-4fde-add2-cfcee5bacd32` | `01_售后FAQ__4B2A-CANDIDATE-v1.0.0.md` | 是 | 29 |

两者共享 6 个完全相同内容哈希的切片。原因是 P06 每次入库使用
`create-by-file` 追加新文档，而非更新 canonical 文档。

## 2. 根因

- P06 未先查找 canonical `01_售后FAQ.md`；
- 新增文件使用独立版本化文件名；
- 最终同一逻辑文档有两个可检索版本；
- 重复 FAQ 在 R03 Top3 中占据两个相同分数的席位。

## 3. 修复

1. P06 先按冻结 manifest 的 canonical 文件名查询已有文档；
2. 找到后使用 `update-by-file` 原地更新；
3. 找不到才创建新文档；
4. 切片分隔符从错误的单换行修正为冻结配置的 `\n\n`，仍为 700/100；
5. 备份文档清单和全部切片哈希后，禁用重复的新 FAQ 文档。

## 4. 修复后

canonical FAQ：

- 文档 ID：`1a7df480-448a-4985-ac0a-37d7bd962e04`
- 入库任务：`ING-e5816be5-d1d9-49c2-83b6-afac4c7bbe64`
- 模式：`UPDATE_EXISTING`
- 状态：`DOCUMENT_READY / READY`
- 切片：12/12
- 可发布：`true`

重复文档 `25fe0126-502a-4fde-add2-cfcee5bacd32` 已禁用，不可检索。
现在同一逻辑文档只有 canonical 一个有效版本。

证据：

- [修复前文档清单](baseline/candidate-documents-before-r1.json)
- [修复前切片哈希](baseline/candidate-segments-before-r1.json)
- [修复后文档清单](evidence/candidate-inventory-after-r1.json)
- [canonical 原地更新证据](evidence/p06-canonical-update-final.json)
