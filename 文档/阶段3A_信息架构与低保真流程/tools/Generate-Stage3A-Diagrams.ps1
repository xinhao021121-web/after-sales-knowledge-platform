$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$root = Split-Path -Parent $PSScriptRoot
$diagramDir = Join-Path $root 'diagrams'
New-Item -ItemType Directory -Force -Path $diagramDir | Out-Null

function Set-XmlAttribute {
    param(
        [System.Xml.XmlNode]$Node,
        [hashtable]$Attributes
    )
    foreach ($key in $Attributes.Keys) {
        $Node.SetAttribute($key, [string]$Attributes[$key])
    }
}

function New-DrawioDocument {
    $doc = [System.Xml.XmlDocument]::new()
    $decl = $doc.CreateXmlDeclaration('1.0', 'UTF-8', $null)
    [void]$doc.AppendChild($decl)
    $mxfile = $doc.CreateElement('mxfile')
    Set-XmlAttribute $mxfile @{ host='drawio'; version='26.0.0' }
    [void]$doc.AppendChild($mxfile)
    return $doc
}

function Add-Diagram {
    param(
        [System.Xml.XmlDocument]$Document,
        [string]$Name,
        [double]$Width,
        [double]$Height
    )
    $mxfile = $Document.DocumentElement
    $diagram = $Document.CreateElement('diagram')
    Set-XmlAttribute $diagram @{ name=$Name }
    [void]$mxfile.AppendChild($diagram)

    $model = $Document.CreateElement('mxGraphModel')
    Set-XmlAttribute $model @{
        pageWidth=$Width
        pageHeight=$Height
        grid='1'
        gridSize='10'
        guides='1'
        tooltips='1'
        connect='1'
        arrows='1'
        fold='1'
        page='1'
        pageScale='1'
        math='0'
        shadow='0'
    }
    [void]$diagram.AppendChild($model)

    $graphRoot = $Document.CreateElement('root')
    [void]$model.AppendChild($graphRoot)
    foreach ($id in @('0','1')) {
        $cell = $Document.CreateElement('mxCell')
        Set-XmlAttribute $cell @{ id=$id }
        if ($id -eq '1') { $cell.SetAttribute('parent', '0') }
        [void]$graphRoot.AppendChild($cell)
    }

    return [PSCustomObject]@{
        Document = $Document
        Diagram = $diagram
        Root = $graphRoot
        NextId = 2
        Width = $Width
        Height = $Height
    }
}

function Add-Vertex {
    param(
        [PSCustomObject]$Context,
        [string]$Id,
        [string]$Value,
        [double]$X,
        [double]$Y,
        [double]$Width,
        [double]$Height,
        [string]$Style,
        [string]$Parent = '1'
    )
    if (-not $Id) {
        $Id = "v$($Context.NextId)"
        $Context.NextId++
    }
    $cell = $Context.Document.CreateElement('mxCell')
    Set-XmlAttribute $cell @{
        id=$Id
        value=$Value
        style=$Style
        vertex='1'
        parent=$Parent
    }
    $geometry = $Context.Document.CreateElement('mxGeometry')
    Set-XmlAttribute $geometry @{ x=$X; y=$Y; width=$Width; height=$Height; as='geometry' }
    [void]$cell.AppendChild($geometry)
    [void]$Context.Root.AppendChild($cell)
    return $Id
}

function Add-Edge {
    param(
        [PSCustomObject]$Context,
        [string]$Id,
        [string]$Source,
        [string]$Target,
        [string]$Value = '',
        [string]$Style = ''
    )
    if (-not $Id) {
        $Id = "e$($Context.NextId)"
        $Context.NextId++
    }
    if (-not $Style) {
        $Style = 'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;strokeColor=#666666;fontColor=#333333;'
    }
    $cell = $Context.Document.CreateElement('mxCell')
    Set-XmlAttribute $cell @{
        id=$Id
        value=$Value
        style=$Style
        edge='1'
        parent='1'
        source=$Source
        target=$Target
    }
    $geometry = $Context.Document.CreateElement('mxGeometry')
    Set-XmlAttribute $geometry @{ relative='1'; as='geometry' }
    [void]$cell.AppendChild($geometry)
    [void]$Context.Root.AppendChild($cell)
    return $Id
}

