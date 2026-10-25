$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$base = Split-Path -Parent $PSScriptRoot
$stage2b = Join-Path (Split-Path -Parent $base) '阶段2B_PRD'
$script:Failures = [System.Collections.Generic.List[string]]::new()

function Add-Failure {
    param([string]$Message)
    $script:Failures.Add($Message)
}

function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { Add-Failure $Message }
}

function Read-File {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        Add-Failure "缺少文件：$Path"
        return ''
    }
    return Get-Content -Raw -LiteralPath $Path
}

function Test-AllowedPage {
    param([string]$Value, [string[]]$PageIds)
    $references = [regex]::Matches($Value, 'P\d{2}') | ForEach-Object Value | Sort-Object -Unique
    foreach ($reference in $references) {
        Assert-True ($reference -in $PageIds) "引用了不存在的页面：$reference"
    }
}

$required = @(
    '00_阶段目标与验收标准.md',
    '01_角色入口与任务地图.md',
    '02_信息架构与页面跳转.md',
    '03_页面清单.csv',
    '03_页面清单说明.md',
    '04_关键任务流程.md',
    '04_核心任务流程映射.csv',
    '05_FR页面追踪矩阵.csv',
    '05_FR覆盖说明.md',
    '06_对象状态到页面映射.csv',
    '06_页面状态矩阵与交互反馈.md',
    '07_低保真设计原则与图说明.md',
    '08_无障碍与窄屏最低要求.md',
    '09_决策日志.md',
    '10_阶段3A验收记录.md',
    'README.md',
    'diagrams/01_角色导航地图.drawio',
    'diagrams/02_页面层级.drawio',
    'diagrams/03_关键任务流程.drawio',
    'diagrams/04_低保真页面线框.drawio',
    'tools/Generate-Stage3A-Diagrams.ps1'
)
foreach ($relative in $required) {
    Assert-True (Test-Path -LiteralPath (Join-Path $base $relative) -PathType Leaf) "交付文件不存在：$relative"
}

$rolesText = Read-File (Join-Path $base '01_角色入口与任务地图.md')
$iaText = Read-File (Join-Path $base '02_信息架构与页面跳转.md')
$flowsText = Read-File (Join-Path $base '04_关键任务流程.md')
$stateUiText = Read-File (Join-Path $base '06_页面状态矩阵与交互反馈.md')
$accessibility = Read-File (Join-Path $base '08_无障碍与窄屏最低要求.md')
$decisions = Read-File (Join-Path $base '09_决策日志.md')
$acceptance = Read-File (Join-Path $base '10_阶段3A验收记录.md')
$readme = Read-File (Join-Path $base 'README.md')
$prd = Read-File (Join-Path $stage2b '01_企业级RAG知识库平台_PRD_V1.4.md')
$stateTable = Read-File (Join-Path $stage2b '03_状态转换总表_V1.4.md')
$gtw = Read-File (Join-Path $stage2b '04_核心任务GTW验收条件.md')

# 1. 角色入口与导航差异
$requiredRoles = @('一线客服','售后专员','客服主管','业务/渠道负责人','知识运营','AI 评测人员','法务/安全责任人','系统管理员')
foreach ($role in $requiredRoles) {
    Assert-True ($rolesText.Contains($role)) "角色入口缺失：$role"
}
Assert-True ($rolesText -match '实际入口' -and $rolesText -match '默认首页' -and $rolesText -match '一级导航') '角色入口表缺少入口、默认首页或导航'
Assert-True ($rolesText -match '系统不向所有角色展示完全相同的导航') '未明确角色导航差异'
Assert-True ($rolesText -match '创建 ASQ、转交任务、确认/发送 ADV' -and $rolesText -match 'CTX 只读') '客服主管权限未与 PRD 统一'
$expectedDefaults = @{
    '一线客服'='P01'
    '售后专员'='P02'
    '客服主管'='P01'
    '业务/渠道负责人'='P07'
    '知识运营'='P01'
    'AI 评测人员'='P10'
    '法务/安全责任人'='P04'
    '系统管理员'='P12'
}
foreach ($role in $expectedDefaults.Keys) {
    $roleLine = ($rolesText -split "`r?`n" | Where-Object { $_ -match "^\| $([regex]::Escape($role)) \|" } | Select-Object -First 1)
    if (-not $roleLine) {
        Add-Failure "默认首页行缺失：$role"
    } else {
        Assert-True ($roleLine -match $expectedDefaults[$role]) "默认首页不符合设计：$role"
    }
}

