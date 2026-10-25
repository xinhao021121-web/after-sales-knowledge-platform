$ErrorActionPreference = 'Stop'
$base = Split-Path -Parent $PSScriptRoot
$projectRoot = Resolve-Path (Join-Path $base '..\..')
$r3Root = Join-Path $projectRoot '文档\阶段4B-2A-R3_跨文档回答修复'
$r4Root = Join-Path $projectRoot '文档\阶段4B-2A-R4_单题回归修复'
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
    '01_R3冻结基线.md',
    '02_POC-R04根因诊断.md',
    '03_用户可见回答修复.md',
    '04_正式17条真实重跑证据.md',
    '05_原回归样例结果.md',
    '06_新保留样例首次结果.md',
    '07_业务语义与人工验收.md',
    '08_测试报告.md',
    '09_决策日志.md',
    'baseline/p10-real-r3.json',
    'baseline/regression-v2-real-r3.json',
    'baseline/holdout-v3-first-run-r3.json',
    'baseline/POC-R04-r3.json',
    'baseline/RET-H01-r3-fixed.json',
    'baseline/RET-H04-r3-first-run.json',
    'baseline/r3-system-prompt.txt',
    'regression/retention-set-v4.0.json',
    'regression/poc-r04-visible-v1.0.json',
    'holdout/retention-set-v4.0.json',
    'configs/r4-system-prompt.txt',
    'evidence/p10-real-r4.json',
    'evidence/regression-v4-real.json',
    'evidence/holdout-v4-first-run.json',
    'evidence/poc-r04-visible-semantic.json',
    'evidence/quality-gate-r4.json',
    'evidence/candidate-inventory-after-r4.json',
    'evidence/dify-config-after-r4.json',
    'evidence/r3-freeze.json',
    'evidence/poc-r04-diagnosis.json',
    'evidence/original-three-regression-r4.json',
    'evidence/regression-manual-review.json',
    'evidence/holdout-manual-review.json'
)
foreach ($relative in $required) {
    Assert-True (Test-Path -LiteralPath (Join-Path $r4Root $relative) -PathType Leaf) "R4缺少交付文件：$relative"
}
Assert-True (Test-Path -LiteralPath (Join-Path $base 'scripts/run-stage4b2-r4-p10-real.mjs') -PathType Leaf) '缺少R4正式评测入口'
Assert-True (Test-Path -LiteralPath (Join-Path $base 'scripts/run-r4-semantic-suite.mjs') -PathType Leaf) '缺少R4语义评测入口'

$trackedBefore = @(& git -C $projectRoot status --porcelain --untracked-files=no)

& node (Join-Path $base 'tests\server-unit.mjs')
Assert-True ($LASTEXITCODE -eq 0) '服务端单元测试失败'
& node (Join-Path $base 'tests\stage4b2-unit.mjs')
Assert-True ($LASTEXITCODE -eq 0) 'R4用户可见性与语义单元测试失败'
& node (Join-Path $base 'tests\e2e-stage4b2.mjs')
Assert-True ($LASTEXITCODE -eq 0) 'P06/P10浏览器回归失败'

$r3Pairs = @(
    @('evidence/p10-real-r3.json','baseline/p10-real-r3.json'),
    @('evidence/regression-v2-real.json','baseline/regression-v2-real-r3.json'),
    @('evidence/holdout-v3-first-run.json','baseline/holdout-v3-first-run-r3.json'),
    @('evidence/formal-17/POC-R04.json','baseline/POC-R04-r3.json'),
    @('evidence/regression/RET-H01.json','baseline/RET-H01-r3-fixed.json'),
    @('evidence/holdout/RET-H04.json','baseline/RET-H04-r3-first-run.json')
)
foreach ($pair in $r3Pairs) {
    $current = Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $r3Root $pair[0])
    $frozen = Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $r4Root $pair[1])
    Assert-True ($current.Hash -eq $frozen.Hash) "R3证据被改写：$($pair[0])"
}
$r3PromptHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $r3Root 'configs/r3-system-prompt.txt')).Hash
$r3PromptFrozenHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $r4Root 'baseline/r3-system-prompt.txt')).Hash
Assert-True ($r3PromptHash -eq $r3PromptFrozenHash) 'R3 Prompt被改写'
& git -C $projectRoot diff --quiet HEAD -- '项目1/文档/阶段4A_RAG能力验证/evaluation/eval-set-v1.0.json'
Assert-True ($LASTEXITCODE -eq 0) '正式17条任务集被修改'

