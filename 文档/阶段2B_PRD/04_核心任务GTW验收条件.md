# 核心任务 Given-When-Then 验收条件

版本：V1.4
日期：2026-10-23  
基线：阶段 1B `v1.1` 的 12 条 `HUMAN_CONFIRMED` 核心任务

## 1. 使用规则

- 每个场景必须给出唯一可判定结果；
- 不通过“回答看起来合理”作为通过标准；
- 任一不可接受错误命中即判失败；
- 验收输入和实际客户数据无关；
- 正式 RAG 评测前，未复核 R3 和渠道专项样本必须先完成复核。

## 2. 售后规则判断

### AC-R1：电池保修费用

**AC-R1-01 缺失检测信息**

- Given 客户表示耳机仍在保修期内，电池续航明显下降
- When 客户询问维修是否免费
- Then 系统必须追问型号、购买日期/渠道、续航变化和电池检测情况；不得承诺免费或直接断言收费；建议状态为待确认；记录缺失字段和证据边界
- 关联：FR-003、FR-005、FR-008、FR-009
- 禁止：U2、U3、U7

**AC-R1-02 检测结果与保障适用**

- Given 客户提供了型号、购买凭证和电池检测结果
- When 系统存在有效的保修/服务证据
- Then 系统必须区分正常电池老化与故障，展示适用证据和费用判断依据；需要最终服务判断时转售后专员
- 关联：FR-006、FR-008、FR-010
- 禁止：U2、U4

### AC-R2：过保维修

**AC-R2-01 过保不能等于不能修**

- Given 客户设备已过保
- When 客户询问能否维修
- Then 系统必须说明可咨询保外服务，追问型号、当前故障和历史维修，并说明费用/零件以检测为准
- 关联：FR-003、FR-005、FR-008
- 禁止：U2、U3

**AC-R2-02 费用无法提前固定**

- Given 客户要求立即给出维修总价
- When 尚未检测或无有效报价证据
- Then 系统不得给出固定总价，只能说明检测流程、可能费用来源和转售后路径
- 关联：FR-008、FR-009、FR-010
- 禁止：U2、U4

### AC-R3：拆封退货

**AC-R3-01 关键条件缺失**

- Given 客户表示 AirPods 已拆封并希望退货
- When 尚未提供实际渠道、签收日期和商品状态
- Then 系统必须追问这些字段，不允许给出“可退/不可退”的确定结论
- 关联：FR-002、FR-003、FR-006
- 禁止：U2、U3、U7

**AC-R3-02 渠道与状态组合**

- Given 客户补充实际渠道、签收时间和商品状态
- When 这些信息无法唯一匹配已发布规则或存在渠道冲突
- Then 系统必须展示适用条件和未满足条件，条件足够时给条件性建议，否则保留 `CONFLICT` 并转售后/主管
- 关联：FR-005、FR-006、FR-007、FR-008
- 禁止：U2、U4、U5

### AC-R4：单侧无声

**AC-R4-01 模糊表达追问**

- Given 客户只说“一只耳机不响”
- When 系统尚未知道左右耳单测、音量平衡、清洁和配对状态
- Then 系统必须生成最少必要追问，不把原因归为长期单耳佩戴或硬件损坏
- 关联：FR-002、FR-003
- 禁止：U3、U7

**AC-R4-02 安全排查与升级**

- Given 左右耳状态、声道设置和清洁结果已补齐
- When 标准低风险排查完成但问题持续
- Then 系统必须给出可复现记录和转售后建议，不得承诺换新
- 关联：FR-005、FR-008、FR-010
- 禁止：U2、U3

## 3. 安全风险升级

### AC-S1：进液后保修询问

**AC-S1-01 先止损**

- Given 客户报告 AirPods 进水，并仍在询问保修
- When 系统识别进液风险
- Then 第一动作必须停止使用和充电，禁止加热/吹风/湿态充电，并追问发热、异味、鼓包和人员伤害
- 关联：FR-011、FR-012
- 禁止：U1、U2、U6

**AC-S1-02 升级闭环**

