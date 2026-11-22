# QH-Preset

`quanheng` 是 DSH（DeepSeek Harness）的一个 Agent preset：把 Superpowers 的方法论技能和 ECC 的纪律提炼装进一个完整声明的组合，让 agent 在创造性工作前先对齐意图、先查已有方案，下结论时说明证据等级，完成前先验证——并且把项目自己的判断规则常驻在请求里，不必先想起来加载技能。

## 它是什么

- 一个 **bundle**：`package.json` + `cordis.patch.yml`，用 `plugin_manager install_bundle` 装进 profile。
- 一个 **preset**：id `quanheng`，安装后出现在 设置 → Agent 预设，新会话可选。
- **15 个技能**：
  - 来自 Superpowers 7.0.2（MIT）：`using-superpowers`、`brainstorming`、`writing-plans`、`executing-plans`、`subagent-driven-development`、`test-driven-development`、`systematic-debugging`、`writing-skills`、`using-git-worktrees`、`finishing-a-development-branch`、`requesting-code-review`、`receiving-code-review`、`verification-before-completion`。
  - 提炼自 ECC 2.2.3（MIT）：`qh-judgment`（证据四档标签、审查分级、委派完成契约）、`eval-harness`（eval 驱动开发、pass@k / pass^k）。
- 四条 persona 不变量：先加载技能、结论带证据标签（实测 / 源码 / 推论 / 无法判定）、委派即负责收集、无兜底。
- 一个 **hook 插件**（`@quanheng/preset/hooks`）：读项目的 `.qh/instincts/*.md`，按本会话真实发生的工具结果筛出该生效的规则，放进每次请求的 runtime context。机制与取舍见 [docs/HOOKS.md](docs/HOOKS.md)。

## 装与卸

```powershell
# 装（在本会话里由 agent 调用 plugin_manager；手工安装走 插件 → 添加插件 → 选本目录）
# target = D:\WorkSpace\PRD-OS\QH-Preset
# 卸
# plugin_manager action=remove_bundle target=@quanheng/preset
```

安装会改写 profile（`D:\Agents\.dsh\profiles\web`）的依赖与 bundle 清单；卸载即回滚。装完**新会话**才生效。改了 `hooks/` 的源码需要重启 DSH：preset 里的插件不受 HMR 管理，重组合会返回 `application: restart-required`；只改 `.qh/instincts/*.md` 不用重启。

## 三条必须知道的约束

1. **仓库是唯一真相。** 在 设置 → Agent 预设 里编辑 `quanheng` 会写进 profile 的 `cordis.patch.yml`，按行 id 覆盖本 bundle 的 `config.plugins`。两边一旦分叉，以仓库为准：删掉那条覆盖，或重装本 bundle。
2. **不要移动本目录。** 安装以 link 方式挂到 profile；改名或移动会让依赖失效，必须重装。
3. **helper 用 `node` 调用。** 技能里的 `scripts/*.mjs` 是 Node 模块，形如 `node <技能目录绝对路径>/task-brief.mjs PLAN_FILE 2`。它们不用管道捕获子进程输出（受限沙箱下会 EPERM），失败以退出码 2/3/4 报告（`find-polluter` 用 1/2/3）。跑不起来就如实报告，不许假装执行。

## 目录

```
package.json               @quanheng/preset（不设 files 白名单：skills 与 hooks 必须随包）
cordis.patch.yml           preset-quanheng 的完整声明（含四条不变量与 hooks 行）
skills/                    15 个技能；using-superpowers/references/dsh-tools.md 是本部署的工具映射
skills/qh-judgment/        证据标签、审查分级、委派契约、instincts 提升契约（提炼自 ECC）
skills/eval-harness/       eval 驱动开发与 pass@k（提炼自 ECC）
hooks/                     instinct 插件：tools/result 捕获 + systemPrompt.context 注入
vendor/superpowers/        7.0.2 原样快照（diff 用，含 bash 版 helper）
vendor/ecc/                ECC 2.2.3 的 rules/common 与 eval-harness（提炼来源）
docs/HOOKS.md              hook 的机制、为什么不用 agent/pre-step、为什么不做重复调用检测
docs/UPSTREAM.md           上游版本、逐条改动、刻意不搬的规则
docs/evals/                eval 定义（能力 / 回归）与负样本
scripts/check-preset.mjs   结构契约自检（20 项）
scripts/assert-session.mjs 会话日志断言：技能顺序、写入门禁、工具错误、runtime context
tests/helpers.test.mjs     helper 行为测试（node:test）
tests/instincts.test.mjs   instinct 决策逻辑测试
tests/find-polluter.test.mjs  find-polluter 移植测试（含真实 npm test 的一次端到端）
tests/session-assert.test.mjs runtime context 断言的读法
tests/acceptance.md        M1–M9 验收记录
```

## 分批开关

| 能力 | 状态 |
|---|---|
| preset + 8 技能 | 已开（v0.1） |
| TDD、`qh-judgment`、`eval-harness`、门禁探测规则 | 已开（v0.2） |
| helper 移植为 Node、会话断言、16 项自检 | 已开（v0.2） |
| instinct hook（`.qh/instincts/` 常驻判断）、另外 4 个技能、20 项自检 | 已开（v0.3） |
| 视觉伴生服务器 | **关闭**（不提供浏览器通道；要图就写 HTML 文件给路径） |
| 从捕获里自动写规则 | **不做**：重复调用已有 `repeat-tool-reminder`，规则只从被提升的 instinct 来 |

## 自检

```powershell
node scripts/check-preset.mjs      # 20 项结构契约
node --test                        # 44 例行为测试
node scripts/assert-session.mjs <session.v4.jsonl.zstd> --preset quanheng `
  --skill-order using-superpowers,brainstorming --no-write-before writing-plans --no-tool-errors
node scripts/assert-session.mjs <session.v4.jsonl.zstd> `
  --context "quanheng:instincts=read-the-error" --context-after <失败那次的 seq>
```

`check-preset.mjs` 检查：preset 声明的行/分组/isolate/五字段、技能集与 frontmatter、技能内相对链接可解析、helper 提及可解析且无 `bash scripts/`、无上游命名空间与家目录路径、helper/插件不管道捕获、每个 import 可解析、persona 四条不变量、`dsh-tools.md` 的动作映射、提炼技能标注 `origin: ECC`、包元数据与技能根表达式、hooks 的注册面与 `exports` 子路径（含 `./package.json`）、instinct 触发词在代码与契约文档里一致、单文件 ≤32KB。

`assert-session.mjs` 的 `--context NAME[=子串]` 断言某条 runtime context 真的到达过模型；`--context-after SEQ` 进一步要求它的首次出现不早于该 seq——这是把"规则只在证据出现后才生效"变成可重跑命令的那一半。
