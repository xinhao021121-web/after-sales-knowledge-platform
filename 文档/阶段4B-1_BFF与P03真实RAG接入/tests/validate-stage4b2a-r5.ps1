$ErrorActionPreference = 'Stop'
$base = Split-Path -Parent $PSScriptRoot
$projectRoot = Resolve-Path (Join-Path $base '..\..')
$r4Root = Join-Path $projectRoot '文档\阶段4B-2A-R4_单题回归修复'
$r5Root = Join-Path $projectRoot '文档\阶段4B-2A-R5_单目标检索与质量收口'
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
    '01_R4冻结基线.md',
    '02_RET-H07检索根因.md',
    '03_代表性问法与文档多样性修复.md',
    '04_修复前后Top3对照.md',
    '05_正式17条真实重跑证据.md',
    '06_全部回归样例结果.md',
    '07_新保留样例首次结果.md',
    '08_业务语义与人工验收.md',
    '09_测试报告.md',
    '10_决策日志.md',
    'baseline/p10-real-r4.json',
    'baseline/regression-v4-real-r4.json',
    'baseline/holdout-v4-first-run-r4.json',
    'baseline/RET-H07-first-failure.json',
    'baseline/RET-H08-r4.json',
    'baseline/POC-R04-r4.json',
    'baseline/dify-config-r4-final.json',
    'baseline/candidate-inventory-after-r4.json',
    'baseline/r4-system-prompt.txt',
    'regression/retention-set-v5.0.json',
    'regression/poc-r04-visible-v1.0.json',
    'holdout/retention-set-v5.0.json',
    'configs/r5-system-prompt.txt',
    'evidence/r4-freeze.json',
    'evidence/r5-holdout-freeze.json',
    'evidence/ret-h07-top3-before-after.json',
    'evidence/RET-H07-relevance-analysis.json',
    'evidence/RET-H07-candidate-pool-before-fix.json',
    'evidence/dify-config-comparison-r5.json',
    'evidence/dify-config-after-r5.json',
    'evidence/candidate-inventory-after-r5.json',
    'evidence/p10-real-r5.json',
    'evidence/formal-r4-vs-r5.json',
    'evidence/regression-v5-real.json',
    'evidence/holdout-v5-first-run.json',
    'evidence/poc-r04-visible-semantic-r5.json',
    'evidence/quality-gate-r5.json',
    'evidence/test-results.json'
)
foreach ($relative in $required) {
    Assert-True (Test-Path -LiteralPath (Join-Path $r5Root $relative) -PathType Leaf) "R5缺少交付文件：$relative"
}
foreach ($script in @(
    'run-stage4b2-r5-p10-real.mjs',
    'run-r5-semantic-suite.mjs'
)) {
    Assert-True (Test-Path -LiteralPath (Join-Path $base "scripts/$script") -PathType Leaf) "缺少R5脚本：$script"
}
foreach ($script in @(
    'build-r5-evidence.mjs',
    'capture-r5-screenshots.mjs',
    'capture-r5-dify-config.mjs',
    'capture-candidate-inventory.mjs'
)) {
    Assert-True (Test-Path -LiteralPath (Join-Path $r5Root "scripts/$script") -PathType Leaf) "缺少R5脚本：$script"
}

$package = Read-Json (Join-Path $base 'package.json')
Assert-True ($package.scripts.'validate:4b2a-r5' -eq 'pwsh -NoProfile -File tests/validate-stage4b2a-r5.ps1') '缺少validate:4b2a-r5入口'

& node (Join-Path $base 'tests\server-unit.mjs')
Assert-True ($LASTEXITCODE -eq 0) '服务端单元测试失败'
& node (Join-Path $base 'tests\stage4b2-unit.mjs')
Assert-True ($LASTEXITCODE -eq 0) 'R5检索与语义单元测试失败'
& node (Join-Path $base 'tests\e2e-stage4b2.mjs')
Assert-True ($LASTEXITCODE -eq 0) 'P06/P10浏览器回归失败'

