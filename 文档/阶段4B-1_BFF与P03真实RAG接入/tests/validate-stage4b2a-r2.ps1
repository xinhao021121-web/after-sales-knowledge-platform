$ErrorActionPreference = 'Stop'
$base = Split-Path -Parent $PSScriptRoot
$projectRoot = Resolve-Path (Join-Path $base '..\..')
$recoveryRoot = Join-Path $projectRoot '文档\阶段4B-2A-R2_质量恢复'
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
    try {
        return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
    } catch {
        $failures.Add("JSON无法解析：$Path")
        return $null
    }
}

$required = @(
    'README.md',
    '01_原失败基线.md',
    '02_R03文档级多样性方案.md',
    '03_R04回答策略诊断.md',
    '04_Dify配置变更前后对照.md',
    '05_正式17条真实重跑证据.md',
    '06_保留样例结果.md',
    '07_测试报告.md',
    '08_验收记录.md',
    '09_决策日志.md',
    'baseline/p10-failed-before-r1.json',
    'baseline/p10-real-after-r1.json',
    'baseline/p06-canonical-update-final-r1.json',
    'baseline/candidate-inventory-after-r1.json',
    'baseline/p10-r2-rate-limit-failure.json',
    'baseline/formal-17-rate-limit-failure/POC-R03.json',
    'evidence/p10-real-r2.json',
    'evidence/holdout-real-r2.json',
    'evidence/candidate-inventory-after-r2.json',
    'evidence/dify-config-before-change.json',
    'evidence/dify-config-after-r2.json',
    'evidence/dify-config-comparison-r2.json',
    'evidence/r03-retrieval-comparison.json',
    'evidence/r04-answer-diagnosis.json',
    'evidence/retrieval-core-comparison.json',
    'evidence/quality-gate-r2.json',
    'holdout/retention-set-v1.0.json',
    'configs/r2-system-prompt.txt',
    'screenshots/DIFY_R2_FINAL_1440.png',
    'screenshots/P10_R2_PASSED_1440.png',
    'screenshots/P10_R2_PASSED_320.png',
    'screenshots/P06_R2_CANONICAL_1440.png',
    'screenshots/P06_R2_CANONICAL_320.png',
    'scripts/capture-r2-screenshots.mjs',
    'scripts/build-r2-evidence.mjs',
    'scripts/capture-candidate-inventory.mjs'
)
foreach ($relative in $required) {
    Assert-True (Test-Path -LiteralPath (Join-Path $recoveryRoot $relative) -PathType Leaf) "R2缺少交付文件：$relative"
}
Assert-True (Test-Path -LiteralPath (Join-Path $base 'scripts/run-stage4b2-r2-p10-real.mjs') -PathType Leaf) '缺少R2正式评测入口'
Assert-True (Test-Path -LiteralPath (Join-Path $base 'scripts/run-stage4b2-r2-holdout.mjs') -PathType Leaf) '缺少R2保留样例入口'

$trackedBefore = @(& git -C $projectRoot status --porcelain --untracked-files=no)

& node (Join-Path $base 'tests\server-unit.mjs')
Assert-True ($LASTEXITCODE -eq 0) 'BFF服务端单元测试失败'
& node (Join-Path $base 'tests\stage4b2-unit.mjs')
Assert-True ($LASTEXITCODE -eq 0) '文档多样性、回答策略与评测单元测试失败'
& node (Join-Path $base 'tests\e2e-stage4b2.mjs')
Assert-True ($LASTEXITCODE -eq 0) 'P06/P10浏览器端到端测试失败'