function Add-Container {
    param(
        [PSCustomObject]$Context,
        [string]$Id,
        [string]$Title,
        [double]$X,
        [double]$Y,
        [double]$Width,
        [double]$Height
    )
    $containerStyle = 'rounded=1;whiteSpace=wrap;html=1;fillColor=#FAFAFA;strokeColor=#888888;container=1;collapsible=0;fontColor=#222222;'
    [void](Add-Vertex $Context $Id '' $X $Y $Width $Height $containerStyle)
    [void](Add-Vertex $Context "$Id-title" $Title 0 0 $Width 40 'rounded=1;whiteSpace=wrap;html=1;fillColor=#E6E6E6;strokeColor=#888888;fontStyle=1;fontColor=#111111;' $Id)
    return $Id
}

function Add-ChildBlock {
    param(
        [PSCustomObject]$Context,
        [string]$Id,
        [string]$Label,
        [double]$X,
        [double]$Y,
        [double]$Width,
        [double]$Height,
        [string]$Parent
    )
    $style = 'rounded=0;whiteSpace=wrap;html=1;fillColor=#FFFFFF;strokeColor=#999999;fontColor=#222222;align=left;verticalAlign=top;spacingLeft=10;spacingTop=8;'
    return Add-Vertex $Context $Id $Label $X $Y $Width $Height $style $Parent
}

function Save-Drawio {
    param(
        [System.Xml.XmlDocument]$Document,
        [string]$Path
    )
    $settings = [System.Xml.XmlWriterSettings]::new()
    $settings.Indent = $true
    $settings.Encoding = [System.Text.UTF8Encoding]::new($false)
    $writer = [System.Xml.XmlWriter]::Create($Path, $settings)
    try {
        $Document.Save($writer)
    } finally {
        $writer.Dispose()
    }
}

$textStyle = 'text;html=1;whiteSpace=wrap;align=left;verticalAlign=middle;fontColor=#111111;'
$boxStyle = 'rounded=1;whiteSpace=wrap;html=1;fillColor=#FFFFFF;strokeColor=#666666;align=left;verticalAlign=middle;spacingLeft=10;fontColor=#111111;'
$headerStyle = 'rounded=1;whiteSpace=wrap;html=1;fillColor=#E6E6E6;strokeColor=#666666;fontStyle=1;align=center;verticalAlign=middle;fontColor=#111111;'

# 1. 角色导航地图
$doc = New-DrawioDocument
$ctx = Add-Diagram $doc '角色导航地图' 1600 900
[void](Add-Vertex $ctx 'title' '角色进入方式、默认首页与一级导航｜P0 低保真' 40 30 1100 50 'text;html=1;fontSize=24;fontStyle=1;align=left;verticalAlign=middle;fontColor=#111111;')
[void](Add-Vertex $ctx 'h-role' '角色' 40 100 230 50 $headerStyle)
[void](Add-Vertex $ctx 'h-entry' '实际入口' 320 100 240 50 $headerStyle)
[void](Add-Vertex $ctx 'h-default' '默认首页' 610 100 250 50 $headerStyle)
[void](Add-Vertex $ctx 'h-nav' '一级导航' 910 100 640 50 $headerStyle)
$roles = @(
    @{ Name='一线客服'; Entry='客服工作台侧栏 / 售后助手'; Default='P01 今日工作台'; Nav='今日 · 咨询任务 · 风险队列' },
    @{ Name='售后专员'; Entry='售后工作台 / 我的售后队列'; Default='P02 咨询任务队列'; Nav='今日 · 咨询任务 · 风险队列 · 案例只读' },
    @{ Name='客服主管'; Entry='运营管理门户 / 售后质量与风险'; Default='P01 今日工作台（主管）'; Nav='今日 · 咨询任务 · 风险 · 案例 · 发布 · 审计运行' },
    @{ Name='业务/渠道负责人'; Entry='审批通知深链 / 业务门户'; Default='P07 知识与业务审核'; Nav='待审口径 · 发布审批 · 案例影响 · 范围审计' },
    @{ Name='知识运营'; Entry='知识治理后台'; Default='P01 今日工作台（知识治理）'; Nav='今日 · 来源 · 知识版本 · 案例 · 评测 · 发布' },
    @{ Name='AI 评测人员'; Entry='质量平台 / 售后评测中心'; Default='P10 评测中心'; Nav='评测 · 案例只读 · 发布证据' },
    @{ Name='法务/安全责任人'; Entry='R3 指派深链 / 风险处置入口'; Default='P04 风险队列（R3）'; Nav='风险 · 案例只读 · 来源证据 · 范围审计' },
    @{ Name='系统管理员'; Entry='企业身份与系统管理门户'; Default='P12 权限与职责'; Nav='权限 · 审计与运行 · 集成状态' }
)
for ($i = 0; $i -lt $roles.Count; $i++) {
    $y = 180 + ($i * 82)
    $roleId = "role-$i"
    $defaultId = "default-$i"
    [void](Add-Vertex $ctx $roleId $roles[$i].Name 40 $y 230 60 $boxStyle)
    [void](Add-Vertex $ctx "entry-$i" $roles[$i].Entry 320 $y 240 60 $boxStyle)
    [void](Add-Vertex $ctx $defaultId $roles[$i].Default 610 $y 250 60 $boxStyle)
    [void](Add-Vertex $ctx "nav-$i" $roles[$i].Nav 910 $y 640 60 $boxStyle)
    [void](Add-Edge $ctx "role-edge-$i" $roleId $defaultId '进入')
}
[void](Add-Vertex $ctx 'note' '导航按活动角色渲染；无权限隐藏入口但服务端仍校验。Apple 参考仅涉及层级与渐进披露，不定义品牌视觉。' 40 830 1510 45 'text;html=1;fontSize=14;align=left;verticalAlign=middle;fontColor=#555555;')
Save-Drawio $doc (Join-Path $diagramDir '01_角色导航地图.drawio')

