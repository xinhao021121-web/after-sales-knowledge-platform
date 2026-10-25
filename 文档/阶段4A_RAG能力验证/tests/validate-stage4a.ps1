$ErrorActionPreference = 'Stop'
$base = Split-Path -Parent $PSScriptRoot
$script:Failures = New-Object System.Collections.Generic.List[string]

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { $script:Failures.Add($Message) }
}

function Read-JsonFile {
    param([string]$RelativePath)
    $full = Join-Path $base $RelativePath
    Assert-True (Test-Path -LiteralPath $full -PathType Leaf) "缺少文件：$RelativePath"
    if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { return $null }
    try { return Get-Content -Raw -LiteralPath $full | ConvertFrom-Json }
    catch { $script:Failures.Add("JSON 无法解析：$RelativePath"); return $null }
}

$required = @(
    'README.md',
    '01_候选方案对比.md',
    '02_数据集与来源清单.md',
    '03_推荐配置与供应商决策.md',
    '04_RAG适配接口契约.md',
    '05_安全与凭据边界.md',
    '06_阶段4A验收记录.md',
    'datasets/TEST/manifest.json',
    'datasets/CANDIDATE/manifest.json',
    'evaluation/eval-set-v1.0.json',
    'evaluation/core-chains.md',
    'experiments/experiment-plan.md',
    'experiments/config-matrix.csv',
    'experiments/metrics-results.md',
    'experiments/core-task-readiness.md',
    'experiments/failure-taxonomy.md',
    'experiments/provider-account-todo.md',
    'experiments/real-provider-run-status.json',
    'experiments/dify-runtime-config.json',
    'experiments/manual-review.json',
    'experiments/project-owner-p0-confirmation.json',
    'experiments/results/local-contract-run.json',
    'experiments/results/dify-cloud/comparison.json',
    'experiments/results/dify-cloud/README.md',
    'experiments/results/dify-cloud/artifact-hashes.json',
    'experiments/results/dify-cloud/evidence/dify-final-config.png',
    'contracts/rag-adapter.openapi.json',
    'contracts/fixtures/normalized-response-examples.json',
    'architecture/01_技术架构.drawio',
    'architecture/README.md',
    'sources/source-records-2026-10-24.csv',
    'sources/original-file-hashes.json',
    'sources/source-verification-2026-10-24.md',
    'scripts/local-rag-harness.mjs',
    'scripts/contract-smoke.mjs',
    'scripts/preflight-check.mjs',
    'scripts/provider-preflight.mjs',
    'scripts/run-dify-experiment.mjs',
    'scripts/normalize-experiment-results.mjs',
    'scripts/hash-results.mjs',
    '.gitignore',
    '.env.example',
    'tests/validate-stage4a.ps1'
)
foreach ($file in $required) {
    Assert-True (Test-Path -LiteralPath (Join-Path $base $file) -PathType Leaf) "缺少交付文件：$file"
}

$candidate = Read-JsonFile 'datasets/CANDIDATE/manifest.json'
$test = Read-JsonFile 'datasets/TEST/manifest.json'
$evalSet = Read-JsonFile 'evaluation/eval-set-v1.0.json'
$sourceRecords = @(Import-Csv -LiteralPath (Join-Path $base 'sources\source-records-2026-10-24.csv'))
$realStatus = Read-JsonFile 'experiments/real-provider-run-status.json'
$difyRuntime = Read-JsonFile 'experiments/dify-runtime-config.json'
$manualReview = Read-JsonFile 'experiments/manual-review.json'
$ownerConfirmation = Read-JsonFile 'experiments/project-owner-p0-confirmation.json'
$comparison = Read-JsonFile 'experiments/results/dify-cloud/comparison.json'
$artifactHashes = Read-JsonFile 'experiments/results/dify-cloud/artifact-hashes.json'
$localRun = Read-JsonFile 'experiments/results/local-contract-run.json'
$contract = Read-JsonFile 'contracts/rag-adapter.openapi.json'
$fixtures = Read-JsonFile 'contracts/fixtures/normalized-response-examples.json'

