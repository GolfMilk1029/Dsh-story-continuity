# dsh-story-continuity

0.1.0-experimental.2 — 仅限隔离测试，不是已完成真机验收版。

## 做什么
显式绑定一条 ElecKoi 聊天，通过公开 Conversations API 把产品聊天编号映射到运行会话编号。回合结束后创建有日志的辅助代理提取带证据账本；下一请求通过 systemPrompt.context 注入按角色过滤的账本。不修改角色卡，不按现实时间推进，不主动发消息。

## 安装与配置
官方插件入口安装本仓库 Git 地址。更新已有包后按宿主提示重启，不能以“已安装”代替“已加载”。包开关与组件开关不同。
默认组件停用；首次启用组件仅提供配置，enabled 和 automaticExtraction 均为 false，不创建账本、不调用模型。
在插件实时配置表单中填写：
- conversationId：聊天 ID，或 title:唯一聊天标题。先把独立测试聊天改为唯一标题；精确匹配，重名拒绝。
- dataRoot：ElecKoi 可写的绝对私有目录。Android 0.2.15 的候选路径为 /data/user/0/com.eleckoi.app/no_backup/unified-runtime/home/story-continuity（需在该宿主验证，不能填 DSH 私有路径）。卸载应用可能清除此目录。
- enabled：配置完成后开启。automaticExtraction：同意辅助模型费用后开启。提取沿用当前 RP agent 的 provider/model；单独模型选择未实现。
- maxChars/maxRecords：回忆注入预算。extractionMaxInputChars：提取输入预算，超限拒绝，不静默截断。extractionMaxTokens：辅助输出预算。
若表单不出现，不要编辑运行中 profile，也不要猜路径：保持 enabled=false 并报告宿主情况。

## 移除与数据
关闭 enabled 和组件即可停止处理；先等待在途回合结束。官方入口卸载插件不会主动删除账本。数据文件名为 SHA-256(storyId).json，目录由 dataRoot 指定。删除或导出前先关闭组件；离线 node manage.mjs 的帮助和参数以源码为准。当前无图形数据管理。

## 已验证与限制
本上传布局常规测试29通过、1项持久日志测试因 Android flock 原生库目录缺失跳过。另一个明确标记的 rc.5 真实 AgentLoop 内存会话测试通过：自动提取→FileStore保存→下一次假模型请求包含账本。假模型测试不产生模型费用。
尚未验证 rc.3 真执行、ElecKoi 最终请求投影、辅助日志持久保存、应用重启、真实编辑/重生成。不要称为完整可用闭环。
全文提取遇预算会拒绝；尚无增量压缩。去重完成标记只在进程内，重启可能重提取。账本使用完整前缀依赖，编辑使下游批次失效；没有完整持久分支投影。证据匹配不代表语义正确，角色知识标注依赖模型。

## Tests
node --test *.test.mjs
STORY_TEST_MEMORY_ONLY=1 node --test real-loop.test.mjs
安装开发依赖后运行。持久日志测试在 Android 需要宿主正确提供 DSH_NATIVE_DIR。

## Upload
上传本目录的 .mjs、package.json、cordis.patch.yml、icon.svg、README.md、DEVICE-PROBE-02.md，以及 locale 目录。index.mjs.pending 只是本地提示文件，不要上传。无角色卡、聊天、凭据或参考仓库源码。

## English
Experimental, explicitly scoped roleplay continuity using public ElecKoi conversation identity, logged auxiliary agents, evidence-linked atomic storage and logged runtime context. Dormant by default. rc.5 real-loop in-memory integration passes; durable auxiliary session logs and live ElecKoi/rc.3 behavior remain unverified. Use only an isolated test chat. Installation is not proof of activation or successful injection.
