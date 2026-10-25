$ErrorActionPreference = 'Stop'
$base = Split-Path -Parent $PSScriptRoot
$skipLiveProvider = $env:STAGE4B1_SKIP_LIVE -eq '1'
$projectRoot = Resolve-Path (Join-Path $base '..\..')
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

function Get-PngSize {
    param([string]$Path)
    $bytes = [System.IO.File]::ReadAllBytes($Path)
    if ($bytes.Length -lt 24) { return $null }
    $width = ([int64]$bytes[16] -shl 24) -bor ([int64]$bytes[17] -shl 16) -bor ([int64]$bytes[18] -shl 8) -bor [int64]$bytes[19]
    $height = ([int64]$bytes[20] -shl 24) -bor ([int64]$bytes[21] -shl 16) -bor ([int64]$bytes[22] -shl 8) -bor [int64]$bytes[23]
    return [PSCustomObject]@{ Width=$width; Height=$height }
}

$requiredDelivery = @(
    'README.md',
    '01_BFF与DifyAdapter实现.md',
    '02_安全边界与P0门禁.md',
    '03_接口契约更新.md',
    '04_P03真实RAG接入说明.md',
    '05_数据持久化与凭据.md',
    '06_错误与超时处理.md',
    '07_真实请求样例.md',
    '08_测试报告.md',
    '09_阶段4B1验收记录.md',
    '10_复审修正记录.md',
    'package.json',
    'contracts/bff-p03.openapi.json',
    'server/config.mjs',
    'server/policy.mjs',
    'server/catalog.mjs',
    'server/dify-adapter.mjs',
    'server/normalize.mjs',
    'server/cost.mjs',
    'server/store.mjs',
    'server/app.mjs',
    'server/start.mjs',
    'tests/server-unit.mjs',
    'tests/e2e-bff.mjs',
    'tests/validate-stage4b1.ps1',
    'examples/health.json',
    'examples/retrieval-search.json',
    'examples/p03-real-answer.json',
    'examples/p0-baseline-verification.json',
    'examples/observed-timeout.json',
    'examples/claim-support-test.json',
    'examples/dify-config-evidence.json',
    'scripts/run-flash-ab.mjs',
    'scripts/build-flash-ab-comparison.mjs',
    'configs/CFG-RERANK-PRO-20261025.json',
    'configs/dify-system-prompt-v2.txt',
    'configs/dify-system-prompt-v2-effective.txt',
    'model-validation/README.md',
    'model-validation/comparison.json',
    'model-validation/model-status.json',
    'model-validation/manual-review.json',
    'model-validation/cost-decision.md',
    'model-validation/publish-history.md',
    'model-validation/cost-summary.csv',
    'model-validation/timing-summary.csv',
    'model-validation/rounds/PRO-R1/normalized.json',
    'model-validation/rounds/FLASH-R1/normalized.json',
    'model-validation/rounds/FLASH-R2/normalized.json',
    'screenshots/README.md'
)
foreach ($relative in $requiredDelivery) {
    Assert-True (Test-Path -LiteralPath (Join-Path $base $relative) -PathType Leaf) "缺少交付文件：$relative"
}

$requiredPrototype = @(
    'server/index.mjs',
    'data/catalog.json',
    'data/README.md',
    'data/runtime/.gitkeep',
    '.env.example',
    '.gitignore',
    'index.html',
    'app.js',
    'app.css'
)
foreach ($relative in $requiredPrototype) {
    Assert-True (Test-Path -LiteralPath (Join-Path $prototypeRoot $relative) -PathType Leaf) "原型目录缺少文件：$relative"
}

& node (Join-Path $base 'tests\server-unit.mjs')
Assert-True ($LASTEXITCODE -eq 0) 'BFF 单元/API 测试失败'
if ($skipLiveProvider) {
    Write-Host 'SKIPPED_LIVE_PROVIDER: 使用已提交的真实P03证据，不发起新的Dify请求' -ForegroundColor Yellow
} else {
    & node (Join-Path $base 'tests\e2e-bff.mjs')
    Assert-True ($LASTEXITCODE -eq 0) '真实 BFF/P03 端到端测试失败'
}