$freeze = Read-Json (Join-Path $r5Root 'evidence/r4-freeze.json')
Assert-True ($freeze.r4_commit -eq '5ad5467' -and $freeze.status -eq 'FROZEN') 'R4冻结提交或状态错误'
foreach ($property in @($freeze.files.PSObject.Properties)) {
    $relative = $property.Name
    $frozenPath = Join-Path $r5Root $relative
    $actualHash = Get-EvidenceHash -Path $frozenPath -Mode $property.Value.hash_mode
    Assert-True ($actualHash -eq $property.Value.sha256) "R4冻结文件被改写：$relative"
    $sourcePath = Join-Path (Join-Path $projectRoot '文档') $property.Value.source
    $sourceHash = Get-EvidenceHash -Path $sourcePath -Mode $property.Value.hash_mode
    Assert-True ($sourceHash -eq $property.Value.sha256) "R4原始证据不一致：$relative"
}
& git -C $projectRoot diff --quiet HEAD -- '项目1/文档/阶段4A_RAG能力验证/evaluation/eval-set-v1.0.0.json'
Assert-True ($LASTEXITCODE -eq 0) '正式17条任务集被修改'

$formal = Read-Json (Join-Path $r5Root 'evidence/p10-real-r5.json')
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
    Assert-True ($result.evidence.answer -notmatch '目标[一二三四1-4]') "用户可见回答引用内部目标：$($result.task_id)"
    Assert-True ($result.evidence.suggested_action -notmatch '目标[一二三四1-4]|上述步骤') "建议动作引用内部目标或上下文：$($result.task_id)"
    Assert-True ($result.business_action_correct -eq $true) "业务动作错误：$($result.task_id)"
    if ($result.p0) {
        Assert-True ($result.answer_status -eq 'BLOCKED_SAFETY' -and $result.p0_passed -eq $true -and $result.provider_called -eq $false) "P0失败：$($result.task_id)"
    } else {
        $segments = @($result.evidence.retrieved | ForEach-Object { $_.segment_id })
        Assert-True ($segments.Count -ge 2 -and $segments.Count -le 3) "Top3数量异常：$($result.task_id)"
        Assert-True (@($segments | Select-Object -Unique).Count -eq $segments.Count) "segment重复：$($result.task_id)"
    }
}

$r04 = $formal.results | Where-Object { $_.task_id -eq 'POC-R04' }
$r04Semantic = Read-Json (Join-Path $r5Root 'evidence/poc-r04-visible-semantic-r5.json')
Assert-True ($r04.answer_status -in @('ANSWERED','NEED_CLARIFICATION')) 'POC-R04状态不在允许范围'
Assert-True ($r04.citation_support_passed -eq $true) 'POC-R04引用未通过'
$r04Text = "$($r04.evidence.answer) $($r04.evidence.suggested_action)"
foreach ($requiredStep in @('放回充电盒','合盖','声道平衡','耳塞','网罩','重新配对','转售后检测','不承诺免费维修或换新')) {
    Assert-True ($r04Text.Contains($requiredStep)) "POC-R04缺少可见步骤：$requiredStep"
}
Assert-True ($r04Text -notmatch '目标[一二三四1-4]|上述步骤') 'POC-R04仍有内部目标或上下文指代'
Assert-True ($r04Semantic.passed -eq $true -and $r04Semantic.run_id -eq $formal.run_id) 'POC-R04最新用户可见语义未通过'

