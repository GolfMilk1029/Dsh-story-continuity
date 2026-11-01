# 真机追加探测 01

- ElecKoi 插件中心已实际尝试安装本地目录：
  /sdcard/Download/dsh-story-continuity-install-test-01/dsh-story-continuity
- UI 结果：`该路径不存在或不是有效的插件包`。没有安装成功，不曾启用。
- 同一路径 DSH shell 可读取 package.json；这不能证明 ElecKoi 可以读取它。无法仅凭该错误区分跨应用访问与插件格式校验。
- 没有绕过权限、修改 ElecKoi 私有目录或现有角色聊天。

## 原 APK 投影函数探测

从 APK 文件中读取 projectProductHistory 原函数，用 Node vm 执行该函数；外围 findCurrentUserIndex / isDialogueMessage 为同源逻辑，productHistoryMessage 和 compactedProjection 为简化桩。因此这是局部算法探测，不是完整请求或真实模型测试。

输入顺序：system / old user / reply / current user / new runtime-context
结果：system / product-history / current user / new runtime-context

输入顺序：system / old user / reply / old runtime-context / current user
结果：system / product-history / current user

结论：如果每个新回合在 current user 之后产生新的 runtime-context，局部历史替换路径会保留它；旧快照会被过滤。插件已把最后正文 token 写入上下文，使新用户正文变化可触发快照变化。仍需实际安装、确认持久正文来源与最终投影请求、语义提取和旧工具结果处理，才能验收闭环。
