# dsh-story-continuity

实验版本 — 仅限隔离测试。experimental.9 已安装并重开 ElecKoi 0.2.16 / runtime rc.5，完成身份修复后的真实事实提交和下一轮日志注入检查。不是完整真机验收版。

## 做什么
显式绑定一条 ElecKoi 聊天，通过公开 Conversations API 把产品聊天编号映射到运行会话编号。回合结束后创建有日志的辅助代理提取带证据账本；下一请求通过 systemPrompt.context 注入按角色过滤的账本。不修改角色卡，不按现实时间推进，不主动发消息。

## 安装与配置
官方插件入口安装本仓库 Git 地址。更新已有包后按宿主提示重启，不能以“已安装”代替“已加载”。包开关与组件开关不同。
默认组件停用；首次启用组件仅提供配置，enabled 和 automaticExtraction 均为 false，不创建账本、不调用模型。
在插件实时配置表单中填写：
- conversationId：聊天 ID，或 title:唯一聊天标题。先把独立测试聊天改为唯一标题；精确匹配，重名拒绝。
- dataRoot：宿主可写的绝对私有目录。Android 0.2.15 的候选路径为 /data/user/0/com.eleckoi.app/no_backup/unified-runtime/home/story-continuity（需在该宿主验证，不能填 DSH 私有路径）。卸载应用可能清除此目录。Windows 桌面宿主用形如 `C:\Users\<you>\Documents\story-continuity-data` 的**绝对**路径；相对路径会被拒绝，POSIX 根、盘符、UNC 都接受。
- enabled：配置完成后开启。automaticExtraction：同意辅助模型费用后开启。提取沿用当前 RP agent 的 provider/model；单独模型选择未实现。
- maxChars/maxRecords：回忆注入预算。extractionMaxInputChars：提取输入预算，超限拒绝，不静默截断。extractionMaxTokens：辅助输出预算。
若表单不出现，不要编辑运行中 profile，也不要猜路径：保持 enabled=false 并报告宿主情况。

## 移除与数据
关闭 enabled 和组件即可停止处理；先等待在途回合结束。官方入口卸载插件不会主动删除账本。数据文件名为 SHA-256(storyId).json，目录由 dataRoot 指定。删除或导出前先关闭组件；离线 node manage.mjs 的帮助和参数以源码为准。当前无图形数据管理。

## 已验证与限制
当前源码 `STORY_TEST_MEMORY_ONLY=1 node --test *.test.mjs`：在电脑（Windows）与 DSH 0.2.1-rc.5 宿主真实框架包上为 **87/87 通过，0 failed 0 skipped**（合并进程；逐文件同数），包括 rc.5 真实 AgentLoop + 假模型集成测试；这不等于原生持久日志适配器测试。
计数口径：`host.test.mjs` 只是 `import './host-next.test.mjs'`，逐文件隔离会把那 2 条算两次，所以旧记录的“69”是 67 条唯一 + 2 条重复；不要再把总数当唯一测试数。
experimental.8 真机：提高辅助总输出预算后，事实账本与状态快照成功写入私有目录；下一轮官方会话日志的 user/message 中可见角色状态注入，标明“模拟，不是已发生的事实”。两轮未推进叙事的测试保持故事累计 0 分钟，计划没有变成已完成事实。辅助请求亦有官方持久日志。
已操作真实编辑与一次末条回复重生成；重生成后新状态快照前缀改变，故事总计仍为 10 分钟、本轮增量 0。提交后从最近任务移除应用再启动，确实重新出现运行时启动页，新终端读回 6 份状态快照，最新总计仍为 10 分钟；随后已通过官方 user/message 日志验证重开后的事实和状态注入，并通过可用模型完成一轮及新增状态落盘（见后文）。尚无完整删除/重生成旧分支回忆排除的设备证据；没有捕获网络线上的最终提供方请求。rc.3 未真机验证，不得宣称所有目标版本完整可用。
全文提取遇预算会拒绝；尚无增量压缩。去重完成标记已改为**持久**：账本对每次观察都落一条 batch（空提案也落），重启后 `observedPrefix` 命中即跳过该时间线的辅助调用；状态侧同理，快照已覆盖当前时间线就不再发调用。账本使用完整前缀依赖，编辑使下游批次失效；没有完整持久分支投影。证据匹配不代表语义正确，角色知识标注依赖模型。

