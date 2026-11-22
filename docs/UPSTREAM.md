# Upstream

本 bundle 是两份 MIT 项目的衍生作品。上游原样快照在 `vendor/`，本文件记录差量。

| 上游 | 版本 | 取证方式 | 本地快照 |
|---|---|---|---|
| Superpowers（obra/superpowers） | 7.0.2 | 源目录 `测试项目/superpowers-main`（package.json / .version-bump.json） | `vendor/superpowers/` |
| ECC（affaan-m/ECC） | 2.2.3 | 源目录 `测试项目/ECC-main`（VERSION / package.json） | `vendor/ecc/`（仅 rules/common 与 eval-harness） |

## 我们的改动

| # | 版本 | 改动 | 范围 | 理由 |
|---|---|---|---|---|
| 1 | v0.1 | 去掉技能引用的命名空间：`superpowers:<skill>` → `<skill>` | 已装的 11 个技能中的交叉引用 | DSH 的技能名不带命名空间；不装 JS 钩子也能互相指到 |
| 2 | v0.1 | 关闭视觉伴生：删除 `brainstorming/visual-companion.md` 与 `scripts/`；把 `## Visual Companion` 节改为"本部署不提供" | `skills/brainstorming/` | 需要 25KB Node 服务器 + 216 行 bash 启动器；当前工作以文字决策为主，收益不足以维护一套进程管理 |
| 3 | v0.2 | 6 个 helper 由 bash 移植为 Node（`.mjs`），调用方式改为 `node <绝对路径>/<name>.mjs <参数>` | `executing-plans/scripts/`、`subagent-driven-development/scripts/` | 本机 `bash` 不在 PATH（只有 Git for Windows 的绝对路径），且管道捕获在受限沙箱下必然 EPERM。语义、参数、退出码、输出格式逐项对齐上游 |
| 4 | v0.1 | 新增 `using-superpowers/references/dsh-tools.md`，并在 "Platform Adaptation" 列表加 DSH 一行 | `skills/using-superpowers/` | 上游按 harness 提供动作→工具映射，本文件就是 DSH 的适配层；v0.2 补上子 agent 不加载技能、helper 用 node 调用两节 |
| 5 | v0.2 | `brainstorming` 的 `<HARD-GATE>` 明确"探索不写项目文件"；落文件的探测须先声明、写在 `.superpowers/scratch/`、用完删除；`Red Flags` 加一行 | `skills/brainstorming/SKILL.md` | 有实测证据的偏离：v0.1 的会话在设计批准前写了两个探测页（见 `docs/evals/preset-gate-announcement.md`）。这是对上游调优内容的唯一一处改动，依据是日志而不是偏好 |
| 6 | v0.2 | 新技能 `qh-judgment`：从 ECC `rules/common/{agents,code-review}.md` 提炼，重写为 DSH 的落地方式 | `skills/qh-judgment/` | ECC 的 delegation completion contract 与 review 分级是可判定的规则；原文绑死 `ecc:*` agent 与 Claude Code 工具，不能直接搬 |
| 7 | v0.2 | 新技能 `eval-harness`：保留 ECC 的 EDD 框架与 pass@k/pass^k，删掉它的 capsule/gate/候选隔离工具链，判分器改映射到 DSH 工具 | `skills/eval-harness/` | 那 40% 是 ECC 自己的实现与其运维约束，本仓库没有也不打算有；留下会变成不可执行的指令 |
| 8 | v0.2 | 补装 `test-driven-development`（含 `writing-good-tests.md`），正文只改一处命名空间 | `skills/test-driven-development/` | v0.1 的实测会话里，执行阶段要求 TDD 时该技能不存在（seq 159 报错）。目录里没有替代 |
| 9 | v0.3 | 补装 `systematic-debugging`：2 处命名空间；`find-polluter.sh` 移植为 `scripts/find-polluter.mjs`；`root-cause-tracing.md` 的调用改为 `node <绝对路径>/find-polluter.mjs` | `skills/systematic-debugging/` | 本机 `bash` 不在 PATH；移植时把上游的"找不到测试文件也算通过"改成退出码 3 —— 没有测过就不能说 clean |
| 10 | v0.3 | 补装 `writing-skills`：`~/.claude/skills/` 改为本仓库 `skills/`；清掉 6 处 `superpowers:` 前缀；`bash scripts/tool.sh` 改为 node 形式；`render-graphs.js` → `scripts/render-graphs.mjs`（改走 `.dot` 文件，不再用 stdin/stdout 管道）；**删掉** `references/anthropic-best-practices.md`（46 KB）与 `references/CLAUDE_MD_TESTING.md` | `skills/writing-skills/` | 前者的体积超过本项目 32 KB/文件上限，且上游 `AGENTS.md` 自述其技能哲学与 Anthropic 指南不同；后者通篇 `~/.claude/`，测的是本部署没有的 `CLAUDE.md` 变体 |
| 11 | v0.3 | 补装 `using-git-worktrees`、`finishing-a-development-branch`：删掉"原生工具 → git 回退"的阶梯与沙箱失败兜底；命令改 `pwsh`，目录一律用 `workdir` 参数而不是 `cd` | 两个技能正文 | 本 preset 没挂 worktree 工具（`@deepseek-ai/dsh-experimental-tool-worktree` 未被任何出厂 preset 引用），阶梯的第一级永远不存在；DSH 的 shell 调用不保留 `cd` |
| 12 | v0.3 | 新增 `hooks/` 插件（`@quanheng/preset/hooks`） | 包内新目录 + patch 一行 | 让 `.qh/instincts/` 的项目判断在每次请求里生效，不必先加载技能。机制与取舍见 `docs/HOOKS.md` |
| 13 | v0.3 | `resolveExecutable` 在 Windows 上先试可执行扩展名（`.exe/.cmd/.bat`），再试无扩展名 | `skills/subagent-driven-development/scripts/lib/exec.mjs` | 移植 `find-polluter` 时实测到的缺陷：`npm` 解析到 nodejs 目录下那个无扩展名的 sh shim，`CreateProcess` 跑不了它，而 ENOENT 被吞掉，于是"什么都没发生" |

