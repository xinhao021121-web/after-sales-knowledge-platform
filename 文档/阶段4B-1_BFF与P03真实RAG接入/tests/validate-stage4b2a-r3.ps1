$ErrorActionPreference = 'Stop'
$base = Split-Path -Parent $PSScriptRoot
$projectRoot = Resolve-Path (Join-Path $base '..\..')
$r2Root = Join-Path $projectRoot '文档\阶段4B-2A-R2_质量恢复'
$r3Root = Join-Path $projectRoot '文档\阶段4B-2A-R3_跨文档回答修复'
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
    '01_R2冻结基线.md',
    '02_RET-H01根因诊断.md',
    '03_跨文档回答修复说明.md',
    '04_Dify配置与Prompt调整.md',
    '05_正式17条真实重跑证据.md',
    '06_三条回归样例结果.md',
    '07_三条新保留样例首次结果.md',
    '08_业务语义验收记录.md',
    '09_测试报告.md',
    '10_决策日志.md',
    'baseline/p10-real-r2.json',
    'baseline/RET-H01-first-failure.json',
    'baseline/RET-H02-first-failure.json',
    'baseline/RET-H03-first-failure.json',
    'baseline/retention-set-v1.0.json',
    'baseline/r2-system-prompt.txt',
    'regression/retention-set-v2.0.json',
    'holdout/retention-set-v3.0.json',
    'configs/r3-system-prompt.txt',
    'evidence/r2-freeze.json',
    'evidence/ret-h01-root-cause.json',
    'evidence/p10-real-r3.json',
    'evidence/regression-v2-real.json',
    'evidence/holdout-v3-first-run.json',
    'evidence/regression-manual-review.json',
    'evidence/holdout-manual-review.json',
    'evidence/candidate-inventory-after-r3.json',
    'evidence/dify-config-after-r3.json',
    'evidence/dify-config-comparison-r3.json',
    'evidence/quality-gate-r3.json'
)
foreach ($relative in $required) {
    Assert-True (Test-Path -LiteralPath (Join-Path $r3Root $relative) -PathType Leaf) "R3缺少交付文件：$relative"
}
Assert-True (Test-Path -LiteralPath (Join-Path $base 'scripts/run-stage4b2-r3-p10-real.mjs') -PathType Leaf) '缺少R3正式评测入口'
Assert-True (Test-Path -LiteralPath (Join-Path $base 'scripts/run-r3-semantic-suite.mjs') -PathType Leaf) '缺少R3语义评测入口'

$trackedBefore = @(& git -C $projectRoot status --porcelain --untracked-files=no)

& node (Join-Path $base 'tests\server-unit.mjs')
Assert-True ($LASTEXITCODE -eq 0) '服务端单元测试失败'
& node (Join-Path $base 'tests\stage4b2-unit.mjs')
Assert-True ($LASTEXITCODE -eq 0) 'R3检索与语义单元测试失败'
& node (Join-Path $base 'tests\e2e-stage4b2.mjs')
Assert-True ($LASTEXITCODE -eq 0) 'P06/P10浏览器回归失败'

$r2FirstHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $r2Root 'evidence/holdout/RET-H01.json')).Hash
$r3FrozenHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $r3Root 'baseline/RET-H01-first-failure.json')).Hash
Assert-True ($r2FirstHash -eq $r3FrozenHash) 'RET-H01首次失败基线被改写'
& git -C $projectRoot diff --quiet HEAD -- '项目1/文档/阶段4A_RAG能力验证/evaluation/eval-set-v1.0.json'
Assert-True ($LASTEXITCODE -eq 0) '正式17条任务集被修改'