# 2. 页面清单
$pagePath = Join-Path $base '03_页面清单.csv'
$pages = @()
try { $pages = @(Import-Csv -LiteralPath $pagePath) } catch { Add-Failure "页面清单 CSV 无法解析：$($_.Exception.Message)" }
Assert-True ($pages.Count -eq 13) "页面数量应为 13，实际 $($pages.Count)"
$pageIds = @($pages.page_id | Sort-Object)
$expectedPageIds = @(1..13 | ForEach-Object { 'P{0:D2}' -f $_ })
Assert-True (($pageIds -join ',') -eq ($expectedPageIds -join ',')) '页面 ID 不连续、重复或不是 P01-P13'
$pageColumns = @('page_id','page_name','primary_users','page_goal','preconditions','entry_routes','key_data','primary_actions','exception_states','empty_state','permission_requirements','exit_routes','fr_ids','state_events','acceptance')
foreach ($row in $pages) {
    foreach ($column in $pageColumns) {
        if ([string]::IsNullOrWhiteSpace([string]$row.$column)) {
            Add-Failure "页面字段为空：$($row.page_id).$column"
        }
    }
    Test-AllowedPage $row.entry_routes $pageIds
    Test-AllowedPage $row.exit_routes $pageIds
}
$p02 = $pages | Where-Object page_id -eq 'P02'
$p03 = $pages | Where-Object page_id -eq 'P03'
$p06 = $pages | Where-Object page_id -eq 'P06'
$p10 = $pages | Where-Object page_id -eq 'P10'
$p13 = $pages | Where-Object page_id -eq 'P13'
Assert-True ($p02.primary_users -match '客服主管' -and $p02.primary_actions -match '创建 ASQ' -and $p02.primary_actions -match '转交') 'P02 未允许主管创建 ASQ 和转交'
Assert-True ($p03.permission_requirements -match '主管 CTX 只读' -and $p03.permission_requirements -match '确认和发送 ADV') 'P03 未统一主管 CTX 只读和 ADV 发送权限'
Assert-True ($p06.exit_routes -match 'P10') 'P06 缺少到 P10 的跳转'
Assert-True ($p10.exit_routes -match 'P07') 'P10 缺少到 P07 的跳转'
Assert-True ($p10.primary_actions -match '中止并回 EVAL_PLANNED' -and $p10.primary_actions -notmatch '暂停') 'P10 仍含未定义暂停或缺少中止回计划'
Assert-True ($p13.primary_users -notmatch '审计角色') 'P13 仍新增了审计角色'
Assert-True ($iaText -match 'P06 知识来源台账.*P10' -and $iaText -match 'P10 评测中心.*P07') '信息架构未补齐 P06→P10、P10→P07'