## Windows / 桌面宿主
- 数据目录判定用 `path.isAbsolute`，`C:\...`、UNC 与 POSIX 根都接受；相对路径仍拒绝。前端用等价正则做同样检查。
- 原子写盘的临时文件以 `'r+'` 打开再 `fsync`：Windows 拒绝在只读句柄上 `FlushFileBuffers`，用 `'r'` 会让**每一次**保存都抛 EPERM。
- 这两条以前会让插件在 Windows 上无法启用、账本一条也写不进盘；现在已由回归覆盖。

## Tests
node --test *.test.mjs
STORY_TEST_MEMORY_ONLY=1 node --test real-loop.test.mjs
安装开发依赖后运行。持久日志测试在 Android 需要宿主正确提供 DSH_NATIVE_DIR。

## Upload
上传本目录的 .mjs、package.json、cordis.patch.yml、icon.svg、README.md、LICENSE，以及 locale 目录。`DEVICE-PROBE-01/02.md` 是早期设备探测记录，已不在发布清单内；需要时单独附上。index.mjs.pending 只是本地提示文件，不要上传。无角色卡、聊天、凭据或参考仓库源码。

## 计划生命周期（明确规则）
此前从未记录完整规则，这里给出当前**唯一**实现并测试的语义，避免后续自行发明：
- 计划/承诺/线索/冲突是**按 key 追加的状态记录**，最新一条生效（`project` 语义）。
- 只有正文写出结果时才可写 `fulfilled`/`cancelled`/`missed`/`resolved`，且 `evidence` 必须逐字引用该结果；否则保持 `open`。
- **没有按时间自动过期**：`missed` 也必须由正文写出“机会已过”，不因过了多少分钟、多少轮判失败。
- 已结束的 key 要重新开始，必须先写一条 `status: changed` 的修订记录，再写 `open`；直接从终态改回 `open` 会被拒绝。
- 两个计划冲突时保持各自 key，另用 `kind: conflict` 记录矛盾；矛盾只由正文解决，不自动取舍。
- 计划、承诺、约定只是意向，不等于已经执行、收到或兑现（与礼赠不消除冲突一致）。

## 输出预算（决定与依据）
`extractionMaxTokens` 默认 16384、上限 65536；`stateMaxTokens` 默认 8192、上限 65536。
依据：输出上限是**上限而非计费**，模型提前停止不会花满；但推理 token 计入该上限。
真机证据（ElecKoi + deepseek-flash，`reasoningEffort: high`）：同一条 17 条消息的时间线，
8192 产出 7 条记录时 JSON 被截断、插件安全拒绝（诊断记 `extraction-failed`）；
把预算提到 16384 后同一类回合成功提交（6 条记录）。另有一次关闭思考的对照调用，
输出 6366 tokens 且 `stop_reason=end_turn`，说明 8192 本来就没有余量。
这是**默认值**决定，不是“所有模型在 16384 都能成功”的结论；模型能力仍需实测。

## 许可
MIT，见 `LICENSE`。若要改为 Apache-2.0，替换 `LICENSE` 与 `package.json` 的 `license` 字段即可。

