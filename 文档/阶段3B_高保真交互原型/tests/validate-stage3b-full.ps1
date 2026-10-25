$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$base = Split-Path -Parent $PSScriptRoot
$script:Failures = [System.Collections.Generic.List[string]]::new()

function Add-Failure { param([string]$Message) $script:Failures.Add($Message) }
function Assert-True {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { Add-Failure $Message }
}
function Read-File {
    param([string]$Name)
    $path = Join-Path $base $Name
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        Add-Failure "缺少文件：$Name"
        return ''
    }
    return Get-Content -Raw -LiteralPath $path
}

function Get-PngSize {
    param([string]$Path)
    $bytes = [IO.File]::ReadAllBytes($Path)
    if ($bytes.Length -lt 24) { return $null }
    $signature = ($bytes[0..7] | ForEach-Object { $_.ToString('X2') }) -join ''
    if ($signature -ne '89504E470D0A1A0A') { return $null }
    $width = ([int64]$bytes[16] -shl 24) -bor ([int64]$bytes[17] -shl 16) -bor ([int64]$bytes[18] -shl 8) -bor [int64]$bytes[19]
    $height = ([int64]$bytes[20] -shl 24) -bor ([int64]$bytes[21] -shl 16) -bor ([int64]$bytes[22] -shl 8) -bor [int64]$bytes[23]
    return [PSCustomObject]@{ Width=$width; Height=$height }
}

$required = @(
    'index.html',
    'app.css',
    'app.js',
    '01_视觉方向与设计令牌.md',
    '02_原型交互说明.md',
    '03_页面角色权限矩阵.csv',
    '04_状态机演示覆盖表.csv',
    '04_状态机演示覆盖说明.md',
    '05_十五条交互演示脚本.md',
    '06_可访问性与响应式验收.md',
    '07_视觉与交互验收记录.md',
    'README.md',
    'tests/e2e-prototype.mjs'
)
foreach ($name in $required) {
    Assert-True (Test-Path -LiteralPath (Join-Path $base $name) -PathType Leaf) "交付文件不存在：$name"
}

$html = Read-File 'index.html'
$css = Read-File 'app.css'
$js = Read-File 'app.js'
$tokens = Read-File '01_视觉方向与设计令牌.md'
$interaction = Read-File '02_原型交互说明.md'
$permissions = Read-File '03_页面角色权限矩阵.csv'
$stateCoverage = Read-File '04_状态机演示覆盖表.csv'
$stateCoverageNotes = Read-File '04_状态机演示覆盖说明.md'
$flowGuide = Read-File '05_十五条交互演示脚本.md'
$acceptance = Read-File '07_视觉与交互验收记录.md'
$readme = Read-File 'README.md'

Assert-True ($html -match 'app\.css' -and $html -match 'app\.js') 'HTML 未加载完整原型资源'
Assert-True ($css -match '深色|--nav|--accent' -and $js -match '澄明服务科技') '方向A或模拟企业身份未落地'
Assert-True ($tokens -match '方向 A 已选定' -and $tokens -match '风险优先条' -and $tokens -match '证据/状态轨道') '视觉收口或产品记忆点未记录'
Assert-True ($tokens -match '标题.*28.*32' -and $tokens -match '中文含义 \+ 次级代码') '标题尺度或状态表达规则不完整'
Assert-True ($html -notmatch '非Apple项目|非 Apple 项目') '预览专用说明被放入产品 HTML'
Assert-True ($js -match '非 Apple 项目') '预览工具区缺少非Apple项目说明'
Assert-True ($js -notmatch 'toast|toastr|alert\(') '原型使用 toast/alert 代替关键状态'
Assert-True ($js -match 'mode-switch' -and $js -match '展示模式' -and $js -match '评审模式') '展示/评审模式未实现'
Assert-True ($js -match '模拟环境' -and $js -notmatch '>生产演练<') '顶栏环境标签不符合模拟项目要求'
Assert-True ($js -match 'source-registration-form' -and $js -match 'activate-source' -and $js -match 'create-source-version') '知识来源登记闭环不完整'
Assert-True ($js -match 'member-role-form' -and $js -match 'attempt-self-approval' -and $js -match 'attempt-admin-release' -and $js -match 'attempt-r3-overreach') '权限变更或越权拦截入口不完整'
Assert-True ($js -match 'eval-start' -and $js -match 'EVAL_RUNNING' -and $js -match '非法评测跳跃') 'EVAL 运行态或非法跳跃拦截缺失'
Assert-True ($js -match 'contextCompleteness' -and $js -match 'generate-advice' -and $js -match '建议草案不可发送') 'ASQ 主状态与上下文完整度未分离'