# 3. FR 与核心任务映射
$frMap = @()
try { $frMap = @(Import-Csv -LiteralPath (Join-Path $base '05_FR页面追踪矩阵.csv')) } catch { Add-Failure "FR 映射 CSV 无法解析：$($_.Exception.Message)" }
Assert-True ($frMap.Count -eq 30) "FR 页面映射应为 30 条，实际 $($frMap.Count)"
$frIds = @($frMap.fr_id | Sort-Object)
Assert-True (($frIds -join ',') -eq ((1..30 | ForEach-Object { 'FR-{0:D3}' -f $_ }) -join ',')) 'FR 映射不是 FR-001 至 FR-030'
foreach ($row in $frMap) {
    Assert-True ($row.primary_page -match '^P\d{2}$') "FR 主页面格式错误：$($row.fr_id)"
    Assert-True ($row.primary_page -in $pageIds) "FR 主页面不存在：$($row.fr_id)->$($row.primary_page)"
    Test-AllowedPage $row.secondary_pages $pageIds
    foreach ($column in @('interface_surface','visible_next_step','failure_feedback','acceptance_ref')) {
        Assert-True (-not [string]::IsNullOrWhiteSpace([string]$row.$column)) "FR 映射字段为空：$($row.fr_id).$column"
    }
}
$fr019 = $frMap | Where-Object fr_id -eq 'FR-019'
Assert-True ($fr019.secondary_pages -match 'P07') 'FR-019 未追踪评测失败后进入 P07'

$coreMap = @()
try { $coreMap = @(Import-Csv -LiteralPath (Join-Path $base '04_核心任务流程映射.csv')) } catch { Add-Failure "核心任务映射 CSV 无法解析：$($_.Exception.Message)" }
Assert-True ($coreMap.Count -eq 12) "核心任务流程映射应为 12 条，实际 $($coreMap.Count)"
$coreIds = @('CORE-R1','CORE-R2','CORE-R3','CORE-R4','CORE-S1','CORE-S2','CORE-S3','CORE-S4','CORE-K1','CORE-K2','CORE-K3','CORE-K4')
Assert-True ((@($coreMap.core_task_id | Sort-Object) -join ',') -eq (@($coreIds | Sort-Object) -join ',')) '核心任务覆盖不是 12 条'
foreach ($row in $coreMap) {
    $flowRefs = @([regex]::Matches($row.flow_ids, 'F\d{2}') | ForEach-Object Value | Sort-Object -Unique)
    Assert-True ($flowRefs.Count -gt 0) "核心任务未映射流程：$($row.core_task_id)"
    foreach ($flowRef in $flowRefs) {
        Assert-True ($flowsText -match "(?m)^## $flowRef ") "核心任务引用了不存在流程：$flowRef"
    }
    Test-AllowedPage $row.page_path $pageIds
    foreach ($gtwRef in [regex]::Matches($row.gtw_acceptance, 'AC-[RSK]\d-\d{2}') | ForEach-Object Value) {
        Assert-True ($gtw.Contains($gtwRef)) "核心任务引用未定义 GTW：$gtwRef"
    }
    Assert-True (-not [string]::IsNullOrWhiteSpace($row.failure_recovery)) "核心任务缺少失败恢复：$($row.core_task_id)"
}

# 4. 57 个状态均有页面和下一步
$stateRows = @()
try { $stateRows = @(Import-Csv -LiteralPath (Join-Path $base '06_对象状态到页面映射.csv')) } catch { Add-Failure "状态页面映射 CSV 无法解析：$($_.Exception.Message)" }
Assert-True ($stateRows.Count -eq 57) "状态页面映射应为 57 条，实际 $($stateRows.Count)"

$prdStates = @{}
$currentObject = ''
foreach ($line in ($stateTable -split "`r?`n")) {
    if ($line -match '^### 1\.\d+ .*?`([A-Z_]+)`（(\d+) 状态）') {
        $currentObject = $Matches[1]
        $prdStates[$currentObject] = @()
    } elseif ($line -eq '## 2. 跨对象事件') {
        $currentObject = ''
    } elseif ($currentObject -and $line -match '^\| `([^`]+)` \|') {
        $prdStates[$currentObject] += $Matches[1]
    }
}
$allPrdStates = @($prdStates.Values | ForEach-Object { $_ } | Sort-Object)
$mappedStates = @($stateRows.state | Sort-Object)
Assert-True (($mappedStates -join ',') -eq ($allPrdStates -join ',')) '页面状态映射与 PRD 状态集不一致'
foreach ($row in $stateRows) {
    $statePageRefs = @([regex]::Matches($row.page_id, 'P\d{2}') | ForEach-Object Value | Sort-Object -Unique)
    Assert-True ($statePageRefs.Count -gt 0) "状态映射未指向页面：$($row.state)"
    foreach ($statePageRef in $statePageRefs) {
        Assert-True ($statePageRef -in $pageIds) "状态映射页面无效：$($row.state)->$statePageRef"
    }
    foreach ($column in @('display_location','visible_next_step','failure_or_recovery','terminal')) {
        Assert-True (-not [string]::IsNullOrWhiteSpace([string]$row.$column)) "状态映射字段为空：$($row.state).$column"
    }
    Assert-True ($row.terminal -in @('是','否')) "终态标记非法：$($row.state)"
}

