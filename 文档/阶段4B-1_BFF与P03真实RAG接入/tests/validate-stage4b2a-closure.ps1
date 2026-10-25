$ErrorActionPreference = 'Stop'
$base = Split-Path -Parent $PSScriptRoot
$projectRoot = Resolve-Path (Join-Path $base '..\..')
$docsRoot = Join-Path $projectRoot '文档'
$closureRoot = Join-Path $docsRoot '阶段4B-2A_原型结项与质量风险冻结'
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

function Get-EvidenceHash {
    param([string]$Path, [string]$Mode)
    if ($Mode -eq 'binary') {
        return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
    }
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
    '01_双层验收结论.md',
    '02_R1-R5失败与修复时间线.md',
    '03_当前指标与已知缺陷.md',
    '04_生产阻断条件.md',
    '05_后续质量改造待办.md',
    '06_固定回归集清单.md',
    '07_决策日志.md',
    'fixed-regression/retention-set-frozen-final-1.0.0.json',
    'evidence/final-metrics.json',
    'evidence/acceptance-gate.json',
    'evidence/r1-r5-evidence-manifest.json',
    'evidence/quality-backlog.json',
    'evidence/test-results.json'
)
foreach ($relative in $required) {
    Assert-True (Test-Path -LiteralPath (Join-Path $closureRoot $relative) -PathType Leaf) "结项目录缺少：$relative"
}
Assert-True (Test-Path -LiteralPath (Join-Path $docsRoot '项目状态.md') -PathType Leaf) '缺少项目状态文件'

$fixedSet = Read-Json (Join-Path $closureRoot 'fixed-regression/retention-set-frozen-final-1.0.0.json')
Assert-True ($fixedSet.status -eq 'FROZEN') '固定回归集未冻结'
Assert-True ($fixedSet.tasks.Count -eq 27) '固定回归集不是27条'
$suiteCounts = @{}
foreach ($item in $fixedSet.tasks) {
    if (-not $suiteCounts.ContainsKey($item.suite)) { $suiteCounts[$item.suite] = 0 }
    $suiteCounts[$item.suite]++
}
Assert-True ($suiteCounts.FORMAL_17 -eq 17) '正式17条数量错误'
Assert-True ($suiteCounts.REGRESSION_8 -eq 8) '既有回归数量错误'
Assert-True ($suiteCounts.HOLDOUT_2 -eq 2) '保留样例数量错误'
$ids = @($fixedSet.tasks | ForEach-Object { $_.task.id })
Assert-True (@($ids | Select-Object -Unique).Count -eq 27) '固定回归集存在重复任务'
foreach ($requiredId in @('POC-R01','POC-R04','POC-S01','POC-K04','POC-E05','RET-H01','RET-H08','RET-H09','RET-H10')) {
    Assert-True ($ids -contains $requiredId) "固定回归集缺少：$requiredId"
}
Assert-True ($fixedSet.policy.add_tasks_within_same_repair_round -eq $false) '固定集仍允许同轮新增'

$metrics = Read-Json (Join-Path $closureRoot 'evidence/final-metrics.json')
Assert-True ($metrics.source_mode -eq 'REAL_DIFY') '当前指标不是REAL_DIFY'
Assert-True ($metrics.model -eq 'deepseek-v4-pro') '当前模型不是Pro'
Assert-True ($metrics.dataset -eq 'CANDIDATE') '当前Dataset不是CANDIDATE'
Assert-True ($metrics.threshold -eq 0.9167) '门槛被修改'
Assert-True ($metrics.formal_17.status -eq 'PASSED' -and $metrics.formal_17.task_count -eq 17) '正式17条不是PASSED'
Assert-True ($metrics.formal_17.covered_source_count -eq 9 -and $metrics.formal_17.expected_source_count -eq 9) '来源覆盖不是9/9'
Assert-True ($metrics.formal_17.recall_at_3 -ge 0.9167) 'Recall@3低于门槛'
Assert-True ($metrics.formal_17.core_source_hits -eq 7) '核心来源命中不是7/7'
Assert-True ($metrics.formal_17.p0_failures -eq 0 -and $metrics.formal_17.citation_failures -eq 0) '正式P0或Claim失败'
Assert-True ($metrics.formal_17.provider_errors -eq 0) '正式供应商错误不为0'
Assert-True ($metrics.regression_8.status -eq 'PASSED' -and $metrics.regression_8.semantic_passed_count -eq 8) '既有回归不是8/8'
Assert-True ($metrics.holdout_2.semantic_passed_count -eq 1 -and $metrics.holdout_2.task_count -eq 2) '保留样例不是1/2'
Assert-True ($metrics.holdout_2.ret_h09.semantic_passed -eq $false) 'RET-H09失败未保留'
Assert-True ($metrics.holdout_2.ret_h10.semantic_passed -eq $true) 'RET-H10通过结果未保留'
Assert-True ($metrics.cost_status -eq 'COST_UNKNOWN') '成本不是COST_UNKNOWN'