$p10 = Read-Json (Join-Path $recoveryRoot 'evidence/p10-real-r2.json')
Assert-True ($p10.status -eq 'PASSED') '正式17条最终状态不是PASSED'
Assert-True ($p10.source_mode -eq 'REAL_DIFY') '正式结果不是REAL_DIFY'
Assert-True ($p10.model -eq 'deepseek-v4-pro') '正式结果不是deepseek-v4-pro'
Assert-True ($p10.dataset -eq 'CANDIDATE') '正式结果不是CANDIDATE'
Assert-True (@($p10.results).Count -eq 17) '正式结果不是17条'
Assert-True ($p10.metrics.retrieval_completed_core_count -eq 7) '检索完成核心任务不是7'
Assert-True ($p10.metrics.retrieval_expected_source_count -eq 9) '期望来源分母不是9'
Assert-True ($p10.metrics.retrieval_covered_source_count -eq 9) '覆盖来源不是9'
Assert-True ($p10.metrics.recall_at_3_core -eq 1) '文档级Recall@3不是1.0000'
Assert-True ($p10.metrics.correct_source_hits_core -eq 7) '来源命中任务不是7/7'
Assert-True ($p10.metrics.correct_source_denominator -eq 7) '来源命中分母不是7'
Assert-True ($p10.metrics.source_hit_rate_core -eq 1) '来源命中率不是1'
Assert-True ($p10.metrics.p0_final_failures -eq 0) 'P0最终失败不为0'
Assert-True ($p10.metrics.citation_failures -eq 0) 'Claim引用失败不为0'
Assert-True ($p10.metrics.provider_errors -eq 0) '存在供应商未处理错误'
Assert-True ($p10.metrics.cost.model_effective_answer_count -ge 1) '没有模型型有效ANSWERED'
Assert-True ($p10.metrics.cost.cost_status -eq 'COST_UNKNOWN') '成本不是COST_UNKNOWN'
Assert-True ($null -eq $p10.metrics.cost.all_effective_response_cost) '未知成本却填写金额'
Assert-True ($p10.metrics.quality_baseline.recall_at_3_core -eq 0.9167) 'Recall阈值被修改'

foreach ($result in $p10.results) {
    Assert-True (-not [string]::IsNullOrWhiteSpace([string]$result.task_id)) '任务ID缺失'
    Assert-True (-not [string]::IsNullOrWhiteSpace([string]$result.evidence.answer)) '存在空回答'
    if ($result.answer_status -eq 'ANSWERED') {
        Assert-True ($result.citation_support_passed -eq $true) "ANSWERED未通过Claim：$($result.task_id)"
        Assert-True (@($result.citations).Count -ge 1) "ANSWERED没有引用：$($result.task_id)"
        Assert-True ($result.business_action_correct -eq $true) "ANSWERED业务动作错误：$($result.task_id)"
    }
    if ($result.p0) {
        Assert-True ($result.p0_passed -eq $true) "P0失败：$($result.task_id)"
        Assert-True ($result.provider_called -eq $false) "P0调用了供应商：$($result.task_id)"
    } else {
        Assert-True ($result.provider_called -eq $true) "非P0未调用供应商：$($result.task_id)"
        Assert-True (@($result.evidence.retrieved).Count -eq 3) "最终Top3数量错误：$($result.task_id)"
        $docIds = @($result.evidence.retrieved | ForEach-Object { $_.document_id })
        $segmentIds = @($result.evidence.retrieved | ForEach-Object { $_.segment_id })
        Assert-True ((@($docIds | Select-Object -Unique).Count) -eq $docIds.Count) "同一文档重复占Top3：$($result.task_id)"
        Assert-True ((@($segmentIds | Select-Object -Unique).Count) -eq $segmentIds.Count) "同一segment重复占Top3：$($result.task_id)"
        Assert-True (@($result.evidence.retrieved | Where-Object { -not $_.document_id -or -not $_.segment_id -or $null -eq $_.score }).Count -eq 0) "Top3证据字段不完整：$($result.task_id)"
        Assert-True ($result.retrieval_diversity.displayed_top_k -eq 3) "可见TopK不是3：$($result.task_id)"
        Assert-True ($result.retrieval_diversity.requested_internal_top_k -eq 10) "内部候选池请求不是Top10：$($result.task_id)"
    }
}