Assert-True ($candidate.documents.Count -eq 5) 'CANDIDATE 应包含 5 份首批知识'
Assert-True ($test.documents.Count -eq 8) 'TEST 应包含 5 份基础知识和 3 份专项样本'
Assert-True ($candidate.contains_real_customer_data -eq $false -and $test.contains_real_customer_data -eq $false) '数据集不得包含真实客户数据'
Assert-True ($sourceRecords.Count -ge 16) '来源清单不足'
foreach ($source in $sourceRecords) {
    foreach ($field in @('src_id','version','title','url_or_file','publisher','verified_at','scope','valid_until','owner_role','rag_allowed','source_kind','availability')) {
        Assert-True (-not [string]::IsNullOrWhiteSpace([string]$source.$field)) "来源字段缺失：$($source.src_id).$field"
    }
}
$sourceIds = [System.Collections.Generic.HashSet[string]]::new([string[]]$sourceRecords.src_id)
foreach ($document in @($candidate.documents) + @($test.documents)) {
    foreach ($sourceId in $document.src_ids) {
        Assert-True ($sourceIds.Contains([string]$sourceId)) "文档引用了未登记来源：$($document.doc_id) -> $sourceId"
    }
}

$datasetEntries = @(
    @{ Name = 'CANDIDATE'; Data = $candidate },
    @{ Name = 'TEST'; Data = $test }
)
foreach ($datasetEntry in $datasetEntries) {
    $dataset = $datasetEntry.Data
    $datasetRoot = Join-Path $base (Join-Path 'datasets' $datasetEntry.Name)
    foreach ($document in $dataset.documents) {
        foreach ($field in @('doc_id','src_ids','title','file','version','publisher','verified_at','scope','valid_until','owner_role','authority','status','permission_scope','rag_allowed','sha256')) {
            Assert-True ($null -ne $document.$field -and [string]$document.$field -ne '') "来源字段缺失：$($document.doc_id).$field"
        }
        $path = Join-Path $datasetRoot $document.file
        Assert-True (Test-Path -LiteralPath $path -PathType Leaf) "文档不存在：$($document.file)"
        if (Test-Path -LiteralPath $path -PathType Leaf) {
            $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLower()
            Assert-True ($hash -eq $document.sha256) "文档 SHA256 不一致：$($document.file)"
        }
    }
}

$allTasks = @($evalSet.tasks)
Assert-True ($allTasks.Count -eq 17) "评测任务应为 17，实际 $($allTasks.Count)"
Assert-True (@($allTasks | Where-Object { $_.core_task_id -like 'CORE-*' }).Count -eq 12) '12 条核心任务不完整'
$edgeIds = @('EDGE-NO-KNOWLEDGE','EDGE-EXPIRED-KNOWLEDGE','EDGE-CHANNEL-CONFLICT','EDGE-PERMISSION-MISMATCH','EDGE-P0-SAFETY')
foreach ($edgeId in $edgeIds) {
    Assert-True (@($allTasks | Where-Object { $_.core_task_id -eq $edgeId }).Count -eq 1) "缺少专项样本：$edgeId"
}
foreach ($task in $allTasks) {
    foreach ($field in @('id','core_task_id','dataset','category','original_question','rewrites','required_business_conditions','expected_action','forbidden_actions','no_answer_behavior','p0_redline')) {
        Assert-True ($null -ne $task.$field -and [string]$task.$field -ne '') "任务字段缺失：$($task.id).$field"
    }
    Assert-True ($task.rewrites.Count -ge 1) "任务缺少改写问法：$($task.id)"
    Assert-True ($task.forbidden_actions.Count -ge 1) "任务缺少禁止动作：$($task.id)"
    Assert-True ($null -ne $task.p0) "任务缺少 P0 标记：$($task.id)"
}
Assert-True (@($allTasks | Where-Object { $_.p0 -eq $true }).Count -ge 1) '至少需要一条 P0 样本'
Assert-True ((Read-JsonFile 'evaluation/eval-set-v1.0.json').excluded_samples -match '24 条 AI 预填') '未明确排除 24 条 AI 预填样本'

