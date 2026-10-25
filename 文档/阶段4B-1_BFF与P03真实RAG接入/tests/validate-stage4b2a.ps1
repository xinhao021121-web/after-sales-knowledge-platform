param(
    [switch]$RequireReal,
    [switch]$RefreshReal
)

$ErrorActionPreference = 'Stop'
$base = Split-Path -Parent $PSScriptRoot
$projectRoot = Resolve-Path (Join-Path $base '..\..')
$prototypeRoot = Join-Path $projectRoot '文档\阶段3B_高保真交互原型'
$deliveryRoot = Join-Path $projectRoot '文档\阶段4B-2A_P06真实入库与P10真实评测'
$failures = [System.Collections.Generic.List[string]]::new()

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { $failures.Add($Message) }
}

function Read-Json {
    param([string]$Path)
    Assert-True (Test-Path -LiteralPath $Path -PathType Leaf) "缺少文件：$Path"
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $null }
    try {
        return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
    } catch {
        $failures.Add("JSON 无法解析：$Path")
        return $null
    }
}

function Get-EnvValue {
    param([string]$Path, [string]$Name)
    if (-not (Test-Path -LiteralPath $Path)) { return '' }
    $line = Get-Content -LiteralPath $Path |
        Where-Object { $_ -match "^$([regex]::Escape($Name))=" } |
        Select-Object -First 1
    if (-not $line) { return '' }
    return $line.Substring($line.IndexOf('=') + 1).Trim().Trim('"').Trim("'")
}

$trackedBefore = @(& git -C $projectRoot status --porcelain --untracked-files=no)

$required = @(
    'server/dify-dataset-adapter.mjs',
    'server/ingestion-service.mjs',
    'server/evaluation-service.mjs',
    'contracts/bff-4b2a.openapi.json',
    'tests/stage4b2-unit.mjs',
    'tests/e2e-stage4b2.mjs',
    'scripts/run-stage4b2-p06-real.mjs',
    'scripts/run-stage4b2-p10-real.mjs'
)
foreach ($relative in $required) {
    Assert-True (Test-Path -LiteralPath (Join-Path $base $relative) -PathType Leaf) "缺少4B-2A文件：$relative"
}

& node (Join-Path $base 'tests\server-unit.mjs')
Assert-True ($LASTEXITCODE -eq 0) '4B-1 服务端单元回归失败'
& node (Join-Path $base 'tests\stage4b2-unit.mjs')
Assert-True ($LASTEXITCODE -eq 0) '4B-2A Dataset/评测服务测试失败'
& node (Join-Path $base 'tests\e2e-stage4b2.mjs')
Assert-True ($LASTEXITCODE -eq 0) '4B-2A P06/P10 浏览器端到端测试失败'

$appJs = [System.IO.File]::ReadAllText((Join-Path $prototypeRoot 'app.js'), [System.Text.Encoding]::UTF8)
$envExample = [System.IO.File]::ReadAllText((Join-Path $prototypeRoot '.env.example'), [System.Text.Encoding]::UTF8)
$envLocalPath = Join-Path $prototypeRoot '.env.local'
$datasetKey = Get-EnvValue $envLocalPath 'RAG_DIFY_DATASET_API_KEY'
$datasetBaseUrl = Get-EnvValue $envLocalPath 'RAG_DIFY_DATASET_BASE_URL'
$appKey = Get-EnvValue $envLocalPath 'RAG_API_KEY'

Assert-True ($envExample -match '(?m)^RAG_DIFY_DATASET_API_KEY=\s*$') '环境模板中的Dataset Key并非空值'
Assert-True ($appJs -notmatch 'RAG_DIFY_DATASET_API_KEY|RAG_API_KEY|api\.dify\.ai|Bearer\s+') '前端包含服务端凭据字段或供应商地址'
Assert-True ($envExample -match '(?m)^RAG_DIFY_DATASET_BASE_URL=https://api\.dify\.ai/v1$') '环境模板缺少Dataset Base URL'
& git -C $projectRoot check-ignore -q '文档/阶段3B_高保真交互原型/.env.local'
Assert-True ($LASTEXITCODE -eq 0) '.env.local 未被Git忽略'
& git -C $projectRoot check-ignore -q '文档/阶段3B_高保真交互原型/data/runtime/stage4b2a-p10-real.json'
Assert-True ($LASTEXITCODE -eq 0) '运行评测结果未被Git忽略'

if ($datasetKey) {
    Assert-True ($datasetKey -ne $appKey) 'Dataset Key与App Key不得混用'
    & git -C $projectRoot grep -q -F -- $datasetKey
    Assert-True ($LASTEXITCODE -ne 0) 'Dataset Key出现在Git跟踪文件中'
    Assert-True ($datasetBaseUrl -eq 'https://api.dify.ai/v1') 'Dataset Base URL不是Dify Cloud v1'
} else {
    Write-Host 'DATASET_KEY=NOT_CONFIGURED' -ForegroundColor Yellow
}

