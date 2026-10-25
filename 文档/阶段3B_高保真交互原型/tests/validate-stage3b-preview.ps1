$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$base = Split-Path -Parent $PSScriptRoot
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
    param([string]$RelativePath)
    $path = Join-Path $base $RelativePath
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        Add-Failure "缺少文件：$RelativePath"
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
    '01_视觉方向与设计令牌.md',
    '02_预览入口与评审指南.md',
    '03_预览交互与状态说明.md',
    '04_视觉方向评审记录.md',
    '05_阶段3B预览验收记录.md',
    'README.md',
    'previews/index.html',
    'previews/direction-a.html',
    'previews/direction-b.html',
    'previews/direction-a.css',
    'previews/direction-b.css',
    'previews/preview-core.js',
    'screenshots/README.md',
    'tests/capture-previews.mjs'
)
foreach ($relative in $required) {
    Assert-True (Test-Path -LiteralPath (Join-Path $base $relative) -PathType Leaf) "交付文件不存在：$relative"
}

$tokens = Read-File '01_视觉方向与设计令牌.md'
$guide = Read-File '02_预览入口与评审指南.md'
$interaction = Read-File '03_预览交互与状态说明.md'
$htmlA = Read-File 'previews/direction-a.html'
$htmlB = Read-File 'previews/direction-b.html'
$indexHtml = Read-File 'previews/index.html'
$cssA = Read-File 'previews/direction-a.css'
$cssB = Read-File 'previews/direction-b.css'
$core = Read-File 'previews/preview-core.js'
$acceptance = Read-File '05_阶段3B预览验收记录.md'

# 视觉方向与设计令牌
Assert-True ($tokens -match '方向 A：深色控制台' -and $tokens -match '方向 B：浅色编辑台') '视觉方向说明不完整'
Assert-True ($tokens -match '#121820' -and $tokens -match '#2F6FED' -and $tokens -match '#0D6F68') '设计令牌缺少方向 A/B 的核心颜色'
Assert-True ($tokens -match '风险色只用于' -and $tokens -match '不使用附件项目') '未明确风险色和参考项目边界'
Assert-True ($tokens -match '最终选择需由项目负责人确认') '未将视觉方向保持为待选择状态'
Assert-True ($guide -match 'direction-a.html' -and $guide -match 'direction-b.html') '预览指南缺少两个方向入口'
Assert-True ($guide -match 'P01' -and $guide -match 'P03' -and $guide -match 'P05' -and $guide -match 'P09') '预览范围未覆盖四页'

# HTML、CSS 与交互代码边界
Assert-True ($htmlA -match 'data-direction="A"' -and $htmlB -match 'data-direction="B"') '方向 HTML 缺少数据标识'
Assert-True ($htmlA -match 'direction-a.css' -and $htmlB -match 'direction-b.css') '方向 HTML 未加载专属样式'
Assert-True ($htmlA -match 'preview-core.js' -and $htmlB -match 'preview-core.js') '方向 HTML 未加载共享交互'
Assert-True ($cssA -match '--nav: #121820' -and $cssA -match '--accent: #2f6fed') '方向 A 样式令牌不一致'
Assert-True ($cssB -match '--canvas: #f3f5f1' -and $cssB -match '--accent: #0d6f68') '方向 B 样式令牌不一致'
Assert-True ($cssA -match 'prefers-reduced-motion' -and $cssB -match 'prefers-reduced-motion') '预览未处理减少动效'
Assert-True ($cssA -match '@media \(max-width: 760px\)' -and $cssB -match '@media \(max-width: 760px\)') '预览缺少窄屏规则'
Assert-True ($core -match 'stage3b-preview-state-v1') '预览未定义 localStorage 键'
Assert-True ($core -match 'localStorage\.setItem' -and $core -match 'localStorage\.getItem') '预览未实现 localStorage 持久化'
Assert-True ($core -match 'adviceSent' -and $core -match 'riskStopSent') '预览未持久化关键动作状态'
Assert-True ($core -match '"P01", "P03", "P05", "P09"') '共享预览未定义四页方向范围'
Assert-True ($core -match 'frontline' -and $core -match 'supervisor' -and $core -match 'legal' -and $core -match 'admin') '角色切换未覆盖必要角色'
Assert-True ($core -notmatch 'toast') '关键状态不应以 toast 代替'
Assert-True ($htmlA -notmatch 'https?://' -and $htmlB -notmatch 'https?://' -and $core -notmatch 'https?://') '预览依赖远程资源'
Assert-True ($interaction -match '主管 CTX 显示只读说明' -and $interaction -match '风险仍保持 R3') '预览交互说明未体现权限与风险状态'
Assert-True ($indexHtml -match 'direction-a_P01_1440.png' -and $indexHtml -match 'direction-b_P01_1440.png') '方向对比入口缺少代表截图'