Assert-True ($realStatus.status -eq 'COMPLETED_WITH_REQUIRED_BFF_GATES') '真实实验结果状态错误'
Assert-True ($realStatus.provider.name -eq 'Dify Cloud') '真实提供方不是 Dify Cloud'
Assert-True (@($realStatus.completed_configs).Count -ge 3) '真实配置结果不足'
Assert-True ($difyRuntime.models.embedding -eq 'text-embedding-v4') 'Embedding 配置未记录'
Assert-True ($difyRuntime.models.rerank -eq 'qwen3-rerank') 'Rerank 配置未记录'
Assert-True ($difyRuntime.final_binding.dataset -eq 'CANDIDATE') '最终应用未恢复 CANDIDATE'

foreach ($configId in @('CFG-BASE','CFG-HYBRID','CFG-RERANK')) {
    $rawDir = Join-Path $base "experiments/results/dify-cloud/$configId/raw"
    $rawFiles = @(Get-ChildItem -LiteralPath $rawDir -Filter '*.json' -File -ErrorAction SilentlyContinue)
    Assert-True ($rawFiles.Count -eq 17) "$configId 真实响应应为 17，实际 $($rawFiles.Count)"
    Assert-True (Test-Path -LiteralPath (Join-Path $base "experiments/results/dify-cloud/$configId/summary.json") -PathType Leaf) "$configId 缺少 summary.json"
}
$testRaw = @(Get-ChildItem -LiteralPath (Join-Path $base 'experiments/results/dify-cloud/CFG-RERANK-TEST/raw') -Filter '*.json' -File -ErrorAction SilentlyContinue)
Assert-True ($testRaw.Count -eq 5) "TEST 专项真实响应应为 5，实际 $($testRaw.Count)"

Assert-True (@($comparison.comparisons).Count -eq 3) '三配置归一化结果缺失'
Assert-True ($comparison.final_pipeline.task_count -eq 17) '最终管道未覆盖 17 条任务'
Assert-True ($comparison.final_pipeline.p0_count -eq 6) '最终 P0 数量错误'
Assert-True ($comparison.final_pipeline.p0_final_failures -eq 0) '最终 P0 仍有失败'
Assert-True ($comparison.final_pipeline.business_action_correct_count -eq 17) '最终业务动作未全部通过'
Assert-True ($comparison.final_pipeline.followup_complete_count -eq 17) '最终追问未全部完整'
Assert-True ($comparison.final_pipeline.correct_refusal_count -eq 4) '拒答专项未全部通过'
Assert-True ($comparison.final_pipeline.provider_raw_p0_failures -gt 0) '必须保留提供方原始 P0 失败记录'
$rerankP0Review = $manualReview.provider_p0_review.'CFG-RERANK'
Assert-True (@($rerankP0Review.PSObject.Properties).Count -eq 6) 'P0 人工复核记录不足 6 条'
Assert-True ($ownerConfirmation.status -eq 'CONFIRMED') '项目负责人P0确认状态错误'
Assert-True ($ownerConfirmation.confirmer_role -eq '项目负责人') 'P0确认人角色错误'
Assert-True ($ownerConfirmation.confirmed_at -eq '2026-10-24') 'P0确认日期错误'
Assert-True (@($ownerConfirmation.confirmation_scope.p0_sample_ids).Count -eq 6) 'P0确认范围不足6条'
Assert-True ($ownerConfirmation.source_review.manual_review_modified -eq $false) '人工复核原始记录被错误标记为已修改'
Assert-True ($ownerConfirmation.source_review.provider_raw_p0_failures_preserved -eq $true) '提供方原始P0失败未声明保留'
$manualReviewHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $base 'experiments/manual-review.json')).Hash.ToLower()
Assert-True ($manualReviewHash -eq $ownerConfirmation.source_review.manual_review_sha256) 'manual-review.json 与签署锁定哈希不一致'
$edgeStatus = @{}
foreach ($task in @($comparison.final_pipeline.tasks)) { $edgeStatus[$task.task_id] = $task.final_answer_status }
Assert-True ($edgeStatus['POC-E01'] -eq 'NO_ANSWER') '无知识场景状态错误'
Assert-True ($edgeStatus['POC-E02'] -eq 'KNOWLEDGE_EXPIRED') '过期知识场景状态错误'
Assert-True ($edgeStatus['POC-E03'] -eq 'CONFLICT') '渠道冲突场景状态错误'
Assert-True ($edgeStatus['POC-E04'] -eq 'PERMISSION_DENIED') '权限场景状态错误'
Assert-True ($artifactHashes.files.Count -ge 90) '结果快照清单不足'
$artifactHashFailures = 0
foreach ($artifact in $artifactHashes.files) {
    $artifactPath = Join-Path $base $artifact.path
    if (-not (Test-Path -LiteralPath $artifactPath -PathType Leaf)) {
        $artifactHashFailures++
        continue
    }
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $artifactPath).Hash.ToLower()
    if ($hash -ne $artifact.sha256) { $artifactHashFailures++ }
}
Assert-True ($artifactHashFailures -eq 0) "结果快照哈希失败 $artifactHashFailures 项"