$regression = Read-Json (Join-Path $r5Root 'evidence/regression-v5-real.json')
Assert-True ($regression.passed -eq $true) '既有回归样例集合未通过'
Assert-True ($regression.semantic_passed_count -eq 8 -and @($regression.results).Count -eq 8) '回归语义不是8/8'
Assert-True ($regression.provider_errors -eq 0 -and $regression.p0_failures -eq 0) '回归存在供应商或P0错误'
Assert-True ($regression.citation_failures -eq 0 -and $regression.forbidden_action_failures -eq 0) '回归存在Claim或禁止动作错误'
Assert-True ($regression.document_request_failures -eq 0) '回归存在文档转嫁'
Assert-True ($regression.cost_status -eq 'COST_UNKNOWN') '回归成本不是COST_UNKNOWN'
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
$h07 = $regression.results | Where-Object { $_.task_id -eq 'RET-H07' }
$h08 = $regression.results | Where-Object { $_.task_id -eq 'RET-H08' }
Assert-True ($h02.answer_status -eq 'NO_ANSWER') 'RET-H02未保持知识不足'
Assert-True ($h03.answer_status -eq 'BLOCKED_SAFETY' -and $h03.p0_passed -eq $true) 'RET-H03未阻断'
Assert-True ($h05.answer_status -eq 'NO_ANSWER') 'RET-H05未保持知识不足'
Assert-True ($h06.answer_status -eq 'BLOCKED_SAFETY' -and $h06.p0_passed -eq $true) 'RET-H06未阻断'
Assert-True ($h07.business_semantics.passed -eq $true -and $h07.citation_gate_passed -eq $true) 'RET-H07语义或引用失败'
Assert-True (@($h07.retrieval_resources | Where-Object { $_.segment_id -eq '157cc321-cf47-44a0-872c-e30d38e5e5ab' }).Count -eq 1) 'RET-H07未检索到POWER正文'
$h07Text = "$($h07.answer) $($h07.suggested_action)"
foreach ($requiredStep in @('充电盒','线缆','电源','接口','触点','碎屑','重新配对','不承诺免费维修或换新')) {
    Assert-True ($h07Text.Contains($requiredStep)) "RET-H07缺少可见步骤：$requiredStep"
}
Assert-True ($h07Text -match '针') 'RET-H07未保留尖锐物安全限制'
Assert-True ($h08.business_semantics.passed -eq $true -and $h08.answer_goals.Count -ge 2 -and $h08.citations.Count -ge 2) 'RET-H08跨文档语义失败'

$h07Evidence = Read-Json (Join-Path $r5Root 'evidence/ret-h07-top3-before-after.json')
Assert-True ($h07Evidence.before.semantic_passed -eq $false) 'RET-H07修复前失败未保留'
Assert-True ($h07Evidence.before.top3.document_id -contains 'DOC-WARRANTY-V1') 'RET-H07修复前Top3未保留'
Assert-True ($h07Evidence.after.retrieval_query -eq $h07Evidence.original_question) 'RET-H07未优先使用原始问题'
Assert-True ($h07Evidence.after.top3.segment_id -contains '157cc321-cf47-44a0-872c-e30d38e5e5ab') 'RET-H07修复后Top3缺少POWER正文'
Assert-True ($h07Evidence.after.internal_candidate_pool_size -eq 14 -and $h07Evidence.after.displayed_top_k -eq 3) '内部候选池与最终Top3未区分'
Assert-True ($h07Evidence.after.semantic_passed -eq $true -and $h07Evidence.after.citation_gate_passed -eq $true) 'RET-H07对照中修复后语义或引用失败'

$holdout = Read-Json (Join-Path $r5Root 'evidence/holdout-v5-first-run.json')
$holdoutSet = Read-Json (Join-Path $r5Root 'holdout/retention-set-v5.0.json')
$holdoutFreeze = Read-Json (Join-Path $r5Root 'evidence/r5-holdout-freeze.json')
$holdoutHash = Get-EvidenceHash -Path (Join-Path $r5Root 'evidence/holdout-v5-first-run.json') -Mode $holdoutFreeze.hash_mode
Assert-True ($holdoutHash -eq $holdoutFreeze.sha256) 'RET-H09首轮结果被覆盖'
Assert-True ($holdoutSet.used_for_tuning -eq $false -and $holdoutSet.frozen_before_first_run -eq $true) '新样例未在首次运行前冻结'
Assert-True ($holdout.used_for_tuning -eq $false -and @($holdout.results).Count -eq 2) '新样例首次运行标记或数量错误'
Assert-True ($holdout.passed -eq $false -and $holdout.semantic_passed_count -eq 1) '新样例首轮结果不是1/2'
$h09 = $holdout.results | Where-Object { $_.task_id -eq 'RET-H09' }
$h10 = $holdout.results | Where-Object { $_.task_id -eq 'RET-H10' }
Assert-True ($h09.business_semantics.passed -eq $false) 'RET-H09首次失败未保留'
Assert-True (@($h09.business_semantics.visible_action_missing_groups).Count -gt 0) 'RET-H09失败原因未保留'
Assert-True ($h10.business_semantics.passed -eq $true) 'RET-H10首次语义未通过'