$formal = Read-Json (Join-Path $r4Root 'evidence/p10-real-r4.json')
Assert-True ($formal.status -eq 'PASSED') '正式17条聚合状态不是PASSED'
Assert-True ($formal.source_mode -eq 'REAL_DIFY') '正式结果不是REAL_DIFY'
Assert-True ($formal.model -eq 'deepseek-v4-pro') '正式模型不是Pro'
Assert-True ($formal.dataset -eq 'CANDIDATE') '正式Dataset不是CANDIDATE'
Assert-True (@($formal.results).Count -eq 17) '正式任务不是17条'
Assert-True ($formal.metrics.retrieval_completed_core_count -eq 7) '检索核心任务不是7'
Assert-True ($formal.metrics.retrieval_expected_source_count -eq 9 -and $formal.metrics.retrieval_covered_source_count -eq 9) '来源覆盖不是9/9'
Assert-True ($formal.metrics.recall_at_3_core -eq 1) 'Recall@3不是1'
Assert-True ($formal.metrics.correct_source_hits_core -eq 7) '来源命中不是7/7'
Assert-True ($formal.metrics.p0_final_failures -eq 0) 'P0失败不为0'
Assert-True ($formal.metrics.citation_failures -eq 0) 'Claim引用失败不为0'
Assert-True ($formal.metrics.provider_errors -eq 0) '供应商错误不为0'
Assert-True ($formal.metrics.cost.model_effective_answer_count -ge 1) '模型型有效回答少于1'
Assert-True ($formal.metrics.quality_baseline.recall_at_3_core -eq 0.9167) 'Recall阈值被修改'
Assert-True ($formal.metrics.cost.cost_status -eq 'COST_UNKNOWN') '成本不是COST_UNKNOWN'

foreach ($result in $formal.results) {
    $visibleText = "$($result.evidence.answer) $($result.evidence.suggested_action)"
    Assert-True ($visibleText -notmatch '目标[一二三四1-4]') "用户可见文本引用内部目标：$($result.task_id)"
    Assert-True ($result.business_action_correct -eq $true) "业务动作错误：$($result.task_id)"
    if ($result.p0) {
        Assert-True ($result.answer_status -eq 'BLOCKED_SAFETY' -and $result.p0_passed -eq $true -and $result.provider_called -eq $false) "P0失败：$($result.task_id)"
    } else {
        $segments = @($result.evidence.retrieved | ForEach-Object { $_.segment_id })
        Assert-True ($segments.Count -eq 3) "Top3不是3：$($result.task_id)"
        Assert-True (@($segments | Select-Object -Unique).Count -eq $segments.Count) "segment重复：$($result.task_id)"
    }
}

$r04 = Read-Json (Join-Path $r4Root 'evidence/formal-17/POC-R04.json')
$r04Semantic = Read-Json (Join-Path $r4Root 'evidence/poc-r04-visible-semantic.json')
Assert-True ($r04.answer_status -in @('ANSWERED','NEED_CLARIFICATION')) 'POC-R04状态不在允许范围'
Assert-True ($r04.citation_support_passed -eq $true) 'POC-R04引用未通过'
Assert-True (@($r04.evidence.retrieved).Count -eq 3) 'POC-R04 Top3不是3'
$r04Text = "$($r04.evidence.answer) $($r04.evidence.suggested_action)"
foreach ($requiredStep in @('放回充电盒','合盖','声道平衡','耳塞','网罩','重新配对','转售后检测','不承诺免费维修或换新')) {
    Assert-True ($r04Text.Contains($requiredStep)) "POC-R04缺少可见步骤：$requiredStep"
}
Assert-True ($r04Text -notmatch '目标[一二三四1-4]|上述步骤') 'POC-R04仍有内部目标或上下文指代'
Assert-True ($r04Semantic.passed -eq $true) 'POC-R04用户可见语义未通过'

$regression = Read-Json (Join-Path $r4Root 'evidence/regression-v4-real.json')
Assert-True ($regression.passed -eq $true) '现有回归样例集合未通过'
Assert-True ($regression.semantic_passed_count -eq 6 -and @($regression.results).Count -eq 6) '回归语义不是6/6'
Assert-True ($regression.provider_errors -eq 0 -and $regression.p0_failures -eq 0) '回归存在供应商或P0错误'
Assert-True ($regression.citation_failures -eq 0 -and $regression.forbidden_action_failures -eq 0) '回归存在Claim或禁止动作错误'
Assert-True ($regression.document_request_failures -eq 0) '回归存在文档转嫁'
foreach ($taskId in @('RET-H01','RET-H04')) {
    $result = $regression.results | Where-Object { $_.task_id -eq $taskId }
    Assert-True ($result.answer_status -eq 'ANSWERED') "${taskId}未回答"
    Assert-True ($result.answer_goals.Count -ge 2) "${taskId}未分别处理目标"
    Assert-True ($result.citations.Count -ge 2) "${taskId}引用少于2"
    Assert-True ($result.expected_source_count -eq 2 -and $result.covered_source_count -eq 1) "${taskId}文档覆盖被错误改写"
    Assert-True (@($result.business_semantics.unseen_goal_labels).Count -eq 0) "${taskId}回答引用未展示目标"
    Assert-True (@($result.business_semantics.action_internal_references).Count -eq 0) "${taskId}建议动作引用内部目标"
    Assert-True ($result.suggested_action -notmatch '上述步骤') "${taskId}建议动作引用上述步骤"
}
$h02 = $regression.results | Where-Object { $_.task_id -eq 'RET-H02' }
$h03 = $regression.results | Where-Object { $_.task_id -eq 'RET-H03' }
$h05 = $regression.results | Where-Object { $_.task_id -eq 'RET-H05' }
$h06 = $regression.results | Where-Object { $_.task_id -eq 'RET-H06' }
Assert-True ($h02.answer_status -eq 'NO_ANSWER') 'RET-H02未保持知识不足'
Assert-True ($h03.answer_status -eq 'BLOCKED_SAFETY' -and $h03.p0_passed -eq $true) 'RET-H03未阻断'
Assert-True ($h05.answer_status -eq 'NO_ANSWER') 'RET-H05未保持知识不足'
Assert-True ($h06.answer_status -eq 'BLOCKED_SAFETY' -and $h06.p0_passed -eq $true) 'RET-H06未阻断'