$gitIgnored = $true
& git -C $base check-ignore -q '.env.local'
if ($LASTEXITCODE -ne 0) { $gitIgnored = $false }
Assert-True ($gitIgnored) '.env.local 未被 Git 忽略'

Assert-True ($localRun.status -eq 'LOCAL_CONTRACT_SIMULATION_ONLY') '本地结果边界标记错误'
Assert-True ($localRun.notice -match '不是.*真实.*结果') '本地结果缺少真实性免责声明'

$requiredPaths = @('/health','/datasets','/datasets/{dataset_id}','/documents','/ingestions','/ingestions/{job_id}','/retrieval/search','/answers','/environments/{environment}/activate')
foreach ($apiPath in $requiredPaths) {
    Assert-True ($null -ne $contract.paths.$apiPath) "适配契约缺少接口：$apiPath"
}
Assert-True ($null -ne $contract.components.parameters.IdempotencyKey) '缺少 Idempotency-Key'
Assert-True ($null -ne $contract.components.schemas.ErrorResponse) '缺少统一错误结构'
Assert-True ($contract.components.schemas.Environment.enum -contains 'test' -and $contract.components.schemas.Environment.enum -contains 'candidate' -and $contract.components.schemas.Environment.enum -contains 'production') '环境隔离不完整'
Assert-True ($fixtures.fixture_notice -match 'NOT PROVIDER RESULTS') '契约 fixture 未标注非提供方结果'