$example = Read-Json (Join-Path $base 'examples/health.json')
$retrieval = Read-Json (Join-Path $base 'examples/retrieval-search.json')
$answer = Read-Json (Join-Path $base 'examples/p03-real-answer.json')
$p0 = Read-Json (Join-Path $base 'examples/p0-baseline-verification.json')
$timeout = Read-Json (Join-Path $base 'examples/observed-timeout.json')
$claimFixture = Read-Json (Join-Path $base 'examples/claim-support-test.json')
$difyEvidence = Read-Json (Join-Path $base 'examples/dify-config-evidence.json')
$proConfig = Read-Json (Join-Path $base 'configs/CFG-RERANK-PRO-20261025.json')
$contract = Read-Json (Join-Path $base 'contracts/bff-p03.openapi.json')
$catalog = Read-Json (Join-Path $prototypeRoot 'data/catalog.json')
$modelComparison = Read-Json (Join-Path $base 'model-validation/comparison.json')
$modelStatus = Read-Json (Join-Path $base 'model-validation/model-status.json')
$modelReview = Read-Json (Join-Path $base 'model-validation/manual-review.json')
$flashRuns = @{}
foreach ($roundId in @('FLASH-R1', 'FLASH-R2')) {
    $flashRuns[$roundId] = Read-Json (Join-Path $base "model-validation/rounds/$roundId/normalized.json")
}
$proRun = Read-Json (Join-Path $base 'model-validation/rounds/PRO-R1/normalized.json')

Assert-True ($example.status -eq 'ok') '真实健康检查不是 ok'
Assert-True ($example.provider.mode -eq 'advanced-chat') 'Dify 模式不是 advanced-chat'
Assert-True ($example.generation_model -eq 'deepseek-v4-pro') '生成模型不是 Pro'
Assert-True ($example.cost_status -eq 'COST_UNKNOWN') '健康检查成本状态错误'
Assert-True ($example.p0_gate -eq 'BFF_BEFORE_DIFY') '健康检查未声明 P0 前置门禁'
Assert-True (@($retrieval.response.hits).Count -ge 1) '真实检索样例没有命中'
Assert-True (@($retrieval.response.hits | Where-Object { -not $_.source.doc_id -or -not $_.segment_id -or -not $_.kb_version_id }).Count -eq 0) '真实检索引用字段不完整'
Assert-True ($answer.response.citation_support.required -eq $true) 'P03 真实回答未执行claim引用门禁'
Assert-True ($answer.response.citation_support.passed -eq $true) 'P03 真实回答claim门禁未通过'
Assert-True ($answer.response.answer_status -eq 'ANSWERED') 'P03真实回答不是ANSWERED'
Assert-True (@($answer.response.citations).Count -ge 1) 'ANSWERED没有引用'
Assert-True ($answer.response.cost.model -eq 'deepseek-v4-pro') 'P03成本模型不是Pro'
Assert-True ($answer.response.cost.cost_status -eq 'COST_UNKNOWN') 'P03成本状态不是COST_UNKNOWN'
Assert-True ($null -eq $answer.response.cost.estimated_total_cost) '未知单价却填写了估算金额'
Assert-True (@($answer.response.citations | Where-Object { -not $_.source.doc_id -or -not $_.segment_id -or -not $_.kb_version_id -or @($_.supported_claims).Count -eq 0 -or $_.traceable -ne $true }).Count -eq 0) 'P03存在标题级或不可追溯引用'
Assert-True ($answer.asq_status_before_confirmation -eq 'ASQ_CONTEXT_PENDING') '获取真实结果时 ASQ 被提前更新'
Assert-True (@($p0.results).Count -eq 6) 'P0 样例不是 6 条'
Assert-True (@($p0.results | Where-Object { $_.response.answer_status -ne 'BLOCKED_SAFETY' -or $_.response.provider_called -ne $false -or $_.response.provider_request_id -ne $null }).Count -eq 0) 'P0 未全部前置阻断'
Assert-True (@($p0.results | Where-Object { $_.response.citations[0].chunk_id -ne 'CHUNK-SAFE-STOP-01' }).Count -eq 0) 'P0 未引用固定安全切片'
Assert-True (@($p0.results | Where-Object { $_.response.cost.cost_status -ne 'COST_UNKNOWN' -or $_.response.cost.effective_answer -ne $false }).Count -eq 0) 'P0成本字段错误'
Assert-True ($timeout.error_code -eq 'RETRIEVAL_TIMEOUT') '真实超时样例错误码不符'
Assert-True ($null -eq $timeout.provider_request_id) '超时样例不得返回供应商请求成功标识'
Assert-True (@($catalog.documents).Count -eq 13) '本地来源目录不完整'
Assert-True ($catalog.safety_chunk.chunk_id -eq 'CHUNK-SAFE-STOP-01') '安全切片映射缺失'
Assert-True ($proConfig.generation_model -eq 'deepseek-v4-pro') 'Pro配置模型错误'
Assert-True ($proConfig.published_version -eq 12) 'Pro发布版本不是12'
Assert-True ($proConfig.retrieval.top_k -eq 3 -and $proConfig.retrieval.rerank_model -eq 'qwen3-rerank') 'Pro检索配置错误'
Assert-True ($proConfig.chunking.chunk_size -eq 700 -and $proConfig.chunking.overlap -eq 100) 'Pro切片配置错误'
Assert-True ($difyEvidence.generation_model -eq 'deepseek-v4-pro') 'Dify证据模型不是Pro'
Assert-True ($difyEvidence.published_version -eq 12) 'Dify证据版本不是12'
Assert-True ($difyEvidence.prompt_contains_body_evidence_rules -eq $true) 'Dify证据未包含正文证据Prompt'
$effectivePromptHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $base 'configs/dify-system-prompt-v2-effective.txt')).Hash.ToLower()
Assert-True ($effectivePromptHash -eq $difyEvidence.prompt_sha256) 'Dify Prompt证据哈希不一致'
Assert-True ($claimFixture.source_mode -eq 'TEST_FIXTURE_NOT_DIFY') 'claim夹具未标识非真实Dify'
Assert-True ($claimFixture.answered.answer_status -eq 'ANSWERED') 'claim夹具未生成ANSWERED'
Assert-True (@($claimFixture.answered.citations | Where-Object { @($_.supported_claims).Count -lt 1 -or $_.traceable -ne $true }).Count -eq 0) 'claim夹具含无具体主张的引用'
Assert-True ($claimFixture.no_claim_downgrade.status -eq 'NEED_CLARIFICATION' -and $claimFixture.no_claim_downgrade.citation_support -eq $false) '无claim支持降级夹具错误'