**没有改的**：技能正文的方法论、HARD-GATE（除 #5 那一处）、Red Flags 表、prompt 模板。它们是对照价值所在。

## 刻意不搬的 ECC 规则

ECC `rules/common/` 里还有 `testing.md`、`patterns.md`、`performance.md`、`security.md`、`coding-style.md`、`git-workflow.md`、`hooks.md`。逐条取舍：

| ECC 规则 | 处理 | 原因 |
|---|---|---|
| delegation completion contract | 搬（`qh-judgment/references/delegation.md` + persona） | 可判定，且本 Harness 的失败模式相同（父级以"等待中"结束会丢子级结果） |
| review 分级与放行条件 | 搬（`references/review.md`） | 可判定；与 `requesting-code-review` 互补 |
| 80% 覆盖率、50 行函数、800 行文件、嵌套 ≤4 层 | **不搬** | 上游未给出这些阈值的来源；本仓库的工程原则在 `$DSH_HOME/AGENTS.md`，不引入第二套数字教条 |
| `ecc:*` agent 名单、`Agent(subagent_type:)` 调用 | **不搬** | 本版本 subagent 不接受 per-child persona，角色只能进 prompt |
| GitHub 代码检索 → Context7 → Exa 的强制调研顺序 | **不搬** | 依赖本机没有的工具；"先查已有方案"已在 persona 里 |
| `/eval` slash command、`.claude/evals/` 布局 | **换成** `docs/evals/` + `.qh/evals/` | 本部署没有 slash command 插件；`.claude/` 是别的 harness 的目录 |

## 技能取舍

已装 15 个：`using-superpowers`、`brainstorming`、`writing-plans`、`executing-plans`、`subagent-driven-development`、`test-driven-development`、`systematic-debugging`、`writing-skills`、`using-git-worktrees`、`finishing-a-development-branch`、`requesting-code-review`、`receiving-code-review`、`verification-before-completion`（以上来自 Superpowers 7.0.2）、`qh-judgment`、`eval-harness`（以上提炼自 ECC 2.2.3）。

`vendor/superpowers/skills/` 共 15 个，v0.3 之后**只剩 2 个未装**：

| 技能 | 为什么还没装 |
|---|---|
| `dispatching-parallel-agents` | `subagent-driven-development` 已覆盖派遣与收集；并行纪律放在 `qh-judgment/references/delegation.md` |
| `diagnosing-superpowers` | 会往 `~/.superpowers/` 写文件，与本项目"文件留在项目内"冲突，且它诊断的是本 Harness 没有的那个插件；重新启用前要先改路径和诊断对象 |

## helper 移植的细节

- 退出码与上游一致：`2` 用法/位置错误，`3` 找不到任务或范围为空/非后代，`4` 未闭合代码围栏掩盖了任务标题，其余情况透传被调用命令的退出码。
- 子进程输出只用**文件句柄**捕获，绝不用管道（受限沙箱下 `stdio: 'pipe'` 会 EPERM）。捕获文件写成 `<项目内目录>/.qh-capture-<pid>-<n>.log`，在 `finally` 里删除；`scripts/check-preset.mjs` 静态禁止管道捕获。
- 捕获落点用调用方已有的目录（计划的所在目录或 plan workspace），不写系统临时目录、不写包目录。
- 子进程环境继承用户环境（git 需要用户配置，task-done 跑的是用户自己的测试命令），只读不注入。
- 与上游的一处行为差异：`task-brief` 在"任务不存在"时不留下空的 brief 文件（上游会留）。
- 共用管道放在 `skills/subagent-driven-development/scripts/lib/exec.mjs`；其他技能的脚本按相对路径 import 它（`task-done` 早已这样做，v0.3 的 `find-polluter`、`render-graphs` 沿用），不复制第二份 `.cmd` 处理逻辑。
- `find-polluter.mjs` 的退出码：`1` 找到污染源，`2` 用法错误，`3` 搜索无法进行（没有匹配的测试文件、`npm` 不在 PATH、或污染在开跑前就存在）。上游在"一个测试文件都没匹配到"时仍打印 "all tests clean"，本版把它当作失败的搜索。`**/` 用一条正则表达"零层或多层目录"，等价于上游的第二条折叠 pattern。
- `render-graphs.mjs` 不再把 dot 源码从 stdin 喂进去、从 stdout 取 SVG（那是管道），改为写 `<name>.dot` 再让 `dot -Tsvg <file> -o <svg>`；顺带把源码留在 SVG 旁边。

## 升级流程

1. 拉上游新版本到 `vendor/`（替换快照）。
2. `diff -r vendor/superpowers/skills skills` 看本文件表格是否有新增差量；ECC 侧 `diff -r vendor/ecc/rules-common skills/qh-judgment/references`。
3. 重跑 `node scripts/check-preset.mjs`、`node --test`，再跑 `docs/evals/` 里的会话断言。
4. 在上表补一行日期与版本。