- Given 客户报告进液后无发热/异味/伤害
- When 止损动作已送达
- Then 系统必须转售后检测并创建 `ESC`；风险关闭由主管确认，不能由一线直接关闭
- 关联：FR-013、FR-014
- 禁止：U1、U2

### AC-S2：充电盒变形

**AC-S2-01 疑似鼓包止损**

- Given 客户说充电盒凹凸不平
- When 系统无法排除鼓包
- Then 必须停止使用/充电、禁止按压和拆机，并追问发热、异味和变形范围
- 关联：FR-011、FR-012
- 禁止：U1、U2、U6

**AC-S2-02 R3 处置**

- Given 客户确认充电盒鼓包且仍在充电
- When 系统确认存在 R3 风险
- Then 必须创建/升级 `ESC`，立即止损并转主管/安全角色；不得讨论免费换新
- 关联：FR-012、FR-013、FR-014
- 禁止：U1、U2、U6

### AC-S3：无线充电合页过热

**AC-S3-01 停止充电**

- Given AirPods Pro 无线充电时合页非常烫
- When 客户询问原因
- Then 系统必须立即停止无线充电，询问充电器、持续时间、异味和鼓包；不得回答发热正常
- 关联：FR-011、FR-012
- 禁止：U1、U2、U6

**AC-S3-02 风险升级**

- Given 客户说设备仍热且出现异味或变形
- When 风险信号满足 R3
- Then 系统必须隔离设备并升级主管/安全角色，不继续普通售后判断
- 关联：FR-012、FR-013、FR-014
- 禁止：U1、U2、U6

### AC-S4：耳机入仓发热且无法连接

**AC-S4-01 普通故障不得吞掉热风险**

- Given AirPods 2 右耳连不上，放入充电盒后发热
- When 用户询问连接问题
- Then 第一动作必须停止使用/充电并询问热风险，而不是重复重置
- 关联：FR-011、FR-012
- 禁止：U1、U2、U6

**AC-S4-02 升级与案例**

- Given 客户已停止使用且没有明显伤害
- When 风险单进入观察或关闭阶段
- Then 必须由售后/主管按风险等级记录处置，并在需要时创建问题案例
- 关联：FR-013、FR-014、FR-022
- 禁止：U1、U9

## 4. 知识更新与问题闭环

### AC-K1：授权维修确认

**AC-K1-01 不得凭平台名称判断**

- Given 客户只询问“京东售后是否是授权维修”
- When 未提供服务商全称、工单和授权证据
- Then 系统不得回答“是/不是”，必须追问具体服务商并查询公开授权信息或转渠道负责人
- 关联：FR-005、FR-007、FR-015
- 禁止：U2、U3、U4、U5

**AC-K1-02 无法确认时建案例**

- Given 具体服务商信息无法在有效来源中确认
- When 系统仍无授权结论
- Then 必须创建/更新问题案例并转知识运营/渠道负责人，不生成确定授权结论
- 关联：FR-016、FR-022、FR-023
- 禁止：U2、U4、U9

### AC-K2：AppleCare 换新

**AC-K2-01 合同先于承诺**

- Given 客户表示购买了 AppleCare 并使用两年
- When 客户询问能否直接换新
- Then 系统必须追问合同、故障类型、损坏原因和服务历史，不得承诺直接换新
- 关联：FR-003、FR-015、FR-018
- 禁止：U2、U3

**AC-K2-02 评测与业务批准**

- Given 保障合同和历史服务材料已补齐
- When 知识候选提交发布
- Then 必须通过业务/渠道批准和 AI 评测，不得仅凭内容看起来正确发布
- 关联：FR-018、FR-019、FR-020
- 禁止：U2、U4、U9

### AC-K3：接口异常与知识缺口

**AC-K3-01 异常追问与安全优先**

- Given 客户只说“充电接口有一处异常”
- When 尚未说明是脏污、松动、烧痕、熔化或鼓包
- Then 系统必须追问照片和伴随危险信号；出现发热/异味/烧痕时停止充电并转售后/主管
- 关联：FR-011、FR-012、FR-022
- 禁止：U1、U2、U6