foreach ($apiPath in @('/api/health','/api/retrieval/search','/api/answers')) {
    Assert-True ($null -ne $contract.paths.$apiPath) "OpenAPI 缺少接口：$apiPath"
}
$requestFields = @('question','asq_id','knowledge_item_id','product_model','channel','role','tenant_id','environment','top_k','retrieval_mode','rerank','metadata_filter','customer_context','citation_mode')
foreach ($field in $requestFields) {
    Assert-True ($null -ne $contract.components.schemas.AnswerRequest.properties.$field) "契约缺少请求字段：$field"
}
$responseFields = @('answer_status','answer','suggested_action','business_conditions','citations','citation_support','cost','risk','provider_request_id','request_id','timing_ms','error_code')
foreach ($field in $responseFields) {
    Assert-True ($null -ne $contract.components.schemas.AnswerResponse.properties.$field) "契约缺少响应字段：$field"
}
foreach ($citationField in @('citation_id','source','supported_claims','traceable')) {
    Assert-True ($contract.components.schemas.Citation.properties.PSObject.Properties.Name -contains $citationField) "契约缺少引用字段：$citationField"
}
foreach ($costField in @('provider','model','prompt_tokens','completion_tokens','total_tokens','provider_latency_ms','estimated_input_cost','estimated_output_cost','estimated_total_cost','cost_status','answer_status','citation_support_passed','effective_answer')) {
    Assert-True ($contract.components.schemas.CostRecord.properties.PSObject.Properties.Name -contains $costField) "契约缺少成本字段：$costField"
}

