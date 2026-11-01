# dsh-story-continuity — 0.1.0-experimental.1

**开发原型，不是已完成的 ElecKoi 连续性插件。默认禁用；尚未安装至 ElecKoi。**

## 已实现
- 纯 JS 连续性核心：状态、事件、承诺、冲突、未闭合线索、计划、知识/误解、派生日记。
- 原文逐字证据校验；完整已观察正文前缀 SHA-256 依赖；编辑/删除/换回复使不匹配记录失效；同前缀可共享，分歧不串线。
- 记录版本与来源保留，重复事务幂等，坏提案不写盘，临时文件 fsync 后 rename。
- 角色 knownBy / knowledge.character 过滤、猜测不提升为客观事实、日记不建立事实。
- 完整 JSON 检索预算；默认 24 条/6000 UTF-16 字符（不是 token）。提示策略/版本/标签另有固定开销。
- 正式 DSH Host 入口：Schemastery 配置、systemPrompt.context、defineTool。不改角色卡、共享预设、宿主循环、私有数据库。
- 离线数据管理 CLI：inspect / export / suppress / clear / project。

## 尚缺失，不能宣称完成
1. 没有独立自动提取器。当前依赖角色模型主动调用 story_inspect / story_commit，不能保证每回合调用；也没有事后自动补录。
2. ElecKoi 实际角色对话端到端闭环未验证。其产品历史投影替换 user-role 历史，原生 runtime-context 旧快照可能被过滤；tool 结果保留也待验证。不能以“注册了 context”推断下一轮真正收到它。
3. 角色身份/故事绑定须手动配置真实 runtimeSessionId，不能用 conversationId 冒充；未做自动订阅、自动分支绑定。不要将无关会话配置为同一 storyId。
4. deriveMessages 是活跃 surface，不是完整持久正文账本；压缩会导致保守失效/遗忘。没有基于 sessionProjections 的全历史重建。
5. knownBy / evidence 只做结构与原文匹配，无法证明语义、认知获得途径或旁白真伪；模型仍可能错判。读到资料不等于已知。
6. 日记/总结仅有类型隔离，无自动生成；无目标推演、自定义字段表单、图形管理页。
7. 无跨进程文件锁、目录 fsync、损坏库自动恢复或加密；管理 CLI 必须在停用插件后使用。并发多 Host 不受支持。
8. 当前工具注册全局，未绑定会话调用会响亮失败；尚未做 agent-scoped 工具曝光。
9. 旧工具结果/上下文可能留在会话日志；本核心只保证新查询不返回失效记录，不保证宿主历史清除旧知识。删除插件数据库不删除聊天日志中的历史副本。

## 环境核实
- 当前开发运行于 Android DSH 0.3.5，内核 0.2.1-rc.5；不是 ElecKoi 的创造模式。
- 本机 ElecKoi 0.2.15 APK 实际打包内核 0.2.1-rc.3；在线 main 的 rc.5 示例不是此 APK 的确定契约。
- 已读取 APK 内 system-prompt、agent、tools 类型和实现；agent 扩展 AssembleContext.agent，required context 是宿主可持久记录的 user-role 快照。
- 未借用 @internal ConversationLifecycle、运行时猴子补丁、DOM、旧 window.eleckoi 接口。

## 测试
`node --test *.test.mjs`

13 项自动测试通过：10 项核心场景、文件事务/损坏失败、正文过滤、Host 注册调用闭环。
**这些是合成正文测试与 rc.5 defineTool 实现 + 假宿主服务冒烟，不是 ElecKoi 真机聊天测试，也不是语义抽取质量测试。**
核心零依赖；Host 测试需要目标宿主 peer 包。开发目录中的 node_modules 为当前 DSH 依赖软链接，不包含在交付归档。

## 安装/启用（仅供继续开发）
1. 解压至 ElecKoi 能访问的独立目录。不要填 DSH 应用私有路径，ElecKoi 无法访问。
2. 通过 ElecKoi 消息页左上侧栏 → 插件 → 添加插件右侧下拉 → 安装第三方插件，输入本地目录。该入口已真机确认；本包安装/重启/渲染未验证。
3. 默认 patch disabled:true；在隔离测试环境通过支持的插件配置流程设置 dataRoot（宿主私有绝对路径）、bindings 后再启用。示例：
   bindings: [{ sessionId: '真实运行时 Session ID', character: '角色 ID', storyId: '独立故事 ID' }]
4. 不要直接修改正在运行的 profile/cordis.patch.yml 或 package.json。不要对真实长聊天做首次测试。
5. 使用已核实的 Conversations API list 获取 runtimeSessionId 后仍需完成正式绑定适配；本包尚未自动执行。
6. 真机验收应新增独立测试聊天，检查模型实际请求/日志中有本轮连续性、发生提交、下一轮召回，然后测试编辑/删除/重生成/分叉/重启。以上全部通过才可去掉 experimental 标识。

## 管理/卸载
先停用插件，然后在可访问宿主数据目录的 Node 环境执行：
```
node manage.mjs inspect /absolute/dataRoot storyId
node manage.mjs export /absolute/dataRoot storyId /new/export.json
node manage.mjs suppress /absolute/dataRoot storyId record-id --confirm
node manage.mjs clear /absolute/dataRoot storyId --confirm
```
export 使用 wx，拒绝覆盖已有文件。clear 只清空该 scope 的哈希 JSON 文件；调用前用户必须确认对应故事。纠错流程：停用→导出→抑制错误记录→复核后提交新 ID，不原地伪改证据。

在插件中心停用/卸载即可移除注册（未实测）；数据默认保留。永久删除前先确认 dataRoot 中具体文件，不能删除整个存储根。聊天日志中的旧注入/工具输出需另行按宿主数据管理规则处理。

## 参考及许可边界
机制参考用户给定的 AstrBot private_companion 7.0.11：来源依赖、修订、操作幂等、分层记忆。未移植其 Python 或宣称逐项复刻；未统计/复制“900+”配置。参考归档不随本包分发。

- https://github.com/menglimi/astrbot_plugin_private_companion
- https://github.com/deepseek-ai/deepseek-harness
- https://eleckoi.github.io/ElecKoi/docs/plugins/author-sdk.html
- https://raw.githubusercontent.com/eleckoi/ElecKoi/main/docs/plugins/quick-start.md

验证权威优先级：本机 APK 实现 > 同版类型 > 移动中的在线 main。
