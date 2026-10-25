$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$base = Split-Path -Parent $PSScriptRoot
$script:Failures = [System.Collections.Generic.List[string]]::new()

function Add-Failure {
    param([string]$Message)
    $script:Failures.Add($Message)
}

function Assert-True {
    param(
        [bool]$Condition,
        [string]$Message
    )
    if (-not $Condition) {
        Add-Failure $Message
    }
}

function Read-RequiredFile {
    param([string]$RelativePath)
    $path = Join-Path $base $RelativePath
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        Add-Failure "缺少文件：$RelativePath"
        return ''
    }
    return Get-Content -Raw -LiteralPath $path
}

$requiredFiles = @(
    '01_企业级RAG知识库平台_PRD_V1.3.md',
    '02_需求追踪矩阵_V1.3.csv',
    '02_需求追踪矩阵说明.md',
    '03_状态转换总表_V1.3.md',
    '04_核心任务GTW验收条件.md',
    '05_异常与系统拦截附录.md',
    '06_权限职责分离附录.md',
    '07_PRD决策记录.md',
    '08_阶段2B验收记录.md',
    '09_PRD依据与来源.md',
    'README.md',
    '图表说明.md',
    'output/prd-logic-audit-20261023-v1.3.html',
    'diagrams/04_状态机_V1.3.drawio'
)

foreach ($file in $requiredFiles) {
    Assert-True (Test-Path -LiteralPath (Join-Path $base $file) -PathType Leaf) "交付文件不存在：$file"
}

$prd = Read-RequiredFile '01_企业级RAG知识库平台_PRD_V1.3.md'
$prdPlain = $prd.Replace('`', '')
$matrixText = Read-RequiredFile '02_需求追踪矩阵_V1.3.csv'
$stateText = Read-RequiredFile '03_状态转换总表_V1.3.md'
$gtw = Read-RequiredFile '04_核心任务GTW验收条件.md'
$exceptions = Read-RequiredFile '05_异常与系统拦截附录.md'
$permissions = Read-RequiredFile '06_权限职责分离附录.md'
$decisions = Read-RequiredFile '07_PRD决策记录.md'
$acceptance = Read-RequiredFile '08_阶段2B验收记录.md'
$sources = Read-RequiredFile '09_PRD依据与来源.md'
$readme = Read-RequiredFile 'README.md'
$diagramNotes = Read-RequiredFile '图表说明.md'
$auditHtml = Read-RequiredFile 'output/prd-logic-audit-20261023-v1.3.html'
$drawioText = Read-RequiredFile 'diagrams/04_状态机_V1.3.drawio'

# 1. 当前版本与文档引用
Assert-True ($prd -match '版本号：V1\.3\.0') 'PRD 版本不是 V1.3.0'
Assert-True ($prd -match '\[03_状态转换总表_V1\.3\.md\]\(03_状态转换总表_V1\.3\.md\)') 'PRD 未链接 V1.3 状态总表'
Assert-True ($prd -match '\[02_需求追踪矩阵_V1\.3\.csv\]\(02_需求追踪矩阵_V1\.3\.csv\)') 'PRD 未链接 V1.3 需求追踪矩阵'
Assert-True ($prd -notmatch '\]\([^)]*V1\.2\.(?:md|csv|html)\)') 'PRD 仍有指向 V1.2 交付文件的现行链接'
Assert-True ($readme -match 'PRD V1\.3') 'README 未更新为 V1.3'
Assert-True ($readme -match '04_状态机_V1\.3\.drawio') 'README 未引用 V1.3 状态图'
Assert-True ($sources -match '01_企业级RAG知识库平台_PRD_V1\.3\.md') '来源文件未引用当前 PRD V1.3'
Assert-True ($diagramNotes -match '04_状态机_V1\.3\.drawio') '图表说明未引用 V1.3 状态图'
Assert-True ($stateText -match '当前版本 V1\.3') '状态总表别名未更新为当前 V1.3'
Assert-True ($gtw -match '版本：V1\.3') 'GTW 版本未更新为 V1.3'