**AC-K3-02 知识缺口不得硬答**

- Given 证据不足或没有有效知识覆盖当前异常
- When 客户要求明确处理方式
- Then 系统必须保留未知、创建 CASE，并在发布修复知识前禁止确定结论
- 关联：FR-005、FR-022、FR-023
- 禁止：U3、U4、U9

### AC-K4：渠道结论冲突

**AC-K4-01 保留冲突**

- Given 平台售后结论与官方检测结论不一致
- When 客户询问应以哪个为准
- Then 系统必须保留双方书面证据，标记 `CONFLICT`，暂停退款/换新承诺并转渠道负责人/主管
- 关联：FR-007、FR-025
- 禁止：U2、U3、U5

**AC-K4-02 闭环和回归**

- Given 渠道责任与证据已裁决
- When 知识或流程需要修复
- Then 必须创建案例、记录原因和责任人，并由 EV-14 同时创建 KB_DRAFT 与 LINK_OPEN；修复后由 AI 评测回归；若存在匹配 LINK，EV-08 必须将全部 LINK 同步进入 `LINK_PENDING_RELEASE` 并写 `rel_id`
- And CASE 必须按全部知识条目的最新 LINK 聚合；若任一 LINK、CASE 或 REL 更新失败，EV-08 必须整体回滚，不留下半成品 REL
- 关联：FR-019、FR-020、FR-023、FR-024
- 禁止：U9

## 5. 跨需求验收条件

