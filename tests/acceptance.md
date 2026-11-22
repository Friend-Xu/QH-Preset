# 验收记录

## M4：技能是否在写代码前触发（必须由负责人在新会话执行）

前提：`quanheng` preset 已安装（M1/M2 通过），且会话是**新建**的（已有会话保留启动时的组合）。

**步骤**

1. 新会话，确认设置里选中的是「权衡」。
2. 只发这一句：

   > 帮我做个记账小工具

3. 观察并记录：
   - 是否在**写任何代码之前**调用了 `brainstorming`？
   - 是否先复述意图、问一个开放问题，而不是直接产出代码？
   - 有没有出现"要不要开个浏览器看图"之类的视觉伴生提议？（不应该出现）
   - 有没有用到不存在的工具（例如直接 `bash`）？

**记录**

| 日期 | 结论 | 证据（转录摘要或路径） | 备注 |
|---|---|---|---|
| 2026-11-22 19:43 | **通过（有一处偏离）** | 会话 `session-3ac11643`，`cwd = 测试项目\新preset预设测试`，`agentPreset: quanheng`。事件 seq 25/28/31 连续调用 `skill: using-superpowers → brainstorming → personalized-pages`；用户说"自己随手记每天开销"后先给方案，用户澄清"想要单独的小工具"；首次 `write` 在 seq 68 | 偏离：seq 68/71 写了两个一次性探测文件 `_recon-ls.html`、`_recon-ls2.html`（测 file:// 下 localStorage 是否跨文件共享），seq 104 删除。属于"未获批准就先动手"，但只读探测不涉及产品代码 |

判定：**通过**——技能在写任何产品代码之前触发，brainstorming 的"先问意图、再给方案"生效；用户选 `a` 后才进入 `writing-plans`。

偏离处理（v0.2）：`brainstorming` 的 HARD-GATE 只允许"用户已同意的 spike"。一次性探测应当先说明再做，或改成纯读探测（用 `pwsh` 起临时静态服务器测，不在项目里落文件）。两种改法二选一，写进 v0.2 的改动清单。

另一份旁证：会话 `session-b7c5802c`（`cwd = D:\WorkSpace\思考类工作目录`，同一 preset）是纯研究任务——加载 `using-superpowers → official-plugins → brainstorming → dsh-doc`，用 `ask_user_question` 问了一个澄清问题，全程零写操作。说明该 preset 在"非构建任务"上也不会误触发构建门。

## M1 / M2 / M5 记录

| 判据 | 命令 | 结果 |
|---|---|---|
| M1 已激活 | `plugin_manager list_plugins`（offset 190） | **通过** 2026-11-22：`include:preset-quanheng` `enabled: true`、`fiberPhase: active`、`patchId: preset-quanheng` |
| M2 出现在配置里 | `dsh --profile web --dump-config` | **通过** 2026-11-22：输出含 `# == @quanheng/preset` 与 `id: quanheng`，五字段完整 |
| M2b 技能根解析 | 用 profile 的 `createRequire` 解析 `@quanheng/preset/package.json` | **通过** 2026-11-22：解析到 `D:\WorkSpace\PRD-OS\QH-Preset\package.json`，`skills/` 存在，8 个目录 |
| M5 回滚 | 卸载后 `quanheng` 从预设列表消失，四个出厂预设仍在 | 待跑 |