# 2. 功能需求与追踪矩阵
$frIds = [regex]::Matches($prd, 'FR-\d{3}') | ForEach-Object Value | Sort-Object -Unique
Assert-True ($frIds.Count -eq 30) "PRD 功能需求应为 30 条，实际 $($frIds.Count)"
Assert-True (($frIds -join ',') -eq ((1..30 | ForEach-Object { 'FR-{0:D3}' -f $_ }) -join ',')) 'PRD 功能需求编号不连续'

$matrix = @($matrixText | ConvertFrom-Csv)
Assert-True ($matrix.Count -eq 30) "追踪矩阵应为 30 行，实际 $($matrix.Count)"
$matrixIds = @($matrix.req_id | Sort-Object)
Assert-True (($matrixIds -join ',') -eq ($frIds -join ',')) '追踪矩阵需求编号与 PRD 不一致'

$requiredColumns = @('req_id','wave','title','business_source','core_task_ids','objects','state_transition','acceptance_ids','error_codes','dependencies')
foreach ($row in $matrix) {
    foreach ($column in $requiredColumns) {
        if ([string]::IsNullOrWhiteSpace([string]$row.$column)) {
            Add-Failure "追踪矩阵必填单元格为空：$($row.req_id).$column"
        }
    }
}

$validCoreTasks = @(
    'CORE-R1','CORE-R2','CORE-R3','CORE-R4',
    'CORE-S1','CORE-S2','CORE-S3','CORE-S4',
    'CORE-K1','CORE-K2','CORE-K3','CORE-K4'
)
$matrixCoreTasks = [regex]::Matches($matrixText, 'CORE-[RSK]\d') | ForEach-Object Value | Sort-Object -Unique
$validCoreTasksSorted = @($validCoreTasks | Sort-Object)
Assert-True (($matrixCoreTasks -join ',') -eq ($validCoreTasksSorted -join ',')) '追踪矩阵核心任务集合不是 12 条人工确认基线'

$acceptanceRefs = [regex]::Matches(($matrix.acceptance_ids -join ';'), 'AC-[A-Z0-9-]+') | ForEach-Object Value | Sort-Object -Unique
$definedAcceptance = [regex]::Matches(($gtw + $exceptions), 'AC-[A-Z0-9-]+') | ForEach-Object Value | Sort-Object -Unique
$missingAcceptance = @($acceptanceRefs | Where-Object { $_ -notin $definedAcceptance })
Assert-True ($missingAcceptance.Count -eq 0) "追踪矩阵引用未定义验收：$($missingAcceptance -join ',')"

$dependencyMap = @{}
foreach ($row in $matrix) {
    $dependencyMap[$row.req_id] = @()
    foreach ($dependency in ([string]$row.dependencies).Split(';')) {
        if ($dependency -and $dependency -ne '无' -and $dependency -match '^FR-\d{3}$') {
            $dependencyMap[$row.req_id] += $dependency
            if ($dependency -notin $frIds) {
                Add-Failure "追踪矩阵依赖不存在：$($row.req_id) -> $dependency"
            }
        }
    }
}

$visited = @{}
$visiting = @{}
function Test-DependencyCycle {
    param([string]$ReqId)
    if ($visiting.ContainsKey($ReqId)) { return $true }
    if ($visited.ContainsKey($ReqId)) { return $false }
    $visiting[$ReqId] = $true
    foreach ($next in $dependencyMap[$ReqId]) {
        if (Test-DependencyCycle $next) { return $true }
    }
    $visiting.Remove($ReqId)
    $visited[$ReqId] = $true
    return $false
}
foreach ($reqId in $frIds) {
    Assert-True (-not (Test-DependencyCycle $reqId)) "需求依赖存在环：$reqId"
}