Assert-True (([regex]::Matches($flowsText, '(?m)^## F\d{2} ')).Count -eq 13) '关键任务流程章节不是 13 条'
foreach ($flowNumber in 1..13) {
    $flowId = 'F{0:D2}' -f $flowNumber
    $sectionMatch = [regex]::Match($flowsText, "(?ms)^## $flowId .*?(?=^## F\d{2} |\Z)")
    Assert-True $sectionMatch.Success "流程章节缺失：$flowId"
    if ($sectionMatch.Success) {
        $section = $sectionMatch.Value
        foreach ($requiredLabel in @('起点','判断分支','失败路径','恢复动作','终点')) {
            Assert-True ($section.Contains($requiredLabel)) "流程 $flowId 缺少：$requiredLabel"
        }
    }
}

# 5. 页面状态与交互、无障碍
Assert-True (([regex]::Matches($stateUiText, '(?m)^\| P\d{2} ')).Count -eq 13) '页面级状态矩阵未覆盖 13 个页面'
Assert-True ($stateUiText -match '非终态必须展示至少一个下一步') '未定义非终态可见下一步规则'
Assert-True ($stateUiText -match '禁止的假成功') '缺少假成功拦截说明'
Assert-True ($accessibility -match '320 CSS px' -and $accessibility -match '200%' -and $accessibility -match '不能只用颜色表达') '无障碍或窄屏最低要求不完整'
Assert-True ($decisions -match 'D3A-001' -and $decisions -match 'D3A-006') '阶段3A决策日志不完整'

# 6. Draw.io 结构和低保真边界
$drawioFiles = @(
    @{ Path=(Join-Path $base 'diagrams/01_角色导航地图.drawio'); Pages=1; Kind='role' },
    @{ Path=(Join-Path $base 'diagrams/02_页面层级.drawio'); Pages=1; Kind='hierarchy' },
    @{ Path=(Join-Path $base 'diagrams/03_关键任务流程.drawio'); Pages=13; Kind='flows' },
    @{ Path=(Join-Path $base 'diagrams/04_低保真页面线框.drawio'); Pages=13; Kind='wireframes' }
)

