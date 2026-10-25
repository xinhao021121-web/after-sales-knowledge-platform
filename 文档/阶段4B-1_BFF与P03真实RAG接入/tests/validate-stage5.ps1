$ErrorActionPreference = 'Stop'
$base = Split-Path -Parent $PSScriptRoot
$projectRoot = Resolve-Path (Join-Path $base '..\..')
$docsRoot = Join-Path $projectRoot '文档'
$stageRoot = Join-Path $docsRoot '阶段5_项目收尾与作品集交付'
$portfolioRoot = Join-Path $projectRoot '作品集'
$prototypeRoot = Join-Path $docsRoot '阶段3B_高保真交互原型'
$failures = [System.Collections.Generic.List[string]]::new()

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) {
        $failures.Add($Message)
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

$required = @(
    (Join-Path $projectRoot 'README.md'),
    (Join-Path $projectRoot '打开作品集.cmd'),
    (Join-Path $portfolioRoot '项目案例.html'),
    (Join-Path $portfolioRoot 'assets\P03_after_sales.png'),
    (Join-Path $portfolioRoot 'assets\P05_risk_stop.png'),
    (Join-Path $portfolioRoot 'assets\P06_real_ingestion.png'),
    (Join-Path $portfolioRoot 'assets\P10_real_evaluation.png'),
    (Join-Path $stageRoot 'README.md'),
    (Join-Path $stageRoot '01_项目成果总览.md'),
    (Join-Path $stageRoot '02_作品集案例.md'),
    (Join-Path $stageRoot '03_关键决策与取舍.md'),
    (Join-Path $stageRoot '04_指标口径与真实证据.md'),
    (Join-Path $stageRoot '05_五分钟演示脚本.md'),
    (Join-Path $stageRoot '06_面试问答与项目讲法.md'),
    (Join-Path $stageRoot '07_交付索引与复现说明.md'),
    (Join-Path $stageRoot 'scripts\validate-portfolio.mjs'),
    (Join-Path $stageRoot 'evidence\portfolio-browser-check.json'),
    (Join-Path $stageRoot 'evidence\portfolio-visual-review.json'),
    (Join-Path $stageRoot 'evidence\portfolio-print-preview.pdf'),
    (Join-Path $stageRoot 'evidence\test-results.json')
)
foreach ($path in $required) {
    Assert-True (Test-Path -LiteralPath $path -PathType Leaf) "阶段5缺少交付文件：$path"
}

$package = Read-Json (Join-Path $base 'package.json')
Assert-True ($package.scripts.'validate:stage5' -eq 'pwsh -NoProfile -File tests/validate-stage5.ps1') '缺少validate:stage5入口'

$rootReadme = [System.IO.File]::ReadAllText((Join-Path $projectRoot 'README.md'), [System.Text.Encoding]::UTF8)
foreach ($requiredText in @(
    '项目一句话介绍',
    '要解决的问题与目标用户',
    '为什么不是普通聊天机器人',
    '13 页高保真交互原型',
    '五分钟演示脚本',
    '已知缺陷与生产边界',
    '目录导航',
    'COST_UNKNOWN'
)) {
    Assert-True ($rootReadme.Contains($requiredText)) "根README缺少：$requiredText"
}

$status = [System.IO.File]::ReadAllText((Join-Path $docsRoot '项目状态.md'), [System.Text.Encoding]::UTF8)
Assert-True ($status.Contains('4B-2B 已完成')) '项目状态未记录4B-2B已完成'
Assert-True ($status.Contains('不进入阶段 5 功能扩展、不发布')) '项目状态未修正阶段边界'
Assert-True (-not $status.Contains('不进入 4B-2B')) '项目状态仍含过期的“不进入4B-2B”'

$html = [System.IO.File]::ReadAllText((Join-Path $portfolioRoot '项目案例.html'), [System.Text.Encoding]::UTF8)
foreach ($requiredText in @('模拟项目', '内部学习原型', 'RET-H09', 'COST_UNKNOWN', '@media print', 'prefers-reduced-motion')) {
    Assert-True ($html.Contains($requiredText)) "作品集缺少：$requiredText"
}
Assert-True ($html -notmatch '<script\s+src=|<link[^>]+href="https?://') '作品集包含外部脚本或样式'

$browserCheck = Read-Json (Join-Path $stageRoot 'evidence\portfolio-browser-check.json')
$visualReview = Read-Json (Join-Path $stageRoot 'evidence\portfolio-visual-review.json')
$testResults = Read-Json (Join-Path $stageRoot 'evidence\test-results.json')
Assert-True ($browserCheck.status -eq 'PASSED') '作品集浏览器检查未通过'
Assert-True ($browserCheck.desktop.document_width -le $browserCheck.desktop.viewport_width + 1) '1440px出现横向溢出'
Assert-True ($browserCheck.mobile.document_width -le $browserCheck.mobile.viewport_width + 1) '移动端出现横向溢出'
Assert-True ($browserCheck.print.document_width -le $browserCheck.print.viewport_width + 1) '打印预览出现横向溢出'
Assert-True ($browserCheck.desktop.images.Count -eq 5 -and $browserCheck.mobile.images.Count -eq 5) '作品集页面图片数量不是5'
Assert-True (@($browserCheck.page_errors).Count -eq 0) '作品集存在页面脚本错误'
Assert-True ($visualReview.checks.desktop_1440.reviewed -eq $true -and
    $visualReview.checks.mobile_390.reviewed -eq $true -and
    $visualReview.checks.print_a4.observed_clipping -eq $false) '作品集人工视觉抽查未通过'
Assert-True ($testResults.status -eq 'PASSED') '测试结果状态不是PASSED'
Assert-True (@($testResults.commands | Where-Object { $_.status -ne 'PASSED' }).Count -eq 0) '存在未通过测试命令'

$formal = Read-Json (Join-Path $docsRoot '阶段4B-2A-R5_单目标检索与质量收口\evidence\quality-gate-r5.json')
$regression = Read-Json (Join-Path $docsRoot '阶段4B-2A-R5_单目标检索与质量收口\evidence\regression-v5-real.json')
$holdout = Read-Json (Join-Path $docsRoot '阶段4B-2A-R5_单目标检索与质量收口\evidence\holdout-v5-first-run.json')
$fixed = Read-Json (Join-Path $docsRoot '阶段4B-2A_原型结项与质量风险冻结\fixed-regression\retention-set-frozen-final-1.0.0.json')
$comparison = Read-Json (Join-Path $docsRoot '阶段4B-2B_模型成本与分级路由实验\evidence\comparison.json')
$cost = Read-Json (Join-Path $docsRoot '阶段4B-2B_模型成本与分级路由实验\evidence\cost-analysis.json')
$recommendation = Read-Json (Join-Path $docsRoot '阶段4B-2B_模型成本与分级路由实验\evidence\recommendation.json')
$modelConfig = Read-Json (Join-Path $docsRoot '阶段4B-2B_模型成本与分级路由实验\evidence\model-config-final-restored.json')
$policy = Read-Json (Join-Path $docsRoot '阶段4B-2B_模型成本与分级路由实验\configs\route-policy.json')
$h09 = $holdout.results | Where-Object { $_.task_id -eq 'RET-H09' }

Assert-True ($formal.formal.status -eq 'PASSED') '正式17条不是PASSED'
Assert-True ($formal.formal.metrics.retrieval_covered_source_count -eq 9 -and $formal.formal.metrics.retrieval_expected_source_count -eq 9) '正式召回不是9/9'
Assert-True ($formal.formal.metrics.correct_source_hits_core -eq 7) '正式核心来源命中不是7/7'
Assert-True ($formal.formal.metrics.p0_final_failures -eq 0) '正式P0失败不为0'
Assert-True ($formal.formal.metrics.citation_failures -eq 0) '正式Claim失败不为0'
Assert-True ($formal.formal.metrics.provider_errors -eq 0) '正式供应商错误不为0'
Assert-True ($formal.cost_status -eq 'COST_UNKNOWN') '正式成本不是COST_UNKNOWN'
Assert-True ($regression.semantic_passed_count -eq 8 -and $regression.task_count -eq 8) '既有回归不是8/8'
Assert-True ($holdout.semantic_passed_count -eq 1 -and $holdout.task_count -eq 2) '保留样例不是1/2'
Assert-True ($h09.business_semantics.passed -eq $false) 'RET-H09首次失败未保留'
Assert-True ($fixed.tasks.Count -eq 27) '固定回归集不是27条'
Assert-True ($comparison.groups.A.semantic_passed_count -eq 25 -and $comparison.groups.B.semantic_passed_count -eq 26 -and $comparison.groups.C.semantic_passed_count -eq 26) '模型组语义结果不一致'
Assert-True ($comparison.hard_gates.all_p0_model_calls_zero -and $comparison.hard_gates.all_p0_failures_zero) '模型实验P0退化'
Assert-True ($comparison.hard_gates.all_claim_failures_zero -and $comparison.hard_gates.all_final_provider_errors_zero) '模型实验Claim或供应商门禁退化'
Assert-True ($cost.dify_billed_cost_cny -eq $null -and $cost.dify_billing_cost_status -eq 'COST_UNKNOWN') 'Dify账单未知边界错误'
Assert-True ($recommendation.decision -eq 'KEEP_PRO_DEFAULT_NO_AUTOMATIC_FLASH_ROUTING') '推荐结论错误'
Assert-True ($modelConfig.model.name -eq 'deepseek-v4-pro') 'Dify默认模型不是Pro'
Assert-True ($policy.enabled_by_default -eq $false -and $policy.production_enabled -eq $false) '实验路由默认开启'

$newFiles = @(
    (Join-Path $projectRoot 'README.md'),
    (Join-Path $projectRoot '打开作品集.cmd'),
    (Join-Path $portfolioRoot '项目案例.html'),
    (Join-Path $docsRoot '项目状态.md'),
    (Join-Path $stageRoot 'README.md'),
    (Join-Path $stageRoot '01_项目成果总览.md'),
    (Join-Path $stageRoot '02_作品集案例.md'),
    (Join-Path $stageRoot '03_关键决策与取舍.md'),
    (Join-Path $stageRoot '04_指标口径与真实证据.md'),
    (Join-Path $stageRoot '05_五分钟演示脚本.md'),
    (Join-Path $stageRoot '06_面试问答与项目讲法.md'),
    (Join-Path $stageRoot '07_交付索引与复现说明.md'),
    (Join-Path $stageRoot 'scripts\validate-portfolio.mjs')
)
$emailPattern = '[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}'
foreach ($file in $newFiles) {
    $text = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)
    Assert-True ($text -notmatch $emailPattern) "文件包含邮箱：$file"
    Assert-True ($text -notmatch 'C:\\Users\\|D:\\项目\\') "文件包含个人绝对路径：$file"
}
$envPath = Join-Path $prototypeRoot '.env.local'
$envLines = Get-Content -LiteralPath $envPath
foreach ($name in @('RAG_API_KEY', 'RAG_DIFY_DATASET_API_KEY')) {
    $line = $envLines | Where-Object { $_ -match "^$([regex]::Escape($name))=" } | Select-Object -First 1
    $value = if ($line) { $line.Substring($line.IndexOf('=') + 1).Trim() } else { '' }
    if ($value) {
        foreach ($file in $newFiles) {
            Assert-True (-not ([System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8).Contains($value))) "$name出现在交付文件：$file"
        }
    }
}
$envFiles = @(Get-ChildItem -LiteralPath $stageRoot -Recurse -File | Where-Object { $_.Name -like '.env*' })
Assert-True ($envFiles.Count -eq 0) '阶段5目录包含环境文件'