$fr019 = $matrix | Where-Object req_id -eq 'FR-019'
Assert-True ($fr019.dependencies -notmatch 'FR-022') 'FR-019 仍依赖 CASE 功能，导致无 CASE 首次评测不可达'

# 3. GTW 与安全验收
$coreScenarioIds = [regex]::Matches($gtw, '\*\*(AC-[RSK]\d-\d{2})') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique
Assert-True ($coreScenarioIds.Count -eq 24) "核心 GTW 应为 24 个，实际 $($coreScenarioIds.Count)"
foreach ($task in $validCoreTasks) {
    Assert-True ($gtw -match "\| $task \|") "核心任务未映射验收：$task"
}

$crossAcceptanceIds = [regex]::Matches($gtw, '(?m)^\| AC-G-\d{2} \|') | ForEach-Object Value
Assert-True ($crossAcceptanceIds.Count -eq 32) "跨需求验收应为 32 个，实际 $($crossAcceptanceIds.Count)"
foreach ($id in 27..32) {
    Assert-True ($gtw -match "\| AC-G-$('{0:D2}' -f $id) \|") "缺少 V1.3 验收 AC-G-$('{0:D2}' -f $id)"
}

Assert-True ($gtw -match '无 CASE 时只推进 KB/REL/AUD') 'AC-G-27 未明确无 CASE 首次发布'
Assert-True ($gtw -match '一个 KB 版本关联多个 CASE') 'AC-G-31 未覆盖一个 KB 多 CASE'
Assert-True ($gtw -match 'A 保持在线') 'AC-G-30 未覆盖其他知识条目保持在线'
Assert-True ($gtw -match '已关闭 CASE 进 CASE_REOPENED') 'AC-G-32 未覆盖已关闭 CASE 重开'
Assert-True ($gtw -match 'EV-18 不重复建 CASE') 'AC-G-26 未覆盖 EV-18 幂等'
Assert-True ($gtw -match 'previous_esc_id') 'AC-G-29 未覆盖 ESC 新单关联'

foreach ($u in 1..9) {
    Assert-True ($exceptions -match "(?m)^### U$u ") "异常附录缺少 U$u"
}
Assert-True ($permissions -match '客服主管对 `CTX` 只有读取权限') '权限附录未固定客服主管 CTX 只读'
Assert-True ($permissions -match 'R3：必须由法务/安全责任人确认关闭') '权限附录未固定 R3 关闭责任'
Assert-True ($permissions -match '首版 P0 不支持角色委托') '权限附录未限制角色委托'

# 4. 状态与跨对象事件
$stateSections = @{}
$currentObject = $null
$declaredCounts = @{}
$eventRows = @()
$sectionMode = ''

foreach ($line in ($stateText -split "`r?`n")) {
    if ($line -match '^### 1\.\d+ .*?`([A-Z]+)`（(\d+) 状态）') {
        $currentObject = $Matches[1]
        $declaredCounts[$currentObject] = [int]$Matches[2]
        $stateSections[$currentObject] = 0
        $sectionMode = 'states'
        continue
    }
    if ($line -eq '## 2. 跨对象事件') {
        $currentObject = $null
        $sectionMode = 'events'
        continue
    }
    if ($sectionMode -eq 'states' -and $currentObject -and $line -match '^\| `[^`]+` \|') {
        $stateSections[$currentObject]++
        $columns = @($line.Trim('|').Split('|') | ForEach-Object { $_.Trim() })
        Assert-True ($columns.Count -eq 6) "状态行字段数不是 6：$line"
        foreach ($column in $columns) {
            Assert-True ($column.Length -gt 0) "状态行存在空字段：$line"
        }
        $nextSelf = $columns[4]
        foreach ($stateToken in [regex]::Matches($nextSelf, '(?:ASQ|ESC|SRC|KB|CASE|EVAL|REL)(?:_[A-Z]+)+')) {
            $tokenObject = ($stateToken.Value -split '_')[0]
            if ($tokenObject -ne $currentObject) {
                Add-Failure "自身下一状态混入其他对象状态：$currentObject -> $($stateToken.Value)"
            }
        }
    }
    if ($sectionMode -eq 'events' -and $line -match '^\| (EV-\d{2}) \|') {
        $eventRows += $line
    }
}