$drawioPath = Join-Path $base 'architecture\01_技术架构.drawio'
try {
    [xml]$drawio = Get-Content -Raw -LiteralPath $drawioPath
    $cells = @($drawio.mxfile.diagram.mxGraphModel.root.mxCell)
    $ids = @($cells | ForEach-Object { $_.id })
    Assert-True (($ids | Sort-Object -Unique).Count -eq $ids.Count) 'Draw.io 存在重复 ID'
    $idSet = [System.Collections.Generic.HashSet[string]]::new([string[]]$ids)
    foreach ($cell in $cells) {
        if ($cell.edge -eq '1') {
            Assert-True ($idSet.Contains([string]$cell.source) -and $idSet.Contains([string]$cell.target)) "Draw.io 边引用不存在：$($cell.id)"
            Assert-True ($null -ne $cell.mxGeometry) "Draw.io 边缺少 geometry：$($cell.id)"
        }
    }
    $page = $drawio.mxfile.diagram.mxGraphModel
    $pageWidth = [double]$page.pageWidth
    $pageHeight = [double]$page.pageHeight
    $containers = @{}
    foreach ($cell in $cells) {
        if ($cell.vertex -eq '1' -and $null -ne $cell.mxGeometry) {
            $containers[[string]$cell.id] = @{ Width=[double]$cell.mxGeometry.width; Height=[double]$cell.mxGeometry.height }
        }
    }
    foreach ($cell in $cells) {
        if ($cell.vertex -ne '1' -or $null -eq $cell.mxGeometry) { continue }
        $x = [double]$cell.mxGeometry.x
        $y = [double]$cell.mxGeometry.y
        $w = [double]$cell.mxGeometry.width
        $h = [double]$cell.mxGeometry.height
        if ($cell.parent -eq '1') {
            Assert-True ($x -ge 0 -and $y -ge 0 -and ($x + $w) -le $pageWidth -and ($y + $h) -le $pageHeight) "Draw.io 根级元素越界：$($cell.id)"
        } elseif ($containers.ContainsKey([string]$cell.parent)) {
            $container = $containers[[string]$cell.parent]
            Assert-True ($x -ge 0 -and $y -ge 0 -and ($x + $w) -le $container.Width -and ($y + $h) -le $container.Height) "Draw.io 子元素溢出容器：$($cell.id)"
        }
    }
} catch {
    $script:Failures.Add("Draw.io XML 解析失败：$($_.Exception.Message)")
}

$bundledNode = 'C:\Users\李昕昊\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$node = if (Test-Path -LiteralPath $bundledNode) { $bundledNode } else { (Get-Command node -ErrorAction Stop).Source }

& $node (Join-Path $base 'scripts\preflight-check.mjs')
Assert-True ($LASTEXITCODE -eq 0) '安全预检失败'

& $node (Join-Path $base 'scripts\provider-preflight.mjs')
Assert-True ($LASTEXITCODE -eq 0) 'Dify 服务端配置预检失败'

& $node (Join-Path $base 'scripts\local-rag-harness.mjs')
Assert-True ($LASTEXITCODE -eq 0) '本地数据/安全门禁演练失败'
$localRun = Read-JsonFile 'experiments/results/local-contract-run.json'
Assert-True ($localRun.checks.task_count -eq 17) '本地演练未覆盖 17 条任务'
Assert-True ($localRun.checks.core_task_count -eq 12) '本地演练未覆盖 12 条核心任务'
Assert-True ($localRun.checks.edge_case_count -eq 5) '本地演练未覆盖 5 条专项样本'
Assert-True ($localRun.checks.p0_gate_failures -eq 0) '本地 P0 门禁存在失败'
Assert-True ($localRun.checks.expected_source_preview_misses -eq 0) '本地来源预览存在漏命中'
Assert-True ($localRun.checks.internal_document_excluded_from_public_index -eq $true) 'internal_only 文档泄露到公开索引'
Assert-True ($localRun.checks.dataset_hashes_valid -eq $true) '数据集哈希校验失败'

& $node (Join-Path $base 'scripts\contract-smoke.mjs')
Assert-True ($LASTEXITCODE -eq 0) 'RAG 适配契约 smoke test 失败'

if ($script:Failures.Count -gt 0) {
    Write-Host "FAILED: $($script:Failures.Count) 个验证失败" -ForegroundColor Red
    $script:Failures | ForEach-Object { Write-Host "- $_" -ForegroundColor Red }
    exit 1
}

Write-Host 'PASSED: 阶段 4A 数据、安全、契约与本地演练验证通过' -ForegroundColor Green
Write-Host '- 数据集：TEST 8；CANDIDATE 5'
Write-Host '- 评测集：17（12 核心 + 5 专项）'
Write-Host '- Dify Cloud：3 个配置 × 17 条真实响应；TEST 专项 5 条'
Write-Host '- 最终推荐管道：17/17 业务动作，6/6 P0 通过'
Write-Host '- 提供方原始 P0 失败已保留，未被最终门禁结果覆盖'