# 2. 页面层级
$doc = New-DrawioDocument
$ctx = Add-Diagram $doc '页面层级' 1600 900
[void](Add-Vertex $ctx 'title' '页面层级图｜9 个工作面，13 个唯一页面' 40 30 900 50 'text;html=1;fontSize=24;fontStyle=1;align=left;verticalAlign=middle;fontColor=#111111;')
$rootId = Add-Vertex $ctx 'root' '企业售后知识平台' 650 100 300 60 $headerStyle
$surfaces = @(
    @{ Name='今日工作台'; Pages=@([PSCustomObject]@{ Id='P01'; PageName='今日工作台' }) },
    @{ Name='一线售后辅助'; Pages=@([PSCustomObject]@{ Id='P02'; PageName='咨询任务队列' },[PSCustomObject]@{ Id='P03'; PageName='售后协作任务' }) },
    @{ Name='风险升级'; Pages=@([PSCustomObject]@{ Id='P04'; PageName='风险队列' },[PSCustomObject]@{ Id='P05'; PageName='风险升级单' }) },
    @{ Name='知识来源'; Pages=@([PSCustomObject]@{ Id='P06'; PageName='知识来源台账' }) },
    @{ Name='知识与审核'; Pages=@([PSCustomObject]@{ Id='P07'; PageName='知识与业务审核' }) },
    @{ Name='案例与链路'; Pages=@([PSCustomObject]@{ Id='P08'; PageName='问题案例队列' },[PSCustomObject]@{ Id='P09'; PageName='案例与修复链路' }) },
    @{ Name='评测中心'; Pages=@([PSCustomObject]@{ Id='P10'; PageName='评测中心' }) },
    @{ Name='发布与回滚'; Pages=@([PSCustomObject]@{ Id='P11'; PageName='发布与回滚' }) },
    @{ Name='权限与审计'; Pages=@([PSCustomObject]@{ Id='P12'; PageName='权限与职责' },[PSCustomObject]@{ Id='P13'; PageName='审计与运行' }) }
)
for ($i = 0; $i -lt $surfaces.Count; $i++) {
    $x = 30 + ($i * 172)
    $surfaceId = "surface-$i"
    [void](Add-Vertex $ctx $surfaceId $surfaces[$i].Name $x 230 150 70 $headerStyle)
    [void](Add-Edge $ctx "surface-edge-$i" $rootId $surfaceId '')
    for ($j = 0; $j -lt $surfaces[$i].Pages.Count; $j++) {
        $page = $surfaces[$i].Pages[$j]
        $pageId = "$($page.Id.ToLower())-cell"
        $y = 360 + ($j * 100)
        [void](Add-Vertex $ctx $pageId ("{0}`n{1}" -f $page.Id, $page.PageName) ($x + 5) $y 140 80 $boxStyle)
        [void](Add-Edge $ctx "page-edge-$i-$j" $surfaceId $pageId '')
    }
}
[void](Add-Edge $ctx 'jump-p06-p10' 'p06-cell' 'p10-cell' '来源失效影响评测' 'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;dashed=1;strokeColor=#666666;fontColor=#333333;')
[void](Add-Edge $ctx 'jump-p10-p07' 'p10-cell' 'p07-cell' '评测失败/需修 KB' 'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;dashed=1;strokeColor=#666666;fontColor=#333333;')
[void](Add-Vertex $ctx 'legend' '页面详情、入口、出口、权限、FR 和验收见 03_页面清单.csv；角色导航差异见 01_角色入口与任务地图.md。' 40 730 1450 60 'text;html=1;fontSize=14;align=left;verticalAlign=middle;fontColor=#555555;')
Save-Drawio $doc (Join-Path $diagramDir '02_页面层级.drawio')