$totalStates = ($stateSections.Values | Measure-Object -Sum).Sum
Assert-True ($totalStates -eq 52) "自身状态总数应为 52，实际 $totalStates"
foreach ($object in $declaredCounts.Keys) {
    Assert-True ($stateSections[$object] -eq $declaredCounts[$object]) "$object 声明状态数与表格行数不一致"
}

$expectedStateCounts = @{ ASQ = 10; ESC = 7; SRC = 7; KB = 8; CASE = 9; EVAL = 5; REL = 6 }
foreach ($object in $expectedStateCounts.Keys) {
    Assert-True ($stateSections[$object] -eq $expectedStateCounts[$object]) "$object 状态数与 V1.3 基线不一致"
}

Assert-True ($eventRows.Count -eq 18) "跨对象事件应为 18 个，实际 $($eventRows.Count)"
$eventIds = @($eventRows | ForEach-Object { [regex]::Match($_, '^\| (EV-\d{2}) \|').Groups[1].Value })
Assert-True (($eventIds -join ',') -eq ((1..18 | ForEach-Object { 'EV-{0:D2}' -f $_ }) -join ',')) '跨对象事件编号不连续或重复'
foreach ($line in $eventRows) {
    $columns = @($line.Trim('|').Split('|') | ForEach-Object { $_.Trim() })
    Assert-True ($columns.Count -eq 10) "跨对象事件字段数不是 10：$($columns[0])"
    foreach ($column in $columns) {
        Assert-True ($column.Length -gt 0) "跨对象事件存在空字段：$($columns[0])"
    }
    Assert-True ($columns[8] -match ':') "跨对象事件缺少结构化幂等键：$($columns[0])"
    Assert-True ($columns[9] -match '失败|保持|重试|待办|不提交') "跨对象事件缺少失败恢复：$($columns[0])"
}

$ev08 = $eventRows | Where-Object { $_ -match '^\| EV-08 \|' }
$ev11 = $eventRows | Where-Object { $_ -match '^\| EV-11 \|' }
$ev17 = $eventRows | Where-Object { $_ -match '^\| EV-17 \|' }
$ev18 = $eventRows | Where-Object { $_ -match '^\| EV-18 \|' }
Assert-True ($ev08 -match 'CASE 关联数可为 0' -and $ev08 -match '原子提交') 'EV-08 未覆盖 0..N CASE 与原子提交'
Assert-True ($ev11 -match '所有满足条件 CASE' ) 'EV-11 未关闭全部满足条件 CASE'
Assert-True ($ev17 -match 'ROLLBACK:\{rollback_request_id\}' -and $ev17 -match '保持 SUSPENDED') 'EV-17 幂等或失败保持不完整'
Assert-True ($ev18 -match 'CASE_FIXING' -and $ev18 -match 'CASE_REOPENED' -and $ev18 -match 'CASE_OPEN') 'EV-18 CASE 分支不完整'
Assert-True ($ev18 -match 'SRC:\{src_id\}:v\{n\}:CASE:\{case_id\}') 'EV-18 幂等键不是来源版本 + CASE ID'
Assert-True ($stateText -notmatch '^\| `ESC_REOPENED`') '状态表仍将 ESC_REOPENED 作为合法状态'