foreach ($entry in $drawioFiles) {
    $xmlText = Read-File $entry.Path
    try { [xml]$xml = $xmlText } catch { Add-Failure "Draw.io XML 无法解析：$($entry.Path)"; continue }
    $diagrams = @($xml.mxfile.diagram)
    Assert-True ($diagrams.Count -eq $entry.Pages) "$([IO.Path]::GetFileName($entry.Path)) 页数错误：$($diagrams.Count)"

    foreach ($diagram in $diagrams) {
        $name = [string]$diagram.name
        $model = $diagram.mxGraphModel
        $cells = @($model.root.mxCell)
        $byId = @{}
        foreach ($cell in $cells) { $byId[[string]$cell.id] = $cell }
        $ids = @($cells.id)
        Assert-True (($ids | Sort-Object -Unique).Count -eq $ids.Count) "Draw.io 页面节点 ID 重复：$name"

        foreach ($cell in $cells) {
            $isEdge = $null -ne $cell.PSObject.Properties['edge'] -and [string]$cell.edge -eq '1'
            if ($isEdge) {
                Assert-True ($byId.ContainsKey([string]$cell.source)) "边源不存在：$name/$($cell.id)"
                Assert-True ($byId.ContainsKey([string]$cell.target)) "边目标不存在：$name/$($cell.id)"
                Assert-True ($null -ne $cell.PSObject.Properties['mxGeometry']) "边缺少 geometry：$name/$($cell.id)"
            }
        }

        $vertices = @($cells | Where-Object {
            $null -ne $_.PSObject.Properties['vertex'] -and
            [string]$_.vertex -eq '1' -and
            $null -ne $_.PSObject.Properties['mxGeometry']
        })
        $absolute = @{}
        foreach ($vertex in $vertices) {
            $x = [double]$vertex.mxGeometry.x
            $y = [double]$vertex.mxGeometry.y
            $parent = [string]$vertex.parent
            while ($parent -and $parent -ne '0' -and $parent -ne '1') {
                $parentCell = $byId[$parent]
                if ($null -eq $parentCell -or $null -eq $parentCell.PSObject.Properties['mxGeometry']) { break }
                $x += [double]$parentCell.mxGeometry.x
                $y += [double]$parentCell.mxGeometry.y
                $parent = [string]$parentCell.parent
            }
            $w = [double]$vertex.mxGeometry.width
            $h = [double]$vertex.mxGeometry.height
            Assert-True (($x + $w) -le [double]$model.pageWidth) "节点超出右边界：$name/$($vertex.id)"
            Assert-True (($y + $h) -le [double]$model.pageHeight) "节点超出下边界：$name/$($vertex.id)"
            $absolute[[string]$vertex.id] = [PSCustomObject]@{ X=$x; Y=$y; W=$w; H=$h; Parent=[string]$vertex.parent }
        }
        for ($i = 0; $i -lt $vertices.Count; $i++) {
            for ($j = $i + 1; $j -lt $vertices.Count; $j++) {
                $a = $vertices[$i]
                $b = $vertices[$j]
                if ([string]$a.parent -ne [string]$b.parent) { continue }
                $aa = $absolute[[string]$a.id]
                $bb = $absolute[[string]$b.id]
                $iw = [Math]::Min($aa.X + $aa.W, $bb.X + $bb.W) - [Math]::Max($aa.X, $bb.X)
                $ih = [Math]::Min($aa.Y + $aa.H, $bb.Y + $bb.H) - [Math]::Max($aa.Y, $bb.Y)
                Assert-True ($iw -le 1 -or $ih -le 1) "同级节点重叠：$name/$($a.id)/$($b.id)"
            }
        }

        foreach ($match in [regex]::Matches($diagram.OuterXml, '#[0-9A-Fa-f]{6}')) {
            $hex = $match.Value.Substring(1)
            $r = $hex.Substring(0,2)
            $g = $hex.Substring(2,2)
            $b = $hex.Substring(4,2)
            Assert-True ($r -eq $g -and $g -eq $b) "低保证图出现非灰度颜色：$name/$($match.Value)"
        }
        Assert-True ($diagram.OuterXml -notmatch 'gradient|shadow=1|opacity=|sketch=1') "低保证图出现高保真视觉属性：$name"
    }

    $allValues = ($diagrams | ForEach-Object { @($_.mxGraphModel.root.mxCell) | ForEach-Object value }) -join "`n"
    if ($entry.Kind -eq 'role') {
        foreach ($role in $requiredRoles) { Assert-True ($allValues.Contains($role)) "角色导航图缺少：$role" }
    } elseif ($entry.Kind -eq 'hierarchy') {
        foreach ($pageId in $expectedPageIds) { Assert-True ($allValues.Contains($pageId)) "页面层级图缺少：$pageId" }
        Assert-True (([regex]::Matches($allValues, '今日工作台|一线售后辅助|风险升级|知识来源|知识与审核|案例与链路|评测中心|发布与回滚|权限与审计')).Count -ge 9) '页面层级图未覆盖 9 个工作面'
    } elseif ($entry.Kind -eq 'flows') {
        $flowIdsInDiagram = @($diagrams | ForEach-Object { $_.name } | ForEach-Object { if ($_ -match '^(F\d{2})') { $Matches[1] } })
        $expectedFlowIds = @(1..13 | ForEach-Object { 'F{0:D2}' -f $_ })
        Assert-True ((@($flowIdsInDiagram | Sort-Object -Unique) -join ',') -eq ($expectedFlowIds -join ',')) '流程图页面不是 F01-F13'
        foreach ($diagram in $diagrams) {
            $values = @($diagram.mxGraphModel.root.mxCell | ForEach-Object value)
            Assert-True ($values -contains '失败' -or $values -match '失败：') "流程页缺少失败分支：$($diagram.name)"
            Assert-True ($values -match '恢复' -or $values -match '恢复：') "流程页缺少恢复动作：$($diagram.name)"
            Assert-True ($values -match '终点' -or $values -match '终') "流程页缺少终点：$($diagram.name)"
        }
    } elseif ($entry.Kind -eq 'wireframes') {
        $wireIds = @($diagrams | ForEach-Object { if ($_.name -match '^(P\d{2})') { $Matches[1] } })
        Assert-True ((@($wireIds | Sort-Object -Unique) -join ',') -eq ($expectedPageIds -join ',')) '线框图页面不是 P01-P13'
        foreach ($diagram in $diagrams) {
            $values = @($diagram.mxGraphModel.root.mxCell | ForEach-Object value) -join "`n"
            Assert-True ($values.Contains('一级导航') -and $values.Contains('主工作区') -and $values.Contains('上下文与状态')) "线框页结构不完整：$($diagram.name)"
            Assert-True ($values.Contains('角色视图：')) "线框页未显示角色视图：$($diagram.name)"
            $completeNav = @('今日','咨询任务','风险处置','知识来源','知识与审核','问题案例','评测中心','发布/回滚','权限/审计')
            $visibleCompleteNav = @($completeNav | Where-Object { $values -split "`n" -contains $_ })
            Assert-True ($visibleCompleteNav.Count -lt 9) "线框页仍显示完整 9 项导航：$($diagram.name)"
        }
    }
}