# 3. 13 条关键任务流程
$flows = @(
    @{Id='F01';Name='创建咨询任务并补齐上下文';Start='客户诉求 / 客服入口';A1='创建 ASQ 并记录原话';A2='展示缺失字段并补 CTX';Decision='上下文达到最低判断条件？';Success='进入证据与建议';Failure='识别失败/重复/无权限';Recovery='复用原任务、补证或转人工';End='ASQ_ASSESSING 或进入风险流程'},
    @{Id='F02';Name='证据不足时追问和补证';Start='ASQ 已存在但证据不足';A1='显示缺失字段与证据原因';A2='客户补充 / 售后取证';Decision='证据有效且适用？';Success='进入条件性建议';Failure='无证据/冲突/来源不可用';Recovery='保持待补证、保留冲突或创建 CASE';End='继续判断、转交或 CASE_OPEN'},
    @{Id='F03';Name='条件性建议、承诺拦截和人工确认';Start='已有有效 EVD 或明确缺口';A1='生成带条件与边界的 ADV';A2='人工核对并执行承诺/风险复检';Decision='可发送且无越权承诺？';Success='发送并记录确认版本';Failure='承诺拦截/无依据/风险出现';Recovery='改写、补证、转授权或进入风险';End='ASQ_RESPONDED 或返回处理'},
    @{Id='F04';Name='R2/R3 安全止损和升级';Start='检测到风险信号';A1='暂停普通建议并创建 ESC';A2='立即止损、追问伤害/异味/鼓包';Decision='风险已排除或关闭？';Success='按 R2/R3 转交并监控';Failure='客户拒绝止损/无接收人';Recovery='持续警示、升级安全/法务、保留待办';End='ESC_CLOSED/DISMISSED 后恢复 ASQ'},
    @{Id='F05';Name='来源失效触发对象阻断';Start='SRC 过期/撤回/不可访问';A1='展示影响对象清单';A2='阻断 KB/EVAL/REL/LINK/CASE';Decision='是否存在关联 CASE？';Success='重开或修复受影响 CASE';Failure='影响分析或审计失败';Recovery='先阻断对外引用，保留治理待办并重试';End='阻断完成并进入 CASE 闭环'},
    @{Id='F06';Name='CASE 创建、分诊和修复';Start='错误/缺口/冲突/发布异常';A1='创建 CASE 并保存原证据';A2='分诊、补证、制定修复';Decision='需要知识修复？';Success='EV-14 创建 KB_DRAFT + LINK_OPEN';Failure='无责任人/重复 CASE/来源失败';Recovery='延期、补责任人、复用原对象';End='CASE_REGRESSION_PENDING 或受控延期'},
    @{Id='F07';Name='CASE 关联 0/1/N 个 KB_LINK';Start='打开 CASE 修复计划';A1='按 knowledge_item 分组 LINK';A2='展示 0/1/N 条轨道与下一步';Decision='同知识条目已有活动 LINK？';Success='展示可用 LINK 或创建入口';Failure='重复开链/previous_link_id 非法';Recovery='拒绝非法链、显示审计、复用活动链';End='P09 展示聚合状态'},
    @{Id='F08';Name='部分完成、全部完成和明确弃置';Start='多条 LINK 处于不同状态';A1='展示已完成/活动/失败 LINK';A2='计算 CASE 关闭门禁';Decision='全部最新 LINK 已 RELEASED/ABANDONED？';Success='CASE_CLOSED';Failure='部分完成/最新失败/批准缺失';Recovery='保持 CASE_FIXING 或申请弃置';End='关闭或继续处理'},
    @{Id='F09';Name='EVAL 通过、REL 拒绝和重试';Start='候选 KB 冻结';A1='运行 EVAL 并记录结果';A2='通过则更新 LINK 并创建 REL 候选';Decision='主管批准 REL？';Success='EV-16 激活 REL';Failure='EVAL 失败/REL 拒绝/写入失败';Recovery='LINK_FAILED 回 CASE_FIXING 或重试';End='REL_ACTIVE 或回到修复'},
    @{Id='F10';Name='发布生效、LINK 释放和 CASE 聚合';Start='REL_PENDING_APPROVAL';A1='EV-16 激活新 REL';A2='EV-11 释放匹配 LINK';Decision='CASE 全部知识条目最新 LINK 完成？';Success='CASE_CLOSED';Failure='其他 LINK 活动/失败/审计失败';Recovery='保持 FIXING/PENDING 或重试';End='发布完成且 CASE 可安全关闭'},
    @{Id='F11';Name='REL 停用、回滚和后继 LINK';Start='ACTIVE REL 异常或来源失效';A1='停用当前 REL 并选择历史目标';A2='创建回滚候选，重新审批';Decision='回滚目标与批准有效？';Success='激活新候选；历史 LINK 不变';Failure='目标失效/审批缺失/后继失败';Recovery='保持 SUSPENDED/REJECTED 和治理待办';End='新 REL_ACTIVE + 后继 LINK 或显式停用'},
    @{Id='F12';Name='无 LINK CASE 无需知识修复审批';Start='CASE 分诊确认无需知识修复';A1='填写根因、责任人和理由';A2='主管 + 业务/渠道独立批准';Decision='0 LINK 且双角色批准有效？';Success='CASE_CLOSED 并保存批准审计';Failure='活动 LINK/批准缺失/自审自批';Recovery='返回 CASE_FIXING 或改走知识修复';End='受控关闭或转修复'},
    @{Id='F13';Name='ESC 关闭后风险复发新建 ESC';Start='同一客户再次出现风险';A1='创建新 ESC 并暂停 ASQ';A2='校验 previous_esc_id 与立即止损';Decision='旧 ESC 为同客户终态且无循环？';Success='新 ESC 进入 CONFIRMED/MITIGATING';Failure='非终态/跨客户/循环/重复后继';Recovery='先安全处置；修复引用后重试';End='新 ESC 活动，旧 ESC 不变'}
)
$doc = New-DrawioDocument
foreach ($flow in $flows) {
    $ctx = Add-Diagram $doc ("$($flow.Id) $($flow.Name)") 1600 700
    [void](Add-Vertex $ctx 'title' ("{0}  {1}" -f $flow.Id, $flow.Name) 40 30 1200 50 'text;html=1;fontSize=24;fontStyle=1;align=left;verticalAlign=middle;fontColor=#111111;')
    [void](Add-Vertex $ctx 'start' $flow.Start 40 150 160 90 'ellipse;whiteSpace=wrap;html=1;fillColor=#FFFFFF;strokeColor=#444444;fontColor=#111111;')
    [void](Add-Vertex $ctx 'a1' $flow.A1 250 140 240 100 $boxStyle)
    [void](Add-Vertex $ctx 'a2' $flow.A2 530 140 240 100 $boxStyle)
    [void](Add-Vertex $ctx 'decision' $flow.Decision 820 135 220 110 'rhombus;whiteSpace=wrap;html=1;fillColor=#F5F5F5;strokeColor=#555555;fontColor=#111111;')
    [void](Add-Vertex $ctx 'success' $flow.Success 1080 140 200 100 $boxStyle)
    [void](Add-Vertex $ctx 'end' $flow.End 1320 145 210 90 'ellipse;whiteSpace=wrap;html=1;fillColor=#FFFFFF;strokeColor=#444444;fontColor=#111111;')
    [void](Add-Vertex $ctx 'failure' $flow.Failure 820 330 220 100 'rounded=0;whiteSpace=wrap;html=1;fillColor=#FFFFFF;strokeColor=#555555;dashed=1;fontColor=#111111;')
    [void](Add-Vertex $ctx 'recovery' $flow.Recovery 1080 330 260 100 'rounded=0;whiteSpace=wrap;html=1;fillColor=#F5F5F5;strokeColor=#555555;dashed=1;fontColor=#111111;')
    [void](Add-Edge $ctx 'e1' 'start' 'a1' '')
    [void](Add-Edge $ctx 'e2' 'a1' 'a2' '')
    [void](Add-Edge $ctx 'e3' 'a2' 'decision' '')
    [void](Add-Edge $ctx 'e4' 'decision' 'success' '是/成功')
    [void](Add-Edge $ctx 'e5' 'success' 'end' '完成')
    [void](Add-Edge $ctx 'e6' 'decision' 'failure' '否/异常')
    [void](Add-Edge $ctx 'e7' 'failure' 'recovery' '恢复')
    [void](Add-Edge $ctx 'e8' 'recovery' 'decision' '修复后重试' 'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;dashed=1;strokeColor=#666666;fontColor=#333333;')
    [void](Add-Edge $ctx 'e9' 'recovery' 'end' '升级/终止' 'edgeStyle=orthogonalEdgeStyle;rounded=1;orthogonalLoop=1;jettySize=auto;html=1;dashed=1;strokeColor=#666666;fontColor=#333333;')
    [void](Add-Vertex $ctx 'note' ("失败：{0}`n恢复：{1}`n终点：{2}" -f $flow.Failure,$flow.Recovery,$flow.End) 40 500 1490 100 'text;html=1;fontSize=14;align=left;verticalAlign=top;fontColor=#444444;')
}
Save-Drawio $doc (Join-Path $diagramDir '03_关键任务流程.drawio')