# 5. 发布模型、CASE 与 ESC 不变量
$requiredClaims = @{
    '单 KB 发布' = '一个 REL 只包含一个 KB 版本'
    'ACTIVE 唯一作用域' = 'tenant_id + environment_id + business_domain_id + knowledge_item_id'
    'CASE 0..N' = 'CASE 与 KB 版本/REL 是 0..N 关联'
    'CASE_LINK 唯一键' = 'CASE_LINK(case_id, kb_version_id)'
    'EV-18 来源入案' = '来源失效完成阻断后必须通过 EV-18'
    'ESC 终态' = 'ESC_CLOSED'
    'ESC 新单关联' = 'previous_esc_id'
}
foreach ($claim in $requiredClaims.GetEnumerator()) {
    Assert-True ($prdPlain.Contains($claim.Value)) "PRD 缺少关键不变量：$($claim.Key)"
}
Assert-True ($prd -match '若存在关联 CASE，EVAL 成功时全部关联 CASE') 'PRD 发布门槛仍可能把 CASE 设为必需'
Assert-True ($prd -match '业务域级批量发布快照属于 P1') '业务域批量发布未被明确移入 P1'
Assert-True ($prd -match '无 CASE 首次发布') 'PRD 发布测试缺少无 CASE 首次发布'
Assert-True ($prd -match '更新一个 KB') 'PRD 发布测试缺少单 KB 更新隔离'
Assert-True ($prd -match '已关闭 ESC 复发') 'PRD 发布测试缺少 ESC 复发'
Assert-True ($decisions -match '## PD-023' -and $decisions -match '## PD-028') 'V1.3 决策记录不完整'
Assert-True ($acceptance -match '18 个跨对象事件' -and $acceptance -match '32 个跨需求场景') '验收记录统计未同步 V1.3'