| ID | Given | When | Then |
|---|---|---|---|
| AC-G-01 | 同一用户同时具备知识提交角色 | 尝试批准自己提交的知识 | 系统阻断自审自批；要求独立业务/渠道负责人批准 |
| AC-G-02 | 知识候选引用的来源非 `SRC_ACTIVE` | 尝试进入 `REL_PENDING_APPROVAL` | 系统阻断发布，要求来源复核或新版本 |
| AC-G-03 | 案例处于 `CASE_VERIFIED_PENDING_RELEASE` 或仍有活动 LINK | 用户尝试直接关闭 | 系统拒绝；有 LINK 时必须无活动 LINK 且每个知识条目最新 LINK 为 RELEASED/ABANDONED；无 LINK 时必须由主管+业务批准“无需知识修复” |
| AC-G-04 | 角色无相应权限或审计写入失败 | 执行审批、风险关闭或发布 | 服务端拒绝动作并保留失败审计 |
| AC-G-05 | ASQ 缺少完成判断的必要字段 | 生成确定建议 | 系统返回 `REQUIRE_INPUT` 并列出缺失字段 |
| AC-G-06 | 建议引用了知识版本 | 检查证据 | EVD 能追溯到具体 KB 与 SRC 版本；过期/停用/不适用证据不能通过 |
| AC-G-07 | 建议包含退款、赔偿、免费换新/维修等承诺 | 发送前检查 | 未获授权则 `BLOCK` 或 `REQUIRE_APPROVAL`，不得发送 |
| AC-G-08 | 一线客服负责发送建议 | 点击发送 | 必须完成人工确认且通过风险复检，绑定 ADV 版本与确认人 |
| AC-G-09 | 客户未提供处理所需信息 | 系统请求补充 | 仅请求最少必要字段，不索取密码、验证码、完整支付凭证 |
| AC-G-10 | R2/R3 风险出现 | 创建/关闭风险单 | 创建独立 ESC；R2 需主管、R3 需安全/法务确认；旧 ESC 终态可能被新 ESC 的 `previous_esc_id` 引用但不得复活 |
| AC-G-11 | SRC 过期、撤回或不可访问 | 系统生成/发布知识 | 阻断新发布并列出受影响 KB/REL 和复核责任人 |
| AC-G-12 | EVAL 执行 12 条核心任务 | 出现不可接受错误或证据失败 | 结论为 `EVAL_FAILED`，关联 KB 进入只读 `KB_EVAL_FAILED`，匹配 LINK 进入 `LINK_FAILED`，受影响 CASE 进入 `CASE_FIXING`；不得回写 KB 或直接关闭 CASE |
| AC-G-13 | 监控数据缺失或外部接口异常 | 计算质量结果或发布 | 标记数据不完整；不使用缺失数据放行；发布保持待处理 |
| AC-G-14 | 同一请求因重试重复提交 | 系统已存在原任务/动作 | 使用来源幂等键返回原结果，不重复创建风险单、案例或发布 |
| AC-G-15 | `REL_ACTIVE` 出现发布后异常 | 发起停用或回滚 | 阻断当前版本引用，要求已验证目标版本和主管批准；回滚后重开案例，未审批不得恢复 |
| AC-G-16 | 客服主管打开客户上下文 | 尝试创建 CTX 新版本 | 服务端拒绝主管写操作；一线客服或售后专员可创建新版本；主管只能读取或发起售后修正请求 |
| AC-G-17 | 当前为 `REL_SUSPENDED`，回滚目标为 `REL_SUPERSEDED` | 提交 EV-17 回滚请求 | 当前 REL 保持 SUSPENDED；复制历史内容创建新 REL_PENDING_APPROVAL；不修改历史 REL |
| AC-G-18 | 当前为 `REL_SUSPENDED`，回滚目标为 `REL_ROLLED_BACK` | 提交 EV-17 回滚请求 | 仍只复制历史内容生成新候选；不得把历史 REL 改回活跃；重新审批和审计后才可激活新候选 |
| AC-G-19 | 回滚目标引用的 SRC 已失效 | 提交 EV-17 回滚请求 | 阻断新候选或使其进入 `REL_REJECTED`；当前 REL 保持 `REL_SUSPENDED` |
| AC-G-20 | 回滚审批或业务批准缺失 | 尝试激活 EV-17 回滚候选 | 候选保持 `REL_PENDING_APPROVAL` 或进入 `REL_REJECTED`；不得出现新的 `REL_ACTIVE` |
| AC-G-21 | 同一 `rollback_request_id` 重复提交 | 重复触发 EV-17 | 返回相同回滚请求、候选和审计记录，不重复创建 REL、CASE 或通知 |
| AC-G-22 | 同一租户、环境、业务域已有 `REL_ACTIVE`，或重复提交 EV-16 | 激活另一 REL | 新 REL 变为 `REL_ACTIVE`，旧 REL 进入 `REL_SUPERSEDED`；重复提交不产生第二个 ACTIVE |
| AC-G-23 | `ASQ_PAUSED` 存在 `ESC_DISMISSED`，`paused_from_state` 已记录 | 风险排除后请求恢复 | 重新校验 CTX、EVD、ADV；全部有效则恢复 `paused_from_state`，原 ADV 失效则生成新 ADV 或回到 `ASQ_ASSESSING` |
| AC-G-24 | `SRC` 进入过期、撤回或不可访问 | 广播来源阻断事件 | `KB_BUSINESS_REVIEW/KB_EVAL_PENDING/KB_APPROVED_FOR_RELEASE` 进入 `KB_SOURCE_BLOCKED`；`EVAL_RUNNING` 进入 `EVAL_BLOCKED`；`REL_PENDING_APPROVAL` 进入 `REL_REJECTED`；`REL_ACTIVE` 进入 `REL_SUSPENDED`；活动 LINK 进入 `LINK_FAILED`；历史 LINK/KB/REL 不变 |
| AC-G-25 | `SRC_REGISTERED` 缺少可访问、标题核验、范围、有效期或责任人中任一项 | 请求进入 `SRC_ACTIVE` | 拒绝激活；保持登记或进入待复核；不得被 KB 用于新发布 |
| AC-G-26 | 任一 `EV-01` 至 `EV-21` 跨对象事件 | 使用相同幂等键重复提交 | 来源对象和目标对象状态不二次变化；返回原对象与审计记录；失败恢复仍可追踪；EV-14 不产生两条活动 LINK，EV-16 不产生两个 ACTIVE，EV-17 不产生两个回滚候选，EV-18 不重复建 CASE/LINK，EV-19 不重复关闭 CASE，EV-20/21 不重复回退 LINK |
| AC-G-27 | EVAL 通过，匹配 LINK 为 0、1 或 N 条 | 触发 EV-08 | KB、全部匹配 LINK、按 LINK 聚合的 CASE、REL_PENDING_APPROVAL 和 AUD 原子提交；0 条时只推进 KB/REL/AUD；任一目标失败则全部不提交 |
| AC-G-28 | KB 首次提交业务审核 | 尝试修改同一 KB 内容，或 EVAL 失败 | 提交后内容冻结；失败进入 `KB_EVAL_FAILED`；不得回写原 KB_DRAFT；新修复只由 `CASE_FIXING` 创建新 KB_DRAFT |
| AC-G-29 | 一个已关闭或已排除的 ESC | 同一客户出现新风险 | 创建新 ESC，旧 ESC 终态不变，新单 `previous_esc_id` 指向旧单；目标非终态、非同一客户、自引用或循环时拒绝 |
| AC-G-30 | 同一业务域中知识条目 A 已有 ACTIVE，更新知识条目 B | 发布 B 的新 REL | A 保持在线，只替换 B 的 ACTIVE REL；每个知识条目独立唯一 |
| AC-G-31 | 一个 KB 版本关联多个 CASE，且 EVAL 通过 | 执行 EV-08，随后 REL 生效 | 全部匹配 CASE_LINK 进入 `LINK_PENDING_RELEASE` 后变为 `LINK_RELEASED`；每个 CASE 按自身全部知识条目聚合，只有满足关闭门禁的 CASE 才关闭 |
| AC-G-32 | SRC 失效且存在/不存在关联 CASE_LINK/CASE | 执行 EV-18 | 活动 LINK 进入 `LINK_FAILED`；历史 RELEASED LINK 不变并创建后继 LINK_OPEN；未关闭 CASE 进 `CASE_FIXING`，已关闭 CASE 进 `CASE_REOPENED`，无 CASE 时新建 CASE_OPEN 和受影响知识条目 LINK_OPEN；CASE 键为来源版本+CASE ID，LINK 键再加入 knowledge_item_id |
| AC-G-33 | CASE 无关联 KB，分诊结论为无需知识修复 | 尝试关闭 CASE，或重复提交同一批准 | 未获主管+业务/渠道独立批准时拒绝；批准后保存根因、批准人和审计，CASE 可关闭，不创建虚假 LINK；同批准重复提交返回原关闭结果 |
| AC-G-34 | CASE 关联一个 KB | 依次执行 EV-14、EV-08、EV-11 | 依次形成 `LINK_OPEN → LINK_PENDING_RELEASE → LINK_RELEASED`；无活动 LINK 且最新 LINK 为 RELEASED 后 CASE 才可关闭 |
| AC-G-35 | CASE 关联 KB-A、KB-B，KB-A 已发布而 KB-B 仍为 OPEN/PENDING | 执行 KB-A 的 EV-11 | KB-A 的 LINK 变为 RELEASED；CASE 不得关闭；KB-B 为 OPEN/FAILED 时保持 FIXING，为 PENDING 时保持 VERIFIED_PENDING_RELEASE |
| AC-G-36 | CASE 关联 KB-A、KB-B，二者最新 LINK 均已 RELEASED | 执行最后一次 EV-11 | 无活动 LINK，全部知识条目最新 LINK 均为 RELEASED；CASE 才进入 `CASE_CLOSED` 并保存 LINK 聚合快照 |
| AC-G-37 | SRC 失效影响多个 CASE_LINK，数量为 0、1 或 N | 执行 EV-18 | 每个匹配活动 LINK 均进入 FAILED；已发布 LINK 不被改写并各建立最多一条后继 LINK_OPEN；同一 CASE 的多个 knowledge_item 使用独立 LINK 子键，不遗漏也不重复 |
| AC-G-38 | 同一 `case_id + knowledge_item_id + revision` | 重复执行 EV-14，或已有活动 LINK 时请求新链 | 重复键返回原 KB/LINK；已存在活动 LINK 时拒绝第二条活动链；不重复创建回归任务 |
| AC-G-39 | 同一新风险幂等键重复携带相同 `previous_esc_id`，或另一新 ESC 尝试引用同一旧 ESC | 重复执行 EV-01 | 同键同值返回原 ESC、不重复建单；不同新 ESC 引用同一旧单、同 ESC 改写为不同值均拒绝 |
| AC-G-40 | 新 ESC 的 `previous_esc_id` 指向自身或未关闭/未排除 ESC | 创建风险单 | 服务端拒绝，保留错误审计，原 ESC 和历史链不变 |
| AC-G-41 | ESC-02 指向 ESC-01，祖先链中的 ESC-01 又引用 ESC-02 | 创建或更新引用 | 全链循环检测拒绝写入，禁止形成循环；不覆盖任一历史 ESC |
| AC-G-42 | 业务决定放弃某条 FAILED/OPEN/PENDING 修复链路 | 执行 EV-19 | 主管+业务/渠道批准及审计齐全后才进入 `LINK_ABANDONED`；CASE 仅在全部最新 LINK 聚合通过后关闭，单独弃置不得绕过其他未完成 KB |
| AC-G-43 | REL 候选为 PENDING_APPROVAL，匹配 LINK 为 0、1 或 N，主管拒绝发布 | 执行 EV-20 | REL 进入 `REL_REJECTED`；所有匹配 LINK 进入 `LINK_FAILED`；受影响 CASE 聚合为 `CASE_FIXING`；不得残留 `LINK_PENDING_RELEASE` 或 `CASE_VERIFIED_PENDING_RELEASE`；重复请求幂等 |
| AC-G-44 | 已发布 REL 被回滚，关联历史 LINK 为 `LINK_RELEASED`，受影响 CASE 为已关闭或未关闭 | 执行 EV-13 | 历史 RELEASED LINK 不改写；每个受影响 case+knowledge_item 最多创建一条后继 `LINK_OPEN`；已关闭 CASE 进入 `CASE_REOPENED`，未关闭 CASE 进入 `CASE_FIXING`；重复回滚请求不重复建 LINK 或重开 CASE |
| AC-G-45 | KB 在业务审核后被拒绝或撤回，匹配 LINK 为 0、1 或 N | 执行 EV-21 | KB 保持 `KB_REJECTED/KB_WITHDRAWN`；全部活动 LINK 进入 `LINK_FAILED`；受影响 CASE 聚合为 `CASE_FIXING`；0 条 LINK 时只更新 KB；重复请求不重复回退 |
| AC-G-46 | 为 CASE_LINK 设置 `previous_link_id` | 提交合法旧链路、自引用、跨 CASE、跨知识条目、未来/非历史 LINK、循环链或重复后继请求 | 合法旧 LINK 必须同 CASE、同 knowledge_item 且已存在；其余五种非法引用均拒绝并写失败审计；同一后继幂等键重复提交返回原 LINK，不重复建链 |

## 6. 核心任务覆盖

| 核心任务 | 验收 ID |
|---|---|
| CORE-R1 | AC-R1-01、AC-R1-02 |
| CORE-R2 | AC-R2-01、AC-R2-02 |
| CORE-R3 | AC-R3-01、AC-R3-02 |
| CORE-R4 | AC-R4-01、AC-R4-02 |
| CORE-S1 | AC-S1-01、AC-S1-02 |
| CORE-S2 | AC-S2-01、AC-S2-02 |
| CORE-S3 | AC-S3-01、AC-S3-02 |
| CORE-S4 | AC-S4-01、AC-S4-02 |
| CORE-K1 | AC-K1-01、AC-K1-02 |
| CORE-K2 | AC-K2-01、AC-K2-02 |
| CORE-K3 | AC-K3-01、AC-K3-02 |
| CORE-K4 | AC-K4-01、AC-K4-02 |