## English
Experimental, explicitly scoped roleplay continuity using public ElecKoi conversation identity, logged auxiliary agents, evidence-linked atomic storage and logged runtime context. Dormant by default. Current source passes 115 tests in memory-only mode. Installed experimental.8 completed live extraction, state persistence and next-turn logged state injection on ElecKoi 0.2.16 / runtime rc.5. A high-reasoning model required an increased auxiliary output budget (8192 in this test); reasoning consumes that budget. Persona selection requires enabled, always-injected static plain text, not merely an agent-readable required entry. Experimental.9 is installed and the app was reopened. Live extraction committed three records with the exact host character identity and fresh IDs; the next turn's official user/message log contains those facts and simulated state. The new snapshot adds zero minutes and preserves the ten-minute story total. This does not prove the answer relied exclusively on the ledger. One real regeneration changed the latest state prefix while preserving ten story minutes and zero delta. Removing the app from Recents and relaunching showed runtime startup; a fresh terminal read back six persisted snapshots with the same latest total. After a Gemini 503, the user authorized a connection repair: the isolated chat switched to an existing GPT-6.1 Sol route and completed a real turn. Post-relaunch official user/message seq 228 contains all three existing facts and simulated ten-minute state; a seventh persisted snapshot has zero elapsed minutes. Full deleted/regenerated-branch recall exclusion remains unverified, as do rc.3 compatibility and wire-level request capture. Use only an isolated test chat. Installation is not proof of activation or successful injection.

## 角色状态模拟（故事时间）
stateSimulation 开启后，每次完整 RP 回合结束（事实提取之后）再发起一次有日志的辅助代理调用，输出单个 JSON 对象，写入独立的 `.state.json`（与事实账本分开，永不伪装成已发生事实）。下一次请求注入简短摘要。
- 时间：只认叙述里的字面证据（如“三天后”），并把该片段作为证据；设备时钟、消息间隔、真实流逝时间都不推进故事时间。无证据时 elapsedMinutes 必须为 0。
- 人设：只读当前聊天设定库中“启用 + 始终注入 + 静态纯文本”的条目；读不到或超预算就跳过本次模拟并记录警告，不套用通用人设。
- 失效：快照绑定当次完整消息前缀与角色；编辑、删除、重生成使快照作废。
- 人设变动：只作提示，不作废证据。快照记录 personaDigest，并在下一次模拟时与当前人设的 digest 一起交给模型；两者不同即表示人设已改。**没有**独立的人设变更告警，也不会因此丢弃已有快照。
- 输出是完整快照而非增量：七个顶层字段及其子字段必须齐全，未变化字段应沿用 previous；缺字段整份拒绝，避免“只写变化”导致旧状态被静默清空。
- 条件用 reviewWhen（何时复查）描述，不用绝对时间戳；礼赠、承诺、约定只是意向，不算已执行。
- 字段白名单校验：出现时间戳、时钟或未知字段即整份拒绝。
已知限制：未在 rc.3 真机闭环验证；额外一次模型调用增加延迟与费用。

## 角色自述记忆（日记/反思、长期目标、生活作息）
storyMemory 开启后，这三类内容由**现有提取回合顺带产出**——不新增模型调用、不新增节拍，因此没有“每 N 回合写一篇”这类硬性频率；提取器判断这一轮没有值得记的东西就不写。
它们与事实、计划、模拟状态的定位不同，各自回答不同问题：

| 记录 kind | 回答的问题 | 是否客观事实 | 注入方式 |
|---|---|---|---|
| `diary` / `reflection` | 她怎么讲述和理解这一切 | **否**，允许主观甚至记错 | 独立“角色自述记忆”块，明确标注不是证据 |
| `goal` | 她想往哪去（长线） | 否，是意向 | 同块，只列进行中的目标 |
| `routine` | 她的日子本来怎么过（周期） | 否，是生活结构 | 同块，只列 active 的作息 |

约束（均有测试）：
- `diary`/`reflection` 必须用 `origin: diary|summary`；带派生来源的记录**不能**写成 state/event 等客观事实。
- `goal` 复用计划的状态机：终态要正文逐字证据，从终态重开必须先写 `changed`。
- `routine` 用独立词表 `active/suspended/ended`，可带 `cadence`（如“每天清晨”），长度受限。
- 三类都**不进事实通道**：`recall` 显式排除它们，所以不会被当成剧情证据。
- 角色作用域：只有 `knownBy` 命中当前角色的记录会注入。
- 反思**不能直接改**目标/计划的状态；它只作为下一次判断的语境，改状态必须另出一条带证据的记录。
- 状态模拟器可以看到 `goal`/`routine`（用来解释情绪），**看不到日记正文**——否则她自己的叙述会变成模拟器的观测依据。
- 预算：`memoryInjectMaxChars`（默认 1000）、`memoryMaxDiary`(3) / `memoryMaxGoals`(4) / `memoryMaxRoutines`(4)。