$appJs = [System.IO.File]::ReadAllText((Join-Path $prototypeRoot 'app.js'), [System.Text.Encoding]::UTF8)
$envExample = [System.IO.File]::ReadAllText((Join-Path $prototypeRoot '.env.example'), [System.Text.Encoding]::UTF8)
$envLocalPath = Join-Path $prototypeRoot '.env.local'
$envLocal = if (Test-Path -LiteralPath $envLocalPath) { [System.IO.File]::ReadAllText($envLocalPath, [System.Text.Encoding]::UTF8) } else { '' }
Assert-True ($appJs -match 'fetch\("/api/answers"') 'P03 未使用同源本地 BFF'
Assert-True ($appJs -notmatch 'api\.dify\.ai|RAG_API_KEY|Bearer\s+') '前端包含供应商地址或凭据字段'
Assert-True ($appJs -match 'realRag' -and $appJs -match 'p03-source-mode' -and $appJs -match 'CONFLICT_HOLD') 'P03 真实模式或冲突状态未接入'
Assert-True ($appJs -match '确认采用建议' -and $appJs -match '确认已执行止损') 'P03 未实现人工确认状态转换'
Assert-True ($appJs -match 'pageHeader\(state\.asq\.status') 'P03页头未显示ASQ状态'
Assert-True ($appJs -match 'RAG结果：') 'P03未将RAG结果作为独立状态展示'
Assert-True ($appJs -match 'send-real-advice' -and $appJs -match 'state\.asq\.status = "ASQ_RESPONDED"') '发送成功后未进入ASQ_RESPONDED'
Assert-True ($envExample -match 'RAG_GENERATION_MODEL=deepseek-v4-pro') '环境模板模型不正确'
Assert-True ($envLocal -match '(?m)^RAG_GENERATION_MODEL=deepseek-v4-pro\s*$') '本地环境模型不是Pro'
Assert-True ($envExample -match '^RAG_API_KEY=\s*$' -or $envExample -match '(?m)^RAG_API_KEY=$') '环境模板包含真实 API Key'

& git -C $projectRoot check-ignore -q '文档/阶段3B_高保真交互原型/.env.local'
Assert-True ($LASTEXITCODE -eq 0) '.env.local 未被 Git 忽略'
& git -C $projectRoot check-ignore -q '文档/阶段3B_高保真交互原型/data/runtime/audit.ndjson'
Assert-True ($LASTEXITCODE -eq 0) '运行审计文件未被 Git 忽略'

$scanRoots = @($base, (Join-Path $prototypeRoot 'server'), (Join-Path $prototypeRoot 'data'))
foreach ($scanRoot in $scanRoots) {
    if (-not (Test-Path -LiteralPath $scanRoot)) { continue }
    foreach ($file in Get-ChildItem -LiteralPath $scanRoot -Recurse -File) {
        if ($file.FullName -eq $PSCommandPath) { continue }
        if ($file.Name -like '.env.local') { continue }
        if ($file.Extension -notin @('.md','.json','.mjs','.js','.ps1','.css','.html','.example')) { continue }
        $text = [System.IO.File]::ReadAllText($file.FullName, [System.Text.Encoding]::UTF8)
        Assert-True ($text -notmatch '\bsk-[A-Za-z0-9_-]{20,}\b') "疑似 API Key：$($file.FullName)"
        Assert-True ($text -notmatch 'Bearer\s+[A-Za-z0-9._-]{20,}') "疑似 Bearer Token：$($file.FullName)"
        Assert-True ($text -notmatch 'RAG_API_KEY=[^\r\n]+') "疑似非空 RAG_API_KEY：$($file.FullName)"
    }
}