# 截图尺寸与数量
$screenshotDir = Join-Path $base 'screenshots'
$directions = @('a','b')
$pages = @('P01','P03','P05','P09')
$widths = @(1440,320)
$expectedShots = 0
foreach ($direction in $directions) {
    foreach ($page in $pages) {
        foreach ($width in $widths) {
            $expectedShots++
            $name = "direction-$direction`_$page`_$width.png"
            $path = Join-Path $screenshotDir $name
            Assert-True (Test-Path -LiteralPath $path -PathType Leaf) "缺少截图：$name"
            if (Test-Path -LiteralPath $path -PathType Leaf) {
                $size = Get-PngSize $path
                Assert-True ($null -ne $size) "截图不是有效 PNG：$name"
                if ($null -ne $size) {
                    Assert-True ($size.Width -eq $width) "截图宽度错误：$name=$($size.Width)"
                    Assert-True ($size.Height -gt 300) "截图高度异常：$name=$($size.Height)"
                }
            }
        }
    }
}
$actualShots = @(Get-ChildItem -LiteralPath $screenshotDir -Filter '*.png')
Assert-True ($actualShots.Count -eq $expectedShots) "截图数量应为 $expectedShots，实际 $($actualShots.Count)"
foreach ($image in [regex]::Matches($indexHtml, 'src="([^"]+)"') | ForEach-Object { $_.Groups[1].Value }) {
    $resolved = [System.IO.Path]::GetFullPath((Join-Path (Join-Path $base 'previews') $image))
    Assert-True (Test-Path -LiteralPath $resolved) "方向入口图片不存在：$image"
}

foreach ($file in Get-ChildItem -LiteralPath $base -File -Filter '*.md') {
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

# 浏览器验证
$bundledNode = 'C:\Users\李昕昊\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$node = if (Test-Path -LiteralPath $bundledNode) { $bundledNode } else { (Get-Command node -ErrorAction Stop).Source }
$capture = Join-Path $base 'tests\capture-previews.mjs'
$previousNodePath = $env:NODE_PATH
$env:NODE_PATH = 'C:\Users\李昕昊\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
try {
    & $node $capture
    Assert-True ($LASTEXITCODE -eq 0) '浏览器截图与交互验证失败'
} finally {
    $env:NODE_PATH = $previousNodePath
}

# 阶段边界
Assert-True ($acceptance -match '4 个方向预览页面' -and $acceptance -match '16 张截图') '验收记录未反映当前预览范围'
Assert-True ($acceptance -match '等待项目负责人选择') '验收记录未保持方向选择门禁'

$stage3aFiles = Get-ChildItem -LiteralPath $base -Recurse -File | Where-Object { $_.Extension -in @('.html','.css','.js','.mjs') }
foreach ($file in $stage3aFiles) {
    $content = Get-Content -Raw -LiteralPath $file.FullName
    Assert-True ($content -notmatch 'react|vue|angular|node-api|express|fetch\(.+api') "预览不应接入业务框架或后端：$($file.Name)"
}

if ($script:Failures.Count -gt 0) {
    Write-Host "FAILED: $($script:Failures.Count) 个验证失败" -ForegroundColor Red
    $script:Failures | ForEach-Object { Write-Host "- $_" -ForegroundColor Red }
    exit 1
}

Write-Host "PASSED: 阶段 3B 视觉方向预览验证通过" -ForegroundColor Green
Write-Host "- 方向：2；预览页面：4；角色：8"
Write-Host "- 截图：16（1440px / 320px）"
Write-Host "- localStorage、深链、角色导航、内联状态和窄屏回归通过"