$gate = Read-Json (Join-Path $closureRoot 'evidence/acceptance-gate.json')
Assert-True ($gate.acceptance_layers.engineering_and_safety.status -eq 'PASSED') '工程与安全验收不是PASSED'
Assert-True ($gate.acceptance_layers.product_quality.status -eq 'FAILED_KNOWN_DEFECT') '产品层未记录已知缺陷'
Assert-True ($gate.gates.formal_17.status -eq 'PASSED') '验收门禁正式17条不是PASSED'
Assert-True ($gate.gates.regression_8.status -eq 'PASSED') '验收门禁回归不是PASSED'
Assert-True ($gate.gates.holdout_2.status -eq 'FAILED' -and $gate.gates.holdout_2.known_defect_task -eq 'RET-H09') '验收门禁未记录H09失败'
Assert-True ($gate.prototype_status -eq 'CLOSED_AS_INTERNAL_LEARNING_PROTOTYPE_WITH_KNOWN_DEFECT') '学习原型结项状态错误'
Assert-True ($gate.production_release -eq 'FORBIDDEN' -and $gate.production_release_allowed -eq $false) '生产发布未被禁止'
Assert-True ($gate.release_performed -eq $false -and $gate.entered_4b2b -eq $false) '发布或进入4B2B标记错误'

$backlog = Read-Json (Join-Path $closureRoot 'evidence/quality-backlog.json')
Assert-True ($backlog.items.Count -eq 5) '质量待办不是5条'
Assert-True (@($backlog.items | Where-Object { $_.priority -eq 'P1' }).Count -ge 1) '缺少P1待办'
Assert-True (@($backlog.items | Where-Object { $_.priority -eq 'P2' }).Count -ge 1) '缺少P2待办'
$backlogText = ($backlog.items | ForEach-Object { "$($_.title) $($_.problem)" }) -join "`n"
foreach ($expected in @('还是失败','CHUNK-FAQ-CONNECT-01','单一关键词','验收目标持续移动','人工抽样复核')) {
    Assert-True ($backlogText.Contains($expected)) "质量待办缺少：$expected"
}

$manifest = Read-Json (Join-Path $closureRoot 'evidence/r1-r5-evidence-manifest.json')
Assert-True ($manifest.status -eq 'FROZEN' -and $manifest.file_count -eq $manifest.files.Count) 'R1-R5证据清单状态或数量错误'
foreach ($file in $manifest.files) {
    $target = Join-Path $docsRoot $file.path
    Assert-True (Test-Path -LiteralPath $target -PathType Leaf) "历史证据文件丢失：$($file.path)"
    if (Test-Path -LiteralPath $target -PathType Leaf) {
        $actual = Get-EvidenceHash -Path $target -Mode $file.hash_mode
        Assert-True ($actual -eq $file.sha256) "历史证据被改写：$($file.path)"
    }
}

$r5Root = Join-Path $docsRoot '阶段4B-2A-R5_单目标检索与质量收口'
& npm --prefix $base run validate:4b2a-r5
Assert-True ($LASTEXITCODE -eq 0) 'R5现有质量门禁验证失败'
& git -C (Resolve-Path (Join-Path $projectRoot '..')) diff --quiet HEAD -- `
    '项目1/文档/阶段4B-2A_P06真实入库与P10真实评测' `
    '项目1/文档/阶段4B-2A-R1_质量回归诊断' `
    '项目1/文档/阶段4B-2A-R2_质量恢复' `
    '项目1/文档/阶段4B-2A-R3_跨文档回答修复' `
    '项目1/文档/阶段4B-2A-R4_单题回归修复' `
    '项目1/文档/阶段4B-2A-R5_单目标检索与质量收口'
Assert-True ($LASTEXITCODE -eq 0) 'R1-R5历史文件出现未提交修改'

$envFiles = @(Get-ChildItem -LiteralPath $closureRoot -Recurse -File | Where-Object { $_.Name -like '.env*' })
Assert-True ($envFiles.Count -eq 0) '结项目录包含环境文件'

if ($failures.Count -gt 0) {
    Write-Host "FAILED: $($failures.Count) 个结项验证失败" -ForegroundColor Red
    $failures | ForEach-Object { Write-Host "- $_" -ForegroundColor Red }
    exit 1
}
Write-Host 'PASSED: 4B-2A工程与安全通过、正式17条通过、回归8/8通过、保留样例1/2且H09缺陷已冻结、生产发布禁止' -ForegroundColor Yellow