# 6. HTML 逻辑报告
Assert-True ($auditHtml -notmatch '\{\{[^}]+\}\}') '逻辑报告仍有未替换占位符'
Assert-True ($auditHtml -match 'PRD V1\.3') '逻辑报告标题未更新为 V1.3'
Assert-True ($auditHtml -match '<h2>结论：可进入复审</h2>') '逻辑报告结论未明确'
foreach ($id in @('scope','verdict','risk-guide','summary','details','order','decisions','impact','coverage')) {
    Assert-True ($auditHtml -match "id=`"$id`"") "逻辑报告缺少章节 #$id"
}
$hrefs = [regex]::Matches($auditHtml, 'href="#([^"]+)"') | ForEach-Object { $_.Groups[1].Value }
foreach ($href in $hrefs) {
    Assert-True ($auditHtml -match "id=`"$([regex]::Escape($href))`"") "逻辑报告锚点不存在：#$href"
}

# 7. Markdown 本地链接
$markdownFiles = Get-ChildItem -LiteralPath $base -File -Filter '*.md'
foreach ($file in $markdownFiles) {
    $content = Get-Content -Raw -LiteralPath $file.FullName
    foreach ($match in [regex]::Matches($content, '\[[^\]]+\]\(([^)]+)\)')) {
        $target = $match.Groups[1].Value.Trim()
        if ($target -match '^(?:https?://|mailto:|#)') { continue }
        $pathPart = ($target -split '#')[0]
        if (-not $pathPart) { continue }
        $resolved = [System.IO.Path]::GetFullPath((Join-Path $file.DirectoryName $pathPart))
        Assert-True (Test-Path -LiteralPath $resolved) "Markdown 本地链接失效：$($file.Name) -> $target"
    }
}

# 8. Draw.io XML 结构、编号和 V1.3 内容
try {
    [xml]$drawio = $drawioText
} catch {
    Add-Failure "Draw.io XML 无法解析：$($_.Exception.Message)"
    $drawio = $null
}

if ($null -ne $drawio) {
    $diagrams = @($drawio.mxfile.diagram)
    Assert-True ($diagrams.Count -eq 7) "状态图应为 7 页，实际 $($diagrams.Count)"
    foreach ($diagram in $diagrams) {
        $name = [string]$diagram.name
        $model = $diagram.mxGraphModel
        $pageWidth = [double]$model.pageWidth
        $pageHeight = [double]$model.pageHeight
        $cells = @($model.root.mxCell)
        $ids = @($cells | ForEach-Object { [string]$_.id })
        Assert-True (($ids | Sort-Object -Unique).Count -eq $ids.Count) "状态图存在重复节点 ID：$name"

        $idSet = [System.Collections.Generic.HashSet[string]]::new([string[]]$ids)
        foreach ($cell in $cells) {
            $isEdge = $null -ne $cell.PSObject.Properties['edge'] -and [string]$cell.edge -eq '1'
            $isVertex = $null -ne $cell.PSObject.Properties['vertex'] -and [string]$cell.vertex -eq '1'
            if ($isEdge) {
                Assert-True ($idSet.Contains([string]$cell.source)) "状态图边源不存在：$name/$($cell.id)"
                Assert-True ($idSet.Contains([string]$cell.target)) "状态图边目标不存在：$name/$($cell.id)"
                Assert-True ($null -ne $cell.PSObject.Properties['mxGeometry']) "状态图边缺少 geometry：$name/$($cell.id)"
            }
            if ($isVertex -and $null -ne $cell.PSObject.Properties['mxGeometry']) {
                $x = [double]$cell.mxGeometry.x
                $y = [double]$cell.mxGeometry.y
                $width = [double]$cell.mxGeometry.width
                $height = [double]$cell.mxGeometry.height
                Assert-True (($x + $width) -le $pageWidth) "状态图节点超出右边界：$name/$($cell.id)"
                Assert-True (($y + $height) -le $pageHeight) "状态图节点超出下边界：$name/$($cell.id)"
            }
        }
    }

    $riskPage = $diagrams | Where-Object name -eq '风险升级'
    Assert-True ($null -ne $riskPage) '状态图缺少风险升级页'
    if ($null -ne $riskPage) {
        $riskXml = $riskPage.OuterXml
        Assert-True ($riskXml -notmatch 'ESC_REOPENED|已重开') '风险状态图仍把 ESC_REOPENED 作为合法状态'
        Assert-True ($riskXml -match 'previous_esc_id') '风险状态图未标出 previous_esc_id'
    }

    $sourcePage = ($diagrams | Where-Object name -eq '知识来源').OuterXml
    Assert-True ($sourcePage -match 'SRC_REGISTERED' -and $sourcePage -match 'EV-18') '知识来源图未同步登记态和 EV-18'
    $casePage = ($diagrams | Where-Object name -eq '问题案例').OuterXml
    Assert-True ($casePage -match 'CASE_LINK' -and $casePage -match 'CASE_REOPENED') '问题案例图未同步 CASE_LINK 和重开'
    $relPage = ($diagrams | Where-Object name -eq '发布版本').OuterXml
    Assert-True ($relPage -match 'knowledge_item_id' -and $relPage -match 'kb_version_id') '发布状态图未同步唯一作用域和单 KB 字段'
    $evalPage = ($diagrams | Where-Object name -eq '评测任务').OuterXml
    Assert-True ($evalPage -match '0\.\.N') '评测图未同步 CASE 0..N'
}

if ($script:Failures.Count -gt 0) {
    Write-Host "FAILED: $($script:Failures.Count) 个验证失败" -ForegroundColor Red
    $script:Failures | ForEach-Object { Write-Host "- $_" -ForegroundColor Red }
    exit 1
}

Write-Host "PASSED: PRD V1.3 全量验证通过" -ForegroundColor Green
Write-Host "- 功能需求：$($frIds.Count)"
Write-Host "- 状态：$totalStates；跨对象事件：$($eventRows.Count)"
Write-Host "- 核心 GTW：$($coreScenarioIds.Count)；跨需求验收：$($crossAcceptanceIds.Count)"
Write-Host "- Draw.io：$($diagrams.Count) 页；HTML 锚点与 Markdown 本地链接有效"