# 7. Markdown 链接与交付状态
$markdownFiles = Get-ChildItem -LiteralPath $base -File -Filter '*.md'
foreach ($file in $markdownFiles) {
    $content = Get-Content -Raw -LiteralPath $file.FullName
    foreach ($match in [regex]::Matches($content, '\[[^\]]+\]\(([^)]+)\)')) {
        $target = $match.Groups[1].Value.Trim()
        if ($target -match '^(?:https?://|mailto:|#)') { continue }
        $pathPart = ($target -split '#')[0]
        $resolved = [System.IO.Path]::GetFullPath((Join-Path $file.DirectoryName $pathPart))
        Assert-True (Test-Path -LiteralPath $resolved) "Markdown 本地链接失效：$($file.Name) -> $target"
    }
}
Assert-True ($acceptance -match '13 个唯一页面' -and $acceptance -match '13 条，均含') '验收记录的页面或流程数量未同步'
Assert-True ($readme -match '阶段 3A' -and $readme -match '交付清单') 'README 未说明阶段3A交付'

if ($script:Failures.Count -gt 0) {
    Write-Host "FAILED: $($script:Failures.Count) 个验证失败" -ForegroundColor Red
    $script:Failures | ForEach-Object { Write-Host "- $_" -ForegroundColor Red }
    exit 1
}

Write-Host "PASSED: 阶段 3A 信息架构与低保真结构验证通过" -ForegroundColor Green
Write-Host "- 角色：$($requiredRoles.Count)"
Write-Host "- 页面：$($pages.Count)"
Write-Host "- FR 映射：$($frMap.Count)；核心任务：$($coreMap.Count)"
Write-Host "- 对象状态：$($stateRows.Count)"
Write-Host "- 关键流程：13；逐页线框：13"
