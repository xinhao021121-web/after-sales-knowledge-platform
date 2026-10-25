$ErrorActionPreference = 'Stop'
$base = Split-Path -Parent $PSScriptRoot
$projectRoot = Resolve-Path (Join-Path $base '..\..')
$r1Root = Join-Path $projectRoot '文档\阶段4B-2A-R1_质量回归诊断'
$prototypeRoot = Join-Path $projectRoot '文档\阶段3B_高保真交互原型'
$failures = [System.Collections.Generic.List[string]]::new()

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { $failures.Add($Message) }
}
function Read-Json {
    param([string]$Path)
    Assert-True (Test-Path -LiteralPath $Path -PathType Leaf) "缺少文件：$Path"
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
    try { return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8) | ConvertFrom-Json }
    catch { $failures.Add("JSON 无法解析：$Path"); return $null }
}

$trackedBefore = @(& git -C $projectRoot status --porcelain --untracked-files=no)

& node (Join-Path $base 'tests\server-unit.mjs')
Assert-True ($LASTEXITCODE -eq 0) '4B-1服务端回归失败'
& node (Join-Path $base 'tests\stage4b2-unit.mjs')
Assert-True ($LASTEXITCODE -eq 0) 'R1指标、重试、否定句与入库更新测试失败'
& node (Join-Path $base 'tests\e2e-stage4b2.mjs')
Assert-True ($LASTEXITCODE -eq 0) 'P06/P10浏览器测试失败'

$required = @(
    'README.md',
    '01_指标口径与基线对照.md',
    '02_CANDIDATE索引与版本修复.md',
    '03_Dify配置对照.md',
    '04_失败任务诊断.md',
    '05_修复实现与测试.md',
    '06_阶段验收记录.md',
    '07_决策日志.md',
    'baseline/p10-failed-before-r1.json',
    'baseline/p06-before-r1.json',
    'baseline/candidate-manifest-before-r1.json',
    'baseline/candidate-documents-before-r1.json',
    'baseline/candidate-segments-before-r1.json',
    'baseline/dify-current-config.json',
    'evidence/p06-canonical-update-final.json',
    'evidence/p10-real-after-r1.json',
    'evidence/candidate-inventory-after-r1.json'
)
foreach ($relative in $required) {
    Assert-True (Test-Path -LiteralPath (Join-Path $r1Root $relative) -PathType Leaf) "R1缺少交付文件：$relative"
}

$p10 = Read-Json (Join-Path $r1Root 'evidence/p10-real-after-r1.json')
Assert-True ($p10.status -eq 'FAILED') 'P10未保持FAILED'
Assert-True ($p10.source_mode -eq 'REAL_DIFY') 'P10不是真实Dify证据'
Assert-True (@($p10.results).Count -eq 17) 'P10任务不是17条'
Assert-True ($p10.metrics.retrieval_completed_core_count -eq 7) '检索完成核心任务分母不是7'
Assert-True ($p10.metrics.retrieval_expected_source_count -eq 9) '期望来源分母不是9'
Assert-True ($p10.metrics.retrieval_covered_source_count -eq 8) '覆盖来源不是8'
Assert-True ($p10.metrics.recall_at_3_core -eq 0.8889) '同口径Recall不是0.8889'
Assert-True ($p10.metrics.correct_source_hits_core -eq 7 -and $p10.metrics.correct_source_denominator -eq 7) '来源任务命中不是7/7'
Assert-True ($p10.metrics.source_hit_rate_core -eq 1) '来源命中率不是1'
Assert-True ($p10.metrics.p0_final_failures -eq 0) 'P0最终失败不为0'
Assert-True ($p10.metrics.provider_errors -eq 0) '最终运行仍有供应商错误'
Assert-True ($p10.metrics.citation_failures -eq 0) '存在ANSWERED引用门禁失败'
Assert-True ($p10.metrics.quality_gate_status -eq 'FAILED') '质量门槛不应通过'
Assert-True ($p10.metrics.recall_at_3_core -lt 0.9167) 'Recall口径或阈值被错误修改'
Assert-True ($p10.metrics.cost.cost_status -eq 'COST_UNKNOWN') '成本状态不是COST_UNKNOWN'
Assert-True ($null -eq $p10.metrics.cost.all_effective_response_cost) '未知成本却填写金额'