# 4. 每个唯一页面的低保真线框
$wirePages = @(
    @{Id='P01';Title='今日工作台';Role='一线客服';RoleLabel='一线客服视图';NavItems=@('今日','咨询任务','风险队列');Main=@('我的待办','风险/失败与阻断','今日完成与质量','数据完整性与下一步');Side=@('角色与范围','待处理风险','下一条建议','审计/降级提示')},
    @{Id='P02';Title='咨询任务队列';Role='售后专员';RoleLabel='售后专员视图';NavItems=@('今日','咨询任务','风险队列','案例只读');Main=@('筛选与创建 ASQ','任务队列','并发领取/重复请求反馈','空态与重置');Side=@('责任范围','任务状态分布','建议入口','最近事件')},
    @{Id='P03';Title='售后协作任务';Role='一线客服';RoleLabel='一线客服视图';NavItems=@('今日','咨询任务','风险队列');Main=@('原诉求 + CTX 版本','缺失字段 / 证据 / 条件例外','ADV、承诺边界与风险提示','确认发送 / 转交 / 创建 CASE');Side=@('风险暂停','主管 CTX 只读','下一步','隐私与审计')},
    @{Id='P04';Title='风险队列';Role='法务/安全责任人';RoleLabel='法务/安全视图';NavItems=@('今日','风险处置','案例只读','来源证据','范围审计');Main=@('R3 优先与筛选','风险待办列表','无接收人/过期数据','空态与关闭风险只读');Side=@('我的风险范围','等级统计','处置入口','升级规则')},
    @{Id='P05';Title='风险升级单';Role='法务/安全责任人';RoleLabel='法务/安全视图';NavItems=@('今日','风险处置','案例只读','来源证据','范围审计');Main=@('停止危险动作（首要）','风险信号与必要追问','止损、转交、监控、关闭','previous_esc_id 与关联 CASE');Side=@('R 等级','paused_from_state','下一步','审计时间线')},
    @{Id='P06';Title='知识来源台账';Role='知识运营';RoleLabel='知识运营视图';NavItems=@('今日','知识来源','知识版本','问题案例','评测中心','发布/回滚');Main=@('来源筛选与登记','五项核验清单','有效期/撤回/不可访问','影响对象分层清单');Side=@('来源范围','责任与状态','下一步','历史版本')},
    @{Id='P07';Title='知识与业务审核';Role='业务/渠道负责人';RoleLabel='业务/渠道审批视图';NavItems=@('待审口径','发布审批','案例影响','范围内审计');Main=@('KB 版本与适用条件','来源引用与差异','业务审核意见','独立批准 / 拒绝 / 新版本');Side=@('KB 状态','提交/批准分离','评测资格','审计')},
    @{Id='P08';Title='问题案例队列';Role='知识运营';RoleLabel='知识运营视图';NavItems=@('今日','知识来源','知识版本','问题案例','评测中心','发布/回滚');Main=@('筛选与分诊','CASE 队列','活动 LINK / 最新失败','空态与责任空位');Side=@('我的责任范围','CASE 状态分布','下一步','部分闭环提示')},
    @{Id='P09';Title='案例与修复链路';Role='知识运营';RoleLabel='知识运营视图';NavItems=@('今日','知识来源','知识版本','问题案例','评测中心','发布/回滚');Main=@('CASE 根因与证据','CASE_LINK 0/1/N 轨道','previous_link_id 历史链','聚合关闭门禁 / 后继修复');Side=@('聚合状态','活动 LINK','下一步','双角色批准')},
    @{Id='P10';Title='评测中心';Role='AI 评测人员';RoleLabel='AI 评测视图';NavItems=@('评测中心','问题案例只读','发布证据');Main=@('候选与冻结样本','EVAL 执行进度','通过/失败分类','关联 LINK/CASE 回退');Side=@('样本完整性','运行状态','下一步','证据与审计')},
    @{Id='P11';Title='发布与回滚';Role='客服主管';RoleLabel='客服主管视图';NavItems=@('今日','咨询任务','风险','案例','发布与回滚','审计运行');Main=@('待发布候选与影响','批准 / 拒绝','当前 ACTIVE 与 LINK 释放','停用、历史目标、回滚');Side=@('唯一 ACTIVE 范围','REL 状态','回滚风险','审计')},
    @{Id='P12';Title='权限与职责';Role='系统管理员';RoleLabel='系统管理员视图';NavItems=@('权限','审计与运行','集成状态');Main=@('用户与活动角色','权限矩阵','职责分离冲突','角色空位与变更');Side=@('组织范围','限制说明','下一步','变更审计')},
    @{Id='P13';Title='审计与运行监控';Role='系统管理员';RoleLabel='系统管理员视图';NavItems=@('权限','审计与运行','集成状态');Main=@('关键动作检索','审计时间线','数据完整性与降级','对象深链与只读详情');Side=@('查询范围','异常摘要','恢复责任人','导出/权限')}
)
$doc = New-DrawioDocument
foreach ($page in $wirePages) {
    $ctx = Add-Diagram $doc ("$($page.Id) $($page.Title)") 1600 920
    [void](Add-Vertex $ctx 'top' '' 40 30 1520 60 'rounded=0;whiteSpace=wrap;html=1;fillColor=#F5F5F5;strokeColor=#888888;container=1;pointerEvents=0;')
    [void](Add-Vertex $ctx 'title' ("{0}  {1}" -f $page.Id, $page.Title) 20 5 700 50 'text;html=1;fontSize=22;fontStyle=1;align=left;verticalAlign=middle;fontColor=#111111;' 'top')
    [void](Add-Vertex $ctx 'role' ("角色视图：{0}" -f $page.RoleLabel) 940 5 360 50 $boxStyle 'top')
    [void](Add-Vertex $ctx 'return' '返回 / 切角色' 1320 5 170 50 $boxStyle 'top')

    $left = Add-Container $ctx 'left' '一级导航' 40 120 250 760
    for ($i = 0; $i -lt $page.NavItems.Count; $i++) {
        [void](Add-ChildBlock $ctx "nav-$i" $page.NavItems[$i] 20 (55 + $i * 65) 210 50 $left)
    }

    $main = Add-Container $ctx 'main' '主工作区' 330 120 880 760
    $mainY = 55
    foreach ($label in $page.Main) {
        [void](Add-ChildBlock $ctx "main-$mainY" $label 20 $mainY 840 120 $main)
        $mainY += 145
    }
    [void](Add-ChildBlock $ctx 'main-action' '页面内主操作条：当前唯一主操作 + 取消/返回 + 状态提示' 20 620 840 70 $main)

    $side = Add-Container $ctx 'side' '上下文与状态' 1250 120 310 760
    $sideY = 55
    foreach ($label in $page.Side) {
        [void](Add-ChildBlock $ctx "side-$sideY" $label 20 $sideY 270 135 $side)
        $sideY += 155
    }
    [void](Add-ChildBlock $ctx 'side-note' "低保真：仅信息分组与层级。`n不使用品牌颜色、图标或精细视觉。" 20 680 270 50 $side)
}
Save-Drawio $doc (Join-Path $diagramDir '04_低保真页面线框.drawio')

Write-Host 'Generated 4 Draw.io files:'
Get-ChildItem -LiteralPath $diagramDir -Filter '*.drawio' | Select-Object Name, Length | Format-Table -AutoSize