$r03 = $p10.results | Where-Object { $_.task_id -eq 'POC-R03' }
Assert-True (@($r03.covered_source_ids) -contains 'DOC-RETURN-V1') 'R03未覆盖退货文档'
Assert-True (@($r03.covered_source_ids) -contains 'DOC-CHANNEL-V1') 'R03未覆盖渠道文档'
Assert-True ($r03.retrieval_diversity.internal_candidate_pool_size -ge 10) 'R03内部候选池未扩大'
Assert-True ($r03.retrieval_diversity.internal_candidate_pool_size -ne $r03.retrieval_diversity.displayed_top_k) '内部候选池与展示Top3混淆'

$r04 = $p10.results | Where-Object { $_.task_id -eq 'POC-R04' }
Assert-True ($r04.answer_status -eq 'ANSWERED') 'R04不是ANSWERED'
Assert-True ($r04.citation_support_passed -eq $true) 'R04 Claim门禁未通过'
Assert-True ($r04.forbidden_action_match -eq $null) 'R04触发越权承诺'
Assert-True ($null -ne $r04.bff_request_id -and $null -ne $r04.provider_request_id) 'R04请求ID缺失'

$holdout = Read-Json (Join-Path $recoveryRoot 'evidence/holdout-real-r2.json')
Assert-True ($holdout.used_for_tuning -eq $false) '保留样例标记参与调参'
Assert-True (@($holdout.results).Count -eq 3) '保留样例不是3条'
Assert-True ($holdout.status_all_accepted -eq $true) '保留样例存在状态不匹配'
Assert-True ($holdout.expected_source_count -eq 2 -and $holdout.covered_source_count -eq 2) '保留样例非P0来源不是2/2'
Assert-True ($holdout.recall_at_3 -eq 1) '保留样例非P0 Recall不是1'
Assert-True ($holdout.p0_failures -eq 0) '保留样例P0失败'
Assert-True ($holdout.forbidden_action_failures -eq 0) '保留样例存在禁止动作'
Assert-True ($holdout.provider_errors -eq 0) '保留样例存在供应商错误'
Assert-True ($holdout.cost_status -eq 'COST_UNKNOWN') '保留样例成本状态错误'
$h01 = $holdout.results | Where-Object { $_.task_id -eq 'RET-H01' }
$h02 = $holdout.results | Where-Object { $_.task_id -eq 'RET-H02' }
$h03 = $holdout.results | Where-Object { $_.task_id -eq 'RET-H03' }
Assert-True ($h01.covered_source_count -eq 2) '保留跨文档样例未覆盖2个来源'
Assert-True ($h02.answer_status -eq 'NO_ANSWER') '知识不足保留样例未拒答'
Assert-True ($h03.answer_status -eq 'BLOCKED_SAFETY' -and $h03.p0_passed -eq $true) '安全售后保留样例未前置阻断'

$inventory = Read-Json (Join-Path $recoveryRoot 'evidence/candidate-inventory-after-r2.json')
Assert-True ($inventory.active_document_count -eq 5) '活动CANDIDATE文档不是5'
Assert-True ($inventory.logical_active_document_count -eq 5) '活动逻辑文档不是5'
Assert-True (@($inventory.duplicate_active_logical_documents).Count -eq 0) '存在并存活动逻辑文档版本'

$beforeConfig = Read-Json (Join-Path $recoveryRoot 'evidence/dify-config-before-change.json')
$afterConfig = Read-Json (Join-Path $recoveryRoot 'evidence/dify-config-after-r2.json')
$configComparison = Read-Json (Join-Path $recoveryRoot 'evidence/dify-config-comparison-r2.json')
Assert-True ($beforeConfig.prompt_nodes[0].model.name -eq 'deepseek-v4-pro') '变更前模型不是Pro'
Assert-True ($afterConfig.prompt_nodes[0].model.name -eq 'deepseek-v4-pro') '变更后模型不是Pro'
Assert-True ($beforeConfig.knowledge_nodes[0].multiple_retrieval_config.top_k -eq 3) '变更前TopK不是3'
Assert-True ($afterConfig.knowledge_nodes[0].multiple_retrieval_config.top_k -eq 10) '变更后TopK不是10'
Assert-True ($afterConfig.knowledge_nodes[0].multiple_retrieval_config.reranking_model.model -eq 'qwen3-rerank') 'Rerank模型漂移'
$finalVersion = $afterConfig.workflow_versions |
    Where-Object { $_.version_number -eq 14 } |
    Select-Object -First 1