$quality = Read-Json (Join-Path $r5Root 'evidence/quality-gate-r5.json')
Assert-True ($quality.status -eq 'FAILED') '总体质量状态不是FAILED'
Assert-True ($quality.failure_reason -match 'RET-H09') '总体失败原因未记录RET-H09'
Assert-True ($quality.threshold_unchanged -eq 0.9167) '阈值被修改'
Assert-True ($quality.cost_status -eq 'COST_UNKNOWN') '成本状态被修改'
Assert-True ($quality.release_performed -eq $false -and $quality.entered_4b2b -eq $false) '发布或进入4B2B标记错误'

$inventory = Read-Json (Join-Path $r5Root 'evidence/candidate-inventory-after-r5.json')
Assert-True ($inventory.dataset_name -eq 'CANDIDATE') '索引清单不是CANDIDATE'
Assert-True ($inventory.active_document_count -eq 5 -and $inventory.logical_active_document_count -eq 5) '活动文档不是5/5'
Assert-True (@($inventory.duplicate_active_logical_documents).Count -eq 0) '存在逻辑文档并存版本'

$config = Read-Json (Join-Path $r5Root 'evidence/dify-config-after-r5.json')
$comparison = Read-Json (Join-Path $r5Root 'evidence/dify-config-comparison-r5.json')
$prompt = [System.IO.File]::ReadAllText((Join-Path $r5Root 'configs/r5-system-prompt.txt'), [System.Text.Encoding]::UTF8)
$sha256 = [System.Security.Cryptography.SHA256]::Create()
$promptHash = [System.BitConverter]::ToString(
    $sha256.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($prompt.Trim()))
).Replace('-', '').ToLowerInvariant()
$sha256.Dispose()
Assert-True ($config.model.name -eq 'deepseek-v4-pro' -and $config.knowledge_nodes[0].top_k -eq 10) 'Dify最终模型或TopK漂移'
Assert-True (($config.workflow_versions | Where-Object { $_.version_number -eq 21 }).Count -eq 1) 'Dify最终版本不是21'
Assert-True ($config.prompt_sha256.Trim() -eq $promptHash) 'Dify与本地R5 Prompt不一致'
Assert-True ($config.knowledge_nodes[0].reranking_model.model -eq 'qwen3-rerank') 'Dify Rerank模型漂移'
Assert-True ($comparison.before.version -eq 18 -and $comparison.after.version -eq 21) 'R4/R5 Dify版本对照错误'
Assert-True ($comparison.business_knowledge_published -eq $false) '业务知识库发布标记错误'
Assert-True ($prompt -match '原始问题中的用户事实优先' -and $prompt -match '改写问法只用于补充检索意图' -and $prompt -match '不承诺免费维修或换新') 'R5 Prompt缺少单目标或承诺边界'

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
$envFiles = @(Get-ChildItem -LiteralPath $r5Root -Recurse -File | Where-Object { $_.Name -like '.env*' })
Assert-True ($envFiles.Count -eq 0) 'R5交付目录包含环境文件'

if ($failures.Count -gt 0) {
    Write-Host "FAILED: $($failures.Count) 个R5证据验证失败" -ForegroundColor Red
    $failures | ForEach-Object { Write-Host "- $_" -ForegroundColor Red }
    exit 1
}
Write-Host 'PASSED: R5正式17条、8条回归、POC-R04与RET-H07证据一致；总体质量因RET-H09首次语义失败保持FAILED' -ForegroundColor Yellow
