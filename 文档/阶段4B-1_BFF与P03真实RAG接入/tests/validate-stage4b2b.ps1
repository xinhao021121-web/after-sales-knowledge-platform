$ErrorActionPreference = 'Stop'
$base = Split-Path -Parent $PSScriptRoot
$projectRoot = Resolve-Path (Join-Path $base '..\..')
$docsRoot = Join-Path $projectRoot '文档'
$stageRoot = Join-Path $docsRoot '阶段4B-2B_模型成本与分级路由实验'
$prototypeRoot = Join-Path $docsRoot '阶段3B_高保真交互原型'
$failures = [System.Collections.Generic.List[string]]::new()

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) {
        $line = (Get-PSCallStack |
            Where-Object { $_.ScriptName -like '*validate-stage4b2b.ps1' -and $_.ScriptLineNumber -gt 0 } |
            Select-Object -First 1).ScriptLineNumber
        $label = if ($Message) { $Message } else { '未命名断言' }
        $failures.Add("line $line`: $label")
    }
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

function Get-EvidenceHash {
    param([string]$Path)
    $content = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8).Replace("`r`n", "`n")
    $hasher = [System.Security.Cryptography.SHA256]::Create()
    try {
        return [System.BitConverter]::ToString(
            $hasher.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($content))
        ).Replace('-', '').ToLowerInvariant()
    } finally {
        $hasher.Dispose()
    }
}

$required = @(
    'README.md',
    '01_成本口径与价格证据.md',
    '02_实验设计.md',
    '03_三组运行结果.md',
    '04_27条任务逐题对照.md',
    '05_Flash与Pro质量差异.md',
    '06_回退逻辑与原因分布.md',
    '07_Token与延迟对比.md',
    '08_成本计算与Dify账单未知.md',
    '09_产品推荐与未采用方案.md',
    '10_测试报告.md',
    '11_验收记录.md',
    '12_决策日志.md',
    'baseline/input-lock.json',
    'baseline/fixed-regression-used.json',
    'baseline/dify-config-before-4b2b.json',
    'configs/r5-prompt-frozen.txt',
    'configs/experiment-design.json',
    'configs/route-policy.json',
    'evidence/pricing-2026-10-25.json',
    'evidence/retrieval-snapshot.json',
    'evidence/model-config-A.json',
    'evidence/model-config-B.json',
    'evidence/model-config-C-pro.json',
    'evidence/model-config-final-restored.json',
    'evidence/provider-failure-history.json',
    'evidence/dify-console-failure-history.json',
    'evidence/group-A-normalized.json',
    'evidence/group-B-normalized.json',
    'evidence/group-C-normalized.json',
    'evidence/group-A-summary.json',
    'evidence/group-B-summary.json',
    'evidence/group-C-summary.json',
    'evidence/comparison.json',
    'evidence/per-task-comparison.json',
    'evidence/cost-analysis.json',
    'evidence/manual-review.json',
    'evidence/recommendation.json',
    'evidence/test-results.json',
    'runs/A/results.json',
    'runs/B/results.json',
    'runs/C/flash-phase.json',
    'runs/C/results.json'
)
foreach ($relative in $required) {
    Assert-True (Test-Path -LiteralPath (Join-Path $stageRoot $relative) -PathType Leaf) "4B-2B缺少交付文件：$relative"
}
foreach ($script in @(
    'build-input-lock.mjs',
    'build-retrieval-snapshot.mjs',
    'manage-dify-model.mjs',
    'run-routing-group.mjs',
    'build-comparison.mjs'
)) {
    Assert-True (Test-Path -LiteralPath (Join-Path $stageRoot "scripts/$script") -PathType Leaf) "缺少脚本：$script"
}

$package = Read-Json (Join-Path $base 'package.json')
Assert-True ($package.scripts.'validate:4b2b' -eq 'pwsh -NoProfile -File tests/validate-stage4b2b.ps1') '缺少validate:4b2b入口'
$lock = Read-Json (Join-Path $stageRoot 'baseline/input-lock.json')
$fixed = Read-Json (Join-Path $stageRoot 'baseline/fixed-regression-used.json')
$fixedSource = Read-Json (Join-Path $docsRoot $lock.files.fixed_regression.source)
Assert-True ($lock.baseline_commit -eq 'e663689') '实验基线提交漂移'
Assert-True ($lock.task_count -eq 27 -and $fixed.tasks.Count -eq 27 -and $fixedSource.tasks.Count -eq 27) '固定任务不是27条'
Assert-True ($lock.suites.FORMAL_17 -eq 17 -and $lock.suites.REGRESSION_8 -eq 8 -and $lock.suites.HOLDOUT_2 -eq 2) '固定任务分组错误'
$fixedIds = @($fixed.tasks | ForEach-Object { $_.task.id })
Assert-True (@($fixedIds | Select-Object -Unique).Count -eq 27) '固定任务存在重复ID'
Assert-True ((Get-EvidenceHash (Join-Path $stageRoot 'baseline/fixed-regression-used.json')) -eq $lock.files.fixed_regression.sha256) '固定回归集副本被改写'
Assert-True ((Get-EvidenceHash (Join-Path $stageRoot 'configs/r5-prompt-frozen.txt')) -eq $lock.files.prompt.sha256) 'Prompt副本被改写'
Assert-True ((Get-EvidenceHash (Join-Path $stageRoot 'baseline/ret-h09-first-failure.json')) -eq $lock.files.ret_h09_first_failure.sha256) 'RET-H09首轮失败被改写'