foreach ($roundId in @('FLASH-R1', 'FLASH-R2')) {
    $run = $flashRuns[$roundId]
    $rawFiles = @(Get-ChildItem -LiteralPath (Join-Path $base "model-validation/rounds/$roundId/raw") -Filter '*.json' -File -ErrorAction SilentlyContinue)
    Assert-True ($rawFiles.Count -eq 17) "$roundId Flash原始记录不是17条"
    Assert-True ($run.task_count -eq 17) "$roundId Flash任务数不是17"
    Assert-True ($run.provider_call_count -eq 11) "$roundId Flash真实调用不是11"
    Assert-True ($run.p0_gate_count -eq 6) "$roundId P0门禁不是6"
    Assert-True ($run.model -eq 'deepseek-v4-flash') "$roundId 模型不是Flash"
    Assert-True ($run.provider_published_version -eq 9) "$roundId Dify版本不是#9"
}
$proRawFiles = @(Get-ChildItem -LiteralPath (Join-Path $base 'model-validation/rounds/PRO-R1/raw') -Filter '*.json' -File -ErrorAction SilentlyContinue)
Assert-True ($proRawFiles.Count -eq 17) 'Pro原始记录不是17条'
Assert-True ($proRun.task_count -eq 17 -and $proRun.provider_call_count -eq 11 -and $proRun.p0_gate_count -eq 6) 'Pro回归任务/调用数量错误'
Assert-True ($proRun.model -eq 'deepseek-v4-pro' -and $proRun.provider_published_version -eq 12) 'Pro回归模型或版本错误'
Assert-True (@($proRun.results | Where-Object { $_.provider_called -and (-not $_.cost -or $_.cost.cost_status -ne 'COST_UNKNOWN' -or $null -eq $_.cost.prompt_tokens -or $null -eq $_.cost.completion_tokens -or $null -eq $_.cost.total_tokens) }).Count -eq 0) 'Pro真实响应成本字段不完整'
Assert-True ($modelComparison.verdict -eq 'PRO_PRIMARY_PASS') 'Pro正式回归未通过'
Assert-True ($modelComparison.pro_meets_stage4a_baseline -eq $true) 'Pro质量低于阶段4A基线'
Assert-True ($modelComparison.flash_vs_pro_verdict -eq 'FLASH_DEGRADED') 'Flash相对Pro未判定退化'
Assert-True ($modelComparison.flash_rounds.Count -eq 2) 'Flash对照不是两轮'
foreach ($round in $modelComparison.flash_rounds) {
    Assert-True ($round.recall_at_3_core -lt $modelComparison.pro.recall_at_3_core) "$($round.round_id) Recall未显示退化"
    Assert-True ($round.correct_source_hits_core -lt $modelComparison.pro.correct_source_hits_core) "$($round.round_id) 来源命中未显示退化"
    Assert-True ($round.business_action_correct -eq 17) "$($round.round_id) 业务动作不是17/17"
    Assert-True ($round.followup_complete -eq 17) "$($round.round_id) 追问不是17/17"
    Assert-True ($round.correct_refusal -eq 4) "$($round.round_id) 拒答不是4/4"
    Assert-True ($round.p0_final_failures -eq 0) "$($round.round_id) P0存在失败"
    Assert-True ($round.timing.provider.average_ms -gt 0 -and $round.timing.provider.median_ms -gt 0 -and $round.timing.provider.p95_ms -gt 0) "$($round.round_id) 缺少平均/中位数/P95"
}
Assert-True (@($modelComparison.flash_rounds | Where-Object { $_.citation_support_core.passed -lt $modelComparison.pro.citation_support_core.passed }).Count -ge 1) 'Flash两轮均未显示claim引用退化'
Assert-True ($modelComparison.pro.recall_at_3_core -ge 0.9167) 'Pro Recall低于4A基线'
Assert-True ($modelComparison.pro.correct_source_hits_core -eq 12) 'Pro来源命中不是12/12'
Assert-True ($modelComparison.pro.citation_support_core.passed -ge $modelComparison.stage4a_pro_baseline.citation_support_core.passed) 'Pro claim引用低于4A基线'
Assert-True ($modelComparison.pro.p0_final_failures -eq 0) 'Pro P0存在失败'
Assert-True ($modelStatus.status -eq 'PRO_PRIMARY_VALIDATED_FLASH_COST_CANDIDATE') 'Pro主模型验证状态错误'
Assert-True ($modelStatus.recommended_primary_model -eq 'deepseek-v4-pro' -and $modelStatus.active_dify_model -eq 'deepseek-v4-pro') '当前主模型不是Pro'
Assert-True ($modelStatus.active_dify_version -eq 12) '模型状态版本不是12'
Assert-True ($modelStatus.flash_status -eq 'COST_OPTIMIZATION_CANDIDATE_ONLY') 'Flash状态不是4B2成本候选'
Assert-True ($modelStatus.automatic_provider_switch_performed -eq $true) '未记录已批准的Pro切换'
$costRows = @(Import-Csv -LiteralPath (Join-Path $base 'model-validation/cost-summary.csv'))
Assert-True ($costRows.Count -eq 3) '成本汇总必须包含Pro和两轮Flash'
Assert-True (@($costRows | Where-Object { $_.cost_status -ne 'COST_UNKNOWN' }).Count -eq 0) '未知单价时必须标记COST_UNKNOWN'
Assert-True (@($costRows | Where-Object { $_.fallback_count -ne '0' }).Count -eq 0) '本阶段回退次数必须为0'
Assert-True (@($costRows | Where-Object { $_.manual_escalation_count -ne '8' }).Count -eq 0) '人工升级次数不是8'
Assert-True (@($costRows | Where-Object { $_.effective_answers -ne '17' }).Count -eq 0) '可验收有效回答数不是17'
foreach ($roundId in @('PRO-R1','FLASH-R1', 'FLASH-R2')) {
    Assert-True (@($modelReview.rounds.$roundId.PSObject.Properties).Count -eq 17) "$roundId 人工复核不是17条"
}