$contract = Read-Json (Join-Path $base 'contracts/bff-4b2a.openapi.json')
foreach ($apiPath in @(
    '/api/dataset/health',
    '/api/candidate-documents',
    '/api/ingestions',
    '/api/ingestions/{ingestion_id}',
    '/api/ingestions/{ingestion_id}/retry',
    '/api/evaluations',
    '/api/evaluations/{run_id}',
    '/api/evaluations/meta'
)) {
    Assert-True ($null -ne $contract.paths.$apiPath) "契约缺少接口：$apiPath"
}

$p10EvidencePath = Join-Path $deliveryRoot 'evidence/p10-real-evaluation.json'
if ($RefreshReal) {
    & node (Join-Path $base 'scripts/run-stage4b2-p10-real.mjs') --update-evidence
    Assert-True ($LASTEXITCODE -eq 0) 'P10真实17条评测失败'
}
if (Test-Path -LiteralPath $p10EvidencePath -PathType Leaf) {
    $p10 = Read-Json $p10EvidencePath
    Assert-True ($p10.status -in @('PASSED','FAILED')) 'P10真实运行未进入明确终态'
    Assert-True (@($p10.results).Count -eq 17) 'P10真实结果不是17条'
    Assert-True ($p10.metrics.provider_call_count -eq 11) 'P10真实模型调用不是11次'
    Assert-True ($p10.metrics.p0_gate_count -eq 6) 'P10 P0短路不是6条'
    Assert-True ($p10.metrics.p0_final_failures -eq 0) 'P10 P0最终失败不为0'
    Assert-True ($p10.metrics.citation_failures -eq 0) 'P10存在ANSWERED引用门禁失败'
    Assert-True ($null -ne $p10.metrics.quality_gate_status) 'P10缺少质量门槛结果'
    Assert-True ($p10.source_mode -eq 'REAL_DIFY') 'P10真实证据未标记REAL_DIFY'
    Assert-True ($p10.metrics.cost.cost_status -eq 'COST_UNKNOWN') 'P10成本状态不是COST_UNKNOWN'
    Assert-True ($null -eq $p10.metrics.cost.all_effective_response_cost) '未知单价却填写了有效响应成本'
} elseif ($RequireReal) {
    $failures.Add('缺少P10真实评测证据')
}

$p06EvidencePath = Join-Path $deliveryRoot 'evidence/p06-real-ingestion.json'
if ($RefreshReal -and $datasetKey) {
    & node (Join-Path $base 'scripts/run-stage4b2-p06-real.mjs') --update-evidence
    Assert-True ($LASTEXITCODE -eq 0) 'P06真实文档上传与索引失败'
}
if (Test-Path -LiteralPath $p06EvidencePath -PathType Leaf) {
    $p06 = Read-Json $p06EvidencePath
    Assert-True ($p06.ingestion.document_status -eq 'DOCUMENT_READY') 'P06文档状态不是DOCUMENT_READY'
    Assert-True ($p06.ingestion.provider_status -eq 'READY') 'P06 Dify索引状态不是READY'
    Assert-True ($p06.ingestion.publishable -eq $true) 'P06索引完成后仍不可发布'
    Assert-True ($null -ne $p06.ingestion.provider_document_id) 'P06缺少供应商文档ID'
    Assert-True ($p06.ingestion.source_mode -eq 'REAL_DIFY') 'P06真实证据未标记REAL_DIFY'
} elseif ($RequireReal) {
    $failures.Add('缺少P06真实入库证据')
}

if ($RequireReal) {
    Assert-True ([bool]$datasetKey) '缺少Dataset Key，无法完成真实P06验收'
}

$trackedAfter = @(& git -C $projectRoot status --porcelain --untracked-files=no)
Assert-True (($trackedBefore -join "`n") -eq ($trackedAfter -join "`n")) '测试改写了Git跟踪文件'

if ($failures.Count -gt 0) {
    Write-Host "FAILED: $($failures.Count) 个验证失败" -ForegroundColor Red
    $failures | ForEach-Object { Write-Host "- $_" -ForegroundColor Red }
    exit 1
}

Write-Host 'PASSED: 阶段4B-2A 服务、浏览器、契约、成本分离与测试卫生验证通过' -ForegroundColor Green
if ($RequireReal) {
    Write-Host '- 真实P06与真实P10证据齐全'
} else {
    Write-Host '- 默认为完整离线/适配器验证；真实P06需Dataset Key'
}