$snapshot = Read-Json (Join-Path $stageRoot 'evidence/retrieval-snapshot.json')
Assert-True ($snapshot.task_count -eq 27 -and $snapshot.tasks.Count -eq 27) '检索快照不是27条'
Assert-True (@($snapshot.tasks | Where-Object retrieval_status -eq 'SKIPPED_P0').Count -eq 8) 'P0检索短路不是8条'
Assert-True (@($snapshot.tasks | Where-Object retrieval_status -eq 'RETRIEVAL_COMPLETED').Count -eq 19) '非P0检索不是19条'
Assert-True (@($snapshot.rate_limit_failures).Count -ge 2) 'Dify检索限流首次失败未保留'
Assert-True (@($snapshot.tasks | ForEach-Object { $_.task_id } | Select-Object -Unique).Count -eq 27) '检索快照任务ID不唯一'

foreach ($group in @('A','B','C')) {
    $run = Read-Json (Join-Path $stageRoot "runs/$group/results.json")
    $normalized = Read-Json (Join-Path $stageRoot "evidence/group-$group-normalized.json")
    Assert-True ($run.tasks.Count -eq 27 -and $normalized.tasks.Count -eq 27) "${group}任务不是27条"
    $runIds = @($run.tasks | ForEach-Object { $_.task_id })
    Assert-True (@($runIds | Select-Object -Unique).Count -eq 27) "${group}任务ID不唯一"
    Assert-True (@($runIds | Where-Object { $_ -notin $fixedIds }).Count -eq 0) "${group}使用了固定集外任务"
    Assert-True (@($run.tasks | Where-Object { $_.p0 -and $_.provider_called }).Count -eq 0) "${group}存在P0模型调用"
    Assert-True (@($normalized.tasks | Where-Object { $_.p0 -and $_.p0_passed -ne $true }).Count -eq 0) "${group}存在P0最终失败"
    Assert-True (@($normalized.tasks | Where-Object { $_.p0 -and $_.provider_called }).Count -eq 0) "${group}规范化记录存在P0模型调用"
    Assert-True (@($normalized.tasks | Where-Object { $_.answer_status -eq 'ANSWERED' -and -not $_.citation_support_passed }).Count -eq 0) "${group}存在Claim引用失败"
    Assert-True (@($normalized.tasks | Where-Object { $_.provider_error }).Count -eq 0) "${group}最终结果存在供应商错误"
    Assert-True (@($normalized.tasks | Where-Object { $_.forbidden_action_match }).Count -eq 0) "${group}存在禁止动作"
    Assert-True (@($normalized.tasks | Where-Object { -not $_.status_accepted }).Count -eq 0) "${group}存在状态不匹配"
    Assert-True (@($normalized.tasks | Where-Object { -not $_.retrieval_matches_snapshot }).Count -eq 0) "${group}检索Top3与冻结快照不一致"
    Assert-True (@($normalized.tasks | Where-Object task_id -eq 'RET-H09').semantic_passed -eq $false) "${group}丢失RET-H09已知缺陷"
}