& node (Join-Path $stageRoot 'scripts\validate-portfolio.mjs')
Assert-True ($LASTEXITCODE -eq 0) '作品集链接、响应式或打印验证失败'
& pwsh -NoProfile -File (Join-Path $docsRoot '阶段2B_PRD\tests\validate_prd_v1_4.ps1')
Assert-True ($LASTEXITCODE -eq 0) 'PRD V1.4验证失败'
& pwsh -NoProfile -File (Join-Path $prototypeRoot 'tests\validate-stage3b-full.ps1')
Assert-True ($LASTEXITCODE -eq 0) '13页原型验证失败'
& npm --prefix $base run validate:4b2b
Assert-True ($LASTEXITCODE -eq 0) '4B-2B历史门禁验证失败'

$historicalPaths = @(
    '项目1/文档/阶段4A_RAG能力验证/experiments',
    '项目1/文档/阶段4A_RAG能力验证/evaluation',
    '项目1/文档/阶段4A_RAG能力验证/datasets',
    '项目1/文档/阶段4B-1_BFF与P03真实RAG接入/model-validation',
    '项目1/文档/阶段4B-1_BFF与P03真实RAG接入/screenshots',
    '项目1/文档/阶段4B-2A_P06真实入库与P10真实评测',
    '项目1/文档/阶段4B-2A-R1_质量回归诊断',
    '项目1/文档/阶段4B-2A-R2_质量恢复',
    '项目1/文档/阶段4B-2A-R3_跨文档回答修复',
    '项目1/文档/阶段4B-2A-R4_单题回归修复',
    '项目1/文档/阶段4B-2A-R5_单目标检索与质量收口',
    '项目1/文档/阶段4B-2A_原型结项与质量风险冻结',
    '项目1/文档/阶段4B-2B_模型成本与分级路由实验/evidence',
    '项目1/文档/阶段4B-2B_模型成本与分级路由实验/configs',
    '项目1/文档/阶段4B-2B_模型成本与分级路由实验/runs',
    '项目1/文档/阶段4B-2B_模型成本与分级路由实验/baseline'
)
& git -C (Resolve-Path (Join-Path $projectRoot '..')) diff --quiet HEAD -- @historicalPaths
Assert-True ($LASTEXITCODE -eq 0) '阶段5改写了历史RAG证据'

if ($failures.Count -gt 0) {
    Write-Host "FAILED: $($failures.Count) 个阶段5验证失败" -ForegroundColor Red
    $failures | ForEach-Object { Write-Host "- $_" -ForegroundColor Red }
    exit 1
}
Write-Host 'PASSED: 阶段5入口、作品集、链接、响应式、打印、真实指标边界与历史回归一致' -ForegroundColor Yellow