$k04 = $p10.results | Where-Object { $_.task_id -eq 'POC-K04' }
Assert-True ($k04.answer_status -eq 'CONFLICT') 'K04受控重试结果不是CONFLICT'
Assert-True ($k04.forbidden_action_match -eq $null) 'K04否定句仍被误判'
Assert-True (-not [string]::IsNullOrWhiteSpace([string]$k04.retrieval_attempts[0].request_id)) 'K04重试请求ID缺失'

$oldK04 = (Read-Json (Join-Path $r1Root 'baseline/p10-failed-before-r1.json')).results |
    Where-Object { $_.task_id -eq 'POC-K04' }
Assert-True ($oldK04.answer_status -eq 'ERROR') '原始K04错误未保留'
Assert-True ($oldK04.error_code -eq 'PROVIDER_UNAVAILABLE') '原始K04错误码未保留'

$p06 = Read-Json (Join-Path $r1Root 'evidence/p06-canonical-update-final.json')
Assert-True ($p06.ingestion.ingestion_mode -eq 'UPDATE_EXISTING') 'P06未原位更新canonical文档'
Assert-True ($p06.ingestion.provider_document_id -eq '1a7df480-448a-4985-ac0a-37d7bd962e04') 'P06目标不是canonical文档'
Assert-True ($p06.ingestion.provider_status -eq 'READY' -and $p06.ingestion.completed_segments -eq 12) 'canonical索引未完成12个切片'

$inventory = Read-Json (Join-Path $r1Root 'evidence/candidate-inventory-after-r1.json')
$faqDocs = @($inventory.documents | Where-Object { $_.document_name -match '^01_售后FAQ' })
Assert-True (@($faqDocs | Where-Object { $_.enabled }).Count -eq 1) 'FAQ仍并存多个可检索版本'
Assert-True (@($faqDocs | Where-Object { -not $_.enabled -and $_.document_name -like '*4B2A-CANDIDATE*' }).Count -eq 1) '重复FAQ禁用记录缺失'
Assert-True ($inventory.active_document_count -eq 5) '活动CANDIDATE文档不是5份'

$config = Read-Json (Join-Path $r1Root 'baseline/dify-current-config.json')
Assert-True ($config.prompt_nodes[0].model.name -eq 'deepseek-v4-pro') '当前生成模型不是Pro'
Assert-True ($config.prompt_nodes[0].model.completion_params.temperature -eq 0.7) '当前温度不是0.7'
Assert-True ($config.knowledge_nodes[0].retrieval_mode -eq 'multiple') '当前检索实现不是混合检索'
Assert-True ($config.knowledge_nodes[0].multiple_retrieval_config.top_k -eq 3) 'TopK不是3'
Assert-True ($config.knowledge_nodes[0].multiple_retrieval_config.reranking_model.model -eq 'qwen3-rerank') 'Rerank不是qwen3-rerank'
Assert-True ($config.knowledge_nodes[0].multiple_retrieval_config.weights.vector_setting.vector_weight -eq 0.7 -and $config.knowledge_nodes[0].multiple_retrieval_config.weights.keyword_setting.keyword_weight -eq 0.3) '混合检索权重漂移'

$envPath = Join-Path $prototypeRoot '.env.local'
$datasetKeyLine = Get-Content -LiteralPath $envPath | Where-Object { $_ -match '^RAG_DIFY_DATASET_API_KEY=' } | Select-Object -First 1
$datasetKey = if ($datasetKeyLine) { $datasetKeyLine.Substring($datasetKeyLine.IndexOf('=') + 1).Trim() } else { '' }
if ($datasetKey) {
    & git -C $projectRoot grep -q -F -- $datasetKey
    Assert-True ($LASTEXITCODE -ne 0) 'Dataset Key进入Git跟踪文件'
}
$appJs = [System.IO.File]::ReadAllText((Join-Path $prototypeRoot 'app.js'), [System.Text.Encoding]::UTF8)
Assert-True ($appJs -notmatch 'RAG_DIFY_DATASET_API_KEY|RAG_API_KEY|api\.dify\.ai|Bearer\s+') '前端包含凭据'

$trackedAfter = @(& git -C $projectRoot status --porcelain --untracked-files=no)
Assert-True (($trackedBefore -join "`n") -eq ($trackedAfter -join "`n")) '测试改写Git跟踪文件'

if ($failures.Count -gt 0) {
    Write-Host "FAILED: $($failures.Count) 个R1验证失败" -ForegroundColor Red
    $failures | ForEach-Object { Write-Host "- $_" -ForegroundColor Red }
    exit 1
}
Write-Host 'PASSED: R1工程验证通过；P10质量仍为FAILED，未降低阈值' -ForegroundColor Yellow