$configA = Read-Json (Join-Path $stageRoot 'evidence/model-config-A.json')
$configB = Read-Json (Join-Path $stageRoot 'evidence/model-config-B.json')
$configC = Read-Json (Join-Path $stageRoot 'evidence/model-config-C-pro.json')
$configFinal = Read-Json (Join-Path $stageRoot 'evidence/model-config-final-restored.json')
Assert-True ($configA.after_model -eq 'deepseek-v4-pro' -and $configA.published_version -eq 22) 'A组模型配置错误'
Assert-True ($configB.after_model -eq 'deepseek-v4-flash' -and $configB.published_version -eq 23) 'B组模型配置错误'
Assert-True ($configC.after_model -eq 'deepseek-v4-pro' -and $configC.published_version -eq 24) 'C组回退配置错误'
Assert-True ($configFinal.model.name -eq 'deepseek-v4-pro' -and $configFinal.after_model -eq 'deepseek-v4-pro') '默认模型未恢复Pro'
$promptHash = '6f354ed76dbdc62ec9048eafee5713bcdfe0c2f6b1312ea6a85d64a21d2620a8'
foreach ($config in @($configA,$configB,$configC,$configFinal)) {
    Assert-True ($config.prompt_sha256 -eq $promptHash) '模型切换期间Prompt发生变化'
}
$retrievalConfigUnchanged = $configA.knowledge_config_sha256 -eq $configB.knowledge_config_sha256 -and $configB.knowledge_config_sha256 -eq $configC.knowledge_config_sha256
Assert-True $retrievalConfigUnchanged '模型切换期间检索配置发生变化'
Assert-True (@($configFinal.workflow_versions | Where-Object version_number -eq 24).Count -eq 1) '最终Dify版本历史缺少#24'
Assert-True (($configFinal.workflow_versions | Where-Object version_number -eq 24).model_name -eq 'deepseek-v4-pro') '最终活动版本不是Pro'

$comparison = Read-Json (Join-Path $stageRoot 'evidence/comparison.json')
$cost = Read-Json (Join-Path $stageRoot 'evidence/cost-analysis.json')
$recommendation = Read-Json (Join-Path $stageRoot 'evidence/recommendation.json')
$policy = Read-Json (Join-Path $stageRoot 'configs/route-policy.json')
$cRun = Read-Json (Join-Path $stageRoot 'runs/C/results.json')
$cFallbacks = @($cRun.tasks | Where-Object { $_.fallback })
Assert-True ($cFallbacks.Count -eq 5) 'C组回退任务数不是5'
foreach ($task in $cFallbacks) {
    Assert-True ($task.first_model -eq 'deepseek-v4-flash' -and $task.final_model -eq 'deepseek-v4-pro') "C组回退模型链路错误：$($task.task_id)"
    Assert-True (@($task.flash_attempts).Count -ge 1) "C组缺少Flash首轮记录：$($task.task_id)"
    Assert-True (@($task.pro_attempts).Count -eq 1) "C组Pro回退次数不是1：$($task.task_id)"
    Assert-True ($task.flash_attempt.bff_request_id -and $task.pro_attempt.bff_request_id) "C组缺少BFF请求ID：$($task.task_id)"
    Assert-True ($task.flash_attempt.provider_request_id -and $task.pro_attempt.provider_request_id) "C组缺少Provider请求ID：$($task.task_id)"
    Assert-True ($task.flash_attempt.bff_request_id -ne $task.pro_attempt.bff_request_id) "C组Flash/Pro记录被覆盖：$($task.task_id)"
}
Assert-True ($comparison.groups.A.semantic_passed_count -eq 25) 'A组语义通过不是25/27'
Assert-True ($comparison.groups.B.semantic_passed_count -eq 26) 'B组语义通过不是26/27'
Assert-True ($comparison.groups.C.semantic_passed_count -eq 26) 'C组语义通过不是26/27'
$formalCoreRecallPassed = $comparison.groups.A.formal_17_core.covered_source_count -eq 9 -and $comparison.groups.B.formal_17_core.covered_source_count -eq 9 -and $comparison.groups.C.formal_17_core.covered_source_count -eq 9
Assert-True $formalCoreRecallPassed '正式核心Recall不是9/9'
Assert-True (@($comparison.baseline_relative.B_new_semantic_failures_excluding_known_defect).Count -eq 0) 'B组产生新增语义失败'
Assert-True (@($comparison.baseline_relative.C_new_semantic_failures_excluding_known_defect).Count -eq 0) 'C组产生新增语义失败'
Assert-True ($comparison.hard_gates.all_p0_model_calls_zero -and $comparison.hard_gates.all_p0_failures_zero) 'P0硬门禁退化'
Assert-True ($comparison.hard_gates.all_final_provider_errors_zero -and $comparison.hard_gates.all_claim_failures_zero) '供应商或Claim硬门禁退化'
Assert-True ($comparison.hard_gates.all_forbidden_action_failures_zero) '禁止动作门禁退化'
Assert-True ($comparison.groups.C.fallback_count -eq 5 -and $comparison.groups.C.fallback_rate -gt 0 -and $comparison.groups.C.recovery_rate -gt 0) 'C组回退或恢复指标错误'
$retrievalSnapshotsConsistent = $comparison.groups.A.retrieval_snapshot_consistent -and $comparison.groups.B.retrieval_snapshot_consistent -and $comparison.groups.C.retrieval_snapshot_consistent
Assert-True $retrievalSnapshotsConsistent '三组未使用同一检索快照'
Assert-True ($comparison.groups.A.preserved_provider_failures -eq 12) 'A组供应商失败历史未保留'
Assert-True ($policy.enabled_by_default -eq $false -and $policy.production_enabled -eq $false) '实验路由不是显式开启'
Assert-True ($recommendation.decision -eq 'KEEP_PRO_DEFAULT_NO_AUTOMATIC_FLASH_ROUTING') '最终推荐不明确'
Assert-True ($recommendation.production_release -eq 'FORBIDDEN') '推荐错误放开生产'
Assert-True ($cost.dify_billed_cost_cny -eq $null -and $cost.dify_billing_cost_status -eq 'COST_UNKNOWN') 'Dify实际账单被伪造'
Assert-True ($cost.currency -eq 'CNY' -and $null -ne $cost.official_model_list_estimates.A) '官方价格估算缺失'
Assert-True ($cost.estimated_break_even_fallback_rate -gt $cost.observed_fallback_rate) '成本盈亏平衡计算错误'
$providerFailures = Read-Json (Join-Path $stageRoot 'evidence/provider-failure-history.json')
Assert-True (@($providerFailures.errors).Count -eq 13) '供应商原始失败记录数量不是13'
$consoleFailures = Read-Json (Join-Path $stageRoot 'evidence/dify-console-failure-history.json')
Assert-True (@($consoleFailures.events).Count -eq 3) 'Dify控制台失败记录不是3条'
$testResults = Read-Json (Join-Path $stageRoot 'evidence/test-results.json')
Assert-True ($testResults.status -eq 'PASSED') '测试结果状态不是PASSED'
Assert-True (@($testResults.commands | Where-Object { $_.status -ne 'PASSED' }).Count -eq 0) '存在未通过测试命令'