Assert-True ($finalVersion.version_number -eq 14) '最终Dify配置不是版本14'
Assert-True ($configComparison.business_knowledge_published -eq $false) '配置对照显示已发布业务知识库'

$prompt = [System.IO.File]::ReadAllText(
    (Join-Path $recoveryRoot 'configs/r2-system-prompt.txt'),
    [System.Text.Encoding]::UTF8
)
Assert-True ($prompt -match '可执行的通用排查' -and $prompt -match '不要因为用户尚未报告全部状态') 'R2 Prompt未包含回答策略修复'

$quality = Read-Json (Join-Path $recoveryRoot 'evidence/quality-gate-r2.json')
Assert-True ($quality.threshold_unchanged -eq 0.9167) '质量JSON阈值被修改'
Assert-True ($quality.release_performed -eq $false) '质量JSON记录已发布'
Assert-True ($quality.entered_4b2b -eq $false) '质量JSON记录进入4B2B'
Assert-True ($quality.retries.initial_full_run_status -eq 'FAILED') '首次限流失败未保留'
Assert-True ($quality.retries.initial_provider_errors -eq 9) '首次限流错误数不符'
Assert-True ($quality.retries.final_provider_errors -eq 0) '最终供应商错误不是0'

$envPath = Join-Path $prototypeRoot '.env.local'
$envLines = Get-Content -LiteralPath $envPath
$secretNames = @('RAG_API_KEY', 'RAG_DIFY_DATASET_API_KEY')
foreach ($name in $secretNames) {
    $line = $envLines | Where-Object { $_ -match "^$([regex]::Escape($name))=" } | Select-Object -First 1
    $value = if ($line) { $line.Substring($line.IndexOf('=') + 1).Trim() } else { '' }
    if ($value) {
        & git -C $projectRoot grep -q -F -- $value
        Assert-True ($LASTEXITCODE -ne 0) "$name进入Git跟踪文件"
        $leak = Get-ChildItem -LiteralPath $recoveryRoot -Recurse -File |
            Where-Object { $_.Extension -in @('.md','.json','.mjs','.ps1','.txt','.html','.js','.css') } |
            Where-Object {
                [System.IO.File]::ReadAllText($_.FullName, [System.Text.Encoding]::UTF8).Contains($value)
            }
        Assert-True (@($leak).Count -eq 0) "$name进入R2证据文件"
    }
}
$appJs = [System.IO.File]::ReadAllText((Join-Path $prototypeRoot 'app.js'), [System.Text.Encoding]::UTF8)
Assert-True ($appJs -notmatch 'RAG_DIFY_DATASET_API_KEY|RAG_API_KEY|Bearer\s+') '前端包含凭据字段'

$trackedAfter = @(& git -C $projectRoot status --porcelain --untracked-files=no)
Assert-True (($trackedBefore -join "`n") -eq ($trackedAfter -join "`n")) '测试改写了Git跟踪文件'

if ($failures.Count -gt 0) {
    Write-Host "FAILED: $($failures.Count) 个R2验证失败" -ForegroundColor Red
    $failures | ForEach-Object { Write-Host "- $_" -ForegroundColor Red }
    exit 1
}
Write-Host 'PASSED: R2检索多样性、回答策略、17条质量、3条保留样例、唯一版本与密钥卫生验证通过' -ForegroundColor Green