边界不变：不主动发消息、不按现实时间推进、不做好感度、不设备联动、不兜底人设。目标是**解释的语境**而不是执行器——插件不会因为“她有目标”就替她行动。

## 编辑验收发现与 experimental.9 修复复验
真实编辑将故事推进十分钟后，状态快照正确变为累计 10 分钟，但事实事务被 `Record id already committed` 拒绝。排查证明：宿主角色标识与正文人名不同，模型 knownBy 使用正文姓名；角色过滤让辅助提取看不到仍有效的旧记录，因此复用了 ID。此前账本落盘和状态注入成功，不能证明事实对当前角色有效可见。
experimental.9 已补精确角色标识提示及独立 reservedRecordIds（只传 ID，不泄露其他角色的事实正文），仍保留证据、角色过滤和重复 ID 拒绝校验。不自动合并名字、不改写现有私有数据。安装并重开应用后，真实辅助调用成功提交三个新记录，knownBy 使用宿主角色标识，未复用旧 ID；下一轮官方 user/message 日志中可见这三个事实记录及模拟状态。新增状态快照 elapsedMinutes=0、累计仍为 10 分钟，未因真实等待或复述十分钟证据再次推进。此检查证明日志化上下文含事实，不证明模型回答只依赖账本，也不等于完整删除/重生成或提交后再次冷启动验收。
记录 ID 一经提交即永久占用：判重基于**全部批次**（含因编辑/删除/重生成而失效的分支），不再只看当前活跃记录。这样即使某段分支失效后又恢复，也不会出现「两个不同事实共用一个 ID、后来的静默覆盖前面的」情况。存量账本里已存在的重复 ID 不做迁移，只在提交侧封堵新增。

## 重开后注入与连接修复验收
提交后重开应用，Gemini 路由返回 HTTP 503：`No available accounts`。用户授权修复连接后，仅将隔离测试会话切到已有 GPT-6.1 Sol 配置，新增一轮连接验收，真实回复成功，官方会话日志 turn/end 的 reason=completed。最新 user/message（seq=228）同时含三个既有事实记录、模拟状态标题及九点十分；前两条匹配上下文 seq=172、200 也具备上述内容。由此确认重开后的日志化上下文仍能召回已持久化事实和状态，不等于网络最终请求捕获或回答依赖来源证明。
辅助提取与状态代理亦产生官方日志；状态文件从 6 增至 7 份，最新 elapsedMinutes=0、累计 10 分钟，午后整理茶叶仍为未开始。旧失败回复占位未删除，原始角色会话未修改。完整删除/重生成旧分支排除仍缺设备验收。

## 辅助预算和人设排错
- `extractionMaxTokens` / `stateMaxTokens` 是总输出预算，提供方可能把推理 token 也计入。真实高推理调用在 2048 上限截断 JSON；插件拒绝提交是预期的安全行为。隔离验收将两者设为 8192 后成功，但这不是所有模型的成功保证，也不是免费额度。
- `auxiliaryReasoningEffort`（当前源码新增）：`inherit` 默认沿用主聊天；`low` / `medium` / `high` 仅覆盖辅助调用，不改主聊天，必须由模型支持。不自动猜测模型能力或静默降级。
- ElecKoi 人设条目“Agent 读取 + 必读”并不等于“提示词常驻”。保守自动读取需要常驻、启用、静态纯文本；在条目编辑器的“触发”页选择“提示词常驻”，返回角色编辑器后保存。插件不自行改变真实角色设定。
- 可选诊断只写阶段、计数和预定义错误类别，不写人设、聊天、凭据。失败计数可能同时来自控制器和外层捕获，不能据此推算模型调用次数。