$holdout = Read-Json (Join-Path $r4Root 'evidence/holdout-v4-first-run.json')
$holdoutSet = Read-Json (Join-Path $r4Root 'holdout/retention-set-v4.0.json')
Assert-True ($holdoutSet.used_for_tuning -eq $false -and $holdoutSet.frozen_before_first_run -eq $true) '新样例未在首次运行前冻结'
Assert-True ($holdout.used_for_tuning -eq $false -and @($holdout.results).Count -eq 2) '新样例首次运行标记或数量错误'
Assert-True ($holdout.passed -eq $false) 'RET-H07首轮失败被错误判为通过'
Assert-True ($holdout.semantic_passed_count -eq 1) '新样例首轮语义结果不是1/2'
$h07 = $holdout.results | Where-Object { $_.task_id -eq 'RET-H07' }
$h08 = $holdout.results | Where-Object { $_.task_id -eq 'RET-H08' }
Assert-True ($h07.business_semantics.passed -eq $false) 'RET-H07首轮失败未保留'
Assert-True (@($h07.business_semantics.visible_action_missing_groups).Count -gt 0) 'RET-H07失败原因未保留'
Assert-True ($h08.business_semantics.passed -eq $true) 'RET-H08未通过语义'

$quality = Read-Json (Join-Path $r4Root 'evidence/quality-gate-r4.json')
Assert-True ($quality.status -eq 'FAILED') '总体质量状态不是FAILED'
Assert-True ($quality.failure_reason -match 'RET-H07') '总体失败原因未记录RET-H07'
Assert-True ($quality.threshold_unchanged -eq 0.9167) '阈值被修改'
Assert-True ($quality.cost_status -eq 'COST_UNKNOWN') '成本状态被修改'
Assert-True ($quality.release_performed -eq $false -and $quality.entered_4b2b -eq $false) '发布或进入4B2B标记错误'

$inventory = Read-Json (Join-Path $r4Root 'evidence/candidate-inventory-after-r4.json')
Assert-True ($inventory.active_document_count -eq 5 -and $inventory.logical_active_document_count -eq 5) '活动文档不是5/5'
Assert-True (@($inventory.duplicate_active_logical_documents).Count -eq 0) '存在逻辑文档并存版本'

$config = Read-Json (Join-Path $r4Root 'evidence/dify-config-after-r4.json')
$prompt = [System.IO.File]::ReadAllText((Join-Path $r4Root 'configs/r4-system-prompt.txt'), [System.Text.Encoding]::UTF8)
$sha256 = [System.Security.Cryptography.SHA256]::Create()
$promptHash = [System.BitConverter]::ToString(
    $sha256.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($prompt.Trim()))
).Replace('-', '').ToLower()
$sha256.Dispose()
Assert-True ($config.model.name -eq 'deepseek-v4-pro' -and $config.knowledge_nodes[0].top_k -eq 10) 'Dify最终模型或TopK漂移'
Assert-True (($config.workflow_versions | Where-Object { $_.version_number -eq 18 }).Count -eq 1) 'Dify最终版本不是18'
Assert-True ($config.prompt_sha256.Trim() -eq $promptHash) 'Dify与本地R4 Prompt不一致'
Assert-True ($prompt -match '不得引用“目标一/目标二”' -and $prompt -match '不承诺免费维修或换新') 'R4 Prompt缺少可见性规则'

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
$envFiles = @(Get-ChildItem -LiteralPath $r4Root -Recurse -File | Where-Object { $_.Name -like '.env*' })
Assert-True ($envFiles.Count -eq 0) 'R4交付目录包含环境文件'

$trackedAfter = @(& git -C $projectRoot status --porcelain --untracked-files=no)
Assert-True (($trackedBefore -join "`n") -eq ($trackedAfter -join "`n")) '测试改写了Git跟踪文件'

if ($failures.Count -gt 0) {
    Write-Host "FAILED: $($failures.Count) 个R4证据验证失败" -ForegroundColor Red
    $failures | ForEach-Object { Write-Host "- [$($_.Length)] $_" -ForegroundColor Red }
    exit 1
}
Write-Host 'PASSED: R4证据和自动化检查一致；总体质量因RET-H07首轮语义失败保持FAILED' -ForegroundColor Yellow