$formal = Read-Json (Join-Path $r3Root 'evidence/p10-real-r3.json')
Assert-True ($formal.status -eq 'PASSED') '正式17条状态不是PASSED'
Assert-True ($formal.source_mode -eq 'REAL_DIFY') '正式结果不是REAL_DIFY'
Assert-True ($formal.model -eq 'deepseek-v4-pro') '正式模型不是deepseek-v4-pro'
Assert-True ($formal.dataset -eq 'CANDIDATE') '正式Dataset不是CANDIDATE'
Assert-True (@($formal.results).Count -eq 17) '正式任务不是17条'
Assert-True ($formal.metrics.retrieval_completed_core_count -eq 7) '检索核心任务不是7'
Assert-True ($formal.metrics.retrieval_expected_source_count -eq 9) '期望来源不是9'
Assert-True ($formal.metrics.retrieval_covered_source_count -eq 9) '覆盖来源不是9'
Assert-True ($formal.metrics.recall_at_3_core -eq 1) 'Recall@3不是1'
Assert-True ($formal.metrics.correct_source_hits_core -eq 7) '来源命中不是7/7'
Assert-True ($formal.metrics.p0_final_failures -eq 0) 'P0最终失败不为0'
Assert-True ($formal.metrics.citation_failures -eq 0) 'Claim引用失败不为0'
Assert-True ($formal.metrics.provider_errors -eq 0) '供应商错误不为0'
Assert-True ($formal.metrics.cost.model_effective_answer_count -ge 1) '模型型有效回答少于1'
Assert-True ($formal.metrics.quality_baseline.recall_at_3_core -eq 0.9167) 'Recall阈值被修改'
Assert-True ($formal.metrics.cost.cost_status -eq 'COST_UNKNOWN') '成本不是COST_UNKNOWN'

foreach ($result in $formal.results) {
    Assert-True ($result.business_action_correct -eq $true) "业务动作失败：$($result.task_id)"
    if ($result.p0) {
        Assert-True ($result.answer_status -eq 'BLOCKED_SAFETY' -and $result.p0_passed -eq $true) "P0失败：$($result.task_id)"
        Assert-True ($result.provider_called -eq $false) "P0调用供应商：$($result.task_id)"
    } else {
        $docs = @($result.evidence.retrieved | ForEach-Object { $_.document_id })
        $segments = @($result.evidence.retrieved | ForEach-Object { $_.segment_id })
        Assert-True ($docs.Count -eq 3) "非P0 Top3不是3：$($result.task_id)"
        Assert-True (@($docs | Select-Object -Unique).Count -eq $docs.Count) "Top3文档重复：$($result.task_id)"
        Assert-True (@($segments | Select-Object -Unique).Count -eq $segments.Count) "Top3 segment重复：$($result.task_id)"
        if ($result.answer_status -eq 'ANSWERED') {
            Assert-True ($result.citation_support_passed -eq $true) "ANSWERED Claim失败：$($result.task_id)"
            Assert-True (@($result.citations).Count -ge 1) "ANSWERED缺少引用：$($result.task_id)"
        }
    }
}

$regression = Read-Json (Join-Path $r3Root 'evidence/regression-v2-real.json')
Assert-True ($regression.passed -eq $true) '回归样例未通过'
Assert-True ($regression.used_for_tuning -eq $true) '回归样例标记错误'
Assert-True (@($regression.results).Count -eq 3) '回归样例不是3条'
Assert-True ($regression.semantic_passed_count -eq 3) '回归语义通过不是3/3'
Assert-True ($regression.provider_errors -eq 0 -and $regression.p0_failures -eq 0) '回归样例存在供应商或P0错误'
Assert-True ($regression.citation_failures -eq 0 -and $regression.forbidden_action_failures -eq 0) '回归样例存在Claim或禁止动作错误'
Assert-True ($regression.document_request_failures -eq 0) '回归样例存在文档正文转嫁'
$h01 = $regression.results | Where-Object { $_.task_id -eq 'RET-H01' }
$h02 = $regression.results | Where-Object { $_.task_id -eq 'RET-H02' }
$h03 = $regression.results | Where-Object { $_.task_id -eq 'RET-H03' }
Assert-True ($h01.answer_status -eq 'ANSWERED' -and $h01.answer_goals.Count -ge 2) 'RET-H01未分目标回答'
Assert-True ($h01.citations.Count -ge 2) 'RET-H01引用少于2'
Assert-True ($h01.business_semantics.document_request_matches.Count -eq 0) 'RET-H01仍要求用户提供检索正文'
Assert-True ($h01.business_semantics.objectives.Count -eq 2 -and $h01.business_semantics.objectives_passed) 'RET-H01业务目标未全部通过'
Assert-True ($h02.answer_status -eq 'NO_ANSWER' -and $h02.business_semantics.knowledge_gap_passed) 'RET-H02未保持知识不足'
Assert-True ($h03.answer_status -eq 'BLOCKED_SAFETY' -and $h03.p0_passed -eq $true) 'RET-H03未前置阻断'