$pricing = Read-Json (Join-Path $stageRoot 'evidence/pricing-2026-10-25.json')
Assert-True ($pricing.currency -eq 'CNY' -and $pricing.models.'deepseek-v4-pro'.input_cache_miss_off_peak_cny -eq 4.5) 'Pro官方输入价格缺失'
Assert-True ($pricing.models.'deepseek-v4-flash'.output_off_peak_cny -eq 4) 'Flash官方输出价格缺失'
Assert-True ($pricing.models.'deepseek-v4-pro'.output_off_peak_cny -eq 13.5) 'Pro官方输出价格缺失'
Assert-True ($pricing.source.url_zh -eq 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing/') '官方价格来源URL缺失'

& npm --prefix $base run validate:4b2a-closure
Assert-True ($LASTEXITCODE -eq 0) '4B-2A历史质量与测试回归失败'
& node (Join-Path $base 'tests\server-unit.mjs')
Assert-True ($LASTEXITCODE -eq 0) '服务端单元测试失败'
& node (Join-Path $base 'tests\stage4b2-unit.mjs')
Assert-True ($LASTEXITCODE -eq 0) '路由与语义单元测试失败'
& node (Join-Path $base 'tests\e2e-stage4b2.mjs')
Assert-True ($LASTEXITCODE -eq 0) 'P06/P10浏览器测试失败'

$envPath = Join-Path $prototypeRoot '.env.local'
$envLines = Get-Content -LiteralPath $envPath
foreach ($name in @('RAG_API_KEY', 'RAG_DIFY_DATASET_API_KEY')) {
    $line = $envLines | Where-Object { $_ -match "^$([regex]::Escape($name))=" } | Select-Object -First 1
    $value = if ($line) { $line.Substring($line.IndexOf('=') + 1).Trim() } else { '' }
    if ($value) {
        & git -C (Resolve-Path (Join-Path $projectRoot '..')) grep -q -F -- $value
        Assert-True ($LASTEXITCODE -ne 0) "$name进入Git跟踪文件"
    }
}
$envFiles = @(Get-ChildItem -LiteralPath $stageRoot -Recurse -File | Where-Object { $_.Name -like '.env*' })
Assert-True ($envFiles.Count -eq 0) '4B-2B交付目录包含环境文件'

if ($failures.Count -gt 0) {
    Write-Host "FAILED: $($failures.Count) 个4B-2B验证失败" -ForegroundColor Red
    $failures | ForEach-Object { Write-Host "- $_" -ForegroundColor Red }
    exit 1
}
Write-Host 'PASSED: 4B-2B三组同集实验、P0/Claim/供应商门禁、回退审计和默认Pro恢复一致' -ForegroundColor Yellow