$shots = @(
    @{ Name='P03_REAL_RAG_1440.png'; Width=1440 },
    @{ Name='P03_REAL_RAG_320.png'; Width=320 },
    @{ Name='P03_P0_SAFETY_1440.png'; Width=1440 },
    @{ Name='P03_P0_SAFETY_320.png'; Width=320 },
    @{ Name='DIFY_CONFIG_PROMPT_PRO_V12.png'; Width=1600 },
    @{ Name='DIFY_VERSION_V12.png'; Width=1600 },
    @{ Name='DIFY_VERSION_HISTORY.png'; Width=1600 }
)
foreach ($shot in $shots) {
    $path = Join-Path $base "screenshots/$($shot.Name)"
    Assert-True (Test-Path -LiteralPath $path -PathType Leaf) "缺少截图：$($shot.Name)"
    if (Test-Path -LiteralPath $path -PathType Leaf) {
        $size = Get-PngSize $path
        Assert-True ($null -ne $size) "截图不是有效 PNG：$($shot.Name)"
        if ($null -ne $size) {
            Assert-True ($size.Width -eq $shot.Width) "截图宽度错误：$($shot.Name)"
            Assert-True ($size.Height -gt 500) "截图高度异常：$($shot.Name)"
        }
    }
}

& pwsh -NoProfile -File (Join-Path $prototypeRoot 'tests\validate-stage3b-full.ps1')
Assert-True ($LASTEXITCODE -eq 0) '阶段3B页面与15条流程回归失败'
& pwsh -NoProfile -File (Join-Path (Join-Path $projectRoot '文档\阶段4A_RAG能力验证') 'tests\validate-stage4a.ps1')
Assert-True ($LASTEXITCODE -eq 0) '阶段4A签署后回归失败'

if ($failures.Count -gt 0) {
    Write-Host "FAILED: $($failures.Count) 个验证失败" -ForegroundColor Red
    $failures | ForEach-Object { Write-Host ('- ' + $_) -ForegroundColor Red }
    exit 1
}

Write-Host 'PASSED: 阶段4B-1 BFF、Dify Adapter、P0门禁、P03真实RAG与原型回归验证通过' -ForegroundColor Green
Write-Host '- P03：真实 Dify 检索与带引用问答'
Write-Host '- P0：6/6 BFF 前置阻断，provider_called=0'
Write-Host '- 引用：ANSWERED 必须具备具体 supported_claims + doc_id + segment_id + KB 版本'
Write-Host '- Pro：#12，17条回归通过4A质量基线'
Write-Host '- Flash：2轮×17条保留，作为4B2成本优化候选'
Write-Host '- 状态：页头ASQ与RAG结果分离；确认后才推进ASQ'
Write-Host '- 回归：阶段3B 13页、5类页面状态、15条流程与阶段4A签署记录'
if ($skipLiveProvider) {
    Write-Host '- 供应商实时调用：已显式跳过；真实样例与证据仍参与校验'
}