$holdout = Read-Json (Join-Path $r3Root 'evidence/holdout-v3-first-run.json')
$holdoutSet = Read-Json (Join-Path $r3Root 'holdout/retention-set-v3.0.json')
Assert-True ($holdoutSet.used_for_tuning -eq $false -and $holdoutSet.frozen_before_first_run -eq $true) '新样例未在首次运行前冻结'
Assert-True ($holdout.used_for_tuning -eq $false) '新样例首次运行标记参与调参'
Assert-True ($holdout.passed -eq $true -and $holdout.semantic_passed_count -eq 3) '新样例首次语义未3/3通过'
Assert-True (@($holdout.results).Count -eq 3) '新样例不是3条'
Assert-True ($holdout.provider_errors -eq 0 -and $holdout.p0_failures -eq 0) '新样例存在供应商或P0错误'
$h04 = $holdout.results | Where-Object { $_.task_id -eq 'RET-H04' }
$h05 = $holdout.results | Where-Object { $_.task_id -eq 'RET-H05' }
$h06 = $holdout.results | Where-Object { $_.task_id -eq 'RET-H06' }
Assert-True ($h04.answer_status -eq 'ANSWERED' -and $h04.answer_goals.Count -ge 2) 'RET-H04未分别回答换货与维修'
Assert-True ($h05.answer_status -eq 'NO_ANSWER' -and $h05.business_semantics.knowledge_gap_passed) 'RET-H05未保持知识不足'
Assert-True ($h06.answer_status -eq 'BLOCKED_SAFETY' -and $h06.p0_passed -eq $true) 'RET-H06未前置阻断'

$inventory = Read-Json (Join-Path $r3Root 'evidence/candidate-inventory-after-r3.json')
Assert-True ($inventory.active_document_count -eq 5) '活动CANDIDATE文档不是5'
Assert-True ($inventory.logical_active_document_count -eq 5) '活动逻辑文档不是5'
Assert-True (@($inventory.duplicate_active_logical_documents).Count -eq 0) '存在同逻辑文档并存版本'

$config = Read-Json (Join-Path $r3Root 'evidence/dify-config-after-r3.json')
$prompt = [System.IO.File]::ReadAllText((Join-Path $r3Root 'configs/r3-system-prompt.txt'), [System.Text.Encoding]::UTF8)
$sha256 = [System.Security.Cryptography.SHA256]::Create()
$promptHash = [System.BitConverter]::ToString(
    $sha256.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($prompt.Trim()))
).Replace('-', '').ToLower()
$sha256.Dispose()
Assert-True ($config.model.name -eq 'deepseek-v4-pro') 'Dify模型不是Pro'
Assert-True ($config.knowledge_nodes[0].top_k -eq 10) 'Dify TopK不是10'
Assert-True (($config.workflow_versions | Where-Object { $_.version_number -eq 16 }).Count -eq 1) 'Dify最终版本不是16'
Assert-True ($config.prompt_sha256.Trim() -eq $promptHash) 'Dify Prompt与本地Prompt不一致'
Assert-True ($prompt -match '不得要求用户提供、粘贴或补充已检索文档' -and $prompt -match '当问题包含多个独立业务目标时') 'R3 Prompt缺少关键约束'

$envPath = Join-Path $prototypeRoot '.env.local'
$envLines = Get-Content -LiteralPath $envPath
foreach ($name in @('RAG_API_KEY', 'RAG_DIFY_DATASET_API_KEY')) {
    $line = $envLines | Where-Object { $_ -match "^$([regex]::Escape($name))=" } | Select-Object -First 1
    $value = if ($line) { $line.Substring($line.IndexOf('=') + 1).Trim() } else { '' }
    if ($value) {
        & git -C $projectRoot grep -q -F -- $value
        Assert-True ($LASTEXITCODE -ne 0) "$name进入Git跟踪文件"
    }
}
$envFiles = @(Get-ChildItem -LiteralPath $r3Root -Recurse -File | Where-Object { $_.Name -like '.env*' })
Assert-True ($envFiles.Count -eq 0) 'R3交付目录包含环境文件'

$trackedAfter = @(& git -C $projectRoot status --porcelain --untracked-files=no)
Assert-True (($trackedBefore -join "`n") -eq ($trackedAfter -join "`n")) '测试改写了Git跟踪文件'

if ($failures.Count -gt 0) {
    Write-Host "FAILED: $($failures.Count) 个R3验证失败" -ForegroundColor Red
    $failures | ForEach-Object { Write-Host "- $_" -ForegroundColor Red }
    exit 1
}
Write-Host 'PASSED: R3跨文档语义、正式17条、回归/保留样例、唯一版本、门禁与密钥卫生验证通过' -ForegroundColor Green