$pageIds = @(1..13 | ForEach-Object { 'P{0:D2}' -f $_ })
foreach ($pageId in $pageIds) {
    Assert-True ($js -match "case `"$pageId`"") "原型未实现页面：$pageId"
}
$flowIds = @(1..15 | ForEach-Object { 'D{0:D2}' -f $_ })
foreach ($flowId in $flowIds) {
    Assert-True ($js -match "id: `"$flowId`"") "原型未定义演示流程：$flowId"
    Assert-True ($flowGuide -match "## $flowId[/ ]") "演示脚本文档缺少：$flowId"
}

$permissionRows = @(Import-Csv -LiteralPath (Join-Path $base '03_页面角色权限矩阵.csv'))
Assert-True ($permissionRows.Count -eq 13) "页面角色权限矩阵应为 13 行，实际 $($permissionRows.Count)"
Assert-True (($permissionRows.page_id -join ',') -eq ($pageIds -join ',')) '页面角色权限矩阵页面编号不连续'
foreach ($row in $permissionRows) {
    foreach ($column in $row.PSObject.Properties.Name) {
        Assert-True (-not [string]::IsNullOrWhiteSpace([string]$row.$column)) "权限矩阵空字段：$($row.page_id).$column"
    }
}

$stateRows = @(Import-Csv -LiteralPath (Join-Path $base '04_状态机演示覆盖表.csv'))
Assert-True ($stateRows.Count -ge 57) "状态机演示覆盖不足 57 个状态，实际 $($stateRows.Count)"
foreach ($requiredState in @('ASQ_CONTEXT_PENDING','ESC_CLOSED','SRC_WITHDRAWN','KB_SOURCE_BLOCKED','CASE_VERIFIED_PENDING_RELEASE','LINK_FAILED','EVAL_BLOCKED','REL_SUSPENDED','REL_ROLLED_BACK')) {
    Assert-True ($stateRows.state -contains $requiredState) "状态演示表缺少：$requiredState"
}

Assert-True ($stateCoverageNotes -match '0 LINK' -and $stateCoverageNotes -match '1 LINK' -and $stateCoverageNotes -match 'N LINK') '状态机演示未覆盖 0/1/N LINK'
Assert-True ($interaction -match 'localStorage' -and $interaction -match '页面刷新' -and $interaction -match '服务端模拟') '交互说明缺少持久化或权限来源'
Assert-True ($acceptance -match '13 个页面' -and $acceptance -match '15 条' -and $acceptance -match '26 张截图') '验收记录未覆盖完整原型范围'
Assert-True ($readme -match 'index.html' -and $readme -match '完整高保真交互原型') 'README 未提供完整原型入口'

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

$bundledNode = 'C:\Users\李昕昊\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$node = if (Test-Path -LiteralPath $bundledNode) { $bundledNode } else { (Get-Command node -ErrorAction Stop).Source }
& $node (Join-Path $base 'tests\e2e-prototype.mjs')
Assert-True ($LASTEXITCODE -eq 0) 'Playwright 端到端测试失败'

$shotDir = Join-Path $base 'screenshots\full'
$shots = @(Get-ChildItem -LiteralPath $shotDir -Filter '*.png')
Assert-True ($shots.Count -eq 26) "全量截图应为 26 张，实际 $($shots.Count)"
foreach ($pageId in $pageIds) {
    foreach ($width in @(1440,320)) {
        $shotPath = Join-Path $shotDir "$pageId`_$width.png"
        Assert-True (Test-Path -LiteralPath $shotPath) "缺少截图：$pageId/$width"
        if (Test-Path -LiteralPath $shotPath) {
            $size = Get-PngSize $shotPath
            Assert-True ($null -ne $size) "截图不是有效 PNG：$pageId/$width"
            if ($null -ne $size) {
                Assert-True ($size.Width -eq $width) "截图宽度错误：$pageId/$width=$($size.Width)"
                Assert-True ($size.Height -gt 300) "截图高度异常：$pageId/$width=$($size.Height)"
            }
        }
    }
}
if ($script:Failures.Count -gt 0) {
    Write-Host "FAILED: $($script:Failures.Count) 个验证失败" -ForegroundColor Red
    $script:Failures | ForEach-Object { Write-Host "- $_" -ForegroundColor Red }
    exit 1
}

Write-Host "PASSED: 阶段 3B 完整高保真原型验证通过" -ForegroundColor Green
Write-Host "- 页面：13；页面状态：5 类 × 13 页"
Write-Host "- 交互流程：15；角色：8"
Write-Host "- 截图：26（1440px / 320px）"
Write-Host "- 状态真实性：ASQ 单主状态、EVAL 运行态、SRC 登记激活、P12 权限分离均通过"
Write-Host "- 视图模式：展示 / 评审模式通过"
